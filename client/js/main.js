// ============================================
// MOLTCITY - Main Entry Point
// ============================================

import * as state from "./state.js";
import * as api from "./api.js";
import { GRID_SIZE, COLORS, BUILDING_FOOTPRINTS } from "./config.js";
import { bresenhamLine } from "./utils.js";
import { initPixi, setupInteractions } from "./pixi/init.js";
import { initGame, render } from "./game.js";
import { connectWebSocket } from "./websocket.js";
import { loadSprites } from "./sprites.js";
import { drawHighlight } from "./render/tiles.js";
import {
  setupAuthUI,
  checkAuth,
  setOnAuthSuccess,
  showUserInfo,
} from "./ui/auth.js";
import { loadActivities, addActivity } from "./ui/activity.js";
import { loadElectionStatus, setupElectionUI } from "./ui/election.js";
import { setupLeaderboard } from "./ui/leaderboard.js";
import { showSpriteEditor } from "./ui/sprite-editor.js";
import { initDebugPanel, setDebugSelectedBuilding } from "./ui/debug.js";
import { initAdvisor } from "./ui/advisor.js";
import { subscribeToCityWs } from "./websocket.js";
import { startScreenshotCapture } from "./screenshot.js";
import { initTimelapse } from "./timelapse.js";
import { initReplay } from "./replay.js";

let appInitialized = false;

// Check for spectator mode (either /spectate path or ?mode=spectator query param)
const isSpectatorMode =
  window.location.pathname === "/spectate" ||
  new URLSearchParams(window.location.search).get("mode") === "spectator";

// Get cityId from URL if provided
const urlCityId = new URLSearchParams(window.location.search).get("cityId");

/**
 * Initialize the application
 */
async function initializeApp() {
  if (appInitialized) return;
  appInitialized = true;

  console.log("[MoltCity] Initializing...");

  try {
    // Initialize Pixi.js
    await initPixi();

    // Load sprites
    await loadSprites();

    // Load game config
    await loadGameConfig();

    // Load city data
    await loadCityData();

    // Setup interactions
    setupInteractions(
      handleTileClick,
      handleTileHover,
      handleDragStart,
      handleDragMove,
      handleDragEnd,
    );

    // Initialize game systems
    initGame();

    // Initial render
    render();

    // Connect WebSocket
    connectWebSocket(handleWebSocketMessage);

    // Start simulation
    await api.startSimulation();

    // Load social features
    await loadActivities();
    // Elections disabled — creator is mayor by default
    // await loadElectionStatus();
    // setupElectionUI();
    setupLeaderboard();
    initDebugPanel();
    initAdvisor();

    // Setup build menu
    setupBuildMenu();

    // Add cost labels to build menu options
    updateBuildMenuCosts();

    // Check if city hall is required (onboarding)
    checkCityHallRequired();

    // Start periodic screenshot capture
    startScreenshotCapture();

    // Initialize timelapse recorder
    initTimelapse();
    initReplay();

    console.log("[MoltCity] Initialization complete");
  } catch (error) {
    console.error("[MoltCity] Initialization failed:", error);
  }
}

/**
 * Load game configuration
 */
async function loadGameConfig() {
  try {
    const data = await api.getGameConfig();
    state.setGameConfig(data);
  } catch (error) {
    console.warn("[MoltCity] Failed to load game config:", error);
  }
}

/**
 * Update user's agent balance display
 */
async function updateUserBalance() {
  const balanceDisplay = document.getElementById("balance-display");
  const treasuryDisplay = document.getElementById("treasury-display");
  const treasuryStat = document.getElementById("treasury-stat");
  if (!balanceDisplay) return;

  const { currentUser } = state;
  if (!currentUser) {
    balanceDisplay.textContent = "$0";
    if (treasuryStat) treasuryStat.style.display = "none";
    return;
  }

  try {
    const data = await api.getMe();
    if (data.balance !== undefined) {
      balanceDisplay.textContent = `$${Math.ceil(data.balance).toLocaleString()}`;
    }
    // Show city treasury for mayor/admin
    if (data.treasury !== undefined && treasuryDisplay && treasuryStat) {
      treasuryStat.style.display = "";
      treasuryDisplay.textContent = `$${Math.ceil(data.treasury).toLocaleString()}`;
    } else if (treasuryStat) {
      treasuryStat.style.display = "none";
    }
  } catch (e) {
    // Fallback: try matching from local agents list
    const { agents } = state;
    const userAgent = agents.find(
      (a) => a.id === currentUser.agentId || a.moltbookId === currentUser.id,
    );
    if (userAgent && userAgent.wallet) {
      balanceDisplay.textContent = `$${Math.ceil(userAgent.wallet.balance).toLocaleString()}`;
    }
  }
}

/**
 * Load all city data for the current city
 */
async function loadCityData() {
  try {
    // Load cities list
    let citiesResponse;
    try {
      citiesResponse = await api.getCities();
    } catch {
      citiesResponse = { cities: [] };
    }
    const cities = citiesResponse.cities || [];
    state.setCitiesList(cities);

    // Pick a city to load - prefer URL param if provided
    if (urlCityId) {
      state.setCurrentCityId(urlCityId);
      console.log("[MoltCity] Using cityId from URL:", urlCityId);
    } else if (!state.currentCityId && cities.length > 0) {
      // Pick user's first city, or just the first available
      const userCity = state.currentUser
        ? cities.find(
            (c) =>
              c.createdBy === state.currentUser.id ||
              c.mayorId === state.currentUser.id,
          )
        : null;
      state.setCurrentCityId(userCity ? userCity.id : cities[0].id);
    }

    // If no cities exist, auto-create one
    if (cities.length === 0) {
      console.log("[MoltCity] No cities, auto-creating...");
      const newCity = await api.createCity("MoltCity");
      const city = newCity.city || newCity;
      state.setCurrentCityId(city.id);
      state.setCitiesList([city]);
    }

    // Subscribe WebSocket to this city
    if (state.currentCityId) {
      subscribeToCityWs(state.currentCityId);
    }

    // Load city details
    const cityResponse = await api.getCity();
    if (cityResponse.city) {
      state.setCityData(cityResponse.city);
    }

    // Re-evaluate mayor status now that city data is loaded
    showUserInfo();

    // Load parcels
    const parcelsResponse = await api.getParcels();
    state.setParcels(parcelsResponse.parcels || []);

    // Load buildings
    const buildingsResponse = await api.getBuildings();
    state.setBuildings(buildingsResponse.buildings || []);

    // Load roads
    const roadsResponse = await api.getRoads();
    state.setRoads(roadsResponse.roads || []);

    // Load agents
    const agentsResponse = await api.getAgents();
    state.setAgents(agentsResponse.agents || []);

    // Load infrastructure
    const powerLinesResponse = await api.getPowerLines();
    state.setPowerLines(powerLinesResponse.powerLines || []);

    const waterPipesResponse = await api.getWaterPipes();
    state.setWaterPipes(waterPipesResponse.waterPipes || []);

    // Update user's agent balance
    updateUserBalance();

    // Update city name display
    updateCityNameDisplay();

    // Build city selector UI
    buildCitySelectorUI();

    console.log("[MoltCity] City data loaded for", state.currentCityId);
  } catch (error) {
    console.error("[MoltCity] Failed to load city data:", error);
  }
}

