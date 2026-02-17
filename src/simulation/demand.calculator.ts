// ============================================
// MOLTCITY - Demand Calculator (SC2K-style)
// ============================================
// Utility class that computes R/O/I demand balance.
// Positive values = undersupplied, negative = oversupplied.
// Tax rates and ordinances shift demand per SC2k mechanics.

import type { SimulationDb } from './engine.adapter.js';
import { DEMAND_BALANCE, SC2K_ECONOMY } from '../config/game.js';
import type { BuildingType } from '../models/types.js';

export interface DemandResult {
  residential: number;
  office: number;
  industrial: number;
  counts: { residential: number; office: number; industrial: number; total: number };
}

export class DemandCalculator {
  constructor(private db: SimulationDb) {}

  calculate(): DemandResult {
    const buildings = this.db.buildings.getAllBuildings();

    let residential = 0;
    let office = 0;
    let industrial = 0;

    for (const b of buildings) {
      if (b.constructionProgress < 100) continue;
      const type = b.type as BuildingType;

      if (type === 'residential' || type === 'suburban' || type === 'house' || type === 'apartment') {
        residential++;
      } else if (type === 'offices' || type === 'office' || type === 'shop') {
        office++;
      } else if (type === 'industrial' || type === 'factory') {
        industrial++;
      }
    }

    const total = residential + office + industrial;
    if (total === 0) {
      return {
        residential: DEMAND_BALANCE.IDEAL_RATIO.residential,
        office: DEMAND_BALANCE.IDEAL_RATIO.office,
        industrial: DEMAND_BALANCE.IDEAL_RATIO.industrial,
        counts: { residential: 0, office: 0, industrial: 0, total: 0 },
      };
    }

    const currentRatio = {
      residential: residential / total,
      office: office / total,
      industrial: industrial / total,
    };

    // Base demand from ratio imbalance
    let demandR = DEMAND_BALANCE.IDEAL_RATIO.residential - currentRatio.residential;
    let demandC = DEMAND_BALANCE.IDEAL_RATIO.office - currentRatio.office;
    let demandI = DEMAND_BALANCE.IDEAL_RATIO.industrial - currentRatio.industrial;

    // Tax impact: lower tax = more demand, higher tax = less demand
    // Neutral at 7%, each % away shifts demand by DEMAND_SENSITIVITY
    const city = this.db.city.getCity();
    if (city?.economy) {
      const { NEUTRAL_RATE, DEMAND_SENSITIVITY } = SC2K_ECONOMY.TAX;
      demandR += (NEUTRAL_RATE - city.economy.taxRateR) * DEMAND_SENSITIVITY;
      demandC += (NEUTRAL_RATE - city.economy.taxRateC) * DEMAND_SENSITIVITY;
      demandI += (NEUTRAL_RATE - city.economy.taxRateI) * DEMAND_SENSITIVITY;

      // Ordinance demand effects
      for (const ordId of city.economy.ordinances) {
        const ord = SC2K_ECONOMY.ORDINANCES[ordId];
        if (!ord?.demandEffect) continue;
        if (ord.demandEffect.residential) demandR += ord.demandEffect.residential;
        if (ord.demandEffect.commercial) demandC += ord.demandEffect.commercial;
        if (ord.demandEffect.industrial) demandI += ord.demandEffect.industrial;
      }

      // Underfunded services reduce demand
      const { departmentFunding } = city.economy;
      if (departmentFunding.police < 50) demandR -= 0.05; // Crime risk
      if (departmentFunding.education < 50) demandI -= 0.05; // No skilled workers
      if (departmentFunding.transit < 50) demandC -= 0.03; // Poor access
    }

    return {
      residential: demandR,
      office: demandC,
      industrial: demandI,
      counts: { residential, office, industrial, total },
    };
  }
}
