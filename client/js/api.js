// ============================================
// MOLTCITY - API Service
// ============================================

import { API_URL } from './config.js';
import * as state from './state.js';

/**
 * Get auth headers for API requests
 */
function getHeaders(hasBody = true) {
  const headers = {};
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (state.currentToken) {
    headers['Authorization'] = `Bearer ${state.currentToken}`;
  }
  return headers;
}

/**
 * Append cityId query param if we have one
 */
function withCityId(endpoint) {
  const cityId = state.currentCityId;
  if (!cityId) return endpoint;
  const sep = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${sep}cityId=${encodeURIComponent(cityId)}`;
}

/**
 * Add cityId to a request body object
 */
function bodyWithCity(obj = {}) {
  const cityId = state.currentCityId;
  if (cityId) obj.cityId = cityId;
  return obj;
}

/**
 * Generic fetch wrapper with error handling
 */
async function fetchApi(endpoint, options = {}) {
  const hasBody = options.body !== undefined;
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...getHeaders(hasBody), ...options.headers },
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
  return fetchApi(withCityId('/api/auth/me'));
}

// ============================================
// Cities API (multi-city)
// ============================================

export async function getCities() {
  return fetchApi('/api/cities');
}

export async function createCity(name) {
  return fetchApi('/api/cities', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function getCityById(cityId) {
  return fetchApi(`/api/cities/${cityId}`);
}

// ============================================
// City API (legacy compat)
// ============================================

export async function getCity() {
  return fetchApi(withCityId('/api/city'));
}

export async function initCity(name) {
  return fetchApi('/api/city/init', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ name })),
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
  if (state.currentCityId) params.append('cityId', state.currentCityId);
  if (minX !== undefined) params.append('minX', minX);
  if (minY !== undefined) params.append('minY', minY);
  if (maxX !== undefined) params.append('maxX', maxX);
  if (maxY !== undefined) params.append('maxY', maxY);

  const query = params.toString();
  return fetchApi(`/api/parcels${query ? `?${query}` : ''}`);
}

export async function getParcel(x, y) {
  return fetchApi(withCityId(`/api/parcels/${x}/${y}`));
}

export async function purchaseParcel(agentId, x, y, price) {
  return fetchApi('/api/parcels/purchase', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ agentId, x, y, price })),
  });
}

export async function sellParcel(agentId, x, y, buyerId, price) {
  return fetchApi('/api/parcels/sell', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ agentId, x, y, buyerId, price })),
  });
}

export async function getParcelPriceQuote(agentId) {
  const params = new URLSearchParams();
  if (agentId) params.append('agentId', agentId);
  if (state.currentCityId) params.append('cityId', state.currentCityId);
  return fetchApi(`/api/parcels/quote?${params}`);
}

// ============================================
// Buildings API
// ============================================

export async function getBuildings() {
  return fetchApi(withCityId('/api/buildings'));
}

export async function getBuilding(id) {
  return fetchApi(withCityId(`/api/buildings/${id}`));
}

export async function getBuildingQuote(type, floors) {
  return fetchApi(withCityId(`/api/buildings/quote?type=${type}&floors=${floors || 1}`));
}

export async function createBuilding(params) {
  return fetchApi('/api/buildings', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity(params)),
  });
}

export async function updateBuilding(id, updates) {
  return fetchApi(`/api/buildings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(bodyWithCity(updates)),
  });
}

export async function demolishBuilding(id, agentId) {
  return fetchApi(`/api/buildings/${id}`, {
    method: 'DELETE',
    body: JSON.stringify(bodyWithCity({ agentId })),
  });
}

// ============================================
// Roads API
// ============================================

export async function getRoads() {
  return fetchApi(withCityId('/api/roads'));
}

export async function createRoad(params) {
  return fetchApi('/api/roads', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity(params)),
  });
}

export async function createRoadsBatch(tiles) {
  return fetchApi('/api/roads/batch', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ tiles })),
  });
}

export async function deleteRoad(id) {
  return fetchApi(withCityId(`/api/roads/${id}`), { method: 'DELETE' });
}

// ============================================
// Agents API
// ============================================

export async function getAgents() {
  return fetchApi(withCityId('/api/agents'));
}

export async function getAgent(id) {
  return fetchApi(withCityId(`/api/agents/${id}`));
}

export async function createAgent(name, x, y) {
  return fetchApi('/api/agents', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ name, x, y })),
  });
}

export async function moveAgent(id, x, y) {
  return fetchApi(`/api/agents/${id}/move`, {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ x, y })),
  });
}

// ============================================
// Vehicles API
// ============================================

export async function getVehicles() {
  return fetchApi(withCityId('/api/vehicles'));
}

// ============================================
// Infrastructure API
// ============================================

