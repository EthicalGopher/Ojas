# Raptor: the OJAS student pose model

Raptor is OJAS's own pose model. It is a small, fast **student** that learned from a very large **teacher**, Meta's *SAM 3D Body*. From one ordinary camera frame it estimates a person's 3D body, hands and fingers, small enough to run on a phone.

> **Status (2026-10-12):** still in training. It is **not yet wired into the Android app**. It runs today in the web tracker (`HumanSegmentation`) and in the update video's demo clips. The video says "coming to OJAS soon".

Related notes: how the OJAS update video presents Raptor is in [`video-update/script/narration.md`](../video-update/script/narration.md), Scene 6, and [`video-update/out/youtube.md`](../video-update/out/youtube.md).

---

## 1. Why a student model

| | Teacher: SAM 3D Body | Student: Raptor |
|---|---|---|
| Owner | Meta (gated weights, request access on Hugging Face) | OJAS team |
| Size | ~2 GB checkpoint, large transformer | ~44–55 MB ONNX |
| Speed | Offline labelling only | Real time on-device (goal) |
| Job | Produce "ground truth" body fits | Predict the same output directly |

MediaPipe is fast but only gives 2D-ish landmarks and weak finger shapes. The teacher gives full 3D body, hands and avatar-ready joint rotations, but cannot run on a phone. **Knowledge distillation** gets the teacher's quality into a model small enough to ship.

## 2. Where everything lives

Raptor is not inside this repo. It lives in the sibling project `~/Coding/Python/HumanSegmentation`.

| Path (under `HumanSegmentation/`) | What |
|---|---|
| `mesh/student.py` | Model definition (backbone + MHR head) |
| `mesh/label.py` | Runs the teacher on videos/photos and saves labels |
| `mesh/train_student.py` | Training |
| `mesh/export_student.py` | Export to one self-contained ONNX |
| `mesh/mhr_skeleton.py` | MHR skeleton and mesh in plain ops, so ONNX needs no teacher |
| `mesh/scoreboard.py` | Compares trackers to the teacher on the same frames |
| `mesh/gui/` | **OJAS Model Studio** (GUI on `localhost:7860`) |
| `mesh/checkpoints/` | Runs (`full_1009`, `ft_20261002-1941`, `app_model.pt`) |
| `mesh/data/SOURCES.md` | Training-data sources and licences |
| `models/student.onnx`, `models/student_mesh.onnx` | Shipped model files |
| `src/studentmodel.js`, `src/studentweb.js`, `student.html` | Browser runtime (ONNX Runtime Web) |
| `src/trackerclient.js` | `StudentFeed` and `HybridFeed` trackers |

Update-video demo script: `video-update/tts/run_raptor.py` (this repo).

## 3. Architecture

```
person crop 256×256
  → MobileNetV4 backbone (timm: mobilenetv4_conv_medium.e500_r256_in1k)
  → pooled features
  → MLP (1024 hidden) → MHR parameters
        [global rot6d, body pose, shape, scale, hands]
  + small MLP → weak-perspective camera (s, tx, ty)
  → teacher's own MHRHead → mesh, 70 keypoints, 127 joint positions + rotations
```

Key design choice: the student **reuses the teacher's MHRHead**. Its outputs go through exactly the same conversions as the labels, so parameters, joints and bone rotations can all be supervised directly. The output layers start at zero, so training begins from the neutral body.

### Exported model (`student_mesh.onnx`)

- **Input:** `rgb`, 1×256×256×3, RGB 0–255 float. The crop is square, centred on the person, side = 1.25 × the person's longest side.
- **Outputs:**
  - `joint_rotations` (1×127×3×3): global rotation of every joint, which drives an avatar
  - `joint_positions` (1×127×3): metres, camera frame
  - `keypoints` (1×70×3): MHR70 keypoints
  - `vertices` (1×18439×3): body mesh (triangles in `student_faces.bin`)
  - `camera` (1×3): weak perspective
- `student.onnx` is the lighter variant without the mesh.
- **MediaPipe compatibility:** the 70 MHR keypoints are mapped to MediaPipe's **33 pose landmarks** and **21 points per hand**, so code written for MediaPipe runs on Raptor unchanged. The mapping is in `student_skeleton.json`.
- Export is checked against the full PyTorch student before it is written. No SAM 3D Body and no TorchScript inside.

