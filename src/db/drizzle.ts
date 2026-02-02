// ============================================
// MOLTCITY - Drizzle Instance
// ============================================

import { getDrizzleDb, closeDatabaseConnection, getSqliteConnection } from '../config/database.js';
import type { DrizzleDb } from '../config/database.js';

export { getDrizzleDb, closeDatabaseConnection, getSqliteConnection };
export type { DrizzleDb };

// Re-export schema for convenience
export * as schema from './schema/index.js';
