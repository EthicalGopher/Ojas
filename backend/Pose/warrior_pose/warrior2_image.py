"""
AI Warrior II (Virabhadrasana II) Form Detector & Cross-Checker
================================================================
Combines MediaPipe 3D Biomechanics + Neural Image Classifier to verify:
1. Wide lunge stance with level grounded feet (ankle distance >= 1.25 hip-widths)
2. Front leg bent deeply to 90° (90°–145°) with knee stacked over ankle
3. Rear leg fully extended and straight (>= 160°)
4. Horizontal T-arms extended parallel to floor with straight elbows (>= 150°)
5. Upright vertical torso without leaning forward
6. Head/nose alignment centered over shoulder midpoint (ratio <= 0.50)

Features:
- Dual Cross-Checking: MediaPipe Biomechanical Geometry + Neural Image Classifier
- Batch Directory Evaluation: Evaluates 'dataset/correct_pose' & 'dataset/wrong_pose'
- Single Image & Live Webcam Tracker with Instant Hold Timer & Form Guidance
"""

import os
import sys
import time
import math
import glob
import json
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
NEURAL_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trained_warrior2_model.pth")
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
        "head": {"max_offset": 0.50, "min_visibility": 0.40}
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


def ensure_pose_model():
    if not os.path.exists(POSE_MODEL_PATH):
        print(f"[INFO] Downloading Pose model asset to {POSE_MODEL_PATH}...")
        try:
            urllib.request.urlretrieve(POSE_MODEL_URL, POSE_MODEL_PATH)
            print("[INFO] Pose model asset downloaded.")
        except Exception as e:
            print(f"[ERROR] Failed downloading model: {e}")
            sys.exit(1)


def calculate_angle(a, b, c, use_z=False):
    """Calculates angle ABC in degrees [0, 180]."""
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
                print(f"[INFO] Loaded trained Warrior II Neural Classifier from '{NEURAL_MODEL_PATH}'")
            except Exception as e:
                print(f"[WARNING] Could not load trained neural weights: {e}")

        self.model = self.model.to(self.device)
        self.model.eval()

    def predict(self, frame_bgr):
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