/**
 * Switch to a different city
 */
export async function switchCity(cityId) {
  if (cityId === state.currentCityId) return;
  console.log(`[MoltCity] Switching to city ${cityId}`);

  state.setCurrentCityId(cityId);

  // Clear state
  state.setParcels([]);
  state.setBuildings([]);
  state.setRoads([]);
  state.setAgents([]);
  state.setPowerLines([]);
  state.setWaterPipes([]);
  state.setCityData(null);

  // Re-subscribe WebSocket
  subscribeToCityWs(cityId);

  // Re-load all data for the new city
  const cityResponse = await api.getCity();
  if (cityResponse.city) {
    state.setCityData(cityResponse.city);
  }

  // Re-evaluate mayor status for the new city
  showUserInfo();

  const [parcelsR, buildingsR, roadsR, agentsR, powerR, waterR] =
    await Promise.all([
      api.getParcels(),
      api.getBuildings(),
      api.getRoads(),
      api.getAgents(),
      api.getPowerLines(),
      api.getWaterPipes(),
    ]);

  state.setParcels(parcelsR.parcels || []);
  state.setBuildings(buildingsR.buildings || []);
  state.setRoads(roadsR.roads || []);
  state.setAgents(agentsR.agents || []);
  state.setPowerLines(powerR.powerLines || []);
  state.setWaterPipes(waterR.waterPipes || []);

  updateUserBalance();
  updateCityNameDisplay();

  // Re-render
  render();
  await loadActivities();

  // Re-check city hall onboarding for the new city
  checkCityHallRequired();
}

/**
 * Update the city name display in the toolbar
 */
function updateCityNameDisplay() {
  const nameEl = document.getElementById("city-name-display");
  if (nameEl && state.cityData) {
    nameEl.textContent = state.cityData.name || "MoltCity";
  }
}

/**
 * Build city selector dropdown UI
 */
function buildCitySelectorUI() {
  const container = document.getElementById("city-selector");
  if (!container) return;

  const cities = state.citiesList;
  container.style.display = "";
  container.innerHTML = "";

  if (cities.length > 1) {
    const select = document.createElement("select");
    select.className = "city-select";
    select.style.cssText =
      "background:#2a2a2a;color:#fff;border:1px solid #555;padding:2px 4px;font-size:12px;border-radius:3px;cursor:pointer;";
    for (const city of cities) {
      const opt = document.createElement("option");
      opt.value = city.id;
      opt.textContent = city.name;
      if (city.id === state.currentCityId) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => {
      switchCity(select.value);
    });
    container.appendChild(select);
  }

  // "New City" button
  const btn = document.createElement("button");
  btn.textContent = "+";
  btn.title = "Create new city";
  btn.style.cssText =
    "background:#4ecdc4;color:#000;border:none;padding:2px 6px;font-size:12px;border-radius:3px;cursor:pointer;margin-left:4px;font-weight:bold;";
  btn.addEventListener("click", async () => {
    const name = prompt("Enter a name for your new city:");
    if (!name || !name.trim()) return;
    try {
      const result = await api.createCity(name.trim());
      const city = result.city || result;
      state.setCitiesList([...state.citiesList, city]);
      await switchCity(city.id);
      buildCitySelectorUI();
    } catch (e) {
      alert("Failed to create city: " + e.message);
    }
  });
  container.appendChild(btn);
}

/**
 * Handle tile click
 */
async function handleTileClick(x, y, globalPos) {
  console.log(`[MoltCity] Tile clicked: (${x}, ${y})`);

  const { selectedBuildType } = state;

  // Demolish mode
  if (selectedBuildType === "demolish") {
    await handleDemolish(x, y, globalPos);
    return;
  }

  // If a build type is selected, try to build
  if (selectedBuildType) {
    await handleBuild(x, y, selectedBuildType);
    return;
  }

  // Otherwise, show info about what's at this location
  const parcel = state.parcels.find((p) => p.x === x && p.y === y);
  const building = state.buildings.find((b) => {
    const p = state.parcels.find((p) => p.id === b.parcelId);
    return p && p.x === x && p.y === y;
  });

  if (building) {
    showBuildingInfo(building);
    setDebugSelectedBuilding(building);
    const bParcel = state.parcels.find((p) => p.id === building.parcelId);
    if (bParcel) showSpriteEditor(building, bParcel.x, bParcel.y);
  } else if (parcel) {
    showParcelInfo(parcel);
  }
}

/**
 * Check if a tile is occupied by a building or road (accounting for multi-tile footprints)
 */
