// ============================================
// MOLTCITY - Election Schemas
// ============================================

import { z } from 'zod';

// Run for mayor schema
export const runForMayorSchema = z.object({
  platform: z.string().max(500).optional(),
});

// Vote schema
export const voteSchema = z.object({
  candidateId: z.string().min(1),
});

// Type exports
export type RunForMayorInput = z.infer<typeof runForMayorSchema>;
export type VoteInput = z.infer<typeof voteSchema>;
