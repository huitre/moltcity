// ============================================
// MOLTCITY - Buildings Schema
// ============================================

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { city } from './city.js';
import { parcels } from './parcels.js';

export const buildings = sqliteTable('buildings', {
  id: text('id').primaryKey(),
  cityId: text('city_id').notNull().references(() => city.id),
  parcelId: text('parcel_id').notNull().references(() => parcels.id),
  type: text('type').notNull(),
  name: text('name').notNull(),
  sprite: text('sprite'),
  width: integer('width').notNull().default(1),
  height: integer('height').notNull().default(1),
  floors: integer('floors').notNull().default(1),
  powerRequired: integer('power_required').notNull().default(0),
  waterRequired: integer('water_required').notNull().default(0),
  powered: integer('powered', { mode: 'boolean' }).notNull().default(false),
  hasWater: integer('has_water', { mode: 'boolean' }).notNull().default(false),
  hasWaste: integer('has_waste', { mode: 'boolean' }).notNull().default(false),
  operational: integer('operational', { mode: 'boolean' }).notNull().default(false),
  builtAt: integer('built_at').notNull(),
  ownerId: text('owner_id').notNull(),
  constructionProgress: integer('construction_progress').notNull().default(100),
  constructionStartedAt: integer('construction_started_at'),
  constructionTimeTicks: integer('construction_time_ticks').notNull().default(0),
  density: integer('density').notNull().default(1),
  garbageLevel: integer('garbage_level').notNull().default(0),
}, (table) => [
  index('idx_buildings_parcel').on(table.parcelId),
  index('idx_buildings_owner').on(table.ownerId),
  index('idx_buildings_city').on(table.cityId),
]);

export type BuildingRow = typeof buildings.$inferSelect;
export type BuildingInsert = typeof buildings.$inferInsert;
