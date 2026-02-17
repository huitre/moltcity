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
import { NotFoundError, ForbiddenError, InsufficientFundsError } from '../plugins/error-handler.plugin.js';
import { UserRepository } from '../repositories/user.repository.js';
import { CityRepository } from '../repositories/city.repository.js';
import { hasElevatedPrivileges, BUILDING_COSTS, type UserRole } from '../config/game.js';
import { extractOptionalCityId } from '../utils/city-context.js';

export const infrastructureController: FastifyPluginAsync = async (fastify) => {
  const powerLineRepo = new PowerLineRepository(fastify.db);
  const waterPipeRepo = new WaterPipeRepository(fastify.db);

  // ==========================================
  // Power Lines
  // ==========================================

  // List power lines
  fastify.get('/api/infrastructure/power-lines', async (request) => {
    const cityId = extractOptionalCityId(request);
    const powerLines = await powerLineRepo.getAllPowerLines(cityId);
    return { powerLines };
  });

  // Create power line (requires mayor/admin)
  fastify.post('/api/infrastructure/power-lines', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const body = createPowerLineSchema.parse(request.body);
    const cityId = extractOptionalCityId(request);

    let role: UserRole = 'user';
    if (request.user?.userId) {
      const userRepo = new UserRepository(fastify.db);
      const dbUser = await userRepo.getUser(request.user.userId);
      role = (dbUser?.role as UserRole) || 'user';
    }

    // Check if user is mayor of this city
    const cityRepo = new CityRepository(fastify.db);
    const city = cityId ? await cityRepo.getCity(cityId) : await cityRepo.getCity();
    const isMayor = !!(city && request.user?.userId && city.mayor === request.user.userId);

    if (!hasElevatedPrivileges(role, isMayor)) {
      throw new ForbiddenError('Only mayors and admins can create power lines');
    }

    // Deduct cost from city treasury
    const cost = BUILDING_COSTS.power_line;
    if (city && cost > 0) {
      if (city.stats.treasury < cost) {
        throw new InsufficientFundsError(cost, city.stats.treasury);
      }
      await cityRepo.updateTreasury(city.id, city.stats.treasury - cost);
    }

    const id = await powerLineRepo.createPowerLine(
      body.fromX,
      body.fromY,
      body.toX,
      body.toY,
      body.capacity,
      city?.id
    );

    reply.status(201);
    const powerLine = await powerLineRepo.getPowerLine(id);
    fastify.broadcast('infrastructure_update', { type: 'power_line', action: 'created' });
    return { success: true, powerLine };
  });

  // Delete power line (requires mayor/admin)
  fastify.delete('/api/infrastructure/power-lines/:id', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    let role: UserRole = 'user';
    if (request.user?.userId) {
      const userRepo = new UserRepository(fastify.db);
      const dbUser = await userRepo.getUser(request.user.userId);
      role = (dbUser?.role as UserRole) || 'user';
    }

    // Check if user is mayor of this city
    const cityId = extractOptionalCityId(request);
    const cityRepo = new CityRepository(fastify.db);
    const city = cityId ? await cityRepo.getCity(cityId) : await cityRepo.getCity();
    const isMayor = !!(city && request.user?.userId && city.mayor === request.user.userId);

    if (!hasElevatedPrivileges(role, isMayor)) {
      throw new ForbiddenError('Only mayors and admins can delete power lines');
    }

    const params = infrastructureIdParamSchema.parse(request.params);
    const deleted = await powerLineRepo.deletePowerLine(params.id);

    if (!deleted) {
      throw new NotFoundError('Power line', params.id);
    }

    fastify.broadcast('infrastructure_update', { type: 'power_line', action: 'deleted' });
    return { success: true };
  });

  // ==========================================
  // Water Pipes
  // ==========================================

  // List water pipes
  fastify.get('/api/infrastructure/water-pipes', async (request) => {
    const cityId = extractOptionalCityId(request);
    const waterPipes = await waterPipeRepo.getAllWaterPipes(cityId);
    return { waterPipes };
  });

  // Create water pipe (requires mayor/admin)
  fastify.post('/api/infrastructure/water-pipes', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const body = createWaterPipeSchema.parse(request.body);
    const cityId = extractOptionalCityId(request);

    let role: UserRole = 'user';
    if (request.user?.userId) {
      const userRepo = new UserRepository(fastify.db);
      const dbUser = await userRepo.getUser(request.user.userId);
      role = (dbUser?.role as UserRole) || 'user';
    }

    // Check if user is mayor of this city
    const cityRepo = new CityRepository(fastify.db);
    const city = cityId ? await cityRepo.getCity(cityId) : await cityRepo.getCity();
    const isMayor = !!(city && request.user?.userId && city.mayor === request.user.userId);

    if (!hasElevatedPrivileges(role, isMayor)) {
      throw new ForbiddenError('Only mayors and admins can create water pipes');
    }

    // Deduct cost from city treasury
    const cost = BUILDING_COSTS.water_pipe;
    if (city && cost > 0) {
      if (city.stats.treasury < cost) {
        throw new InsufficientFundsError(cost, city.stats.treasury);
      }
      await cityRepo.updateTreasury(city.id, city.stats.treasury - cost);
    }

    const id = await waterPipeRepo.createWaterPipe(
      body.fromX,
      body.fromY,
      body.toX,
      body.toY,
      body.capacity,
      city?.id
    );

    reply.status(201);
    const waterPipe = await waterPipeRepo.getWaterPipe(id);
    fastify.broadcast('infrastructure_update', { type: 'water_pipe', action: 'created' });
    return { success: true, waterPipe };
  });

  // Delete water pipe (requires mayor/admin)
  fastify.delete('/api/infrastructure/water-pipes/:id', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    let role: UserRole = 'user';
    if (request.user?.userId) {
      const userRepo = new UserRepository(fastify.db);
      const dbUser = await userRepo.getUser(request.user.userId);
      role = (dbUser?.role as UserRole) || 'user';
    }

    // Check if user is mayor of this city
    const cityId = extractOptionalCityId(request);
    const cityRepo = new CityRepository(fastify.db);
    const city = cityId ? await cityRepo.getCity(cityId) : await cityRepo.getCity();
    const isMayor = !!(city && request.user?.userId && city.mayor === request.user.userId);

    if (!hasElevatedPrivileges(role, isMayor)) {
      throw new ForbiddenError('Only mayors and admins can delete water pipes');
    }

    const params = infrastructureIdParamSchema.parse(request.params);
    const deleted = await waterPipeRepo.deleteWaterPipe(params.id);

    if (!deleted) {
      throw new NotFoundError('Water pipe', params.id);
    }

    fastify.broadcast('infrastructure_update', { type: 'water_pipe', action: 'deleted' });
    return { success: true };
  });
};
