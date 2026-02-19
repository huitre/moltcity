// replay.js - Database replay for timelapse creation
// Replays city construction from scratch for cinematic timelapses

import * as state from './state.js';
import { render } from './game.js';
import { cartToIso } from './utils.js';

// Replay data (exported from database)
const REPLAY_DATA = {
  roads: [
    {"x":25,"y":22,"direction":"horizontal","lanes":2},
    {"x":25,"y":23,"direction":"horizontal","lanes":2},
    {"x":25,"y":24,"direction":"horizontal","lanes":2},
    {"x":25,"y":25,"direction":"horizontal","lanes":2},
    {"x":25,"y":26,"direction":"horizontal","lanes":2},
    {"x":25,"y":27,"direction":"horizontal","lanes":2},
    {"x":25,"y":28,"direction":"horizontal","lanes":2},
    {"x":25,"y":29,"direction":"horizontal","lanes":2},
    {"x":25,"y":30,"direction":"horizontal","lanes":2},
    {"x":24,"y":25,"direction":"horizontal","lanes":2},
    {"x":23,"y":25,"direction":"horizontal","lanes":2},
    {"x":22,"y":25,"direction":"horizontal","lanes":2},
    {"x":21,"y":25,"direction":"horizontal","lanes":2},
    {"x":20,"y":25,"direction":"horizontal","lanes":2},
    {"x":19,"y":25,"direction":"horizontal","lanes":2},
    {"x":26,"y":25,"direction":"horizontal","lanes":2},
    {"x":27,"y":25,"direction":"horizontal","lanes":2},
    {"x":28,"y":25,"direction":"horizontal","lanes":2},
    {"x":29,"y":25,"direction":"horizontal","lanes":2},
    {"x":30,"y":25,"direction":"horizontal","lanes":2},
    {"x":20,"y":27,"direction":"horizontal","lanes":2},
    {"x":21,"y":27,"direction":"horizontal","lanes":2},
    {"x":22,"y":27,"direction":"horizontal","lanes":2},
    {"x":23,"y":27,"direction":"horizontal","lanes":2},
    {"x":24,"y":27,"direction":"horizontal","lanes":2},
    {"x":26,"y":27,"direction":"horizontal","lanes":2},
    {"x":27,"y":27,"direction":"horizontal","lanes":2},
    {"x":28,"y":27,"direction":"horizontal","lanes":2},
    {"x":29,"y":27,"direction":"horizontal","lanes":2},
    {"x":30,"y":27,"direction":"horizontal","lanes":2},
    {"x":20,"y":23,"direction":"horizontal","lanes":2},
    {"x":21,"y":23,"direction":"horizontal","lanes":2},
    {"x":22,"y":23,"direction":"horizontal","lanes":2},
    {"x":23,"y":23,"direction":"horizontal","lanes":2},
    {"x":24,"y":23,"direction":"horizontal","lanes":2},
    {"x":26,"y":23,"direction":"horizontal","lanes":2},
    {"x":27,"y":23,"direction":"horizontal","lanes":2},
    {"x":28,"y":23,"direction":"horizontal","lanes":2},
    {"x":29,"y":23,"direction":"horizontal","lanes":2},
    {"x":30,"y":23,"direction":"horizontal","lanes":2},
    {"x":20,"y":29,"direction":"horizontal","lanes":2},
    {"x":22,"y":29,"direction":"horizontal","lanes":2},
    {"x":23,"y":29,"direction":"horizontal","lanes":2},
    {"x":24,"y":29,"direction":"horizontal","lanes":2},
    {"x":26,"y":29,"direction":"horizontal","lanes":2},
    {"x":27,"y":29,"direction":"horizontal","lanes":2},
    {"x":28,"y":29,"direction":"horizontal","lanes":2},
    {"x":29,"y":29,"direction":"horizontal","lanes":2},
    {"x":30,"y":29,"direction":"horizontal","lanes":2},
    {"x":18,"y":25,"direction":"horizontal","lanes":2}
  ],
  // Buildings deduplicated (only first occurrence at each coordinate)
  buildings: [
    {"type":"power_plant","name":"Power Plant","width":2,"height":2,"floors":1,"density":1,"x":25,"y":20},
    {"type":"water_tower","name":"Water Tower","width":2,"height":2,"floors":1,"density":1,"x":27,"y":20},
    {"type":"residential","name":"Residence","width":1,"height":1,"floors":1,"density":1,"x":23,"y":24},
    {"type":"offices","name":"Office","width":1,"height":1,"floors":1,"density":1,"x":28,"y":24},
    {"type":"residential","name":"Residence","width":1,"height":1,"floors":1,"density":1,"x":22,"y":24},
    {"type":"offices","name":"Office","width":1,"height":1,"floors":1,"density":1,"x":26,"y":24},
    {"type":"offices","name":"Office","width":1,"height":1,"floors":1,"density":1,"x":29,"y":24},
    {"type":"residential","name":"Residence","width":1,"height":1,"floors":1,"density":1,"x":23,"y":26},
    {"type":"residential","name":"Residence","width":1,"height":1,"floors":1,"density":1,"x":24,"y":24},
    {"type":"residential","name":"Residence","width":1,"height":1,"floors":1,"density":1,"x":21,"y":24},
    {"type":"residential","name":"Residence","width":1,"height":1,"floors":1,"density":1,"x":24,"y":26},
    {"type":"residential","name":"Residence","width":1,"height":1,"floors":1,"density":1,"x":22,"y":26},
    {"type":"offices","name":"Office","width":1,"height":1,"floors":1,"density":1,"x":27,"y":24},
    {"type":"offices","name":"Office","width":1,"height":1,"floors":1,"density":1,"x":30,"y":24},
    {"type":"offices","name":"Office","width":1,"height":1,"floors":1,"density":1,"x":26,"y":26},
    {"type":"offices","name":"Office","width":1,"height":1,"floors":1,"density":1,"x":28,"y":26},
    {"type":"residential","name":"Residence","width":1,"height":1,"floors":1,"density":1,"x":20,"y":24},
    {"type":"residential","name":"Residence","width":1,"height":1,"floors":1,"density":1,"x":20,"y":26},
    {"type":"offices","name":"Office","width":1,"height":1,"floors":1,"density":1,"x":27,"y":26},
    {"type":"residential","name":"Residence","width":1,"height":1,"floors":1,"density":1,"x":21,"y":26},
    {"type":"industrial","name":"Industrial Zone","width":1,"height":1,"floors":1,"density":1,"x":21,"y":28},
    {"type":"industrial","name":"Industrial Zone","width":1,"height":1,"floors":1,"density":1,"x":21,"y":29},
    {"type":"police_station","name":"Police HQ","width":1,"height":1,"floors":1,"density":1,"x":29,"y":26},
    {"type":"school","name":"School","width":1,"height":1,"floors":1,"density":1,"x":30,"y":28},
    {"type":"residential","name":"Residence","width":1,"height":1,"floors":1,"density":1,"x":19,"y":24},
    {"type":"residential","name":"Residence","width":1,"height":1,"floors":1,"density":1,"x":19,"y":26}
  ]
};

