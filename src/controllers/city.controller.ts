// ============================================
// MOLTCITY - City Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { CityService } from '../services/city.service.js';
import { CityRepository } from '../repositories/city.repository.js';
import { BuildingRepository } from '../repositories/building.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { RoadRepository } from '../repositories/road.repository.js';
import {
  PARCEL_LIMITS,
  ADMIN_ONLY_BUILDING_TYPES,
  USER_BUILDING_TYPES,
  BUILDING_COSTS,
  BUILDING_LIMITS,
  ZONING_COST,
  HOUSING,
} from '../config/game.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

const createCitySchema = z.object({
  name: z.string().min(1).max(100),
});

export const cityController: FastifyPluginAsync = async (fastify) => {
  const cityService = new CityService(fastify.db);

  // Get city state (backward-compat: returns first city or specific city with ?cityId=)
  fastify.get('/api/city', async (request) => {
    const cityId = (request.query as Record<string, string>)?.cityId;
    const city = await cityService.getCity(cityId);
    if (!city) {
      return { initialized: false };
    }
    return { initialized: true, city };
  });

  // List all cities
  fastify.get('/api/cities', async () => {
    const cities = await cityService.getAllCities();
    return { cities };
  });

  // Create city (requires authentication)
  fastify.post('/api/cities', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const body = createCitySchema.parse(request.body);
    const city = await cityService.createCity(body.name, request.user!.userId);

    // Start simulation engine if not already running
    if (fastify.simulationEngine && !fastify.simulationEngine.isRunning()) {
      fastify.simulationEngine.start();
      fastify.log.info('Simulation engine started after city creation');
    }

    reply.status(201);
    return { success: true, city };
  });

  // Get city by ID
  fastify.get('/api/cities/:cityId', async (request) => {
    const { cityId } = request.params as { cityId: string };
    const city = await cityService.getCity(cityId);
    if (!city) {
      return { initialized: false };
    }
    return { initialized: true, city };
  });

  // Get city stats
  fastify.get('/api/city/stats', async (request) => {
    const cityId = (request.query as Record<string, string>)?.cityId;
    const city = await cityService.getCity(cityId);
    if (!city) {
      return { population: 0, totalBuildings: 0, totalRoads: 0, powerCapacity: 0, powerDemand: 0, waterCapacity: 0, waterDemand: 0, treasury: 0 };
    }
    const stats = await cityService.calculateStats(city.id);
    return stats;
  });

  // Get game configuration and rules
  fastify.get('/api/game/config', async (request) => {
    await fastify.optionalAuth(request, {} as any);
    const role = request.user?.role || 'user';
    // Note: isMayor is per-city, not a global role. Config returns base limits.
    const isAdmin = role === 'admin';

    return {
      limits: {
        maxParcelsPerUser: isAdmin ? PARCEL_LIMITS.MAX_PARCELS_PER_ADMIN : PARCEL_LIMITS.MAX_PARCELS_PER_USER,
        buildingLimits: BUILDING_LIMITS,
      },
      buildingTypes: {
        user: USER_BUILDING_TYPES,
        adminOnly: ADMIN_ONLY_BUILDING_TYPES,
        allowed: isAdmin ? [...USER_BUILDING_TYPES, ...ADMIN_ONLY_BUILDING_TYPES] : USER_BUILDING_TYPES,
      },
      costs: BUILDING_COSTS,
      zoningCost: ZONING_COST,
      floorCosts: HOUSING.FLOOR_COSTS,
      userRole: role,
    };
  });

  // Top cities by population
  fastify.get('/api/cities/top', async (request) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(parseInt(query.limit || '10') || 10, 20);
    const cities = await cityService.getTopCities(limit);
    return {
      cities: cities.map(c => ({
        id: c.id,
        name: c.name,
        population: c.stats.population,
        totalBuildings: c.stats.totalBuildings,
        treasury: c.stats.treasury,
        mayor: c.mayor,
        screenshotUrl: `/screenshots/${c.id}.jpg`,
      }))
    };
  });

  // Screenshot upload (rate-limited per city)
  const screenshotTimestamps = new Map<string, number>();
  const SCREENSHOT_COOLDOWN = 5 * 60 * 1000;

  fastify.post('/api/cities/:cityId/screenshot', async (request, reply) => {
    const { cityId } = request.params as { cityId: string };

    const lastUpload = screenshotTimestamps.get(cityId) || 0;
    if (Date.now() - lastUpload < SCREENSHOT_COOLDOWN) {
      return reply.status(429).send({ error: 'Screenshot recently updated' });
    }

    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'No file' });

    const dir = path.resolve(process.cwd(), 'client/screenshots');
    await fs.mkdir(dir, { recursive: true });

    // Sanitize cityId to prevent path traversal
    const safeCityId = cityId.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(dir, `${safeCityId}.jpg`);
    const buffer = await data.toBuffer();
    await fs.writeFile(filePath, buffer);

    screenshotTimestamps.set(cityId, Date.now());
    return { ok: true };
  });

  // Spectator mode - full city state without authentication
  fastify.get('/api/spectate', async (request) => {
    const cityId = (request.query as Record<string, string>)?.cityId;
    const city = await cityService.getCity(cityId);
    if (!city) {
      return { initialized: false };
    }

    const buildingRepo = new BuildingRepository(fastify.db);
    const agentRepo = new AgentRepository(fastify.db);
    const roadRepo = new RoadRepository(fastify.db);

    const buildings = await buildingRepo.getAllBuildings(city.id);
    const agents = await agentRepo.getAllAgents(city.id);
    const roads = await roadRepo.getAllRoads(city.id);
    const stats = await cityService.calculateStats(city.id);

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

  // Admin debug endpoint — directly set treasury, hour, day, year
  fastify.post('/api/admin/debug', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin only' });
    }
    const body = request.body as { cityId?: string; treasury?: number; hour?: number; day?: number; year?: number };
    const cityId = body.cityId || (request.query as Record<string, string>)?.cityId;
    const city = await cityService.getCity(cityId);
    if (!city) return reply.status(404).send({ error: 'City not found' });

    const cityRepo = new CityRepository(fastify.db);
    if (body.treasury !== undefined) await cityRepo.updateTreasury(city.id, body.treasury);
    if (body.hour !== undefined || body.day !== undefined || body.year !== undefined) {
      const newHour = body.hour ?? city.time.hour;
      const newDay = body.day ?? city.time.day;
      const newYear = body.year ?? city.time.year;
      // Sync the simulation engine's internal tick counter
      if (fastify.simulationEngine) {
        fastify.simulationEngine.setTime(newHour, newDay, newYear);
        const newTick = fastify.simulationEngine.getCurrentTick();
        await cityRepo.updateTime(city.id, newTick, newHour, newDay, newYear);
      } else {
        await cityRepo.updateTime(city.id, city.time.tick, newHour, newDay, newYear);
      }
    }
    return { ok: true, city: await cityService.getCity(city.id) };
  });
};
