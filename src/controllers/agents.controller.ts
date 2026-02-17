// ============================================
// MOLTCITY - Agents Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { AgentService } from '../services/agent.service.js';
import {
  createAgentSchema,
  agentIdParamSchema,
  moveAgentSchema,
  updateAgentSchema,
  addFundsSchema,
  transferFundsSchema,
} from '../schemas/agents.schema.js';
import { extractOptionalCityId } from '../utils/city-context.js';

export const agentsController: FastifyPluginAsync = async (fastify) => {
  const agentService = new AgentService(fastify.db);

  // List all agents
  fastify.get('/api/agents', async (request) => {
    const cityId = extractOptionalCityId(request);
    const agents = await agentService.getAllAgents(cityId);
    return { agents };
  });

  // Create agent
  fastify.post('/api/agents', async (request, reply) => {
    const body = createAgentSchema.parse(request.body);
    const agent = await agentService.createAgent({
      name: body.name,
      x: body.x,
      y: body.y,
      moltbookId: body.moltbookId,
      avatar: body.avatar,
      initialBalance: body.initialBalance,
    });

    reply.status(201);
    return { success: true, agent };
  });

  // Get agent by ID
  fastify.get('/api/agents/:id', async (request) => {
    const params = agentIdParamSchema.parse(request.params);
    const agent = await agentService.getAgent(params.id);
    return { agent };
  });

  // Update agent
  fastify.put('/api/agents/:id', async (request) => {
    const params = agentIdParamSchema.parse(request.params);
    const body = updateAgentSchema.parse(request.body);

    let agent = await agentService.getAgent(params.id);
    if (!agent) {
      return { agent: null };
    }

    if (body.homeId) {
      agent = await agentService.setHome(params.id, body.homeId);
    }
    if (body.workId) {
      agent = await agentService.setWork(params.id, body.workId);
    }

    return { success: true, agent };
  });

  // Move agent
  fastify.post('/api/agents/:id/move', async (request) => {
    const params = agentIdParamSchema.parse(request.params);
    const destination = moveAgentSchema.parse(request.body);
    const agent = await agentService.moveAgent(params.id, destination);
    return { success: true, agent };
  });

  // Add funds to agent
  fastify.post('/api/agents/:id/funds', async (request) => {
    const params = agentIdParamSchema.parse(request.params);
    const body = addFundsSchema.parse(request.body);
    const agent = await agentService.addFunds(params.id, body.amount);
    return { success: true, agent };
  });

  // Transfer funds between agents
  fastify.post('/api/agents/:id/transfer', async (request) => {
    const params = agentIdParamSchema.parse(request.params);
    const body = transferFundsSchema.parse(request.body);
    await agentService.transferFunds(params.id, body.toAgentId, body.amount);
    return { success: true };
  });
};
