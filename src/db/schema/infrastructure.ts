// ============================================
// MOLTCITY - Infrastructure Schema (Power & Water)
// ============================================

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { buildings } from './buildings.js';

// Power Plants
export const powerPlants = sqliteTable('power_plants', {
  id: text('id').primaryKey(),
  buildingId: text('building_id').notNull().references(() => buildings.id),
  capacity: integer('capacity').notNull(),
  currentOutput: integer('current_output').notNull().default(0),
  fuelType: text('fuel_type').notNull(),
});

// Power Lines
export const powerLines = sqliteTable('power_lines', {
  id: text('id').primaryKey(),
  fromX: integer('from_x').notNull(),
  fromY: integer('from_y').notNull(),
  toX: integer('to_x').notNull(),
  toY: integer('to_y').notNull(),
  capacity: integer('capacity').notNull(),
  load: integer('load').notNull().default(0),
});

// Water Pipes
export const waterPipes = sqliteTable('water_pipes', {
  id: text('id').primaryKey(),
  fromX: integer('from_x').notNull(),
  fromY: integer('from_y').notNull(),
  toX: integer('to_x').notNull(),
  toY: integer('to_y').notNull(),
  capacity: integer('capacity').notNull().default(100),
  flow: integer('flow').notNull().default(0),
});

// Type exports
export type PowerPlantRow = typeof powerPlants.$inferSelect;
export type PowerPlantInsert = typeof powerPlants.$inferInsert;

export type PowerLineRow = typeof powerLines.$inferSelect;
export type PowerLineInsert = typeof powerLines.$inferInsert;

export type WaterPipeRow = typeof waterPipes.$inferSelect;
export type WaterPipeInsert = typeof waterPipes.$inferInsert;
