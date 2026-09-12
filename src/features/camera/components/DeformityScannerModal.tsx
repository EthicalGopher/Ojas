import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Speech from 'expo-speech';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  Info,
  Layers,
  RotateCcw,
  SwitchCamera,
  Target,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react-native';
import { Camera } from 'expo-camera';
import { useUserStore } from '../../../store/userStore';
import { updateUserProfile, UserProfile } from '../../../utils/profileService';

export interface DeformityCheckResult {
  name: string;
  category: string;
  title: string;
  detected: boolean;
  severity: 'normal' | 'mild' | 'moderate';
  valueText: string;
  thresholdText: string;
  detail: string;
  explanation: string;
  matchedConditionKey?: 'knock_knees' | 'bow_legs' | 'rounded_shoulders' | 'lower_back_pain' | 'flat_feet';
  recommendedExercises: string[];
}

export interface DeformityScanSummary {
  timestamp: string;
  overallScore: number;
  overallStatus: 'excellent' | 'good' | 'needs_attention';
  headline: string;
  detectedCount: number;
  results: DeformityCheckResult[];
}

interface DeformityScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onApplyConditions?: (conditions: Record<string, boolean>) => void;
}

/**
 * Generate full self-contained HTML bundle running on-device MediaPipe Pose
 * with the exact geometric formulas from backend/Pose/Defomatis/deformity_detector.py
 */
