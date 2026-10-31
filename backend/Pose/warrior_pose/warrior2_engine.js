/**
 * AI Warrior II (Virabhadrasana II) Biomechanical Engine — Classification Layer
 * ==============================================================================
 * ARCHITECTURE (reproduced exactly from Tree Pose workflow):
 *   TRACKING       -> MediaPipe Pose JS (app.js) feeds landmarks here.
 *   CLASSIFICATION -> THIS FILE. Pure geometry + biomechanical validation.
 *                     Tri-state model: CORRECT / INCORRECT / UNCERTAIN.
 *   PRESENTATION   -> app.js HUD reads fields below:
 *                     formStatus, formColor, feedback, feedbackColor,
 *                     inWarrior2, currentHoldSeconds, bestHoldSeconds,
 *                     activeStance, poseQualityPct, stabilityScore.
 *
 * Warrior II (Virabhadrasana II) Validation Rules:
 *   1. Landmark quality: mean visibility >= 0.60 across shoulders/elbows/wrists/
 *      hips/knees/ankles (no single critical landmark < 0.40).
 *   2. Stance: wide lunge stance (ankle separation >= 1.25 hip-widths) with
 *      both feet grounded (ankle level difference <= 0.15 torso-lengths).
 *   3. Front leg: front knee bent deeply into lunge (90.0°–145.0°) with knee
 *      stacked stably over ankle (<= 0.55 torso-lengths horizontal offset).
 *   4. Rear leg: rear knee extended and straight (>= 160.0°).
 *   5. Arms: both arms extended parallel to the mat in T-shape (elbow angles
 *      >= 150.0°, arms within 30.0° of horizontal, opposite horizontal reach).
 *   6. Torso & Spine: upright vertical spine (<= 18.0° lean from vertical).
 *   7. Head Alignment: nose remains centered over shoulder midpoint (ratio <= 0.50),
 *      normalized by torso length. Allows natural head movement while catching
 *      excessive forward/backward lean. Skips when nose visibility < 0.40.
 *   8. Temporal confirmation: 5 consecutive valid frames confirm hold; a confirmed
 *      hold survives < 3 consecutive bad frames (jitter tolerance).
 */

// ---------------------------------------------------------------------------
// Landmark indices (MediaPipe Pose 33-point model)
// ---------------------------------------------------------------------------
const LM = {
    NOSE: 0,
    LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
    LEFT_WRIST: 15, RIGHT_WRIST: 16,
    LEFT_HIP: 23, RIGHT_HIP: 24,
    LEFT_KNEE: 25, RIGHT_KNEE: 26,
    LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
    LEFT_HEEL: 29, RIGHT_HEEL: 30,
    LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32
};

// ---------------------------------------------------------------------------
// Biomechanical thresholds (synced with warrior2_config.json)
// ---------------------------------------------------------------------------
const DEFAULT_THRESHOLDS = {
    ASPECT_DEFAULT: 1.7778,
    // Landmark quality
    VIS_MIN: 0.60,
    VIS_MIN_SINGLE: 0.40,
    // Stance
    STANCE_MIN_RATIO: 1.25,        // stance width relative to hip width
    ANKLE_LEVEL_MAX: 0.15,         // max vertical ankle height difference (torso-lengths)
    // Front knee
    FRONT_KNEE_MIN: 90.0,          // deg
    FRONT_KNEE_MAX: 145.0,         // deg
    KNEE_OVER_ANKLE_MAX: 0.55,     // max horizontal front knee offset over ankle (torso-lengths)
    // Rear leg
    REAR_KNEE_MIN: 160.0,          // deg
    // Arms (T-shape horizontal)
    ELBOW_MIN: 150.0,              // deg - both elbows straight
    ARM_HORIZONTAL_MAX: 30.0,      // deg - deviation from horizontal (0° = level)
    WRIST_SPAN_MIN: 1.15,          // wrist separation in scale units (arms on opposite sides)
    // Torso
    TORSO_MAX_LEAN: 18.0,          // deg from vertical
    // Head alignment (nose relative to shoulder midpoint)
    HEAD_MAX_OFFSET: 0.50,         // max ratio of |nose_x - mid_shoulder_x| / shoulder_width
    HEAD_MIN_VISIBILITY: 0.40,     // minimum nose landmark visibility for head check
    // Temporal confirmation & smoothing
    EMA_ALPHA: 0.35,
    CONFIRM_FRAMES: 5,
    BREAK_FRAMES: 3
};

