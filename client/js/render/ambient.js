// ============================================
// MOLTCITY - Ambient Effects (Clouds, Birds, Day/Night)
// ============================================

import { updateLighting, setLightingClearColor } from "./lighting.js";

import {
  CLOUD_COUNT,
  BIRD_COUNT,
  WORLD_MIN_X,
  WORLD_MAX_X,
  WORLD_MIN_Y,
  WORLD_MAX_Y,
} from "../config.js";
import * as state from "../state.js";

// Shadow offset from cloud (simulates sun angle)
const SHADOW_OFFSET_X = 80;
const SHADOW_OFFSET_Y = 60;

// Sunset gradient overlay sprite (lazy-initialized)
let sunsetSprite = null;

function getSunsetSprite() {
  if (!sunsetSprite) {
    const texture = PIXI.Texture.from("/sprites/sliced/sunset_gradient_01.png");
    sunsetSprite = new PIXI.TilingSprite(
      texture,
      state.app.screen.width,
      state.app.screen.height,
    );
    sunsetSprite.alpha = 0;
    sunsetSprite.zIndex = 19998; // Below lightingSprite (19999) and dayNightOverlay (20000)
    state.app.stage.addChild(sunsetSprite);
  }
  // Resize to fill the screen, texture repeats naturally
  sunsetSprite.width = state.app.screen.width;
  sunsetSprite.height = state.app.screen.height;
  return sunsetSprite;
}

/**
 * Initialize cloud sprites with shadows
 */
export function initClouds() {
  const { cloudsContainer, clouds, cloudShadows } = state;
  const skyHeight = WORLD_MAX_Y * 0.25 - WORLD_MIN_Y;
  const spacing = skyHeight / CLOUD_COUNT;

  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cloud = createCloud();
    // Spread clouds top-to-bottom with random horizontal offset and vertical jitter
    cloud.x = WORLD_MIN_X + Math.random() * (WORLD_MAX_X - WORLD_MIN_X);
    cloud.y = WORLD_MIN_Y + i * spacing + Math.random() * spacing * 0.6;
    cloud.speed = 0.2 + Math.random() * 0.3;
    clouds.push(cloud);
    cloudsContainer.addChild(cloud);

    // Create matching shadow
    const shadow = createCloudShadow(cloud);
    shadow.x = cloud.x + SHADOW_OFFSET_X;
    shadow.y = cloud.y + SHADOW_OFFSET_Y;
    cloudShadows.push(shadow);
    cloudsContainer.addChild(shadow);
  }
}

/**
 * Create a single cloud sprite using cloud_01–05 images
 */
function createCloud() {
  const index = Math.floor(Math.random() * 5) + 1;
  const padded = String(index).padStart(2, "0");
  const texture = PIXI.Texture.from(`/sprites/sliced/cloud_${padded}.png`);
  const cloud = new PIXI.Sprite(texture);
  cloud.anchor.set(0.5);
  cloud.alpha = 0.8;
  cloud.scale.set(0.4 + Math.random() * 0.3);
  return cloud;
}

/**
 * Create a shadow sprite matching a cloud (black tinted, ground-level)
 */
function createCloudShadow(cloud) {
  const shadow = new PIXI.Sprite(cloud.texture);
  shadow.anchor.set(0.5);
  shadow.scale.set(cloud.scale.x);
  shadow.tint = 0x000000;
  shadow.alpha = 0.15;
  return shadow;
}

/**
 * Initialize bird sprites
 */
export function initBirds() {
  const { birdsContainer, birds } = state;

  for (let i = 0; i < BIRD_COUNT; i++) {
    const bird = createBird();
    bird.x = WORLD_MIN_X + Math.random() * (WORLD_MAX_X - WORLD_MIN_X);
    bird.y = WORLD_MIN_Y + Math.random() * (WORLD_MAX_Y * 0.3);
    bird.speed = 0.5 + Math.random() * 0.5;
    bird.flapPhase = Math.random() * Math.PI * 2;
    bird.flapSpeed = 0.1 + Math.random() * 0.05;
    birds.push(bird);
    birdsContainer.addChild(bird);
  }
}

/**
 * Create a single bird sprite
 */
function createBird() {
  const bird = new PIXI.Graphics();
  bird.lineStyle(2, 0x333333);
  // Simple V-shape bird
  bird.moveTo(-6, 0);
  bird.lineTo(0, -3);
  bird.lineTo(6, 0);
  return bird;
}

/**
 * Animate clouds and birds
 */
