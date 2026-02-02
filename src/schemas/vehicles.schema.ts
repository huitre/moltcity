// ============================================
// MOLTCITY - Vehicles Schemas
// ============================================

import { z } from 'zod';
import { vehicleTypeSchema, coordinateSchema } from './common.schema.js';

// Create vehicle schema
export const createVehicleSchema = z.object({
  ownerId: z.string(), // Agent ID
  type: vehicleTypeSchema,
  x: z.number().min(0),
  y: z.number().min(0),
  sprite: z.string().optional(),
});

// Vehicle ID param
export const vehicleIdParamSchema = z.object({
  id: z.string(),
});

// Move vehicle schema
export const moveVehicleSchema = z.object({
  destination: coordinateSchema,
});

// Type exports
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type VehicleIdParams = z.infer<typeof vehicleIdParamSchema>;
export type MoveVehicleInput = z.infer<typeof moveVehicleSchema>;
