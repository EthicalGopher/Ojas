"""
Warrior II (Virabhadrasana II) Detection & Form Evaluation Module.
Adapted from the cobra_pose.py reference architecture.

Biomechanical Specifications:
- Camera: Frontal / 45° view recommended.
- Target Pose: Warrior II (Virabhadrasana II).
- Landmarks Used:
    NOSE, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW,
    LEFT_WRIST, RIGHT_WRIST, LEFT_HIP, RIGHT_HIP,
    LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE.
- Core Form Conditions:
    * Front knee bend: 90°–145° (deep lunge)
    * Rear knee extension: >= 160° (straight back support leg)
    * Stance width: wide lunge (ankle separation >= 1.25 hip-widths)
    * Front knee tracking: knee stacked stably over ankle
    * Arm alignment: extended parallel to floor in T-shape (elbows >= 150°, within 30° of horizontal)
    * Torso: centered vertical spine (lean <= 18°)
- Hold Timer:
    * Static pose hold timer, increments only on CORRECT form, resets on break.
- Dataset Logging:
    * Contributes correct samples to shared yoga_pose_dataset.csv.
"""

import os
import time
import json
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

DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pose_landmarker_full.task")


def create_landmarker(model_path=None):
    """Initialize MediaPipe Pose Landmarker for video mode."""
    if model_path is None or not os.path.exists(model_path):
        model_path = DEFAULT_MODEL_PATH
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

REQUIRED_LANDMARKS = [
    NOSE,
    LEFT_SHOULDER, RIGHT_SHOULDER,
    LEFT_ELBOW, RIGHT_ELBOW,
    LEFT_WRIST, RIGHT_WRIST,
    LEFT_HIP, RIGHT_HIP,
    LEFT_KNEE, RIGHT_KNEE,
    LEFT_ANKLE, RIGHT_ANKLE,
]

POSE_CONNECTIONS = [
    (conn.start, conn.end) for conn in vision.PoseLandmarksConnections.POSE_LANDMARKS
]


def compute_visibility(pose):
    """Computes minimum visibility across required landmarks."""
    vis = [pose[i].visibility for i in REQUIRED_LANDMARKS if i < len(pose)]
    return float(min(vis)) if vis else 0.0


# =============================================================================
# 3. Video Source & Configuration
# =============================================================================

VIDEO_SOURCE = 0
POSE_NAME = "Warrior II"
POSE_LABEL = "Warrior II"

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "warrior2_config.json")


def load_config():
    defaults = {
        "aspect_default": 1.7778,
        "quality": {"vis_min": 0.60, "vis_min_single": 0.40},
        "stance": {"min_ratio": 1.25, "ankle_level_max": 0.15},
        "front_knee": {"min": 90.0, "max": 145.0},
        "rear_knee_min": 160.0,
        "knee_over_ankle_max": 0.55,
        "elbow_min": 150.0,
        "arm_horizontal_max": 30.0,
        "torso_max_lean": 18.0,
        "head": {"max_offset": 0.50, "min_visibility": 0.40},
        "confirm_frames": 5,
        "break_frames": 3
    }
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                cfg = json.load(f)
                return {**defaults, **cfg}
        except Exception:
            pass
    return defaults


CONFIG = load_config()

FRONT_KNEE_MIN = CONFIG["front_knee"]["min"]
FRONT_KNEE_MAX = CONFIG["front_knee"]["max"]
REAR_KNEE_MIN = CONFIG["rear_knee_min"]
ELBOW_MIN = CONFIG["elbow_min"]
ARM_HORIZONTAL_MAX = CONFIG["arm_horizontal_max"]
TORSO_MAX_LEAN = CONFIG["torso_max_lean"]
STANCE_MIN_RATIO = CONFIG["stance"]["min_ratio"]
KNEE_OVER_ANKLE_MAX = CONFIG["knee_over_ankle_max"]
HEAD_MAX_OFFSET = CONFIG.get("head", {}).get("max_offset", 0.35)
HEAD_MIN_VISIBILITY = CONFIG.get("head", {}).get("min_visibility", 0.40)

SMOOTHING_WINDOW = 6
VISIBILITY_THRESHOLD = 0.50
DRAW_VISIBILITY_THRESHOLD = 0.20

CSV_PATH = "yoga_pose_dataset.csv"
FLUSH_EVERY = 30

