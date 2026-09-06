"""
pushup.py
=========

PUSH-UP POSE-ESTIMATION & REP-TRACKING PIPELINE (SIDE-ANGLE CAPTURE)
---------------------------------------------------------------------
This file implements an automatic push-up repetition counter, biomechanical
form evaluator, and dataset logger using MediaPipe Pose Landmarker.

Camera is expected to be positioned at a SIDE ANGLE to the user, so only one
side of the body (LEFT or RIGHT) is reliably visible at any given time. The
pipeline auto-detects which side is facing the camera and tracks only that
side's landmarks, rather than averaging both sides as a front-facing setup
would.

Architectural Pipeline:
    Camera Frame (side-angle)
        ↓
    MediaPipe Pose Landmarker (Tasks API, Video Mode)
        ↓
    Pose Landmarks (33 points)
        ↓
    Visible-Side Selection (LEFT vs RIGHT, by joint visibility)
        ↓
    Push-up Required Landmarks (Shoulder, Elbow, Wrist, Hip, Knee, Nose - one side)
        ↓
    Geometric Feature Extraction (Elbow angle, Depth diff, Hip angle, Torso angle, Neck)
        ↓
    Plank-Gated, Direction-Aware State Classifier (UP, DOWN, BOTTOM)
        ↓
    Temporal Debouncing (Filters single-frame noise)
        ↓
    Rep Counter State Machine (UP -> DOWN -> BOTTOM -> DOWN -> UP)
        ↓
    Biomechanical Form Evaluation (Hip Sag/Pike, Neck)
        ↓
    HUD Visualization Overlay + Parallel CSV Dataset Logging
"""

import os
import time
from collections import deque

import cv2
import mediapipe as mp
import numpy as np
import pandas as pd
from mediapipe.tasks import python
from mediapipe.tasks.python import vision


# =============================================================================
# 1. Configuration & Constants
# =============================================================================

# Video input source: 0 for default webcam, or path to a video file e.g. "pushup.mp4"
# NOTE: camera should be placed at a SIDE angle to the user (perpendicular to
# the direction they're facing) so one full side of the body is visible.
VIDEO_SOURCE = 0

# MediaPipe model & inference configuration
MODEL_PATH = "pose_landmarker_lite.task"
POSE_DETECTION_CONFIDENCE = 0.7     # Minimum confidence to detect a person initially
POSE_PRESENCE_CONFIDENCE = 0.7      # Minimum confidence that pose landmarks are present
POSE_TRACKING_CONFIDENCE = 0.7      # Minimum confidence to track person across frames

# Visibility & reliability gating
# Gating threshold to trust landmarks for angle math and state machine transitions
VISIBILITY_THRESHOLD = 0.7
# Lower threshold used only for visual skeleton rendering (shows borderline points in orange)
DRAW_VISIBILITY_THRESHOLD = 0.3

# Push-up kinematic thresholds
# Arm extension threshold: elbow angle >= 160° indicates straight arms / plank (UP)
ELBOW_UP_THRESHOLD = 160.0
# Elbow flexion threshold: elbow angle <= 95° indicates deep bottom position (BOTTOM)
ELBOW_BOTTOM_THRESHOLD = 95.0
# Depth margin: normalized vertical distance shoulder must be above elbow in UP position
UP_DEPTH_MARGIN = 0.03

# Plank-validity gating (side-view specific)
# These prevent "fake" reps caused by moving only the arm while standing/kneeling
# upright instead of actually performing a push-up in plank position.
TORSO_HORIZONTAL_MIN = 55.0    # torso (shoulder->hip vector) must lean at least this far from vertical
TORSO_HORIZONTAL_MAX = 125.0   # ...and not more than this, i.e. body must be roughly horizontal
PLANK_HIP_MIN = 140.0          # back must be roughly straight for a state transition to count at all
PLANK_HIP_MAX = 200.0

# Temporal filtering constants
SMOOTHING_WINDOW = 5                # Size of moving-average sliding window (in frames)
DEBOUNCE_FRAMES = 4                 # Consecutive frames a state must hold to confirm transition

# Biomechanical form evaluation thresholds
HIP_SAG_THRESHOLD = 150.0           # Hip angle below this indicates sagging hips (core failure)
HIP_PIKE_THRESHOLD = 185.0          # Hip angle above this indicates piking hips (butt in air)
NECK_DEVIATION_THRESHOLD = 35.0     # Deviation from neutral neck indicating head craning

