// ============================================
// MOLTCITY - Activity Schema (Activity Feed)
// ============================================

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// Activity types
export type ActivityType =
  | 'parcel_purchase'
  | 'building_created'
  | 'election_started'
  | 'candidate_registered'
  | 'vote_cast'
  | 'mayor_elected'
  | 'crime_reported'
  | 'crime_resolved'
  | 'fire_started'
  | 'fire_extinguished'
  | 'fire_spread'
  | 'building_destroyed'
  | 'construction_completed'
  | 'zone_evolved'
  | 'jail_update'
  | 'tax_collected';

// Activities
export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // ActivityType
  actorId: text('actor_id'), // agent or user who performed the action
  actorName: text('actor_name').notNull(),
  message: text('message').notNull(),
  metadata: text('metadata'), // JSON for extra data (coordinates, building type, etc.)
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  index('idx_activities_created_at').on(table.createdAt),
  index('idx_activities_type').on(table.type),
]);

// Type exports
export type ActivityRow = typeof activities.$inferSelect;
export type ActivityInsert = typeof activities.$inferInsert;
