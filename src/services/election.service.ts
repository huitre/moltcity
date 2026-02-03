// ============================================
// MOLTCITY - Election Service
// ============================================

import { ElectionRepository, type Election, type Candidate } from '../repositories/election.repository.js';
import { UserRepository, type User } from '../repositories/user.repository.js';
import { ActivityService } from './activity.service.js';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../plugins/error-handler.plugin.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { FastifyInstance } from 'fastify';

// Election timing (in hours)
const NOMINATION_DURATION = 72; // 3 days
const VOTING_DURATION = 48; // 2 days

export interface ElectionStatus {
  election: Election | null;
  candidates: Candidate[];
  currentMayor: { id: string; name: string } | null;
  phase: 'none' | 'nomination' | 'voting' | 'completed';
  timeRemaining?: number; // milliseconds
}

export class ElectionService {
  private electionRepo: ElectionRepository;
  private userRepo: UserRepository;
  private activityService: ActivityService;
  private fastify?: FastifyInstance;

  constructor(db: DrizzleDb, fastify?: FastifyInstance) {
    this.electionRepo = new ElectionRepository(db);
    this.userRepo = new UserRepository(db);
    this.activityService = new ActivityService(db, fastify);
    this.fastify = fastify;
  }

  async startElection(): Promise<Election> {
    // Check if there's already an active election
    const existingElection = await this.electionRepo.getCurrentElection();
    if (existingElection) {
      throw new ConflictError('An election is already in progress');
    }

    const election = await this.electionRepo.createElection(NOMINATION_DURATION);

    // Log activity
    await this.activityService.logElectionStarted();

    // Broadcast election started
    if (this.fastify?.broadcast) {
      this.fastify.broadcast('election_started', {
        electionId: election.id,
        nominationStart: election.nominationStart.toISOString(),
        nominationEnds: new Date(election.nominationStart.getTime() + NOMINATION_DURATION * 60 * 60 * 1000).toISOString(),
      });
    }

    return election;
  }

