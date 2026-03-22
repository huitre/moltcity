// ============================================
// MOLTCITY - Night Lighting System
// ============================================
//
// Multiplicative lighting via manual RenderTexture:
//   - All light sprites (window panes, halos, streetlight halos) live in
//     a standalone lightsContainer whose transform is synced with worldContainer.
//   - Each frame, lightsContainer is rendered to a RenderTexture with the
//     ambient clearColor, then displayed via a MULTIPLY sprite over the scene.
//   - Light sprites use ADD blend — additive on top of the ambient clearColor.

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
    eraseRadius: 30, // radius for scene illumination
    eraseAlpha: 0.2, // how much to brighten (ADD intensity)
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

// Default window parallelogram size (pixels in screen space)
const DEFAULT_WIN_W = 8;
const DEFAULT_WIN_H = 5;
const WIN_SKEW = 0.5; // iso 2:1 ratio

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

/**
 * Draw an isometric parallelogram (window pane shape) on a PIXI.Graphics.
 * face="left" → left wall (top slopes up-right),
 * face="right" → right wall (top slopes down-right).
 */
function drawParallelogram(g, x, y, w, h, face, color, alpha) {
  const skew = w * WIN_SKEW;
  g.beginFill(color, alpha);
  if (face === "right") {
    g.moveTo(x - w / 2, y - h / 2);
    g.lineTo(x + w / 2, y - h / 2 + skew);
    g.lineTo(x + w / 2, y + h / 2 + skew);
    g.lineTo(x - w / 2, y + h / 2);
  } else {
    g.moveTo(x - w / 2, y - h / 2 + skew);
    g.lineTo(x + w / 2, y - h / 2);
    g.lineTo(x + w / 2, y + h / 2);
    g.lineTo(x - w / 2, y + h / 2 + skew);
  }
  g.closePath();
  g.endFill();
}

// Standalone container for all light sprites (NOT in worldContainer).
// Transform synced with worldContainer each frame.
let lightsContainer = null;

let streetlightSprites = [];
let buildingLightSprites = [];

// Current clear color for the lighting texture [r, g, b, a]
let currentClearColor = [1, 1, 1, 1];

/**
 * Initialize the standalone lights container.
 */
export function initLighting() {
  if (lightsContainer) lightsContainer.destroy({ children: true });

  lightsContainer = new PIXI.Container();
  streetlightSprites = [];
  buildingLightSprites = [];
}

/**
 * Set the ambient clear color for the lighting texture.
 * Called by ambient.js each frame based on the day/night cycle.
 */
export function setLightingClearColor(r, g, b) {
  currentClearColor[0] = r;
  currentClearColor[1] = g;
  currentClearColor[2] = b;
  currentClearColor[3] = 1;
}

/**
 * Create streetlight halos for street_lamp buildings.
 */
export function createStreetlights() {
  if (!lightsContainer) initLighting();

  for (const sl of streetlightSprites) {
    sl.halo.parent?.removeChild(sl.halo);
  }
  streetlightSprites = [];

  const { buildings, parcels } = state;

  for (const building of buildings) {
    if (building.type !== "street_lamp") continue;
    const parcel = parcels.find((p) => p.id === building.parcelId);
    if (!parcel) continue;

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
    lightsContainer.addChild(streetlight.halo);
  }
}

/**
 * Create a halo sprite for a streetlight (ADD blend).
 */
function createStreetlightHalo(screenX, screenY, tileX, tileY) {
  const cfg = LIGHTING_CONFIG.streetlight;
  const baseX = screenX;
  const baseY = screenY + TILE_HEIGHT / 2;
  const lampHeight = 142 * STREETLAMP_SCALE;
  const bulbY = -lampHeight + 2;
  const tex = createGlowTexture(32);

  const halo = new PIXI.Sprite(tex);
  halo.anchor.set(0.5);
  halo.x = baseX;
  halo.y = baseY + bulbY;
  halo.width = cfg.eraseRadius * 2;
  halo.height = cfg.eraseRadius * 2;
  halo.tint = cfg.haloColor;
  halo.alpha = cfg.eraseAlpha;
  halo.blendMode = PIXI.BLEND_MODES.ADD;

  return { halo, tileX, tileY };
}

