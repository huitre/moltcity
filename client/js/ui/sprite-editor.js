// ============================================
// MOLTCITY - Sprite Editor
// ============================================

import * as state from '../state.js';
import { seededRandom } from '../sprites.js';
import { render } from '../game.js';
import { updateSpriteConfig } from '../api.js';
import { cartToIso } from '../utils.js';

let originalValues = null;
let currentResolved = null;
let currentSprites = []; // PIXI display objects for the clicked item
let rafPending = false;

// ── Sprite type → state array / source key mapping ──
// Matches the serviceSpriteMap in drawBuilding() (game.js)
const BUILDING_SPRITE_MAP = {
  park:           { sprites: () => state.parkSprites,               source: 'park' },
  police_station: { sprites: () => state.serviceSprites.police,     source: 'police' },
  fire_station:   { sprites: () => state.serviceSprites.firestation, source: 'firestation' },
  hospital:       { sprites: () => state.serviceSprites.hospital,   source: 'hospital' },
  power_plant:    { sprites: () => state.powerPlantSprites,         source: 'power_plant' },
  wind_turbine:   { sprites: () => state.windTurbineSprites,        source: 'wind_turbine' },
  coal_plant:     { sprites: () => state.powerPlantSprites,         source: 'power_plant' },
  nuclear_plant:  { sprites: () => state.powerPlantSprites,         source: 'power_plant' },
  water_tower:    { sprites: () => state.waterTankSprites,          source: 'water_tank' },
  university:     { sprites: () => state.universitySprites,         source: 'university' },
  stadium:        { sprites: () => state.stadiumSprites,            source: 'stadium' },
  city_hall:      { sprites: () => state.cityHallSprites,           source: 'city_hall' },
  garbage_depot:  { sprites: () => state.wasteSprites,              source: 'waste' },
};

/**
 * Resolve which sprite data object a building uses.
 * Replicates the selection logic from drawBuilding() in game.js.
 */
function resolveSpriteData(building, x, y) {
  const type = building.type;

  // Suburban / Industrial zone sprites (flat arrays) — checked first like drawBuilding
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

  // Residential / Offices zone sprites — use building.density like drawBuilding
  if (type === 'residential' || type === 'offices') {
    const spriteMap = type === 'residential' ? state.residentialSprites : state.officeSprites;
    const d = building.density || 1;
    const density = d <= 1 ? 'low' : d === 2 ? 'medium' : d === 3 ? 'high' : 'veryhigh';
    const sprites = spriteMap[density];
    if (sprites && sprites.length > 0) {
      const rng = seededRandom(x * 1000 + y);
      const idx = Math.floor(rng() * sprites.length);
      const sd = sprites[idx];
      return { spriteData: sd, source: type, category: density, index: sd._jsonIndex ?? idx };
    }
  }

  // Service / infrastructure / park sprites
  if (BUILDING_SPRITE_MAP[type]) {
    const { sprites: getSprites, source } = BUILDING_SPRITE_MAP[type];
    const sprites = getSprites();
    if (sprites && sprites.length > 0) {
      const rng = seededRandom(x * 1000 + y);
      const idx = Math.floor(rng() * sprites.length);
      const sd = sprites[idx];
      return { spriteData: sd, source, category: null, index: sd._jsonIndex ?? idx };
    }
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
  };

  // Populate read-only fields
  document.getElementById('se-id').textContent = spriteData.id || category || '-';
  document.getElementById('se-file').textContent = spriteData.file || spriteData.basePath || '-';
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
    zi.value = originalValues.zIndex;
    for (const s of currentSprites) s.zIndex = originalValues.zIndex;

    document.getElementById('se-status').textContent = 'Reset to original values';
    document.getElementById('se-status').style.color = '#888';
    scheduleRender();
  });

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
  populateEditor({ spriteData: config, source: 'roads', category: roadType, index: null, _sprites: findSpritesAtTile(x, y) });
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
