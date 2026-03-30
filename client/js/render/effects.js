// ============================================
// MOLTCITY - Building Effects (Smoke & Fire)
// ============================================
//
// Smoke particles for industrial/coal/nuclear buildings.
// Fire overlays + glows for burning buildings (from server fire simulation).

import {
  TILE_WIDTH,
  TILE_HEIGHT,
  NUM_LAYERS,
  LAYER_STATUS,
} from "../config.js";
import { cartToIso } from "../utils.js";
import * as state from "../state.js";
import { seededRandom } from "../sprites.js";
import { createGlowTexture, getLightingContainer } from "./lighting.js";

// --- Sprite sheet frames ---
const SHEET_COLS = 4;
const SHEET_ROWS = 4;
const FRAME_SIZE = 80;

let smokeFrames = []; // 8 smoke puff textures (rows 0-1)
let fireFrames = [];  // 8 fire sprite textures (rows 2-3)
let effectsReady = false;

// --- Smoke state ---
const SMOKE_TYPES = ["industrial", "coal_plant", "nuclear_plant"];
const SMOKE_PARTICLES_PER_BUILDING = 4;
let smokeEmitters = []; // { particles: [{ sprite, life, startX, startY, driftX }], zIndex }

// --- Fire state ---
let fireEffects = [];   // { sprites: [], glow, buildingId }
let fireGlows = [];     // glow sprites in lightsContainer

/**
 * Initialize effects — load sprite sheet and slice into frame textures.
 * Call once from initGame().
 */
export async function initEffects() {
  try {
    const texture = await PIXI.Assets.load("/sprites/sliced/smoke_01.png");
    const base = texture.baseTexture;
    base.scaleMode = PIXI.SCALE_MODES.NEAREST;

    // Slice into 4x4 grid
    for (let row = 0; row < SHEET_ROWS; row++) {
      for (let col = 0; col < SHEET_COLS; col++) {
        const frame = new PIXI.Texture(
          base,
          new PIXI.Rectangle(col * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE),
        );
        if (row < 2) {
          smokeFrames.push(frame);
        } else {
          fireFrames.push(frame);
        }
      }
    }

    effectsReady = true;
    console.log(`[Effects] Loaded ${smokeFrames.length} smoke + ${fireFrames.length} fire frames`);
  } catch (e) {
    console.warn("[Effects] Failed to load smoke_01.png:", e);
  }
}

/**
 * Clear all effects from the scene (called at start of render()).
 */
function clearEffects() {
  // Remove smoke particles from sceneLayer
  for (const emitter of smokeEmitters) {
    for (const p of emitter.particles) {
      p.sprite.parent?.removeChild(p.sprite);
    }
  }
  smokeEmitters = [];

  clearFireEffects();
}

/**
 * Rebuild all effects after a render() pass.
 * Call from render() after buildings are drawn.
 */
export function rebuildEffects() {
  clearEffects();
  if (!effectsReady) return;

  rebuildSmoke();
  rebuildFire();
}

// =============================================
// SMOKE
// =============================================

/** Map building type → sprite array (mirrors serviceSpriteMap in game.js) */
function getSmokeSprites(type) {
  const map = {
    industrial: state.industrialSprites,
    coal_plant: state.powerPlantSprites,
    nuclear_plant: state.powerPlantSprites,
  };
  return map[type] || [];
}

/** Create one smoke emitter (4 particles) at the given screen position */
function addSmokeEmitter(container, emitX, emitY, zIdx) {
  const particles = [];
  for (let i = 0; i < SMOKE_PARTICLES_PER_BUILDING; i++) {
    const frameIdx = Math.floor(Math.random() * smokeFrames.length);
    const sprite = new PIXI.Sprite(smokeFrames[frameIdx]);
    sprite.anchor.set(0.5);
    sprite.blendMode = PIXI.BLEND_MODES.NORMAL;
    sprite.zIndex = zIdx;
    sprite.alpha = 0;
    container.addChild(sprite);

    particles.push({
      sprite,
      life: i / SMOKE_PARTICLES_PER_BUILDING,
      startX: emitX,
      startY: emitY,
      driftX: (Math.random() - 0.5) * 6,
    });
  }
  smokeEmitters.push({ particles });
}

function rebuildSmoke() {
  const { buildings, parcels, sceneLayer } = state;

  for (const building of buildings) {
    if (!SMOKE_TYPES.includes(building.type)) continue;
    if (!building.powered) continue;

    const parcel = parcels.find((p) => p.id === building.parcelId);
    if (!parcel) continue;

    const fw = building.width || 1;
    const fh = building.height || 1;

    // Z-index: above building
    const D_mid = parcel.x + parcel.y + Math.floor((fw + fh - 2) / 2);
    const zIdx = D_mid * NUM_LAYERS + LAYER_STATUS;

    // Look up which sprite variant this building uses (same deterministic pick as drawBuilding)
    const spriteArr = getSmokeSprites(building.type);
    let chimneys = null;
    let spriteData = null;
    if (spriteArr.length > 0) {
      const rng = seededRandom(parcel.x * 1000 + parcel.y);
      const idx = Math.floor(rng() * spriteArr.length);
      spriteData = spriteArr[idx];
      if (spriteData.chimneys && spriteData.chimneys.length > 0) {
        chimneys = spriteData.chimneys;
      }
    }

    if (chimneys && spriteData) {
      // Sprite anchor screen position (same formula as createBuildingSprites in game.js)
      const tileSpan = spriteData.tiles || 1;
      const scale = (TILE_WIDTH * tileSpan) / spriteData.width;
      const anchorX = cartToIso(parcel.x + (fw - 1) / 2, parcel.y + (fh - 1) / 2).x;
      const anchorY = cartToIso(parcel.x + fw - 1, parcel.y + fh - 1).y + TILE_HEIGHT;

      for (const chimney of chimneys) {
        // chimneys offsets are in source-sprite pixels relative to the anchor point
        const emitX = anchorX + chimney.x * scale;
        const emitY = anchorY + chimney.y * scale;
        addSmokeEmitter(sceneLayer, emitX, emitY, zIdx);
      }
    } else {
      // Fallback: center of building footprint
      const iso = cartToIso(parcel.x + (fw - 1) / 2, parcel.y + (fh - 1) / 2);
      addSmokeEmitter(sceneLayer, iso.x, iso.y - 10, zIdx);
    }
  }
}

