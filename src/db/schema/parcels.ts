// ============================================
// MOLTCITY - Parcels Schema
// ============================================

import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const parcels = sqliteTable('parcels', {
  id: text('id').primaryKey(),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  terrain: text('terrain').notNull().default('land'),
  zoning: text('zoning'),
  ownerId: text('owner_id'),
  purchasePrice: real('purchase_price'),
  purchaseDate: integer('purchase_date'),
}, (table) => [
  uniqueIndex('idx_parcels_coords_unique').on(table.x, table.y),
  index('idx_parcels_owner').on(table.ownerId),
]);

export type ParcelRow = typeof parcels.$inferSelect;
export type ParcelInsert = typeof parcels.$inferInsert;
