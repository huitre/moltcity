// ============================================
// MOLTCITY - Road Repository
// ============================================

import { eq } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { roads, type RoadRow, type RoadInsert } from '../db/schema/roads.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { Road, RoadDirection } from '../models/types.js';

export class RoadRepository extends BaseRepository<typeof roads, RoadRow, RoadInsert> {
  constructor(db: DrizzleDb) {
    super(db, roads);
  }

  async getRoad(parcelId: string): Promise<Road | null> {
    const results = await this.db
      .select()
      .from(roads)
      .where(eq(roads.parcelId, parcelId))
      .limit(1);
    return results.length > 0 ? this.rowToRoad(results[0]) : null;
  }

  async getRoadById(id: string): Promise<Road | null> {
    const result = await this.findById(id, roads.id);
    return result ? this.rowToRoad(result) : null;
  }

  async getAllRoads(): Promise<Road[]> {
    const results = await this.findAll();
    return results.map(row => this.rowToRoad(row));
  }

  async createRoad(parcelId: string, direction: RoadDirection, lanes: number = 2): Promise<Road> {
    const id = this.generateId();
    await this.db.insert(roads).values({
      id,
      parcelId,
      direction,
      lanes,
    });
    return (await this.getRoad(parcelId))!;
  }

  async updateTrafficLoad(roadId: string, load: number): Promise<void> {
    await this.db
      .update(roads)
      .set({ trafficLoad: load })
      .where(eq(roads.id, roadId));
  }

  async deleteRoad(roadId: string): Promise<boolean> {
    return this.deleteById(roadId, roads.id);
  }

  private rowToRoad(row: RoadRow): Road {
    return {
      id: row.id,
      parcelId: row.parcelId,
      direction: row.direction as RoadDirection,
      lanes: row.lanes,
      trafficLoad: row.trafficLoad,
      speedLimit: row.speedLimit,
    };
  }
}
