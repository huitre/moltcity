// ============================================
// MOLTCITY - Simulation Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { CityService } from '../services/city.service.js';
import { extractOptionalCityId } from '../utils/city-context.js';

export const simulationController: FastifyPluginAsync = async (fastify) => {
  const cityService = new CityService(fastify.db);

  // Get simulation status
  fastify.get('/api/simulation/status', async (request) => {
    const cityId = extractOptionalCityId(request);
    const city = await cityService.getCity(cityId);
    const isRunning = fastify.simulationEngine.isRunning();
    const currentTick = fastify.simulationEngine.getCurrentTick();

    return {
      running: isRunning,
      tick: currentTick,
      time: city?.time || null,
    };
  });

  // Start simulation
  fastify.post('/api/simulation/start', async (request, reply) => {
    const city = await cityService.getCity();
    if (!city) {
      reply.status(400);
      return { success: false, error: 'City not initialized' };
    }

    if (fastify.simulationEngine.isRunning()) {
      return { success: true, message: 'Simulation already running' };
    }
    fastify.simulationEngine.start();

    return { success: true, message: 'Simulation started' };
  });

  // Stop simulation
  fastify.post('/api/simulation/stop', async () => {
    fastify.simulationEngine.stop();
    return { success: true, message: 'Simulation stopped' };
  });

  // Get full simulation state
  fastify.get('/api/simulation/state', async () => {
    return fastify.simulationEngine.getState();
  });

  // Notify engine of road changes
  fastify.post('/api/simulation/roads-changed', async () => {
    fastify.simulationEngine.onRoadsChanged();
    return { success: true };
  });
};
