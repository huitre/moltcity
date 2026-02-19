// ============================================
// MOLTCITY - Timelapse Recorder
// ============================================
// Records gameplay to create promotional timelapse videos

import * as state from './state.js';

// Recording state
let isRecording = false;
let frames = [];
let recordingInterval = null;
let frameCount = 0;
let startTime = null;
let panelVisible = false;

// Settings (configurable)
let settings = {
  captureInterval: 500,    // ms between captures (500ms = 2 FPS for timelapse)
  maxFrames: 600,          // Max frames to store (600 frames @ 500ms = 5 min recording)
  quality: 0.92,           // JPEG quality (0.0 - 1.0)
  videoFps: 30,            // Output video FPS
  hideUI: true,            // Hide UI elements during capture
};

/**
 * Initialize timelapse UI
 */
export function initTimelapse() {
  createTimelapsePanel();
  setupKeyboardShortcuts();
  console.log('[Timelapse] Recorder initialized. Press R to toggle recording.');
}

/**
 * Create the timelapse dropdown panel (hidden by default)
 */
function createTimelapsePanel() {
  const panel = document.createElement('div');
  panel.id = 'timelapse-panel';
  panel.innerHTML = `
    <style>
      #timelapse-panel {
        position: fixed;
        top: 28px;
        right: 6px;
        background: rgba(0,0,0,0.9);
        border: 1px solid #555;
        border-radius: 6px;
        padding: 10px;
        color: white;
        font-family: Arial, sans-serif;
        font-size: 11px;
        z-index: 10000;
        min-width: 170px;
        display: none;
      }
      #timelapse-panel.recording {
        border-color: #ff4444;
        box-shadow: 0 0 8px rgba(255,68,68,0.4);
      }
      #timelapse-panel h4 {
        margin: 0 0 6px 0;
        font-size: 11px;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      #timelapse-panel .rec-dot {
        width: 8px;
        height: 8px;
        background: #ff4444;
        border-radius: 50%;
        display: none;
        animation: tl-pulse 1s infinite;
      }
      #timelapse-panel.recording .rec-dot {
        display: inline-block;
      }
      @keyframes tl-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      #timelapse-panel .tl-stats {
        margin: 6px 0;
        padding: 4px 6px;
        background: rgba(255,255,255,0.08);
        border-radius: 3px;
        font-size: 10px;
      }
      #timelapse-panel .tl-stats div {
        margin: 2px 0;
      }
      #timelapse-panel button {
        width: 100%;
        padding: 5px;
        margin: 3px 0;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 10px;
        font-weight: bold;
        transition: all 0.15s;
      }
      #timelapse-panel button:hover { transform: scale(1.02); }
      #timelapse-panel .tl-record { background: #ff4444; color: white; }
      #timelapse-panel .tl-record.stop { background: #44ff44; color: black; }
      #timelapse-panel .tl-video { background: #9944ff; color: white; }
      #timelapse-panel .tl-download { background: #4488ff; color: white; }
      #timelapse-panel .tl-clear { background: #666; color: white; }
      #timelapse-panel button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
      #timelapse-panel .tl-settings {
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid rgba(255,255,255,0.15);
        font-size: 10px;
      }
      #timelapse-panel .tl-settings label {
        display: flex;
        justify-content: space-between;
        margin: 3px 0;
        align-items: center;
      }
      #timelapse-panel .tl-settings input[type="number"] {
        width: 50px;
        padding: 1px 3px;
        border-radius: 2px;
        border: none;
        font-size: 10px;
      }
      #btn-timelapse.recording {
        color: #ff4444 !important;
        animation: tl-pulse 1s infinite;
      }
    </style>
    <h4><span class="rec-dot"></span>Timelapse</h4>
    <div class="tl-stats">
      <div>Frames: <span id="tl-frames">0</span> / ${settings.maxFrames}</div>
      <div>Duration: <span id="tl-duration">0:00</span></div>
      <div>Size: <span id="tl-size">0 MB</span></div>
    </div>
    <button class="tl-record" id="tl-record">Start Recording (R)</button>
    <button class="tl-video" id="tl-video" disabled>Export Video</button>
    <button class="tl-download" id="tl-download" disabled>Download Frames</button>
    <button class="tl-clear" id="tl-clear" disabled>Clear</button>
    <div class="tl-settings">
      <label>
        Interval (ms):
        <input type="number" id="tl-interval" value="${settings.captureInterval}" min="100" max="5000" step="100">
      </label>
      <label>
        <input type="checkbox" id="tl-hideui" ${settings.hideUI ? 'checked' : ''}> Hide UI
      </label>
    </div>
  `;
  document.body.appendChild(panel);

  // Button handlers
  document.getElementById('tl-record').addEventListener('click', toggleRecording);
  document.getElementById('tl-video').addEventListener('click', exportVideo);
  document.getElementById('tl-download').addEventListener('click', downloadFrames);
  document.getElementById('tl-clear').addEventListener('click', clearFrames);

  // Settings changes
  document.getElementById('tl-interval').addEventListener('change', (e) => {
    settings.captureInterval = parseInt(e.target.value) || 500;
  });
  document.getElementById('tl-hideui').addEventListener('change', (e) => {
    settings.hideUI = e.target.checked;
  });

  // Topbar button toggles panel
  const btn = document.getElementById('btn-timelapse');
  if (btn) {
    btn.addEventListener('click', togglePanel);
  }

  // Close panel on outside click
  document.addEventListener('click', (e) => {
    if (!panelVisible) return;
    const panelEl = document.getElementById('timelapse-panel');
    const btnEl = document.getElementById('btn-timelapse');
    if (panelEl && !panelEl.contains(e.target) && btnEl && !btnEl.contains(e.target)) {
      hidePanel();
    }
  });
}

