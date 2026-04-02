let isGazeEnabled = localStorage.getItem("gazeEnabled") === "true";
let gazeDot = null;
let gazeInitialized = false;

// MediaPipe Classic Variables
let faceMesh;
let camera;
let videoElement;
let webcamRunning = false;

// Smoothing Engine
let smoothX = window.innerWidth / 2;
let smoothY = window.innerHeight / 2;
let historyX = [];
let historyY = [];
const HISTORY_SIZE = 6;

// Blink state
let lastBlinkTime = 0;
const BLINK_COOLDOWN_MS = 800;
let isBlinking = false;

// ── GAZE-DWELL SCROLL ─────────────────────────────────────────────────────
// If gaze stays in bottom zone for DWELL_MS → scroll down.
// If gaze stays in top zone for DWELL_MS → scroll up.
const DWELL_MS          = 2000;  // 2 seconds dwell before scroll fires
const SCROLL_AMOUNT     = 220;   // px per scroll event
const BOTTOM_ZONE       = 0.78;  // bottom 22% of screen
const TOP_ZONE          = 0.12;  // top 12% of screen
const SCROLL_COOLDOWN   = 800;   // ms between auto-scrolls

let dwellZone           = null;  // 'up' | 'down' | null
let dwellStart          = 0;
let lastScrollTime      = 0;

// Baseline calibration — captures natural EAR when looking straight ahead
// We use a rolling average of the first N frames to set an adaptive threshold
let earBaseline = null;
let earCalibrationFrames = [];
const EAR_CALIBRATION_FRAMES = 30; // First 30 frames build the baseline

let canvasElement;
let canvasCtx;

async function initGaze() {
    if (gazeInitialized) return;
    
    // Dynamically load drawing_utils for the visual mask if not present
    if (!document.getElementById("mp-drawing-utils")) {
        let script = document.createElement('script');
        script.id = "mp-drawing-utils";
        script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js";
        script.crossOrigin = "anonymous";
        document.head.appendChild(script);
    }
    
    // Wait for classic CDN scripts to bind to window
    if (typeof FaceMesh === 'undefined' || typeof Camera === 'undefined' || typeof drawConnectors === 'undefined') {
        setTimeout(initGaze, 400);
        return;
    }
    
    gazeInitialized = true;
    
    // UI Elements
    gazeDot = document.createElement('div');
    gazeDot.className = 'gaze-dot';
    gazeDot.id = 'gaze-dot';
    gazeDot.style.display = isGazeEnabled ? 'block' : 'none';
    document.body.appendChild(gazeDot);
    
    videoElement = document.createElement('video');
    videoElement.style.position = 'fixed';
    videoElement.style.top = '10px';
    videoElement.style.left = '10px';
    videoElement.style.width = '200px';
    videoElement.style.borderRadius = '12px';
    videoElement.style.zIndex = '99998';
    videoElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    videoElement.style.display = isGazeEnabled ? 'block' : 'none';
    videoElement.style.transform = 'scaleX(-1)';
    videoElement.style.border = '2px solid rgba(59, 130, 246, 0.5)';
    document.body.appendChild(videoElement);
    
    canvasElement = document.createElement('canvas');
    canvasElement.style.position = 'fixed';
    canvasElement.style.top = '10px';
    canvasElement.style.left = '10px';
    canvasElement.width = 640;
    canvasElement.height = 480;
    canvasElement.style.width = '200px';
    canvasElement.style.borderRadius = '12px';
    canvasElement.style.zIndex = '99999';
    canvasElement.style.pointerEvents = 'none';
    canvasElement.style.transform = 'scaleX(-1)';
    canvasElement.style.display = isGazeEnabled ? 'block' : 'none';
    document.body.appendChild(canvasElement);
    canvasCtx = canvasElement.getContext('2d');

    const btn = document.getElementById('gaze-toggle');
    if (btn) btn.innerText = 'Initializing Core...';

    // FaceMesh Init (Legacy API is module-safe and robust on older browsers)
    faceMesh = new FaceMesh({locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
    }});
    
    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    
    faceMesh.onResults(onResults);
    
    camera = new Camera(videoElement, {
        onFrame: async () => {
            if (webcamRunning) {
                await faceMesh.send({image: videoElement});
            }
        },
        width: 640,
        height: 480
    });

    if (isGazeEnabled) {
        startCamera();
    } else {
        if (btn) btn.innerText = 'Gaze: OFF';
    }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function calcEAR(lm, outer, inner, top1, bot1, top2, bot2) {
    const w   = Math.hypot(lm[inner].x - lm[outer].x, lm[inner].y - lm[outer].y);
    const h1  = Math.hypot(lm[top1].x  - lm[bot1].x,  lm[top1].y  - lm[bot1].y);
    const h2  = Math.hypot(lm[top2].x  - lm[bot2].x,  lm[top2].y  - lm[bot2].y);
    return (h1 + h2) / (2.0 * w);
}

