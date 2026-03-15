// ============================================
// MOLTCITY - Night Lighting System
// ============================================

import { TILE_WIDTH, TILE_HEIGHT, GRID_SIZE } from "../config.js";
import { cartToIso } from "../utils.js";
import * as state from "../state.js";
import { hasRoadAtFast } from "./roads.js";

// Lighting configuration - adjustable
export const LIGHTING_CONFIG = {
  // Streetlight settings
  streetlight: {
    haloRadius: 50,
    haloColor: 0xffdd88,
    haloAlpha: 0.7,       // Increased from 0.35 to cut through night overlay
    poleHeight: 30,
    poleColor: 0x444444,
    bulbColor: 0xffffcc,
    bulbRadius: 4,
    spacing: 3,  // Place streetlight every N road tiles
  },
  // Building light windows - relative positions (0-1) within building sprite
  // You can adjust these manually per building type
  buildingLights: {
    residential: [
      { x: 0.3, y: 0.4 }, { x: 0.7, y: 0.4 },
      { x: 0.3, y: 0.6 }, { x: 0.7, y: 0.6 },
    ],
    suburban: [
      { x: 0.25, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.75, y: 0.5 },
    ],
    office: [
      // Grid of windows for offices
      { x: 0.2, y: 0.3 }, { x: 0.4, y: 0.3 }, { x: 0.6, y: 0.3 }, { x: 0.8, y: 0.3 },
      { x: 0.2, y: 0.5 }, { x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }, { x: 0.8, y: 0.5 },
      { x: 0.2, y: 0.7 }, { x: 0.4, y: 0.7 }, { x: 0.6, y: 0.7 }, { x: 0.8, y: 0.7 },
    ],
    industrial: [
      { x: 0.3, y: 0.4 }, { x: 0.7, y: 0.4 },
      { x: 0.5, y: 0.7 },
    ],
    commercial: [
      { x: 0.2, y: 0.6 }, { x: 0.5, y: 0.6 }, { x: 0.8, y: 0.6 },
    ],
  },
  // Light colors for variety
  windowColors: [0xffdd77, 0xffeebb, 0xffffcc, 0xffcc66, 0xffffff],
};

// Container for all lighting elements
let lightingContainer = null;
let streetlightSprites = [];
let buildingLightSprites = [];

/**
 * Initialize the lighting container.
 * Placed on app.stage AFTER dayNightOverlay so it renders on top of the dark overlay.
 */
export function initLighting() {
  if (lightingContainer) {
    lightingContainer.parent?.removeChild(lightingContainer);
  }

  lightingContainer = new PIXI.Container();
  lightingContainer.alpha = 0; // Start hidden (daytime)
  lightingContainer.blendMode = PIXI.BLEND_MODES.ADD;
  state.app.stage.addChild(lightingContainer);

  streetlightSprites = [];
  buildingLightSprites = [];
}

/**
 * Create streetlights along roads
 */
export function createStreetlights() {
  if (!lightingContainer) initLighting();
  
  // Clear existing streetlights
  for (const sl of streetlightSprites) {
    lightingContainer.removeChild(sl.container);
  }
  streetlightSprites = [];
  
  const { roads, parcels } = state;
  const cfg = LIGHTING_CONFIG.streetlight;
  
  // Place streetlights on roads at regular intervals
  let roadIndex = 0;
  for (const road of roads) {
    const parcel = parcels.find(p => p.id === road.parcelId);
    if (!parcel) continue;
    
    // Only place every N roads for spacing
    if (roadIndex % cfg.spacing !== 0) {
      roadIndex++;
      continue;
    }
    roadIndex++;
    
    const x = parcel.x;
    const y = parcel.y;
    
    // Check if this is an edge road (next to non-road)
    const hasN = hasRoadAtFast(x, y - 1);
    const hasS = hasRoadAtFast(x, y + 1);
    const hasE = hasRoadAtFast(x + 1, y);
    const hasW = hasRoadAtFast(x - 1, y);
    
    // Place on corners/edges of the road
    const iso = cartToIso(x + 0.5, y + 0.5);
    
    // Offset for sidewalk position (NE corner)
    const offsets = [];
    if (!hasN || !hasE) offsets.push({ dx: 0.35, dy: -0.35 }); // NE sidewalk
    if (!hasS || !hasW) offsets.push({ dx: -0.35, dy: 0.35 }); // SW sidewalk
    
    // Default: just one light if no clear edge
    if (offsets.length === 0) offsets.push({ dx: 0.35, dy: -0.35 });
    
    for (const off of offsets) {
      const lightIso = cartToIso(x + 0.5 + off.dx, y + 0.5 + off.dy);
      const streetlight = createStreetlightSprite(lightIso.x, lightIso.y, x, y);
      streetlightSprites.push(streetlight);
      lightingContainer.addChild(streetlight.container);
    }
  }
}

/**
 * Create a single streetlight sprite with halo
 */
