// ============================================
// MOLTCITY - Justice Repository (Warnings, Cases, Inmates)
// ============================================

import { eq, and, lte, desc } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import {
  rentWarnings,
  courtCases,
  jailInmates,
  type RentWarningRow,
  type RentWarningInsert,
  type CourtCaseRow,
  type CourtCaseInsert,
  type JailInmateRow,
  type JailInmateInsert,
} from '../db/schema/rentals.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type {
  RentWarning,
  CourtCase,
  JailInmate,
  RentWarningStatus,
  CourtCaseStatus,
  CourtVerdict,
  CourtSentence,
  JailStatus,
} from '../models/types.js';

// Rent Warning Repository
export class RentWarningRepository extends BaseRepository<typeof rentWarnings, RentWarningRow, RentWarningInsert> {
  constructor(db: DrizzleDb) {
    super(db, rentWarnings);
  }

  async getWarning(id: string): Promise<RentWarning | null> {
    const result = await this.findById(id, rentWarnings.id);
    return result ? this.rowToWarning(result) : null;
  }

  async getWarningsForTenant(tenantId: string): Promise<RentWarning[]> {
    const results = await this.db
      .select()
      .from(rentWarnings)
      .where(eq(rentWarnings.tenantId, tenantId))
      .orderBy(desc(rentWarnings.createdAt));
    return results.map(row => this.rowToWarning(row));
  }

  async getPendingWarnings(): Promise<RentWarning[]> {
    const results = await this.db
      .select()
      .from(rentWarnings)
      .where(eq(rentWarnings.status, 'pending'));
    return results.map(row => this.rowToWarning(row));
  }

  async getWarningForUnit(unitId: string, status?: RentWarningStatus): Promise<RentWarning | null> {
    const conditions = [eq(rentWarnings.unitId, unitId)];
    if (status) {
      conditions.push(eq(rentWarnings.status, status));
    }
    const results = await this.db
      .select()
      .from(rentWarnings)
      .where(and(...conditions))
      .orderBy(desc(rentWarnings.createdAt))
      .limit(1);
    return results.length > 0 ? this.rowToWarning(results[0]) : null;
  }

  async createWarning(
    unitId: string,
    tenantId: string,
    amountOwed: number,
    currentTick: number,
    dueDateTick: number,
    cityId?: string
  ): Promise<RentWarning> {
    const id = this.generateId();
    await this.db.insert(rentWarnings).values({
      id,
      cityId: cityId || '',
      unitId,
      tenantId,
      amountOwed,
      warningDate: currentTick,
      dueDate: dueDateTick,
      status: 'pending',
      createdAt: this.now(),
    });
    return (await this.getWarning(id))!;
  }

  async updateStatus(id: string, status: RentWarningStatus): Promise<void> {
    await this.db
      .update(rentWarnings)
      .set({ status })
      .where(eq(rentWarnings.id, id));
  }

  private rowToWarning(row: RentWarningRow): RentWarning {
    return {
      id: row.id,
      unitId: row.unitId,
      tenantId: row.tenantId,
      amountOwed: row.amountOwed,
      warningDate: row.warningDate,
      dueDate: row.dueDate,
      status: row.status as RentWarningStatus,
      createdAt: row.createdAt,
    };
  }
}

// Court Case Repository
export class CourtCaseRepository extends BaseRepository<typeof courtCases, CourtCaseRow, CourtCaseInsert> {
  constructor(db: DrizzleDb) {
    super(db, courtCases);
  }

  async getCase(id: string): Promise<CourtCase | null> {
    const result = await this.findById(id, courtCases.id);
    return result ? this.rowToCase(result) : null;
  }

  async getCasesForDefendant(defendantId: string): Promise<CourtCase[]> {
    const results = await this.db
      .select()
      .from(courtCases)
      .where(eq(courtCases.defendantId, defendantId))
      .orderBy(desc(courtCases.createdAt));
    return results.map(row => this.rowToCase(row));
  }

  async getPendingCases(): Promise<CourtCase[]> {
    const results = await this.db
      .select()
      .from(courtCases)
      .where(eq(courtCases.status, 'pending'));
    return results.map(row => this.rowToCase(row));
  }

