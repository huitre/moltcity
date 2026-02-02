// ============================================
// MOLTCITY - Rentals Schema (Units, Warnings, Cases, Inmates)
// ============================================

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { buildings } from './buildings.js';
import { agents } from './agents.js';

// Rental Units
export const rentalUnits = sqliteTable('rental_units', {
  id: text('id').primaryKey(),
  buildingId: text('building_id').notNull().references(() => buildings.id),
  floorNumber: integer('floor_number').notNull(),
  unitNumber: integer('unit_number').notNull(),
  unitType: text('unit_type').notNull().default('residential'),
  monthlyRent: real('monthly_rent').notNull(),
  tenantId: text('tenant_id').references(() => agents.id),
  leaseStart: integer('lease_start'),
  status: text('status').notNull().default('vacant'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_rental_units_building').on(table.buildingId),
  index('idx_rental_units_tenant').on(table.tenantId),
  index('idx_rental_units_status').on(table.status),
]);

// Rent Warnings
export const rentWarnings = sqliteTable('rent_warnings', {
  id: text('id').primaryKey(),
  unitId: text('unit_id').notNull().references(() => rentalUnits.id),
  tenantId: text('tenant_id').notNull().references(() => agents.id),
  amountOwed: real('amount_owed').notNull(),
  warningDate: integer('warning_date').notNull(),
  dueDate: integer('due_date').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_rent_warnings_tenant').on(table.tenantId),
  index('idx_rent_warnings_status').on(table.status),
]);

// Court Cases
export const courtCases = sqliteTable('court_cases', {
  id: text('id').primaryKey(),
  warningId: text('warning_id').references(() => rentWarnings.id),
  defendantId: text('defendant_id').notNull().references(() => agents.id),
  plaintiffId: text('plaintiff_id').notNull(),
  caseType: text('case_type').notNull(),
  amount: real('amount').notNull(),
  hearingDate: integer('hearing_date'),
  verdict: text('verdict'),
  sentence: text('sentence'),
  status: text('status').notNull().default('pending'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_court_cases_defendant').on(table.defendantId),
  index('idx_court_cases_status').on(table.status),
]);

// Jail Inmates
export const jailInmates = sqliteTable('jail_inmates', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  caseId: text('case_id').references(() => courtCases.id),
  checkIn: integer('check_in').notNull(),
  releaseDate: integer('release_date').notNull(),
  status: text('status').notNull().default('incarcerated'),
}, (table) => [
  index('idx_jail_inmates_agent').on(table.agentId),
  index('idx_jail_inmates_status').on(table.status),
]);

// Type exports
export type RentalUnitRow = typeof rentalUnits.$inferSelect;
export type RentalUnitInsert = typeof rentalUnits.$inferInsert;

export type RentWarningRow = typeof rentWarnings.$inferSelect;
export type RentWarningInsert = typeof rentWarnings.$inferInsert;

export type CourtCaseRow = typeof courtCases.$inferSelect;
export type CourtCaseInsert = typeof courtCases.$inferInsert;

export type JailInmateRow = typeof jailInmates.$inferSelect;
export type JailInmateInsert = typeof jailInmates.$inferInsert;