export function animateAmbient(delta) {
  const { clouds, cloudShadows, birds } = state;

  // Animate clouds - move along isometric axis
  for (let i = 0; i < clouds.length; i++) {
    const cloud = clouds[i];
    cloud.x += cloud.speed * delta;
    cloud.y += cloud.speed * 0.5 * delta;

    // Wrap around when cloud exits
    if (cloud.x > WORLD_MAX_X + 100 || cloud.y > WORLD_MAX_Y * 0.4) {
      cloud.x = WORLD_MIN_X - 100 + Math.random() * 400;
      cloud.y = WORLD_MIN_Y - 100;
    }

    // Sync shadow position
    if (cloudShadows[i]) {
      cloudShadows[i].x = cloud.x + SHADOW_OFFSET_X;
      cloudShadows[i].y = cloud.y + SHADOW_OFFSET_Y;
    }
  }

  // Animate birds
  for (const bird of birds) {
    bird.flapPhase += bird.flapSpeed * delta;
    bird.x += bird.speed * delta;
    bird.y += bird.speed * 0.4 * delta + Math.sin(bird.flapPhase) * 0.3;

    // Wrap around
    if (bird.x > WORLD_MAX_X + 50 || bird.y > WORLD_MAX_Y * 0.4) {
      bird.x = WORLD_MIN_X - 50 + Math.random() * 200;
      bird.y = WORLD_MIN_Y - 50;
    }

    // Redraw bird with wing flap
    bird.clear();
    bird.lineStyle(2, 0x333333);
    const flapY = Math.sin(bird.flapPhase) * 3;
    bird.moveTo(-6, flapY);
    bird.lineTo(0, 0);
    bird.lineTo(6, flapY);
  }
}

/**
 * Draw stars with sparkle effect
 */
function drawStars(overlay, width, height, alpha = 1) {
  for (let i = 0; i < 50; i++) {
    const x = (i * 137.5) % width;
    const y = (i * 73.3) % (height * 0.4);
    const size = 1 + (i % 3);
    const twinkle = 0.5 + Math.sin(Date.now() * 0.003 + i) * 0.5;
    const starAlpha = twinkle * 0.8 * alpha;

    // Draw center dot
    overlay.beginFill(0xffffff, starAlpha);
    overlay.drawCircle(x, y, size);
    overlay.endFill();

    // Draw cross rays for sparkle effect
    const rayLength = size * 3;
    overlay.lineStyle(size * 0.5, 0xffffff, starAlpha * 0.6);

    // Vertical ray
    overlay.moveTo(x, y - rayLength);
    overlay.lineTo(x, y + rayLength);

    // Horizontal ray
    overlay.moveTo(x - rayLength, y);
    overlay.lineTo(x + rayLength, y);

    // Diagonal rays for brighter stars
    if (size > 1) {
      const diagLength = rayLength * 0.6;
      overlay.lineStyle(size * 0.3, 0xffffff, starAlpha * 0.4);
      overlay.moveTo(x - diagLength, y - diagLength);
      overlay.lineTo(x + diagLength, y + diagLength);
      overlay.moveTo(x + diagLength, y - diagLength);
      overlay.lineTo(x - diagLength, y + diagLength);
    }
  }
  overlay.lineStyle(0);
}

/**
 * Smoothly interpolate between two values
 */
function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Interpolate between two hex colors
 */
function lerpColor(c1, c2, t) {
  t = Math.max(0, Math.min(1, t));
  const r = Math.round(((c1 >> 16) & 0xff) * (1 - t) + ((c2 >> 16) & 0xff) * t);
  const g = Math.round(((c1 >> 8) & 0xff) * (1 - t) + ((c2 >> 8) & 0xff) * t);
  const b = Math.round((c1 & 0xff) * (1 - t) + (c2 & 0xff) * t);
  return (r << 16) | (g << 8) | b;
}

