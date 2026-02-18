// ============================================
// MOLTCITY - Parcel Service
// ============================================

import { ParcelRepository } from '../repositories/parcel.repository.js';
import { BuildingRepository } from '../repositories/building.repository.js';
import { RoadRepository } from '../repositories/road.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { ActivityService } from './activity.service.js';
import { NotFoundError, ConflictError, InsufficientFundsError, ValidationError, ForbiddenError } from '../plugins/error-handler.plugin.js';
import { getMaxParcels, getParcelCost, ZONING_COST, type UserRole } from '../config/game.js';
import { CityRepository } from '../repositories/city.repository.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { FastifyInstance } from 'fastify';
import type { Parcel, Building, Road, ZoningType } from '../models/types.js';

export interface ParcelWithDetails extends Parcel {
  building?: Building;
  road?: Road;
}

export interface PurchaseResult {
  parcel: Parcel;
  agentId: string;
  agentCreated: boolean;
}

export class ParcelService {
  private db: DrizzleDb;
  private parcelRepo: ParcelRepository;
  private buildingRepo: BuildingRepository;
  private roadRepo: RoadRepository;
  private agentRepo: AgentRepository;
  private activityService: ActivityService;

  constructor(db: DrizzleDb, fastify?: FastifyInstance) {
    this.db = db;
    this.parcelRepo = new ParcelRepository(db);
    this.buildingRepo = new BuildingRepository(db);
    this.roadRepo = new RoadRepository(db);
    this.agentRepo = new AgentRepository(db);
    this.activityService = new ActivityService(db, fastify);
  }

  async getOrCreateParcel(x: number, y: number, cityId?: string) {
    return this.parcelRepo.getOrCreateParcel(x, y, cityId);
  }

  async getParcel(x: number, y: number, cityId?: string): Promise<ParcelWithDetails | null> {
    const parcel = await this.parcelRepo.getParcel(x, y, cityId);
    if (!parcel) return null;

    const [building, road] = await Promise.all([
      this.buildingRepo.getBuildingAtParcel(parcel.id),
      this.roadRepo.getRoad(parcel.id),
    ]);

    return {
      ...parcel,
      building: building || undefined,
      road: road || undefined,
    };
  }

  async getParcelById(id: string): Promise<Parcel | null> {
    return this.parcelRepo.getParcelById(id);
  }

  async getParcelsInRange(minX: number, minY: number, maxX: number, maxY: number, cityId?: string): Promise<Parcel[]> {
    return this.parcelRepo.getParcelsInRange(minX, minY, maxX, maxY, cityId);
  }

  async purchaseParcel(params: {
    parcelId?: string;
    x?: number;
    y?: number;
    agentId?: string;
    moltbookId?: string;
    price: number;
    createAgent?: boolean;
    agentName?: string;
    role?: UserRole;
    isMayor?: boolean;
    cityId?: string;
  }): Promise<PurchaseResult> {
    // Get or create parcel (parcels are created on-demand)
    let parcel: Parcel | null = null;
    if (params.parcelId) {
      parcel = await this.parcelRepo.getParcelById(params.parcelId);
    } else if (params.x !== undefined && params.y !== undefined) {
      parcel = await this.parcelRepo.getOrCreateParcel(params.x, params.y, params.cityId);
    }

    if (!parcel) {
      throw new NotFoundError('Parcel');
    }

    if (parcel.ownerId) {
      throw new ConflictError('Parcel is already owned');
    }

    // Find or create agent
    let agent = null;
    let agentCreated = false;

    if (params.agentId) {
      agent = await this.agentRepo.getAgent(params.agentId);
      // Try by moltbookId if not found by direct ID
      if (!agent) {
        agent = await this.agentRepo.getAgentByMoltbookId(params.agentId);
      }
    }
    if (!agent && params.moltbookId) {
      agent = await this.agentRepo.getAgentByMoltbookId(params.moltbookId);
    }

    if (!agent && params.createAgent) {
      const name = params.agentName || 'New Citizen';
      agent = await this.agentRepo.createAgent(name, parcel.x, parcel.y, params.moltbookId || params.agentId);
      agentCreated = true;
    }

    if (!agent) {
      throw new ValidationError('Agent not found and createAgent is false');
    }

    // Check parcel limit
    const maxParcels = getMaxParcels(params.role || 'user', params.isMayor || false);
    const ownedParcels = await this.parcelRepo.getParcelsByOwner(agent.id);
    if (ownedParcels.length >= maxParcels) {
      throw new ForbiddenError(`Parcel limit reached (max ${maxParcels} parcels)`);
    }

    // Calculate price based on number of parcels already owned
    // First 5 parcels are free, then 100$ * number of parcels owned
    const calculatedPrice = getParcelCost(ownedParcels.length);
    const finalPrice = Math.max(calculatedPrice, params.price || 0);

    // Check balance (if price > 0)
    if (finalPrice > 0 && agent.wallet.balance < finalPrice) {
      throw new InsufficientFundsError(finalPrice, agent.wallet.balance);
    }

    // Deduct from wallet
    if (finalPrice > 0) {
      await this.agentRepo.deductFromWallet(agent.id, finalPrice);
    }

    // Purchase parcel
    await this.parcelRepo.purchaseParcel(parcel.id, agent.id, finalPrice);

    // Return updated parcel
    const updatedParcel = await this.parcelRepo.getParcelById(parcel.id);

    // Log activity
    await this.activityService.logParcelPurchase(
      agent.id,
      agent.name,
      parcel.x,
      parcel.y
    );

    return {
      parcel: updatedParcel!,
      agentId: agent.id,
      agentCreated,
    };
  }