function togglePanel() {
  panelVisible ? hidePanel() : showPanel();
}

function showPanel() {
  const panel = document.getElementById('timelapse-panel');
  if (panel) { panel.style.display = 'block'; panelVisible = true; }
}

function hidePanel() {
  const panel = document.getElementById('timelapse-panel');
  if (panel) { panel.style.display = 'none'; panelVisible = false; }
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'r' || e.key === 'R') {
      if (!e.shiftKey) toggleRecording();
    }
  });
}

/**
 * Toggle recording on/off
 */
export function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

/**
 * Start recording
 */
export function startRecording() {
  if (isRecording) return;

  isRecording = true;
  startTime = Date.now();
  frameCount = 0;

  const panel = document.getElementById('timelapse-panel');
  const btn = document.getElementById('tl-record');
  const topBtn = document.getElementById('btn-timelapse');
  if (panel) panel.classList.add('recording');
  if (btn) { btn.classList.add('stop'); btn.textContent = 'Stop Recording (R)'; }
  if (topBtn) topBtn.classList.add('recording');

  console.log('[Timelapse] Recording started...');

  captureFrame();

  recordingInterval = setInterval(() => {
    if (frames.length >= settings.maxFrames) {
      console.log('[Timelapse] Max frames reached, stopping...');
      stopRecording();
      return;
    }
    captureFrame();
  }, settings.captureInterval);
}

/**
 * Stop recording
 */
export function stopRecording() {
  if (!isRecording) return;

  isRecording = false;
  clearInterval(recordingInterval);
  recordingInterval = null;

  const panel = document.getElementById('timelapse-panel');
  const btn = document.getElementById('tl-record');
  const topBtn = document.getElementById('btn-timelapse');
  if (panel) panel.classList.remove('recording');
  if (btn) { btn.classList.remove('stop'); btn.textContent = 'Start Recording (R)'; }
  if (topBtn) topBtn.classList.remove('recording');

  document.getElementById('tl-video').disabled = frames.length === 0;
  document.getElementById('tl-download').disabled = frames.length === 0;
  document.getElementById('tl-clear').disabled = frames.length === 0;

  console.log(`[Timelapse] Recording stopped. ${frames.length} frames captured.`);
}

/**
 * Capture a single frame
 */
function captureFrame() {
  if (!state.app || !state.app.renderer) return;

  try {
    const uiElements = settings.hideUI ? hideUIElements() : null;

    state.app.renderer.render(state.app.stage);

    const canvas = state.app.renderer.view;
    const dataUrl = canvas.toDataURL('image/jpeg', settings.quality);

    frames.push({
      data: dataUrl,
      timestamp: Date.now() - startTime,
    });

    frameCount++;

    if (uiElements) restoreUIElements(uiElements);

    updateStats();

  } catch (err) {
    console.error('Failed to capture frame:', err);
  }
}

/**
 * Hide UI elements for clean capture
 */
