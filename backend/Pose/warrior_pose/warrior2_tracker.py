"""
AI Warrior II (Virabhadrasana II) Tracker & Form Validator
===========================================================
Hybrid Engine: MediaPipe 3D Pose Biomechanics + Vision Classifier Form Cross-Check.

Warrior II (Virabhadrasana II) Rules & Biomechanics:
1. Stance: Wide lunge stance (ankle separation >= 1.25 hip-widths) with grounded feet.
2. Front Leg: Bent into deep lunge (90°–145°) with knee stacked stably over ankle.
3. Rear Leg: Fully extended and straight (knee angle >= 160°).
4. Arms: Horizontal T-shape parallel to the mat (elbows >= 150°, within 30° of horizontal).
5. Torso & Spine: Centered and upright (vertical lean <= 18°).
6. Head Alignment: Nose centered over shoulder midpoint (ratio <= 0.50), normalized by torso length.
7. Hold Timer: Real-time hold duration tracking with best streak recorder.

Features:
- Real-time Biomechanical Pose Quality Analysis & Audio-Visual Form Guidance
- Neural Vision Form Cross-Checker on GPU/CPU (Correct Pose vs Flawed Posture)
- Clean Minimalist Floating Glass HUD with Hold Timer & Streak Tracker
"""

import os
import sys
import time
import math
import json
import argparse
import threading
from collections import deque
import urllib.request
import numpy as np
import cv2

# MediaPipe Pose Landmarker
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# PyTorch
import torch
import torch.nn as nn
from torchvision import transforms, models
from PIL import Image

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task"
POSE_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pose_landmarker_full.task")
NEURAL_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trained_warrior2_model.pth")
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "warrior2_config.json")


def load_config():
    """Loads shared configuration from warrior2_config.json."""
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
        "ema_alpha": 0.35,
        "confirm_frames": 5,
        "break_frames": 3
    }
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                cfg = json.load(f)
                return {**defaults, **cfg}
        except Exception as e:
            print(f"[WARNING] Could not load {CONFIG_PATH}: {e}")
    return defaults


CONFIG = load_config()

HEAD_MAX_OFFSET = CONFIG.get("head", {}).get("max_offset", 0.35)
HEAD_MIN_VISIBILITY = CONFIG.get("head", {}).get("min_visibility", 0.40)


def ensure_pose_model():
    """Ensures MediaPipe Pose asset is downloaded locally."""
    if not os.path.exists(POSE_MODEL_PATH):
        print(f"[INFO] Downloading MediaPipe Pose asset to {POSE_MODEL_PATH}...")
        try:
            urllib.request.urlretrieve(POSE_MODEL_URL, POSE_MODEL_PATH)
            print("[INFO] Model asset successfully downloaded.")
        except Exception as e:
            print(f"[ERROR] Could not download pose model: {e}")
            sys.exit(1)


def calculate_3d_angle(a, b, c):
    """Calculates true 3D angle between 3 points in degrees [0, 180]."""
    ba = np.array([a.x - b.x, a.y - b.y, getattr(a, 'z', 0) - getattr(b, 'z', 0)], dtype=np.float32)
    bc = np.array([c.x - b.x, c.y - b.y, getattr(c, 'z', 0) - getattr(b, 'z', 0)], dtype=np.float32)
    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)
    if norm_ba < 1e-6 or norm_bc < 1e-6:
        return 180.0
    cosine = np.clip(np.dot(ba, bc) / (norm_ba * norm_bc), -1.0, 1.0)
    return float(np.degrees(np.arccos(cosine)))


def calculate_2d_angle(a, b, c):
    """Calculates planar 2D angle between 3 points in degrees [0, 180]."""
    ba = np.array([a.x - b.x, a.y - b.y], dtype=np.float32)
    bc = np.array([c.x - b.x, c.y - b.y], dtype=np.float32)
    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)
    if norm_ba < 1e-6 or norm_bc < 1e-6:
        return 180.0
    cosine = np.clip(np.dot(ba, bc) / (norm_ba * norm_bc), -1.0, 1.0)
    return float(np.degrees(np.arccos(cosine)))


