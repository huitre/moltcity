// ============================================
// MOLTCITY - Tile Rendering
// ============================================

import { GRID_SIZE, TILE_WIDTH, TILE_HEIGHT, COLORS } from "../config.js";
import { cartToIso, lightenColor, darkenColor } from "../utils.js";
import * as state from "../state.js";

/**
 * Draw a basic isometric tile
 */
export function drawTile(x, y, color, height = 0) {
  const iso = cartToIso(x, y);
  const graphics = new PIXI.Graphics();

  // Top face
  graphics.beginFill(color);
  graphics.moveTo(iso.x, iso.y - height);
  graphics.lineTo(iso.x + TILE_WIDTH / 2, iso.y + TILE_HEIGHT / 2 - height);
  graphics.lineTo(iso.x, iso.y + TILE_HEIGHT - height);
  graphics.lineTo(iso.x - TILE_WIDTH / 2, iso.y + TILE_HEIGHT / 2 - height);
  graphics.closePath();
  graphics.endFill();

  // Right face (if height > 0)
  if (height > 0) {
    graphics.beginFill(darkenColor(color, 30));
    graphics.moveTo(iso.x + TILE_WIDTH / 2, iso.y + TILE_HEIGHT / 2 - height);
    graphics.lineTo(iso.x + TILE_WIDTH / 2, iso.y + TILE_HEIGHT / 2);
    graphics.lineTo(iso.x, iso.y + TILE_HEIGHT);
    graphics.lineTo(iso.x, iso.y + TILE_HEIGHT - height);
    graphics.closePath();
    graphics.endFill();
  }

  // Left face (if height > 0)
  if (height > 0) {
    graphics.beginFill(darkenColor(color, 50));
    graphics.moveTo(iso.x - TILE_WIDTH / 2, iso.y + TILE_HEIGHT / 2 - height);
    graphics.lineTo(iso.x - TILE_WIDTH / 2, iso.y + TILE_HEIGHT / 2);
    graphics.lineTo(iso.x, iso.y + TILE_HEIGHT);
    graphics.lineTo(iso.x, iso.y + TILE_HEIGHT - height);
    graphics.closePath();
    graphics.endFill();
  }

  graphics.zIndex = 0; // Grass is always the base layer
  return graphics;
}

/**
 * Draw a grass tile using sprite textures (grass_01/05), with procedural fallback
 */
export function drawGrassTile(x, y) {
  if (state.grassTextures.length > 0) {
    const idx = Math.floor(state.grassTextures.length * Math.random());
    const texture = state.grassTextures[idx];
    const iso = cartToIso(x, y);
    const sprite = new PIXI.Sprite(texture);
    const scale = TILE_WIDTH / texture.width;
    sprite.scale.set(scale);
    sprite.anchor.set(0.5, 0.85);
    sprite.x = iso.x;
    sprite.y = iso.y + TILE_HEIGHT;
    sprite.zIndex = 0;
    return sprite;
  }
  // Procedural fallback
  const variation = ((x * 7 + y * 13) % 10) - 5;
  const grassColor = lightenColor(COLORS.grass, variation);
  return drawTile(x, y, grassColor);
}

/**
 * Draw a water tile
 */
export function drawWaterTile(x, y) {
  const graphics = drawTile(x, y, COLORS.water);

  // Add wave effect
  const iso = cartToIso(x, y);
  graphics.lineStyle(1, lightenColor(COLORS.water, 40), 0.5);
  for (let i = 0; i < 3; i++) {
    const offset = i * 8;
    graphics.moveTo(iso.x - 20 + offset, iso.y + 5 + i * 4);
    graphics.lineTo(iso.x - 10 + offset, iso.y + 3 + i * 4);
    graphics.lineTo(iso.x + offset, iso.y + 5 + i * 4);
  }

  return graphics;
}

/**
 * Zone colors for zoned-but-empty tiles
 */
const ZONE_COLORS = {
  residential: 0x4caf50, // green
  suburban: 0x66bb6a, // lighter green
  office: 0x42a5f5, // blue
  industrial: 0xffca28, // yellow
};

/**
 * Draw a zone-colored tile (replaces grass for zoned empty parcels)
 */