// ─── MAIN RESULTS HANDLER ─────────────────────────────────────────────────────

function onResults(results) {
    if (!webcamRunning) return;
    
    // ==== DRAW VISUAL MASK ====
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        if (typeof drawConnectors !== 'undefined') {
            drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, {color: '#C0C0C070', lineWidth: 1});
            drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, {color: '#34d399'});
            drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYEBROW, {color: '#34d399'});
            drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYE, {color: '#34d399'});
            drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYEBROW, {color: '#34d399'});
            drawConnectors(canvasCtx, landmarks, FACEMESH_FACE_OVAL, {color: '#E0E0E0'});
        }
        canvasCtx.restore();
        
        // ── 1. ADAPTIVE BLINK DETECTION ──────────────────────────────────────
        // Left eye EAR
        const leftEAR  = calcEAR(landmarks, 33, 133, 160, 144, 158, 153);
        // Right eye EAR  
        const rightEAR = calcEAR(landmarks, 362, 263, 387, 373, 385, 380);
        const avgEAR   = (leftEAR + rightEAR) / 2.0;

        // Build adaptive baseline during first N frames
        if (earBaseline === null) {
            earCalibrationFrames.push(avgEAR);
            if (earCalibrationFrames.length >= EAR_CALIBRATION_FRAMES) {
                // Use the mean of the calibration frames × 0.72 as threshold
                const sum = earCalibrationFrames.reduce((a, b) => a + b, 0);
                earBaseline = (sum / earCalibrationFrames.length) * 0.72;
                console.log(`[Gaze] Adaptive blink threshold set: ${earBaseline.toFixed(3)}`);
            }
        }

        // Use adaptive threshold if ready, else fall back to 0.22
        const blinkThreshold = earBaseline !== null ? earBaseline : 0.22;

        // KEY FIX: only fire blink if BOTH eyes are below threshold simultaneously.
        // When you tilt your head back (looking up) only one eye tends to "squint"
        // while the other stays open — so requiring both eyes prevents false triggers.
        const bothEyesClosed = leftEAR < blinkThreshold && rightEAR < blinkThreshold;

        if (bothEyesClosed) {
            if (!isBlinking) {
                isBlinking = true;
                if (Date.now() - lastBlinkTime > BLINK_COOLDOWN_MS) {
                    lastBlinkTime = Date.now();
                    triggerGazeClick(smoothX, smoothY);
                }
            }
        } else {
            isBlinking = false;
        }

        // ── 2. HEAD TRACKING ─────────────────────────────────────────────────
        const hNode = landmarks[168]; // horizontal — eyebrow midpoint
        const vNode = landmarks[1];   // vertical   — nose tip (longer arc)

        if (typeof window.gazeAnchorX === 'undefined') {
            window.gazeAnchorX = 1.0 - hNode.x;
            window.gazeAnchorY = vNode.y;
        }

        // Sensitivity — slightly reduced for comfort
        const sensitivityX = 8.0;
        const sensitivityY = 14.0;

        let rawX = ((1.0 - hNode.x) - window.gazeAnchorX) * sensitivityX * window.innerWidth  + (window.innerWidth  / 2);
        let rawY = ((vNode.y)        - window.gazeAnchorY) * sensitivityY * window.innerHeight + (window.innerHeight / 2);

        // ── 3. ROLLING WINDOW SMOOTHING ──────────────────────────────────────
        historyX.push(rawX);
        historyY.push(rawY);
        if (historyX.length > HISTORY_SIZE) historyX.shift();
        if (historyY.length > HISTORY_SIZE) historyY.shift();

        let avgX = historyX.reduce((a, b) => a + b) / historyX.length;
        let avgY = historyY.reduce((a, b) => a + b) / historyY.length;

        // ── 4. EMA SMOOTHING ─────────────────────────────────────────────────
        const alpha = 0.32;
        smoothX = smoothX * (1 - alpha) + avgX * alpha;
        smoothY = smoothY * (1 - alpha) + avgY * alpha;

        smoothX = Math.max(0, Math.min(window.innerWidth,  smoothX));
        smoothY = Math.max(0, Math.min(window.innerHeight, smoothY));

        if (gazeDot) {
            gazeDot.style.left = smoothX + 'px';
            gazeDot.style.top  = smoothY + 'px';
        }

        // ── 5. GAZE-DWELL SCROLL ─────────────────────────────────────────────
        const normY = smoothY / window.innerHeight;
        const now   = Date.now();
        let currentZone = null;
        if (normY > BOTTOM_ZONE) currentZone = 'down';
        else if (normY < TOP_ZONE) currentZone = 'up';

        if (currentZone !== dwellZone) {
            dwellZone  = currentZone;
            dwellStart = now;
        } else if (dwellZone && (now - dwellStart) >= DWELL_MS) {
            if (now - lastScrollTime > SCROLL_COOLDOWN) {
                lastScrollTime = now;
                dwellStart = now;
                window.scrollBy({ top: dwellZone === 'down' ? SCROLL_AMOUNT : -SCROLL_AMOUNT, behavior: 'smooth' });
            }
        }
    }
}

