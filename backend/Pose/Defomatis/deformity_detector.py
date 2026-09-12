"""
deformity_detector.py
=====================

BODY-POSTURE DEFORMITY / ASYMMETRY SCREENING LAYER
--------------------------------------------------
This file does ONE job: turn a live webcam frame into a set of *screening*
statements about body alignment (possible knee-alignment pattern, shoulder
asymmetry, hip asymmetry, head tilt, forward head pattern, torso lean), using
MediaPipe Pose landmarks and plain geometry.

It is NOT an exercise detector. There is deliberately:
    - no rep counter
    - no exercise state machine
    - no movement classification
    - no machine learning model / training data

Pipeline (see main() at the bottom):

    Webcam -> BGR frame -> RGB frame -> MediaPipe Pose -> 33 landmarks
           -> geometric measurements (angles / offsets / symmetry ratios)
           -> threshold-based screening checks  -> live HUD result

SELF-CONTAINED FILE (no local module dependency)
-------------------------------------------------
Earlier versions of this file imported their "camera -> landmarks ->
geometry" reference layer (model setup, landmark helpers, skeleton drawing,
moving-average filter, angle/distance math) from a separate
extract_landmarks.py module. That caused a ModuleNotFoundError unless the
other file happened to sit right next to this one under exactly that name.

That reference layer is now INLINED below as Section 1, so this file has
zero dependency on any other project file. It only needs the third-party
packages: `pip install mediapipe opencv-python numpy`. Only the specific
helpers/constants this file actually uses were carried over (e.g. wrist,
elbow, and foot-index landmarks were dropped - the screening checks below
never touch them).

MEDICAL DISCLAIMER
------------------
Every result printed or drawn by this file is a COMPUTER-VISION SCREENING
PATTERN computed from geometric measurements. It is not a medical diagnosis,
and the thresholds in section 3 are configurable prototype values, not
clinical limits.

MERGE / REVIEW NOTES (carried over from the prior two-file version)
---------------------------------------------------------------------
This file merges two earlier versions of the detector and fixes issues found
in each during review:

  - Shoulder/hip asymmetry now normalize by TORSO LENGTH (shoulder-mid to
    hip-mid) rather than shoulder/hip width. Width normalization shrinks
    under yaw rotation (perspective foreshortening) and inflates the ratio
    even with no real asymmetry.
  - Removed a shoulder/hip "camera tilt" guard that compared a torso-length
    normalized ratio against an angle computed from shoulder-width geometry.
    Those are two different normalizations; comparing them via a bare
    radians-to-degrees multiplier only worked by coincidence and could
    silently cancel a genuine detection. Tilt is now shown as informational
    detail only. A principled camera-tilt cross-check (comparing shoulder /
    hip / ankle line tilts against each other) would be a reasonable future
    addition, but isn't implemented here since it hasn't been validated
    against real footage.
  - Knee-alignment labels use neutral screening language ("Inward/Outward
    Knee Alignment") instead of naming actual clinical conditions
    (genu valgum / genu varum), consistent with this project's own
    "not a diagnosis" disclaimer.
  - Removed a "hip-knee-ankle collinearity" check that, after working through
    the cross-product algebra, turned out to be mathematically identical to
    the absolute value of the axis-deviation measurement already computed
    elsewhere in the same function. It added a second smoother and detail
    line but no new information.
  - Removed a dead branch in knee alignment that re-tested "are the legs
    straight?" after a function already returns early when they are not -
    that branch could never execute.
  - Replaced two unused config constants (KNEE_ANGLE_THRESHOLD,
    KNEE_ANGLE_STRONG - declared and documented, never read anywhere) with a
    single KNEE_FLEXION_CAVEAT_THRESHOLD that is actually wired in: a knee
    bent past it gets a "reduced confidence" note rather than being silently
    ignored or, worse, described in a docstring as doing something it didn't.
  - Forward-head detection now uses WHICHEVER ear(s) are actually visible
    (one or two), averaged with the nose. A prior version required both ears
    to be visible - but this check only runs in SIDE view, where a true
    profile pose occludes the far ear almost by definition. Requiring both
    ears meant the check would frequently fail in exactly the view it exists
    for. Another prior version used only the single more-visible ear, which
    biases the reading toward the camera-facing side. Using all visible ears
    (1 or 2) keeps the more accurate combined signal when available and
    degrades gracefully otherwise.
  - The torso-rotation guard's magic number (0.5) is now a named constant
    (BODY_ROTATION_RATIO_THRESHOLD) instead of being unexplained inline,
    replacing an unused, differently-scaled constant that was declared but
    never read.

None of the numeric thresholds below have been re-tuned against real
footage as part of this review - that requires labeled video data this
review didn't have access to. They are carried over as reasonable prototype
defaults; treat them as a starting point for calibration, not as validated
clinical cutoffs.
"""

import time

import cv2
import mediapipe as mp
import numpy as np

from mediapipe.tasks import python
from mediapipe.tasks.python import vision


# =============================================================================
# 1. Reference Layer (formerly a separate extract_landmarks.py module)
# =============================================================================
# Pose model setup, landmark access, geometry helpers, skeleton drawing, and
# the moving-average smoother, all inlined so this file has no dependency on
# any other local file. Only the pieces the screening checks below actually
# use are included.
# =============================================================================

MODEL_PATH = "pose_landmarker_lite.task"
POSE_DETECTION_CONFIDENCE = 0.7
POSE_TRACKING_CONFIDENCE = 0.7
POSE_PRESENCE_CONFIDENCE = 0.7  # required by the Tasks API; keeps the same 0.7 standard


def create_landmarker(model_path=MODEL_PATH):
    """
    Builds and returns a ready-to-use MediaPipe PoseLandmarker, configured
    for single-person video tracking at a 0.7 confidence bar (MediaPipe's
    own common default for fitness/exercise-style applications).
    """
    base_options = python.BaseOptions(model_asset_path=model_path)
    options = vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=POSE_DETECTION_CONFIDENCE,
        min_pose_presence_confidence=POSE_PRESENCE_CONFIDENCE,
        min_tracking_confidence=POSE_TRACKING_CONFIDENCE,
    )
    return vision.PoseLandmarker.create_from_options(options)


# --- Landmark indices (MediaPipe's fixed 33-point order; only the ones
#     this file's checks actually need) ---
NOSE = 0
LEFT_SHOULDER, RIGHT_SHOULDER = 11, 12
LEFT_HIP, RIGHT_HIP = 23, 24
LEFT_KNEE, RIGHT_KNEE = 25, 26
LEFT_ANKLE, RIGHT_ANKLE = 27, 28