# CSV dataset logging
CSV_PATH = "pushup_dataset.csv"
FLUSH_EVERY = 30                    # Number of buffered frames before writing to disk

CSV_COLUMNS = [
    "timestamp",
    "side",
    "elbow_angle",
    "smoothed_elbow_angle",
    "shoulder_y",
    "elbow_y",
    "shoulder_elbow_diff",
    "hip_angle",
    "smoothed_hip_angle",
    "torso_angle",
    "neck_angle",
    "visibility",
    "state",
    "rep_count",
    "form_status",
    "feedback",
]


# =============================================================================
# 2. Landmark Indices & Groupings
# =============================================================================

# MediaPipe Pose landmark indices (fixed 33 landmarks)
NOSE = 0
LEFT_SHOULDER, RIGHT_SHOULDER = 11, 12
LEFT_ELBOW, RIGHT_ELBOW = 13, 14
LEFT_WRIST, RIGHT_WRIST = 15, 16
LEFT_HIP, RIGHT_HIP = 23, 24
LEFT_KNEE, RIGHT_KNEE = 25, 26
LEFT_ANKLE, RIGHT_ANKLE = 27, 28

# Side-specific landmark sets. In a side-angle capture, only ONE of these sets
# will have reliable visibility at a time (the near side facing the camera).
# select_visible_side() below picks between them every frame.
LEFT_SIDE_SET = {
    "shoulder": LEFT_SHOULDER,
    "elbow": LEFT_ELBOW,
    "wrist": LEFT_WRIST,
    "hip": LEFT_HIP,
    "knee": LEFT_KNEE,
}
RIGHT_SIDE_SET = {
    "shoulder": RIGHT_SHOULDER,
    "elbow": RIGHT_ELBOW,
    "wrist": RIGHT_WRIST,
    "hip": RIGHT_HIP,
    "knee": RIGHT_KNEE,
}

# Skeleton connections for rendering bones
POSE_CONNECTIONS = [
    (conn.start, conn.end) for conn in vision.PoseLandmarksConnections.POSE_LANDMARKS
]


# =============================================================================
# 3. MediaPipe Pose Landmarker Setup
# =============================================================================

def create_landmarker(model_path=MODEL_PATH):
    """
    Initializes and configures the MediaPipe Pose Landmarker in VIDEO mode.

    Parameters:
        model_path (str): Path to the .task model file on disk.

    Returns:
        vision.PoseLandmarker: Instantiated landmarker ready for detect_for_video().
    """
    base_options = python.BaseOptions(model_asset_path=model_path)
    options = vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=POSE_DETECTION_CONFIDENCE,
        min_pose_presence_confidence=POSE_PRESENCE_CONFIDENCE,
        min_tracking_confidence=POSE_TRACKING_CONFIDENCE,
    )
    return vision.PoseLandmarker.create_from_options(options)


# =============================================================================
# 4. Basic Landmark & Coordinate Helpers
# =============================================================================

def get_landmark(pose, landmark_id):
    """Fetches a single landmark object from the 33-point pose landmark list."""
    return pose[landmark_id]


def get_coordinates(landmark, width, height):
    """
    Converts a landmark's normalized coordinates [0.0, 1.0] into frame pixel coordinates.

    Formula:
        pixel_x = int(normalized_x * frame_width)
        pixel_y = int(normalized_y * frame_height)
    """
    return int(landmark.x * width), int(landmark.y * height)


def _xy(lm):
    """Extracts (x, y) coordinates of a landmark into a 2D NumPy array for vector math."""
    return np.array([lm.x, lm.y], dtype=np.float32)


def calculate_angle(a, b, c):
    """
    Computes the 2D interior joint angle at vertex `b` formed by bones `b -> a` and `b -> c`.

    Steps:
        1. Form vector ba = a - b and vector bc = c - b
        2. Calculate difference between their arctan2 angles
        3. Convert from radians to degrees [0°, 180°]

    Returns:
        float: Angle in degrees between [0.0, 180.0].
    """
    a_vec, b_vec, c_vec = _xy(a), _xy(b), _xy(c)
    ba = a_vec - b_vec
    bc = c_vec - b_vec

    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)
    if norm_ba < 1e-7 or norm_bc < 1e-7:
        return 0.0

    radians = np.arctan2(bc[1], bc[0]) - np.arctan2(ba[1], ba[0])
    angle = np.abs(radians * 180.0 / np.pi)
    if angle > 180.0:
        angle = 360.0 - angle
    return float(angle)


