// ============================================
// MOLTCITY - City Context Helper
// ============================================

import type { FastifyRequest } from 'fastify';
import { ValidationError } from '../plugins/error-handler.plugin.js';

/**
 * Extract cityId from request.
 * GET: query parameter ?cityId=xxx
 * POST/PUT/DELETE: body field cityId
 */
export function extractCityId(request: FastifyRequest): string {
  const method = request.method;
  let cityId: string | undefined;

  if (method === 'GET' || method === 'HEAD') {
    cityId = (request.query as Record<string, string>)?.cityId;
  } else {
    cityId = (request.body as Record<string, string>)?.cityId;
    // Fallback to query param for POST/PUT too
    if (!cityId) {
      cityId = (request.query as Record<string, string>)?.cityId;
    }
  }

  if (!cityId) {
    throw new ValidationError('cityId is required');
  }

  return cityId;
}

/**
 * Extract optional cityId from request (returns undefined if not present).
 */
export function extractOptionalCityId(request: FastifyRequest): string | undefined {
  const method = request.method;

  if (method === 'GET' || method === 'HEAD') {
    return (request.query as Record<string, string>)?.cityId;
  } else {
    return (request.body as Record<string, string>)?.cityId ||
      (request.query as Record<string, string>)?.cityId;
  }
}

/**
 * Check if userId is mayor of the given city.
 */
export function isMayorOfCity(cityMayorId: string | null, userId: string): boolean {
  return cityMayorId !== null && cityMayorId === userId;
}
