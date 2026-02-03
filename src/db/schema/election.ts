// ============================================
// MOLTCITY - Election Schema (Mayor Elections)
// ============================================

import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { users } from './auth.js';

// Election status
export type ElectionStatus = 'nomination' | 'voting' | 'completed';

// Mayor Elections
export const mayorElections = sqliteTable('mayor_elections', {
  id: text('id').primaryKey(),
  status: text('status').notNull(), // ElectionStatus
  nominationStart: integer('nomination_start', { mode: 'timestamp' }).notNull(),
  votingStart: integer('voting_start', { mode: 'timestamp' }),
  votingEnd: integer('voting_end', { mode: 'timestamp' }),
  winnerId: text('winner_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  index('idx_elections_status').on(table.status),
  index('idx_elections_created_at').on(table.createdAt),
]);

// Election Candidates
export const electionCandidates = sqliteTable('election_candidates', {
  id: text('id').primaryKey(),
  electionId: text('election_id').notNull().references(() => mayorElections.id),
  userId: text('user_id').notNull().references(() => users.id),
  platform: text('platform'), // Campaign message
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  index('idx_candidates_election').on(table.electionId),
  index('idx_candidates_user').on(table.userId),
]);

// Votes
export const votes = sqliteTable('votes', {
  id: text('id').primaryKey(),
  electionId: text('election_id').notNull().references(() => mayorElections.id),
  voterId: text('voter_id').notNull().references(() => users.id),
  candidateId: text('candidate_id').notNull().references(() => electionCandidates.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  index('idx_votes_election').on(table.electionId),
  index('idx_votes_voter').on(table.voterId),
  unique('unique_vote').on(table.electionId, table.voterId),
]);

// Type exports
export type MayorElectionRow = typeof mayorElections.$inferSelect;
export type MayorElectionInsert = typeof mayorElections.$inferInsert;

export type ElectionCandidateRow = typeof electionCandidates.$inferSelect;
export type ElectionCandidateInsert = typeof electionCandidates.$inferInsert;

export type VoteRow = typeof votes.$inferSelect;
export type VoteInsert = typeof votes.$inferInsert;