  async sellParcel(parcelId: string, sellerId: string, buyerId?: string, price: number = 0): Promise<Parcel> {
    const parcel = await this.parcelRepo.getParcelById(parcelId);
    if (!parcel) {
      throw new NotFoundError('Parcel', parcelId);
    }

    if (parcel.ownerId !== sellerId) {
      throw new ValidationError('Seller does not own this parcel');
    }

    // Check for buildings
    const building = await this.buildingRepo.getBuildingAtParcel(parcelId);
    if (building) {
      throw new ConflictError('Cannot sell parcel with building. Demolish building first.');
    }

    if (buyerId) {
      // Transfer to buyer
      const buyer = await this.agentRepo.getAgent(buyerId);
      if (!buyer) {
        throw new NotFoundError('Buyer agent', buyerId);
      }

      if (price > 0 && buyer.wallet.balance < price) {
        throw new InsufficientFundsError(price, buyer.wallet.balance);
      }

      if (price > 0) {
        await this.agentRepo.deductFromWallet(buyerId, price);
        await this.agentRepo.addToWallet(sellerId, price);
      }

      await this.parcelRepo.transferParcel(parcelId, buyerId, price);
    } else {
      // Release parcel back to city
      await this.parcelRepo.releaseParcel(parcelId);
    }

    return (await this.parcelRepo.getParcelById(parcelId))!;
  }

  /**
   * Get the price for purchasing a parcel based on how many the agent already owns
   */
  async getParcelQuote(agentId: string): Promise<{ price: number; parcelsOwned: number; freeRemaining: number }> {
    const agent = await this.agentRepo.getAgent(agentId);
    if (!agent) {
      // New agent, no parcels owned
      return { price: 0, parcelsOwned: 0, freeRemaining: 5 };
    }

    const ownedParcels = await this.parcelRepo.getParcelsByOwner(agentId);
    const parcelsOwned = ownedParcels.length;
    const price = getParcelCost(parcelsOwned);
    const freeRemaining = Math.max(0, 5 - parcelsOwned);

    return { price, parcelsOwned, freeRemaining };
  }

  async setZoning(parcelId: string, zoning: ZoningType | null, cityId?: string): Promise<Parcel> {
    const parcel = await this.parcelRepo.getParcelById(parcelId);
    if (!parcel) {
      throw new NotFoundError('Parcel', parcelId);
    }

    if (zoning) {
      // Deduct zoning cost from city treasury
      const cityRepo = new CityRepository(this.db);
      const city = await cityRepo.getCity(cityId);
      if (city && ZONING_COST > 0) {
        if (city.stats.treasury < ZONING_COST) {
          throw new InsufficientFundsError(ZONING_COST, city.stats.treasury);
        }
        await cityRepo.updateTreasury(city.id, city.stats.treasury - ZONING_COST);
      }
      await this.parcelRepo.setZoning(parcelId, zoning, cityId);
    } else {
      await this.parcelRepo.clearZoning(parcelId);
    }
    return (await this.parcelRepo.getParcelById(parcelId))!;
  }

  async setZoningDirect(parcelId: string, zoning: ZoningType | null, cityId?: string): Promise<void> {
    if (zoning) {
      await this.parcelRepo.setZoning(parcelId, zoning, cityId);
    } else {
      await this.parcelRepo.clearZoning(parcelId);
    }
  }
}
