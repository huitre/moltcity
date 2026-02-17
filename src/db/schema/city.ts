// ============================================
// MOLTCITY - City Schema
// ============================================

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const city = sqliteTable('city', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdBy: text('created_by'), // references users.id (no FK to avoid circular import)
  tick: integer('tick').notNull().default(0),
  hour: integer('hour').notNull().default(8),
  day: integer('day').notNull().default(1),
  year: integer('year').notNull().default(1),
  mayorId: text('mayor_id'),
  treasury: real('treasury').notNull().default(10000),
  // Economy fields
  taxRateR: real('tax_rate_r').notNull().default(7),
  taxRateC: real('tax_rate_c').notNull().default(7),
  taxRateI: real('tax_rate_i').notNull().default(7),
  ordinances: text('ordinances').notNull().default('[]'),
  bonds: text('bonds').notNull().default('[]'),
  departmentFunding: text('department_funding').notNull().default('{"police":100,"fire":100,"health":100,"education":100,"transit":100}'),
  budgetYtd: text('budget_ytd').notNull().default('{"revenues":{"propertyTaxR":0,"propertyTaxC":0,"propertyTaxI":0,"ordinances":0},"expenses":{"police":0,"fire":0,"health":0,"education":0,"transit":0,"bondInterest":0}}'),
  creditRating: text('credit_rating').notNull().default('A'),
});

export type CityRow = typeof city.$inferSelect;
export type CityInsert = typeof city.$inferInsert;