CSV_COLUMNS = [
    "left_knee_angle", "right_knee_angle", "avg_knee_angle",
    "left_hip_angle", "right_hip_angle", "avg_hip_angle",
    "left_elbow_angle", "right_elbow_angle", "avg_elbow_angle",
    "left_shoulder_angle", "right_shoulder_angle", "avg_shoulder_angle",
    "left_body_line_angle", "right_body_line_angle", "avg_body_line_angle",
    "torso_angle", "torso_to_horizontal",
    "left_thigh_to_horizontal", "right_thigh_to_horizontal",
    "left_arm_to_horizontal", "right_arm_to_horizontal",
    "shoulder_tilt_angle", "hip_tilt_angle",
    "shoulder_symmetry", "hip_symmetry",
    "shoulder_width", "hip_width", "stance_width",
    "stance_to_shoulder_ratio", "stance_to_hip_ratio", "shoulder_to_hip_ratio",
    "neck_angle", "head_offset_x", "head_offset_ratio", "nose_to_mid_shoulder_dist",
    "pose_visibility",
    "front_knee_angle", "back_knee_angle", "front_hip_angle", "back_hip_angle",
    "standing_knee_angle", "lifted_knee_angle", "standing_hip_angle", "lifted_hip_angle",
    "top_arm_shoulder_angle", "bottom_arm_shoulder_angle",
    "top_arm_elbow_angle", "bottom_arm_elbow_angle",
    "hip_sag_offset", "lifted_foot_to_standing_knee_dist",
    "front_knee_ankle_x_offset", "pose_label"
]


# =============================================================================
# 4. Geometry Helpers
# =============================================================================

def _xy(lm):
    return np.array([lm.x, lm.y])


def _midpoint(a, b):
    return (_xy(a) + _xy(b)) / 2.0


def calculate_angle(a, b, c):
    a, b, c = _xy(a), _xy(b), _xy(c)
    ba = a - b
    bc = c - b
    radians = np.arctan2(bc[1], bc[0]) - np.arctan2(ba[1], ba[0])
    angle = np.abs(radians * 180.0 / np.pi)
    if angle > 180.0:
        angle = 360.0 - angle
    return float(angle)


def calculate_distance(a, b):
    return float(np.linalg.norm(_xy(a) - _xy(b)))


def vertical_angle_of_vector(vec):
    vertical_vec = np.array([0.0, -1.0])
    denom = np.linalg.norm(vec) * np.linalg.norm(vertical_vec)
    if denom < 1e-8:
        return 0.0
    cos_angle = np.clip(np.dot(vec, vertical_vec) / denom, -1.0, 1.0)
    return float(np.degrees(np.arccos(cos_angle)))


def horizontal_angle_of_vector(vec):
    horizontal_vec = np.array([1.0, 0.0])
    denom = np.linalg.norm(vec) * np.linalg.norm(horizontal_vec)
    if denom < 1e-8:
        return 0.0
    cos_angle = np.clip(np.dot(vec, horizontal_vec) / denom, -1.0, 1.0)
    angle = float(np.degrees(np.arccos(cos_angle)))
    if angle > 90.0:
        angle = 180.0 - angle
    return angle


def safe_div(num, den):
    if den is None or np.isnan(den) or abs(den) < 1e-8:
        return np.nan
    return float(num / den)


# =============================================================================
# 5. Feature Extraction
# =============================================================================

