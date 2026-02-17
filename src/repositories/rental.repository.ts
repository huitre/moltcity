// ============================================
// MOLTCITY - Rental Repository
// ============================================

import { eq, and, desc } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { rentalUnits, type RentalUnitRow, type RentalUnitInsert } from '../db/schema/rentals.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { RentalUnit, RentalUnitType, RentalUnitStatus } from '../models/types.js';

export class RentalUnitRepository extends BaseRepository<typeof rentalUnits, RentalUnitRow, RentalUnitInsert> {
  constructor(db: DrizzleDb) {
    super(db, rentalUnits);
  }

  async getRentalUnit(id: string): Promise<RentalUnit | null> {
    const result = await this.findById(id, rentalUnits.id);
    return result ? this.rowToRentalUnit(result) : null;
  }

  async getRentalUnitsForBuilding(buildingId: string): Promise<RentalUnit[]> {
    const results = await this.db
      .select()
      .from(rentalUnits)
      .where(eq(rentalUnits.buildingId, buildingId))
      .orderBy(rentalUnits.floorNumber, rentalUnits.unitNumber);
    return results.map(row => this.rowToRentalUnit(row));
  }

  async getAvailableUnits(unitType?: RentalUnitType): Promise<RentalUnit[]> {
    const conditions = [eq(rentalUnits.status, 'vacant')];
    if (unitType) {
      conditions.push(eq(rentalUnits.unitType, unitType));
    }
    const results = await this.db
      .select()
      .from(rentalUnits)
      .where(and(...conditions));
    return results.map(row => this.rowToRentalUnit(row));
  }

  async getUnitsByTenant(tenantId: string): Promise<RentalUnit[]> {
    const results = await this.db
      .select()
      .from(rentalUnits)
      .where(eq(rentalUnits.tenantId, tenantId));
    return results.map(row => this.rowToRentalUnit(row));
  }

  async getOccupiedUnits(): Promise<RentalUnit[]> {
    const results = await this.db
      .select()
      .from(rentalUnits)
      .where(eq(rentalUnits.status, 'occupied'));
    return results.map(row => this.rowToRentalUnit(row));
  }

  async createRentalUnit(
    buildingId: string,
    floorNumber: number,
    unitNumber: number,
    monthlyRent: number,
    unitType: RentalUnitType = 'residential',
    cityId?: string
  ): Promise<RentalUnit> {
    const id = this.generateId();
    await this.db.insert(rentalUnits).values({
      id,
      cityId: cityId || '',
      buildingId,
      floorNumber,
      unitNumber,
      unitType,
      monthlyRent,
      status: 'vacant',
      createdAt: this.now(),
    });
    return (await this.getRentalUnit(id))!;
  }

  async signLease(unitId: string, tenantId: string, currentTick: number): Promise<void> {
    await this.db
      .update(rentalUnits)
      .set({
        tenantId,
        leaseStart: currentTick,
        status: 'occupied',
      })
      .where(eq(rentalUnits.id, unitId));
  }

  async terminateLease(unitId: string): Promise<void> {
    await this.db
      .update(rentalUnits)
      .set({
        tenantId: null,
        leaseStart: null,
        status: 'vacant',
      })
      .where(eq(rentalUnits.id, unitId));
  }

  async deleteUnit(id: string): Promise<boolean> {
    return this.deleteById(id, rentalUnits.id);
  }

  async deleteUnitsForBuilding(buildingId: string): Promise<void> {
    await this.db
      .delete(rentalUnits)
      .where(eq(rentalUnits.buildingId, buildingId));
  }

  private rowToRentalUnit(row: RentalUnitRow): RentalUnit {
    return {
      id: row.id,
      buildingId: row.buildingId,
      floorNumber: row.floorNumber,
      unitNumber: row.unitNumber,
      unitType: row.unitType as RentalUnitType,
      monthlyRent: row.monthlyRent,
      tenantId: row.tenantId,
      leaseStart: row.leaseStart,
      status: row.status as RentalUnitStatus,
      createdAt: row.createdAt,
    };
  }
}
