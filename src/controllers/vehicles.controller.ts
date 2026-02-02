// ============================================
// MOLTCITY - Vehicles Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { VehicleRepository } from '../repositories/vehicle.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { createVehicleSchema, vehicleIdParamSchema, moveVehicleSchema } from '../schemas/vehicles.schema.js';
import { NotFoundError } from '../plugins/error-handler.plugin.js';

export const vehiclesController: FastifyPluginAsync = async (fastify) => {
  const vehicleRepo = new VehicleRepository(fastify.db);
  const agentRepo = new AgentRepository(fastify.db);

  // List all vehicles
  fastify.get('/api/vehicles', async () => {
    const vehicles = await vehicleRepo.getAllVehicles();
    return { vehicles };
  });

  // Create vehicle
  fastify.post('/api/vehicles', async (request, reply) => {
    const body = createVehicleSchema.parse(request.body);

    // Verify owner exists
    const owner = await agentRepo.getAgent(body.ownerId);
    if (!owner) {
      throw new NotFoundError('Agent', body.ownerId);
    }

    const vehicle = await vehicleRepo.createVehicle(
      body.ownerId,
      body.type,
      body.x,
      body.y
    );

    if (body.sprite) {
      await vehicleRepo.updateSprite(vehicle.id, body.sprite);
    }

    reply.status(201);
    return { success: true, vehicle: await vehicleRepo.getVehicle(vehicle.id) };
  });

  // Get vehicle by ID
  fastify.get('/api/vehicles/:id', async (request) => {
    const params = vehicleIdParamSchema.parse(request.params);
    const vehicle = await vehicleRepo.getVehicle(params.id);
    return { vehicle };
  });

  // Move vehicle
  fastify.post('/api/vehicles/:id/move', async (request) => {
    const params = vehicleIdParamSchema.parse(request.params);
    const body = moveVehicleSchema.parse(request.body);

    const vehicle = await vehicleRepo.getVehicle(params.id);
    if (!vehicle) {
      throw new NotFoundError('Vehicle', params.id);
    }

    // Simple path for now - actual pathfinding in simulation
    const path = [body.destination];
    await vehicleRepo.setDestination(params.id, body.destination.x, body.destination.y, path);

    return { success: true, vehicle: await vehicleRepo.getVehicle(params.id) };
  });

  // Delete vehicle
  fastify.delete('/api/vehicles/:id', async (request) => {
    const params = vehicleIdParamSchema.parse(request.params);
    const deleted = await vehicleRepo.deleteVehicle(params.id);

    if (!deleted) {
      throw new NotFoundError('Vehicle', params.id);
    }

    return { success: true };
  });
};