# Standard 33-point pose skeleton connections (which landmark indices form a
# "bone" that should be drawn as a line). Used by draw_pose_skeleton().
POSE_CONNECTIONS = [
    (conn.start, conn.end) for conn in vision.PoseLandmarksConnections.POSE_LANDMARKS
]

# --- Video source & shared thresholds ---
VIDEO_SOURCE = 0  # cv2.VideoCapture(0) = default webcam

# Gates whether a frame's measurements are trusted (0.7 matches the model's
# own detection/tracking confidence, keeping "reliable" defined consistently).
VISIBILITY_THRESHOLD = 0.5
# Looser bar used only for on-screen skeleton drawing, so partially-visible
# limbs still show up (in orange) even when not reliable enough to measure.
DRAW_VISIBILITY_THRESHOLD = 0.2
# Rolling window size for the MovingAverage jitter smoother.
SMOOTHING_WINDOW = 5


def get_landmark(pose, landmark_id):
    """Fetches a single landmark object out of the full 33-point list."""
    return pose[landmark_id]


def get_coordinates(landmark, width, height):
    """Converts one landmark's NORMALIZED (x, y) into OpenCV PIXEL (x, y)."""
    x = int(landmark.x * width)
    y = int(landmark.y * height)
    return x, y


def _xy(lm):
    """Pulls a landmark's (x, y) out into a small NumPy array: array([x, y])."""
    return np.array([lm.x, lm.y])


def _midpoint(a, b):
    """The midpoint (x, y) of two landmarks, e.g. center of the shoulders."""
    return (_xy(a) + _xy(b)) / 2


def calculate_angle(a, b, c):
    """
    The angle at joint b, formed by the two bones b->a and b->c (e.g. knee
    angle = angle at the knee, between hip->knee and ankle->knee). Returns
    degrees in [0, 180].
    """
    a, b, c = _xy(a), _xy(b), _xy(c)

    ba = a - b
    bc = c - b

    radians = np.arctan2(bc[1], bc[0]) - np.arctan2(ba[1], ba[0])
    angle = np.abs(radians * 180.0 / np.pi)

    if angle > 180.0:
        angle = 360.0 - angle

    return angle


def calculate_distance(a, b):
    """Straight-line (Euclidean) distance between two landmarks."""
    return float(np.linalg.norm(_xy(a) - _xy(b)))


def vertical_angle_of_vector(vec):
    """
    Angle (degrees) between an arbitrary 2D vector and "straight up".
    0 degrees = vector points exactly upward (upright); 90 = sideways.
    """
    vertical_vec = np.array([0.0, -1.0])  # "up" in image coordinates (y grows downward)

    denom = np.linalg.norm(vec) * np.linalg.norm(vertical_vec)
    if denom < 1e-8:
        return 0.0

    cos_angle = np.dot(vec, vertical_vec) / denom
    cos_angle = np.clip(cos_angle, -1.0, 1.0)

    return float(np.degrees(np.arccos(cos_angle)))


def horizontal_angle_of_vector(vec):
    """
    Same idea as vertical_angle_of_vector(), but measured against "flat
    horizontal" instead of "straight up". 0 degrees means level.
    """
    horizontal_vec = np.array([1.0, 0.0])

    denom = np.linalg.norm(vec) * np.linalg.norm(horizontal_vec)
    if denom < 1e-8:
        return 0.0

    cos_angle = np.dot(vec, horizontal_vec) / denom
    cos_angle = np.clip(cos_angle, -1.0, 1.0)

    return float(np.degrees(np.arccos(cos_angle)))


def calculate_torso_angle(shoulder_l, shoulder_r, hip_l, hip_r):
    """
    Lean of the torso from vertical (0 = perfectly upright), using the
    shoulder-midpoint -> hip-midpoint vector so slight rotation toward or
    away from the camera doesn't throw off the reading.
    """
    shoulder_mid = _midpoint(shoulder_l, shoulder_r)
    hip_mid = _midpoint(hip_l, hip_r)
    return vertical_angle_of_vector(shoulder_mid - hip_mid)


def safe_div(numerator, denominator):
    """
    Division that returns NaN instead of crashing when the denominator is
    missing, zero, or too close to zero to trust.
    """
    if denominator is None or np.isnan(denominator) or abs(denominator) < 1e-8:
        return np.nan
    return numerator / denominator


def draw_pose_skeleton(frame, pose):
    """
    Draws all 33 landmark dots and the skeleton connection lines directly
    onto the OpenCV frame, color-coded by visibility. Green = confident,
    orange = borderline. Landmarks below DRAW_VISIBILITY_THRESHOLD are
    skipped entirely.
    """
    h, w = frame.shape[:2]

    def color_for(visibility):
        if visibility >= VISIBILITY_THRESHOLD:
            return (0, 255, 0)      # Green (BGR order, not RGB!)
        return (0, 165, 255)        # Orange

    for start_idx, end_idx in POSE_CONNECTIONS:
        start_lm = get_landmark(pose, start_idx)
        end_lm = get_landmark(pose, end_idx)

        if start_lm.visibility < DRAW_VISIBILITY_THRESHOLD or \
                end_lm.visibility < DRAW_VISIBILITY_THRESHOLD:
            continue

        edge_color = color_for(min(start_lm.visibility, end_lm.visibility))
        cv2.line(frame, get_coordinates(start_lm, w, h), get_coordinates(end_lm, w, h), edge_color, 2)

    for lm in pose:
        if lm.visibility < DRAW_VISIBILITY_THRESHOLD:
            continue
        cv2.circle(frame, get_coordinates(lm, w, h), 4, color_for(lm.visibility), -1)


class MovingAverage:
    """
    A sliding-window moving-average filter. Smooths frame-to-frame jitter in
    a measurement (visibility, an angle, a ratio, ...) so a single noisy
    frame doesn't flicker the HUD or a "reliable" flag on/off.
    """

    def __init__(self, window_size):
        self.values = []
        self.window_size = window_size

    def update(self, value):
        self.values.append(value)
        if len(self.values) > self.window_size:
            self.values.pop(0)
        return sum(self.values) / len(self.values)

    @property
    def ready(self):
        return len(self.values) > 0


# =============================================================================
# 2. Additional Landmark Indices Used by the Screening Checks
# =============================================================================
# The ears (7, 8) aren't part of the reference layer above since no generic
# exercise angle needs them - only this file's head-tilt / forward-head
# checks do.
LEFT_EAR, RIGHT_EAR = 7, 8

