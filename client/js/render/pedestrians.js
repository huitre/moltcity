// ============================================
// MOLTCITY - Pedestrian Rendering & Animation
// ============================================

import { GRID_SIZE, PEDESTRIAN_SPEED, PEDESTRIAN_COLORS, DIR_VECTORS } from '../config.js';
import { cartToIso } from '../utils.js';
import * as state from '../state.js';
import { getRoadAt, getValidDirections } from './roads.js';

/**
 * Spawn a new pedestrian near buildings
 */
export function spawnPedestrian() {
  const { animatedPedestrians, roads, buildings, parcels, pedestriansContainer } = state;

  if (animatedPedestrians.length >= state.MAX_PEDESTRIANS || roads.length === 0) {
    return;
  }

  // Find buildings to spawn near (prefer commercial areas)
  const commercialBuildings = buildings.filter(
    (b) => ["shop", "office", "factory", "plaza"].includes(b.type) && b.constructionProgress >= 100
  );
  const residentialBuildings = buildings.filter(
    (b) => ["house", "apartment"].includes(b.type) && b.constructionProgress >= 100
  );

  // 70% chance to spawn near commercial, 30% near residential
  let targetBuilding = null;
  if (commercialBuildings.length > 0 && Math.random() < 0.7) {
    targetBuilding = commercialBuildings[Math.floor(Math.random() * commercialBuildings.length)];
  } else if (residentialBuildings.length > 0) {
    targetBuilding = residentialBuildings[Math.floor(Math.random() * residentialBuildings.length)];
  }

  // Find a road near the building
  let spawnRoad;
  if (targetBuilding) {
    const parcel = parcels.find((p) => p.id === targetBuilding.parcelId);
    if (parcel) {
      const nearbyRoads = roads.filter((r) => {
        const rParcel = parcels.find((p) => p.id === r.parcelId);
        if (!rParcel) return false;
        const dx = Math.abs(rParcel.x - parcel.x);
        const dy = Math.abs(rParcel.y - parcel.y);
        return dx <= 3 && dy <= 3;
      });
      if (nearbyRoads.length > 0) {
        spawnRoad = nearbyRoads[Math.floor(Math.random() * nearbyRoads.length)];
      }
    }
  }

  if (!spawnRoad) {
    spawnRoad = roads[Math.floor(Math.random() * roads.length)];
  }

  const spawnParcel = parcels.find((p) => p.id === spawnRoad.parcelId);
  if (!spawnParcel) return;

  // Random color for pedestrian
  const color = PEDESTRIAN_COLORS[Math.floor(Math.random() * PEDESTRIAN_COLORS.length)];

  // Create pedestrian sprite
  const sprite = new PIXI.Graphics();
  sprite.beginFill(color);
  sprite.drawCircle(0, 0, 3);
  sprite.endFill();
  // Add a small "head"
  sprite.beginFill(0xffe0bd);
  sprite.drawCircle(0, -4, 2);
  sprite.endFill();

  // Offset to walk on edge of road
  const edgeOffset = Math.random() > 0.5 ? 0.15 : 0.85;

  const pedestrian = {
    x: spawnParcel.x + edgeOffset,
    y: spawnParcel.y + edgeOffset,
    sprite: sprite,
    color: color,
    speed: PEDESTRIAN_SPEED + Math.random() * 0.05,
    targetX: spawnParcel.x + edgeOffset,
    targetY: spawnParcel.y + edgeOffset,
    dir: ["north", "south", "east", "west"][Math.floor(Math.random() * 4)],
    edgeOffset: edgeOffset,
    lifetime: 0,
    maxLifetime: 500 + Math.floor(Math.random() * 500),
  };

  // Pick initial direction
  const validDirs = getValidDirections(Math.floor(pedestrian.x), Math.floor(pedestrian.y));
  if (validDirs.length > 0) {
    pedestrian.dir = validDirs[Math.floor(Math.random() * validDirs.length)];
    pedestrian.targetX = Math.floor(pedestrian.x) + DIR_VECTORS[pedestrian.dir].dx + pedestrian.edgeOffset;
    pedestrian.targetY = Math.floor(pedestrian.y) + DIR_VECTORS[pedestrian.dir].dy + pedestrian.edgeOffset;
  }

  const iso = cartToIso(pedestrian.x, pedestrian.y);
  sprite.x = iso.x;
  sprite.y = iso.y;
  sprite.zIndex = pedestrian.x + pedestrian.y + 0.5;

  pedestriansContainer.addChild(sprite);
  animatedPedestrians.push(pedestrian);
}

/**
 * Animate all pedestrians
 */
export function animatePedestrians(delta) {
  const { animatedPedestrians, pedestriansContainer } = state;

  // Spawn new pedestrians
  if (animatedPedestrians.length < state.MAX_PEDESTRIANS && Math.random() < 0.02) {
    spawnPedestrian();
  }

  for (let i = animatedPedestrians.length - 1; i >= 0; i--) {
    const ped = animatedPedestrians[i];
    ped.lifetime++;

    // Remove if exceeded lifetime
    if (ped.lifetime > ped.maxLifetime) {
      pedestriansContainer.removeChild(ped.sprite);
      animatedPedestrians.splice(i, 1);
      continue;
    }

    const dx = ped.targetX - ped.x;
    const dy = ped.targetY - ped.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.1) {
      // Reached target, pick new direction
      const currentX = Math.floor(ped.x);
      const currentY = Math.floor(ped.y);

      const targetRoad = getRoadAt(currentX, currentY);
      if (!targetRoad) {
        pedestriansContainer.removeChild(ped.sprite);
        animatedPedestrians.splice(i, 1);
        continue;
      }

      // Sometimes wait (idle)
      if (Math.random() < 0.1) {
        continue;
      }

      const validDirs = getValidDirections(currentX, currentY);
      if (validDirs.length === 0) {
        pedestriansContainer.removeChild(ped.sprite);
        animatedPedestrians.splice(i, 1);
        continue;
      }

      // Prefer continuing in same direction
      let nextDir =
        validDirs.includes(ped.dir) && Math.random() < 0.7
          ? ped.dir
          : validDirs[Math.floor(Math.random() * validDirs.length)];

      ped.dir = nextDir;
      ped.targetX = currentX + DIR_VECTORS[nextDir].dx + ped.edgeOffset;
      ped.targetY = currentY + DIR_VECTORS[nextDir].dy + ped.edgeOffset;
    } else {
      // Move toward target
      const moveSpeed = ped.speed * delta * 0.03;
      ped.x += (dx / dist) * moveSpeed;
      ped.y += (dy / dist) * moveSpeed;
    }

    // Update sprite position
    const iso = cartToIso(ped.x, ped.y);
    ped.sprite.x = iso.x;
    ped.sprite.y = iso.y;
    ped.sprite.zIndex = Math.floor(ped.x) + Math.floor(ped.y) + 0.5;

    // Remove if out of bounds
    if (ped.x < 0 || ped.x >= GRID_SIZE || ped.y < 0 || ped.y >= GRID_SIZE) {
      pedestriansContainer.removeChild(ped.sprite);
      animatedPedestrians.splice(i, 1);
    }
  }
}
