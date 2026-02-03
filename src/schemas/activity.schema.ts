// ============================================
// MOLTCITY - Activity Schemas
// ============================================

import { z } from 'zod';

// Get activities query
export const getActivitiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Type exports
export type GetActivitiesQuery = z.infer<typeof getActivitiesQuerySchema>;
