// ============================================
// MOLTCITY - A* Pathfinding for Road Network
// ============================================

import type { Coordinate, Road } from '../models/types.js';

interface PathNode {
  x: number;
  y: number;
  g: number; // Cost from start
  h: number; // Heuristic (estimated cost to goal)
  f: number; // Total cost (g + h)
  parent: PathNode | null;
}

export class Pathfinder {
  private roadMap: Map<string, Road>;
  private gridWidth: number;
  private gridHeight: number;

  constructor(roads: Road[], gridWidth: number, gridHeight: number) {
    this.roadMap = new Map();
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

    // Build road lookup map
    for (const road of roads) {
      // Extract coordinates from parcel_id (format: "parcel_x_y")
      const match = road.parcelId.match(/parcel_(\d+)_(\d+)/);
      if (match) {
        const key = `${match[1]},${match[2]}`;
        this.roadMap.set(key, road);
      }
    }
  }

  /**
   * Find a path from start to goal using A* algorithm
   * Returns array of coordinates, or empty array if no path exists
   */
  findPath(start: Coordinate, goal: Coordinate): Coordinate[] {
    const openSet: PathNode[] = [];
    const closedSet = new Set<string>();

    const startNode: PathNode = {
      x: Math.round(start.x),
      y: Math.round(start.y),
      g: 0,
      h: this.heuristic(start, goal),
      f: 0,
      parent: null,
    };
    startNode.f = startNode.g + startNode.h;

    openSet.push(startNode);

    while (openSet.length > 0) {
      // Find node with lowest f score
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;
      const currentKey = `${current.x},${current.y}`;

      // Check if we've reached the goal
      if (current.x === Math.round(goal.x) && current.y === Math.round(goal.y)) {
        return this.reconstructPath(current);
      }

      closedSet.add(currentKey);

      // Check all neighbors
      const neighbors = this.getNeighbors(current);

      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;

        if (closedSet.has(neighborKey)) {
          continue;
        }

        const tentativeG = current.g + this.getMoveCost(current, neighbor);

        const existingNode = openSet.find(n => n.x === neighbor.x && n.y === neighbor.y);

        if (!existingNode) {
          const node: PathNode = {
            x: neighbor.x,
            y: neighbor.y,
            g: tentativeG,
            h: this.heuristic(neighbor, goal),
            f: 0,
            parent: current,
          };
          node.f = node.g + node.h;
          openSet.push(node);
        } else if (tentativeG < existingNode.g) {
          existingNode.g = tentativeG;
          existingNode.f = existingNode.g + existingNode.h;
          existingNode.parent = current;
        }
      }
    }

    // No path found
    return [];
  }

  /**
   * Check if a coordinate is on a road
   */
  isRoad(x: number, y: number): boolean {
    return this.roadMap.has(`${x},${y}`);
  }

  /**
   * Get valid neighboring cells (on roads)
   */
  private getNeighbors(node: PathNode): Coordinate[] {
    const neighbors: Coordinate[] = [];
    const directions = [
      { dx: 0, dy: -1 },  // North
      { dx: 1, dy: 0 },   // East
      { dx: 0, dy: 1 },   // South
      { dx: -1, dy: 0 },  // West
    ];

    for (const dir of directions) {
      const nx = node.x + dir.dx;
      const ny = node.y + dir.dy;

      // Check bounds
      if (nx < 0 || nx >= this.gridWidth || ny < 0 || ny >= this.gridHeight) {
        continue;
      }

      // Check if there's a road at this position
      if (this.isRoad(nx, ny)) {
        neighbors.push({ x: nx, y: ny });
      }
    }

    return neighbors;
  }

  /**
   * Manhattan distance heuristic
   */
  private heuristic(a: Coordinate, b: Coordinate): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  /**
   * Get movement cost between adjacent cells
   * Could factor in traffic, road type, etc.
   */
  private getMoveCost(from: PathNode, to: Coordinate): number {
    const road = this.roadMap.get(`${to.x},${to.y}`);
    if (road) {
      // Higher traffic = higher cost
      return 1 + road.trafficLoad;
    }
    return 1;
  }

  /**
   * Reconstruct path from goal node back to start
   */
  private reconstructPath(goalNode: PathNode): Coordinate[] {
    const path: Coordinate[] = [];
    let current: PathNode | null = goalNode;

    while (current !== null) {
      path.unshift({ x: current.x, y: current.y });
      current = current.parent;
    }

    return path;
  }

  /**
   * Update road network (call when roads are added/removed)
   */
  updateRoads(roads: Road[]): void {
    this.roadMap.clear();
    for (const road of roads) {
      const match = road.parcelId.match(/parcel_(\d+)_(\d+)/);
      if (match) {
        const key = `${match[1]},${match[2]}`;
        this.roadMap.set(key, road);
      }
    }
  }
}

