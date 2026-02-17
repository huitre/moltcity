// ============================================
// MOLTCITY - Roads Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { RoadRepository } from '../repositories/road.repository.js';
import { ParcelRepository } from '../repositories/parcel.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { BuildingRepository } from '../repositories/building.repository.js';
import { createRoadSchema, roadIdParamSchema } from '../schemas/roads.schema.js';
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
    // Check multi-tile buildings whose footprint covers this tile
    const parcel = await parcelRepo.getParcelById(parcelId);
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
    return { success: true, road };
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

    return { success: true };
  });
};
