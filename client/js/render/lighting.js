// ============================================
// MOLTCITY - Night Lighting System
// ============================================

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
    poleHeight: 30,
    poleColor: 0x444444,
    bulbColor: 0xffffcc,
    bulbRadius: 3,
  },
  // Light colors for variety
  windowColors: [0xffdd77, 0xffeebb, 0xffffcc, 0xffcc66, 0xffffff],
};

// Street lamp texture scale
const STREETLAMP_SCALE = 14 / 142; // target height 14px

// Container for all lighting elements
let lightingContainer = null;
let streetlightSprites = [];
let buildingLightSprites = [];

/**
 * Initialize the lighting container.
 * Placed on app.stage AFTER dayNightOverlay so it renders on top of the dark overlay.
 */
export function initLighting() {
  if (lightingContainer) {
    lightingContainer.parent?.removeChild(lightingContainer);
  }

  lightingContainer = new PIXI.Container();
  lightingContainer.alpha = 0; // Start hidden (daytime)
  lightingContainer.blendMode = PIXI.BLEND_MODES.ADD;
  state.app.stage.addChild(lightingContainer);

  streetlightSprites = [];
  buildingLightSprites = [];
}

/**
 * Create streetlight halos for street_lamp buildings.
 * The lamp sprite itself is rendered by the normal building pipeline (drawBuilding).
 */
export function createStreetlights() {
  if (!lightingContainer) initLighting();

  // Clear existing streetlight halos
  for (const sl of streetlightSprites) {
    lightingContainer.removeChild(sl.container);
  }
  streetlightSprites = [];

  const { buildings, parcels } = state;
  const cfg = LIGHTING_CONFIG.streetlight;

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
    lightingContainer.addChild(streetlight.container);
  }
}

/**
 * Create a halo glow for a streetlight building.
 * Only the glow — the physical lamp sprite is drawn by drawBuilding().
 */
function createStreetlightHalo(screenX, screenY, tileX, tileY) {
  const cfg = LIGHTING_CONFIG.streetlight;

  const baseX = screenX;
  const baseY = screenY + TILE_HEIGHT / 2;
  const lampHeight = 142 * STREETLAMP_SCALE; // 14px
  const lampZIndex =
    ((tileX + tileY) * GRID_SIZE + tileX) * NUM_LAYERS + LAYER_POLE;

  // Halo glow (in lightingContainer, additive blending, night only)
  const container = new PIXI.Container();
  container.zIndex = lampZIndex;

  const halo = new PIXI.Graphics();
  const bulbY = -lampHeight + 2; // near top of lamp sprite
  halo.beginFill(cfg.haloColor, cfg.haloAlpha);
  halo.drawCircle(0, bulbY, cfg.haloRadius);
  halo.endFill();

  for (let i = 1; i <= 3; i++) {
    const r = cfg.haloRadius * (1 - i * 0.25);
    const a = cfg.haloAlpha * (1 + i * 0.3);
    halo.beginFill(cfg.haloColor, Math.min(a, 0.3));
    halo.drawCircle(0, bulbY, r);
    halo.endFill();
  }

  container.addChild(halo);
  container.x = baseX;
  container.y = baseY;

  return { container, halo, bulb: halo, tileX, tileY };
}

/**
 * Create building window lights based on per-sprite "windows" data from sprites.json.
 * Buildings without a "windows" field in their sprite data get no window lights.
 */
export function createBuildingLights() {
  if (!lightingContainer) initLighting();

  // Clear existing building lights
  for (const bl of buildingLightSprites) {
    lightingContainer.removeChild(bl.container);
  }
  buildingLightSprites = [];

  const { buildings, parcels } = state;
  const cfg = LIGHTING_CONFIG;

  for (const building of buildings) {
    const parcel = parcels.find((p) => p.id === building.parcelId);
    if (!parcel) continue;

    // Resolve which sprite this building uses
    const resolved = resolveSpriteData(building, parcel.x, parcel.y);
    if (!resolved?.spriteData?.windows) continue;

    const windows = resolved.spriteData.windows;
    const fw = building.width || 1;
    const fh = building.height || 1;

    const cx = parcel.x + fw / 2;
    const cy = parcel.y + fh / 2;
    const iso = cartToIso(cx, cy);

    // Use actual sprite dimensions for positioning
    const sd = resolved.spriteData;
    const tileSpan = sd.tiles || 1;
    const scale = (TILE_WIDTH * tileSpan) / sd.width;
    const scaledW = sd.width * scale;
    const scaledH = sd.height * scale;

    const container = new PIXI.Container();
    container.zIndex = (parcel.x + parcel.y) * GRID_SIZE + parcel.x + 2;

    for (const pos of windows) {
      // 60% chance lit
      if (Math.random() > 0.6) continue;

      const windowX = (pos.x - 0.5) * scaledW;
      const windowY = -scaledH * pos.y;

      const color =
        cfg.windowColors[Math.floor(Math.random() * cfg.windowColors.length)];

      const win = new PIXI.Graphics();
      // Glow
      win.beginFill(color, 0.15);
      win.drawCircle(windowX, windowY, 5);
      win.endFill();
      // Isometric parallelogram
      const ww = 4,
        wh = 2,
        skew = -2;
      win.beginFill(color, 0.4);
      win.moveTo(windowX - ww + skew, windowY - wh);
      win.lineTo(windowX + ww + skew, windowY - wh);
      win.lineTo(windowX + ww - skew, windowY + wh);
      win.lineTo(windowX - ww - skew, windowY + wh);
      win.closePath();
      win.endFill();

      container.addChild(win);
    }

    container.x = iso.x;
    container.y = iso.y + TILE_HEIGHT / 2;

    if (container.children.length > 0) {
      buildingLightSprites.push({ container, building, parcel });
      lightingContainer.addChild(container);
    }
  }
}

/**
 * Update lighting intensity based on time of day
 * Call this from updateDayNightOverlay
 */
export function updateLighting(nightAlpha) {
  if (!lightingContainer) return;

  // Sync transform with worldContainer so lights follow camera pan/zoom
  const wc = state.worldContainer;
  lightingContainer.x = wc.x;
  lightingContainer.y = wc.y;
  lightingContainer.scale.set(wc.scale.x, wc.scale.y);

  // Lights visible when it's dark (nightAlpha > 0.1)
  const lightIntensity = Math.max(0, (nightAlpha - 0.1) / 0.3);
  lightingContainer.alpha = Math.min(1, lightIntensity);

  // Flicker effect for some streetlights
  const time = Date.now() * 0.001;
  for (let i = 0; i < streetlightSprites.length; i++) {
    const sl = streetlightSprites[i];
    const flicker = 0.9 + Math.sin(time * 3 + i * 2) * 0.1;
    sl.halo.alpha = flicker;
    sl.bulb.alpha = flicker;
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
 * Get the lighting container for debug access
 */
export function getLightingContainer() {
  return lightingContainer;
}