// Day/night keyframes: [hour, overlayColor, overlayAlpha, starsAlpha, cloudsAlpha, shadowsAlpha, birdsAlpha]
const CYCLE_KEYFRAMES = [
  //  hr   color       alpha  stars clouds shadows birds
  [  0,  0x060d1e,   0.65,  1.0,  0.20,  0.00,  0.30 ],
  [  4,  0x060d1e,   0.65,  1.0,  0.20,  0.00,  0.30 ],
  [  5,  0x1a1040,   0.45,  0.8,  0.40,  0.00,  0.40 ],
  [  6,  0xffa060,   0.20,  0.2,  0.70,  0.40,  0.70 ],
  [  7,  0xffecd2,   0.10,  0.0,  0.90,  0.80,  0.90 ],
  [  8,  0x000000,   0.00,  0.0,  1.00,  1.00,  1.00 ],
  [ 16,  0x000000,   0.00,  0.0,  1.00,  1.00,  1.00 ],
  [ 17,  0xffa040,   0.08,  0.0,  1.00,  0.80,  1.00 ],
  [ 18,  0xff6030,   0.20,  0.0,  0.80,  0.40,  0.80 ],
  [ 19,  0x4a235a,   0.35,  0.2,  0.60,  0.10,  0.60 ],
  [ 20,  0x1a1a4a,   0.50,  0.6,  0.40,  0.00,  0.40 ],
  [ 21,  0x060d1e,   0.65,  1.0,  0.20,  0.00,  0.30 ],
  [ 24,  0x060d1e,   0.65,  1.0,  0.20,  0.00,  0.30 ],
];

/**
 * Update day/night overlay with smooth time-based gradient cycle
 */
export function updateDayNightOverlay() {
  const {
    app,
    dayNightOverlay,
    cloudsContainer,
    cloudShadowsContainer,
    birdsContainer,
    currentHour,
  } = state;

  dayNightOverlay.clear();

  const width = app.screen.width;
  const height = app.screen.height;

  // Find surrounding keyframes and interpolate
  let prev = CYCLE_KEYFRAMES[0];
  let next = CYCLE_KEYFRAMES[CYCLE_KEYFRAMES.length - 1];

  for (let i = 0; i < CYCLE_KEYFRAMES.length - 1; i++) {
    if (currentHour >= CYCLE_KEYFRAMES[i][0] && currentHour < CYCLE_KEYFRAMES[i + 1][0]) {
      prev = CYCLE_KEYFRAMES[i];
      next = CYCLE_KEYFRAMES[i + 1];
      break;
    }
  }

  const range = next[0] - prev[0];
  const t = range > 0 ? (currentHour - prev[0]) / range : 0;

  const color = lerpColor(prev[1], next[1], t);
  const alpha = lerp(prev[2], next[2], t);
  const starsAlpha = lerp(prev[3], next[3], t);
  const cloudsAlpha = lerp(prev[4], next[4], t);
  const shadowsAlpha = lerp(prev[5], next[5], t);
  const birdsAlpha = lerp(prev[6], next[6], t);

  // Update lighting clear color — this replaces the full-screen color fill.
  // Formula: component = 1 - alpha + alpha * (colorChannel / 255)
  // Day (alpha=0) → [1,1,1,1] (MULTIPLY with white = no effect)
  // Night (alpha>0) → tinted dark (scene darkened by MULTIPLY)
  {
    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >> 8) & 0xff) / 255;
    const b = (color & 0xff) / 255;
    setLightingClearColor(
      1 - alpha + alpha * r,
      1 - alpha + alpha * g,
      1 - alpha + alpha * b,
    );
  }

  // Hide sunset sprite (replaced by smooth color interpolation)
  getSunsetSprite().alpha = 0;

  // Stars drawn on dayNightOverlay (above the lighting layer)
  if (starsAlpha > 0.01) {
    drawStars(dayNightOverlay, width, height, starsAlpha);
  }

  // Ambient elements
  cloudsContainer.alpha = cloudsAlpha;
  cloudShadowsContainer.alpha = shadowsAlpha;
  birdsContainer.alpha = birdsAlpha;

  // Update lighting (streetlights and building lights)
  updateLighting(alpha);
}

/**
 * Update traffic limits based on time and population
 */
export function updateTrafficLimits() {
  const { currentHour, currentPopulation } = state;

  // Traffic multiplier based on time
  let multiplier = 1.0;
  if (
    (currentHour >= 7 && currentHour < 9) ||
    (currentHour >= 17 && currentHour < 19)
  ) {
    multiplier = 2.0; // Rush hours
  } else if (currentHour >= 22 || currentHour < 5) {
    multiplier = 0.2; // Night
  }

  const baseVehicles = Math.max(5, Math.floor(currentPopulation * 0.2));
  state.setMaxAnimatedVehicles(
    Math.min(50, Math.max(5, Math.floor(baseVehicles * multiplier))),
  );

  // Pedestrians
  const basePedestrians = Math.max(3, Math.floor(currentPopulation * 0.15));
  const pedMultiplier = currentHour >= 22 || currentHour < 6 ? 0.3 : 1.0;
  state.setMaxPedestrians(
    Math.min(30, Math.max(3, Math.floor(basePedestrians * pedMultiplier))),
  );
}
