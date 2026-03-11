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

// Correction angle: sprites use 45° steps, iso roads are at ~27° (atan(0.5))
const ISO_CORRECTION = Math.PI / 4 - Math.atan(0.94);
const DIR_ROTATION = {
  north: ISO_CORRECTION,
  east: -ISO_CORRECTION,
  south: ISO_CORRECTION,
  west: -ISO_CORRECTION,
};

function applyVehicleScale(sprite, config) {
  const size = config.size || { width: 24, height: 24 };
  sprite.scale.set(
    size.width / sprite.texture.width,
    size.height / sprite.texture.height,
  );
}

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

  // Filter out service vehicles if their building doesn't exist
  const { buildings } = state;
  const hasPolice = buildings.some((b) => b.type === "police_station");
  const hasHospital = buildings.some((b) => b.type === "hospital");
  const allowed = vehicleTypes.filter((t) => {
    if (t === "police" && !hasPolice) return false;
    if (t === "ambulance" && !hasHospital) return false;
    return true;
  });
  if (allowed.length === 0) return;

  // Pick random vehicle type
  const vehicleType = allowed[Math.floor(Math.random() * allowed.length)];
  const vehicleData = vehicleSprites.get(vehicleType);
  if (!vehicleData) return;

  // Pick initial direction
  const validDirs = getValidDirections(parcel.x, parcel.y);
  if (validDirs.length === 0) return;

  const dir = validDirs[Math.floor(Math.random() * validDirs.length)];
  const texture = vehicleData.directions.get(CARDINAL_TO_ISO[dir]);
  if (!texture) return;

  const sprite = new PIXI.Sprite(texture);
  sprite.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  sprite.anchor.set(0.5, 0.8);
  applyVehicleScale(sprite, vehicleData.config);
  sprite.rotation = DIR_ROTATION[dir] || 0;

  const vehicle = {
    x: parcel.x + 0.5,
    y: parcel.y + 0.5,
    targetX: parcel.x + 0.5 + DIR_VECTORS[dir].dx,
    targetY: parcel.y + 0.5 + DIR_VECTORS[dir].dy,
    speed: VEHICLE_SPEED + Math.random() * 0.2,
    dir: dir,
    sprite: sprite,
    vehicleData: vehicleData,
    vehicleType: vehicleType,
  };

  const iso = cartToIso(vehicle.x, vehicle.y);
  sprite.x = iso.x;
  sprite.y = iso.y + TILE_HEIGHT / 2;
  sprite.zIndex =
    Math.floor(vehicle.y) * GRID_SIZE + Math.floor(vehicle.x) + 0.5;

  // Add directly to worldContainer for proper z-sorting with buildings
  state.sceneLayer.addChild(sprite);
  animatedVehicles.push(vehicle);
}

/**
 * Animate all vehicles
 */
