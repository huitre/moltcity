// ============================================
// MOLTCITY - User Repository
// ============================================

import { eq } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { users, tokenBlacklist, type UserRow, type UserInsert } from '../db/schema/auth.js';
import type { DrizzleDb } from '../db/drizzle.js';

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  googleId: string | null;
  walletAddress: string | null;
  agentId: string | null;
  moltbookId: string | null;
  role: UserRole;
  createdAt: number;
  lastLoginAt: number | null;
}

export class UserRepository extends BaseRepository<typeof users, UserRow, UserInsert> {
  constructor(db: DrizzleDb) {
    super(db, users);
  }

  async getUser(id: string): Promise<User | null> {
    const result = await this.findById(id, users.id);
    return result ? this.rowToUser(result) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const results = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    return results.length > 0 ? this.rowToUser(results[0]) : null;
  }

  async getUserByGoogleId(googleId: string): Promise<User | null> {
    const results = await this.db
      .select()
      .from(users)
      .where(eq(users.googleId, googleId))
      .limit(1);
    return results.length > 0 ? this.rowToUser(results[0]) : null;
  }

  async getUserByWallet(walletAddress: string): Promise<User | null> {
    const results = await this.db
      .select()
      .from(users)
      .where(eq(users.walletAddress, walletAddress.toLowerCase()))
      .limit(1);
    return results.length > 0 ? this.rowToUser(results[0]) : null;
  }

  async createUser(data: {
    email: string;
    name: string;
    passwordHash?: string;
    googleId?: string;
    avatarUrl?: string;
  }): Promise<User> {
    const id = this.generateId();
    const now = this.now();
    await this.db.insert(users).values({
      id,
      email: data.email.toLowerCase(),
      name: data.name,
      passwordHash: data.passwordHash || null,
      googleId: data.googleId || null,
      avatarUrl: data.avatarUrl || null,
      emailVerified: 0,
      createdAt: now,
      lastLoginAt: now,
    });
    return (await this.getUser(id))!;
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ lastLoginAt: this.now() })
      .where(eq(users.id, userId));
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId));
  }

  async linkGoogleAccount(userId: string, googleId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ googleId })
      .where(eq(users.id, userId));
  }

  async linkWallet(userId: string, walletAddress: string): Promise<void> {
    await this.db
      .update(users)
      .set({ walletAddress: walletAddress.toLowerCase() })
      .where(eq(users.id, userId));
  }

  async linkAgent(userId: string, agentId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ agentId })
      .where(eq(users.id, userId));
  }

  async linkMoltbook(userId: string, moltbookId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ moltbookId })
      .where(eq(users.id, userId));
  }

  async updateRole(userId: string, newRole: UserRole): Promise<void> {
    await this.db
      .update(users)
      .set({ role: newRole })
      .where(eq(users.id, userId));
  }

  async getUserByRole(targetRole: UserRole): Promise<User | null> {
    const results = await this.db
      .select()
      .from(users)
      .where(eq(users.role, targetRole))
      .limit(1);
    return results.length > 0 ? this.rowToUser(results[0]) : null;
  }

  // Token blacklist methods
  async blacklistToken(token: string, expiresAt: number): Promise<void> {
    await this.db.insert(tokenBlacklist).values({
      token,
      blacklistedAt: this.now(),
      expiresAt,
    }).onConflictDoNothing();
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const results = await this.db
      .select()
      .from(tokenBlacklist)
      .where(eq(tokenBlacklist.token, token))
      .limit(1);
    return results.length > 0;
  }

  async cleanupExpiredTokens(): Promise<void> {
    const now = this.now();
    await this.db
      .delete(tokenBlacklist)
      .where(eq(tokenBlacklist.expiresAt, now));
  }

  private rowToUser(row: UserRow): User {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      name: row.name,
      avatarUrl: row.avatarUrl,
      emailVerified: row.emailVerified === 1,
      googleId: row.googleId,
      walletAddress: row.walletAddress,
      agentId: row.agentId,
      moltbookId: row.moltbookId,
      role: (row.role as UserRole) || 'user',
      createdAt: row.createdAt,
      lastLoginAt: row.lastLoginAt,
    };
  }
}
