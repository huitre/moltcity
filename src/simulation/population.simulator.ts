// ============================================
// MOLTCITY - Population Simulator
// ============================================

import { PopulationRepository, type Resident } from '../repositories/population.repository.js';
import { HOUSING } from '../config/game.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { Building, CityEvent } from '../models/types.js';

// Population rules per building type (using config values)
const POPULATION_RULES: Record<string, { min: number; max: number; perFloor: boolean }> = {
  house: { min: 2, max: 4, perFloor: false },
  apartment: { min: HOUSING.FLATS_PER_FLOOR, max: HOUSING.FLATS_PER_FLOOR, perFloor: true },
};

export class PopulationSimulator {
  private populationRepo: PopulationRepository;

  constructor(db: DrizzleDb) {
    this.populationRepo = new PopulationRepository(db);
  }

  /**
   * Spawn residents when a residential building is completed
   */
  async onBuildingCompleted(building: Building): Promise<CityEvent[]> {
    const events: CityEvent[] = [];
    const rules = POPULATION_RULES[building.type];

    if (!rules) {
      // Not a residential building
      return events;
    }

    // Calculate number of residents to spawn
    let residentCount: number;
    if (rules.perFloor) {
      // Apartments: fixed per floor
      residentCount = rules.min * building.floors;
    } else {
      // Houses: random between min and max
      residentCount = Math.floor(Math.random() * (rules.max - rules.min + 1)) + rules.min;
    }

    console.log(`[Population] Spawning ${residentCount} residents for ${building.type} "${building.name}"`);

    // Create residents
    for (let i = 0; i < residentCount; i++) {
      const resident = await this.populationRepo.createResident(building.id);
      events.push({
        type: 'resident_spawned' as any,
        timestamp: Date.now(),
        data: {
          residentId: resident.id,
          name: resident.name,
          buildingId: building.id,
          buildingName: building.name,
        },
      });
    }

    return events;
  }

  /**
   * Remove residents when a building is demolished
   */
  async onBuildingDemolished(buildingId: string): Promise<CityEvent[]> {
    const events: CityEvent[] = [];

    // Get residents before deleting
    const residents = await this.populationRepo.getResidentsByHome(buildingId);

    // Delete all residents living in this building
    const count = await this.populationRepo.deleteResidentsByHome(buildingId);

    if (count > 0) {
      console.log(`[Population] ${count} residents displaced from demolished building`);
      events.push({
        type: 'residents_displaced' as any,
        timestamp: Date.now(),
        data: {
          buildingId,
          count,
          residentIds: residents.map(r => r.id),
        },
      });
    }

    // Also remove jobs from this building if it was a workplace
    await this.populationRepo.removeWorkFromBuilding(buildingId);

    return events;
  }

  /**
   * Get population statistics
   */
  async getPopulationStats(): Promise<{
    total: number;
    employed: number;
    unemployed: number;
    employmentRate: number;
  }> {
    const total = await this.populationRepo.getTotalPopulation();
    const employed = await this.populationRepo.getEmployedCount();
    const unemployed = total - employed;
    const employmentRate = total > 0 ? (employed / total) * 100 : 0;

    return { total, employed, unemployed, employmentRate };
  }

  /**
   * Get all residents
   */
  async getAllResidents(): Promise<Resident[]> {
    return this.populationRepo.getAllResidents();
  }

  /**
   * Get unemployed residents for job matching
   */
  async getUnemployedResidents(): Promise<Resident[]> {
    return this.populationRepo.getUnemployedResidents();
  }
}
