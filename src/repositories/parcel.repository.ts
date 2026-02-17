// ============================================
// MOLTCITY - Parcel Repository
// ============================================

import { eq, and, gte, lte, isNull, isNotNull, notExists, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { parcels, type ParcelRow, type ParcelInsert } from '../db/schema/parcels.js';
import { buildings } from '../db/schema/buildings.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { Parcel, TerrainType, ZoningType } from '../models/types.js';

export class ParcelRepository extends BaseRepository<typeof parcels, ParcelRow, ParcelInsert> {
  constructor(db: DrizzleDb) {
    super(db, parcels);
  }

  async getParcel(x: number, y: number, cityId?: string): Promise<Parcel | null> {
    const conditions = [eq(parcels.x, x), eq(parcels.y, y)];
    if (cityId) conditions.push(eq(parcels.cityId, cityId));
    const results = await this.db
      .select()
      .from(parcels)
      .where(and(...conditions))
      .limit(1);
    return results.length > 0 ? this.rowToParcel(results[0]) : null;
  }

  async getOrCreateParcel(x: number, y: number, cityId?: string): Promise<Parcel> {
    const existing = await this.getParcel(x, y, cityId);
    if (existing) return existing;
    return this.createParcel(x, y, 'land', cityId);
  }

  async getParcelById(id: string): Promise<Parcel | null> {
    const result = await this.findById(id, parcels.id);
    return result ? this.rowToParcel(result) : null;
  }

  async getAllParcels(): Promise<Parcel[]> {
    const results = await this.findAll();
    return results.map(row => this.rowToParcel(row));
  }

  async getParcelsByCityId(cityId: string): Promise<Parcel[]> {
    const results = await this.db
      .select()
      .from(parcels)
      .where(eq(parcels.cityId, cityId));
    return results.map(row => this.rowToParcel(row));
  }

  async getZonedParcelsWithoutBuilding(cityId?: string): Promise<Parcel[]> {
    if (!cityId) return [];
    const results = await this.db
      .select()
      .from(parcels)
      .where(and(
        eq(parcels.cityId, cityId),
        isNotNull(parcels.zoning),
        notExists(
          this.db.select({ id: buildings.id }).from(buildings).where(eq(buildings.parcelId, parcels.id))
        ),
      ));
    return results.map(row => this.rowToParcel(row));
  }

  async getParcelsByOwner(ownerId: string): Promise<Parcel[]> {
    const results = await this.db
      .select()
      .from(parcels)
      .where(eq(parcels.ownerId, ownerId));
    return results.map(row => this.rowToParcel(row));
  }

  async getParcelsInRange(minX: number, minY: number, maxX: number, maxY: number, cityId?: string): Promise<Parcel[]> {
    const conditions = [
      gte(parcels.x, minX),
      lte(parcels.x, maxX),
      gte(parcels.y, minY),
      lte(parcels.y, maxY),
    ];
    if (cityId) {
      conditions.push(eq(parcels.cityId, cityId));
    }
    const results = await this.db
      .select()
      .from(parcels)
      .where(and(...conditions));
    return results.map(row => this.rowToParcel(row));
  }

  async createParcel(x: number, y: number, terrain: TerrainType = 'land', cityId?: string): Promise<Parcel> {
    const id = this.generateId();
    await this.db.insert(parcels).values({
      id,
      x,
      y,
      terrain,
      cityId: cityId || null,
    });
    return (await this.getParcel(x, y))!;
  }

  async claimParcelForCity(parcelId: string, cityId: string): Promise<void> {
    await this.db
      .update(parcels)
      .set({ cityId })
      .where(eq(parcels.id, parcelId));
  }

  async purchaseParcel(parcelId: string, ownerId: string, price: number): Promise<void> {
    await this.db
      .update(parcels)
      .set({
        ownerId,
        purchasePrice: price,
        purchaseDate: this.now(),
      })
      .where(eq(parcels.id, parcelId));
  }

  async setZoning(parcelId: string, zoning: ZoningType, cityId?: string): Promise<void> {
    const updates: Record<string, unknown> = { zoning };
    if (cityId) updates.cityId = cityId;
    await this.db
      .update(parcels)
      .set(updates)
      .where(eq(parcels.id, parcelId));
  }

  async clearZoning(parcelId: string): Promise<void> {
    await this.db
      .update(parcels)
      .set({ zoning: null })
      .where(eq(parcels.id, parcelId));
  }

  async transferParcel(parcelId: string, newOwnerId: string, price: number): Promise<void> {
    await this.db
      .update(parcels)
      .set({
        ownerId: newOwnerId,
        purchasePrice: price,
        purchaseDate: this.now(),
      })
      .where(eq(parcels.id, parcelId));
  }

  async releaseParcel(parcelId: string): Promise<void> {
    await this.db
      .update(parcels)
      .set({
        ownerId: null,
        purchasePrice: null,
        purchaseDate: null,
      })
      .where(eq(parcels.id, parcelId));
  }

  async updateLandValue(parcelId: string, value: number): Promise<void> {
    await this.db
      .update(parcels)
      .set({ landValue: value })
      .where(eq(parcels.id, parcelId));
  }

  async updateLandValues(updates: { parcelId: string; value: number }[]): Promise<void> {
    for (const u of updates) {
      await this.db
        .update(parcels)
        .set({ landValue: u.value })
        .where(eq(parcels.id, u.parcelId));
    }
  }

  private rowToParcel(row: ParcelRow): Parcel {
    return {
      id: row.id,
      x: row.x,
      y: row.y,
      terrain: row.terrain as TerrainType,
      zoning: row.zoning as ZoningType | null,
      ownerId: row.ownerId,
      purchasePrice: row.purchasePrice,
      purchaseDate: row.purchaseDate,
      landValue: row.landValue,
    };
  }
}
