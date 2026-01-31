// ============================================
// MOLTCITY - Sprite Upload & Management Service
// ============================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ============================================
// Configuration
// ============================================

const SPRITES_DIR = path.join(process.cwd(), 'sprites');
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const ALLOWED_TYPES = ['image/png', 'image/gif', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.png', '.gif', '.webp'];

// Recommended isometric sprite dimensions
const RECOMMENDED_WIDTH = 128;
const RECOMMENDED_HEIGHT = 128;

// ============================================
// Types
// ============================================

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

export interface UploadResult {
  success: boolean;
  sprite?: SpriteMetadata;
  url?: string;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================
// Sprite Service
// ============================================

export class SpriteService {
  private metadataFile: string;
  private metadata: Map<string, SpriteMetadata>;

  constructor() {
    // Ensure sprites directory exists
    if (!fs.existsSync(SPRITES_DIR)) {
      fs.mkdirSync(SPRITES_DIR, { recursive: true });
    }

    this.metadataFile = path.join(SPRITES_DIR, 'metadata.json');
    this.metadata = new Map();
    this.loadMetadata();
  }

  /**
   * Load sprite metadata from disk
   */
  private loadMetadata(): void {
    try {
      if (fs.existsSync(this.metadataFile)) {
        const data = JSON.parse(fs.readFileSync(this.metadataFile, 'utf-8'));
        for (const sprite of data.sprites || []) {
          this.metadata.set(sprite.id, sprite);
        }
      }
    } catch (e) {
      console.warn('[SpriteService] Failed to load metadata:', e);
    }
  }

  /**
   * Save sprite metadata to disk
   */
  private saveMetadata(): void {
    const data = {
      sprites: Array.from(this.metadata.values()),
    };
    fs.writeFileSync(this.metadataFile, JSON.stringify(data, null, 2));
  }

  /**
   * Validate an uploaded sprite
   */
  validateSprite(
    buffer: Buffer,
    filename: string,
    mimeType: string
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check file size
    if (buffer.length > MAX_FILE_SIZE) {
      errors.push(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024}KB`);
    }

    // Check MIME type
    if (!ALLOWED_TYPES.includes(mimeType)) {
      errors.push(`Invalid file type. Allowed types: ${ALLOWED_TYPES.join(', ')}`);
    }

    // Check extension
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      errors.push(`Invalid extension. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`);
    }

    // Check PNG header
    if (mimeType === 'image/png') {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (!buffer.subarray(0, 8).equals(pngHeader)) {
        errors.push('Invalid PNG file');
      } else {
        // Try to read dimensions from PNG header
        const dims = this.getPngDimensions(buffer);
        if (dims) {
          if (dims.width !== RECOMMENDED_WIDTH || dims.height !== RECOMMENDED_HEIGHT) {
            warnings.push(
              `Sprite dimensions are ${dims.width}x${dims.height}. ` +
              `Recommended: ${RECOMMENDED_WIDTH}x${RECOMMENDED_HEIGHT}`
            );
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get PNG dimensions from buffer
   */
  private getPngDimensions(buffer: Buffer): { width: number; height: number } | null {
    try {
      // PNG IHDR chunk starts at byte 8, width at 16, height at 20
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    } catch (e) {
      return null;
    }
  }

  /**
   * Upload a sprite
   */
  async uploadSprite(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    uploadedBy: string,
    options: {
      buildingType?: string;
      tags?: string[];
    } = {}
  ): Promise<UploadResult> {
    // Validate
    const validation = this.validateSprite(buffer, originalName, mimeType);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join('; '),
      };
    }

    // Generate unique ID and filename
    const id = crypto.randomUUID();
    const ext = path.extname(originalName).toLowerCase();
    const filename = `${id}${ext}`;
    const filepath = path.join(SPRITES_DIR, filename);

    // Write file
    try {
      fs.writeFileSync(filepath, buffer);
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to save file: ${e.message}`,
      };
    }

    // Get dimensions
    let width: number | undefined;
    let height: number | undefined;
    if (mimeType === 'image/png') {
      const dims = this.getPngDimensions(buffer);
      if (dims) {
        width = dims.width;
        height = dims.height;
      }
    }

    // Create metadata
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

  /**
   * Get sprite by ID
   */
  getSprite(id: string): SpriteMetadata | null {
    return this.metadata.get(id) || null;
  }

  /**
   * Get all sprites
   */
  getAllSprites(): SpriteMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Get sprites by building type
   */
  getSpritesByType(buildingType: string): SpriteMetadata[] {
    return Array.from(this.metadata.values())
      .filter(s => s.buildingType === buildingType);
  }

  /**
   * Get sprites uploaded by a specific agent
   */
  getSpritesByUploader(uploadedBy: string): SpriteMetadata[] {
    return Array.from(this.metadata.values())
      .filter(s => s.uploadedBy === uploadedBy);
  }

  /**
   * Delete a sprite
   */
  deleteSprite(id: string, requestedBy: string): { success: boolean; error?: string } {
    const sprite = this.metadata.get(id);
    if (!sprite) {
      return { success: false, error: 'Sprite not found' };
    }

    // Only uploader can delete
    if (sprite.uploadedBy !== requestedBy && requestedBy !== 'system') {
      return { success: false, error: 'Not authorized to delete this sprite' };
    }

    // Delete file
    const filepath = path.join(SPRITES_DIR, sprite.filename);
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    } catch (e) {
      console.warn('[SpriteService] Failed to delete file:', e);
    }

    // Remove metadata
    this.metadata.delete(id);
    this.saveMetadata();

    return { success: true };
  }

  /**
   * Get the file path for a sprite
   */
  getSpritePath(filename: string): string | null {
    const filepath = path.join(SPRITES_DIR, filename);
    if (fs.existsSync(filepath)) {
      return filepath;
    }
    return null;
  }
}

// ============================================
// Default Isometric Building Sprites
// ============================================

// Generate a simple procedural sprite for building types
export function generateDefaultSprite(buildingType: string): Buffer {
  // This would generate a simple PNG sprite
  // For now, return empty - would need a proper image library
  // In production, you'd use canvas or sharp to generate sprites
  return Buffer.alloc(0);
}
