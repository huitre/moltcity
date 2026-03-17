// ============================================
// MOLTCITY - Vehicle Rendering & Animation
// ============================================

import {
  TILE_WIDTH,
  TILE_HEIGHT,
  VEHICLE_SPEED,
  DIR_VECTORS,
  OPPOSITE_DIR,
  GRID_SIZE,
  CARDINAL_TO_ISO,
  LANE_OFFSETS,
  FOLLOW_DISTANCE,
  LANE_WIDTH,
  TRAFFIC_LIGHT_INTERVAL,
  NUM_LAYERS,
  LAYER_VEHICLE,
} from "../config.js";
import { cartToIso } from "../utils.js";
import * as state from "../state.js";
import {
  getRoadAt,
  getValidDirections,
  getValidDirectionsFast,
  getConnectionCount,
  hasRoadAtFast,
} from "./roads.js";

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
 * Check if a traffic light is red for the given direction at a tile
 * Returns true if the tile is an intersection and the vehicle's axis is blocked
 */
function isRedLight(dir, tileX, tileY) {
  if (state.roadPositionSet.size === 0) return false;
  const connections = getConnectionCount(tileX, tileY);
  if (connections < 3) return false; // not an intersection

  const isNS = dir === "north" || dir === "south";
  // Phase 0 = N/S green, Phase 1 = E/W green
  if (state.trafficLightPhase === 0) return !isNS; // red for E/W
  return isNS; // red for N/S
}

/**
 * Find the closest vehicle ahead in the same lane
 */
function getVehicleAhead(vehicle, allVehicles) {
  const dirVec = DIR_VECTORS[vehicle.dir];
  let closest = null;
  let closestDist = Infinity;

  for (let i = 0; i < allVehicles.length; i++) {
    const other = allVehicles[i];
    if (other === vehicle) continue;

    // Vector from vehicle to other
    const dx = other.x - vehicle.x;
    const dy = other.y - vehicle.y;

    // Forward distance (dot product with direction vector)
    const forward = dx * dirVec.dx + dy * dirVec.dy;
    if (forward <= 0 || forward > FOLLOW_DISTANCE) continue;

    // Perpendicular distance
    const perp = Math.abs(dx * dirVec.dy - dy * dirVec.dx);
    if (perp > LANE_WIDTH) continue;

    if (forward < closestDist) {
      closestDist = forward;
      closest = other;
    }
  }

  return closest;
}

/**
 * Check if any vehicle is near a spawn point
 */
function isSpawnBlocked(x, y) {
  for (const v of state.animatedVehicles) {
    const dx = v.x - x;
    const dy = v.y - y;
    if (dx * dx + dy * dy < 0.25) return true; // 0.5^2
  }
  return false;
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

  // Lane offset for initial direction
  const laneOff = LANE_OFFSETS[dir];
  const spawnX = parcel.x + 0.5 + laneOff.dx;
  const spawnY = parcel.y + 0.5 + laneOff.dy;

  // Skip spawn if another vehicle is too close
  if (isSpawnBlocked(spawnX, spawnY)) return;

  const sprite = new PIXI.Sprite(texture);
  sprite.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  sprite.anchor.set(0.5, 0.8);
  applyVehicleScale(sprite, vehicleData.config);
  sprite.rotation = DIR_ROTATION[dir] || 0;

  const vehicle = {
    x: parcel.x + 0.5,
    y: parcel.y + 0.5,
    targetX: parcel.x + DIR_VECTORS[dir].dx,
    targetY: parcel.y + DIR_VECTORS[dir].dy,
    speed: VEHICLE_SPEED + Math.random() * 0.2,
    dir: dir,
    sprite: sprite,
    vehicleData: vehicleData,
    vehicleType: vehicleType,
    // Lane offset state
    laneX: laneOff.dx,
    laneY: laneOff.dy,
    targetLaneX: laneOff.dx,
    targetLaneY: laneOff.dy,
    // Queuing state
    stopped: false,
    effectiveSpeed: VEHICLE_SPEED,
  };

  const iso = cartToIso(vehicle.x + vehicle.laneX, vehicle.y + vehicle.laneY);
  sprite.x = iso.x;
  sprite.y = iso.y + TILE_HEIGHT / 2;
  sprite.zIndex = ((Math.round(vehicle.x) + Math.round(vehicle.y)) * GRID_SIZE + Math.round(vehicle.x)) * NUM_LAYERS + LAYER_VEHICLE;

  // Add directly to worldContainer for proper z-sorting with buildings
  state.sceneLayer.addChild(sprite);
  animatedVehicles.push(vehicle);
}

/**
 * Animate all vehicles
 */
