// ============================================
// MOLTCITY - Controllers Barrel Export & Registration
// ============================================

import { FastifyInstance } from 'fastify';
import { authController } from './auth.controller.js';
import { cityController } from './city.controller.js';
import { simulationController } from './simulation.controller.js';
import { parcelsController } from './parcels.controller.js';
import { buildingsController } from './buildings.controller.js';
import { roadsController } from './roads.controller.js';
import { agentsController } from './agents.controller.js';
import { vehiclesController } from './vehicles.controller.js';
import { infrastructureController } from './infrastructure.controller.js';
import { rentalsController } from './rentals.controller.js';
import { justiceController } from './justice.controller.js';
import { spritesController } from './sprites.controller.js';
import { paymentsController } from './payments.controller.js';
import { activityController } from './activity.controller.js';
import { electionController } from './election.controller.js';
import { leaderboardController } from './leaderboard.controller.js';
import { economyController } from './economy.controller.js';

export async function registerControllers(fastify: FastifyInstance): Promise<void> {
  // Register all controllers
  await fastify.register(authController);
  await fastify.register(cityController);
  await fastify.register(simulationController);
  await fastify.register(parcelsController);
  await fastify.register(buildingsController);
  await fastify.register(roadsController);
  await fastify.register(agentsController);
  await fastify.register(vehiclesController);
  await fastify.register(infrastructureController);
  await fastify.register(rentalsController);
  await fastify.register(justiceController);
  await fastify.register(spritesController);
  await fastify.register(paymentsController);
  await fastify.register(activityController);
  await fastify.register(electionController);
  await fastify.register(leaderboardController);
  await fastify.register(economyController);
}

// Export individual controllers for testing
export {
  authController,
  cityController,
  simulationController,
  parcelsController,
  buildingsController,
  roadsController,
  agentsController,
  vehiclesController,
  infrastructureController,
  rentalsController,
  justiceController,
  spritesController,
  paymentsController,
  activityController,
  electionController,
  leaderboardController,
  economyController,
};
