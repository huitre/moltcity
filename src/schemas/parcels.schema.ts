// ============================================
// MOLTCITY - Parcels Schemas
// ============================================

import { z } from 'zod';
import { intCoordinateSchema, rangeQuerySchema, zoningTypeSchema, currencySchema } from './common.schema.js';

// Get parcel params
export const parcelCoordsParamsSchema = z.object({
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
});

// Get parcels in range query
export const parcelsRangeQuerySchema = rangeQuerySchema;

// Purchase parcel schema
export const purchaseParcelSchema = z.object({
  agentId: z.string().optional(), // Optional - can auto-create agent
  moltbookId: z.string().optional(), // Alternative identifier
  parcelId: z.string().optional(), // Optional - use x,y instead
  x: z.number().int().min(0).optional(),
  y: z.number().int().min(0).optional(),
  price: z.number().min(0),
  currency: currencySchema.default('MOLT'),
  createAgent: z.boolean().optional(), // Auto-create agent if missing
  agentName: z.string().min(1).max(100).optional(), // Name for auto-created agent
}).refine(
  data => data.parcelId || (data.x !== undefined && data.y !== undefined),
  { message: 'Either parcelId or x,y coordinates are required' }
);

// Sell/transfer parcel schema
export const sellParcelSchema = z.object({
  parcelId: z.string(),
  sellerId: z.string(), // Agent ID of current owner
  buyerId: z.string().optional(), // Agent ID of buyer (if not provided, releases parcel)
  price: z.number().min(0),
});

// Set zoning schema
export const setZoningSchema = z.object({
  parcelId: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  zoning: zoningTypeSchema.nullable(),
  cityId: z.string().optional(),
});

// Type exports
export type ParcelCoordsParams = z.infer<typeof parcelCoordsParamsSchema>;
export type ParcelsRangeQuery = z.infer<typeof parcelsRangeQuerySchema>;
export type PurchaseParcelInput = z.infer<typeof purchaseParcelSchema>;
export type SellParcelInput = z.infer<typeof sellParcelSchema>;
export type SetZoningInput = z.infer<typeof setZoningSchema>;
