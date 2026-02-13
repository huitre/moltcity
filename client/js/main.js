// ============================================
// MOLTCITY - Main Entry Point
// ============================================

import * as state from './state.js';
import * as api from './api.js';
import { GRID_SIZE, COLORS, BUILDING_FOOTPRINTS } from './config.js';
import { initPixi, setupInteractions } from './pixi/init.js';
import { initGame, render } from './game.js';
import { connectWebSocket } from './websocket.js';
import { loadSprites } from './sprites.js';
import { drawHighlight } from './render/tiles.js';
import { setupAuthUI, checkAuth, setOnAuthSuccess } from './ui/auth.js';
import { loadActivities, addActivity } from './ui/activity.js';
import { loadElectionStatus, setupElectionUI } from './ui/election.js';
import { setupLeaderboard } from './ui/leaderboard.js';
import { showSpriteEditor } from './ui/sprite-editor.js';

let appInitialized = false;

// Check for spectator mode (either /spectate path or ?mode=spectator query param)
const isSpectatorMode = window.location.pathname === '/spectate' || new URLSearchParams(window.location.search).get("mode") === "spectator";

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
    setupInteractions(handleTileClick, handleTileHover);

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
    await loadElectionStatus();
    setupElectionUI();
    setupLeaderboard();

    // Setup build menu
    setupBuildMenu();

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
    state.setGameConfig(data.config);
  } catch (error) {
    console.warn("[MoltCity] Failed to load game config:", error);
  }
}

/**
 * Update user's agent balance display
 */
async function updateUserBalance() {
  const balanceDisplay = document.getElementById("balance-display");
  if (!balanceDisplay) return;

  const { currentUser } = state;
  if (!currentUser) {
    balanceDisplay.textContent = "$0";
    return;
  }

  try {
    const data = await api.getMe();
    if (data.balance !== undefined) {
      balanceDisplay.textContent = `$${data.balance.toLocaleString()}`;
    }
  } catch (e) {
    // Fallback: try matching from local agents list
    const { agents } = state;
    const userAgent = agents.find(
      (a) => a.id === currentUser.agentId || a.moltbookId === currentUser.id
    );
    if (userAgent && userAgent.wallet) {
      balanceDisplay.textContent = `$${userAgent.wallet.balance.toLocaleString()}`;
    }
  }
}

/**
 * Load all city data
 */
async function loadCityData() {
  try {
    // Load city state (auto-init if not yet created)
    let cityResponse = await api.getCity();
    if (!cityResponse.city && !cityResponse.initialized) {
      console.log("[MoltCity] City not initialized, auto-creating...");
      await api.initCity("MoltCity");
      cityResponse = await api.getCity();
    }
    if (cityResponse.city) {
      state.setCityData(cityResponse.city);
    }

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

    console.log("[MoltCity] City data loaded");
  } catch (error) {
    console.error("[MoltCity] Failed to load city data:", error);
  }
}

/**
 * Handle tile click
 */
