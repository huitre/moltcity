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

  async getCity(cityId?: string): Promise<City | null> {
    let results;
    if (cityId) {
      results = await this.db.select().from(city).where(eq(city.id, cityId)).limit(1);
    } else {
      results = await this.db.select().from(city).limit(1);
    }
    if (results.length === 0) return null;
    return this.rowToCity(results[0]);
  }

  async getAllCities(): Promise<City[]> {
    const results = await this.db.select().from(city);
    return results.map(row => this.rowToCity(row));
  }

  async createCity(name: string, creatorUserId: string): Promise<City> {
    const id = this.generateId();
    await this.db.insert(city).values({
      id,
      name,
      createdBy: creatorUserId,
      mayorId: creatorUserId,
    });
    return (await this.getCity(id))!;
  }

  async updateTime(cityId: string, tick: number, hour: number, day: number, year: number): Promise<void> {
    await this.db.update(city).set({
      tick,
      hour,
      day,
      year,
    }).where(eq(city.id, cityId));
  }

  async updateTreasury(cityId: string, amount: number): Promise<void> {
    await this.db.update(city).set({
      treasury: amount,
    }).where(eq(city.id, cityId));
  }

  async updateMayor(cityId: string, mayorId: string | null): Promise<void> {
    await this.db.update(city).set({
      mayorId,
    }).where(eq(city.id, cityId));
  }

  async updateTaxRates(cityId: string, taxRateR: number, taxRateC: number, taxRateI: number): Promise<void> {
    await this.db.update(city).set({
      taxRateR,
      taxRateC,
      taxRateI,
    }).where(eq(city.id, cityId));
  }

  async updateOrdinances(cityId: string, ordinances: string[]): Promise<void> {
    await this.db.update(city).set({
      ordinances: JSON.stringify(ordinances),
    }).where(eq(city.id, cityId));
  }

  async updateBonds(cityId: string, bonds: Bond[]): Promise<void> {
    await this.db.update(city).set({
      bonds: JSON.stringify(bonds),
    }).where(eq(city.id, cityId));
  }

  async updateDepartmentFunding(cityId: string, funding: DepartmentFunding): Promise<void> {
    await this.db.update(city).set({
      departmentFunding: JSON.stringify(funding),
    }).where(eq(city.id, cityId));
  }

  async updateBudgetYtd(cityId: string, budgetYtd: BudgetYtd): Promise<void> {
    await this.db.update(city).set({
      budgetYtd: JSON.stringify(budgetYtd),
    }).where(eq(city.id, cityId));
  }

  async resetBudgetYtd(cityId: string): Promise<void> {
    const empty: BudgetYtd = {
      revenues: { propertyTaxR: 0, propertyTaxC: 0, propertyTaxI: 0, ordinances: 0 },
      expenses: { police: 0, fire: 0, health: 0, education: 0, transit: 0, bondInterest: 0 },
    };
    await this.updateBudgetYtd(cityId, empty);
  }

  async updateCreditRating(cityId: string, creditRating: string): Promise<void> {
    await this.db.update(city).set({
      creditRating,
    }).where(eq(city.id, cityId));
  }

  private rowToCity(row: CityRow): City {
    return {
      id: row.id,
      name: row.name,
      createdBy: row.createdBy,
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
        wasteCapacity: 0,
        wasteDemand: 0,
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
