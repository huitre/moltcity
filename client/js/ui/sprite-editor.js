// ============================================
// MOLTCITY - Sprite Editor
// ============================================

import * as state from '../state.js';
import { seededRandom } from '../sprites.js';
import { render } from '../game.js';
import { updateSpriteConfig } from '../api.js';

let originalValues = null;
let currentResolved = null;
let rafPending = false;

/**
 * Resolve which sprite data object a building uses.
 * Replicates the selection logic from drawBuilding() in game.js.
 */
function resolveSpriteData(building, x, y) {
  const type = building.type;
  const floors = building.floors || 1;

  // Residential / Offices zone sprites
  if (type === 'residential' || type === 'offices') {
    const spriteMap = type === 'residential' ? state.residentialSprites : state.officeSprites;
    const density = floors <= 1 ? 'low' : floors <= 3 ? 'medium' : 'high';
    const sprites = spriteMap[density];
    if (sprites && sprites.length > 0) {
      const rng = seededRandom(x * 1000 + y);
      const idx = Math.floor(rng() * sprites.length);
      const sd = sprites[idx];
      return { spriteData: sd, source: type, category: density, index: sd._jsonIndex ?? idx };
    }
  }

  // Suburban / Industrial zone sprites (flat arrays)
  if (type === 'suburban' && state.suburbanSprites.length > 0) {
    const sprites = state.suburbanSprites;
    const rng = seededRandom(x * 1000 + y);
    const idx = Math.floor(rng() * sprites.length);
    const sd = sprites[idx];
    return { spriteData: sd, source: 'suburban', category: null, index: sd._jsonIndex ?? idx };
  }
  if (type === 'industrial' && state.industrialSprites.length > 0) {
    const sprites = state.industrialSprites;
    const rng = seededRandom(x * 1000 + y);
    const idx = Math.floor(rng() * sprites.length);
    const sd = sprites[idx];
    return { spriteData: sd, source: 'industrial', category: null, index: sd._jsonIndex ?? idx };
  }

  // Service / Park sprites
  const serviceSpriteMap = {
    park: { sprites: state.parkSprites, source: 'park' },
    police_station: { sprites: state.serviceSprites.police, source: 'police' },
    fire_station: { sprites: state.serviceSprites.firestation, source: 'firestation' },
    hospital: { sprites: state.serviceSprites.hospital, source: 'hospital' },
  };
  if (serviceSpriteMap[type] && serviceSpriteMap[type].sprites.length > 0) {
    const { sprites, source } = serviceSpriteMap[type];
    const rng = seededRandom(x * 1000 + y);
    const idx = Math.floor(rng() * sprites.length);
    const sd = sprites[idx];
    return { spriteData: sd, source, category: null, index: sd._jsonIndex ?? idx };
  }

  // Default sprites (buildings map)
  if (state.defaultSprites.has(type)) {
    const entry = state.defaultSprites.get(type);
    return { spriteData: entry.config, source: 'buildings', category: type, index: null };
  }

  // Procedural fallback — no sprite data
  return null;
}

function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render();
  });
}

/**
 * Show the sprite editor for a building.
 */
export function showSpriteEditor(building, parcelX, parcelY) {
  const panel = document.getElementById('sprite-editor-panel');
  const content = document.getElementById('se-content');
  const noSprite = document.getElementById('se-no-sprite');
  if (!panel) return;

  const resolved = resolveSpriteData(building, parcelX, parcelY);

  if (!resolved) {
    content.style.display = 'none';
    noSprite.style.display = 'block';
    panel.style.display = 'block';
    currentResolved = null;
    return;
  }

  content.style.display = 'block';
  noSprite.style.display = 'none';
  currentResolved = resolved;

  const { spriteData, source, category, index } = resolved;

  // Save original values for reset
  originalValues = {
    width: spriteData.width,
    height: spriteData.height,
    anchorX: spriteData.anchor.x,
    anchorY: spriteData.anchor.y,
  };

  // Populate read-only fields
  document.getElementById('se-id').textContent = spriteData.id || category || '-';
  document.getElementById('se-file').textContent = spriteData.file || '-';
  document.getElementById('se-source').textContent =
    `${source}${category ? '.' + category : ''}${index !== null ? '[' + index + ']' : ''}`;
  document.getElementById('se-tiles').textContent = spriteData.tiles || 1;

  // Populate editable fields
  const widthInput = document.getElementById('se-width');
  const heightInput = document.getElementById('se-height');
  const axRange = document.getElementById('se-anchor-x-range');
  const axNum = document.getElementById('se-anchor-x');
  const ayRange = document.getElementById('se-anchor-y-range');
  const ayNum = document.getElementById('se-anchor-y');

  widthInput.value = spriteData.width;
  heightInput.value = spriteData.height;
  axRange.value = spriteData.anchor.x;
  axNum.value = spriteData.anchor.x;
  ayRange.value = spriteData.anchor.y;
  ayNum.value = spriteData.anchor.y;

  // Clear status
  document.getElementById('se-status').textContent = '';

  // Remove old listeners by cloning
  replaceWithClone('se-width');
  replaceWithClone('se-height');
  replaceWithClone('se-anchor-x-range');
  replaceWithClone('se-anchor-x');
  replaceWithClone('se-anchor-y-range');
  replaceWithClone('se-anchor-y');
  replaceWithClone('se-save');
  replaceWithClone('se-reset');

  // Re-grab references after cloning
  const w = document.getElementById('se-width');
  const h = document.getElementById('se-height');
  const axR = document.getElementById('se-anchor-x-range');
  const axN = document.getElementById('se-anchor-x');
  const ayR = document.getElementById('se-anchor-y-range');
  const ayN = document.getElementById('se-anchor-y');
  const saveBtn = document.getElementById('se-save');
  const resetBtn = document.getElementById('se-reset');

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

  // Save button
  saveBtn.addEventListener('click', async () => {
    const statusEl = document.getElementById('se-status');
    statusEl.textContent = 'Saving...';
    statusEl.style.color = '#4ecdc4';
    try {
      await updateSpriteConfig({
        source,
        category,
        index,
        updates: {
          width: spriteData.width,
          height: spriteData.height,
          anchor: { x: spriteData.anchor.x, y: spriteData.anchor.y },
        },
      });
      statusEl.textContent = 'Saved!';
      statusEl.style.color = '#2ecc71';
      // Update originalValues to reflect saved state
      originalValues = {
        width: spriteData.width,
        height: spriteData.height,
        anchorX: spriteData.anchor.x,
        anchorY: spriteData.anchor.y,
      };
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.style.color = '#ff6b6b';
    }
  });

  // Reset button
  resetBtn.addEventListener('click', () => {
    if (!originalValues) return;
    spriteData.width = originalValues.width;
    spriteData.height = originalValues.height;
    spriteData.anchor.x = originalValues.anchorX;
    spriteData.anchor.y = originalValues.anchorY;

    w.value = originalValues.width;
    h.value = originalValues.height;
    axR.value = originalValues.anchorX;
    axN.value = originalValues.anchorX;
    ayR.value = originalValues.anchorY;
    ayN.value = originalValues.anchorY;

    document.getElementById('se-status').textContent = 'Reset to original values';
    document.getElementById('se-status').style.color = '#888';
    scheduleRender();
  });

  panel.style.display = 'block';
}

/**
 * Close the sprite editor panel.
 */
export function closeSpriteEditor() {
  const panel = document.getElementById('sprite-editor-panel');
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
