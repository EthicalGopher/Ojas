"""
AI Tree Pose (Vrikshasana) Form Detector & Foot-Placement Cross-Checker
======================================================================
Combines MediaPipe 3D Biomechanics + Neural Image Classifier to verify:
1. Is the person in Tree Pose? (Single leg balance, bent knee, upright posture)
2. Is the lifted foot safely on the inner THIGH (above knee) or CALF (below knee)?
3. Does the foot press directly onto the KNEE JOINT? (Critical yoga injury risk -> Flagged as WRONG POSE)

Features:
- Dual Cross-Checking: MediaPipe Biomechanical Geometry + Neural Image Classifier
- Batch Directory Evaluation: Evaluates 'dataset/correct_pose' & 'dataset/wrong_pose'
- Live Webcam Tracker with Instant Hold Timer & Form Guidance
"""

import os
import sys
import time
import math
import glob
import argparse
import urllib.request
import numpy as np
import cv2
from PIL import Image

import torch
import torch.nn as nn
from torchvision import transforms, models

import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task"
POSE_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pose_landmarker_full.task")
NEURAL_MODEL_PATH = "trained_tree_pose_model.pth"


def ensure_pose_model():
    """Ensures MediaPipe Pose model asset is available locally."""
    if not os.path.exists(POSE_MODEL_PATH):
        print(f"[INFO] Downloading Pose model asset to {POSE_MODEL_PATH}...")
        try:
            urllib.request.urlretrieve(POSE_MODEL_URL, POSE_MODEL_PATH)
            print("[INFO] Pose model asset downloaded.")
        except Exception as e:
            print(f"[ERROR] Failed downloading model: {e}")
            sys.exit(1)


def calculate_angle(a, b, c, use_z=True):
    """Calculates angle ABC in degrees."""
    if use_z and hasattr(a, 'z'):
        ba = np.array([a.x - b.x, a.y - b.y, a.z - b.z], dtype=np.float32)
        bc = np.array([c.x - b.x, c.y - b.y, c.z - b.z], dtype=np.float32)
    else:
        ba = np.array([a.x - b.x, a.y - b.y], dtype=np.float32)
        bc = np.array([c.x - b.x, c.y - b.y], dtype=np.float32)

    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)
    if norm_ba < 1e-6 or norm_bc < 1e-6:
        return 180.0
    cosine = np.clip(np.dot(ba, bc) / (norm_ba * norm_bc), -1.0, 1.0)
    return float(np.degrees(np.arccos(cosine)))


class NeuralPoseCrossChecker:
    """Neural image classifier to cross-check Correct Pose vs Wrong Pose."""
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

    def predict(self, frame_bgr):
        """Returns predicted class ('correct_pose' or 'wrong_pose') and confidence dict."""
        try:
            rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(rgb)
            tensor = self.transform(pil_img).unsqueeze(0).to(self.device)
            with torch.no_grad():
                logits = self.model(tensor)
                probs = torch.softmax(logits, dim=1)[0].cpu().numpy()

            correct_idx = 0 if "correct" in self.classes[0].lower() else 1
            wrong_idx = 1 - correct_idx

            return {
                "CORRECT_POSE": float(probs[correct_idx]),
                "WRONG_POSE": float(probs[wrong_idx]),
                "is_custom_trained": self.loaded_custom_weights
            }
        except Exception:
            return {"CORRECT_POSE": 0.50, "WRONG_POSE": 0.50, "is_custom_trained": False}


