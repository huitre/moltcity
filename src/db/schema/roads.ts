// ============================================
// MOLTCITY - Roads Schema
// ============================================

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { parcels } from './parcels.js';

export const roads = sqliteTable('roads', {
  id: text('id').primaryKey(),
  parcelId: text('parcel_id').notNull().references(() => parcels.id),
  direction: text('direction').notNull(),
  lanes: integer('lanes').notNull().default(2),
  trafficLoad: real('traffic_load').notNull().default(0),
  speedLimit: integer('speed_limit').notNull().default(50),
}, (table) => [
  index('idx_roads_parcel').on(table.parcelId),
]);

export type RoadRow = typeof roads.$inferSelect;
export type RoadInsert = typeof roads.$inferInsert;
