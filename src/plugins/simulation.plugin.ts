// ============================================
// MOLTCITY - Simulation Engine Plugin
// ============================================

import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { SimulationEngine } from '../simulation/engine.js';
import { DatabaseManager } from '../models/database.js';
import { ElectionService } from '../services/election.service.js';
import { ActivityService } from '../services/activity.service.js';
import type { ActivityType } from '../db/schema/activity.js';
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

  // Wire simulation activity logger to the activity feed
  const activityService = new ActivityService(fastify.db, fastify);
  engine.setActivityLogger((type, message, metadata) => {
    activityService.logActivity(type as ActivityType, undefined, 'MoltCity', message, metadata)
      .catch(err => fastify.log.error({ err }, 'Failed to log simulation activity'));
  });

  // Track last broadcasts to avoid spam
  let lastPopulationBroadcast = 0;
  let lastElectionCheck = 0;

  // Create election service for automatic phase transitions
  const electionService = new ElectionService(fastify.db, fastify);

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

        const waterStats = engine.getWaterStats();

        fastify.broadcast('population_update', {
          total: populationStats.total,
          employed: populationStats.employed,
          unemployed: populationStats.unemployed,
          employmentRate: populationStats.employmentRate,
          traffic: targetVehicles,
          water: waterStats,
        });

        // Broadcast economy snapshot
        const city = legacyDb.city.getCity();
        if (city?.economy) {
          fastify.broadcast('economy_update', {
            treasury: city.stats.treasury,
            taxRateR: city.economy.taxRateR,
            taxRateC: city.economy.taxRateC,
            taxRateI: city.economy.taxRateI,
            creditRating: city.economy.creditRating,
            bondsCount: city.economy.bonds.length,
            ordinancesCount: city.economy.ordinances.length,
          });
        }
      }

      // Check and transition elections every 100 ticks (10 seconds)
      if (data.tick - lastElectionCheck >= 100) {
        lastElectionCheck = data.tick;
        electionService.checkAndTransitionElection().catch((err) => {
          fastify.log.error({ err }, 'Election transition check failed');
        });
      }
    }

    // Broadcast significant events immediately
    for (const event of data.events) {
      if (event.type === 'agent_arrived' || event.type === 'building_powered') {
        fastify.broadcast('event', event);
      }
      if (event.type === 'buildings_updated') {
        fastify.broadcast('buildings_update', event.data);
      }
    }
  });

  engine.on('day_started', async (time: CityTime) => {
    fastify.broadcast('day_started', { time });
    fastify.log.info(`Day ${time.day} started (Year ${time.year})`);

    // Auto-start election every 30 days if none is active
    if (time.day % 30 === 1) {
      try {
        const status = await electionService.getElectionStatus();
        if (status.phase === 'none') {
          await electionService.startElection();
          fastify.log.info('New election automatically started');
        }
      } catch (err) {
        // Election already in progress or other error - ignore
        fastify.log.debug({ err }, 'Auto-start election skipped');
      }
    }
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
