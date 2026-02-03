// ============================================
// MOLTCITY - WebSocket Connection
// ============================================

import { WS_URL } from './config.js';
import * as state from './state.js';
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
  switch (msg.type) {
    case "tick":
      handleTick(msg.data);
      break;

    case "population_update":
      handlePopulationUpdate(msg.data);
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
  const { time, events } = data;

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

  // Process events
  for (const evt of events) {
    if (evt.type === "agent_moved") {
      const agent = state.agents.find((a) => a.id === evt.data.agentId);
      if (agent) agent.currentLocation = evt.data.to;
    }
  }

  // Update traffic limits
  updateTrafficLimits();
}

/**
 * Handle population update message
 */
function handlePopulationUpdate(data) {
  const { total, employed } = data;

  state.setCurrentPopulation(total || 0);

  // Update UI
  const popDisplay = document.getElementById("population-display");
  const empDisplay = document.getElementById("employed-display");
  const trafficDisplay = document.getElementById("traffic-display");

  if (popDisplay) popDisplay.textContent = total || 0;
  if (empDisplay) empDisplay.textContent = employed || 0;
  if (trafficDisplay) {
    trafficDisplay.textContent = state.animatedVehicles.length + state.animatedPedestrians.length;
  }

  updateTrafficLimits();
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
 * Send a message via WebSocket
 */
export function sendMessage(type, data) {
  const { ws } = state;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}
