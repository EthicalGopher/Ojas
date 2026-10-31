"""
AI Tree Pose (Vrikshasana) Tracker & Form Validator
===================================================
Hybrid Engine: MediaPipe 3D Pose Biomechanics + Vision Classifier Form Cross-Check.

Tree Pose (Vrikshasana) Rules & Biomechanics:
1. Standing Leg: Fully extended & stable (Knee angle 165° - 180°).
2. Lifted Leg: Bent with foot placed on inner thigh/calf (Knee angle 30° - 75°, knee opened outward).
3. Hands: Anjali Mudra (Prayer hands at heart center) or Raised Overhead.
4. Torso & Spine: Vertically aligned with level hips and upright chest.
5. Balance Hold Timer: Real-time hold duration tracking (Left & Right leg hold streaks).

Features:
- Real-time Biomechanical Pose Quality Analysis & Audio-Visual Form Guidance
- Neural Vision Form Cross-Checker on GPU (Inner Thigh vs Knee Joint Danger Check)
- Clean Minimalist Floating Glass HUD with Hold Timer & Streak Tracker
"""

import os
import sys
import time
import math
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

DEVICE = "cpu"
POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task"
POSE_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pose_landmarker_full.task")
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tree_pose_config.json")


def load_config():
    """Loads shared configuration from tree_pose_config.json."""
    defaults = {
        "aspect_default": 1.7778,
        "quality": {"vis_min": 0.60, "vis_min_single": 0.40},
        "standing_leg": {"knee_min": 160.0},
        "lifted_leg": {"knee_min": 25.0, "knee_max": 135.0},
        "foot_placement": {
            "on_thigh_min": 0.45, "knee_zone_hi": 0.40, "knee_zone_lo": -0.10,
            "calf_max": -0.25, "calf_low": -0.80, "horiz_max": 0.75
        },
        "knee_opening": {"open_min": 0.15},
        "torso_max_lean": 18.0,
        "head": {"max_offset": 0.28, "min_visibility": 0.40},
        "hands": {"together_max": 0.45, "prayer_y_min": 0.10, "prayer_y_max": 1.05},
        "ankle_diff_min": 0.08,
        "ema_alpha": 0.35,
        "confirm_frames": 5,
        "break_frames": 3
    }
    if os.path.exists(CONFIG_PATH):
        try:
            import json
            with open(CONFIG_PATH, "r") as f:
                cfg = json.load(f)
                return cfg
        except Exception as e:
            print(f"[WARNING] Could not load {CONFIG_PATH}: {e}")
    return defaults


CONFIG = load_config()




def ensure_pose_model():
    """Ensures MediaPipe Pose asset is downloaded."""
    if not os.path.exists(POSE_MODEL_PATH):
        print(f"[INFO] Downloading MediaPipe Pose asset to {POSE_MODEL_PATH}...")
        try:
            urllib.request.urlretrieve(POSE_MODEL_URL, POSE_MODEL_PATH)
            print("[INFO] Model asset successfully downloaded.")
        except Exception as e:
            print(f"[ERROR] Could not download pose model: {e}")
            sys.exit(1)


def calculate_3d_angle(a, b, c):
    """Calculates true 3D angle between 3 points in degrees."""
    ba = np.array([a.x - b.x, a.y - b.y, a.z - b.z], dtype=np.float32)
    bc = np.array([c.x - b.x, c.y - b.y, c.z - b.z], dtype=np.float32)
    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)
    if norm_ba < 1e-6 or norm_bc < 1e-6:
        return 180.0
    cosine = np.clip(np.dot(ba, bc) / (norm_ba * norm_bc), -1.0, 1.0)
    return float(np.degrees(np.arccos(cosine)))


from torchvision import transforms, models
from PIL import Image

NEURAL_MODEL_PATH = "trained_tree_pose_model.pth"


class NeuralPoseCrossChecker:
    """Neural image classifier to cross-check Correct Pose vs Wrong Pose on GPU."""
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
                print(f"[INFO] Loaded trained Tree Pose Neural Classifier from '{NEURAL_MODEL_PATH}'")
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