let replayState = {
  active: false,
  paused: false,
  phase: 'roads', // 'roads' | 'buildings'
  roadIndex: 0,
  buildingIndex: 0,
  frames: [],
  interval: null,
  speed: 150, // ms between each placement
  captureFrames: true,
  // Backup of original state
  originalBuildings: [],
  originalRoads: [],
  originalParcels: []
};

// Generate parcel ID for a coordinate
function getOrCreateParcel(x, y) {
  const existing = state.parcels.find(p => p.x === x && p.y === y);
  if (existing) return existing.id;
  
  const id = `replay_parcel_${x}_${y}`;
  state.parcels.push({
    id,
    x,
    y,
    terrain: 'land',
    zoning: null
  });
  return id;
}

// Place a road into state
function placeRoad(roadData) {
  const parcelId = getOrCreateParcel(roadData.x, roadData.y);
  
  // Check if road already exists at this location
  const existing = state.roads.find(r => {
    const p = state.parcels.find(p => p.id === r.parcelId);
    return p && p.x === roadData.x && p.y === roadData.y;
  });
  if (existing) return;
  
  state.roads.push({
    id: `replay_road_${roadData.x}_${roadData.y}`,
    parcelId,
    direction: roadData.direction,
    lanes: roadData.lanes
  });
}