async function handleTileClick(x, y) {
  console.log(`[MoltCity] Tile clicked: (${x}, ${y})`);

  const { selectedBuildType } = state;

  // Demolish mode
  if (selectedBuildType === "demolish") {
    await handleDemolish(x, y);
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
  return state.roads.find((r) => {
    const p = state.parcels.find((p) => p.id === r.parcelId);
    return p && p.x === x && p.y === y;
  }) || null;
}

/**
 * Find a power line connected to a tile
 */
function findPowerLineAtTile(x, y) {
  return state.powerLines.find(
    (l) => (l.from.x === x && l.from.y === y) || (l.to.x === x && l.to.y === y)
  ) || null;
}

/**
 * Find a water pipe connected to a tile
 */
function findWaterPipeAtTile(x, y) {
  return state.waterPipes.find(
    (p) => (p.from.x === x && p.from.y === y) || (p.to.x === x && p.to.y === y)
  ) || null;
}

/**
 * Handle demolish action at a tile
 */
async function handleDemolish(x, y) {
  try {
    // 1. Check for building
    const building = findBuildingAtTile(x, y);
    if (building) {
      await api.demolishBuilding(building.id);
      const buildingsResponse = await api.getBuildings();
      state.setBuildings(buildingsResponse.buildings || []);
      render();
      showToast(`Demolished ${building.name}`);
      return;
    }

    // 2. Check for road
    const road = findRoadAtTile(x, y);
    if (road) {
      await api.deleteRoad(road.id);
      const roadsResponse = await api.getRoads();
      state.setRoads(roadsResponse.roads || []);
      render();
      showToast(`Road removed at (${x}, ${y})`);
      return;
    }

    // 3. Check for power line
    const powerLine = findPowerLineAtTile(x, y);
    if (powerLine) {
      await api.deletePowerLine(powerLine.id);
      const powerLinesResponse = await api.getPowerLines();
      state.setPowerLines(powerLinesResponse.powerLines || []);
      render();
      showToast("Power line removed");
      return;
    }

    // 4. Check for water pipe
    const waterPipe = findWaterPipeAtTile(x, y);
    if (waterPipe) {
      await api.deleteWaterPipe(waterPipe.id);
      const waterPipesResponse = await api.getWaterPipes();
      state.setWaterPipes(waterPipesResponse.waterPipes || []);
      render();
      showToast("Water pipe removed");
      return;
    }

    // 5. Check for zoning
    const parcel = state.parcels.find((p) => p.x === x && p.y === y);
    if (parcel && parcel.zoning) {
      await api.setZoning(parcel.id, null);
      parcel.zoning = null;
      render();
      showToast(`Zoning removed at (${x}, ${y})`);
      return;
    }

    showToast("Nothing to demolish here", true);
  } catch (error) {
    console.error("[MoltCity] Demolish failed:", error.message);
    showToast(`Demolish failed: ${error.message}`, true);
  }
}

/**
 * Handle building/road creation
 */
async function handleBuild(x, y, buildType) {
  try {
    if (buildType === "road") {
      // Create road
      const result = await api.createRoad({ x, y });
      console.log("[MoltCity] Road created:", result);

      // Reload roads and re-render
      const roadsResponse = await api.getRoads();
      state.setRoads(roadsResponse.roads || []);
      render();
      showToast(`Road placed at (${x}, ${y})`);
    } else if (buildType === "power_line" || buildType === "water_pipe") {
      // Infrastructure requires start/end points - two-click interaction
      if (!state.infraStartPoint) {
        // First click: set start point
        state.setInfraStartPoint({ x, y });
        console.log(`[MoltCity] Infrastructure start point set: (${x}, ${y}). Click again to set endpoint.`);
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

        // Find or create parcel
        const parcel = state.parcels.find((p) => p.x === x && p.y === y);
        if (!parcel) {
          showToast(`No parcel at (${x}, ${y})`, true);
          return;
        }

        const zoning = ZONE_MAPPING[buildType];
        await api.setZoning(parcel.id, zoning);
        console.log("[MoltCity] Zoning set:", zoning, "at", x, y);

        // Update local parcel zoning
        parcel.zoning = zoning;
        render();
        showToast(`${buildType} zone placed at (${x}, ${y})`);
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
          water_tower: "Water Tower",
          police_station: "Police Station",
          fire_station: "Fire Station",
          hospital: "Hospital",
          jail: "Jail",
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

        // Reload buildings and re-render
        const buildingsResponse = await api.getBuildings();
        state.setBuildings(buildingsResponse.buildings || []);
        render();
        showToast(`${name} placed at (${x}, ${y})`);
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
  updateTooltip(x, y, globalPos);

  // Show build cursor highlight when a build type is selected
  if (state.highlightGraphics) {
    state.worldContainer.removeChild(state.highlightGraphics);
    state.setHighlightGraphics(null);
  }
  if (state.selectedBuildType && x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
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
      const footprint = BUILDING_FOOTPRINTS[state.selectedBuildType] || { w: 1, h: 1 };
      const container = new PIXI.Container();
      container.sortableChildren = true;
      container.zIndex = 1000;

      for (let dy = 0; dy < footprint.h; dy++) {
        for (let dx = 0; dx < footprint.w; dx++) {
          const tx = x + dx;
          const ty = y + dy;
          if (tx >= GRID_SIZE || ty >= GRID_SIZE) continue;
          const occupied = isTileOccupied(tx, ty);
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
      loadElectionStatus();
      break;

    case "infrastructure_update":
      // Buildings were already re-fetched by websocket.js, just re-render
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
  if (powerEl) powerEl.textContent = building.powered ? "Connected" : "No Power";
  if (waterEl) waterEl.textContent = building.hasWater ? "Connected" : "No Water";
  if (ownerEl) ownerEl.textContent = building.ownerId ? building.ownerId.slice(0, 8) + "..." : "Unknown";

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

  // In demolish mode, show what would be deleted
  if (state.selectedBuildType === "demolish") {
    const building = findBuildingAtTile(x, y);
    if (building) {
      tooltip.innerHTML = `<strong style="color:#e74c3c">Demolish: ${building.name}</strong><br>Type: ${building.type}`;
      tooltip.style.display = "block";
    } else {
      const road = findRoadAtTile(x, y);
      const powerLine = findPowerLineAtTile(x, y);
      const waterPipe = findWaterPipeAtTile(x, y);
      if (road) {
        tooltip.innerHTML = `<strong style="color:#e74c3c">Remove road</strong>`;
        tooltip.style.display = "block";
      } else if (powerLine) {
        tooltip.innerHTML = `<strong style="color:#e74c3c">Remove power line</strong>`;
        tooltip.style.display = "block";
      } else if (waterPipe) {
        tooltip.innerHTML = `<strong style="color:#e74c3c">Remove water pipe</strong>`;
        tooltip.style.display = "block";
      } else {
        const zParcel = state.parcels.find((p) => p.x === x && p.y === y);
        if (zParcel && zParcel.zoning) {
          tooltip.innerHTML = `<strong style="color:#e74c3c">Remove ${zParcel.zoning} zoning</strong>`;
          tooltip.style.display = "block";
        } else {
          tooltip.innerHTML = `<strong>(${x}, ${y})</strong><br>Nothing to demolish`;
          tooltip.style.display = "block";
        }
      }
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
    tooltip.innerHTML = `
      <strong>(${parcel.x}, ${parcel.y})</strong><br>
      ${parcel.ownerId ? `Owner: ${parcel.ownerId.slice(0, 8)}...` : "Unowned"}${zoningLabel}
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
  requestAnimationFrame(() => { toast.style.opacity = "1"; });
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/**
 * Setup build menu click handlers
 */
function setupBuildMenu() {
  const buildOptions = document.querySelectorAll(".build-option");

  buildOptions.forEach((option) => {
    option.addEventListener("click", () => {
      const type = option.dataset.type;

      // Clear infrastructure start point when changing build type
      if (state.infraStartPoint) {
        state.setInfraStartPoint(null);
      }

      // Toggle selection
      if (state.selectedBuildType === type) {
        // Deselect
        state.setSelectedBuildType(null);
        option.classList.remove("selected");
      } else {
        // Deselect all others
        buildOptions.forEach((opt) => opt.classList.remove("selected"));
        // Select this one
        state.setSelectedBuildType(type);
        option.classList.add("selected");
      }

      // Fade buildings when placing infrastructure so pipes/lines are visible
      const infraTypes = ["water_pipe", "power_line"];
      if (state.sceneLayer) {
        state.sceneLayer.alpha = infraTypes.includes(state.selectedBuildType) ? 0.5 : 1;
      }

      console.log("[MoltCity] Build type selected:", state.selectedBuildType);
    });
  });

  // ESC key to deselect
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (state.infraStartPoint) {
        // Cancel infrastructure placement
        state.setInfraStartPoint(null);
        console.log("[MoltCity] Infrastructure placement cancelled");
      }
      if (state.selectedBuildType) {
        state.setSelectedBuildType(null);
        buildOptions.forEach((opt) => opt.classList.remove("selected"));
        if (state.sceneLayer) state.sceneLayer.alpha = 1;
        console.log("[MoltCity] Build type deselected");
      }
    }
  });
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
