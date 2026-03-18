// ============================================
// MOLTCITY - Sprite Editor
// ============================================

import * as state from '../state.js';
import { resolveSpriteData } from '../sprites.js';
import { render } from '../game.js';
import { updateSpriteConfig } from '../api.js';
import { cartToIso } from '../utils.js';

let originalValues = null;
let currentResolved = null;
let currentSprites = []; // PIXI display objects for the clicked item
let rafPending = false;

// Window editor state
let winImage = null;        // HTMLImageElement for the sprite preview
let winDragIdx = -1;        // index of window being dragged (-1 = none)
let winImageLayout = null;  // { offsetX, offsetY, imgW, imgH } cached layout

function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render();
  });
}

/**
 * Find rendered PIXI sprites in sceneLayer near a given iso position.
 */
function findSpritesAtTile(tileX, tileY) {
  const iso = cartToIso(tileX + 0.5, tileY + 0.5);
  const threshold = 4;
  const results = [];
  for (const child of state.sceneLayer.children) {
    if (Math.abs(child.x - iso.x) < threshold && Math.abs(child.y - (iso.y + 16)) < 40) {
      results.push(child);
    }
  }
  return results;
}

// ============================================
// Window Preview Canvas
// ============================================

const MARKER_RADIUS = 5;
const CANVAS_W = 240;
const CANVAS_H = 200;

function getCanvasLayout(img) {
  const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height);
  const imgW = img.width * scale;
  const imgH = img.height * scale;
  return {
    offsetX: (CANVAS_W - imgW) / 2,
    offsetY: (CANVAS_H - imgH) / 2,
    imgW,
    imgH,
  };
}

/** Convert canvas pixel coords → normalised (0-1) sprite coords */
function canvasToNorm(cx, cy) {
  if (!winImageLayout) return null;
  const { offsetX, offsetY, imgW, imgH } = winImageLayout;
  const nx = (cx - offsetX) / imgW;
  const ny = (cy - offsetY) / imgH;
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
  return { x: Math.round(nx * 100) / 100, y: Math.round(ny * 100) / 100 };
}

/** Convert normalised sprite coords → canvas pixel coords */
function normToCanvas(nx, ny) {
  if (!winImageLayout) return { cx: 0, cy: 0 };
  const { offsetX, offsetY, imgW, imgH } = winImageLayout;
  return { cx: offsetX + nx * imgW, cy: offsetY + ny * imgH };
}

/** Find the window marker index nearest to (cx, cy), or -1 */
function hitTestMarker(cx, cy, windows) {
  const threshold = MARKER_RADIUS + 3;
  for (let i = 0; i < windows.length; i++) {
    const p = normToCanvas(windows[i].x, windows[i].y);
    const dx = cx - p.cx;
    const dy = cy - p.cy;
    if (dx * dx + dy * dy < threshold * threshold) return i;
  }
  return -1;
}

/** Draw the sprite image + window markers on the canvas */
function drawWindowPreview() {
  const canvas = document.getElementById('se-win-canvas');
  if (!canvas || !winImage || !currentResolved) return;
  const ctx = canvas.getContext('2d');
  const spriteData = currentResolved.spriteData;
  const windows = spriteData.windows || [];

  winImageLayout = getCanvasLayout(winImage);
  const { offsetX, offsetY, imgW, imgH } = winImageLayout;

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Checkerboard background (transparency indicator)
  const sz = 8;
  for (let y = 0; y < CANVAS_H; y += sz) {
    for (let x = 0; x < CANVAS_W; x += sz) {
      ctx.fillStyle = ((x / sz + y / sz) & 1) ? '#1a1a2e' : '#16162a';
      ctx.fillRect(x, y, sz, sz);
    }
  }

  // Sprite image
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(winImage, offsetX, offsetY, imgW, imgH);

  // Window markers
  for (let i = 0; i < windows.length; i++) {
    const p = normToCanvas(windows[i].x, windows[i].y);
    const isActive = i === winDragIdx;

    // Outer glow
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, MARKER_RADIUS + 2, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? 'rgba(78, 205, 196, 0.3)' : 'rgba(255, 221, 119, 0.2)';
    ctx.fill();

    // Marker circle
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, MARKER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? '#4ecdc4' : 'rgba(255, 221, 119, 0.85)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Index label
    ctx.fillStyle = '#000';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(i.toString(), p.cx, p.cy);
  }

  // Update count badge
  const countEl = document.getElementById('se-win-count');
  if (countEl) countEl.textContent = `(${windows.length})`;
}