function createStreetlightSprite(screenX, screenY, tileX, tileY) {
  const cfg = LIGHTING_CONFIG.streetlight;
  const container = new PIXI.Container();
  container.zIndex = (tileX + tileY) * GRID_SIZE + tileX + 1;
  
  // Light halo (glow effect)
  const halo = new PIXI.Graphics();
  halo.beginFill(cfg.haloColor, cfg.haloAlpha);
  halo.drawCircle(0, -cfg.poleHeight, cfg.haloRadius);
  halo.endFill();
  
  // Soft gradient effect using multiple circles (boosted for visibility)
  for (let i = 1; i <= 3; i++) {
    const r = cfg.haloRadius * (1 - i * 0.2);
    const a = cfg.haloAlpha * (1 + i * 0.4);
    halo.beginFill(cfg.haloColor, Math.min(a, 0.95));
    halo.drawCircle(0, -cfg.poleHeight, r);
    halo.endFill();
  }
  
  // Pole
  const pole = new PIXI.Graphics();
  pole.beginFill(cfg.poleColor);
  pole.drawRect(-2, -cfg.poleHeight, 4, cfg.poleHeight);
  pole.endFill();
  
  // Arm extending out
  pole.beginFill(cfg.poleColor);
  pole.drawRect(-8, -cfg.poleHeight - 2, 12, 3);
  pole.endFill();
  
  // Bulb
  const bulb = new PIXI.Graphics();
  bulb.beginFill(cfg.bulbColor);
  bulb.drawCircle(0, -cfg.poleHeight, cfg.bulbRadius);
  bulb.endFill();
  
  container.addChild(halo);
  container.addChild(pole);
  container.addChild(bulb);
  container.x = screenX;
  container.y = screenY + TILE_HEIGHT / 2 + 8;
  
  return { container, halo, bulb, tileX, tileY };
}

/**
 * Create building window lights
 */
export function createBuildingLights() {
  if (!lightingContainer) initLighting();
  
  // Clear existing building lights
  for (const bl of buildingLightSprites) {
    lightingContainer.removeChild(bl.container);
  }
  buildingLightSprites = [];
  
  const { buildings, parcels } = state;
  const cfg = LIGHTING_CONFIG;
  
  for (const building of buildings) {
    const parcel = parcels.find(p => p.id === building.parcelId);
    if (!parcel) continue;
    
    // Determine building category for light positions
    let category = 'residential';
    const type = building.type || '';
    
    if (type.includes('office') || type.includes('commercial')) {
      category = 'office';
    } else if (type.includes('industrial') || type.includes('factory') || type.includes('warehouse')) {
      category = 'industrial';
    } else if (type.includes('suburban') || type.includes('house')) {
      category = 'suburban';
    } else if (type.includes('shop') || type.includes('store') || type.includes('retail')) {
      category = 'commercial';
    }
    
    const lightPositions = cfg.buildingLights[category] || cfg.buildingLights.residential;
    
    // Get building dimensions
    const w = building.width || 1;
    const h = building.height || 1;
    
    // Calculate building screen position
    const cx = parcel.x + w / 2;
    const cy = parcel.y + h / 2;
    const iso = cartToIso(cx, cy);
    
    // Building sprite approximate bounds
    const buildingWidth = w * TILE_WIDTH * 0.8;
    const buildingHeight = 60 + (building.floors || 1) * 15; // Approximate height
    
    const container = new PIXI.Container();
    container.zIndex = (parcel.x + parcel.y) * GRID_SIZE + parcel.x + 2;
    
    // Create window lights at configured positions
    for (const pos of lightPositions) {
      // Random chance to have light on (60%)
      if (Math.random() > 0.6) continue;
      
      const windowX = (pos.x - 0.5) * buildingWidth;
      const windowY = -buildingHeight * pos.y;
      
      // Pick random warm color
      const color = cfg.windowColors[Math.floor(Math.random() * cfg.windowColors.length)];
      
      const window = new PIXI.Graphics();
      
      // Window glow (boosted to show through night overlay)
      window.beginFill(color, 0.6);
      window.drawCircle(windowX, windowY, 10);
      window.endFill();
      
      // Window rectangle
      window.beginFill(color, 1.0);
      window.drawRect(windowX - 4, windowY - 3, 8, 6);
      window.endFill();
      
      container.addChild(window);
    }
    
    container.x = iso.x;
    container.y = iso.y + TILE_HEIGHT / 2;
    
    if (container.children.length > 0) {
      buildingLightSprites.push({ container, building, parcel });
      lightingContainer.addChild(container);
    }
  }
}

/**
 * Update lighting intensity based on time of day
 * Call this from updateDayNightOverlay
 */
export function updateLighting(nightAlpha) {
  if (!lightingContainer) return;

  // Sync transform with worldContainer so lights follow camera pan/zoom
  const wc = state.worldContainer;
  lightingContainer.x = wc.x;
  lightingContainer.y = wc.y;
  lightingContainer.scale.set(wc.scale.x, wc.scale.y);

  // Lights visible when it's dark (nightAlpha > 0.1)
  const lightIntensity = Math.max(0, (nightAlpha - 0.1) / 0.3);
  lightingContainer.alpha = Math.min(1, lightIntensity);

  // Flicker effect for some streetlights
  const time = Date.now() * 0.001;
  for (let i = 0; i < streetlightSprites.length; i++) {
    const sl = streetlightSprites[i];
    const flicker = 0.9 + Math.sin(time * 3 + i * 2) * 0.1;
    sl.halo.alpha = flicker;
    sl.bulb.alpha = flicker;
  }
}

/**
 * Rebuild all lights (call after roads/buildings change)
 */
export function rebuildLights() {
  createStreetlights();
  createBuildingLights();
}

/**
 * Get the lighting container for debug access
 */
export function getLightingContainer() {
  return lightingContainer;
}
