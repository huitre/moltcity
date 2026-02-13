// ============================================
// MOLTCITY - Parcel Repository
// ============================================

import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { parcels, type ParcelRow, type ParcelInsert } from '../db/schema/parcels.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { Parcel, TerrainType, ZoningType } from '../models/types.js';

export class ParcelRepository extends BaseRepository<typeof parcels, ParcelRow, ParcelInsert> {
  constructor(db: DrizzleDb) {
    super(db, parcels);
  }

  async getParcel(x: number, y: number): Promise<Parcel | null> {
    const results = await this.db
      .select()
      .from(parcels)
      .where(and(eq(parcels.x, x), eq(parcels.y, y)))
      .limit(1);
    return results.length > 0 ? this.rowToParcel(results[0]) : null;
  }

  async getParcelById(id: string): Promise<Parcel | null> {
    const result = await this.findById(id, parcels.id);
    return result ? this.rowToParcel(result) : null;
  }

  async getAllParcels(): Promise<Parcel[]> {
    const results = await this.findAll();
    return results.map(row => this.rowToParcel(row));
  }

  async getParcelsByOwner(ownerId: string): Promise<Parcel[]> {
    const results = await this.db
      .select()
      .from(parcels)
      .where(eq(parcels.ownerId, ownerId));
    return results.map(row => this.rowToParcel(row));
  }

  async getParcelsInRange(minX: number, minY: number, maxX: number, maxY: number): Promise<Parcel[]> {
    const results = await this.db
      .select()
      .from(parcels)
      .where(
        and(
          gte(parcels.x, minX),
          lte(parcels.x, maxX),
          gte(parcels.y, minY),
          lte(parcels.y, maxY)
        )
      );
    return results.map(row => this.rowToParcel(row));
  }

  async createParcel(x: number, y: number, terrain: TerrainType = 'land'): Promise<Parcel> {
    const id = this.generateId();
    await this.db.insert(parcels).values({
      id,
      x,
      y,
      terrain,
    });
    return (await this.getParcel(x, y))!;
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

  async setZoning(parcelId: string, zoning: ZoningType): Promise<void> {
    await this.db
      .update(parcels)
      .set({ zoning })
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

  async initializeGrid(width: number, height: number): Promise<void> {
    // Use transaction for batch insert
    const values: ParcelInsert[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        values.push({
          id: `parcel_${x}_${y}`,
          x,
          y,
          terrain: 'land',
        });
      }
    }

    // Insert in batches to avoid SQLite limits
    const BATCH_SIZE = 500;
    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const batch = values.slice(i, i + BATCH_SIZE);
      await this.db.insert(parcels).values(batch).onConflictDoNothing();
    }
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
