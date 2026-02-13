// ============================================
// MOLTCITY - Main Game Loop
// ============================================

import { GRID_SIZE, TILE_WIDTH, TILE_HEIGHT, COLORS } from "./config.js";
import * as state from "./state.js";
import { cartToIso } from "./utils.js";
import { seededRandom } from "./sprites.js";
import { drawGrassTile, drawHighlight, drawZoneTile } from "./render/tiles.js";
import { drawRoad, hasRoadAt } from "./render/roads.js";
import { animateVehicles, initVehicles } from "./render/vehicles.js";
import { animatePedestrians } from "./render/pedestrians.js";
import {
  initClouds,
  initBirds,
  animateAmbient,
  updateDayNightOverlay,
} from "./render/ambient.js";

let renderContainer = null;
let statusIcons = [];

/**
 * Initialize the game world
 */
export function initGame() {
  initClouds();
  initBirds();

  // Start animation loop
  state.app.ticker.add(gameLoop);
}

/**
 * Main game loop - runs every frame
 */
function gameLoop(delta) {
  // Animate ambient effects
  animateAmbient(delta);

  // Update day/night overlay
  updateDayNightOverlay();

  // Animate vehicles
  animateVehicles(delta);

  // Animate pedestrians
  animatePedestrians(delta);

  // Animate status icons
  animateStatusIcons(delta);
}

/**
 * Render the entire city
 */
export function render() {
  const {
    worldContainer,
    parcels,
    buildings,
    roads,
    agents,
    powerLines,
    waterPipes,
  } = state;

  // Clear previous render (remove all children except permanent containers)
  const permanentContainers = [
    state.cloudsContainer,
    state.birdsContainer,
    state.sceneLayer,
  ];

  // Remove non-permanent children from worldContainer
  for (let i = worldContainer.children.length - 1; i >= 0; i--) {
    const child = worldContainer.children[i];
    if (!permanentContainers.includes(child)) {
      worldContainer.removeChild(child);
    }
  }

  // Clear scene layer static content, but keep vehicle/pedestrian sprites
  const sceneLayer = state.sceneLayer;
  const dynamicSprites = new Set();
  for (const v of state.animatedVehicles) dynamicSprites.add(v.sprite);
  for (const p of state.animatedPedestrians) dynamicSprites.add(p.sprite);
  for (let i = sceneLayer.children.length - 1; i >= 0; i--) {
    const child = sceneLayer.children[i];
    if (!dynamicSprites.has(child)) {
      sceneLayer.removeChild(child);
    }
  }

  // Layers: tiles(100) < waterpipes(200)
  //         < scene(700: roads+powerlines+buildings+vehicles+pedestrians sorted by x+y)
  //         < birds(800) < clouds(900)

  const tilesLayer = new PIXI.Container();
  tilesLayer.zIndex = 100;

  const waterPipesLayer = new PIXI.Container();
  waterPipesLayer.zIndex = 200;

  worldContainer.addChild(tilesLayer);
  worldContainer.addChild(waterPipesLayer);

  // Build lookup maps for occupied tiles (buildings + roads)
  const occupiedTiles = new Set();
  for (const building of buildings) {
    const p = parcels.find((p) => p.id === building.parcelId);
    if (!p) continue;
    const w = building.width || 1;
    const h = building.height || 1;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        occupiedTiles.add(`${p.x + dx},${p.y + dy}`);
      }
    }
  }
  for (const road of roads) {
    const p = parcels.find((p) => p.id === road.parcelId);
    if (p) occupiedTiles.add(`${p.x},${p.y}`);
  }

  // Build parcel coord lookup for zoning
  const parcelByCoord = new Map();
  for (const p of parcels) {
    if (p.zoning) parcelByCoord.set(`${p.x},${p.y}`, p);
  }

  // Draw grid tiles (grass or zone color)
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const key = `${x},${y}`;
      const zonedParcel = parcelByCoord.get(key);
      if (zonedParcel && !occupiedTiles.has(key)) {
        const tile = drawZoneTile(x, y, zonedParcel.zoning);
        tilesLayer.addChild(tile);
      } else {
        const tile = drawGrassTile(x, y);
        tilesLayer.addChild(tile);
      }
    }
  }

  // Draw water pipes
  for (const pipe of waterPipes) {
    const pipeGraphic = drawWaterPipe(pipe.from, pipe.to);
    waterPipesLayer.addChild(pipeGraphic);
  }

  // Draw power lines
  for (const line of powerLines) {
    const lineGraphic = drawPowerLine(line.from, line.to);
    sceneLayer.addChild(lineGraphic);
  }

  // Draw roads
  for (const road of roads) {
    const parcel = parcels.find((p) => p.id === road.parcelId);
    if (parcel) {
      const roadGraphic = drawRoad(parcel.x, parcel.y);
      sceneLayer.addChild(roadGraphic);
    }
  }

  // Initialize vehicles after roads are loaded
  if (state.animatedVehicles.length === 0 && roads.length > 0) {
    initVehicles();
  }

  // Draw buildings
  statusIcons = [];
  for (const building of buildings) {
    const parcel = parcels.find((p) => p.id === building.parcelId);
    if (parcel) {
      const buildingGraphic = drawBuilding(parcel.x, parcel.y, building);
      sceneLayer.addChild(buildingGraphic);
      const icons = drawStatusIcons(parcel.x, parcel.y, building);
      if (icons) {
        sceneLayer.addChild(icons);
        statusIcons.push(icons);
      }
    }
  }

  // Draw agents
  for (const agent of agents) {
    const agentGraphic = drawAgent(
      agent.currentLocation.x,
      agent.currentLocation.y,
    );
    sceneLayer.addChild(agentGraphic);
  }

  // Sort scene layer for proper isometric depth
  sceneLayer.sortChildren();

  // Update UI
  updateUI();
}

