// ============================================
// MOLTCITY - Vehicle Rendering & Animation
// ============================================

import {
  TILE_HEIGHT,
  VEHICLE_SPEED,
  DIR_VECTORS,
  OPPOSITE_DIR,
  GRID_SIZE,
  CARDINAL_TO_ISO,
} from "../config.js";
import { cartToIso } from "../utils.js";
import * as state from "../state.js";
import { getRoadAt, getValidDirections } from "./roads.js";

/**
 * Initialize vehicles on the roads
 */
export function initVehicles() {
  const { roads, vehicleSprites } = state;

  if (roads.length > 0 && vehicleSprites.size > 0) {
    const vehicleTypes = Array.from(vehicleSprites.keys());
    const initialCount = Math.min(state.MAX_ANIMATED_VEHICLES, roads.length);

    for (let i = 0; i < initialCount; i++) {
      spawnVehicle(vehicleTypes);
    }
  }
}

/**
 * Spawn a new vehicle on a random road
 */
export function spawnVehicle(vehicleTypes) {
  const {
    animatedVehicles,
    roads,
    parcels,
    vehiclesContainer,
    vehicleSprites,
  } = state;

  if (
    animatedVehicles.length >= state.MAX_ANIMATED_VEHICLES ||
    roads.length === 0
  ) {
    return;
  }

  // Pick a random road to spawn on
  const road = roads[Math.floor(Math.random() * roads.length)];
  const parcel = parcels.find((p) => p.id === road.parcelId);
  if (!parcel) return;

  // Pick random vehicle type
  const vehicleType =
    vehicleTypes[Math.floor(Math.random() * vehicleTypes.length)];
  const vehicleData = vehicleSprites.get(vehicleType);
  if (!vehicleData) return;

  // Pick initial direction
  const validDirs = getValidDirections(parcel.x, parcel.y);
  if (validDirs.length === 0) return;

  const dir = validDirs[Math.floor(Math.random() * validDirs.length)];
  const texture = vehicleData.directions.get(CARDINAL_TO_ISO[dir]);
  if (!texture) return;

  const sprite = new PIXI.Sprite(texture);
  sprite.anchor.set(0.5, 0.8);
  sprite.scale.set(0.5);

  const vehicle = {
    x: parcel.x + 0.5,
    y: parcel.y + 0.5,
    targetX: parcel.x + 0.5 + DIR_VECTORS[dir].dx,
    targetY: parcel.y + 0.5 + DIR_VECTORS[dir].dy,
    speed: VEHICLE_SPEED + Math.random() * 0.2,
    dir: dir,
    sprite: sprite,
    vehicleData: vehicleData,
  };

  const iso = cartToIso(vehicle.x, vehicle.y);
  sprite.x = iso.x;
  sprite.y = iso.y + TILE_HEIGHT / 2;
  sprite.zIndex = Math.floor(vehicle.y) * GRID_SIZE + Math.floor(vehicle.x) + 0.5;

  // Add directly to worldContainer for proper z-sorting with buildings
  state.sceneLayer.addChild(sprite);
  animatedVehicles.push(vehicle);
}

/**
 * Animate all vehicles
 */
export function animateVehicles(delta) {
  const { animatedVehicles, vehiclesContainer, vehicleSprites } = state;

  // Try to maintain vehicle count
  if (
    animatedVehicles.length < state.MAX_ANIMATED_VEHICLES &&
    Math.random() < 0.01
  ) {
    const vehicleTypes = Array.from(vehicleSprites.keys());
    if (vehicleTypes.length > 0) {
      spawnVehicle(vehicleTypes);
    }
  }

  for (let i = animatedVehicles.length - 1; i >= 0; i--) {
    const vehicle = animatedVehicles[i];

    // Move toward target
    const dx = vehicle.targetX + 0.5 - vehicle.x;
    const dy = vehicle.targetY + 0.5 - vehicle.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.1) {
      // Reached target, pick new direction
      const currentX = Math.floor(vehicle.x);
      const currentY = Math.floor(vehicle.y);

      const targetRoad = getRoadAt(currentX, currentY);
      if (!targetRoad) {
        state.sceneLayer.removeChild(vehicle.sprite);
        animatedVehicles.splice(i, 1);
        continue;
      }

      const validDirs = getValidDirections(currentX, currentY).filter(
        (d) => d !== OPPOSITE_DIR[vehicle.dir],
      );

      if (validDirs.length === 0) {
        state.sceneLayer.removeChild(vehicle.sprite);
        animatedVehicles.splice(i, 1);
        continue;
      }

      // Prefer continuing straight
      let nextDir = validDirs.includes(vehicle.dir)
        ? vehicle.dir
        : validDirs[Math.floor(Math.random() * validDirs.length)];

      vehicle.dir = nextDir;
      vehicle.targetX = currentX + DIR_VECTORS[nextDir].dx;
      vehicle.targetY = currentY + DIR_VECTORS[nextDir].dy;

      // Update sprite texture for new direction
      const texture = vehicle.vehicleData.directions.get(
        CARDINAL_TO_ISO[nextDir],
      );
      if (texture) {
        vehicle.sprite.texture = texture;
      }
    } else {
      // Move toward target
      const moveSpeed = vehicle.speed * delta * 0.03;
      vehicle.x += (dx / dist) * moveSpeed;
      vehicle.y += (dy / dist) * moveSpeed;
    }

    // Update sprite position
    const iso = cartToIso(vehicle.x, vehicle.y);
    vehicle.sprite.x = iso.x;
    vehicle.sprite.y = iso.y - TILE_HEIGHT / 2 + 12;
    vehicle.sprite.zIndex = Math.floor(vehicle.y) * GRID_SIZE + Math.floor(vehicle.x) + 1;

    // Remove if out of bounds
    if (
      vehicle.x < 0 ||
      vehicle.x >= GRID_SIZE ||
      vehicle.y < 0 ||
      vehicle.y >= GRID_SIZE
    ) {
      state.sceneLayer.removeChild(vehicle.sprite);
      animatedVehicles.splice(i, 1);
    }
  }
}

/**
 * Draw a simple vehicle (fallback)
 */
export function drawVehicle(x, y) {
  const iso = cartToIso(x, y);
  const g = new PIXI.Graphics();

  // Simple car shape
  g.beginFill(0x3498db);
  g.drawEllipse(iso.x, iso.y + 8, 12, 6);
  g.endFill();

  g.beginFill(0x2980b9);
  g.drawEllipse(iso.x, iso.y + 4, 8, 4);
  g.endFill();

  g.zIndex = y * GRID_SIZE + x;
  return g;
}
