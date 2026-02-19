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
  createTimelapseUI();
  setupKeyboardShortcuts();
  console.log('🎬 Timelapse recorder initialized. Press R to toggle recording.');
}

/**
 * Create the timelapse control UI
 */
function createTimelapseUI() {
  const ui = document.createElement('div');
  ui.id = 'timelapse-ui';
  ui.innerHTML = `
    <style>
      #timelapse-ui {
        position: fixed;
        top: 60px;
        right: 10px;
        background: rgba(0,0,0,0.8);
        border-radius: 8px;
        padding: 12px;
        color: white;
        font-family: Arial, sans-serif;
        font-size: 12px;
        z-index: 10000;
        min-width: 180px;
      }
      #timelapse-ui.recording {
        border: 2px solid #ff4444;
        box-shadow: 0 0 10px rgba(255,68,68,0.5);
      }
      #timelapse-ui h4 {
        margin: 0 0 8px 0;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      #timelapse-ui .rec-dot {
        width: 10px;
        height: 10px;
        background: #ff4444;
        border-radius: 50%;
        display: none;
        animation: pulse 1s infinite;
      }
      #timelapse-ui.recording .rec-dot {
        display: inline-block;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      #timelapse-ui .stats {
        margin: 8px 0;
        padding: 6px;
        background: rgba(255,255,255,0.1);
        border-radius: 4px;
      }
      #timelapse-ui .stats div {
        margin: 2px 0;
      }
      #timelapse-ui button {
        width: 100%;
        padding: 8px;
        margin: 4px 0;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        transition: all 0.2s;
      }
      #timelapse-ui button:hover {
        transform: scale(1.02);
      }
      #timelapse-ui .btn-record {
        background: #ff4444;
        color: white;
      }
      #timelapse-ui .btn-record.stop {
        background: #44ff44;
        color: black;
      }
      #timelapse-ui .btn-download {
        background: #4488ff;
        color: white;
      }
      #timelapse-ui .btn-video {
        background: #9944ff;
        color: white;
      }
      #timelapse-ui .btn-clear {
        background: #666;
        color: white;
      }
      #timelapse-ui button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }
      #timelapse-ui .settings {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(255,255,255,0.2);
      }
      #timelapse-ui .settings label {
        display: flex;
        justify-content: space-between;
        margin: 4px 0;
        align-items: center;
      }
      #timelapse-ui .settings input {
        width: 60px;
        padding: 2px 4px;
        border-radius: 3px;
        border: none;
      }
      #timelapse-ui .toggle-btn {
        position: absolute;
        top: 5px;
        right: 5px;
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        width: auto;
        padding: 2px 6px;
      }
      #timelapse-ui.collapsed .content {
        display: none;
      }
    </style>
    <button class="toggle-btn" onclick="document.getElementById('timelapse-ui').classList.toggle('collapsed')">−</button>
    <h4><span class="rec-dot"></span> 🎬 Timelapse</h4>
    <div class="content">
      <div class="stats">
        <div>Frames: <span id="tl-frames">0</span> / ${settings.maxFrames}</div>
        <div>Duration: <span id="tl-duration">0:00</span></div>
        <div>Size: <span id="tl-size">0 MB</span></div>
      </div>
      <button class="btn-record" id="tl-record" onclick="window.timelapseToggle()">
        ⏺ Start Recording (R)
      </button>
      <button class="btn-video" id="tl-video" onclick="window.timelapseExportVideo()" disabled>
        🎥 Export Video
      </button>
      <button class="btn-download" id="tl-download" onclick="window.timelapseDownloadFrames()" disabled>
        📦 Download Frames
      </button>
      <button class="btn-clear" id="tl-clear" onclick="window.timelapseClear()" disabled>
        🗑 Clear
      </button>
      <div class="settings">
        <label>
          Interval (ms):
          <input type="number" id="tl-interval" value="${settings.captureInterval}" min="100" max="5000" step="100">
        </label>
        <label>
          <input type="checkbox" id="tl-hideui" ${settings.hideUI ? 'checked' : ''}> Hide UI
        </label>
      </div>
    </div>
  `;
  document.body.appendChild(ui);

  // Bind settings changes
  document.getElementById('tl-interval').addEventListener('change', (e) => {
    settings.captureInterval = parseInt(e.target.value) || 500;
  });
  document.getElementById('tl-hideui').addEventListener('change', (e) => {
    settings.hideUI = e.target.checked;
  });

  // Expose functions globally
  window.timelapseToggle = toggleRecording;
  window.timelapseExportVideo = exportVideo;
  window.timelapseDownloadFrames = downloadFrames;
  window.timelapseClear = clearFrames;
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    if (e.key === 'r' || e.key === 'R') {
      toggleRecording();
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
  
  const ui = document.getElementById('timelapse-ui');
  const btn = document.getElementById('tl-record');
  ui.classList.add('recording');
  btn.classList.add('stop');
  btn.innerHTML = '⏹ Stop Recording (R)';
  
  console.log('🎬 Recording started...');
  
  // Capture first frame immediately
  captureFrame();
  
  // Start interval
  recordingInterval = setInterval(() => {
    if (frames.length >= settings.maxFrames) {
      console.log('🎬 Max frames reached, stopping...');
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
  
  const ui = document.getElementById('timelapse-ui');
  const btn = document.getElementById('tl-record');
  ui.classList.remove('recording');
  btn.classList.remove('stop');
  btn.innerHTML = '⏺ Start Recording (R)';
  
  // Enable export buttons
  document.getElementById('tl-video').disabled = frames.length === 0;
  document.getElementById('tl-download').disabled = frames.length === 0;
  document.getElementById('tl-clear').disabled = frames.length === 0;
  
  console.log(`🎬 Recording stopped. ${frames.length} frames captured.`);
}

/**
 * Capture a single frame
 */
function captureFrame() {
  if (!state.app || !state.app.renderer) return;
  
  try {
    // Hide UI elements if setting enabled
    const uiElements = settings.hideUI ? hideUIElements() : null;
    
    // Render current state
    state.app.renderer.render(state.app.stage);
    
    // Extract canvas as data URL
    const canvas = state.app.renderer.view;
    const dataUrl = canvas.toDataURL('image/jpeg', settings.quality);
    
    frames.push({
      data: dataUrl,
      timestamp: Date.now() - startTime,
    });
    
    frameCount++;
    
    // Restore UI elements
    if (uiElements) restoreUIElements(uiElements);
    
    // Update stats
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
    document.getElementById('timelapse-ui'),
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
  document.getElementById('tl-frames').textContent = frames.length;
  
  // Calculate duration
  const durationSec = Math.floor((Date.now() - startTime) / 1000);
  const min = Math.floor(durationSec / 60);
  const sec = durationSec % 60;
  document.getElementById('tl-duration').textContent = `${min}:${sec.toString().padStart(2, '0')}`;
  
  // Estimate size (rough)
  const avgFrameSize = frames.length > 0 
    ? frames.reduce((acc, f) => acc + f.data.length, 0) / frames.length 
    : 0;
  const totalMB = (avgFrameSize * frames.length / 1024 / 1024).toFixed(1);
  document.getElementById('tl-size').textContent = `~${totalMB} MB`;
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
  btn.innerHTML = '⏳ Encoding...';
  
  try {
    // Create offscreen canvas
    const firstImg = await loadImage(frames[0].data);
    const canvas = document.createElement('canvas');
    canvas.width = firstImg.width;
    canvas.height = firstImg.height;
    const ctx = canvas.getContext('2d');
    
    // Create video stream
    const stream = canvas.captureStream(settings.videoFps);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 8000000, // 8 Mbps for good quality
    });
    
    const chunks = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    
    return new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        downloadBlob(blob, `agentcity-timelapse-${Date.now()}.webm`);
        btn.disabled = false;
        btn.innerHTML = '🎥 Export Video';
        resolve();
      };
      
      mediaRecorder.start();
      
      // Draw frames at video FPS rate
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
        
        // Update progress
        const progress = Math.floor((frameIndex / frames.length) * 100);
        btn.innerHTML = `⏳ ${progress}%`;
        
        setTimeout(drawNextFrame, frameDelay);
      };
      
      drawNextFrame();
    });
    
  } catch (err) {
    console.error('Video export failed:', err);
    alert('Video export failed: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = '🎥 Export Video';
  }
}

