// ============================================
// MOLTCITY - Zone Build Simulator
// ============================================
// Runs every 100 ticks. Auto-builds on zoned parcels that have
// an adjacent road, based on demand and random chance.

import type { SimulationDb } from './engine.adapter.js';
import { DemandCalculator } from './demand.calculator.js';
import type { CityTime, BuildingType, ZoningType } from '../models/types.js';
import type { ActivityLogger } from './engine.js';

const BUILD_INTERVAL_TICKS = 100;
const BUILD_CHANCE = 0.15; // 15% per eligible parcel per interval

// Map zoning type to building type
const ZONING_TO_BUILDING: Record<string, BuildingType> = {
  residential: 'residential',
  suburban: 'suburban',
  office: 'offices',
  industrial: 'industrial',
};

// Map zoning type to demand key
const ZONING_TO_DEMAND_KEY: Record<string, 'residential' | 'office' | 'industrial'> = {
  residential: 'residential',
  suburban: 'residential',
  office: 'office',
  industrial: 'industrial',
};

const BUILDING_NAMES: Record<string, string> = {
  residential: 'Residence',
  suburban: 'Suburban Home',
  offices: 'Office',
  industrial: 'Industrial Zone',
};

export class ZoneBuildSimulator {
  private lastProcessedTick: number = 0;
  private demandCalculator: DemandCalculator;

  constructor(private db: SimulationDb, private log?: ActivityLogger) {
    this.demandCalculator = new DemandCalculator(db);
  }

  simulate(currentTick: number, time: CityTime): number {
    if (currentTick - this.lastProcessedTick < BUILD_INTERVAL_TICKS) return 0;
    this.lastProcessedTick = currentTick;

    const zonedParcels = this.db.parcels.getZonedParcelsWithoutBuilding();
    if (zonedParcels.length === 0) return 0;

    const demand = this.demandCalculator.calculate();
    let built = 0;

    for (const parcel of zonedParcels) {
      const zoning = parcel.zoning;
      if (!zoning) continue;

      const buildingType = ZONING_TO_BUILDING[zoning];
      if (!buildingType) continue;

      // Check demand for this zone category (positive = undersupplied)
      const demandKey = ZONING_TO_DEMAND_KEY[zoning];
      if (demandKey) {
        const demandValue = demand[demandKey];
        // Skip if oversupplied (demand is negative)
        if (demandValue < -0.1) continue;
      }

      // Check adjacent road exists
      if (!this.hasAdjacentRoad(parcel.x, parcel.y)) continue;

      // Random chance so buildings don't all appear at once
      if (Math.random() > BUILD_CHANCE) continue;

      // Double-check no building exists (prevents duplicates from concurrent processes)
      const existingBuilding = this.db.buildings.getBuildingAtParcel(parcel.id);
      if (existingBuilding) continue;

      // Create the building
      const name = BUILDING_NAMES[buildingType] || buildingType;
      const ownerId = parcel.ownerId || 'system';

      this.db.buildings.createBuilding(
        parcel.id,
        buildingType,
        name,
        ownerId,
        undefined, // sprite
        1, // floors (density 1)
        currentTick
      );

      built++;
      console.log(`[ZoneBuild] Auto-built ${buildingType} at (${parcel.x}, ${parcel.y})`);
      this.log?.('zone_build', `${name} auto-built at (${parcel.x}, ${parcel.y})`, {
        type: buildingType, x: parcel.x, y: parcel.y,
      });
    }

    if (built > 0) {
      console.log(`[ZoneBuild] ${built} buildings auto-constructed on tick ${currentTick}`);
    }
    return built;
  }

  private hasAdjacentRoad(x: number, y: number): boolean {
    const roads = this.db.roads.getAllRoads();
    for (const road of roads) {
      const p = this.db.parcels.getParcelById(road.parcelId);
      if (!p) continue;
      if (Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1) {
        return true;
      }
    }
    return false;
  }
}
