// ============================================
// MOLTCITY - Night Lighting System
// ============================================
//
// Two-layer approach:
//   1. ERASE layer (inside nightLayer) — white discs that punch holes in the
//      dark overlay, revealing the lit scene underneath.
//   2. ADD layer (on app.stage above nightLayer) — warm-colored discs for the
//      visible glow tint the player sees.

import {
  TILE_WIDTH,
  TILE_HEIGHT,
  GRID_SIZE,
  NUM_LAYERS,
  LAYER_POLE,
} from "../config.js";
import { cartToIso } from "../utils.js";
import * as state from "../state.js";
import { resolveSpriteData } from "../sprites.js";

// Lighting configuration - adjustable
export const LIGHTING_CONFIG = {
  // Streetlight settings
  streetlight: {
    haloRadius: 20,
    haloColor: 0xffdd88,
    haloAlpha: 0.12,
    eraseRadius: 40,      // larger radius for scene illumination
    eraseAlpha: 0.6,      // how much darkness to remove (0-1)
    poleHeight: 30,
    poleColor: 0x444444,
    bulbColor: 0xffffcc,
    bulbRadius: 3,
  },
  // Window light erase settings
  windowEraseRadius: 8,
  windowEraseAlpha: 0.25,
  // Light colors for variety
  windowColors: [0xffdd77, 0xffeebb, 0xffffcc, 0xffcc66, 0xffffff],
};

// Street lamp texture scale
const STREETLAMP_SCALE = 14 / 142; // target height 14px

// ERASE layer — lives inside nightLayer, punches holes in the dark overlay
let eraseContainer = null;
// ADD layer — lives on stage above nightLayer, provides warm glow color
let glowContainer = null;

let streetlightSprites = [];
let buildingLightSprites = [];

/**
 * Initialize both lighting containers.
 * - eraseContainer goes into nightLayer (ERASE blend to reveal scene)
 * - glowContainer goes on app.stage above nightLayer (ADD blend for warm tint)
 */
export function initLighting() {
  // Clean up previous containers
  if (eraseContainer) eraseContainer.parent?.removeChild(eraseContainer);
  if (glowContainer) glowContainer.parent?.removeChild(glowContainer);

  // ERASE container inside nightLayer — punches holes in the dark overlay
  eraseContainer = new PIXI.Container();
  eraseContainer.blendMode = PIXI.BLEND_MODES.ERASE;
  if (state.nightLayer) {
    state.nightLayer.addChild(eraseContainer);
  }

  // ADD container on stage — warm glow color on top
  glowContainer = new PIXI.Container();
  glowContainer.zIndex = 20001;
  glowContainer.alpha = 0;
  glowContainer.blendMode = PIXI.BLEND_MODES.ADD;
  state.app.stage.addChild(glowContainer);

  streetlightSprites = [];
  buildingLightSprites = [];
}

/**
 * Create streetlight halos for street_lamp buildings.
 * The lamp sprite itself is rendered by the normal building pipeline (drawBuilding).
 */
export function createStreetlights() {
  if (!eraseContainer) initLighting();

  // Clear existing streetlight sprites from both containers
  for (const sl of streetlightSprites) {
    sl.eraseDisc.parent?.removeChild(sl.eraseDisc);
    sl.glowDisc.parent?.removeChild(sl.glowDisc);
  }
  streetlightSprites = [];

  const { buildings, parcels } = state;

  for (const building of buildings) {
    if (building.type !== "street_lamp") continue;
    const parcel = parcels.find((p) => p.id === building.parcelId);
    if (!parcel) continue;

    const lightIso = cartToIso(parcel.x + 0.5, parcel.y + 0.5);
    const streetlight = createStreetlightHalo(
      lightIso.x,
      lightIso.y,
      parcel.x,
      parcel.y,
    );
    streetlightSprites.push(streetlight);
    eraseContainer.addChild(streetlight.eraseDisc);
    glowContainer.addChild(streetlight.glowDisc);
  }
}

/**
 * Create a dual-layer halo for a streetlight.
 * Returns an erase disc (reveals scene) and a glow disc (warm color).
 */
function createStreetlightHalo(screenX, screenY, tileX, tileY) {
  const cfg = LIGHTING_CONFIG.streetlight;
  const baseX = screenX;
  const baseY = screenY + TILE_HEIGHT / 2;
  const lampHeight = 142 * STREETLAMP_SCALE;
  const bulbY = -lampHeight + 2;

  // --- ERASE disc: white circles that remove darkness ---
  const eraseDisc = new PIXI.Graphics();
  // Soft gradient: multiple concentric circles, stronger in center
  for (let i = 4; i >= 0; i--) {
    const t = i / 4;
    const r = cfg.eraseRadius * (0.3 + t * 0.7);
    const a = cfg.eraseAlpha * (1 - t * 0.8);
    eraseDisc.beginFill(0xffffff, a);
    eraseDisc.drawCircle(0, bulbY, r);
    eraseDisc.endFill();
  }
  eraseDisc.x = baseX;
  eraseDisc.y = baseY;

  // --- GLOW disc: warm-colored circles (additive) ---
  const glowDisc = new PIXI.Graphics();
  glowDisc.beginFill(cfg.haloColor, cfg.haloAlpha);
  glowDisc.drawCircle(0, bulbY, cfg.haloRadius);
  glowDisc.endFill();
  for (let i = 1; i <= 3; i++) {
    const r = cfg.haloRadius * (1 - i * 0.25);
    const a = cfg.haloAlpha * (1 + i * 0.3);
    glowDisc.beginFill(cfg.haloColor, Math.min(a, 0.3));
    glowDisc.drawCircle(0, bulbY, r);
    glowDisc.endFill();
  }
  glowDisc.x = baseX;
  glowDisc.y = baseY;

  return { eraseDisc, glowDisc, tileX, tileY };
}

