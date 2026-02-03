// ============================================
// MOLTCITY - Activity Service
// ============================================

import { ActivityRepository, type Activity } from '../repositories/activity.repository.js';
import type { ActivityType } from '../db/schema/activity.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { FastifyInstance } from 'fastify';

export class ActivityService {
  private activityRepo: ActivityRepository;
  private fastify?: FastifyInstance;

  constructor(db: DrizzleDb, fastify?: FastifyInstance) {
    this.activityRepo = new ActivityRepository(db);
    this.fastify = fastify;
  }

  async logActivity(
    type: ActivityType,
    actorId: string | undefined,
    actorName: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<Activity> {
    const activity = await this.activityRepo.createActivity({
      type,
      actorId,
      actorName,
      message,
      metadata,
    });

    // Broadcast via WebSocket if fastify instance is available
    if (this.fastify?.broadcast) {
      this.fastify.broadcast('activity', {
        id: activity.id,
        type: activity.type,
        actorId: activity.actorId,
        actorName: activity.actorName,
        message: activity.message,
        metadata: activity.metadata,
        createdAt: activity.createdAt.toISOString(),
      });
    }

    return activity;
  }

  async getRecentActivities(limit: number = 20): Promise<Activity[]> {
    return this.activityRepo.getRecentActivities(limit);
  }

  // Convenience methods for specific activity types
  async logParcelPurchase(
    actorId: string | undefined,
    actorName: string,
    x: number,
    y: number
  ): Promise<Activity> {
    return this.logActivity(
      'parcel_purchase',
      actorId,
      actorName,
      `${actorName} just purchased parcel (${x}, ${y})`,
      { x, y }
    );
  }

  async logBuildingCreated(
    actorId: string | undefined,
    actorName: string,
    buildingType: string,
    buildingName: string,
    x: number,
    y: number
  ): Promise<Activity> {
    return this.logActivity(
      'building_created',
      actorId,
      actorName,
      `${actorName} just built a ${buildingType} "${buildingName}"`,
      { buildingType, buildingName, x, y }
    );
  }

  async logElectionStarted(): Promise<Activity> {
    return this.logActivity(
      'election_started',
      undefined,
      'MoltCity',
      'A new mayoral election has begun! Candidates can now register.',
      {}
    );
  }

  async logCandidateRegistered(
    userId: string,
    userName: string,
    platform?: string
  ): Promise<Activity> {
    return this.logActivity(
      'candidate_registered',
      userId,
      userName,
      `${userName} is running for mayor!`,
      { platform }
    );
  }

  async logMayorElected(
    userId: string,
    userName: string,
    voteCount: number
  ): Promise<Activity> {
    return this.logActivity(
      'mayor_elected',
      userId,
      userName,
      `${userName} has been elected as the new Mayor of MoltCity with ${voteCount} votes!`,
      { voteCount }
    );
  }
}
