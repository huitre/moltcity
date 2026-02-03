// ============================================
// MOLTCITY - Ambient Effects (Clouds, Birds, Day/Night)
// ============================================

import { CLOUD_COUNT, BIRD_COUNT, WORLD_MIN_X, WORLD_MAX_X, WORLD_MIN_Y, WORLD_MAX_Y } from '../config.js';
import * as state from '../state.js';

/**
 * Initialize cloud sprites
 */
export function initClouds() {
  const { cloudsContainer, clouds } = state;

  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cloud = createCloud();
    cloud.x = WORLD_MIN_X + Math.random() * (WORLD_MAX_X - WORLD_MIN_X);
    cloud.y = WORLD_MIN_Y + Math.random() * (WORLD_MAX_Y * 0.3);
    cloud.speed = 0.2 + Math.random() * 0.3;
    clouds.push(cloud);
    cloudsContainer.addChild(cloud);
  }
}

/**
 * Create a single cloud sprite
 */
function createCloud() {
  const cloud = new PIXI.Graphics();
  cloud.beginFill(0xffffff, 0.8);

  // Random cloud shape
  const numCircles = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < numCircles; i++) {
    const cx = i * 15 - (numCircles * 7);
    const cy = Math.random() * 10 - 5;
    const r = 10 + Math.random() * 15;
    cloud.drawCircle(cx, cy, r);
  }
  cloud.endFill();

  return cloud;
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
  const { clouds, birds } = state;

  // Animate clouds - move along isometric axis
  for (const cloud of clouds) {
    cloud.x += cloud.speed * delta;
    cloud.y += cloud.speed * 0.5 * delta;

    // Wrap around when cloud exits
    if (cloud.x > WORLD_MAX_X + 100 || cloud.y > WORLD_MAX_Y * 0.4) {
      cloud.x = WORLD_MIN_X - 100 + Math.random() * 400;
      cloud.y = WORLD_MIN_Y - 100;
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
 * Update day/night overlay
 */
export function updateDayNightOverlay() {
  const { app, dayNightOverlay, cloudsContainer, birdsContainer, isDaylight } = state;

  dayNightOverlay.clear();

  if (!isDaylight) {
    // Night overlay - dark blue tint
    dayNightOverlay.beginFill(0x0a1128, 0.4);
    dayNightOverlay.drawRect(0, 0, app.screen.width, app.screen.height);
    dayNightOverlay.endFill();

    // Draw some stars
    for (let i = 0; i < 50; i++) {
      const x = (i * 137.5) % app.screen.width;
      const y = (i * 73.3) % (app.screen.height * 0.4);
      const size = 1 + (i % 3);
      const twinkle = 0.5 + Math.sin(Date.now() * 0.003 + i) * 0.5;
      dayNightOverlay.beginFill(0xffffff, twinkle * 0.8);
      dayNightOverlay.drawCircle(x, y, size);
    }
    dayNightOverlay.endFill();

    // Hide clouds at night, show fewer birds
    cloudsContainer.alpha = 0.2;
    birdsContainer.alpha = 0.3;
  } else {
    // Daytime - no overlay, full visibility
    cloudsContainer.alpha = 1;
    birdsContainer.alpha = 1;
  }
}

/**
 * Update traffic limits based on time and population
 */
export function updateTrafficLimits() {
  const { currentHour, currentPopulation } = state;

  // Traffic multiplier based on time
  let multiplier = 1.0;
  if ((currentHour >= 7 && currentHour < 9) || (currentHour >= 17 && currentHour < 19)) {
    multiplier = 2.0; // Rush hours
  } else if (currentHour >= 22 || currentHour < 5) {
    multiplier = 0.2; // Night
  }

  const baseVehicles = Math.max(5, Math.floor(currentPopulation * 0.2));
  state.setMaxAnimatedVehicles(Math.min(50, Math.max(5, Math.floor(baseVehicles * multiplier))));

  // Pedestrians
  const basePedestrians = Math.max(3, Math.floor(currentPopulation * 0.15));
  const pedMultiplier = (currentHour >= 22 || currentHour < 6) ? 0.3 : 1.0;
  state.setMaxPedestrians(Math.min(30, Math.max(3, Math.floor(basePedestrians * pedMultiplier))));
}
