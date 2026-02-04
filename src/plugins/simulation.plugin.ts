// ============================================
// MOLTCITY - Simulation Engine Plugin
// ============================================

import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { SimulationEngine } from '../simulation/engine.js';
import { DatabaseManager } from '../models/database.js';
import type { CityTime, CityEvent } from '../models/types.js';

// Default grid size
const DEFAULT_GRID_WIDTH = 50;
const DEFAULT_GRID_HEIGHT = 50;

declare module 'fastify' {
  interface FastifyInstance {
    simulationEngine: SimulationEngine;
    legacyDb: DatabaseManager;
  }
}

export interface SimulationPluginOptions {
  gridWidth?: number;
  gridHeight?: number;
  autoStart?: boolean;
}

export interface TickData {
  tick: number;
  time: CityTime;
  events: CityEvent[];
}

const simulationPluginImpl: FastifyPluginAsync<SimulationPluginOptions> = async (fastify, options) => {
  const gridWidth = options.gridWidth || DEFAULT_GRID_WIDTH;
  const gridHeight = options.gridHeight || DEFAULT_GRID_HEIGHT;

  // Create the legacy DatabaseManager for the simulation engine
  // This uses the same database file as the Drizzle-based system
  const legacyDb = new DatabaseManager();
  fastify.decorate('legacyDb', legacyDb);

  // Create the simulation engine
  const engine = new SimulationEngine(legacyDb, gridWidth, gridHeight);
  fastify.decorate('simulationEngine', engine);

  // Track last population broadcast to avoid spam
  let lastPopulationBroadcast = 0;

  // Connect simulation events to WebSocket broadcasts
  engine.on('tick', (data: TickData) => {
    // Only broadcast every 10 ticks to reduce traffic
    if (data.tick % 10 === 0) {
      const populationStats = engine.getPopulationStats();

      fastify.broadcast('tick', {
        tick: data.tick,
        time: data.time,
        eventCount: data.events.length,
        population: populationStats.total,
        employed: populationStats.employed,
        players: fastify.wsClients.size,
      });

      // Broadcast full population update every 60 ticks (6 seconds)
      if (data.tick - lastPopulationBroadcast >= 60) {
        lastPopulationBroadcast = data.tick;
        const targetVehicles = engine.getTargetVehicleCount(data.time);

        fastify.broadcast('population_update', {
          total: populationStats.total,
          employed: populationStats.employed,
          unemployed: populationStats.unemployed,
          employmentRate: populationStats.employmentRate,
          traffic: targetVehicles,
        });
      }
    }

    // Broadcast significant events immediately
    for (const event of data.events) {
      if (event.type === 'agent_arrived' || event.type === 'building_powered') {
        fastify.broadcast('event', event);
      }
    }
  });

  engine.on('day_started', (time: CityTime) => {
    fastify.broadcast('day_started', { time });
    fastify.log.info(`Day ${time.day} started (Year ${time.year})`);
  });

  engine.on('night_started', (time: CityTime) => {
    fastify.broadcast('night_started', { time });
    fastify.log.info(`Night started at hour ${time.hour}`);
  });

  engine.on('started', () => {
    fastify.broadcast('simulation_started', { tick: engine.getCurrentTick() });
    fastify.log.info('Simulation engine started');
  });

  engine.on('stopped', () => {
    fastify.broadcast('simulation_stopped', { tick: engine.getCurrentTick() });
    fastify.log.info('Simulation engine stopped');
  });

  // Auto-start if configured
  if (options.autoStart) {
    const city = legacyDb.city.getCity();
    if (city) {
      engine.start();
    } else {
      fastify.log.info('City not initialized, simulation will start when city is created');
    }
  }

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    engine.stop();
    legacyDb.close();
  });
};

// Wrap with fastify-plugin to share decorators across encapsulation boundaries
export const simulationPlugin = fp(simulationPluginImpl, {
  name: 'moltcity-simulation',
  dependencies: ['moltcity-websocket'],
});
