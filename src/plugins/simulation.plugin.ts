// ============================================
// MOLTCITY - Simulation Engine Plugin
// ============================================

import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { SimulationEngine } from '../simulation/engine.js';
import { LegacyDatabaseManagerAdapter } from '../simulation/engine.adapter.js';
import { CityRepository } from '../repositories/city.repository.js';
import { ElectionService } from '../services/election.service.js';
import { ActivityService } from '../services/activity.service.js';
import type { ActivityType } from '../db/schema/activity.js';
import type { CityTime, CityEvent } from '../models/types.js';

declare module 'fastify' {
  interface FastifyInstance {
    simulationEngine: SimulationEngine;
    legacyDb: LegacyDatabaseManagerAdapter;
  }
}

export interface SimulationPluginOptions {
  autoStart?: boolean;
}

export interface TickData {
  tick: number;
  time: CityTime;
  events: CityEvent[];
  cityId: string;
}

const simulationPluginImpl: FastifyPluginAsync<SimulationPluginOptions> = async (fastify, options) => {
  // Create the adapter-based DatabaseManager for the simulation engine
  const legacyDb = new LegacyDatabaseManagerAdapter();
  fastify.decorate('legacyDb', legacyDb);

  // Create the simulation engine (no gridWidth/gridHeight needed)
  const engine = new SimulationEngine(legacyDb);
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
      const populationStats = engine.getPopulationStats(data.cityId);

      fastify.broadcastToCity(data.cityId, 'tick', {
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
        const targetVehicles = engine.getTargetVehicleCount(data.time, data.cityId);

        const waterStats = engine.getWaterStats(data.cityId);

        fastify.broadcastToCity(data.cityId, 'population_update', {
          total: populationStats.total,
          employed: populationStats.employed,
          unemployed: populationStats.unemployed,
          employmentRate: populationStats.employmentRate,
          traffic: targetVehicles,
          water: waterStats,
        });

        // Broadcast economy snapshot
        const city = legacyDb.city.getCity(data.cityId);
        if (city?.economy) {
          fastify.broadcastToCity(data.cityId, 'economy_update', {
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

    // Broadcast significant events immediately (city-scoped)
    for (const event of data.events) {
      if (event.type === 'agent_arrived' || event.type === 'building_powered') {
        fastify.broadcastToCity(data.cityId, 'event', event);
      }
      if (event.type === 'buildings_updated') {
        fastify.broadcastToCity(data.cityId, 'buildings_update', event.data);
      }
    }
  });

  engine.on('day_started', async (time: CityTime) => {
    fastify.broadcast('day_started', { time });
    fastify.log.info(`Day ${time.day} started (Year ${time.year})`);

    // Auto-start election every 30 days if none is active — per city
    if (time.day % 30 === 1) {
      try {
        const cities = legacyDb.city.getAllCities();
        for (const city of cities) {
          const status = await electionService.getElectionStatus(city.id);
          if (status.phase === 'none') {
            await electionService.startElection(city.id);
            fastify.log.info(`New election automatically started for city ${city.name}`);
          }
        }
      } catch (err) {
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
    const cityRepo = new CityRepository(fastify.db);
    const cities = await cityRepo.getAllCities();
    if (cities.length > 0) {
      engine.start();
    } else {
      fastify.log.info('No cities exist, simulation will start when a city is created');
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