## 4. Training

1. **Label** with the teacher (`label.py`) into `data/labels/<source>/*.npz`. Poor fits are rejected.
2. **Train** (`train_student.py`). Each sample is a person crop plus the teacher's fit.
3. **Validate** on whole held-out clips. No frame of a validation clip is ever trained on.
4. **Export** (`export_student.py`) and score (`scoreboard.py`).

**Loss terms** (weights from `train_student.py`):

| Term | Weight | Supervises |
|---|---|---|
| `kp3d` | 5.0 | 70 root-relative 3D keypoints |
| `raw` | 1.0 | head's raw parameters (global rot + body pose) |
| `rot` | 1.0 | 127 joint rotations (what an avatar needs) |
| `kp2d` | 1.0 | 2D keypoints in the crop, via the camera |
| `shape`, `scale` | 0.5 each | body shape and scale |
| `hand` | 0.1 | hand pose |

**Live training:** new labelled clips are added every epoch. The Model Studio can take uploads or webcam clips per pose (with a consent check), label them, train, and build an APK with the best model so far.

### Training data

Only data whose licence allows ML training **and** commercial use goes in (see `mesh/data/SOURCES.md`):

| Source | Content | Licence |
|---|---|---|
| `mendeley_fitness` | 26 people × 7 exercises, good/bad form, multiple views | CC BY 4.0 |
| `openimages_person` | ~30,000 photos of 1–2 large people | CC BY 2.0 |
| `openimages_activity` | ~7,300 yoga, fitness, sport, dance photos | CC BY 2.0 |
| `commons_yoga` | Wikimedia "Asanas by name", 160 pose categories | per file (CC0, CC BY, CC BY-SA) |
| `own_recordings` | Only people who agreed in writing | consent |

**Not allowed:** Pexels (its terms forbid ML collection; the 11 trial clips are for side-by-side comparison only), Pixabay, YouTube, Kinetics, REHAB24-6 (non-commercial), and SMPL-based data and models (research-only).

## 5. Results so far

Honest snapshot, and metrics measure different things:

- **Training log, run `full_1009`** (validation on held-out clips): MPJPE ~61–84 mm, joint rotation error ~15–21°, 2D keypoint error ~10–29 px over the first 8 epochs. This is noisy and the run was still early.
- **Scoreboard** (`student_score.json`, run `full_1009`, epoch 2): **MPJPE 152 mm** against the teacher on the 11 held-out trial clips, in the app-style tracking setup. The earlier fine-tune (`ft_20261002-1941`) scored **170 mm**, so the newer run is better.
- The two numbers differ because the scoreboard uses harder, unseen video and no person detector, and compares 12 limb joints hip-centred. Do not compare them directly.
- MPJPE = mean 3D joint distance. PA-MPJPE ignores facing direction. Jitter = frame-to-frame acceleration. Lower is better for all.

### Raptor vs MediaPipe in the web tracker

- **Fused "MediaPipe + my model" mode** (`?tracker=hybrid`, default): MediaPipe leads on joints it sees. Raptor adds at most 8 % where both agree, fills joints MediaPipe cannot see, and swaps back left/right flips. The two agree within ~5 cm across the image and ~9 cm in depth. Steadiness matches MediaPipe alone. It runs at 12–14 fps in a headless test because both models share the main thread (MediaPipe alone: 33 fps).
- **Fingers:** Raptor sees each hand at only ~15 px, so its finger output barely changed between a fist and an open palm. `StudentFeed` therefore runs MediaPipe's hand model on a zoomed crop at Raptor's wrists, and Raptor's own hands are only the fallback.

## 6. How it was shown in the update video

- Scene 6, "Meet Raptor" (2:10–3:00): teacher → student animation (big "SAM 3D Body", small fast "Raptor"), body + hands + fingers skeleton, phone with offline badge, COMING SOON tag.
- Demo clips are **real Raptor output** on Pexels test clips (`video-update/public/raptor/`), labelled "REAL RAPTOR OUTPUT". They were rendered with `run_raptor.py`, which runs `student_mesh.onnx` with the same crop tracking as `studentmodel.js`.
- Pexels clips are used only as test footage, never as training data.
- Video rules: speak "Raptor" as the model name, say it is **in training, coming soon**, and credit "SAM 3D Body is a model by Meta; Raptor is trained by the OJAS team".

