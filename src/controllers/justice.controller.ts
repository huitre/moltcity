// ============================================
// MOLTCITY - Justice Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { RentalService } from '../services/rental.service.js';
import { agentWarningsParamsSchema } from '../schemas/rentals.schema.js';
import { z } from 'zod';

const agentIdParamsSchema = z.object({
  agentId: z.string(),
});

export const justiceController: FastifyPluginAsync = async (fastify) => {
  const rentalService = new RentalService(fastify.db);

  // Get warnings for agent
  fastify.get('/api/warnings/:agentId', async (request) => {
    const params = agentWarningsParamsSchema.parse(request.params);
    const warnings = await rentalService.getWarningsForTenant(params.agentId);
    return { warnings };
  });

  // Get court cases for agent
  fastify.get('/api/cases/:agentId', async (request) => {
    const params = agentIdParamsSchema.parse(request.params);
    const cases = await rentalService.getCasesForDefendant(params.agentId);
    return { cases };
  });

  // Get all jail inmates
  fastify.get('/api/jail/inmates', async () => {
    const inmates = await rentalService.getAllInmates();
    return { inmates };
  });

  // Get jail status for agent
  fastify.get('/api/jail/status/:agentId', async (request) => {
    const params = agentIdParamsSchema.parse(request.params);
    const inmate = await rentalService.getInmateStatus(params.agentId);

    if (!inmate) {
      return { incarcerated: false, inmate: null };
    }

    return {
      incarcerated: inmate.status === 'incarcerated',
      inmate,
    };
  });
};
