// ============================================
// MOLTCITY - Main Game Loop
// ============================================

import { GRID_SIZE, TILE_WIDTH, TILE_HEIGHT, COLORS } from './config.js';
import * as state from './state.js';
import { cartToIso } from './utils.js';
import { drawGrassTile, drawHighlight } from './render/tiles.js';
import { drawRoad, hasRoadAt } from './render/roads.js';
import { animateVehicles, initVehicles } from './render/vehicles.js';
import { animatePedestrians } from './render/pedestrians.js';
import { initClouds, initBirds, animateAmbient, updateDayNightOverlay } from './render/ambient.js';

let renderContainer = null;

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
}

/**
 * Render the entire city
 */
export function render() {
  const { worldContainer, parcels, buildings, roads, agents, powerLines, waterPipes } = state;

  // Clear previous render (remove all children except permanent containers)
  const permanentContainers = [
    state.cloudsContainer,
    state.birdsContainer,
    state.vehiclesContainer,
    state.pedestriansContainer,
  ];

  // Remove non-permanent children
  for (let i = worldContainer.children.length - 1; i >= 0; i--) {
    const child = worldContainer.children[i];
    if (!permanentContainers.includes(child)) {
      worldContainer.removeChild(child);
    }
  }

  // Create a new container for this render
  renderContainer = new PIXI.Container();
  renderContainer.sortableChildren = true;
  worldContainer.addChild(renderContainer);

  // Draw grid tiles (grass)
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const tile = drawGrassTile(x, y);
      renderContainer.addChild(tile);
    }
  }

  // Draw roads
  for (const road of roads) {
    const parcel = parcels.find((p) => p.id === road.parcelId);
    if (parcel) {
      const roadGraphic = drawRoad(parcel.x, parcel.y);
      renderContainer.addChild(roadGraphic);
    }
  }

  // Draw power lines
  for (const line of powerLines) {
    const lineGraphic = drawPowerLine(line.from, line.to);
    renderContainer.addChild(lineGraphic);
  }

  // Draw water pipes
  for (const pipe of waterPipes) {
    const pipeGraphic = drawWaterPipe(pipe.from, pipe.to);
    renderContainer.addChild(pipeGraphic);
  }

  // Draw buildings - sort by position for correct isometric depth
  // Buildings with lower (x + y) should render first (behind), higher (x + y) render last (in front)
  const buildingsWithParcels = buildings
    .map((building) => {
      const parcel = parcels.find((p) => p.id === building.parcelId);
      return parcel ? { building, parcel } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.parcel.x + a.parcel.y) - (b.parcel.x + b.parcel.y));

  for (const { building, parcel } of buildingsWithParcels) {
    const buildingGraphic = drawBuilding(parcel.x, parcel.y, building);
    renderContainer.addChild(buildingGraphic);
  }

  // Draw agents
  for (const agent of agents) {
    const agentGraphic = drawAgent(agent.currentLocation.x, agent.currentLocation.y);
    renderContainer.addChild(agentGraphic);
  }

  // Force sort by zIndex to ensure proper rendering order
  renderContainer.sortChildren();

  // Initialize vehicles after roads are loaded
  if (state.animatedVehicles.length === 0 && roads.length > 0) {
    initVehicles();
  }

  // Update UI
  updateUI();
}

/**
 * Draw a building at the given position
 */
function drawBuilding(x, y, building) {
  const iso = cartToIso(x, y);
  const g = new PIXI.Graphics();

  // Check if building is under construction
  if (building.constructionProgress < 100) {
    return drawConstruction(x, y, building);
  }

  const powered = building.powered;
  const type = building.type;
  const floors = building.floors || 1;

  // Try to use sprite first
  if (state.defaultSprites.has(type)) {
    const { texture, config } = state.defaultSprites.get(type);
    const sprite = new PIXI.Sprite(texture);
    const scale = (TILE_WIDTH * 1.2) / config.width;
    sprite.scale.set(scale);
    sprite.anchor.set(config.anchor.x, config.anchor.y);
    sprite.x = iso.x;
    sprite.y = iso.y + TILE_HEIGHT;
    // zIndex: use y * 100 + x for proper isometric depth sorting
    // This ensures buildings further down/right are always rendered on top
    sprite.zIndex = y * 100 + x + 10;

    // Tint if not powered
    if (!powered) {
      sprite.tint = 0x888888;
    }

    return sprite;
  }

  // Fallback to procedural drawing
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

  // zIndex: use y * 100 + x for proper isometric depth sorting
  g.zIndex = y * 100 + x + 10;
  return g;
}

/**
 * Draw construction site
 */
function drawConstruction(x, y, building) {
  const iso = cartToIso(x, y);
  const g = new PIXI.Graphics();
  const cx = iso.x;
  const baseY = iso.y + TILE_HEIGHT;
  const progress = building.constructionProgress;

  // Draw foundation
  g.beginFill(0x8b4513);
  g.drawRect(cx - 20, baseY - 5, 40, 10);
  g.endFill();

  // Draw scaffolding
  g.lineStyle(2, 0xdaa520);
  g.moveTo(cx - 15, baseY - 5);
  g.lineTo(cx - 15, baseY - 30);
  g.moveTo(cx + 15, baseY - 5);
  g.lineTo(cx + 15, baseY - 30);
  g.moveTo(cx - 15, baseY - 15);
  g.lineTo(cx + 15, baseY - 15);
  g.moveTo(cx - 15, baseY - 25);
  g.lineTo(cx + 15, baseY - 25);

  // Progress bar
  const barWidth = 30;
  const barHeight = 4;
  g.beginFill(0x333333);
  g.drawRect(cx - barWidth / 2, baseY - 40, barWidth, barHeight);
  g.endFill();

  g.beginFill(0x4ecdc4);
  g.drawRect(cx - barWidth / 2, baseY - 40, (progress / 100) * barWidth, barHeight);
  g.endFill();

  g.zIndex = y * 100 + x + 10;
  return g;
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

  g.zIndex = Math.max(from.y, to.y) * 100 + Math.max(from.x, to.x) + 7; // Above roads, below buildings
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

  g.zIndex = Math.max(from.y, to.y) * 100 + Math.max(from.x, to.x) + 6; // Above roads, below power lines
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

  g.zIndex = y * 100 + x + 50; // Higher than buildings to always appear on top
  return g;
}

/**
 * Update UI displays
 */
function updateUI() {
  const { cityData, agents, buildings, animatedVehicles, animatedPedestrians, currentPopulation } = state;

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

  const trafficDisplay = document.getElementById("traffic-display");
  if (trafficDisplay) {
    trafficDisplay.textContent = animatedVehicles.length + animatedPedestrians.length;
  }

  // Power stats
  const powerPlants = buildings.filter((b) => b.type === "power_plant");
  const totalCapacity = powerPlants.length * 10;
  const totalDemand = buildings.reduce((sum, b) => sum + (b.powerRequired || 0), 0) / 1000;
  const powerDisplay = document.getElementById("power-display");
  if (powerDisplay) {
    powerDisplay.textContent = `${totalDemand.toFixed(1)} / ${totalCapacity} kW`;
  }
}