  async runForMayor(userId: string, platform?: string): Promise<Candidate> {
    const election = await this.electionRepo.getCurrentElection();
    if (!election) {
      throw new NotFoundError('No active election');
    }

    if (election.status !== 'nomination') {
      throw new ForbiddenError('Nomination period has ended');
    }

    // Check if user is already a candidate
    const existingCandidate = await this.electionRepo.getCandidateByUserId(election.id, userId);
    if (existingCandidate) {
      throw new ConflictError('You are already registered as a candidate');
    }

    // Get user info
    const user = await this.userRepo.getUser(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    const candidate = await this.electionRepo.addCandidate(election.id, userId, platform);

    // Log activity
    await this.activityService.logCandidateRegistered(userId, user.name, platform);

    // Broadcast candidate registered
    if (this.fastify?.broadcast) {
      this.fastify.broadcast('candidate_registered', {
        electionId: election.id,
        candidate: {
          id: candidate.id,
          userId: candidate.userId,
          userName: user.name,
          platform: candidate.platform,
        },
      });
    }

    return { ...candidate, userName: user.name };
  }

  async vote(voterId: string, candidateId: string): Promise<void> {
    const election = await this.electionRepo.getCurrentElection();
    if (!election) {
      throw new NotFoundError('No active election');
    }

    if (election.status !== 'voting') {
      throw new ForbiddenError('Voting period is not active');
    }

    // Check if already voted
    const hasVoted = await this.electionRepo.hasVoted(election.id, voterId);
    if (hasVoted) {
      throw new ConflictError('You have already voted in this election');
    }

    // Verify candidate exists
    const candidate = await this.electionRepo.getCandidateById(candidateId);
    if (!candidate || candidate.electionId !== election.id) {
      throw new NotFoundError('Candidate');
    }

    await this.electionRepo.castVote(election.id, voterId, candidateId);

    // Broadcast vote cast (anonymous)
    if (this.fastify?.broadcast) {
      this.fastify.broadcast('vote_cast', {
        electionId: election.id,
      });
    }
  }

  async transitionToVoting(electionId: string): Promise<void> {
    const election = await this.electionRepo.getElectionById(electionId);
    if (!election || election.status !== 'nomination') {
      return;
    }

    const votingStart = new Date();
    const votingEnd = new Date(votingStart.getTime() + VOTING_DURATION * 60 * 60 * 1000);

    await this.electionRepo.updateElectionStatus(electionId, 'voting', {
      votingStart,
      votingEnd,
    });

    // Broadcast voting started
    if (this.fastify?.broadcast) {
      this.fastify.broadcast('voting_started', {
        electionId,
        votingStart: votingStart.toISOString(),
        votingEnd: votingEnd.toISOString(),
      });
    }
  }

  async tallyVotes(): Promise<{ winnerId: string; winnerName: string; voteCount: number } | null> {
    const election = await this.electionRepo.getCurrentElection();
    if (!election || election.status !== 'voting') {
      return null;
    }

    const candidatesWithVotes = await this.electionRepo.getCandidatesWithVotes(election.id);
    if (candidatesWithVotes.length === 0) {
      // No candidates, complete election without winner
      await this.electionRepo.updateElectionStatus(election.id, 'completed');
      return null;
    }

    // Find winner (highest votes)
    const winner = candidatesWithVotes.reduce((prev, curr) =>
      (curr.voteCount || 0) > (prev.voteCount || 0) ? curr : prev
    );

    // Update election with winner
    await this.electionRepo.updateElectionStatus(election.id, 'completed', {
      winnerId: winner.userId,
    });

    // Appoint new mayor
    await this.appointMayor(winner.userId);

    // Get winner name
    const winnerUser = await this.userRepo.getUser(winner.userId);
    const winnerName = winnerUser?.name || 'Unknown';

    // Log activity
    await this.activityService.logMayorElected(winner.userId, winnerName, winner.voteCount || 0);

    // Broadcast election completed
    if (this.fastify?.broadcast) {
      this.fastify.broadcast('election_completed', {
        electionId: election.id,
        winnerId: winner.userId,
        winnerName,
        voteCount: winner.voteCount || 0,
      });
    }

    return {
      winnerId: winner.userId,
      winnerName,
      voteCount: winner.voteCount || 0,
    };
  }

  async appointMayor(userId: string): Promise<void> {
    // First, revoke previous mayor's role
    const currentMayor = await this.getCurrentMayor();
    if (currentMayor) {
      await this.userRepo.updateRole(currentMayor.id, 'user');
    }

    // Set new mayor
    await this.userRepo.updateRole(userId, 'mayor');
  }

  async getCurrentMayor(): Promise<{ id: string; name: string } | null> {
    const mayor = await this.userRepo.getUserByRole('mayor');
    if (mayor) {
      return { id: mayor.id, name: mayor.name };
    }
    return null;
  }

  async getElectionStatus(): Promise<ElectionStatus> {
    const election = await this.electionRepo.getCurrentElection();
    const currentMayor = await this.getCurrentMayor();

    if (!election) {
      return {
        election: null,
        candidates: [],
        currentMayor,
        phase: 'none',
      };
    }

    const candidates = await this.electionRepo.getCandidatesWithVotes(election.id);
    const now = Date.now();
    let timeRemaining: number | undefined;

    if (election.status === 'nomination') {
      const nominationEnd = new Date(election.nominationStart.getTime() + NOMINATION_DURATION * 60 * 60 * 1000);
      timeRemaining = Math.max(0, nominationEnd.getTime() - now);
    } else if (election.status === 'voting' && election.votingEnd) {
      timeRemaining = Math.max(0, election.votingEnd.getTime() - now);
    }

    return {
      election,
      candidates,
      currentMayor,
      phase: election.status,
      timeRemaining,
    };
  }

  async checkAndTransitionElection(): Promise<void> {
    const election = await this.electionRepo.getCurrentElection();
    if (!election) return;

    const now = Date.now();

    if (election.status === 'nomination') {
      const nominationEnd = election.nominationStart.getTime() + NOMINATION_DURATION * 60 * 60 * 1000;
      if (now >= nominationEnd) {
        await this.transitionToVoting(election.id);
      }
    } else if (election.status === 'voting' && election.votingEnd) {
      if (now >= election.votingEnd.getTime()) {
        await this.tallyVotes();
      }
    }
  }
}
