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
  LAYER_ROAD,
  LAYER_VEHICLE,
} from "../config.js";
import { cartToIso } from "../utils.js";
import { updateSpriteConfig } from "../api.js";
import * as state from "../state.js";
import {
  getRoadAt,
  getValidDirections,
  getValidDirectionsFast,
  getConnectionCount,
  hasRoadAtFast,
} from "./roads.js";

// Default rotation (degrees) — used when vehicle config has no per-type rotation
const ISO_CORRECTION_DEG = 2;
const DEFAULT_ROTATION = { NE: ISO_CORRECTION_DEG, SE: -ISO_CORRECTION_DEG, SW: ISO_CORRECTION_DEG, NW: -ISO_CORRECTION_DEG };

/** Apply lane offset config to all vehicles of the same type (live preview) */
function applyLaneToAll(vehicleType, config) {
  for (const v of state.animatedVehicles) {
    if (v.vehicleType !== vehicleType) continue;
    const isoDir = CARDINAL_TO_ISO[v.dir];
    const off = config.laneOffsets?.[isoDir];
    if (off) {
      v.targetLaneX = off.dx;
      v.targetLaneY = off.dy;
    }
  }
}

/** Apply rotation config to all vehicles of the same type (live preview) */
function applyRotationToAll(vehicleType, config) {
  for (const v of state.animatedVehicles) {
    if (v.vehicleType !== vehicleType) continue;
    const isoDir = CARDINAL_TO_ISO[v.dir];
    const deg = config.rotation?.[isoDir] ?? DEFAULT_ROTATION[isoDir] ?? 0;
    v.sprite.rotation = (deg * Math.PI) / 180;
  }
}

/** Get lane offset {dx,dy} for a vehicle's cardinal direction from its per-type config */
function getVehicleLaneOffset(vehicle, cardinalDir) {
  const isoDir = CARDINAL_TO_ISO[cardinalDir];
  const cfg = vehicle.vehicleData.config;
  if (cfg.laneOffsets?.[isoDir]) return cfg.laneOffsets[isoDir];
  return LANE_OFFSETS[cardinalDir];
}

/** Get rotation in radians for a vehicle's cardinal direction from its per-type config */
function getVehicleRotation(vehicle, cardinalDir) {
  const isoDir = CARDINAL_TO_ISO[cardinalDir];
  const cfg = vehicle.vehicleData.config;
  const deg = cfg.rotation?.[isoDir] ?? DEFAULT_ROTATION[isoDir] ?? 0;
  return (deg * Math.PI) / 180;
}

/**
 * Compute vehicle z-index as the max of current tile and target tile.
 * This ensures the sprite gets the higher z-index as soon as it starts
 * moving toward a tile that is "in front" (closer to camera), preventing
 * the vehicle from rendering behind buildings on the next tile.
 */