function isTileOccupied(x, y) {
  // Check roads
  const hasRoad = state.roads.some((r) => {
    const p = state.parcels.find((p) => p.id === r.parcelId);
    return p && p.x === x && p.y === y;
  });
  if (hasRoad) return true;

  // Check all buildings (including multi-tile footprints)
  for (const building of state.buildings) {
    const p = state.parcels.find((p) => p.id === building.parcelId);
    if (!p) continue;
    const w = building.width || 1;
    const h = building.height || 1;
    if (x >= p.x && x < p.x + w && y >= p.y && y < p.y + h) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a tile is water terrain
 */
function isTileWater(x, y) {
  const parcel = state.parcels.find((p) => p.x === x && p.y === y);
  return parcel && parcel.terrain === "water";
}

/**
 * Show/clear placement hint highlights (e.g. water-adjacent tiles for water tower)
 */
function updatePlacementHints(buildType) {
  // Remove existing hints
  if (state.placementHintLayer) {
    state.placementHintLayer.destroy({ children: true });
    state.setPlacementHintLayer(null);
  }

  if (buildType !== "water_tower") return;

  // Find all land tiles adjacent to water
  const waterSet = new Set();
  for (const p of state.parcels) {
    if (p.terrain === "water") waterSet.add(`${p.x},${p.y}`);
  }

  const validTiles = new Set();
  for (const key of waterSet) {
    const [wx, wy] = key.split(",").map(Number);
    for (let dx = -2; dx <= 1; dx++) {
      for (let dy = -2; dy <= 1; dy++) {
        const tx = wx + dx;
        const ty = wy + dy;
        const tKey = `${tx},${ty}`;
        if (!waterSet.has(tKey) && !validTiles.has(tKey)) {
          const p = state.parcels.find((p) => p.x === tx && p.y === ty);
          if (p && p.terrain !== "water") validTiles.add(tKey);
        }
      }
    }
  }

  if (validTiles.size === 0) return;

  const container = new PIXI.Container();
  container.zIndex = 500;
  container.alpha = 0.6;
  for (const key of validTiles) {
    const [tx, ty] = key.split(",").map(Number);
    const h = drawHighlight(tx, ty, 0x00aaff, false);
    container.addChild(h);
  }
  state.worldContainer.addChild(container);
  state.setPlacementHintLayer(container);
}

/**
 * Find a building covering a tile (accounts for multi-tile footprints)
 */
function findBuildingAtTile(x, y) {
  for (const building of state.buildings) {
    const p = state.parcels.find((p) => p.id === building.parcelId);
    if (!p) continue;
    const w = building.width || 1;
    const h = building.height || 1;
    if (x >= p.x && x < p.x + w && y >= p.y && y < p.y + h) {
      return building;
    }
  }
  return null;
}

/**
 * Find a road at a tile
 */
function findRoadAtTile(x, y) {
  return (
    state.roads.find((r) => {
      const p = state.parcels.find((p) => p.id === r.parcelId);
      return p && p.x === x && p.y === y;
    }) || null
  );
}

/**
 * Find a power line connected to a tile
 */
function findPowerLineAtTile(x, y) {
  return (
    state.powerLines.find(
      (l) =>
        (l.from.x === x && l.from.y === y) || (l.to.x === x && l.to.y === y),
    ) || null
  );
}

/**
 * Find a water pipe connected to a tile
 */
function findWaterPipeAtTile(x, y) {
  return (
    state.waterPipes.find(
      (p) =>
        (p.from.x === x && p.from.y === y) || (p.to.x === x && p.to.y === y),
    ) || null
  );
}

/**
 * Find all power lines connected to a tile
 */
function findAllPowerLinesAtTile(x, y) {
  return state.powerLines.filter(
    (l) =>
      (l.from.x === x && l.from.y === y) || (l.to.x === x && l.to.y === y),
  );
}

/**
 * Find all water pipes connected to a tile
 */
function findAllWaterPipesAtTile(x, y) {
  return state.waterPipes.filter(
    (p) =>
      (p.from.x === x && p.from.y === y) || (p.to.x === x && p.to.y === y),
  );
}

/**
 * Collect all demolishable objects at a tile
 * Returns array of { type, label, icon, action }
 */
function collectDemolishTargets(x, y) {
  const targets = [];

  const building = findBuildingAtTile(x, y);
  if (building) {
    targets.push({
      type: "building",
      label: `${building.name} (${building.type})`,
      icon: "\u{1F3E0}",
      action: async () => {
        await api.demolishBuilding(building.id);
        const resp = await api.getBuildings();
        state.setBuildings(resp.buildings || []);
        render();
        showToast(`Demolished ${building.name}`);
      },
    });
  }

  const road = findRoadAtTile(x, y);
  if (road) {
    targets.push({
      type: "road",
      label: "Road",
      icon: "\u{1F6E4}\uFE0F",
      action: async () => {
        await api.deleteRoad(road.id);
        const resp = await api.getRoads();
        state.setRoads(resp.roads || []);
        render();
        showToast(`Road removed at (${x}, ${y})`);
      },
    });
  }

  for (const pl of findAllPowerLinesAtTile(x, y)) {
    targets.push({
      type: "power_line",
      label: `Power line (${pl.from.x},${pl.from.y})\u2192(${pl.to.x},${pl.to.y})`,
      icon: "\u26A1",
      action: async () => {
        await api.deletePowerLine(pl.id);
        const resp = await api.getPowerLines();
        state.setPowerLines(resp.powerLines || []);
        render();
        showToast("Power line removed");
      },
    });
  }

  for (const wp of findAllWaterPipesAtTile(x, y)) {
    targets.push({
      type: "water_pipe",
      label: `Water pipe (${wp.from.x},${wp.from.y})\u2192(${wp.to.x},${wp.to.y})`,
      icon: "\u{1F4A7}",
      action: async () => {
        await api.deleteWaterPipe(wp.id);
        const resp = await api.getWaterPipes();
        state.setWaterPipes(resp.waterPipes || []);
        render();
        showToast("Water pipe removed");
      },
    });
  }

  const parcel = state.parcels.find((p) => p.x === x && p.y === y);
  if (parcel && parcel.zoning) {
    targets.push({
      type: "zoning",
      label: `${parcel.zoning} zoning`,
      icon: "\u{1F4CD}",
      action: async () => {
        await api.setZoning(parcel.id, null);
        parcel.zoning = null;
        render();
        showToast(`Zoning removed at (${x}, ${y})`);
      },
    });
  }

  return targets;
}

/**
 * Apply infrastructure fade: when placing water pipes or power lines,
 * hide buildings that don't need that utility (alpha 0) and fade the rest.
 */
const NO_WATER_BUILDING_TYPES = ["wind_turbine", "water_tower", "road"];
const NO_POWER_BUILDING_TYPES = ["wind_turbine", "coal_plant", "nuclear_plant", "power_plant", "road"];

function applyInfraFade(buildType) {
  const scene = state.sceneLayer;
  if (!scene) return;

  const infraTypes = ["water_pipe", "power_line"];
  if (!infraTypes.includes(buildType)) {
    // Reset everything
    scene.alpha = 1;
    for (const child of scene.children) {
      child.alpha = 1;
    }
    return;
  }

  const skipTypes = buildType === "water_pipe" ? NO_WATER_BUILDING_TYPES : NO_POWER_BUILDING_TYPES;
  scene.alpha = 1;
  for (const child of scene.children) {
    if (child._buildingType) {
      child.alpha = skipTypes.includes(child._buildingType) ? 0 : 0.5;
    } else {
      child.alpha = 0.5;
    }
  }
}

// --- Demolish picker popup ---

let demolishPickerOutsideHandler = null;
let demolishPickerEscHandler = null;

function showDemolishPicker(targets, screenX, screenY) {
  const picker = document.getElementById("demolish-picker");
  if (!picker) return;

  picker.innerHTML = targets
    .map(
      (t, i) =>
        `<div class="demolish-picker-item" data-idx="${i}"><span class="dp-icon">${t.icon}</span>${t.label}</div>`,
    )
    .join("");

  picker.style.display = "block";

  // Position clamped to viewport
  const pad = 8;
  const rect = picker.getBoundingClientRect();
  let left = screenX;
  let top = screenY;
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - pad - rect.width;
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - pad - rect.height;
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;

  // Item click handlers
  picker.querySelectorAll(".demolish-picker-item").forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const idx = parseInt(el.dataset.idx, 10);
      closeDemolishPicker();
      try {
        await targets[idx].action();
      } catch (err) {
        console.error("[MoltCity] Demolish failed:", err.message);
        showToast(`Demolish failed: ${err.message}`, true);
      }
    });
  });

  // Outside click
  demolishPickerOutsideHandler = (e) => {
    if (!picker.contains(e.target)) {
      closeDemolishPicker();
    }
  };
  setTimeout(() => document.addEventListener("pointerdown", demolishPickerOutsideHandler), 0);

  // ESC key
  demolishPickerEscHandler = (e) => {
    if (e.key === "Escape") {
      e.stopImmediatePropagation();
      closeDemolishPicker();
    }
  };
  document.addEventListener("keydown", demolishPickerEscHandler, true);
}