def extract_features(pose):
    features = {}

    left_knee = calculate_angle(pose[LEFT_HIP], pose[LEFT_KNEE], pose[LEFT_ANKLE])
    right_knee = calculate_angle(pose[RIGHT_HIP], pose[RIGHT_KNEE], pose[RIGHT_ANKLE])
    features["left_knee_angle"] = left_knee
    features["right_knee_angle"] = right_knee
    features["avg_knee_angle"] = (left_knee + right_knee) / 2.0

    left_hip = calculate_angle(pose[LEFT_SHOULDER], pose[LEFT_HIP], pose[LEFT_KNEE])
    right_hip = calculate_angle(pose[RIGHT_SHOULDER], pose[RIGHT_HIP], pose[RIGHT_KNEE])
    features["left_hip_angle"] = left_hip
    features["right_hip_angle"] = right_hip
    features["avg_hip_angle"] = (left_hip + right_hip) / 2.0

    left_elbow = calculate_angle(pose[LEFT_SHOULDER], pose[LEFT_ELBOW], pose[LEFT_WRIST])
    right_elbow = calculate_angle(pose[RIGHT_SHOULDER], pose[RIGHT_ELBOW], pose[RIGHT_WRIST])
    features["left_elbow_angle"] = left_elbow
    features["right_elbow_angle"] = right_elbow
    features["avg_elbow_angle"] = (left_elbow + right_elbow) / 2.0

    left_shoulder_ang = calculate_angle(pose[LEFT_ELBOW], pose[LEFT_SHOULDER], pose[LEFT_HIP])
    right_shoulder_ang = calculate_angle(pose[RIGHT_ELBOW], pose[RIGHT_SHOULDER], pose[RIGHT_HIP])
    features["left_shoulder_angle"] = left_shoulder_ang
    features["right_shoulder_angle"] = right_shoulder_ang
    features["avg_shoulder_angle"] = (left_shoulder_ang + right_shoulder_ang) / 2.0

    left_body_line = calculate_angle(pose[LEFT_SHOULDER], pose[LEFT_HIP], pose[LEFT_ANKLE])
    right_body_line = calculate_angle(pose[RIGHT_SHOULDER], pose[RIGHT_HIP], pose[RIGHT_ANKLE])
    features["left_body_line_angle"] = left_body_line
    features["right_body_line_angle"] = right_body_line
    features["avg_body_line_angle"] = (left_body_line + right_body_line) / 2.0

    mid_shoulder = _midpoint(pose[LEFT_SHOULDER], pose[RIGHT_SHOULDER])
    mid_hip = _midpoint(pose[LEFT_HIP], pose[RIGHT_HIP])
    torso_vec = mid_shoulder - mid_hip
    features["torso_angle"] = vertical_angle_of_vector(torso_vec)
    features["torso_to_horizontal"] = horizontal_angle_of_vector(torso_vec)

    features["left_thigh_to_horizontal"] = horizontal_angle_of_vector(_xy(pose[LEFT_KNEE]) - _xy(pose[LEFT_HIP]))
    features["right_thigh_to_horizontal"] = horizontal_angle_of_vector(_xy(pose[RIGHT_KNEE]) - _xy(pose[RIGHT_HIP]))
    features["left_arm_to_horizontal"] = horizontal_angle_of_vector(_xy(pose[LEFT_WRIST]) - _xy(pose[LEFT_SHOULDER]))
    features["right_arm_to_horizontal"] = horizontal_angle_of_vector(_xy(pose[RIGHT_WRIST]) - _xy(pose[RIGHT_SHOULDER]))

    features["shoulder_symmetry"] = float(abs(pose[LEFT_SHOULDER].y - pose[RIGHT_SHOULDER].y))
    features["hip_symmetry"] = float(abs(pose[LEFT_HIP].y - pose[RIGHT_HIP].y))
    features["shoulder_tilt_angle"] = horizontal_angle_of_vector(_xy(pose[RIGHT_SHOULDER]) - _xy(pose[LEFT_SHOULDER]))
    features["hip_tilt_angle"] = horizontal_angle_of_vector(_xy(pose[RIGHT_HIP]) - _xy(pose[LEFT_HIP]))

    shoulder_w = calculate_distance(pose[LEFT_SHOULDER], pose[RIGHT_SHOULDER])
    hip_w = calculate_distance(pose[LEFT_HIP], pose[RIGHT_HIP])
    stance_w = calculate_distance(pose[LEFT_ANKLE], pose[RIGHT_ANKLE])
    torso_len = max(1e-4, float(np.linalg.norm(torso_vec)))

    features["shoulder_width"] = shoulder_w
    features["hip_width"] = hip_w
    features["stance_width"] = stance_w
    features["stance_to_shoulder_ratio"] = safe_div(stance_w, shoulder_w)
    features["stance_to_hip_ratio"] = safe_div(stance_w, hip_w)
    features["shoulder_to_hip_ratio"] = safe_div(shoulder_w, hip_w)

    nose_xy = _xy(pose[NOSE])
    features["neck_angle"] = vertical_angle_of_vector(nose_xy - mid_shoulder)
    aspect = CONFIG.get("aspect_default", 1.7778)
    head_off_x = float((nose_xy[0] - mid_shoulder[0]) * aspect)
    torso_len_corrected = max(1e-4, float(np.linalg.norm(np.array([torso_vec[0] * aspect, torso_vec[1]]))))
    features["head_offset_x"] = head_off_x
    features["head_offset_ratio"] = safe_div(head_off_x, torso_len_corrected)
    features["nose_to_mid_shoulder_dist"] = float(np.linalg.norm(nose_xy - mid_shoulder))

    # Front vs Back leg assignment
    if left_knee < right_knee:
        front_side = "left"
        features["front_knee_angle"] = left_knee
        features["back_knee_angle"] = right_knee
        features["front_hip_angle"] = left_hip
        features["back_hip_angle"] = right_hip
        features["front_knee_ankle_x_offset"] = float(abs(pose[LEFT_KNEE].x - pose[LEFT_ANKLE].x) / torso_len)
    else:
        front_side = "right"
        features["front_knee_angle"] = right_knee
        features["back_knee_angle"] = left_knee
        features["front_hip_angle"] = right_hip
        features["back_hip_angle"] = left_hip
        features["front_knee_ankle_x_offset"] = float(abs(pose[RIGHT_KNEE].x - pose[RIGHT_ANKLE].x) / torso_len)

    features["front_side"] = front_side
    features["ankle_level_diff"] = float(abs(pose[LEFT_ANKLE].y - pose[RIGHT_ANKLE].y) / torso_len)
    return features