def vertical_angle_of_vector(vec):
    """
    Measures the angle of a 2D vector relative to the vertical axis [0.0, -1.0].
    (In image coordinates, y increases downward, so [0.0, -1.0] points straight up).
    Used to measure torso lean (plank orientation) and neck alignment.
    """
    vertical_vec = np.array([0.0, -1.0], dtype=np.float32)
    denom = np.linalg.norm(vec) * np.linalg.norm(vertical_vec)
    if denom < 1e-8:
        return 0.0
    cos_angle = np.dot(vec, vertical_vec) / denom
    cos_angle = np.clip(cos_angle, -1.0, 1.0)
    return float(np.degrees(np.arccos(cos_angle)))


# =============================================================================
# 5. Temporal Smoothing & Skeleton Drawing Helpers
# =============================================================================

class MovingAverage:
    """
    Sliding-window moving average filter to suppress frame-to-frame landmark jitter.
    Maintains a deque of fixed maximum length and returns the arithmetic mean.
    """

    def __init__(self, window_size):
        self.values = deque(maxlen=window_size)

    def update(self, value):
        self.values.append(value)
        return sum(self.values) / len(self.values)

    @property
    def ready(self):
        return len(self.values) > 0


def draw_pose_skeleton(frame, pose):
    """
    Renders 33 landmark points and bone connections onto the OpenCV frame.
    Color coding:
        - Green  (BGR: 0, 255, 0): Confident landmark (visibility >= VISIBILITY_THRESHOLD)
        - Orange (BGR: 0, 165, 255): Borderline landmark (DRAW_VISIBILITY_THRESHOLD <= vis < VISIBILITY_THRESHOLD)
        - Landmarks below DRAW_VISIBILITY_THRESHOLD are omitted as noise.
    """
    h, w = frame.shape[:2]

    def color_for(vis):
        return (0, 255, 0) if vis >= VISIBILITY_THRESHOLD else (0, 165, 255)

    # 1. Draw connection lines
    for start_idx, end_idx in POSE_CONNECTIONS:
        start_lm = get_landmark(pose, start_idx)
        end_lm = get_landmark(pose, end_idx)

        if start_lm.visibility < DRAW_VISIBILITY_THRESHOLD or end_lm.visibility < DRAW_VISIBILITY_THRESHOLD:
            continue

        edge_color = color_for(min(start_lm.visibility, end_lm.visibility))
        cv2.line(frame, get_coordinates(start_lm, w, h), get_coordinates(end_lm, w, h), edge_color, 2)

    # 2. Draw landmark dots on top of lines
    for lm in pose:
        if lm.visibility < DRAW_VISIBILITY_THRESHOLD:
            continue
        cv2.circle(frame, get_coordinates(lm, w, h), 4, color_for(lm.visibility), -1)


# =============================================================================
# 6. Visible-Side Selection & Push-Up Feature Extraction
# =============================================================================

def select_visible_side(pose):
    """
    In a side-angle capture, only ONE side of the body is reliably visible at
    a time (the side facing the camera) - the far side is commonly occluded
    or low-confidence. This picks whichever side (LEFT or RIGHT) has the
    higher average visibility across the joints needed for push-up tracking.

    Returns:
        tuple: (side_name: "LEFT" | "RIGHT", side_set: dict, side_visibility: float)
    """
    def avg_vis(side_set):
        return float(np.mean([get_landmark(pose, idx).visibility for idx in side_set.values()]))

    left_vis = avg_vis(LEFT_SIDE_SET)
    right_vis = avg_vis(RIGHT_SIDE_SET)

    if left_vis >= right_vis:
        return "LEFT", LEFT_SIDE_SET, left_vis
    return "RIGHT", RIGHT_SIDE_SET, right_vis