# Broad set used for the HUD's overall visibility indicator. Each detect_*
# function's own visibility gate is the authoritative check for whether THAT
# check can be evaluated - this is display-only.
SCREENING_LANDMARKS = [
    NOSE,
    LEFT_SHOULDER, RIGHT_SHOULDER,
    LEFT_HIP, RIGHT_HIP,
    LEFT_KNEE, RIGHT_KNEE,
    LEFT_ANKLE, RIGHT_ANKLE,
    LEFT_EAR, RIGHT_EAR,
]

VIEW_SCREENING_LANDMARKS = {
    "FRONT": [
        LEFT_SHOULDER, RIGHT_SHOULDER,
        LEFT_HIP, RIGHT_HIP,
        LEFT_KNEE, RIGHT_KNEE,
        LEFT_ANKLE, RIGHT_ANKLE,
        LEFT_EAR, RIGHT_EAR,
    ],
    "SIDE": [
        NOSE,
        LEFT_SHOULDER, RIGHT_SHOULDER,
        LEFT_HIP, RIGHT_HIP,
        LEFT_EAR, RIGHT_EAR,
    ],
}


# =============================================================================
# 3. Video Source, Camera View & Configurable Thresholds
# =============================================================================
# ============================ PROTOTYPE THRESHOLDS ==========================
# GEOMETRIC detection thresholds chosen for a rule-based prototype, tuned for
# a fixed webcam distance. NOT clinical or diagnostic limits.
# ============================================================================

DEFAULT_VIEW = "FRONT"
VIEW_OPTIONS = ("FRONT", "SIDE")

# --- Symmetry thresholds (ratio = measurement / torso length) ---------------
SHOULDER_ASYMMETRY_THRESHOLD = 0.05
HIP_ASYMMETRY_THRESHOLD = 0.05

# --- Knee alignment ----------------------------------------------------------
# 2D image-space proxy: signed lateral offset of the knee from the hip->ankle
# line, divided by that leg's length. Positive = outward, negative = inward.
KNEE_AXIS_DEVIATION_THRESHOLD = 0.06

# A knee bent more than this many degrees away from straight (180) still
# passes the STANDING_KNEE_ANGLE_MIN gate below, but the axis-deviation
# reading is less trustworthy at that flexion, so the result is labeled with
# a "reduced confidence" note instead of being reported at full confidence.
KNEE_FLEXION_CAVEAT_THRESHOLD = 15.0  # degrees away from straight (180)

# --- Head tilt (degrees) -----------------------------------------------------
HEAD_TILT_THRESHOLD = 8.0

# --- Side-view posture thresholds -------------------------------------------
FORWARD_HEAD_THRESHOLD = 0.18
TORSO_LEAN_THRESHOLD = 20.0
TORSO_LEAN_DIRECTION_THRESHOLD = 0.01
PROFILE_FACING_DIRECTION_THRESHOLD = 0.02

# --- Torso reference axis ----------------------------------------------------
# If the horizontal component of the shoulder-mid -> hip-mid vector exceeds
# this fraction of the vector's own length, the body is considered rotated
# relative to the camera, and lean readings are flagged with a caution note
# rather than suppressed outright (suppressing would hide genuine leans that
# happen to coincide with some rotation; flagging keeps the reading visible
# while telling the viewer to interpret it carefully).
BODY_ROTATION_RATIO_THRESHOLD = 0.5

# --- Guards ------------------------------------------------------------------
STANDING_KNEE_ANGLE_MIN = 150.0  # degrees; below this, treat as a squat/lunge

# --- Temporal stability -------------------------------------------------------
LABEL_HOLD_FRAMES = 8


# =============================================================================
# 4. Visibility Helpers
# =============================================================================

def min_landmark_visibility(pose, landmark_ids):
    """Lowest per-landmark visibility among a set of landmarks (worst-case, not average)."""
    return min(get_landmark(pose, i).visibility for i in landmark_ids)


def landmarks_visible(pose, landmark_ids):
    """True when every landmark in the list meets VISIBILITY_THRESHOLD."""
    return min_landmark_visibility(pose, landmark_ids) >= VISIBILITY_THRESHOLD


# =============================================================================
# 5. Difference Helpers
# =============================================================================

def fmt_number(value, unit):
    """Formats a measurement for the HUD, or '--' when missing."""
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "--"
    if unit == "deg":
        return f"{value:.1f} deg"
    if unit == "ratio":
        return f"{value:.3f}"
    return f"{value:.2f}"


def build_result(name, view, label, detected, value, threshold, unit, status="ok", detail=""):
    """Packs one check's outcome into a uniform dict consumed by the HUD."""
    return {
        "name": name,
        "view": view,
        "label": label,
        "detected": detected,
        "value": value,
        "threshold": threshold,
        "unit": unit,
        "status": status,
        "detail": detail,
    }


# =============================================================================
# 6. Measurement Smoothing
# =============================================================================

MEASUREMENT_SMOOTHERS = {}


def smoother_for(check_name):
    """Returns the MovingAverage for one named measurement, creating it on first use."""
    if check_name not in MEASUREMENT_SMOOTHERS:
        MEASUREMENT_SMOOTHERS[check_name] = MovingAverage(SMOOTHING_WINDOW)
    return MEASUREMENT_SMOOTHERS[check_name]


def reset_smoother(check_name):
    """
    Throws away one measurement's stored history (stale after an
    unevaluated frame - person out of frame, occluded, legs not straight).
    """
    MEASUREMENT_SMOOTHERS[check_name] = MovingAverage(SMOOTHING_WINDOW)
    if check_name == "knee_alignment":
        MEASUREMENT_SMOOTHERS["knee_left"] = MovingAverage(SMOOTHING_WINDOW)
        MEASUREMENT_SMOOTHERS["knee_right"] = MovingAverage(SMOOTHING_WINDOW)
        MEASUREMENT_SMOOTHERS["knee_angle_left"] = MovingAverage(SMOOTHING_WINDOW)
        MEASUREMENT_SMOOTHERS["knee_angle_right"] = MovingAverage(SMOOTHING_WINDOW)
    elif check_name == "head_tilt":
        MEASUREMENT_SMOOTHERS["head_tilt_dy"] = MovingAverage(SMOOTHING_WINDOW)


def reset_all_smoothers():
    """Clears every measurement's stored history (frame itself unusable)."""
    for check_name in list(MEASUREMENT_SMOOTHERS):
        reset_smoother(check_name)


# =============================================================================
# 7. Direction Helpers
# =============================================================================

def leg_outward_sign(hip_x, hip_mid_x):
    """+1 if this hip is on the +x side of the hip midline, else -1."""
    return 1.0 if hip_x >= hip_mid_x else -1.0


