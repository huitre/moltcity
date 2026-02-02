// ============================================
// MOLTCITY - Payments Schemas
// ============================================

import { z } from 'zod';

// Purchase quote query
export const purchaseQuoteQuerySchema = z.object({
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
});

// Crypto purchase schema
export const cryptoPurchaseSchema = z.object({
  walletAddress: z.string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum wallet address'),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  transactionHash: z.string()
    .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash'),
  agentId: z.string().optional(), // Existing agent to assign parcel to
  createAgent: z.boolean().optional(), // Create new agent if needed
  agentName: z.string().min(1).max(100).optional(),
});

// Type exports
export type PurchaseQuoteQuery = z.infer<typeof purchaseQuoteQuerySchema>;
export type CryptoPurchaseInput = z.infer<typeof cryptoPurchaseSchema>;