function closeDemolishPicker() {
  const picker = document.getElementById("demolish-picker");
  if (picker) {
    picker.style.display = "none";
    picker.innerHTML = "";
  }
  if (demolishPickerOutsideHandler) {
    document.removeEventListener("pointerdown", demolishPickerOutsideHandler);
    demolishPickerOutsideHandler = null;
  }
  if (demolishPickerEscHandler) {
    document.removeEventListener("keydown", demolishPickerEscHandler, true);
    demolishPickerEscHandler = null;
  }
}

/**
 * Handle demolish action at a tile
 */
async function handleDemolish(x, y, globalPos) {
  closeDemolishPicker();
  const targets = collectDemolishTargets(x, y);

  if (targets.length === 0) {
    showToast("Nothing to demolish here", true);
    return;
  }

  if (targets.length === 1) {
    try {
      await targets[0].action();
    } catch (error) {
      console.error("[MoltCity] Demolish failed:", error.message);
      showToast(`Demolish failed: ${error.message}`, true);
    }
    return;
  }

  // Multiple targets — show picker
  const screenX = globalPos ? globalPos.x : window.innerWidth / 2;
  const screenY = globalPos ? globalPos.y : window.innerHeight / 2;
  showDemolishPicker(targets, screenX, screenY);
}

/**
 * Handle building/road creation
 */
async function handleBuild(x, y, buildType) {
  try {
    // Block all building on water
    if (isTileWater(x, y)) {
      showToast("Cannot build on water", true);
      return;
    }

    if (buildType === "road") {
      // Check tile is not occupied by a building
      if (findBuildingAtTile(x, y)) {
        showToast(`Cannot place road: building at (${x}, ${y})`, true);
        return;
      }
      // Create road
      const result = await api.createRoad({ x, y });
      console.log("[MoltCity] Road created:", result);

      // Reload parcels + roads and re-render
      const [parcelsR, roadsResponse] = await Promise.all([
        api.getParcels(),
        api.getRoads(),
      ]);
      state.setParcels(parcelsR.parcels || []);
      state.setRoads(roadsResponse.roads || []);
      render();
      showToast(`Road placed at (${x}, ${y})`);
      updateUserBalance();
    } else if (buildType === "power_line" || buildType === "water_pipe") {
      // Infrastructure requires start/end points - two-click interaction
      if (!state.infraStartPoint) {
        // First click: set start point
        state.setInfraStartPoint({ x, y });
        console.log(
          `[MoltCity] Infrastructure start point set: (${x}, ${y}). Click again to set endpoint.`,
        );
      } else {
        // Second click: create the infrastructure
        const start = state.infraStartPoint;
        state.setInfraStartPoint(null);

        if (buildType === "power_line") {
          const result = await api.createPowerLine(start.x, start.y, x, y);
          console.log("[MoltCity] Power line created:", result);
          const powerLinesResponse = await api.getPowerLines();
          state.setPowerLines(powerLinesResponse.powerLines || []);
        } else {
          const result = await api.createWaterPipe(start.x, start.y, x, y);
          console.log("[MoltCity] Water pipe created:", result);
          const waterPipesResponse = await api.getWaterPipes();
          state.setWaterPipes(waterPipesResponse.waterPipes || []);
        }
        render();
        updateUserBalance();
      }
    } else {
      // Zone types: paint zoning instead of creating buildings directly
      const ZONE_TYPES = ["residential", "offices", "industrial", "suburban"];
      const ZONE_MAPPING = {
        residential: "residential",
        offices: "office",
        industrial: "industrial",
        suburban: "suburban",
      };

      if (ZONE_TYPES.includes(buildType)) {
        // Check tile is not occupied
        if (isTileOccupied(x, y)) {
          showToast(`Tile (${x}, ${y}) is already occupied`, true);
          return;
        }

        const zoning = ZONE_MAPPING[buildType];
        await api.setZoning(x, y, zoning);
        console.log("[MoltCity] Zoning set:", zoning, "at", x, y);

        // Reload parcels and re-render
        const parcelsResp = await api.getParcels();
        state.setParcels(parcelsResp.parcels || []);
        render();
        showToast(`${buildType} zone placed at (${x}, ${y})`);
        updateUserBalance();
      } else {
        // Non-zone buildings: create directly
        const buildingNames = {
          house: "House",
          apartment: "Apartment",
          shop: "Shop",
          office: "Office",
          factory: "Factory",
          park: "Park",
          power_plant: "Power Plant",
          wind_turbine: "Wind Turbine",
          coal_plant: "Coal Plant",
          nuclear_plant: "Nuclear Plant",
          water_tower: "Water Tower",
          police_station: "Police Station",
          fire_station: "Fire Station",
          hospital: "Hospital",
          jail: "Jail",
          university: "University",
          stadium: "Stadium",
          city_hall: "City Hall",
        };
        const name = buildingNames[buildType] || buildType;

        // Check multi-tile footprint fits and is available
        const footprint = BUILDING_FOOTPRINTS[buildType] || { w: 1, h: 1 };
        for (let dy = 0; dy < footprint.h; dy++) {
          for (let dx = 0; dx < footprint.w; dx++) {
            const tx = x + dx;
            const ty = y + dy;
            if (tx >= GRID_SIZE || ty >= GRID_SIZE) {
              showToast(`${name} doesn't fit here (out of bounds)`, true);
              return;
            }
            if (isTileOccupied(tx, ty)) {
              showToast(`Tile (${tx}, ${ty}) is already occupied`, true);
              return;
            }
          }
        }

        const result = await api.createBuilding({
          type: buildType,
          name,
          x,
          y,
          floors: 1,
        });
        console.log("[MoltCity] Building created:", result);

        // Reload parcels + buildings and re-render
        const [parcelsR2, buildingsResponse] = await Promise.all([
          api.getParcels(),
          api.getBuildings(),
        ]);
        state.setParcels(parcelsR2.parcels || []);
        state.setBuildings(buildingsResponse.buildings || []);
        render();
        showToast(`${name} placed at (${x}, ${y})`);
        updateUserBalance();

        // Unlock full build menu after city hall placement
        if (buildType === "city_hall") {
          exitCityHallMode();
        }
      }
    }
  } catch (error) {
    console.error("[MoltCity] Build failed:", error.message);
    showToast(`Build failed: ${error.message}`, true);
  }
}

