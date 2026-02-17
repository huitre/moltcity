// ============================================
// MOLTCITY - Buildings Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { BuildingService } from '../services/building.service.js';
import { UserRepository } from '../repositories/user.repository.js';
import { CityRepository } from '../repositories/city.repository.js';
import {
  createBuildingSchema,
  updateBuildingSchema,
  buildingIdParamSchema,
  buildingQuoteQuerySchema,
} from '../schemas/buildings.schema.js';
import { extractOptionalCityId } from '../utils/city-context.js';

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
    fastify.broadcast('infrastructure_update', { type: 'building', action: 'created' });
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
    await buildingService.demolishBuilding(params.id);
    fastify.broadcast('infrastructure_update', { type: 'building', action: 'deleted' });
    return { success: true };
  });
};
