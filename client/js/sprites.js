// ============================================
// MOLTCITY - Sprite Loading & Management
// ============================================

import * as state from './state.js';

/**
 * Simple seeded random number generator (mulberry32)
 */
export function seededRandom(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Load all sprites from the sprites configuration
 */
export async function loadSprites() {
  try {
    const res = await fetch("/sprites/sprites.json");
    const spritesConfig = await res.json();
    state.setSpritesConfig(spritesConfig);

    const loadPromises = [];

    // Load building sprites
    if (spritesConfig.buildings) {
      for (const [type, config] of Object.entries(spritesConfig.buildings)) {
        const promise = PIXI.Assets.load(`/sprites/${config.file}`)
          .then((texture) => {
            state.defaultSprites.set(type, { texture, config });
            console.log(`[Sprites] Loaded building: ${type}`);
          })
          .catch((err) => {
            console.warn(`[Sprites] Failed to load ${type}:`, err);
          });
        loadPromises.push(promise);
      }
    }

    // Load road sprites
    if (spritesConfig.roads) {
      for (const [type, config] of Object.entries(spritesConfig.roads)) {
        const promise = PIXI.Assets.load(`/sprites/${config.file}`)
          .then((texture) => {
            state.roadSprites.set(type, { texture, config });
            console.log(`[Sprites] Loaded road: ${type}`);
          })
          .catch((err) => {
            console.warn(`[Sprites] Failed to load road ${type}:`, err);
          });
        loadPromises.push(promise);
      }
    }

    // Load house parts (bricks, bottoms, and roofs)
    if (spritesConfig.houseParts) {
      // Load brick sprites
      for (const brick of spritesConfig.houseParts.bricks || []) {
        const promise = PIXI.Assets.load(`/sprites/${brick.file}`)
          .then((texture) => {
            state.houseBricks.push({ texture, ...brick });
            console.log(`[Sprites] Loaded brick: ${brick.id}`);
          })
          .catch((err) => {
            console.warn(`[Sprites] Failed to load brick ${brick.id}:`, err);
          });
        loadPromises.push(promise);
      }

      // Load bottom sprites (ground floor)
      for (const bottom of spritesConfig.houseParts.bottoms || []) {
        const promise = PIXI.Assets.load(`/sprites/${bottom.file}`)
          .then((texture) => {
            state.houseBottoms.push({ texture, ...bottom });
            console.log(`[Sprites] Loaded bottom: ${bottom.id}`);
          })
          .catch((err) => {
            console.warn(`[Sprites] Failed to load bottom ${bottom.id}:`, err);
          });
        loadPromises.push(promise);
      }

      // Load roof sprites
      for (const roof of spritesConfig.houseParts.roofs || []) {
        const promise = PIXI.Assets.load(`/sprites/${roof.file}`)
          .then((texture) => {
            state.houseRoofs.push({ texture, ...roof });
            console.log(`[Sprites] Loaded roof: ${roof.id}`);
          })
          .catch((err) => {
            console.warn(`[Sprites] Failed to load roof ${roof.id}:`, err);
          });
        loadPromises.push(promise);
      }
    }

    // Load office parts (bottoms, floors and roofs)
    if (spritesConfig.officeParts) {
      // Load office bottom sprites (ground floor)
      for (const bottom of spritesConfig.officeParts.bottoms || []) {
        const promise = PIXI.Assets.load(`/sprites/${bottom.file}`)
          .then((texture) => {
            state.officeBottoms.push({ texture, ...bottom });
            console.log(`[Sprites] Loaded office bottom: ${bottom.id}`);
          })
          .catch((err) => {
            console.warn(`[Sprites] Failed to load office bottom ${bottom.id}:`, err);
          });
        loadPromises.push(promise);
      }

      // Load office floor sprites
      for (const floor of spritesConfig.officeParts.floors || []) {
        const promise = PIXI.Assets.load(`/sprites/${floor.file}`)
          .then((texture) => {
            state.officeFloors.push({ texture, ...floor });
            console.log(`[Sprites] Loaded office floor: ${floor.id}`);
          })
          .catch((err) => {
            console.warn(`[Sprites] Failed to load office floor ${floor.id}:`, err);
          });
        loadPromises.push(promise);
      }

      // Load office roof sprites
      for (const roof of spritesConfig.officeParts.roofs || []) {
        const promise = PIXI.Assets.load(`/sprites/${roof.file}`)
          .then((texture) => {
            state.officeRoofs.push({ texture, ...roof });
            console.log(`[Sprites] Loaded office roof: ${roof.id}`);
          })
          .catch((err) => {
            console.warn(`[Sprites] Failed to load office roof ${roof.id}:`, err);
          });
        loadPromises.push(promise);
      }
    }

    // Load vehicle sprites
    if (spritesConfig.vehicles) {
      const numberedDirs = { NE: "002", SE: "006", SW: "010", NW: "014" };
      const directionalDirs = { NE: "NE", SE: "SE", SW: "SW", NW: "NW" };

      for (const [vehicleType, config] of Object.entries(spritesConfig.vehicles)) {
        const directions = new Map();
        const dirMap = config.type === "numbered" ? numberedDirs : directionalDirs;
        const ext = ".png";

        for (const [dir, suffix] of Object.entries(dirMap)) {
          const filePath = `/sprites/${config.basePath}${suffix}${ext}`;
          const promise = PIXI.Assets.load(filePath)
            .then((texture) => {
              directions.set(dir, texture);
            })
            .catch((err) => {
              console.warn(`[Sprites] Failed to load vehicle ${vehicleType} ${dir}:`, err);
            });
          loadPromises.push(promise);
        }

        state.vehicleSprites.set(vehicleType, { directions, config });
        console.log(`[Sprites] Loading vehicle: ${vehicleType}`);
      }
    }

    await Promise.all(loadPromises);
    console.log(
      `[Sprites] Loaded ${state.defaultSprites.size} buildings, ` +
      `${state.roadSprites.size} roads, ` +
      `${state.houseBricks.length} house bricks, ` +
      `${state.houseBottoms.length} house bottoms, ` +
      `${state.officeFloors.length} office floors, ` +
      `${state.officeBottoms.length} office bottoms, ` +
      `${state.vehicleSprites.size} vehicle types`
    );
  } catch (err) {
    console.warn("[Sprites] Could not load sprite config, using procedural:", err);
  }
}

/**
 * Generate a random house style by stacking bricks and adding a roof
 */
export function generateStackedHouse(x, y, seed) {
  const rng = seededRandom(seed || x * 1000 + y);

  // Random number of floors (1-3)
  const floors = Math.floor(rng() * 3) + 1;

  // Pick random bottom, upper brick, and roof
  const bottomIndex = Math.floor(rng() * Math.max(1, state.houseBottoms.length));
  const brickIndex = Math.floor(rng() * state.houseBricks.length);
  const roofIndex = Math.floor(rng() * state.houseRoofs.length);

  return { floors, bottomIndex, brickIndex, roofIndex };
}

/**
 * Generate office style (floors can be specified or random)
 */
export function generateStackedOffice(x, y, seed, specifiedFloors = null) {
  const rng = seededRandom(seed || x * 1000 + y + 5000);

  // Use specified floors or random (1-5 for offices)
  const floors = specifiedFloors || Math.floor(rng() * 5) + 1;

  // Pick random bottom, floor and roof style
  const bottomIndex = Math.floor(rng() * Math.max(1, state.officeBottoms.length));
  const floorIndex = Math.floor(rng() * state.officeFloors.length);
  const roofIndex = Math.floor(rng() * state.officeRoofs.length);

  return { floors, bottomIndex, floorIndex, roofIndex };
}
