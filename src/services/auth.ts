// ============================================
// MOLTCITY - Authentication Service
// ============================================

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { DatabaseManager } from '../models/database.js';

// ============================================
// Configuration
// ============================================

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES_IN = '7d';
const SALT_ROUNDS = 12;

// Google OAuth config
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

// ============================================
// Types
// ============================================

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  googleId: string | null;
  walletAddress: string | null;
  moltbookId: string | null;
  agentId: string | null;
  createdAt: number;
  lastLoginAt: number | null;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: number;
  createdAt: number;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token: string;
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}

// ============================================
// User Repository
// ============================================

export class UserRepository {
  constructor(private db: any) {
    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        name TEXT NOT NULL,
        avatar_url TEXT,
        email_verified INTEGER NOT NULL DEFAULT 0,
        google_id TEXT UNIQUE,
        wallet_address TEXT,
        moltbook_id TEXT,
        agent_id TEXT,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        token TEXT UNIQUE NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS verification_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        token TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  getUserById(id: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    return row ? this.rowToUser(row) : null;
  }

  getUserByEmail(email: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as any;
    return row ? this.rowToUser(row) : null;
  }

  getUserByGoogleId(googleId: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as any;
    return row ? this.rowToUser(row) : null;
  }

  getPasswordHash(userId: string): string | null {
    const row = this.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as any;
    return row?.password_hash || null;
  }

  createUser(data: {
    email: string;
    passwordHash?: string;
    name: string;
    avatarUrl?: string;
    googleId?: string;
    emailVerified?: boolean;
  }): User {
    const id = crypto.randomUUID();
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO users (id, email, password_hash, name, avatar_url, email_verified, google_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.email.toLowerCase(),
      data.passwordHash || null,
      data.name,
      data.avatarUrl || null,
      data.emailVerified ? 1 : 0,
      data.googleId || null,
      now
    );

    return this.getUserById(id)!;
  }

  updateUser(userId: string, updates: Partial<{
    name: string;
    avatarUrl: string;
    emailVerified: boolean;
    googleId: string;
    walletAddress: string;
    moltbookId: string;
    agentId: string;
    lastLoginAt: number;
  }>): void {
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.avatarUrl !== undefined) {
      setClauses.push('avatar_url = ?');
      values.push(updates.avatarUrl);
    }
    if (updates.emailVerified !== undefined) {
      setClauses.push('email_verified = ?');
      values.push(updates.emailVerified ? 1 : 0);
    }
    if (updates.googleId !== undefined) {
      setClauses.push('google_id = ?');
      values.push(updates.googleId);
    }
    if (updates.walletAddress !== undefined) {
      setClauses.push('wallet_address = ?');
      values.push(updates.walletAddress);
    }
    if (updates.moltbookId !== undefined) {
      setClauses.push('moltbook_id = ?');
      values.push(updates.moltbookId);
    }
    if (updates.agentId !== undefined) {
      setClauses.push('agent_id = ?');
      values.push(updates.agentId);
    }
    if (updates.lastLoginAt !== undefined) {
      setClauses.push('last_login_at = ?');
      values.push(updates.lastLoginAt);
    }

    if (setClauses.length > 0) {
      values.push(userId);
      this.db.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
    }
  }

  updatePassword(userId: string, passwordHash: string): void {
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  }

  private rowToUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatar_url,
      emailVerified: row.email_verified === 1,
      googleId: row.google_id,
      walletAddress: row.wallet_address,
      moltbookId: row.moltbook_id,
      agentId: row.agent_id,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    };
  }
}

// ============================================
// Session Repository
// ============================================

export class SessionRepository {
  constructor(private db: any) {}

  createSession(userId: string, token: string, expiresAt: number): Session {
    const id = crypto.randomUUID();
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO sessions (id, user_id, token, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, token, expiresAt, now);

    return { id, userId, token, expiresAt, createdAt: now };
  }