def extract_pushup_features(pose):
    """
    Extracts the specific geometric and kinematic features required for push-up
    analysis, using ONLY the side of the body currently facing the camera:
        1. Vertical positions of shoulder and elbow (y coordinates in normalized space)
        2. Depth difference: shoulder_y - elbow_y (positive when shoulder is at or below elbow)
        3. Elbow angle (shoulder -> elbow -> wrist)
        4. Hip angle (shoulder -> hip -> knee) for plank straightness
        5. Torso angle from vertical (shoulder -> hip vector) - confirms the body
           is actually in a horizontal plank rather than standing/kneeling upright
        6. Neck alignment angle (nose relative to shoulder)

    Parameters:
        pose: List of 33 MediaPipe landmark objects for the current frame.

    Returns:
        dict: Extracted numeric features and validity flags.
    """
    side_name, side_set, side_visibility = select_visible_side(pose)

    shoulder = get_landmark(pose, side_set["shoulder"])
    elbow = get_landmark(pose, side_set["elbow"])
    wrist = get_landmark(pose, side_set["wrist"])
    hip = get_landmark(pose, side_set["hip"])
    knee = get_landmark(pose, side_set["knee"])
    nose = get_landmark(pose, NOSE)

    # 1. Shoulder and elbow vertical heights (normalized y: 0.0 at top, 1.0 at bottom)
    shoulder_y = shoulder.y
    elbow_y = elbow.y
    depth_diff = shoulder_y - elbow_y

    # 2. Elbow angle (shoulder - elbow - wrist)
    elbow_angle = calculate_angle(shoulder, elbow, wrist)

    # 3. Hip angle (shoulder - hip - knee) for plank alignment
    # Check knee visibility to handle frames where the leg is occluded
    hip_valid = knee.visibility >= 0.5
    hip_angle = calculate_angle(shoulder, hip, knee) if hip_valid else 0.0

    # 4. Torso angle from vertical - this is the key plank-validity signal for
    # side-angle capture: a real push-up has the torso roughly horizontal,
    # whereas standing and just moving the arm keeps the torso near-vertical.
    torso_angle = vertical_angle_of_vector(_xy(shoulder) - _xy(hip))

    # 5. Neck alignment (nose relative to shoulder)
    neck_angle = vertical_angle_of_vector(_xy(nose) - _xy(shoulder))

    return {
        "side": side_name,
        "side_visibility": side_visibility,
        "shoulder_y": shoulder_y,
        "elbow_y": elbow_y,
        "depth_diff": depth_diff,
        "elbow_angle": elbow_angle,
        "hip_angle": hip_angle,
        "hip_valid": hip_valid,
        "torso_angle": torso_angle,
        "neck_angle": neck_angle,
    }


# =============================================================================
# 7. Push-Up State Classification & Debouncing
# =============================================================================

def classify_state(depth_diff, elbow_angle, current_state, torso_angle=None,
                    hip_angle=None, hip_valid=True):
    """
    Plank-gated, direction-aware state classifier for the push-up cycle.

    Plank-validity gate (new):
      Before any BOTTOM/UP condition is even considered, the body must be in
      a valid plank orientation:
        - torso_angle within [TORSO_HORIZONTAL_MIN, TORSO_HORIZONTAL_MAX] of vertical
        - hip_angle within [PLANK_HIP_MIN, PLANK_HIP_MAX] (back roughly straight)
      If this gate fails (e.g. user is standing and just bending the elbow),
      the state is frozen - no transition happens at all.

    Conditions (AND-based, not OR):
      - BOTTOM: Shoulder reaches at or below elbow (depth_diff >= 0.0)
                AND elbow flexion is deep (elbow_angle <= 95°).
                (Previously this was an OR, which let elbow bending ALONE
                trigger BOTTOM even without the body actually descending.)
      - UP: Arms straight (elbow_angle >= 160°) AND shoulders clearly above elbow
            (depth_diff <= -UP_DEPTH_MARGIN).
      - DOWN: Transitional movement between UP and BOTTOM.

    Enforces biological movement progression:
      - UP -> DOWN (cannot jump directly UP -> BOTTOM)
      - DOWN -> BOTTOM (descending) or DOWN -> UP (ascending)
      - BOTTOM -> DOWN (ascending)
    """
    plank_valid = True
    if torso_angle is not None:
        plank_valid = TORSO_HORIZONTAL_MIN <= torso_angle <= TORSO_HORIZONTAL_MAX
    if hip_valid and hip_angle is not None and hip_angle > 0:
        plank_valid = plank_valid and (PLANK_HIP_MIN <= hip_angle <= PLANK_HIP_MAX)

    if not plank_valid:
        # Not actually in a plank position - freeze state, ignore this frame
        return current_state

    is_at_bottom = (depth_diff >= 0.0) and (elbow_angle <= ELBOW_BOTTOM_THRESHOLD)
    is_at_top = (elbow_angle >= ELBOW_UP_THRESHOLD) and (depth_diff <= -UP_DEPTH_MARGIN)

    if current_state == "UP":
        return "UP" if is_at_top else "DOWN"

    elif current_state == "BOTTOM":
        return "BOTTOM" if is_at_bottom else "DOWN"

    elif current_state == "DOWN":
        if is_at_bottom:
            return "BOTTOM"
        elif is_at_top:
            return "UP"
        else:
            return "DOWN"

    return "UP"


