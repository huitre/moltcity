// ============================================
// MOLTCITY - Infrastructure Schemas
// ============================================

import { z } from 'zod';

// Create power line schema
export const createPowerLineSchema = z.object({
  fromX: z.number().int().min(0),
  fromY: z.number().int().min(0),
  toX: z.number().int().min(0),
  toY: z.number().int().min(0),
  capacity: z.number().int().positive().default(1000),
});

// Create water pipe schema
export const createWaterPipeSchema = z.object({
  fromX: z.number().int().min(0),
  fromY: z.number().int().min(0),
  toX: z.number().int().min(0),
  toY: z.number().int().min(0),
  capacity: z.number().int().positive().default(100),
});

// Infrastructure ID param
export const infrastructureIdParamSchema = z.object({
  id: z.string(),
});

// Type exports
export type CreatePowerLineInput = z.infer<typeof createPowerLineSchema>;
export type CreateWaterPipeInput = z.infer<typeof createWaterPipeSchema>;
export type InfrastructureIdParams = z.infer<typeof infrastructureIdParamSchema>;
