// ============================================
// MOLTCITY - Vehicles Schema
// ============================================

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { agents } from './agents.js';

export const vehicles = sqliteTable('vehicles', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => agents.id),
  type: text('type').notNull(),
  positionX: real('position_x').notNull(),
  positionY: real('position_y').notNull(),
  destinationX: real('destination_x'),
  destinationY: real('destination_y'),
  path: text('path'), // JSON array of coordinates
  speed: real('speed').notNull().default(1),
  sprite: text('sprite'),
}, (table) => [
  index('idx_vehicles_position').on(table.positionX, table.positionY),
  index('idx_vehicles_owner').on(table.ownerId),
]);

export type VehicleRow = typeof vehicles.$inferSelect;
export type VehicleInsert = typeof vehicles.$inferInsert;