def forward_direction_sign(pose):
    """
    +1 / -1 telling which way along the image x-axis this person faces, or
    0.0 when direction can't be determined confidently.

    Primary cue: nose position relative to the more-visible ear (the nose is
    always anterior to the ear in the facing direction - a purely cranial
    measurement, independent of forward-head posture or torso lean, so it
    isn't circular with what those checks are trying to measure).
    Fallback: nose relative to shoulder midpoint, used only when ears are
    occluded.
    """
    min_signal = PROFILE_FACING_DIRECTION_THRESHOLD

    if landmarks_visible(pose, [NOSE]):
        nose = get_landmark(pose, NOSE)
        left_ear = get_landmark(pose, LEFT_EAR)
        right_ear = get_landmark(pose, RIGHT_EAR)
        ear_to_use = left_ear if left_ear.visibility >= right_ear.visibility else right_ear

        if ear_to_use.visibility >= VISIBILITY_THRESHOLD:
            cranial_dx = nose.x - ear_to_use.x
            if abs(cranial_dx) > min_signal:
                return 1.0 if cranial_dx > 0 else -1.0

    if landmarks_visible(pose, [NOSE, LEFT_SHOULDER, RIGHT_SHOULDER]):
        nose = get_landmark(pose, NOSE)
        shoulder_mid = _midpoint(get_landmark(pose, LEFT_SHOULDER), get_landmark(pose, RIGHT_SHOULDER))
        nose_shoulder_dx = nose.x - shoulder_mid[0]
        if abs(nose_shoulder_dx) > min_signal:
            return 1.0 if nose_shoulder_dx > 0 else -1.0

    return 0.0


def tilt_from_horizontal(vec):
    """
    Deviation of a vector from flat horizontal, in degrees [0, 90]. Folds the
    reference layer's [0, 180] convention into [0, 90] since a level line
    pointing left (180) and one pointing right (0) both mean "level".
    """
    angle = horizontal_angle_of_vector(vec)
    return min(angle, 180.0 - angle)


def point_to_line_distance(point, line_start, line_end):
    """Perpendicular distance from a point to a line segment in 2D."""
    line_vec = line_end - line_start
    point_vec = point - line_start

    line_length_sq = np.dot(line_vec, line_vec)
    if line_length_sq < 1e-12:
        return float(np.linalg.norm(point_vec))

    cross_mag = abs(line_vec[0] * point_vec[1] - line_vec[1] * point_vec[0])
    return float(cross_mag / np.sqrt(line_length_sq))


def knee_axis_deviation(hip, knee, ankle, outward_sign):
    """
    2D image-space proxy for knee alignment: signed lateral offset of the
    knee from the hip->ankle line segment, as a fraction of leg length.
        0  = knee sits on the hip-ankle line
        <0 = knee sits INWARD of that line
        >0 = knee sits OUTWARD of that line

    This is an image-plane 2D proxy, not an anatomical mechanical-axis
    measurement - camera perspective, limb rotation, and stance width all
    affect the 2D projection.
    """
    hip_xy = _xy(hip)
    knee_xy = _xy(knee)
    ankle_xy = _xy(ankle)

    leg_length = float(np.linalg.norm(hip_xy - ankle_xy))
    if leg_length < 1e-6:
        return np.nan

    line_vec = ankle_xy - hip_xy
    to_knee = knee_xy - hip_xy
    cross = line_vec[0] * to_knee[1] - line_vec[1] * to_knee[0]

    # cross / leg_length = actual perpendicular distance (image units).
    # Dividing by leg_length again turns that into a scale-invariant ratio.
    signed_perp_distance = (-cross / leg_length) * outward_sign
    return float(signed_perp_distance / leg_length)


# =============================================================================
# 8. FRONT-VIEW Detection Functions
# =============================================================================

def detect_shoulder_asymmetry(pose):
    """
    Checks whether one shoulder sits noticeably higher than the other,
    relative to the person's own torso length (shoulder-mid to hip-mid).
    Torso-length normalization is used rather than shoulder width because
    shoulder width shrinks under yaw rotation (perspective foreshortening),
    which would otherwise inflate the ratio with no real asymmetry present.

    Known limitation: a tilted (rolled) camera will read as shoulder
    asymmetry here, since this measurement can't distinguish "shoulders
    tilted" from "camera tilted". Keep the camera level when screening.
    """
    required = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP]
    if not landmarks_visible(pose, required):
        return build_result(
            "shoulder_asymmetry", "FRONT", "Shoulder alignment not measurable",
            False, None, SHOULDER_ASYMMETRY_THRESHOLD, "ratio",
            status="insufficient_visibility",
        )

    left_shoulder = get_landmark(pose, LEFT_SHOULDER)
    right_shoulder = get_landmark(pose, RIGHT_SHOULDER)
    left_hip = get_landmark(pose, LEFT_HIP)
    right_hip = get_landmark(pose, RIGHT_HIP)

    height_diff = abs(left_shoulder.y - right_shoulder.y)
    shoulder_mid = _midpoint(left_shoulder, right_shoulder)
    hip_mid = _midpoint(left_hip, right_hip)
    torso_length = float(np.linalg.norm(shoulder_mid - hip_mid))

    raw_ratio = safe_div(height_diff, torso_length)
    if np.isnan(raw_ratio):
        return build_result(
            "shoulder_asymmetry", "FRONT", "Shoulder alignment not measurable",
            False, None, SHOULDER_ASYMMETRY_THRESHOLD, "ratio", status="invalid",
        )

    ratio = smoother_for("shoulder_asymmetry").update(float(raw_ratio))
    tilt = tilt_from_horizontal(_xy(right_shoulder) - _xy(left_shoulder))

    detected = ratio >= SHOULDER_ASYMMETRY_THRESHOLD
    label = "Shoulder Asymmetry Detected" if detected else "Shoulders Level"

    return build_result(
        "shoulder_asymmetry", "FRONT", label, detected, ratio,
        SHOULDER_ASYMMETRY_THRESHOLD, "ratio", detail=f"tilt {tilt:.1f} deg",
    )


