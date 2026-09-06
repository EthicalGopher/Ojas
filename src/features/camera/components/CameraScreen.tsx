import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  Animated,
  PanResponder,
  useWindowDimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Camera } from 'expo-camera';
import * as ScreenOrientation from 'expo-screen-orientation';
import {
  Dumbbell,
  LogOut,
  RotateCcw,
  Smartphone,
  SwitchCamera,
  Flame,
} from 'lucide-react-native';
import { LoadingScreen } from '../../../screens/LoadingScreen';

export type ModelComplexity = 'light' | 'medium' | 'high';

interface CameraScreenProps {
  onClose: () => void;
  selectedModel: ModelComplexity;
  exerciseId?: string;
  exerciseName?: string;
}

export const getPoseHtmlBundle = (exercise: string = 'squats', isMatch: boolean = false) => {
  const norm = exercise.toLowerCase();
  let exerciseMode = 'squats';
  let exerciseTitle = 'Squats';

  if (norm.includes('triangle') || norm === '3') {
    exerciseMode = 'triangle_pose';
    exerciseTitle = 'Triangle Pose';
  } else if (norm.includes('lunge') || norm === '4') {
    exerciseMode = 'lunge';
    exerciseTitle = 'Lunges';
  } else if (norm.includes('crunch') || norm === '5') {
    exerciseMode = 'crunch';
    exerciseTitle = 'Crunches';
  } else if (norm.includes('situp') || norm.includes('sit-up') || norm === '2') {
    exerciseMode = 'situp';
    exerciseTitle = 'Sit-ups';
  } else if (norm.includes('cobra') || norm.includes('bhujanga') || norm === '6') {
    exerciseMode = 'cobra_pose';
    exerciseTitle = 'Cobra Pose';
  }

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

    /* ---------- Loader ---------- */
    #loader-overlay {
      position: absolute; z-index: 20; width: 82%; max-width: 300px;
      background: rgba(15, 23, 42, 0.92); border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px; padding: 22px 20px; text-align: center; color: #F8FAFC;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    .spinner {
      width: 34px; height: 34px; margin: 0 auto 14px;
      border-radius: 50%; border: 3px solid rgba(255, 255, 255, 0.12);
      border-top-color: #818CF8; animation: spin 0.85s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loader-icon { font-size: 28px; margin-bottom: 12px; display: none; }
    .loader-title { font-size: 15px; font-weight: 700; color: #F8FAFC; margin-bottom: 5px; letter-spacing: 0.01em; }
    .loader-status { font-size: 12.5px; color: #94A3B8; margin-bottom: 14px; min-height: 16px; line-height: 16px; }

    .progress-track {
      width: 100%; height: 6px; background-color: #1E293B; border-radius: 8px;
      overflow: hidden; margin-bottom: 6px;
    }
    .progress-fill {
      height: 100%; width: 5%; background: #6366F1;
      border-radius: 8px; transition: width 0.25s ease, background-color 0.2s ease;
    }
    .progress-percentage { font-size: 11px; font-weight: 600; color: #64748B; text-align: right; }

    #retry-btn {
      display: none; margin-top: 12px; background-color: #6366F1; color: #fff;
      border: none; padding: 9px 22px; border-radius: 20px; font-weight: 600;
      font-size: 12.5px; cursor: pointer; letter-spacing: 0.01em;
    }

    /* ---------- HUD ---------- */
    #hud {
      position: absolute;
      top: 80px;
      left: 0;
      right: 0;
      display: ${isMatch ? 'none' : 'flex'};
      flex-direction: column;
      align-items: center;
      justifyContent: center;
      gap: 8px;
      z-index: 50;
      pointer-events: none;
    }
    @media (orientation: landscape) {
      #hud {
        top: 75px;
      }
    }
    .state-badge {
      display: inline-flex; align-items: center; gap: 12px;
      background: rgba(10, 12, 18, 0.94);
      border: 2.5px solid #FFFFFF;
      border-radius: 30px;
      padding: 10px 28px;
      backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7), 0 0 16px rgba(0, 0, 0, 0.5);
      transition: all 0.15s ease;
    }
    .state-dot {
      width: 14px; height: 14px; border-radius: 50%; background: #FFFFFF;
      box-shadow: 0 0 14px 4px rgba(255, 255, 255, 0.8); transition: all 0.15s ease;
      flex-shrink: 0;
    }
    .state-text {
      font-size: 26px; font-weight: 900; letter-spacing: 0.12em; color: #FFFFFF;
      text-transform: uppercase; transition: color 0.15s ease;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.9);
    }
    #hud-hint {
      margin-top: 4px; padding: 6px 16px; border-radius: 12px;
      background: rgba(220, 38, 38, 0.9); border: 1.5px solid #FCA5A5;
      font-size: 13px; font-weight: 800; color: #FFFFFF; display: none; text-align: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      max-width: 280px;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js" crossorigin="anonymous"></script>