/**
 * Draw a building at the given position
 */
function drawBuilding(x, y, building) {
  const g = new PIXI.Graphics();

  // Compute footprint-aware positions
  const fw = building.width || 1;
  const fh = building.height || 1;
  // Center X of footprint, bottom Y of footprint
  const spriteIsoX = cartToIso(x + (fw - 1) / 2, y + (fh - 1) / 2).x;
  const spriteIsoY = cartToIso(x + fw - 1, y + fh - 1).y + TILE_HEIGHT;
  const zIdx = x + fw - 1 + (y + fh - 1);

  const powered = building.powered;
  const type = building.type;
  const floors = building.floors || 1;

  // Suburban zone sprites (flat array, no density)
  if (type === "suburban" && state.suburbanSprites.length > 0) {
    const sprites = state.suburbanSprites;
    const rng = seededRandom(x * 1000 + y);
    const idx = Math.floor(rng() * sprites.length);
    const spriteData = sprites[idx];
    const sprite = new PIXI.Sprite(spriteData.texture);
    const tileSpan = spriteData.tiles || 1;
    const scale = (TILE_WIDTH * tileSpan) / spriteData.width;
    sprite.scale.set(scale);
    sprite.anchor.set(spriteData.anchor.x, spriteData.anchor.y);
    sprite.x = spriteIsoX;
    sprite.y = spriteIsoY;
    sprite.zIndex = zIdx;
    if (!powered) sprite.tint = 0x888888;
    return sprite;
  }

  // Industrial zone sprites (flat array, no density)
  if (type === "industrial" && state.industrialSprites.length > 0) {
    const sprites = state.industrialSprites;
    const rng = seededRandom(x * 1000 + y);
    const idx = Math.floor(rng() * sprites.length);
    const spriteData = sprites[idx];
    const sprite = new PIXI.Sprite(spriteData.texture);
    const tileSpan = spriteData.tiles || 1;
    const scale = (TILE_WIDTH * tileSpan) / spriteData.width;
    sprite.scale.set(scale);
    sprite.anchor.set(spriteData.anchor.x, spriteData.anchor.y);
    sprite.x = spriteIsoX;
    sprite.y = spriteIsoY;
    sprite.zIndex = zIdx;
    if (!powered) sprite.tint = 0x888888;
    return sprite;
  }

  // Try zone sprites for residential/offices
  if (type === "residential" || type === "offices") {
    const spriteMap =
      type === "residential" ? state.residentialSprites : state.officeSprites;
    // Density mapping: floors 1 = low, floors 2-3 = medium, floors 4+ = high
    const density = floors <= 1 ? "low" : floors <= 3 ? "medium" : "high";
    const sprites = spriteMap[density];
    if (sprites && sprites.length > 0) {
      const rng = seededRandom(x * 1000 + y);
      const idx = Math.floor(rng() * sprites.length);
      const spriteData = sprites[idx];
      const sprite = new PIXI.Sprite(spriteData.texture);
      const tileSpan = spriteData.tiles || 1;
      const scale = (TILE_WIDTH * tileSpan) / spriteData.width;
      sprite.scale.set(scale);
      sprite.anchor.set(spriteData.anchor.x, spriteData.anchor.y);
      sprite.x = spriteIsoX;
      sprite.y = spriteIsoY;
      sprite.zIndex = zIdx;
      if (!powered) {
        sprite.tint = 0x888888;
      }
      return sprite;
    }
  }

  // Try service/park sprites
  const serviceSpriteMap = {
    park: state.parkSprites,
    police_station: state.serviceSprites.police,
    fire_station: state.serviceSprites.firestation,
    hospital: state.serviceSprites.hospital,
    power_plant: state.powerPlantSprites,
  };
  if (serviceSpriteMap[type] && serviceSpriteMap[type].length > 0) {
    const sprites = serviceSpriteMap[type];
    const rng = seededRandom(x * 1000 + y);
    const idx = Math.floor(rng() * sprites.length);
    const spriteData = sprites[idx];
    const sprite = new PIXI.Sprite(spriteData.texture);
    const tileSpan = spriteData.tiles || 1;
    const scale = (TILE_WIDTH * tileSpan) / spriteData.width;
    sprite.scale.set(scale);
    sprite.anchor.set(spriteData.anchor.x, spriteData.anchor.y);
    sprite.x = spriteIsoX;
    sprite.y = spriteIsoY;
    sprite.zIndex = zIdx;
    if (!powered) {
      sprite.tint = 0x888888;
    }
    return sprite;
  }

  // Try to use sprite first
  if (state.defaultSprites.has(type)) {
    const { texture, config } = state.defaultSprites.get(type);
    const sprite = new PIXI.Sprite(texture);
    const tileSpan = config.tiles || 1;
    const scale = (TILE_WIDTH * tileSpan) / config.width;
    sprite.scale.set(scale);
    sprite.anchor.set(config.anchor.x, config.anchor.y);
    sprite.x = spriteIsoX;
    sprite.y = spriteIsoY;
    sprite.zIndex = zIdx;

    // Tint if not powered
    if (!powered) {
      sprite.tint = 0x888888;
    }

    return sprite;
  }

  // Fallback to procedural drawing
  const iso = cartToIso(x, y);
  const wallHeight = 20 + floors * 15;
  const cx = iso.x;
  const baseY = iso.y + TILE_HEIGHT;

  // Draw based on type
  switch (type) {
    case "house":
      drawHouseProcedural(g, cx, baseY, powered, floors);
      break;
    case "apartment":
      drawApartmentProcedural(g, cx, baseY, powered, floors);
      break;
    case "shop":
      drawShopProcedural(g, cx, baseY, powered);
      break;
    case "office":
      drawOfficeProcedural(g, cx, baseY, powered, floors);
      break;
    case "factory":
      drawFactoryProcedural(g, cx, baseY, powered);
      break;
    default:
      // Generic building
      drawGenericBuilding(g, cx, baseY, powered, wallHeight);
  }

  g.zIndex = zIdx;
  return g;
}