# =============================================================================
# 6. Skeleton Drawing
# =============================================================================

def draw_pose_skeleton(frame, pose):
    h, w = frame.shape[:2]

    def point_px(lm):
        return int(lm.x * w), int(lm.y * h)

    def color_for(visibility):
        return (0, 255, 0) if visibility >= VISIBILITY_THRESHOLD else (0, 165, 255)

    for start_idx, end_idx in POSE_CONNECTIONS:
        if start_idx < len(pose) and end_idx < len(pose):
            start_lm = pose[start_idx]
            end_lm = pose[end_idx]
            if start_lm.visibility < DRAW_VISIBILITY_THRESHOLD or end_lm.visibility < DRAW_VISIBILITY_THRESHOLD:
                continue
            edge_color = color_for(min(start_lm.visibility, end_lm.visibility))
            cv2.line(frame, point_px(start_lm), point_px(end_lm), edge_color, 2)

    for lm in pose:
        if lm.visibility >= DRAW_VISIBILITY_THRESHOLD:
            cv2.circle(frame, point_px(lm), 4, color_for(lm.visibility), -1)


# =============================================================================
# 7. Smoothing Filter
# =============================================================================

class MovingAverage:
    def __init__(self, window_size):
        self.values = deque(maxlen=window_size)

    def update(self, value):
        if value is None or np.isnan(value):
            return None
        self.values.append(value)
        return sum(self.values) / len(self.values)


# =============================================================================
# 8. Detection & Form Validation
# =============================================================================

def is_warrior_2_detected(feat, pose):
    """Detects wide lunge with one bent knee and extended arms."""
    if feat["stance_to_hip_ratio"] < 1.10 and feat["stance_width"] < 0.22:
        return False
    if abs(feat["left_knee_angle"] - feat["right_knee_angle"]) < 15.0:
        return False
    if feat["front_knee_angle"] > 148.0 or feat["back_knee_angle"] < 145.0:
        return False
    if feat["torso_angle"] > 25.0:
        return False
    return True


