// ============================================
// MOLTCITY - Database Configuration
// ============================================

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import { env } from './env.js';
import * as schema from '../db/schema/index.js';

let db: ReturnType<typeof drizzle> | null = null;
let sqlite: Database.Database | null = null;

export function getDbPath(): string {
  return path.isAbsolute(env.DB_PATH)
    ? env.DB_PATH
    : path.join(process.cwd(), env.DB_PATH);
}

export function getSqliteConnection(): Database.Database {
  if (!sqlite) {
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