/**
 * Draw small status icons above a building missing power/water.
 * Returns null if the building has both utilities.
 * Icons are drawn in local coords and positioned via .x/.y for animation.
 */
function drawStatusIcons(x, y, building) {
  const needsPower = !building.powered;
  const needsWater = building.hasWater === false;
  if (!needsPower && !needsWater) return null;
  if (building.constructionProgress < 100) return null;

  const fw = building.width || 1;
  const fh = building.height || 1;
  const iso = cartToIso(x + (fw - 1) / 2, y + (fh - 1) / 2);
  const zIdx = x + fw - 1 + (y + fh - 1) + 0.1;

  const g = new PIXI.Graphics();
  g.x = iso.x;
  g.y = iso.y - 8;
  g._baseY = g.y; // stash for animation
  g._animTime = Math.random() * Math.PI * 2; // random phase offset

  const iconCount = (needsPower ? 1 : 0) + (needsWater ? 1 : 0);
  const spacing = 12;
  let ox = (-(iconCount - 1) * spacing) / 2;

  if (needsPower) {
    // Lightning bolt icon (drawn in local coords around 0,0)
    g.lineStyle(1.5, 0xffa500, 1);
    g.beginFill(0xffd700, 0.9);
    g.moveTo(ox + 2, -8);
    g.lineTo(ox - 1, -2);
    g.lineTo(ox + 1, -2);
    g.lineTo(ox - 2, 4);
    g.lineTo(ox + 1, 0);
    g.lineTo(ox - 1, 0);
    g.closePath();
    g.endFill();
    ox += spacing;
  }

  if (needsWater) {
    // Water drop icon
    g.lineStyle(1, 0x2980b9, 1);
    g.beginFill(0x5dade2, 0.9);
    g.moveTo(ox, -8);
    g.bezierCurveTo(ox - 4, -2, ox - 4, 2, ox, 4);
    g.bezierCurveTo(ox + 4, 2, ox + 4, -2, ox, -8);
    g.endFill();
  }

  g.zIndex = zIdx;
  return g;
}