def evaluate_warrior_2_form(feat, pose):
    issues = []

    # 1. Stance
    if feat["stance_to_hip_ratio"] < STANCE_MIN_RATIO:
        issues.append(f"Widen your stance ({feat['stance_to_hip_ratio']:.2f} < {STANCE_MIN_RATIO})")
    if feat["ankle_level_diff"] > CONFIG["stance"]["ankle_level_max"]:
        issues.append("Keep both feet grounded level")

    # 2. Front knee
    f_knee = feat["front_knee_angle"]
    if f_knee > FRONT_KNEE_MAX:
        issues.append(f"Bend front knee deeper ({f_knee:.1f}° > {FRONT_KNEE_MAX}°)")
    elif f_knee < FRONT_KNEE_MIN:
        issues.append(f"Front knee bent too deep ({f_knee:.1f}° < {FRONT_KNEE_MIN}°)")

    # 3. Rear knee
    b_knee = feat["back_knee_angle"]
    if b_knee < REAR_KNEE_MIN:
        issues.append(f"Straighten back leg fully ({b_knee:.1f}° < {REAR_KNEE_MIN}°)")

    # 4. Arms horizontal
    l_arm = feat["left_arm_to_horizontal"]
    r_arm = feat["right_arm_to_horizontal"]
    max_arm = max(l_arm, r_arm)
    if max_arm > ARM_HORIZONTAL_MAX:
        issues.append(f"Extend arms horizontal in T-shape ({max_arm:.1f}°)")

    # 5. Elbows
    min_elbow = min(feat["left_elbow_angle"], feat["right_elbow_angle"])
    if min_elbow < ELBOW_MIN:
        issues.append(f"Straighten both elbows ({min_elbow:.1f}° < {ELBOW_MIN}°)")

    # 6. Torso
    if feat["torso_angle"] > TORSO_MAX_LEAN:
        issues.append(f"Keep torso upright ({feat['torso_angle']:.1f}° > {TORSO_MAX_LEAN}°)")

    # 7. Head alignment (nose relative to shoulder midpoint)
    head_vis = pose[NOSE].visibility if hasattr(pose[NOSE], 'visibility') else 1.0
    if head_vis >= HEAD_MIN_VISIBILITY:
        if abs(feat.get("head_offset_ratio", 0.0)) > HEAD_MAX_OFFSET:
            issues.append(f"Keep head upright (offset {abs(feat['head_offset_ratio']):.2f} > {HEAD_MAX_OFFSET})")

    # 8. Knee tracking over ankle
    if feat.get("front_knee_ankle_x_offset", 0.0) > KNEE_OVER_ANKLE_MAX:
        issues.append("Stack front knee directly over ankle")

    if not issues:
        return True, "Good Form! Hold Warrior II!", []
    return False, issues[0], issues


# =============================================================================
# 9. Hold Timer
# =============================================================================

class PoseHoldTimer:
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
    if not rows:
        return
    df = pd.DataFrame(rows, columns=CSV_COLUMNS)
    write_header = not os.path.exists(path) or os.path.getsize(path) == 0
    df.to_csv(path, mode="a", header=write_header, index=False)
    rows.clear()


# =============================================================================
# 11. HUD Rendering (Translucent Card Overlay matching cobra_pose.py)
# =============================================================================

STATUS_COLORS = {
    "CORRECT": (0, 255, 0),
    "ADJUST FORM": (0, 215, 255),
    "POSE NOT DETECTED": (0, 0, 255),
}


