// ============================================
// MOLTCITY - Domain Types (Re-export from models)
// ============================================

// Re-export all types from models for backwards compatibility
export * from '../models/types.js';

// Additional types for the new architecture
export type { DrizzleDb } from '../db/drizzle.js';
export type { JwtPayload } from '../plugins/auth.plugin.js';
export type { User } from '../repositories/user.repository.js';
export type { PowerLine, WaterPipe } from '../repositories/infrastructure.repository.js';