/**
 * Download frames as individual images (ZIP would require a library)
 */
export function downloadFrames() {
  if (frames.length === 0) {
    alert('No frames to download!');
    return;
  }
  
  // For simplicity, download as a single HTML file with embedded images
  // User can use ffmpeg locally: ffmpeg -framerate 30 -i frame_%04d.jpg -c:v libx264 output.mp4
  
  const btn = document.getElementById('tl-download');
  btn.disabled = true;
  btn.innerHTML = '⏳ Preparing...';
  
  // Create download links for each frame
  frames.forEach((frame, i) => {
    setTimeout(() => {
      const link = document.createElement('a');
      link.href = frame.data;
      link.download = `frame_${i.toString().padStart(4, '0')}.jpg`;
      link.click();
      
      if (i === frames.length - 1) {
        btn.disabled = false;
        btn.innerHTML = '📦 Download Frames';
      }
    }, i * 100); // Stagger downloads
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
  
  document.getElementById('tl-frames').textContent = '0';
  document.getElementById('tl-duration').textContent = '0:00';
  document.getElementById('tl-size').textContent = '0 MB';
  
  document.getElementById('tl-video').disabled = true;
  document.getElementById('tl-download').disabled = true;
  document.getElementById('tl-clear').disabled = true;
  
  console.log('🎬 Frames cleared.');
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