// Place a building into state
function placeBuilding(buildingData) {
  const parcelId = getOrCreateParcel(buildingData.x, buildingData.y);
  
  // Check if building already exists at this location
  const existing = state.buildings.find(b => {
    const p = state.parcels.find(p => p.id === b.parcelId);
    return p && p.x === buildingData.x && p.y === buildingData.y;
  });
  if (existing) return;
  
  state.buildings.push({
    id: `replay_building_${buildingData.x}_${buildingData.y}`,
    parcelId,
    type: buildingData.type,
    name: buildingData.name,
    width: buildingData.width,
    height: buildingData.height,
    floors: buildingData.floors,
    density: buildingData.density,
    powered: true,
    hasWater: true,
    operational: true,
    constructionProgress: 100
  });
}

// Capture current frame from canvas
function captureFrame() {
  const { app } = state;
  if (!app || !app.renderer) return null;
  
  try {
    // Use Pixi's built-in extraction
    const canvas = app.renderer.extract.canvas(app.stage);
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[Replay] Frame capture failed:', err);
    return null;
  }
}

// Single step of replay
function replayStep() {
  if (replayState.paused) return;
  
  if (replayState.phase === 'roads') {
    if (replayState.roadIndex < REPLAY_DATA.roads.length) {
      // Place 2-3 roads per step for faster road laying
      for (let i = 0; i < 3 && replayState.roadIndex < REPLAY_DATA.roads.length; i++) {
        placeRoad(REPLAY_DATA.roads[replayState.roadIndex]);
        replayState.roadIndex++;
      }
      
      // Re-render
      render();
      
      if (replayState.captureFrames) {
        requestAnimationFrame(() => {
          const frame = captureFrame();
          if (frame) replayState.frames.push(frame);
        });
      }
      
      updateReplayUI();
    } else {
      // Switch to buildings phase
      replayState.phase = 'buildings';
      console.log('[Replay] Roads complete, starting buildings');
    }
  } else if (replayState.phase === 'buildings') {
    if (replayState.buildingIndex < REPLAY_DATA.buildings.length) {
      placeBuilding(REPLAY_DATA.buildings[replayState.buildingIndex]);
      replayState.buildingIndex++;
      
      // Re-render
      render();
      
      if (replayState.captureFrames) {
        requestAnimationFrame(() => {
          const frame = captureFrame();
          if (frame) replayState.frames.push(frame);
        });
      }
      
      updateReplayUI();
    } else {
      // Replay complete
      stopReplay();
      console.log('[Replay] Complete!', replayState.frames.length, 'frames captured');
      showExportOptions();
    }
  }
}

// Start replay
function startReplay(options = {}) {
  if (replayState.active) {
    console.log('[Replay] Already running');
    return;
  }
  
  replayState.speed = options.speed || 150;
  replayState.captureFrames = options.captureFrames !== false;
  
  // Backup original state
  replayState.originalBuildings = [...state.buildings];
  replayState.originalRoads = [...state.roads];
  replayState.originalParcels = [...state.parcels];
  
  // Reset state
  replayState.active = true;
  replayState.paused = false;
  replayState.phase = 'roads';
  replayState.roadIndex = 0;
  replayState.buildingIndex = 0;
  replayState.frames = [];
  
  // Hide UI elements for clean capture
  hideUIForCapture();
  
  // Clear city data (keep parcels for base terrain)
  state.setBuildings([]);
  state.setRoads([]);
  
  // Initial render (empty city)
  render();
  
  // Center camera on the city area
  centerCamera();
  
  // Show replay UI
  showReplayUI();
  
  // Start the replay interval
  replayState.interval = setInterval(replayStep, replayState.speed);
  
  console.log('[Replay] Started with speed:', replayState.speed, 'ms');
}