class DebouncedState:
    """
    Filters momentary video noise and landmark flutter.
    A candidate state must persist for `debounce_frames` consecutive frames
    before becoming the confirmed state.
    """

    def __init__(self, debounce_frames=DEBOUNCE_FRAMES, initial_state="UP"):
        self.debounce_frames = debounce_frames
        self.confirmed_state = initial_state
        self._candidate_state = None
        self._candidate_count = 0

    def update(self, raw_state):
        """
        Processes the raw state from the classifier.
        Returns:
            tuple: (confirmed_state, changed: bool)
        """
        if raw_state == self.confirmed_state:
            self._candidate_state = None
            self._candidate_count = 0
            return self.confirmed_state, False

        if raw_state == self._candidate_state:
            self._candidate_count += 1
        else:
            self._candidate_state = raw_state
            self._candidate_count = 1

        if self._candidate_count >= self.debounce_frames:
            self.confirmed_state = raw_state
            self._candidate_state = None
            self._candidate_count = 0
            return self.confirmed_state, True

        return self.confirmed_state, False

    def reset_candidate(self):
        """Resets pending candidate transitions when tracking is lost or visibility drops."""
        self._candidate_state = None
        self._candidate_count = 0


# =============================================================================
# 8. Rep Counting State Machine & Biomechanical Form Evaluator
# =============================================================================

class PushUpRepCounter:
    """
    Finite State Machine managing push-up repetition lifecycle:
        UP -> DOWN -> BOTTOM -> DOWN -> UP

    Rules:
      - Increments rep_count ONLY when the user ascends back to UP after reaching BOTTOM.
      - Shallow reps (UP -> DOWN -> UP without reaching BOTTOM) increment shallow_count
        and are NOT counted as full reps.
      - Blocks illegal transitions (e.g., UP -> BOTTOM directly).
    """

    ALLOWED_TRANSITIONS = {
        "UP": {"DOWN"},
        "DOWN": {"BOTTOM", "UP"},
        "BOTTOM": {"DOWN"},
    }

    def __init__(self):
        self.state = "UP"
        self.rep_count = 0
        self.shallow_count = 0
        self._reached_bottom = False

    def process_transition(self, new_state):
        """Evaluates confirmed state change and updates repetition counts."""
        if new_state == self.state:
            return

        valid_targets = self.ALLOWED_TRANSITIONS.get(self.state, set())
        if new_state not in valid_targets:
            print(f"[warning] Blocked invalid direct transition: {self.state} -> {new_state}")
            return

        print(f"[state] {self.state} -> {new_state}")

        # Record when proper depth has been achieved
        if new_state == "BOTTOM":
            self._reached_bottom = True

        # Rep cycle completes upon returning to top position (UP) from DOWN
        if new_state == "UP" and self.state == "DOWN":
            if self._reached_bottom:
                self.rep_count += 1
                print(f"[rep] Rep #{self.rep_count} counted (reached BOTTOM)")
            else:
                self.shallow_count += 1
                print("[rep] Shallow push-up - NOT counted (never reached BOTTOM)")
            self._reached_bottom = False

        self.state = new_state


