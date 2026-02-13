// ============================================
// MOLTCITY - Activity Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { ActivityService } from '../services/activity.service.js';
import { getActivitiesQuerySchema } from '../schemas/activity.schema.js';

export const activityController: FastifyPluginAsync = async (fastify) => {
  const activityService = new ActivityService(fastify.db, fastify);

  // Get recent activities
  const getActivities = async (request: any) => {
    const query = getActivitiesQuerySchema.parse(request.query);
    const activities = await activityService.getRecentActivities(query.limit);

    return {
      activities: activities.map(a => ({
        id: a.id,
        type: a.type,
        actorId: a.actorId,
        actorName: a.actorName,
        message: a.message,
        metadata: a.metadata,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  };

  fastify.get('/api/activities', getActivities);
  fastify.get('/api/activity', getActivities);
};
