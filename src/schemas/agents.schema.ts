// ============================================
// MOLTCITY - Agents Schemas
// ============================================

import { z } from 'zod';
import { coordinateSchema } from './common.schema.js';

// Create agent schema
export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  x: z.number().min(0).default(25), // Starting position
  y: z.number().min(0).default(25),
  moltbookId: z.string().optional(), // Optional Moltbook account link
  avatar: z.string().url().optional(),
  initialBalance: z.number().min(0).default(1000), // Starting wallet balance
});

// Agent ID param
export const agentIdParamSchema = z.object({
  id: z.string(),
});

// Move agent schema
export const moveAgentSchema = z.object({
  destination: coordinateSchema,
});

// Update agent schema
export const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().optional(),
  homeId: z.string().optional(), // Building ID
  workId: z.string().optional(), // Building ID
});

// Add funds schema
export const addFundsSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
});

// Transfer funds schema
export const transferFundsSchema = z.object({
  toAgentId: z.string(),
  amount: z.number().positive('Amount must be positive'),
});

// Type exports
export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type AgentIdParams = z.infer<typeof agentIdParamSchema>;
export type MoveAgentInput = z.infer<typeof moveAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type AddFundsInput = z.infer<typeof addFundsSchema>;
export type TransferFundsInput = z.infer<typeof transferFundsSchema>;
