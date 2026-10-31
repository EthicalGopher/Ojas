"""
Comprehensive Python Test Suite for Warrior II (Virabhadrasana II)
Validates MediaPipe Biomechanical Engine, Hold Timers, and Diagnostic Logic
Following Tree Pose's Test Protocol.
"""

import os
import sys
import time
import math
import numpy as np

# Add parent directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from warrior2_tracker import MediaPipeWarrior2Engine, CONFIG
from warrior2_image import Warrior2ImageAnalyzer


class LandmarkPoint:
    def __init__(self, x, y, z=0.0, visibility=0.95):
        self.x = x
        self.y = y
        self.z = z
        self.visibility = visibility


def build_synthetic_warrior2(front="LEFT", front_knee_deg=105.0, rear_knee_deg=175.0,
                             arm_tilt_deg=0.0, elbow_deg=175.0, torso_lean_deg=0.0,
                             stance_ratio=1.8, ankle_level_diff=0.0, scale=1.0,
                             head_offset_norm=0.0):
    mid_x = 0.50
    base_shoulder_y = 0.30 * scale + (1 - scale) * 0.5
    base_hip_y = 0.52 * scale + (1 - scale) * 0.5
    torso_h = base_hip_y - base_shoulder_y

    torso_dx = math.sin(math.radians(torso_lean_deg)) * torso_h
    mid_shoulder_x = mid_x + torso_dx
    mid_hip_x = mid_x

    shoulder_w = 0.08 * scale
    hip_w = 0.06 * scale

    lms = [LandmarkPoint(0.5, 0.5) for _ in range(33)]

    # Head and Torso
    lms[0] = LandmarkPoint(mid_shoulder_x + head_offset_norm * scale, base_shoulder_y - 0.10 * scale)
    lms[11] = LandmarkPoint(mid_shoulder_x + shoulder_w, base_shoulder_y)
    lms[12] = LandmarkPoint(mid_shoulder_x - shoulder_w, base_shoulder_y)
    lms[23] = LandmarkPoint(mid_hip_x + hip_w, base_hip_y)
    lms[24] = LandmarkPoint(mid_hip_x - hip_w, base_hip_y)

    # Arms
    arm_len = 0.16 * scale
    rad = math.radians(arm_tilt_deg)
    dx_arm = arm_len * math.cos(rad)
    dy_arm = arm_len * math.sin(rad)

    # Left arm
    lms[13] = LandmarkPoint(lms[11].x + dx_arm * 0.5, lms[11].y + dy_arm * 0.5)
    if elbow_deg < 140.0:
        lms[15] = LandmarkPoint(lms[13].x, lms[13].y - 0.10 * scale)
    else:
        lms[15] = LandmarkPoint(lms[11].x + dx_arm, lms[11].y + dy_arm)

    # Right arm
    lms[14] = LandmarkPoint(lms[12].x - dx_arm * 0.5, lms[12].y + dy_arm * 0.5)
    if elbow_deg < 140.0:
        lms[16] = LandmarkPoint(lms[14].x, lms[14].y - 0.10 * scale)
    else:
        lms[16] = LandmarkPoint(lms[12].x - dx_arm, lms[12].y + dy_arm)

    # Legs
    ankle_y = 0.88 * scale + (1 - scale) * 0.5
    total_stance = hip_w * 2.0 * stance_ratio * 1.8

    if front == "LEFT":
        left_ankle_x = mid_hip_x + total_stance * 0.55
        right_ankle_x = mid_hip_x - total_stance * 0.45
        lms[27] = LandmarkPoint(left_ankle_x, ankle_y + ankle_level_diff)
        lms[28] = LandmarkPoint(right_ankle_x, ankle_y)

        # Front knee
        if front_knee_deg > 155.0:
            lms[25] = LandmarkPoint((lms[23].x + left_ankle_x) / 2.0, (lms[23].y + ankle_y) / 2.0)
        else:
            lms[25] = LandmarkPoint(left_ankle_x, lms[23].y + 0.08 * scale)

        # Rear knee
        if rear_knee_deg < 140.0:
            lms[26] = LandmarkPoint(right_ankle_x + 0.14 * scale, (lms[24].y + ankle_y) / 2.0)
        else:
            lms[26] = LandmarkPoint((lms[24].x + right_ankle_x) / 2.0, (lms[24].y + ankle_y) / 2.0)
    else:
        right_ankle_x = mid_hip_x - total_stance * 0.55
        left_ankle_x = mid_hip_x + total_stance * 0.45
        lms[28] = LandmarkPoint(right_ankle_x, ankle_y + ankle_level_diff)
        lms[27] = LandmarkPoint(left_ankle_x, ankle_y)

        # Front knee
        if front_knee_deg > 155.0:
            lms[26] = LandmarkPoint((lms[24].x + right_ankle_x) / 2.0, (lms[24].y + ankle_y) / 2.0)
        else:
            lms[26] = LandmarkPoint(right_ankle_x, lms[24].y + 0.08 * scale)

        # Rear knee
        if rear_knee_deg < 140.0:
            lms[25] = LandmarkPoint(left_ankle_x - 0.14 * scale, (lms[23].y + ankle_y) / 2.0)
        else:
            lms[25] = LandmarkPoint((lms[23].x + left_ankle_x) / 2.0, (lms[23].y + ankle_y) / 2.0)

    return lms