function getDeformityDetectorHtmlBundle(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body, html { width: 100%; height: 100%; overflow: hidden; background-color: #000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    #container { position: relative; width: 100vw; height: 100vh; display: flex; justify-content: center; align-items: center; background-color: #000; }
    video { position: absolute; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
    canvas { position: absolute; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); pointer-events: none; }

    /* Alignment Viewfinder Overlay */
    .viewfinder {
      position: absolute; width: 88vw; height: 82vh; pointer-events: none;
      border: 1px dashed rgba(255, 255, 255, 0.12); border-radius: 24px; box-sizing: border-box;
    }
    .corner {
      position: absolute; width: 22px; height: 22px; border-color: #E25822; border-style: solid;
    }
    .tl { top: -2px; left: -2px; border-width: 3px 0 0 3px; border-top-left-radius: 14px; }
    .tr { top: -2px; right: -2px; border-width: 3px 3px 0 0; border-top-right-radius: 14px; }
    .bl { bottom: -2px; left: -2px; border-width: 0 0 3px 3px; border-bottom-left-radius: 14px; }
    .br { bottom: -2px; right: -2px; border-width: 0 3px 3px 0; border-bottom-right-radius: 14px; }

    /* Center Plumb Crosshair */
    .center-axis {
      position: absolute; top: 12%; bottom: 12%; left: 50%; width: 1px;
      background: linear-gradient(to bottom, transparent, rgba(226, 88, 34, 0.2), transparent);
      pointer-events: none;
    }

    #loader-overlay {
      position: absolute; z-index: 20; width: 84%; max-width: 320px;
      background: rgba(17, 20, 26, 0.96); border: 1px solid rgba(226, 88, 34, 0.25);
      border-radius: 24px; padding: 24px 20px; text-align: center; color: #F8FAFC;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    .spinner {
      width: 36px; height: 36px; margin: 0 auto 16px;
      border-radius: 50%; border: 3px solid rgba(255, 255, 255, 0.12);
      border-top-color: #E25822; animation: spin 0.85s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loader-title { font-size: 15.5px; font-weight: 800; color: #F8FAFC; margin-bottom: 6px; letter-spacing: -0.2px; }
    .loader-status { font-size: 12.5px; color: #94A3B8; margin-bottom: 16px; }
    .progress-track { width: 100%; height: 6px; background-color: #1E293B; border-radius: 8px; overflow: hidden; }
    .progress-fill { height: 100%; width: 20%; background: #E25822; border-radius: 8px; transition: width 0.25s ease; }
  </style>
  <script src="http://127.0.0.1:8888/camera_utils.js" onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js'"></script>
  <script src="http://127.0.0.1:8888/pose.js" onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js'"></script>
</head>
<body>
  <div id="container">
    <video id="video" playsinline webkit-playsinline muted autoplay></video>
    <canvas id="canvas"></canvas>

    <div class="viewfinder">
      <div class="corner tl"></div>
      <div class="corner tr"></div>
      <div class="corner bl"></div>
      <div class="corner br"></div>
    </div>
    <div class="center-axis"></div>

    <div id="loader-overlay">
      <div class="spinner" id="loader-spinner"></div>
      <div class="loader-title">AI Posture Scanner</div>
      <div class="loader-status" id="loader-status-text">Loading 33-point biometrics model...</div>
      <div class="progress-track">
        <div class="progress-fill" id="progress-bar-fill"></div>
      </div>
    </div>
  </div>

  <script>
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const loaderOverlay = document.getElementById('loader-overlay');
    const statusText = document.getElementById('loader-status-text');
    const progressFill = document.getElementById('progress-bar-fill');

    let currentScanView = 'FRONT'; // 'FRONT' or 'SIDE'
    let steadyFramesCount = 0;
    const STEADY_FRAMES_TARGET = 100; // ~4-5 seconds of continuous valid posture
    let poseInstance = null;
    let modelReady = false;

    function setProgress(percent, msg) {
      if (progressFill) progressFill.style.width = percent + '%';
      if (statusText && msg) statusText.textContent = msg;
    }

    function hideLoader() {
      if (!modelReady) {
        modelReady = true;
        setProgress(100, 'Ready');
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCANNER_READY' }));
        }
        if (loaderOverlay) {
          loaderOverlay.style.opacity = '0';
          loaderOverlay.style.transform = 'scale(0.95)';
          setTimeout(() => { loaderOverlay.style.display = 'none'; }, 300);
        }
      }
    }

    // Moving average helper
    class MovingAvg {
      constructor(size = 6) {
        this.size = size;
        this.values = [];
      }
      update(val) {
        if (typeof val !== 'number' || isNaN(val)) return val;
        this.values.push(val);
        if (this.values.length > this.size) this.values.shift();
        return this.values.reduce((a, b) => a + b, 0) / this.values.length;
      }
      get val() {
        if (this.values.length === 0) return 0;
        return this.values.reduce((a, b) => a + b, 0) / this.values.length;
      }
      reset() { this.values = []; }
    }

    const smoothers = {
      shoulderRatio: new MovingAvg(),
      shoulderTilt: new MovingAvg(),
      hipRatio: new MovingAvg(),
      hipTilt: new MovingAvg(),
      kneeDevLeft: new MovingAvg(),
      kneeDevRight: new MovingAvg(),
      kneeAngleLeft: new MovingAvg(),
      kneeAngleRight: new MovingAvg(),
      headTilt: new MovingAvg(),
      headTiltDy: new MovingAvg(),
      forwardHeadRatio: new MovingAvg(),
      torsoLeanDeg: new MovingAvg(),
    };

    function resetAllSmoothers() {
      Object.values(smoothers).forEach(s => s.reset());
      steadyFramesCount = 0;
    }

    // Geometry Helpers
    function xy(lm) { return { x: lm.x, y: lm.y, v: lm.visibility || 1 }; }
    function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    function distance(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)); }
    function angle(a, b, c) {
      const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
      let deg = Math.abs((radians * 180.0) / Math.PI);
      if (deg > 180.0) deg = 360.0 - deg;
      return deg;
    }
    function horizontalTilt(a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const deg = Math.abs(Math.atan2(dy, dx) * 180.0 / Math.PI);
      return Math.min(deg, 180.0 - deg);
    }
    function verticalAngle(a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const deg = Math.abs(Math.atan2(dx, -dy) * 180.0 / Math.PI);
      return deg;
    }

    function kneeAxisDev(hip, knee, ankle, outwardSign) {
      const legLen = distance(hip, ankle);
      if (legLen < 1e-5) return 0;
      const lineVec = { x: ankle.x - hip.x, y: ankle.y - hip.y };
      const toKnee = { x: knee.x - hip.x, y: knee.y - hip.y };
      const cross = (lineVec.x * toKnee.y) - (lineVec.y * toKnee.x);
      const signedPerp = (-cross / legLen) * outwardSign;
      return signedPerp / legLen;
    }

    // Deformity Screening Engine
    function evaluatePostureFrame(landmarks) {
      if (!landmarks || landmarks.length < 29) return null;

      const nose = landmarks[0];
      const leftEar = landmarks[7];
      const rightEar = landmarks[8];
      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];
      const leftHip = landmarks[23];
      const rightHip = landmarks[24];
      const leftKnee = landmarks[25];
      const rightKnee = landmarks[26];
      const leftAnkle = landmarks[27];
      const rightAnkle = landmarks[28];

      const shMid = midpoint(leftShoulder, rightShoulder);
      const hipMid = midpoint(leftHip, rightHip);
      const kneeMid = midpoint(leftKnee, rightKnee);
      const ankleMid = midpoint(leftAnkle, rightAnkle);

      const shoulderWidth = distance(leftShoulder, rightShoulder);
      const hipWidth = distance(leftHip, rightHip);
      const kneeWidth = distance(leftKnee, rightKnee);
      const ankleWidth = distance(leftAnkle, rightAnkle);
      const torsoLength = distance(shMid, hipMid);

      const checks = [];
      let isBodyAligned = true;

      // Ensure key body parts are inside frame
      const isFrontVisible = (
        (leftShoulder.visibility || 1) > 0.45 &&
        (rightShoulder.visibility || 1) > 0.45 &&
        (leftHip.visibility || 1) > 0.45 &&
        (rightHip.visibility || 1) > 0.45 &&
        (leftKnee.visibility || 1) > 0.40 &&
        (rightKnee.visibility || 1) > 0.40
      );

      // 1. Shoulder Level Asymmetry Check
      if (torsoLength > 0.05) {
        const rawShRatio = Math.abs(leftShoulder.y - rightShoulder.y) / torsoLength;
        const smoothShRatio = smoothers.shoulderRatio.update(rawShRatio);
        const smoothShTilt = smoothers.shoulderTilt.update(horizontalTilt(leftShoulder, rightShoulder));
        const detected = smoothShRatio >= 0.075 || smoothShTilt >= 5.5;

        checks.push({
          name: 'shoulder_asymmetry',
          category: 'Shoulders & Upper Body',
          title: 'Shoulders',
          detected,
          severity: detected ? (smoothShRatio >= 0.12 ? 'moderate' : 'mild') : 'normal',
          valueText: detected ? 'Uneven' : 'Level',
          thresholdText: 'Max 5° tilt',
          detail: detected ? 'One shoulder is higher than other' : 'Shoulders are balanced and level',
          explanation: 'Carry bags evenly and keep your back straight while sitting.',
          matchedConditionKey: 'rounded_shoulders',
          recommendedExercises: detected ? ['Cobra Pose', 'Push-ups', "Child's Pose"] : []
        });
        if (detected) isBodyAligned = false;
      }

      // 2. Pelvic / Hip Tilt Check
      if (torsoLength > 0.05) {
        const rawHipRatio = Math.abs(leftHip.y - rightHip.y) / torsoLength;
        const smoothHipRatio = smoothers.hipRatio.update(rawHipRatio);
        const smoothHipTilt = smoothers.hipTilt.update(horizontalTilt(leftHip, rightHip));
        const detected = smoothHipRatio >= 0.075 || smoothHipTilt >= 5.5;

        checks.push({
          name: 'pelvic_tilt',
          category: 'Hips & Pelvis',
          title: 'Hips & Pelvis',
          detected,
          severity: detected ? (smoothHipRatio >= 0.12 ? 'moderate' : 'mild') : 'normal',
          valueText: detected ? 'Tilted' : 'Level',
          thresholdText: 'Max 5° tilt',
          detail: detected ? 'Pelvis is tilted to one side' : 'Hips are level and even',
          explanation: 'Stand with equal weight on both feet and do pelvic stretches.',
          matchedConditionKey: 'lower_back_pain',
          recommendedExercises: detected ? ['Squats', 'Lunges', 'Triangle Pose', "Child's Pose"] : []
        });
        if (detected) isBodyAligned = false;
      }

      // 3. Knee Alignment Check (Knock Knees / Bow Legs)
      if (ankleWidth > 0.02 && hipWidth > 0.02) {
        const lDev = smoothers.kneeDevLeft.update(kneeAxisDev(leftHip, leftKnee, leftAnkle, -1.0));
        const rDev = smoothers.kneeDevRight.update(kneeAxisDev(rightHip, rightKnee, rightAnkle, 1.0));
        const meanDev = (lDev + rDev) / 2.0;

        const isKnockKnee = meanDev <= -0.065 || (ankleWidth > 0.06 && (kneeWidth / ankleWidth) < 0.62);
        const isBowLeg = meanDev >= 0.065 || (ankleWidth > 0.04 && (kneeWidth / ankleWidth) > 1.35);
        const isKneeDetected = isKnockKnee || isBowLeg;

        if (isKnockKnee) {
          checks.push({
            name: 'knock_knees',
            category: 'Knees & Legs',
            title: 'Knees',
            detected: true,
            severity: meanDev <= -0.11 ? 'moderate' : 'mild',
            valueText: 'Knock Knees',
            thresholdText: 'Knees turn inward',
            detail: 'Knees touch while ankles stay apart',
            explanation: 'Strengthening your hip and thigh muscles can help knee posture.',
            matchedConditionKey: 'knock_knees',
            recommendedExercises: ['Squats', 'Lunges', 'Triangle Pose']
          });
          isBodyAligned = false;
        } else if (isBowLeg) {
          checks.push({
            name: 'bow_legs',
            category: 'Knees & Legs',
            title: 'Knees',
            detected: true,
            severity: meanDev >= 0.11 ? 'moderate' : 'mild',
            valueText: 'Bow Legs',
            thresholdText: 'Knees curve outward',
            detail: 'Knees remain wide while ankles touch',
            explanation: 'Hip and glute exercises support good leg alignment.',
            matchedConditionKey: 'bow_legs',
            recommendedExercises: ['Lunges', 'Squats', 'Triangle Pose']
          });
          isBodyAligned = false;
        } else {
          checks.push({
            name: 'knee_alignment',
            category: 'Knees & Legs',
            title: 'Knees',
            detected: false,
            severity: 'normal',
            valueText: 'Straight',
            thresholdText: 'Balanced axis',
            detail: 'Knees and legs are well aligned',
            explanation: 'Keep legs balanced with regular stretching and walking.',
            recommendedExercises: []
          });
        }
      }

      // 4. Head Tilt Check
      if ((leftEar.visibility || 1) >= 0.35 && (rightEar.visibility || 1) >= 0.35) {
        const rawTilt = horizontalTilt(leftEar, rightEar);
        const smoothTilt = smoothers.headTilt.update(rawTilt);
        const detected = smoothTilt >= 8.0;

        checks.push({
          name: 'head_tilt',
          category: 'Head & Neck',
          title: 'Neck & Head',
          detected,
          severity: detected ? (smoothTilt >= 14.0 ? 'moderate' : 'mild') : 'normal',
          valueText: detected ? 'Tilted' : 'Straight',
          thresholdText: 'Max 8° tilt',
          detail: detected ? 'Head is leaning to one side' : 'Head is centered and straight',
          explanation: 'Try to keep head straight when working or looking at phones.',
          matchedConditionKey: 'rounded_shoulders',
          recommendedExercises: detected ? ['Cobra Pose', 'Triangle Pose', "Child's Pose"] : []
        });
        if (detected) isBodyAligned = false;
      }

      // 5. Forward Head / Profile Check
      if (nose && (leftShoulder || rightShoulder) && torsoLength > 0.05) {
        const facingSign = (nose.x - shMid.x) >= 0 ? 1 : -1;
        const forwardOffset = (nose.x - shMid.x) * facingSign;
        const rawFwdRatio = forwardOffset / torsoLength;
        const smoothFwdRatio = smoothers.forwardHeadRatio.update(rawFwdRatio);
        const detected = smoothFwdRatio >= 0.18;

        checks.push({
          name: 'forward_head',
          category: 'Head & Neck',
          title: 'Forward Head',
          detected,
          severity: detected ? (smoothFwdRatio >= 0.26 ? 'moderate' : 'mild') : 'normal',
          valueText: detected ? 'Leaning forward' : 'Straight',
          thresholdText: 'Max 18% forward',
          detail: detected ? 'Head is pushed forward' : 'Head position is good',
          explanation: 'Keep chin pulled back slightly to prevent neck strain.',
          matchedConditionKey: 'rounded_shoulders',
          recommendedExercises: detected ? ['Cobra Pose', 'Triangle Pose', 'Push-ups', "Child's Pose"] : []
        });
        if (detected) isBodyAligned = false;
      }

      // 6. Torso Vertical Lean Check
      if (torsoLength > 0.05) {
        const leanDeg = smoothers.torsoLeanDeg.update(verticalAngle(hipMid, shMid));
        const detected = leanDeg >= 12.0;

        checks.push({
          name: 'torso_lean',
          category: 'Back & Spine',
          title: 'Back & Spine',
          detected,
          severity: detected ? (leanDeg >= 18.0 ? 'moderate' : 'mild') : 'normal',
          valueText: detected ? 'Leaning' : 'Straight',
          thresholdText: 'Max 12° lean',
          detail: detected ? 'Body is leaning sideways' : 'Back is straight and upright',
          explanation: 'Core exercises help keep your spine straight and balanced.',
          matchedConditionKey: 'lower_back_pain',
          recommendedExercises: detected ? ['Cobra Pose', 'Crunches', 'Squats', "Child's Pose"] : []
        });
        if (detected) isBodyAligned = false;
      }

      return {
        checks,
        isFrontVisible,
        isBodyAligned
      };
    }

    // Draw High-Tech Biomechanical Overlay
    function drawDeformityOverlay(landmarks, evalResult) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!landmarks || landmarks.length < 29) return;

      const w = canvas.width;
      const h = canvas.height;

      function pt(lm) { return { x: lm.x * w, y: lm.y * h }; }

      // 1. Draw Neon Glowing Skeleton Lines
      ctx.lineWidth = 3;
      const connections = [
        [11, 12], [11, 23], [12, 24], [23, 24],
        [23, 25], [25, 27], [24, 26], [26, 28]
      ];

      for (const [s, e] of connections) {
        const p1 = pt(landmarks[s]);
        const p2 = pt(landmarks[e]);
        ctx.strokeStyle = 'rgba(226, 88, 34, 0.75)';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }

      // 2. Draw Shoulder Level Horizontal Laser Guide
      const ls = pt(landmarks[11]);
      const rs = pt(landmarks[12]);
      const shY = (ls.y + rs.y) / 2;
      const shDiff = Math.abs(ls.y - rs.y);
      const isShBalanced = shDiff < 14;

      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = isShBalanced ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.min(ls.x, rs.x) - 45, shY);
      ctx.lineTo(Math.max(ls.x, rs.x) + 45, shY);
      ctx.stroke();

      // 3. Draw Hip Level Horizontal Laser Guide
      const lh = pt(landmarks[23]);
      const rh = pt(landmarks[24]);
      const hipY = (lh.y + rh.y) / 2;
      const hipDiff = Math.abs(lh.y - rh.y);
      const isHipBalanced = hipDiff < 14;

      ctx.strokeStyle = isHipBalanced ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)';
      ctx.beginPath();
      ctx.moveTo(Math.min(lh.x, rh.x) - 45, hipY);
      ctx.lineTo(Math.max(lh.x, rh.x) + 45, hipY);
      ctx.stroke();

      // 4. Draw Knee Mechanical Axis Lines
      const lk = pt(landmarks[25]);
      const rk = pt(landmarks[26]);
      const la = pt(landmarks[27]);
      const ra = pt(landmarks[28]);

      ctx.strokeStyle = 'rgba(255, 107, 53, 0.85)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(lh.x, lh.y); ctx.lineTo(la.x, la.y);
      ctx.moveTo(rh.x, rh.y); ctx.lineTo(ra.x, ra.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 5. Draw High-Tech Glowing Joint Nodes
      const keyPoints = [0, 7, 8, 11, 12, 23, 24, 25, 26, 27, 28];
      for (const idx of keyPoints) {
        const p = pt(landmarks[idx]);
        
        // Outer halo ring
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(226, 88, 34, 0.25)';
        ctx.fill();

        // Inner solid core
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#E25822';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    async function onResults(results) {
      hideLoader();

      if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        steadyFramesCount = 0;
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'POSE_STATUS',
            status: 'NO_PERSON',
            message: 'Position full body in camera frame'
          }));
        }
        return;
      }

      const evalData = evaluatePostureFrame(results.poseLandmarks);
      drawDeformityOverlay(results.poseLandmarks, evalData);

      if (evalData && evalData.isFrontVisible) {
        steadyFramesCount += 1;
        const progressPct = Math.min(100, Math.round((steadyFramesCount / STEADY_FRAMES_TARGET) * 100));

        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'SCAN_PROGRESS',
            progress: progressPct,
            checks: evalData.checks,
            isBodyAligned: evalData.isBodyAligned,
          }));

          if (steadyFramesCount >= STEADY_FRAMES_TARGET) {
            steadyFramesCount = 0;
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'SCAN_COMPLETE',
              checks: evalData.checks,
            }));
          }
        }
      } else {
        steadyFramesCount = Math.max(0, steadyFramesCount - 1);
      }
    }

    async function ensurePoseScriptLoaded() {
      if (typeof window.Pose !== 'undefined') return true;

      function loadScript(src) {
        return new Promise((resolve) => {
          const s = document.createElement('script');
          s.src = src;
          s.async = true;
          s.onload = () => resolve(true);
          s.onerror = () => resolve(false);
          document.head.appendChild(s);
        });
      }

      for (let i = 0; i < 25; i++) {
        if (typeof window.Pose !== 'undefined') return true;
        await new Promise(r => setTimeout(r, 100));
      }

      const cdnUrls = [
        'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js',
        'https://unpkg.com/@mediapipe/pose@0.5.1675469404/pose.js'
      ];

      for (const url of cdnUrls) {
        if (typeof window.Pose !== 'undefined') return true;
        setProgress(45, 'Connecting AI engine…');
        await loadScript(url);
        for (let j = 0; j < 30; j++) {
          if (typeof window.Pose !== 'undefined') return true;
          await new Promise(r => setTimeout(r, 100));
        }
      }

      return typeof window.Pose !== 'undefined';
    }

    async function init() {
      try {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        setProgress(35, 'Preparing pose tracker…');

        const isLoaded = await ensurePoseScriptLoaded();
        if (!isLoaded || typeof window.Pose === 'undefined') {
          throw new Error('Pose tracker library not found. Please check connection and retry.');
        }

        let localServerOk = false;
        try {
          const pingResp = await fetch('http://127.0.0.1:8888/ping', { method: 'GET' });
          if (pingResp.ok) localServerOk = true;
        } catch (e) {}

        const modelBaseUrl = localServerOk
          ? 'http://127.0.0.1:8888/'
          : 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/';

        setProgress(65, 'Loading 33-point geometric model...');

        poseInstance = new window.Pose({
          locateFile: (file) => {
            setProgress(75, 'Loading model files…');
            return modelBaseUrl + file;
          }
        });

        poseInstance.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.4,
          minTrackingConfidence: 0.4
        });

        poseInstance.onResults(onResults);

        // Fallback dismissal in case camera takes a moment
        setTimeout(() => {
          hideLoader();
        }, 3500);

        let currentFacingMode = 'user';
        let currentStream = null;
        let isProcessingFrame = false;
        let animationFrameId = null;

        function scheduleNextFrame() {
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
          }
          animationFrameId = requestAnimationFrame(processFrame);
        }

        function processFrame() {
          if (!video || video.paused || video.ended || !poseInstance) {
            scheduleNextFrame();
            return;
          }

          if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
            scheduleNextFrame();
            return;
          }

          if (isProcessingFrame) {
            scheduleNextFrame();
            return;
          }

          isProcessingFrame = true;

          poseInstance.send({ image: video })
            .then(() => {
              isProcessingFrame = false;
              scheduleNextFrame();
            })
            .catch((e) => {
              isProcessingFrame = false;
              scheduleNextFrame();
            });
        }

        function startCamera(facingMode) {
          const isFront = facingMode === 'user';
          if (video) {
            video.style.transform = isFront ? 'scaleX(-1)' : 'scaleX(1)';
          }
          if (canvas) {
            canvas.style.transform = isFront ? 'scaleX(-1)' : 'scaleX(1)';
          }

          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
          }
          isProcessingFrame = false;

          if (currentStream) {
            currentStream.getTracks().forEach((track) => {
              try { track.stop(); } catch (e) {}
            });
            currentStream = null;
          }

          if (video) {
            try { video.pause(); } catch (e) {}
            video.srcObject = null;
          }

          const constraints = {
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 640 },
              height: { ideal: 480 }
            },
            audio: false
          };

          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (statusText) statusText.textContent = 'Camera access is not available on this device';
            return;
          }

          navigator.mediaDevices.getUserMedia(constraints)
            .then((stream) => {
              currentStream = stream;
              video.srcObject = stream;
              video.onloadedmetadata = () => {
                video.play()
                  .then(() => {
                    canvas.width = video.videoWidth || 640;
                    canvas.height = video.videoHeight || 480;
                    scheduleNextFrame();
                  })
                  .catch(() => {
                    scheduleNextFrame();
                  });
              };
            })
            .catch((err) => {
              navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                .then((stream) => {
                  currentStream = stream;
                  video.srcObject = stream;
                  video.onloadedmetadata = () => {
                    video.play().catch(() => {});
                    canvas.width = video.videoWidth || 640;
                    canvas.height = video.videoHeight || 480;
                    scheduleNextFrame();
                  };
                })
                .catch((e) => {
                  if (statusText) {
                    statusText.textContent = 'Camera permission denied or camera unavailable';
                    statusText.style.color = '#F87171';
                  }
                });
            });
        }

        window.toggleFacingMode = () => {
          currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
          startCamera(currentFacingMode);
        };

        window.resetScan = () => {
          resetAllSmoothers();
        };

        startCamera(currentFacingMode);
        setProgress(90, 'Starting camera…');
      } catch (err) {
        if (statusText) {
          statusText.textContent = 'Scanner initialization failed: ' + err.message;
          statusText.style.color = '#F87171';
        }
      }
    }

    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  </script>
