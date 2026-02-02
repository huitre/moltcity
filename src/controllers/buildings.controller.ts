// ============================================
// MOLTCITY - Buildings Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { BuildingService } from '../services/building.service.js';
import {
  createBuildingSchema,
  updateBuildingSchema,
  buildingIdParamSchema,
  buildingQuoteQuerySchema,
} from '../schemas/buildings.schema.js';

export const buildingsController: FastifyPluginAsync = async (fastify) => {
  const buildingService = new BuildingService(fastify.db);

  // List all buildings
  fastify.get('/api/buildings', async () => {
    const buildings = await buildingService.getAllBuildings();
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
    const body = createBuildingSchema.parse(request.body);
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
    });

    reply.status(201);
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
    return { success: true };
  });
};
