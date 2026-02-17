// ============================================
// MOLTCITY - Parcels Schema
// ============================================

import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { city } from './city.js';

export const parcels = sqliteTable('parcels', {
  id: text('id').primaryKey(),
  cityId: text('city_id').references(() => city.id),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  terrain: text('terrain').notNull().default('land'),
  zoning: text('zoning'),
  ownerId: text('owner_id'),
  purchasePrice: real('purchase_price'),
  purchaseDate: integer('purchase_date'),
  landValue: real('land_value').notNull().default(50),
}, (table) => [
  uniqueIndex('idx_parcels_coords_city_unique').on(table.x, table.y, table.cityId),
  index('idx_parcels_owner').on(table.ownerId),
  index('idx_parcels_city').on(table.cityId),
]);

export type ParcelRow = typeof parcels.$inferSelect;
export type ParcelInsert = typeof parcels.$inferInsert;
