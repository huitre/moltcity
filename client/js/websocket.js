// ============================================
// MOLTCITY - WebSocket Connection
// ============================================

import { WS_URL } from './config.js';
import * as state from './state.js';
import * as api from './api.js';
import { updateTrafficLimits } from './render/ambient.js';

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 3000;

/**
 * Connect to the WebSocket server
 */
export function connectWebSocket(onMessage) {
  const ws = new WebSocket(WS_URL);
  state.setWs(ws);

  ws.onopen = () => {
    console.log("[WebSocket] Connected");
    reconnectAttempts = 0;
    updateConnectionStatus(true);
  };

  ws.onclose = () => {
    console.log("[WebSocket] Disconnected");
    updateConnectionStatus(false);

    // Attempt reconnection
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      setTimeout(() => connectWebSocket(onMessage), RECONNECT_DELAY);
    }
  };

  ws.onerror = (error) => {
    console.error("[WebSocket] Error:", error);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg, onMessage);
    } catch (e) {
      console.error("[WebSocket] Failed to parse message:", e);
    }
  };

  return ws;
}

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(msg, onMessage) {
  // Handle both msg.type and msg.event formats
  const eventType = msg.type || msg.event;

  switch (eventType) {
    case "tick":
      handleTick(msg.data);
      break;

    case "population_update":
      handlePopulationUpdate(msg.data);
      break;

    case "players_update":
      handlePlayersUpdate(msg.data);
      break;

    case "day_started":
      state.setIsDaylight(true);
      break;

    case "night_started":
      state.setIsDaylight(false);
      break;

    case "simulation_started":
      console.log("[Simulation] Started");
      break;

    case "simulation_stopped":
      console.log("[Simulation] Stopped");
      break;

    case "economy_update":
      handleEconomyUpdate(msg.data);
      break;

    case "infrastructure_update":
      handleInfrastructureUpdate(data, onMessage);
      break;
  }

  // Activity feed events
  if (msg.event === "activity") {
    onMessage && onMessage("activity", msg.data);
  }

  // Election events
  if (
    msg.event === "election_started" ||
    msg.event === "voting_started" ||
    msg.event === "candidate_registered" ||
    msg.event === "election_completed" ||
    msg.event === "vote_cast"
  ) {
    onMessage && onMessage("election", msg);
  }

  // Pass to custom handler
  if (onMessage) {
    onMessage(msg.type, msg.data);
  }
}

/**
 * Handle tick message
 */
function handleTick(data) {
  if (!data) return;

  const { time, events, population, employed, players } = data;

  if (time) {
    state.setIsDaylight(time.isDaylight);
    state.setCurrentHour(time.hour);

    // Update time display
    const timeDisplay = document.getElementById("time-display");
    const dayDisplay = document.getElementById("day-display");
    if (timeDisplay) {
      timeDisplay.textContent = `${String(time.hour).padStart(2, "0")}:00`;
    }
    if (dayDisplay) {
      dayDisplay.textContent = time.day;
    }
  }

  // Update population/citizens display
  if (population !== undefined) {
    state.setCurrentPopulation(population);
    const popDisplay = document.getElementById("population-display");
    if (popDisplay) popDisplay.textContent = population;
  }

  // Update employed display
  if (employed !== undefined) {
    const empDisplay = document.getElementById("employed-display");
    if (empDisplay) empDisplay.textContent = employed;
  }

  // Update players display
  if (players !== undefined) {
    const playersDisplay = document.getElementById("players-display");
    if (playersDisplay) playersDisplay.textContent = players;
  }

  // Process events (if present)
  if (events && Array.isArray(events)) {
    for (const evt of events) {
      if (evt.type === "agent_moved") {
        const agent = state.agents.find((a) => a.id === evt.data.agentId);
        if (agent) agent.currentLocation = evt.data.to;
      }
    }
  }

  // Update traffic limits
  updateTrafficLimits();
}

/**
 * Handle population update message
 */
function handlePopulationUpdate(data) {
  const { total, employed, traffic, water } = data;

  state.setCurrentPopulation(total || 0);

  // Update UI
  const popDisplay = document.getElementById("population-display");
  const empDisplay = document.getElementById("employed-display");
  const trafficDisplay = document.getElementById("traffic-display");
  const waterDisplay = document.getElementById("water-display");

  if (popDisplay) popDisplay.textContent = total || 0;
  if (empDisplay) empDisplay.textContent = employed || 0;
  if (trafficDisplay && traffic !== undefined) {
    trafficDisplay.textContent = traffic;
  }
  if (waterDisplay && water) {
    waterDisplay.textContent = `${water.demand}/${water.capacity}`;
    waterDisplay.style.color = water.demand > water.capacity ? '#ff6b6b' : '#4ecdc4';
  }

  updateTrafficLimits();
}

/**
 * Handle players update message
 */
function handlePlayersUpdate(data) {
  const { count } = data;
  const playersDisplay = document.getElementById("players-display");
  if (playersDisplay) playersDisplay.textContent = count || 0;
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(connected) {
  const statusEl = document.getElementById("connection-status");
  if (statusEl) {
    statusEl.textContent = connected ? "Connected" : "Disconnected";
    statusEl.style.color = connected ? "#4ecdc4" : "#ff6b6b";
  }
}

/**
 * Handle infrastructure update - re-fetch buildings to get updated utility statuses
 */
let infraUpdateTimer = null;
function handleInfrastructureUpdate(data, onMessage) {
  console.log("[WebSocket] Infrastructure update:", data);

  // Debounce: wait 1.5s for simulation to recalculate power/water status
  if (infraUpdateTimer) clearTimeout(infraUpdateTimer);
  infraUpdateTimer = setTimeout(async () => {
    try {
      const buildingsResponse = await api.getBuildings();
      state.setBuildings(buildingsResponse.buildings || []);
      if (onMessage) onMessage("infrastructure_update", data);
    } catch (e) {
      console.error("[WebSocket] Failed to refresh buildings after infrastructure update:", e);
    }
  }, 1500);
}

/**
 * Handle economy update message
 */
function handleEconomyUpdate(data) {
  if (!data) return;
  state.setEconomyData(data);

  const balanceDisplay = document.getElementById("balance-display");
  if (balanceDisplay && data.treasury !== undefined) {
    balanceDisplay.textContent = `$${Math.floor(data.treasury).toLocaleString()}`;
    balanceDisplay.style.color = data.treasury < 0 ? '#ff6b6b' : '#ffd700';
  }
}

/**
 * Send a message via WebSocket
 */
export function sendMessage(type, data) {
  const { ws } = state;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}
