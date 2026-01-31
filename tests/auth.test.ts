// ============================================
// MOLTCITY - Auth Service Tests
// ============================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DatabaseManager } from '../src/models/database.js';
import { AuthService } from '../src/services/auth.js';

const TEST_DB_PATH = path.join(process.cwd(), 'test-auth.db');

describe('AuthService', () => {
  let db: DatabaseManager;
  let auth: AuthService;

  beforeEach(() => {
    // Remove test database if exists
    [TEST_DB_PATH, TEST_DB_PATH + '-wal', TEST_DB_PATH + '-shm'].forEach(f => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });

    process.env.DB_PATH = TEST_DB_PATH;
    db = new DatabaseManager();
    auth = new AuthService(db);
  });

  afterEach(() => {
    db.close();
    [TEST_DB_PATH, TEST_DB_PATH + '-wal', TEST_DB_PATH + '-shm'].forEach(f => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  });

  describe('Registration', () => {
    it('should register a new user', async () => {
      const result = await auth.register('test@example.com', 'password123', 'Test User');

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.email).toBe('test@example.com');
      expect(result.user?.name).toBe('Test User');
      expect(result.token).toBeDefined();
    });

    it('should reject invalid email', async () => {
      const result = await auth.register('invalid-email', 'password123', 'Test User');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid email');
    });

    it('should reject short password', async () => {
      const result = await auth.register('test@example.com', 'short', 'Test User');

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least 8 characters');
    });

    it('should reject duplicate email', async () => {
      await auth.register('test@example.com', 'password123', 'Test User');
      const result = await auth.register('test@example.com', 'password456', 'Another User');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already registered');
    });

    it('should normalize email to lowercase', async () => {
      const result = await auth.register('Test@EXAMPLE.com', 'password123', 'Test User');

      expect(result.success).toBe(true);
      expect(result.user?.email).toBe('test@example.com');
    });
  });

  describe('Login', () => {
    beforeEach(async () => {
      await auth.register('test@example.com', 'password123', 'Test User');
    });

    it('should login with correct credentials', async () => {
      const result = await auth.login('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
    });

    it('should login with different case email', async () => {
      const result = await auth.login('TEST@example.COM', 'password123');

      expect(result.success).toBe(true);
    });

    it('should reject wrong password', async () => {
      const result = await auth.login('test@example.com', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid email or password');
    });

    it('should reject non-existent email', async () => {
      const result = await auth.login('nonexistent@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid email or password');
    });

    it('should update last login time', async () => {
      const loginResult = await auth.login('test@example.com', 'password123');
      const user = auth.getUser(loginResult.user!.id);

      expect(user?.lastLoginAt).toBeDefined();
      expect(user?.lastLoginAt).toBeGreaterThan(0);
    });
  });

  describe('Token Validation', () => {
    it('should validate a valid token', async () => {
      const registerResult = await auth.register('test@example.com', 'password123', 'Test User');
      const user = await auth.validateToken(registerResult.token!);

      expect(user).not.toBeNull();
      expect(user?.email).toBe('test@example.com');
    });

    it('should reject an invalid token', async () => {
      const user = await auth.validateToken('invalid-token');

      expect(user).toBeNull();
    });

    it('should reject a token after logout', async () => {
      const registerResult = await auth.register('test@example.com', 'password123', 'Test User');
      const token = registerResult.token!;

      // Verify token works before logout
      let user = await auth.validateToken(token);
      expect(user).not.toBeNull();

      // Logout
      auth.logout(token);

      // Verify token no longer works
      user = await auth.validateToken(token);
      expect(user).toBeNull();
    });
  });

  describe('Password Change', () => {
    let userId: string;

    beforeEach(async () => {
      const result = await auth.register('test@example.com', 'oldpassword', 'Test User');
      userId = result.user!.id;
    });

    it('should change password with correct old password', async () => {
      const result = await auth.changePassword(userId, 'oldpassword', 'newpassword123');

      expect(result.success).toBe(true);

      // Verify new password works
      const loginResult = await auth.login('test@example.com', 'newpassword123');
      expect(loginResult.success).toBe(true);
    });

    it('should reject change with wrong old password', async () => {
      const result = await auth.changePassword(userId, 'wrongpassword', 'newpassword123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('incorrect');
    });

    it('should reject short new password', async () => {
      const result = await auth.changePassword(userId, 'oldpassword', 'short');

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least 8 characters');
    });

    it('should invalidate all sessions after password change', async () => {
      const loginResult = await auth.login('test@example.com', 'oldpassword');
      const token = loginResult.token!;

      // Change password
      await auth.changePassword(userId, 'oldpassword', 'newpassword123');

      // Old token should no longer work
      const user = await auth.validateToken(token);
      expect(user).toBeNull();
    });
  });

  describe('Account Linking', () => {
    let userId: string;

    beforeEach(async () => {
      const result = await auth.register('test@example.com', 'password123', 'Test User');
      userId = result.user!.id;
    });

    it('should link Moltbook account', () => {
      const result = auth.linkMoltbookAccount(userId, 'moltbook-user-123');

      expect(result.success).toBe(true);
      expect(result.user?.moltbookId).toBe('moltbook-user-123');
    });

    it('should link wallet address', () => {
      const result = auth.linkWallet(userId, '0x1234567890abcdef1234567890abcdef12345678');

      expect(result.success).toBe(true);
      expect(result.user?.walletAddress).toBe('0x1234567890abcdef1234567890abcdef12345678');
    });

    it('should link agent', () => {
      db.city.initializeCity('TestCity', 10, 10);
      db.parcels.initializeGrid(10, 10);
      const agent = db.agents.createAgent('TestAgent', 0, 0);
      const result = auth.linkAgent(userId, agent.id);

      expect(result.success).toBe(true);
      expect(result.user?.agentId).toBe(agent.id);
    });

    it('should reject linking for non-existent user', () => {
      const result = auth.linkMoltbookAccount('non-existent-id', 'moltbook-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('User not found');
    });
  });

  describe('OAuth Config', () => {
    it('should return OAuth configuration', () => {
      const config = auth.getOAuthConfig();

      expect(config).toBeDefined();
      expect(typeof config.googleEnabled).toBe('boolean');
      expect(typeof config.googleClientId).toBe('string');
    });
  });

  describe('Logout', () => {
    it('should logout single session', async () => {
      const result = await auth.register('test@example.com', 'password123', 'Test User');
      const token = result.token!;

      auth.logout(token);

      const user = await auth.validateToken(token);
      expect(user).toBeNull();
    });

    it('should logout all sessions', async () => {
      const registerResult = await auth.register('test@example.com', 'password123', 'Test User');
      const userId = registerResult.user!.id;

      // Create multiple sessions
      const login1 = await auth.login('test@example.com', 'password123');
      const login2 = await auth.login('test@example.com', 'password123');

      // Logout all
      auth.logoutAll(userId);

      // All tokens should be invalid
      expect(await auth.validateToken(registerResult.token!)).toBeNull();
      expect(await auth.validateToken(login1.token!)).toBeNull();
      expect(await auth.validateToken(login2.token!)).toBeNull();
    });
  });
});
