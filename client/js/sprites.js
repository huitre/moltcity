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

    // Load residential zone sprites (low/medium/high density)
    if (spritesConfig.residential) {
      for (const density of ['low', 'medium', 'high']) {
        for (let i = 0; i < (spritesConfig.residential[density] || []).length; i++) {
          const spriteConfig = spritesConfig.residential[density][i];
          const jsonIndex = i;
          const promise = PIXI.Assets.load(`/sprites/${spriteConfig.file}`)
            .then((texture) => {
              state.residentialSprites[density].push({ texture, ...spriteConfig, _jsonIndex: jsonIndex });
              console.log(`[Sprites] Loaded residential.${density}: ${spriteConfig.id}`);
            })
            .catch((err) => {
              console.warn(`[Sprites] Failed to load residential.${density} ${spriteConfig.id}:`, err);
            });
          loadPromises.push(promise);
        }
      }
    }

    // Load office zone sprites (low/medium/high density)
    if (spritesConfig.offices) {
      for (const density of ['low', 'medium', 'high']) {
        for (let i = 0; i < (spritesConfig.offices[density] || []).length; i++) {
          const spriteConfig = spritesConfig.offices[density][i];
          const jsonIndex = i;
          const promise = PIXI.Assets.load(`/sprites/${spriteConfig.file}`)
            .then((texture) => {
              state.officeSprites[density].push({ texture, ...spriteConfig, _jsonIndex: jsonIndex });
              console.log(`[Sprites] Loaded offices.${density}: ${spriteConfig.id}`);
            })
            .catch((err) => {
              console.warn(`[Sprites] Failed to load offices.${density} ${spriteConfig.id}:`, err);
            });
          loadPromises.push(promise);
        }
      }
    }

    // Load service building sprites (police, hospital, firestation)
    for (const serviceType of ['police', 'hospital', 'firestation']) {
      if (spritesConfig[serviceType]) {
        for (let i = 0; i < spritesConfig[serviceType].length; i++) {
          const spriteConfig = spritesConfig[serviceType][i];
          const jsonIndex = i;
          const promise = PIXI.Assets.load(`/sprites/${spriteConfig.file}`)
            .then((texture) => {
              state.serviceSprites[serviceType].push({ texture, ...spriteConfig, _jsonIndex: jsonIndex });
              console.log(`[Sprites] Loaded ${serviceType}: ${spriteConfig.id}`);
            })
            .catch((err) => {
              console.warn(`[Sprites] Failed to load ${serviceType} ${spriteConfig.id}:`, err);
            });
          loadPromises.push(promise);
        }
      }
    }

    // Load park sprites
    if (spritesConfig.park) {
      for (let i = 0; i < spritesConfig.park.length; i++) {
        const spriteConfig = spritesConfig.park[i];
        const jsonIndex = i;
        const promise = PIXI.Assets.load(`/sprites/${spriteConfig.file}`)
          .then((texture) => {
            state.parkSprites.push({ texture, ...spriteConfig, _jsonIndex: jsonIndex });
            console.log(`[Sprites] Loaded park: ${spriteConfig.id}`);
          })
          .catch((err) => {
            console.warn(`[Sprites] Failed to load park ${spriteConfig.id}:`, err);
          });
        loadPromises.push(promise);
      }
    }

    // Load suburban sprites
    if (spritesConfig.suburban) {
      for (let i = 0; i < spritesConfig.suburban.length; i++) {
        const spriteConfig = spritesConfig.suburban[i];
        const jsonIndex = i;
        const promise = PIXI.Assets.load(`/sprites/${spriteConfig.file}`)
          .then((texture) => {
            state.suburbanSprites.push({ texture, ...spriteConfig, _jsonIndex: jsonIndex });
            console.log(`[Sprites] Loaded suburban: ${spriteConfig.id}`);
          })
          .catch((err) => {
            console.warn(`[Sprites] Failed to load suburban ${spriteConfig.id}:`, err);
          });
        loadPromises.push(promise);
      }
    }

    // Load industrial sprites
    if (spritesConfig.industrial) {
      for (let i = 0; i < spritesConfig.industrial.length; i++) {
        const spriteConfig = spritesConfig.industrial[i];
        const jsonIndex = i;
        const promise = PIXI.Assets.load(`/sprites/${spriteConfig.file}`)
          .then((texture) => {
            state.industrialSprites.push({ texture, ...spriteConfig, _jsonIndex: jsonIndex });
            console.log(`[Sprites] Loaded industrial: ${spriteConfig.id}`);
          })
          .catch((err) => {
            console.warn(`[Sprites] Failed to load industrial ${spriteConfig.id}:`, err);
          });
        loadPromises.push(promise);
      }
    }

    // Load crane sprites (construction)
    if (spritesConfig.crane) {
      for (let i = 0; i < spritesConfig.crane.length; i++) {
        const spriteConfig = spritesConfig.crane[i];
        const jsonIndex = i;
        const promise = PIXI.Assets.load(`/sprites/${spriteConfig.file}`)
          .then((texture) => {
            state.craneSprites.push({ texture, ...spriteConfig, _jsonIndex: jsonIndex });
            console.log(`[Sprites] Loaded crane: ${spriteConfig.id}`);
          })
          .catch((err) => {
            console.warn(`[Sprites] Failed to load crane ${spriteConfig.id}:`, err);
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
    const resCount = state.residentialSprites.low.length + state.residentialSprites.medium.length + state.residentialSprites.high.length;
    const offCount = state.officeSprites.low.length + state.officeSprites.medium.length + state.officeSprites.high.length;
    const svcCount = state.serviceSprites.police.length + state.serviceSprites.hospital.length + state.serviceSprites.firestation.length;
    console.log(
      `[Sprites] Loaded ${state.defaultSprites.size} buildings, ` +
      `${state.roadSprites.size} roads, ` +
      `${resCount} residential, ${offCount} offices, ${state.suburbanSprites.length} suburban, ${state.industrialSprites.length} industrial, ` +
      `${svcCount} services, ${state.parkSprites.length} parks, ` +
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
