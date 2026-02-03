// ============================================
// MOLTCITY - Auth Service (Refactored)
// ============================================

import bcrypt from 'bcrypt';
import { UserRepository, type User } from '../repositories/user.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { signToken, blacklistToken } from '../plugins/auth.plugin.js';
import { ValidationError, UnauthorizedError, ConflictError, NotFoundError } from '../plugins/error-handler.plugin.js';
import { env } from '../config/env.js';
import type { DrizzleDb } from '../db/drizzle.js';

const SALT_ROUNDS = 12;

export interface AuthResult {
  user: User;
  token: string;
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

export class AuthService {
  private userRepo: UserRepository;
  private agentRepo: AgentRepository;

  constructor(db: DrizzleDb) {
    this.userRepo = new UserRepository(db);
    this.agentRepo = new AgentRepository(db);
  }

  async register(email: string, password: string, name: string): Promise<AuthResult> {
    // Check if user exists
    const existingUser = await this.userRepo.getUserByEmail(email);
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const user = await this.userRepo.createUser({
      email,
      name,
      passwordHash,
    });

    // Generate token
    const token = signToken({ userId: user.id, email: user.email, role: user.role });

    return { user, token };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.userRepo.getUserByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedError('Please use Google login for this account');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Update last login
    await this.userRepo.updateLastLogin(user.id);

    const token = signToken({ userId: user.id, email: user.email, role: user.role });

    return { user, token };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.getUser(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }

    if (!user.passwordHash) {
      throw new ValidationError('Cannot change password for OAuth accounts');
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.userRepo.updatePassword(userId, newHash);
  }

  async logout(token: string): Promise<void> {
    blacklistToken(token);
  }

  async getUser(userId: string): Promise<User | null> {
    return this.userRepo.getUser(userId);
  }

  // ==========================================
  // Google OAuth
  // ==========================================

  getGoogleAuthUrl(state?: string): string {
    if (!env.GOOGLE_CLIENT_ID) {
      throw new ValidationError('Google OAuth is not configured');
    }

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
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
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new ValidationError('Google OAuth is not configured');
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new UnauthorizedError('Failed to authenticate with Google');
    }

    const tokens = await tokenResponse.json();

    // Get user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new UnauthorizedError('Failed to get user info from Google');
    }

    const googleUser: GoogleUserInfo = await userInfoResponse.json();

    // Find or create user
    let user = await this.userRepo.getUserByGoogleId(googleUser.id);

    if (!user) {
      // Check if email exists
      user = await this.userRepo.getUserByEmail(googleUser.email);

      if (user) {
        // Link Google account to existing user
        await this.userRepo.linkGoogleAccount(user.id, googleUser.id);
        user = await this.userRepo.getUser(user.id);
      } else {
        // Create new user
        user = await this.userRepo.createUser({
          email: googleUser.email,
          name: googleUser.name,
          googleId: googleUser.id,
          avatarUrl: googleUser.picture,
        });
      }
    }

    const token = signToken({ userId: user!.id, email: user!.email, role: user!.role });

    return { user: user!, token };
  }

  // ==========================================
  // Account Linking
  // ==========================================

  async linkMoltbook(userId: string, moltbookId: string): Promise<User> {
    const user = await this.userRepo.getUser(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }

    await this.userRepo.linkMoltbook(userId, moltbookId);
    return (await this.userRepo.getUser(userId))!;
  }

  async linkWallet(userId: string, walletAddress: string): Promise<User> {
    const user = await this.userRepo.getUser(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }

    // Check if wallet is already linked to another user
    const existingUser = await this.userRepo.getUserByWallet(walletAddress);
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictError('Wallet is already linked to another account');
    }

    await this.userRepo.linkWallet(userId, walletAddress);
    return (await this.userRepo.getUser(userId))!;
  }

  async linkAgent(userId: string, agentId: string): Promise<User> {
    const user = await this.userRepo.getUser(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }

    const agent = await this.agentRepo.getAgent(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    await this.userRepo.linkAgent(userId, agentId);
    return (await this.userRepo.getUser(userId))!;
  }

  // ==========================================
  // Config
  // ==========================================

  getOAuthConfig() {
    return {
      googleEnabled: !!env.GOOGLE_CLIENT_ID,
      googleClientId: env.GOOGLE_CLIENT_ID || null,
    };
  }
}
