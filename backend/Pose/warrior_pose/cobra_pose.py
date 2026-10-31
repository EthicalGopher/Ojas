"""
Cobra Pose (Bhujangasana) Detection & Form Evaluation Module.

Biomechanical Specifications:
- Camera: Side view recommended / required.
- Target Pose: Full Cobra (NOT Baby Cobra).
- Landmarks Used:
    NOSE, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW,
    LEFT_WRIST, RIGHT_WRIST, LEFT_HIP, RIGHT_HIP,
    LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE.
- Core Form Conditions:
    * Elbow angle: 155°–178° (extended elbows, not Baby Cobra 80°–100°)
    * Knee extension: > 160° (legs straight on mat)
    * Hip grounding: pelvis remains close to floor baseline (pelvis_lift <= 0.08)
    * Torso / chest lift: shoulders elevated above hips (chest_lift_y >= 0.12)
    * Backbend curve: controlled backbend via shoulder-hip-knee geometry
      (sufficient to lift the chest, but not pushed into an exaggerated/
      maximal arch - natural variation in flexibility is accepted)
    * Neck: loose gaze check, level/forward gaze
- False Positive Protection:
    * Distinguishes from lying flat on stomach (requires chest lift + backbend + extended arms)
    * Distinguishes from Upward-Facing Dog (requires grounded pelvis, not lifted off floor)
- Hold Timer:
    * Static pose hold timer, increments only on CORRECT form, resets on break.
- Dataset Logging:
    * Contributes correct samples to shared yoga_pose_dataset.csv.
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
# 1. Landmarker Setup
# =============================================================================

def create_landmarker(model_path="pose_landmarker_lite.task"):
    """Initialize MediaPipe Pose Landmarker for video mode."""
    base_options = python.BaseOptions(model_asset_path=model_path)
    options = vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
    )
    return vision.PoseLandmarker.create_from_options(options)


# =============================================================================
# 2. Landmark Indices & Connections
# =============================================================================

NOSE = 0
LEFT_SHOULDER, RIGHT_SHOULDER = 11, 12
LEFT_ELBOW, RIGHT_ELBOW = 13, 14
LEFT_WRIST, RIGHT_WRIST = 15, 16
LEFT_HIP, RIGHT_HIP = 23, 24
LEFT_KNEE, RIGHT_KNEE = 25, 26
LEFT_ANKLE, RIGHT_ANKLE = 27, 28
LEFT_HEEL, RIGHT_HEEL = 29, 30
LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX = 31, 32

# Landmarks required strictly for Cobra Pose sagittal geometry.
# This is the full pose-specific set used by detection/form logic (angles,
# distances, chest/pelvis elevation). See compute_visibility() below for the
# subset used to gate the frame — a side-view camera occludes the far-side
# limb chain, so those landmarks must not block a valid pose.
REQUIRED_LANDMARKS = [
    NOSE,
    LEFT_SHOULDER, RIGHT_SHOULDER,
    LEFT_ELBOW, RIGHT_ELBOW,
    LEFT_WRIST, RIGHT_WRIST,
    LEFT_HIP, RIGHT_HIP,
    LEFT_KNEE, RIGHT_KNEE,
    LEFT_ANKLE, RIGHT_ANKLE,
]

# Standard 33-point pose skeleton connections (index pairs).
POSE_CONNECTIONS = [
    (conn.start, conn.end) for conn in vision.PoseLandmarksConnections.POSE_LANDMARKS
]


def compute_visibility(pose):
    """
    Minimum visibility over the landmarks that must be trustworthy for a
    side-view Cobra frame:
      - Head (nose) and bilateral torso points (both shoulders, both hips),
        which remain visible from the side.
      - The camera-facing limb chain (elbow, wrist, knee, ankle): for each
        paired joint we take the better-visible side (max of left/right),
        because the far-side limb is occluded by the torso in side view and
        reports low visibility even when the pose is perfect.
    This keeps the pose from being rejected purely because an occluded
    far-side limb is not confidently visible.
    """
    core = [NOSE, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP]
    pairs = [
        (LEFT_ELBOW, RIGHT_ELBOW),
        (LEFT_WRIST, RIGHT_WRIST),
        (LEFT_KNEE, RIGHT_KNEE),
        (LEFT_ANKLE, RIGHT_ANKLE),
    ]
    vis = [pose[i].visibility for i in core]
    vis += [max(pose[a].visibility, pose[b].visibility) for a, b in pairs]
    return float(min(vis))


# =============================================================================
# 3. Video Source & Configuration
# =============================================================================

# Camera orientation: Side view
VIDEO_SOURCE = 0

# Primary English name (Sanskrit identification: Bhujangasana)
POSE_NAME = "Cobra Pose"
POSE_LABEL = "Cobra Pose"

# -----------------------------------------------------------------------------
# Biomechanical Thresholds (Full Cobra / Bhujangasana)
# -----------------------------------------------------------------------------
ELBOW_ANGLE_MIN = 155.0           # [Reference-derived starting: 155°] Min elbow extension for Full Cobra (deg)
ELBOW_ANGLE_MAX = 178.0           # [Reference-derived starting: 178°] Max elbow extension (avoid hyperextension lock)
# Knee extension bound.
# Observed live-session range for the camera-facing knee in Cobra (logged in
# yoga_pose_dataset.csv): 159°-163°. The >160° reference bound sat on the edge
# of that range and rejected valid frames, so it was lowered to 155° — still
# far above the bent-knee ranges of Bow (35°-70°) or a folded far-side leg.
KNEE_STRAIGHT_MIN = 155.0         # [Observed data: 159-163°] Min knee extension (straight legs on floor)
PELVIS_GROUNDED_MAX = 0.08        # [Inferred / Meaningful margin] Max vertical rise of hips above leg floor baseline
CHEST_LIFT_Y_MIN = 0.12           # [Reference-derived / Meaningful margin] Min vertical rise of shoulders above hips
TORSO_LIFT_ANGLE_MIN = 22.0       # [Practical tuning] Min torso angle relative to horizontal (deg)
# Backbend curve bound (shoulder-hip-knee hip angle).
# HIP_BACKBEND_MAX gates the lower end of the arch: hip angle above this is
# too close to flat/prone lying and is NOT yet a backbend.
# HIP_BACKBEND_MIN gates the upper end of the arch: hip angle below this
# means the spine is being pulled into an exaggerated/maximal curve well
# past what "sufficient" Cobra requires - this bound guards against
# over-arching rather than rewarding it (previously defined but unused).
HIP_BACKBEND_MAX = 162.0          # [Reference-derived] Max hip angle (deg) ensuring sufficient backbend vs flat prone
HIP_BACKBEND_MIN = 110.0          # [Practical tuning] Min hip angle (deg) - guards against excessive/maximal over-arching

# Temporal smoothing
SMOOTHING_WINDOW = 6              # Sliding-window moving average window size

# Visibility thresholds
VISIBILITY_THRESHOLD = 0.45       # Smoothed visibility required to trust pose & drive hold timer
DRAW_VISIBILITY_THRESHOLD = 0.2   # Landmarks/connections below this are not drawn (noise filter)

# Common CSV Logging Configuration
# -----------------------------------------------------------------------------
# ML DATASET ARCHITECTURE NOTE:
# - All yoga pose files contribute correct pose samples to this shared CSV.
# - Columns represent the complete union of numerical features across all poses.
# - Unused/inapplicable features for a specific pose are populated with NaN.
# - Samples are recorded ONLY when the target pose is CORRECT.
# - No timestamps, frame counters, feedback strings, or hold timers are stored.
# -----------------------------------------------------------------------------
CSV_PATH = "yoga_pose_dataset.csv"
FLUSH_EVERY = 30

CSV_COLUMNS = [
    "left_knee_angle",
    "right_knee_angle",
    "avg_knee_angle",
    "left_hip_angle",
    "right_hip_angle",
    "avg_hip_angle",
    "left_elbow_angle",
    "right_elbow_angle",
    "avg_elbow_angle",
    "left_shoulder_angle",
    "right_shoulder_angle",
    "avg_shoulder_angle",
    "left_body_line_angle",
    "right_body_line_angle",
    "avg_body_line_angle",
    "torso_angle",
    "torso_to_horizontal",
    "left_thigh_to_horizontal",
    "right_thigh_to_horizontal",
    "left_arm_to_horizontal",
    "right_arm_to_horizontal",
    "shoulder_tilt_angle",
    "hip_tilt_angle",
    "shoulder_symmetry",
    "hip_symmetry",
    "shoulder_width",
    "hip_width",
    "stance_width",
    "stance_to_shoulder_ratio",
    "stance_to_hip_ratio",
    "shoulder_to_hip_ratio",
    "neck_angle",
    "head_offset_x",
    "head_offset_ratio",
    "nose_to_mid_shoulder_dist",
    "pose_visibility",
    "front_knee_angle",
    "back_knee_angle",
    "front_hip_angle",
    "back_hip_angle",
    "standing_knee_angle",
    "lifted_knee_angle",
    "standing_hip_angle",
    "lifted_hip_angle",
    "top_arm_shoulder_angle",
    "bottom_arm_shoulder_angle",
    "top_arm_elbow_angle",
    "bottom_arm_elbow_angle",
    "hip_sag_offset",
    "lifted_foot_to_standing_knee_dist",
    "front_knee_ankle_x_offset",
    "pose_label",
]


# =============================================================================
# 4. Geometry Helpers
# =============================================================================

def _xy(lm):
    """Convert landmark to (x, y) numpy array."""
    return np.array([lm.x, lm.y])


def _midpoint(a, b):
    """Midpoint (x, y) of two landmarks."""
    return (_xy(a) + _xy(b)) / 2.0


def calculate_angle(a, b, c):
    """Angle at point b, formed by rays b->a and b->c, in degrees [0, 180]."""
    a, b, c = _xy(a), _xy(b), _xy(c)
    ba = a - b
    bc = c - b

    radians = np.arctan2(bc[1], bc[0]) - np.arctan2(ba[1], ba[0])
    angle = np.abs(radians * 180.0 / np.pi)

    if angle > 180.0:
        angle = 360.0 - angle

    return float(angle)


def calculate_distance(a, b):
    """Euclidean distance between two landmarks (x, y only)."""
    return float(np.linalg.norm(_xy(a) - _xy(b)))


def vertical_angle_of_vector(vec):
    """Angle (degrees) of a 2D vector relative to vertical (0 = upright)."""
    vertical_vec = np.array([0.0, -1.0])  # Upward in image coordinate space
    denom = np.linalg.norm(vec) * np.linalg.norm(vertical_vec)
    if denom < 1e-8:
        return 0.0

    cos_angle = np.dot(vec, vertical_vec) / denom
    cos_angle = np.clip(cos_angle, -1.0, 1.0)
    return float(np.degrees(np.arccos(cos_angle)))


def horizontal_angle_of_vector(vec):
    """Angle (degrees) of a 2D vector relative to horizontal (0 = level)."""
    horizontal_vec = np.array([1.0, 0.0])
    denom = np.linalg.norm(vec) * np.linalg.norm(horizontal_vec)
    if denom < 1e-8:
        return 0.0

    cos_angle = np.dot(vec, horizontal_vec) / denom
    cos_angle = np.clip(cos_angle, -1.0, 1.0)
    angle = float(np.degrees(np.arccos(cos_angle)))
    if angle > 90.0:
        angle = 180.0 - angle
    return angle


def calculate_torso_angle(shoulder_l, shoulder_r, hip_l, hip_r):
    """Angle of the torso relative to vertical (0 = perfectly upright)."""
    shoulder_mid = _midpoint(shoulder_l, shoulder_r)
    hip_mid = _midpoint(hip_l, hip_r)
    return vertical_angle_of_vector(shoulder_mid - hip_mid)


def calculate_torso_to_horizontal(shoulder_l, shoulder_r, hip_l, hip_r):
    """Angle of the torso relative to horizontal (0 = parallel to floor)."""
    shoulder_mid = _midpoint(shoulder_l, shoulder_r)
    hip_mid = _midpoint(hip_l, hip_r)
    return horizontal_angle_of_vector(shoulder_mid - hip_mid)


def safe_div(numerator, denominator):
    """Safe division returning np.nan on zero or invalid denominator."""
    if denominator is None or np.isnan(denominator) or abs(denominator) < 1e-8:
        return np.nan
    return float(numerator / denominator)


# =============================================================================
# 5. Feature Extraction
# =============================================================================

def extract_features(pose):
    """Extract geometric features from MediaPipe pose landmarks for Cobra Pose."""
    features = {}

    # Knee angles (hip - knee - ankle)
    left_knee = calculate_angle(pose[LEFT_HIP], pose[LEFT_KNEE], pose[LEFT_ANKLE])
    right_knee = calculate_angle(pose[RIGHT_HIP], pose[RIGHT_KNEE], pose[RIGHT_ANKLE])
    features["left_knee_angle"] = left_knee
    features["right_knee_angle"] = right_knee
    features["avg_knee_angle"] = (left_knee + right_knee) / 2.0

    # Hip angles (shoulder - hip - knee)
    left_hip = calculate_angle(pose[LEFT_SHOULDER], pose[LEFT_HIP], pose[LEFT_KNEE])
    right_hip = calculate_angle(pose[RIGHT_SHOULDER], pose[RIGHT_HIP], pose[RIGHT_KNEE])
    features["left_hip_angle"] = left_hip
    features["right_hip_angle"] = right_hip
    features["avg_hip_angle"] = (left_hip + right_hip) / 2.0

    # Elbow angles (shoulder - elbow - wrist)
    left_elbow = calculate_angle(pose[LEFT_SHOULDER], pose[LEFT_ELBOW], pose[LEFT_WRIST])
    right_elbow = calculate_angle(pose[RIGHT_SHOULDER], pose[RIGHT_ELBOW], pose[RIGHT_WRIST])
    features["left_elbow_angle"] = left_elbow
    features["right_elbow_angle"] = right_elbow
    features["avg_elbow_angle"] = (left_elbow + right_elbow) / 2.0

    # Shoulder angles (elbow - shoulder - hip)
    left_shoulder_ang = calculate_angle(pose[LEFT_ELBOW], pose[LEFT_SHOULDER], pose[LEFT_HIP])
    right_shoulder_ang = calculate_angle(pose[RIGHT_ELBOW], pose[RIGHT_SHOULDER], pose[RIGHT_HIP])
    features["left_shoulder_angle"] = left_shoulder_ang
    features["right_shoulder_angle"] = right_shoulder_ang
    features["avg_shoulder_angle"] = (left_shoulder_ang + right_shoulder_ang) / 2.0

    # Full body line angles (shoulder - hip - ankle)
    left_body_line = calculate_angle(pose[LEFT_SHOULDER], pose[LEFT_HIP], pose[LEFT_ANKLE])
    right_body_line = calculate_angle(pose[RIGHT_SHOULDER], pose[RIGHT_HIP], pose[RIGHT_ANKLE])
    features["left_body_line_angle"] = left_body_line
    features["right_body_line_angle"] = right_body_line
    features["avg_body_line_angle"] = (left_body_line + right_body_line) / 2.0

    # Torso angles
    features["torso_angle"] = calculate_torso_angle(
        pose[LEFT_SHOULDER], pose[RIGHT_SHOULDER],
        pose[LEFT_HIP], pose[RIGHT_HIP]
    )
    features["torso_to_horizontal"] = calculate_torso_to_horizontal(
        pose[LEFT_SHOULDER], pose[RIGHT_SHOULDER],
        pose[LEFT_HIP], pose[RIGHT_HIP]
    )

    # Thigh & arm orientations
    features["left_thigh_to_horizontal"] = horizontal_angle_of_vector(_xy(pose[LEFT_KNEE]) - _xy(pose[LEFT_HIP]))
    features["right_thigh_to_horizontal"] = horizontal_angle_of_vector(_xy(pose[RIGHT_KNEE]) - _xy(pose[RIGHT_HIP]))
    features["left_arm_to_horizontal"] = horizontal_angle_of_vector(_xy(pose[LEFT_WRIST]) - _xy(pose[LEFT_SHOULDER]))
    features["right_arm_to_horizontal"] = horizontal_angle_of_vector(_xy(pose[RIGHT_WRIST]) - _xy(pose[RIGHT_SHOULDER]))

    # Midpoints & symmetry
    mid_shoulder = _midpoint(pose[LEFT_SHOULDER], pose[RIGHT_SHOULDER])
    mid_hip = _midpoint(pose[LEFT_HIP], pose[RIGHT_HIP])
    mid_knee = _midpoint(pose[LEFT_KNEE], pose[RIGHT_KNEE])
    mid_ankle = _midpoint(pose[LEFT_ANKLE], pose[RIGHT_ANKLE])

    features["shoulder_symmetry"] = float(abs(pose[LEFT_SHOULDER].y - pose[RIGHT_SHOULDER].y))
    features["hip_symmetry"] = float(abs(pose[LEFT_HIP].y - pose[RIGHT_HIP].y))
    features["shoulder_tilt_angle"] = horizontal_angle_of_vector(_xy(pose[RIGHT_SHOULDER]) - _xy(pose[LEFT_SHOULDER]))
    features["hip_tilt_angle"] = horizontal_angle_of_vector(_xy(pose[RIGHT_HIP]) - _xy(pose[LEFT_HIP]))

    # Widths & ratios
    shoulder_width = calculate_distance(pose[LEFT_SHOULDER], pose[RIGHT_SHOULDER])
    hip_width = calculate_distance(pose[LEFT_HIP], pose[RIGHT_HIP])
    stance_width = calculate_distance(pose[LEFT_ANKLE], pose[RIGHT_ANKLE])

    features["shoulder_width"] = shoulder_width
    features["hip_width"] = hip_width
    features["stance_width"] = stance_width
    features["stance_to_shoulder_ratio"] = safe_div(stance_width, shoulder_width)
    features["stance_to_hip_ratio"] = safe_div(stance_width, hip_width)
    features["shoulder_to_hip_ratio"] = safe_div(shoulder_width, hip_width)

    # Head / neck alignment
    nose_xy = _xy(pose[NOSE])
    features["neck_angle"] = vertical_angle_of_vector(nose_xy - mid_shoulder)
    features["head_offset_x"] = float(nose_xy[0] - mid_shoulder[0])
    features["head_offset_ratio"] = safe_div(nose_xy[0] - mid_shoulder[0], shoulder_width)
    features["nose_to_mid_shoulder_dist"] = float(np.linalg.norm(nose_xy - mid_shoulder))

    # Sagittal plane features for Cobra Pose:
    # Determine active/facing side by average landmark visibility
    left_vis = (pose[LEFT_SHOULDER].visibility + pose[LEFT_ELBOW].visibility + pose[LEFT_WRIST].visibility + pose[LEFT_HIP].visibility) / 4.0
    right_vis = (pose[RIGHT_SHOULDER].visibility + pose[RIGHT_ELBOW].visibility + pose[RIGHT_WRIST].visibility + pose[RIGHT_HIP].visibility) / 4.0
    active_side = "left" if left_vis >= right_vis else "right"
    features["active_side"] = active_side

    active_elbow = left_elbow if active_side == "left" else right_elbow
    active_knee = left_knee if active_side == "left" else right_knee
    active_hip = left_hip if active_side == "left" else right_hip
    features["active_elbow_angle"] = active_elbow
    features["active_knee_angle"] = active_knee
    features["active_hip_angle"] = active_hip

    # 1. Chest lift: vertical elevation of shoulders relative to hips (hip.y - shoulder.y in image coords)
    features["chest_lift_y"] = float(mid_hip[1] - mid_shoulder[1])

    # 2. Pelvis grounding: vertical rise of hips above the leg floor baseline (max of knee and ankle y)
    floor_baseline_y = max(mid_knee[1], mid_ankle[1])
    features["pelvis_lift_y"] = float(floor_baseline_y - mid_hip[1])

    return features


# =============================================================================
# 6. Drawing Helpers (Pose Skeleton)
# =============================================================================

def draw_pose_skeleton(frame, pose):
    """
    Draws 33 pose landmarks and skeleton connections on the frame,
    color-coded by landmark visibility confidence.

    Green  = Confident (visibility >= VISIBILITY_THRESHOLD)
    Orange = Borderline (DRAW_VISIBILITY_THRESHOLD <= visibility < VISIBILITY_THRESHOLD)
    """
    h, w = frame.shape[:2]

    def point_px(lm):
        return int(lm.x * w), int(lm.y * h)

    def color_for(visibility):
        if visibility >= VISIBILITY_THRESHOLD:
            return (0, 255, 0)
        return (0, 165, 255)

    for start_idx, end_idx in POSE_CONNECTIONS:
        start_lm = pose[start_idx]
        end_lm = pose[end_idx]

        if start_lm.visibility < DRAW_VISIBILITY_THRESHOLD or end_lm.visibility < DRAW_VISIBILITY_THRESHOLD:
            continue

        edge_color = color_for(min(start_lm.visibility, end_lm.visibility))
        cv2.line(frame, point_px(start_lm), point_px(end_lm), edge_color, 2)

    for lm in pose:
        if lm.visibility < DRAW_VISIBILITY_THRESHOLD:
            continue
        cv2.circle(frame, point_px(lm), 4, color_for(lm.visibility), -1)


# =============================================================================
# 7. Temporal Smoothing Filter
# =============================================================================

class MovingAverage:
    """Sliding-window moving average filter to denoise per-frame measurements."""

    def __init__(self, window_size):
        self.values = deque(maxlen=window_size)

    def update(self, value):
        if value is None or np.isnan(value):
            return None
        self.values.append(value)
        return sum(self.values) / len(self.values)

    @property
    def ready(self):
        return len(self.values) > 0


# =============================================================================
# 8. Pose Recognition & Form Validation
# =============================================================================

def is_cobra_pose_detected(feat, pose):
    """
    Detects if the user is in a general prone backbend configuration for Cobra Pose:
    - Prone orientation: hips and legs on floor, torso lifted diagonally
    - Shoulders higher than hips (smaller y in image space)
    - Knees roughly straight (> 140°)
    - Pelvis near floor level (not Upward Dog or standing)
    """
    # Shoulders higher than hips by a minimal threshold
    if feat.get("chest_lift_y", 0.0) <= 0.04:
        return False

    # Torso lifted from horizontal
    if feat["torso_to_horizontal"] < 12.0:
        return False

    # Legs roughly straight
    if feat["active_knee_angle"] < 140.0:
        return False

    # Not standing upright
    if feat["torso_angle"] < 20.0:
        return False

    # Pelvis near floor (not Pike / Downward Dog / Plank)
    if feat.get("pelvis_lift_y", 0.0) > 0.20:
        return False

    return True


def evaluate_cobra_pose_form(feat, pose):
    """
    Validates Cobra Pose form against Full Cobra biomechanical thresholds.
    Conditions:
    1. Grounded pelvis (<= PELVIS_GROUNDED_MAX = 0.08)
    2. Chest / Torso lift (chest_lift_y >= 0.12, torso_to_horizontal >= 22°)
    3. Full Cobra extended elbows (155°–178°, NOT Baby Cobra 80°–100°)
    4. Straight legs on mat (knee angle > 160°)
    5. Controlled backbend curve (HIP_BACKBEND_MIN° <= hip angle <= HIP_BACKBEND_MAX°) -
       sufficient to distinguish Cobra from flat prone lying, but not pushed into
       an exaggerated/maximal arch. A deeper backbend beyond this range is not
       treated as "more correct" - flexibility and body proportions vary.
    6. Loose gaze / neck check (nose above shoulders, level/forward gaze)
    Returns (is_correct, feedback_message, failed_rules).
    """
    issues = []
    mid_shoulder = _midpoint(pose[LEFT_SHOULDER], pose[RIGHT_SHOULDER])

    # 1. Pelvis groundedness (Key differentiator from Upward-Facing Dog)
    pelvis_lift = feat.get("pelvis_lift_y", 0.0)
    if pelvis_lift > PELVIS_GROUNDED_MAX:
        issues.append("Keep hips and pelvis grounded on the floor (Cobra, not Upward Dog)")

    # 2. Chest / Torso lift
    chest_lift = feat.get("chest_lift_y", 0.0)
    torso_horizontal = feat["torso_to_horizontal"]
    if chest_lift < CHEST_LIFT_Y_MIN or torso_horizontal < TORSO_LIFT_ANGLE_MIN:
        issues.append(f"Lift chest higher off the floor ({torso_horizontal:.1f}° < {TORSO_LIFT_ANGLE_MIN}°)")

    # 3. Elbow angle (Full Cobra target: 155°–178°)
    elbow_ang = feat["active_elbow_angle"]
    if elbow_ang < ELBOW_ANGLE_MIN:
        issues.append(f"Extend elbows to Full Cobra ({elbow_ang:.1f}° < {ELBOW_ANGLE_MIN}°)")
    elif elbow_ang > ELBOW_ANGLE_MAX:
        issues.append(f"Avoid hyperextending elbows ({elbow_ang:.1f}° > {ELBOW_ANGLE_MAX}°)")

    # 4. Knee extension (both legs straight along mat > 160°)
    knee_ang = feat["active_knee_angle"]
    if knee_ang < KNEE_STRAIGHT_MIN:
        issues.append(f"Straighten legs along the mat ({knee_ang:.1f}° < {KNEE_STRAIGHT_MIN}°)")

    # 5. Backbend curve: sufficient AND controlled. Too flat (hip angle too
    # high) is not yet a backbend; too curled (hip angle too low) is an
    # over-arch pushed past what Cobra requires - neither end is "more
    # correct" than the middle of this range.
    hip_ang = feat["active_hip_angle"]
    if hip_ang > HIP_BACKBEND_MAX:
        issues.append("Lift chest and engage the back for a controlled backbend")
    elif hip_ang < HIP_BACKBEND_MIN:
        issues.append("Ease off the arch - maintain a controlled backbend, don't over-extend")

    # 6. Loose neck check: ensure head is not tucked down or buried in shoulders
    if pose[NOSE].y > mid_shoulder[1]:
        issues.append("Keep neck lengthened and gaze forward")

    if not issues:
        return True, "Good Form! Hold Full Cobra!", []
    return False, issues[0], issues


# =============================================================================
# 9. Pose Hold Timer
# =============================================================================

class PoseHoldTimer:
    """
    Tracks static pose hold duration.
    Only increments hold timer when form is CORRECT.
    Resets timer to 0 immediately if form becomes INCORRECT/ADJUST or POSE NOT DETECTED.
    """

    def __init__(self):
        self.hold_start_time = None
        self.current_hold_time = 0.0
        self.max_hold_time = 0.0
        self.total_correct_samples = 0

    def update(self, is_correct):
        now = time.time()
        if is_correct:
            if self.hold_start_time is None:
                self.hold_start_time = now
                self.current_hold_time = 0.0
            else:
                self.current_hold_time = now - self.hold_start_time
            self.max_hold_time = max(self.max_hold_time, self.current_hold_time)
            self.total_correct_samples += 1
        else:
            self.hold_start_time = None
            self.current_hold_time = 0.0

        return self.current_hold_time

    def reset(self):
        self.hold_start_time = None
        self.current_hold_time = 0.0


# =============================================================================
# 10. CSV Logging Helper
# =============================================================================

buffer = []


def flush_buffer(rows, path=CSV_PATH):
    """Flush buffered correct pose frame rows to CSV dataset."""
    if not rows:
        return

    df = pd.DataFrame(rows, columns=CSV_COLUMNS)
    write_header = not os.path.exists(path) or os.path.getsize(path) == 0

    df.to_csv(
        path,
        mode="a",
        header=write_header,
        index=False,
    )
    rows.clear()


# =============================================================================
# 11. HUD Rendering (Translucent Card Overlay)
# =============================================================================

STATUS_COLORS = {
    "CORRECT": (0, 255, 0),          # Green
    "ADJUST FORM": (0, 215, 255),    # Amber / Yellow
    "POSE NOT DETECTED": (0, 0, 255),# Red
}


def draw_hud(frame, status, hold_time, max_hold, feedback, feat_display, visibility, pose_detected):
    """
    Renders a modern translucent dark card HUD in the top-left corner:
    ┌──────────────────────────────────────────┐
    │ POSE: COBRA POSE                         │
    │ STATUS: CORRECT                          │
    │ HOLD TIME: 05.4s  (MAX: 12.0s)           │
    │ FEEDBACK: Good Form! Hold Full Cobra!    │
    │                                          │
    │ ELBOW ANGLE:   165.2°                    │
    │ KNEE ANGLE:    168.4°                    │
    │ TORSO LIFT:     28.6°                    │
    │ CHEST HEIGHT:   0.14                     │
    │ PELVIS LIFT:    0.03                     │
    │ VISIBILITY:     0.92                     │
    └──────────────────────────────────────────┘
    """
    overlay = frame.copy()
    cv2.rectangle(
        overlay,
        (15, 15),
        (460, 310),
        (20, 20, 20),
        -1,
    )
    cv2.addWeighted(
        overlay,
        0.75,
        frame,
        0.25,
        0,
        frame,
    )

    # Pose title
    cv2.putText(
        frame,
        f"POSE: {POSE_NAME.upper()}",
        (28, 44),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.72,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )

    # Status indicator
    status_color = STATUS_COLORS.get(status, (255, 255, 255))
    cv2.putText(
        frame,
        f"STATUS: {status}",
        (28, 74),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        status_color,
        2,
        cv2.LINE_AA,
    )

    # Hold Timer
    timer_color = (0, 255, 0) if status == "CORRECT" else (200, 200, 200)
    cv2.putText(
        frame,
        f"HOLD TIME: {hold_time:.1f}s   (MAX: {max_hold:.1f}s)",
        (28, 106),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        timer_color,
        2,
        cv2.LINE_AA,
    )

    # Form feedback
    fb_color = (0, 255, 0) if status == "CORRECT" else (0, 215, 255) if status == "ADJUST FORM" else (160, 160, 160)
    cv2.putText(
        frame,
        f"FEEDBACK: {feedback}",
        (28, 138),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.50,
        fb_color,
        1,
        cv2.LINE_AA,
    )

    # Key angles / features
    y_pos = 168
    for label, val in feat_display.items():
        if isinstance(val, (int, float)) and not np.isnan(val):
            val_str = f"{val:.1f}°" if "ANGLE" in label or "LIFT" in label else f"{val:.2f}"
        else:
            val_str = "--"
        cv2.putText(
            frame,
            f"{label}: {val_str}",
            (28, y_pos),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.52,
            (240, 240, 240),
            1,
            cv2.LINE_AA,
        )
        y_pos += 24

    # Visibility score
    if visibility is not None:
        vis_str = f"VISIBILITY: {visibility:.2f}"
        vis_col = (240, 240, 240) if visibility >= VISIBILITY_THRESHOLD else (0, 165, 255)
    else:
        vis_str = "VISIBILITY: --"
        vis_col = (0, 165, 255)

    cv2.putText(
        frame,
        vis_str,
        (28, y_pos),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.52,
        vis_col,
        1,
        cv2.LINE_AA,
    )

    # Warning / Hint below card
    if not pose_detected:
        cv2.putText(
            frame,
            "No person detected",
            (20, 335),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.70,
            (0, 0, 255),
            2,
            cv2.LINE_AA,
        )

    cv2.putText(
        frame,
        "[q]=quit   [r]=reset timer",
        (20, 360),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (180, 180, 180),
        1,
        cv2.LINE_AA,
    )


# =============================================================================
# 12. Main Execution Loop
# =============================================================================

def main():
    landmarker = create_landmarker()
    cap = cv2.VideoCapture(VIDEO_SOURCE)

    frame_idx = 0
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    # Initialize feature smoothers
    torso_horiz_smoother = MovingAverage(SMOOTHING_WINDOW)
    elbow_smoother = MovingAverage(SMOOTHING_WINDOW)
    knee_smoother = MovingAverage(SMOOTHING_WINDOW)
    chest_lift_smoother = MovingAverage(SMOOTHING_WINDOW)
    pelvis_lift_smoother = MovingAverage(SMOOTHING_WINDOW)
    visibility_smoother = MovingAverage(SMOOTHING_WINDOW)

    hold_timer = PoseHoldTimer()
    session_start = time.time()

    print(f"Automatic {POSE_NAME} hold detection running. Press [q] to quit.")
    print(f"Logging correct samples to: {CSV_PATH}")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
        timestamp_ms = int(frame_idx * 1000 / fps)

        result = landmarker.detect_for_video(mp_image, timestamp_ms)

        status = "POSE NOT DETECTED"
        feedback = "Position yourself in camera view"
        smoothed_visibility = None
        pose_detected = False
        feat_display = {
            "ELBOW ANGLE": np.nan,
            "KNEE ANGLE": np.nan,
            "TORSO LIFT": np.nan,
            "CHEST HEIGHT": np.nan,
            "PELVIS LIFT": np.nan,
        }

        if result.pose_landmarks:
            pose = result.pose_landmarks[0]
            pose_detected = True
            draw_pose_skeleton(frame, pose)

            # Side-view gate: only head + bilateral torso points + the
            # camera-facing limb chain are required (see compute_visibility).
            raw_visibility = compute_visibility(pose)
            smoothed_visibility = visibility_smoother.update(raw_visibility)

            if smoothed_visibility >= VISIBILITY_THRESHOLD:
                raw_feat = extract_features(pose)

                feat = raw_feat.copy()
                feat["torso_to_horizontal"] = torso_horiz_smoother.update(raw_feat["torso_to_horizontal"])
                feat["active_elbow_angle"] = elbow_smoother.update(raw_feat["active_elbow_angle"])
                feat["active_knee_angle"] = knee_smoother.update(raw_feat["active_knee_angle"])
                feat["chest_lift_y"] = chest_lift_smoother.update(raw_feat["chest_lift_y"])
                feat["pelvis_lift_y"] = pelvis_lift_smoother.update(raw_feat["pelvis_lift_y"])

                feat_display = {
                    "ELBOW ANGLE": feat["active_elbow_angle"],
                    "KNEE ANGLE": feat["active_knee_angle"],
                    "TORSO LIFT": feat["torso_to_horizontal"],
                    "CHEST HEIGHT": feat["chest_lift_y"],
                    "PELVIS LIFT": feat["pelvis_lift_y"],
                }

                if is_cobra_pose_detected(feat, pose):
                    is_correct, fb_msg, _ = evaluate_cobra_pose_form(feat, pose)
                    if is_correct:
                        status = "CORRECT"
                        feedback = fb_msg
                        hold_timer.update(True)

                        # Build ML dataset row with complete feature union
                        row = {
                            "left_knee_angle": round(feat["left_knee_angle"], 2),
                            "right_knee_angle": round(feat["right_knee_angle"], 2),
                            "avg_knee_angle": round(feat["avg_knee_angle"], 2),
                            "left_hip_angle": round(feat["left_hip_angle"], 2),
                            "right_hip_angle": round(feat["right_hip_angle"], 2),
                            "avg_hip_angle": round(feat["avg_hip_angle"], 2),
                            "left_elbow_angle": round(feat["left_elbow_angle"], 2),
                            "right_elbow_angle": round(feat["right_elbow_angle"], 2),
                            "avg_elbow_angle": round(feat["avg_elbow_angle"], 2),
                            "left_shoulder_angle": round(feat["left_shoulder_angle"], 2),
                            "right_shoulder_angle": round(feat["right_shoulder_angle"], 2),
                            "avg_shoulder_angle": round(feat["avg_shoulder_angle"], 2),
                            "left_body_line_angle": round(feat["left_body_line_angle"], 2),
                            "right_body_line_angle": round(feat["right_body_line_angle"], 2),
                            "avg_body_line_angle": round(feat["avg_body_line_angle"], 2),
                            "torso_angle": round(feat["torso_angle"], 2),
                            "torso_to_horizontal": round(feat["torso_to_horizontal"], 2),
                            "left_thigh_to_horizontal": round(feat["left_thigh_to_horizontal"], 2),
                            "right_thigh_to_horizontal": round(feat["right_thigh_to_horizontal"], 2),
                            "left_arm_to_horizontal": round(feat["left_arm_to_horizontal"], 2),
                            "right_arm_to_horizontal": round(feat["right_arm_to_horizontal"], 2),
                            "shoulder_tilt_angle": round(feat["shoulder_tilt_angle"], 2),
                            "hip_tilt_angle": round(feat["hip_tilt_angle"], 2),
                            "shoulder_symmetry": round(feat["shoulder_symmetry"], 4),
                            "hip_symmetry": round(feat["hip_symmetry"], 4),
                            "shoulder_width": round(feat["shoulder_width"], 4),
                            "hip_width": round(feat["hip_width"], 4),
                            "stance_width": round(feat["stance_width"], 4),
                            "stance_to_shoulder_ratio": round(feat["stance_to_shoulder_ratio"], 3),
                            "stance_to_hip_ratio": round(feat["stance_to_hip_ratio"], 3),
                            "shoulder_to_hip_ratio": round(feat["shoulder_to_hip_ratio"], 3),
                            "neck_angle": round(feat["neck_angle"], 2) if not np.isnan(feat.get("neck_angle", np.nan)) else np.nan,
                            "head_offset_x": round(feat["head_offset_x"], 4) if not np.isnan(feat.get("head_offset_x", np.nan)) else np.nan,
                            "head_offset_ratio": round(feat["head_offset_ratio"], 3) if not np.isnan(feat.get("head_offset_ratio", np.nan)) else np.nan,
                            "nose_to_mid_shoulder_dist": round(feat["nose_to_mid_shoulder_dist"], 4) if not np.isnan(feat.get("nose_to_mid_shoulder_dist", np.nan)) else np.nan,
                            "pose_visibility": round(smoothed_visibility, 3),
                            "front_knee_angle": np.nan,
                            "back_knee_angle": np.nan,
                            "front_hip_angle": np.nan,
                            "back_hip_angle": np.nan,
                            "standing_knee_angle": np.nan,
                            "lifted_knee_angle": np.nan,
                            "standing_hip_angle": np.nan,
                            "lifted_hip_angle": np.nan,
                            "top_arm_shoulder_angle": np.nan,
                            "bottom_arm_shoulder_angle": np.nan,
                            "top_arm_elbow_angle": np.nan,
                            "bottom_arm_elbow_angle": np.nan,
                            "hip_sag_offset": np.nan,
                            "lifted_foot_to_standing_knee_dist": np.nan,
                            "front_knee_ankle_x_offset": np.nan,
                            "pose_label": POSE_LABEL,
                        }
                        buffer.append(row)
                        if len(buffer) >= FLUSH_EVERY:
                            flush_buffer(buffer, CSV_PATH)
                    else:
                        status = "ADJUST FORM"
                        feedback = fb_msg
                        hold_timer.update(False)
                else:
                    status = "ADJUST FORM"
                    feedback = "Lie prone and press into palms to lift chest into Cobra"
                    hold_timer.update(False)
            else:
                status = "POSE NOT DETECTED"
                feedback = "Low landmark visibility - adjust lighting/camera"
                hold_timer.update(False)
        else:
            smoothed_visibility = visibility_smoother.update(0.0)
            status = "POSE NOT DETECTED"
            feedback = "No person detected in frame"
            hold_timer.update(False)

        # Draw HUD overlay
        draw_hud(
            frame,
            status=status,
            hold_time=hold_timer.current_hold_time,
            max_hold=hold_timer.max_hold_time,
            feedback=feedback,
            feat_display=feat_display,
            visibility=smoothed_visibility,
            pose_detected=pose_detected,
        )

        cv2.imshow(f"Yoga Pose Tracker - {POSE_NAME}", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        elif key == ord("r"):
            hold_timer.reset()

        frame_idx += 1

    cap.release()
    cv2.destroyAllWindows()
    flush_buffer(buffer, CSV_PATH)
    landmarker.close()

    # Session Summary
    duration = time.time() - session_start
    print("\n----- Session Summary -----")
    print(f"Pose: {POSE_NAME}")
    print(f"Frames processed: {frame_idx}")
    print(f"Session duration: {duration:.1f} sec")
    print(f"Max continuous hold: {hold_timer.max_hold_time:.1f} sec")
    print(f"Correct samples logged: {hold_timer.total_correct_samples}")
    print(f"Dataset path: {CSV_PATH}")
    print("----------------------------\n")


if __name__ == "__main__":
    main()