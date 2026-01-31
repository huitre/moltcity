// ============================================
// MOLTCITY - Pathfinding Tests
// ============================================

import { describe, it, expect, beforeEach } from 'vitest';
import { Pathfinder, WalkingPathfinder } from '../src/simulation/pathfinding.js';
import type { Road } from '../src/models/types.js';

// Helper to create mock roads
function createMockRoad(x: number, y: number, direction: 'horizontal' | 'vertical' = 'horizontal', trafficLoad = 0): Road {
  return {
    id: `road_${x}_${y}`,
    parcelId: `parcel_${x}_${y}`,
    direction,
    lanes: 2,
    trafficLoad,
    createdAt: Date.now(),
  };
}

describe('Pathfinder (Road-based)', () => {
  describe('Basic Pathfinding', () => {
    it('should find a straight horizontal path', () => {
      const roads: Road[] = [
        createMockRoad(0, 0),
        createMockRoad(1, 0),
        createMockRoad(2, 0),
        createMockRoad(3, 0),
      ];

      const pathfinder = new Pathfinder(roads, 10, 10);
      const path = pathfinder.findPath({ x: 0, y: 0 }, { x: 3, y: 0 });

      expect(path.length).toBe(4);
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path[3]).toEqual({ x: 3, y: 0 });
    });

    it('should find a straight vertical path', () => {
      const roads: Road[] = [
        createMockRoad(0, 0),
        createMockRoad(0, 1),
        createMockRoad(0, 2),
        createMockRoad(0, 3),
      ];

      const pathfinder = new Pathfinder(roads, 10, 10);
      const path = pathfinder.findPath({ x: 0, y: 0 }, { x: 0, y: 3 });

      expect(path.length).toBe(4);
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path[3]).toEqual({ x: 0, y: 3 });
    });

    it('should find an L-shaped path', () => {
      const roads: Road[] = [
        createMockRoad(0, 0),
        createMockRoad(1, 0),
        createMockRoad(2, 0),
        createMockRoad(2, 1),
        createMockRoad(2, 2),
      ];

      const pathfinder = new Pathfinder(roads, 10, 10);
      const path = pathfinder.findPath({ x: 0, y: 0 }, { x: 2, y: 2 });

      expect(path.length).toBe(5);
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path[path.length - 1]).toEqual({ x: 2, y: 2 });
    });

    it('should return empty array when no path exists', () => {
      const roads: Road[] = [
        createMockRoad(0, 0),
        createMockRoad(1, 0),
        // Gap - no road at (2,0)
        createMockRoad(3, 0),
        createMockRoad(4, 0),
      ];

      const pathfinder = new Pathfinder(roads, 10, 10);
      const path = pathfinder.findPath({ x: 0, y: 0 }, { x: 4, y: 0 });

      expect(path).toEqual([]);
    });

    it('should return single-node path when start equals goal', () => {
      const roads: Road[] = [
        createMockRoad(5, 5),
      ];

      const pathfinder = new Pathfinder(roads, 10, 10);
      const path = pathfinder.findPath({ x: 5, y: 5 }, { x: 5, y: 5 });

      expect(path.length).toBe(1);
      expect(path[0]).toEqual({ x: 5, y: 5 });
    });
  });

  describe('isRoad', () => {
    it('should correctly identify road tiles', () => {
      const roads: Road[] = [
        createMockRoad(1, 1),
        createMockRoad(2, 2),
      ];

      const pathfinder = new Pathfinder(roads, 10, 10);

      expect(pathfinder.isRoad(1, 1)).toBe(true);
      expect(pathfinder.isRoad(2, 2)).toBe(true);
      expect(pathfinder.isRoad(0, 0)).toBe(false);
      expect(pathfinder.isRoad(5, 5)).toBe(false);
    });
  });

  describe('Traffic-aware Pathfinding', () => {
    it('should prefer low-traffic roads', () => {
      // Create two parallel paths:
      // Path 1 (top): low traffic
      // Path 2 (bottom): high traffic
      const roads: Road[] = [
        // Start
        createMockRoad(0, 0, 'horizontal', 0),
        // Top path (low traffic)
        createMockRoad(1, 0, 'horizontal', 0.1),
        createMockRoad(2, 0, 'horizontal', 0.1),
        createMockRoad(3, 0, 'horizontal', 0.1),
        // Connection
        createMockRoad(0, 1, 'vertical', 0),
        createMockRoad(3, 1, 'vertical', 0),
        // Bottom path (high traffic)
        createMockRoad(1, 1, 'horizontal', 0.9),
        createMockRoad(2, 1, 'horizontal', 0.9),
        // Goal
        createMockRoad(4, 0, 'horizontal', 0),
        createMockRoad(4, 1, 'horizontal', 0),
      ];

      const pathfinder = new Pathfinder(roads, 10, 10);
      const path = pathfinder.findPath({ x: 0, y: 0 }, { x: 4, y: 0 });

      // Should prefer the top path (y=0) due to lower traffic
      const usesTopPath = path.every(coord => coord.y === 0);
      expect(usesTopPath).toBe(true);
    });
  });

  describe('updateRoads', () => {
    it('should update road network', () => {
      const initialRoads: Road[] = [
        createMockRoad(0, 0),
        createMockRoad(1, 0),
      ];

      const pathfinder = new Pathfinder(initialRoads, 10, 10);
      expect(pathfinder.isRoad(2, 0)).toBe(false);

      // Update with new road
      const updatedRoads: Road[] = [
        ...initialRoads,
        createMockRoad(2, 0),
      ];
      pathfinder.updateRoads(updatedRoads);

      expect(pathfinder.isRoad(2, 0)).toBe(true);
    });

    it('should handle road removal', () => {
      const initialRoads: Road[] = [
        createMockRoad(0, 0),
        createMockRoad(1, 0),
        createMockRoad(2, 0),
      ];

      const pathfinder = new Pathfinder(initialRoads, 10, 10);
      expect(pathfinder.isRoad(1, 0)).toBe(true);

      // Remove middle road
      const updatedRoads: Road[] = [
        createMockRoad(0, 0),
        createMockRoad(2, 0),
      ];
      pathfinder.updateRoads(updatedRoads);

      expect(pathfinder.isRoad(1, 0)).toBe(false);

      // Path should no longer be possible
      const path = pathfinder.findPath({ x: 0, y: 0 }, { x: 2, y: 0 });
      expect(path).toEqual([]);
    });
  });

  describe('Grid Bounds', () => {
    it('should respect grid boundaries', () => {
      const roads: Road[] = [
        createMockRoad(0, 0),
        createMockRoad(9, 9),
      ];

      const pathfinder = new Pathfinder(roads, 10, 10);

      // Can't find path since there's no road connection
      const path = pathfinder.findPath({ x: 0, y: 0 }, { x: 9, y: 9 });
      expect(path).toEqual([]);
    });
  });
});