// Stop replay
function stopReplay() {
  if (replayState.interval) {
    clearInterval(replayState.interval);
    replayState.interval = null;
  }
  replayState.active = false;
  replayState.paused = false;
  
  // Restore UI
  showUIAfterCapture();
  
  console.log('[Replay] Stopped');
}

// Restore original state (optional, if user wants to go back)
function restoreOriginalState() {
  state.setBuildings(replayState.originalBuildings);
  state.setRoads(replayState.originalRoads);
  state.setParcels(replayState.originalParcels);
  render();
  console.log('[Replay] Original state restored');
}

// Pause/resume replay
function togglePause() {
  replayState.paused = !replayState.paused;
  updateReplayUI();
  console.log('[Replay]', replayState.paused ? 'Paused' : 'Resumed');
}

// Center camera on the replay area
function centerCamera() {
  const { app, worldContainer } = state;
  if (!app || !worldContainer) return;
  
  // Center of the city data (around x:25, y:25)
  const centerX = 25;
  const centerY = 25;
  
  const screenPos = cartToIso(centerX, centerY);
  
  const offsetX = app.screen.width / 2 - screenPos.x;
  const offsetY = app.screen.height / 2 - screenPos.y;
  
  worldContainer.x = offsetX;
  worldContainer.y = offsetY;
}

// Hide UI elements for clean capture
function hideUIForCapture() {
  const elements = [
    '.sidebar',
    '.top-bar', 
    '.stats-bar',
    '#timelapse-ui',
    '.building-panel',
    '.modal',
    '.activity-feed'
  ];
  
  elements.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      el.dataset.replayHidden = el.style.display;
      el.style.display = 'none';
    });
  });
}

// Restore UI after capture
function showUIAfterCapture() {
  const elements = [
    '.sidebar',
    '.top-bar',
    '.stats-bar',
    '.activity-feed'
  ];
  
  elements.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      el.style.display = el.dataset.replayHidden || '';
      delete el.dataset.replayHidden;
    });
  });
}

// Create replay UI
function showReplayUI() {
  let ui = document.getElementById('replay-ui');
  if (!ui) {
    ui = document.createElement('div');
    ui.id = 'replay-ui';
    document.body.appendChild(ui);
  }
  
  ui.innerHTML = `
    <div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.85);color:#fff;padding:15px 25px;border-radius:12px;
      font-family:system-ui;z-index:10000;text-align:center;min-width:300px;
      box-shadow:0 4px 20px rgba(0,0,0,0.3);">
      <div style="font-size:18px;font-weight:bold;margin-bottom:10px;">🎬 City Replay</div>
      <div id="replay-status" style="margin-bottom:10px;font-size:14px;">Initializing...</div>
      <div style="background:#333;border-radius:6px;height:8px;margin-bottom:15px;overflow:hidden;">
        <div id="replay-progress" style="background:linear-gradient(90deg,#4CAF50,#8BC34A);height:100%;width:0%;transition:width 0.2s;"></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button id="replay-pause" style="background:#2196F3;border:none;color:#fff;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:14px;">⏸️ Pause</button>
        <button id="replay-stop" style="background:#f44336;border:none;color:#fff;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:14px;">⏹️ Stop</button>
      </div>
    </div>
  `;
  
  document.getElementById('replay-pause').onclick = togglePause;
  document.getElementById('replay-stop').onclick = () => {
    stopReplay();
    hideReplayUI();
    restoreOriginalState();
  };
  
  ui.style.display = 'block';
}

