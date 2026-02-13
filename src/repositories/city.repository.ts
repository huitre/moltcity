// ============================================
// MOLTCITY - City Repository
// ============================================

import { eq } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { city, type CityRow, type CityInsert } from '../db/schema/city.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { City, DepartmentFunding, BudgetYtd, Bond } from '../models/types.js';

export class CityRepository extends BaseRepository<typeof city, CityRow, CityInsert> {
  constructor(db: DrizzleDb) {
    super(db, city);
  }

  async getCity(): Promise<City | null> {
    const results = await this.db.select().from(city).limit(1);
    if (results.length === 0) return null;
    return this.rowToCity(results[0]);
  }

  async initializeCity(name: string, width: number, height: number): Promise<City> {
    const id = this.generateId();
    await this.db.insert(city).values({
      id,
      name,
      gridWidth: width,
      gridHeight: height,
    });
    return (await this.getCity())!;
  }

  async updateTime(tick: number, hour: number, day: number, year: number): Promise<void> {
    await this.db.update(city).set({
      tick,
      hour,
      day,
      year,
    });
  }

  async updateTreasury(amount: number): Promise<void> {
    await this.db.update(city).set({
      treasury: amount,
    });
  }

  private rowToCity(row: CityRow): City {
    return {
      id: row.id,
      name: row.name,
      gridWidth: row.gridWidth,
      gridHeight: row.gridHeight,
      time: {
        tick: row.tick,
        hour: row.hour,
        day: row.day,
        year: row.year,
        isDaylight: row.hour >= 6 && row.hour < 20,
      },
      stats: {
        population: 0, // Calculated separately
        totalBuildings: 0,
        totalRoads: 0,
        powerCapacity: 0,
        powerDemand: 0,
        waterCapacity: 0,
        waterDemand: 0,
        treasury: row.treasury,
      },
      mayor: row.mayorId,
      economy: {
        taxRateR: row.taxRateR,
        taxRateC: row.taxRateC,
        taxRateI: row.taxRateI,
        ordinances: this.parseJson<string[]>(row.ordinances, []),
        bonds: this.parseJson<Bond[]>(row.bonds, []),
        departmentFunding: this.parseJson<DepartmentFunding>(row.departmentFunding, { police: 100, fire: 100, health: 100, education: 100, transit: 100 }),
        budgetYtd: this.parseJson<BudgetYtd>(row.budgetYtd, { revenues: { propertyTaxR: 0, propertyTaxC: 0, propertyTaxI: 0, ordinances: 0 }, expenses: { police: 0, fire: 0, health: 0, education: 0, transit: 0, bondInterest: 0 } }),
        creditRating: row.creditRating,
      },
    };
  }

  private parseJson<T>(value: string, fallback: T): T {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
}
