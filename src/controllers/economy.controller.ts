// ============================================
// MOLTCITY - Economy Controller (SC2K Budget)
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { SC2K_ECONOMY } from '../config/game.js';
import type { Bond } from '../models/types.js';
import { calculateCreditRating } from '../simulation/engine.js';
import { UserRepository } from '../repositories/user.repository.js';

// Helper: fetch fresh role from DB (JWT role may be stale after role changes)
async function getFreshRole(fastify: any, request: any): Promise<string | undefined> {
  if (request.user?.userId) {
    const userRepo = new UserRepository(fastify.db);
    const dbUser = await userRepo.getUser(request.user.userId);
    return dbUser?.role;
  }
  return request.user?.role;
}

export const economyController: FastifyPluginAsync = async (fastify) => {

  // GET /api/economy/budget - Get full budget data
  fastify.get('/api/economy/budget', async (request, reply) => {
    await fastify.optionalAuth(request, reply);

    const city = fastify.legacyDb.city.getCity();
    if (!city) return { error: 'City not initialized' };

    const role = await getFreshRole(fastify, request);
    const isMayor = role === 'mayor' || role === 'admin';

    // Calculate daily projections for display
    const buildings = fastify.legacyDb.buildings.getAllBuildings();
    const completedBuildings = buildings.filter(b => b.constructionProgress >= 100);
    const residents = fastify.legacyDb.population.getAllResidents();
    const buildingMap = new Map<string, typeof buildings[0]>();
    for (const b of completedBuildings) buildingMap.set(b.id, b);

    let rPop = 0, cPop = 0, iPop = 0;
    for (const r of residents) {
      const home = r.homeBuildingId ? buildingMap.get(r.homeBuildingId) : null;
      if (home && ['residential', 'suburban', 'house', 'apartment'].includes(home.type)) rPop++;
      const work = r.workBuildingId ? buildingMap.get(r.workBuildingId) : null;
      if (work) {
        if (['offices', 'office', 'shop'].includes(work.type)) cPop++;
        else if (['industrial', 'factory'].includes(work.type)) iPop++;
      }
    }

    const { taxRateR, taxRateC, taxRateI } = city.economy;
    const mult = SC2K_ECONOMY.TAX.SC2K_MULTIPLIER;
    const totalPop = rPop + cPop + iPop;

    // Daily projections
    const projRevR = (rPop * (taxRateR / 100) * mult) / 365;
    const projRevC = (cPop * (taxRateC / 100) * mult) / 365;
    const projRevI = (iPop * (taxRateI / 100) * mult) / 365;

    let projOrdRevenue = 0, projOrdCost = 0;
    for (const ordId of city.economy.ordinances) {
      const ord = SC2K_ECONOMY.ORDINANCES[ordId];
      if (!ord) continue;
      projOrdRevenue += (totalPop * ord.revenuePerCapita) / 365;
      projOrdCost += (totalPop * ord.costPerCapita) / 365;
    }

    const funding = city.economy.departmentFunding;
    const countType = (type: string) => completedBuildings.filter(b => b.type === type).length;
    const projPolice = countType('police_station') * SC2K_ECONOMY.DEPARTMENTS.police.costPerBuilding * (funding.police / 100) / 365;
    const projFire = countType('fire_station') * SC2K_ECONOMY.DEPARTMENTS.fire.costPerBuilding * (funding.fire / 100) / 365;
    const projHealth = countType('hospital') * SC2K_ECONOMY.DEPARTMENTS.health.costPerBuilding * (funding.health / 100) / 365;
    const projEdu = (countType('school') * SC2K_ECONOMY.DEPARTMENTS.education_school.costPerBuilding + countType('university') * SC2K_ECONOMY.DEPARTMENTS.education_university.costPerBuilding) * (funding.education / 100) / 365;

    const roads = fastify.legacyDb.roads.getAllRoads();
    const powerLines = fastify.legacyDb.powerLines.getAllPowerLines();
    const waterPipes = fastify.legacyDb.waterPipes.getAllWaterPipes();
    const projTransit = (roads.length * SC2K_ECONOMY.TRANSIT_MAINTENANCE.road + powerLines.length * SC2K_ECONOMY.TRANSIT_MAINTENANCE.power_line + waterPipes.length * SC2K_ECONOMY.TRANSIT_MAINTENANCE.water_pipe) * (funding.transit / 100) / 365;

    let projBondInterest = 0;
    for (const bond of city.economy.bonds) {
      projBondInterest += (bond.amount * (bond.rate / 100)) / 365;
    }

    return {
      treasury: city.stats.treasury,
      isMayor,
      economy: city.economy,
      populations: { residential: rPop, commercial: cPop, industrial: iPop, total: totalPop },
      dailyProjection: {
        revenue: {
          propertyTaxR: projRevR,
          propertyTaxC: projRevC,
          propertyTaxI: projRevI,
          ordinances: projOrdRevenue,
          total: projRevR + projRevC + projRevI + projOrdRevenue,
        },
        expenses: {
          police: projPolice,
          fire: projFire,
          health: projHealth,
          education: projEdu,
          transit: projTransit,
          bondInterest: projBondInterest,
          ordinances: projOrdCost,
          total: projPolice + projFire + projHealth + projEdu + projTransit + projBondInterest + projOrdCost,
        },
      },
      ordinanceDefinitions: SC2K_ECONOMY.ORDINANCES,
    };
  });

  // PUT /api/economy/tax-rates - Mayor sets R/C/I tax rates
  fastify.put('/api/economy/tax-rates', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const role = await getFreshRole(fastify, request);
    if (role !== 'mayor' && role !== 'admin') {
      return { error: 'Only the mayor can set tax rates' };
    }
    const { taxRateR, taxRateC, taxRateI } = request.body as { taxRateR: number; taxRateC: number; taxRateI: number };
    const clamp = (v: number) => Math.max(SC2K_ECONOMY.TAX.MIN_RATE, Math.min(SC2K_ECONOMY.TAX.MAX_RATE, v));
    fastify.legacyDb.city.updateTaxRates(clamp(taxRateR), clamp(taxRateC), clamp(taxRateI));
    return { success: true };
  });

  // POST /api/economy/ordinances - Toggle an ordinance
  fastify.post('/api/economy/ordinances', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const role = await getFreshRole(fastify, request);
    if (role !== 'mayor' && role !== 'admin') {
      return { error: 'Only the mayor can manage ordinances' };
    }
    const { ordinanceId, enabled } = request.body as { ordinanceId: string; enabled: boolean };
    if (!SC2K_ECONOMY.ORDINANCES[ordinanceId]) {
      return { error: 'Unknown ordinance' };
    }

    const city = fastify.legacyDb.city.getCity();
    if (!city) return { error: 'City not initialized' };

    const ordinances = new Set(city.economy.ordinances);
    if (enabled) ordinances.add(ordinanceId);
    else ordinances.delete(ordinanceId);

    fastify.legacyDb.city.updateOrdinances([...ordinances]);
    return { success: true, ordinances: [...ordinances] };
  });

  // POST /api/economy/bonds/issue - Issue a new bond
  fastify.post('/api/economy/bonds/issue', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const role = await getFreshRole(fastify, request);
    if (role !== 'mayor' && role !== 'admin') {
      return { error: 'Only the mayor can issue bonds' };
    }

    const city = fastify.legacyDb.city.getCity();
    if (!city) return { error: 'City not initialized' };

    if (city.economy.bonds.length >= SC2K_ECONOMY.BONDS.MAX_BONDS) {
      return { error: `Maximum ${SC2K_ECONOMY.BONDS.MAX_BONDS} bonds allowed` };
    }

    const premium = SC2K_ECONOMY.BONDS.RATING_PREMIUM[city.economy.creditRating] ?? 5;
    const rate = SC2K_ECONOMY.BONDS.BASE_INTEREST_RATE + premium;

    const bond: Bond = {
      id: crypto.randomUUID(),
      amount: SC2K_ECONOMY.BONDS.CHUNK_SIZE,
      rate,
      issuedDay: city.time.day,
      issuedYear: city.time.year,
    };

    const bonds = [...city.economy.bonds, bond];
    fastify.legacyDb.city.updateBonds(bonds);

    // Add bond amount to treasury
    fastify.legacyDb.city.updateTreasury(city.stats.treasury + bond.amount);

    // Recalculate credit rating
    const buildings = fastify.legacyDb.buildings.getAllBuildings().filter(b => b.constructionProgress >= 100);
    const newRating = calculateCreditRating(city.stats.treasury + bond.amount, bonds, buildings);
    fastify.legacyDb.city.updateCreditRating(newRating);

    return { success: true, bond, creditRating: newRating };
  });

  // POST /api/economy/bonds/repay - Repay oldest bond
  fastify.post('/api/economy/bonds/repay', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const role = await getFreshRole(fastify, request);
    if (role !== 'mayor' && role !== 'admin') {
      return { error: 'Only the mayor can repay bonds' };
    }
    const { bondId } = request.body as { bondId: string };

    const city = fastify.legacyDb.city.getCity();
    if (!city) return { error: 'City not initialized' };

    const bondIdx = city.economy.bonds.findIndex(b => b.id === bondId);
    if (bondIdx === -1) return { error: 'Bond not found' };

    const bond = city.economy.bonds[bondIdx];
    if (city.stats.treasury < bond.amount) {
      return { error: `Insufficient treasury ($${city.stats.treasury.toFixed(0)}) to repay $${bond.amount}` };
    }

    // Remove bond and deduct from treasury
    const bonds = city.economy.bonds.filter(b => b.id !== bondId);
    fastify.legacyDb.city.updateBonds(bonds);
    fastify.legacyDb.city.updateTreasury(city.stats.treasury - bond.amount);

    const buildings = fastify.legacyDb.buildings.getAllBuildings().filter(b => b.constructionProgress >= 100);
    const newRating = calculateCreditRating(city.stats.treasury - bond.amount, bonds, buildings);
    fastify.legacyDb.city.updateCreditRating(newRating);

    return { success: true, repaid: bond, creditRating: newRating };
  });

  // PUT /api/economy/department-funding - Set department funding levels
  fastify.put('/api/economy/department-funding', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const role = await getFreshRole(fastify, request);
    if (role !== 'mayor' && role !== 'admin') {
      return { error: 'Only the mayor can set department funding' };
    }
    const body = request.body as Partial<Record<string, number>>;
    const city = fastify.legacyDb.city.getCity();
    if (!city) return { error: 'City not initialized' };

    const funding = { ...city.economy.departmentFunding };
    const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

    if (body.police !== undefined) funding.police = clamp(body.police);
    if (body.fire !== undefined) funding.fire = clamp(body.fire);
    if (body.health !== undefined) funding.health = clamp(body.health);
    if (body.education !== undefined) funding.education = clamp(body.education);
    if (body.transit !== undefined) funding.transit = clamp(body.transit);

    fastify.legacyDb.city.updateDepartmentFunding(funding);
    return { success: true, funding };
  });
};