export function animateVehicles(delta) {
  const { animatedVehicles, vehicleSprites } = state;

  // Update traffic light timer
  state.setTrafficLightTimer(state.trafficLightTimer + delta);
  if (state.trafficLightTimer >= TRAFFIC_LIGHT_INTERVAL) {
    state.setTrafficLightTimer(0);
    state.setTrafficLightPhase(state.trafficLightPhase === 0 ? 1 : 0);
    updateTrafficLightGraphics();
  }

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

    // Interpolate lane offset toward target (smooth lane changes)
    vehicle.laneX += (vehicle.targetLaneX - vehicle.laneX) * 0.15;
    vehicle.laneY += (vehicle.targetLaneY - vehicle.laneY) * 0.15;

    // Check for vehicle ahead (queuing)
    const ahead = getVehicleAhead(vehicle, animatedVehicles);
    let speedScale = 1.0;
    if (ahead) {
      const adx = ahead.x - vehicle.x;
      const ady = ahead.y - vehicle.y;
      const aheadDist = Math.sqrt(adx * adx + ady * ady);
      if (ahead.stopped || aheadDist < FOLLOW_DISTANCE * 0.5) {
        speedScale = 0;
        vehicle.stopped = true;
      } else {
        // Slow down proportionally as we approach
        speedScale = Math.max(0.1, aheadDist / FOLLOW_DISTANCE);
        vehicle.stopped = false;
      }
    } else {
      vehicle.stopped = false;
    }

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

      const hasCachedRoads = state.roadPositionSet.size > 0;
      const targetRoadExists = hasCachedRoads
        ? hasRoadAtFast(currentX, currentY)
        : !!getRoadAt(currentX, currentY);

      if (!targetRoadExists) {
        state.sceneLayer.removeChild(vehicle.sprite);
        animatedVehicles.splice(i, 1);
        continue;
      }

      const validDirs = (
        hasCachedRoads
          ? getValidDirectionsFast(currentX, currentY)
          : getValidDirections(currentX, currentY)
      ).filter((d) => d !== OPPOSITE_DIR[vehicle.dir]);

      if (validDirs.length === 0) {
        state.sceneLayer.removeChild(vehicle.sprite);
        animatedVehicles.splice(i, 1);
        continue;
      }

      // Always continue straight if possible
      let nextDir = validDirs.includes(vehicle.dir)
        ? vehicle.dir
        : validDirs[Math.floor(Math.random() * validDirs.length)];

      // Check traffic light: is the next tile a red intersection?
      const nextTileX = currentX + DIR_VECTORS[nextDir].dx;
      const nextTileY = currentY + DIR_VECTORS[nextDir].dy;
      if (isRedLight(nextDir, nextTileX, nextTileY)) {
        // Stay at tile center - keep target at current tile so we re-check next frame
        vehicle.stopped = true;
        vehicle.targetX = currentX;
        vehicle.targetY = currentY;
      } else {
        vehicle.dir = nextDir;
        vehicle.targetX = currentX + DIR_VECTORS[nextDir].dx;
        vehicle.targetY = currentY + DIR_VECTORS[nextDir].dy;
        vehicle.stopped = false;

        // Update lane offset for new direction
        const laneOff = LANE_OFFSETS[nextDir];
        vehicle.targetLaneX = laneOff.dx;
        vehicle.targetLaneY = laneOff.dy;

        // Update sprite texture for new direction
        const newTexture = vehicle.vehicleData.directions.get(
          CARDINAL_TO_ISO[nextDir],
        );
        if (newTexture) {
          vehicle.sprite.texture = newTexture;
          vehicle.sprite.texture.baseTexture.scaleMode =
            PIXI.SCALE_MODES.NEAREST;
          applyVehicleScale(vehicle.sprite, vehicle.vehicleData.config);
          vehicle.sprite.rotation = DIR_ROTATION[nextDir] || 0;
        }
      }
    } else if (!vehicle.stopped) {
      // Check if approaching a red intersection - stop before entering
      const nextTileX = Math.round(vehicle.targetX);
      const nextTileY = Math.round(vehicle.targetY);
      if (dist < 0.7 && isRedLight(vehicle.dir, nextTileX, nextTileY)) {
        vehicle.stopped = true;
      } else {
        // Move toward target with speed scaling (queuing)
        vehicle.effectiveSpeed = vehicle.speed * speedScale;
        const moveSpeed = vehicle.effectiveSpeed * delta * 0.03;
        vehicle.x += (dx / dist) * moveSpeed;
        vehicle.y += (dy / dist) * moveSpeed;
      }
    }

    // Update sprite position using lane offsets
    const iso = cartToIso(vehicle.x + vehicle.laneX, vehicle.y + vehicle.laneY);
    vehicle.sprite.x = iso.x;
    vehicle.sprite.y = iso.y + TILE_HEIGHT / 2;
    vehicle.sprite.zIndex =
      ((Math.round(vehicle.x) + Math.round(vehicle.y)) * GRID_SIZE + Math.round(vehicle.x)) * NUM_LAYERS + LAYER_VEHICLE;

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

  // Re-sort so vehicles render above roads at the same tile
  state.sceneLayer.sortChildren();
}

