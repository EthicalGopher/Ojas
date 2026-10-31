/**
 * AI Tree Pose (Vrikshasana) Biomechanical Engine — Classification Layer
 * =====================================================================
 * ARCHITECTURE (per Ojas project rules):
 *   TRACKING       -> MediaPipe Pose JS (app.js, untouched) feeds landmarks here.
 *   CLASSIFICATION -> THIS FILE. Pure geometry + validation on landmarks.
 *                     Internal tri-state: CORRECT / INCORRECT / UNCERTAIN.
 *   PRESENTATION   -> app.js HUD reads the fields below (no new HUD invented):
 *                     formStatus, formColor, feedback, feedbackColor,
 *                     inTreePose, currentHoldSeconds, bestHoldSeconds,
 *                     activeLeg, poseQualityPct, stabilityScore.
 *
 * The classifier validates the COMPLETE pose, not just "one ankle higher":
 *   landmark quality -> standing leg -> lifted leg -> foot placement ->
 *   knee opening -> torso -> head alignment -> hands -> temporal
 *   confirmation -> hold timer.
 *
 * NOTE: There is NO neural network here and NO simulated "AI confidence".
 * A monocular webcam cannot prove physical foot contact; foot placement is a
 * proximity + relative-position heuristic, reported as such.
 */

// ---------------------------------------------------------------------------
// Landmark indices (MediaPipe Pose, 33-point model)
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
// Biomechanical thresholds (synced with tree_pose_config.json)
// ---------------------------------------------------------------------------
const DEFAULT_THRESHOLDS = {
    ASPECT_DEFAULT: 1.7778,
    // Standing leg
    STANDING_KNEE_MIN: 160.0,      // deg — below this the standing knee is bent
    // Lifted leg
    LIFTED_KNEE_MIN: 25.0,         // deg — deep fold with foot high on the thigh projects this low in 2D
    LIFTED_KNEE_MAX: 135.0,        // deg — above = straight/merely-raised leg
    // Foot placement (relative to standing thigh, in thigh-length units:
    // 1.0 = hip line, 0.0 = knee line, negative = below knee)
    FOOT_ON_THIGH_MIN: 0.45,       // at/above this = inner thigh zone
    KNEE_ZONE_HI: 0.40,            // unsafe band around the knee joint
    KNEE_ZONE_LO: -0.10,
    FOOT_CALF_MAX: -0.25,          // at/below this (down to CALF_LOW) = calf zone
    FOOT_CALF_LOW: -0.80,          // below this = foot hanging too low
    FOOT_HORIZ_MAX: 0.75,          // x standing-shin length — foot must hug the leg
    // Knee opening: lifted knee must be laterally abducted from the hip line
    KNEE_OPEN_MIN: 0.15,           // x torso length, aspect-corrected
    // Torso
    TORSO_MAX_LEAN: 18.0,          // deg from vertical
    // Head/neck alignment: lateral nose offset from the shoulder-line midpoint,
    // aspect-corrected and normalized by body scale (torso length).
    HEAD_ALIGNMENT_MAX_OFFSET: 0.28,
    HEAD_MIN_VISIBILITY: 0.40,
    // Hands (normalized by torso length; heights by shoulder-hip span)
    HANDS_TOGETHER_MAX: 0.45,      // wrist gap / torso length
    PRAYER_Y_MIN: 0.10,            // chest band: 0 = shoulder line, 1 = hip line
    PRAYER_Y_MAX: 1.05,
    // Landmark quality
    VIS_MIN: 0.60,                 // required mean visibility of critical landmarks
    VIS_MIN_SINGLE: 0.40,          // no critical landmark may fall below this
    // Temporal confirmation & smoothing
    EMA_ALPHA: 0.35,
    CONFIRM_FRAMES: 5,             // consecutive validated frames to confirm a hold
    BREAK_FRAMES: 3                // consecutive failed frames to break a hold (jitter tolerance)
};

