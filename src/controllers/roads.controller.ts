// ============================================
// MOLTCITY - Roads Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { RoadRepository } from '../repositories/road.repository.js';
import { ParcelRepository } from '../repositories/parcel.repository.js';
import { createRoadSchema, roadIdParamSchema } from '../schemas/roads.schema.js';
import { NotFoundError, ConflictError } from '../plugins/error-handler.plugin.js';

export const roadsController: FastifyPluginAsync = async (fastify) => {
  const roadRepo = new RoadRepository(fastify.db);
  const parcelRepo = new ParcelRepository(fastify.db);

  // List all roads
  fastify.get('/api/roads', async () => {
    const roads = await roadRepo.getAllRoads();
    return { roads };
  });

  // Create road
  fastify.post('/api/roads', async (request, reply) => {
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

    const road = await roadRepo.createRoad(parcelId, body.direction, body.lanes);

    reply.status(201);
    return { success: true, road };
  });

  // Delete road
  fastify.delete('/api/roads/:id', async (request) => {
    const params = roadIdParamSchema.parse(request.params);
    const deleted = await roadRepo.deleteRoad(params.id);

    if (!deleted) {
      throw new NotFoundError('Road', params.id);
    }

    return { success: true };
  });
};