/**
 * Create building window lights based on per-sprite "windows" data.
 */
export function createBuildingLights() {
  if (!lightsContainer) initLighting();

  for (const bl of buildingLightSprites) {
    bl.container.parent?.removeChild(bl.container);
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

    const bldgLightContainer = new PIXI.Container();

    const winW = sd.windowSize?.w || DEFAULT_WIN_W;
    const winH = sd.windowSize?.h || DEFAULT_WIN_H;

    const spriteTint = sd.windowTint
      ? parseInt(sd.windowTint.replace("#", ""), 16)
      : null;

    const tex = createGlowTexture(32);

    for (const pos of windows) {
      if (Math.random() > 0.6) continue;

      const anchor = sd.anchor || { x: 0.5, y: 1 };
      const windowX = (pos.x - anchor.x) * scaledW;
      const windowY = (pos.y - anchor.y) * scaledH;
      const face = pos.face || "left";
      const color =
        spriteTint ??
        cfg.windowColors[Math.floor(Math.random() * cfg.windowColors.length)];

      // Soft radial glow behind the parallelogram (light spill)
      const halo = new PIXI.Sprite(tex);
      halo.anchor.set(0.5);
      halo.x = windowX;
      halo.y = windowY;
      halo.width = winW * 3;
      halo.height = winH * 3;
      halo.tint = color;
      halo.alpha = 0.15;
      halo.blendMode = PIXI.BLEND_MODES.ADD;
      bldgLightContainer.addChild(halo);

      // Parallelogram window pane (bright, warm color)
      const pane = new PIXI.Graphics();
      drawParallelogram(pane, windowX, windowY, winW, winH, face, color, 0.5);
      pane.blendMode = PIXI.BLEND_MODES.ADD;
      bldgLightContainer.addChild(pane);

      // Tight radial glow around the parallelogram (warm aura)
      const aura = new PIXI.Sprite(tex);
      aura.anchor.set(0.5);
      aura.x = windowX;
      aura.y = windowY;
      aura.width = winW + 10;
      aura.height = winH + 10;
      aura.tint = color;
      aura.alpha = 0.3;
      aura.blendMode = PIXI.BLEND_MODES.ADD;
      bldgLightContainer.addChild(aura);
    }

    bldgLightContainer.x = iso.x;
    bldgLightContainer.y = iso.y + TILE_HEIGHT / 2;

    if (bldgLightContainer.children.length > 0) {
      bldgLightContainer.alpha = 0;
      lightsContainer.addChild(bldgLightContainer);
      buildingLightSprites.push({
        container: bldgLightContainer,
        building,
        parcel,
      });
    }
  }
}

/**
 * Update lighting intensity and render the lighting texture.
 * Called each frame from updateDayNightOverlay.
 */
export function updateLighting(nightAlpha) {
  if (!lightsContainer) return;

  const { app, worldContainer, lightingTexture } = state;
  if (!app || !worldContainer || !lightingTexture) return;

  // Sync lightsContainer transform with worldContainer (pan/zoom)
  lightsContainer.x = worldContainer.x;
  lightsContainer.y = worldContainer.y;
  lightsContainer.scale.set(worldContainer.scale.x, worldContainer.scale.y);

  // Lights visible when it's dark (nightAlpha > 0.1)
  const lightIntensity = Math.max(0, (nightAlpha - 0.1) / 0.3);
  const alpha = Math.min(1, lightIntensity);

  // Building window lights — fade in as night falls
  for (const bl of buildingLightSprites) {
    bl.container.alpha = alpha;
  }

  // Streetlight halos — fade in + flicker
  const time = Date.now() * 0.001;
  for (let i = 0; i < streetlightSprites.length; i++) {
    const sl = streetlightSprites[i];
    const flicker = 0.9 + Math.sin(time * 3 + i * 2) * 0.1;
    sl.halo.alpha = alpha * flicker;
  }

  // Render lights to the lighting texture with current ambient clear color
  const renderer = app.renderer;
  renderer.renderTexture.bind(lightingTexture);
  renderer.renderTexture.clear(currentClearColor);
  renderer.render(lightsContainer, { renderTexture: lightingTexture, clear: false });
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
  return lightsContainer;
}
