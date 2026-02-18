// ============================================
// MOLTCITY - Fastify App Setup
// ============================================

import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import path from 'path';
import { env, isDevelopment } from './config/env.js';
import { getDrizzleDb, type DrizzleDb } from './db/drizzle.js';
import { corsPlugin, websocketPlugin, errorHandlerPlugin, authPlugin, simulationPlugin } from './plugins/index.js';
import { registerControllers } from './controllers/index.js';
import type { SimulationEngine } from './simulation/engine.js';
import type { LegacyDatabaseManagerAdapter } from './simulation/engine.adapter.js';

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    db: DrizzleDb;
    simulationEngine: SimulationEngine;
    legacyDb: LegacyDatabaseManagerAdapter;
  }
}

export interface AppOptions {
  logger?: boolean;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: options.logger ?? isDevelopment()
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }
      : true,
  });

  // Decorate with database
  const db = getDrizzleDb();
  fastify.decorate('db', db);

  // Register plugins
  await fastify.register(errorHandlerPlugin);
  await fastify.register(corsPlugin);
  await fastify.register(authPlugin);
  await fastify.register(websocketPlugin);

  // Register simulation engine (uses websocket for broadcasts)
  await fastify.register(simulationPlugin, { autoStart: true });

  // Multipart for file uploads
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 1024 * 1024, // 1MB max
    },
  });

  // Static file serving for sprites
  await fastify.register(fastifyStatic, {
    root: path.resolve(process.cwd(), env.SPRITES_DIR),
    prefix: '/sprites/',
    decorateReply: false,
  });

  // Static file serving for client assets (decorateReply enables sendFile)
  await fastify.register(fastifyStatic, {
    root: path.resolve(process.cwd(), 'client'),
    prefix: '/client/',
  });

  // Also serve client JS files at /js/ for cleaner imports
  await fastify.register(fastifyStatic, {
    root: path.resolve(process.cwd(), 'client/js'),
    prefix: '/js/',
    decorateReply: false,
  });

  // Static file serving for city screenshots
  await fastify.register(fastifyStatic, {
    root: path.resolve(process.cwd(), 'client/screenshots'),
    prefix: '/screenshots/',
    decorateReply: false,
  });

  // Serve main pages
  fastify.get('/', async (request, reply) => {
    // Landing page for discovery
    return reply.sendFile('landing.html', path.resolve(process.cwd(), 'client'));
  });

  fastify.get('/app', async (request, reply) => {
    // Main game client (requires auth via JS)
    return reply.sendFile('index.html', path.resolve(process.cwd(), 'client'));
  });

  fastify.get('/game', async (request, reply) => {
    // Alias for /app
    return reply.sendFile('index.html', path.resolve(process.cwd(), 'client'));
  });

  fastify.get('/spectate', async (request, reply) => {
    // Spectator mode - view the city without login
    return reply.sendFile('index.html', path.resolve(process.cwd(), 'client'));
  });

  fastify.get('/login', async (request, reply) => {
    return reply.sendFile('login.html', path.resolve(process.cwd(), 'client'));
  });

  fastify.get('/skill.md', async (request, reply) => {
    return reply.sendFile('skill.md', path.resolve(process.cwd(), 'client'));
  });

  fastify.get('/docs', async (request, reply) => {
    // Alias for API docs
    return reply.sendFile('skill.md', path.resolve(process.cwd(), 'client'));
  });

  // SEO files
  fastify.get('/robots.txt', async (request, reply) => {
    reply.type('text/plain');
    return reply.sendFile('robots.txt', path.resolve(process.cwd(), 'client'));
  });

  fastify.get('/sitemap.xml', async (request, reply) => {
    reply.type('application/xml');
    return reply.sendFile('sitemap.xml', path.resolve(process.cwd(), 'client'));
  });

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // API version info
  fastify.get('/api', async () => {
    return {
      name: 'MoltCity API',
      version: '2.0.0',
      framework: 'Fastify',
    };
  });

  // Register all API controllers
  await registerControllers(fastify);

  return fastify;
}

export async function startApp(): Promise<FastifyInstance> {
  const app = await buildApp();

  try {
    const address = await app.listen({
      host: env.HOST,
      port: env.PORT,
    });
    app.log.info(`🏙️  MoltCity Fastify server running at ${address}`);
    return app;
  } catch (err) {
    app.log.error(err);
    throw err;
  }
}
