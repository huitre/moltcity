// ============================================
// MOLTCITY - Buildings Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { BuildingService } from '../services/building.service.js';
import { UserRepository } from '../repositories/user.repository.js';
import { CityRepository } from '../repositories/city.repository.js';
import { ParcelRepository } from '../repositories/parcel.repository.js';
import { BuildingRepository } from '../repositories/building.repository.js';
import { RoadRepository } from '../repositories/road.repository.js';
import {
  createBuildingSchema,
  updateBuildingSchema,
  buildingIdParamSchema,
  buildingQuoteQuerySchema,
} from '../schemas/buildings.schema.js';
import { extractOptionalCityId } from '../utils/city-context.js';
import { ZONE_EVOLUTION, DEMAND_BALANCE, SC2K_ECONOMY, HAPPINESS } from '../config/game.js';
import type { BuildingType, Building } from '../models/types.js';

export const buildingsController: FastifyPluginAsync = async (fastify) => {
  const buildingService = new BuildingService(fastify.db, fastify);

  // List all buildings
  fastify.get('/api/buildings', async (request) => {
    const cityId = extractOptionalCityId(request);
    const buildings = await buildingService.getAllBuildings(cityId);
    return { buildings };
  });

  // Get building quote
  fastify.get('/api/buildings/quote', async (request) => {
    const query = buildingQuoteQuerySchema.parse(request.query);
    const quote = buildingService.getQuote(query.type, query.floors);
    return { quote };
  });

  // Get building by ID
  fastify.get('/api/buildings/:id', async (request) => {
    const params = buildingIdParamSchema.parse(request.params);
    const building = await buildingService.getBuilding(params.id);
    return { building };
  });

  // Create building
  fastify.post('/api/buildings', async (request, reply) => {
    // Check authentication (optional - allows both authenticated and unauthenticated requests)
    await fastify.optionalAuth(request, reply);

    const body = createBuildingSchema.parse(request.body);
    const cityId = extractOptionalCityId(request);

    // Fetch current role from database (JWT role may be stale after role changes)
    let role: 'user' | 'admin' = 'user';
    if (request.user?.userId) {
      const userRepo = new UserRepository(fastify.db);
      const dbUser = await userRepo.getUser(request.user.userId);
      role = (dbUser?.role as 'user' | 'admin') || 'user';
    }

    // Check per-city mayor status
    let isMayor = false;
    if (cityId && request.user?.userId) {
      const cityRepo = new CityRepository(fastify.db);
      const city = await cityRepo.getCity(cityId);
      isMayor = city?.mayor === request.user.userId;
    }

    const building = await buildingService.createBuilding({
      parcelId: body.parcelId,
      x: body.x,
      y: body.y,
      agentId: body.agentId,
      moltbookId: body.moltbookId,
      type: body.type,
      name: body.name,
      sprite: body.sprite,
      floors: body.floors,
      createAgent: body.createAgent,
      agentName: body.agentName,
      role,
      isMayor,
      cityId,
    });

    reply.status(201);
    if (cityId) fastify.broadcastToCity(cityId, 'buildings_update', { action: 'created' });
    return { success: true, building };
  });

  // Update building
  fastify.put('/api/buildings/:id', async (request) => {
    const params = buildingIdParamSchema.parse(request.params);
    const body = updateBuildingSchema.parse(request.body);
    const building = await buildingService.updateBuilding(params.id, body);
    return { success: true, building };
  });

  // Demolish building
  fastify.delete('/api/buildings/:id', async (request) => {
    const params = buildingIdParamSchema.parse(request.params);
    const cityId = extractOptionalCityId(request);
    await buildingService.demolishBuilding(params.id);
    if (cityId) fastify.broadcastToCity(cityId, 'buildings_update', { action: 'deleted' });
    return { success: true };
  });

  // Get upgrade info for a zone building
  fastify.get('/api/buildings/:id/upgrade-info', async (request) => {
    const params = buildingIdParamSchema.parse(request.params);
    const cityId = extractOptionalCityId(request);

    const buildingRepo = new BuildingRepository(fastify.db);
    const parcelRepo = new ParcelRepository(fastify.db);
    const roadRepo = new RoadRepository(fastify.db);
    const cityRepo = new CityRepository(fastify.db);

    const building = await buildingRepo.getBuilding(params.id);
    if (!building) return { error: 'Building not found' };

    const type = building.type as BuildingType;
    const maxDensity = getMaxDensity(type);
    if (maxDensity === null) {
      return { error: 'Not a zone building' };
    }

    const parcel = await parcelRepo.getParcelById(building.parcelId);
    if (!parcel) return { error: 'Parcel not found' };

    const currentDensity = building.density;
    const nextDensity = currentDensity < maxDensity ? currentDensity + 1 : null;

    // --- Check requirements ---

    // 1. Powered
    const powered = { met: building.powered, label: 'Power', current: building.powered ? 'Connected' : 'No power' };

    // 2. Road adjacency
    const allRoads = await roadRepo.getAllRoads(cityId);
    let hasRoad = false;
    for (const road of allRoads) {
      const rp = await parcelRepo.getParcelById(road.parcelId);
      if (rp && Math.abs(rp.x - parcel.x) <= 1 && Math.abs(rp.y - parcel.y) <= 1) {
        hasRoad = true;
        break;
      }
    }
    const road = { met: hasRoad, label: 'Road Access', current: hasRoad ? 'Adjacent' : 'No road nearby' };

    // 3. Demand
    const allBuildings = await buildingRepo.getAllBuildings(cityId);
    const completed = allBuildings.filter(b => b.constructionProgress >= 100);
    const demandResult = calculateDemand(completed, cityId ? await cityRepo.getCity(cityId) : null);
    const demandValue = getDemandForType(type, demandResult);
    const demandThreshold = ZONE_EVOLUTION.DEMAND_THRESHOLD;
    const demand = {
      met: demandValue >= demandThreshold,
      label: 'Demand',
      current: +demandValue.toFixed(2),
      required: demandThreshold,
    };

    // 4. Land value
    const landValue = parcel.landValue;
    const requiredLandValue = nextDensity === 3
      ? ZONE_EVOLUTION.LAND_VALUE_THRESHOLD_HIGH
      : nextDensity === 2
        ? ZONE_EVOLUTION.LAND_VALUE_THRESHOLD_MEDIUM
        : 0;
    const landValueReq = {
      met: nextDensity === null || landValue >= requiredLandValue,
      label: 'Land Value',
      current: landValue,
      required: requiredLandValue,
    };

    // 5. Grid-aligned 2x2 (density 3 for residential/offices only)
    let gridAlign = { met: true, label: '2x2 Grid Alignment', current: 'N/A', required: 'N/A' };
    if (nextDensity === 3 && (type === 'residential' || type === 'offices')) {
      const aligned = parcel.x % 2 === 0 && parcel.y % 2 === 0;
      let adjOk = false;
      if (aligned) {
        adjOk = true;
        const offsets = [[1, 0], [0, 1], [1, 1]];
        for (const [dx, dy] of offsets) {
          const adj = await parcelRepo.getParcel(parcel.x + dx, parcel.y + dy, cityId);
          if (!adj || adj.zoning !== parcel.zoning) { adjOk = false; break; }
          const adjBuilding = await buildingRepo.getBuildingAtParcel(adj.id);
          if (adjBuilding && (adjBuilding.width > 1 || adjBuilding.height > 1)) { adjOk = false; break; }
        }
      }
      gridAlign = {
        met: aligned && adjOk,
        label: '2x2 Grid Alignment',
        current: !aligned ? `Position (${parcel.x},${parcel.y}) not grid-aligned` : (adjOk ? 'Ready' : 'Adjacent parcels not compatible'),
        required: 'Even x,y + 3 matching neighbors',
      };
    }

    // --- Land value breakdown ---
    const breakdown = await computeLandValueBreakdown(parcel.x, parcel.y, parcelRepo, allBuildings, allRoads, cityId);

    // --- Tips ---
    const tips: string[] = [];
    if (!powered.met) tips.push('Connect to power grid via power lines');
    if (!road.met) tips.push('Build a road within 1 tile');
    if (!demand.met) tips.push(`Zone more ${type === 'offices' ? 'office' : type} areas to balance demand`);
    if (!landValueReq.met) {
      const deficit = requiredLandValue - landValue;
      if (!hasRoad) tips.push('Build an adjacent road (+20 land value)');
      if (!breakdown.parks) tips.push('Build a park within 5 tiles (+10)');
      if (!breakdown.services) tips.push('Build a police/fire station within 15 tiles (+5)');
      if (breakdown.pollution < 0) tips.push('Move away from factories to avoid pollution penalty');
      if (deficit > 0) tips.push(`Need ${deficit} more land value to reach ${requiredLandValue}`);
    }
    if (!gridAlign.met && nextDensity === 3 && (type === 'residential' || type === 'offices')) {
      if (parcel.x % 2 !== 0 || parcel.y % 2 !== 0) {
        tips.push('Building must be at an even (x,y) position for 2x2 expansion');
      } else {
        tips.push('Ensure 3 adjacent parcels have matching zoning and no multi-tile buildings');
      }
    }

    return {
      currentDensity,
      maxDensity,
      nextDensity,
      requirements: { powered, road, demand, landValue: landValueReq, gridAlign },
      landValueBreakdown: breakdown,
      tips,
    };
  });
};

