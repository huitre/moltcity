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
  LAYER_LIGHT,
  LAYER_POLE,
} from "../config.js";
import { cartToIso } from "../utils.js";
import * as state from "../state.js";
import { resolveSpriteData } from "../sprites.js";

// Lighting configuration - adjustable
export const LIGHTING_CONFIG = {
  // Streetlight settings
  streetlight: {
    haloRadius: 4,
    haloColor: 0xffdd88,
    haloAlpha: 0.12,
    eraseRadius: 30, // radius for scene illumination
    eraseAlpha: 0.2, // how much to brighten (ADD intensity)
    poleHeight: 40,
    poleColor: 0x444444,
    bulbColor: 0xffffcc,
    bulbRadius: 1,
  },
  // Light colors for variety
  windowColors: [0xffdd77, 0xffeebb, 0xffffcc, 0xffcc66, 0xffffff],
};

// Street lamp texture scale
const STREETLAMP_SCALE = 14 / 142; // target height 14px

// Default window parallelogram size (pixels in screen space)
const DEFAULT_WIN_W = 8;
const DEFAULT_WIN_H = 5;
let WIN_SKEW = 0.35; // iso 2:1 ratio

// Cached radial-gradient glow texture (white center → transparent edge)
let glowTexture = null;

/**
 * Create a reusable white radial-gradient texture for streetlight halos.
 * Center is opaque white, edge is fully transparent.
 */
