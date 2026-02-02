// ============================================
// MOLTCITY - Sprites Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { SpriteService } from '../services/sprite.service.js';
import { listSpritesQuerySchema, spriteIdParamSchema } from '../schemas/sprites.schema.js';
import { NotFoundError, ValidationError } from '../plugins/error-handler.plugin.js';
import type { BuildingType } from '../models/types.js';

export const spritesController: FastifyPluginAsync = async (fastify) => {
  const spriteService = new SpriteService();

  // List sprites
  fastify.get('/api/sprites', async (request) => {
    const query = listSpritesQuerySchema.parse(request.query);

    let sprites;
    if (query.type) {
      sprites = spriteService.getSpritesByType(query.type);
    } else if (query.uploaderId) {
      sprites = spriteService.getSpritesByUploader(query.uploaderId);
    } else {
      sprites = spriteService.getAllSprites();
    }

    return { sprites };
  });

  // Upload sprite (multipart)
  fastify.post('/api/sprites', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      throw new ValidationError('No file uploaded');
    }

    const buffer = await data.toBuffer();
    const fields = data.fields as Record<string, { value?: string }>;

    const uploaderId = fields.uploaderId?.value;
    if (!uploaderId) {
      throw new ValidationError('uploaderId is required');
    }

    const result = await spriteService.uploadSprite(
      buffer,
      data.filename,
      data.mimetype,
      uploaderId,
      {
        buildingType: fields.type?.value as BuildingType | undefined,
        tags: fields.tags?.value ? fields.tags.value.split(',') : undefined,
      }
    );

    if (!result.success) {
      throw new ValidationError(result.error || 'Upload failed');
    }

    reply.status(201);
    return {
      success: true,
      sprite: result.sprite,
      url: result.url,
    };
  });

  // Get sprite metadata
  fastify.get('/api/sprites/:id', async (request) => {
    const params = spriteIdParamSchema.parse(request.params);
    const sprite = spriteService.getSprite(params.id);

    if (!sprite) {
      throw new NotFoundError('Sprite', params.id);
    }

    return { sprite };
  });

  // Delete sprite
  fastify.delete('/api/sprites/:id', async (request) => {
    const params = spriteIdParamSchema.parse(request.params);
    const requestedBy = (request.query as any).requestedBy || 'system';

    spriteService.deleteSprite(params.id, requestedBy);
    return { success: true };
  });
};
