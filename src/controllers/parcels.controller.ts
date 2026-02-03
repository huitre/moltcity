// ============================================
// MOLTCITY - Parcels Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { ParcelService } from '../services/parcel.service.js';
import {
  parcelCoordsParamsSchema,
  parcelsRangeQuerySchema,
  purchaseParcelSchema,
  sellParcelSchema,
  setZoningSchema,
} from '../schemas/parcels.schema.js';

export const parcelsController: FastifyPluginAsync = async (fastify) => {
  const parcelService = new ParcelService(fastify.db, fastify);

  // Get parcels in range
  fastify.get('/api/parcels', async (request) => {
    const query = parcelsRangeQuerySchema.parse(request.query);
    const parcels = await parcelService.getParcelsInRange(
      query.minX,
      query.minY,
      query.maxX,
      query.maxY
    );
    return { parcels };
  });

  // Get specific parcel with building/road
  fastify.get('/api/parcels/:x/:y', async (request) => {
    const params = parcelCoordsParamsSchema.parse(request.params);
    const parcel = await parcelService.getParcel(params.x, params.y);

    if (!parcel) {
      return { parcel: null };
    }

    return { parcel };
  });

  // Purchase parcel
  fastify.post('/api/parcels/purchase', async (request, reply) => {
    // Check authentication (optional - allows both authenticated and unauthenticated requests)
    await fastify.optionalAuth(request, reply);

    const body = purchaseParcelSchema.parse(request.body);
    const role = request.user?.role || 'user';

    const result = await parcelService.purchaseParcel({
      parcelId: body.parcelId,
      x: body.x,
      y: body.y,
      agentId: body.agentId,
      moltbookId: body.moltbookId,
      price: body.price,
      createAgent: body.createAgent,
      agentName: body.agentName,
      role,
    });

    reply.status(201);
    return {
      success: true,
      parcel: result.parcel,
      agentId: result.agentId,
      agentCreated: result.agentCreated,
    };
  });

  // Sell/transfer parcel
  fastify.post('/api/parcels/sell', async (request) => {
    const body = sellParcelSchema.parse(request.body);
    const parcel = await parcelService.sellParcel(
      body.parcelId,
      body.sellerId,
      body.buyerId,
      body.price
    );

    return { success: true, parcel };
  });

  // Set zoning
  fastify.post('/api/parcels/zoning', async (request) => {
    const body = setZoningSchema.parse(request.body);
    const parcel = await parcelService.setZoning(body.parcelId, body.zoning);
    return { success: true, parcel };
  });
};
