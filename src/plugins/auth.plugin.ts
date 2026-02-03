// ============================================
// MOLTCITY - Auth Plugin
// ============================================

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from './error-handler.plugin.js';

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'user' | 'admin' | 'mayor';
  iat?: number;
  exp?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Token blacklist - in production, use Redis
const tokenBlacklist = new Set<string>();

export function blacklistToken(token: string): void {
  tokenBlacklist.add(token);
}

export function isTokenBlacklisted(token: string): boolean {
  return tokenBlacklist.has(token);
}

export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as string,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  if (isTokenBlacklisted(token)) {
    throw new UnauthorizedError('Token has been revoked');
  }
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

const authPluginImpl: FastifyPluginAsync = async (fastify) => {
  // Require authentication
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);

    try {
      const payload = verifyToken(token);
      request.user = payload;
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        throw err;
      }
      throw new UnauthorizedError('Invalid or expired token');
    }
  });

  // Optional authentication - doesn't fail if no token
  fastify.decorate('optionalAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return;
    }

    const token = authHeader.substring(7);

    try {
      const payload = verifyToken(token);
      request.user = payload;
    } catch {
      // Silently ignore invalid tokens for optional auth
    }
  });
};

// Wrap with fastify-plugin to share decorators across encapsulation boundaries
export const authPlugin = fp(authPluginImpl, {
  name: 'moltcity-auth',
});