/**
 * Simple pathfinder for walking (not restricted to roads)
 * Used when agents walk on sidewalks or through open areas
 */
export class WalkingPathfinder {
  private obstacles: Set<string>;
  private gridWidth: number;
  private gridHeight: number;

  constructor(gridWidth: number, gridHeight: number) {
    this.obstacles = new Set();
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
  }

  /**
   * Add obstacles (buildings, water, etc.)
   */
  setObstacles(obstacles: Coordinate[]): void {
    this.obstacles.clear();
    for (const obs of obstacles) {
      this.obstacles.add(`${obs.x},${obs.y}`);
    }
  }

  /**
   * Find walking path using A*
   */
  findPath(start: Coordinate, goal: Coordinate): Coordinate[] {
    const openSet: PathNode[] = [];
    const closedSet = new Set<string>();

    const startNode: PathNode = {
      x: Math.round(start.x),
      y: Math.round(start.y),
      g: 0,
      h: this.heuristic(start, goal),
      f: 0,
      parent: null,
    };
    startNode.f = startNode.g + startNode.h;

    openSet.push(startNode);

    while (openSet.length > 0) {
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;
      const currentKey = `${current.x},${current.y}`;

      if (current.x === Math.round(goal.x) && current.y === Math.round(goal.y)) {
        return this.reconstructPath(current);
      }

      closedSet.add(currentKey);

      const neighbors = this.getNeighbors(current);

      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;

        if (closedSet.has(neighborKey)) {
          continue;
        }

        const tentativeG = current.g + 1; // Uniform cost for walking

        const existingNode = openSet.find(n => n.x === neighbor.x && n.y === neighbor.y);

        if (!existingNode) {
          const node: PathNode = {
            x: neighbor.x,
            y: neighbor.y,
            g: tentativeG,
            h: this.heuristic(neighbor, goal),
            f: 0,
            parent: current,
          };
          node.f = node.g + node.h;
          openSet.push(node);
        } else if (tentativeG < existingNode.g) {
          existingNode.g = tentativeG;
          existingNode.f = existingNode.g + existingNode.h;
          existingNode.parent = current;
        }
      }
    }

    return [];
  }

  private getNeighbors(node: PathNode): Coordinate[] {
    const neighbors: Coordinate[] = [];
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      // Diagonal movement for walking
      { dx: 1, dy: -1 },
      { dx: 1, dy: 1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: -1 },
    ];

    for (const dir of directions) {
      const nx = node.x + dir.dx;
      const ny = node.y + dir.dy;

      if (nx < 0 || nx >= this.gridWidth || ny < 0 || ny >= this.gridHeight) {
        continue;
      }

      if (!this.obstacles.has(`${nx},${ny}`)) {
        neighbors.push({ x: nx, y: ny });
      }
    }

    return neighbors;
  }

  private heuristic(a: Coordinate, b: Coordinate): number {
    // Euclidean distance for diagonal movement
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return Math.sqrt(dx * dx + dy * dy);
  }

  private reconstructPath(goalNode: PathNode): Coordinate[] {
    const path: Coordinate[] = [];
    let current: PathNode | null = goalNode;

    while (current !== null) {
      path.unshift({ x: current.x, y: current.y });
      current = current.parent;
    }

    return path;
  }
}