// --- Helper functions for upgrade-info ---

function getMaxDensity(type: BuildingType): number | null {
  switch (type) {
    case 'residential': return ZONE_EVOLUTION.RESIDENTIAL_MAX_DENSITY;
    case 'offices': return ZONE_EVOLUTION.OFFICE_MAX_DENSITY;
    case 'industrial': return ZONE_EVOLUTION.INDUSTRIAL_MAX_DENSITY;
    case 'suburban': return ZONE_EVOLUTION.SUBURBAN_MAX_DENSITY;
    default: return null;
  }
}

function getDemandForType(type: BuildingType, demand: { residential: number; office: number; industrial: number }): number {
  switch (type) {
    case 'residential': return demand.residential;
    case 'offices': return demand.office;
    case 'industrial': return demand.industrial;
    default: return 0;
  }
}

function calculateDemand(
  buildings: Building[],
  city: { economy: { taxRateR: number; taxRateC: number; taxRateI: number; ordinances: string[]; departmentFunding: { police: number; education: number; transit: number } } } | null,
): { residential: number; office: number; industrial: number } {
  let residential = 0, office = 0, industrial = 0;
  for (const b of buildings) {
    const t = b.type as BuildingType;
    if (t === 'residential' || t === 'suburban' || t === 'house' || t === 'apartment') residential++;
    else if (t === 'offices' || t === 'office' || t === 'shop') office++;
    else if (t === 'industrial' || t === 'factory') industrial++;
  }
  const total = residential + office + industrial;
  if (total === 0) {
    return { residential: DEMAND_BALANCE.IDEAL_RATIO.residential, office: DEMAND_BALANCE.IDEAL_RATIO.office, industrial: DEMAND_BALANCE.IDEAL_RATIO.industrial };
  }
  const currentRatio = { residential: residential / total, office: office / total, industrial: industrial / total };
  let demandR = DEMAND_BALANCE.IDEAL_RATIO.residential - currentRatio.residential;
  let demandC = DEMAND_BALANCE.IDEAL_RATIO.office - currentRatio.office;
  let demandI = DEMAND_BALANCE.IDEAL_RATIO.industrial - currentRatio.industrial;

  if (city?.economy) {
    const { NEUTRAL_RATE, DEMAND_SENSITIVITY } = SC2K_ECONOMY.TAX;
    demandR += (NEUTRAL_RATE - city.economy.taxRateR) * DEMAND_SENSITIVITY;
    demandC += (NEUTRAL_RATE - city.economy.taxRateC) * DEMAND_SENSITIVITY;
    demandI += (NEUTRAL_RATE - city.economy.taxRateI) * DEMAND_SENSITIVITY;
    for (const ordId of city.economy.ordinances) {
      const ord = SC2K_ECONOMY.ORDINANCES[ordId];
      if (!ord?.demandEffect) continue;
      if (ord.demandEffect.residential) demandR += ord.demandEffect.residential;
      if (ord.demandEffect.commercial) demandC += ord.demandEffect.commercial;
      if (ord.demandEffect.industrial) demandI += ord.demandEffect.industrial;
    }
    if (city.economy.departmentFunding.police < 50) demandR -= 0.05;
    if (city.economy.departmentFunding.education < 50) demandI -= 0.05;
    if (city.economy.departmentFunding.transit < 50) demandC -= 0.03;
  }
  return { residential: demandR, office: demandC, industrial: demandI };
}