def to_world_landmarks(lms):
    world = []
    for p in lms:
        world.append(LandmarkPoint((p.x - 0.5) * 1.5, (0.5 - p.y) * 2.0, p.z, p.visibility))
    return world


def feed_frames(engine, lms, world, count=12):
    feat = None
    for _ in range(count):
        feat = engine.analyze_pose(lms, world, 720, 1280)
        engine.update_warrior2_state(feat)
    return feat


def run_all_tests():
    passed = 0
    failed = 0

    def assert_check(name, condition, extra=""):
        nonlocal passed, failed
        if condition:
            passed += 1
            print(f"  PASS: {name}")
        else:
            failed += 1
            print(f"  FAIL: {name} -> {extra}")

    print("=" * 70)
    print("   WARRIOR II PYTHON BIOMECHANICAL & TIMER TEST SUITE   ")
    print("=" * 70)

    # -------------------------------------------------------------------------
    # Test 1: Correct Warrior II (Hold Timer progression & completion)
    # -------------------------------------------------------------------------
    print("\n[Test 1] Correct Warrior II (Both Sides & Hold Timer)")
    engine = MediaPipeWarrior2Engine()
    lms = build_synthetic_warrior2(front="LEFT", front_knee_deg=105.0, rear_knee_deg=175.0)
    world = to_world_landmarks(lms)
    feat = feed_frames(engine, lms, world, count=10)

    assert_check("Left Front Stance Detected", engine.active_stance == "LEFT FRONT", engine.active_stance)
    assert_check("Pose Form Status PERFECT", engine.form_status == "PERFECT WARRIOR II", engine.form_status)
    assert_check("in_warrior2 is True", engine.in_warrior2 is True)
    assert_check("Hold Timer Started", engine.current_hold_seconds >= 0.0)

    # Test hold duration progression
    time.sleep(0.1)
    feed_frames(engine, lms, world, count=3)
    assert_check("Hold Timer Increments with Time", engine.current_hold_seconds > 0.05, f"{engine.current_hold_seconds}s")
    assert_check("Best Streak Records Max Hold", engine.best_hold_seconds >= engine.current_hold_seconds)

    # Test Right Front Stance
    engine2 = MediaPipeWarrior2Engine()
    lms_r = build_synthetic_warrior2(front="RIGHT", front_knee_deg=105.0, rear_knee_deg=175.0)
    feed_frames(engine2, lms_r, to_world_landmarks(lms_r), count=10)
    assert_check("Right Front Stance Detected", engine2.active_stance == "RIGHT FRONT", engine2.active_stance)
    assert_check("Right Front Pose PERFECT", engine2.form_status == "PERFECT WARRIOR II", engine2.form_status)

    # -------------------------------------------------------------------------
    # Test 2: Incorrect Front Knee (Under-bent / Straight front knee)
    # -------------------------------------------------------------------------
    print("\n[Test 2] Incorrect Front Knee (Too straight > 145°)")
    engine = MediaPipeWarrior2Engine()
    lms_bad_knee = build_synthetic_warrior2(front="LEFT", front_knee_deg=175.0)
    feed_frames(engine, lms_bad_knee, to_world_landmarks(lms_bad_knee), count=10)
    assert_check("Rejected straight front knee", engine.in_warrior2 is False)
    assert_check("Front knee feedback generated", "FRONT KNEE" in engine.form_status or "READY" in engine.form_status, engine.form_status)
    assert_check("Hold timer paused/zero", engine.current_hold_seconds == 0.0)

    # -------------------------------------------------------------------------
    # Test 3: Incorrect Arms (Drooping arms / lowered)
    # -------------------------------------------------------------------------
    print("\n[Test 3] Incorrect Arms (Drooping arms > 30°)")
    engine = MediaPipeWarrior2Engine()
    lms_bad_arms = build_synthetic_warrior2(front="LEFT", arm_tilt_deg=55.0)
    feed_frames(engine, lms_bad_arms, to_world_landmarks(lms_bad_arms), count=12)
    assert_check("Rejected drooping arms", engine.in_warrior2 is False)
    assert_check("Arm horizontal feedback generated", "ARMS" in engine.form_status, engine.form_status)

    # -------------------------------------------------------------------------
    # Test 4: Incorrect Rear Leg (Bent rear knee < 160°)
    # -------------------------------------------------------------------------
    print("\n[Test 4] Incorrect Rear Leg (Bent rear knee)")
    engine = MediaPipeWarrior2Engine()
    lms_bent_rear = build_synthetic_warrior2(front="LEFT", rear_knee_deg=125.0)
    feed_frames(engine, lms_bent_rear, to_world_landmarks(lms_bent_rear), count=12)
    assert_check("Rejected bent rear knee", engine.in_warrior2 is False)
    assert_check("Rear leg feedback generated", "REAR LEG" in engine.form_status, engine.form_status)

    # -------------------------------------------------------------------------
    # Test 5: Torso Lean (Excessive forward lean > 18°)
    # -------------------------------------------------------------------------
    print("\n[Test 5] Excessive Torso Lean (> 18°)")
    engine = MediaPipeWarrior2Engine()
    lms_lean = build_synthetic_warrior2(front="LEFT", torso_lean_deg=30.0)
    feed_frames(engine, lms_lean, to_world_landmarks(lms_lean), count=12)
    assert_check("Rejected excessive torso lean", engine.in_warrior2 is False)
    assert_check("Torso upright feedback generated", "TORSO" in engine.form_status, engine.form_status)

    # -------------------------------------------------------------------------
    # Test 6: Enter and Exit Pose Repeatedly (State stability)
    # -------------------------------------------------------------------------
    print("\n[Test 6] Enter and Exit Pose Repeatedly (Stability & Timer resets)")
    engine = MediaPipeWarrior2Engine()
    lms_good = build_synthetic_warrior2(front="LEFT")
    lms_bad = build_synthetic_warrior2(front="LEFT", arm_tilt_deg=60.0)
    world_good = to_world_landmarks(lms_good)
    world_bad = to_world_landmarks(lms_bad)

    # Cycle 1
    feed_frames(engine, lms_good, world_good, 10)
    assert_check("Cycle 1 entered", engine.in_warrior2 is True)
    feed_frames(engine, lms_bad, world_bad, 6)
    assert_check("Cycle 1 exited, timer reset", engine.in_warrior2 is False and engine.current_hold_seconds == 0.0)

    # Cycle 2
    feed_frames(engine, lms_good, world_good, 10)
    assert_check("Cycle 2 re-entered", engine.in_warrior2 is True)
    feed_frames(engine, lms_bad, world_bad, 6)
    assert_check("Cycle 2 exited, timer reset", engine.in_warrior2 is False and engine.current_hold_seconds == 0.0)

    # -------------------------------------------------------------------------
    # Test 7: Different Distances & Scales
    # -------------------------------------------------------------------------
    print("\n[Test 7] Different Camera Distances & Scales")
    for s_val, label in [(0.65, "Far from camera"), (1.0, "Normal distance"), (1.3, "Close to camera")]:
        engine_s = MediaPipeWarrior2Engine()
        lms_scaled = build_synthetic_warrior2(front="LEFT", scale=s_val)
        feed_frames(engine_s, lms_scaled, to_world_landmarks(lms_scaled), 10)
        assert_check(f"Scale {s_val} ({label}) recognized", engine_s.form_status == "PERFECT WARRIOR II", engine_s.form_status)

    # -------------------------------------------------------------------------
    # Test 8: Correct Head Alignment (nose centered over shoulders)
    # -------------------------------------------------------------------------
    print("\n[Test 8] Correct Head Alignment (Centered)")
    engine = MediaPipeWarrior2Engine()
    lms_good_head = build_synthetic_warrior2(front="LEFT", head_offset_norm=0.0)
    world_good_head = to_world_landmarks(lms_good_head)
    feed_frames(engine, lms_good_head, world_good_head, 12)
    assert_check("Centered head recognized as PERFECT", engine.form_status == "PERFECT WARRIOR II", engine.form_status)
    assert_check("Head check passed (in_warrior2)", engine.in_warrior2 is True)

    # -------------------------------------------------------------------------
    # Test 9: Excessive Forward Head Position
    # -------------------------------------------------------------------------
    print("\n[Test 9] Excessive Forward Head Position")
    engine = MediaPipeWarrior2Engine()
    lms_fwd = build_synthetic_warrior2(front="LEFT", head_offset_norm=0.10)
    world_fwd = to_world_landmarks(lms_fwd)
    feat_fwd = feed_frames(engine, lms_fwd, world_fwd, 12)
    assert_check("Rejected forward head", engine.in_warrior2 is False, f"form_status={engine.form_status}")
    assert_check("Head feedback generated", "HEAD" in engine.form_status, engine.form_status)
    assert_check("Timer does not advance as valid hold", engine.current_hold_seconds == 0.0)

    # -------------------------------------------------------------------------
    # Test 10: Excessive Backward Head Position
    # -------------------------------------------------------------------------
    print("\n[Test 10] Excessive Backward Head Position")
    engine = MediaPipeWarrior2Engine()
    lms_bwd = build_synthetic_warrior2(front="LEFT", head_offset_norm=-0.10)
    world_bwd = to_world_landmarks(lms_bwd)
    feed_frames(engine, lms_bwd, world_bwd, 12)
    assert_check("Rejected backward head", engine.in_warrior2 is False, f"form_status={engine.form_status}")
    assert_check("Backward head feedback generated", "HEAD" in engine.form_status, engine.form_status)

    # -------------------------------------------------------------------------
    # Test 11: Excessive Lateral Head Deviation
    # -------------------------------------------------------------------------
    print("\n[Test 11] Excessive Lateral Head Deviation")
    engine = MediaPipeWarrior2Engine()
    lms_lat = build_synthetic_warrior2(front="LEFT", head_offset_norm=0.11)
    world_lat = to_world_landmarks(lms_lat)
    feed_frames(engine, lms_lat, world_lat, 12)
    assert_check("Rejected lateral head deviation", engine.in_warrior2 is False, f"form_status={engine.form_status}")
    assert_check("Lateral head feedback generated", "HEAD" in engine.form_status, engine.form_status)

    # -------------------------------------------------------------------------
    # Test 12: Natural Head Variation (small movement should NOT cause rejection)
    # -------------------------------------------------------------------------
    print("\n[Test 12] Natural Head Variation")
    engine = MediaPipeWarrior2Engine()
    lms_nat = build_synthetic_warrior2(front="LEFT", head_offset_norm=0.03)
    world_nat = to_world_landmarks(lms_nat)
    feed_frames(engine, lms_nat, world_nat, 12)
    assert_check("Natural head variation accepted", engine.form_status == "PERFECT WARRIOR II", engine.form_status)
    assert_check("Hold timer running with natural head", engine.in_warrior2 is True)

    # -------------------------------------------------------------------------
    # Test 13: Head Alignment at Different Body Scales
    # -------------------------------------------------------------------------
    print("\n[Test 13] Head Alignment Robust to Body Scale")
    for s_val, label in [(0.65, "Far"), (1.0, "Normal"), (1.3, "Close")]:
        engine_s = MediaPipeWarrior2Engine()
        # Natural small head offset that scales with body
        lms_scaled = build_synthetic_warrior2(front="LEFT", scale=s_val, head_offset_norm=0.03)
        feed_frames(engine_s, lms_scaled, to_world_landmarks(lms_scaled), 12)
        assert_check(f"Scale {s_val} ({label}) head alignment PASS",
                     engine_s.form_status == "PERFECT WARRIOR II", engine_s.form_status)

    print("\n" + "=" * 70)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 70)
    if failed == 0:
        print("[SUCCESS] All Python Warrior II tests PASSED!")
    else:
        sys.exit(1)


if __name__ == "__main__":
    run_all_tests()