def detect_hip_asymmetry(pose):
    """Same measurement as detect_shoulder_asymmetry(), applied to the hips."""
    required = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP]
    if not landmarks_visible(pose, required):
        return build_result(
            "hip_asymmetry", "FRONT", "Hip alignment not measurable",
            False, None, HIP_ASYMMETRY_THRESHOLD, "ratio",
            status="insufficient_visibility",
        )

    left_hip = get_landmark(pose, LEFT_HIP)
    right_hip = get_landmark(pose, RIGHT_HIP)
    left_shoulder = get_landmark(pose, LEFT_SHOULDER)
    right_shoulder = get_landmark(pose, RIGHT_SHOULDER)

    height_diff = abs(left_hip.y - right_hip.y)
    shoulder_mid = _midpoint(left_shoulder, right_shoulder)
    hip_mid = _midpoint(left_hip, right_hip)
    torso_length = float(np.linalg.norm(shoulder_mid - hip_mid))

    raw_ratio = safe_div(height_diff, torso_length)
    if np.isnan(raw_ratio):
        return build_result(
            "hip_asymmetry", "FRONT", "Hip alignment not measurable",
            False, None, HIP_ASYMMETRY_THRESHOLD, "ratio", status="invalid",
        )

    ratio = smoother_for("hip_asymmetry").update(float(raw_ratio))
    tilt = tilt_from_horizontal(_xy(right_hip) - _xy(left_hip))

    detected = ratio >= HIP_ASYMMETRY_THRESHOLD
    label = "Hip Asymmetry Detected" if detected else "Hips Level"

    return build_result(
        "hip_asymmetry", "FRONT", label, detected, ratio,
        HIP_ASYMMETRY_THRESHOLD, "ratio", detail=f"tilt {tilt:.1f} deg",
    )


def detect_knee_alignment(pose):
    """
    Checks hip -> knee -> ankle alignment of both legs from the front:
        - both legs deviate inward/outward together -> "Inward/Outward" pattern
        - legs deviate in opposite directions, or only one leg deviates
          -> reported as asymmetric rather than averaged away to near-zero

    Guards: both knees must be reasonably straight (STANDING_KNEE_ANGLE_MIN) -
    a squat/lunge legitimately moves the knees inward and would otherwise be
    misread as a pattern. A knee bent past KNEE_FLEXION_CAVEAT_THRESHOLD (but
    still within the standing gate) gets a reduced-confidence note, since a
    bent knee changes the 2D projection the axis-deviation measurement relies
    on.

    This is a 2D image-plane proxy, not a mechanical-axis measurement -
    labels are deliberately neutral ("Inward/Outward Knee Alignment") rather
    than naming clinical conditions, consistent with this being a screening
    pattern and not a diagnosis.
    """
    required = [LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE]
    if not landmarks_visible(pose, required):
        return build_result(
            "knee_alignment", "FRONT", "Knee alignment not measurable",
            False, None, KNEE_AXIS_DEVIATION_THRESHOLD, "ratio",
            status="insufficient_visibility",
        )

    left_hip = get_landmark(pose, LEFT_HIP)
    right_hip = get_landmark(pose, RIGHT_HIP)
    left_knee = get_landmark(pose, LEFT_KNEE)
    right_knee = get_landmark(pose, RIGHT_KNEE)
    left_ankle = get_landmark(pose, LEFT_ANKLE)
    right_ankle = get_landmark(pose, RIGHT_ANKLE)

    left_knee_angle = calculate_angle(left_hip, left_knee, left_ankle)
    right_knee_angle = calculate_angle(right_hip, right_knee, right_ankle)
    legs_straight = (left_knee_angle >= STANDING_KNEE_ANGLE_MIN
                      and right_knee_angle >= STANDING_KNEE_ANGLE_MIN)

    if not legs_straight:
        return build_result(
            "knee_alignment", "FRONT", "Stand Straight to Screen Knee Alignment",
            False, None, KNEE_AXIS_DEVIATION_THRESHOLD, "ratio",
            status="not_standing",
            detail=f"knees {left_knee_angle:.0f}/{right_knee_angle:.0f} deg",
        )

    hip_mid = _midpoint(left_hip, right_hip)
    left_outward = leg_outward_sign(left_hip.x, hip_mid[0])
    right_outward = leg_outward_sign(right_hip.x, hip_mid[0])

    left_deviation = knee_axis_deviation(left_hip, left_knee, left_ankle, left_outward)
    right_deviation = knee_axis_deviation(right_hip, right_knee, right_ankle, right_outward)

    if np.isnan(left_deviation) or np.isnan(right_deviation):
        return build_result(
            "knee_alignment", "FRONT", "Knee alignment not measurable",
            False, None, KNEE_AXIS_DEVIATION_THRESHOLD, "ratio", status="invalid",
        )

    smooth_left = smoother_for("knee_left").update(float(left_deviation))
    smooth_right = smoother_for("knee_right").update(float(right_deviation))
    average_deviation = (smooth_left + smooth_right) / 2.0

    left_angle_smooth = smoother_for("knee_angle_left").update(float(left_knee_angle))
    right_angle_smooth = smoother_for("knee_angle_right").update(float(right_knee_angle))
    mean_knee_angle = (left_angle_smooth + right_angle_smooth) / 2.0
    reduced_confidence = mean_knee_angle < (180.0 - KNEE_FLEXION_CAVEAT_THRESHOLD)

    threshold = KNEE_AXIS_DEVIATION_THRESHOLD
    left_deviating = abs(smooth_left) >= threshold
    right_deviating = abs(smooth_right) >= threshold
    both_legs_deviating = left_deviating and right_deviating
    one_leg_deviating = left_deviating != right_deviating
    same_direction = (smooth_left > 0) == (smooth_right > 0)

    if both_legs_deviating and not same_direction:
        label = "Asymmetric Knee Alignment (opposite directions)"
        detected = True
    elif one_leg_deviating:
        label = "Asymmetric Knee Alignment (one leg)"
        detected = True
    elif average_deviation <= -threshold:
        label = "Possible Inward Knee Alignment"
        detected = True
    elif average_deviation >= threshold:
        label = "Possible Outward Knee Alignment"
        detected = True
    else:
        label = "Knee Alignment Within Range"
        detected = False

    knee_gap = calculate_distance(left_knee, right_knee)
    ankle_gap = calculate_distance(left_ankle, right_ankle)
    gap_ratio = safe_div(knee_gap, ankle_gap)

    detail = f"L/R {smooth_left:+.3f}/{smooth_right:+.3f}, knee angle {mean_knee_angle:.0f} deg"
    if reduced_confidence:
        detail += " (reduced confidence: knee not fully extended)"
    if not np.isnan(gap_ratio):
        detail += f", knee/ankle gap {gap_ratio:.2f}"

    return build_result(
        "knee_alignment", "FRONT", label, detected, average_deviation,
        threshold, "ratio", detail=detail,
    )


