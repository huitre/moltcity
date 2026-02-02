// ============================================
// MOLTCITY - Parcel Service
// ============================================

import { ParcelRepository } from '../repositories/parcel.repository.js';
import { BuildingRepository } from '../repositories/building.repository.js';
import { RoadRepository } from '../repositories/road.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { NotFoundError, ConflictError, InsufficientFundsError, ValidationError } from '../plugins/error-handler.plugin.js';
import type { DrizzleDb } from '../db/drizzle.js';
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
  private parcelRepo: ParcelRepository;
  private buildingRepo: BuildingRepository;
  private roadRepo: RoadRepository;
  private agentRepo: AgentRepository;

  constructor(db: DrizzleDb) {
    this.parcelRepo = new ParcelRepository(db);
    this.buildingRepo = new BuildingRepository(db);
    this.roadRepo = new RoadRepository(db);
    this.agentRepo = new AgentRepository(db);
  }

  async getParcel(x: number, y: number): Promise<ParcelWithDetails | null> {
    const parcel = await this.parcelRepo.getParcel(x, y);
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

  async getParcelsInRange(minX: number, minY: number, maxX: number, maxY: number): Promise<Parcel[]> {
    return this.parcelRepo.getParcelsInRange(minX, minY, maxX, maxY);
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
  }): Promise<PurchaseResult> {
    // Get parcel
    let parcel: Parcel | null = null;
    if (params.parcelId) {
      parcel = await this.parcelRepo.getParcelById(params.parcelId);
    } else if (params.x !== undefined && params.y !== undefined) {
      parcel = await this.parcelRepo.getParcel(params.x, params.y);
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
    } else if (params.moltbookId) {
      agent = await this.agentRepo.getAgentByMoltbookId(params.moltbookId);
    }

    if (!agent && params.createAgent) {
      const name = params.agentName || 'New Citizen';
      agent = await this.agentRepo.createAgent(name, parcel.x, parcel.y, params.moltbookId);
      agentCreated = true;
    }

    if (!agent) {
      throw new ValidationError('Agent not found and createAgent is false');
    }

    // Check balance (if price > 0)
    if (params.price > 0 && agent.wallet.balance < params.price) {
      throw new InsufficientFundsError(params.price, agent.wallet.balance);
    }

    // Deduct from wallet
    if (params.price > 0) {
      await this.agentRepo.deductFromWallet(agent.id, params.price);
    }

    // Purchase parcel
    await this.parcelRepo.purchaseParcel(parcel.id, agent.id, params.price);

    // Return updated parcel
    const updatedParcel = await this.parcelRepo.getParcelById(parcel.id);

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

  async setZoning(parcelId: string, zoning: ZoningType): Promise<Parcel> {
    const parcel = await this.parcelRepo.getParcelById(parcelId);
    if (!parcel) {
      throw new NotFoundError('Parcel', parcelId);
    }

    await this.parcelRepo.setZoning(parcelId, zoning);
    return (await this.parcelRepo.getParcelById(parcelId))!;
  }
}