function hideReplayUI() {
  const ui = document.getElementById('replay-ui');
  if (ui) ui.style.display = 'none';
}

function updateReplayUI() {
  const status = document.getElementById('replay-status');
  const progress = document.getElementById('replay-progress');
  const pauseBtn = document.getElementById('replay-pause');
  
  if (!status) return;
  
  const totalRoads = REPLAY_DATA.roads.length;
  const totalBuildings = REPLAY_DATA.buildings.length;
  const totalSteps = Math.ceil(totalRoads / 3) + totalBuildings;
  const currentStep = Math.ceil(replayState.roadIndex / 3) + replayState.buildingIndex;
  const percent = (currentStep / totalSteps) * 100;
  
  if (replayState.phase === 'roads') {
    status.textContent = `🛣️ Building roads... ${replayState.roadIndex}/${totalRoads}`;
  } else {
    status.textContent = `🏗️ Placing buildings... ${replayState.buildingIndex}/${totalBuildings}`;
  }
  
  if (replayState.captureFrames) {
    status.textContent += ` | 📸 ${replayState.frames.length} frames`;
  }
  
  if (progress) progress.style.width = percent + '%';
  if (pauseBtn) pauseBtn.textContent = replayState.paused ? '▶️ Resume' : '⏸️ Pause';
}

// Show export options when replay completes
function showExportOptions() {
  const ui = document.getElementById('replay-ui');
  if (!ui) return;
  
  ui.innerHTML = `
    <div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.9);color:#fff;padding:20px 30px;border-radius:12px;
      font-family:system-ui;z-index:10000;text-align:center;min-width:350px;
      box-shadow:0 4px 20px rgba(0,0,0,0.3);">
      <div style="font-size:20px;font-weight:bold;margin-bottom:15px;">✅ Replay Complete!</div>
      <div style="margin-bottom:15px;font-size:14px;">
        📸 ${replayState.frames.length} frames captured<br>
        🛣️ ${state.roads.length} roads | 🏗️ ${state.buildings.length} buildings
      </div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <button id="export-video" style="background:#4CAF50;border:none;color:#fff;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;">🎥 Export Video</button>
        <button id="export-frames" style="background:#FF9800;border:none;color:#fff;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;">📁 Download Frames</button>
        <button id="restore-city" style="background:#2196F3;border:none;color:#fff;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;">🔄 Restore City</button>
        <button id="close-export" style="background:#666;border:none;color:#fff;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;">✖️ Close</button>
      </div>
    </div>
  `;
  
  document.getElementById('export-video').onclick = exportVideo;
  document.getElementById('export-frames').onclick = downloadFrames;
  document.getElementById('restore-city').onclick = () => {
    restoreOriginalState();
    hideReplayUI();
  };
  document.getElementById('close-export').onclick = hideReplayUI;
}

// Export as WebM video
async function exportVideo() {
  if (replayState.frames.length === 0) {
    alert('No frames to export!');
    return;
  }
  
  const btn = document.getElementById('export-video');
  btn.textContent = '⏳ Encoding...';
  btn.disabled = true;
  
  try {
    // Create canvas for rendering
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = replayState.frames[0];
    });
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    
    // Create media recorder
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 8000000
    });
    
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agentcity-timelapse-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      
      btn.textContent = '🎥 Export Video';
      btn.disabled = false;
    };
    
    recorder.start();
    
    // Render frames at 30fps
    const frameDelay = 1000 / 30;
    for (let i = 0; i < replayState.frames.length; i++) {
      const frameImg = new Image();
      await new Promise((resolve, reject) => {
        frameImg.onload = resolve;
        frameImg.onerror = reject;
        frameImg.src = replayState.frames[i];
      });
      ctx.drawImage(frameImg, 0, 0);
      await new Promise(r => setTimeout(r, frameDelay));
    }
    
    recorder.stop();
  } catch (err) {
    console.error('[Replay] Video export error:', err);
    alert('Video export failed: ' + err.message);
    btn.textContent = '🎥 Export Video';
    btn.disabled = false;
  }
}

