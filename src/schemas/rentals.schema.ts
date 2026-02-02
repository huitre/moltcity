// ============================================
// MOLTCITY - Rentals Schemas
// ============================================

import { z } from 'zod';

// Rental unit types
export const rentalUnitTypeSchema = z.enum(['residential', 'commercial']);

// Create rental units schema
export const createRentalUnitsSchema = z.object({
  buildingId: z.string(),
  floor: z.number().int().min(1),
  unitCount: z.number().int().min(1).max(3), // 1-3 units per floor
  rent: z.number().positive('Rent must be positive'),
  unitType: rentalUnitTypeSchema.default('residential'),
});

// Get available units query
export const availableUnitsQuerySchema = z.object({
  type: rentalUnitTypeSchema.optional(),
});

// Get units for building params
export const buildingUnitsParamsSchema = z.object({
  buildingId: z.string(),
});

// Sign lease schema
export const signLeaseSchema = z.object({
  agentId: z.string(),
  unitId: z.string(),
});

// Pay rent schema
export const payRentSchema = z.object({
  agentId: z.string(),
  unitId: z.string(),
  amount: z.number().positive().optional(), // Optional - pays full rent if not specified
});

// Terminate lease schema
export const terminateLeaseSchema = z.object({
  unitId: z.string(),
  reason: z.string().max(500).optional(),
});

// Warning ID param
export const warningIdParamSchema = z.object({
  warningId: z.string(),
});

// Agent warnings params
export const agentWarningsParamsSchema = z.object({
  agentId: z.string(),
});

// Type exports
export type RentalUnitType = z.infer<typeof rentalUnitTypeSchema>;
export type CreateRentalUnitsInput = z.infer<typeof createRentalUnitsSchema>;
export type AvailableUnitsQuery = z.infer<typeof availableUnitsQuerySchema>;
export type SignLeaseInput = z.infer<typeof signLeaseSchema>;
export type PayRentInput = z.infer<typeof payRentSchema>;
export type TerminateLeaseInput = z.infer<typeof terminateLeaseSchema>;
