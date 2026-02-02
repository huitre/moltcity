// ============================================
// MOLTCITY - City Schema
// ============================================

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const city = sqliteTable('city', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  gridWidth: integer('grid_width').notNull().default(100),
  gridHeight: integer('grid_height').notNull().default(100),
  tick: integer('tick').notNull().default(0),
  hour: integer('hour').notNull().default(8),
  day: integer('day').notNull().default(1),
  year: integer('year').notNull().default(1),
  mayorId: text('mayor_id'),
  treasury: real('treasury').notNull().default(0),
});

export type CityRow = typeof city.$inferSelect;
export type CityInsert = typeof city.$inferInsert;