/**
 * Handle tile hover
 */
function handleTileHover(x, y, globalPos) {
  if (state.isDragDrawing) return;
  updateTooltip(x, y, globalPos);

  // Show build cursor highlight when a build type is selected
  if (state.highlightGraphics) {
    state.worldContainer.removeChild(state.highlightGraphics);
    state.setHighlightGraphics(null);
  }
  if (
    state.selectedBuildType &&
    x >= 0 &&
    x < GRID_SIZE &&
    y >= 0 &&
    y < GRID_SIZE
  ) {
    if (state.selectedBuildType === "demolish") {
      // Demolish mode: red highlight, expand to building footprint if hovering one
      const building = findBuildingAtTile(x, y);
      if (building) {
        const p = state.parcels.find((p) => p.id === building.parcelId);
        const bw = building.width || 1;
        const bh = building.height || 1;
        const container = new PIXI.Container();
        container.sortableChildren = true;
        container.zIndex = 1000;
        for (let dy = 0; dy < bh; dy++) {
          for (let dx = 0; dx < bw; dx++) {
            const highlight = drawHighlight(p.x + dx, p.y + dy, 0xff0000, true);
            container.addChild(highlight);
          }
        }
        state.worldContainer.addChild(container);
        state.setHighlightGraphics(container);
      } else {
        const highlight = drawHighlight(x, y, 0xff0000, true);
        state.worldContainer.addChild(highlight);
        state.setHighlightGraphics(highlight);
      }
    } else {
      // Build mode: green/red footprint highlight
      const footprint = BUILDING_FOOTPRINTS[state.selectedBuildType] || {
        w: 1,
        h: 1,
      };
      const container = new PIXI.Container();
      container.sortableChildren = true;
      container.zIndex = 1000;

      for (let dy = 0; dy < footprint.h; dy++) {
        for (let dx = 0; dx < footprint.w; dx++) {
          const tx = x + dx;
          const ty = y + dy;
          if (tx >= GRID_SIZE || ty >= GRID_SIZE) continue;
          const occupied = isTileOccupied(tx, ty) || isTileWater(tx, ty);
          const color = occupied ? 0xff0000 : COLORS.selected;
          const highlight = drawHighlight(tx, ty, color, true);
          container.addChild(highlight);
        }
      }

      state.worldContainer.addChild(container);
      state.setHighlightGraphics(container);
    }
  }
}

// ============================================
// Drag-to-Draw Handlers
// ============================================

const ZONE_TYPES = ["residential", "offices", "industrial", "suburban"];
const ZONE_MAPPING = {
  residential: "residential",
  offices: "office",
  industrial: "industrial",
  suburban: "suburban",
};

/**
 * Handle drag start — begin drawing roads or zoning
 */
function handleDragStart(x, y) {
  const { selectedBuildType } = state;
  if (!selectedBuildType) return;

  state.setIsDragDrawing(true);
  state.setDragDrawStart({ x, y });

  if (selectedBuildType === "road") {
    state.setDragDrawTiles([{ x, y }]);
  } else {
    state.setDragDrawTiles([{ x, y }]);
  }

  // Create preview container
  const container = new PIXI.Container();
  container.sortableChildren = true;
  container.zIndex = 1000;
  state.worldContainer.addChild(container);
  state.setDragDrawPreview(container);

  updateDragPreview(x, y);
}

/**
 * Handle drag move — update tiles and preview
 */
function handleDragMove(x, y, globalPos) {
  const { selectedBuildType, dragDrawTiles } = state;
  if (!state.isDragDrawing || !selectedBuildType) return;

  if (selectedBuildType === "road") {
    // Free-line: interpolate from last tile to current using bresenham
    const last = dragDrawTiles[dragDrawTiles.length - 1];
    if (last.x === x && last.y === y) return;

    const interpolated = bresenhamLine(last.x, last.y, x, y);
    for (const pt of interpolated) {
      if (!dragDrawTiles.some((t) => t.x === pt.x && t.y === pt.y)) {
        dragDrawTiles.push(pt);
      }
    }
    state.setDragDrawTiles(dragDrawTiles);
  } else if (ZONE_TYPES.includes(selectedBuildType)) {
    // Rectangle fill from start to current
    const start = state.dragDrawStart;
    const minX = Math.min(start.x, x);
    const maxX = Math.max(start.x, x);
    const minY = Math.min(start.y, y);
    const maxY = Math.max(start.y, y);
    const tiles = [];
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        tiles.push({ x: tx, y: ty });
      }
    }
    state.setDragDrawTiles(tiles);
  }

  updateDragPreview(x, y);
  updateDragTooltip(globalPos);
}

/**
 * Update the visual preview overlay during drag
 */
function updateDragPreview() {
  const { dragDrawPreview, dragDrawTiles, selectedBuildType } = state;
  if (!dragDrawPreview) return;

  dragDrawPreview.removeChildren();

  const isZoning = ZONE_TYPES.includes(selectedBuildType);
  for (const tile of dragDrawTiles) {
    // For zoning, check water only; for roads, check occupancy + water
    const water = isTileWater(tile.x, tile.y);
    const occupied = water || (!isZoning && isTileOccupied(tile.x, tile.y));
    const color = occupied ? 0xff0000 : COLORS.selected;
    const highlight = drawHighlight(tile.x, tile.y, color, true);
    dragDrawPreview.addChild(highlight);
  }
}

/**
 * Update the tooltip during drag with tile count and cost
 */
function updateDragTooltip(globalPos) {
  const badge = document.getElementById("drag-cost");
  if (!badge || !globalPos) return;

  const { selectedBuildType, dragDrawTiles, gameConfig } = state;
  const isZoning = ZONE_TYPES.includes(selectedBuildType);
  const validCount = isZoning
    ? dragDrawTiles.length
    : dragDrawTiles.filter((t) => !isTileOccupied(t.x, t.y)).length;

  let costPer = 0;
  if (ZONE_TYPES.includes(selectedBuildType)) {
    costPer = gameConfig?.zoningCost || 0;
  } else if (selectedBuildType === "road") {
    costPer = gameConfig?.costs?.road || 0;
  }

  const totalCost = validCount * costPer;

  badge.innerHTML = `${validCount} tile${validCount !== 1 ? 's' : ''} &middot; <span class="cost">$${Math.ceil(totalCost).toLocaleString()}</span>`;
  badge.style.display = "block";
  badge.style.left = `${globalPos.x + 15}px`;
  badge.style.top = `${globalPos.y - 35}px`;
}

/**
 * Handle drag end — submit batch placement
 */
