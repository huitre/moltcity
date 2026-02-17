// ============================================
// MOLTCITY - Database Configuration
// ============================================

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import { env } from './env.js';
import * as schema from '../db/schema/index.js';
import { createDatabase } from '../models/database.js';

let db: ReturnType<typeof drizzle> | null = null;
let sqlite: Database.Database | null = null;
let tablesInitialized = false;

export function getDbPath(): string {
  return path.isAbsolute(env.DB_PATH)
    ? env.DB_PATH
    : path.join(process.cwd(), env.DB_PATH);
}

/**
 * Ensure legacy tables exist (CREATE TABLE IF NOT EXISTS).
 * Called once before Drizzle uses the database.
 */
function ensureTablesExist(): void {
  if (tablesInitialized) return;
  const legacyDb = createDatabase();
  legacyDb.close();
  tablesInitialized = true;
}

export function getSqliteConnection(): Database.Database {
  if (!sqlite) {
    ensureTablesExist();
    const dbPath = getDbPath();
    sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
  }
  return sqlite;
}

export function getDrizzleDb() {
  if (!db) {
    const sqlite = getSqliteConnection();
    db = drizzle(sqlite, { schema });
  }
  return db;
}

export function closeDatabaseConnection(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}

export type DrizzleDb = ReturnType<typeof getDrizzleDb>;
