# AI Warrior II (Virabhadrasana II) Tracker & Form Validator

Full AI application built following the exact architecture and workflow of the reference Tree Pose implementation, providing both a **pure JavaScript client engine** (MediaPipe Pose JS + HTML5 Canvas) and a **Python biomechanical tracker** (MediaPipe Pose 3D + PyTorch ResNet50 neural cross-check).

> **Architecture:** MediaPipe tracking -> classification layer (`warrior2_engine.js` / `warrior2_tracker.py`) -> Floating Glass HUD (`app.js` / OpenCV HUD).
> Biomechanical thresholds are centrally managed by `warrior2_config.json` as the single source of truth shared between Python and JavaScript.

---

## 🧘‍♂️ Warrior II (Virabhadrasana II) Validation Rules

1. **Landmark Quality**: Mean visibility ≥ 0.60 across critical joints (shoulders, elbows, wrists, hips, knees, ankles) with no single landmark < 0.40. Poor quality → `UNCERTAIN` (hold timer never progresses).
2. **Stance Width & Grounding**: Wide lunge stance (ankle separation ≥ 1.25 hip-widths) with both feet grounded on the mat (ankle vertical offset ≤ 0.15 torso-lengths).
3. **Front Leg (Lunge)**: Front knee bent into lunge (90.0°–145.0°) with the front knee stacked stably over the ankle (≤ 0.55 torso-lengths horizontal offset).
4. **Rear Leg (Straight Support Line)**: Rear knee fully extended and straight (≥ 160.0°).
5. **Arms (T-Shape Horizontal)**: Both arms extended parallel to the floor (elbow angles ≥ 150.0°, arm angles within 30.0° of horizontal, wrists reaching to opposite sides).
6. **Torso & Spine**: Centered upright vertical torso (≤ 18.0° lean from vertical).
7. **Temporal Confirmation**: 5 consecutive valid frames confirm hold; a confirmed hold survives < 3 consecutive bad frames (jitter tolerance). Breaks reset the timer.

---

## 🚀 How to Run in JavaScript:

```bash
cd Warrior2

# 1. Install dependencies:
npm install

# 2. Start the local server:
npm start
# OR: node server.js
```

Open your browser at **`http://localhost:3000`**.

### 🎮 Keyboard Controls:
- **`L`**: Toggle MediaPipe skeleton landmarks on/off
- **`R`**: Reset hold timers and streak records
- **`F`**: Toggle fullscreen
- **`D`**: Toggle dev-only debug HUD (validation state, angles, streaks, failed rules)

---

## 🐍 How to Run in Python:

```bash
# 1. Real-time Live Webcam Tracker:
python warrior2_tracker.py --camera 0

# 2. Standalone Exercise Mode (Cobra-pose style):
python warrior2_pose.py

# 3. Batch Image Directory Evaluation:
python warrior2_image.py --dir dataset

# 4. Single Image Evaluation:
python warrior2_image.py --image dataset/correct_pose/warrior2_pose_1.png
```

---

## 🧪 Tests:

### JavaScript Unit Tests:
```bash
node test/warrior2_engine.test.js
```
Runs 43 tests covering: correct pose (left/right front), under-bent front knee, bent rear knee, drooping arms, bent elbows, torso lean, narrow stance, uneven feet, poor landmark visibility, natural variation, temporal confirmation, enter/exit cycles, and body scale variations.

### Python Biomechanical & Timer Tests:
```bash
python test/test_warrior2_python.py
```
Runs 24 programmatic biomechanical checks validating the Python engine, hold timers, best streak recording, and scaling.
