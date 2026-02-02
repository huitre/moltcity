// ============================================
// MOLTCITY - CORS Plugin
// ============================================

import { FastifyPluginAsync } from 'fastify';
import cors from '@fastify/cors';
import { env, isDevelopment } from '../config/env.js';

export const corsPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(cors, {
    origin: isDevelopment()
      ? true // Allow all origins in development
      : [
          'https://moltcity.com',
          'https://www.moltcity.com',
          'https://moltcity.site',
          'https://www.moltcity.site',
          'https://api.moltcity.site',
          /\.moltcity\.com$/,
          /\.moltcity\.site$/,
        ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
};
