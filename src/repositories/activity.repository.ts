// ============================================
// MOLTCITY - Activity Repository
// ============================================

import { desc, eq, and } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { activities, type ActivityRow, type ActivityInsert, type ActivityType } from '../db/schema/activity.js';
import type { DrizzleDb } from '../db/drizzle.js';

export interface Activity {
  id: string;
  type: ActivityType;
  actorId: string | null;
  actorName: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export class ActivityRepository extends BaseRepository<typeof activities, ActivityRow, ActivityInsert> {
  constructor(db: DrizzleDb) {
    super(db, activities);
  }

  async createActivity(data: {
    type: ActivityType;
    actorId?: string;
    actorName: string;
    message: string;
    metadata?: Record<string, unknown>;
    cityId?: string;
  }): Promise<Activity> {
    const id = this.generateId();
    const now = new Date();

    await this.db.insert(activities).values({
      id,
      type: data.type,
      cityId: data.cityId || null,
      actorId: data.actorId || null,
      actorName: data.actorName,
      message: data.message,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      createdAt: now,
    });

    return {
      id,
      type: data.type,
      actorId: data.actorId || null,
      actorName: data.actorName,
      message: data.message,
      metadata: data.metadata || null,
      createdAt: now,
    };
  }

  async getRecentActivities(limit: number = 20, cityId?: string): Promise<Activity[]> {
    let query = this.db
      .select()
      .from(activities)
      .orderBy(desc(activities.createdAt))
      .limit(limit);

    if (cityId) {
      query = query.where(eq(activities.cityId, cityId)) as typeof query;
    }

    const results = await query;
    return results.map(row => this.rowToActivity(row));
  }

  private rowToActivity(row: ActivityRow): Activity {
    return {
      id: row.id,
      type: row.type as ActivityType,
      actorId: row.actorId,
      actorName: row.actorName,
      message: row.message,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.createdAt,
    };
  }
}
