// ============================================
// MOLTCITY - Rentals Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { RentalService } from '../services/rental.service.js';
import {
  createRentalUnitsSchema,
  availableUnitsQuerySchema,
  buildingUnitsParamsSchema,
  signLeaseSchema,
  payRentSchema,
  terminateLeaseSchema,
} from '../schemas/rentals.schema.js';

export const rentalsController: FastifyPluginAsync = async (fastify) => {
  const rentalService = new RentalService(fastify.db);

  // Create rental units on a floor
  fastify.post('/api/rentals/units', async (request, reply) => {
    const body = createRentalUnitsSchema.parse(request.body);
    const units = await rentalService.createRentalUnits(
      body.buildingId,
      body.floor,
      body.unitCount,
      body.rent,
      body.unitType
    );

    reply.status(201);
    return { success: true, units };
  });

  // Get available units
  fastify.get('/api/rentals/available', async (request) => {
    const query = availableUnitsQuerySchema.parse(request.query);
    const units = await rentalService.getAvailableUnits(query.type);
    return { units };
  });

  // Get units for building
  fastify.get('/api/rentals/units/:buildingId', async (request) => {
    const params = buildingUnitsParamsSchema.parse(request.params);
    const units = await rentalService.getUnitsForBuilding(params.buildingId);
    return { units };
  });

  // Sign lease
  fastify.post('/api/rentals/lease', async (request, reply) => {
    const body = signLeaseSchema.parse(request.body);
    const unit = await rentalService.signLease(body.agentId, body.unitId);

    reply.status(201);
    return { success: true, unit };
  });

  // Pay rent
  fastify.post('/api/rentals/pay', async (request) => {
    const body = payRentSchema.parse(request.body);
    await rentalService.payRent(body.agentId, body.unitId, body.amount);
    return { success: true };
  });

  // Terminate lease
  fastify.post('/api/rentals/terminate', async (request) => {
    const body = terminateLeaseSchema.parse(request.body);
    await rentalService.terminateLease(body.unitId, body.reason);
    return { success: true };
  });
};
