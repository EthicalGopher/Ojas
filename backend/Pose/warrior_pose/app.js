/**
 * AI Warrior II (Virabhadrasana II) Tracker - Main Client Application (JavaScript)
 * Real-Time Camera Video, 1:1 Accurate Skeleton Overlay, Full Screen, and HUD
 */

window.addEventListener('DOMContentLoaded', async () => {
    const videoElement = document.getElementById('webcam');
    const canvasElement = document.getElementById('output_canvas');
    const canvasCtx = canvasElement.getContext('2d');
    const loader = document.getElementById('loader');
    const toggleSkeletonBtn = document.getElementById('toggleSkeletonBtn');
    const resetBtn = document.getElementById('resetBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');

    let showLandmarks = true;
    let showDebugHUD = false; // Dev-only debug overlay (toggle: D). Off by default.
    let frameCount = 0;

    const poseEngine = new MediaPipeWarrior2EngineJS();

    // Auto resize canvas to match full viewport
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        canvasElement.width = window.innerWidth * dpr;
        canvasElement.height = window.innerHeight * dpr;
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Controls
    toggleSkeletonBtn.addEventListener('click', () => {
        showLandmarks = !showLandmarks;
        toggleSkeletonBtn.textContent = `Landmarks: ${showLandmarks ? 'ON' : 'OFF'} (L)`;
        toggleSkeletonBtn.classList.toggle('active', showLandmarks);
    });

    resetBtn.addEventListener('click', () => {
        poseEngine.resetTimers();
    });

    function setDebugHUD(enabled) {
        showDebugHUD = enabled;
        const debugBtn = document.getElementById('debugBtn');
        if (debugBtn) debugBtn.classList.toggle('active', enabled);
    }
    window.__setWarrior2DebugHUD = setDebugHUD;
    window.__warrior2Engine = poseEngine;

    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.warn(`Fullscreen error: ${err.message}`);
            });
            fullscreenBtn.textContent = "Exit Fullscreen (F)";
        } else {
            document.exitFullscreen().catch(err => {
                console.warn(`Fullscreen exit error: ${err.message}`);
            });
            fullscreenBtn.textContent = "Full Screen (F)";
        }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.key === 'l' || e.key === 'L') {
            toggleSkeletonBtn.click();
        } else if (e.key === 'r' || e.key === 'R') {
            resetBtn.click();
        } else if (e.key === 'f' || e.key === 'F') {
            fullscreenBtn.click();
        } else if (e.key === 'd' || e.key === 'D') {
            setDebugHUD(!showDebugHUD);
        }
    });

    const debugBtn = document.getElementById('debugBtn');
    if (debugBtn) {
        debugBtn.addEventListener('click', () => setDebugHUD(!showDebugHUD));
    }

    // HUD Drawing Function
    function drawHUD(ctx, width, height) {
        const barW = Math.min(840, width * 0.94);
        const barH = 68;
        const barX = (width - barW) / 2;
        const barY = 16;

        ctx.save();
        ctx.fillStyle = 'rgba(12, 14, 18, 0.88)';
        ctx.strokeStyle = 'rgba(50, 55, 68, 0.8)';
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 14);
        ctx.fill();
        ctx.stroke();

        // Section 1: WARRIOR II & ACTIVE STANCE
        ctx.fillStyle = '#a0a5b4';
        ctx.font = '500 12px sans-serif';
        ctx.fillText('WARRIOR II', barX + 24, barY + 24);

        ctx.fillStyle = '#00f0ff';
        ctx.font = 'bold 18px sans-serif';
        const stanceText = poseEngine.activeStance !== 'NONE' ? `[${poseEngine.activeStance}]` : '[WIDE STANCE]';
        ctx.fillText(stanceText, barX + 24, barY + 52);

        // Section 2: HOLD TIMER
        const col2X = barX + barW * 0.26;
        ctx.fillStyle = '#a0a5b4';
        ctx.font = '500 12px sans-serif';
        ctx.fillText('HOLD TIMER', col2X, barY + 24);

        const timerCol = poseEngine.inWarrior2 ? '#32ff78' : '#e0e0e0';
        ctx.fillStyle = timerCol;
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(`${poseEngine.currentHoldSeconds.toFixed(1)}s`, col2X, barY + 53);

        // Section 3: BEST STREAK
        const col3X = barX + barW * 0.52;
        ctx.fillStyle = '#a0a5b4';
        ctx.font = '500 12px sans-serif';
        ctx.fillText('BEST STREAK', col3X, barY + 24);

        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(`${poseEngine.bestHoldSeconds.toFixed(1)}s`, col3X, barY + 53);

        // Section 4: LANDMARK QUALITY
        const col4X = barX + barW * 0.73;
        ctx.fillStyle = '#a0a5b4';
        ctx.font = '500 12px sans-serif';
        ctx.fillText('LANDMARK QUALITY', col4X, barY + 24);

        const q = poseEngine.landmarkQuality;
        let qualTxt = '--';
        let qualCol = '#a0a5b4';
        if (q) {
            const pct = Math.round(q.mean * 100);
            qualTxt = `${pct}%`;
            qualCol = q.ok ? '#32ff78' : '#ffd700';
        }

        ctx.fillStyle = qualCol;
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(qualTxt, col4X, barY + 52);

        // Bottom Feedback Pill
        const pillW = Math.min(700, width * 0.90);
        const pillH = 46;
        const pillX = (width - pillW) / 2;
        const pillY = height - 64;

        ctx.fillStyle = 'rgba(12, 14, 18, 0.88)';
        ctx.strokeStyle = 'rgba(50, 55, 68, 0.8)';
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 23);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = poseEngine.feedbackColor;
        ctx.beginPath();
        ctx.arc(pillX + 24, pillY + 23, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = poseEngine.feedbackColor;
        ctx.font = '600 15px sans-serif';
        ctx.fillText(poseEngine.feedback, pillX + 40, pillY + 29);

        ctx.restore();
    }

    // Dev-Only Debug HUD (toggle: D)
    function drawDebugHUD(ctx, width, height) {
        const d = poseEngine.getDebugInfo();
        const fmt = (v, suffix = '') => (v === null || v === undefined) ? '--' : `${v}${suffix}`;
        const lines = [
            `STATE: ${d.state}`,
            `QUALITY: ${d.quality ? d.quality.mean.toFixed(2) : '--'} (min ${d.quality ? d.quality.min.toFixed(2) : '--'})`,
            `STANCE: ${d.activeStance} | RATIO: ${fmt(d.stanceRatio ? d.stanceRatio.toFixed(2) : '--')}`,
            `FRONT KNEE: ${fmt(d.frontKneeAngle ? d.frontKneeAngle.toFixed(1) : '--', '\u00b0')} (target 90-145\u00b0)`,
            `REAR KNEE: ${fmt(d.rearKneeAngle ? d.rearKneeAngle.toFixed(1) : '--', '\u00b0')} (min 160\u00b0)`,
            `ELBOWS: L ${fmt(d.leftElbowAngle ? d.leftElbowAngle.toFixed(1) : '--', '\u00b0')} | R ${fmt(d.rightElbowAngle ? d.rightElbowAngle.toFixed(1) : '--', '\u00b0')}`,
            `ARMS HORIZ: L ${fmt(d.leftArmHoriz ? d.leftArmHoriz.toFixed(1) : '--', '\u00b0')} | R ${fmt(d.rightArmHoriz ? d.rightArmHoriz.toFixed(1) : '--', '\u00b0')}`,
            `TORSO LEAN: ${fmt(d.torsoLean ? d.torsoLean.toFixed(1) : '--', '\u00b0')} (max 18\u00b0)`,
            `HEAD OFFSET: ${fmt(d.headOffset ? d.headOffset.toFixed(2) : '--')} (max ${d.headMaxOffset})`,
            `STREAKS: ok ${d.correctStreak}/${d.confirmFrames} | fail ${d.failedStreak}/${d.breakFrames}`,
            `ISSUES: ${d.issues.length ? d.issues.join(' | ') : 'none'}`
        ];

        const panelW = 400;
        const lineH = 20;
        const panelH = lines.length * lineH + 28;
        const panelX = width - panelW - 16;
        const panelY = 100;

        ctx.save();
        ctx.fillStyle = 'rgba(12, 14, 18, 0.88)';
        ctx.strokeStyle = 'rgba(50, 55, 68, 0.8)';
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelW, panelH, 12);
        ctx.fill();
        ctx.stroke();

        ctx.font = '12px monospace';
        ctx.fillStyle = '#00f0ff';
        ctx.fillText('DEBUG (dev only \u2014 press D to hide)', panelX + 16, panelY + 20);

        lines.forEach((line, i) => {
            if (i === 0) return;
            ctx.fillStyle = line.startsWith('ISSUES:') && d.issues.length ? '#ff3b30' : '#e0e0e0';
            ctx.fillText(line, panelX + 16, panelY + 20 + (i + 0.6) * lineH);
        });
        ctx.restore();
    }

    // Skeleton Landmarks Drawing Matching Video Object-Fit Cover
    function drawSkeleton(ctx, landmarks, drawW, drawH, offsetX, offsetY) {
        if (!showLandmarks || !landmarks) return;

        const connections = [
            [0, 11], [0, 12], // Nose to shoulders (head/neck)
            [11, 12], // Shoulders
            [11, 13], [13, 15], // Left Arm
            [12, 14], [14, 16], // Right Arm
            [11, 23], [12, 24], [23, 24], // Torso
            [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], // Left Leg & Foot
            [24, 26], [26, 28], [28, 30], [30, 32], [28, 32]  // Right Leg & Foot
        ];

        const color = poseEngine.formColor;

        ctx.save();
        // Shadow Line Pass
        ctx.strokeStyle = 'rgba(15, 15, 20, 0.9)';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        for (const [i1, i2] of connections) {
            const p1 = landmarks[i1];
            const p2 = landmarks[i2];
            if (p1 && p2 && (p1.visibility || 1) > 0.4 && (p2.visibility || 1) > 0.4) {
                ctx.beginPath();
                ctx.moveTo(offsetX + p1.x * drawW, offsetY + p1.y * drawH);
                ctx.lineTo(offsetX + p2.x * drawW, offsetY + p2.y * drawH);
                ctx.stroke();
            }
        }

        // Color Line Pass
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        for (const [i1, i2] of connections) {
            const p1 = landmarks[i1];
            const p2 = landmarks[i2];
            if (p1 && p2 && (p1.visibility || 1) > 0.4 && (p2.visibility || 1) > 0.4) {
                ctx.beginPath();
                ctx.moveTo(offsetX + p1.x * drawW, offsetY + p1.y * drawH);
                ctx.lineTo(offsetX + p2.x * drawW, offsetY + p2.y * drawH);
                ctx.stroke();
            }
        }

        // Joint Circles
        const keyJoints = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
        for (const idx of keyJoints) {
            const p = landmarks[idx];
            if (p && (p.visibility || 1) > 0.4) {
                const px = offsetX + p.x * drawW;
                const py = offsetY + p.y * drawH;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(px, py, 5, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    // MediaPipe Results Callback
    function onPoseResults(results) {
        if (loader && loader.style.display !== 'none') {
            loader.style.display = 'none';
        }

        frameCount++;
        const canvasW = canvasElement.width;
        const canvasH = canvasElement.height;

        const imgW = videoElement.videoWidth || 1280;
        const imgH = videoElement.videoHeight || 720;

        // Calculate object-fit: cover coordinates to perfectly align overlay on top of video element
        const scale = Math.max(canvasW / imgW, canvasH / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const offsetX = (canvasW - drawW) / 2;
        const offsetY = (canvasH - drawH) / 2;

        // Clear previous frame overlay
        canvasCtx.clearRect(0, 0, canvasW, canvasH);

        let poseFeatures = null;

        if (results.poseLandmarks && results.poseLandmarks.length > 0) {
            // Mirror X coordinate for 1:1 overlay over mirrored user body video
            const mirroredLandmarks = results.poseLandmarks.map(pt => ({
                x: 1.0 - pt.x,
                y: pt.y,
                z: pt.z,
                visibility: pt.visibility
            }));

            if (videoElement.videoWidth && videoElement.videoHeight) {
                setStreamAspect(videoElement.videoWidth, videoElement.videoHeight);
            }

            poseFeatures = poseEngine.analyzePose(mirroredLandmarks, results.poseWorldLandmarks);
            poseEngine.updateWarrior2State(poseFeatures);

            // Draw Skeleton Landmarks directly on user's body
            drawSkeleton(canvasCtx, mirroredLandmarks, drawW, drawH, offsetX, offsetY);
        } else {
            poseEngine.handleFrameWithoutPerson();
        }

        // Draw HUD overlay
        drawHUD(canvasCtx, canvasW, canvasH);

        // Dev-only debug overlay (toggle with D)
        if (showDebugHUD) {
            drawDebugHUD(canvasCtx, canvasW, canvasH);
        }
    }

    // Initialize MediaPipe Pose
    const pose = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    pose.onResults(onPoseResults);

    // Initialize Camera Feed
    const camera = new Camera(videoElement, {
        onFrame: async () => {
            await pose.send({ image: videoElement });
        },
        width: 1280,
        height: 720
    });

    try {
        await camera.start();
        console.log('[INFO] Camera stream active for Warrior II.');
    } catch (err) {
        console.error('[ERROR] Failed to start camera:', err);
        loader.innerHTML = `<p style="color:#ff3b30; font-weight:600;">Camera Error: ${err.message}</p>`;
    }
});