class NeuralPoseCrossChecker:
    """Neural image classifier to cross-check Correct Pose vs Wrong Pose on GPU/CPU."""
    def __init__(self):
        self.device = DEVICE
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])

        self.model = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
        in_features = self.model.fc.in_features
        self.model.fc = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(in_features, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, 2)
        )

        self.classes = ["correct_pose", "wrong_pose"]
        self.loaded_custom_weights = False

        if os.path.exists(NEURAL_MODEL_PATH):
            try:
                ckpt = torch.load(NEURAL_MODEL_PATH, map_location=self.device, weights_only=False)
                self.model.load_state_dict(ckpt["model_state_dict"])
                self.classes = ckpt.get("classes", self.classes)
                self.loaded_custom_weights = True
                print(f"[INFO] Loaded trained Warrior II Neural Classifier from '{NEURAL_MODEL_PATH}'")
            except Exception as e:
                print(f"[WARNING] Could not load trained neural weights: {e}")

        self.model = self.model.to(self.device)
        self.model.eval()

        self.probabilities = {
            "CORRECT_POSE": 0.85,
            "WRONG_POSE": 0.15,
            "is_custom_trained": self.loaded_custom_weights,
            "has_inferred": False
        }
        self.is_busy = False

    def predict_async(self, frame_bgr, callback=None):
        if self.is_busy:
            return

        def _infer():
            self.is_busy = True
            try:
                rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                pil_img = Image.fromarray(rgb)
                tensor = self.transform(pil_img).unsqueeze(0).to(self.device)
                with torch.no_grad():
                    logits = self.model(tensor)
                    probs = torch.softmax(logits, dim=1)[0].cpu().numpy()

                correct_idx = 0 if "correct" in self.classes[0].lower() else 1
                wrong_idx = 1 - correct_idx

                self.probabilities = {
                    "CORRECT_POSE": float(probs[correct_idx]),
                    "WRONG_POSE": float(probs[wrong_idx]),
                    "is_custom_trained": self.loaded_custom_weights,
                    "has_inferred": True
                }
                if callback:
                    callback(self.probabilities)
            except Exception:
                pass
            finally:
                self.is_busy = False

        threading.Thread(target=_infer, daemon=True).start()