export function createGlowTexture(radius = 32) {
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

// Cached window glow textures per face orientation
const windowGlowTextures = {};

/**
 * Create a parallelogram-shaped gradient texture for window lights.
 * Bright opaque center → soft transparent edges, with downward light spill.
 */
function createWindowGlowTexture(face = "left", skewVal = WIN_SKEW) {
  const cacheKey = `${face}-${skewVal}`;
  if (windowGlowTextures[cacheKey]) return windowGlowTextures[cacheKey];

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Parallelogram proportions within the canvas
  const pW = size * 0.3;
  const pH = size * 0.22;
  const skew = pW * skewVal;
  const cx = size / 2;
  const cy = size / 2;

  function buildPath() {
    ctx.beginPath();
    if (face === "right") {
      ctx.moveTo(cx - pW / 2, cy - pH / 2);
      ctx.lineTo(cx + pW / 2, cy - pH / 2 + skew);
      ctx.lineTo(cx + pW / 2, cy + pH / 2 + skew);
      ctx.lineTo(cx - pW / 2, cy + pH / 2);
    } else {
      ctx.moveTo(cx - pW / 2, cy - pH / 2 + skew);
      ctx.lineTo(cx + pW / 2, cy - pH / 2);
      ctx.lineTo(cx + pW / 2, cy + pH / 2);
      ctx.lineTo(cx - pW / 2, cy + pH / 2 + skew);
    }
    ctx.closePath();
  }

  // Bright center with soft glow fading outward + slight downward spill
  ctx.save();
  buildPath();
  ctx.shadowColor = "rgba(255,255,255,0.5)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fill();
  ctx.restore();

  windowGlowTextures[cacheKey] = PIXI.Texture.from(canvas);
  return windowGlowTextures[cacheKey];
}

// Standalone container for all light sprites (NOT in worldContainer).
// Transform synced with worldContainer each frame.
let lightsContainer = null;

let streetlightSprites = [];
let buildingLightSprites = [];
let trafficLightGlowSprites = [];
let buildingSilhouetteSprites = [];

// Current clear color for the lighting texture [r, g, b, a]
let currentClearColor = [1, 1, 1, 1];

/**
 * Initialize the standalone lights container.
 */
export function initLighting() {
  if (lightsContainer) lightsContainer.destroy({ children: true });

  lightsContainer = new PIXI.Container();
  lightsContainer.sortableChildren = true;
  streetlightSprites = [];
  buildingLightSprites = [];
  trafficLightGlowSprites = [];
  buildingSilhouetteSprites = [];
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
      lightIso.x + state.streetLampOffsetX,
      lightIso.y + state.streetLampOffsetY,
      parcel.x,
      parcel.y,
    );
    building.z += LAYER_POLE;
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
  halo.zIndex = 50000;

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
    const tex = sd.texture;
    const scaledW = (tex ? tex.orig.width : sd.width) * scale;
    const scaledH = (tex ? tex.orig.height : sd.height) * scale;

    const bldgLightContainer = new PIXI.Container();

    const winW = sd.windowSize?.w || DEFAULT_WIN_W;
    const winH = sd.windowSize?.h || DEFAULT_WIN_H;
    const winSkew = sd.windowSkew ?? WIN_SKEW;

    const spriteTint = sd.windowTint
      ? parseInt(sd.windowTint.replace("#", ""), 16)
      : null;

    for (const pos of windows) {
      if (Math.random() > 0.6) continue;

      const anchor = sd.anchor || { x: 0.5, y: 1 };
      const windowX = (pos.x - anchor.x) * scaledW;
      const windowY = (pos.y - anchor.y) * scaledH;
      const face = pos.face || "left";
      const color =
        spriteTint ??
        cfg.windowColors[Math.floor(Math.random() * cfg.windowColors.length)];

      // Single parallelogram gradient sprite (edges → transparent center + glow)
      const winTex = createWindowGlowTexture(face, winSkew);
      const winSprite = new PIXI.Sprite(winTex);
      winSprite.anchor.set(0.5);
      winSprite.x = windowX;
      winSprite.y = windowY;
      winSprite.width = winW * 3;
      winSprite.height = winH * 3;
      winSprite.tint = color;
      winSprite.alpha = 0.7;
      winSprite.blendMode = PIXI.BLEND_MODES.ADD;
      bldgLightContainer.addChild(winSprite);
    }

    bldgLightContainer.x = iso.x;
    bldgLightContainer.y = iso.y + TILE_HEIGHT / 2;

    if (bldgLightContainer.children.length > 0) {
      bldgLightContainer.alpha = 0;
      // Z-index: lights render above their building's silhouette
      const D_mid = parcel.x + parcel.y + Math.floor((fw + fh - 2) / 2);
      bldgLightContainer.zIndex = D_mid * NUM_LAYERS + LAYER_LIGHT;
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
 * Create building silhouette sprites in the lightsContainer.
 * These paint the ambient color over back-building lights, providing
 * z-ordered occlusion within the lighting texture.
 */
export function createBuildingSilhouettes() {
  if (!lightsContainer) initLighting();

  for (const s of buildingSilhouetteSprites) {
    s.sprite.parent?.removeChild(s.sprite);
  }
  buildingSilhouetteSprites = [];

  const { buildings, parcels } = state;

  for (const building of buildings) {
    const parcel = parcels.find((p) => p.id === building.parcelId);
    if (!parcel) continue;

    const resolved = resolveSpriteData(building, parcel.x, parcel.y);
    if (!resolved) continue;

    const sd = resolved.spriteData;
    if (!sd.width || !sd.anchor) continue;

    // Get texture: array sprites store it on spriteData, default sprites in the map entry
    let texture = sd.texture;
    if (
      !texture &&
      resolved.source === "buildings" &&
      state.defaultSprites.has(building.type)
    ) {
      texture = state.defaultSprites.get(building.type).texture;
    }
    if (!texture) continue;

    const fw = building.width || 1;
    const fh = building.height || 1;
    const tileSpan = sd.tiles || 1;
    const scale = (TILE_WIDTH * tileSpan) / sd.width;

    const spriteIsoX = cartToIso(
      parcel.x + (fw - 1) / 2,
      parcel.y + (fh - 1) / 2,
    ).x;
    const spriteIsoY =
      cartToIso(parcel.x + fw - 1, parcel.y + fh - 1).y + TILE_HEIGHT;

    const D_mid = parcel.x + parcel.y + Math.floor((fw + fh - 2) / 2);

    const sprite = new PIXI.Sprite(texture);
    sprite.scale.set(scale);
    sprite.anchor.set(sd.anchor.x, sd.anchor.y);
    sprite.x = spriteIsoX;
    sprite.y = spriteIsoY;
    sprite.blendMode = PIXI.BLEND_MODES.NORMAL;
    sprite.alpha = 0; // invisible during day
    sprite.zIndex = D_mid * NUM_LAYERS + LAYER_BUILDING;

    lightsContainer.addChild(sprite);
    buildingSilhouetteSprites.push({ sprite, building });
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

  // Building silhouettes — tinted with the ambient clear color so they
  // match the lighting texture background exactly (no extra darkening).
  // Only show once it's dark enough (22:00+) to avoid visible artifacts.
  const hour = state.currentHour;
  const silhouetteAlpha = hour >= 22 || hour < 5 ? 1 : 0;
  const ambientTint =
    ((Math.round(currentClearColor[0] * 255) & 0xff) << 16) |
    ((Math.round(currentClearColor[1] * 255) & 0xff) << 8) |
    (Math.round(currentClearColor[2] * 255) & 0xff);
  for (const s of buildingSilhouetteSprites) {
    s.sprite.tint = ambientTint;
    s.sprite.alpha = silhouetteAlpha;
  }

  // Building window lights — fade in as night falls.
  // Before silhouettes kick in (< 22:00), reduce brightness to prevent
  // light bleeding through front buildings.
  const lightAlpha = silhouetteAlpha ? alpha : alpha * 0.35;
  for (const bl of buildingLightSprites) {
    bl.container.alpha = lightAlpha;
  }

  // Streetlight halos — fade in + flicker
  const time = Date.now() * 0.001;
  for (let i = 0; i < streetlightSprites.length; i++) {
    const sl = streetlightSprites[i];
    const flicker = 0.9 + Math.sin(time * 3 + i * 2) * 0.1;
    sl.halo.alpha = alpha * flicker;
  }

  // Traffic light glows — fade in at night
  for (const tg of trafficLightGlowSprites) {
    tg.sprite.alpha = alpha * 0.5;
  }

  // Vehicle headlights — fade in at night
  for (const v of state.animatedVehicles) {
    if (v.headlightL) v.headlightL.alpha = alpha * 0.5;
    if (v.headlightR) v.headlightR.alpha = alpha * 0.5;
  }

  // Render lights to the lighting texture with current ambient clear color
  const renderer = app.renderer;
  renderer.renderTexture.bind(lightingTexture);
  renderer.renderTexture.clear(currentClearColor);
  renderer.render(lightsContainer, {
    renderTexture: lightingTexture,
    clear: false,
  });
}

/**
 * Create traffic light glows in the lighting container.
 * Uses intersection data from state.trafficLightGraphics.
 */
export function createTrafficLightGlows() {
  if (!lightsContainer) initLighting();

  for (const tg of trafficLightGlowSprites) {
    tg.sprite.parent?.removeChild(tg.sprite);
  }
  trafficLightGlowSprites = [];

  const tex = createGlowTexture(32);
  const phase = state.trafficLightPhase;

  for (const tl of state.trafficLightGraphics) {
    if (!tl || !tl.sprites) continue;
    for (const s of tl.sprites) {
      if (!s.glow) continue; // only front-facing have scene glow

      // Create a matching glow in the lighting container
      const halo = new PIXI.Sprite(tex);
      halo.anchor.set(0.5);
      halo.x = s.glow.x;
      halo.y = s.glow.y;
      halo.width = 16;
      halo.height = 16;
      halo.alpha = 0.4;
      halo.blendMode = PIXI.BLEND_MODES.ADD;
      halo.zIndex = 50000;

      const isGreen = s.axis === "ns" ? phase === 0 : phase === 1;
      halo.tint = isGreen ? 0x00ff44 : 0xff2200;

      lightsContainer.addChild(halo);
      trafficLightGlowSprites.push({
        sprite: halo,
        axis: s.axis,
        sceneGlow: s.glow,
      });
    }
  }
}

/**
 * Sync traffic light lighting halos — tint and position from scene glows.
 */
export function updateTrafficLightGlowPhase() {
  const phase = state.trafficLightPhase;
  for (const tg of trafficLightGlowSprites) {
    const isGreen = tg.axis === "ns" ? phase === 0 : phase === 1;
    tg.sprite.tint = isGreen ? 0x00ff44 : 0xff2200;
    if (tg.sceneGlow) {
      tg.sprite.y = tg.sceneGlow.y;
    }
  }
}

/**
 * Rebuild all lights (call after roads/buildings change)
 */
export function rebuildLights() {
  createBuildingSilhouettes();
  createStreetlights();
  createBuildingLights();
  createTrafficLightGlows();
}

/**
 * Get the lighting container for debug access
 */
export function getLightingContainer() {
  return lightsContainer;
}

/**
 * Get/set the window light skew factor.
 * Setting invalidates cached textures so they regenerate on next rebuild.
 */
export function getWinSkew() {
  return WIN_SKEW;
}

export function setWinSkew(v) {
  WIN_SKEW = v;
  // Invalidate cached textures so they regenerate with new skew
  for (const key of Object.keys(windowGlowTextures)) {
    delete windowGlowTextures[key];
  }
}
