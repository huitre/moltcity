// ============================================
// MOLTCITY - Infrastructure Repository (Power & Water)
// ============================================

import { eq } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import {
  powerLines,
  waterPipes,
  type PowerLineRow,
  type PowerLineInsert,
  type WaterPipeRow,
  type WaterPipeInsert,
} from '../db/schema/infrastructure.js';
import type { DrizzleDb } from '../db/drizzle.js';

export interface PowerLine {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  capacity: number;
  load: number;
}

export interface WaterPipe {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  capacity: number;
  flow: number;
}

export class PowerLineRepository extends BaseRepository<typeof powerLines, PowerLineRow, PowerLineInsert> {
  constructor(db: DrizzleDb) {
    super(db, powerLines);
  }

  async getAllPowerLines(cityId?: string): Promise<PowerLine[]> {
    if (!cityId) return [];
    const results = await this.db.select().from(powerLines).where(eq(powerLines.cityId, cityId));
    return results.map(row => this.rowToPowerLine(row));
  }

  async getPowerLine(id: string): Promise<PowerLine | null> {
    const result = await this.findById(id, powerLines.id);
    return result ? this.rowToPowerLine(result) : null;
  }

  async createPowerLine(fromX: number, fromY: number, toX: number, toY: number, capacity: number = 1000, cityId?: string): Promise<string> {
    const id = this.generateId();
    await this.db.insert(powerLines).values({
      id,
      cityId: cityId || '',
      fromX,
      fromY,
      toX,
      toY,
      capacity,
    });
    return id;
  }

  async deletePowerLine(id: string): Promise<boolean> {
    return this.deleteById(id, powerLines.id);
  }

  async updateLoad(id: string, load: number): Promise<void> {
    await this.db
      .update(powerLines)
      .set({ load })
      .where(eq(powerLines.id, id));
  }

  private rowToPowerLine(row: PowerLineRow): PowerLine {
    return {
      id: row.id,
      from: { x: row.fromX, y: row.fromY },
      to: { x: row.toX, y: row.toY },
      capacity: row.capacity,
      load: row.load,
    };
  }
}

export class WaterPipeRepository extends BaseRepository<typeof waterPipes, WaterPipeRow, WaterPipeInsert> {
  constructor(db: DrizzleDb) {
    super(db, waterPipes);
  }

  async getAllWaterPipes(cityId?: string): Promise<WaterPipe[]> {
    if (!cityId) return [];
    const results = await this.db.select().from(waterPipes).where(eq(waterPipes.cityId, cityId));
    return results.map(row => this.rowToWaterPipe(row));
  }

  async getWaterPipe(id: string): Promise<WaterPipe | null> {
    const result = await this.findById(id, waterPipes.id);
    return result ? this.rowToWaterPipe(result) : null;
  }

  async createWaterPipe(fromX: number, fromY: number, toX: number, toY: number, capacity: number = 100, cityId?: string): Promise<string> {
    const id = this.generateId();
    await this.db.insert(waterPipes).values({
      id,
      cityId: cityId || '',
      fromX,
      fromY,
      toX,
      toY,
      capacity,
    });
    return id;
  }

  async deleteWaterPipe(id: string): Promise<boolean> {
    return this.deleteById(id, waterPipes.id);
  }

  async updateFlow(id: string, flow: number): Promise<void> {
    await this.db
      .update(waterPipes)
      .set({ flow })
      .where(eq(waterPipes.id, id));
  }

  private rowToWaterPipe(row: WaterPipeRow): WaterPipe {
    return {
      id: row.id,
      from: { x: row.fromX, y: row.fromY },
      to: { x: row.toX, y: row.toY },
      capacity: row.capacity,
      flow: row.flow,
    };
  }
}