/** Rebuild the window list below the canvas */
function rebuildWindowList() {
  const list = document.getElementById('se-win-list');
  if (!list || !currentResolved) return;
  const spriteData = currentResolved.spriteData;
  const windows = spriteData.windows || [];

  list.innerHTML = '';

  for (let i = 0; i < windows.length; i++) {
    const win = windows[i];
    const row = document.createElement('div');
    row.className = 'se-win-entry';

    row.innerHTML = `
      <span class="se-win-idx">#${i}</span>
      <label>X</label>
      <input type="number" min="0" max="1" step="0.01" value="${win.x}" data-idx="${i}" data-axis="x" />
      <label>Y</label>
      <input type="number" min="0" max="1" step="0.01" value="${win.y}" data-idx="${i}" data-axis="y" />
      <button class="se-win-delete" data-idx="${i}">&times;</button>
    `;
    list.appendChild(row);
  }

  // Attach listeners
  list.querySelectorAll('input[type="number"]').forEach(input => {
    input.addEventListener('input', () => {
      const idx = parseInt(input.dataset.idx);
      const axis = input.dataset.axis;
      const v = parseFloat(input.value);
      if (!isNaN(v) && v >= 0 && v <= 1 && windows[idx]) {
        windows[idx][axis] = Math.round(v * 100) / 100;
        drawWindowPreview();
        scheduleRender();
      }
    });
  });

  list.querySelectorAll('.se-win-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      windows.splice(idx, 1);
      drawWindowPreview();
      rebuildWindowList();
      scheduleRender();
    });
  });
}

/** Set up canvas mouse/touch interaction */
function initWindowCanvas() {
  const canvas = document.getElementById('se-win-canvas');
  if (!canvas) return;

  // Clone to remove old listeners
  const newCanvas = canvas.cloneNode(true);
  canvas.parentNode.replaceChild(newCanvas, canvas);

  function getMousePos(e) {
    const rect = newCanvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  newCanvas.addEventListener('mousedown', (e) => {
    if (!currentResolved) return;
    const spriteData = currentResolved.spriteData;
    if (!spriteData.windows) spriteData.windows = [];
    const pos = getMousePos(e);

    if (e.button === 2) {
      // Right-click: delete nearest marker
      const idx = hitTestMarker(pos.x, pos.y, spriteData.windows);
      if (idx >= 0) {
        spriteData.windows.splice(idx, 1);
        drawWindowPreview();
        rebuildWindowList();
        scheduleRender();
      }
      return;
    }

    // Left-click: drag existing or add new
    const idx = hitTestMarker(pos.x, pos.y, spriteData.windows);
    if (idx >= 0) {
      winDragIdx = idx;
      drawWindowPreview();
    } else {
      const norm = canvasToNorm(pos.x, pos.y);
      if (norm) {
        spriteData.windows.push(norm);
        winDragIdx = spriteData.windows.length - 1;
        drawWindowPreview();
        rebuildWindowList();
        scheduleRender();
      }
    }
  });

  newCanvas.addEventListener('mousemove', (e) => {
    if (winDragIdx < 0 || !currentResolved) return;
    const spriteData = currentResolved.spriteData;
    const windows = spriteData.windows || [];
    if (!windows[winDragIdx]) return;

    const pos = getMousePos(e);
    const norm = canvasToNorm(pos.x, pos.y);
    if (norm) {
      windows[winDragIdx].x = norm.x;
      windows[winDragIdx].y = norm.y;
      drawWindowPreview();
      // Update the corresponding list inputs
      const list = document.getElementById('se-win-list');
      if (list) {
        const xInput = list.querySelector(`input[data-idx="${winDragIdx}"][data-axis="x"]`);
        const yInput = list.querySelector(`input[data-idx="${winDragIdx}"][data-axis="y"]`);
        if (xInput) xInput.value = norm.x;
        if (yInput) yInput.value = norm.y;
      }
    }
  });

  newCanvas.addEventListener('mouseup', () => {
    if (winDragIdx >= 0) {
      winDragIdx = -1;
      drawWindowPreview();
      scheduleRender();
    }
  });

  newCanvas.addEventListener('mouseleave', () => {
    if (winDragIdx >= 0) {
      winDragIdx = -1;
      drawWindowPreview();
      scheduleRender();
    }
  });

  // Prevent context menu on canvas
  newCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Load sprite image and set up the window editor */
function setupWindowEditor(spriteData) {
  const canvas = document.getElementById('se-win-canvas');
  if (!canvas) return;

  winImage = null;
  winImageLayout = null;
  winDragIdx = -1;

  initWindowCanvas();

  // Load the sprite image
  const file = spriteData.file || spriteData.basePath;
  if (!file) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#888';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No sprite image', CANVAS_W / 2, CANVAS_H / 2);
    return;
  }

  const img = new Image();
  img.onload = () => {
    winImage = img;
    drawWindowPreview();
    rebuildWindowList();
  };
  img.onerror = () => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#ff6b6b';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Failed to load image', CANVAS_W / 2, CANVAS_H / 2);
    rebuildWindowList();
  };
  img.src = `/sprites/${file}`;
}

