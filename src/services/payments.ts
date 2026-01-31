// ============================================
// MOLTCITY - Crypto Payment Service
// ============================================

import { ethers } from 'ethers';
import type { DatabaseManager } from '../models/database.js';

// ============================================
// Configuration
// ============================================

// Default to Base Sepolia testnet for development
const CHAIN_CONFIG = {
  // Base Mainnet
  base: {
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    currency: 'ETH',
    explorer: 'https://basescan.org',
  },
  // Base Sepolia Testnet
  baseSepolia: {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    currency: 'ETH',
    explorer: 'https://sepolia.basescan.org',
  },
  // Local development
  localhost: {
    chainId: 31337,
    name: 'Localhost',
    rpcUrl: 'http://127.0.0.1:8545',
    currency: 'ETH',
    explorer: '',
  },
};

// MOLT Token contract (placeholder - deploy your own)
const MOLT_TOKEN_ADDRESS = process.env.MOLT_TOKEN_ADDRESS || '0x0000000000000000000000000000000000000000';

// Treasury wallet that receives payments
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000';

// Parcel pricing in ETH
const PARCEL_BASE_PRICE = 0.0001; // 0.0001 ETH per parcel (minimal price)
const PARCEL_PREMIUM_MULTIPLIER = 2; // 2x for premium locations (near center, near roads)

// ============================================
// Types
// ============================================

export interface WalletInfo {
  address: string;
  balance: string;
  chainId: number;
}

export interface PaymentRequest {
  agentId: string;
  walletAddress: string;
  parcelX: number;
  parcelY: number;
  currency: 'ETH' | 'MOLT';
}

export interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  price: string;
  currency: string;
}

export interface PriceQuote {
  parcelId: string;
  priceEth: string;
  priceMolt: string;
  isPremium: boolean;
  reason?: string;
}

// ============================================
// Payment Service
// ============================================

export class PaymentService {
  private db: DatabaseManager;
  private provider: ethers.JsonRpcProvider | null = null;
  private chainConfig: typeof CHAIN_CONFIG.base;

  constructor(db: DatabaseManager, network: keyof typeof CHAIN_CONFIG = 'baseSepolia') {
    this.db = db;
    this.chainConfig = CHAIN_CONFIG[network];

    // Initialize provider
    try {
      this.provider = new ethers.JsonRpcProvider(this.chainConfig.rpcUrl);
    } catch (e) {
      console.warn('[PaymentService] Failed to connect to RPC, running in offline mode');
    }
  }

  /**
   * Get price quote for a parcel
   */
  getParcelPrice(x: number, y: number, buyerId?: string): PriceQuote {
    const parcel = this.db.parcels.getParcel(x, y);
    if (!parcel) {
      throw new Error('Parcel not found');
    }

    if (parcel.ownerId) {
      throw new Error('Parcel already owned');
    }

    // Check if buyer already owns any parcels - first parcel is FREE
    if (buyerId) {
      const allParcels = this.db.parcels.getAllParcels();
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

    // Calculate if this is a premium location
    const centerX = 25;
    const centerY = 25;
    const distanceFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
    const isPremium = distanceFromCenter < 10;

    // Check if near roads
    const nearbyRoads = this.countNearbyRoads(x, y);
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

    // MOLT price (1 ETH = 1000 MOLT for simplicity)
    const priceMolt = price * 1000;

    return {
      parcelId: parcel.id,
      priceEth: price.toFixed(6),
      priceMolt: priceMolt.toFixed(2),
      isPremium: isPremium || hasRoadAccess,
      reason,
    };
  }

  /**
   * Count roads adjacent to a parcel
   */
  private countNearbyRoads(x: number, y: number): number {
    let count = 0;
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
    ];

    for (const dir of directions) {
      const parcel = this.db.parcels.getParcel(x + dir.dx, y + dir.dy);
      if (parcel) {
        const road = this.db.roads.getRoad(parcel.id);
        if (road) count++;
      }
    }

    return count;
  }

  /**
   * Verify a payment transaction
   */
  async verifyPayment(txHash: string, expectedAmount: string, expectedCurrency: 'ETH' | 'MOLT'): Promise<boolean> {
    if (!this.provider) {
      console.warn('[PaymentService] No provider, skipping verification');
      return true; // In offline mode, assume valid
    }

    try {
      const tx = await this.provider.getTransaction(txHash);
      if (!tx) {
        return false;
      }

      // Wait for confirmation
      const receipt = await tx.wait(1);
      if (!receipt || receipt.status !== 1) {
        return false;
      }

      // Verify recipient is treasury
      if (tx.to?.toLowerCase() !== TREASURY_ADDRESS.toLowerCase()) {
        return false;
      }

      // Verify amount for ETH
      if (expectedCurrency === 'ETH') {
        const expectedWei = ethers.parseEther(expectedAmount);
        if (tx.value < expectedWei) {
          return false;
        }
      }

      // For MOLT tokens, we'd need to decode the transfer event
      // This is simplified for now

      return true;
    } catch (e) {
      console.error('[PaymentService] Verification error:', e);
      return false;
    }
  }

  /**
   * Process a parcel purchase after payment verification
   */
  async processPurchase(request: PaymentRequest, txHash: string): Promise<PaymentResult> {
    const { agentId, walletAddress, parcelX, parcelY, currency } = request;

    // Get price
    const quote = this.getParcelPrice(parcelX, parcelY);
    const expectedAmount = currency === 'ETH' ? quote.priceEth : quote.priceMolt;

    // Verify the transaction
    const isValid = await this.verifyPayment(txHash, expectedAmount, currency);
    if (!isValid) {
      return {
        success: false,
        error: 'Payment verification failed',
        price: expectedAmount,
        currency,
      };
    }

    // Record the purchase
    const parcel = this.db.parcels.getParcel(parcelX, parcelY);
    if (!parcel) {
      return {
        success: false,
        error: 'Parcel not found',
        price: expectedAmount,
        currency,
      };
    }

    // Update agent wallet address if not set
    const agent = this.db.agents.getAgent(agentId);
    if (agent) {
      // Store wallet association (would need to add this to schema)
      // For now, we just proceed with the purchase
    }

    // Complete the purchase
    this.db.parcels.purchaseParcel(parcel.id, agentId, parseFloat(expectedAmount));

    // Record transaction in events
    this.recordTransaction(txHash, agentId, parcel.id, expectedAmount, currency);

    return {
      success: true,
      transactionHash: txHash,
      price: expectedAmount,
      currency,
    };
  }

  /**
   * Record a transaction for history
   */
  private recordTransaction(
    txHash: string,
    agentId: string,
    parcelId: string,
    amount: string,
    currency: string
  ): void {
    // Could store in a separate transactions table
    console.log(`[PaymentService] Transaction recorded: ${txHash}`);
    console.log(`  Agent: ${agentId}`);
    console.log(`  Parcel: ${parcelId}`);
    console.log(`  Amount: ${amount} ${currency}`);
  }

  /**
   * Get chain configuration for frontend
   */
  getChainConfig() {
    return {
      ...this.chainConfig,
      treasuryAddress: TREASURY_ADDRESS,
      moltTokenAddress: MOLT_TOKEN_ADDRESS,
    };
  }
}

// ============================================
// Signature Verification (for agent identity)
// ============================================

export function verifySignature(message: string, signature: string, expectedAddress: string): boolean {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (e) {
    return false;
  }
}

export function createSignMessage(agentId: string, action: string, timestamp: number): string {
  return `MoltCity Action\n\nAgent: ${agentId}\nAction: ${action}\nTimestamp: ${timestamp}`;
}