// Allow loading config dynamically if running in Node or browser
let THRESHOLDS = Object.assign({}, DEFAULT_THRESHOLDS);
try {
    if (typeof require !== "undefined") {
        const cfg = require('./tree_pose_config.json');
        if (cfg) {
            THRESHOLDS.VIS_MIN = cfg.quality?.vis_min ?? THRESHOLDS.VIS_MIN;
            THRESHOLDS.VIS_MIN_SINGLE = cfg.quality?.vis_min_single ?? THRESHOLDS.VIS_MIN_SINGLE;
            THRESHOLDS.STANDING_KNEE_MIN = cfg.standing_leg?.knee_min ?? THRESHOLDS.STANDING_KNEE_MIN;
            THRESHOLDS.LIFTED_KNEE_MIN = cfg.lifted_leg?.knee_min ?? THRESHOLDS.LIFTED_KNEE_MIN;
            THRESHOLDS.LIFTED_KNEE_MAX = cfg.lifted_leg?.knee_max ?? THRESHOLDS.LIFTED_KNEE_MAX;
            THRESHOLDS.FOOT_ON_THIGH_MIN = cfg.foot_placement?.on_thigh_min ?? THRESHOLDS.FOOT_ON_THIGH_MIN;
            THRESHOLDS.KNEE_ZONE_HI = cfg.foot_placement?.knee_zone_hi ?? THRESHOLDS.KNEE_ZONE_HI;
            THRESHOLDS.KNEE_ZONE_LO = cfg.foot_placement?.knee_zone_lo ?? THRESHOLDS.KNEE_ZONE_LO;
            THRESHOLDS.FOOT_CALF_MAX = cfg.foot_placement?.calf_max ?? THRESHOLDS.FOOT_CALF_MAX;
            THRESHOLDS.FOOT_CALF_LOW = cfg.foot_placement?.calf_low ?? THRESHOLDS.FOOT_CALF_LOW;
            THRESHOLDS.FOOT_HORIZ_MAX = cfg.foot_placement?.horiz_max ?? THRESHOLDS.FOOT_HORIZ_MAX;
            THRESHOLDS.KNEE_OPEN_MIN = cfg.knee_opening?.open_min ?? THRESHOLDS.KNEE_OPEN_MIN;
            THRESHOLDS.TORSO_MAX_LEAN = cfg.torso_max_lean ?? THRESHOLDS.TORSO_MAX_LEAN;
            THRESHOLDS.HEAD_ALIGNMENT_MAX_OFFSET = cfg.head?.max_offset ?? THRESHOLDS.HEAD_ALIGNMENT_MAX_OFFSET;
            THRESHOLDS.HEAD_MIN_VISIBILITY = cfg.head?.min_visibility ?? THRESHOLDS.HEAD_MIN_VISIBILITY;
            THRESHOLDS.HANDS_TOGETHER_MAX = cfg.hands?.together_max ?? THRESHOLDS.HANDS_TOGETHER_MAX;
            THRESHOLDS.PRAYER_Y_MIN = cfg.hands?.prayer_y_min ?? THRESHOLDS.PRAYER_Y_MIN;
            THRESHOLDS.PRAYER_Y_MAX = cfg.hands?.prayer_y_max ?? THRESHOLDS.PRAYER_Y_MAX;
            THRESHOLDS.EMA_ALPHA = cfg.ema_alpha ?? THRESHOLDS.EMA_ALPHA;
            THRESHOLDS.CONFIRM_FRAMES = cfg.confirm_frames ?? THRESHOLDS.CONFIRM_FRAMES;
            THRESHOLDS.BREAK_FRAMES = cfg.break_frames ?? THRESHOLDS.BREAK_FRAMES;
        }
    }
} catch (e) {
    // Fall back to default thresholds
}

// Candidate stance gate: minimum ankle height difference to nominate a
// standing leg (preserved from the original engine).
const ANKLE_DIFF_MIN = 0.08;

const VISIBILITY_KEYS = ["visibility", "Visibility", "v"];

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Angle at point b formed by rays b->a and b->c, in degrees (2D, image space). */
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

/**
 * True 3D joint angle using MediaPipe world landmarks (meters, hips origin).
 * Preserved from the original engine — world landmarks give metric 3D angles,
 * independent of camera perspective, so they complement the 2D image angle.
 */
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

/** Visibility of a landmark, tolerant of differing property naming. */
function lmVisibility(lm) {
    if (!lm) return 0.0;
    for (const k of VISIBILITY_KEYS) {
        if (typeof lm[k] === "number") return lm[k];
    }
    return 1.0; // plain {x, y} test fixtures have no visibility field
}

// ---------------------------------------------------------------------------
// Aspect-ratio helper. The classifier works in normalized landmark space
// (x, y in [0,1]) but the camera frame is 16:9, so raw x-distances are
// compressed relative to y. Multiply x-deltas by (frameWidth/frameHeight)
// before comparing them to y-based lengths. Defaults to 16:9 (the app's
// camera resolution); app.js updates it from the live video element.
// ---------------------------------------------------------------------------
let ASPECT = 16 / 9;
function setStreamAspect(width, height) {
    if (width > 0 && height > 0) ASPECT = width / height;
}

/** Dynamically updates thresholds and returns the updated set. */
function setThresholds(custom) {
    if (custom && typeof custom === "object") {
        Object.assign(THRESHOLDS, custom);
    }
    return THRESHOLDS;
}