/**
 * Animate status icons — gentle bob + pulse
 */
function animateStatusIcons(delta) {
  for (const icon of statusIcons) {
    icon._animTime += delta * 0.05;
    icon.y = icon._baseY + Math.sin(icon._animTime) * 3;
    icon.alpha = 0.7 + 0.3 * Math.sin(icon._animTime * 1.4);
  }
}

// Procedural building drawing functions
function drawHouseProcedural(g, cx, baseY, powered, floors) {
  const wallColor = powered ? 0xd4a574 : 0x999999;
  const roofColor = powered ? 0xc0392b : 0x666666;

  // Walls
  g.beginFill(wallColor);
  g.drawRect(cx - 15, baseY - 25, 30, 20);
  g.endFill();

  // Roof
  g.beginFill(roofColor);
  g.moveTo(cx - 18, baseY - 25);
  g.lineTo(cx, baseY - 40);
  g.lineTo(cx + 18, baseY - 25);
  g.closePath();
  g.endFill();

  // Window
  g.beginFill(powered ? 0xffd700 : 0x87ceeb);
  g.drawRect(cx - 5, baseY - 20, 10, 8);
  g.endFill();

  // Door
  g.beginFill(0x8b4513);
  g.drawRect(cx - 4, baseY - 12, 8, 12);
  g.endFill();
}

function drawApartmentProcedural(g, cx, baseY, powered, floors) {
  const wallColor = powered ? 0xbdc3c7 : 0x888888;
  const height = 15 + floors * 12;

  // Main building
  g.beginFill(wallColor);
  g.drawRect(cx - 18, baseY - height, 36, height - 5);
  g.endFill();

  // Windows grid
  const windowColor = powered ? 0xffd700 : 0x87ceeb;
  for (let f = 0; f < floors; f++) {
    for (let w = 0; w < 3; w++) {
      g.beginFill(windowColor);
      g.drawRect(cx - 14 + w * 10, baseY - height + 8 + f * 12, 6, 6);
      g.endFill();
    }
  }
}

function drawShopProcedural(g, cx, baseY, powered) {
  const wallColor = powered ? 0x3498db : 0x888888;

  // Main structure
  g.beginFill(wallColor);
  g.drawRect(cx - 18, baseY - 20, 36, 15);
  g.endFill();

  // Awning
  g.beginFill(0xe74c3c);
  g.moveTo(cx - 20, baseY - 20);
  g.lineTo(cx - 18, baseY - 12);
  g.lineTo(cx + 18, baseY - 12);
  g.lineTo(cx + 20, baseY - 20);
  g.closePath();
  g.endFill();

  // Window
  g.beginFill(powered ? 0xffeaa7 : 0xddd);
  g.drawRect(cx - 12, baseY - 18, 24, 10);
  g.endFill();
}

function drawOfficeProcedural(g, cx, baseY, powered, floors) {
  const wallColor = powered ? 0x2c3e50 : 0x555555;
  const height = 20 + floors * 10;

  // Main tower
  g.beginFill(wallColor);
  g.drawRect(cx - 16, baseY - height, 32, height - 5);
  g.endFill();

  // Glass windows
  const windowColor = powered ? 0x74b9ff : 0x87ceeb;
  for (let f = 0; f < floors; f++) {
    g.beginFill(windowColor);
    g.drawRect(cx - 14, baseY - height + 6 + f * 10, 28, 6);
    g.endFill();
  }
}

