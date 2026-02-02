// ============================================
// MOLTCITY - Base Repository
// ============================================

import { eq, sql } from 'drizzle-orm';
import type { SQLiteTable, SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { DrizzleDb } from '../db/drizzle.js';

export abstract class BaseRepository<
  TTable extends SQLiteTable,
  TSelect = TTable['$inferSelect'],
  TInsert = TTable['$inferInsert']
> {
  constructor(
    protected db: DrizzleDb,
    protected table: TTable
  ) {}

  protected async findById(id: string, idColumn: SQLiteColumn): Promise<TSelect | undefined> {
    const results = await this.db
      .select()
      .from(this.table)
      .where(eq(idColumn, id))
      .limit(1);
    return results[0] as TSelect | undefined;
  }

  protected async findAll(): Promise<TSelect[]> {
    return this.db.select().from(this.table) as Promise<TSelect[]>;
  }

  protected async insert(data: TInsert): Promise<TSelect> {
    const results = await this.db
      .insert(this.table)
      .values(data as any)
      .returning();
    return results[0] as TSelect;
  }

  protected async updateById(
    id: string,
    idColumn: SQLiteColumn,
    data: Partial<TInsert>
  ): Promise<TSelect | undefined> {
    const results = await this.db
      .update(this.table)
      .set(data as any)
      .where(eq(idColumn, id))
      .returning();
    return results[0] as TSelect | undefined;
  }

  protected async deleteById(id: string, idColumn: SQLiteColumn): Promise<boolean> {
    const result = await this.db
      .delete(this.table)
      .where(eq(idColumn, id))
      .returning();
    return result.length > 0;
  }

  protected generateId(): string {
    return crypto.randomUUID();
  }

  protected now(): number {
    return Date.now();
  }
}
