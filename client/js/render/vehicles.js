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
import { createGlowTexture, getLightingContainer } from "./lighting.js";

// Traffic light sprite textures (loaded once)
const trafficLightTextures = {};
let trafficLightTexturesLoaded = false;

// Direction → sprite file mapping
// Light is on the right side of the road, before the intersection
// north connection → NW corner (top), south → SE corner (bottom)
// east → NE corner (right), west → SW corner (left)
const TRAFFIC_LIGHT_DIR_MAP = {
  north: "traffic_light_SW",
  south: "traffic_light_NE",
  east: "traffic_light_NW",
  west: "traffic_light_SE",
};

// Traffic light sprite scale (target ~16px tall from original)
const TRAFFIC_LIGHT_SCALE = 0.18;

// Default rotation (degrees) — used when vehicle config has no per-type rotation
const ISO_CORRECTION_DEG = 2;
const DEFAULT_ROTATION = {
  NE: ISO_CORRECTION_DEG,
  SE: -ISO_CORRECTION_DEG,
  SW: ISO_CORRECTION_DEG,
  NW: -ISO_CORRECTION_DEG,
};

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
 * Compute vehicle z-index from screen Y position.
 * Scale screen Y to match tile-based z-index range
 * (NUM_LAYERS per TILE_HEIGHT/2 pixels of depth).
 */
function vehicleZIndex(vehicle) {
  return Math.round((vehicle.sprite.y / (TILE_HEIGHT / 2)) * NUM_LAYERS);
}

function applyVehicleScale(sprite, config) {
  const size = config.size || { width: 24, height: 24 };
  sprite.scale.set(
    size.width / sprite.texture.width,
    size.height / sprite.texture.height,
  );
}

// Default headlight offsets per iso direction (fallback when not in sprites.json)
// dx/dy = center offset from sprite position, sx/sy = spread (L at -sx/+sy, R at +sx/-sy)
const DEFAULT_HEADLIGHT_OFFSETS = {
  NE: { dx: -2, dy: -12, sx: 3, sy: 0 },
  SW: { dx: 2, dy: -4, sx: 3, sy: 0 },
  SE: { dx: 2, dy: -12, sx: 1, sy: 2 },
  NW: { dx: -2, dy: -4, sx: 1, sy: 2 },
};

const HEADLIGHT_SIZE = 18;
const HEADLIGHT_TINT = 0xffdd88;

/**
 * Create two headlight glow sprites for a vehicle in the lighting container.
 */
function createHeadlights(vehicle) {
  const container = getLightingContainer();
  if (!container) return;

  const tex = createGlowTexture(32);

  const headlightL = new PIXI.Sprite(tex);
  headlightL.anchor.set(0.5);
  headlightL.width = HEADLIGHT_SIZE;
  headlightL.height = HEADLIGHT_SIZE;
  headlightL.tint = HEADLIGHT_TINT;
  headlightL.alpha = 0;
  headlightL.blendMode = PIXI.BLEND_MODES.ADD;

  const headlightR = new PIXI.Sprite(tex);
  headlightR.anchor.set(0.5);
  headlightR.width = HEADLIGHT_SIZE;
  headlightR.height = HEADLIGHT_SIZE;
  headlightR.tint = HEADLIGHT_TINT;
  headlightR.alpha = 0;
  headlightR.blendMode = PIXI.BLEND_MODES.ADD;

  container.addChild(headlightL);
  container.addChild(headlightR);

  vehicle.headlightL = headlightL;
  vehicle.headlightR = headlightR;
}

/**
 * Update headlight positions based on vehicle screen position and direction.
 * Reads per-type offsets from vehicle config, falls back to defaults.
 */