// Allow loading config dynamically if running in Node or browser
let THRESHOLDS = Object.assign({}, DEFAULT_THRESHOLDS);
try {
    if (typeof require !== "undefined") {
        const cfg = require('./warrior2_config.json');
        if (cfg) {
            THRESHOLDS.VIS_MIN = cfg.quality?.vis_min ?? THRESHOLDS.VIS_MIN;
            THRESHOLDS.VIS_MIN_SINGLE = cfg.quality?.vis_min_single ?? THRESHOLDS.VIS_MIN_SINGLE;
            THRESHOLDS.STANCE_MIN_RATIO = cfg.stance?.min_ratio ?? THRESHOLDS.STANCE_MIN_RATIO;
            THRESHOLDS.ANKLE_LEVEL_MAX = cfg.stance?.ankle_level_max ?? THRESHOLDS.ANKLE_LEVEL_MAX;
            THRESHOLDS.FRONT_KNEE_MIN = cfg.front_knee?.min ?? THRESHOLDS.FRONT_KNEE_MIN;
            THRESHOLDS.FRONT_KNEE_MAX = cfg.front_knee?.max ?? THRESHOLDS.FRONT_KNEE_MAX;
            THRESHOLDS.REAR_KNEE_MIN = cfg.rear_knee_min ?? THRESHOLDS.REAR_KNEE_MIN;
            THRESHOLDS.KNEE_OVER_ANKLE_MAX = cfg.knee_over_ankle_max ?? THRESHOLDS.KNEE_OVER_ANKLE_MAX;
            THRESHOLDS.ELBOW_MIN = cfg.elbow_min ?? THRESHOLDS.ELBOW_MIN;
            THRESHOLDS.ARM_HORIZONTAL_MAX = cfg.arm_horizontal_max ?? THRESHOLDS.ARM_HORIZONTAL_MAX;
            THRESHOLDS.TORSO_MAX_LEAN = cfg.torso_max_lean ?? THRESHOLDS.TORSO_MAX_LEAN;
            THRESHOLDS.HEAD_MAX_OFFSET = cfg.head?.max_offset ?? THRESHOLDS.HEAD_MAX_OFFSET;
            THRESHOLDS.HEAD_MIN_VISIBILITY = cfg.head?.min_visibility ?? THRESHOLDS.HEAD_MIN_VISIBILITY;
            THRESHOLDS.EMA_ALPHA = cfg.ema_alpha ?? THRESHOLDS.EMA_ALPHA;
            THRESHOLDS.CONFIRM_FRAMES = cfg.confirm_frames ?? THRESHOLDS.CONFIRM_FRAMES;
            THRESHOLDS.BREAK_FRAMES = cfg.break_frames ?? THRESHOLDS.BREAK_FRAMES;
        }
    }
} catch (e) {
    // Fall back to default thresholds
}

const VISIBILITY_KEYS = ["visibility", "Visibility", "v"];

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Angle at point b formed by rays b->a and b->c, in degrees [0, 180]. */
function calculateAngle2D(a, b, c) {
    if (!a || !b || !c) return 180.0;
    const bax = a.x - b.x, bay = a.y - b.y;
    const bcx = c.x - b.x, bcy = c.y - b.y;
    const n1 = Math.hypot(bax, bay);
    const n2 = Math.hypot(bcx, bcy);
    if (n1 < 1e-6 || n2 < 1e-6) return 180.0;
    const dot = bax * bcx + bay * bcy;
    const cosine = Math.max(-1.0, Math.min(1.0, dot / (n1 * n2)));
    return (Math.acos(cosine) * 180.0) / Math.PI;
}

/** True 3D joint angle using MediaPipe world landmarks (meters, hips origin). */
function calculateAngle3D(a, b, c) {
    if (!a || !b || !c) return 180.0;
    const ba = [a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)];
    const bc = [c.x - b.x, c.y - b.y, (c.z || 0) - (b.z || 0)];
    const n1 = Math.hypot(...ba);
    const n2 = Math.hypot(...bc);
    if (n1 < 1e-6 || n2 < 1e-6) return 180.0;
    const dot = ba[0] * bc[0] + ba[1] * bc[1] + ba[2] * bc[2];
    const cosine = Math.max(-1.0, Math.min(1.0, dot / (n1 * n2)));
    return (Math.acos(cosine) * 180.0) / Math.PI;
}