def detect_head_tilt(pose):
    """Checks whether the head is tilted sideways, using the ear-to-ear line."""
    required = [LEFT_EAR, RIGHT_EAR]
    if not landmarks_visible(pose, required):
        return build_result(
            "head_tilt", "FRONT", "Head tilt not measurable (ears not visible)",
            False, None, HEAD_TILT_THRESHOLD, "deg",
            status="insufficient_visibility",
        )

    left_ear = get_landmark(pose, LEFT_EAR)
    right_ear = get_landmark(pose, RIGHT_EAR)

    raw_dy = left_ear.y - right_ear.y
    smoothed_dy = smoother_for("head_tilt_dy").update(float(raw_dy))
    tilt_angle = smoother_for("head_tilt").update(
        tilt_from_horizontal(_xy(right_ear) - _xy(left_ear))
    )

    detected = tilt_angle >= HEAD_TILT_THRESHOLD

    if not detected:
        label = "Head Level"
    elif smoothed_dy > 0:
        label = "Head Tilt (leans to the left side)"
    else:
        label = "Head Tilt (leans to the right side)"

    return build_result(
        "head_tilt", "FRONT", label, detected, tilt_angle,
        HEAD_TILT_THRESHOLD, "deg",
    )


# =============================================================================
# 9. SIDE-VIEW Detection Functions
# =============================================================================

def detect_forward_head_pattern(pose):
    """
    Checks whether the head sits noticeably forward of the shoulders, using
    whichever ear(s) are actually visible (one or two) combined with the
    nose, normalized by torso length.

    Using all visible ears rather than requiring both avoids two failure
    modes seen in earlier versions of this check: requiring both ears fails
    constantly in a true profile pose (the far ear is occluded by the head
    itself); using only the single "more visible" ear biases the reading
    toward whichever side happens to face the camera. Averaging whichever
    ears are actually visible, together with the nose (a stable anterior
    landmark independent of which ear the camera sees), degrades gracefully
    either way.
    """
    required_core = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP, NOSE]
    if not landmarks_visible(pose, required_core):
        return build_result(
            "forward_head", "SIDE", "Forward head pattern not measurable",
            False, None, FORWARD_HEAD_THRESHOLD, "ratio",
            status="insufficient_visibility",
        )

    left_ear = get_landmark(pose, LEFT_EAR)
    right_ear = get_landmark(pose, RIGHT_EAR)
    visible_ears = [e for e in (left_ear, right_ear) if e.visibility >= VISIBILITY_THRESHOLD]

    if not visible_ears:
        return build_result(
            "forward_head", "SIDE", "Forward head pattern not measurable (no ear visible)",
            False, None, FORWARD_HEAD_THRESHOLD, "ratio",
            status="insufficient_visibility",
        )

    forward_sign = forward_direction_sign(pose)
    if forward_sign == 0.0:
        return build_result(
            "forward_head", "SIDE", "Forward head: facing direction unclear",
            False, None, FORWARD_HEAD_THRESHOLD, "ratio",
            status="insufficient_visibility", detail="side profile needed",
        )

    left_shoulder = get_landmark(pose, LEFT_SHOULDER)
    right_shoulder = get_landmark(pose, RIGHT_SHOULDER)
    shoulder_mid = _midpoint(left_shoulder, right_shoulder)
    hip_mid = _midpoint(get_landmark(pose, LEFT_HIP), get_landmark(pose, RIGHT_HIP))

    torso_length = float(np.linalg.norm(shoulder_mid - hip_mid))
    if torso_length < 1e-6:
        return build_result(
            "forward_head", "SIDE", "Forward head pattern not measurable",
            False, None, FORWARD_HEAD_THRESHOLD, "ratio", status="invalid",
        )

    nose = get_landmark(pose, NOSE)
    ear_mean_x = sum(e.x for e in visible_ears) / len(visible_ears)

    head_offsets = [
        (ear_mean_x - shoulder_mid[0]) * forward_sign,
        (nose.x - shoulder_mid[0]) * forward_sign,
    ]
    head_forward_offset = sum(head_offsets) / len(head_offsets)

    raw_ratio = safe_div(head_forward_offset, torso_length)
    if np.isnan(raw_ratio):
        return build_result(
            "forward_head", "SIDE", "Forward head pattern not measurable",
            False, None, FORWARD_HEAD_THRESHOLD, "ratio", status="invalid",
        )

    forward_ratio = smoother_for("forward_head").update(float(raw_ratio))
    detected = forward_ratio >= FORWARD_HEAD_THRESHOLD
    label = ("Possible Forward Head Pattern" if detected
             else "No Significant Forward Head Pattern")

    ear_only_ratio = safe_div(ear_mean_x - shoulder_mid[0], torso_length) * forward_sign
    nose_only_ratio = safe_div(nose.x - shoulder_mid[0], torso_length) * forward_sign
    detail_parts = [f"ears used: {len(visible_ears)}"]
    if not np.isnan(ear_only_ratio):
        detail_parts.append(f"ear {ear_only_ratio:.3f}")
    if not np.isnan(nose_only_ratio):
        detail_parts.append(f"nose {nose_only_ratio:.3f}")
    detail = ", ".join(detail_parts)

    return build_result(
        "forward_head", "SIDE", label, detected, forward_ratio,
        FORWARD_HEAD_THRESHOLD, "ratio", detail=detail,
    )