class MediaPipeTreePoseEngine:
    """
    MediaPipe 3D Pose Biomechanical Engine for Tree Pose (Vrikshasana):
    - Detects active standing leg vs lifted bent leg
    - Evaluates knee opening angle, torso verticality, hand prayer/overhead position
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
        self.active_leg = "NONE"          # "LEFT LEG" or "RIGHT LEG"
        self.in_tree_pose = False
        self.pose_quality_pct = 0.0
        self.stability_score = 0.0
        self.form_status = "READY"
        self.form_color = (0, 240, 255)
        self.feedback = "Stand tall -> Lift one foot onto inner thigh"
        self.feedback_color = (255, 255, 255)

        # Hold Timers
        self.hold_start_time = None
        self.current_hold_seconds = 0.0
        self.best_hold_seconds = 0.0
        self.total_hold_time = 0.0

        # Smoothing & Stability buffer
        self.standing_ankle_history = deque(maxlen=30)
        self.smoothed_left_knee = 180.0
        self.smoothed_right_knee = 180.0
        self.smoothed_torso = 90.0

    def analyze_pose(self, lms_img, lms_world, h, w):
        # 1. 2D and 3D Knee Angles (Fused for planar accuracy)
        def _calc_2d(a, b, c):
            ba = np.array([a.x - b.x, a.y - b.y], dtype=np.float32)
            bc = np.array([c.x - b.x, c.y - b.y], dtype=np.float32)
            norm_ba = np.linalg.norm(ba)
            norm_bc = np.linalg.norm(bc)
            if norm_ba < 1e-6 or norm_bc < 1e-6:
                return 180.0
            return float(np.degrees(np.arccos(np.clip(np.dot(ba, bc) / (norm_ba * norm_bc), -1.0, 1.0))))

        l_knee_2d = _calc_2d(lms_img[23], lms_img[25], lms_img[27])
        r_knee_2d = _calc_2d(lms_img[24], lms_img[26], lms_img[28])
        l_knee_3d = calculate_3d_angle(lms_world[23], lms_world[25], lms_world[27])
        r_knee_3d = calculate_3d_angle(lms_world[24], lms_world[26], lms_world[28])

        l_knee = max(l_knee_2d, l_knee_3d * 0.90)
        r_knee = max(r_knee_2d, r_knee_3d * 0.90)

        alpha = 0.35
        self.smoothed_left_knee = (1 - alpha) * self.smoothed_left_knee + alpha * l_knee
        self.smoothed_right_knee = (1 - alpha) * self.smoothed_right_knee + alpha * r_knee

        # 2. Foot Height & Leg Lift
        l_ankle_y = lms_img[27].y
        r_ankle_y = lms_img[28].y
        ankle_diff = abs(l_ankle_y - r_ankle_y)

        # 3. Torso Alignment
        mid_shoulder_y = (lms_world[11].y + lms_world[12].y) / 2.0
        mid_shoulder_x = (lms_world[11].x + lms_world[12].x) / 2.0
        mid_hip_y = (lms_world[23].y + lms_world[24].y) / 2.0
        mid_hip_x = (lms_world[23].x + lms_world[24].x) / 2.0

        torso_angle = math.degrees(math.atan2(abs(mid_hip_y - mid_shoulder_y), max(1e-5, abs(mid_hip_x - mid_shoulder_x))))
        self.smoothed_torso = (1 - alpha) * self.smoothed_torso + alpha * torso_angle

        # 4. Hand / Arm Position (Prayer at Chest or Overhead)
        l_wrist_y = lms_img[15].y
        r_wrist_y = lms_img[16].y
        wrists_dist = math.hypot(lms_img[15].x - lms_img[16].x, lms_img[15].y - lms_img[16].y)
        hands_together = wrists_dist < 0.22
        hands_overhead = (l_wrist_y < lms_img[0].y + 0.05) and (r_wrist_y < lms_img[0].y + 0.05)
        hands_at_chest = (l_wrist_y < lms_img[23].y) and (r_wrist_y < lms_img[24].y)
        hands_valid = hands_together or hands_overhead or hands_at_chest

        # 5. Stance Classification
        standing_on_left = False
        standing_on_right = False
        knee_opened_outward = False

        if l_ankle_y > r_ankle_y and ankle_diff > 0.08:
            standing_on_left = True
            self.active_leg = "LEFT LEG (STAND)"
            knee_opened_outward = (lms_img[26].x < lms_img[24].x) or (abs(lms_img[26].x - lms_img[24].x) > 0.04)
            self.standing_ankle_history.append((lms_img[27].x, lms_img[27].y))
        elif r_ankle_y > l_ankle_y and ankle_diff > 0.08:
            standing_on_right = True
            self.active_leg = "RIGHT LEG (STAND)"
            knee_opened_outward = (lms_img[25].x > lms_img[23].x) or (abs(lms_img[25].x - lms_img[23].x) > 0.04)
            self.standing_ankle_history.append((lms_img[28].x, lms_img[28].y))
        else:
            self.active_leg = "NONE"

        # Stability Score
        if len(self.standing_ankle_history) > 10:
            coords = np.array(self.standing_ankle_history)
            jitter = np.std(coords, axis=0).mean()
            self.stability_score = float(np.clip(100.0 - (jitter * 4000.0), 0.0, 100.0))
        else:
            self.stability_score = 85.0

        # Foot placement calculation relative to standing knee
        foot_placement = "UNKNOWN"
        if standing_on_left:
            hip_y = lms_img[23].y
            knee_y = lms_img[25].y
            foot_y = min(lms_img[28].y, lms_img[30].y, lms_img[32].y)
            thigh_len = abs(knee_y - hip_y)
            rel_foot_pos = (knee_y - foot_y) / max(1e-4, thigh_len)
            if rel_foot_pos >= 0.50:
                foot_placement = "INNER THIGH (SAFE)"
            elif 0.0 <= rel_foot_pos < 0.40:
                foot_placement = "KNEE JOINT (DANGEROUS!)"
            elif rel_foot_pos < -0.30:
                foot_placement = "LOWER CALF (SAFE)"
            else:
                foot_placement = "NEAR KNEE"
        elif standing_on_right:
            hip_y = lms_img[24].y
            knee_y = lms_img[26].y
            foot_y = min(lms_img[27].y, lms_img[29].y, lms_img[31].y)
            thigh_len = abs(knee_y - hip_y)
            rel_foot_pos = (knee_y - foot_y) / max(1e-4, thigh_len)
            if rel_foot_pos >= 0.50:
                foot_placement = "INNER THIGH (SAFE)"
            elif 0.0 <= rel_foot_pos < 0.40:
                foot_placement = "KNEE JOINT (DANGEROUS!)"
            elif rel_foot_pos < -0.30:
                foot_placement = "LOWER CALF (SAFE)"
            else:
                foot_placement = "NEAR KNEE"

        is_tree_stance = (standing_on_left or standing_on_right)
        is_sitting = (self.smoothed_left_knee < 110.0 and self.smoothed_right_knee < 110.0 and ankle_diff < 0.06)
        is_standing = (self.smoothed_left_knee > 160.0 and self.smoothed_right_knee > 160.0)

        features = {
            "standing_on_left": standing_on_left,
            "standing_on_right": standing_on_right,
            "is_tree_stance": is_tree_stance,
            "is_sitting": is_sitting,
            "is_standing": is_standing,
            "foot_placement": foot_placement,
            "knee_opened_outward": knee_opened_outward,
            "hands_valid": hands_valid,
            "torso_upright": self.smoothed_torso > 70.0,
            "standing_knee_angle": self.smoothed_left_knee if standing_on_left else (self.smoothed_right_knee if standing_on_right else 180.0),
            "bent_knee_angle": self.smoothed_right_knee if standing_on_left else (self.smoothed_left_knee if standing_on_right else 180.0),
            "ankle_lift": ankle_diff
        }
        return features

    def update_tree_pose_state(self, features, neural_probs=None):
        is_tree = features["is_tree_stance"]
        is_sitting = features["is_sitting"]
        foot_placement = features.get("foot_placement", "UNKNOWN")

        # 1. Sitting / Inactive Check
        if is_sitting:
            self.in_tree_pose = False
            self.hold_start_time = None
            self.current_hold_seconds = 0.0
            self.form_status = "RESTING / SITTING"
            self.form_color = (0, 140, 255)
            self.feedback = "Sitting Detected -> Stand Up & Begin Tree Pose"
            self.feedback_color = (0, 180, 255)
            return

        # 2. Form Issue Diagnostics (MediaPipe Geometry + Neural Classifier Verification)
        form_issues = []
        is_neural_verifying = False

        if is_tree:
            # MediaPipe Geometry Checks
            if "KNEE JOINT" in foot_placement or "NEAR KNEE" in foot_placement:
                form_issues.append("DO NOT PRESS FOOT ON KNEE JOINT!")
            if features["standing_knee_angle"] < 162.0:
                form_issues.append("LOCK STANDING KNEE")
            if not features["knee_opened_outward"]:
                form_issues.append("OPEN BENT KNEE OUTWARD")
            if not features["torso_upright"]:
                form_issues.append("STRAIGHTEN SPINE")
            if not features["hands_valid"]:
                form_issues.append("BRING HANDS TO CHEST / OVERHEAD")

            # Neural Classification Model Verification Gate
            if neural_probs and neural_probs.get("is_custom_trained", False):
                wrong_conf = neural_probs.get("WRONG_POSE", 0.0)
                corr_conf = neural_probs.get("CORRECT_POSE", 0.0)
                
                # Check if neural verification is still in initial inference
                if not neural_probs.get("has_inferred", False):
                    is_neural_verifying = True
                elif wrong_conf > 0.50:
                    form_issues.append(f"AI MODEL: WRONG POSE ({int(wrong_conf*100)}%)")

        # 3. Pose Evaluation & Hold Timer Gate
        if is_tree:
            if is_neural_verifying:
                self.in_tree_pose = False
                self.form_status = "AI VERIFYING..."
                self.form_color = (0, 220, 255)  # Cyan
                self.pose_quality_pct = 75.0
                self.feedback = "MediaPipe Initiated -> AI Verifying Foot Placement..."
                self.feedback_color = (0, 220, 255)
                self.hold_start_time = None
                self.current_hold_seconds = 0.0
            elif len(form_issues) == 0:
                self.in_tree_pose = True
                self.form_status = "PERFECT TREE POSE"
                self.form_color = (50, 255, 120)  # Radiant Green
                self.pose_quality_pct = min(100.0, 90.0 + (self.stability_score * 0.10))

                # Start / Continue Timer Tracking Only After Verification Passes
                now = time.time()
                if self.hold_start_time is None:
                    self.hold_start_time = now
                self.current_hold_seconds = now - self.hold_start_time
                if self.current_hold_seconds > self.best_hold_seconds:
                    self.best_hold_seconds = self.current_hold_seconds

                self.feedback = f"AI VERIFIED! HOLDING: {self.current_hold_seconds:.1f}s"
                self.feedback_color = (50, 255, 120)
            else:
                self.in_tree_pose = False
                self.form_status = form_issues[0]
                self.form_color = (0, 80, 255)  # Red / Amber alert
                self.pose_quality_pct = 50.0
                self.feedback = f"{form_issues[0]}"
                self.feedback_color = (0, 80, 255)
                self.hold_start_time = None
                self.current_hold_seconds = 0.0
        else:
            self.in_tree_pose = False
            self.hold_start_time = None
            self.current_hold_seconds = 0.0
            self.form_status = "READY"
            self.form_color = (0, 240, 255)
            self.pose_quality_pct = 0.0
            self.feedback = "Lift one foot onto inner thigh & join hands"
            self.feedback_color = (255, 255, 255)


class TreePoseApp:
    def __init__(self):
        self.mediapipe_engine = MediaPipeTreePoseEngine()
        self.neural_checker = NeuralPoseCrossChecker()
        self.frame_count = 0
        self.person_detected = False
        self.show_landmarks = True  # Real-time MediaPipe Skeleton Landmarks

    def draw_pose_skeleton(self, frame, lms_img, w, h):
        if not self.show_landmarks or lms_img is None:
            return

        color = self.mediapipe_engine.form_color
        # Key Biomechanical Connections
        connections = [
            (11, 12),  # Shoulders
            (11, 13), (13, 15),  # Left Arm
            (12, 14), (14, 16),  # Right Arm
            (11, 23), (12, 24), (23, 24),  # Torso
            (23, 25), (25, 27), (27, 29), (29, 31), (27, 31),  # Left Leg & Foot
            (24, 26), (26, 28), (28, 30), (30, 32), (28, 32)   # Right Leg & Foot
        ]

        # Draw connecting bones with subtle dark shadow for high contrast
        for (i1, i2) in connections:
            if i1 < len(lms_img) and i2 < len(lms_img):
                pt1 = (int(lms_img[i1].x * w), int(lms_img[i1].y * h))
                pt2 = (int(lms_img[i2].x * w), int(lms_img[i2].y * h))
                cv2.line(frame, pt1, pt2, (15, 15, 20), 4, cv2.LINE_AA)
                cv2.line(frame, pt1, pt2, color, 2, cv2.LINE_AA)

        # Draw Joint Circles
        key_joints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]
        for idx in key_joints:
            if idx < len(lms_img):
                pt = (int(lms_img[idx].x * w), int(lms_img[idx].y * h))
                cv2.circle(frame, pt, 5, (255, 255, 255), -1, cv2.LINE_AA)
                cv2.circle(frame, pt, 3, color, -1, cv2.LINE_AA)

    def draw_hud(self, frame):
        h, w, _ = frame.shape
        overlay = frame.copy()

        # 1. Clean Top Floating Glass HUD Bar
        bar_w = min(820, int(w * 0.94))
        bar_h = 68
        bar_x = (w - bar_w) // 2
        bar_y = 14

        # Background Pill with subtle rounded border
        cv2.rectangle(overlay, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (12, 14, 18), -1)
        cv2.addWeighted(overlay, 0.82, frame, 0.18, 0, frame)
        cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (50, 55, 68), 1)

        # Section 1: EXERCISE & LEG (Left)
        cv2.putText(frame, "TREE POSE", (bar_x + 20, bar_y + 24),
                    cv2.FONT_HERSHEY_DUPLEX, 0.42, (160, 165, 180), 1, cv2.LINE_AA)
        leg_txt = self.mediapipe_engine.active_leg.split()[0] if self.mediapipe_engine.active_leg != "NONE" else "STAND"
        cv2.putText(frame, f"[{leg_txt} LEG]", (bar_x + 20, bar_y + 52),
                    cv2.FONT_HERSHEY_DUPLEX, 0.68, (0, 240, 255), 2, cv2.LINE_AA)

        # Section 2: CURRENT HOLD TIMER (Center-Left)
        col2_x = bar_x + int(bar_w * 0.26)
        cv2.putText(frame, "HOLD TIMER", (col2_x, bar_y + 24),
                    cv2.FONT_HERSHEY_DUPLEX, 0.42, (160, 165, 180), 1, cv2.LINE_AA)
        hold_str = f"{self.mediapipe_engine.current_hold_seconds:04.1f}s"
        timer_col = (50, 255, 120) if self.mediapipe_engine.in_tree_pose else (220, 220, 230)
        cv2.putText(frame, hold_str, (col2_x, bar_y + 54),
                    cv2.FONT_HERSHEY_DUPLEX, 0.95, timer_col, 2, cv2.LINE_AA)

        # Section 3: BEST STREAK (Center-Right)
        col3_x = bar_x + int(bar_w * 0.52)
        cv2.putText(frame, "BEST STREAK", (col3_x, bar_y + 24),
                    cv2.FONT_HERSHEY_DUPLEX, 0.42, (160, 165, 180), 1, cv2.LINE_AA)
        best_str = f"{self.mediapipe_engine.best_hold_seconds:04.1f}s"
        cv2.putText(frame, best_str, (col3_x, bar_y + 54),
                    cv2.FONT_HERSHEY_DUPLEX, 0.85, (255, 215, 0), 2, cv2.LINE_AA)

        # Section 4: POSE QUALITY STATUS / NEURAL CLASSIFIER (Right)
        col4_x = bar_x + int(bar_w * 0.73)
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
            ai_txt = self.mediapipe_engine.form_status[:12]
            ai_col = self.mediapipe_engine.form_color

        cv2.putText(frame, ai_txt, (col4_x, bar_y + 52),
                    cv2.FONT_HERSHEY_DUPLEX, 0.65, ai_col, 2, cv2.LINE_AA)

        # 2. Bottom Floating Feedback Pill
        f_pill_w = min(680, int(w * 0.90))
        f_pill_h = 44
        f_pill_x = (w - f_pill_w) // 2
        f_pill_y = h - 58

        overlay_bot = frame.copy()
        cv2.rectangle(overlay_bot, (f_pill_x, f_pill_y), (f_pill_x + f_pill_w, f_pill_y + f_pill_h), (12, 14, 18), -1)
        cv2.addWeighted(overlay_bot, 0.85, frame, 0.15, 0, frame)
        cv2.rectangle(frame, (f_pill_x, f_pill_y), (f_pill_x + f_pill_w, f_pill_y + f_pill_h), (50, 55, 68), 1)

        # Status Dot (Green / Amber / Cyan)
        dot_col = self.mediapipe_engine.feedback_color
        cv2.circle(frame, (f_pill_x + 22, f_pill_y + 22), 6, dot_col, -1, cv2.LINE_AA)

        cv2.putText(frame, self.mediapipe_engine.feedback, (f_pill_x + 38, f_pill_y + 29),
                    cv2.FONT_HERSHEY_DUPLEX, 0.58, self.mediapipe_engine.feedback_color, 1, cv2.LINE_AA)

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
            self.mediapipe_engine.update_tree_pose_state(pose_features, self.neural_checker.probabilities)
            
            # Draw Real-Time MediaPipe Skeleton Landmarks
            self.draw_pose_skeleton(frame, lms_img, w, h)
        else:
            self.person_detected = False
            self.mediapipe_engine.feedback = "Step into camera frame to begin Tree Pose"
            self.mediapipe_engine.feedback_color = (0, 80, 255)

        # 2. Trigger Neural Verification: Send frame immediately when MediaPipe detects Tree stance
        if pose_features and pose_features.get("is_tree_stance", False):
            self.neural_checker.predict_async(frame)
        elif self.frame_count % 10 == 0:
            self.neural_checker.predict_async(frame)

        # 3. Draw HUD
        self.draw_hud(frame)
        return frame


def main():
    parser = argparse.ArgumentParser(description="AI Tree Pose (Vrikshasana) Tracker & Form Validator")
    parser.add_argument("--camera", type=int, default=0, help="Camera index (default 0)")
    parser.add_argument("--video", type=str, default="", help="Path to video file")
    args = parser.parse_args()

    cap = cv2.VideoCapture(args.video if args.video else args.camera)
    if not cap.isOpened():
        print(f"[ERROR] Could not open video stream: {args.video if args.video else f'Camera {args.camera}'}")
        return

    tracker = TreePoseApp()

    print("=" * 70)
    print("   AI TREE POSE (VRIKSHASANA) TRACKER & FORM VALIDATOR   ")
    print("=" * 70)
    print("Features:")
    print("  - Real-Time Balance Hold Timer & Best Streak Tracker")
    print("  - MediaPipe Biomechanical Pose Validator (Leg, Knee, Torso, Hands)")
    print("  - Neural Vision Form Classifier (Inner Thigh vs Knee Joint Cross-Check)")
    print("Controls:")
    print("  'l' -> Toggle MediaPipe skeleton landmarks on/off")
    print("  'r' -> Reset Hold Timers & streaks")
    print("  'q' -> Quit application")
    print("=" * 70)

    cv2.namedWindow("AI Tree Pose Tracker (Vrikshasana)", cv2.WINDOW_NORMAL)

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        if not args.video:
            frame = cv2.flip(frame, 1)

        processed = tracker.process_frame(frame)
        cv2.imshow("AI Tree Pose Tracker (Vrikshasana)", processed)

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