  getSessionByToken(token: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as any;
    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  deleteSession(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  deleteUserSessions(userId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  cleanExpiredSessions(): void {
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  }
}

// ============================================
// Auth Service
// ============================================

export class AuthService {
  private users: UserRepository;
  private sessions: SessionRepository;

  constructor(db: DatabaseManager) {
    const rawDb = db.getRawDb();
    this.users = new UserRepository(rawDb);
    this.sessions = new SessionRepository(rawDb);
  }

  // ==========================================
  // Email/Password Authentication
  // ==========================================

  async register(email: string, password: string, name: string): Promise<AuthResult> {
    // Validate email
    if (!this.isValidEmail(email)) {
      return { success: false, error: 'Invalid email address' };
    }

    // Validate password
    if (password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' };
    }

    // Check if user exists
    const existingUser = this.users.getUserByEmail(email);
    if (existingUser) {
      return { success: false, error: 'Email already registered' };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const user = this.users.createUser({
      email,
      passwordHash,
      name,
      emailVerified: false,
    });

    // Create session
    const token = this.generateToken(user);
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    this.sessions.createSession(user.id, token, expiresAt);

    // Update last login
    this.users.updateUser(user.id, { lastLoginAt: Date.now() });

    return { success: true, user, token };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    // Find user
    const user = this.users.getUserByEmail(email);
    if (!user) {
      return { success: false, error: 'Invalid email or password' };
    }

    // Get password hash
    const passwordHash = this.users.getPasswordHash(user.id);
    if (!passwordHash) {
      return { success: false, error: 'Please use Google login for this account' };
    }

    // Verify password
    const isValid = await bcrypt.compare(password, passwordHash);
    if (!isValid) {
      return { success: false, error: 'Invalid email or password' };
    }

    // Create session
    const token = this.generateToken(user);
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    this.sessions.createSession(user.id, token, expiresAt);

    // Update last login
    this.users.updateUser(user.id, { lastLoginAt: Date.now() });

    return { success: true, user, token };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<AuthResult> {
    const user = this.users.getUserById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const passwordHash = this.users.getPasswordHash(userId);
    if (!passwordHash) {
      return { success: false, error: 'Cannot change password for OAuth accounts' };
    }

    const isValid = await bcrypt.compare(oldPassword, passwordHash);
    if (!isValid) {
      return { success: false, error: 'Current password is incorrect' };
    }

    if (newPassword.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters' };
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    this.users.updatePassword(userId, newHash);

    // Invalidate all sessions
    this.sessions.deleteUserSessions(userId);

    return { success: true, user };
  }

  // ==========================================
  // Google OAuth
  // ==========================================

  getGoogleAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
    });

    if (state) {
      params.append('state', state);
    }

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleGoogleCallback(code: string): Promise<AuthResult> {
    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: GOOGLE_REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('Google token error:', error);
        return { success: false, error: 'Failed to authenticate with Google' };
      }

      const tokens: GoogleTokenResponse = await tokenResponse.json();

      // Get user info
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userInfoResponse.ok) {
        return { success: false, error: 'Failed to get user info from Google' };
      }

      const googleUser: GoogleUserInfo = await userInfoResponse.json();

      // Find or create user
      let user = this.users.getUserByGoogleId(googleUser.id);

      if (!user) {
        // Check if email exists
        user = this.users.getUserByEmail(googleUser.email);

        if (user) {
          // Link Google account to existing user
          this.users.updateUser(user.id, {
            googleId: googleUser.id,
            avatarUrl: googleUser.picture,
            emailVerified: googleUser.verified_email,
          });
          user = this.users.getUserById(user.id)!;
        } else {
          // Create new user
          user = this.users.createUser({
            email: googleUser.email,
            name: googleUser.name,
            avatarUrl: googleUser.picture,
            googleId: googleUser.id,
            emailVerified: googleUser.verified_email,
          });
        }
      } else {
        // Update user info from Google
        this.users.updateUser(user.id, {
          name: googleUser.name,
          avatarUrl: googleUser.picture,
          emailVerified: googleUser.verified_email,
        });
        user = this.users.getUserById(user.id)!;
      }

      // Create session
      const token = this.generateToken(user);
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      this.sessions.createSession(user.id, token, expiresAt);

      // Update last login
      this.users.updateUser(user.id, { lastLoginAt: Date.now() });

      return { success: true, user, token };
    } catch (error: any) {
      console.error('Google OAuth error:', error);
      return { success: false, error: 'Google authentication failed' };
    }
  }

  // ==========================================
  // Session Management
  // ==========================================

  async validateToken(token: string): Promise<User | null> {
    try {
      // Verify JWT
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

      // Check session exists
      const session = this.sessions.getSessionByToken(token);
      if (!session || session.expiresAt < Date.now()) {
        return null;
      }

      // Get user
      return this.users.getUserById(decoded.userId);
    } catch (error) {
      return null;
    }
  }

  logout(token: string): void {
    this.sessions.deleteSession(token);
  }

  logoutAll(userId: string): void {
    this.sessions.deleteUserSessions(userId);
  }

  // ==========================================
  // Moltbook Integration
  // ==========================================

  linkMoltbookAccount(userId: string, moltbookId: string): AuthResult {
    const user = this.users.getUserById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    this.users.updateUser(userId, { moltbookId });
    return { success: true, user: this.users.getUserById(userId)! };
  }

  linkWallet(userId: string, walletAddress: string): AuthResult {
    const user = this.users.getUserById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    this.users.updateUser(userId, { walletAddress });
    return { success: true, user: this.users.getUserById(userId)! };
  }

  linkAgent(userId: string, agentId: string): AuthResult {
    const user = this.users.getUserById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    this.users.updateUser(userId, { agentId });
    return { success: true, user: this.users.getUserById(userId)! };
  }

  // ==========================================
  // Helpers
  // ==========================================

  private generateToken(user: User): string {
    return jwt.sign(
      { userId: user.id, email: user.email, jti: crypto.randomUUID() },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  getUser(userId: string): User | null {
    return this.users.getUserById(userId);
  }

  // Get config for frontend (without secrets)
  getOAuthConfig() {
    return {
      googleEnabled: !!GOOGLE_CLIENT_ID,
      googleClientId: GOOGLE_CLIENT_ID,
    };
  }
}