async function handleDragEnd() {
  const { selectedBuildType, dragDrawTiles, dragDrawPreview } = state;

  // Clean up preview
  if (dragDrawPreview) {
    state.worldContainer.removeChild(dragDrawPreview);
    dragDrawPreview.destroy({ children: true });
    state.setDragDrawPreview(null);
  }

  state.setIsDragDrawing(false);
  state.setDragDrawStart(null);

  // Filter out water tiles and occupied tiles
  const isZoning = ZONE_TYPES.includes(selectedBuildType);
  const validTiles = dragDrawTiles.filter((t) => {
    if (isTileWater(t.x, t.y)) return false;
    if (!isZoning && isTileOccupied(t.x, t.y)) return false;
    return true;
  });
  state.setDragDrawTiles([]);

  const tooltip = document.getElementById("tooltip");
  if (tooltip) tooltip.style.display = "none";
  const dragCost = document.getElementById("drag-cost");
  if (dragCost) dragCost.style.display = "none";

  if (validTiles.length === 0) return;

  try {
    if (selectedBuildType === "road") {
      const result = await api.createRoadsBatch(validTiles);
      showToast(`${result.created} roads placed`);
    } else if (isZoning) {
      const zoning = ZONE_MAPPING[selectedBuildType];
      const result = await api.setZoningBatch(validTiles, zoning);
      showToast(`${result.zoned} tiles zoned as ${selectedBuildType}`);
    }

    // Reload state and re-render
    const [parcelsR, roadsR] = await Promise.all([
      api.getParcels(),
      api.getRoads(),
    ]);
    state.setParcels(parcelsR.parcels || []);
    state.setRoads(roadsR.roads || []);
    render();
    updateUserBalance();
  } catch (error) {
    console.error("[MoltCity] Batch draw failed:", error.message);
    showToast(`Draw failed: ${error.message}`, true);
  }
}

/**
 * Cancel an in-progress drag-draw
 */
function cancelDragDraw() {
  if (state.dragDrawPreview) {
    state.worldContainer.removeChild(state.dragDrawPreview);
    state.dragDrawPreview.destroy({ children: true });
    state.setDragDrawPreview(null);
  }
  state.setIsDragDrawing(false);
  state.setDragDrawStart(null);
  state.setDragDrawTiles([]);
  const tooltip = document.getElementById("tooltip");
  if (tooltip) tooltip.style.display = "none";
  const dragCost = document.getElementById("drag-cost");
  if (dragCost) dragCost.style.display = "none";
}

/**
 * Handle WebSocket messages
 */
function handleWebSocketMessage(type, data) {
  switch (type) {
    case "tick":
      // Re-render on tick if needed
      break;

    case "activity":
      addActivity(data);
      break;

    case "election":
      // Elections disabled — creator is mayor by default
      break;

    case "infrastructure_update":
      // Buildings were already re-fetched by websocket.js, just re-render
      render();
      break;

    case "buildings_update":
      // New buildings auto-built by simulation, re-render
      render();
      break;
  }
}

/**
 * Show building info panel
 */
