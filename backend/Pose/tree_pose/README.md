# AI Tree Pose (Vrikshasana) Tracker - Pure JavaScript Version

Full AI application built entirely in **JavaScript** using **MediaPipe Pose JS** and HTML5 Canvas.

> **Architecture:** MediaPipe tracking (untouched) -> classification layer (`tree_pose_engine.js`) -> Ojas HUD (`app.js`).
> The classifier is pure landmark geometry — **no ML model is loaded or used in the browser**, and no simulated "AI confidence" is displayed. The HUD shows real **landmark quality** (MediaPipe visibility) instead.

---

## 🧘‍♂️ Tree Pose (Vrikshasana) Validation Rules:

The complete pose is validated (not just "one ankle higher than the other"):

1. **Landmark quality**: mean visibility ≥ 0.60 across shoulders/hips/knees/ankles/wrists (no single landmark < 0.40). Poor quality → `UNCERTAIN`, never a hold.
2. **Standing leg**: knee angle ≥ 160° (straight).
3. **Lifted leg**: knee angle 30°–135° (genuinely folded, not merely raised).
4. **Foot placement**: proximity + relative-position heuristic — the foot must be both **vertically** on the inner thigh (≥ 0.45 thigh-lengths above the knee) or **calf** (below the knee zone) **and** **horizontally** close to the standing leg (≤ 0.75 shin-lengths). Foot on the knee joint or floating away → `INCORRECT`.
5. **Knee opening**: the lifted knee must abduct ≥ 0.15 torso-lengths outward from the hip line.
6. **Torso**: ≤ 18° lean from vertical.
7. **Head/neck alignment**: the nose must stay within **0.28 torso-lengths** (lateral, aspect-corrected) of the shoulder-line midpoint. Rejects clearly excessive lateral head tilt/displacement; tolerates small natural head movements and minor camera-perspective differences. This is head/neck alignment only — **not** eye-gaze direction.
8. **Hands**: prayer/Anjali at the chest (wrists within 0.45 torso-lengths of each other, inside the chest band) or raised overhead.
9. **Temporal confirmation**: 5 consecutive valid frames confirm a hold; a confirmed hold survives < 3 consecutive bad frames (jitter tolerance). One lucky frame never counts.

**Three-state internal model:** `CORRECT` (holding) / `INCORRECT` (clear rule failure) / `UNCERTAIN` (poor landmark quality — hold timer never progresses).

---

## 🚀 How to Run in JavaScript:

```bash
cd /home/sankhyahrick/Coding/Python/Exercise

# 1. Install dependencies:
npm install

# 2. Start the local server:
npm start
# OR: node server.js
```

Then open your browser at **`http://localhost:3000`**.

### 🎮 Keyboard Controls:
- **`L`**: Toggle MediaPipe skeleton landmarks on/off
- **`R`**: Reset hold timers and streak records
- **`F`**: Toggle fullscreen
- **`D`**: Toggle the dev-only debug HUD (validation state, angles, foot placement, streaks, failed rules). Hidden by default; it never appears in the normal Ojas HUD.

---

## 🧪 Tests (classification logic):

```bash
node test/tree_pose_engine.test.js
```

Covers the full validation matrix: correct Tree Pose, standing-on-one-leg, foot-on-knee, floating foot, straight lifted leg, bent standing leg, wrong hands, torso lean, head alignment (aligned, slight natural tilt, excessive left/right tilt, poor-quality nose landmark), poor landmark quality, and natural-variation tolerance.

## Ojas app integration

- **Geometry**: `web/tree_pose_engine.js` is embedded into the camera WebView
  (`make tree-pose-engine` after editing it).
- **Image classifier, on-device (offline)**: `make tree-pose-onnx` exports
  `trained_tree_pose_model.pth` to an int8 ONNX model in
  `android/app/src/main/assets/web/tree_pose/`, run with onnxruntime-web and
  served offline by `LocalAssetServer` (`http://127.0.0.1:8888/tree_pose/`).
- **Image classifier, server fallback**: `POST /api/tree-pose/classify`
  (`classifier.py`), used only while the on-device model loads or if it fails.
- Like `tree_pose_tracker.py`, the hold timer only starts once the classifier has
  verified the current attempt, and a `wrong > 0.5` verdict breaks the hold. With no
  classifier available at all, MediaPipe geometry decides alone.
- Scoring: longest unbroken hold (seconds).