// =============================================
// FIRE
// =============================================

function rebuildFire() {
  const fires = state.activeFires;
  if (!fires || fires.length === 0) return;

  const { sceneLayer } = state;
  const lc = getLightingContainer();

  for (const fire of fires) {
    const iso = cartToIso(fire.x, fire.y);
    const baseX = iso.x;
    const baseY = iso.y + TILE_HEIGHT * 0.5;

    const D = fire.x + fire.y;
    const zIdx = D * NUM_LAYERS + LAYER_STATUS;

    // Number of fire sprites scales with intensity
    const count = Math.min(3, Math.ceil(fire.intensity / 2));
    const sprites = [];

    for (let i = 0; i < count; i++) {
      const frameIdx = Math.floor(Math.random() * fireFrames.length);
      const sprite = new PIXI.Sprite(fireFrames[frameIdx]);
      sprite.anchor.set(0.5, 0.8);
      sprite.zIndex = zIdx;
      sprite.scale.set(0.2 + (fire.intensity / 5) * 0.15);
      sprite.alpha = 0.85;
      // Spread multiple fire sprites slightly apart
      sprite.x = baseX + (i - (count - 1) / 2) * 6;
      sprite.y = baseY - 5 - i * 3;
      sprite._fireAnimTime = Math.random() * Math.PI * 2;
      sprite._fireFrameTimer = 0;
      sceneLayer.addChild(sprite);
      sprites.push(sprite);
    }

    fireEffects.push({ sprites, buildingId: fire.buildingId, intensity: fire.intensity });

    // Fire glow in lighting container
    if (lc) {
      const glow = new PIXI.Sprite(createGlowTexture(32));
      glow.anchor.set(0.5);
      glow.x = baseX;
      glow.y = baseY;
      const glowSize = 30 + fire.intensity * 10;
      glow.width = glowSize;
      glow.height = glowSize;
      glow.tint = 0xff4400;
      glow.alpha = 0.2 + (fire.intensity / 5) * 0.3;
      glow.blendMode = PIXI.BLEND_MODES.ADD;
      glow._fireAnimTime = Math.random() * Math.PI * 2;
      lc.addChild(glow);
      fireGlows.push(glow);
    }
  }
}

// =============================================
// ANIMATION (called every frame)
// =============================================

/**
 * Update fire effects when activeFires state changes (without full re-render).
 * Called from websocket handler.
 */
export function updateFireEffects() {
  if (!effectsReady) return;
  clearFireEffects();
  rebuildFire();
}

function clearFireEffects() {
  for (const fx of fireEffects) {
    for (const s of fx.sprites) {
      s.parent?.removeChild(s);
    }
  }
  fireEffects = [];

  const lc = getLightingContainer();
  for (const g of fireGlows) {
    lc?.removeChild(g);
  }
  fireGlows = [];
}

/**
 * Animate all effects — called from gameLoop(delta).
 */
export function animateEffects(delta) {
  if (!effectsReady) return;
  animateSmoke(delta);
  animateFire(delta);
}

function animateSmoke(delta) {
  for (const emitter of smokeEmitters) {
    for (const p of emitter.particles) {
      p.life += delta * 0.008;

      if (p.life >= 1) {
        // Reset particle
        p.life = 0;
        p.driftX = (Math.random() - 0.5) * 6;
        // Pick new frame
        p.sprite.texture = smokeFrames[Math.floor(Math.random() * smokeFrames.length)];
      }

      const t = p.life;
      p.sprite.x = p.startX + Math.sin(t * Math.PI) * p.driftX;
      p.sprite.y = p.startY - t * 40;
      p.sprite.alpha = 0.45 * (1 - t);
      p.sprite.scale.set(0.12 + t * 0.14);
    }
  }
}

function animateFire(delta) {
  // Animate fire sprites
  for (const fx of fireEffects) {
    for (const sprite of fx.sprites) {
      sprite._fireAnimTime += delta * 0.1;
      sprite._fireFrameTimer += delta;

      // Cycle frame every ~8 frames
      if (sprite._fireFrameTimer >= 8) {
        sprite._fireFrameTimer = 0;
        sprite.texture = fireFrames[Math.floor(Math.random() * fireFrames.length)];
      }

      // Flicker alpha
      sprite.alpha = 0.7 + Math.sin(sprite._fireAnimTime * 5) * 0.2;
      // Slight scale pulse
      const baseScale = 0.2 + (fx.intensity / 5) * 0.15;
      sprite.scale.set(baseScale * (1 + Math.sin(sprite._fireAnimTime * 3) * 0.08));
    }
  }

  // Animate fire glows
  for (const glow of fireGlows) {
    glow._fireAnimTime += delta * 0.08;
    glow.alpha = (0.2 + Math.sin(glow._fireAnimTime * 4) * 0.1);
  }
}