export function animateVehicles(delta) {
  const { animatedVehicles, vehicleSprites } = state;

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
      // Snap to tile center to prevent drift
      const currentX = Math.round(vehicle.targetX);
      const currentY = Math.round(vehicle.targetY);
      vehicle.x = currentX + 0.5;
      vehicle.y = currentY + 0.5;

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

      // Always continue straight if possible
      let nextDir = validDirs.includes(vehicle.dir)
        ? vehicle.dir
        : validDirs[Math.floor(Math.random() * validDirs.length)];

      vehicle.dir = nextDir;
      vehicle.targetX = currentX + DIR_VECTORS[nextDir].dx;
      vehicle.targetY = currentY + DIR_VECTORS[nextDir].dy;

      // Update sprite texture for new direction
      const newTexture = vehicle.vehicleData.directions.get(
        CARDINAL_TO_ISO[nextDir],
      );
      if (newTexture) {
        vehicle.sprite.texture = newTexture;
        vehicle.sprite.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        applyVehicleScale(vehicle.sprite, vehicle.vehicleData.config);
        vehicle.sprite.rotation = DIR_ROTATION[nextDir] || 0;
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
    vehicle.sprite.zIndex =
      Math.floor(vehicle.y) * GRID_SIZE + Math.floor(vehicle.x) + 1;

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
 * Check if a click at screen position hits a vehicle, show debug if so.
 * Returns true if a vehicle was clicked.
 */
export function handleVehicleClick(globalPos) {
  const worldContainer = state.worldContainer;
  const localPos = worldContainer.toLocal(globalPos);

  for (const vehicle of state.animatedVehicles) {
    const bounds = vehicle.sprite.getBounds();
    if (
      globalPos.x >= bounds.x &&
      globalPos.x <= bounds.x + bounds.width &&
      globalPos.y >= bounds.y &&
      globalPos.y <= bounds.y + bounds.height
    ) {
      showVehicleDebug(vehicle);
      return true;
    }
  }
  return false;
}

/**
 * Show vehicle debug in admin panel's Vehicles tab
 */
function showVehicleDebug(vehicle) {
  const panel = document.getElementById("admin-panel");
  if (!panel) return;

  const config = vehicle.vehicleData.config;
  const size = config.size || { width: 24, height: 24 };

  // Show vehicle content, hide placeholder
  const noSel = document.getElementById("vd-no-selection");
  const content = document.getElementById("vd-content");
  if (noSel) noSel.style.display = "none";
  if (content) content.style.display = "block";

  document.getElementById("vd-type").textContent = vehicle.vehicleType;
  document.getElementById("vd-direction").textContent =
    vehicle.dir + " → " + CARDINAL_TO_ISO[vehicle.dir];
  document.getElementById("vd-texture-size").textContent =
    vehicle.sprite.texture.width + "x" + vehicle.sprite.texture.height;

  const widthInput = document.getElementById("vd-width");
  const heightInput = document.getElementById("vd-height");
  const rotationInput = document.getElementById("vd-rotation");
  const widthVal = document.getElementById("vd-width-val");
  const heightVal = document.getElementById("vd-height-val");
  const rotationVal = document.getElementById("vd-rotation-val");

  widthInput.value = size.width;
  heightInput.value = size.height;
  widthVal.textContent = size.width;
  heightVal.textContent = size.height;

  const rotDeg = Math.round((vehicle.sprite.rotation * 180) / Math.PI);
  rotationInput.value = rotDeg;
  rotationVal.textContent = rotDeg + "\u00B0";

  // Remove old listeners by cloning
  const newWidth = widthInput.cloneNode(true);
  const newHeight = heightInput.cloneNode(true);
  const newRotation = rotationInput.cloneNode(true);
  widthInput.replaceWith(newWidth);
  heightInput.replaceWith(newHeight);
  rotationInput.replaceWith(newRotation);

  newWidth.addEventListener("input", () => {
    const v = parseInt(newWidth.value);
    widthVal.textContent = v;
    config.size.width = v;
    for (const av of state.animatedVehicles) {
      if (av.vehicleType === vehicle.vehicleType) {
        applyVehicleScale(av.sprite, config);
      }
    }
  });

  newHeight.addEventListener("input", () => {
    const v = parseInt(newHeight.value);
    heightVal.textContent = v;
    config.size.height = v;
    for (const av of state.animatedVehicles) {
      if (av.vehicleType === vehicle.vehicleType) {
        applyVehicleScale(av.sprite, config);
      }
    }
  });

  newRotation.addEventListener("input", () => {
    const deg = parseInt(newRotation.value);
    rotationVal.textContent = deg + "\u00B0";
    const rad = (deg * Math.PI) / 180;
    DIR_ROTATION[vehicle.dir] = rad;
    for (const av of state.animatedVehicles) {
      if (av.dir === vehicle.dir) {
        av.sprite.rotation = rad;
      }
    }
  });

  // Open admin panel on Vehicles tab
  panel.style.display = "block";
  const vehiclesTab = document.querySelector(
    '#admin-panel .admin-tab[data-tab="admin-tab-vehicles"]',
  );
  if (vehiclesTab) vehiclesTab.click();
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