def draw_hud(frame, status, hold_time, max_hold, feedback, feat_display, visibility, pose_detected):
    overlay = frame.copy()
    cv2.rectangle(overlay, (15, 15), (460, 310), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    cv2.putText(frame, f"POSE: {POSE_NAME.upper()}", (28, 44),
                cv2.FONT_HERSHEY_SIMPLEX, 0.72, (255, 255, 255), 2, cv2.LINE_AA)

    status_color = STATUS_COLORS.get(status, (255, 255, 255))
    cv2.putText(frame, f"STATUS: {status}", (28, 74),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, status_color, 2, cv2.LINE_AA)

    timer_color = (0, 255, 0) if status == "CORRECT" else (200, 200, 200)
    cv2.putText(frame, f"HOLD TIME: {hold_time:.1f}s   (MAX: {max_hold:.1f}s)", (28, 106),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, timer_color, 2, cv2.LINE_AA)

    fb_color = (0, 255, 0) if status == "CORRECT" else (0, 215, 255) if status == "ADJUST FORM" else (160, 160, 160)
    cv2.putText(frame, f"FEEDBACK: {feedback}", (28, 138),
                cv2.FONT_HERSHEY_SIMPLEX, 0.50, fb_color, 1, cv2.LINE_AA)

    y_pos = 168
    for label, val in feat_display.items():
        if isinstance(val, (int, float)) and not np.isnan(val):
            val_str = f"{val:.1f}°" if "KNEE" in label or "TORSO" in label or "ARMS" in label else f"{val:.2f}"
        else:
            val_str = "--"
        cv2.putText(frame, f"{label}: {val_str}", (28, y_pos),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.52, (240, 240, 240), 1, cv2.LINE_AA)
        y_pos += 24

    vis_str = f"VISIBILITY: {visibility:.2f}" if visibility is not None else "VISIBILITY: --"
    vis_col = (240, 240, 240) if visibility and visibility >= VISIBILITY_THRESHOLD else (0, 165, 255)
    cv2.putText(frame, vis_str, (28, y_pos),
                cv2.FONT_HERSHEY_SIMPLEX, 0.52, vis_col, 1, cv2.LINE_AA)

    if not pose_detected:
        cv2.putText(frame, "No person detected", (20, 335),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.70, (0, 0, 255), 2, cv2.LINE_AA)

    cv2.putText(frame, "[q]=quit   [r]=reset timer", (20, 360),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1, cv2.LINE_AA)


# =============================================================================
# 12. Main Execution Loop
# =============================================================================

def main():
    landmarker = create_landmarker()
    cap = cv2.VideoCapture(VIDEO_SOURCE)

    frame_idx = 0
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    front_knee_smoother = MovingAverage(SMOOTHING_WINDOW)
    back_knee_smoother = MovingAverage(SMOOTHING_WINDOW)
    torso_smoother = MovingAverage(SMOOTHING_WINDOW)
    elbow_smoother = MovingAverage(SMOOTHING_WINDOW)
    visibility_smoother = MovingAverage(SMOOTHING_WINDOW)

    hold_timer = PoseHoldTimer()
    session_start = time.time()

    print(f"Automatic {POSE_NAME} hold detection running. Press [q] to quit.")

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
            "FRONT KNEE": np.nan,
            "BACK KNEE": np.nan,
            "T-ARMS (ELBOW)": np.nan,
            "TORSO ANGLE": np.nan,
            "HEAD OFFSET": np.nan,
        }

        if result.pose_landmarks:
            pose = result.pose_landmarks[0]
            pose_detected = True
            draw_pose_skeleton(frame, pose)

            raw_visibility = compute_visibility(pose)
            smoothed_visibility = visibility_smoother.update(raw_visibility)

            if smoothed_visibility >= VISIBILITY_THRESHOLD:
                feat = extract_features(pose)
                feat["front_knee_angle"] = front_knee_smoother.update(feat["front_knee_angle"])
                feat["back_knee_angle"] = back_knee_smoother.update(feat["back_knee_angle"])
                feat["torso_angle"] = torso_smoother.update(feat["torso_angle"])
                feat["avg_elbow_angle"] = elbow_smoother.update(feat["avg_elbow_angle"])

                feat_display = {
                    "FRONT KNEE": feat["front_knee_angle"],
                    "BACK KNEE": feat["back_knee_angle"],
                    "T-ARMS (ELBOW)": feat["avg_elbow_angle"],
                    "TORSO ANGLE": feat["torso_angle"],
                    "HEAD OFFSET": feat.get("head_offset_ratio", 0.0),
                }

                if is_warrior_2_detected(feat, pose):
                    is_correct, fb_msg, _ = evaluate_warrior_2_form(feat, pose)
                    if is_correct:
                        status = "CORRECT"
                        feedback = fb_msg
                        hold_timer.update(True)

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
                            "neck_angle": round(feat["neck_angle"], 2),
                            "head_offset_x": round(feat["head_offset_x"], 4),
                            "head_offset_ratio": round(feat["head_offset_ratio"], 3),
                            "nose_to_mid_shoulder_dist": round(feat["nose_to_mid_shoulder_dist"], 4),
                            "pose_visibility": round(smoothed_visibility, 3),
                            "front_knee_angle": round(feat["front_knee_angle"], 2),
                            "back_knee_angle": round(feat["back_knee_angle"], 2),
                            "front_hip_angle": round(feat["front_hip_angle"], 2),
                            "back_hip_angle": round(feat["back_hip_angle"], 2),
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
                            "front_knee_ankle_x_offset": round(feat["front_knee_ankle_x_offset"], 4),
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
                    feedback = "Lunge with arms extended in T-shape (Warrior II)"
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

    duration = time.time() - session_start
    print("\n----- Session Summary -----")
    print(f"Pose: {POSE_NAME}")
    print(f"Frames processed: {frame_idx}")
    print(f"Session duration: {duration:.1f} sec")
    print(f"Max continuous hold: {hold_timer.max_hold_time:.1f} sec")
    print(f"Correct samples logged: {hold_timer.total_correct_samples}")
    print("----------------------------\n")


if __name__ == "__main__":
    main()
