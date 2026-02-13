// ============================================
// MOLTCITY - Demand Calculator
// ============================================
// Utility class that computes R/O/I demand balance.
// Positive values = undersupplied, negative = oversupplied.

import { DatabaseManager } from '../models/database.js';
import { DEMAND_BALANCE } from '../config/game.js';
import type { BuildingType } from '../models/types.js';

export interface DemandResult {
  residential: number;
  office: number;
  industrial: number;
  counts: { residential: number; office: number; industrial: number; total: number };
}

export class DemandCalculator {
  constructor(private db: DatabaseManager) {}

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

    return {
      residential: DEMAND_BALANCE.IDEAL_RATIO.residential - currentRatio.residential,
      office: DEMAND_BALANCE.IDEAL_RATIO.office - currentRatio.office,
      industrial: DEMAND_BALANCE.IDEAL_RATIO.industrial - currentRatio.industrial,
      counts: { residential, office, industrial, total },
    };
  }
}
