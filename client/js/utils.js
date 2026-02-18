// ============================================
// MOLTCITY - Utility Functions
// ============================================

import { TILE_WIDTH, TILE_HEIGHT } from './config.js';

/**
 * Convert cartesian (grid) coordinates to isometric screen coordinates
 */
export function cartToIso(x, y) {
  return {
    x: (x - y) * (TILE_WIDTH / 2),
    y: (x + y) * (TILE_HEIGHT / 2),
  };
}

/**
 * Convert isometric screen coordinates to cartesian (grid) coordinates
 */
export function isoToCart(isoX, isoY) {
  const x = (isoX / (TILE_WIDTH / 2) + isoY / (TILE_HEIGHT / 2)) / 2;
  const y = (isoY / (TILE_HEIGHT / 2) - isoX / (TILE_WIDTH / 2)) / 2;
  return { x: Math.floor(x), y: Math.floor(y) };
}

/**
 * Clamp a value between min and max
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generate a seeded random number (for deterministic building generation)
 */
export function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Draw a dashed line on a PIXI.Graphics object
 */
export function drawDashedLine(graphics, x1, y1, x2, y2, dashLen = 5, gapLen = 3) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = dx / len;
  const ny = dy / len;

  let drawn = 0;
  let drawing = true;

  while (drawn < len) {
    const segLen = drawing ? dashLen : gapLen;
    const end = Math.min(drawn + segLen, len);

    if (drawing) {
      graphics.moveTo(x1 + nx * drawn, y1 + ny * drawn);
      graphics.lineTo(x1 + nx * end, y1 + ny * end);
    }

    drawn = end;
    drawing = !drawing;
  }
}

/**
 * Format a number with commas
 */
export function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format MOLT currency
 */
export function formatMolt(amount) {
  return `${formatNumber(Math.floor(amount))} MOLT`;
}

/**
 * Bresenham line algorithm — returns all grid tiles between two points
 */
export function bresenhamLine(x0, y0, x1, y1) {
  const points = [];
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0, cy = y0;

  while (true) {
    points.push({ x: cx, y: cy });
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
  return points;
}

/**
 * Lighten a hex color
 */
export function lightenColor(color, amount) {
  const r = Math.min(255, ((color >> 16) & 0xff) + amount);
  const g = Math.min(255, ((color >> 8) & 0xff) + amount);
  const b = Math.min(255, (color & 0xff) + amount);
  return (r << 16) | (g << 8) | b;
}

/**
 * Darken a hex color
 */
export function darkenColor(color, amount) {
  const r = Math.max(0, ((color >> 16) & 0xff) - amount);
  const g = Math.max(0, ((color >> 8) & 0xff) - amount);
  const b = Math.max(0, (color & 0xff) - amount);
  return (r << 16) | (g << 8) | b;
}