def evaluate_pushup_form(elbow_angle, hip_angle, neck_angle, hip_valid=True):
    """
    Evaluates real-time push-up biomechanics and posture from the side view:
        1. Plank straightness: checks for sagging core or piking hips.
        2. Head craning: checks for hyperextended neck.

    (Left/right asymmetry and shoulder-twist checks are dropped here since a
    side-angle camera only ever sees one side of the body - there is nothing
    to compare it against.)

    Returns:
        tuple: (status: str ["GOOD" | "FORM ISSUE"], feedback: str)
    """
    feedback = "Good Form"
    is_good = True

    # 1. Plank alignment check (sagging / piking)
    if hip_valid and hip_angle > 0:
        if hip_angle < HIP_SAG_THRESHOLD:
            is_good = False
            feedback = "Hips sagging - tighten core"
        elif hip_angle > HIP_PIKE_THRESHOLD:
            is_good = False
            feedback = "Hips piking - lower hips into line"

    # 2. Neck alignment check
    if is_good and abs(neck_angle - 90.0) > NECK_DEVIATION_THRESHOLD:
        is_good = False
        feedback = "Keep neck neutral - don't crane head"

    status = "GOOD" if is_good else "FORM ISSUE"
    return status, feedback


# =============================================================================
# 9. CSV Logging Helpers
# =============================================================================

buffer = []


def flush_buffer(rows, path=CSV_PATH):
    """
    Flushes buffered frame rows to the CSV dataset on disk.
    Appends data and writes headers only if the file does not already exist.
    """
    if not rows:
        return

    df = pd.DataFrame(rows, columns=CSV_COLUMNS)
    write_header = not os.path.exists(path) or os.path.getsize(path) == 0

    df.to_csv(path, mode="a", header=write_header, index=False)
    rows.clear()


def build_csv_row(
    timestamp_ms, features, smoothed_elbow, smoothed_depth_diff,
    smoothed_hip, smoothed_visibility, rep_counter, form_status, feedback
):
    """
    Constructs a dictionary row matching CSV_COLUMNS for dataset recording.
    Handles valid frames, low visibility frames, and undetected frames uniformly.
    """
    if features is not None:
        return {
            "timestamp": timestamp_ms,
            "side": features["side"],
            "elbow_angle": round(features["elbow_angle"], 1),
            "smoothed_elbow_angle": round(smoothed_elbow, 1) if smoothed_elbow is not None else None,
            "shoulder_y": round(features["shoulder_y"], 4),
            "elbow_y": round(features["elbow_y"], 4),
            "shoulder_elbow_diff": round(smoothed_depth_diff, 4) if smoothed_depth_diff is not None else None,
            "hip_angle": round(features["hip_angle"], 1) if features["hip_valid"] else None,
            "smoothed_hip_angle": round(smoothed_hip, 1) if smoothed_hip is not None else None,
            "torso_angle": round(features["torso_angle"], 1),
            "neck_angle": round(features["neck_angle"], 1),
            "visibility": round(smoothed_visibility, 3) if smoothed_visibility is not None else None,
            "state": rep_counter.state,
            "rep_count": rep_counter.rep_count,
            "form_status": form_status,
            "feedback": feedback,
        }
    else:
        # Frame with low confidence or no person detected
        return {
            "timestamp": timestamp_ms,
            "side": None,
            "elbow_angle": None,
            "smoothed_elbow_angle": None,
            "shoulder_y": None,
            "elbow_y": None,
            "shoulder_elbow_diff": None,
            "hip_angle": None,
            "smoothed_hip_angle": None,
            "torso_angle": None,
            "neck_angle": None,
            "visibility": round(smoothed_visibility, 3) if smoothed_visibility is not None else None,
            "state": rep_counter.state,
            "rep_count": rep_counter.rep_count,
            "form_status": form_status,
            "feedback": feedback,
        }


# =============================================================================
# 10. HUD Rendering (Translucent Card Overlay)
# =============================================================================

STATE_COLORS = {
    "UP": (0, 255, 0),        # Green
    "DOWN": (0, 215, 255),    # Amber / Yellow
    "BOTTOM": (255, 255, 0),  # Cyan / Sky Blue
}