</head>
<body>
  <div id="container">
    <div id="loader-overlay">
      <div class="spinner" id="loader-spinner"></div>
      <div class="loader-icon" id="loader-icon">⚠️</div>
      <div class="loader-title">Loading ${exerciseTitle} AI</div>
      <div class="loader-status" id="loader-status-text">Setting things up…</div>

      <div class="progress-track">
        <div class="progress-fill" id="progress-bar-fill"></div>
      </div>
      <div class="progress-percentage" id="progress-pct-text">20%</div>

      <button id="retry-btn" onclick="location.reload()">Retry</button>
    </div>

    <video id="video" playsinline webkit-playsinline muted></video>
    <canvas id="canvas"></canvas>

    ${!isMatch ? `
    <div id="hud">
      <div id="state-badge" class="state-badge">
        <span id="state-dot" class="state-dot"></span>
        <span id="state-value" class="state-text">Ready</span>
      </div>
      <div id="hud-hint">⚠️ Step back into frame</div>
    </div>
    ` : ''}
  </div>

  <script>
    const EXERCISE_MODE = '${exerciseMode}';
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const loaderOverlay = document.getElementById('loader-overlay');
    const statusText = document.getElementById('loader-status-text');
    const progressFill = document.getElementById('progress-bar-fill');
    const pctText = document.getElementById('progress-pct-text');
    const retryBtn = document.getElementById('retry-btn');
    const spinnerEl = document.getElementById('loader-spinner');
    const iconEl = document.getElementById('loader-icon');

    let currentProgress = 20;
    let poseInstance = null;
    let selectedComplexity = 1;
    let thumbCanvas = null;
    let thumbCtx = null;
    let lastThumbTime = 0;

    function setProgress(pct, statusMsg, isError) {
      currentProgress = Math.max(currentProgress, Math.min(100, pct));
      progressFill.style.width = currentProgress + '%';
      pctText.textContent = Math.round(currentProgress) + '%';
      if (statusMsg) statusText.textContent = statusMsg;
      if (isError) {
        spinnerEl.style.display = 'none';
        iconEl.style.display = 'inline-block';
        retryBtn.style.display = 'inline-block';
        statusText.style.color = '#F87171';
        progressFill.style.background = '#F87171';
      }
    }

    // ---------- Geometry & Angle Helpers ----------
    const REQUIRED_LANDMARKS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    const SMOOTHING_WINDOW = 5;
    const DEBOUNCE_FRAMES = 4;
    const kneeValues = [];
    const visibilityValues = [];
    let repCount = 0;
    let lastVisMsgTime = 0;

    function resetInternalScore() {
      repCount = 0;
      confirmedState = 'TOP';
      candidateState = null;
      candidateCount = 0;
      reachedApexOrBottom = false;
      correctHoldFrames = 0;
      kneeValues.length = 0;
      visibilityValues.length = 0;
    }

    function angle(a, b, c) {
      const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
      let deg = Math.abs((radians * 180.0) / Math.PI);
      if (deg > 180.0) deg = 360.0 - deg;
      return deg;
    }

    function average(arr, val) {
      arr.push(val);
      if (arr.length > SMOOTHING_WINDOW) arr.shift();
      return arr.reduce((acc, c) => acc + c, 0) / arr.length;
    }

    function calculateOverallVisibility(landmarks) {
      if (!landmarks || landmarks.length === 0) return 0;
      let sum = 0;
      let count = 0;
      for (const idx of REQUIRED_LANDMARKS) {
        if (landmarks[idx] && typeof landmarks[idx].visibility === 'number') {
          sum += landmarks[idx].visibility;
          count++;
        }
      }
      return count > 0 ? sum / count : 0;
    }

    // Generic state machine tracker with debounce
    let confirmedState = 'TOP';
    let candidateState = null;
    let candidateCount = 0;
    let reachedApexOrBottom = false;
    let correctHoldFrames = 0;

    function updateGenericStateMachine(instantState, apexState, startState) {
      if (instantState === candidateState) {
        candidateCount += 1;
      } else {
        candidateState = instantState;
        candidateCount = 1;
      }

      if (candidateCount < DEBOUNCE_FRAMES) return false;

      if (candidateState === apexState) reachedApexOrBottom = true;
      let completedRep = false;
      if (candidateState === startState && confirmedState !== startState) {
        if (reachedApexOrBottom) {
          repCount += 1;
          completedRep = true;
        }
        reachedApexOrBottom = false;
      }
      confirmedState = candidateState;
      candidateState = null;
      candidateCount = 0;
      return completedRep;
    }

    // ---------- HUD Rendering ----------
    const STATE_STYLE = {
      TOP: { text: 'TOP', color: '#FFFFFF', bg: 'rgba(15, 23, 42, 0.95)', border: '#38BDF8' },
      DOWN: { text: 'DOWN', color: '#E0E7FF', bg: 'rgba(49, 46, 129, 0.95)', border: '#818CF8' },
      BOTTOM: { text: 'BOTTOM', color: '#ECFDF5', bg: 'rgba(6, 78, 59, 0.95)', border: '#34D399' },
      PERFECT: { text: 'PERFECT', color: '#ECFDF5', bg: 'rgba(6, 78, 59, 0.95)', border: '#10B981' },
      ADJUST: { text: 'ADJUST', color: '#FFFBEB', bg: 'rgba(120, 53, 15, 0.95)', border: '#FBBF24' },
      SETUP: { text: 'SETUP', color: '#FDF4FF', bg: 'rgba(88, 28, 135, 0.95)', border: '#C084FC' },
      LOW_VISIBILITY: { text: 'LOW VISIBILITY', color: '#FFFFFF', bg: 'rgba(127, 29, 29, 0.98)', border: '#EF4444' },
    };

    let currentSmoothVisibility = 0;

    function renderState(state) {
      const effectiveState = currentSmoothVisibility < 0.40 ? 'LOW_VISIBILITY' : state;
      const cfg = STATE_STYLE[effectiveState] || STATE_STYLE.TOP;
      const dot = document.getElementById('state-dot');
      const label = document.getElementById('state-value');
      const badge = document.getElementById('state-badge');
      if (dot) {
        dot.style.background = cfg.color;
        dot.style.boxShadow = '0 0 8px 1px ' + cfg.color;
      }
      if (label) {
        label.textContent = cfg.text;
        label.style.color = cfg.color;
      }
      if (badge) {
        badge.style.background = cfg.bg;
        badge.style.borderColor = cfg.border;
      }
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'POSE_STATE',
          state: effectiveState,
          text: cfg.text,
          color: cfg.color,
          bg: cfg.bg,
          border: cfg.border
        }));
      }
    }

    function renderVisibility(value) {
      currentSmoothVisibility = value;
      const hintEl = document.getElementById('hud-hint');
      if (hintEl) {
        if (value < 0.40) {
          hintEl.textContent = '⚠️ Low Visibility: Step back into full frame';
          hintEl.style.display = 'block';
          hintEl.style.color = '#F87171';
        }
      }
    }

    // 1. Squats Engine
    function updateSquatEngine(pose) {
      const leftKnee = angle(pose[23], pose[25], pose[27]);
      const rightKnee = angle(pose[24], pose[26], pose[28]);
      const smoothKnee = average(kneeValues, (leftKnee + rightKnee) / 2);

      const instantState = smoothKnee <= 95 ? 'BOTTOM' : smoothKnee >= 155 ? 'TOP' : 'DOWN';
      
      // Enforce 40% minimum visibility to register or progress rep state
      const completedRep = currentSmoothVisibility >= 0.40
        ? updateGenericStateMachine(instantState, 'BOTTOM', 'TOP')
        : false;
      renderState(instantState);

      const hintEl = document.getElementById('hud-hint');
      if (hintEl && currentSmoothVisibility >= 0.40) {
        hintEl.style.display = smoothKnee > 115 && smoothKnee < 145 ? 'block' : 'none';
        hintEl.textContent = 'Squat deeper to parallel';
        hintEl.style.color = '#C8B6FF';
      }

      if (completedRep && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SQUAT_REP', repCount, poseName: 'Squats' }));
      }
    }

    // 2. Triangle Pose Engine
    function updateTrianglePoseEngine(pose) {
      const leftKnee = angle(pose[23], pose[25], pose[27]);
      const rightKnee = angle(pose[24], pose[26], pose[28]);
      const leftElbow = angle(pose[11], pose[13], pose[15]);
      const rightElbow = angle(pose[12], pose[14], pose[16]);
      const leftShoulder = angle(pose[13], pose[11], pose[23]);
      const rightShoulder = angle(pose[14], pose[12], pose[24]);

      const topSide = pose[15].y < pose[16].y ? 'left' : 'right';
      const topWrist = topSide === 'left' ? pose[15] : pose[16];
      const topShoulderPos = topSide === 'left' ? pose[11] : pose[12];
      const botShoulderPos = topSide === 'left' ? pose[12] : pose[11];
      const topArmShoulder = topSide === 'left' ? leftShoulder : rightShoulder;
      const topArmElbow = topSide === 'left' ? leftElbow : rightElbow;
      const bottomArmElbow = topSide === 'left' ? rightElbow : leftElbow;
      const frontKnee = topSide === 'left' ? rightKnee : leftKnee;
      const backKnee = topSide === 'left' ? leftKnee : rightKnee;

      const shoulderVec = { x: pose[12].x - pose[11].x, y: pose[12].y - pose[11].y };
      const shoulderTilt = Math.abs(Math.atan2(shoulderVec.y, shoulderVec.x) * 180 / Math.PI);
      const shoulderZDiff = Math.abs((topShoulderPos.z ?? 0) - (botShoulderPos.z ?? 0));

      const issues = [];
      if (frontKnee < 155) issues.push('Keep front leg straight (' + Math.round(frontKnee) + '°)');
      if (backKnee < 155) issues.push('Keep back leg straight (' + Math.round(backKnee) + '°)');
      if (topArmShoulder < 135) issues.push('Reach top arm straight up');
      if (topArmElbow < 150) issues.push('Extend top elbow fully');
      if (bottomArmElbow < 150) issues.push('Extend bottom arm along leg');
      if (shoulderTilt < 25) issues.push('Hinge deeper laterally from hip');
      if (shoulderZDiff > 0.35) issues.push('Open chest & stack shoulders');

      const isTopWristUp = topWrist.y < topShoulderPos.y;
      const hintEl = document.getElementById('hud-hint');

      if (currentSmoothVisibility < 0.40) {
        renderState('LOW_VISIBILITY');
        correctHoldFrames = 0;
        return;
      }

      if (!isTopWristUp) {
        renderState('SETUP');
        if (hintEl) {
          hintEl.textContent = '📐 Reach one arm up & hinge sideways';
          hintEl.style.display = 'block';
          hintEl.style.color = '#C8B6FF';
        }
        correctHoldFrames = 0;
      } else if (issues.length === 0) {
        renderState('PERFECT');
        correctHoldFrames += 1;
        const totalHoldSecs = (correctHoldFrames / 25).toFixed(1);
        if (hintEl) {
          hintEl.textContent = '✨ Perfect Alignment! Hold: ' + totalHoldSecs + 's';
          hintEl.style.display = 'block';
          hintEl.style.color = '#34D399';
        }
        if (correctHoldFrames % 75 === 0) {
          repCount += 1;
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'SQUAT_REP',
              repCount: repCount,
              holdSeconds: Math.floor(correctHoldFrames / 25),
              poseName: 'Triangle Pose'
            }));
          }
        }
      } else {
        renderState('ADJUST');
        correctHoldFrames = Math.max(0, correctHoldFrames - 2);
        if (hintEl) {
          hintEl.textContent = '⚠️ ' + issues[0];
          hintEl.style.display = 'block';
          hintEl.style.color = '#FBBF24';
        }
      }
    }

    // 3. Lunges Engine
    function updateLungeEngine(pose) {
      const midHipX = (pose[23].x + pose[24].x) / 2;
      const noseX = pose[0].x;
      const facingDir = (noseX - midHipX) >= 0 ? 1 : -1;
      const leftLead = (pose[27].x - midHipX) * facingDir;
      const rightLead = (pose[28].x - midHipX) * facingDir;
      const isLeftLead = leftLead >= rightLead;

      const frontKnee = isLeftLead ? angle(pose[23], pose[25], pose[27]) : angle(pose[24], pose[26], pose[28]);
      const backKnee = isLeftLead ? angle(pose[24], pose[26], pose[28]) : angle(pose[23], pose[25], pose[27]);
      const smoothFrontKnee = average(kneeValues, frontKnee);

      const shMid = midpoint(pose[11], pose[12]);
      const hipMid = midpoint(pose[23], pose[24]);
      const torsoVec = { x: shMid.x - hipMid.x, y: shMid.y - hipMid.y };
      const torsoAngle = Math.abs(Math.atan2(torsoVec.x, -torsoVec.y) * 180 / Math.PI);

      const instantState = (smoothFrontKnee <= 100 && backKnee <= 115) ? 'BOTTOM' : smoothFrontKnee >= 160 ? 'TOP' : 'DOWN';
      
      const completedRep = currentSmoothVisibility >= 0.40
        ? updateGenericStateMachine(instantState, 'BOTTOM', 'TOP')
        : false;
      renderState(instantState);

      const hintEl = document.getElementById('hud-hint');
      if (hintEl && currentSmoothVisibility >= 0.40) {
        if (torsoAngle > 22) {
          hintEl.textContent = '⚠️ Keep torso & chest upright';
          hintEl.style.display = 'block';
          hintEl.style.color = '#FBBF24';
        } else if (smoothFrontKnee > 105 && instantState === 'DOWN') {
          hintEl.textContent = 'Bend front knee to 90°';
          hintEl.style.display = 'block';
          hintEl.style.color = '#C8B6FF';
        } else {
          hintEl.style.display = 'none';
        }
      }

      if (completedRep && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SQUAT_REP', repCount, poseName: 'Lunges' }));
      }
    }

    // 4. Crunches Engine
    function updateCrunchEngine(pose) {
      const shMid = midpoint(pose[11], pose[12]);
      const hipMid = midpoint(pose[23], pose[24]);
      const dx = Math.abs(shMid.x - hipMid.x);
      const dy = Math.abs(shMid.y - hipMid.y);
      const torsoAngleToFloor = Math.atan2(dy, dx) * 180 / Math.PI;
      const smoothTorso = average(kneeValues, torsoAngleToFloor);

      const instantState = smoothTorso >= 22 ? 'BOTTOM' : smoothTorso <= 8 ? 'TOP' : 'DOWN';
      
      const completedRep = currentSmoothVisibility >= 0.40
        ? updateGenericStateMachine(instantState, 'BOTTOM', 'TOP')
        : false;
      renderState(instantState === 'BOTTOM' ? 'BOTTOM' : instantState === 'TOP' ? 'TOP' : 'DOWN');

      const hintEl = document.getElementById('hud-hint');
      if (hintEl && currentSmoothVisibility >= 0.40) {
        if (smoothTorso > 42) {
          hintEl.textContent = '⚠️ Lift shoulder blades only (don’t sit up)';
          hintEl.style.display = 'block';
          hintEl.style.color = '#FBBF24';
        } else if (smoothTorso < 18 && instantState === 'DOWN') {
          hintEl.textContent = 'Crunch up & contract abs';
          hintEl.style.display = 'block';
          hintEl.style.color = '#C8B6FF';
        } else {
          hintEl.style.display = 'none';
        }
      }

      if (completedRep && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SQUAT_REP', repCount, poseName: 'Crunches' }));
      }
    }

    // 5. Sit-ups Engine
    function updateSitupEngine(pose) {
      const shMid = midpoint(pose[11], pose[12]);
      const hipMid = midpoint(pose[23], pose[24]);
      const dx = Math.abs(shMid.x - hipMid.x);
      const dy = Math.abs(shMid.y - hipMid.y);
      const torsoAngleToFloor = Math.atan2(dy, dx) * 180 / Math.PI;
      const smoothTorso = average(kneeValues, torsoAngleToFloor);

      const instantState = smoothTorso >= 60 ? 'BOTTOM' : smoothTorso <= 20 ? 'TOP' : 'DOWN';
      
      const completedRep = currentSmoothVisibility >= 0.40
        ? updateGenericStateMachine(instantState, 'BOTTOM', 'TOP')
        : false;
      renderState(instantState === 'BOTTOM' ? 'BOTTOM' : instantState === 'TOP' ? 'TOP' : 'DOWN');

      const hintEl = document.getElementById('hud-hint');
      if (hintEl && currentSmoothVisibility >= 0.40) {
        if (instantState === 'DOWN' && smoothTorso < 50) {
          hintEl.textContent = 'Sit all the way up to 60°';
          hintEl.style.display = 'block';
          hintEl.style.color = '#C8B6FF';
        } else {
          hintEl.style.display = 'none';
        }
      }

      if (completedRep && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SQUAT_REP', repCount, poseName: 'Sit-ups' }));
      }
    }

    // 6. Cobra Pose Engine (Bhujangasana)
    function updateCobraPoseEngine(pose) {
      const leftVis = ((pose[11].visibility || 1) + (pose[13].visibility || 1) + (pose[15].visibility || 1) + (pose[23].visibility || 1)) / 4.0;
      const rightVis = ((pose[12].visibility || 1) + (pose[14].visibility || 1) + (pose[16].visibility || 1) + (pose[24].visibility || 1)) / 4.0;
      const activeSide = leftVis >= rightVis ? 'left' : 'right';

      const leftElbowAng = angle(pose[11], pose[13], pose[15]);
      const rightElbowAng = angle(pose[12], pose[14], pose[16]);
      const leftKneeAng = angle(pose[23], pose[25], pose[27]);
      const rightKneeAng = angle(pose[24], pose[26], pose[28]);
      const leftHipAng = angle(pose[11], pose[23], pose[25]);
      const rightHipAng = angle(pose[12], pose[24], pose[26]);

      const activeElbow = activeSide === 'left' ? leftElbowAng : rightElbowAng;
      const activeKnee = activeSide === 'left' ? leftKneeAng : rightKneeAng;
      const activeHip = activeSide === 'left' ? leftHipAng : rightHipAng;

      const midShoulderY = (pose[11].y + pose[12].y) / 2.0;
      const midShoulderX = (pose[11].x + pose[12].x) / 2.0;
      const midHipY = (pose[23].y + pose[24].y) / 2.0;
      const midHipX = (pose[23].x + pose[24].x) / 2.0;
      const midKneeY = (pose[25].y + pose[26].y) / 2.0;
      const midAnkleY = (pose[27].y + pose[28].y) / 2.0;

      const chestLiftY = midHipY - midShoulderY;
      const torsoDx = Math.abs(midShoulderX - midHipX);
      const torsoDy = Math.abs(midShoulderY - midHipY);
      const torsoToHorizontal = Math.atan2(torsoDy, torsoDx) * 180 / Math.PI;

      const floorBaselineY = Math.max(midKneeY, midAnkleY);
      const pelvisLiftY = floorBaselineY - midHipY;

      const issues = [];
      if (pelvisLiftY > 0.08) {
        issues.push('Keep hips & pelvis grounded on the mat');
      }
      if (chestLiftY < 0.12 || torsoToHorizontal < 22) {
        issues.push('Lift chest higher off the mat');
      }
      if (activeElbow < 155) {
        issues.push('Extend elbows to Full Cobra (' + Math.round(activeElbow) + '°)');
      } else if (activeElbow > 178) {
        issues.push('Avoid hyperextending elbows');
      }
      if (activeKnee < 155) {
        issues.push('Straighten legs along the mat (' + Math.round(activeKnee) + '°)');
      }
      if (activeHip > 162) {
        issues.push('Arch back smoothly to lift chest');
      } else if (activeHip < 110) {
        issues.push('Ease off arch - maintain controlled curve');
      }
      if (pose[0].y > midShoulderY) {
        issues.push('Keep neck long & gaze forward');
      }

      const isProneLift = chestLiftY > 0.04 && torsoToHorizontal >= 12 && activeKnee >= 140;
      const hintEl = document.getElementById('hud-hint');

      if (currentSmoothVisibility < 0.40) {
        renderState('LOW_VISIBILITY');
        correctHoldFrames = 0;
        return;
      }

      if (!isProneLift) {
        renderState('SETUP');
        if (hintEl) {
          hintEl.textContent = '🐍 Lie prone & press chest upward (Side view recommended)';
          hintEl.style.display = 'block';
          hintEl.style.color = '#A7F3D0';
        }
        correctHoldFrames = 0;
      } else if (issues.length === 0) {
        renderState('PERFECT');
        correctHoldFrames += 1;
        const totalHoldSecs = (correctHoldFrames / 25).toFixed(1);
        if (hintEl) {
          hintEl.textContent = '✨ Perfect Full Cobra! Hold: ' + totalHoldSecs + 's';
          hintEl.style.display = 'block';
          hintEl.style.color = '#34D399';
        }
        if (correctHoldFrames % 75 === 0) {
          repCount += 1;
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'SQUAT_REP',
              repCount: repCount,
              holdSeconds: Math.floor(correctHoldFrames / 25),
              poseName: 'Cobra Pose'
            }));
          }
        }
      } else {
        renderState('ADJUST');
        correctHoldFrames = Math.max(0, correctHoldFrames - 2);
        if (hintEl) {
          hintEl.textContent = '⚠️ ' + issues[0];
          hintEl.style.display = 'block';
          hintEl.style.color = '#FBBF24';
        }
      }
    }

    // ---------- Pose Model + Camera ----------
    async function initApp() {
      try {
        setProgress(40, 'Preparing pose tracker…');

        if (typeof window.Pose === 'undefined') {
          throw new Error('Pose library is still loading. Please wait.');
        }

        const POSE_CONNECTIONS = [
          [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
          [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
          [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
          [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
          [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32]
        ];

        poseInstance = new window.Pose({
          locateFile: (file) => {
            setProgress(65, 'Loading model files…');
            return 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/' + file;
          }
        });

        poseInstance.setOptions({
          modelComplexity: selectedComplexity,
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.4,
          minTrackingConfidence: 0.4
        });

        let modelReady = false;

        poseInstance.onResults((results) => {
          if (!modelReady) {
            modelReady = true;
            setProgress(100, 'Ready');
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MODEL_READY' }));
            }
            setTimeout(() => {
              loaderOverlay.style.opacity = '0';
              loaderOverlay.style.transform = 'scale(0.95)';
              setTimeout(() => { loaderOverlay.style.display = 'none'; }, 300);
            }, 250);
          }

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // High-Speed Smooth HD Camera Stream for 1v1 Faceoff (25 FPS, 480x360)
          const nowTime = Date.now();
          if (nowTime - lastThumbTime >= 40 && video && video.videoWidth > 0) {
            lastThumbTime = nowTime;
            try {
              if (!thumbCanvas) {
                thumbCanvas = document.createElement('canvas');
                thumbCanvas.width = 480;
                thumbCanvas.height = 360;
                thumbCtx = thumbCanvas.getContext('2d', { alpha: false });
              }
              thumbCtx.drawImage(video, 0, 0, 480, 360);
              const frameJpeg = thumbCanvas.toDataURL('image/jpeg', 0.65);
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'camera_frame', frame: frameJpeg }));
              }
            } catch (e) {}
          }

          const landmarks = results.poseLandmarks;

          if (landmarks && landmarks.length > 0) {
            const visibility = Math.min(...REQUIRED_LANDMARKS.map((index) => landmarks[index]?.visibility ?? 1));
            const smoothVisibility = average(visibilityValues, visibility);
            renderVisibility(smoothVisibility);

            if (window.ReactNativeWebView && Date.now() - lastVisMsgTime > 200) {
              lastVisMsgTime = Date.now();
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'POSE_VISIBILITY',
                visibility: smoothVisibility
              }));
            }
          } else {
            renderVisibility(0);
            if (window.ReactNativeWebView && Date.now() - lastVisMsgTime > 200) {
              lastVisMsgTime = Date.now();
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'POSE_VISIBILITY',
                visibility: 0
              }));
            }
          }

          if (landmarks && landmarks.length > 0) {
            if (EXERCISE_MODE === 'triangle_pose') {
              updateTrianglePoseEngine(landmarks);
            } else if (EXERCISE_MODE === 'lunge') {
              updateLungeEngine(landmarks);
            } else if (EXERCISE_MODE === 'crunch') {
              updateCrunchEngine(landmarks);
            } else if (EXERCISE_MODE === 'situp') {
              updateSitupEngine(landmarks);
            } else if (EXERCISE_MODE === 'cobra_pose') {
              updateCobraPoseEngine(landmarks);
            } else {
              updateSquatEngine(landmarks);
            }

            ctx.lineWidth = 4;
            ctx.strokeStyle = '#6366F1';
            for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
              const start = landmarks[startIdx];
              const end = landmarks[endIdx];
              if (start && end && (start.visibility ?? 1) > 0.3 && (end.visibility ?? 1) > 0.3) {
                ctx.beginPath();
                ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
                ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
                ctx.stroke();
              }
            }

            for (const lm of landmarks) {
              if ((lm.visibility ?? 1) > 0.3) {
                ctx.beginPath();
                ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 6, 0, 2 * Math.PI);
                ctx.fillStyle = '#10B981';
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#FFFFFF';
                ctx.stroke();
              }
            }

            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'POSE_DETECTED', count: landmarks.length }));
            }
          } else if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'NO_PERSON', count: 0 }));
          }
        });

        setProgress(85, 'Starting camera…');

        let currentFacingMode = 'user';
        let currentStream = null;

        function startCamera(facingMode) {
          if (currentStream) {
            currentStream.getTracks().forEach((track) => track.stop());
          }

          const constraints = {
            video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
          };

          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setProgress(currentProgress, 'Camera access is not available on this device', true);
            return;
          }

          navigator.mediaDevices.getUserMedia(constraints)
            .then((stream) => {
              currentStream = stream;
              video.srcObject = stream;
              video.onloadedmetadata = () => {
                video.play();
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                processFrame();
              };
            })
            .catch((err) => {
              setProgress(currentProgress, 'Camera permission denied or camera unavailable', true);
            });
        }

        function processFrame() {
          if (!video || video.paused || video.ended || !poseInstance) return;

          poseInstance.send({ image: video })
            .then(() => {
              if (window.requestVideoFrameCallback) {
                video.requestVideoFrameCallback(processFrame);
              } else {
                requestAnimationFrame(processFrame);
              }
            })
            .catch(() => {
              requestAnimationFrame(processFrame);
            });
        }

        window.toggleFacingMode = () => {
          currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
          startCamera(currentFacingMode);
        };

        window.setInitialComplexity = (val) => {
          selectedComplexity = val;
          if (poseInstance) {
            poseInstance.setOptions({ modelComplexity: val });
          }
        };

        window.resetSessionScore = () => {
          resetInternalScore();
        };

        startCamera(currentFacingMode);

      } catch (err) {
        setProgress(currentProgress, err.message, true);
      }
    }

    window.addEventListener('DOMContentLoaded', initApp);
  </script>