## 7. Open work

- Finish training and improve the score. Fingers are the weakest part.
- Add own, consented recordings and, subject to the Daz EULA, synthetic renders of the Daz characters.
- Wire Raptor into the Android app, running on-device, behind the existing MediaPipe pipeline. The hybrid fusion is the safest first step.
- Measure real phone speed. Current speed figures are from desktop and emulator tests.

### Stability upgrade plan (proposed, not yet measured)

Symptoms: skeleton jitter and whole-body drift. These are **hypotheses**; measure where the instability starts before fixing anything.

| Priority | Upgrade | Why |
|---|---|---|
| P0 | Stabilise the person crop (exponential smoothing of centre and size, α≈0.2–0.35; hold the last good crop briefly when the detector drops) | A moving crop gives the model a different image every frame (`src/studentweb.js`, `studentmodel.js`) |
| P0 | Verify coordinate transforms (predicted camera tx/ty, crop offset, crop→screen) | Avoid applying the same compensation twice |
| P1 | One Euro filter on 3D joints (start: min cutoff 1.0 Hz, speed coefficient 0.05, derivative cutoff 1.0 Hz; tune on still and fast clips) | Smooths when still, stays responsive when moving. Filter the 3D output, not only the 2D display |
| P1 | Log and plot camera scale/tx/ty and pelvis position while standing still | Separates camera-estimate noise from root/pose noise |
| P2 | Hybrid fusion: align coordinate spaces before blending, fade between sources, use confidence, flag large disagreements | Stops MediaPipe and Raptor fighting |
| P2 | Bone-length checks and conservative constraints | Catches anatomically inconsistent frames |
| P3 | Temporal-consistency loss on consecutive frames (e.g. second-difference penalty), validated on fast squats, push-ups, yoga transitions | Only if raw predictions stay unstable after P0–P2 |

**Findings so far (2026-10-12, Python replay of `studentmodel.js` on the 11 trial clips, `HumanSegmentation/mesh/stability/replay.py`):**
- Raptor is deterministic: the same frame gives identical output. Jitter comes from the changing input.
- The crop fed back from the previous frame's keypoints was unsmoothed. Its size jittered 2–33 % of body size per frame and the camera scale 2–45 % (worst: push-ups).
- **Done:** crop smoothing (weight 0.3 on the new box, immediate follow on big moves) in `src/studentmodel.js` and `src/studentweb.js`. Raw 3D jitter fell e.g. 99.6 → 40.9 mm (push-up), 47.4 → 30.3 mm (yoga); little change on steady squats.
- **No new One Euro filter needed:** the tracker already runs a One Euro bank with a glitch gate on the student's landmarks (`tracker.js`, minCutoff 1.5, beta 0.6). Replayed on the same clips it cuts jitter by about 60–70 %. With the smoothed crop, filtered 3D jitter is 4–29 mm (e.g. push-up 32.4 → 14.1 mm, yoga 14.2 → 10.2 mm). Adding a second filter would only add lag.
- **Live page check (headless Chrome, real JS, video slowed with the clock scaled; `mesh/stability/`):** world jitter in mm / image jitter in ‰ of the frame, 12 limb joints:

| Clip | MediaPipe | Raptor, old crop | Raptor, new crop | Hybrid, old crop | Hybrid, new crop |
|---|---|---|---|---|---|
| push-up | 6.7 / 2.38 | 20.6 / 12.69 | **11.2 / 5.18** | 3.0 / 1.18 | **2.5 / 1.12** |
| yoga | 10.7 / 1.22 | 13.0 / 3.23 | **9.2 / 2.25** | 1.0 / 0.24 | 1.1 / 0.26 |
| squat | 6.4 / 1.09 | 4.0 / 1.93 | 3.7 / 2.44 | 2.7 / 0.45 | 2.6 / 0.48 |

  Raptor alone: the new crop roughly halves push-up jitter, and yoga bone-length variation fell from 13.8 % to 2.4 %. The hybrid (default) is the steadiest mode with either crop; its ~4 Hz Raptor updates did not show up as extra jitter. The crop→screen transform was checked by hand and on screen (mesh overlay sits on the person). Raptor's push-up *pose* is still poor (the avatar crouches instead of planking): that is accuracy, not stability.
