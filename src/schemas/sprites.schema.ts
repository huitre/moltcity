// ============================================
// MOLTCITY - Sprites Schemas
// ============================================

import { z } from 'zod';
import { buildingTypeSchema } from './common.schema.js';

// List sprites query
export const listSpritesQuerySchema = z.object({
  type: buildingTypeSchema.optional(),
  uploaderId: z.string().optional(),
});

// Sprite ID param
export const spriteIdParamSchema = z.object({
  id: z.string(),
});

// Upload sprite metadata (actual file handled by multipart)
export const uploadSpriteMetadataSchema = z.object({
  name: z.string().min(1).max(100),
  type: buildingTypeSchema.optional(), // Building type association
  uploaderId: z.string(), // Agent ID of uploader
});

// Type exports
export type ListSpritesQuery = z.infer<typeof listSpritesQuerySchema>;
export type SpriteIdParams = z.infer<typeof spriteIdParamSchema>;
export type UploadSpriteMetadata = z.infer<typeof uploadSpriteMetadataSchema>;