/**
 * Create building window lights based on per-sprite "windows" data from sprites.json.
 * Buildings without a "windows" field in their sprite data get no window lights.
 */
export function createBuildingLights() {
  if (!eraseContainer) initLighting();

  // Clear existing building lights from both containers
  for (const bl of buildingLightSprites) {
    bl.eraseContainer.parent?.removeChild(bl.eraseContainer);
    bl.glowContainer.parent?.removeChild(bl.glowContainer);
  }
  buildingLightSprites = [];

  const { buildings, parcels } = state;
  const cfg = LIGHTING_CONFIG;

  for (const building of buildings) {
    const parcel = parcels.find((p) => p.id === building.parcelId);
    if (!parcel) continue;

    const resolved = resolveSpriteData(building, parcel.x, parcel.y);
    if (!resolved?.spriteData?.windows) continue;

    const windows = resolved.spriteData.windows;
    const fw = building.width || 1;
    const fh = building.height || 1;

    const cx = parcel.x + fw / 2;
    const cy = parcel.y + fh / 2;
    const iso = cartToIso(cx, cy);

    const sd = resolved.spriteData;
    const tileSpan = sd.tiles || 1;
    const scale = (TILE_WIDTH * tileSpan) / sd.width;
    const scaledW = sd.width * scale;
    const scaledH = sd.height * scale;

    const bldgErase = new PIXI.Container();
    const bldgGlow = new PIXI.Container();
    bldgErase.zIndex = (parcel.x + parcel.y) * GRID_SIZE + parcel.x + 2;
    bldgGlow.zIndex = bldgErase.zIndex;

    for (const pos of windows) {
      if (Math.random() > 0.6) continue;

      const windowX = (pos.x - 0.5) * scaledW;
      const windowY = -scaledH * pos.y;
      const color =
        cfg.windowColors[Math.floor(Math.random() * cfg.windowColors.length)];

      // Erase disc for each window (small, subtle scene reveal)
      const eraseWin = new PIXI.Graphics();
      eraseWin.beginFill(0xffffff, cfg.windowEraseAlpha);
      eraseWin.drawCircle(windowX, windowY, cfg.windowEraseRadius);
      eraseWin.endFill();
      bldgErase.addChild(eraseWin);

      // Glow for each window (warm color, additive)
      const glowWin = new PIXI.Graphics();
      glowWin.beginFill(color, 0.15);
      glowWin.drawCircle(windowX, windowY, 5);
      glowWin.endFill();
      const ww = 2, wh = 2, skew = -0.5;
      glowWin.beginFill(color, 0.4);
      glowWin.moveTo(windowX - ww, windowY - wh);
      glowWin.lineTo(windowX + ww, windowY - wh - skew);
      glowWin.lineTo(windowX + ww + skew, windowY + wh);
      glowWin.lineTo(windowX - ww + skew, windowY + wh + skew);
      glowWin.closePath();
      glowWin.endFill();
      bldgGlow.addChild(glowWin);
    }

    bldgErase.x = iso.x;
    bldgErase.y = iso.y + TILE_HEIGHT / 2;
    bldgGlow.x = iso.x;
    bldgGlow.y = iso.y + TILE_HEIGHT / 2;

    if (bldgGlow.children.length > 0) {
      buildingLightSprites.push({
        eraseContainer: bldgErase,
        glowContainer: bldgGlow,
        building,
        parcel,
      });
      eraseContainer.addChild(bldgErase);
      glowContainer.addChild(bldgGlow);
    }
  }
}

/**
 * Update lighting intensity based on time of day.
 * Call this from updateDayNightOverlay.
 */
export function updateLighting(nightAlpha) {
  if (!eraseContainer || !glowContainer) return;

  // Sync both containers' transforms with worldContainer
  const wc = state.worldContainer;
  eraseContainer.x = wc.x;
  eraseContainer.y = wc.y;
  eraseContainer.scale.set(wc.scale.x, wc.scale.y);
  glowContainer.x = wc.x;
  glowContainer.y = wc.y;
  glowContainer.scale.set(wc.scale.x, wc.scale.y);

  // Lights visible when it's dark (nightAlpha > 0.1)
  const lightIntensity = Math.max(0, (nightAlpha - 0.1) / 0.3);
  const alpha = Math.min(1, lightIntensity);
  eraseContainer.alpha = alpha;
  glowContainer.alpha = alpha;

  // Flicker effect for streetlights
  const time = Date.now() * 0.001;
  for (let i = 0; i < streetlightSprites.length; i++) {
    const sl = streetlightSprites[i];
    const flicker = 0.9 + Math.sin(time * 3 + i * 2) * 0.1;
    sl.eraseDisc.alpha = flicker;
    sl.glowDisc.alpha = flicker;
  }
}

/**
 * Rebuild all lights (call after roads/buildings change)
 */
export function rebuildLights() {
  createStreetlights();
  createBuildingLights();
}

/**
 * Get the glow container for debug access
 */
export function getLightingContainer() {
  return glowContainer;
}
