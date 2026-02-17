// ============================================
// MOLTCITY - Election Repository
// ============================================

import { eq, desc, sql, and } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import {
  mayorElections,
  electionCandidates,
  votes,
  type MayorElectionRow,
  type MayorElectionInsert,
  type ElectionCandidateRow,
  type ElectionStatus,
} from '../db/schema/election.js';
import { users } from '../db/schema/auth.js';
import type { DrizzleDb } from '../db/drizzle.js';

export interface Election {
  id: string;
  cityId: string;
  status: ElectionStatus;
  nominationStart: Date;
  votingStart: Date | null;
  votingEnd: Date | null;
  winnerId: string | null;
  createdAt: Date;
}

export interface Candidate {
  id: string;
  electionId: string;
  userId: string;
  userName?: string;
  platform: string | null;
  createdAt: Date;
  voteCount?: number;
}

export interface VoteCount {
  candidateId: string;
  count: number;
}

export class ElectionRepository extends BaseRepository<typeof mayorElections, MayorElectionRow, MayorElectionInsert> {
  constructor(db: DrizzleDb) {
    super(db, mayorElections);
  }

  async createElection(cityId: string, nominationDurationHours: number = 72): Promise<Election> {
    const id = this.generateId();
    const now = new Date();

    await this.db.insert(mayorElections).values({
      id,
      cityId,
      status: 'nomination',
      nominationStart: now,
      createdAt: now,
    });

    return {
      id,
      cityId,
      status: 'nomination',
      nominationStart: now,
      votingStart: null,
      votingEnd: null,
      winnerId: null,
      createdAt: now,
    };
  }

  async getCurrentElection(cityId?: string): Promise<Election | null> {
    const conditions = [sql`${mayorElections.status} IN ('nomination', 'voting')`];
    if (cityId) {
      conditions.push(sql`${mayorElections.cityId} = ${cityId}`);
    }
    const results = await this.db
      .select()
      .from(mayorElections)
      .where(and(...conditions))
      .orderBy(desc(mayorElections.createdAt))
      .limit(1);

    return results.length > 0 ? this.rowToElection(results[0]) : null;
  }

  async getElectionById(id: string): Promise<Election | null> {
    const result = await this.findById(id, mayorElections.id);
    return result ? this.rowToElection(result) : null;
  }

  async getLastCompletedElection(): Promise<Election | null> {
    const results = await this.db
      .select()
      .from(mayorElections)
      .where(eq(mayorElections.status, 'completed'))
      .orderBy(desc(mayorElections.createdAt))
      .limit(1);

    return results.length > 0 ? this.rowToElection(results[0]) : null;
  }

  async updateElectionStatus(
    electionId: string,
    status: ElectionStatus,
    updates?: { votingStart?: Date; votingEnd?: Date; winnerId?: string }
  ): Promise<void> {
    await this.db
      .update(mayorElections)
      .set({
        status,
        ...(updates?.votingStart && { votingStart: updates.votingStart }),
        ...(updates?.votingEnd && { votingEnd: updates.votingEnd }),
        ...(updates?.winnerId && { winnerId: updates.winnerId }),
      })
      .where(eq(mayorElections.id, electionId));
  }

  async addCandidate(electionId: string, userId: string, platform?: string): Promise<Candidate> {
    const id = this.generateId();
    const now = new Date();

    await this.db.insert(electionCandidates).values({
      id,
      electionId,
      userId,
      platform: platform || null,
      createdAt: now,
    });

    return {
      id,
      electionId,
      userId,
      platform: platform || null,
      createdAt: now,
    };
  }

  async getCandidateByUserId(electionId: string, userId: string): Promise<Candidate | null> {
    const results = await this.db
      .select()
      .from(electionCandidates)
      .where(
        and(
          eq(electionCandidates.electionId, electionId),
          eq(electionCandidates.userId, userId)
        )
      )
      .limit(1);

    return results.length > 0 ? this.rowToCandidate(results[0]) : null;
  }

  async getCandidates(electionId: string): Promise<Candidate[]> {
    const results = await this.db
      .select({
        id: electionCandidates.id,
        electionId: electionCandidates.electionId,
        userId: electionCandidates.userId,
        userName: users.name,
        platform: electionCandidates.platform,
        createdAt: electionCandidates.createdAt,
      })
      .from(electionCandidates)
      .leftJoin(users, eq(electionCandidates.userId, users.id))
      .where(eq(electionCandidates.electionId, electionId));

    return results.map(row => ({
      id: row.id,
      electionId: row.electionId,
      userId: row.userId,
      userName: row.userName || undefined,
      platform: row.platform,
      createdAt: row.createdAt,
    }));
  }

  async getCandidateById(candidateId: string): Promise<Candidate | null> {
    const results = await this.db
      .select()
      .from(electionCandidates)
      .where(eq(electionCandidates.id, candidateId))
      .limit(1);

    return results.length > 0 ? this.rowToCandidate(results[0]) : null;
  }

  async castVote(electionId: string, voterId: string, candidateId: string): Promise<void> {
    const id = this.generateId();
    const now = new Date();

    await this.db.insert(votes).values({
      id,
      electionId,
      voterId,
      candidateId,
      createdAt: now,
    });
  }

  async hasVoted(electionId: string, voterId: string): Promise<boolean> {
    const results = await this.db
      .select()
      .from(votes)
      .where(
        and(
          eq(votes.electionId, electionId),
          eq(votes.voterId, voterId)
        )
      )
      .limit(1);

    return results.length > 0;
  }

  async getVoteCounts(electionId: string): Promise<VoteCount[]> {
    const results = await this.db
      .select({
        candidateId: votes.candidateId,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(votes)
      .where(eq(votes.electionId, electionId))
      .groupBy(votes.candidateId);

    return results;
  }

  async getCandidatesWithVotes(electionId: string): Promise<Candidate[]> {
    const candidates = await this.getCandidates(electionId);
    const voteCounts = await this.getVoteCounts(electionId);

    const voteMap = new Map(voteCounts.map(v => [v.candidateId, v.count]));

    return candidates.map(c => ({
      ...c,
      voteCount: voteMap.get(c.id) || 0,
    }));
  }

  private rowToElection(row: MayorElectionRow): Election {
    return {
      id: row.id,
      cityId: row.cityId,
      status: row.status as ElectionStatus,
      nominationStart: row.nominationStart,
      votingStart: row.votingStart,
      votingEnd: row.votingEnd,
      winnerId: row.winnerId,
      createdAt: row.createdAt,
    };
  }

  private rowToCandidate(row: ElectionCandidateRow): Candidate {
    return {
      id: row.id,
      electionId: row.electionId,
      userId: row.userId,
      platform: row.platform,
      createdAt: row.createdAt,
    };
  }
}