// ---------------------------------------------------------------------------
// Foot placement classification (aspect-correct proximity heuristic)
// relFootY: 1.0 ≈ hip line, 0.0 ≈ knee line, negative below the knee.
// footHorizDist: horizontal gap from the standing leg, in shin lengths.
// ---------------------------------------------------------------------------
function classifyFootPlacement(relFootY, footHorizDist) {
    // Horizontal proximity first: a foot floating sideways away from the
    // standing leg is not placed on it, whatever its height is.
    if (footHorizDist !== null && footHorizDist > THRESHOLDS.FOOT_HORIZ_MAX) {
        return "TOO FAR FROM LEG";
    }
    if (relFootY >= THRESHOLDS.FOOT_ON_THIGH_MIN) return "INNER THIGH (SAFE)";
    if (relFootY >= THRESHOLDS.KNEE_ZONE_LO && relFootY < THRESHOLDS.KNEE_ZONE_HI) {
        return "KNEE JOINT (DANGEROUS!)";
    }
    if (relFootY < THRESHOLDS.FOOT_CALF_LOW) return "FOOT TOO LOW";
    if (relFootY < THRESHOLDS.FOOT_CALF_MAX) return "CALF (SAFE)";
    return "NEAR KNEE"; // between the safe zones and the knee zone
}

