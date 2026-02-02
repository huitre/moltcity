// ============================================
// MOLTCITY - Payment Service (Refactored)
// ============================================

import { ethers } from 'ethers';
import { ParcelRepository } from '../repositories/parcel.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { RoadRepository } from '../repositories/road.repository.js';
import { NotFoundError, ValidationError, ConflictError } from '../plugins/error-handler.plugin.js';
import { env } from '../config/env.js';
import type { DrizzleDb } from '../db/drizzle.js';

// Chain configurations
const CHAIN_CONFIG = {
  base: {
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    currency: 'ETH',
    explorer: 'https://basescan.org',
  },
  baseSepolia: {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    currency: 'ETH',
    explorer: 'https://sepolia.basescan.org',
  },
  localhost: {
    chainId: 31337,
    name: 'Localhost',
    rpcUrl: 'http://127.0.0.1:8545',
    currency: 'ETH',
    explorer: '',
  },
} as const;

type NetworkName = keyof typeof CHAIN_CONFIG;

// Pricing constants
const PARCEL_BASE_PRICE = 0.0001; // 0.0001 ETH per parcel
const PARCEL_PREMIUM_MULTIPLIER = 2;

export interface PriceQuote {
  parcelId: string;
  priceEth: string;
  priceMolt: string;
  isPremium: boolean;
  reason?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  price: string;
  currency: string;
}

export class PaymentService {
  private parcelRepo: ParcelRepository;
  private agentRepo: AgentRepository;
  private roadRepo: RoadRepository;
  private provider: ethers.JsonRpcProvider | null = null;
  private chainConfig: (typeof CHAIN_CONFIG)[NetworkName];

  constructor(db: DrizzleDb, network: NetworkName = 'baseSepolia') {
    this.parcelRepo = new ParcelRepository(db);
    this.agentRepo = new AgentRepository(db);
    this.roadRepo = new RoadRepository(db);
    this.chainConfig = CHAIN_CONFIG[network];

    // Initialize provider if RPC URL is configured
    if (env.RPC_URL) {
      try {
        this.provider = new ethers.JsonRpcProvider(env.RPC_URL);
      } catch {
        console.warn('[PaymentService] Failed to connect to RPC, running in offline mode');
      }
    }
  }

  async getParcelPrice(x: number, y: number, buyerId?: string): Promise<PriceQuote> {
    const parcel = await this.parcelRepo.getParcel(x, y);
    if (!parcel) {
      throw new NotFoundError('Parcel');
    }

    if (parcel.ownerId) {
      throw new ConflictError('Parcel is already owned');
    }

    // Check if first parcel (free)
    if (buyerId) {
      const agent = await this.agentRepo.getAgent(buyerId);
      if (agent) {
        const allParcels = await this.parcelRepo.getAllParcels();
        const ownedParcels = allParcels.filter(p => p.ownerId === buyerId);
        if (ownedParcels.length === 0) {
          return {
            parcelId: parcel.id,
            priceEth: '0',
            priceMolt: '0',
            isPremium: false,
            reason: 'First parcel is free!',
          };
        }
      }
    }

    // Calculate premium location
    const centerX = 25;
    const centerY = 25;
    const distanceFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
    const isPremium = distanceFromCenter < 10;

    // Check road access
    const nearbyRoads = await this.countNearbyRoads(x, y);
    const hasRoadAccess = nearbyRoads > 0;

    // Calculate price
    let price = PARCEL_BASE_PRICE;
    let reason = '';

    if (isPremium) {
      price *= PARCEL_PREMIUM_MULTIPLIER;
      reason = 'Near city center';
    }

    if (hasRoadAccess) {
      price *= 1.5;
      reason = reason ? `${reason}, road access` : 'Road access';
    }

    const priceMolt = price * 1000;

    return {
      parcelId: parcel.id,
      priceEth: price.toFixed(6),
      priceMolt: priceMolt.toFixed(2),
      isPremium: isPremium || hasRoadAccess,
      reason,
    };
  }

  private async countNearbyRoads(x: number, y: number): Promise<number> {
    let count = 0;
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
    ];

    for (const dir of directions) {
      const parcel = await this.parcelRepo.getParcel(x + dir.dx, y + dir.dy);
      if (parcel) {
        const road = await this.roadRepo.getRoad(parcel.id);
        if (road) count++;
      }
    }

    return count;
  }

  async verifyPayment(
    txHash: string,
    expectedAmount: string,
    expectedCurrency: 'ETH' | 'MOLT'
  ): Promise<boolean> {
    if (!this.provider) {
      console.warn('[PaymentService] No provider, skipping verification');
      return true;
    }

    try {
      const tx = await this.provider.getTransaction(txHash);
      if (!tx) return false;

      const receipt = await tx.wait(1);
      if (!receipt || receipt.status !== 1) return false;

      // Verify recipient
      const treasuryAddress = env.PAYMENT_WALLET_ADDRESS;
      if (!treasuryAddress || tx.to?.toLowerCase() !== treasuryAddress.toLowerCase()) {
        return false;
      }

      // Verify amount for ETH
      if (expectedCurrency === 'ETH') {
        const expectedWei = ethers.parseEther(expectedAmount);
        if (tx.value < expectedWei) return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  async processPurchase(params: {
    walletAddress: string;
    x: number;
    y: number;
    transactionHash: string;
    agentId?: string;
    createAgent?: boolean;
    agentName?: string;
  }): Promise<PaymentResult> {
    const quote = await this.getParcelPrice(params.x, params.y);

    // Verify transaction
    const isValid = await this.verifyPayment(params.transactionHash, quote.priceEth, 'ETH');
    if (!isValid) {
      return {
        success: false,
        error: 'Payment verification failed',
        price: quote.priceEth,
        currency: 'ETH',
      };
    }

    // Find or create agent
    let agentId = params.agentId;
    if (!agentId && params.createAgent) {
      const name = params.agentName || 'New Citizen';
      const agent = await this.agentRepo.createAgent(name, params.x, params.y);
      agentId = agent.id;
    }

    if (!agentId) {
      return {
        success: false,
        error: 'No agent specified and createAgent is false',
        price: quote.priceEth,
        currency: 'ETH',
      };
    }

    // Complete purchase
    await this.parcelRepo.purchaseParcel(quote.parcelId, agentId, parseFloat(quote.priceEth));

    return {
      success: true,
      transactionHash: params.transactionHash,
      price: quote.priceEth,
      currency: 'ETH',
    };
  }

  getChainConfig() {
    return {
      ...this.chainConfig,
      treasuryAddress: env.PAYMENT_WALLET_ADDRESS || '',
    };
  }
}

// Signature verification utilities
export function verifySignature(message: string, signature: string, expectedAddress: string): boolean {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

export function createSignMessage(agentId: string, action: string, timestamp: number): string {
  return `MoltCity Action\n\nAgent: ${agentId}\nAction: ${action}\nTimestamp: ${timestamp}`;
}
