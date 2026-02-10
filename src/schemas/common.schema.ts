// ============================================
// MOLTCITY - Common Schemas
// ============================================

import { z } from 'zod';

// Coordinate schema
export const coordinateSchema = z.object({
  x: z.number(),
  y: z.number(),
});

// Integer coordinate schema
export const intCoordinateSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});

// Range query schema (defaults to full 50x50 grid)
export const rangeQuerySchema = z.object({
  minX: z.coerce.number().int().min(0).default(0),
  minY: z.coerce.number().int().min(0).default(0),
  maxX: z.coerce.number().int().min(0).default(49),
  maxY: z.coerce.number().int().min(0).default(49),
});

// Pagination schema
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ID param schema
export const idParamSchema = z.object({
  id: z.string().uuid(),
});

// Terrain types
export const terrainTypeSchema = z.enum(['land', 'water', 'hill']);

// Zoning types
export const zoningTypeSchema = z.enum(['residential', 'commercial', 'industrial', 'municipal', 'park', 'suburban']);

// Building types
export const buildingTypeSchema = z.enum([
  'house',
  'apartment',
  'shop',
  'office',
  'factory',
  'power_plant',
  'water_tower',
  'road',
  'park',
  'plaza',
  'city_hall',
  'police_station',
  'courthouse',
  'jail',
]);

// Road directions
export const roadDirectionSchema = z.enum([
  'horizontal',
  'vertical',
  'intersection',
  'corner_ne',
  'corner_nw',
  'corner_se',
  'corner_sw',
]);

// Vehicle types
export const vehicleTypeSchema = z.enum(['car', 'bus', 'truck', 'taxi']);

// Agent states
export const agentStateSchema = z.enum([
  'idle',
  'traveling',
  'working',
  'shopping',
  'sleeping',
  'socializing',
  'in_jail',
]);

// Currency
export const currencySchema = z.enum(['MOLT', 'USD']);

// Type exports
export type Coordinate = z.infer<typeof coordinateSchema>;
export type IntCoordinate = z.infer<typeof intCoordinateSchema>;
export type RangeQuery = z.infer<typeof rangeQuerySchema>;
export type Pagination = z.infer<typeof paginationSchema>;