  async getInProgressCases(): Promise<CourtCase[]> {
    const results = await this.db
      .select()
      .from(courtCases)
      .where(eq(courtCases.status, 'in_progress'));
    return results.map(row => this.rowToCase(row));
  }

  async createCase(
    warningId: string | null,
    defendantId: string,
    plaintiffId: string,
    caseType: 'rent_nonpayment',
    amount: number,
    hearingDateTick: number,
    cityId?: string
  ): Promise<CourtCase> {
    const id = this.generateId();
    await this.db.insert(courtCases).values({
      id,
      cityId: cityId || '',
      warningId,
      defendantId,
      plaintiffId,
      caseType,
      amount,
      hearingDate: hearingDateTick,
      status: 'pending',
      createdAt: this.now(),
    });
    return (await this.getCase(id))!;
  }

  async updateStatus(id: string, status: CourtCaseStatus): Promise<void> {
    await this.db
      .update(courtCases)
      .set({ status })
      .where(eq(courtCases.id, id));
  }

  async setVerdict(id: string, verdict: CourtVerdict, sentence: CourtSentence | null): Promise<void> {
    await this.db
      .update(courtCases)
      .set({
        verdict,
        sentence,
        status: 'closed',
      })
      .where(eq(courtCases.id, id));
  }

  private rowToCase(row: CourtCaseRow): CourtCase {
    return {
      id: row.id,
      warningId: row.warningId,
      defendantId: row.defendantId,
      plaintiffId: row.plaintiffId,
      caseType: row.caseType as 'rent_nonpayment',
      amount: row.amount,
      hearingDate: row.hearingDate,
      verdict: row.verdict as CourtVerdict | null,
      sentence: row.sentence as CourtSentence | null,
      status: row.status as CourtCaseStatus,
      createdAt: row.createdAt,
    };
  }
}

// Jail Inmate Repository
export class JailInmateRepository extends BaseRepository<typeof jailInmates, JailInmateRow, JailInmateInsert> {
  constructor(db: DrizzleDb) {
    super(db, jailInmates);
  }

  async getInmate(id: string): Promise<JailInmate | null> {
    const result = await this.findById(id, jailInmates.id);
    return result ? this.rowToInmate(result) : null;
  }

  async getInmateByAgent(agentId: string): Promise<JailInmate | null> {
    const results = await this.db
      .select()
      .from(jailInmates)
      .where(and(eq(jailInmates.agentId, agentId), eq(jailInmates.status, 'incarcerated')))
      .limit(1);
    return results.length > 0 ? this.rowToInmate(results[0]) : null;
  }

  async getAllInmates(): Promise<JailInmate[]> {
    const results = await this.db
      .select()
      .from(jailInmates)
      .where(eq(jailInmates.status, 'incarcerated'));
    return results.map(row => this.rowToInmate(row));
  }

  async getInmatesForRelease(currentTick: number): Promise<JailInmate[]> {
    const results = await this.db
      .select()
      .from(jailInmates)
      .where(
        and(
          eq(jailInmates.status, 'incarcerated'),
          lte(jailInmates.releaseDate, currentTick)
        )
      );
    return results.map(row => this.rowToInmate(row));
  }

  async createInmate(
    agentId: string,
    caseId: string | null,
    currentTick: number,
    releaseDateTick: number,
    cityId?: string
  ): Promise<JailInmate> {
    const id = this.generateId();
    await this.db.insert(jailInmates).values({
      id,
      cityId: cityId || '',
      agentId,
      caseId,
      checkIn: currentTick,
      releaseDate: releaseDateTick,
      status: 'incarcerated',
    });
    return (await this.getInmate(id))!;
  }

  async releaseInmate(id: string): Promise<void> {
    await this.db
      .update(jailInmates)
      .set({ status: 'released' })
      .where(eq(jailInmates.id, id));
  }

  private rowToInmate(row: JailInmateRow): JailInmate {
    return {
      id: row.id,
      agentId: row.agentId,
      caseId: row.caseId,
      checkIn: row.checkIn,
      releaseDate: row.releaseDate,
      status: row.status as JailStatus,
    };
  }
}
