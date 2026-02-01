#!/usr/bin/env npx ts-node
/**
 * Database Migration Script
 * Run with: npx ts-node scripts/migrate.ts
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'moltcity.db');

console.log(`[Migration] Opening database at: ${DB_PATH}`);
const db = new Database(DB_PATH);

// Helper to check if column exists
function columnExists(table: string, column: string): boolean {
  const result = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  return result.some(row => row.name === column);
}

// Helper to check if table exists
function tableExists(table: string): boolean {
  const result = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
  return !!result;
}

console.log('[Migration] Starting migrations...\n');

// Migration 1: Add construction columns to buildings table
console.log('[Migration 1] Construction system columns...');
if (!columnExists('buildings', 'construction_progress')) {
  db.exec(`ALTER TABLE buildings ADD COLUMN construction_progress INTEGER NOT NULL DEFAULT 100`);
  console.log('  Added: construction_progress');
} else {
  console.log('  Skipped: construction_progress (already exists)');
}

if (!columnExists('buildings', 'construction_started_at')) {
  db.exec(`ALTER TABLE buildings ADD COLUMN construction_started_at INTEGER`);
  console.log('  Added: construction_started_at');
} else {
  console.log('  Skipped: construction_started_at (already exists)');
}

if (!columnExists('buildings', 'construction_time_ticks')) {
  db.exec(`ALTER TABLE buildings ADD COLUMN construction_time_ticks INTEGER NOT NULL DEFAULT 0`);
  console.log('  Added: construction_time_ticks');
} else {
  console.log('  Skipped: construction_time_ticks (already exists)');
}

// Migration 2: Create rental_units table
console.log('\n[Migration 2] Rental units table...');
if (!tableExists('rental_units')) {
  db.exec(`
    CREATE TABLE rental_units (
      id TEXT PRIMARY KEY,
      building_id TEXT NOT NULL REFERENCES buildings(id),
      floor_number INTEGER NOT NULL,
      unit_number INTEGER NOT NULL,
      unit_type TEXT NOT NULL DEFAULT 'residential',
      monthly_rent REAL NOT NULL,
      tenant_id TEXT REFERENCES agents(id),
      lease_start INTEGER,
      status TEXT NOT NULL DEFAULT 'vacant',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX idx_rental_units_building ON rental_units(building_id);
    CREATE INDEX idx_rental_units_tenant ON rental_units(tenant_id);
    CREATE INDEX idx_rental_units_status ON rental_units(status);
  `);
  console.log('  Created: rental_units table with indexes');
} else {
  console.log('  Skipped: rental_units (already exists)');
}

// Migration 3: Create rent_warnings table
console.log('\n[Migration 3] Rent warnings table...');
if (!tableExists('rent_warnings')) {
  db.exec(`
    CREATE TABLE rent_warnings (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL REFERENCES rental_units(id),
      tenant_id TEXT NOT NULL REFERENCES agents(id),
      amount_owed REAL NOT NULL,
      warning_date INTEGER NOT NULL,
      due_date INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX idx_rent_warnings_tenant ON rent_warnings(tenant_id);
    CREATE INDEX idx_rent_warnings_status ON rent_warnings(status);
  `);
  console.log('  Created: rent_warnings table with indexes');
} else {
  console.log('  Skipped: rent_warnings (already exists)');
}

// Migration 4: Create court_cases table
console.log('\n[Migration 4] Court cases table...');
if (!tableExists('court_cases')) {
  db.exec(`
    CREATE TABLE court_cases (
      id TEXT PRIMARY KEY,
      warning_id TEXT REFERENCES rent_warnings(id),
      defendant_id TEXT NOT NULL REFERENCES agents(id),
      plaintiff_id TEXT NOT NULL,
      case_type TEXT NOT NULL,
      amount REAL NOT NULL,
      hearing_date INTEGER,
      verdict TEXT,
      sentence TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX idx_court_cases_defendant ON court_cases(defendant_id);
    CREATE INDEX idx_court_cases_status ON court_cases(status);
  `);
  console.log('  Created: court_cases table with indexes');
} else {
  console.log('  Skipped: court_cases (already exists)');
}

// Migration 5: Create jail_inmates table
console.log('\n[Migration 5] Jail inmates table...');
if (!tableExists('jail_inmates')) {
  db.exec(`
    CREATE TABLE jail_inmates (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      case_id TEXT REFERENCES court_cases(id),
      check_in INTEGER NOT NULL,
      release_date INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'incarcerated'
    );
    CREATE INDEX idx_jail_inmates_agent ON jail_inmates(agent_id);
    CREATE INDEX idx_jail_inmates_status ON jail_inmates(status);
  `);
  console.log('  Created: jail_inmates table with indexes');
} else {
  console.log('  Skipped: jail_inmates (already exists)');
}

db.close();
console.log('\n[Migration] Complete!');