function vehicleZIndex(vehicle) {
  const dir = DIR_VECTORS[vehicle.dir] || { dx: 0, dy: 0 };
  const margin = 0.3;
  // Look-ahead tile (0.3 tiles ahead in movement direction)
  const lx = Math.floor(vehicle.x + margin * dir.dx);
  const ly = Math.floor(vehicle.y + margin * dir.dy);
  // Actual tile the vehicle is on (prevents premature z-drop
  // when moving toward the camera / into shallower tiles)
  const ax = Math.floor(vehicle.x);
  const ay = Math.floor(vehicle.y);
  const actualZ = (ax + ay) * NUM_LAYERS + LAYER_VEHICLE;
  return actualZ;
  return Math.max(actualZ, lookZ, targetZ);
}

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
  // Only stop at tiles that actually have a traffic light placed
  const hasLight = state.trafficLightGraphics.some(
    (tl) => tl.x === tileX && tl.y === tileY,
  );
  if (!hasLight) return false;

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

  // Lane offset for initial direction (per-type from config)
  const isoDir = CARDINAL_TO_ISO[dir];
  const laneOff = vehicleData.config.laneOffsets?.[isoDir] || LANE_OFFSETS[dir];
  const spawnX = parcel.x + 0.5 + laneOff.dx;
  const spawnY = parcel.y + 0.5 + laneOff.dy;

  // Skip spawn if another vehicle is too close
  if (isSpawnBlocked(spawnX, spawnY)) return;

  // Rotation from per-type config (degrees → radians)
  const rotDeg = vehicleData.config.rotation?.[isoDir] ?? DEFAULT_ROTATION[isoDir] ?? 0;

  const sprite = new PIXI.Sprite(texture);
  sprite.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  sprite.anchor.set(0.5, 1);
  applyVehicleScale(sprite, vehicleData.config);
  sprite.rotation = (rotDeg * Math.PI) / 180;

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
  sprite.zIndex = vehicleZIndex(vehicle);

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

    // Force stop override from debug panel
    if (vehicle.forceStop) {
      vehicle.stopped = true;
      // Still update sprite position but skip all movement
      const iso = cartToIso(
        vehicle.x + vehicle.laneX,
        vehicle.y + vehicle.laneY,
      );
      vehicle.sprite.x = iso.x;
      vehicle.sprite.y = iso.y + TILE_HEIGHT / 2;
      if (!vehicle.zIndexLocked) {
        vehicle.sprite.zIndex = vehicleZIndex(vehicle);
      }
      continue;
    }

    // Check for vehicle ahead (queuing) — only fully stop if it's at a red light
    const ahead = getVehicleAhead(vehicle, animatedVehicles);
    let speedScale = 1.0;
    if (ahead) {
      const adx = ahead.x - vehicle.x;
      const ady = ahead.y - vehicle.y;
      const aheadDist = Math.sqrt(adx * adx + ady * ady);
      // Only queue behind a vehicle that is stopped at a traffic light
      if (ahead.stoppedAtLight && aheadDist < FOLLOW_DISTANCE * 0.5) {
        speedScale = 0;
        vehicle.stopped = true;
        vehicle.stoppedAtLight = true; // propagate: we're also queued at a light
      } else if (aheadDist < FOLLOW_DISTANCE * 0.3) {
        // Too close — slow down to avoid overlap, but don't fully stop
        speedScale = Math.max(0.15, aheadDist / (FOLLOW_DISTANCE * 0.3));
        vehicle.stopped = false;
        vehicle.stoppedAtLight = false;
      } else {
        vehicle.stopped = false;
        vehicle.stoppedAtLight = false;
      }
    } else {
      vehicle.stopped = false;
      vehicle.stoppedAtLight = false;
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
        vehicle.stoppedAtLight = true;
        vehicle.targetX = currentX;
        vehicle.targetY = currentY;
      } else {
        vehicle.dir = nextDir;
        vehicle.targetX = currentX + DIR_VECTORS[nextDir].dx;
        vehicle.targetY = currentY + DIR_VECTORS[nextDir].dy;
        vehicle.stopped = false;
        vehicle.stoppedAtLight = false;

        // Update lane offset for new direction (per-type)
        const laneOff = getVehicleLaneOffset(vehicle, nextDir);
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
          vehicle.sprite.rotation = getVehicleRotation(vehicle, nextDir);
        }
      }
    } else if (!vehicle.stopped) {
      // Check if approaching a red intersection - stop before entering
      const nextTileX = Math.round(vehicle.targetX);
      const nextTileY = Math.round(vehicle.targetY);
      if (dist < 0.7 && isRedLight(vehicle.dir, nextTileX, nextTileY)) {
        vehicle.stopped = true;
        vehicle.stoppedAtLight = true;
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
    if (!vehicle.zIndexLocked) {
      vehicle.sprite.zIndex = vehicleZIndex(vehicle);
    }

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
  const hw = (TILE_WIDTH / 2) * f;
  const hh = (TILE_HEIGHT / 2) * f;

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
// Currently inspected vehicle (for live updates)
let debugVehicle = null;
let debugTickerId = null;

function showVehicleDebug(vehicle) {
  const panel = document.getElementById("admin-panel");
  if (!panel) return;

  debugVehicle = vehicle;

  const config = vehicle.vehicleData.config;
  const size = config.size || { width: 24, height: 24 };

  // Show vehicle content, hide placeholder
  const noSel = document.getElementById("vd-no-selection");
  const content = document.getElementById("vd-content");
  if (noSel) noSel.style.display = "none";
  if (content) content.style.display = "block";

  document.getElementById("vd-type").textContent = vehicle.vehicleType;

  // --- Clone all interactive inputs to remove old listeners ---
  const cloneIds = [
    "vd-zindex", "vd-zindex-lock", "vd-force-stop",
    "vd-width", "vd-height", "vd-save",
  ];
  const ISO_DIRS = ["NE", "SE", "SW", "NW"];
  for (const d of ISO_DIRS) {
    cloneIds.push(`vd-lo-${d}-dx`, `vd-lo-${d}-dy`, `vd-lo-${d}-rot`);
  }
  for (const id of cloneIds) {
    const el = document.getElementById(id);
    if (el) {
      const clone = el.cloneNode(true);
      el.replaceWith(clone);
    }
  }

  // Ensure config has per-type laneOffsets and rotation objects
  if (!config.laneOffsets) config.laneOffsets = {};
  if (!config.rotation) config.rotation = {};
  for (const d of ISO_DIRS) {
    if (!config.laneOffsets[d]) config.laneOffsets[d] = { dx: 0, dy: 0 };
    if (config.rotation[d] === undefined) config.rotation[d] = DEFAULT_ROTATION[d] || 0;
  }

  // --- Populate static fields ---
  const zIndexInput = document.getElementById("vd-zindex");
  const zIndexLock = document.getElementById("vd-zindex-lock");
  const forceStop = document.getElementById("vd-force-stop");
  const widthInput = document.getElementById("vd-width");
  const heightInput = document.getElementById("vd-height");
  const widthVal = document.getElementById("vd-width-val");
  const heightVal = document.getElementById("vd-height-val");

  zIndexInput.value = vehicle.sprite.zIndex;
  zIndexLock.checked = !!vehicle.zIndexLocked;
  document.getElementById("vd-zindex-lock-label").textContent =
    vehicle.zIndexLocked ? "locked" : "auto";
  forceStop.checked = !!vehicle.forceStop;
  document.getElementById("vd-force-stop-label").textContent = vehicle.forceStop
    ? "forced"
    : "off";
  widthInput.value = size.width;
  heightInput.value = size.height;
  widthVal.textContent = size.width;
  heightVal.textContent = size.height;

  // --- Populate and wire lane offset / rotation grid ---
  for (const d of ISO_DIRS) {
    const dxEl = document.getElementById(`vd-lo-${d}-dx`);
    const dyEl = document.getElementById(`vd-lo-${d}-dy`);
    const rotEl = document.getElementById(`vd-lo-${d}-rot`);
    dxEl.value = config.laneOffsets[d].dx;
    dyEl.value = config.laneOffsets[d].dy;
    rotEl.value = config.rotation[d];

    // When changed, update config and apply to all vehicles of this type
    dxEl.addEventListener("input", () => {
      config.laneOffsets[d].dx = parseFloat(dxEl.value) || 0;
      applyLaneToAll(vehicle.vehicleType, config);
    });
    dyEl.addEventListener("input", () => {
      config.laneOffsets[d].dy = parseFloat(dyEl.value) || 0;
      applyLaneToAll(vehicle.vehicleType, config);
    });
    rotEl.addEventListener("input", () => {
      config.rotation[d] = parseFloat(rotEl.value) || 0;
      applyRotationToAll(vehicle.vehicleType, config);
    });
  }

  // --- Event listeners ---

  // Z-Index
  zIndexInput.addEventListener("input", () => {
    const v = parseInt(zIndexInput.value);
    if (!isNaN(v)) {
      vehicle.zIndexLocked = true;
      zIndexLock.checked = true;
      document.getElementById("vd-zindex-lock-label").textContent = "locked";
      vehicle.sprite.zIndex = v;
    }
  });
  zIndexLock.addEventListener("change", () => {
    vehicle.zIndexLocked = zIndexLock.checked;
    document.getElementById("vd-zindex-lock-label").textContent =
      zIndexLock.checked ? "locked" : "auto";
  });

  // Force stop
  forceStop.addEventListener("change", () => {
    vehicle.forceStop = forceStop.checked;
    document.getElementById("vd-force-stop-label").textContent =
      forceStop.checked ? "forced" : "off";
  });

  // Size
  widthInput.addEventListener("input", () => {
    const v = parseInt(widthInput.value);
    widthVal.textContent = v;
    config.size.width = v;
    for (const av of state.animatedVehicles) {
      if (av.vehicleType === vehicle.vehicleType) {
        applyVehicleScale(av.sprite, config);
      }
    }
  });
  heightInput.addEventListener("input", () => {
    const v = parseInt(heightInput.value);
    heightVal.textContent = v;
    config.size.height = v;
    for (const av of state.animatedVehicles) {
      if (av.vehicleType === vehicle.vehicleType) {
        applyVehicleScale(av.sprite, config);
      }
    }
  });

  // Save button
  document.getElementById("vd-save").addEventListener("click", async () => {
    const statusEl = document.getElementById("vd-save-status");
    statusEl.textContent = "Saving...";
    statusEl.style.color = "#4ecdc4";
    try {
      const updates = {
        size: config.size,
        laneOffsets: config.laneOffsets,
        rotation: config.rotation,
      };
      await updateSpriteConfig({ source: "vehicles", category: vehicle.vehicleType, index: null, updates });
      statusEl.textContent = "Saved!";
      statusEl.style.color = "#2ecc71";
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.style.color = "#ff6b6b";
    }
  });

  // --- Live update ticker (updates read-only fields each frame) ---
  if (debugTickerId) cancelAnimationFrame(debugTickerId);
  function tick() {
    if (debugVehicle !== vehicle) return; // another vehicle selected
    if (!state.animatedVehicles.includes(vehicle)) {
      // Vehicle was removed
      document.getElementById("vd-status").textContent = "despawned";
      document.getElementById("vd-status").style.color = "#ff6b6b";
      debugVehicle = null;
      return;
    }
    // Position & direction
    document.getElementById("vd-position").textContent =
      "(" + vehicle.x.toFixed(1) + ", " + vehicle.y.toFixed(1) + ")";
    document.getElementById("vd-target").textContent =
      "(" + vehicle.targetX + ", " + vehicle.targetY + ") " + vehicle.dir;
    document.getElementById("vd-direction").textContent =
      vehicle.dir + " → " + CARDINAL_TO_ISO[vehicle.dir];
    // Status
    const statusEl = document.getElementById("vd-status");
    if (vehicle.forceStop) {
      statusEl.textContent = "force-stopped";
      statusEl.style.color = "#e74c3c";
    } else if (vehicle.stopped) {
      statusEl.textContent = "stopped";
      statusEl.style.color = "#f39c12";
    } else {
      statusEl.textContent = "moving";
      statusEl.style.color = "#2ecc71";
    }
    // Z-index (update if not focused and not locked)
    const zi = document.getElementById("vd-zindex");
    if (zi && document.activeElement !== zi && !vehicle.zIndexLocked) {
      zi.value = vehicle.sprite.zIndex;
    }
    // Texture size (can change with direction)
    document.getElementById("vd-texture-size").textContent =
      vehicle.sprite.texture.width + "x" + vehicle.sprite.texture.height;

    debugTickerId = requestAnimationFrame(tick);
  }
  debugTickerId = requestAnimationFrame(tick);

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

  g.zIndex = (x + y) * NUM_LAYERS + LAYER_VEHICLE;
  return g;
}