</body>
</html>
  `;
}

export const DeformityScannerModal: React.FC<DeformityScannerModalProps> = ({
  visible,
  onClose,
  onApplyConditions,
}) => {
  const [isModelLoading, setIsModelLoading] = useState<boolean>(true);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('Stand 6 feet back facing the camera');
  const [liveChecks, setLiveChecks] = useState<DeformityCheckResult[]>([]);
  const [isVoiceMuted, setIsVoiceMuted] = useState<boolean>(false);
  const [summaryReport, setSummaryReport] = useState<DeformityScanSummary | null>(null);
  const [isReportVisible, setIsReportVisible] = useState<boolean>(false);
  const [applyingProfile, setApplyingProfile] = useState<boolean>(false);

  const webViewRef = useRef<WebView>(null);
  const lastSpokenRef = useRef<string>('');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const { user, profile, refreshProfile } = useUserStore();

  useEffect(() => {
    if (visible) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      setIsModelLoading(true);
      setScanProgress(0);
      setSummaryReport(null);
      setIsReportVisible(false);

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 1000, useNativeDriver: true }),
        ])
      ).start();

      async function requestCameraPermission() {
        try {
          if (Camera && Camera.requestCameraPermissionsAsync) {
            await Camera.requestCameraPermissionsAsync();
          }
        } catch (e) {}
      }
      requestCameraPermission();

      const safetyTimer = setTimeout(() => {
        setIsModelLoading(false);
      }, 4500);

      speakPrompt('Please stand in front of camera with your full body visible.');

      return () => clearTimeout(safetyTimer);
    } else {
      Speech.stop();
    }
  }, [visible, pulseAnim]);

  const speakPrompt = useCallback((text: string) => {
    if (isVoiceMuted) return;
    if (lastSpokenRef.current === text) return;
    lastSpokenRef.current = text;
    try {
      Speech.stop();
      Speech.speak(text, { language: 'en-US', rate: 1.0, pitch: 1.0 });
    } catch (e) {}
  }, [isVoiceMuted]);

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'SCANNER_READY') {
        setIsModelLoading(false);
        setStatusMessage('Camera ready. Stand straight.');
      } else if (data.type === 'POSE_STATUS') {
        if (data.status === 'NO_PERSON') {
          setStatusMessage('Stand in front of camera');
          setScanProgress(0);
        }
      } else if (data.type === 'SCAN_PROGRESS') {
        setScanProgress(data.progress || 0);
        setLiveChecks(data.checks || []);
        if (data.progress > 10 && data.progress < 90) {
          setStatusMessage(`Checking posture (${data.progress}%)... Hold still`);
        }
      } else if (data.type === 'SCAN_COMPLETE') {
        const checks: DeformityCheckResult[] = data.checks || [];
        const detectedCount = checks.filter((c) => c.detected).length;
        const totalChecks = Math.max(1, checks.length);
        const score = Math.max(45, Math.round(((totalChecks - detectedCount) / totalChecks) * 100));

        const summary: DeformityScanSummary = {
          timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          overallScore: score,
          overallStatus: detectedCount === 0 ? 'excellent' : detectedCount <= 2 ? 'good' : 'needs_attention',
          headline: detectedCount === 0
            ? 'Your Posture is Straight & Balanced'
            : `${detectedCount} Area${detectedCount > 1 ? 's' : ''} Need Care`,
          detectedCount,
          results: checks,
        };

        setSummaryReport(summary);
        setIsReportVisible(true);
        speakPrompt('Check complete. Review your posture result.');
      }
    } catch (e) {}
  };

  const handleApplyToProfile = async () => {
    if (!summaryReport) return;
    setApplyingProfile(true);

    const conditionUpdates: Record<string, boolean> = {};
    summaryReport.results.forEach((r) => {
      if (r.detected && r.matchedConditionKey) {
        conditionUpdates[r.matchedConditionKey] = true;
      }
    });

    try {
      if (user?.id && user.id !== 'guest') {
        const healthMap = { ...(profile?.health_conditions || {}), ...conditionUpdates };
        await updateUserProfile(user.id, {
          has_knock_knees: conditionUpdates['knock_knees'] || profile?.has_knock_knees || false,
          has_bow_legs: conditionUpdates['bow_legs'] || profile?.has_bow_legs || false,
          has_rounded_shoulders: conditionUpdates['rounded_shoulders'] || profile?.has_rounded_shoulders || false,
          has_lower_back_pain: conditionUpdates['lower_back_pain'] || profile?.has_lower_back_pain || false,
          has_flat_feet: conditionUpdates['flat_feet'] || profile?.has_flat_feet || false,
          health_conditions: healthMap,
        });
        await refreshProfile();
      }

      if (onApplyConditions) {
        onApplyConditions(conditionUpdates);
      }

      Alert.alert(
        'Profile and Challenges Customized',
        'Your Daily Challenges and therapeutic exercises have been dynamically updated for your posture profile.',
        [{ text: 'Great', onPress: () => { setIsReportVisible(false); onClose(); } }]
      );
    } catch (e) {
      Alert.alert('Notice', 'Customized posture plan applied for this session.');
      setIsReportVisible(false);
      onClose();
    } finally {
      setApplyingProfile(false);
    }
  };

  const htmlBundle = getDeformityDetectorHtmlBundle();

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" hidden={!isReportVisible} />

        {/* 1. TOP SCANNER HUD BAR */}
        <View style={styles.topHudBar}>
          <TouchableOpacity style={styles.iconCircleBtn} onPress={onClose} activeOpacity={0.8}>
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.scannerTitleBox}>
            <Activity size={13} color="#E25822" style={{ marginRight: 6 }} />
            <Text style={styles.scannerTitleText}>AI POSTURE SCANNER</Text>
          </View>

          <View style={styles.topHudRightGroup}>
            <TouchableOpacity
              style={styles.iconCircleBtn}
              onPress={() => {
                webViewRef.current?.injectJavaScript('window.toggleFacingMode && window.toggleFacingMode(); true;');
              }}
              activeOpacity={0.8}
            >
              <SwitchCamera size={18} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconCircleBtn}
              onPress={() => setIsVoiceMuted(!isVoiceMuted)}
              activeOpacity={0.8}
            >
              {isVoiceMuted ? <VolumeX size={18} color="#94A3B8" /> : <Volume2 size={18} color="#E25822" />}
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. MAIN CAMERA VIEW */}
        <View style={styles.cameraContainer}>
          <WebView
            ref={webViewRef}
            source={{ html: htmlBundle, baseUrl: 'http://127.0.0.1:8888' }}
            userAgent="MobilePoseApp/1.0"
            style={styles.webView}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant"
            javaScriptEnabled
            domStorageEnabled
            allowFileAccess
            allowUniversalAccessFromFileURLs
            allowingReadAccessToURL="*"
            mixedContentMode="always"
            originWhitelist={['*']}
            onMessage={handleWebViewMessage}
          />

          {/* REAL-TIME PROGRESS OVERLAY */}
          {!isModelLoading && (
            <View style={styles.scanProgressCard}>
              <View style={styles.scanStatusRow}>
                <Animated.View style={[styles.scanStatusDot, { transform: [{ scale: pulseAnim }] }]} />
                <Text style={styles.scanStatusPrompt} numberOfLines={1}>
                  {statusMessage}
                </Text>
              </View>

              {/* Countdown Progress Track */}
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${scanProgress}%` }]} />
              </View>

              <View style={styles.progressMetaRow}>
                <Text style={styles.progressMetaHint}>Stand 6ft back and hold steady</Text>
                <Text style={styles.progressMetaPct}>{scanProgress}%</Text>
              </View>
            </View>
          )}

          {/* BOTTOM LIVE METRICS SUMMARY PILL */}
          {liveChecks.length > 0 && !isModelLoading && (
            <View style={styles.liveMetricsFloatingPill}>
              {liveChecks.slice(0, 3).map((chk, i) => (
                <View key={i} style={styles.liveCheckChip}>
                  <View style={[styles.checkIndicatorDot, { backgroundColor: chk.detected ? '#EF4444' : '#10B981' }]} />
                  <Text style={styles.liveCheckChipText} numberOfLines={1}>
                    {chk.title}: {chk.valueText}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 3. DIAGNOSTIC ASSESSMENT REPORT MODAL */}
        {summaryReport && (
          <Modal visible={isReportVisible} animationType="slide" transparent>
            <View style={styles.reportModalOverlay}>
              <View style={styles.reportCard}>
                {/* Drag Handle Bar */}
                <View style={styles.sheetHandleBar} />

                <View style={styles.reportHeaderRow}>
                  <View style={styles.reportHeaderLeft}>
                    <View style={styles.reportBadge}>
                      <Activity size={12} color="#E25822" style={{ marginRight: 5 }} />
                      <Text style={styles.reportBadgeText}>YOUR RESULT</Text>
                    </View>
                    <Text style={styles.reportHeadline}>{summaryReport.headline}</Text>
                    <Text style={styles.reportDate}>{summaryReport.timestamp}</Text>
                  </View>

                  <View style={[
                    styles.scorePill,
                    summaryReport.overallStatus === 'excellent'
                      ? styles.scorePillGreen
                      : styles.scorePillAmber
                  ]}>
                    <Text style={styles.scoreNumber}>{summaryReport.overallScore}%</Text>
                    <Text style={styles.scoreLabel}>Straight</Text>
                  </View>
                </View>

                {/* SCROLLABLE DETAILED FINDINGS */}
                <ScrollView style={styles.reportScroll} showsVerticalScrollIndicator={false}>
                  <Text style={styles.sectionHeaderTitle}>BODY CHECKS ({summaryReport.results.length})</Text>

                  {summaryReport.results.map((item, idx) => (
                    <View key={idx} style={[styles.findingCard, item.detected && styles.findingCardWarning]}>
                      <View style={styles.findingTopRow}>
                        <View style={styles.findingTitleRow}>
                          <Text style={styles.findingTitle}>{item.title}</Text>
                          <View style={[
                            styles.severityBadge,
                            item.detected ? styles.severityBadgeWarn : styles.severityBadgeGood
                          ]}>
                            {item.detected ? (
                              <>
                                <AlertTriangle size={11} color="#EF4444" style={{ marginRight: 3 }} />
                                <Text style={styles.severityWarnText}>Needs Care</Text>
                              </>
                            ) : (
                              <>
                                <Check size={11} color="#10B981" style={{ marginRight: 3 }} />
                                <Text style={styles.severityGoodText}>Normal</Text>
                              </>
                            )}
                          </View>
                        </View>
                        <Text style={styles.findingValue}>{item.valueText}</Text>
                      </View>

                      <Text style={styles.findingDetail}>{item.detail}</Text>
                      <Text style={styles.findingExplanation}>{item.explanation}</Text>

                      {/* Recommended Exercises for this finding */}
                      {item.detected && item.recommendedExercises && item.recommendedExercises.length > 0 && (
                        <View style={styles.therapyRow}>
                          <Activity size={12} color="#E25822" style={{ marginRight: 5 }} />
                          <Text style={styles.therapyText}>
                            Do daily: {item.recommendedExercises.join(', ')}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))}

                  <View style={styles.disclaimerBox}>
                    <Info size={14} color="#94A3B8" style={{ marginRight: 6 }} />
                    <Text style={styles.disclaimerText}>
                      Camera check guide. Consult a doctor for medical advice.
                    </Text>
                  </View>
                </ScrollView>

                {/* BOTTOM ACTION BUTTONS */}
                <View style={styles.reportActionsRow}>
                  <TouchableOpacity
                    style={styles.reportRetakeBtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      setIsReportVisible(false);
                      setScanProgress(0);
                      webViewRef.current?.injectJavaScript('window.resetScan && window.resetScan(); true;');
                    }}
                  >
                    <RotateCcw size={16} color="#CBD5E1" style={{ marginRight: 6 }} />
                    <Text style={styles.reportRetakeText}>Check Again</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.reportApplyBtn}
                    activeOpacity={0.9}
                    onPress={handleApplyToProfile}
                    disabled={applyingProfile}
                  >
                    <CheckCircle2 size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.reportApplyText}>
                      {applyingProfile ? 'Saving...' : 'Save to Daily Plan'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topHudBar: {
    position: 'absolute',
    top: 48,
    left: 18,
    right: 18,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topHudRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(17, 20, 26, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 20, 26, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(226, 88, 34, 0.25)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scannerTitleText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cameraContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scanProgressCard: {
    position: 'absolute',
    bottom: 34,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(26, 29, 36, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 22,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  scanStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  scanStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E25822',
    marginRight: 8,
  },
  scanStatusPrompt: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  progressTrack: {
    width: '100%',
    height: 7,
    backgroundColor: '#1E293B',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#E25822',
    borderRadius: 6,
  },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressMetaHint: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '500',
  },
  progressMetaPct: {
    color: '#E25822',
    fontSize: 13,
    fontWeight: '800',
  },
  liveMetricsFloatingPill: {
    position: 'absolute',
    top: 104,
    left: 20,
    right: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  liveCheckChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26, 29, 36, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4.5,
  },
  checkIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  liveCheckChipText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
  reportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  reportCard: {
    backgroundColor: '#11141A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: Dimensions.get('window').height * 0.88,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sheetHandleBar: {
    width: 38,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  reportHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  reportHeaderLeft: {
    flex: 1,
    marginRight: 14,
  },
  reportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(226, 88, 34, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(226, 88, 34, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  reportBadgeText: {
    color: '#E25822',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  reportHeadline: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  reportDate: {
    color: '#94A3B8',
    fontSize: 12,
  },
  scorePill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePillGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: '#10B981',
    borderWidth: 1.5,
  },
  scorePillAmber: {
    backgroundColor: 'rgba(226, 88, 34, 0.12)',
    borderColor: '#E25822',
    borderWidth: 1.5,
  },
  scoreNumber: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  scoreLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  reportScroll: {
    maxHeight: 380,
    marginBottom: 16,
  },
  sectionHeaderTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 12,
  },
  findingCard: {
    backgroundColor: '#1A1D24',
    borderRadius: 18,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  findingCardWarning: {
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  findingTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  findingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  findingTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 8,
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  severityBadgeGood: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  severityBadgeWarn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  severityGoodText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '800',
  },
  severityWarnText: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '800',
  },
  findingValue: {
    color: '#E25822',
    fontSize: 12,
    fontWeight: '700',
  },
  findingDetail: {
    color: '#CBD5E1',
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 4,
  },
  findingExplanation: {
    color: '#94A3B8',
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 8,
  },
  therapyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(226, 88, 34, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(226, 88, 34, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  therapyText: {
    color: '#E25822',
    fontSize: 11,
    fontWeight: '700',
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  disclaimerText: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
  reportActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  reportRetakeBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#242833',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportRetakeText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '700',
  },
  reportApplyBtn: {
    flex: 2,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#E25822',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E25822',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  reportApplyText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
});