function drawFactoryProcedural(g, cx, baseY, powered) {
  const wallColor = powered ? 0x7f8c8d : 0x555555;

  // Main building
  g.beginFill(wallColor);
  g.drawRect(cx - 22, baseY - 25, 44, 20);
  g.endFill();

  // Chimney
  g.beginFill(0x95a5a6);
  g.drawRect(cx + 10, baseY - 40, 8, 20);
  g.endFill();

  // Smoke if powered
  if (powered) {
    g.beginFill(0xddd, 0.5);
    g.drawCircle(cx + 14, baseY - 45, 5);
    g.drawCircle(cx + 16, baseY - 52, 4);
    g.endFill();
  }
}

function drawGenericBuilding(g, cx, baseY, powered, height) {
  g.beginFill(powered ? 0x8b7355 : 0x666666);
  g.drawRect(cx - 15, baseY - height, 30, height - 5);
  g.endFill();
}

/**
 * Draw a power line
 */
function drawPowerLine(from, to) {
  const isoFrom = cartToIso(from.x, from.y);
  const isoTo = cartToIso(to.x, to.y);
  const g = new PIXI.Graphics();

  // Poles
  g.lineStyle(3, 0x8b4513);
  g.moveTo(isoFrom.x, isoFrom.y + TILE_HEIGHT / 2);
  g.lineTo(isoFrom.x, isoFrom.y + TILE_HEIGHT / 2 - 20);
  g.moveTo(isoTo.x, isoTo.y + TILE_HEIGHT / 2);
  g.lineTo(isoTo.x, isoTo.y + TILE_HEIGHT / 2 - 20);

  // Wire
  g.lineStyle(1, 0x333333);
  const midX = (isoFrom.x + isoTo.x) / 2;
  const midY = (isoFrom.y + isoTo.y) / 2 + TILE_HEIGHT / 2 - 10;
  g.moveTo(isoFrom.x, isoFrom.y + TILE_HEIGHT / 2 - 18);
  g.quadraticCurveTo(midX, midY, isoTo.x, isoTo.y + TILE_HEIGHT / 2 - 18);

  g.zIndex = Math.max(from.x + from.y, to.x + to.y);
  return g;
}

/**
 * Draw a water pipe
 */
function drawWaterPipe(from, to) {
  const isoFrom = cartToIso(from.x, from.y);
  const isoTo = cartToIso(to.x, to.y);
  const g = new PIXI.Graphics();

  g.lineStyle(4, 0x3498db, 0.7);
  g.moveTo(isoFrom.x, isoFrom.y + TILE_HEIGHT / 2);
  g.lineTo(isoTo.x, isoTo.y + TILE_HEIGHT / 2);

  // Joints
  g.beginFill(0x2980b9);
  g.drawCircle(isoFrom.x, isoFrom.y + TILE_HEIGHT / 2, 4);
  g.drawCircle(isoTo.x, isoTo.y + TILE_HEIGHT / 2, 4);
  g.endFill();

  g.zIndex = Math.max(from.x + from.y, to.x + to.y);
  return g;
}

/**
 * Draw an agent
 */
function drawAgent(x, y) {
  const iso = cartToIso(x, y);
  const g = new PIXI.Graphics();

  // Body
  g.beginFill(0x3498db);
  g.drawCircle(iso.x, iso.y + TILE_HEIGHT / 2 - 8, 5);
  g.endFill();

  // Head
  g.beginFill(0xffe0bd);
  g.drawCircle(iso.x, iso.y + TILE_HEIGHT / 2 - 15, 4);
  g.endFill();

  g.zIndex = x + y;
  return g;
}

/**
 * Update UI displays
 */
function updateUI() {
  const { cityData, agents, buildings, currentPopulation } = state;

  if (cityData) {
    const dayDisplay = document.getElementById("day-display");
    if (dayDisplay) dayDisplay.textContent = cityData.time?.day || 1;

    const initBtn = document.getElementById("btn-init");
    if (initBtn) initBtn.style.display = "none";
  }

  const popDisplay = document.getElementById("population-display");
  if (popDisplay) popDisplay.textContent = currentPopulation || agents.length;

  const buildingsDisplay = document.getElementById("buildings-display");
  if (buildingsDisplay) buildingsDisplay.textContent = buildings.length;

  // Power stats
  const powerPlants = buildings.filter((b) => b.type === "power_plant");
  const totalCapacity = powerPlants.length * 10;
  const totalDemand =
    buildings.reduce((sum, b) => sum + (b.powerRequired || 0), 0) / 1000;
  const powerDisplay = document.getElementById("power-display");
  if (powerDisplay) {
    powerDisplay.textContent = `${totalDemand.toFixed(1)} / ${totalCapacity} kW`;
  }
}