def detect_torso_lean(pose, view):
    """
    Checks how far the torso deviates from vertical, using the person's own
    shoulder-mid -> hip-mid vector as the reference axis (stable against
    camera tilt and minor body rotation, unlike raw image-vertical).

    Same measurement, different meaning per view:
        FRONT -> lateral (sideways) lean
        SIDE  -> forward/backward lean, with direction determined via
                 forward_direction_sign()

    If the shoulder-hip vector's horizontal component is large relative to
    its own length (BODY_ROTATION_RATIO_THRESHOLD), the body is likely
    rotated relative to the camera and the reading is flagged with a caution
    note rather than suppressed - suppressing would hide genuine leans that
    happen to coincide with some rotation.
    """
    required = [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP]
    if not landmarks_visible(pose, required):
        return build_result(
            "torso_lean", view, "Torso alignment not measurable",
            False, None, TORSO_LEAN_THRESHOLD, "deg",
            status="insufficient_visibility",
        )

    left_shoulder = get_landmark(pose, LEFT_SHOULDER)
    right_shoulder = get_landmark(pose, RIGHT_SHOULDER)
    left_hip = get_landmark(pose, LEFT_HIP)
    right_hip = get_landmark(pose, RIGHT_HIP)

    shoulder_mid = _midpoint(left_shoulder, right_shoulder)
    hip_mid = _midpoint(left_hip, right_hip)
    torso_vec = shoulder_mid - hip_mid
    torso_length = float(np.linalg.norm(torso_vec))
    if torso_length < 1e-6:
        return build_result(
            "torso_lean", view, "Torso alignment not measurable",
            False, None, TORSO_LEAN_THRESHOLD, "deg", status="invalid",
        )

    torso_angle = calculate_torso_angle(left_shoulder, right_shoulder, left_hip, right_hip)
    smoothed_angle = smoother_for("torso_lean").update(torso_angle)

    body_orientation_ratio = abs(torso_vec[0]) / torso_length
    orientation_valid = body_orientation_ratio < BODY_ROTATION_RATIO_THRESHOLD

    detected = smoothed_angle >= TORSO_LEAN_THRESHOLD

    if not detected:
        label = "Torso Aligned"
    elif view == "FRONT":
        label = ("Torso Lean (body rotated, interpret with care)" if not orientation_valid
                 else "Possible Lateral Torso Lean")
    else:
        sh_dx = shoulder_mid[0] - hip_mid[0]
        forward_sign = forward_direction_sign(pose)

        if forward_sign == 0.0 or not orientation_valid:
            label = "Torso Lean (body rotated, interpret with care)"
        else:
            signed_dx = sh_dx * forward_sign
            if signed_dx > TORSO_LEAN_DIRECTION_THRESHOLD:
                label = "Possible Forward Torso Lean"
            elif signed_dx < -TORSO_LEAN_DIRECTION_THRESHOLD:
                label = "Possible Backward Torso Lean"
            else:
                label = "Possible Excessive Torso Lean"

    detail = f"body h/v ratio {body_orientation_ratio:.2f}" if not orientation_valid else ""

    return build_result(
        "torso_lean", view, label, detected, smoothed_angle,
        TORSO_LEAN_THRESHOLD, "deg", detail=detail,
    )


# =============================================================================
# 10. Check Registry & Per-Frame Runner
# =============================================================================

CHECKS = {
    "shoulder_asymmetry": detect_shoulder_asymmetry,
    "hip_asymmetry": detect_hip_asymmetry,
    "knee_alignment": detect_knee_alignment,
    "head_tilt": detect_head_tilt,
    "forward_head": detect_forward_head_pattern,
    "torso_lean": detect_torso_lean,
}

VIEW_CHECKS = {
    "FRONT": ["shoulder_asymmetry", "hip_asymmetry", "knee_alignment",
              "head_tilt", "torso_lean"],
    "SIDE": ["forward_head", "torso_lean"],
}

CHECK_SHORT_NAMES = {
    "shoulder_asymmetry": "SHOULDER SYM",
    "hip_asymmetry": "HIP SYM",
    "knee_alignment": "KNEE ALIGN",
    "head_tilt": "HEAD TILT",
    "torso_lean": "TORSO LEAN",
    "forward_head": "FORWARD HEAD",
}

CHECK_LONG_NAMES = {
    "shoulder_asymmetry": "shoulders",
    "hip_asymmetry": "hips",
    "knee_alignment": "knees",
    "head_tilt": "head tilt",
    "torso_lean": "torso",
    "forward_head": "forward head",
}


def run_checks(pose, view):
    """Runs every check for the current camera view, in fixed priority order."""
    results = []

    for check_name in VIEW_CHECKS[view]:
        if check_name == "torso_lean":
            result = detect_torso_lean(pose, view)
        else:
            result = CHECKS[check_name](pose)

        if result["status"] != "ok":
            reset_smoother(check_name)

        results.append(result)

    return results


def summarise_results(results):
    """Turns a frame's check results into one headline + a count of extra findings."""
    fired = [r for r in results if r["detected"]]

    if fired:
        headline = fired[0]["label"]
        return headline, len(fired) - 1

    ok_checks = [r for r in results if r["status"] == "ok"]
    if ok_checks:
        return "No Significant Asymmetry Detected", 0

    if not results:
        return "No person detected", 0

    if all(r["status"] == "insufficient_visibility" for r in results):
        return "Insufficient Landmark Visibility", 0

    return results[0]["label"], 0


# =============================================================================
# 11. Drawing Helpers
# =============================================================================

HIGHLIGHT_LANDMARKS = {
    "shoulder_asymmetry": [LEFT_SHOULDER, RIGHT_SHOULDER],
    "hip_asymmetry": [LEFT_HIP, RIGHT_HIP],
    "knee_alignment": [LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE],
    "head_tilt": [LEFT_EAR, RIGHT_EAR],
    "forward_head": [LEFT_EAR, RIGHT_EAR, LEFT_SHOULDER, RIGHT_SHOULDER],
    "torso_lean": [LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP],
}


def draw_highlights(frame, pose, results):
    """Marks the landmarks involved in any check that fired this frame."""
    if pose is None:
        return

    h, w = frame.shape[:2]

    highlighted = set()
    for result in results:
        if result["detected"]:
            highlighted.update(HIGHLIGHT_LANDMARKS.get(result["name"], []))

    for landmark_id in sorted(highlighted):
        landmark = get_landmark(pose, landmark_id)
        if landmark.visibility < DRAW_VISIBILITY_THRESHOLD:
            continue

        point = get_coordinates(landmark, w, h)
        cv2.circle(frame, point, 7, (0, 0, 255), -1, cv2.LINE_AA)
        cv2.circle(frame, point, 9, (0, 255, 255), 2, cv2.LINE_AA)


# =============================================================================
# 12. Temporal Stability (label debounce)
# =============================================================================

class DebouncedLabel:
    """
    Holds the currently displayed status label until a DIFFERENT label has
    been seen for LABEL_HOLD_FRAMES consecutive frames, so per-frame jitter
    in the landmarks can't flicker the HUD between states.
    """

    def __init__(self, debounce_frames, initial_label="--"):
        self.debounce_frames = debounce_frames
        self.confirmed_label = initial_label
        self._candidate_label = None
        self._candidate_count = 0

    def update(self, raw_label):
        if raw_label == self.confirmed_label:
            self._candidate_label = None
            self._candidate_count = 0
            return self.confirmed_label, False

        if raw_label == self._candidate_label:
            self._candidate_count += 1
        else:
            self._candidate_label = raw_label
            self._candidate_count = 1

        if self._candidate_count >= self.debounce_frames:
            self.confirmed_label = raw_label
            self._candidate_label = None
            self._candidate_count = 0
            return self.confirmed_label, True

        return self.confirmed_label, False

    def reset_candidate(self):
        """Clears the pending candidate when tracking is lost or the view changes."""
        self._candidate_label = None
        self._candidate_count = 0


# =============================================================================
# 13. HUD Rendering
# =============================================================================