// ============================================
// Main Editor
// ============================================

/**
 * Populate the sprite editor panel with given resolved data.
 */
function populateEditor(resolved) {
  const panel = document.getElementById('admin-panel');
  const content = document.getElementById('se-content');
  const noSprite = document.getElementById('se-no-sprite');
  if (!panel) return;

  if (!resolved) {
    content.style.display = 'none';
    noSprite.style.display = 'block';
    noSprite.textContent = 'No sprite data for this element';
    panel.style.display = 'block';
    const spritesTab = document.querySelector('#admin-panel .admin-tab[data-tab="admin-tab-sprites"]');
    if (spritesTab) spritesTab.click();
    currentResolved = null;
    return;
  }

  content.style.display = 'block';
  noSprite.style.display = 'none';
  currentResolved = resolved;

  const { spriteData, source, category, index } = resolved;

  // Store sprite references for z-index editing
  currentSprites = resolved._sprites || [];

  // Save original values for reset
  originalValues = {
    width: spriteData.width,
    height: spriteData.height,
    anchorX: spriteData.anchor ? spriteData.anchor.x : 0.5,
    anchorY: spriteData.anchor ? spriteData.anchor.y : 1,
    zIndex: currentSprites.length > 0 ? currentSprites[0].zIndex : 0,
    windows: spriteData.windows ? JSON.parse(JSON.stringify(spriteData.windows)) : null,
  };

  // Populate read-only fields
  document.getElementById('se-id').textContent = spriteData.id || category || '-';
  document.getElementById('se-file').textContent = spriteData.file || spriteData.basePath || '-';
  document.getElementById('se-source').textContent =
    `${source}${category ? '.' + category : ''}${index !== null ? '[' + index + ']' : ''}`;
  document.getElementById('se-tiles').textContent = spriteData.tiles || 1;
  document.getElementById('se-position').textContent =
    resolved._tileX != null ? `(${resolved._tileX}, ${resolved._tileY})` : '-';

  // Populate editable fields
  const widthInput = document.getElementById('se-width');
  const heightInput = document.getElementById('se-height');
  const axRange = document.getElementById('se-anchor-x-range');
  const axNum = document.getElementById('se-anchor-x');
  const ayRange = document.getElementById('se-anchor-y-range');
  const ayNum = document.getElementById('se-anchor-y');

  // Populate z-index
  const zIndexInput = document.getElementById('se-zindex');
  zIndexInput.value = currentSprites.length > 0 ? currentSprites[0].zIndex : 0;

  widthInput.value = spriteData.width;
  heightInput.value = spriteData.height;
  const ax = spriteData.anchor ? spriteData.anchor.x : 0.5;
  const ay = spriteData.anchor ? spriteData.anchor.y : 1;
  axRange.value = ax;
  axNum.value = ax;
  ayRange.value = ay;
  ayNum.value = ay;

  // Clear status
  document.getElementById('se-status').textContent = '';

  // Remove old listeners by cloning
  replaceWithClone('se-zindex');
  replaceWithClone('se-width');
  replaceWithClone('se-height');
  replaceWithClone('se-anchor-x-range');
  replaceWithClone('se-anchor-x');
  replaceWithClone('se-anchor-y-range');
  replaceWithClone('se-anchor-y');
  replaceWithClone('se-save');
  replaceWithClone('se-reset');

  // Re-grab references after cloning
  const zi = document.getElementById('se-zindex');
  const w = document.getElementById('se-width');
  const h = document.getElementById('se-height');
  const axR = document.getElementById('se-anchor-x-range');
  const axN = document.getElementById('se-anchor-x');
  const ayR = document.getElementById('se-anchor-y-range');
  const ayN = document.getElementById('se-anchor-y');
  const saveBtn = document.getElementById('se-save');
  const resetBtn = document.getElementById('se-reset');

  // Ensure anchor object exists
  if (!spriteData.anchor) spriteData.anchor = { x: 0.5, y: 1 };

  // Z-Index handler — update all sprites for this item in real-time
  zi.addEventListener('input', () => {
    const v = parseInt(zi.value, 10);
    if (!isNaN(v)) {
      for (const s of currentSprites) s.zIndex = v;
    }
  });

  // Width/height handlers
  w.addEventListener('input', () => {
    const v = parseInt(w.value, 10);
    if (v > 0) { spriteData.width = v; scheduleRender(); }
  });
  h.addEventListener('input', () => {
    const v = parseInt(h.value, 10);
    if (v > 0) { spriteData.height = v; scheduleRender(); }
  });

  // Anchor X: range ↔ number sync
  axR.addEventListener('input', () => {
    const v = parseFloat(axR.value);
    axN.value = v;
    spriteData.anchor.x = v;
    scheduleRender();
  });
  axN.addEventListener('input', () => {
    const v = parseFloat(axN.value);
    if (v >= 0 && v <= 1) {
      axR.value = v;
      spriteData.anchor.x = v;
      scheduleRender();
    }
  });

  // Anchor Y: range ↔ number sync
  ayR.addEventListener('input', () => {
    const v = parseFloat(ayR.value);
    ayN.value = v;
    spriteData.anchor.y = v;
    scheduleRender();
  });
  ayN.addEventListener('input', () => {
    const v = parseFloat(ayN.value);
    if (v >= 0 && v <= 1) {
      ayR.value = v;
      spriteData.anchor.y = v;
      scheduleRender();
    }
  });

  // Save button — include windows in the save payload
  saveBtn.addEventListener('click', async () => {
    const statusEl = document.getElementById('se-status');
    statusEl.textContent = 'Saving...';
    statusEl.style.color = '#4ecdc4';
    try {
      const updates = {
        width: spriteData.width,
        height: spriteData.height,
        anchor: { x: spriteData.anchor.x, y: spriteData.anchor.y },
      };
      if (spriteData.windows) {
        updates.windows = spriteData.windows.map(w => ({ x: w.x, y: w.y }));
      }
      await updateSpriteConfig({ source, category, index, updates });
      statusEl.textContent = 'Saved!';
      statusEl.style.color = '#2ecc71';
      originalValues = {
        width: spriteData.width,
        height: spriteData.height,
        anchorX: spriteData.anchor.x,
        anchorY: spriteData.anchor.y,
        windows: spriteData.windows ? JSON.parse(JSON.stringify(spriteData.windows)) : null,
      };
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.style.color = '#ff6b6b';
    }
  });

  // Reset button — restore windows too
  resetBtn.addEventListener('click', () => {
    if (!originalValues) return;
    spriteData.width = originalValues.width;
    spriteData.height = originalValues.height;
    spriteData.anchor.x = originalValues.anchorX;
    spriteData.anchor.y = originalValues.anchorY;

    if (originalValues.windows) {
      spriteData.windows = JSON.parse(JSON.stringify(originalValues.windows));
    } else {
      delete spriteData.windows;
    }

    w.value = originalValues.width;
    h.value = originalValues.height;
    axR.value = originalValues.anchorX;
    axN.value = originalValues.anchorX;
    ayR.value = originalValues.anchorY;
    ayN.value = originalValues.anchorY;
    zi.value = originalValues.zIndex;
    for (const s of currentSprites) s.zIndex = originalValues.zIndex;

    document.getElementById('se-status').textContent = 'Reset to original values';
    document.getElementById('se-status').style.color = '#888';
    drawWindowPreview();
    rebuildWindowList();
    scheduleRender();
  });

  // Set up the window editor canvas
  setupWindowEditor(spriteData);

  // Open admin panel on Sprites tab
  panel.style.display = 'block';
  const spritesTab = document.querySelector('#admin-panel .admin-tab[data-tab="admin-tab-sprites"]');
  if (spritesTab) spritesTab.click();
}

