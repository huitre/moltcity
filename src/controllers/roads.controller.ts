// ============================================
// MOLTCITY - Roads Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { RoadRepository } from '../repositories/road.repository.js';
import { ParcelRepository } from '../repositories/parcel.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { BuildingRepository } from '../repositories/building.repository.js';
import { createRoadSchema, createRoadsBatchSchema, roadIdParamSchema } from '../schemas/roads.schema.js';
import { NotFoundError, ConflictError, ForbiddenError, InsufficientFundsError } from '../plugins/error-handler.plugin.js';
import { hasElevatedPrivileges, BUILDING_COSTS, type UserRole } from '../config/game.js';
import { CityRepository } from '../repositories/city.repository.js';
import { extractCityId, extractOptionalCityId } from '../utils/city-context.js';

export const roadsController: FastifyPluginAsync = async (fastify) => {
  const roadRepo = new RoadRepository(fastify.db);
  const parcelRepo = new ParcelRepository(fastify.db);

  // List all roads
  fastify.get('/api/roads', async (request) => {
    const cityId = extractOptionalCityId(request);
    const roads = await roadRepo.getAllRoads(cityId);
    return { roads };
  });

  // Create road (requires mayor/admin)
  fastify.post('/api/roads', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    // Fetch current role from database (JWT role may be stale after role changes)
    let role: UserRole = 'user';
    if (request.user?.userId) {
      const userRepo = new UserRepository(fastify.db);
      const dbUser = await userRepo.getUser(request.user.userId);
      role = (dbUser?.role as UserRole) || 'user';
    }

    // Check if user is mayor of the city
    const cityId = extractOptionalCityId(request);
    const cityRepo = new CityRepository(fastify.db);
    const cityData = cityId ? await cityRepo.getCity(cityId) : await cityRepo.getCity();
    const isMayor = !!(cityData && request.user?.userId && cityData.mayor === request.user.userId);

    if (!hasElevatedPrivileges(role, isMayor)) {
      throw new ForbiddenError('Only mayors and admins can create roads');
    }

    const body = createRoadSchema.parse(request.body);

    // Get or create parcel (parcels are created on-demand)
    let parcelId = body.parcelId;
    if (!parcelId && body.x !== undefined && body.y !== undefined) {
      const parcel = await parcelRepo.getOrCreateParcel(body.x, body.y, cityData?.id);
      parcelId = parcel.id;
    }

    if (!parcelId) {
      throw new NotFoundError('Parcel');
    }

    // Check for existing road
    const existingRoad = await roadRepo.getRoad(parcelId);
    if (existingRoad) {
      throw new ConflictError('Road already exists at this location');
    }

    // Check for existing building at this parcel (including multi-tile overlap)
    const buildingRepo = new BuildingRepository(fastify.db);
    const existingBuilding = await buildingRepo.getBuildingAtParcel(parcelId);
    if (existingBuilding) {
      throw new ConflictError('Cannot place road on a building');
    }
    // Block roads on water
    const parcel = await parcelRepo.getParcelById(parcelId);
    if (parcel && parcel.terrain === 'water') {
      throw new ConflictError('Cannot place road on water');
    }

    // Check multi-tile buildings whose footprint covers this tile
    if (parcel) {
      const allBuildings = await buildingRepo.getAllBuildings(cityData?.id);
      for (const b of allBuildings) {
        if (b.width <= 1 && b.height <= 1) continue;
        const bParcel = await parcelRepo.getParcelById(b.parcelId);
        if (!bParcel) continue;
        if (parcel.x >= bParcel.x && parcel.x < bParcel.x + b.width &&
            parcel.y >= bParcel.y && parcel.y < bParcel.y + b.height) {
          throw new ConflictError('Cannot place road on a building');
        }
      }
    }

    // Deduct road cost from city treasury
    const cost = BUILDING_COSTS.road;
    if (cityData && cost > 0) {
      if (cityData.stats.treasury < cost) {
        throw new InsufficientFundsError(cost, cityData.stats.treasury);
      }
      await cityRepo.updateTreasury(cityData.id, cityData.stats.treasury - cost);
    }

    const road = await roadRepo.createRoad(parcelId, body.direction, body.lanes, cityData?.id);

    reply.status(201);
    if (cityData?.id) fastify.broadcastToCity(cityData.id, 'buildings_update', { action: 'road_created' });
    return { success: true, road };
  });

  // Batch create roads (requires mayor/admin)
  fastify.post('/api/roads/batch', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    let role: UserRole = 'user';
    if (request.user?.userId) {
      const userRepo = new UserRepository(fastify.db);
      const dbUser = await userRepo.getUser(request.user.userId);
      role = (dbUser?.role as UserRole) || 'user';
    }

    const cityId = extractOptionalCityId(request);
    const cityRepo = new CityRepository(fastify.db);
    const cityData = cityId ? await cityRepo.getCity(cityId) : await cityRepo.getCity();
    const isMayor = !!(cityData && request.user?.userId && cityData.mayor === request.user.userId);

    if (!hasElevatedPrivileges(role, isMayor)) {
      throw new ForbiddenError('Only mayors and admins can create roads');
    }

    const body = createRoadsBatchSchema.parse(request.body);
    const buildingRepo = new BuildingRepository(fastify.db);
    const allBuildings = await buildingRepo.getAllBuildings(cityData?.id);

    // Determine valid tiles
    const validParcels: { id: string; x: number; y: number }[] = [];
    for (const tile of body.tiles) {
      const parcel = await parcelRepo.getOrCreateParcel(tile.x, tile.y, cityData?.id);

      if (parcel.terrain === 'water') continue;

      const existingRoad = await roadRepo.getRoad(parcel.id);
      if (existingRoad) continue;

      const existingBuilding = await buildingRepo.getBuildingAtParcel(parcel.id);
      if (existingBuilding) continue;

      // Check multi-tile buildings
      let blocked = false;
      for (const b of allBuildings) {
        if (b.width <= 1 && b.height <= 1) continue;
        const bParcel = await parcelRepo.getParcelById(b.parcelId);
        if (!bParcel) continue;
        if (parcel.x >= bParcel.x && parcel.x < bParcel.x + b.width &&
            parcel.y >= bParcel.y && parcel.y < bParcel.y + b.height) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      validParcels.push({ id: parcel.id, x: parcel.x, y: parcel.y });
    }

    if (validParcels.length === 0) {
      return { success: true, created: 0, skipped: body.tiles.length };
    }

    // Treasury check
    const totalCost = validParcels.length * BUILDING_COSTS.road;
    if (cityData && totalCost > 0) {
      if (cityData.stats.treasury < totalCost) {
        throw new InsufficientFundsError(totalCost, cityData.stats.treasury);
      }
      await cityRepo.updateTreasury(cityData.id, cityData.stats.treasury - totalCost);
    }

    // Create all roads
    for (const p of validParcels) {
      await roadRepo.createRoad(p.id, 'intersection', 2, cityData?.id);
    }

    reply.status(201);
    if (cityData?.id) fastify.broadcastToCity(cityData.id, 'buildings_update', { action: 'roads_batch_created' });
    return { success: true, created: validParcels.length, skipped: body.tiles.length - validParcels.length };
  });

  // Delete road (requires mayor/admin)
  fastify.delete('/api/roads/:id', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    // Fetch current role from database (JWT role may be stale after role changes)
    let role: UserRole = 'user';
    if (request.user?.userId) {
      const userRepo = new UserRepository(fastify.db);
      const dbUser = await userRepo.getUser(request.user.userId);
      role = (dbUser?.role as UserRole) || 'user';
    }

    // Check if user is mayor of the city
    const cityId = extractOptionalCityId(request);
    const cityRepo = new CityRepository(fastify.db);
    const cityData = cityId ? await cityRepo.getCity(cityId) : await cityRepo.getCity();
    const isMayor = !!(cityData && request.user?.userId && cityData.mayor === request.user.userId);

    if (!hasElevatedPrivileges(role, isMayor)) {
      throw new ForbiddenError('Only mayors and admins can delete roads');
    }

    const params = roadIdParamSchema.parse(request.params);
    const deleted = await roadRepo.deleteRoad(params.id);

    if (!deleted) {
      throw new NotFoundError('Road', params.id);
    }

    if (cityData?.id) fastify.broadcastToCity(cityData.id, 'buildings_update', { action: 'road_deleted' });
    return { success: true };
  });
};
