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
  setZoningBatchSchema,
} from '../schemas/parcels.schema.js';
import { extractOptionalCityId } from '../utils/city-context.js';
import { UserRepository } from '../repositories/user.repository.js';
import { CityRepository } from '../repositories/city.repository.js';
import { RoadRepository } from '../repositories/road.repository.js';
import { ForbiddenError, InsufficientFundsError } from '../plugins/error-handler.plugin.js';
import { hasElevatedPrivileges, ZONING_COST, type UserRole } from '../config/game.js';

export const parcelsController: FastifyPluginAsync = async (fastify) => {
  const parcelService = new ParcelService(fastify.db, fastify);

  // Get parcels in range
  fastify.get('/api/parcels', async (request) => {
    const query = parcelsRangeQuerySchema.parse(request.query);
    const cityId = extractOptionalCityId(request);
    const parcels = await parcelService.getParcelsInRange(
      query.minX,
      query.minY,
      query.maxX,
      query.maxY,
      cityId
    );
    return { parcels };
  });

  // Get specific parcel with building/road
  fastify.get('/api/parcels/:x/:y', async (request) => {
    const params = parcelCoordsParamsSchema.parse(request.params);
    const cityId = extractOptionalCityId(request);
    const parcel = await parcelService.getParcel(params.x, params.y, cityId);

    if (!parcel) {
      return { parcel: null };
    }

    return { parcel };
  });

  // Get parcel price quote for an agent
  fastify.get('/api/parcels/quote', async (request, reply) => {
    await fastify.optionalAuth(request, reply);
    const query = request.query as { agentId?: string };
    const agentId = query.agentId || request.user?.userId || '';
    const quote = await parcelService.getParcelQuote(agentId);
    return quote;
  });

  // Purchase parcel
  fastify.post('/api/parcels/purchase', async (request, reply) => {
    // Check authentication (optional - allows both authenticated and unauthenticated requests)
    await fastify.optionalAuth(request, reply);

    const body = purchaseParcelSchema.parse(request.body);
    const role = request.user?.role || 'user';
    const cityId = extractOptionalCityId(request);

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
      cityId,
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
    const cityId = extractOptionalCityId(request);

    // Resolve parcelId from x/y if not provided
    let parcelId = body.parcelId;
    if (!parcelId && body.x !== undefined && body.y !== undefined) {
      const parcel = await parcelService.getOrCreateParcel(body.x, body.y, cityId);
      parcelId = parcel.id;
    }
    if (!parcelId) {
      return { statusCode: 400, error: 'parcelId or x/y coordinates required' };
    }

    const parcel = await parcelService.setZoning(parcelId, body.zoning, cityId);
    return { success: true, parcel };
  });

  // Batch set zoning (requires mayor/admin)
  fastify.post('/api/parcels/zoning/batch', {
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
      throw new ForbiddenError('Only mayors and admins can set zoning');
    }

    const body = setZoningBatchSchema.parse(request.body);

    // Determine valid tiles (skip water, roads, same zoning, different existing zoning)
    const roadRepo = new RoadRepository(fastify.db);
    const validParcels: { id: string }[] = [];
    for (const tile of body.tiles) {
      const parcel = await parcelService.getOrCreateParcel(tile.x, tile.y, cityId);
      if (parcel.terrain === 'water') continue;
      if (parcel.zoning === body.zoning) continue;
      if (parcel.zoning && parcel.zoning !== body.zoning) continue;
      const road = await roadRepo.getRoad(parcel.id);
      if (road) continue;
      validParcels.push({ id: parcel.id });
    }

    if (validParcels.length === 0) {
      return { success: true, zoned: 0, skipped: body.tiles.length };
    }

    // Treasury check
    const totalCost = validParcels.length * ZONING_COST;
    if (cityData && totalCost > 0) {
      if (cityData.stats.treasury < totalCost) {
        throw new InsufficientFundsError(totalCost, cityData.stats.treasury);
      }
      await cityRepo.updateTreasury(cityData.id, cityData.stats.treasury - totalCost);
    }

    // Apply zoning to all valid parcels
    for (const p of validParcels) {
      await parcelService.setZoningDirect(p.id, body.zoning, cityId);
    }

    reply.status(201);
    if (cityId) fastify.broadcastToCity(cityId, 'buildings_update', { action: 'zoning_batch_set' });
    return { success: true, zoned: validParcels.length, skipped: body.tiles.length - validParcels.length };
  });
};