/** Visibility of a landmark. */
function lmVisibility(lm) {
    if (!lm) return 0.0;
    for (const k of VISIBILITY_KEYS) {
        if (typeof lm[k] === "number") return lm[k];
    }
    return 1.0;
}

// Aspect ratio helper (defaults to 16:9).
let ASPECT = 16 / 9;
function setStreamAspect(width, height) {
    if (width > 0 && height > 0) ASPECT = width / height;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
class MediaPipeWarrior2EngineJS {
    constructor() {
        // Presentation fields consumed by HUD
        this.activeStance = "NONE";       // "LEFT FRONT" or "RIGHT FRONT"
        this.inWarrior2 = false;          // true only when confirmed
        this.poseQualityPct = 0.0;
        this.stabilityScore = 85.0;
        this.formStatus = "READY";
        this.formColor = "#00f0ff";
        this.feedback = "Step into wide lunge & extend arms in T-shape";
        this.feedbackColor = "#ffffff";

        // Hold timer
        this.holdStartTime = null;
        this.currentHoldSeconds = 0.0;
        this.bestHoldSeconds = 0.0;

        // Temporal confirmation
        this.correctStreak = 0;
        this.failedStreak = 0;

        // Landmark quality
        this.landmarkQuality = null;

        // Smoothing (EMA)
        this.smoothedLeftKnee = 180.0;
        this.smoothedRightKnee = 180.0;
        this.smoothedLeftElbow = 180.0;
        this.smoothedRightElbow = 180.0;
        this.smoothedLeftArmHoriz = 0.0;
        this.smoothedRightArmHoriz = 0.0;
        this.smoothedTorso = 0.0;         // deg lean from vertical (0 = upright)
        this.smoothedHeadOffset = 0.0;     // ratio: |nose_x - mid_shoulder_x| / shoulder_width

        // Stability buffer
        this.ankleJitterHistory = [];

        // Last-frame diagnostics & debug snapshot
        this.lastValidation = { state: "READY", issues: [], checks: {}, quality: null };
        this.lastFrontKnee = 180.0;
        this.lastRearKnee = 180.0;
        this.lastFrontKneeOffset = 0.0;
        this.lastLeftElbow = 180.0;
        this.lastRightElbow = 180.0;
        this.lastLeftArmHoriz = 0.0;
        this.lastRightArmHoriz = 0.0;
        this.lastTorsoLean = 0.0;
        this.lastStanceRatio = 0.0;
        this.lastHeadOffset = 0.0;
    }

    resetTimers() {
        this.holdStartTime = null;
        this.currentHoldSeconds = 0.0;
        this.bestHoldSeconds = 0.0;
        this.inWarrior2 = false;
        this.correctStreak = 0;
        this.failedStreak = 0;
        this.formStatus = "READY";
        this.feedback = "Timers Reset";
        this.feedbackColor = "#ffffff";
    }

    handleFrameWithoutPerson() {
        this.correctStreak = 0;
        this.failedStreak = 0;
        this.landmarkQuality = null;
        this._setNotHolding("NO PERSON", "#ff3b30",
            "Step into camera frame to begin Warrior II", "#ff3b30");
    }

    static ema(prev, next, alpha = 0.35) {
        return (1 - alpha) * prev + alpha * next;
    }

    /**
     * Landmark quality gate: verifies visibility over critical Warrior II joints
     * (shoulders, elbows, wrists, hips, knees, ankles, nose).
     */
    validateLandmarkQuality(img) {
        const critical = [
            LM.NOSE,                              // Head (required for head alignment check)
            LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
            LM.LEFT_ELBOW, LM.RIGHT_ELBOW,
            LM.LEFT_WRIST, LM.RIGHT_WRIST,
            LM.LEFT_HIP, LM.RIGHT_HIP,
            LM.LEFT_KNEE, LM.RIGHT_KNEE,
            LM.LEFT_ANKLE, LM.RIGHT_ANKLE
        ];
        let sum = 0.0;
        let min = 1.0;
        for (const i of critical) {
            const v = lmVisibility(img[i]);
            sum += v;
            if (v < min) min = v;
        }
        const mean = sum / critical.length;
        this.landmarkQuality = {
            mean,
            min,
            ok: mean >= THRESHOLDS.VIS_MIN && min >= THRESHOLDS.VIS_MIN_SINGLE
        };
        return this.landmarkQuality;
    }

    /**
     * Analyze one frame of landmarks (normalized image coords).
     */
    analyzePose(landmarks, worldLandmarks = null) {
        const img = landmarks;
        const world = worldLandmarks || landmarks;

        // 0. Landmark quality gate
        this.validateLandmarkQuality(img);

        // 1. Knee angles (2D image fused with 3D world)
        const lKnee2D = calculateAngle2D(img[LM.LEFT_HIP], img[LM.LEFT_KNEE], img[LM.LEFT_ANKLE]);
        const rKnee2D = calculateAngle2D(img[LM.RIGHT_HIP], img[LM.RIGHT_KNEE], img[LM.RIGHT_ANKLE]);
        const lKnee3D = calculateAngle3D(world[LM.LEFT_HIP], world[LM.LEFT_KNEE], world[LM.LEFT_ANKLE]);
        const rKnee3D = calculateAngle3D(world[LM.RIGHT_HIP], world[LM.RIGHT_KNEE], world[LM.RIGHT_ANKLE]);
        const lKnee = Math.max(lKnee2D, lKnee3D * 0.90);
        const rKnee = Math.max(rKnee2D, rKnee3D * 0.90);

        this.smoothedLeftKnee = MediaPipeWarrior2EngineJS.ema(this.smoothedLeftKnee, lKnee, THRESHOLDS.EMA_ALPHA);
        this.smoothedRightKnee = MediaPipeWarrior2EngineJS.ema(this.smoothedRightKnee, rKnee, THRESHOLDS.EMA_ALPHA);

        // 2. Elbow angles
        const lElbow = calculateAngle2D(img[LM.LEFT_SHOULDER], img[LM.LEFT_ELBOW], img[LM.LEFT_WRIST]);
        const rElbow = calculateAngle2D(img[LM.RIGHT_SHOULDER], img[LM.RIGHT_ELBOW], img[LM.RIGHT_WRIST]);
        this.smoothedLeftElbow = MediaPipeWarrior2EngineJS.ema(this.smoothedLeftElbow, lElbow, THRESHOLDS.EMA_ALPHA);
        this.smoothedRightElbow = MediaPipeWarrior2EngineJS.ema(this.smoothedRightElbow, rElbow, THRESHOLDS.EMA_ALPHA);

        // 3. Body scale references
        const hipW = Math.hypot(
            (img[LM.LEFT_HIP].x - img[LM.RIGHT_HIP].x) * ASPECT,
            img[LM.LEFT_HIP].y - img[LM.RIGHT_HIP].y
        );
        const shoulderW = Math.hypot(
            (img[LM.LEFT_SHOULDER].x - img[LM.RIGHT_SHOULDER].x) * ASPECT,
            img[LM.LEFT_SHOULDER].y - img[LM.RIGHT_SHOULDER].y
        );
        const midShoulderX = (img[LM.LEFT_SHOULDER].x + img[LM.RIGHT_SHOULDER].x) / 2.0;
        const midShoulderY = (img[LM.LEFT_SHOULDER].y + img[LM.RIGHT_SHOULDER].y) / 2.0;
        const midHipX = (img[LM.LEFT_HIP].x + img[LM.RIGHT_HIP].x) / 2.0;
        const midHipY = (img[LM.LEFT_HIP].y + img[LM.RIGHT_HIP].y) / 2.0;

        const torsoLen = Math.max(1e-4, Math.hypot(
            (midShoulderX - midHipX) * ASPECT,
            midShoulderY - midHipY
        ));
        const scale = Math.max(1e-4, Math.max(torsoLen, 0.5 * Math.max(shoulderW, hipW)));

        // 4. Stance width & feet elevation
        const lAnkle = img[LM.LEFT_ANKLE];
        const rAnkle = img[LM.RIGHT_ANKLE];
        const stanceWidth = Math.abs(lAnkle.x - rAnkle.x) * ASPECT;
        const stanceRatio = stanceWidth / Math.max(1e-4, hipW);
        const ankleLevelDiff = Math.abs(lAnkle.y - rAnkle.y) / torsoLen;

        // 5. Arm horizontal alignment (degrees from horizontal vector [1, 0])
        const calcArmHoriz = (shoulder, wrist) => {
            const dx = Math.abs(wrist.x - shoulder.x);
            const dy = Math.abs(wrist.y - shoulder.y);
            return (Math.atan2(dy, Math.max(1e-5, dx)) * 180.0) / Math.PI;
        };
        const lArmHoriz = calcArmHoriz(img[LM.LEFT_SHOULDER], img[LM.LEFT_WRIST]);
        const rArmHoriz = calcArmHoriz(img[LM.RIGHT_SHOULDER], img[LM.RIGHT_WRIST]);
        this.smoothedLeftArmHoriz = MediaPipeWarrior2EngineJS.ema(this.smoothedLeftArmHoriz, lArmHoriz, THRESHOLDS.EMA_ALPHA);
        this.smoothedRightArmHoriz = MediaPipeWarrior2EngineJS.ema(this.smoothedRightArmHoriz, rArmHoriz, THRESHOLDS.EMA_ALPHA);

        // Wrist span (both arms extended to opposite sides)
        const wristSpan = Math.abs(img[LM.LEFT_WRIST].x - img[LM.RIGHT_WRIST].x) * ASPECT / scale;

        // 6. Torso vertical lean (world landmarks; 0 = upright)
        const wMidShoulderY = (world[LM.LEFT_SHOULDER].y + world[LM.RIGHT_SHOULDER].y) / 2.0;
        const wMidShoulderX = (world[LM.LEFT_SHOULDER].x + world[LM.RIGHT_SHOULDER].x) / 2.0;
        const wMidHipY = (world[LM.LEFT_HIP].y + world[LM.RIGHT_HIP].y) / 2.0;
        const wMidHipX = (world[LM.LEFT_HIP].x + world[LM.RIGHT_HIP].x) / 2.0;
        const torsoLean = (Math.atan2(
            Math.abs(wMidShoulderX - wMidHipX),
            Math.max(1e-5, Math.abs(wMidHipY - wMidShoulderY))
        ) * 180.0) / Math.PI;
        this.smoothedTorso = MediaPipeWarrior2EngineJS.ema(this.smoothedTorso, torsoLean, THRESHOLDS.EMA_ALPHA);

        // 7. Head Alignment (nose relative to shoulder midpoint, normalized by torso length)
        const noseLm = img[LM.NOSE];
        const headOffX = (noseLm.x - midShoulderX) * ASPECT;
        const headOffRatio = Math.abs(headOffX) / Math.max(1e-4, torsoLen);
        const headVis = lmVisibility(noseLm);
        this.smoothedHeadOffset = MediaPipeWarrior2EngineJS.ema(this.smoothedHeadOffset, headOffRatio, THRESHOLDS.EMA_ALPHA);

        // 8. Leg & Stance Identification: front (bent lunge) vs rear (straight)
        let frontSide = null; // "LEFT" or "RIGHT"
        let rearSide = null;
        let frontKneeAngle = 180.0;
        let rearKneeAngle = 180.0;
        let kneeOverAnkleOffset = 0.0;

        // Check if one knee is significantly more bent than the other
        const kneeDiff = Math.abs(this.smoothedLeftKnee - this.smoothedRightKnee);
        if (kneeDiff >= 15.0 || this.smoothedLeftKnee <= 150.0 || this.smoothedRightKnee <= 150.0) {
            if (this.smoothedLeftKnee < this.smoothedRightKnee) {
                frontSide = "LEFT";
                rearSide = "RIGHT";
                frontKneeAngle = this.smoothedLeftKnee;
                rearKneeAngle = this.smoothedRightKnee;
                kneeOverAnkleOffset = Math.abs(img[LM.LEFT_KNEE].x - img[LM.LEFT_ANKLE].x) * ASPECT / torsoLen;
            } else {
                frontSide = "RIGHT";
                rearSide = "LEFT";
                frontKneeAngle = this.smoothedRightKnee;
                rearKneeAngle = this.smoothedLeftKnee;
                kneeOverAnkleOffset = Math.abs(img[LM.RIGHT_KNEE].x - img[LM.RIGHT_ANKLE].x) * ASPECT / torsoLen;
            }
        }
        this.activeStance = frontSide ? `${frontSide} FRONT` : "NONE";

        // Stability jitter buffer
        this.ankleJitterHistory.push([lAnkle.x, lAnkle.y, rAnkle.x, rAnkle.y]);
        if (this.ankleJitterHistory.length > 30) this.ankleJitterHistory.shift();
        if (this.ankleJitterHistory.length > 10) {
            const xs = this.ankleJitterHistory.map(p => p[0] + p[2]);
            const ys = this.ankleJitterHistory.map(p => p[1] + p[3]);
            const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
            const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
            const stdX = Math.sqrt(xs.map(x => (x - meanX) ** 2).reduce((a, b) => a + b, 0) / xs.length);
            const stdY = Math.sqrt(ys.map(y => (y - meanY) ** 2).reduce((a, b) => a + b, 0) / ys.length);
            const jitter = (stdX + stdY) / 2.0;
            this.stabilityScore = Math.max(0.0, Math.min(100.0, 100.0 - jitter * 3500.0));
        } else {
            this.stabilityScore = 85.0;
        }

        const isSitting = this.smoothedLeftKnee < 110.0 && this.smoothedRightKnee < 110.0 && stanceRatio < 1.10;

        const features = {
            frontSide,
            rearSide,
            isWarriorStance: frontSide !== null && stanceRatio >= 1.0,
            isSitting,
            stanceWidth,
            stanceRatio,
            ankleLevelDiff,
            frontKneeAngle,
            rearKneeAngle,
            kneeOverAnkleOffset,
            leftElbowAngle: this.smoothedLeftElbow,
            rightElbowAngle: this.smoothedRightElbow,
            leftArmHoriz: this.smoothedLeftArmHoriz,
            rightArmHoriz: this.smoothedRightArmHoriz,
            wristSpan,
            torsoLean: this.smoothedTorso,
            torsoUpright: this.smoothedTorso <= THRESHOLDS.TORSO_MAX_LEAN,
            headOffsetRatio: this.smoothedHeadOffset,
            headVisibility: headVis,
            headAlignmentOk: headVis >= THRESHOLDS.HEAD_MIN_VISIBILITY
                ? this.smoothedHeadOffset <= THRESHOLDS.HEAD_MAX_OFFSET
                : true  // cannot evaluate — defer to quality gate
        };

        // Snapshot debug info
        this.lastFrontKnee = frontKneeAngle;
        this.lastRearKnee = rearKneeAngle;
        this.lastFrontKneeOffset = kneeOverAnkleOffset;
        this.lastLeftElbow = this.smoothedLeftElbow;
        this.lastRightElbow = this.smoothedRightElbow;
        this.lastLeftArmHoriz = this.smoothedLeftArmHoriz;
        this.lastRightArmHoriz = this.smoothedRightArmHoriz;
        this.lastTorsoLean = this.smoothedTorso;
        this.lastStanceRatio = stanceRatio;
        this.lastHeadOffset = this.smoothedHeadOffset;

        return features;
    }

    /**
     * Final validation & hold timer state transition.
     */
    updateWarrior2State(features, _ignoredNeuralProbs = null) {
        // 1. Landmark quality gate
        const q = this.landmarkQuality;
        if (!q || !q.ok) {
            this._setNotHolding("UNCERTAIN", "#ffd700",
                "Low landmark visibility — adjust lighting / camera angle", "#ffd700");
            this.lastValidation = { state: "UNCERTAIN", issues: ["LOW_VISIBILITY"], checks: {}, quality: q };
            return;
        }

        // 2. Sitting short-circuit
        if (features.isSitting) {
            this._setNotHolding("RESTING / SITTING", "#ff8c00",
                "Sitting Detected -> Stand Up & Begin Warrior II", "#00b4ff");
            this.lastValidation = { state: "INCORRECT", issues: ["SITTING"], checks: {}, quality: q };
            return;
        }

        // 3. Stance gate
        if (!features.isWarriorStance || !features.frontSide) {
            this._setNotHolding("READY", "#00f0ff",
                "Step into wide lunge stance & extend arms in T-shape", "#ffffff");
            this.lastValidation = { state: "READY", issues: ["NO_STANCE"], checks: {}, quality: q };
            return;
        }

        // 4. Full biomechanical checks
        const checks = {
            stance: this.validateStance(features),
            frontLeg: this.validateFrontLeg(features),
            rearLeg: this.validateRearLeg(features),
            arms: this.validateArms(features),
            torso: this.validateTorso(features),
            head: this.validateHead(features)
        };

        const failed = Object.entries(checks)
            .filter(([, v]) => !v.ok)
            .map(([k, v]) => v.reason);

        // 5. Temporal confirmation over consecutive frames
        if (failed.length === 0) {
            this.correctStreak += 1;
            this.failedStreak = 0;
        } else {
            this.failedStreak += 1;
            if (this.failedStreak >= THRESHOLDS.BREAK_FRAMES) {
                this.correctStreak = 0;
            }
        }
        const confirmed = this.correctStreak >= THRESHOLDS.CONFIRM_FRAMES;

        if (confirmed) {
            this.inWarrior2 = true;
            this.formStatus = "PERFECT WARRIOR II";
            this.formColor = "#32ff78";
            this.poseQualityPct = Math.min(100.0, 90.0 + this.stabilityScore * 0.10);
            const now = (typeof performance !== "undefined" && performance.now)
                ? performance.now() / 1000
                : Date.now() / 1000;
            if (this.holdStartTime === null) this.holdStartTime = now;
            this.currentHoldSeconds = Math.max(0.0, now - this.holdStartTime);
            if (this.currentHoldSeconds > this.bestHoldSeconds) {
                this.bestHoldSeconds = this.currentHoldSeconds;
            }
            this.feedback = `PERFECT WARRIOR II! HOLDING: ${this.currentHoldSeconds.toFixed(1)}s`;
            this.feedbackColor = "#32ff78";
        } else if (failed.length === 0) {
            this.inWarrior2 = false;
            this.formStatus = "CONFIRMING";
            this.formColor = "#ffd700";
            this.poseQualityPct = 0.0;
            this.feedback = "Hold steady — confirming Warrior II...";
            this.feedbackColor = "#ffd700";
            this.holdStartTime = null;
            this.currentHoldSeconds = 0.0;
        } else {
            this._setNotHolding(failed[0], "#ff3b30", failed[0], "#ff3b30");
        }

        this.lastValidation = {
            state: confirmed ? "CORRECT" : (failed.length === 0 ? "CONFIRMING" : "INCORRECT"),
            issues: failed,
            checks,
            quality: q
        };
    }

    _setNotHolding(status, statusColor, feedback, feedbackColor) {
        this.inWarrior2 = false;
        this.formStatus = status;
        this.formColor = statusColor;
        this.poseQualityPct = 0.0;
        this.feedback = feedback;
        this.feedbackColor = feedbackColor;
        this.holdStartTime = null;
        this.currentHoldSeconds = 0.0;
    }

    // ----------------------- Named validators -----------------------

    /** Stance width and grounding: wide lunge with both feet on floor. */
    validateStance(features) {
        if (features.stanceRatio < THRESHOLDS.STANCE_MIN_RATIO) {
            return {
                ok: false,
                reason: `WIDEN YOUR STANCE (${features.stanceRatio.toFixed(2)} < ${THRESHOLDS.STANCE_MIN_RATIO})`
            };
        }
        if (features.ankleLevelDiff > THRESHOLDS.ANKLE_LEVEL_MAX) {
            return {
                ok: false,
                reason: "KEEP BOTH FEET GROUNDED ON MAT"
            };
        }
        return { ok: true, reason: null };
    }

    /** Front leg: front knee bent into lunge (90°-145°) and tracking over ankle. */
    validateFrontLeg(features) {
        const k = features.frontKneeAngle;
        if (k > THRESHOLDS.FRONT_KNEE_MAX) {
            return {
                ok: false,
                reason: `BEND FRONT KNEE TO 90° (${k.toFixed(0)}° > ${THRESHOLDS.FRONT_KNEE_MAX}°)`
            };
        }
        if (k < THRESHOLDS.FRONT_KNEE_MIN) {
            return {
                ok: false,
                reason: `FRONT KNEE BENT TOO DEEP (${k.toFixed(0)}° < ${THRESHOLDS.FRONT_KNEE_MIN}°)`
            };
        }
        if (features.kneeOverAnkleOffset > THRESHOLDS.KNEE_OVER_ANKLE_MAX) {
            return {
                ok: false,
                reason: "STACK FRONT KNEE OVER ANKLE"
            };
        }
        return { ok: true, reason: null };
    }

    /** Rear leg: straight support line (knee >= 160°). */
    validateRearLeg(features) {
        const k = features.rearKneeAngle;
        if (k < THRESHOLDS.REAR_KNEE_MIN) {
            return {
                ok: false,
                reason: `STRAIGHTEN REAR LEG FULLY (${k.toFixed(0)}° < ${THRESHOLDS.REAR_KNEE_MIN}°)`
            };
        }
        return { ok: true, reason: null };
    }

    /** Arms: both arms extended parallel to floor in T-shape. */
    validateArms(features) {
        const minElbow = Math.min(features.leftElbowAngle, features.rightElbowAngle);
        if (minElbow < THRESHOLDS.ELBOW_MIN) {
            return {
                ok: false,
                reason: `STRAIGHTEN BOTH ELBOWS (${minElbow.toFixed(0)}° < ${THRESHOLDS.ELBOW_MIN}°)`
            };
        }
        const maxArmHoriz = Math.max(features.leftArmHoriz, features.rightArmHoriz);
        if (maxArmHoriz > THRESHOLDS.ARM_HORIZONTAL_MAX) {
            return {
                ok: false,
                reason: `EXTEND ARMS HORIZONTAL IN T-SHAPE (${maxArmHoriz.toFixed(0)}°)`
            };
        }
        if (features.wristSpan < THRESHOLDS.WRIST_SPAN_MIN) {
            return {
                ok: false,
                reason: "EXTEND ARMS TO OPPOSITE SIDES"
            };
        }
        return { ok: true, reason: null };
    }

    /** Torso: upright vertical spine without leaning forward over front knee. */
    validateTorso(features) {
        if (features.torsoLean > THRESHOLDS.TORSO_MAX_LEAN) {
            return {
                ok: false,
                reason: `KEEP TORSO UPRIGHT (${features.torsoLean.toFixed(0)}° LEAN)`
            };
        }
        return { ok: true, reason: null };
    }

    /** Head: nose should remain centered over the shoulder midpoint (upright head, neutral neck).
     *  Skipped (pass) when nose visibility is too low — the quality gate catches that separately. */
    validateHead(features) {
        if (features.headVisibility < THRESHOLDS.HEAD_MIN_VISIBILITY) {
            return { ok: true, reason: null };
        }
        if (features.headOffsetRatio > THRESHOLDS.HEAD_MAX_OFFSET) {
            return {
                ok: false,
                reason: `KEEP HEAD UPRIGHT (offset ${features.headOffsetRatio.toFixed(2)} > ${THRESHOLDS.HEAD_MAX_OFFSET})`
            };
        }
        return { ok: true, reason: null };
    }

    // ----------------------- Debug snapshot -----------------------

    getDebugInfo() {
        return {
            state: this.lastValidation.state,
            issues: this.lastValidation.issues,
            checks: this.lastValidation.checks,
            quality: this.landmarkQuality,
            activeStance: this.activeStance,
            frontKneeAngle: this.lastFrontKnee,
            rearKneeAngle: this.lastRearKnee,
            frontKneeOffset: this.lastFrontKneeOffset,
            leftElbowAngle: this.lastLeftElbow,
            rightElbowAngle: this.lastRightElbow,
            leftArmHoriz: this.lastLeftArmHoriz,
            rightArmHoriz: this.lastRightArmHoriz,
            torsoLean: this.lastTorsoLean,
            stanceRatio: this.lastStanceRatio,
            headOffset: this.lastHeadOffset,
            headMaxOffset: THRESHOLDS.HEAD_MAX_OFFSET,
            correctStreak: this.correctStreak,
            failedStreak: this.failedStreak,
            confirmFrames: THRESHOLDS.CONFIRM_FRAMES,
            breakFrames: THRESHOLDS.BREAK_FRAMES,
            inWarrior2: this.inWarrior2,
            holdSeconds: this.currentHoldSeconds
        };
    }
}

// ---------------------------------------------------------------------------
// Export for browser and Node
// ---------------------------------------------------------------------------
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        MediaPipeWarrior2EngineJS,
        calculateAngle2D,
        calculateAngle3D,
        setStreamAspect,
        THRESHOLDS,
        LM
    };
}