class MediaPipeWarrior2Engine:
    """
    MediaPipe 3D Pose Biomechanical Engine for Warrior II (Virabhadrasana II):
    - Detects front bent leg vs rear straight leg
    - Evaluates stance width, front knee angle & tracking, rear knee extension,
      horizontal T-arms, and upright torso
    - Real-time Hold Duration & Stability Streak Tracker
    """
    def __init__(self):
        ensure_pose_model()
        base_options = python.BaseOptions(model_asset_path=POSE_MODEL_PATH)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5
        )
        self.detector = vision.PoseLandmarker.create_from_options(options)

        # Pose & Stance State
        self.active_stance = "NONE"       # "LEFT FRONT" or "RIGHT FRONT"
        self.in_warrior2 = False
        self.pose_quality_pct = 0.0
        self.stability_score = 85.0
        self.form_status = "READY"
        self.form_color = (0, 240, 255)
        self.feedback = "Step into wide lunge & extend arms in T-shape"
        self.feedback_color = (255, 255, 255)

        # Hold Timers
        self.hold_start_time = None
        self.current_hold_seconds = 0.0
        self.best_hold_seconds = 0.0
        self.total_hold_time = 0.0

        # Temporal confirmation streaks
        self.correct_streak = 0
        self.failed_streak = 0

        # Smoothing buffers (EMA)
        alpha = CONFIG.get("ema_alpha", 0.35)
        self.alpha = alpha
        self.smoothed_left_knee = 180.0
        self.smoothed_right_knee = 180.0
        self.smoothed_left_elbow = 180.0
        self.smoothed_right_elbow = 180.0
        self.smoothed_left_arm_horiz = 0.0
        self.smoothed_right_arm_horiz = 0.0
        self.smoothed_torso = 0.0
        self.smoothed_head_offset = 0.0

        self.ankle_history = deque(maxlen=30)

    def analyze_pose(self, lms_img, lms_world, h, w):
        alpha = self.alpha

        # 1. Knee Angles (Fused 2D + 3D)
        l_knee_2d = calculate_2d_angle(lms_img[23], lms_img[25], lms_img[27])
        r_knee_2d = calculate_2d_angle(lms_img[24], lms_img[26], lms_img[28])
        l_knee_3d = calculate_3d_angle(lms_world[23], lms_world[25], lms_world[27])
        r_knee_3d = calculate_3d_angle(lms_world[24], lms_world[26], lms_world[28])

        l_knee = max(l_knee_2d, l_knee_3d * 0.90)
        r_knee = max(r_knee_2d, r_knee_3d * 0.90)

        self.smoothed_left_knee = (1 - alpha) * self.smoothed_left_knee + alpha * l_knee
        self.smoothed_right_knee = (1 - alpha) * self.smoothed_right_knee + alpha * r_knee

        # 2. Elbow Angles
        l_elbow = calculate_2d_angle(lms_img[11], lms_img[13], lms_img[15])
        r_elbow = calculate_2d_angle(lms_img[12], lms_img[14], lms_img[16])
        self.smoothed_left_elbow = (1 - alpha) * self.smoothed_left_elbow + alpha * l_elbow
        self.smoothed_right_elbow = (1 - alpha) * self.smoothed_right_elbow + alpha * r_elbow

        # 3. Body Scale References
        aspect = w / max(1, h)
        hip_w = math.hypot((lms_img[23].x - lms_img[24].x) * aspect, lms_img[23].y - lms_img[24].y)
        shoulder_w = math.hypot((lms_img[11].x - lms_img[12].x) * aspect, lms_img[11].y - lms_img[12].y)
        mid_shoulder_x = (lms_img[11].x + lms_img[12].x) / 2.0
        mid_shoulder_y = (lms_img[11].y + lms_img[12].y) / 2.0
        mid_hip_x = (lms_img[23].x + lms_img[24].x) / 2.0
        mid_hip_y = (lms_img[23].y + lms_img[24].y) / 2.0

        torso_len = max(1e-4, math.hypot((mid_shoulder_x - mid_hip_x) * aspect, mid_shoulder_y - mid_hip_y))
        scale = max(1e-4, max(torso_len, 0.5 * max(shoulder_w, hip_w)))

        # 4. Stance Width & Foot Levels
        l_ankle = lms_img[27]
        r_ankle = lms_img[28]
        stance_width = abs(l_ankle.x - r_ankle.x) * aspect
        stance_ratio = stance_width / max(1e-4, hip_w)
        ankle_level_diff = abs(l_ankle.y - r_ankle.y) / torso_len

        # 5. Arm Horizontal Alignment (degrees from horizontal vector [1, 0])
        def _calc_arm_horiz(shoulder, wrist):
            dx = abs(wrist.x - shoulder.x)
            dy = abs(wrist.y - shoulder.y)
            return math.degrees(math.atan2(dy, max(1e-5, dx)))

        l_arm_horiz = _calc_arm_horiz(lms_img[11], lms_img[15])
        r_arm_horiz = _calc_arm_horiz(lms_img[12], lms_img[16])
        self.smoothed_left_arm_horiz = (1 - alpha) * self.smoothed_left_arm_horiz + alpha * l_arm_horiz
        self.smoothed_right_arm_horiz = (1 - alpha) * self.smoothed_right_arm_horiz + alpha * r_arm_horiz
        wrist_span = abs(lms_img[15].x - lms_img[16].x) * aspect / scale

        # 6. Torso Vertical Lean (degrees from vertical)
        w_mid_shoulder_x = (lms_world[11].x + lms_world[12].x) / 2.0
        w_mid_shoulder_y = (lms_world[11].y + lms_world[12].y) / 2.0
        w_mid_hip_x = (lms_world[23].x + lms_world[24].x) / 2.0
        w_mid_hip_y = (lms_world[23].y + lms_world[24].y) / 2.0

        torso_lean = math.degrees(math.atan2(
            abs(w_mid_shoulder_x - w_mid_hip_x),
            max(1e-5, abs(w_mid_hip_y - w_mid_shoulder_y))
        ))
        self.smoothed_torso = (1 - alpha) * self.smoothed_torso + alpha * torso_lean

        # 6b. Head Alignment (nose relative to shoulder midpoint, ASPECT-normalized by shoulder width)
        nose_lm = lms_img[0]
        head_offset_x = (nose_lm.x - mid_shoulder_x) * aspect
        head_offset_ratio = abs(head_offset_x) / torso_len
        head_visibility = nose_lm.visibility if hasattr(nose_lm, 'visibility') else 1.0
        self.smoothed_head_offset = (1 - alpha) * self.smoothed_head_offset + alpha * head_offset_ratio

        # 7. Identify Front vs Rear Leg
        front_side = None
        rear_side = None
        front_knee = 180.0
        rear_knee = 180.0
        knee_over_ankle_offset = 0.0

        knee_diff = abs(self.smoothed_left_knee - self.smoothed_right_knee)
        if knee_diff >= 15.0 or self.smoothed_left_knee <= 150.0 or self.smoothed_right_knee <= 150.0:
            if self.smoothed_left_knee < self.smoothed_right_knee:
                front_side = "LEFT"
                rear_side = "RIGHT"
                front_knee = self.smoothed_left_knee
                rear_knee = self.smoothed_right_knee
                knee_over_ankle_offset = abs(lms_img[25].x - lms_img[27].x) * aspect / torso_len
            else:
                front_side = "RIGHT"
                rear_side = "LEFT"
                front_knee = self.smoothed_right_knee
                rear_knee = self.smoothed_left_knee
                knee_over_ankle_offset = abs(lms_img[26].x - lms_img[28].x) * aspect / torso_len

        self.active_stance = f"{front_side} FRONT" if front_side else "NONE"

        # Stability Jitter
        self.ankle_history.append((l_ankle.x + r_ankle.x, l_ankle.y + r_ankle.y))
        if len(self.ankle_history) > 10:
            coords = np.array(self.ankle_history)
            jitter = float(np.std(coords, axis=0).mean())
            self.stability_score = float(np.clip(100.0 - (jitter * 3500.0), 0.0, 100.0))
        else:
            self.stability_score = 85.0

        is_sitting = (self.smoothed_left_knee < 110.0 and self.smoothed_right_knee < 110.0 and stance_ratio < 1.10)
        is_warrior_stance = (front_side is not None and stance_ratio >= 1.0)

        # Head Alignment: skip check if nose visibility is too low (avoid false negatives)
        if head_visibility >= HEAD_MIN_VISIBILITY:
            head_alignment_ok = self.smoothed_head_offset <= HEAD_MAX_OFFSET
        else:
            head_alignment_ok = True  # Cannot evaluate — defer to overall quality gate

        return {
            "front_side": front_side,
            "rear_side": rear_side,
            "is_warrior_stance": is_warrior_stance,
            "is_sitting": is_sitting,
            "stance_ratio": stance_ratio,
            "ankle_level_diff": ankle_level_diff,
            "front_knee_angle": front_knee,
            "rear_knee_angle": rear_knee,
            "knee_over_ankle_offset": knee_over_ankle_offset,
            "left_elbow": self.smoothed_left_elbow,
            "right_elbow": self.smoothed_right_elbow,
            "left_arm_horiz": self.smoothed_left_arm_horiz,
            "right_arm_horiz": self.smoothed_right_arm_horiz,
            "wrist_span": wrist_span,
            "torso_lean": self.smoothed_torso,
            "head_offset_ratio": self.smoothed_head_offset,
            "head_visibility": head_visibility,
            "head_alignment_ok": head_alignment_ok
        }

    def update_warrior2_state(self, features, neural_probs=None):
        is_sitting = features["is_sitting"]
        is_stance = features["is_warrior_stance"]

        # 1. Sitting / Inactive Check
        if is_sitting:
            self.in_warrior2 = False
            self.hold_start_time = None
            self.current_hold_seconds = 0.0
            self.correct_streak = 0
            self.form_status = "RESTING / SITTING"
            self.form_color = (0, 140, 255)
            self.feedback = "Sitting Detected -> Stand Up & Begin Warrior II"
            self.feedback_color = (0, 180, 255)
            return

        # 2. Form Issue Diagnostics
        form_issues = []
        is_neural_verifying = False

        if is_stance:
            # Stance width check
            if features["stance_ratio"] < CONFIG["stance"]["min_ratio"]:
                form_issues.append("WIDEN YOUR STANCE")
            elif features["ankle_level_diff"] > CONFIG["stance"]["ankle_level_max"]:
                form_issues.append("KEEP BOTH FEET GROUNDED")

            # Front knee depth
            if features["front_knee_angle"] > CONFIG["front_knee"]["max"]:
                form_issues.append(f"BEND FRONT KNEE TO 90° ({features['front_knee_angle']:.0f}°)")
            elif features["front_knee_angle"] < CONFIG["front_knee"]["min"]:
                form_issues.append("FRONT KNEE BENT TOO DEEP")

            # Front knee tracking over ankle
            if features["knee_over_ankle_offset"] > CONFIG["knee_over_ankle_max"]:
                form_issues.append("STACK FRONT KNEE OVER ANKLE")

            # Rear leg extension
            if features["rear_knee_angle"] < CONFIG["rear_knee_min"]:
                form_issues.append(f"STRAIGHTEN REAR LEG ({features['rear_knee_angle']:.0f}°)")

            # Arms horizontal & elbows straight
            min_elbow = min(features["left_elbow"], features["right_elbow"])
            if min_elbow < CONFIG["elbow_min"]:
                form_issues.append("STRAIGHTEN BOTH ELBOWS")

            max_arm_horiz = max(features["left_arm_horiz"], features["right_arm_horiz"])
            if max_arm_horiz > CONFIG["arm_horizontal_max"]:
                form_issues.append("EXTEND ARMS HORIZONTAL (T-SHAPE)")

            # Torso upright
            if features["torso_lean"] > CONFIG["torso_max_lean"]:
                form_issues.append(f"KEEP TORSO UPRIGHT ({features['torso_lean']:.0f}° LEAN)")

            # Head alignment (nose relative to shoulder midpoint)
            if features["head_visibility"] >= HEAD_MIN_VISIBILITY:
                if features["head_offset_ratio"] > HEAD_MAX_OFFSET:
                    form_issues.append(f"KEEP HEAD UPRIGHT (offset {features['head_offset_ratio']:.2f} > {HEAD_MAX_OFFSET})")

            # Neural Classifier Cross-Check Gate
            if neural_probs and neural_probs.get("is_custom_trained", False):
                wrong_conf = neural_probs.get("WRONG_POSE", 0.0)
                if not neural_probs.get("has_inferred", False):
                    is_neural_verifying = True
                elif wrong_conf > 0.50:
                    form_issues.append(f"AI MODEL: WRONG POSE ({int(wrong_conf*100)}%)")

        # 3. Pose Evaluation & Hold Timer Gate
        if is_stance:
            if is_neural_verifying:
                self.in_warrior2 = False
                self.form_status = "AI VERIFYING..."
                self.form_color = (0, 220, 255)
                self.pose_quality_pct = 75.0
                self.feedback = "MediaPipe Initiated -> AI Verifying Warrior II Form..."
                self.feedback_color = (0, 220, 255)
                self.hold_start_time = None
                self.current_hold_seconds = 0.0
            elif len(form_issues) == 0:
                self.correct_streak += 1
                self.failed_streak = 0
                confirmed = self.correct_streak >= CONFIG.get("confirm_frames", 5)

                if confirmed:
                    self.in_warrior2 = True
                    self.form_status = "PERFECT WARRIOR II"
                    self.form_color = (50, 255, 120)  # Radiant Green
                    self.pose_quality_pct = min(100.0, 90.0 + (self.stability_score * 0.10))

                    now = time.time()
                    if self.hold_start_time is None:
                        self.hold_start_time = now
                    self.current_hold_seconds = now - self.hold_start_time
                    if self.current_hold_seconds > self.best_hold_seconds:
                        self.best_hold_seconds = self.current_hold_seconds

                    self.feedback = f"PERFECT WARRIOR II! HOLDING: {self.current_hold_seconds:.1f}s"
                    self.feedback_color = (50, 255, 120)
                else:
                    self.in_warrior2 = False
                    self.form_status = "CONFIRMING"
                    self.form_color = (0, 215, 255)
                    self.feedback = "Hold steady — confirming Warrior II..."
                    self.feedback_color = (0, 215, 255)
                    self.hold_start_time = None
                    self.current_hold_seconds = 0.0
            else:
                self.failed_streak += 1
                if self.failed_streak >= CONFIG.get("break_frames", 3):
                    self.correct_streak = 0
                    self.in_warrior2 = False
                    self.hold_start_time = None
                    self.current_hold_seconds = 0.0

                self.form_status = form_issues[0]
                self.form_color = (0, 80, 255)  # Red/Amber alert
                self.pose_quality_pct = 50.0
                self.feedback = form_issues[0]
                self.feedback_color = (0, 80, 255)
        else:
            self.in_warrior2 = False
            self.hold_start_time = None
            self.current_hold_seconds = 0.0
            self.correct_streak = 0
            self.failed_streak = 0
            self.form_status = "READY"
            self.form_color = (0, 240, 255)
            self.pose_quality_pct = 0.0
            self.feedback = "Step into wide lunge stance & extend arms"
            self.feedback_color = (255, 255, 255)