- **Avatar on screen (2026-10-13, `mesh/stability/run_avatar.sh`):** bone jitter in degrees per frame at 30 Hz, body bones:

| Clip | My model, joint rotations | My model, landmarks | Hybrid |
|---|---|---|---|
| push-up | 3.6 | 5.3 | **1.8** |
| yoga | 5.5 | 5.6 | **2.2** |
| squat | 1.2 | 1.9 | 1.4 |

  The hybrid is 2–2.5× steadier on the hard clips with the same range of motion. Raptor alone shakes the same through either avatar path, so what is left is the model's own frame-to-frame noise, not a smoothing bug. (A change to the rotation smoothing's speed estimate was tried and made no difference; reverted.) More smoothing would add lag, so the fix for Raptor alone is temporal training (P3) and more push-up/floor data.
- **Sitting close to the webcam (2026-10-13):** with only the upper body in view, Raptor has to invent the hidden hips and legs, and the guesses move the next crop. Jitter is 3–7× the full-body value on upper-half clips. Neither a crop from the visible points only nor the training framing fixed it at inference. Changes:
  - **App:** "My model" is now `StudentAutoFeed` (`src/trackerclient.js`). Every 6th frame it asks MediaPipe whether the knees and ankles are really in view (Raptor's own landmarks always claim they are). Without legs it switches to the hybrid fusion until the legs are back. Upper-half yoga: avatar jitter 6.4° → 4.3°; a full-body squat stays on Raptor alone. `?autohybrid=0` turns it off.
  - **Training:** `train_student.py --frame-edge P` (crops blacked out below chest..hips, as the app pads a cut-off frame) and `--temporal W` (frame pairs with the same augmentation plus crop wobble; loss on student change vs teacher change). `run_pipeline.sh` now starts new runs with `--temporal 1.0 --frame-edge 0.2 --batch 20`. Smoke-tested on the GPU; no full run yet.
  - **Found:** with no person in view, Raptor alone still reports a body (no person detector). The MediaPipe check sees nobody, so it could gate this later.
- **Not yet tested:** a real phone (the GPU paths failed headless on this machine), and the Android copy of `studentmodel.js` is not updated.

**Diagnosis first:** feed one frozen frame repeatedly, then compare MediaPipe alone, Raptor alone and hybrid.

**Stability benchmark** (separate from accuracy): record standing still (30–60 s), arms out, slow and fast squats (10 reps), push-ups, partial occlusion and slow camera movement. Measure stationary per-joint std dev (2D and 3D separately), root drift, bone-length variation, responsiveness (lag during reps) and fps/latency, for raw Raptor, filtered Raptor, MediaPipe and hybrid.

**Order:** diagnose → improve inference (crop, transforms, filter, camera, fusion) → benchmark and add temporal training → device tests, keeping the current pipeline as fallback. Do not swap MobileNetV4 yet. Later, move inference off the UI thread with a bounded latest-frame queue.

## 8. Commands

```bash
# in HumanSegmentation/
./start.sh                      # run Model Studio on http://localhost:7860 (own model)
./start.sh --training           # also fetch SAM 3D Body (gated; needed for labelling and training)

cd mesh
.venv/bin/python train_student.py --sources mendeley_fitness --epochs 30 --batch 64 --run <name>
.venv/bin/python export_student.py checkpoints/<run>/best.pt
.venv/bin/python scoreboard.py --student checkpoints/<run>/student.onnx

# in sih_exercise/video-update/
python tts/run_raptor.py <clip.mp4> <out_prefix>   # real Raptor overlay for the video
```

## 9. Sources and credit

- Teacher: SAM 3D Body by Meta (`facebook/sam-3d-body-dinov3`).
- Backbone: MobileNetV4 via `timm`.
- Raptor is trained by the OJAS team.