function updateHeadlightPositions(vehicle) {
  if (!vehicle.headlightL || !vehicle.headlightR) return;

  const isoDir = CARDINAL_TO_ISO[vehicle.dir];
  const hlCfg = vehicle.vehicleData.config.headlightOffsets;
  const off = hlCfg?.[isoDir] || DEFAULT_HEADLIGHT_OFFSETS[isoDir];
  if (!off) return;

  const sprX = vehicle.sprite.x;
  const sprY = vehicle.sprite.y;

  vehicle.headlightL.x = sprX + off.dx - (off.sx || 0);
  vehicle.headlightL.y = sprY + off.dy + (off.sy || 0);
  vehicle.headlightR.x = sprX + off.dx + (off.sx || 0);
  vehicle.headlightR.y = sprY + off.dy - (off.sy || 0);
}

/**
 * Remove headlight sprites from the lighting container.
 */
function removeHeadlights(vehicle) {
  if (vehicle.headlightL) {
    vehicle.headlightL.parent?.removeChild(vehicle.headlightL);
    vehicle.headlightL = null;
  }
  if (vehicle.headlightR) {
    vehicle.headlightR.parent?.removeChild(vehicle.headlightR);
    vehicle.headlightR = null;
  }
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

    // Only consider vehicles heading in the same direction
    if (other.dir !== vehicle.dir) continue;

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
    if (dx * dx + dy * dy < 0.64) return true; // 0.8^2
  }
  return false;
}

/**
 * Load traffic light sprite textures
 */