</body>
</html>
  `;
};

export const POSE_HTML_BUNDLE = getPoseHtmlBundle('squats');

export const CameraScreen: React.FC<CameraScreenProps> = ({
  onClose,
  selectedModel,
  exerciseId = '1',
  exerciseName = 'Squats',
}) => {
  const [poseStatus, setPoseStatus] = useState<string>('Initializing Pose Engine…');
  const [poseDetected, setPoseDetected] = useState<boolean>(false);
  const [repCount, setRepCount] = useState<number>(0);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(true);
  const [visibility, setVisibility] = useState<number>(1);

  const webViewRef = useRef<WebView>(null);
  const repScaleAnim = useRef(new Animated.Value(1)).current;

  const isStepCount =
    exerciseName.toLowerCase().includes('lunge') ||
    exerciseId === '4';
  const isHoldPose =
    exerciseName.toLowerCase().includes('triangle') ||
    exerciseName.toLowerCase().includes('cobra') ||
    exerciseName.toLowerCase().includes('bhujanga') ||
    exerciseId === '3' ||
    exerciseId === '6';

  const countLabel = isHoldPose ? 'POINTS' : isStepCount ? 'STEPS' : 'REPS';

  useEffect(() => {
    async function requestPermissions() {
      try {
        if (Camera && Camera.requestCameraPermissionsAsync) {
          await Camera.requestCameraPermissionsAsync();
        }
      } catch (e) {
        console.warn('Camera permission request error:', e);
      }
    }
    requestPermissions();
  }, []);

  const numericComplexity = selectedModel === 'light' ? 0 : selectedModel === 'high' ? 2 : 1;

  const triggerRepBump = () => {
    repScaleAnim.setValue(1.3);
    Animated.spring(repScaleAnim, {
      toValue: 1,
      friction: 4,
      tension: 140,
      useNativeDriver: true,
    }).start();
  };

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'MODEL_READY') {
        setIsModelLoading(false);
      } else if (data.type === 'POSE_VISIBILITY' && typeof data.visibility === 'number') {
        setVisibility(data.visibility);
      } else if (data.type === 'SQUAT_REP' && typeof data.repCount === 'number') {
        setRepCount(data.repCount);
        triggerRepBump();
      } else if (data.type === 'POSE_DETECTED') {
        const label =
          selectedModel === 'light'
            ? 'Light Model'
            : selectedModel === 'high'
            ? 'High Model'
            : 'Medium Model';
        setPoseStatus(`🧍 MediaPipe Active (${label})`);
        setPoseDetected(true);
      } else if (data.type === 'NO_PERSON') {
        setPoseStatus('🔍 Searching for Person in Frame...');
        setPoseDetected(false);
        setVisibility(0);
      }
    } catch (e) {}
  };

  const handleToggleFlip = () => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript('window.toggleFacingMode(); true;');
    }
  };

  const handleToggleOrientation = async () => {
    try {
      const current = await ScreenOrientation.getOrientationAsync();
      const isLandscape =
        current === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        current === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      if (isLandscape) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
      }
    } catch (e) {
      console.warn('ScreenOrientation toggle error:', e);
    }
  };

  const handleRestartSession = () => {
    setRepCount(0);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript('window.resetSessionScore && window.resetSessionScore(); true;');
    }
  };

  const handleClose = async () => {
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } catch (e) {}
    onClose();
  };

  const handleWebViewLoad = () => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`window.setInitialComplexity(${numericComplexity}); true;`);
    }
  };

  const htmlBundle = getPoseHtmlBundle(exerciseName || exerciseId || 'squats');

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      <WebView
        ref={webViewRef}
        source={{
          html: htmlBundle,
          baseUrl: 'https://cdn.jsdelivr.net',
        }}
        userAgent="MobilePoseApp/1.0"
        style={StyleSheet.absoluteFill}
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
        onMessage={handleMessage}
        onLoadEnd={handleWebViewLoad}
      />

      {/* Top HUD Header: Solo Exercise Name & Rep / Step Counter */}
      <View style={styles.topHudContainer} pointerEvents="none">
        <View style={styles.exerciseBadgePill}>
          <Flame size={14} color="#E8D5C4" style={{ marginRight: 5 }} />
          <Text style={styles.exerciseBadgeText}>{exerciseName.toUpperCase()} SOLO</Text>
        </View>

        {/* Solo Rep / Step Score Badge */}
        <View style={styles.scoreBadgePill}>
          <Text style={styles.scoreBadgeLabel}>{countLabel}</Text>
          <Animated.Text
            style={[
              styles.scoreBadgeNumber,
              { transform: [{ scale: repScaleAnim }] },
            ]}
          >
            {repCount}
          </Animated.Text>
        </View>
      </View>

      {/* Low Visibility Banner Overlay in Solo Mode */}
      {!isModelLoading && visibility < 0.40 && (
        <View style={styles.soloLowVisibilityOverlay} pointerEvents="none">
          <View style={styles.soloLowVisibilityPill}>
            <Text style={styles.soloLowVisibilityText}>⚠️ LOW VISIBILITY</Text>
            <Text style={styles.soloLowVisibilitySub}>Step back into full camera frame to count reps</Text>
          </View>
        </View>
      )}

      {/* Single Draggable Floating Actions Widget */}
      <SoloDraggableActionsWidget
        onLeave={handleClose}
        onFlipCamera={handleToggleFlip}
        onToggleOrientation={handleToggleOrientation}
        onReset={handleRestartSession}
      />

      {/* Unified Animated Loading Screen for Solo Mode */}
      {isModelLoading && (
        <LoadingScreen
          title={`PREPARING ${exerciseName.toUpperCase()}`}
          message="Loading AI camera and pose tracking engine..."
          fullScreen={false}
          onCancel={handleClose}
        />
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Solo Mode Draggable Actions Floating Widget
// ---------------------------------------------------------------------------
interface SoloDraggableWidgetProps {
  onLeave: () => void;
  onFlipCamera: () => void;
  onToggleOrientation: () => void;
  onReset: () => void;
}

const SoloDraggableActionsWidget: React.FC<SoloDraggableWidgetProps> = ({
  onLeave,
  onFlipCamera,
  onToggleOrientation,
  onReset,
}) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  const defaultY = isLandscape
    ? Math.max(12, windowHeight - 64)
    : Math.max(12, windowHeight - 120);
  const defaultX = isLandscape
    ? Math.max(12, (windowWidth - 240) / 2)
    : 16;

  const pan = useRef(new Animated.ValueXY({ x: defaultX, y: defaultY })).current;
  const [isExpanded, setIsExpanded] = useState(true);

  // Keep widget in visible bounds on orientation change
  useEffect(() => {
    pan.setValue({ x: defaultX, y: defaultY });
  }, [windowWidth, windowHeight, isLandscape, defaultX, defaultY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value || 0,
          y: (pan.y as any)._value || 0,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.draggableContainer,
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={styles.widgetPillBox}>
        {/* Dumbbell Icon Floating Handle & Toggle */}
        <TouchableOpacity
          style={styles.dumbbellHandleBtn}
          activeOpacity={0.8}
          onPress={() => setIsExpanded(!isExpanded)}
        >
          <Dumbbell size={18} color="#11141A" strokeWidth={2.5} />
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.actionButtonsRow}>
            {/* 1. Leave Solo Practice */}
            <TouchableOpacity
              style={[styles.widgetActionBtn, styles.leaveActionBtn]}
              activeOpacity={0.75}
              onPress={onLeave}
            >
              <LogOut size={16} color="#FFFFFF" />
            </TouchableOpacity>

            {/* 2. Flip Camera */}
            <TouchableOpacity
              style={styles.widgetActionBtn}
              activeOpacity={0.75}
              onPress={onFlipCamera}
            >
              <SwitchCamera size={16} color="#11141A" />
            </TouchableOpacity>

            {/* 3. Rotate Orientation (Portrait / Landscape) */}
            <TouchableOpacity
              style={styles.widgetActionBtn}
              activeOpacity={0.75}
              onPress={onToggleOrientation}
            >
              <Smartphone size={16} color="#11141A" />
            </TouchableOpacity>

            {/* 4. Reset Count */}
            <TouchableOpacity
              style={[styles.widgetActionBtn, styles.resetActionBtn]}
              activeOpacity={0.75}
              onPress={onReset}
            >
              <RotateCcw size={16} color="#11141A" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  topHudContainer: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 80,
  },
  exerciseBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(12, 15, 20, 0.85)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  exerciseBadgeText: {
    color: '#E8D5C4',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  scoreBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(12, 15, 20, 0.85)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#E8D5C4',
    gap: 8,
  },
  scoreBadgeLabel: {
    color: '#8E95A0',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  scoreBadgeNumber: {
    color: '#E8D5C4',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  draggableContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 9999,
    elevation: 25,
  },
  widgetPillBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    gap: 6,
  },
  dumbbellHandleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E8D5C4',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  widgetActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveActionBtn: {
    backgroundColor: '#EF4444',
  },
  resetActionBtn: {
    backgroundColor: '#E8D5C4',
  },
  soloLowVisibilityOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 95,
    pointerEvents: 'none',
  },
  soloLowVisibilityPill: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    borderColor: '#EF4444',
    borderWidth: 1.5,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  soloLowVisibilityText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  soloLowVisibilitySub: {
    color: '#FEE2E2',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
});
