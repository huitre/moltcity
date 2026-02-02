// ============================================
// MOLTCITY - Infrastructure Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { PowerLineRepository, WaterPipeRepository } from '../repositories/infrastructure.repository.js';
import {
  createPowerLineSchema,
  createWaterPipeSchema,
  infrastructureIdParamSchema,
} from '../schemas/infrastructure.schema.js';
import { NotFoundError } from '../plugins/error-handler.plugin.js';

export const infrastructureController: FastifyPluginAsync = async (fastify) => {
  const powerLineRepo = new PowerLineRepository(fastify.db);
  const waterPipeRepo = new WaterPipeRepository(fastify.db);

  // ==========================================
  // Power Lines
  // ==========================================

  // List power lines
  fastify.get('/api/infrastructure/power-lines', async () => {
    const powerLines = await powerLineRepo.getAllPowerLines();
    return { powerLines };
  });

  // Create power line
  fastify.post('/api/infrastructure/power-lines', async (request, reply) => {
    const body = createPowerLineSchema.parse(request.body);
    const id = await powerLineRepo.createPowerLine(
      body.fromX,
      body.fromY,
      body.toX,
      body.toY,
      body.capacity
    );

    reply.status(201);
    const powerLine = await powerLineRepo.getPowerLine(id);
    return { success: true, powerLine };
  });

  // Delete power line
  fastify.delete('/api/infrastructure/power-lines/:id', async (request) => {
    const params = infrastructureIdParamSchema.parse(request.params);
    const deleted = await powerLineRepo.deletePowerLine(params.id);

    if (!deleted) {
      throw new NotFoundError('Power line', params.id);
    }

    return { success: true };
  });

  // ==========================================
  // Water Pipes
  // ==========================================

  // List water pipes
  fastify.get('/api/infrastructure/water-pipes', async () => {
    const waterPipes = await waterPipeRepo.getAllWaterPipes();
    return { waterPipes };
  });

  // Create water pipe
  fastify.post('/api/infrastructure/water-pipes', async (request, reply) => {
    const body = createWaterPipeSchema.parse(request.body);
    const id = await waterPipeRepo.createWaterPipe(
      body.fromX,
      body.fromY,
      body.toX,
      body.toY,
      body.capacity
    );

    reply.status(201);
    const waterPipe = await waterPipeRepo.getWaterPipe(id);
    return { success: true, waterPipe };
  });

  // Delete water pipe
  fastify.delete('/api/infrastructure/water-pipes/:id', async (request) => {
    const params = infrastructureIdParamSchema.parse(request.params);
    const deleted = await waterPipeRepo.deleteWaterPipe(params.id);

    if (!deleted) {
      throw new NotFoundError('Water pipe', params.id);
    }

    return { success: true };
  });
};
