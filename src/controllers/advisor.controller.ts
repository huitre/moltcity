// ============================================
// MOLTCITY - City Advisor Controller (SimCity 2000 Style)
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { CityRepository } from '../repositories/city.repository.js';
import { BuildingRepository } from '../repositories/building.repository.js';
import { extractOptionalCityId } from '../utils/city-context.js';
import { DEMAND_BALANCE, TAX_PENALTIES, SC2K_ECONOMY, POWER_CAPACITY } from '../config/game.js';
import { AdvisorService, PopupContext, ADVISORS } from '../services/advisor.service.js';
import { CityService } from '../services/city.service.js';
import type { Building } from '../models/types.js';

const RESIDENTIAL_TYPES = ['house', 'apartment'];
const OFFICE_TYPES = ['office', 'shop'];
const INDUSTRIAL_TYPES = ['factory'];

// Helper to extract display name from email
function getUserDisplayName(email?: string): string {
  if (!email) return 'Maire';
  const namePart = email.split('@')[0];
  // Capitalize first letter
  return namePart.charAt(0).toUpperCase() + namePart.slice(1);
}

function countByZone(buildings: Building[]) {
  let residential = 0, office = 0, industrial = 0;
  for (const b of buildings) {
    if (RESIDENTIAL_TYPES.includes(b.type)) residential++;
    else if (OFFICE_TYPES.includes(b.type)) office++;
    else if (INDUSTRIAL_TYPES.includes(b.type)) industrial++;
  }
  return { residential, office, industrial };
}