export async function getPowerLines() {
  return fetchApi(withCityId('/api/infrastructure/power-lines'));
}

export async function createPowerLine(fromX, fromY, toX, toY, capacity) {
  return fetchApi('/api/infrastructure/power-lines', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ fromX, fromY, toX, toY, capacity })),
  });
}

export async function deletePowerLine(id) {
  return fetchApi(withCityId(`/api/infrastructure/power-lines/${id}`), {
    method: 'DELETE',
  });
}

export async function getWaterPipes() {
  return fetchApi(withCityId('/api/infrastructure/water-pipes'));
}

export async function createWaterPipe(fromX, fromY, toX, toY, capacity) {
  return fetchApi('/api/infrastructure/water-pipes', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ fromX, fromY, toX, toY, capacity })),
  });
}

export async function deleteWaterPipe(id) {
  return fetchApi(withCityId(`/api/infrastructure/water-pipes/${id}`), {
    method: 'DELETE',
  });
}

// ============================================
// Rentals API
// ============================================

export async function getRentalUnits(buildingId) {
  return fetchApi(withCityId(`/api/rentals/building/${buildingId}/units`));
}

export async function createRentalUnit(buildingId, floorNumber, unitNumber, monthlyRent, unitType) {
  return fetchApi('/api/rentals/units', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ buildingId, floorNumber, unitNumber, monthlyRent, unitType })),
  });
}

export async function signLease(unitId, tenantId) {
  return fetchApi(`/api/rentals/units/${unitId}/lease`, {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ tenantId })),
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
  if (state.currentCityId) params.append('cityId', state.currentCityId);
  return fetchApi(`/api/payments/quote?${params}`);
}

export async function processPurchase(agentId, walletAddress, x, y, currency, txHash) {
  return fetchApi('/api/payments/purchase', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ agentId, walletAddress, x, y, currency, txHash })),
  });
}

// ============================================
// Activity API
// ============================================

export async function getActivities(limit = 20) {
  return fetchApi(withCityId(`/api/activity?limit=${limit}`));
}

// ============================================
// Election API
// ============================================

export async function getElectionStatus() {
  return fetchApi(withCityId('/api/election/status'));
}

export async function registerCandidate(platform) {
  return fetchApi('/api/election/candidates', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ platform })),
  });
}

export async function castVote(candidateId) {
  return fetchApi('/api/election/vote', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ candidateId })),
  });
}

// ============================================
// Simulation API
// ============================================

export async function startSimulation() {
  return fetchApi('/api/simulation/start', { method: 'POST', body: JSON.stringify(bodyWithCity({})) });
}

export async function stopSimulation() {
  return fetchApi('/api/simulation/stop', { method: 'POST', body: JSON.stringify(bodyWithCity({})) });
}

export async function getSimulationState() {
  return fetchApi(withCityId('/api/simulation/state'));
}

// ============================================
// Economy API
// ============================================

export async function getBudget() {
  return fetchApi(withCityId('/api/economy/budget'));
}

export async function setTaxRates(taxRateR, taxRateC, taxRateI) {
  return fetchApi('/api/economy/tax-rates', {
    method: 'PUT',
    body: JSON.stringify(bodyWithCity({ taxRateR, taxRateC, taxRateI })),
  });
}

export async function toggleOrdinance(ordinanceId, enabled) {
  return fetchApi('/api/economy/ordinances', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ ordinanceId, enabled })),
  });
}

export async function issueBond() {
  return fetchApi('/api/economy/bonds/issue', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({})),
  });
}

export async function repayBond(bondId) {
  return fetchApi('/api/economy/bonds/repay', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ bondId })),
  });
}

export async function setDepartmentFunding(funding) {
  return fetchApi('/api/economy/department-funding', {
    method: 'PUT',
    body: JSON.stringify(bodyWithCity(funding)),
  });
}

// ============================================
// Sprites Config API
// ============================================

// ============================================
// Zoning API
// ============================================

export async function setZoning(parcelIdOrX, zoningOrY, maybeZoning) {
  // Supports both: setZoning(parcelId, zoning) and setZoning(x, y, zoning)
  const params = typeof parcelIdOrX === 'number'
    ? { x: parcelIdOrX, y: zoningOrY, zoning: maybeZoning }
    : { parcelId: parcelIdOrX, zoning: zoningOrY };
  return fetchApi('/api/parcels/zoning', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity(params)),
  });
}

export async function setZoningBatch(tiles, zoning) {
  return fetchApi('/api/parcels/zoning/batch', {
    method: 'POST',
    body: JSON.stringify(bodyWithCity({ tiles, zoning })),
  });
}

export async function updateSpriteConfig(data) {
  return fetchApi('/api/sprites/config', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
