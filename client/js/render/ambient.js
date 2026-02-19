// ============================================
// MOLTCITY - Ambient Effects (Clouds, Birds, Day/Night)
// ============================================

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
    sunsetSprite.zIndex = 19999; // Just below dayNightOverlay (20000)
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
  const skyHeight = WORLD_MAX_Y * 0.4 - WORLD_MIN_Y;
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
 * Update day/night overlay with time-based color cycle
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

  // Time-based color cycle
  // 5-7: Sunrise (orange/gold)
  // 7-8: Early morning (warm yellow fading)
  // 8-17: Day (no overlay)
  // 17-19: Sunset (orange/red)
  // 19-21: Dusk (purple transition)
  // 21-5: Night (dark blue)

  if (currentHour >= 5 && currentHour < 7) {
    // Sunrise - use gradient sprite, fading out as sun rises
    const progress = (currentHour - 5) / 2; // 0 to 1
    const sprite = getSunsetSprite();
    sprite.alpha = 0.3 - progress * 0.2;

    // Fading stars
    if (currentHour < 6) {
      drawStars(dayNightOverlay, width, height, 1 - progress);
    }

    cloudsContainer.alpha = 0.5 + progress * 0.5;
    cloudShadowsContainer.alpha = progress * 0.8; // Shadows fade in with sunrise
    birdsContainer.alpha = 0.5 + progress * 0.5;
  } else if (currentHour >= 7 && currentHour < 8) {
    // Early morning - light golden warmth fading
    const progress = currentHour - 7; // 0 to 1
    const alpha = 0.15 * (1 - progress);

    dayNightOverlay.beginFill(0xffecd2, alpha);
    dayNightOverlay.drawRect(0, 0, width, height);
    dayNightOverlay.endFill();

    getSunsetSprite().alpha = 0;
    cloudsContainer.alpha = 1;
    cloudShadowsContainer.alpha = 1;
    birdsContainer.alpha = 1;
  } else if (currentHour >= 8 && currentHour < 17) {
    // Daytime - no overlay, full visibility
    getSunsetSprite().alpha = 0;
    cloudsContainer.alpha = 1;
    cloudShadowsContainer.alpha = 1;
    birdsContainer.alpha = 1;
  } else if (currentHour >= 17 && currentHour < 19) {
    // Sunset - use gradient sprite overlay
    const progress = (currentHour - 17) / 2; // 0 to 1
    const sprite = getSunsetSprite();
    sprite.alpha = 0.1 + progress * 0.25;

    cloudsContainer.alpha = 1 - progress * 0.3;
    cloudShadowsContainer.alpha = 1 - progress; // Shadows fade out at sunset
    birdsContainer.alpha = 1 - progress * 0.3;
  } else if (currentHour >= 19 && currentHour < 21) {
    // Dusk - purple/blue transition
    const progress = (currentHour - 19) / 2; // 0 to 1
    const alpha = 0.25 + progress * 0.15;

    getSunsetSprite().alpha = 0;

    // Purple-blue gradient
    dayNightOverlay.beginFill(0x4a235a, alpha * 0.5);
    dayNightOverlay.drawRect(0, 0, width, height);
    dayNightOverlay.endFill();

    dayNightOverlay.beginFill(0x1a1a4a, alpha * 0.45);
    dayNightOverlay.drawRect(0, 0, width, height * 0.6);
    dayNightOverlay.endFill();

    // Fading in stars
    if (currentHour >= 20) {
      drawStars(dayNightOverlay, width, height, progress);
    }

    cloudsContainer.alpha = 0.7 - progress * 0.5;
    cloudShadowsContainer.alpha = 0; // No shadows at dusk
    birdsContainer.alpha = 0.7 - progress * 0.5;
  } else {
    // Night (21-5) - dark blue tint with stars
    getSunsetSprite().alpha = 0;

    dayNightOverlay.beginFill(0x0a1128, 0.4);
    dayNightOverlay.drawRect(0, 0, width, height);
    dayNightOverlay.endFill();

    // Draw stars
    drawStars(dayNightOverlay, width, height, 1);

    // Hide clouds at night, show fewer birds
    cloudsContainer.alpha = 0.2;
    cloudShadowsContainer.alpha = 0; // No shadows at night
    birdsContainer.alpha = 0.3;
  }
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
