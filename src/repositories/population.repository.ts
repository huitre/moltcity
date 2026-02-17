// ============================================
// MOLTCITY - Population Repository
// ============================================

import { eq, isNull, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { residents, type ResidentRow, type ResidentInsert } from '../db/schema/population.js';
import type { DrizzleDb } from '../db/drizzle.js';

export interface Resident {
  id: string;
  name: string;
  homeBuildingId: string | null;
  workBuildingId: string | null;
  salary: number;
  createdAt: number;
}

// Random name generation data
const FIRST_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery',
  'Peyton', 'Charlie', 'Skyler', 'Dakota', 'Sage', 'Phoenix', 'River', 'Blake',
  'Emerson', 'Finley', 'Harper', 'Hayden', 'Jamie', 'Jesse', 'Kai', 'Lane',
  'Max', 'Nico', 'Parker', 'Reese', 'Rory', 'Sam', 'Sawyer', 'Spencer'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor',
  'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris',
  'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen'
];

export class PopulationRepository extends BaseRepository<typeof residents, ResidentRow, ResidentInsert> {
  constructor(db: DrizzleDb) {
    super(db, residents);
  }

  generateRandomName(): string {
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    return `${firstName} ${lastName}`;
  }

  async createResident(homeBuildingId: string, name?: string, cityId?: string): Promise<Resident> {
    const id = this.generateId();
    const residentName = name || this.generateRandomName();

    await this.db.insert(residents).values({
      id,
      cityId: cityId || '',
      name: residentName,
      homeBuildingId,
      workBuildingId: null,
      salary: 0,
      createdAt: this.now(),
    });

    return (await this.getResident(id))!;
  }

  async getResident(id: string): Promise<Resident | null> {
    const result = await this.findById(id, residents.id);
    return result ? this.rowToResident(result) : null;
  }

  async getAllResidents(cityId?: string): Promise<Resident[]> {
    if (cityId) {
      const results = await this.db.select().from(residents).where(eq(residents.cityId, cityId));
      return results.map(row => this.rowToResident(row));
    }
    const results = await this.findAll();
    return results.map(row => this.rowToResident(row));
  }

  async getResidentsByHome(homeBuildingId: string): Promise<Resident[]> {
    const results = await this.db
      .select()
      .from(residents)
      .where(eq(residents.homeBuildingId, homeBuildingId));
    return results.map(row => this.rowToResident(row));
  }

  async getResidentsByWork(workBuildingId: string): Promise<Resident[]> {
    const results = await this.db
      .select()
      .from(residents)
      .where(eq(residents.workBuildingId, workBuildingId));
    return results.map(row => this.rowToResident(row));
  }

  async getUnemployedResidents(): Promise<Resident[]> {
    const results = await this.db
      .select()
      .from(residents)
      .where(isNull(residents.workBuildingId));
    return results.map(row => this.rowToResident(row));
  }

  async getEmployedResidents(): Promise<Resident[]> {
    const results = await this.db
      .select()
      .from(residents)
      .where(sql`${residents.workBuildingId} IS NOT NULL`);
    return results.map(row => this.rowToResident(row));
  }

  async getTotalPopulation(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(residents);
    return result[0]?.count || 0;
  }

  async getEmployedCount(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(residents)
      .where(sql`${residents.workBuildingId} IS NOT NULL`);
    return result[0]?.count || 0;
  }

  async assignJob(residentId: string, workBuildingId: string, salary: number): Promise<void> {
    await this.db
      .update(residents)
      .set({ workBuildingId, salary })
      .where(eq(residents.id, residentId));
  }

  async removeJob(residentId: string): Promise<void> {
    await this.db
      .update(residents)
      .set({ workBuildingId: null, salary: 0 })
      .where(eq(residents.id, residentId));
  }

  async deleteResident(id: string): Promise<boolean> {
    return this.deleteById(id, residents.id);
  }

  async deleteResidentsByHome(homeBuildingId: string): Promise<number> {
    const result = await this.db
      .delete(residents)
      .where(eq(residents.homeBuildingId, homeBuildingId))
      .returning();
    return result.length;
  }

  async removeWorkFromBuilding(workBuildingId: string): Promise<void> {
    await this.db
      .update(residents)
      .set({ workBuildingId: null, salary: 0 })
      .where(eq(residents.workBuildingId, workBuildingId));
  }

  private rowToResident(row: ResidentRow): Resident {
    return {
      id: row.id,
      name: row.name,
      homeBuildingId: row.homeBuildingId,
      workBuildingId: row.workBuildingId,
      salary: row.salary,
      createdAt: row.createdAt,
    };
  }
}
