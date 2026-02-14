// ============================================
// MOLTCITY - Roads Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { RoadRepository } from '../repositories/road.repository.js';
import { ParcelRepository } from '../repositories/parcel.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { createRoadSchema, roadIdParamSchema } from '../schemas/roads.schema.js';
import { NotFoundError, ConflictError, ForbiddenError, InsufficientFundsError } from '../plugins/error-handler.plugin.js';
import { hasElevatedPrivileges, BUILDING_COSTS, type UserRole } from '../config/game.js';
import { CityRepository } from '../repositories/city.repository.js';

export const roadsController: FastifyPluginAsync = async (fastify) => {
  const roadRepo = new RoadRepository(fastify.db);
  const parcelRepo = new ParcelRepository(fastify.db);

  // List all roads
  fastify.get('/api/roads', async () => {
    const roads = await roadRepo.getAllRoads();
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
      role = dbUser?.role || 'user';
    }
    if (!hasElevatedPrivileges(role)) {
      throw new ForbiddenError('Only mayors and admins can create roads');
    }

    const body = createRoadSchema.parse(request.body);

    // Get parcel
    let parcelId = body.parcelId;
    if (!parcelId && body.x !== undefined && body.y !== undefined) {
      const parcel = await parcelRepo.getParcel(body.x, body.y);
      if (!parcel) {
        throw new NotFoundError('Parcel');
      }
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

    // Deduct road cost from city treasury
    const cost = BUILDING_COSTS.road;
    const cityRepo = new CityRepository(fastify.db);
    const city = await cityRepo.getCity();
    if (city && cost > 0) {
      if (city.stats.treasury < cost) {
        throw new InsufficientFundsError(cost, city.stats.treasury);
      }
      await cityRepo.updateTreasury(city.stats.treasury - cost);
    }

    const road = await roadRepo.createRoad(parcelId, body.direction, body.lanes);

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
      role = dbUser?.role || 'user';
    }
    if (!hasElevatedPrivileges(role)) {
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