// ─── CAMERA CONTROL ───────────────────────────────────────────────────────────

async function startCamera() {
    if (!camera) return;
    webcamRunning = true;
    
    videoElement.style.display = 'block';
    if (canvasElement) canvasElement.style.display = 'block';
    gazeDot.style.display = 'block';
    
    const btn = document.getElementById('gaze-toggle');
    if (btn) btn.innerText = 'Loading Optics...';
    
    // Reset calibration so it re-learns on every session start
    earBaseline = null;
    earCalibrationFrames = [];
    
    await camera.start();
    
    if (btn) {
        btn.innerText = 'Gaze: ON 👁️';
        btn.classList.add('on', 'gaze-btn');
        btn.classList.remove('off');
    }
    
    // 🟢 ACCESSIBILITY FIX: Only announce the "Activated" speech once per session.
    // Page reloads (navigation) won't repeat the long instructions.
    if (!sessionStorage.getItem('gaze_announced_first_time')) {
        if (typeof speakText === 'function') speakText('Head tracking activated. Move your face to steer.');
        sessionStorage.setItem('gaze_announced_first_time', 'true');
    } else {
        // For sub-page navigation, we stay quiet to prevent repetition
        console.log("Gaze tracking continues on subpage...");
    }
    
    smoothX = window.innerWidth  / 2;
    smoothY = window.innerHeight / 2;
}

function stopCamera() {
    webcamRunning = false;
    if (camera) camera.stop();
    
    // Clear center calibration for next use
    window.gazeAnchorX = undefined;
    window.gazeAnchorY = undefined;
    earBaseline = null;
    earCalibrationFrames = [];
    
    videoElement.style.display = 'none';
    if (canvasElement) canvasElement.style.display = 'none';
    if (gazeDot) gazeDot.style.display = 'none';
    
    const btn = document.getElementById('gaze-toggle');
    if (btn) {
        btn.innerText = 'Gaze: OFF';
        btn.classList.remove('on');
        btn.classList.add('off');
    }
    if (typeof speakText === 'function') speakText('Tracking deactivated.');
}

function triggerGazeClick(x, y) {
    if (!gazeDot) return;
    
    gazeDot.classList.add('clicking');
    setTimeout(() => gazeDot.classList.remove('clicking'), 350);

    gazeDot.style.pointerEvents = 'none';
    const target = document.elementFromPoint(x, y);
    if (target && typeof target.click === 'function') {
        if (typeof speakText === 'function') speakText('Clicked');
        target.click();
    }
}

window.toggleGaze = function() {
    isGazeEnabled = !isGazeEnabled;
    localStorage.setItem("gazeEnabled", isGazeEnabled);
    if (isGazeEnabled) {
        if (!gazeInitialized) {
            initGaze();
        } else {
            startCamera();
        }
    } else {
        stopCamera();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        if (isGazeEnabled && !gazeInitialized) {
            initGaze();
        }
    }, 200);
});