export function drawZoneTile(x, y, zoning) {
  const color = ZONE_COLORS[zoning];
  if (!color) return drawGrassTile(x, y);

  const iso = cartToIso(x, y);
  const graphics = new PIXI.Graphics();

  // Grass base (slightly visible under zone color)
  const variation = ((x * 7 + y * 13) % 10) - 5;
  const grassColor = lightenColor(COLORS.grass, variation);

  // Draw base grass tile
  graphics.beginFill(grassColor);
  graphics.moveTo(iso.x, iso.y);
  graphics.lineTo(iso.x + TILE_WIDTH / 2, iso.y + TILE_HEIGHT / 2);
  graphics.lineTo(iso.x, iso.y + TILE_HEIGHT);
  graphics.lineTo(iso.x - TILE_WIDTH / 2, iso.y + TILE_HEIGHT / 2);
  graphics.closePath();
  graphics.endFill();

  // Zone color overlay with transparency
  graphics.beginFill(color, 0.45);
  graphics.moveTo(iso.x, iso.y);
  graphics.lineTo(iso.x + TILE_WIDTH / 2, iso.y + TILE_HEIGHT / 2);
  graphics.lineTo(iso.x, iso.y + TILE_HEIGHT);
  graphics.lineTo(iso.x - TILE_WIDTH / 2, iso.y + TILE_HEIGHT / 2);
  graphics.closePath();
  graphics.endFill();

  // Subtle border
  graphics.lineStyle(1, darkenColor(color, 30), 0.5);
  graphics.moveTo(iso.x, iso.y);
  graphics.lineTo(iso.x + TILE_WIDTH / 2, iso.y + TILE_HEIGHT / 2);
  graphics.lineTo(iso.x, iso.y + TILE_HEIGHT);
  graphics.lineTo(iso.x - TILE_WIDTH / 2, iso.y + TILE_HEIGHT / 2);
  graphics.closePath();

  graphics.zIndex = 0;
  return graphics;
}

/**
 * Draw a highlight overlay for a tile
 */
export function drawHighlight(
  x,
  y,
  color = COLORS.highlight,
  isSelection = false,
) {
  const iso = cartToIso(x, y);
  const graphics = new PIXI.Graphics();

  graphics.lineStyle(isSelection ? 3 : 2, color, isSelection ? 1 : 0.8);
  graphics.beginFill(color, isSelection ? 0.3 : 0.2);

  graphics.moveTo(iso.x, iso.y);
  graphics.lineTo(iso.x + TILE_WIDTH / 2, iso.y + TILE_HEIGHT / 2);
  graphics.lineTo(iso.x, iso.y + TILE_HEIGHT);
  graphics.lineTo(iso.x - TILE_WIDTH / 2, iso.y + TILE_HEIGHT / 2);
  graphics.closePath();
  graphics.endFill();

  graphics.zIndex = y * GRID_SIZE + x + 5000; // Always on top
  return graphics;
}

/**
 * Draw an isometric box (for 3D shapes)
 */
export function drawIsoBox(g, cx, isoY, height, color) {
  const w = TILE_WIDTH / 2 - 4;
  const h = TILE_HEIGHT / 2 - 2;

  // Top
  g.beginFill(lightenColor(color, 20));
  g.moveTo(cx, isoY - height);
  g.lineTo(cx + w, isoY - height + h);
  g.lineTo(cx, isoY - height + h * 2);
  g.lineTo(cx - w, isoY - height + h);
  g.closePath();
  g.endFill();

  // Right face
  g.beginFill(darkenColor(color, 20));
  g.moveTo(cx + w, isoY - height + h);
  g.lineTo(cx + w, isoY + h);
  g.lineTo(cx, isoY + h * 2);
  g.lineTo(cx, isoY - height + h * 2);
  g.closePath();
  g.endFill();

  // Left face
  g.beginFill(darkenColor(color, 40));
  g.moveTo(cx - w, isoY - height + h);
  g.lineTo(cx - w, isoY + h);
  g.lineTo(cx, isoY + h * 2);
  g.lineTo(cx, isoY - height + h * 2);
  g.closePath();
  g.endFill();
}