// Download frames as individual images
function downloadFrames() {
  if (replayState.frames.length === 0) {
    alert('No frames to download!');
    return;
  }
  
  // Download first, middle, and last frame as samples
  const indices = [0, Math.floor(replayState.frames.length / 2), replayState.frames.length - 1];
  
  indices.forEach((idx, i) => {
    const a = document.createElement('a');
    a.href = replayState.frames[idx];
    a.download = `agentcity-frame-${String(idx).padStart(4, '0')}.png`;
    setTimeout(() => a.click(), i * 500);
  });
  
  alert(`Downloading sample frames (first, middle, last).\n\nFull ${replayState.frames.length} frames available via console:\nwindow.cityReplay.getFrames()`);
}

// Keyboard shortcut: Shift+R to start replay
function initReplayControls() {
  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.key === 'R') {
      e.preventDefault();
      if (replayState.active) {
        stopReplay();
        hideReplayUI();
        restoreOriginalState();
      } else {
        showReplayDialog();
      }
    }
  });
}

// Show dialog to configure replay
function showReplayDialog() {
  const existing = document.getElementById('replay-dialog');
  if (existing) existing.remove();
  
  const dialog = document.createElement('div');
  dialog.id = 'replay-dialog';
  dialog.innerHTML = `
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:#1a1a2e;color:#fff;padding:30px;border-radius:16px;
      font-family:system-ui;z-index:10001;min-width:400px;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);">
      <div style="font-size:24px;font-weight:bold;margin-bottom:20px;text-align:center;">🎬 City Replay</div>
      <div style="margin-bottom:20px;">
        <label style="display:block;margin-bottom:8px;font-size:14px;">Speed (ms per step):</label>
        <input type="range" id="replay-speed" min="50" max="500" value="150" style="width:100%;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#888;">
          <span>Fast (50ms)</span>
          <span id="speed-value">150ms</span>
          <span>Slow (500ms)</span>
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
          <input type="checkbox" id="replay-capture" checked style="width:20px;height:20px;">
          <span>Capture frames for video export</span>
        </label>
      </div>
      <div style="background:#333;padding:15px;border-radius:8px;margin-bottom:20px;font-size:13px;">
        <div>🛣️ ${REPLAY_DATA.roads.length} roads</div>
        <div>🏗️ ${REPLAY_DATA.buildings.length} buildings</div>
        <div style="margin-top:8px;color:#888;">This will temporarily clear the view and rebuild the city from scratch. Original state is preserved.</div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button id="start-replay-btn" style="background:#4CAF50;border:none;color:#fff;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:16px;font-weight:bold;">▶️ Start Replay</button>
        <button id="cancel-replay-btn" style="background:#666;border:none;color:#fff;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:16px;">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);
  
  const speedSlider = document.getElementById('replay-speed');
  const speedValue = document.getElementById('speed-value');
  speedSlider.oninput = () => {
    speedValue.textContent = speedSlider.value + 'ms';
  };
  
  document.getElementById('start-replay-btn').onclick = () => {
    const speed = parseInt(speedSlider.value);
    const capture = document.getElementById('replay-capture').checked;
    dialog.remove();
    startReplay({ speed, captureFrames: capture });
  };
  
  document.getElementById('cancel-replay-btn').onclick = () => dialog.remove();
}

// Initialize
export function initReplay() {
  initReplayControls();
  console.log('[Replay] Module loaded. Press Shift+R to start city replay.');
}

// Export for external access
window.cityReplay = {
  start: startReplay,
  stop: stopReplay,
  pause: togglePause,
  restore: restoreOriginalState,
  getFrames: () => replayState.frames,
  getData: () => REPLAY_DATA,
  isActive: () => replayState.active
};