export async function loadTrafficLightTextures() {
  if (trafficLightTexturesLoaded) return;
  const names = [
    "traffic_light_NE",
    "traffic_light_NW",
    "traffic_light_SE",
    "traffic_light_SW",
  ];
  await Promise.all(
    names.map((name) =>
      PIXI.Assets.load(`/sprites/roads/${name}.png`)
        .then((tex) => {
          tex.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
          trafficLightTextures[name] = tex;
        })
        .catch((err) => console.warn(`[Traffic] Failed to load ${name}:`, err)),
    ),
  );
  trafficLightTexturesLoaded = true;
  console.log("[Traffic] Loaded traffic light textures");
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
 * Find the building with the highest garbageLevel that has an adjacent road tile.
 */
function findGarbageTarget(excludeIds) {
  const { buildings, parcels } = state;
  let best = null;
  let bestLevel = 0;
  for (const b of buildings) {
    if (excludeIds && excludeIds.has(b.id)) continue;
    const gl = b.garbageLevel || 0;
    if (gl <= 0 || gl <= bestLevel) continue;
    const p = parcels.find((pp) => pp.id === b.parcelId);
    if (!p) continue;
    const fw = b.width || 1,
      fh = b.height || 1;
    let hasRoad = false;
    for (let dx = 0; dx < fw && !hasRoad; dx++) {
      if (hasRoadAtFast(p.x + dx, p.y - 1)) hasRoad = true;
      if (hasRoadAtFast(p.x + dx, p.y + fh)) hasRoad = true;
    }
    for (let dy = 0; dy < fh && !hasRoad; dy++) {
      if (hasRoadAtFast(p.x - 1, p.y + dy)) hasRoad = true;
      if (hasRoadAtFast(p.x + fw, p.y + dy)) hasRoad = true;
    }
    if (hasRoad) {
      best = { id: b.id, name: b.name, x: p.x, y: p.y, garbageLevel: gl };
      bestLevel = gl;
    }
  }
  return best;
}

/**
 * Find a road tile adjacent to a garbage_depot building for spawning.
 */
function findDepotSpawnRoad() {
  const { buildings, parcels } = state;
  const depots = buildings.filter((b) => b.type === "garbage_depot");
  if (depots.length === 0) return null;
  const depot = depots[Math.floor(Math.random() * depots.length)];
  const p = parcels.find((pp) => pp.id === depot.parcelId);
  if (!p) return null;
  const fw = depot.width || 1,
    fh = depot.height || 1;
  const adjRoads = [];
  for (let dx = 0; dx < fw; dx++) {
    if (hasRoadAtFast(p.x + dx, p.y - 1))
      adjRoads.push({ x: p.x + dx, y: p.y - 1 });
    if (hasRoadAtFast(p.x + dx, p.y + fh))
      adjRoads.push({ x: p.x + dx, y: p.y + fh });
  }
  for (let dy = 0; dy < fh; dy++) {
    if (hasRoadAtFast(p.x - 1, p.y + dy))
      adjRoads.push({ x: p.x - 1, y: p.y + dy });
    if (hasRoadAtFast(p.x + fw, p.y + dy))
      adjRoads.push({ x: p.x + fw, y: p.y + dy });
  }
  if (adjRoads.length === 0) return null;
  return {
    road: adjRoads[Math.floor(Math.random() * adjRoads.length)],
    depot: { x: p.x, y: p.y },
  };
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
  const hasGarbageDepot = buildings.some((b) => b.type === "garbage_depot");
  const allowed = vehicleTypes.filter((t) => {
    if (t === "police" && !hasPolice) return false;
    if (t === "ambulance" && !hasHospital) return false;
    if (t === "garbage_truck" && !hasGarbageDepot) return false;
    return true;
  });
  if (allowed.length === 0) return;

  // Pick random vehicle type
  const vehicleType = allowed[Math.floor(Math.random() * allowed.length)];
  const vehicleData = vehicleSprites.get(vehicleType);
  if (!vehicleData) return;

  // For garbage trucks, override spawn location to depot road and assign target
  let spawnParcel = parcel;
  let targetBuilding = null;
  let depotLocation = null;
  if (vehicleType === "garbage_truck") {
    const depotResult = findDepotSpawnRoad();
    if (depotResult) {
      spawnParcel = depotResult.road;
      depotLocation = depotResult.depot;
    }
    targetBuilding = findGarbageTarget();
  }

  // Pick initial direction
  const validDirs = getValidDirections(spawnParcel.x, spawnParcel.y);
  if (validDirs.length === 0) return;

  const dir = validDirs[Math.floor(Math.random() * validDirs.length)];
  const texture = vehicleData.directions.get(CARDINAL_TO_ISO[dir]);
  if (!texture) return;

  // Lane offset for initial direction (per-type from config)
  const isoDir = CARDINAL_TO_ISO[dir];
  const laneOff = vehicleData.config.laneOffsets?.[isoDir] || LANE_OFFSETS[dir];
  const spawnX = spawnParcel.x + 0.5 + laneOff.dx;
  const spawnY = spawnParcel.y + 0.5 + laneOff.dy;

  // Skip spawn if another vehicle is too close
  if (isSpawnBlocked(spawnX, spawnY)) return;

  // Rotation from per-type config (degrees → radians)
  const rotDeg =
    vehicleData.config.rotation?.[isoDir] ?? DEFAULT_ROTATION[isoDir] ?? 0;

  const sprite = new PIXI.Sprite(texture);
  sprite.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  sprite.anchor.set(0.5, 1);
  applyVehicleScale(sprite, vehicleData.config);
  sprite.rotation = (rotDeg * Math.PI) / 180;

  const vehicle = {
    x: spawnParcel.x + 0.5,
    y: spawnParcel.y + 0.5,
    targetX: spawnParcel.x + DIR_VECTORS[dir].dx,
    targetY: spawnParcel.y + DIR_VECTORS[dir].dy,
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
    // Garbage truck targeting
    targetBuilding: targetBuilding,
    // Garbage truck capacity / multi-stop
    garbageLoad: 0,
    garbageCapacity: 100,
    collectHistory: [],
    depotLocation: depotLocation,
    returning: false,
    collectedIds: new Set(),
  };

  const iso = cartToIso(vehicle.x + vehicle.laneX, vehicle.y + vehicle.laneY);
  sprite.x = iso.x;
  sprite.y = iso.y + TILE_HEIGHT / 2;
  sprite.zIndex = vehicleZIndex(vehicle);

  // Add directly to worldContainer for proper z-sorting with buildings
  state.sceneLayer.addChild(sprite);
  animatedVehicles.push(vehicle);

  // Create headlight glow sprites in the lighting container
  createHeadlights(vehicle);
  updateHeadlightPositions(vehicle);
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
    const newPhase = state.trafficLightPhase === 0 ? 1 : 0;
    state.setTrafficLightPhase(newPhase);
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
      updateHeadlightPositions(vehicle);
      continue;
    }

    // Check for vehicle ahead (queuing)
    const ahead = getVehicleAhead(vehicle, animatedVehicles);
    let speedScale = 1.0;
    const MIN_GAP = 0.55; // minimum gap before full stop (tiles)
    if (ahead) {
      const adx = ahead.x - vehicle.x;
      const ady = ahead.y - vehicle.y;
      const aheadDist = Math.sqrt(adx * adx + ady * ady);

      if (aheadDist < MIN_GAP) {
        // Too close — full stop to prevent overlap
        speedScale = 0;
        vehicle.stopped = true;
        vehicle.stoppedAtLight = ahead.stoppedAtLight; // propagate light status
      } else if (aheadDist < FOLLOW_DISTANCE) {
        // Within follow range — smooth deceleration proportional to gap
        const t = (aheadDist - MIN_GAP) / (FOLLOW_DISTANCE - MIN_GAP);
        speedScale = Math.max(0.1, t);
        // Match ahead vehicle speed if it's slower
        if (
          ahead.effectiveSpeed !== undefined &&
          ahead.effectiveSpeed < vehicle.speed * speedScale
        ) {
          speedScale = ahead.effectiveSpeed / vehicle.speed;
        }
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
        removeHeadlights(vehicle);
        state.sceneLayer.removeChild(vehicle.sprite);
        animatedVehicles.splice(i, 1);
        continue;
      }

      // Garbage truck arrival logic
      if (vehicle.vehicleType === "garbage_truck" && vehicle.targetBuilding) {
        const tb = vehicle.targetBuilding;
        if (Math.abs(currentX - tb.x) <= 1 && Math.abs(currentY - tb.y) <= 1) {
          if (vehicle.returning) {
            // Arrived back at depot — despawn
            removeHeadlights(vehicle);
            state.sceneLayer.removeChild(vehicle.sprite);
            animatedVehicles.splice(i, 1);
            continue;
          }
          // Arrived at a garbage building — collect
          const collected = Math.min(
            tb.garbageLevel || 0,
            vehicle.garbageCapacity - vehicle.garbageLoad,
          );
          vehicle.garbageLoad += collected;
          vehicle.collectedIds.add(tb.id);
          vehicle.collectHistory.push(tb.name);

          if (vehicle.garbageLoad >= vehicle.garbageCapacity) {
            // Full — return to depot
            vehicle.returning = true;
            vehicle.targetBuilding = vehicle.depotLocation
              ? { ...vehicle.depotLocation, name: "Depot" }
              : null;
          } else {
            // Find next dirty building (skip already collected)
            const next = findGarbageTarget(vehicle.collectedIds);
            if (next) {
              vehicle.targetBuilding = next;
            } else {
              // No more dirty buildings — return to depot
              vehicle.returning = true;
              vehicle.targetBuilding = vehicle.depotLocation
                ? { ...vehicle.depotLocation, name: "Depot" }
                : null;
            }
          }
          // If no depot to return to, just despawn
          if (!vehicle.targetBuilding) {
            removeHeadlights(vehicle);
            state.sceneLayer.removeChild(vehicle.sprite);
            animatedVehicles.splice(i, 1);
            continue;
          }
        }
      }

      const validDirs = (
        hasCachedRoads
          ? getValidDirectionsFast(currentX, currentY)
          : getValidDirections(currentX, currentY)
      ).filter((d) => d !== OPPOSITE_DIR[vehicle.dir]);

      if (validDirs.length === 0) {
        removeHeadlights(vehicle);
        state.sceneLayer.removeChild(vehicle.sprite);
        animatedVehicles.splice(i, 1);
        continue;
      }

      // For garbage trucks with a target, pick direction closest to target
      let nextDir;
      if (vehicle.vehicleType === "garbage_truck" && vehicle.targetBuilding) {
        const tb = vehicle.targetBuilding;
        let bestDir = null;
        let bestDist = Infinity;
        for (const d of validDirs) {
          const nx = currentX + DIR_VECTORS[d].dx;
          const ny = currentY + DIR_VECTORS[d].dy;
          const dist = Math.abs(nx - tb.x) + Math.abs(ny - tb.y);
          if (dist < bestDist) {
            bestDist = dist;
            bestDir = d;
          }
        }
        nextDir = bestDir || validDirs[0];
      } else {
        // Default: continue straight if possible, else random
        nextDir = validDirs.includes(vehicle.dir)
          ? vehicle.dir
          : validDirs[Math.floor(Math.random() * validDirs.length)];
      }

      // Check traffic light: is the next tile a red intersection?
      const nextTileX = currentX + DIR_VECTORS[nextDir].dx;
      const nextTileY = currentY + DIR_VECTORS[nextDir].dy;
      // Update direction, lane offset, and sprite for the chosen direction
      vehicle.dir = nextDir;
      const laneOff = getVehicleLaneOffset(vehicle, nextDir);
      vehicle.targetLaneX = laneOff.dx;
      vehicle.targetLaneY = laneOff.dy;
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

      if (isRedLight(nextDir, nextTileX, nextTileY)) {
        // Stay at tile center - keep target at current tile so we re-check next frame
        vehicle.stopped = true;
        vehicle.stoppedAtLight = true;
        vehicle.targetX = currentX;
        vehicle.targetY = currentY;
      } else {
        vehicle.targetX = currentX + DIR_VECTORS[nextDir].dx;
        vehicle.targetY = currentY + DIR_VECTORS[nextDir].dy;
        vehicle.stopped = false;
        vehicle.stoppedAtLight = false;
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
    updateHeadlightPositions(vehicle);

    // Remove if out of bounds
    if (
      vehicle.x < 0 ||
      vehicle.x >= GRID_SIZE ||
      vehicle.y < 0 ||
      vehicle.y >= GRID_SIZE
    ) {
      removeHeadlights(vehicle);
      state.sceneLayer.removeChild(vehicle.sprite);
      animatedVehicles.splice(i, 1);
    }
  }

  // Re-sort so vehicles render above roads at the same tile
  state.sceneLayer.sortChildren();
}

/**
 * Animate traffic light glows — update tint and Y position per phase.
 * Red bulb is higher on the pole, green is lower.
 */
const GLOW_BULB_SHIFT = 28; // green bulb offset (lower on pole)

export function animateTrafficGlowLights() {
  const phase = state.trafficLightPhase;
  for (const tl of state.trafficLightGraphics) {
    if (!tl || !tl.sprites) continue;
    for (const s of tl.sprites) {
      if (!s.glow) continue;
      const isGreen = s.axis === "ns" ? phase === 0 : phase === 1;
      const bulbShift = isGreen ? GLOW_BULB_SHIFT : 0;
      s.glow.tint = isGreen ? 0x00ff44 : 0xff2200;
      s.glow.y = s.glowBaseY + (s.glowOffY + bulbShift) * TRAFFIC_LIGHT_SCALE;
    }
  }
}

// Cached glow texture for traffic lights
let tlGlowTexture = null;

function createTLGlowTexture() {
  if (tlGlowTexture) return tlGlowTexture;
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.7)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.3)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tlGlowTexture = PIXI.Texture.from(canvas);
  return tlGlowTexture;
}

