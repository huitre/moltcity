// ============================================
// MOLTCITY - Building Repository
// ============================================

import { eq, lt } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { buildings, type BuildingRow, type BuildingInsert } from '../db/schema/buildings.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { Building, BuildingType } from '../models/types.js';

// Power/water requirements per building type
const POWER_REQUIREMENTS: Record<BuildingType, number> = {
  house: 100,
  apartment: 500,
  shop: 300,
  office: 800,
  factory: 2000,
  power_plant: 0,
  water_tower: 50,
  road: 10,
  park: 20,
  plaza: 100,
  city_hall: 1000,
  police_station: 800,
  courthouse: 1200,
  jail: 1500,
};

const WATER_REQUIREMENTS: Record<BuildingType, number> = {
  house: 50,
  apartment: 200,
  shop: 30,
  office: 100,
  factory: 500,
  power_plant: 1000,
  water_tower: 0,
  road: 0,
  park: 100,
  plaza: 50,
  city_hall: 200,
  police_station: 100,
  courthouse: 150,
  jail: 300,
};

const TICKS_PER_FLOOR = 240;

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

  async getAllBuildings(): Promise<Building[]> {
    const results = await this.findAll();
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
    currentTick: number = 0
  ): Promise<Building> {
    const id = this.generateId();
    const basePower = this.getPowerRequirement(type);
    const baseWater = this.getWaterRequirement(type);
    const powerRequired = basePower * floors;
    const waterRequired = baseWater * floors;

    const constructionTimeTicks = type === 'road' ? 0 : floors * TICKS_PER_FLOOR;
    const constructionProgress = type === 'road' ? 100 : 0;
    const constructionStartedAt = type === 'road' ? null : currentTick;

    await this.db.insert(buildings).values({
      id,
      parcelId,
      type,
      name,
      sprite: sprite || '',
      floors,
      powerRequired,
      waterRequired,
      builtAt: this.now(),
      ownerId,
      constructionProgress,
      constructionStartedAt,
      constructionTimeTicks,
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

  async updateConstructionProgress(buildingId: string, progress: number): Promise<void> {
    await this.db
      .update(buildings)
      .set({ constructionProgress: progress })
      .where(eq(buildings.id, buildingId));
  }

  async getBuildingsUnderConstruction(): Promise<Building[]> {
    const results = await this.db
      .select()
      .from(buildings)
      .where(lt(buildings.constructionProgress, 100));
    return results.map(row => this.rowToBuilding(row));
  }

  getPowerRequirement(type: BuildingType): number {
    return POWER_REQUIREMENTS[type] || 100;
  }

  getWaterRequirement(type: BuildingType): number {
    return WATER_REQUIREMENTS[type] || 50;
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
    };
  }
}
