// ============================================
// MOLTCITY - Sprites Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import path from 'path';
import { SpriteService } from '../services/sprite.service.js';
import { listSpritesQuerySchema, spriteIdParamSchema } from '../schemas/sprites.schema.js';
import { NotFoundError, ValidationError } from '../plugins/error-handler.plugin.js';
import { env } from '../config/env.js';
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

  // Patch sprite config (edit sprites.json entries in-place)
  fastify.patch('/api/sprites/config', async (request) => {
    const { source, category, index, updates } = request.body as {
      source: string;
      category: string | null;
      index: number | null;
      updates: { width?: number; height?: number; anchor?: { x: number; y: number } };
    };

    if (!source || !updates) {
      throw new ValidationError('source and updates are required');
    }

    const spritesJsonPath = path.resolve(process.cwd(), env.SPRITES_DIR, 'sprites.json');
    const raw = fs.readFileSync(spritesJsonPath, 'utf-8');
    const config = JSON.parse(raw);

    // Locate the entry:
    // config[source][category][index] → e.g. residential.low[2]
    // config[source][index]           → e.g. park[0], crane[0]
    // config.buildings[category]      → e.g. buildings.power_plant (no index, it's an object)
    let entry: Record<string, any> | null = null;

    if (source === 'buildings' && category) {
      // buildings map: config.buildings[category] is a single object
      entry = config.buildings?.[category] ?? null;
    } else if (category !== null && index !== null) {
      // Array within a category: config[source][category][index]
      entry = config[source]?.[category]?.[index] ?? null;
    } else if (index !== null) {
      // Array without category: config[source][index]
      entry = config[source]?.[index] ?? null;
    }

    if (!entry) {
      throw new NotFoundError('Sprite config entry', `${source}.${category ?? ''}[${index ?? ''}]`);
    }

    // Apply updates
    if (updates.width !== undefined) entry.width = updates.width;
    if (updates.height !== undefined) entry.height = updates.height;
    if (updates.anchor) {
      if (!entry.anchor) entry.anchor = {};
      entry.anchor.x = updates.anchor.x;
      entry.anchor.y = updates.anchor.y;
    }

    fs.writeFileSync(spritesJsonPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    return { success: true, entry };
  });
};