class Warrior2App:
    def __init__(self):
        self.mediapipe_engine = MediaPipeWarrior2Engine()
        self.neural_checker = NeuralPoseCrossChecker()
        self.frame_count = 0
        self.person_detected = False
        self.show_landmarks = True

    def draw_pose_skeleton(self, frame, lms_img, w, h):
        if not self.show_landmarks or lms_img is None:
            return

        color = self.mediapipe_engine.form_color
        connections = [
            (0, 11), (0, 12),  # Nose to shoulders (head/neck)
            (11, 12),  # Shoulders
            (11, 13), (13, 15),  # Left Arm
            (12, 14), (14, 16),  # Right Arm
            (11, 23), (12, 24), (23, 24),  # Torso
            (23, 25), (25, 27), (27, 29), (29, 31), (27, 31),  # Left Leg & Foot
            (24, 26), (26, 28), (28, 30), (30, 32), (28, 32)   # Right Leg & Foot
        ]

        # Draw connecting bones with dark contrast shadow
        for (i1, i2) in connections:
            if i1 < len(lms_img) and i2 < len(lms_img):
                pt1 = (int(lms_img[i1].x * w), int(lms_img[i1].y * h))
                pt2 = (int(lms_img[i2].x * w), int(lms_img[i2].y * h))
                cv2.line(frame, pt1, pt2, (15, 15, 20), 4, cv2.LINE_AA)
                cv2.line(frame, pt1, pt2, color, 2, cv2.LINE_AA)

        # Draw Joint Circles
        key_joints = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]
        for idx in key_joints:
            if idx < len(lms_img):
                pt = (int(lms_img[idx].x * w), int(lms_img[idx].y * h))
                cv2.circle(frame, pt, 5, (255, 255, 255), -1, cv2.LINE_AA)
                cv2.circle(frame, pt, 3, color, -1, cv2.LINE_AA)

    def draw_hud(self, frame):
        h, w, _ = frame.shape
        overlay = frame.copy()

        # 1. Top Floating Glass HUD Bar
        bar_w = min(840, int(w * 0.94))
        bar_h = 68
        bar_x = (w - bar_w) // 2
        bar_y = 14

        cv2.rectangle(overlay, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (12, 14, 18), -1)
        cv2.addWeighted(overlay, 0.85, frame, 0.15, 0, frame)
        cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (50, 55, 68), 1)

        # Section 1: EXERCISE & STANCE (Left)
        cv2.putText(frame, "WARRIOR II", (bar_x + 20, bar_y + 24),
                    cv2.FONT_HERSHEY_DUPLEX, 0.42, (160, 165, 180), 1, cv2.LINE_AA)
        stance_txt = self.mediapipe_engine.active_stance if self.mediapipe_engine.active_stance != "NONE" else "WIDE STANCE"
        cv2.putText(frame, f"[{stance_txt}]", (bar_x + 20, bar_y + 52),
                    cv2.FONT_HERSHEY_DUPLEX, 0.64, (0, 240, 255), 2, cv2.LINE_AA)

        # Section 2: CURRENT HOLD TIMER (Center-Left)
        col2_x = bar_x + int(bar_w * 0.28)
        cv2.putText(frame, "HOLD TIMER", (col2_x, bar_y + 24),
                    cv2.FONT_HERSHEY_DUPLEX, 0.42, (160, 165, 180), 1, cv2.LINE_AA)
        hold_str = f"{self.mediapipe_engine.current_hold_seconds:04.1f}s"
        timer_col = (50, 255, 120) if self.mediapipe_engine.in_warrior2 else (220, 220, 230)
        cv2.putText(frame, hold_str, (col2_x, bar_y + 54),
                    cv2.FONT_HERSHEY_DUPLEX, 0.95, timer_col, 2, cv2.LINE_AA)

        # Section 3: BEST STREAK (Center-Right)
        col3_x = bar_x + int(bar_w * 0.54)
        cv2.putText(frame, "BEST STREAK", (col3_x, bar_y + 24),
                    cv2.FONT_HERSHEY_DUPLEX, 0.42, (160, 165, 180), 1, cv2.LINE_AA)
        best_str = f"{self.mediapipe_engine.best_hold_seconds:04.1f}s"
        cv2.putText(frame, best_str, (col3_x, bar_y + 54),
                    cv2.FONT_HERSHEY_DUPLEX, 0.85, (255, 215, 0), 2, cv2.LINE_AA)

        # Section 4: POSE QUALITY STATUS / NEURAL CLASSIFIER (Right)
        col4_x = bar_x + int(bar_w * 0.74)
        cv2.putText(frame, "AI VISION MODEL", (col4_x, bar_y + 24),
                    cv2.FONT_HERSHEY_DUPLEX, 0.40, (160, 165, 180), 1, cv2.LINE_AA)

        neural_probs = self.neural_checker.probabilities
        corr_pct = int(neural_probs.get("CORRECT_POSE", 0.0) * 100)
        wrong_pct = int(neural_probs.get("WRONG_POSE", 0.0) * 100)

        if neural_probs.get("is_custom_trained", False):
            if corr_pct >= 50:
                ai_txt = f"{corr_pct}% OK"
                ai_col = (50, 255, 120)
            else:
                ai_txt = f"{wrong_pct}% WRONG"
                ai_col = (0, 80, 255)
        else:
            ai_txt = self.mediapipe_engine.form_status[:13]
            ai_col = self.mediapipe_engine.form_color

        cv2.putText(frame, ai_txt, (col4_x, bar_y + 52),
                    cv2.FONT_HERSHEY_DUPLEX, 0.62, ai_col, 2, cv2.LINE_AA)

        # 2. Bottom Floating Feedback Pill
        f_pill_w = min(720, int(w * 0.90))
        f_pill_h = 44
        f_pill_x = (w - f_pill_w) // 2
        f_pill_y = h - 58

        overlay_bot = frame.copy()
        cv2.rectangle(overlay_bot, (f_pill_x, f_pill_y), (f_pill_x + f_pill_w, f_pill_y + f_pill_h), (12, 14, 18), -1)
        cv2.addWeighted(overlay_bot, 0.85, frame, 0.15, 0, frame)
        cv2.rectangle(frame, (f_pill_x, f_pill_y), (f_pill_x + f_pill_w, f_pill_y + f_pill_h), (50, 55, 68), 1)

        # Status Dot
        dot_col = self.mediapipe_engine.feedback_color
        cv2.circle(frame, (f_pill_x + 22, f_pill_y + 22), 6, dot_col, -1, cv2.LINE_AA)
        cv2.putText(frame, self.mediapipe_engine.feedback, (f_pill_x + 38, f_pill_y + 29),
                    cv2.FONT_HERSHEY_DUPLEX, 0.56, self.mediapipe_engine.feedback_color, 1, cv2.LINE_AA)

    def process_frame(self, frame):
        h, w, _ = frame.shape
        self.frame_count += 1
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # 1. MediaPipe 3D Pose Detection
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self.mediapipe_engine.detector.detect(mp_img)

        pose_features = None
        if result.pose_landmarks and result.pose_world_landmarks and len(result.pose_landmarks) > 0:
            lms_img = result.pose_landmarks[0]
            lms_world = result.pose_world_landmarks[0]
            self.person_detected = True

            pose_features = self.mediapipe_engine.analyze_pose(lms_img, lms_world, h, w)
            self.mediapipe_engine.update_warrior2_state(pose_features, self.neural_checker.probabilities)
            self.draw_pose_skeleton(frame, lms_img, w, h)
        else:
            self.person_detected = False
            self.mediapipe_engine.feedback = "Step into camera frame to begin Warrior II"
            self.mediapipe_engine.feedback_color = (0, 80, 255)

        # 2. Trigger Neural Verification
        if pose_features and pose_features.get("is_warrior_stance", False):
            self.neural_checker.predict_async(frame)
        elif self.frame_count % 10 == 0:
            self.neural_checker.predict_async(frame)

        # 3. Draw HUD
        self.draw_hud(frame)
        return frame