export const advisorController: FastifyPluginAsync = async (fastify) => {
  const cityRepo = new CityRepository(fastify.db);
  const buildingRepo = new BuildingRepository(fastify.db);

  fastify.get('/api/advisor', async (request, reply) => {
    await fastify.optionalAuth(request, reply);

    const cityId = extractOptionalCityId(request);
    const city = await cityRepo.getCity(cityId);
    if (!city) return { error: 'City not initialized' };

    const allBuildings = await buildingRepo.getAllBuildings(city.id);
    const completed = allBuildings.filter(b => b.constructionProgress >= 100);

    // --- Zoning analysis ---
    const counts = countByZone(completed);
    const totalZoned = counts.residential + counts.office + counts.industrial;
    const current = totalZoned > 0
      ? {
        residential: counts.residential / totalZoned,
        office: counts.office / totalZoned,
        industrial: counts.industrial / totalZoned,
      }
      : { residential: 0, office: 0, industrial: 0 };

    const ideal = DEMAND_BALANCE.IDEAL_RATIO;
    const demand = {
      residential: +(ideal.residential - current.residential).toFixed(2),
      office: +(ideal.office - current.office).toFixed(2),
      industrial: +(ideal.industrial - current.industrial).toFixed(2),
    };

    let recommendation: 'residential' | 'office' | 'industrial' | null = null;
    let zoningMessage = 'Zoning balance looks good';
    const maxDemand = Math.max(demand.residential, demand.office, demand.industrial);
    if (maxDemand > 0.05) {
      if (demand.office === maxDemand) recommendation = 'office';
      else if (demand.residential === maxDemand) recommendation = 'residential';
      else recommendation = 'industrial';
      const demandVal = demand[recommendation];
      zoningMessage = `Zone more ${recommendation === 'office' ? 'offices' : recommendation} — ${recommendation} demand is high (${demandVal > 0 ? '+' : ''}${demandVal})`;
    }

    // --- Power analysis ---
    let powerCapacity = 0, powerDemand = 0, unpowered = 0;
    for (const b of completed) {
      const cap = POWER_CAPACITY[b.type];
      if (cap) {
        powerCapacity += cap;
      } else {
        powerDemand += b.powerRequired;
        if (!b.powered && b.type !== 'water_tower') unpowered++;
      }
    }
    const powerRatio = powerDemand > 0 ? powerCapacity / powerDemand : (powerCapacity > 0 ? Infinity : 0);
    let powerMessage: string | null = null;
    if (unpowered > 0) {
      powerMessage = `${unpowered} building${unpowered > 1 ? 's' : ''} without power — build more power plants or extend power lines`;
    } else if (powerRatio < 1.2 && powerDemand > 0) {
      powerMessage = 'Power reserves are low — consider building another power plant';
    }

    // --- Water analysis ---
    let waterCapacity = 0, waterDemand = 0, noWater = 0;
    for (const b of completed) {
      if (b.type === 'water_tower') {
        waterCapacity += 10000;
      } else {
        waterDemand += b.waterRequired;
        if (!b.hasWater && b.type !== 'power_plant') noWater++;
      }
    }
    const waterRatio = waterDemand > 0 ? waterCapacity / waterDemand : (waterCapacity > 0 ? Infinity : 0);
    let waterMessage: string | null = null;
    if (noWater > 0) {
      waterMessage = `${noWater} building${noWater > 1 ? 's' : ''} without water — build more water towers or extend pipes`;
    } else if (waterRatio < 1.2 && waterDemand > 0) {
      waterMessage = 'Water reserves are low — consider building another water tower';
    }

    // --- Tax analysis ---
    const { taxRateR, taxRateC, taxRateI } = city.economy;
    const warnings: Array<{ zone: string; rate: number; threshold: number; effect: string }> = [];

    if (taxRateR > TAX_PENALTIES.PENALTY_THRESHOLD) {
      const excess = taxRateR - TAX_PENALTIES.PENALTY_THRESHOLD;
      const exodus = (excess * TAX_PENALTIES.EXODUS_RATE).toFixed(1);
      warnings.push({
        zone: 'residential',
        rate: taxRateR,
        threshold: TAX_PENALTIES.PENALTY_THRESHOLD,
        effect: `Population exodus: ~${exodus} resident${+exodus !== 1 ? 's' : ''}/day leaving`,
      });
    }

    if (taxRateC > TAX_PENALTIES.PENALTY_THRESHOLD) {
      const excess = taxRateC - TAX_PENALTIES.PENALTY_THRESHOLD;
      const cut = (excess * TAX_PENALTIES.SALARY_CUT_PER_PERCENT * 100).toFixed(0);
      warnings.push({
        zone: 'office',
        rate: taxRateC,
        threshold: TAX_PENALTIES.PENALTY_THRESHOLD,
        effect: `Office salary cut: -${cut}% wages`,
      });
    }

    if (taxRateI > TAX_PENALTIES.PENALTY_THRESHOLD) {
      warnings.push({
        zone: 'industrial',
        rate: taxRateI,
        threshold: TAX_PENALTIES.PENALTY_THRESHOLD,
        effect: `Industrial slowdown: reduced demand`,
      });
    }

    if (taxRateI > TAX_PENALTIES.INDUSTRIAL_DESTROY_THRESHOLD) {
      const excess = taxRateI - TAX_PENALTIES.INDUSTRIAL_DESTROY_THRESHOLD;
      const chance = (excess * TAX_PENALTIES.DESTROY_CHANCE_PER_PERCENT * 100).toFixed(0);
      warnings.push({
        zone: 'industrial',
        rate: taxRateI,
        threshold: TAX_PENALTIES.INDUSTRIAL_DESTROY_THRESHOLD,
        effect: `Factory destruction: ${chance}% chance/day of losing a factory`,
      });
    }

    return {
      zoning: {
        current: {
          residential: +current.residential.toFixed(2),
          office: +current.office.toFixed(2),
          industrial: +current.industrial.toFixed(2),
        },
        ideal,
        demand,
        recommendation,
        message: zoningMessage,
      },
      power: {
        capacity: powerCapacity,
        demand: powerDemand,
        ratio: +powerRatio.toFixed(2),
        unpowered,
        message: powerMessage,
      },
      water: {
        capacity: waterCapacity,
        demand: waterDemand,
        ratio: +waterRatio.toFixed(2),
        noWater,
        message: waterMessage,
      },
      taxes: {
        rates: { residential: taxRateR, office: taxRateC, industrial: taxRateI },
        warnings,
      },
    };
  });

  // ============================================
  // ADVISOR POPUP SYSTEM (SimCity 2000 Style)
  // ============================================

  const advisorService = new AdvisorService();
  const cityService = new CityService(fastify.db);

  /**
   * GET /api/advisor/popup
   * Get a contextual advisor popup
   * Query params:
   *   - context: PopupContext (e.g., 'city_created', 'low_power')
   *   - cityId: optional city ID
   */
  fastify.get('/api/advisor/popup', async (request, reply) => {
    await fastify.optionalAuth(request, reply);

    const query = request.query as { context?: string; cityId?: string };
    const context = query.context as PopupContext;
    const cityId = extractOptionalCityId(request);

    if (!context) {
      return reply.status(400).send({ error: 'Missing context parameter' });
    }

    const city = await cityRepo.getCity(cityId);
    const userName = getUserDisplayName(request.user?.email);

    // Build context data based on popup type
    const data: Record<string, string | number> = {
      userName,
      cityName: city?.name || 'Nouvelle Ville',
    };

    // Add city-specific data if available
    if (city) {
      const stats = await cityService.calculateStats(city.id);
      data.population = stats.population;
      data.treasury = stats.treasury;
      data.powerCapacity = Math.round(stats.powerCapacity / 1000);
      data.powerDemand = Math.round(stats.powerDemand / 1000);
      data.waterCapacity = stats.waterCapacity;
      data.waterDemand = stats.waterDemand;
    }

    const popup = advisorService.getPopup(context, data);
    return popup;
  });

  /**
   * GET /api/advisor/popup/welcome
   * Get the city creation welcome popup
   */
  fastify.get('/api/advisor/popup/welcome', async (request, reply) => {
    await fastify.optionalAuth(request, reply);

    const cityId = extractOptionalCityId(request);
    const city = await cityRepo.getCity(cityId);
    const userName = getUserDisplayName(request.user?.email);
    const cityName = city?.name || 'Nouvelle Ville';

    return advisorService.getCityCreatedPopup(userName, cityName);
  });

  /**
   * GET /api/advisor/popup/checkup
   * Get a periodic checkup popup with city overview
   */
  fastify.get('/api/advisor/popup/checkup', async (request, reply) => {
    await fastify.optionalAuth(request, reply);

    const cityId = extractOptionalCityId(request);
    const city = await cityRepo.getCity(cityId);
    if (!city) {
      return reply.status(404).send({ error: 'City not found' });
    }

    const userName = getUserDisplayName(request.user?.email);
    const stats = await cityService.calculateStats(city.id);

    return advisorService.getPeriodicCheckup(city, stats, userName);
  });

  /**
   * GET /api/advisor/popup/warnings
   * Get all current warning popups for a city
   */
  fastify.get('/api/advisor/popup/warnings', async (request, reply) => {
    await fastify.optionalAuth(request, reply);

    const cityId = extractOptionalCityId(request);
    const city = await cityRepo.getCity(cityId);
    if (!city) {
      return reply.status(404).send({ error: 'City not found' });
    }

    const userName = getUserDisplayName(request.user?.email);
    const allBuildings = await buildingRepo.getAllBuildings(city.id);
    const stats = await cityService.calculateStats(city.id);

    const warnings = advisorService.analyzeCity(city, stats, allBuildings, userName);
    return { warnings, count: warnings.length };
  });

  /**
   * GET /api/advisor/popup/tip
   * Get a random tip of the day
   */
  fastify.get('/api/advisor/popup/tip', async (request, reply) => {
    await fastify.optionalAuth(request, reply);

    const userName = getUserDisplayName(request.user?.email);
    return advisorService.getTipOfTheDay(userName);
  });

  /**
   * GET /api/advisor/list
   * Get all available advisors
   */
  fastify.get('/api/advisor/list', async () => {
    return { advisors: ADVISORS };
  });
};
