// ============================================
// MOLTCITY - City Service
// ============================================

import { CityRepository } from '../repositories/city.repository.js';
import { ParcelRepository } from '../repositories/parcel.repository.js';
import { BuildingRepository } from '../repositories/building.repository.js';
import { RoadRepository } from '../repositories/road.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { City, CityStats } from '../models/types.js';

export class CityService {
  private cityRepo: CityRepository;
  private parcelRepo: ParcelRepository;
  private buildingRepo: BuildingRepository;
  private roadRepo: RoadRepository;
  private agentRepo: AgentRepository;

  constructor(db: DrizzleDb) {
    this.cityRepo = new CityRepository(db);
    this.parcelRepo = new ParcelRepository(db);
    this.buildingRepo = new BuildingRepository(db);
    this.roadRepo = new RoadRepository(db);
    this.agentRepo = new AgentRepository(db);
  }

  async getCity(): Promise<City | null> {
    const city = await this.cityRepo.getCity();
    if (!city) return null;

    // Enrich with calculated stats
    const stats = await this.calculateStats();
    city.stats = stats;

    return city;
  }

  async initializeCity(name: string, width: number = 50, height: number = 50): Promise<City> {
    // Check if city already exists
    const existingCity = await this.cityRepo.getCity();
    if (existingCity) {
      throw new Error('City already initialized');
    }

    // Initialize city
    const city = await this.cityRepo.initializeCity(name, width, height);

    // Initialize parcel grid
    await this.parcelRepo.initializeGrid(width, height);

    return city;
  }

  async updateTime(tick: number, hour: number, day: number, year: number): Promise<void> {
    await this.cityRepo.updateTime(tick, hour, day, year);
  }

  async calculateStats(): Promise<CityStats> {
    const [agents, buildings, roads] = await Promise.all([
      this.agentRepo.getAllAgents(),
      this.buildingRepo.getAllBuildings(),
      this.roadRepo.getAllRoads(),
    ]);

    let powerCapacity = 0;
    let powerDemand = 0;
    let waterCapacity = 0;
    let waterDemand = 0;

    for (const building of buildings) {
      if (building.type === 'power_plant') {
        powerCapacity += 10000; // Each power plant provides 10,000 watts
      } else {
        powerDemand += building.powerRequired;
      }

      if (building.type === 'water_tower') {
        waterCapacity += 1000; // Each water tower provides 1,000 units
      } else {
        waterDemand += building.waterRequired;
      }
    }

    const city = await this.cityRepo.getCity();

    return {
      population: agents.length,
      totalBuildings: buildings.length,
      totalRoads: roads.length,
      powerCapacity,
      powerDemand,
      waterCapacity,
      waterDemand,
      treasury: city?.stats.treasury || 0,
    };
  }
}
