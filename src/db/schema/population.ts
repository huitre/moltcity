// ============================================
// MOLTCITY - Population Schema
// ============================================

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { city } from './city.js';
import { buildings } from './buildings.js';

// Residents - lightweight NPCs tied to buildings
export const residents = sqliteTable('residents', {
  id: text('id').primaryKey(),
  cityId: text('city_id').notNull().references(() => city.id),
  name: text('name').notNull(),
  homeBuildingId: text('home_building_id').references(() => buildings.id),
  workBuildingId: text('work_building_id'),
  salary: real('salary').notNull().default(0),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_residents_home').on(table.homeBuildingId),
  index('idx_residents_work').on(table.workBuildingId),
  index('idx_residents_city').on(table.cityId),
]);

export type ResidentRow = typeof residents.$inferSelect;
export type ResidentInsert = typeof residents.$inferInsert;
