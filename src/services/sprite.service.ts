// ============================================
// MOLTCITY - Sprite Service (Refactored)
// ============================================

import fs from 'fs';
import path from 'path';
import { NotFoundError, ValidationError, ForbiddenError } from '../plugins/error-handler.plugin.js';
import { env } from '../config/env.js';
import type { BuildingType } from '../models/types.js';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const ALLOWED_TYPES = ['image/png', 'image/gif', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.png', '.gif', '.webp'];

export interface SpriteMetadata {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  uploadedBy: string;
  uploadedAt: number;
  buildingType?: string;
  tags?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface UploadResult {
  success: boolean;
  sprite?: SpriteMetadata;
  url?: string;
  error?: string;
}

export class SpriteService {
  private spritesDir: string;
  private metadataFile: string;
  private metadata: Map<string, SpriteMetadata>;

  constructor() {
    this.spritesDir = path.resolve(process.cwd(), env.SPRITES_DIR);
    this.metadataFile = path.join(this.spritesDir, 'metadata.json');
    this.metadata = new Map();
    this.ensureDirectory();
    this.loadMetadata();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.spritesDir)) {
      fs.mkdirSync(this.spritesDir, { recursive: true });
    }
  }

  private loadMetadata(): void {
    try {
      if (fs.existsSync(this.metadataFile)) {
        const data = JSON.parse(fs.readFileSync(this.metadataFile, 'utf-8'));
        for (const sprite of data.sprites || []) {
          this.metadata.set(sprite.id, sprite);
        }
      }
    } catch {
      console.warn('[SpriteService] Failed to load metadata');
    }
  }

  private saveMetadata(): void {
    const data = {
      sprites: Array.from(this.metadata.values()),
    };
    fs.writeFileSync(this.metadataFile, JSON.stringify(data, null, 2));
  }

  validateSprite(buffer: Buffer, filename: string, mimeType: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (buffer.length > MAX_FILE_SIZE) {
      errors.push(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024}KB`);
    }

    if (!ALLOWED_TYPES.includes(mimeType)) {
      errors.push(`Invalid file type. Allowed types: ${ALLOWED_TYPES.join(', ')}`);
    }

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      errors.push(`Invalid extension. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`);
    }

    // PNG validation
    if (mimeType === 'image/png') {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (!buffer.subarray(0, 8).equals(pngHeader)) {
        errors.push('Invalid PNG file');
      } else {
        const dims = this.getPngDimensions(buffer);
        if (dims && (dims.width !== 128 || dims.height !== 128)) {
          warnings.push(
            `Sprite dimensions are ${dims.width}x${dims.height}. Recommended: 128x128`
          );
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private getPngDimensions(buffer: Buffer): { width: number; height: number } | null {
    try {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    } catch {
      return null;
    }
  }

  async uploadSprite(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    uploadedBy: string,
    options: { buildingType?: BuildingType; tags?: string[] } = {}
  ): Promise<UploadResult> {
    const validation = this.validateSprite(buffer, originalName, mimeType);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join('; ') };
    }

    const id = crypto.randomUUID();
    const ext = path.extname(originalName).toLowerCase();
    const filename = `${id}${ext}`;
    const filepath = path.join(this.spritesDir, filename);

    try {
      fs.writeFileSync(filepath, buffer);
    } catch (e: any) {
      return { success: false, error: `Failed to save file: ${e.message}` };
    }

    let width: number | undefined;
    let height: number | undefined;
    if (mimeType === 'image/png') {
      const dims = this.getPngDimensions(buffer);
      if (dims) {
        width = dims.width;
        height = dims.height;
      }
    }

    const sprite: SpriteMetadata = {
      id,
      filename,
      originalName,
      mimeType,
      size: buffer.length,
      width,
      height,
      uploadedBy,
      uploadedAt: Date.now(),
      buildingType: options.buildingType,
      tags: options.tags,
    };

    this.metadata.set(id, sprite);
    this.saveMetadata();

    return {
      success: true,
      sprite,
      url: `/sprites/${filename}`,
    };
  }

  getSprite(id: string): SpriteMetadata | null {
    return this.metadata.get(id) || null;
  }

  getAllSprites(): SpriteMetadata[] {
    return Array.from(this.metadata.values());
  }

  getSpritesByType(buildingType: string): SpriteMetadata[] {
    return Array.from(this.metadata.values()).filter(s => s.buildingType === buildingType);
  }

  getSpritesByUploader(uploadedBy: string): SpriteMetadata[] {
    return Array.from(this.metadata.values()).filter(s => s.uploadedBy === uploadedBy);
  }

  deleteSprite(id: string, requestedBy: string): void {
    const sprite = this.metadata.get(id);
    if (!sprite) {
      throw new NotFoundError('Sprite', id);
    }

    if (sprite.uploadedBy !== requestedBy && requestedBy !== 'system') {
      throw new ForbiddenError('Not authorized to delete this sprite');
    }

    const filepath = path.join(this.spritesDir, sprite.filename);
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    } catch {
      console.warn('[SpriteService] Failed to delete file');
    }

    this.metadata.delete(id);
    this.saveMetadata();
  }

  getSpritePath(filename: string): string | null {
    const filepath = path.join(this.spritesDir, filename);
    if (fs.existsSync(filepath)) {
      return filepath;
    }
    return null;
  }
}