async function computeLandValueBreakdown(
  x: number, y: number,
  parcelRepo: ParcelRepository,
  allBuildings: Building[],
  allRoads: { parcelId: string }[],
  cityId?: string,
): Promise<{ base: number; road: number; parks: number; services: number; water: number; pollution: number; distancePenalty: number; total: number }> {
  const base = 50;
  let roadBonus = 0, parks = 0, services = 0, water = 0, pollution = 0;

  // Build coord lookup for buildings
  const buildingCoords: { type: string; bx: number; by: number }[] = [];
  for (const b of allBuildings) {
    const p = await parcelRepo.getParcelById(b.parcelId);
    if (p) buildingCoords.push({ type: b.type, bx: p.x, by: p.y });
  }

  for (const bc of buildingCoords) {
    const dist = Math.abs(bc.bx - x) + Math.abs(bc.by - y);
    if ((bc.type === 'park' || bc.type === 'plaza') && dist <= 5) parks += 10;
    if ((bc.type === 'factory' || bc.type === 'industrial') && dist <= HAPPINESS.POLLUTION_RADIUS) pollution -= 10;
    if ((bc.type === 'police_station' || bc.type === 'fire_station') && dist <= 15) services += 5;
  }

  // Water check within radius 3
  const nearbyParcels = await parcelRepo.getParcelsInRange(x - 3, y - 3, x + 3, y + 3, cityId);
  for (const np of nearbyParcels) {
    if (np.terrain === 'water') { water = 5; break; }
  }

  // Road adjacency
  const roadParcelIds = new Set(allRoads.map(r => r.parcelId));
  const adjParcels = await parcelRepo.getParcelsInRange(x - 1, y - 1, x + 1, y + 1, cityId);
  for (const ap of adjParcels) {
    if (roadParcelIds.has(ap.id)) { roadBonus = 20; break; }
  }

  // Distance penalty — approximate using all parcels in city
  const allParcels = await parcelRepo.getParcelsInRange(x - 50, y - 50, x + 50, y + 50, cityId);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of allParcels) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const centerX = allParcels.length > 0 ? Math.floor((minX + maxX) / 2) : 25;
  const centerY = allParcels.length > 0 ? Math.floor((minY + maxY) / 2) : 25;
  const halfW = allParcels.length > 0 ? (maxX - minX) / 2 : 25;
  const halfH = allParcels.length > 0 ? (maxY - minY) / 2 : 25;
  const maxDist = Math.sqrt(halfW * halfW + halfH * halfH) || 1;
  const distToCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
  const distancePenalty = -Math.floor((distToCenter / maxDist) * 30);

  const total = Math.max(10, Math.min(300, base + roadBonus + parks + services + water + pollution + distancePenalty));

  return { base, road: roadBonus, parks, services, water, pollution, distancePenalty, total };
}