def main():
    parser = argparse.ArgumentParser(description="AI Warrior II (Virabhadrasana II) Tracker & Form Validator")
    parser.add_argument("--camera", type=int, default=0, help="Camera index (default 0)")
    parser.add_argument("--video", type=str, default="", help="Path to video file")
    args = parser.parse_args()

    cap = cv2.VideoCapture(args.video if args.video else args.camera)
    if not cap.isOpened():
        print(f"[ERROR] Could not open video stream: {args.video if args.video else f'Camera {args.camera}'}")
        return

    tracker = Warrior2App()

    print("=" * 70)
    print("   AI WARRIOR II (VIRABHADRASANA II) TRACKER & FORM VALIDATOR   ")
    print("=" * 70)
    print("Features:")
    print("  - Real-Time Balance Hold Timer & Best Streak Tracker")
    print("  - MediaPipe Biomechanical Pose Validator (Lunge, Knees, Arms, Torso)")
    print("  - Neural Vision Form Classifier Cross-Checker")
    print("Controls:")
    print("  'l' -> Toggle MediaPipe skeleton landmarks on/off")
    print("  'r' -> Reset Hold Timers & streaks")
    print("  'q' -> Quit application")
    print("=" * 70)

    cv2.namedWindow("AI Warrior II Tracker (Virabhadrasana II)", cv2.WINDOW_NORMAL)

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        if not args.video:
            frame = cv2.flip(frame, 1)

        processed = tracker.process_frame(frame)
        cv2.imshow("AI Warrior II Tracker (Virabhadrasana II)", processed)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('l'):
            tracker.show_landmarks = not tracker.show_landmarks
        elif key == ord('r'):
            tracker.mediapipe_engine.hold_start_time = None
            tracker.mediapipe_engine.current_hold_seconds = 0.0
            tracker.mediapipe_engine.best_hold_seconds = 0.0
            tracker.mediapipe_engine.feedback = "Timers reset"

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
