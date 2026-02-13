// ============================================
// MOLTCITY - City Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { CityService } from '../services/city.service.js';
import { BuildingRepository } from '../repositories/building.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { RoadRepository } from '../repositories/road.repository.js';
import {
  PARCEL_LIMITS,
  ADMIN_ONLY_BUILDING_TYPES,
  USER_BUILDING_TYPES,
  BUILDING_COSTS,
  BUILDING_LIMITS,
} from '../config/game.js';
import { z } from 'zod';

const initCitySchema = z.object({
  name: z.string().min(1).max(100).default('MoltCity'),
  width: z.number().int().min(10).max(200).default(50),
  height: z.number().int().min(10).max(200).default(50),
});

export const cityController: FastifyPluginAsync = async (fastify) => {
  const cityService = new CityService(fastify.db);

  // Get city state
  fastify.get('/api/city', async () => {
    const city = await cityService.getCity();
    if (!city) {
      return { initialized: false };
    }
    return { initialized: true, city };
  });

  // Initialize city
  fastify.post('/api/city/init', async (request, reply) => {
    const body = initCitySchema.parse(request.body || {});

    try {
      const city = await cityService.initializeCity(body.name, body.width, body.height);
      reply.status(201);
      return { success: true, city };
    } catch (error: any) {
      if (error.message === 'City already initialized') {
        const city = await cityService.getCity();
        return { success: true, city, message: 'City was already initialized' };
      }
      throw error;
    }
  });

  // Get city stats
  fastify.get('/api/city/stats', async () => {
    const stats = await cityService.calculateStats();
    return stats;
  });

  // Get game configuration and rules
  fastify.get('/api/game/config', async (request) => {
    await fastify.optionalAuth(request, {} as any);
    const role = request.user?.role || 'guest';
    const hasElevatedPrivileges = role === 'admin' || role === 'mayor';

    return {
      limits: {
        maxParcelsPerUser: hasElevatedPrivileges ? PARCEL_LIMITS.MAX_PARCELS_PER_ADMIN : PARCEL_LIMITS.MAX_PARCELS_PER_USER,
        buildingLimits: BUILDING_LIMITS,
      },
      buildingTypes: {
        user: USER_BUILDING_TYPES,
        adminOnly: ADMIN_ONLY_BUILDING_TYPES,
        allowed: hasElevatedPrivileges ? [...USER_BUILDING_TYPES, ...ADMIN_ONLY_BUILDING_TYPES] : USER_BUILDING_TYPES,
      },
      costs: BUILDING_COSTS,
      userRole: role,
    };
  });

  // Spectator mode - full city state without authentication
  fastify.get('/api/spectate', async () => {
    const city = await cityService.getCity();
    if (!city) {
      return { initialized: false };
    }

    const buildingRepo = new BuildingRepository(fastify.db);
    const agentRepo = new AgentRepository(fastify.db);
    const roadRepo = new RoadRepository(fastify.db);

    const buildings = await buildingRepo.getAllBuildings();
    const agents = await agentRepo.getAllAgents();
    const roads = await roadRepo.getAllRoads();
    const stats = await cityService.calculateStats();

    return {
      initialized: true,
      city,
      stats,
      buildings: buildings.map(b => ({
        id: b.id,
        parcelId: b.parcelId,
        type: b.type,
        name: b.name,
        floors: b.floors,
        powered: b.powered,
        hasWater: b.hasWater,
        constructionProgress: b.constructionProgress,
      })),
      agents: agents.map(a => ({
        id: a.id,
        name: a.name,
        x: a.currentLocation.x,
        y: a.currentLocation.y,
        state: a.state,
      })),
      roads: roads.map(r => ({
        id: r.id,
        parcelId: r.parcelId,
        direction: r.direction,
        trafficLoad: r.trafficLoad,
      })),
      simulation: {
        running: fastify.simulationEngine?.isRunning() || false,
        tick: fastify.simulationEngine?.getCurrentTick() || 0,
      },
    };
  });
};