/**
 * Update traffic light graphic colors when phase changes
 */
function updateTrafficLightGraphics() {
  for (const tl of state.trafficLightGraphics) {
    if (!tl || !tl.graphics) continue;
    const g = tl.graphics;
    g.clear();
    drawTrafficLightDots(g, tl.x, tl.y, tl.connections);
  }
}

/**
 * Draw traffic light dots on a graphics object for an intersection
 */
export function drawTrafficLightDots(g, tileX, tileY, connections) {
  const iso = cartToIso(tileX + 0.5, tileY + 0.5);
  const cy = iso.y + TILE_HEIGHT / 2; // tile center in iso screen space
  const phase = state.trafficLightPhase;

  // N/S axis color: phase 0 = green, phase 1 = red
  const nsColor = phase === 0 ? 0x00ff00 : 0xff0000;
  // E/W axis color: phase 1 = green, phase 0 = red
  const ewColor = phase === 1 ? 0x00ff00 : 0xff0000;

  const r = 3;
  // Iso tile edge midpoints relative to tile center:
  // North (-y): top vertex      → dx=0,             dy=-TILE_HEIGHT/2
  // East  (+x): right vertex    → dx=+TILE_WIDTH/2, dy=0
  // South (+y): bottom vertex   → dx=0,             dy=+TILE_HEIGHT/2
  // West  (-x): left vertex     → dx=-TILE_WIDTH/2, dy=0
  // We place dots partway toward each edge (60% toward edge midpoint)
  const f = 0.6;
  const hw = TILE_WIDTH / 2 * f;
  const hh = TILE_HEIGHT / 2 * f;

  if (connections.north) {
    g.beginFill(nsColor, 0.9);
    g.drawCircle(iso.x + hw, cy - hh, r);
    g.endFill();
  }
  if (connections.south) {
    g.beginFill(nsColor, 0.9);
    g.drawCircle(iso.x - hw, cy + hh, r);
    g.endFill();
  }
  if (connections.east) {
    g.beginFill(ewColor, 0.9);
    g.drawCircle(iso.x + hw, cy + hh, r);
    g.endFill();
  }
  if (connections.west) {
    g.beginFill(ewColor, 0.9);
    g.drawCircle(iso.x - hw, cy - hh, r);
    g.endFill();
  }
}

/**
 * Find which vehicle (if any) was clicked at screen position.
 */
export function findClickedVehicle(globalPos) {
  for (const vehicle of state.animatedVehicles) {
    const bounds = vehicle.sprite.getBounds();
    if (
      globalPos.x >= bounds.x &&
      globalPos.x <= bounds.x + bounds.width &&
      globalPos.y >= bounds.y &&
      globalPos.y <= bounds.y + bounds.height
    ) {
      return vehicle;
    }
  }
  return null;
}

/**
 * Check if a click at screen position hits a vehicle, show debug if so.
 * Returns true if a vehicle was clicked.
 */
export function handleVehicleClick(globalPos) {
  const vehicle = findClickedVehicle(globalPos);
  if (vehicle) {
    showVehicleDebug(vehicle);
    return true;
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

  const zIndexInput = document.getElementById("vd-zindex");
  const widthInput = document.getElementById("vd-width");
  const heightInput = document.getElementById("vd-height");
  const rotationInput = document.getElementById("vd-rotation");
  const widthVal = document.getElementById("vd-width-val");
  const heightVal = document.getElementById("vd-height-val");
  const rotationVal = document.getElementById("vd-rotation-val");

  zIndexInput.value = vehicle.sprite.zIndex;
  widthInput.value = size.width;
  heightInput.value = size.height;
  widthVal.textContent = size.width;
  heightVal.textContent = size.height;

  const rotDeg = Math.round((vehicle.sprite.rotation * 180) / Math.PI);
  rotationInput.value = rotDeg;
  rotationVal.textContent = rotDeg + "\u00B0";

  // Remove old listeners by cloning
  const newZIndex = zIndexInput.cloneNode(true);
  const newWidth = widthInput.cloneNode(true);
  const newHeight = heightInput.cloneNode(true);
  const newRotation = rotationInput.cloneNode(true);
  zIndexInput.replaceWith(newZIndex);
  widthInput.replaceWith(newWidth);
  heightInput.replaceWith(newHeight);
  rotationInput.replaceWith(newRotation);

  newZIndex.addEventListener("input", () => {
    const v = parseInt(newZIndex.value);
    if (!isNaN(v)) vehicle.sprite.zIndex = v;
  });

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

  g.zIndex = ((x + y) * GRID_SIZE + x) * NUM_LAYERS + LAYER_VEHICLE;
  return g;
}