// ---------------------------------------------------------------------------
// Hands classification: prayer / Anjali at chest-heart, or raised overhead.
// Distances are normalized by torso length; heights by the shoulder-hip span,
// so body proportions and camera distance don't skew the result.
// ---------------------------------------------------------------------------
function classifyHands(img, scale) {
    const lW = img[LM.LEFT_WRIST], rW = img[LM.RIGHT_WRIST];
    const lS = img[LM.LEFT_SHOULDER], rS = img[LM.RIGHT_SHOULDER];
    const lH = img[LM.LEFT_HIP], rH = img[LM.RIGHT_HIP];

    const midShoulderY = (lS.y + rS.y) / 2.0;
    const midHipY = (lH.y + rH.y) / 2.0;
    const torsoSpan = Math.max(1e-4, midHipY - midShoulderY); // >0 in upright frames

    // Aspect-correct wrist gap, normalized by torso length
    const gap = Math.hypot((lW.x - rW.x) * ASPECT, lW.y - rW.y) / scale;

    // Overhead: both wrists at/above the shoulder line
    if (lW.y <= midShoulderY + 0.02 && rW.y <= midShoulderY + 0.02) {
        return "OVERHEAD";
    }
    // Prayer at chest / upper torso: wrists near each other, inside the chest band
    const wristRel = ((lW.y + rW.y) / 2.0 - midShoulderY) / torsoSpan;
    if (gap <= THRESHOLDS.HANDS_TOGETHER_MAX &&
        wristRel >= THRESHOLDS.PRAYER_Y_MIN && wristRel <= THRESHOLDS.PRAYER_Y_MAX) {
        return "PRAYER";
    }
    return gap <= THRESHOLDS.HANDS_TOGETHER_MAX ? "TOGETHER_LOW" : "INVALID";
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
class MediaPipeTreePoseEngineJS {
    constructor() {
        // ---- Presentation fields consumed by the Ojas HUD in app.js ----
        this.activeLeg = "NONE";
        this.inTreePose = false;     // true only after full validation + temporal confirmation
        this.poseQualityPct = 0.0;
        this.stabilityScore = 85.0;
        this.formStatus = "READY";
        this.formColor = "#00f0ff";
        this.feedback = "Stand tall -> Lift one foot onto inner thigh";
        this.feedbackColor = "#ffffff";

        // ---- Hold timer (only advances on validated CORRECT frames) ----
        this.holdStartTime = null;
        this.currentHoldSeconds = 0.0;
        this.bestHoldSeconds = 0.0;

        // ---- Temporal confirmation ----
        this.correctStreak = 0;      // consecutive fully-valid frames
        this.failedStreak = 0;       // consecutive invalid frames

        // ---- Landmark quality (set each frame by validateLandmarkQuality) ----
        this.landmarkQuality = null;

        // ---- Smoothing (preserved from original engine) ----
        this.smoothedLeftKnee = 180.0;
        this.smoothedRightKnee = 180.0;
        this.smoothedTorso = 0.0;    // deg of lean from vertical (0 = upright)

        // ---- Stability (standing-ankle jitter history, preserved) ----
        this.standingAnkleHistory = [];

        // ---- Last-frame detail (HUD feedback + debug panel) ----
        this.lastValidation = { state: "READY", issues: [], checks: {}, quality: null };
        this.lastStandingKnee = 180.0;
        this.lastLiftedKnee = 180.0;
        this.lastKneeOpen = 0.0;
        this.lastFootPlacement = "UNKNOWN";
        this.lastRelFootY = null;
        this.lastFootHoriz = null;
        this.lastHands = "UNKNOWN";
        this.lastTorso = 0.0;
        this.lastHeadOffset = null;
    }

    resetTimers() {
        this.holdStartTime = null;
        this.currentHoldSeconds = 0.0;
        this.bestHoldSeconds = 0.0;
        this.inTreePose = false;
        this.correctStreak = 0;
        this.failedStreak = 0;
        this.formStatus = "READY";
        this.feedback = "Timers Reset";
        this.feedbackColor = "#ffffff";
    }

    /** Frame without detectable landmarks: never hold, reset streaks. */
    handleFrameWithoutPerson() {
        this.correctStreak = 0;
        this.failedStreak = 0;
        this.landmarkQuality = null;
        this._setNotHolding("NO PERSON", "#ff3b30",
            "Step into camera frame to begin Tree Pose", "#ff3b30");
    }

    /** Frame-to-frame EMA smoothing (preserved from original engine). */
    static ema(prev, next, alpha = 0.35) {
        return (1 - alpha) * prev + alpha * next;
    }

    /**
     * Landmark quality gate (spec §15): mean + min visibility over the
     * landmarks the decision actually depends on — shoulders, hips, knees,
     * ankles, wrists. Foot/heel landmarks are NOT required. Poor quality
     * must never allow a successful verdict.
     */
    validateLandmarkQuality(img) {
        const critical = [
            LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
            LM.LEFT_HIP, LM.RIGHT_HIP,
            LM.LEFT_KNEE, LM.RIGHT_KNEE,
            LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
            LM.LEFT_WRIST, LM.RIGHT_WRIST
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
     * Analyze one frame of landmarks (already mirrored in app.js, as before).
     * Returns the same top-level feature shape the app consumed before
     * (isTreeStance, footPlacement, handsValid, ...) plus richer validation
     * data. Pure geometry — no DOM, no timers.
     */
    analyzePose(landmarks, worldLandmarks = null) {
        const img = landmarks;
        const world = worldLandmarks || landmarks;

        // --- 0. Landmark quality gate ---
        this.validateLandmarkQuality(img);

        // --- 1. Knee angles: 2D image-space fused with 3D world-space ---
        // (2D is perspective-flattened, so take max of 2D and 0.9*3D,
        // preserved from the original engine.)
        const lKnee2D = calculateAngle2D(img[LM.LEFT_HIP], img[LM.LEFT_KNEE], img[LM.LEFT_ANKLE]);
        const rKnee2D = calculateAngle2D(img[LM.RIGHT_HIP], img[LM.RIGHT_KNEE], img[LM.RIGHT_ANKLE]);
        const lKnee3D = calculateAngle3D(world[LM.LEFT_HIP], world[LM.LEFT_KNEE], world[LM.LEFT_ANKLE]);
        const rKnee3D = calculateAngle3D(world[LM.RIGHT_HIP], world[LM.RIGHT_KNEE], world[LM.RIGHT_ANKLE]);
        const lKnee = Math.max(lKnee2D, lKnee3D * 0.90);
        const rKnee = Math.max(rKnee2D, rKnee3D * 0.90);

        this.smoothedLeftKnee = MediaPipeTreePoseEngineJS.ema(this.smoothedLeftKnee, lKnee);
        this.smoothedRightKnee = MediaPipeTreePoseEngineJS.ema(this.smoothedRightKnee, rKnee);

        // --- 2. Body scale references (normalized image coords) ---
        const shoulderW = Math.hypot(
            img[LM.LEFT_SHOULDER].x - img[LM.RIGHT_SHOULDER].x,
            img[LM.LEFT_SHOULDER].y - img[LM.RIGHT_SHOULDER].y
        );
        const hipW = Math.hypot(
            img[LM.LEFT_HIP].x - img[LM.RIGHT_HIP].x,
            img[LM.LEFT_HIP].y - img[LM.RIGHT_HIP].y
        );
        const midShoulderX = (img[LM.LEFT_SHOULDER].x + img[LM.RIGHT_SHOULDER].x) / 2.0;
        const midShoulderY = (img[LM.LEFT_SHOULDER].y + img[LM.RIGHT_SHOULDER].y) / 2.0;
        const midHipX = (img[LM.LEFT_HIP].x + img[LM.RIGHT_HIP].x) / 2.0;
        const midHipY = (img[LM.LEFT_HIP].y + img[LM.RIGHT_HIP].y) / 2.0;
        // Aspect-corrected torso length: keeps x- and y-based lengths comparable
        const torsoLen = Math.max(1e-4, Math.hypot(
            (midShoulderX - midHipX) * ASPECT,
            midShoulderY - midHipY
        ));
        const scale = Math.max(1e-4, Math.max(torsoLen, 0.5 * Math.max(shoulderW, hipW)));

        // --- 3. Candidate standing leg: the LOWER ankle (larger y). This only
        //        nominates a candidate — it is NOT the final decision. ---
        const lAnkleY = img[LM.LEFT_ANKLE].y;
        const rAnkleY = img[LM.RIGHT_ANKLE].y;
        const ankleDiff = Math.abs(lAnkleY - rAnkleY);

        let standingSide = null; // "LEFT" | "RIGHT"
        if (ankleDiff > ANKLE_DIFF_MIN) {
            standingSide = lAnkleY > rAnkleY ? "LEFT" : "RIGHT";
        }
        this.activeLeg = standingSide ? `${standingSide} LEG` : "NONE";

        // Stability jitter on the standing ankle (preserved from original engine)
        if (standingSide) {
            const ankle = standingSide === "LEFT" ? img[LM.LEFT_ANKLE] : img[LM.RIGHT_ANKLE];
            this.standingAnkleHistory.push([ankle.x, ankle.y]);
            if (this.standingAnkleHistory.length > 30) this.standingAnkleHistory.shift();
        }
        if (this.standingAnkleHistory.length > 10) {
            const xs = this.standingAnkleHistory.map(p => p[0]);
            const ys = this.standingAnkleHistory.map(p => p[1]);
            const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
            const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
            const stdX = Math.sqrt(xs.map(x => (x - meanX) ** 2).reduce((a, b) => a + b, 0) / xs.length);
            const stdY = Math.sqrt(ys.map(y => (y - meanY) ** 2).reduce((a, b) => a + b, 0) / ys.length);
            const jitter = (stdX + stdY) / 2.0;
            this.stabilityScore = Math.max(0.0, Math.min(100.0, 100.0 - jitter * 4000.0));
        } else {
            this.stabilityScore = 85.0;
        }

        // --- 4. Torso lean from vertical (world landmarks; 0 = upright) ---
        const wMidShoulderY = (world[LM.LEFT_SHOULDER].y + world[LM.RIGHT_SHOULDER].y) / 2.0;
        const wMidShoulderX = (world[LM.LEFT_SHOULDER].x + world[LM.RIGHT_SHOULDER].x) / 2.0;
        const wMidHipY = (world[LM.LEFT_HIP].y + world[LM.RIGHT_HIP].y) / 2.0;
        const wMidHipX = (world[LM.LEFT_HIP].x + world[LM.RIGHT_HIP].x) / 2.0;
        const torsoLean = (Math.atan2(
            Math.abs(wMidShoulderX - wMidHipX),
            Math.max(1e-5, Math.abs(wMidHipY - wMidShoulderY))
        ) * 180.0) / Math.PI;
        this.smoothedTorso = MediaPipeTreePoseEngineJS.ema(this.smoothedTorso, torsoLean);

        // --- 5. Shared frame flags ---
        const isSitting = this.smoothedLeftKnee < 110.0 && this.smoothedRightKnee < 110.0 && ankleDiff < 0.06;

        // --- 6. Per-side feature extraction ---
        let features;
        if (standingSide) {
            const s = standingSide === "LEFT"
                ? {
                    hip: img[LM.LEFT_HIP], knee: img[LM.LEFT_KNEE], ankle: img[LM.LEFT_ANKLE],
                    kneeAngle: this.smoothedLeftKnee
                }
                : {
                    hip: img[LM.RIGHT_HIP], knee: img[LM.RIGHT_KNEE], ankle: img[LM.RIGHT_ANKLE],
                    kneeAngle: this.smoothedRightKnee
                };
            const liftedSide = standingSide === "LEFT" ? "RIGHT" : "LEFT";
            const lifted = liftedSide === "LEFT"
                ? {
                    hip: img[LM.LEFT_HIP], knee: img[LM.LEFT_KNEE],
                    ankle: img[LM.LEFT_ANKLE], heel: img[LM.LEFT_HEEL], toe: img[LM.LEFT_FOOT_INDEX],
                    kneeAngle: this.smoothedLeftKnee
                }
                : {
                    hip: img[LM.RIGHT_HIP], knee: img[LM.RIGHT_KNEE],
                    ankle: img[LM.RIGHT_ANKLE], heel: img[LM.RIGHT_HEEL], toe: img[LM.RIGHT_FOOT_INDEX],
                    kneeAngle: this.smoothedRightKnee
                };

            const standingLegLen = Math.max(1e-4, Math.hypot(s.hip.x - s.ankle.x, s.hip.y - s.ankle.y));
            const standingShinLen = Math.max(1e-4, Math.hypot(s.knee.x - s.ankle.x, s.knee.y - s.ankle.y));
            const standingThighY = Math.max(1e-4, Math.abs(s.hip.y - s.knee.y));

            // Vertical placement of the lifted foot along the standing leg
            const footTopY = Math.min(
                lifted.ankle.y,
                lifted.heel ? lifted.heel.y : Infinity,
                lifted.toe ? lifted.toe.y : Infinity
            );
            const relFootY = (s.knee.y - footTopY) / standingThighY;

            // Horizontal proximity of the lifted foot to the standing leg line
            // (aspect-correct, in standing-shin-length units)
            const footHorizDist = (Math.abs(lifted.ankle.x - s.ankle.x) * ASPECT) / standingShinLen;

            // Knee opening: lateral abduction of the lifted knee away from the
            // hip line, aspect-corrected, in torso-length units. A merely
            // raised/hanging knee stays under the hip (≈0); a Tree knee does not.
            // Lateral abduction of the lifted knee away from the body center
            // (mid-hips), relative to how far its own hip already sits from
            // that center. Aspect-corrected, in torso-length units.
            const centerX = midHipX;
            const hipOff = Math.abs(lifted.hip.x - centerX) * ASPECT;
            const kneeOff = Math.abs(lifted.knee.x - centerX) * ASPECT;
            const kneeOutwardOffset = (kneeOff - hipOff) / torsoLen;

            const bentKneeAngle = lifted.kneeAngle; // now actually used in validation
            const footLift = ankleDiff / standingLegLen;

            // Head/neck alignment: lateral offset of the nose from the
            // shoulder-line midpoint, aspect-corrected and normalized by the
            // body scale (torso length), so camera distance doesn't skew it.
            // A missing/unusable nose landmark yields null (validator fails
            // closed — poor data must never allow a verdict).
            const noseLm = img[LM.NOSE];
            const headLateralOffset = (noseLm && lmVisibility(noseLm) >= THRESHOLDS.VIS_MIN_SINGLE)
                ? (Math.abs(noseLm.x - midShoulderX) * ASPECT) / scale
                : null;

            features = {
                standingSide,
                isTreeStance: true, // candidate stance only; updateTreePoseState validates fully
                isSitting,
                footPlacement: classifyFootPlacement(relFootY, footHorizDist),
                relFootY,
                footHorizDist,
                footLift,
                kneeOpenedOutward: kneeOutwardOffset >= THRESHOLDS.KNEE_OPEN_MIN,
                kneeOutwardOffset,
                headLateralOffset: headLateralOffset,
                handsState: classifyHands(img, scale),
                handsValid: false, // set below
                torsoUpright: this.smoothedTorso <= THRESHOLDS.TORSO_MAX_LEAN,
                torsoLean: this.smoothedTorso,
                standingKneeAngle: s.kneeAngle,
                bentKneeAngle,
                ankleLift: ankleDiff
            };
            features.handsValid = features.handsState === "PRAYER" || features.handsState === "OVERHEAD";
        } else {
            // No candidate stance: still measure head alignment for feedback.
            const noseLm = img[LM.NOSE];
            const headLateralOffset = (noseLm && lmVisibility(noseLm) >= THRESHOLDS.VIS_MIN_SINGLE)
                ? (Math.abs(noseLm.x - midShoulderX) * ASPECT) / scale
                : null;
            features = {
                standingSide: null,
                isTreeStance: false,
                isSitting,
                footPlacement: "UNKNOWN",
                relFootY: null,
                footHorizDist: null,
                footLift: 0.0,
                kneeOpenedOutward: false,
                kneeOutwardOffset: 0.0,
                headLateralOffset: headLateralOffset,
                handsState: "UNKNOWN",
                handsValid: false,
                torsoUpright: this.smoothedTorso <= THRESHOLDS.TORSO_MAX_LEAN,
                torsoLean: this.smoothedTorso,
                standingKneeAngle: 180.0,
                bentKneeAngle: 180.0,
                ankleLift: ankleDiff
            };
        }

        // --- 7. Debug snapshot (spec §25) ---
        this.lastStandingKnee = features.standingKneeAngle;
        this.lastLiftedKnee = features.bentKneeAngle;
        this.lastKneeOpen = features.kneeOutwardOffset;
        this.lastFootPlacement = features.footPlacement;
        this.lastRelFootY = features.relFootY;
        this.lastFootHoriz = features.footHorizDist;
        this.lastHands = features.handsState;
        this.lastTorso = features.torsoLean;
        this.lastHeadOffset = features.headLateralOffset;

        return features;
    }

    /**
     * Final classification + timer logic. Called by app.js every frame.
     * Pipeline: quality gate -> full pose validation -> temporal confirmation
     * -> hold timer. `neuralProbs` is accepted for backward compatibility and
     * ignored: there is no genuine trained model in the web app, so no
     * simulated "neural" verdict participates in the decision (spec §21).
     */
    updateTreePoseState(features, _ignoredNeuralProbs = null) {
        // 1. Landmark quality gate — poor visibility must NEVER trigger a hold
        const q = this.landmarkQuality;
        if (!q || !q.ok) {
            this._setNotHolding("UNCERTAIN", "#ffd700",
                "Low landmark visibility — adjust lighting / camera angle", "#ffd700");
            this.lastValidation = { state: "UNCERTAIN", issues: ["LOW_VISIBILITY"], checks: {}, quality: q };
            return;
        }

        // 2. Sitting / resting short-circuit
        if (features.isSitting) {
            this._setNotHolding("RESTING / SITTING", "#ff8c00",
                "Sitting Detected -> Stand Up & Begin Tree Pose", "#00b4ff");
            this.lastValidation = { state: "INCORRECT", issues: ["SITTING"], checks: {}, quality: q };
            return;
        }

        // 3. No candidate stance
        if (!features.isTreeStance || !features.standingSide) {
            this._setNotHolding("READY", "#00f0ff",
                "Lift one foot onto inner thigh & join hands", "#ffffff");
            this.lastValidation = { state: "READY", issues: ["NO_STANCE"], checks: {}, quality: q };
            return;
        }

        // 4. Full pose validation (all rules, named per spec §26)
        const checks = {
            standingLeg: this.validateStandingLeg(features),
            liftedLeg: this.validateLiftedLeg(features),
            footPlacement: this.validateFootPlacement(features),
            kneeOpening: this.validateKneeOpening(features),
            torso: this.validateTorso(features),
            headAlignment: this.validateHeadAlignment(features),
            hands: this.validateHands(features)
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
            // Small jitter tolerance: a confirmed hold survives < BREAK_FRAMES bad frames
            if (this.failedStreak >= THRESHOLDS.BREAK_FRAMES) {
                this.correctStreak = 0;
            }
        }
        const confirmed = this.correctStreak >= THRESHOLDS.CONFIRM_FRAMES;

        if (confirmed) {
            // Holding (survives brief jitter without resetting the timer)
            this.inTreePose = true;
            this.formStatus = "PERFECT TREE POSE";
            this.formColor = "#32ff78";
            this.poseQualityPct = Math.min(100.0, 90.0 + this.stabilityScore * 0.10);
            const now = performance.now() / 1000;
            if (this.holdStartTime === null) this.holdStartTime = now;
            this.currentHoldSeconds = Math.max(0.0, now - this.holdStartTime);
            if (this.currentHoldSeconds > this.bestHoldSeconds) {
                this.bestHoldSeconds = this.currentHoldSeconds;
            }
            this.feedback = `PERFECT BALANCE! HOLDING: ${this.currentHoldSeconds.toFixed(1)}s`;
            this.feedbackColor = "#32ff78";
        } else if (failed.length === 0) {
            // Geometrically correct, still gathering consecutive frames —
            // the hold timer must NOT progress yet.
            this.inTreePose = false;
            this.formStatus = "CONFIRMING";
            this.formColor = "#ffd700";
            this.poseQualityPct = 0.0;
            this.feedback = "Hold steady — confirming Tree Pose...";
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
        this.inTreePose = false;
        this.formStatus = status;
        this.formColor = statusColor;
        this.poseQualityPct = 0.0;
        this.feedback = feedback;
        this.feedbackColor = feedbackColor;
        this.holdStartTime = null;
        this.currentHoldSeconds = 0.0;
    }

    // ----------------------- Named validators (spec §26) -----------------------

    /** Standing leg reasonably straight (existing knee-angle calc reused). */
    validateStandingLeg(features) {
        const ok = features.standingKneeAngle >= THRESHOLDS.STANDING_KNEE_MIN;
        return { ok, reason: ok ? null : `LOCK STANDING KNEE (${features.standingKneeAngle.toFixed(0)}°)` };
    }

    /** Lifted leg must be a plausible folded Tree leg, not merely raised. */
    validateLiftedLeg(features) {
        const a = features.bentKneeAngle;
        if (a < THRESHOLDS.LIFTED_KNEE_MIN) {
            return { ok: false, reason: `BEND LIFTED KNEE NATURALLY (${a.toFixed(0)}°)` };
        }
        if (a > THRESHOLDS.LIFTED_KNEE_MAX) {
            return { ok: false, reason: `FOLD LIFTED LEG — PLACE FOOT ON LEG (${a.toFixed(0)}°)` };
        }
        return { ok: true, reason: null };
    }

    /**
     * Foot placement: vertical position along the standing leg PLUS horizontal
     * proximity. Vertical Y alone is insufficient (spec §10).
     */
    validateFootPlacement(features) {
        const placement = features.footPlacement;
        if (placement === "INNER THIGH (SAFE)" || placement === "CALF (SAFE)") {
            return { ok: true, reason: null };
        }
        if (placement === "KNEE JOINT (DANGEROUS!)") {
            return { ok: false, reason: "DO NOT PRESS FOOT ON KNEE JOINT!" };
        }
        if (placement === "TOO FAR FROM LEG") {
            return { ok: false, reason: "BRING FOOT TO INNER THIGH / CALF" };
        }
        if (placement === "FOOT TOO LOW") {
            return { ok: false, reason: "LIFT THE FOOT HIGHER ONTO THE LEG" };
        }
        return { ok: false, reason: "ADJUST FOOT — PLACE ON INNER THIGH OR CALF" };
    }

    /** Lifted knee must clearly abduct outward from the hip line (no tautology). */
    validateKneeOpening(features) {
        const ok = features.kneeOpenedOutward;
        return { ok, reason: ok ? null : "OPEN BENT KNEE OUTWARD" };
    }

    /** Torso reasonably upright — tolerates small natural lean. */
    validateTorso(features) {
        const ok = features.torsoUpright;
        return { ok, reason: ok ? null : `STRAIGHTEN SPINE (${features.torsoLean.toFixed(0)}° LEAN)` };
    }

    /**
     * Head/neck alignment: the nose must not sit excessively far to one side
     * of the shoulder-line midpoint. Measured in body-scale units (torso
     * length, aspect-corrected) so camera distance doesn't skew it. Only
     * lateral tilt/displacement is judged — NOT eye gaze direction. A
     * missing/unusable nose landmark (below the single-landmark visibility
     * floor) fails closed: poor data must never allow a successful verdict.
     */
    validateHeadAlignment(features) {
        const off = features.headLateralOffset;
        if (off === null) {
            return { ok: false, reason: "HEAD NOT CLEARLY VISIBLE" };
        }
        const ok = off <= THRESHOLDS.HEAD_ALIGNMENT_MAX_OFFSET;
        return { ok, reason: ok ? null : "LEVEL YOUR HEAD OVER THE SHOULDERS" };
    }

    /** Hands: prayer at chest/heart or raised overhead. */
    validateHands(features) {
        const ok = features.handsValid;
        return {
            ok,
            reason: ok ? null
                : features.handsState === "TOGETHER_LOW" ? "RAISE HANDS TO CHEST / OVERHEAD"
                : "BRING HANDS TO CHEST (PRAYER) OR OVERHEAD"
        };
    }

    // ------------------------- Debug helpers (spec §25) ------------------------

    /** Development-only debug snapshot; the Ojas HUD stays clean by default. */
    getDebugInfo() {
        return {
            state: this.lastValidation.state,
            issues: this.lastValidation.issues,
            checks: this.lastValidation.checks,
            quality: this.landmarkQuality,
            standingLeg: this.activeLeg,
            standingKneeAngle: this.lastStandingKnee,
            liftedKneeAngle: this.lastLiftedKnee,
            kneeOpening: this.lastKneeOpen,
            footPlacement: this.lastFootPlacement,
            relFootY: this.lastRelFootY,
            footHorizDist: this.lastFootHoriz,
            hands: this.lastHands,
            torsoLean: this.lastTorso,
            headLateralOffset: this.lastHeadOffset,
            correctStreak: this.correctStreak,
            failedStreak: this.failedStreak,
            confirmFrames: THRESHOLDS.CONFIRM_FRAMES,
            breakFrames: THRESHOLDS.BREAK_FRAMES,
            inTreePose: this.inTreePose,
            holdSeconds: this.currentHoldSeconds
        };
    }
}

// ---------------------------------------------------------------------------
// Export for both browser (global) and Node (test harness)
// ---------------------------------------------------------------------------
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        MediaPipeTreePoseEngineJS,
        calculateAngle2D,
        calculateAngle3D,
        classifyFootPlacement,
        classifyHands,
        setStreamAspect,
        setThresholds,
        DEFAULT_THRESHOLDS,
        THRESHOLDS,
        LM,
        ANKLE_DIFF_MIN
    };
}
