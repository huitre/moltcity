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
  LAYER_BUILDING,
  LAYER_POLE,
} from "../config.js";
import { cartToIso } from "../utils.js";
import * as state from "../state.js";
import { resolveSpriteData } from "../sprites.js";

// Lighting configuration - adjustable
export const LIGHTING_CONFIG = {
  // Streetlight settings
  streetlight: {
    haloRadius: 8,
    haloColor: 0xffdd88,
    haloAlpha: 0.12,
    eraseRadius: 30, // larger radius for scene illumination
    eraseAlpha: 0.2, // how much darkness to remove (0-1)
    poleHeight: 40,
    poleColor: 0x444444,
    bulbColor: 0xffffcc,
    bulbRadius: 1.5,
  },
  // Light colors for variety
  windowColors: [0xffdd77, 0xffeebb, 0xffffcc, 0xffcc66, 0xffffff],
};

// Street lamp texture scale
const STREETLAMP_SCALE = 14 / 142; // target height 14px

// Cached radial-gradient glow texture (white center → transparent edge)
let glowTexture = null;

/**
 * Create a reusable white radial-gradient texture for window halos.
 * Center is opaque white, edge is fully transparent.
 */
function createGlowTexture(radius = 32) {
  if (glowTexture) return glowTexture;
  const size = radius * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(
    radius,
    radius,
    0,
    radius,
    radius,
    radius,
  );
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.6)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.2)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  glowTexture = PIXI.Texture.from(canvas);
  return glowTexture;
}

// ERASE layer — lives inside nightLayer, punches holes in the dark overlay
let eraseContainer = null;
// ADD layer — lives on stage above nightLayer, provides warm glow color
let glowContainer = null;

let streetlightSprites = [];
let buildingLightSprites = [];

// Map from building.id → glow Container (consumed by game.js to group with building sprite)
export const buildingGlowMap = new Map();

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

    // Offset toward adjacent road (match drawBuilding sidewalk logic)
    let offX = 0,
      offY = 0;
    const shift = 0.35;
    const hasRd = (rx, ry) => state.roadPositionSet.has(`${rx},${ry}`);
    if (hasRd(parcel.x - 1, parcel.y)) offX -= shift;
    if (hasRd(parcel.x + 1, parcel.y)) offX += shift;
    if (hasRd(parcel.x, parcel.y - 1)) offY -= shift;
    if (hasRd(parcel.x, parcel.y + 1)) offY += shift;

    const lightIso = cartToIso(parcel.x + 0.5 + offX, parcel.y + 0.5 + offY);
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
  const tex = createGlowTexture(32);

  // --- ERASE disc: gradient sprite that punches a hole in the darkness ---
  const eraseDisc = new PIXI.Sprite(tex);
  eraseDisc.anchor.set(0.5);
  eraseDisc.x = baseX;
  eraseDisc.y = baseY + bulbY;
  eraseDisc.width = cfg.eraseRadius * 2;
  eraseDisc.height = cfg.eraseRadius * 2;
  eraseDisc.alpha = cfg.eraseAlpha;

  // --- GLOW disc: warm-colored gradient sprite (additive) ---
  const glowDisc = new PIXI.Sprite(tex);
  glowDisc.anchor.set(0.5);
  glowDisc.x = baseX;
  glowDisc.y = baseY + bulbY;
  glowDisc.width = cfg.haloRadius * 2;
  glowDisc.height = cfg.haloRadius * 2;
  glowDisc.tint = cfg.haloColor;
  glowDisc.alpha = cfg.haloAlpha;

  return { eraseDisc, glowDisc, tileX, tileY };
}

/**
 * Create building window lights based on per-sprite "windows" data from sprites.json.
 * Buildings without a "windows" field in their sprite data get no window lights.
 */
export function createBuildingLights() {
  if (!eraseContainer) initLighting();

  // Clear existing building lights
  for (const bl of buildingLightSprites) {
    bl.glowContainer.parent?.removeChild(bl.glowContainer);
    bl.eraseContainer?.parent?.removeChild(bl.eraseContainer);
  }
  buildingLightSprites = [];
  buildingGlowMap.clear();

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

    const bldgGlow = new PIXI.Container();
    const bldgErase = new PIXI.Container(); // erase layer for night overlay

    // Per-sprite tint: use windowTint if set, otherwise null (randomise per window)
    const spriteTint = sd.windowTint
      ? parseInt(sd.windowTint.replace("#", ""), 16)
      : null;

    const tex = createGlowTexture(32);

    for (const pos of windows) {
      if (Math.random() > 0.6) continue;

      const anchor = sd.anchor || { x: 0.5, y: 1 };
      const windowX = (pos.x - anchor.x) * scaledW;
      const windowY = (pos.y - anchor.y) * scaledH;
      const color =
        spriteTint ??
        cfg.windowColors[Math.floor(Math.random() * cfg.windowColors.length)];

      // Radial gradient halo sprite (additive blend)
      const halo = new PIXI.Sprite(tex);
      halo.anchor.set(0.5);
      halo.x = windowX;
      halo.y = windowY;
      halo.width = 32;
      halo.height = 30;
      halo.tint = color;
      halo.alpha = 0.3;
      halo.blendMode = PIXI.BLEND_MODES.LUMINOSITY;
      bldgGlow.addChild(halo);

      // Erase sprite — punches a hole in the night overlay
      const erase = new PIXI.Sprite(tex);
      erase.anchor.set(0.5);
      erase.x = windowX;
      erase.y = windowY;
      erase.width = 20;
      erase.height = 18;
      erase.alpha = 0.15;
      bldgErase.addChild(erase);
    }

    bldgGlow.x = iso.x;
    bldgGlow.y = iso.y + TILE_HEIGHT / 2;
    bldgErase.x = iso.x;
    bldgErase.y = iso.y + TILE_HEIGHT / 2;

    if (bldgGlow.children.length > 0) {
      bldgGlow.alpha = 0;
      bldgErase.alpha = 0;
      eraseContainer.addChild(bldgErase);
      buildingLightSprites.push({
        glowContainer: bldgGlow,
        eraseContainer: bldgErase,
        building,
        parcel,
      });
      // Store glow in map — game.js will group it with the building sprite
      // into a single container so they z-sort together.
      buildingGlowMap.set(building.id, bldgGlow);
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
  glowContainer.alpha = alpha; // streetlight glows only

  // Building window glows live in sceneLayer — update alpha individually
  for (const bl of buildingLightSprites) {
    bl.glowContainer.alpha = alpha;
    if (bl.eraseContainer) bl.eraseContainer.alpha = alpha;
  }

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
