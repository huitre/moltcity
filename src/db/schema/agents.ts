// ============================================
// MOLTCITY - Agents Schema
// ============================================

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { buildings } from './buildings.js';

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatar: text('avatar'),
  homeBuildingId: text('home_building_id').references(() => buildings.id),
  workBuildingId: text('work_building_id').references(() => buildings.id),
  currentX: real('current_x').notNull(),
  currentY: real('current_y').notNull(),
  destinationX: real('destination_x'),
  destinationY: real('destination_y'),
  path: text('path'), // JSON array of coordinates
  state: text('state').notNull().default('idle'),
  schedule: text('schedule'), // JSON object
  walletBalance: real('wallet_balance').notNull().default(0),
  walletCurrency: text('wallet_currency').notNull().default('MOLT'),
  moltbookId: text('moltbook_id'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_agents_location').on(table.currentX, table.currentY),
  index('idx_agents_moltbook').on(table.moltbookId),
]);

export type AgentRow = typeof agents.$inferSelect;
export type AgentInsert = typeof agents.$inferInsert;