def draw_hud(
    frame, state, rep_count, shallow_count, smoothed_elbow, smoothed_depth_diff,
    smoothed_hip, form_status, feedback, smoothed_visibility, pose_detected
):
    """
    Renders a translucent dark card HUD in the top-left corner:
    ┌───────────────────────────────────┐
    │ STATE: DOWN                       │
    │ REPS:  3  (SHALLOW: 0)            │
    │ DEPTH: BELOW ELBOW (GOOD)         │
    │ AVG ELBOW: 88.4°                  │
    │ FORM: GOOD - Good Form            │
    │ CONFIDENCE: 0.85                  │
    └───────────────────────────────────┘
    """
    overlay = frame.copy()
    cv2.rectangle(overlay, (15, 15), (390, 260), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    # 1. State indicator
    state_color = STATE_COLORS.get(state, (0, 255, 0))
    cv2.putText(frame, f"STATE: {state}", (28, 48),
                cv2.FONT_HERSHEY_SIMPLEX, 0.75, state_color, 2, cv2.LINE_AA)

    # 2. Repetition counter
    rep_text = f"REPS: {rep_count}"
    if shallow_count > 0:
        rep_text += f"  (SHALLOW: {shallow_count})"
    cv2.putText(frame, rep_text, (28, 78),
                cv2.FONT_HERSHEY_SIMPLEX, 0.70, (255, 255, 255), 2, cv2.LINE_AA)

    # 3. Shoulder vs. Elbow depth indicator
    if smoothed_depth_diff is not None:
        if smoothed_depth_diff >= 0.0:
            depth_str = "DEPTH: BELOW ELBOW (GOOD)"
            depth_color = (0, 255, 0)
        else:
            depth_str = "DEPTH: ABOVE ELBOW"
            depth_color = (0, 165, 255)
    else:
        depth_str = "DEPTH: --"
        depth_color = (180, 180, 180)

    cv2.putText(frame, depth_str, (28, 108),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, depth_color, 2, cv2.LINE_AA)

    # 4. Smoothed elbow angle
    elbow_str = f"AVG ELBOW: {smoothed_elbow:.1f}°" if smoothed_elbow is not None else "AVG ELBOW: --"
    cv2.putText(frame, elbow_str, (28, 138),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (240, 240, 240), 2, cv2.LINE_AA)

    # 5. Form status & feedback message
    status_color = (0, 255, 0) if form_status == "GOOD" else (0, 165, 255)
    cv2.putText(frame, f"FORM: {form_status} - {feedback}", (28, 168),
                cv2.FONT_HERSHEY_SIMPLEX, 0.52, status_color, 1, cv2.LINE_AA)

    # 6. Pose tracking confidence
    if smoothed_visibility is not None:
        vis_str = f"CONFIDENCE: {smoothed_visibility:.2f}"
        vis_color = (240, 240, 240) if smoothed_visibility >= VISIBILITY_THRESHOLD else (0, 165, 255)
    else:
        vis_str = "CONFIDENCE: --"
        vis_color = (0, 165, 255)

    cv2.putText(frame, vis_str, (28, 198),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, vis_color, 2, cv2.LINE_AA)

    # Status / instructions below the card
    if not pose_detected:
        cv2.putText(frame, "No person detected", (20, 290),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2, cv2.LINE_AA)

    cv2.putText(frame, "[q]=quit", (20, 318),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1, cv2.LINE_AA)


# =============================================================================
# 11. Main Webcam Loop & Execution
# =============================================================================

def main():
    # 1. Initialize Pose Landmarker and Video Capture
    landmarker = create_landmarker()
    cap = cv2.VideoCapture(VIDEO_SOURCE)

    frame_idx = 0
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    # 2. Instantiate smoothing filters and state trackers
    elbow_smoother = MovingAverage(SMOOTHING_WINDOW)
    depth_diff_smoother = MovingAverage(SMOOTHING_WINDOW)
    hip_smoother = MovingAverage(SMOOTHING_WINDOW)
    visibility_smoother = MovingAverage(SMOOTHING_WINDOW)
    debounced_state = DebouncedState(DEBOUNCE_FRAMES, initial_state="UP")
    rep_counter = PushUpRepCounter()

    session_start = time.time()

    print("=========================================================")
    print("Automatic Push-Up Tracker Running (side-angle capture)")
    print(f"Confidence standard: {POSE_DETECTION_CONFIDENCE}")
    print(f"Target depth: Shoulder below elbow AND elbow <= {ELBOW_BOTTOM_THRESHOLD}°")
    print(f"Top extension: Arms extended >= {ELBOW_UP_THRESHOLD}°")
    print(f"Plank gate: torso {TORSO_HORIZONTAL_MIN}-{TORSO_HORIZONTAL_MAX}°, hip {PLANK_HIP_MIN}-{PLANK_HIP_MAX}°")
    print("Press [q] on the video window to quit.")
    print("=========================================================")
    print(f"[state] Initial state: {rep_counter.state}")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        # 3. Convert frame: OpenCV BGR -> MediaPipe SRGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
        timestamp_ms = int(frame_idx * 1000 / fps)

        # 4. Perform Pose Landmark Detection
        result = landmarker.detect_for_video(mp_image, timestamp_ms)

        smoothed_elbow = None
        smoothed_depth_diff = None
        smoothed_hip = None
        smoothed_visibility = None
        form_status = "GOOD"
        feedback = "Good Form"
        pose_detected = False
        features = None

        if result.pose_landmarks:
            pose = result.pose_landmarks[0]
            pose_detected = True

            # Draw visual skeleton
            draw_pose_skeleton(frame, pose)

            # Determine which side is facing the camera and check its visibility
            _, _, raw_visibility = select_visible_side(pose)
            smoothed_visibility = visibility_smoother.update(raw_visibility)

            if smoothed_visibility >= VISIBILITY_THRESHOLD:
                # 5. Extract geometric features from the visible side only
                features = extract_pushup_features(pose)

                # 6. Apply temporal smoothing
                smoothed_depth_diff = depth_diff_smoother.update(features["depth_diff"])
                smoothed_elbow = elbow_smoother.update(features["elbow_angle"])
                smoothed_hip = hip_smoother.update(features["hip_angle"]) if features["hip_valid"] else None

                # 7. Plank-gated, direction-aware state classification & debouncing
                raw_state = classify_state(
                    smoothed_depth_diff, smoothed_elbow, debounced_state.confirmed_state,
                    torso_angle=features["torso_angle"],
                    hip_angle=smoothed_hip,
                    hip_valid=features["hip_valid"],
                )
                confirmed_state, changed = debounced_state.update(raw_state)

                # 8. State machine transition & rep counting
                if changed:
                    rep_counter.process_transition(confirmed_state)

                # 9. Biomechanical form evaluation
                form_status, feedback = evaluate_pushup_form(
                    elbow_angle=features["elbow_angle"],
                    hip_angle=features["hip_angle"],
                    neck_angle=features["neck_angle"],
                    hip_valid=features["hip_valid"],
                )
            else:
                # Landmark visibility too low: reset debounce candidate to prevent false triggers
                debounced_state.reset_candidate()
                form_status = "LOW CONFIDENCE"
                feedback = "Adjust camera view"
        else:
            # No person detected in frame
            smoothed_visibility = visibility_smoother.update(0.0)
            debounced_state.reset_candidate()
            form_status = "NO PERSON"
            feedback = "Step into frame"

        # 10. Record row to CSV buffer in parallel
        row = build_csv_row(
            timestamp_ms=timestamp_ms,
            features=features,
            smoothed_elbow=smoothed_elbow,
            smoothed_depth_diff=smoothed_depth_diff,
            smoothed_hip=smoothed_hip,
            smoothed_visibility=smoothed_visibility,
            rep_counter=rep_counter,
            form_status=form_status,
            feedback=feedback,
        )
        buffer.append(row)

        if len(buffer) >= FLUSH_EVERY:
            flush_buffer(buffer, CSV_PATH)

        # 11. Render HUD overlay
        draw_hud(
            frame=frame,
            state=rep_counter.state,
            rep_count=rep_counter.rep_count,
            shallow_count=rep_counter.shallow_count,
            smoothed_elbow=smoothed_elbow,
            smoothed_depth_diff=smoothed_depth_diff,
            smoothed_hip=smoothed_hip,
            form_status=form_status,
            feedback=feedback,
            smoothed_visibility=smoothed_visibility,
            pose_detected=pose_detected,
        )

        cv2.imshow("Push-up Rep Tracker", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break

        frame_idx += 1

    # =========================================================================
    # 12. Cleanup & Session Summary
    # =========================================================================
    cap.release()
    cv2.destroyAllWindows()
    flush_buffer(buffer, CSV_PATH)
    landmarker.close()

    session_duration = time.time() - session_start
    print("\n----- Session Summary -----")
    print(f"Frames processed: {frame_idx}")
    print(f"Session duration: {session_duration:.1f} sec")
    print(f"Full reps counted: {rep_counter.rep_count}")
    print(f"Shallow push-ups (not counted): {rep_counter.shallow_count}")
    print(f"Final state: {rep_counter.state}")
    print(f"Dataset saved to: {CSV_PATH}")
    print("----------------------------\n")


if __name__ == "__main__":
    main()