// ============================================
// MOLTCITY - City Service
// ============================================

import { eq, and, isNotNull, count } from 'drizzle-orm';
import { CityRepository } from '../repositories/city.repository.js';
import { ParcelRepository } from '../repositories/parcel.repository.js';
import { BuildingRepository } from '../repositories/building.repository.js';
import { RoadRepository } from '../repositories/road.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { residents } from '../db/schema/population.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { City, CityStats } from '../models/types.js';

export class CityService {
  private db: DrizzleDb;
  private cityRepo: CityRepository;
  private parcelRepo: ParcelRepository;
  private buildingRepo: BuildingRepository;
  private roadRepo: RoadRepository;
  private agentRepo: AgentRepository;

  constructor(db: DrizzleDb) {
    this.db = db;
    this.cityRepo = new CityRepository(db);
    this.parcelRepo = new ParcelRepository(db);
    this.buildingRepo = new BuildingRepository(db);
    this.roadRepo = new RoadRepository(db);
    this.agentRepo = new AgentRepository(db);
  }

  async getCity(cityId?: string): Promise<City | null> {
    const city = await this.cityRepo.getCity(cityId);
    if (!city) return null;

    // Enrich with calculated stats
    const stats = await this.calculateStats(city.id);
    city.stats = stats;

    return city;
  }

  async getAllCities(): Promise<City[]> {
    return this.cityRepo.getAllCities();
  }

  async createCity(name: string, creatorUserId: string): Promise<City> {
    return this.cityRepo.createCity(name, creatorUserId);
  }

  async updateTime(cityId: string, tick: number, hour: number, day: number, year: number): Promise<void> {
    await this.cityRepo.updateTime(cityId, tick, hour, day, year);
  }

  async getTopCities(limit: number = 10): Promise<City[]> {
    const cities = await this.cityRepo.getAllCities();
    const enriched = await Promise.all(
      cities.map(async (c) => {
        c.stats = await this.calculateStats(c.id);
        return c;
      })
    );
    return enriched
      .sort((a, b) => b.stats.population - a.stats.population)
      .slice(0, limit);
  }

  async calculateStats(cityId: string): Promise<CityStats> {
    const [residentCount, employedCount, buildings, roads] = await Promise.all([
      this.db.select({ count: count() }).from(residents).where(eq(residents.cityId, cityId)).then(r => r[0]?.count || 0),
      this.db.select({ count: count() }).from(residents).where(and(eq(residents.cityId, cityId), isNotNull(residents.workBuildingId))).then(r => r[0]?.count || 0),
      this.buildingRepo.getAllBuildings(cityId),
      this.roadRepo.getAllRoads(cityId),
    ]);

    let powerCapacity = 0;
    let powerDemand = 0;
    let waterCapacity = 0;
    let waterDemand = 0;
    let totalJobs = 0;

    for (const building of buildings) {
      if (building.type === 'power_plant') {
        powerCapacity += 10000;
      } else {
        powerDemand += building.powerRequired;
      }

      if (building.type === 'water_tower') {
        waterCapacity += 1000;
      } else {
        waterDemand += building.waterRequired;
      }

      // Count jobs from commercial/office/industrial buildings
      if (['offices', 'industrial'].includes(building.type)) {
        totalJobs += building.floors * 5;
      }
    }

    const city = await this.cityRepo.getCity(cityId);

    return {
      population: residentCount,
      employed: employedCount,
      totalJobs,
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