// Front-facing directions (lights visible to camera)
const FRONT_FACING = { traffic_light_NE: true, traffic_light_NW: true };

// Glow offset relative to sprite anchor (0.5, 1) — approximate bulb position
const GLOW_OFFSETS = {
  traffic_light_SE: { x: -22, y: -120 },
  traffic_light_SW: { x: 22, y: -120 },
  traffic_light_NE: { x: -22, y: -120 },
  traffic_light_NW: { x: 22, y: -120 },
};

/**
 * Create traffic light sprites for an intersection and add to container.
 * All lights get a colored glow. FRONT_FACING controls glow z-index ordering.
 */
export function createTrafficLightSprites(
  container,
  tileX,
  tileY,
  connections,
) {
  const iso = cartToIso(tileX + 0.5, tileY + 0.5);
  const off = state.trafficLightOffsets;

  // Iso corner positions (diamond vertices) + per-direction offset
  const hw = TILE_WIDTH / 2;
  const hh = TILE_HEIGHT / 2;

  // Right side of the road, before the intersection (approach side)
  // north → top, south → bottom, east → right, west → left
  const positions = {
    north: {
      px: iso.x + off.north.x,
      py: iso.y - hh + off.north.y,
      axis: "ns",
    },
    south: {
      px: iso.x + off.south.x,
      py: iso.y + hh + off.south.y,
      axis: "ns",
    },
    east: {
      px: iso.x + hw + off.east.x,
      py: iso.y + off.east.y,
      axis: "ew",
    },
    west: {
      px: iso.x - hw + off.west.x,
      py: iso.y + off.west.y,
      axis: "ew",
    },
  };

  const phase = state.trafficLightPhase;
  const sprites = [];

  for (const [dir, connected] of Object.entries(connections)) {
    if (!connected) continue;
    const texName = TRAFFIC_LIGHT_DIR_MAP[dir];
    const tex = trafficLightTextures[texName];
    if (!tex) continue;

    const pos = positions[dir];
    const sprite = new PIXI.Sprite(tex);
    sprite.anchor.set(0.5, 1);
    sprite.x = pos.px;
    sprite.y = pos.py;
    sprite.scale.set(TRAFFIC_LIGHT_SCALE);
    sprite.zIndex = Math.round((pos.py / (TILE_HEIGHT / 2)) * NUM_LAYERS);
    container.addChild(sprite);

    // Create glow sprite (tint + Y position set by animateTrafficGlowLights)
    const glowTex = createTLGlowTexture();
    const glow = new PIXI.Sprite(glowTex);
    glow.anchor.set(0.5);
    const glowOff = GLOW_OFFSETS[texName] || { x: 0, y: -15 };
    glow.x = pos.px + glowOff.x * TRAFFIC_LIGHT_SCALE;
    glow.y = pos.py + glowOff.y * TRAFFIC_LIGHT_SCALE;
    glow.width = 8;
    glow.height = 8;
    glow.alpha = 0.8;
    glow.zIndex = Math.round((glow.y / (TILE_HEIGHT / 2)) * NUM_LAYERS) - (FRONT_FACING[texName] ? 1 : 0);
    container.addChild(glow);

    sprites.push({
      sprite,
      axis: pos.axis,
      glow,
      dir: texName,
      glowBaseY: pos.py,
      glowOffY: glowOff.y,
    });
  }

  return sprites;
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

  // Show/hide garbage truck rows
  const targetRow = document.getElementById("vd-garbage-target-row");
  if (targetRow) {
    targetRow.style.display = vehicle.vehicleType === "garbage_truck" ? "" : "none";
  }
  const loadRow = document.getElementById("vd-garbage-load-row");
  if (loadRow) {
    loadRow.style.display = vehicle.vehicleType === "garbage_truck" ? "" : "none";
  }

  // --- Clone all interactive inputs to remove old listeners ---
  const cloneIds = [
    "vd-zindex",
    "vd-zindex-lock",
    "vd-force-stop",
    "vd-width",
    "vd-height",
    "vd-save",
  ];
  const ISO_DIRS = ["NE", "SE", "SW", "NW"];
  for (const d of ISO_DIRS) {
    cloneIds.push(`vd-lo-${d}-dx`, `vd-lo-${d}-dy`, `vd-lo-${d}-rot`);
    cloneIds.push(`vd-hl-${d}-dx`, `vd-hl-${d}-dy`, `vd-hl-${d}-sx`, `vd-hl-${d}-sy`);
  }
  for (const id of cloneIds) {
    const el = document.getElementById(id);
    if (el) {
      const clone = el.cloneNode(true);
      el.replaceWith(clone);
    }
  }

  // Ensure config has per-type laneOffsets, rotation, and headlightOffsets objects
  if (!config.laneOffsets) config.laneOffsets = {};
  if (!config.rotation) config.rotation = {};
  if (!config.headlightOffsets) config.headlightOffsets = {};
  for (const d of ISO_DIRS) {
    if (!config.laneOffsets[d]) config.laneOffsets[d] = { dx: 0, dy: 0 };
    if (config.rotation[d] === undefined)
      config.rotation[d] = DEFAULT_ROTATION[d] || 0;
    if (!config.headlightOffsets[d])
      config.headlightOffsets[d] = { ...DEFAULT_HEADLIGHT_OFFSETS[d] };
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

  // --- Populate and wire headlight offset grid ---
  for (const d of ISO_DIRS) {
    const hlDx = document.getElementById(`vd-hl-${d}-dx`);
    const hlDy = document.getElementById(`vd-hl-${d}-dy`);
    const hlSx = document.getElementById(`vd-hl-${d}-sx`);
    const hlSy = document.getElementById(`vd-hl-${d}-sy`);
    hlDx.value = config.headlightOffsets[d].dx;
    hlDy.value = config.headlightOffsets[d].dy;
    hlSx.value = config.headlightOffsets[d].sx;
    hlSy.value = config.headlightOffsets[d].sy;

    hlDx.addEventListener("input", () => {
      config.headlightOffsets[d].dx = parseFloat(hlDx.value) || 0;
    });
    hlDy.addEventListener("input", () => {
      config.headlightOffsets[d].dy = parseFloat(hlDy.value) || 0;
    });
    hlSx.addEventListener("input", () => {
      config.headlightOffsets[d].sx = parseFloat(hlSx.value) || 0;
    });
    hlSy.addEventListener("input", () => {
      config.headlightOffsets[d].sy = parseFloat(hlSy.value) || 0;
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
        headlightOffsets: config.headlightOffsets,
      };
      await updateSpriteConfig({
        source: "vehicles",
        category: vehicle.vehicleType,
        index: null,
        updates,
      });
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
    // Garbage target
    const targetEl = document.getElementById("vd-garbage-target");
    if (targetEl && vehicle.targetBuilding) {
      if (vehicle.returning) {
        targetEl.textContent = `Returning to depot (${vehicle.targetBuilding.x},${vehicle.targetBuilding.y})`;
        targetEl.style.color = "#4ecdc4";
      } else {
        const tb = vehicle.targetBuilding;
        targetEl.textContent = `${tb.name} (${tb.x},${tb.y}) GL:${tb.garbageLevel}`;
        targetEl.style.color = tb.garbageLevel > 50 ? "#ff6b6b" : "#ffa500";
      }
    } else if (targetEl) {
      targetEl.textContent = "none";
      targetEl.style.color = "#888";
    }
    // Garbage load
    const loadEl = document.getElementById("vd-garbage-load");
    if (loadEl && vehicle.vehicleType === "garbage_truck") {
      loadEl.textContent = `${vehicle.garbageLoad} / ${vehicle.garbageCapacity}`;
      loadEl.style.color = vehicle.garbageLoad >= vehicle.garbageCapacity ? "#ff6b6b" : "#2ecc71";
    }

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

  g.zIndex = Math.round(
    ((iso.y / 10 + TILE_HEIGHT / 2) / (TILE_HEIGHT / 2)) * NUM_LAYERS,
  );
  return g;
}
