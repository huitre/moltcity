// ============================================
// MOLTCITY - Zone Evolution Simulator
// ============================================
// Runs daily (hour === 2). Evolves zone buildings in density
// based on land value and demand balance.

import type { SimulationDb } from './engine.adapter.js';
import { ZONE_EVOLUTION } from '../config/game.js';
import { DemandCalculator } from './demand.calculator.js';
import type { CityTime, BuildingType } from '../models/types.js';
import type { ActivityLogger } from './engine.js';

export class ZoneEvolutionSimulator {
  private lastProcessedDay: number = 0;
  private demandCalculator: DemandCalculator;

  constructor(private db: SimulationDb, private log?: ActivityLogger) {
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

      // Density 3 for residential/offices requires 2x2 footprint on grid-aligned position
      if (newDensity === 3 && (type === 'residential' || type === 'offices')) {
        if (!this.canExpandTo2x2(parcel.x, parcel.y, parcel.zoning!)) continue;
        this.mergeAdjacentBuildings(parcel.x, parcel.y);
        this.db.buildings.updateDensityAndFloors(building.id, newDensity, newFloors, 2, 2);
      } else {
        this.db.buildings.updateDensityAndFloors(building.id, newDensity, newFloors);
      }
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

  private canExpandTo2x2(baseX: number, baseY: number, zoning: string): boolean {
    // Only grid-aligned positions can anchor a 2x2 block (divisible by 2)
    if (baseX % 2 !== 0 || baseY % 2 !== 0) return false;

    const offsets = [[1, 0], [0, 1], [1, 1]];
    for (const [dx, dy] of offsets) {
      const adj = this.db.parcels.getParcel(baseX + dx, baseY + dy);
      if (!adj) return false;
      if (adj.zoning !== zoning) return false;
      // Adjacent parcels may have buildings (they'll be merged), but not multi-tile ones
      const building = this.db.buildings.getBuildingAtParcel(adj.id);
      if (building && (building.width > 1 || building.height > 1)) return false;
    }
    return true;
  }

  private mergeAdjacentBuildings(baseX: number, baseY: number): void {
    const offsets = [[1, 0], [0, 1], [1, 1]];
    for (const [dx, dy] of offsets) {
      const adj = this.db.parcels.getParcel(baseX + dx, baseY + dy);
      if (!adj) continue;
      const building = this.db.buildings.getBuildingAtParcel(adj.id);
      if (!building) continue;
      // Evict residents and remove workers before deleting
      this.db.population.deleteResidentsByHome(building.id);
      this.db.population.removeWorkFromBuilding(building.id);
      this.db.buildings.deleteBuilding(building.id);
      console.log(`[ZoneEvolution] Merged building ${building.name} at (${baseX + dx},${baseY + dy}) into 2x2 block`);
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
