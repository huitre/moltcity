// ============================================
// MOLTCITY - Procedural Water Generation
// ============================================

/**
 * Mulberry32 PRNG (same algorithm as client's seededRandom)
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash a string to a numeric seed
 */
function hashSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Generate water tiles (river + lake) for a city.
 * Pure function: deterministic based on seed string.
 *
 * Returns deduplicated {x, y} pairs for water tiles.
 */
export function generateWaterTiles(
  seed: string,
  gridSize: number
): { x: number; y: number }[] {
  const rng = mulberry32(hashSeed(seed));

  const waterSet = new Set<string>();
  const tiles: { x: number; y: number }[] = [];

  function addTile(x: number, y: number) {
    if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) return;
    const key = `${x},${y}`;
    if (waterSet.has(key)) return;
    waterSet.add(key);
    tiles.push({ x, y });
  }

  // Pick river orientation: horizontal (along x) or vertical (along y)
  const horizontal = rng() < 0.5;

  const primarySize = gridSize;
  const baseCenter = Math.floor(gridSize * (0.3 + rng() * 0.4)); // center 30-70%
  const freq = 0.08 + rng() * 0.08; // wave frequency
  const amplitude = 2 + rng() * 4; // wave amplitude
  const baseWidth = 2;

  // Lake: pick a random point along the river to widen
  const lakePoint = Math.floor(primarySize * (0.25 + rng() * 0.5));
  const lakeRadius = 3 + Math.floor(rng() * 4); // 3-6

  for (let i = 0; i < primarySize; i++) {
    // River centerline with sine wave + small noise
    const noise = (rng() - 0.5) * 1.5;
    const center = baseCenter + Math.sin(i * freq) * amplitude + noise;

    // Width widens near lake point using Gaussian-like falloff
    const dist = Math.abs(i - lakePoint);
    const lakeWidening =
      dist < lakeRadius * 2
        ? Math.max(0, Math.pow(1 - dist / (lakeRadius * 2), 2)) * lakeRadius
        : 0;
    const halfWidth = Math.ceil((baseWidth + lakeWidening) / 2);

    for (let offset = -halfWidth; offset <= halfWidth; offset++) {
      const pos = Math.round(center) + offset;
      if (horizontal) {
        addTile(i, pos);
      } else {
        addTile(pos, i);
      }
    }
  }

  return tiles;
}