function showBuildingInfo(building) {
  const panel = document.getElementById("building-info-panel");
  if (!panel) return;

  // Building type icons
  const BUILDING_ICONS = {
    house: "🏠",
    apartment: "🏢",
    shop: "🏪",
    office: "🏢",
    factory: "🏭",
    power_plant: "⚡",
    wind_turbine: "🌀",
    coal_plant: "⚡",
    nuclear_plant: "☢️",
    water_tower: "💧",
    park: "🌳",
    police_station: "🚔",
    jail: "🔒",
    road: "🛣️",
  };

  // Update panel content
  const iconEl = document.getElementById("building-icon");
  const nameEl = document.getElementById("building-name");
  const typeEl = document.getElementById("building-type");
  const floorsEl = document.getElementById("building-floors");
  const powerEl = document.getElementById("building-power");
  const waterEl = document.getElementById("building-water");
  const ownerEl = document.getElementById("building-owner");
  if (iconEl) iconEl.textContent = BUILDING_ICONS[building.type] || "🏠";
  if (nameEl) nameEl.textContent = building.name || building.type;
  if (typeEl) typeEl.textContent = building.type;
  if (floorsEl) floorsEl.textContent = building.floors || 1;
  if (powerEl)
    powerEl.textContent = building.powered ? "Connected" : "No Power";
  const NO_WATER_TYPES = ["wind_turbine", "water_tower", "road"];
  if (waterEl)
    waterEl.textContent = NO_WATER_TYPES.includes(building.type)
      ? "Not Required"
      : building.hasWater ? "Connected" : "No Water";
  const wasteEl = document.getElementById("building-waste");
  const NO_WASTE_TYPES = ["wind_turbine", "water_tower", "road", "power_plant", "coal_plant", "nuclear_plant", "park", "plaza", "garbage_depot", "city_hall"];
  if (wasteEl)
    wasteEl.textContent = NO_WASTE_TYPES.includes(building.type)
      ? "Not Required"
      : building.hasWaste ? "Collected" : "No Collection";
  const garbageEl = document.getElementById("building-garbage");
  if (garbageEl) {
    const gl = building.garbageLevel || 0;
    if (NO_WASTE_TYPES.includes(building.type)) {
      garbageEl.textContent = "N/A";
      garbageEl.style.color = "#888";
    } else if (gl === 0) {
      garbageEl.textContent = "Clean";
      garbageEl.style.color = "#4ecdc4";
    } else {
      garbageEl.textContent = `${gl}/100`;
      garbageEl.style.color = gl > 70 ? "#ff6b6b" : gl > 40 ? "#ffa500" : "#ffd700";
    }
  }
  if (ownerEl)
    ownerEl.textContent = building.ownerId
      ? building.ownerId.slice(0, 8) + "..."
      : "Unknown";

  // Density upgrade section
  const upgradeEl = document.getElementById("density-upgrade-info");
  const checklistEl = document.getElementById("density-checklist");
  const tipsEl = document.getElementById("density-tips");
  const densityCurEl = document.getElementById("density-current");
  const ZONE_TYPES = ["residential", "offices", "industrial", "suburban"];

  if (upgradeEl && checklistEl && tipsEl && densityCurEl) {
    if (ZONE_TYPES.includes(building.type)) {
      upgradeEl.style.display = "block";
      checklistEl.innerHTML = '<span style="color:#888;font-size:11px">Loading...</span>';
      tipsEl.innerHTML = "";
      densityCurEl.textContent = building.density || 1;

      api.getUpgradeInfo(building.id).then(data => {
        if (data.error) {
          checklistEl.innerHTML = "";
          upgradeEl.style.display = "none";
          return;
        }

        densityCurEl.textContent = `${data.currentDensity} / ${data.maxDensity}`;

        if (data.nextDensity === null) {
          checklistEl.innerHTML = '<div style="color:#4ecdc4;font-size:12px;padding:2px 0">✅ Maximum density reached</div>';
          tipsEl.innerHTML = "";
          return;
        }

        // Render checklist
        const reqs = data.requirements;
        const rows = [
          { ...reqs.powered },
          { ...reqs.road },
          { ...reqs.demand, current: `${reqs.demand.current} / ${reqs.demand.required}` },
          { ...reqs.landValue, current: `${reqs.landValue.current} / ${reqs.landValue.required}` },
        ];
        if (reqs.gridAlign && reqs.gridAlign.required !== "N/A") {
          rows.push({ ...reqs.gridAlign });
        }

        checklistEl.innerHTML = rows.map(r => {
          const icon = r.met ? "✅" : "❌";
          const color = r.met ? "#4ecdc4" : "#ff6b6b";
          return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:1px 0">
            <span>${icon} ${r.label}</span>
            <span style="color:${color}">${r.current}</span>
          </div>`;
        }).join("");

        // Land value breakdown if land value not met
        if (!reqs.landValue.met && data.landValueBreakdown) {
          const b = data.landValueBreakdown;
          const parts = [];
          parts.push(`Base: ${b.base}`);
          if (b.road) parts.push(`Road: +${b.road}`);
          if (b.parks) parts.push(`Parks: +${b.parks}`);
          if (b.services) parts.push(`Services: +${b.services}`);
          if (b.water) parts.push(`Water: +${b.water}`);
          if (b.pollution) parts.push(`Pollution: ${b.pollution}`);
          if (b.distancePenalty) parts.push(`Distance: ${b.distancePenalty}`);
          checklistEl.innerHTML += `<div style="font-size:10px;color:#777;margin-top:2px;padding-left:20px">${parts.join(" · ")}</div>`;
        }

        // Tips
        if (data.tips && data.tips.length > 0) {
          tipsEl.innerHTML = data.tips.map(t => `<div>💡 ${t}</div>`).join("");
        } else {
          tipsEl.innerHTML = "";
        }
      }).catch(() => {
        checklistEl.innerHTML = "";
        upgradeEl.style.display = "none";
      });
    } else {
      upgradeEl.style.display = "none";
      checklistEl.innerHTML = "";
      tipsEl.innerHTML = "";
    }
  }

  panel.style.display = "block";
}

/**
 * Show parcel info (via tooltip or console for now)
 */
function showParcelInfo(parcel) {
  console.log(`[MoltCity] Parcel at (${parcel.x}, ${parcel.y}):`, parcel);
  // Parcel info is shown via tooltip on hover
}

/**
 * Update tooltip
 */
function updateTooltip(x, y, globalPos) {
  const tooltip = document.getElementById("tooltip");
  if (!tooltip) return;

  const badge = document.getElementById("drag-cost");
  const ZONE_TYPES_LOCAL = ["residential", "offices", "industrial", "suburban"];
  const DRAG_TYPES = [...ZONE_TYPES_LOCAL, "road", "power_line", "water_pipe"];
  const buildType = state.selectedBuildType;

  // Show cost badge for single-placement buildings (park, police, hospital, etc.)
  if (badge && globalPos && buildType && buildType !== "demolish" && !DRAG_TYPES.includes(buildType) && state.gameConfig) {
    const cost = state.gameConfig.costs?.[buildType];
    if (cost !== undefined) {
      let hint = "";
      if (buildType === "water_tower") hint = '<br><span style="font-size:10px;color:#00aaff">Must be adjacent to water</span>';
      badge.innerHTML = `${buildType.replace(/_/g, ' ')} &middot; <span class="cost">$${Math.ceil(cost).toLocaleString()}</span>${hint}`;
      badge.style.display = "block";
      badge.style.left = `${globalPos.x + 15}px`;
      badge.style.top = `${globalPos.y - 35}px`;
    } else {
      badge.style.display = "none";
    }
  } else if (badge) {
    badge.style.display = "none";
  }

  // In demolish mode, show what would be deleted
  if (state.selectedBuildType === "demolish") {
    const targets = collectDemolishTargets(x, y);
    if (targets.length > 0) {
      const lines = targets.map((t) => `${t.icon} ${t.label}`);
      tooltip.innerHTML = `<strong style="color:#e74c3c">Demolish (${targets.length})</strong><br>${lines.join("<br>")}`;
      tooltip.style.display = "block";
    } else {
      tooltip.innerHTML = `<strong>(${x}, ${y})</strong><br>Nothing to demolish`;
      tooltip.style.display = "block";
    }
    if (tooltip.style.display === "block" && globalPos) {
      tooltip.style.left = `${globalPos.x + 15}px`;
      tooltip.style.top = `${globalPos.y + 15}px`;
    }
    return;
  }

  const parcel = state.parcels.find((p) => p.x === x && p.y === y);
  const building = state.buildings.find((b) => {
    const p = state.parcels.find((p) => p.id === b.parcelId);
    return p && p.x === x && p.y === y;
  });

  if (building) {
    tooltip.innerHTML = `
      <strong>${building.name}</strong><br>
      Type: ${building.type}
    `;
    tooltip.style.display = "block";
  } else if (parcel) {
    const zoningLabel = parcel.zoning ? `<br>Zone: ${parcel.zoning}` : "";
    let costLabel = "";
    if (
      state.selectedBuildType &&
      state.selectedBuildType !== "demolish" &&
      state.gameConfig
    ) {
      const ZONE_TYPES = ["residential", "offices", "industrial", "suburban"];
      let cost;
      if (ZONE_TYPES.includes(state.selectedBuildType)) {
        cost = state.gameConfig.zoningCost;
      } else {
        cost = state.gameConfig.costs?.[state.selectedBuildType];
      }
      if (cost !== undefined) {
        costLabel = `<br><span style="color:#4ecdc4">Cost: $${Math.ceil(cost).toLocaleString()}</span>`;
      }
    }
    tooltip.innerHTML = `
      <strong>(${parcel.x}, ${parcel.y})</strong><br>
      ${parcel.ownerId ? `Owner: ${parcel.ownerId.slice(0, 8)}...` : "Unowned"}${zoningLabel}${costLabel}
    `;
    tooltip.style.display = "block";
  } else {
    tooltip.style.display = "none";
  }

  if (tooltip.style.display === "block" && globalPos) {
    tooltip.style.left = `${globalPos.x + 15}px`;
    tooltip.style.top = `${globalPos.y + 15}px`;
  }
}

/**
 * Show a toast notification
 */
function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    padding: 10px 20px; border-radius: 6px; color: white; font-size: 14px;
    z-index: 10000; pointer-events: none; opacity: 0; transition: opacity 0.3s;
    background: ${isError ? "#e74c3c" : "#2ecc71"};
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/**
 * Update build menu options with cost labels
 */
function updateBuildMenuCosts() {
  const config = state.gameConfig;
  if (!config) return;

  const costs = config.costs || {};
  const zoningCost = config.zoningCost;
  const ZONE_TYPES = ["residential", "offices", "industrial", "suburban"];

  document.querySelectorAll(".build-option").forEach((option) => {
    const type = option.dataset.type;
    if (!type || type === "demolish") return;

    let cost;
    if (ZONE_TYPES.includes(type)) {
      cost = zoningCost;
    } else {
      cost = costs[type];
    }

    if (cost !== undefined) {
      // Add cost label after the <small> label
      const costEl = document.createElement("span");
      costEl.className = "build-cost";
      costEl.textContent = `$${Math.ceil(cost).toLocaleString()}`;
      option.appendChild(costEl);
    }
  });
}

/**
 * Setup build menu click handlers
 */
function setupBuildMenu() {
  const buildOptions = document.querySelectorAll(".build-option");
  const powerTrigger = document.getElementById("power-menu-trigger");
  const powerPopover = document.getElementById("power-popover");

  buildOptions.forEach((option) => {
    // Skip the power trigger — it opens the popover, not a build type
    if (option.id === "power-menu-trigger") return;

    option.addEventListener("click", () => {
      const type = option.dataset.type;

      // Clear infrastructure start point when changing build type
      if (state.infraStartPoint) {
        state.setInfraStartPoint(null);
      }

      // Close demolish picker if open
      closeDemolishPicker();

      // Close power popover if open
      if (powerPopover) powerPopover.classList.remove("open");

      // Toggle selection
      if (state.selectedBuildType === type) {
        // Deselect
        state.setSelectedBuildType(null);
        option.classList.remove("selected");
        if (powerTrigger) powerTrigger.classList.remove("selected");
      } else {
        // Deselect all others
        buildOptions.forEach((opt) => opt.classList.remove("selected"));
        if (powerTrigger) powerTrigger.classList.remove("selected");
        // Select this one
        state.setSelectedBuildType(type);
        option.classList.add("selected");

        // If it's a power plant subtype, also highlight the trigger
        const powerTypes = ["wind_turbine", "coal_plant", "nuclear_plant"];
        if (powerTypes.includes(type) && powerTrigger) {
          powerTrigger.classList.add("selected");
        }
      }

      // Fade/hide buildings when placing infrastructure so pipes/lines are visible
      applyInfraFade(state.selectedBuildType);

      // Show placement hints (e.g. water-adjacent tiles for water tower)
      updatePlacementHints(state.selectedBuildType);

      console.log("[MoltCity] Build type selected:", state.selectedBuildType);
    });
  });

  // Power popover trigger
  if (powerTrigger && powerPopover) {
    powerTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      powerPopover.classList.toggle("open");
    });

    // Close popover on outside click
    document.addEventListener("click", (e) => {
      if (!powerPopover.contains(e.target) && e.target !== powerTrigger && !powerTrigger.contains(e.target)) {
        powerPopover.classList.remove("open");
      }
    });
  }

  // ESC key to deselect
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // Close power popover
      if (powerPopover) powerPopover.classList.remove("open");
      // Cancel active drag-draw
      if (state.isDragDrawing) {
        cancelDragDraw();
      }
      if (state.infraStartPoint) {
        // Cancel infrastructure placement
        state.setInfraStartPoint(null);
        console.log("[MoltCity] Infrastructure placement cancelled");
      }
      if (state.selectedBuildType) {
        state.setSelectedBuildType(null);
        buildOptions.forEach((opt) => opt.classList.remove("selected"));
        if (powerTrigger) powerTrigger.classList.remove("selected");
        applyInfraFade(null);
        updatePlacementHints(null);
        console.log("[MoltCity] Build type deselected");
      }
    }
  });
}

/**
 * Check if city hall needs to be placed (onboarding for new cities)
 */
function checkCityHallRequired() {
  const hasCityHall = state.buildings.some((b) => b.type === "city_hall");
  const buildMenu = document.getElementById("build-menu");
  const banner = document.getElementById("city-hall-banner");

  if (!hasCityHall) {
    // Enter city hall required mode
    if (buildMenu) buildMenu.classList.add("city-hall-required");
    if (banner) banner.style.display = "";

    // Auto-select city_hall build type
    const cityHallOption = document.getElementById("build-city-hall");
    if (cityHallOption) {
      cityHallOption.click();
    }
  } else {
    // Normal mode — ensure classes are removed, hide city hall button
    if (buildMenu) buildMenu.classList.remove("city-hall-required");
    if (banner) banner.style.display = "none";
    const cityHallOption = document.getElementsByClassName("city-hall-group");
    if (cityHallOption) cityHallOption[0].style.display = "none";
  }
}

/**
 * Exit city hall onboarding mode — unlock full build menu
 */
function exitCityHallMode() {
  const buildMenu = document.getElementById("build-menu");
  const banner = document.getElementById("city-hall-banner");

  if (buildMenu) buildMenu.classList.remove("city-hall-required");
  if (banner) banner.style.display = "none";

  // Hide city hall button now that it's built
  const cityHallOption = document.getElementById("build-city-hall");
  if (cityHallOption) cityHallOption.style.display = "none";

  // Deselect current build type
  state.setSelectedBuildType(null);
  document
    .querySelectorAll(".build-option")
    .forEach((opt) => opt.classList.remove("selected"));

  showToast("City Hall placed! Full build menu unlocked.");
}

/**
 * Main application entry point
 */
async function main() {
  if (isSpectatorMode) {
    // Spectator mode: hide auth and interactive elements
    const authOverlay = document.getElementById("auth-overlay");
    const topBar = document.getElementById("top-bar");
    const userInfo = document.getElementById("user-info");
    const buildMenu = document.getElementById("build-menu");
    const spectatorBanner = document.getElementById("spectator-banner");

    if (authOverlay) authOverlay.style.display = "none";
    if (topBar) topBar.style.display = "none";
    if (userInfo) userInfo.style.display = "none";
    if (buildMenu) buildMenu.style.display = "none";
    if (spectatorBanner) spectatorBanner.style.display = "block";

    // Check for cityId query param to spectate a specific city
    const urlCityId = new URLSearchParams(window.location.search).get("cityId");
    if (urlCityId) {
      state.setCurrentCityId(urlCityId);
    }

    await initializeApp();
    return;
  }

  // Setup auth UI first
  setupAuthUI();

  // Set callback for successful auth
  setOnAuthSuccess(async () => {
    if (!appInitialized) {
      await initializeApp();
    }
  });

  // Check if user is authenticated
  const isAuthenticated = await checkAuth();

  if (isAuthenticated && !appInitialized) {
    await initializeApp();
  }
}

// Start the application when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}

// Export for external access
window.MoltCity = {
  state,
  api,
  render,
  loadCityData,
  updateUserBalance,
};

// Periodically update balance (every 30 seconds)
setInterval(() => {
  updateUserBalance();
}, 30000);
