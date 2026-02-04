// ============================================
// MOLTCITY - Election Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { ElectionService } from '../services/election.service.js';
import { runForMayorSchema, voteSchema } from '../schemas/election.schema.js';
import { ForbiddenError } from '../plugins/error-handler.plugin.js';

export const electionController: FastifyPluginAsync = async (fastify) => {
  const electionService = new ElectionService(fastify.db, fastify);

  // Get current election status
  fastify.get('/api/election', async (request, reply) => {
    // Optional auth to check if user has voted
    await fastify.optionalAuth(request, reply);

    const status = await electionService.getElectionStatus();

    // Check if authenticated user has voted
    let hasVoted = false;
    if (request.user && status.election) {
      hasVoted = await electionService.checkHasVoted(status.election.id, request.user.userId);
    }

    return {
      election: status.election ? {
        id: status.election.id,
        status: status.election.status,
        nominationStart: status.election.nominationStart.toISOString(),
        votingStart: status.election.votingStart?.toISOString() || null,
        votingEnd: status.election.votingEnd?.toISOString() || null,
      } : null,
      candidates: status.candidates.map(c => ({
        id: c.id,
        userId: c.userId,
        userName: c.userName,
        platform: c.platform,
        voteCount: c.voteCount,
      })),
      currentMayor: status.currentMayor,
      phase: status.phase,
      timeRemaining: status.timeRemaining,
      hasVoted,
    };
  });

  // Get current mayor
  fastify.get('/api/mayor', async () => {
    const mayor = await electionService.getCurrentMayor();
    return { mayor };
  });

  // Start new election (admin only)
  fastify.post('/api/election/start', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user?.role !== 'admin') {
      throw new ForbiddenError('Only admins can start elections');
    }

    const election = await electionService.startElection();

    reply.status(201);
    return {
      success: true,
      election: {
        id: election.id,
        status: election.status,
        nominationStart: election.nominationStart.toISOString(),
      },
    };
  });

  // Run for mayor (authenticated users only)
  fastify.post('/api/election/run', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const body = runForMayorSchema.parse(request.body);
    const userId = request.user!.userId;

    const candidate = await electionService.runForMayor(userId, body.platform);

    reply.status(201);
    return {
      success: true,
      candidate: {
        id: candidate.id,
        userId: candidate.userId,
        userName: candidate.userName,
        platform: candidate.platform,
      },
    };
  });

  // Vote for a candidate (authenticated users only)
  fastify.post('/api/election/vote', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const body = voteSchema.parse(request.body);
    const voterId = request.user!.userId;

    await electionService.vote(voterId, body.candidateId);

    return { success: true };
  });

  // Manually transition election phases (admin only, for testing)
  fastify.post('/api/election/transition', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    if (request.user?.role !== 'admin') {
      throw new ForbiddenError('Only admins can manually transition election phases');
    }

    await electionService.checkAndTransitionElection();

    return { success: true };
  });

  // Manually tally votes (admin only, for testing)
  fastify.post('/api/election/tally', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    if (request.user?.role !== 'admin') {
      throw new ForbiddenError('Only admins can manually tally votes');
    }

    const result = await electionService.tallyVotes();

    return {
      success: true,
      result,
    };
  });
};
