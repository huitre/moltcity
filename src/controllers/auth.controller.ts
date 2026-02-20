// ============================================
// MOLTCITY - Auth Controller
// ============================================

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';
import { AuthService } from '../services/auth.service.js';
import { CityRepository } from '../repositories/city.repository.js';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  linkWalletSchema,
  linkMoltbookSchema,
  linkAgentSchema,
} from '../schemas/auth.schema.js';

export const authController: FastifyPluginAsync = async (fastify) => {
  const authService = new AuthService(fastify.db);

  // Helper for authenticated routes
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    await fastify.authenticate(request, reply);
  };

  // Get OAuth config
  fastify.get('/api/auth/config', async () => {
    return authService.getOAuthConfig();
  });

  // Register
  fastify.post('/api/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);

    if (env.BETA_KEY && body.betaKey !== env.BETA_KEY) {
      reply.status(403);
      return { error: 'Invalid beta key' };
    }

    const result = await authService.register(body.email, body.password, body.name);
    reply.status(201);
    return result;
  });

  // Login
  fastify.post('/api/auth/login', async (request) => {
    const body = loginSchema.parse(request.body);
    return authService.login(body.email, body.password);
  });

  // Logout
  fastify.post('/api/auth/logout', {
    preHandler: authenticate,
  }, async (request) => {
    const token = request.headers.authorization?.substring(7) || '';
    await authService.logout(token);
    return { success: true };
  });

  // Get current user
  fastify.get('/api/auth/me', {
    preHandler: authenticate,
  }, async (request) => {
    const user = await authService.getUser(request.user!.userId);
    if (!user) return { user: null };

    // Ensure user has an agent (auto-create if needed)
    const agentInfo = await authService.ensureAgent(user.id);

    // Strip sensitive fields before returning
    const { passwordHash, ...safeUser } = user;

    // Include city treasury for admin or city mayor
    let treasury: number | undefined;
    const cityRepo = new CityRepository(fastify.db);
    const cityId = (request.query as Record<string, string>)?.cityId;
    const city = cityId ? await cityRepo.getCity(cityId) : null;
    if (city && (user.role === 'admin' || city.mayor === user.id)) {
      treasury = city.stats.treasury;
    }

    return {
      user: { ...safeUser, agentId: agentInfo.agentId },
      balance: agentInfo.balance,
      treasury,
    };
  });

  // Change password
  fastify.post('/api/auth/change-password', {
    preHandler: authenticate,
  }, async (request) => {
    const body = changePasswordSchema.parse(request.body);
    await authService.changePassword(
      request.user!.userId,
      body.currentPassword,
      body.newPassword
    );
    return { success: true };
  });

  // Google OAuth - Initiate
  fastify.get('/auth/google', async (request, reply) => {
    const state = (request.query as any).state;
    const url = authService.getGoogleAuthUrl(state);
    reply.redirect(url);
  });

  // Google OAuth - Callback
  fastify.get('/auth/google/callback', async (request) => {
    const { code } = request.query as { code: string };
    return authService.handleGoogleCallback(code);
  });

  // Link Moltbook account
  fastify.post('/api/auth/link/moltbook', {
    preHandler: authenticate,
  }, async (request) => {
    const body = linkMoltbookSchema.parse(request.body);
    const user = await authService.linkMoltbook(request.user!.userId, body.moltbookId);
    return { user };
  });

  // Link wallet
  fastify.post('/api/auth/link/wallet', {
    preHandler: authenticate,
  }, async (request) => {
    const body = linkWalletSchema.parse(request.body);
    const user = await authService.linkWallet(request.user!.userId, body.walletAddress);
    return { user };
  });

  // Link agent
  fastify.post('/api/auth/link/agent', {
    preHandler: authenticate,
  }, async (request) => {
    const body = linkAgentSchema.parse(request.body);
    const user = await authService.linkAgent(request.user!.userId, body.agentId);
    return { user };
  });
};
