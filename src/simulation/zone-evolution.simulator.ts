// ============================================
// MOLTCITY - Zone Evolution Simulator
// ============================================
// Runs daily (hour === 2). Evolves zone buildings in density
// based on land value and demand balance.

import { DatabaseManager } from '../models/database.js';
import { ZONE_EVOLUTION } from '../config/game.js';
import { DemandCalculator } from './demand.calculator.js';
import type { CityTime, BuildingType } from '../models/types.js';
import type { ActivityLogger } from './engine.js';

export class ZoneEvolutionSimulator {
  private lastProcessedDay: number = 0;
  private demandCalculator: DemandCalculator;

  constructor(private db: DatabaseManager, private log?: ActivityLogger) {
    this.demandCalculator = new DemandCalculator(db);
  }

  simulate(time: CityTime): void {
    if (time.hour !== 2 || this.lastProcessedDay === time.day) return;
    this.lastProcessedDay = time.day;

    const buildings = this.db.buildings.getAllBuildings();
    const demand = this.demandCalculator.calculate();
    let evolved = 0;

    for (const building of buildings) {
      if (building.constructionProgress < 100) continue;

      const type = building.type as BuildingType;

      // Only zone types evolve
      const maxDensity = this.getMaxDensity(type);
      if (maxDensity === null) continue;

      // Skip if already at max density
      if (building.density >= maxDensity) continue;

      // Skip if suburban (never evolves)
      if (type === 'suburban') continue;

      // Must be powered
      if (!building.powered) continue;

      // Check adjacent road
      const parcel = this.db.parcels.getParcelById(building.parcelId);
      if (!parcel) continue;

      const hasRoad = this.hasAdjacentRoad(parcel.x, parcel.y);
      if (!hasRoad) continue;

      // Get land value and determine target density
      const landValue = parcel.landValue;
      let targetDensity = 1;
      if (landValue >= ZONE_EVOLUTION.LAND_VALUE_THRESHOLD_HIGH) {
        targetDensity = 3;
      } else if (landValue >= ZONE_EVOLUTION.LAND_VALUE_THRESHOLD_MEDIUM) {
        targetDensity = 2;
      }

      // Can't evolve beyond target
      if (building.density >= targetDensity) continue;

      // Check demand for this zone category
      const demandValue = this.getDemandForType(type, demand);
      if (demandValue < ZONE_EVOLUTION.DEMAND_THRESHOLD) continue;

      // Evolve: increment density by 1
      const newDensity = building.density + 1;
      const newFloors = ZONE_EVOLUTION.DENSITY_TO_FLOORS[newDensity] || newDensity;

      this.db.buildings.updateDensityAndFloors(building.id, newDensity, newFloors);
      evolved++;

      console.log(`[ZoneEvolution] ${building.name} (${type}) evolved to density ${newDensity} (${newFloors} floors)`);
      this.log?.('zone_evolved', `${building.name} (${type}) evolved to density ${newDensity} (${newFloors} floors)`, {
        buildingId: building.id, type, density: newDensity, floors: newFloors,
      });
    }

    if (evolved > 0) {
      console.log(`[ZoneEvolution] ${evolved} buildings evolved on day ${time.day}`);
    }
  }

  private getMaxDensity(type: BuildingType): number | null {
    switch (type) {
      case 'residential': return ZONE_EVOLUTION.RESIDENTIAL_MAX_DENSITY;
      case 'offices': return ZONE_EVOLUTION.OFFICE_MAX_DENSITY;
      case 'industrial': return ZONE_EVOLUTION.INDUSTRIAL_MAX_DENSITY;
      case 'suburban': return ZONE_EVOLUTION.SUBURBAN_MAX_DENSITY;
      default: return null;
    }
  }

  private getDemandForType(type: BuildingType, demand: { residential: number; office: number; industrial: number }): number {
    switch (type) {
      case 'residential': return demand.residential;
      case 'offices': return demand.office;
      case 'industrial': return demand.industrial;
      default: return 0;
    }
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