/**
 * Show the sprite editor for a building.
 */
export function showSpriteEditor(building, parcelX, parcelY) {
  const resolved = resolveSpriteData(building, parcelX, parcelY);
  if (resolved) {
    resolved._sprites = findSpritesAtTile(parcelX, parcelY);
    resolved._tileX = parcelX;
    resolved._tileY = parcelY;
  }
  populateEditor(resolved);
}

/**
 * Show the sprite editor for a road tile.
 */
export function showRoadSpriteEditor(x, y) {
  // Inline road type resolution (avoid async import issues)
  if (state.roadSprites.size === 0) { populateEditor(null); return; }

  // Determine connections by checking roadPositionSet
  const hasRoad = (rx, ry) => state.roadPositionSet.has(`${rx},${ry}`);
  const conn = {
    nw: hasRoad(x - 1, y),
    ne: hasRoad(x, y - 1),
    se: hasRoad(x + 1, y),
    sw: hasRoad(x, y + 1),
  };
  const connCount = [conn.nw, conn.ne, conn.se, conn.sw].filter(Boolean).length;
  let roadType = null;

  if (connCount === 4) roadType = 'road_089';
  else if (connCount === 3) {
    if (!conn.sw) roadType = 'road_103';
    else if (!conn.nw) roadType = 'road_095';
    else if (!conn.ne) roadType = 'road_096';
    else if (!conn.se) roadType = 'road_088';
  } else if (connCount === 2) {
    if (conn.ne && conn.sw) roadType = 'road_081';
    else if (conn.nw && conn.se) roadType = 'road_073';
    else if (conn.nw && conn.ne) roadType = 'road_126';
    else if (conn.ne && conn.se) roadType = 'road_124';
    else if (conn.se && conn.sw) roadType = 'road_122';
    else if (conn.sw && conn.nw) roadType = 'road_125';
  } else if (connCount === 1) {
    if (conn.sw) roadType = 'road_110';
    else if (conn.ne) roadType = 'road_116';
    else if (conn.nw) roadType = 'road_111';
    else if (conn.se) roadType = 'road_104';
  } else roadType = 'road_080';

  if (!roadType || !state.roadSprites.has(roadType)) { populateEditor(null); return; }

  const { config } = state.roadSprites.get(roadType);
  populateEditor({ spriteData: config, source: 'roads', category: roadType, index: null, _sprites: findSpritesAtTile(x, y), _tileX: x, _tileY: y });
}

/**
 * Show the sprite editor for a vehicle.
 */
export function showVehicleSpriteEditor(vehicle) {
  const config = vehicle.vehicleData.config;
  populateEditor({
    spriteData: config,
    source: 'vehicles',
    category: vehicle.vehicleType,
    index: null,
    _sprites: vehicle.sprite ? [vehicle.sprite] : [],
  });
}

/**
 * Close the sprite editor (admin panel).
 */
export function closeSpriteEditor() {
  const panel = document.getElementById('admin-panel');
  if (panel) panel.style.display = 'none';
  currentResolved = null;
  originalValues = null;
}

/**
 * Replace an element with its clone to remove all event listeners.
 */
function replaceWithClone(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
}
