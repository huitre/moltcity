// ============================================
// MOLTCITY - API Service
// ============================================

import { API_URL } from './config.js';
import * as state from './state.js';

/**
 * Get auth headers for API requests
 */
function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (state.currentToken) {
    headers['Authorization'] = `Bearer ${state.currentToken}`;
  }
  return headers;
}

/**
 * Generic fetch wrapper with error handling
 */
async function fetchApi(endpoint, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...getHeaders(), ...options.headers },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || 'Request failed');
  }

  return response.json();
}

// ============================================
// Auth API
// ============================================

export async function login(email, password) {
  return fetchApi('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email, password, name) {
  return fetchApi('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
}

export async function logout() {
  return fetchApi('/api/auth/logout', { method: 'POST' });
}

export async function getMe() {
  return fetchApi('/api/auth/me');
}

// ============================================
// City API
// ============================================

export async function getCity() {
  return fetchApi('/api/city');
}

export async function initCity(name) {
  return fetchApi('/api/city/init', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function getGameConfig() {
  return fetchApi('/api/game/config');
}

// ============================================
// Parcels API
// ============================================

export async function getParcels(minX, minY, maxX, maxY) {
  const params = new URLSearchParams();
  if (minX !== undefined) params.append('minX', minX);
  if (minY !== undefined) params.append('minY', minY);
  if (maxX !== undefined) params.append('maxX', maxX);
  if (maxY !== undefined) params.append('maxY', maxY);

  const query = params.toString();
  return fetchApi(`/api/parcels${query ? `?${query}` : ''}`);
}

export async function getParcel(x, y) {
  return fetchApi(`/api/parcels/${x}/${y}`);
}

export async function purchaseParcel(agentId, x, y, price) {
  return fetchApi('/api/parcels/purchase', {
    method: 'POST',
    body: JSON.stringify({ agentId, x, y, price }),
  });
}

export async function sellParcel(agentId, x, y, buyerId, price) {
  return fetchApi('/api/parcels/sell', {
    method: 'POST',
    body: JSON.stringify({ agentId, x, y, buyerId, price }),
  });
}

export async function getParcelPriceQuote(agentId) {
  const params = new URLSearchParams();
  if (agentId) params.append('agentId', agentId);
  return fetchApi(`/api/parcels/quote?${params}`);
}

// ============================================
// Buildings API
// ============================================

export async function getBuildings() {
  return fetchApi('/api/buildings');
}

export async function getBuilding(id) {
  return fetchApi(`/api/buildings/${id}`);
}

export async function getBuildingQuote(type, floors) {
  return fetchApi(`/api/buildings/quote?type=${type}&floors=${floors || 1}`);
}

export async function createBuilding(params) {
  return fetchApi('/api/buildings', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function updateBuilding(id, updates) {
  return fetchApi(`/api/buildings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function demolishBuilding(id, agentId) {
  return fetchApi(`/api/buildings/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ agentId }),
  });
}

// ============================================
// Roads API
// ============================================

export async function getRoads() {
  return fetchApi('/api/roads');
}

export async function createRoad(params) {
  return fetchApi('/api/roads', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ============================================
// Agents API
// ============================================

export async function getAgents() {
  return fetchApi('/api/agents');
}

export async function getAgent(id) {
  return fetchApi(`/api/agents/${id}`);
}

export async function createAgent(name, x, y) {
  return fetchApi('/api/agents', {
    method: 'POST',
    body: JSON.stringify({ name, x, y }),
  });
}

export async function moveAgent(id, x, y) {
  return fetchApi(`/api/agents/${id}/move`, {
    method: 'POST',
    body: JSON.stringify({ x, y }),
  });
}

// ============================================
// Vehicles API
// ============================================

export async function getVehicles() {
  return fetchApi('/api/vehicles');
}

// ============================================
// Infrastructure API
// ============================================

export async function getPowerLines() {
  return fetchApi('/api/infrastructure/power-lines');
}

export async function createPowerLine(fromX, fromY, toX, toY, capacity) {
  return fetchApi('/api/infrastructure/power-lines', {
    method: 'POST',
    body: JSON.stringify({ fromX, fromY, toX, toY, capacity }),
  });
}

export async function deletePowerLine(id) {
  return fetchApi(`/api/infrastructure/power-lines/${id}`, {
    method: 'DELETE',
  });
}

export async function getWaterPipes() {
  return fetchApi('/api/infrastructure/water-pipes');
}

export async function createWaterPipe(fromX, fromY, toX, toY, capacity) {
  return fetchApi('/api/infrastructure/water-pipes', {
    method: 'POST',
    body: JSON.stringify({ fromX, fromY, toX, toY, capacity }),
  });
}

export async function deleteWaterPipe(id) {
  return fetchApi(`/api/infrastructure/water-pipes/${id}`, {
    method: 'DELETE',
  });
}

// ============================================
// Rentals API
// ============================================

export async function getRentalUnits(buildingId) {
  return fetchApi(`/api/rentals/building/${buildingId}/units`);
}

export async function createRentalUnit(buildingId, floorNumber, unitNumber, monthlyRent, unitType) {
  return fetchApi('/api/rentals/units', {
    method: 'POST',
    body: JSON.stringify({ buildingId, floorNumber, unitNumber, monthlyRent, unitType }),
  });
}

export async function signLease(unitId, tenantId) {
  return fetchApi(`/api/rentals/units/${unitId}/lease`, {
    method: 'POST',
    body: JSON.stringify({ tenantId }),
  });
}

// ============================================
// Payments API
// ============================================

export async function getPaymentConfig() {
  return fetchApi('/api/payments/config');
}

export async function getParcelQuote(x, y, buyerId) {
  const params = new URLSearchParams({ x, y });
  if (buyerId) params.append('buyerId', buyerId);
  return fetchApi(`/api/payments/quote?${params}`);
}

export async function processPurchase(agentId, walletAddress, x, y, currency, txHash) {
  return fetchApi('/api/payments/purchase', {
    method: 'POST',
    body: JSON.stringify({ agentId, walletAddress, x, y, currency, txHash }),
  });
}

// ============================================
// Activity API
// ============================================

export async function getActivities(limit = 20) {
  return fetchApi(`/api/activity?limit=${limit}`);
}

// ============================================
// Election API
// ============================================

export async function getElectionStatus() {
  return fetchApi('/api/election/status');
}

export async function registerCandidate(platform) {
  return fetchApi('/api/election/candidates', {
    method: 'POST',
    body: JSON.stringify({ platform }),
  });
}

export async function castVote(candidateId) {
  return fetchApi('/api/election/vote', {
    method: 'POST',
    body: JSON.stringify({ candidateId }),
  });
}

// ============================================
// Simulation API
// ============================================

export async function startSimulation() {
  return fetchApi('/api/simulation/start', { method: 'POST', body: JSON.stringify({}) });
}

export async function stopSimulation() {
  return fetchApi('/api/simulation/stop', { method: 'POST', body: JSON.stringify({}) });
}

export async function getSimulationState() {
  return fetchApi('/api/simulation/state');
}