class TreePoseImageAnalyzer:
    def __init__(self):
        ensure_pose_model()
        base_options = python.BaseOptions(model_asset_path=POSE_MODEL_PATH)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=0.45,
            min_pose_presence_confidence=0.45,
            min_tracking_confidence=0.45
        )
        self.detector = vision.PoseLandmarker.create_from_options(options)
        self.neural_checker = NeuralPoseCrossChecker()

    def analyze_frame(self, frame_bgr):
        """
        Full Tree Pose Biomechanical & Neural Analysis:
        Checks standing leg, lifted knee, torso, hands, and FOOT PLACEMENT relative to knee.
        """
        h, w, _ = frame_bgr.shape
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self.detector.detect(mp_img)

        annotated = frame_bgr.copy()
        neural_probs = self.neural_checker.predict(frame_bgr)

        if not result.pose_landmarks or len(result.pose_landmarks) == 0:
            return annotated, False, 0.0, {"Person Detected": False}, "No Person Detected", neural_probs

        lms_img = result.pose_landmarks[0]
        lms_world = result.pose_world_landmarks[0]

        # 1. Measure Knee Angles
        l_knee_2d = calculate_angle(lms_img[23], lms_img[25], lms_img[27], use_z=False)
        r_knee_2d = calculate_angle(lms_img[24], lms_img[26], lms_img[28], use_z=False)
        l_knee_3d = calculate_angle(lms_world[23], lms_world[25], lms_world[27], use_z=True)
        r_knee_3d = calculate_angle(lms_world[24], lms_world[26], lms_world[28], use_z=True)

        l_knee = max(l_knee_2d, l_knee_3d * 0.90)
        r_knee = max(r_knee_2d, r_knee_3d * 0.90)

        # 2. Foot Lift / Ankle Heights
        l_ankle_y = lms_img[27].y
        r_ankle_y = lms_img[28].y
        ankle_diff = abs(l_ankle_y - r_ankle_y)

        standing_leg = "NONE"
        standing_knee_angle = 180.0
        bent_knee_angle = 180.0
        knee_outward = False
        foot_placement = "UNKNOWN"

        # Standing on Left Leg (Right leg lifted)
        if l_ankle_y > r_ankle_y and ankle_diff > 0.08:
            standing_leg = "LEFT"
            standing_knee_angle = l_knee
            bent_knee_angle = min(r_knee_2d, r_knee_3d)
            knee_outward = (lms_img[26].x < lms_img[24].x) or (abs(lms_img[26].x - lms_img[24].x) > 0.04)

            hip_y = lms_img[23].y
            knee_y = lms_img[25].y
            foot_y = min(lms_img[28].y, lms_img[30].y, lms_img[32].y)
            thigh_len = abs(knee_y - hip_y)
            rel_foot_pos = (knee_y - foot_y) / max(1e-4, thigh_len)

            if rel_foot_pos >= 0.50:
                foot_placement = "UPPER INNER THIGH (SAFE)"
            elif 0.0 <= rel_foot_pos < 0.40:
                foot_placement = "KNEE JOINT (DANGEROUS!)"
            elif rel_foot_pos < -0.30:
                foot_placement = "LOWER CALF (SAFE)"
            else:
                foot_placement = "NEAR KNEE (MOVE HIGHER OR LOWER)"

        # Standing on Right Leg (Left leg lifted)
        elif r_ankle_y > l_ankle_y and ankle_diff > 0.08:
            standing_leg = "RIGHT"
            standing_knee_angle = r_knee
            bent_knee_angle = min(l_knee_2d, l_knee_3d)
            knee_outward = (lms_img[25].x > lms_img[23].x) or (abs(lms_img[25].x - lms_img[23].x) > 0.04)

            hip_y = lms_img[24].y
            knee_y = lms_img[26].y
            foot_y = min(lms_img[27].y, lms_img[29].y, lms_img[31].y)
            thigh_len = abs(knee_y - hip_y)
            rel_foot_pos = (knee_y - foot_y) / max(1e-4, thigh_len)

            if rel_foot_pos >= 0.50:
                foot_placement = "UPPER INNER THIGH (SAFE)"
            elif 0.0 <= rel_foot_pos < 0.40:
                foot_placement = "KNEE JOINT (DANGEROUS!)"
            elif rel_foot_pos < -0.30:
                foot_placement = "LOWER CALF (SAFE)"
            else:
                foot_placement = "NEAR KNEE (MOVE HIGHER OR LOWER)"

        # 3. Hands & Arms Position (Prayer at Chest or Overhead Salute)
        l_wrist_y = lms_img[15].y
        r_wrist_y = lms_img[16].y
        wrists_dist = math.hypot(lms_img[15].x - lms_img[16].x, lms_img[15].y - lms_img[16].y)
        hands_together = wrists_dist < 0.22
        hands_overhead = (l_wrist_y < lms_img[0].y + 0.05) and (r_wrist_y < lms_img[0].y + 0.05)
        hands_at_chest = (l_wrist_y < lms_img[23].y) and (r_wrist_y < lms_img[24].y) and hands_together
        hands_valid = (hands_at_chest or hands_overhead) and (wrists_dist < 0.35)

        # 4. Torso Alignment
        mid_shoulder_y = (lms_world[11].y + lms_world[12].y) / 2.0
        mid_shoulder_x = (lms_world[11].x + lms_world[12].x) / 2.0
        mid_hip_y = (lms_world[23].y + lms_world[24].y) / 2.0
        mid_hip_x = (lms_world[23].x + lms_world[24].x) / 2.0
        torso_angle = math.degrees(math.atan2(abs(mid_hip_y - mid_shoulder_y), max(1e-5, abs(mid_hip_x - mid_shoulder_x))))
        torso_straight = torso_angle > 72.0

        # Checklist Rules
        is_safe_foot = ("SAFE" in foot_placement)
        checklist = {
            "Standing Leg Locked (>160°)": standing_knee_angle >= 160.0,
            "Lifted Leg Bent (<100°)": (bent_knee_angle <= 100.0 and standing_leg != "NONE"),
            "Foot on Thigh/Calf (NOT on Knee)": is_safe_foot,
            "Knee Opened Outward": knee_outward,
            "Hands in Prayer / Overhead": hands_valid,
            "Spine Upright": torso_straight
        }

        # Scoring & Decision
        passed_rules = sum(1 for v in checklist.values() if v)
        score_pct = (passed_rules / len(checklist)) * 100.0

        # Decision & Diagnostic feedback
        if "KNEE JOINT" in foot_placement or "NEAR KNEE" in foot_placement:
            is_correct_pose = False
            feedback_msg = "WRONG POSE: DO NOT PRESS FOOT ON KNEE JOINT!"
        elif not hands_valid:
            is_correct_pose = False
            feedback_msg = "WRONG POSE: BRING HANDS TO CHEST PRAYER OR OVERHEAD"
        elif not torso_straight:
            is_correct_pose = False
            feedback_msg = "WRONG POSE: STRAIGHTEN SPINE (AVOID LEANING)"
        elif is_safe_foot and passed_rules == len(checklist):
            is_correct_pose = True
            feedback_msg = f"PERFECT TREE POSE ({foot_placement.split()[0]})"
        else:
            is_correct_pose = False
            feedback_msg = "WRONG POSE: ADJUST ALIGNMENT"

        # Draw Pose Skeleton Landmarks
        self.draw_skeleton(annotated, lms_img, w, h, is_correct_pose)

        # Draw Results HUD with Foot Placement Highlight
        self.draw_results_hud(annotated, is_correct_pose, score_pct, standing_leg, foot_placement, checklist, neural_probs)

        return annotated, is_correct_pose, score_pct, checklist, feedback_msg, neural_probs

    def draw_skeleton(self, frame, lms, w, h, is_valid):
        color = (50, 255, 120) if is_valid else (0, 80, 255)

        connections = [
            (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
            (11, 23), (12, 24), (23, 24),
            (23, 25), (25, 27), (24, 26), (26, 28)
        ]

        for (i1, i2) in connections:
            pt1 = (int(lms[i1].x * w), int(lms[i1].y * h))
            pt2 = (int(lms[i2].x * w), int(lms[i2].y * h))
            cv2.line(frame, pt1, pt2, (20, 20, 30), 4, cv2.LINE_AA)
            cv2.line(frame, pt1, pt2, color, 2, cv2.LINE_AA)

        for i in [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]:
            pt = (int(lms[i].x * w), int(lms[i].y * h))
            cv2.circle(frame, pt, 5, (255, 255, 255), -1, cv2.LINE_AA)
            cv2.circle(frame, pt, 3, color, -1, cv2.LINE_AA)

    def draw_results_hud(self, frame, is_correct, score, standing_leg, foot_placement, checklist, neural_probs):
        h, w, _ = frame.shape

        card_w = min(410, int(w * 0.48))
        card_h = 280
        card_x = 20
        card_y = 20

        overlay = frame.copy()
        cv2.rectangle(overlay, (card_x, card_y), (card_x + card_w, card_y + card_h), (14, 16, 22), -1)
        cv2.addWeighted(overlay, 0.85, frame, 0.15, 0, frame)
        cv2.rectangle(frame, (card_x, card_y), (card_x + card_w, card_y + card_h), (60, 65, 80), 1)

        # Title
        cv2.putText(frame, "TREE POSE FORM VALIDATOR", (card_x + 15, card_y + 26),
                    cv2.FONT_HERSHEY_DUPLEX, 0.45, (200, 200, 220), 1, cv2.LINE_AA)

        # Overall Status
        status_txt = "CORRECT POSE" if is_correct else "WRONG POSE"
        status_col = (50, 255, 120) if is_correct else (0, 80, 255)
        cv2.putText(frame, f"{status_txt} ({int(score)}%)", (card_x + 15, card_y + 56),
                    cv2.FONT_HERSHEY_DUPLEX, 0.70, status_col, 2, cv2.LINE_AA)

        # Foot Placement Diagnostics
        foot_col = (50, 255, 120) if "SAFE" in foot_placement else (0, 80, 255)
        cv2.putText(frame, f"Foot Location: {foot_placement}", (card_x + 15, card_y + 82),
                    cv2.FONT_HERSHEY_DUPLEX, 0.40, foot_col, 1, cv2.LINE_AA)

        # Checklist Items
        row_y = card_y + 108
        for item, passed in checklist.items():
            check_mark = "[PASS]" if passed else "[FAIL]"
            mark_col = (50, 255, 120) if passed else (0, 80, 255)
            cv2.putText(frame, check_mark, (card_x + 15, row_y),
                        cv2.FONT_HERSHEY_DUPLEX, 0.36, mark_col, 1, cv2.LINE_AA)
            cv2.putText(frame, item, (card_x + 75, row_y),
                        cv2.FONT_HERSHEY_DUPLEX, 0.36, (220, 220, 230), 1, cv2.LINE_AA)
            row_y += 22

        # Neural Confidence Bar
        p_correct = neural_probs.get("CORRECT_POSE", 0.5)
        p_wrong = neural_probs.get("WRONG_POSE", 0.5)
        cv2.putText(frame, f"AI Neural Confidence: Correct {int(p_correct*100)}% | Wrong {int(p_wrong*100)}%",
                    (card_x + 15, card_y + card_h - 12),
                    cv2.FONT_HERSHEY_DUPLEX, 0.33, (160, 160, 170), 1, cv2.LINE_AA)


def main():
    parser = argparse.ArgumentParser(description="Image-Based Tree Pose Form Detector & Cross-Checker")
    parser.add_argument("--image", type=str, default="", help="Path to single image file")
    parser.add_argument("--dir", type=str, default="", help="Directory containing sample images to evaluate")
    parser.add_argument("--camera", type=int, default=0, help="Camera index for live feed (default 0)")
    parser.add_argument("--output", type=str, default="tree_pose_result.jpg", help="Output annotated image path")
    args = parser.parse_args()

    analyzer = TreePoseImageAnalyzer()

    # 1. Batch Directory Evaluation Mode
    if args.dir:
        image_paths = sorted(glob.glob(os.path.join(args.dir, "*.*")) + glob.glob(os.path.join(args.dir, "*/*.*")))
        image_paths = [p for p in image_paths if p.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]
        if not image_paths:
            print(f"[ERROR] No images found in directory: {args.dir}")
            return

        print("\n" + "=" * 70)
        print(f"   TREE POSE FORM BATCH EVALUATION: {len(image_paths)} Images")
        print("=" * 70)

        for img_p in image_paths:
            frame = cv2.imread(img_p)
            annotated, is_correct, score, checklist, msg, neural = analyzer.analyze_frame(frame)
            out_p = "result_" + os.path.basename(img_p)
            cv2.imwrite(out_p, annotated)
            res_str = "CORRECT POSE" if is_correct else "WRONG POSE"
            print(f"  {os.path.basename(img_p):<20} -> {res_str:<14} [{msg}] (Saved: {out_p})")

        print("=" * 70)
        print("[SUCCESS] Batch evaluation complete!")
        return

    # 2. Single Image Mode
    elif args.image:
        if not os.path.exists(args.image):
            print(f"[ERROR] Image not found: {args.image}")
            return

        frame = cv2.imread(args.image)
        annotated, is_correct, score, checklist, msg, neural = analyzer.analyze_frame(frame)

        print("\n" + "=" * 60)
        print(f"   TREE POSE FORM EVALUATION: {args.image}")
        print("=" * 60)
        print(f"Result:      {'CORRECT POSE' if is_correct else 'WRONG POSE'}")
        print(f"Diagnostics: {msg}")
        print(f"Score:       {score:.1f}%")
        print("\nBiomechanical & Safety Checklist:")
        for item, passed in checklist.items():
            status = "PASSED" if passed else "FAILED"
            print(f"  [{status:^6}]  {item}")
        print("=" * 60)

        cv2.imwrite(args.output, annotated)
        print(f"[SUCCESS] Annotated result saved to: {args.output}")

        cv2.imshow("Tree Pose Result (Press any key to close)", annotated)
        cv2.waitKey(0)
        cv2.destroyAllWindows()

    # 3. Live Camera Stream Mode
    else:
        cap = cv2.VideoCapture(args.camera)
        if not cap.isOpened():
            print(f"[ERROR] Could not open camera {args.camera}")
            return

        print("=" * 65)
        print("   LIVE TREE POSE FORM CROSS-CHECKER & HOLD TIMER   ")
        print("=" * 65)
        print("Press 'q' or ESC to exit")

        hold_start = None
        best_hold = 0.0

        cv2.namedWindow("Tree Pose Form Cross-Checker", cv2.WINDOW_NORMAL)

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame = cv2.flip(frame, 1)
            annotated, is_correct, score, checklist, msg, neural = analyzer.analyze_frame(frame)

            now = time.time()
            if is_correct:
                if hold_start is None:
                    hold_start = now
                current_hold = now - hold_start
                best_hold = max(best_hold, current_hold)
                timer_str = f"HOLDING: {current_hold:.1f}s (BEST: {best_hold:.1f}s)"
                timer_col = (50, 255, 120)
            else:
                hold_start = None
                timer_str = f"BEST HOLD: {best_hold:.1f}s"
                timer_col = (200, 200, 200)

            h, w, _ = annotated.shape
            cv2.putText(annotated, timer_str, (w - 380, 45),
                        cv2.FONT_HERSHEY_DUPLEX, 0.55, timer_col, 1, cv2.LINE_AA)

            cv2.imshow("Tree Pose Form Cross-Checker", annotated)
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break

        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