def draw_hud(frame, view, headline, extra_findings, results, pose_visibility, pose_detected):
    """Draws the screening card: view, status, per-check lines, disclaimer."""
    NORMAL_TEXT = (240, 240, 240)
    SUBTLE_GRAY = (170, 170, 170)

    any_finding = any(r["detected"] for r in results)
    any_ok = any(r["status"] == "ok" for r in results)

    if not pose_detected or not results:
        status_color = (0, 0, 255)
    elif any_finding:
        status_color = (0, 165, 255)
    elif not any_ok:
        status_color = (0, 165, 255)
    else:
        status_color = (0, 255, 0)

    header_lines = [
        ("DEFORMITY SCREENING", (255, 255, 255), 0.65, 2, 42),
        (f"VIEW: {view}   [v]=switch", (255, 255, 0), 0.55, 1, 72),
        ("STATUS:", (200, 200, 200), 0.55, 1, 101),
        (headline, status_color, 0.58, 2, 128),
    ]

    if extra_findings > 0:
        header_lines.append((f"OTHER FINDINGS: +{extra_findings}", (0, 165, 255), 0.5, 1, 152))

    header_lines.append((f"CHECKS ({view} VIEW)", (200, 200, 200), 0.5, 1, 172))

    body_lines = []
    y = 198

    for result in results:
        short_name = CHECK_SHORT_NAMES.get(result["name"], result["name"].upper())
        value_str = fmt_number(result["value"], result["unit"])
        threshold_str = fmt_number(result["threshold"], result["unit"])
        line = f"{short_name}: {value_str}  (th {threshold_str})"

        if result["status"] != "ok":
            line_color = (0, 165, 255)
        elif result["detected"]:
            line_color = (0, 165, 255)
        else:
            line_color = NORMAL_TEXT

        body_lines.append((line, 28, line_color, 0.48, 1, y))
        y += 20

        if result["detail"]:
            body_lines.append((result["detail"], 40, SUBTLE_GRAY, 0.42, 1, y))
            y += 17

    visibility_str = (f"LANDMARK VISIBILITY: {pose_visibility:.2f}"
                       if pose_visibility is not None else "LANDMARK VISIBILITY: --")
    visibility_color = ((0, 255, 0) if (pose_visibility or 0) >= VISIBILITY_THRESHOLD
                         else (0, 165, 255))
    y += 22
    body_lines.append((visibility_str, 28, visibility_color, 0.5, 1, y))

    other_view = "SIDE" if view == "FRONT" else "FRONT"
    waiting = ", ".join(CHECK_LONG_NAMES[name] for name in VIEW_CHECKS[other_view])
    y += 22
    body_lines.append((f"{other_view} VIEW ONLY: {waiting}", 28, SUBTLE_GRAY, 0.42, 1, y))

    y += 22
    body_lines.append(("Screening result only - not a medical diagnosis",
                        28, SUBTLE_GRAY, 0.42, 1, y))

    card_top = 15
    card_right = 470
    card_bottom = y + 18

    overlay = frame.copy()
    cv2.rectangle(overlay, (15, card_top), (card_right, card_bottom), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    for text, color, scale, thickness, line_y in header_lines:
        cv2.putText(frame, text, (28, line_y),
                    cv2.FONT_HERSHEY_SIMPLEX, scale, color, thickness, cv2.LINE_AA)

    for text, x, color, scale, thickness, line_y in body_lines:
        cv2.putText(frame, text, (x, line_y),
                    cv2.FONT_HERSHEY_SIMPLEX, scale, color, thickness, cv2.LINE_AA)

    frame_height = frame.shape[0]
    hint_y = min(card_bottom + 30, frame_height - 12)

    if not pose_detected:
        cv2.putText(frame, "No person detected", (20, min(card_bottom + 30, frame_height - 40)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2, cv2.LINE_AA)

    cv2.putText(frame, "[q]=quit  [v]=switch view", (20, hint_y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1, cv2.LINE_AA)


# =============================================================================
# 14. Main Loop
# =============================================================================

def main():
    landmarker = create_landmarker()
    cap = cv2.VideoCapture(VIDEO_SOURCE)

    frame_idx = 0
    fps = cap.get(cv2.CAP_PROP_FPS) or 30

    view = DEFAULT_VIEW
    visibility_smoother = MovingAverage(SMOOTHING_WINDOW)
    status_debouncer = DebouncedLabel(LABEL_HOLD_FRAMES)

    frames_with_pose = 0
    frames_with_reliable_screening = 0
    session_start = time.time()

    print("Deformity screening running. Press [q] to quit, [v] to switch view.")
    print(f"Starting view: {view}")
    print("Results are computer-vision screening patterns, not a medical diagnosis.")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

        timestamp_ms = int(frame_idx * 1000 / fps)
        result = landmarker.detect_for_video(mp_image, timestamp_ms)

        pose = None
        pose_detected = False
        pose_visibility = None
        results = []
        raw_headline = "No person detected"

        if result.pose_landmarks:
            pose = result.pose_landmarks[0]
            pose_detected = True
            frames_with_pose += 1

            draw_pose_skeleton(frame, pose)

            raw_visibility = min_landmark_visibility(
                pose, VIEW_SCREENING_LANDMARKS.get(view, SCREENING_LANDMARKS)
            )
            pose_visibility = visibility_smoother.update(raw_visibility)

            results = run_checks(pose, view)
            raw_headline, _ = summarise_results(results)

            if any(r["status"] == "ok" for r in results):
                frames_with_reliable_screening += 1
        else:
            pose_visibility = visibility_smoother.update(0.0)
            reset_all_smoothers()
            raw_headline = "No person detected"

        headline, _ = status_debouncer.update(raw_headline)
        _, extra_findings = summarise_results(results)

        draw_highlights(frame, pose, results)
        draw_hud(frame, view, headline, extra_findings, results,
                 pose_visibility, pose_detected)

        cv2.imshow("Deformity Screening", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break

        if key == ord("v"):
            view = "SIDE" if view == "FRONT" else "FRONT"
            reset_all_smoothers()
            status_debouncer.reset_candidate()
            print(f"[view] switched to {view}")

        frame_idx += 1

    cap.release()
    cv2.destroyAllWindows()
    landmarker.close()

    session_duration = time.time() - session_start
    print("\n----- Session Summary -----")
    print(f"Frames processed: {frame_idx}")
    print(f"Session duration: {session_duration:.1f} sec")
    print(f"Frames with pose detected: {frames_with_pose}")
    print(f"Frames with reliable screening: {frames_with_reliable_screening}")
    print(f"Last screening status: {status_debouncer.confirmed_label}")
    print("Screening results are not a medical diagnosis.")
    print("---------------------------")


if __name__ == "__main__":
    main()