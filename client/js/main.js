// ============================================
// MOLTCITY - Main Entry Point
// ============================================

import * as state from './state.js';
import * as api from './api.js';
import { initPixi, setupInteractions } from './pixi/init.js';
import { initGame, render } from './game.js';
import { connectWebSocket } from './websocket.js';
import { loadSprites } from './sprites.js';
import { setupAuthUI, checkAuth, setOnAuthSuccess } from './ui/auth.js';
import { loadActivities, addActivity } from './ui/activity.js';
import { loadElectionStatus, setupElectionUI } from './ui/election.js';

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
function updateUserBalance() {
  const balanceDisplay = document.getElementById("balance-display");
  if (!balanceDisplay) return;

  const { currentUser, agents } = state;
  if (!currentUser) {
    balanceDisplay.textContent = "$0";
    return;
  }

  // Find user's agent by agentId or moltbookId
  const userAgent = agents.find(
    (a) => a.id === currentUser.agentId || a.moltbookId === currentUser.id
  );

  if (userAgent && userAgent.wallet) {
    balanceDisplay.textContent = `$${userAgent.wallet.balance.toLocaleString()}`;
  } else {
    balanceDisplay.textContent = "$0";
  }
}

/**
 * Load all city data
 */
async function loadCityData() {
  try {
    // Load city state
    const cityResponse = await api.getCity();
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
  } else if (parcel) {
    showParcelInfo(parcel);
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
      // Create building with auto-generated name
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
        jail: "Jail",
      };
      const name = buildingNames[buildType] || buildType;

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
    }
  } catch (error) {
    console.error("[MoltCity] Build failed:", error.message);
    alert(`Build failed: ${error.message}`);
  }
}

/**
 * Handle tile hover
 */
function handleTileHover(x, y, globalPos) {
  updateTooltip(x, y, globalPos);
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
  const ownerEl = document.getElementById("building-owner");
  const constructionInfo = document.getElementById("construction-info");
  const progressFill = document.getElementById("construction-progress-fill");
  const progressText = document.getElementById("construction-progress-text");

  if (iconEl) iconEl.textContent = BUILDING_ICONS[building.type] || "🏠";
  if (nameEl) nameEl.textContent = building.name || building.type;
  if (typeEl) typeEl.textContent = building.type;
  if (floorsEl) floorsEl.textContent = building.floors || 1;
  if (powerEl) powerEl.textContent = building.powered ? "Connected" : "No Power";
  if (ownerEl) ownerEl.textContent = building.ownerId ? building.ownerId.slice(0, 8) + "..." : "Unknown";

  // Construction progress
  if (building.constructionProgress < 100) {
    if (constructionInfo) constructionInfo.style.display = "block";
    if (progressFill) progressFill.style.width = `${building.constructionProgress}%`;
    if (progressText) progressText.textContent = `${building.constructionProgress}% complete`;
  } else {
    if (constructionInfo) constructionInfo.style.display = "none";
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

  const parcel = state.parcels.find((p) => p.x === x && p.y === y);
  const building = state.buildings.find((b) => {
    const p = state.parcels.find((p) => p.id === b.parcelId);
    return p && p.x === x && p.y === y;
  });

  if (building) {
    tooltip.innerHTML = `
      <strong>${building.name}</strong><br>
      Type: ${building.type}<br>
      ${building.constructionProgress < 100 ? `Building: ${building.constructionProgress}%` : ""}
    `;
    tooltip.style.display = "block";
  } else if (parcel) {
    tooltip.innerHTML = `
      <strong>(${parcel.x}, ${parcel.y})</strong><br>
      ${parcel.ownerId ? `Owner: ${parcel.ownerId.slice(0, 8)}...` : "Unowned"}
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
    const controls = document.getElementById("controls");
    const userInfo = document.getElementById("user-info");
    const buildMenu = document.getElementById("build-menu");
    const spectatorBanner = document.getElementById("spectator-banner");

    if (authOverlay) authOverlay.style.display = "none";
    if (controls) controls.style.display = "none";
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
