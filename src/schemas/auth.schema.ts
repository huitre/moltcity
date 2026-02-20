// ============================================
// MOLTCITY - Auth Schemas
// ============================================

import { z } from 'zod';

// Register schema
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters'),
  name: z.string().min(1, 'Name is required').max(100, 'Name must not exceed 100 characters'),
  betaKey: z.string().optional(),
});

// Login schema
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Change password schema
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'New password must be at least 8 characters')
    .max(128, 'New password must not exceed 128 characters'),
});

// Link wallet schema
export const linkWalletSchema = z.object({
  walletAddress: z.string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum wallet address'),
});

// Link moltbook schema
export const linkMoltbookSchema = z.object({
  moltbookId: z.string().min(1, 'Moltbook ID is required'),
});

// Link agent schema
export const linkAgentSchema = z.object({
  agentId: z.string().uuid('Invalid agent ID'),
});

// OAuth callback schema
export const oauthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().optional(),
});

// Type exports
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type LinkWalletInput = z.infer<typeof linkWalletSchema>;
export type LinkMoltbookInput = z.infer<typeof linkMoltbookSchema>;
export type LinkAgentInput = z.infer<typeof linkAgentSchema>;
