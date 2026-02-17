// ============================================
// MOLTCITY - Auth Schema (Users, Sessions)
// ============================================

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { agents } from './agents.js';

// Users
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  emailVerified: integer('email_verified').notNull().default(0),
  googleId: text('google_id').unique(),
  walletAddress: text('wallet_address'),
  moltbookId: text('moltbook_id'),
  agentId: text('agent_id').references(() => agents.id),
  role: text('role').notNull().default('user'), // 'user' | 'admin'
  createdAt: integer('created_at').notNull(),
  lastLoginAt: integer('last_login_at'),
}, (table) => [
  index('idx_users_email').on(table.email),
  index('idx_users_google_id').on(table.googleId),
]);

// Sessions (for token blacklisting)
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  token: text('token').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
  revokedAt: integer('revoked_at'),
}, (table) => [
  index('idx_sessions_user').on(table.userId),
  index('idx_sessions_token').on(table.token),
]);

// Token blacklist
export const tokenBlacklist = sqliteTable('token_blacklist', {
  token: text('token').primaryKey(),
  blacklistedAt: integer('blacklisted_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, (table) => [
  index('idx_blacklist_expires').on(table.expiresAt),
]);

// City events log
export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  timestamp: integer('timestamp').notNull(),
  data: text('data'), // JSON
}, (table) => [
  index('idx_events_timestamp').on(table.timestamp),
  index('idx_events_type').on(table.type),
]);

// Type exports
export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;

export type SessionRow = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;

export type TokenBlacklistRow = typeof tokenBlacklist.$inferSelect;
export type TokenBlacklistInsert = typeof tokenBlacklist.$inferInsert;

export type EventRow = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;