describe('WalkingPathfinder', () => {
  describe('Basic Walking', () => {
    it('should find a direct path without obstacles', () => {
      const pathfinder = new WalkingPathfinder(10, 10);
      const path = pathfinder.findPath({ x: 0, y: 0 }, { x: 3, y: 3 });

      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path[path.length - 1]).toEqual({ x: 3, y: 3 });
    });

    it('should allow diagonal movement', () => {
      const pathfinder = new WalkingPathfinder(10, 10);
      const path = pathfinder.findPath({ x: 0, y: 0 }, { x: 2, y: 2 });

      // Diagonal path should be shorter than Manhattan
      expect(path.length).toBeLessThanOrEqual(3);
    });

    it('should return single-node path when start equals goal', () => {
      const pathfinder = new WalkingPathfinder(10, 10);
      const path = pathfinder.findPath({ x: 5, y: 5 }, { x: 5, y: 5 });

      expect(path.length).toBe(1);
      expect(path[0]).toEqual({ x: 5, y: 5 });
    });
  });

  describe('Obstacle Handling', () => {
    it('should navigate around obstacles', () => {
      const pathfinder = new WalkingPathfinder(10, 10);

      // Create a wall blocking direct path
      pathfinder.setObstacles([
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 2, y: 2 },
        { x: 2, y: 3 },
      ]);

      const path = pathfinder.findPath({ x: 0, y: 2 }, { x: 4, y: 2 });

      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual({ x: 0, y: 2 });
      expect(path[path.length - 1]).toEqual({ x: 4, y: 2 });

      // Verify path doesn't go through obstacles
      for (const coord of path) {
        expect(coord.x !== 2 || coord.y > 3).toBe(true);
      }
    });

    it('should return empty array when completely blocked', () => {
      const pathfinder = new WalkingPathfinder(5, 5);

      // Completely surround the goal
      pathfinder.setObstacles([
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 4, y: 1 },
        { x: 2, y: 2 },
        { x: 4, y: 2 },
        { x: 2, y: 3 },
        { x: 3, y: 3 },
        { x: 4, y: 3 },
      ]);

      const path = pathfinder.findPath({ x: 0, y: 0 }, { x: 3, y: 2 });
      expect(path).toEqual([]);
    });

    it('should update obstacles correctly', () => {
      const pathfinder = new WalkingPathfinder(10, 10);

      // Block path
      pathfinder.setObstacles([
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 2 },
      ]);

      let path = pathfinder.findPath({ x: 0, y: 1 }, { x: 2, y: 1 });
      const blockedLength = path.length;

      // Clear obstacles
      pathfinder.setObstacles([]);

      path = pathfinder.findPath({ x: 0, y: 1 }, { x: 2, y: 1 });

      // Path should be shorter without obstacles
      expect(path.length).toBeLessThan(blockedLength);
    });
  });

  describe('Grid Bounds', () => {
    it('should respect grid boundaries', () => {
      const pathfinder = new WalkingPathfinder(5, 5);

      // Try to path to an out-of-bounds location
      // The pathfinder should not go outside bounds
      const path = pathfinder.findPath({ x: 0, y: 0 }, { x: 4, y: 4 });

      for (const coord of path) {
        expect(coord.x).toBeGreaterThanOrEqual(0);
        expect(coord.x).toBeLessThan(5);
        expect(coord.y).toBeGreaterThanOrEqual(0);
        expect(coord.y).toBeLessThan(5);
      }
    });
  });

  describe('Complex Scenarios', () => {
    it('should find path through a maze', () => {
      const pathfinder = new WalkingPathfinder(7, 7);

      // Create a simple maze
      // # = obstacle, S = start, G = goal
      // S . . # . . .
      // . # . # . # .
      // . # . . . # .
      // . # # # . # .
      // . . . # . # .
      // . # . # . # .
      // . . . . . . G
      pathfinder.setObstacles([
        { x: 3, y: 0 },
        { x: 1, y: 1 }, { x: 3, y: 1 }, { x: 5, y: 1 },
        { x: 1, y: 2 }, { x: 5, y: 2 },
        { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 5, y: 3 },
        { x: 3, y: 4 }, { x: 5, y: 4 },
        { x: 1, y: 5 }, { x: 3, y: 5 }, { x: 5, y: 5 },
      ]);

      const path = pathfinder.findPath({ x: 0, y: 0 }, { x: 6, y: 6 });

      expect(path.length).toBeGreaterThan(0);
      expect(path[path.length - 1]).toEqual({ x: 6, y: 6 });
    });
  });
});
