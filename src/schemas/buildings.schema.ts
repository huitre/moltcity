// ============================================
// MOLTCITY - Buildings Schemas
// ============================================

import { z } from 'zod';
import { buildingTypeSchema } from './common.schema.js';

// Create building schema
export const createBuildingSchema = z.object({
  agentId: z.string().optional(), // Owner agent - optional if using x,y with parcel owner
  moltbookId: z.string().optional(), // Alternative owner identifier
  parcelId: z.string().optional(), // Target parcel
  x: z.number().int().min(0).optional(),
  y: z.number().int().min(0).optional(),
  type: buildingTypeSchema,
  name: z.string().min(1).max(100),
  sprite: z.string().optional(),
  floors: z.number().int().min(1).max(10).default(1),
  createAgent: z.boolean().optional(), // Auto-create agent if missing
  agentName: z.string().min(1).max(100).optional(), // Name for auto-created agent
  // isAdmin is set by server based on authenticated user, not from request body
}).refine(
  data => data.parcelId || (data.x !== undefined && data.y !== undefined),
  { message: 'Either parcelId or x,y coordinates are required' }
);

// Update building schema
export const updateBuildingSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sprite: z.string().optional(),
  type: buildingTypeSchema.optional(),
});

// Building ID param
export const buildingIdParamSchema = z.object({
  id: z.string(),
});

// Building quote query
export const buildingQuoteQuerySchema = z.object({
  type: buildingTypeSchema,
  floors: z.coerce.number().int().min(1).max(10).default(1),
});

// Demolish building schema (optional reason)
export const demolishBuildingSchema = z.object({
  reason: z.string().max(500).optional(),
});

// Type exports
export type CreateBuildingInput = z.infer<typeof createBuildingSchema>;
export type UpdateBuildingInput = z.infer<typeof updateBuildingSchema>;
export type BuildingIdParams = z.infer<typeof buildingIdParamSchema>;
export type BuildingQuoteQuery = z.infer<typeof buildingQuoteQuerySchema>;