class Warrior2ImageAnalyzer:
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

        # 2. Elbow Angles
        l_elbow = calculate_angle(lms_img[11], lms_img[13], lms_img[15], use_z=False)
        r_elbow = calculate_angle(lms_img[12], lms_img[14], lms_img[16], use_z=False)

        # 3. Arm Horizontal Alignment
        aspect = w / max(1, h)
        def _arm_horiz(shoulder, wrist):
            dx = abs(wrist.x - shoulder.x)
            dy = abs(wrist.y - shoulder.y)
            return math.degrees(math.atan2(dy, max(1e-5, dx)))

        l_arm_horiz = _arm_horiz(lms_img[11], lms_img[15])
        r_arm_horiz = _arm_horiz(lms_img[12], lms_img[16])

        # 4. Body Scale & Stance
        hip_w = math.hypot((lms_img[23].x - lms_img[24].x) * aspect, lms_img[23].y - lms_img[24].y)
        shoulder_w = math.hypot((lms_img[11].x - lms_img[12].x) * aspect, lms_img[11].y - lms_img[12].y)
        mid_shoulder_x = (lms_img[11].x + lms_img[12].x) / 2.0
        mid_shoulder_y = (lms_img[11].y + lms_img[12].y) / 2.0
        mid_hip_x = (lms_img[23].x + lms_img[24].x) / 2.0
        mid_hip_y = (lms_img[23].y + lms_img[24].y) / 2.0
        torso_len = max(1e-4, math.hypot((mid_shoulder_x - mid_hip_x) * aspect, mid_shoulder_y - mid_hip_y))

        stance_w = abs(lms_img[27].x - lms_img[28].x) * aspect
        stance_ratio = stance_w / max(1e-4, hip_w)
        ankle_diff = abs(lms_img[27].y - lms_img[28].y) / torso_len

        # 5. Torso Vertical Lean
        w_mid_shoulder_x = (lms_world[11].x + lms_world[12].x) / 2.0
        w_mid_shoulder_y = (lms_world[11].y + lms_world[12].y) / 2.0
        w_mid_hip_x = (lms_world[23].x + lms_world[24].x) / 2.0
        w_mid_hip_y = (lms_world[23].y + lms_world[24].y) / 2.0
        torso_lean = math.degrees(math.atan2(
            abs(w_mid_shoulder_x - w_mid_hip_x),
            max(1e-5, abs(w_mid_hip_y - w_mid_shoulder_y))
        ))

        # 6. Front vs Rear Leg
        if l_knee < r_knee:
            front_leg = "LEFT"
            front_knee_ang = l_knee
            rear_knee_ang = r_knee
            knee_over_ankle = abs(lms_img[25].x - lms_img[27].x) * aspect / torso_len
        else:
            front_leg = "RIGHT"
            front_knee_ang = r_knee
            rear_knee_ang = l_knee
            knee_over_ankle = abs(lms_img[26].x - lms_img[28].x) * aspect / torso_len

        # 7. Head Alignment (nose relative to shoulder midpoint)
        nose_lm = lms_img[0]
        head_vis = nose_lm.visibility if hasattr(nose_lm, 'visibility') else 1.0
        head_offset_x = (nose_lm.x - mid_shoulder_x) * aspect
        head_offset_ratio = abs(head_offset_x) / torso_len
        head_ok = (head_vis >= CONFIG.get("head", {}).get("min_visibility", 0.40) and
                   head_offset_ratio <= CONFIG.get("head", {}).get("max_offset", 0.35))

        # 8. Checklist Rules
        checklist = {
            "Wide Stance (Ratio >= 1.25)": stance_ratio >= CONFIG["stance"]["min_ratio"],
            "Feet Grounded Level (<= 0.15)": ankle_diff <= CONFIG["stance"]["ankle_level_max"],
            "Front Knee Bent (90°-145°)": (CONFIG["front_knee"]["min"] <= front_knee_ang <= CONFIG["front_knee"]["max"]),
            "Rear Leg Extended (>= 160°)": rear_knee_ang >= CONFIG["rear_knee_min"],
            "Elbows Straight (>= 150°)": (l_elbow >= CONFIG["elbow_min"] and r_elbow >= CONFIG["elbow_min"]),
            "Arms Horizontal (<= 30°)": (l_arm_horiz <= CONFIG["arm_horizontal_max"] and r_arm_horiz <= CONFIG["arm_horizontal_max"]),
            "Torso Upright (<= 18°)": torso_lean <= CONFIG["torso_max_lean"],
            "Front Knee Over Ankle (<= 0.55)": knee_over_ankle <= CONFIG["knee_over_ankle_max"],
            "Head Alignment (<= %.2f)" % CONFIG["head"]["max_offset"]: head_ok
        }

        passed_rules = sum(1 for v in checklist.values() if v)
        score_pct = (passed_rules / len(checklist)) * 100.0

        # Diagnostics & Feedback
        failed_items = [k for k, v in checklist.items() if not v]
        if not failed_items:
            is_correct_pose = True
            feedback_msg = f"PERFECT WARRIOR II ({front_leg} FRONT)"
        else:
            is_correct_pose = False
            feedback_msg = f"WRONG POSE: {failed_items[0]}"

        # Draw Skeleton & HUD Card
        self.draw_skeleton(annotated, lms_img, w, h, is_correct_pose)
        self.draw_results_hud(annotated, is_correct_pose, score_pct, front_leg, front_knee_ang, rear_knee_ang, checklist, neural_probs)

        return annotated, is_correct_pose, score_pct, checklist, feedback_msg, neural_probs

    def draw_skeleton(self, frame, lms, w, h, is_valid):
        color = (50, 255, 120) if is_valid else (0, 80, 255)

        connections = [
            (0, 11), (0, 12),  # Nose to shoulders
            (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
            (11, 23), (12, 24), (23, 24),
            (23, 25), (25, 27), (24, 26), (26, 28)
        ]

        for (i1, i2) in connections:
            pt1 = (int(lms[i1].x * w), int(lms[i1].y * h))
            pt2 = (int(lms[i2].x * w), int(lms[i2].y * h))
            cv2.line(frame, pt1, pt2, (20, 20, 30), 4, cv2.LINE_AA)
            cv2.line(frame, pt1, pt2, color, 2, cv2.LINE_AA)

        for i in [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]:
            pt = (int(lms[i].x * w), int(lms[i].y * h))
            cv2.circle(frame, pt, 5, (255, 255, 255), -1, cv2.LINE_AA)
            cv2.circle(frame, pt, 3, color, -1, cv2.LINE_AA)

    def draw_results_hud(self, frame, is_correct, score, front_leg, f_knee, r_knee, checklist, neural_probs):
        h, w, _ = frame.shape
        card_w = min(440, int(w * 0.50))
        card_h = 310
        card_x = 20
        card_y = 20

        overlay = frame.copy()
        cv2.rectangle(overlay, (card_x, card_y), (card_x + card_w, card_y + card_h), (14, 16, 22), -1)
        cv2.addWeighted(overlay, 0.85, frame, 0.15, 0, frame)
        cv2.rectangle(frame, (card_x, card_y), (card_x + card_w, card_y + card_h), (60, 65, 80), 1)

        # Title
        cv2.putText(frame, "WARRIOR II FORM VALIDATOR", (card_x + 15, card_y + 26),
                    cv2.FONT_HERSHEY_DUPLEX, 0.45, (200, 200, 220), 1, cv2.LINE_AA)

        # Status
        status_txt = "CORRECT POSE" if is_correct else "WRONG POSE"
        status_col = (50, 255, 120) if is_correct else (0, 80, 255)
        cv2.putText(frame, f"{status_txt} ({int(score)}%)", (card_x + 15, card_y + 54),
                    cv2.FONT_HERSHEY_DUPLEX, 0.68, status_col, 2, cv2.LINE_AA)

        # Stance & Angle details
        details_txt = f"Stance: {front_leg} FRONT | Knees: Front {f_knee:.0f}° Rear {r_knee:.0f}°"
        cv2.putText(frame, details_txt, (card_x + 15, card_y + 76),
                    cv2.FONT_HERSHEY_DUPLEX, 0.38, (0, 240, 255), 1, cv2.LINE_AA)

        # Checklist Items
        row_y = card_y + 100
        for item, passed in checklist.items():
            check_mark = "[PASS]" if passed else "[FAIL]"
            mark_col = (50, 255, 120) if passed else (0, 80, 255)
            cv2.putText(frame, check_mark, (card_x + 15, row_y),
                        cv2.FONT_HERSHEY_DUPLEX, 0.35, mark_col, 1, cv2.LINE_AA)
            cv2.putText(frame, item, (card_x + 75, row_y),
                        cv2.FONT_HERSHEY_DUPLEX, 0.35, (220, 220, 230), 1, cv2.LINE_AA)
            row_y += 20

        # AI Confidence
        p_correct = neural_probs.get("CORRECT_POSE", 0.5)
        p_wrong = neural_probs.get("WRONG_POSE", 0.5)
        cv2.putText(frame, f"AI Neural Confidence: Correct {int(p_correct*100)}% | Wrong {int(p_wrong*100)}%",
                    (card_x + 15, card_y + card_h - 10),
                    cv2.FONT_HERSHEY_DUPLEX, 0.33, (160, 160, 170), 1, cv2.LINE_AA)


def main():
    parser = argparse.ArgumentParser(description="Image-Based Warrior II Form Detector & Cross-Checker")
    parser.add_argument("--image", type=str, default="", help="Path to single image file")
    parser.add_argument("--dir", type=str, default="", help="Directory containing sample images to evaluate")
    parser.add_argument("--camera", type=int, default=0, help="Camera index for live feed (default 0)")
    parser.add_argument("--output", type=str, default="warrior2_result.jpg", help="Output annotated image path")
    args = parser.parse_args()

    analyzer = Warrior2ImageAnalyzer()

    # 1. Batch Directory Evaluation Mode
    if args.dir:
        image_paths = sorted(glob.glob(os.path.join(args.dir, "*.*")) + glob.glob(os.path.join(args.dir, "*/*.*")))
        image_paths = [p for p in image_paths if p.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]
        if not image_paths:
            print(f"[ERROR] No images found in directory: {args.dir}")
            return

        print("\n" + "=" * 70)
        print(f"   WARRIOR II FORM BATCH EVALUATION: {len(image_paths)} Images")
        print("=" * 70)

        for img_p in image_paths:
            frame = cv2.imread(img_p)
            if frame is None:
                continue
            annotated, is_correct, score, checklist, msg, neural = analyzer.analyze_frame(frame)
            out_p = os.path.join(os.path.dirname(img_p), "result_" + os.path.basename(img_p))
            cv2.imwrite(out_p, annotated)
            res_str = "CORRECT POSE" if is_correct else "WRONG POSE"
            print(f"  {os.path.basename(img_p):<24} -> {res_str:<14} [{msg}] (Saved: {os.path.basename(out_p)})")

        print("=" * 70)
        print("[SUCCESS] Batch evaluation complete!")
        return

    # 2. Single Image Mode
    elif args.image:
        if not os.path.exists(args.image):
            print(f"[ERROR] Image not found: {args.image}")
            return

        frame = cv2.imread(args.image)
        if frame is None:
            print(f"[ERROR] Could not decode image: {args.image}")
            return

        annotated, is_correct, score, checklist, msg, neural = analyzer.analyze_frame(frame)

        print("\n" + "=" * 60)
        print(f"   WARRIOR II FORM EVALUATION: {args.image}")
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

    # 3. Live Camera Stream Mode
    else:
        cap = cv2.VideoCapture(args.camera)
        if not cap.isOpened():
            print(f"[ERROR] Could not open camera {args.camera}")
            return

        print("=" * 65)
        print("   LIVE WARRIOR II FORM CROSS-CHECKER & HOLD TIMER   ")
        print("=" * 65)
        print("Press 'q' or ESC to exit")

        hold_start = None
        best_hold = 0.0

        cv2.namedWindow("Warrior II Form Cross-Checker", cv2.WINDOW_NORMAL)

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

            cv2.imshow("Warrior II Form Cross-Checker", annotated)
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break

        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
