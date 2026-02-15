// ============================================
// MOLTCITY - Road Rendering
// ============================================

import {
  GRID_SIZE,
  TILE_WIDTH,
  TILE_HEIGHT,
  DIR_VECTORS,
  OPPOSITE_DIR,
} from "../config.js";
import { cartToIso, drawDashedLine } from "../utils.js";
import * as state from "../state.js";

/**
 * Check if there's a road at the given grid position
 */
export function hasRoadAt(x, y) {
  return state.roads.some((r) => {
    const parcel = state.parcels.find((p) => p.id === r.parcelId);
    return parcel && parcel.x === x && parcel.y === y;
  });
}

/**
 * Get road object at position
 */
export function getRoadAt(x, y) {
  return state.roads.find((r) => {
    const parcel = state.parcels.find((p) => p.id === r.parcelId);
    return parcel && parcel.x === x && parcel.y === y;
  });
}

/**
 * Get road connections at a position (which directions have adjacent roads)
 */
export function getRoadConnections(x, y) {
  return {
    nw: hasRoadAt(x - 1, y), // Northwest (-x)
    ne: hasRoadAt(x, y - 1), // Northeast (-y)
    se: hasRoadAt(x + 1, y), // Southeast (+x)
    sw: hasRoadAt(x, y + 1), // Southwest (+y)
  };
}

/**
 * Get valid movement directions from a road tile
 */
export function getValidDirections(x, y) {
  const directions = [];
  if (hasRoadAt(x, y - 1)) directions.push("north");
  if (hasRoadAt(x, y + 1)) directions.push("south");
  if (hasRoadAt(x + 1, y)) directions.push("east");
  if (hasRoadAt(x - 1, y)) directions.push("west");
  return directions;
}

/**
 * Seeded random number generator for deterministic road variants
 */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw a road tile at the given position
 */
export function drawRoad(x, y) {
  const iso = cartToIso(x, y);
  const conn = getRoadConnections(x, y);

  // Try to use road sprites
  if (state.roadSprites.size > 0) {
    const connCount = [conn.nw, conn.ne, conn.se, conn.sw].filter(
      Boolean,
    ).length;
    let roadType = null;

    if (connCount === 4) {
      roadType = "road_089";
    } else if (connCount === 3) {
      if (!conn.sw) roadType = "road_103";
      else if (!conn.nw) roadType = "road_095";
      else if (!conn.ne) roadType = "road_096";
      else if (!conn.se) roadType = "road_088";
    } else if (connCount === 2) {
      if (conn.ne && conn.sw) {
        const variants = ["road_081", "road_055"];
        const rng = mulberry32(x * 1000 + y);
        roadType = variants[Math.floor(rng() * variants.length)];
      } else if (conn.nw && conn.se) {
        const variants = ["road_073", "road_064"];
        const rng = mulberry32(x * 1000 + y);
        roadType = variants[Math.floor(rng() * variants.length)];
      } else if (conn.nw && conn.ne) roadType = "road_125";
      else if (conn.ne && conn.se) roadType = "road_124";
      else if (conn.se && conn.sw) roadType = "road_122";
      else if (conn.sw && conn.nw) roadType = "road_125";
    } else if (connCount === 1) {
      if (conn.sw) roadType = "road_110";
      else if (conn.ne) roadType = "road_116";
      else if (conn.nw) roadType = "road_111";
      else if (conn.se) roadType = "road_104";
    } else {
      roadType = "road_080";
    }

    if (roadType && state.roadSprites.has(roadType)) {
      const { texture, config } = state.roadSprites.get(roadType);
      const sprite = new PIXI.Sprite(texture);
      const scale = TILE_WIDTH / config.width;
      sprite.scale.set(scale);
      sprite.anchor.set(config.anchor.x, config.anchor.y);
      sprite.x = iso.x;
      sprite.y = iso.y + TILE_HEIGHT + 8;
      sprite.zIndex = y * GRID_SIZE + x;
      return sprite;
    }
  }

  // Fallback to procedural drawing
  return drawProceduralRoad(x, y, iso, conn);
}

/**
 * Draw a procedural road (fallback when no sprites)
 */
function drawProceduralRoad(x, y, iso, conn) {
  const graphics = new PIXI.Graphics();
  const hw = TILE_WIDTH / 2;
  const hh = TILE_HEIGHT / 2;

  const roadColor = 0x454545;
  const sidewalkColor = 0x606060;
  const lineColor = 0xcccc33;
  const whiteLineColor = 0xffffff;

  // Tile vertices
  const top = { x: iso.x, y: iso.y };
  const right = { x: iso.x + hw, y: iso.y + hh };
  const bottom = { x: iso.x, y: iso.y + TILE_HEIGHT };
  const left = { x: iso.x - hw, y: iso.y + hh };

  // Edge midpoints
  const midNE = { x: (top.x + right.x) / 2, y: (top.y + right.y) / 2 };
  const midSE = { x: (right.x + bottom.x) / 2, y: (right.y + bottom.y) / 2 };
  const midSW = { x: (bottom.x + left.x) / 2, y: (bottom.y + left.y) / 2 };
  const midNW = { x: (left.x + top.x) / 2, y: (left.y + top.y) / 2 };

  const cx = iso.x;
  const cy = iso.y + hh;

  // Draw sidewalk border
  graphics.beginFill(sidewalkColor);
  graphics.moveTo(top.x, top.y - 1);
  graphics.lineTo(right.x + 1, right.y);
  graphics.lineTo(bottom.x, bottom.y + 1);
  graphics.lineTo(left.x - 1, left.y);
  graphics.closePath();
  graphics.endFill();

  // Draw main road surface
  graphics.beginFill(roadColor);
  graphics.moveTo(top.x, top.y);
  graphics.lineTo(right.x, right.y);
  graphics.lineTo(bottom.x, bottom.y);
  graphics.lineTo(left.x, left.y);
  graphics.closePath();
  graphics.endFill();

  const connCount = [conn.nw, conn.ne, conn.se, conn.sw].filter(Boolean).length;

  // Draw road markings
  graphics.lineStyle(2, lineColor, 0.85);

  if (conn.ne) drawDashedLine(graphics, cx, cy, midNE.x, midNE.y, 4, 4);
  if (conn.se) drawDashedLine(graphics, cx, cy, midSE.x, midSE.y, 4, 4);
  if (conn.sw) drawDashedLine(graphics, cx, cy, midSW.x, midSW.y, 4, 4);
  if (conn.nw) drawDashedLine(graphics, cx, cy, midNW.x, midNW.y, 4, 4);

  if (connCount === 0) {
    graphics.lineStyle(0);
    graphics.beginFill(lineColor, 0.6);
    graphics.drawCircle(cx, cy, 4);
    graphics.endFill();
  }

  if (connCount === 2) {
    if (conn.ne && conn.sw) {
      graphics.lineStyle(2, lineColor, 0.85);
      graphics.moveTo(midNE.x, midNE.y);
      graphics.lineTo(midSW.x, midSW.y);
    } else if (conn.nw && conn.se) {
      graphics.lineStyle(2, lineColor, 0.85);
      graphics.moveTo(midNW.x, midNW.y);
      graphics.lineTo(midSE.x, midSE.y);
    }
  }

  // White edge lines
  graphics.lineStyle(1, whiteLineColor, 0.2);
  graphics.moveTo(top.x, top.y);
  graphics.lineTo(right.x, right.y);
  graphics.lineTo(bottom.x, bottom.y);
  graphics.lineTo(left.x, left.y);
  graphics.closePath();

  graphics.zIndex = y * GRID_SIZE + x;
  return graphics;
}
