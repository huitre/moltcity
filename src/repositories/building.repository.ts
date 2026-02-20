// ============================================
// MOLTCITY - Building Repository
// ============================================

import { eq, and } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { buildings, type BuildingRow, type BuildingInsert } from '../db/schema/buildings.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { Building, BuildingType } from '../models/types.js';

// Power/water requirements per building type
const POWER_REQUIREMENTS: Partial<Record<BuildingType, number>> = {
  residential: 100,
  offices: 800,
  suburban: 50,
  industrial: 1500,
  fire_station: 500,
  hospital: 2000,
  house: 100,
  apartment: 500,
  shop: 300,
  office: 800,
  factory: 2000,
  power_plant: 0,
  water_tower: 50,
  road: 10,
  park: 0,
  plaza: 100,
  city_hall: 1000,
  police_station: 800,
  courthouse: 1200,
  jail: 1500,
};

const WATER_REQUIREMENTS: Partial<Record<BuildingType, number>> = {
  // Zone types: residential=10, offices=1.2x res, industrial=1.5x off
  residential: 10,
  offices: 12,
  suburban: 5,
  industrial: 18,
  // Legacy building types follow same ratios
  house: 10,
  apartment: 15,
  shop: 12,
  office: 12,
  factory: 18,
  // Infrastructure & services
  fire_station: 20,
  hospital: 40,
  power_plant: 50,
  water_tower: 0,
  road: 0,
  park: 8,
  plaza: 6,
  city_hall: 20,
  police_station: 15,
  courthouse: 15,
  jail: 20,
};

export class BuildingRepository extends BaseRepository<typeof buildings, BuildingRow, BuildingInsert> {
  constructor(db: DrizzleDb) {
    super(db, buildings);
  }

  async getBuilding(id: string): Promise<Building | null> {
    const result = await this.findById(id, buildings.id);
    return result ? this.rowToBuilding(result) : null;
  }

  async getBuildingAtParcel(parcelId: string): Promise<Building | null> {
    const results = await this.db
      .select()
      .from(buildings)
      .where(eq(buildings.parcelId, parcelId))
      .limit(1);
    return results.length > 0 ? this.rowToBuilding(results[0]) : null;
  }

  async getAllBuildings(cityId?: string): Promise<Building[]> {
    if (!cityId) return [];
    const results = await this.db.select().from(buildings).where(eq(buildings.cityId, cityId));
    return results.map(row => this.rowToBuilding(row));
  }

  async getBuildingsByOwner(ownerId: string): Promise<Building[]> {
    const results = await this.db
      .select()
      .from(buildings)
      .where(eq(buildings.ownerId, ownerId));
    return results.map(row => this.rowToBuilding(row));
  }

  async createBuilding(
    parcelId: string,
    type: BuildingType,
    name: string,
    ownerId: string,
    sprite?: string,
    floors: number = 1,
    currentTick: number = 0,
    width: number = 1,
    height: number = 1,
    cityId?: string
  ): Promise<Building> {
    const id = this.generateId();
    const basePower = this.getPowerRequirement(type);
    const baseWater = this.getWaterRequirement(type);
    const powerRequired = basePower * floors;
    const waterRequired = baseWater * floors;

    await this.db.insert(buildings).values({
      id,
      cityId: cityId || '',
      parcelId,
      type,
      name,
      sprite: sprite || '',
      floors,
      width,
      height,
      powerRequired,
      waterRequired,
      builtAt: this.now(),
      ownerId,
      constructionProgress: 100,
      constructionStartedAt: null,
      constructionTimeTicks: 0,
      density: 1,
    });

    return (await this.getBuilding(id))!;
  }

  async updateBuilding(
    buildingId: string,
    updates: { name?: string; sprite?: string; type?: BuildingType; ownerId?: string }
  ): Promise<void> {
    const updateData: Partial<BuildingInsert> = {};

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.sprite !== undefined) updateData.sprite = updates.sprite;
    if (updates.ownerId !== undefined) updateData.ownerId = updates.ownerId;
    if (updates.type !== undefined) {
      updateData.type = updates.type;
      updateData.powerRequired = this.getPowerRequirement(updates.type);
      updateData.waterRequired = this.getWaterRequirement(updates.type);
    }

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(buildings)
        .set(updateData)
        .where(eq(buildings.id, buildingId));
    }
  }

  async deleteBuilding(buildingId: string): Promise<boolean> {
    return this.deleteById(buildingId, buildings.id);
  }

  async updatePowerStatus(buildingId: string, powered: boolean): Promise<void> {
    await this.db
      .update(buildings)
      .set({ powered })
      .where(eq(buildings.id, buildingId));
  }

  getPowerRequirement(type: BuildingType): number {
    return POWER_REQUIREMENTS[type] || 100;
  }

  getWaterRequirement(type: BuildingType): number {
    return WATER_REQUIREMENTS[type] || 10;
  }

  async updateWaterStatus(buildingId: string, hasWater: boolean): Promise<void> {
    await this.db
      .update(buildings)
      .set({ hasWater })
      .where(eq(buildings.id, buildingId));
  }

  async updateDensityAndFloors(buildingId: string, density: number, floors: number): Promise<void> {
    await this.db
      .update(buildings)
      .set({ density, floors })
      .where(eq(buildings.id, buildingId));
  }

  private rowToBuilding(row: BuildingRow): Building {
    return {
      id: row.id,
      parcelId: row.parcelId,
      type: row.type as BuildingType,
      name: row.name,
      sprite: row.sprite || '',
      width: row.width,
      height: row.height,
      floors: row.floors,
      powerRequired: row.powerRequired,
      waterRequired: row.waterRequired,
      powered: row.powered,
      hasWater: row.hasWater,
      operational: row.operational,
      builtAt: row.builtAt,
      ownerId: row.ownerId,
      constructionProgress: row.constructionProgress,
      constructionStartedAt: row.constructionStartedAt,
      constructionTimeTicks: row.constructionTimeTicks,
      density: row.density,
    };
  }
}
