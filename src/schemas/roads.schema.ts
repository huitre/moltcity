// ============================================
// MOLTCITY - Roads Schemas
// ============================================

import { z } from 'zod';
import { roadDirectionSchema } from './common.schema.js';

// Create road schema
export const createRoadSchema = z.object({
  parcelId: z.string().optional(),
  x: z.number().int().min(0).optional(),
  y: z.number().int().min(0).optional(),
  direction: roadDirectionSchema.optional().default('intersection'),
  lanes: z.number().int().min(1).max(4).default(2),
}).refine(
  data => data.parcelId || (data.x !== undefined && data.y !== undefined),
  { message: 'Either parcelId or x,y coordinates are required' }
);

// Road ID param
export const roadIdParamSchema = z.object({
  id: z.string(),
});

// Batch create roads schema
export const createRoadsBatchSchema = z.object({
  tiles: z.array(z.object({
    x: z.number().int(),
    y: z.number().int(),
  })).min(1).max(500),
  cityId: z.string().optional(),
});

// Type exports
export type CreateRoadInput = z.infer<typeof createRoadSchema>;
export type CreateRoadsBatchInput = z.infer<typeof createRoadsBatchSchema>;
export type RoadIdParams = z.infer<typeof roadIdParamSchema>;
