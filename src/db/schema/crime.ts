// ============================================
// MOLTCITY - Crime & Public Safety Schema
// ============================================

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { agents } from './agents.js';
import { buildings } from './buildings.js';
import { parcels } from './parcels.js';

// === Crime Events ===
export const crimes = sqliteTable('crimes', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // theft, robbery, vandalism, arson
  parcelId: text('parcel_id').notNull().references(() => parcels.id),
  locationX: real('location_x').notNull(),
  locationY: real('location_y').notNull(),
  victimId: text('victim_id').references(() => agents.id),
  buildingId: text('building_id').references(() => buildings.id),
  damageAmount: integer('damage_amount').notNull().default(0),
  reportedAt: integer('reported_at').notNull(), // tick
  resolvedAt: integer('resolved_at'),
  respondingOfficerId: text('responding_officer_id'),
  status: text('status').notNull().default('active'), // active, responding, resolved, unsolved
}, (table) => [
  index('idx_crimes_status').on(table.status),
  index('idx_crimes_location').on(table.locationX, table.locationY),
  index('idx_crimes_parcel').on(table.parcelId),
  index('idx_crimes_reported').on(table.reportedAt),
]);

export type CrimeRow = typeof crimes.$inferSelect;
export type CrimeInsert = typeof crimes.$inferInsert;

// === Police Officers ===
export const policeOfficers = sqliteTable('police_officers', {
  id: text('id').primaryKey(),
  stationId: text('station_id').notNull().references(() => buildings.id),
  name: text('name').notNull(),
  currentX: real('current_x').notNull(),
  currentY: real('current_y').notNull(),
  status: text('status').notNull().default('available'), // available, patrolling, responding, arresting
  assignedCrimeId: text('assigned_crime_id').references(() => crimes.id),
  patrolRoute: text('patrol_route'), // JSON array of coordinates
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_officers_station').on(table.stationId),
  index('idx_officers_status').on(table.status),
  index('idx_officers_location').on(table.currentX, table.currentY),
]);

export type PoliceOfficerRow = typeof policeOfficers.$inferSelect;
export type PoliceOfficerInsert = typeof policeOfficers.$inferInsert;

// === Fires ===
export const fires = sqliteTable('fires', {
  id: text('id').primaryKey(),
  buildingId: text('building_id').notNull().references(() => buildings.id),
  parcelId: text('parcel_id').notNull().references(() => parcels.id),
  intensity: integer('intensity').notNull().default(1), // 1-5
  spreadChance: integer('spread_chance').notNull().default(20), // 0-100
  startedAt: integer('started_at').notNull(), // tick
  containedAt: integer('contained_at'),
  extinguishedAt: integer('extinguished_at'),
  status: text('status').notNull().default('burning'), // burning, contained, extinguished
  cause: text('cause').notNull().default('accident'), // arson, electrical, accident, spread
}, (table) => [
  index('idx_fires_status').on(table.status),
  index('idx_fires_building').on(table.buildingId),
  index('idx_fires_started').on(table.startedAt),
]);

export type FireRow = typeof fires.$inferSelect;
export type FireInsert = typeof fires.$inferInsert;

// === Firefighters ===
export const firefighters = sqliteTable('firefighters', {
  id: text('id').primaryKey(),
  stationId: text('station_id').notNull().references(() => buildings.id),
  name: text('name').notNull(),
  currentX: real('current_x').notNull(),
  currentY: real('current_y').notNull(),
  status: text('status').notNull().default('available'), // available, responding, fighting, returning
  assignedFireId: text('assigned_fire_id').references(() => fires.id),
  truckId: text('truck_id'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_firefighters_station').on(table.stationId),
  index('idx_firefighters_status').on(table.status),
]);

export type FirefighterRow = typeof firefighters.$inferSelect;
export type FirefighterInsert = typeof firefighters.$inferInsert;

// === Schools ===
export const schools = sqliteTable('schools', {
  id: text('id').primaryKey(),
  buildingId: text('building_id').notNull().references(() => buildings.id),
  schoolType: text('school_type').notNull(), // elementary, high_school, university
  capacity: integer('capacity').notNull(),
  enrolledCount: integer('enrolled_count').notNull().default(0),
  educationBonus: integer('education_bonus').notNull(), // +education per day
}, (table) => [
  index('idx_schools_building').on(table.buildingId),
  index('idx_schools_type').on(table.schoolType),
]);

export type SchoolRow = typeof schools.$inferSelect;
export type SchoolInsert = typeof schools.$inferInsert;

// === Garbage/Sanitation ===
export const garbageDepots = sqliteTable('garbage_depots', {
  id: text('id').primaryKey(),
  buildingId: text('building_id').notNull().references(() => buildings.id),
  truckCount: integer('truck_count').notNull().default(2),
  collectionRoutes: text('collection_routes'), // JSON array of coordinate arrays
}, (table) => [
  index('idx_garbage_building').on(table.buildingId),
]);

export type GarbageDepotRow = typeof garbageDepots.$inferSelect;
export type GarbageDepotInsert = typeof garbageDepots.$inferInsert;

// === Parcel sanitation level ===
export const parcelSanitation = sqliteTable('parcel_sanitation', {
  parcelId: text('parcel_id').primaryKey().references(() => parcels.id),
  garbageLevel: integer('garbage_level').notNull().default(0), // 0-100
  lastCollected: integer('last_collected'), // tick
}, (table) => [
  index('idx_sanitation_level').on(table.garbageLevel),
]);

export type ParcelSanitationRow = typeof parcelSanitation.$inferSelect;
export type ParcelSanitationInsert = typeof parcelSanitation.$inferInsert;

// === Life Events ===
export const lifeEvents = sqliteTable('life_events', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  type: text('type').notNull(),
  description: text('description').notNull(),
  effectAmount: integer('effect_amount').notNull().default(0),
  occurredAt: integer('occurred_at').notNull(), // tick
}, (table) => [
  index('idx_life_events_agent').on(table.agentId),
  index('idx_life_events_type').on(table.type),
  index('idx_life_events_time').on(table.occurredAt),
]);

export type LifeEventRow = typeof lifeEvents.$inferSelect;
export type LifeEventInsert = typeof lifeEvents.$inferInsert;