function hideUIElements() {
  const elements = [
    document.getElementById('bottom-toolbar'),
    document.getElementById('top-bar'),
    document.getElementById('city-tooltip'),
    document.getElementById('timelapse-panel'),
    document.querySelector('.sidebar'),
  ].filter(Boolean);

  const visibility = elements.map(el => ({
    el,
    display: el.style.display
  }));

  elements.forEach(el => el.style.display = 'none');

  return visibility;
}

/**
 * Restore UI elements after capture
 */
function restoreUIElements(visibility) {
  visibility.forEach(({ el, display }) => {
    el.style.display = display;
  });
}

/**
 * Update stats display
 */
function updateStats() {
  const framesEl = document.getElementById('tl-frames');
  const durationEl = document.getElementById('tl-duration');
  const sizeEl = document.getElementById('tl-size');
  if (framesEl) framesEl.textContent = frames.length;

  const durationSec = Math.floor((Date.now() - startTime) / 1000);
  const min = Math.floor(durationSec / 60);
  const sec = durationSec % 60;
  if (durationEl) durationEl.textContent = `${min}:${sec.toString().padStart(2, '0')}`;

  const avgFrameSize = frames.length > 0
    ? frames.reduce((acc, f) => acc + f.data.length, 0) / frames.length
    : 0;
  const totalMB = (avgFrameSize * frames.length / 1024 / 1024).toFixed(1);
  if (sizeEl) sizeEl.textContent = `~${totalMB} MB`;
}

/**
 * Export as video using MediaRecorder + Canvas
 */
export async function exportVideo() {
  if (frames.length === 0) {
    alert('No frames to export!');
    return;
  }

  const btn = document.getElementById('tl-video');
  btn.disabled = true;
  btn.textContent = 'Encoding...';

  try {
    const firstImg = await loadImage(frames[0].data);
    const canvas = document.createElement('canvas');
    canvas.width = firstImg.width;
    canvas.height = firstImg.height;
    const ctx = canvas.getContext('2d');

    const stream = canvas.captureStream(settings.videoFps);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 8000000,
    });

    const chunks = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

    return new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        downloadBlob(blob, `agentcity-timelapse-${Date.now()}.webm`);
        btn.disabled = false;
        btn.textContent = 'Export Video';
        resolve();
      };

      mediaRecorder.start();

      let frameIndex = 0;
      const frameDelay = 1000 / settings.videoFps;

      const drawNextFrame = async () => {
        if (frameIndex >= frames.length) {
          mediaRecorder.stop();
          return;
        }

        const img = await loadImage(frames[frameIndex].data);
        ctx.drawImage(img, 0, 0);
        frameIndex++;

        const progress = Math.floor((frameIndex / frames.length) * 100);
        btn.textContent = `${progress}%`;

        setTimeout(drawNextFrame, frameDelay);
      };

      drawNextFrame();
    });

  } catch (err) {
    console.error('Video export failed:', err);
    alert('Video export failed: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Export Video';
  }
}

/**
 * Download frames as individual images
 */
export function downloadFrames() {
  if (frames.length === 0) {
    alert('No frames to download!');
    return;
  }

  const btn = document.getElementById('tl-download');
  btn.disabled = true;
  btn.textContent = 'Preparing...';

  frames.forEach((frame, i) => {
    setTimeout(() => {
      const link = document.createElement('a');
      link.href = frame.data;
      link.download = `frame_${i.toString().padStart(4, '0')}.jpg`;
      link.click();

      if (i === frames.length - 1) {
        btn.disabled = false;
        btn.textContent = 'Download Frames';
      }
    }, i * 100);
  });
}

/**
 * Clear all recorded frames
 */
export function clearFrames() {
  if (isRecording) stopRecording();

  frames = [];
  frameCount = 0;
  startTime = null;

  const framesEl = document.getElementById('tl-frames');
  const durationEl = document.getElementById('tl-duration');
  const sizeEl = document.getElementById('tl-size');
  if (framesEl) framesEl.textContent = '0';
  if (durationEl) durationEl.textContent = '0:00';
  if (sizeEl) sizeEl.textContent = '0 MB';

  document.getElementById('tl-video').disabled = true;
  document.getElementById('tl-download').disabled = true;
  document.getElementById('tl-clear').disabled = true;

  console.log('[Timelapse] Frames cleared.');
}

/**
 * Helper: Load image from data URL
 */
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Helper: Download blob as file
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default {
  initTimelapse,
  startRecording,
  stopRecording,
  toggleRecording,
  exportVideo,
  downloadFrames,
  clearFrames,
};
