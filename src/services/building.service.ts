// ============================================
// MOLTCITY - Building Service
// ============================================

import { BuildingRepository } from '../repositories/building.repository.js';
import { ParcelRepository } from '../repositories/parcel.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { RentalUnitRepository } from '../repositories/rental.repository.js';
import { CityRepository } from '../repositories/city.repository.js';
import { RoadRepository } from '../repositories/road.repository.js';
import { ActivityService } from './activity.service.js';
import { NotFoundError, ConflictError, ValidationError, ForbiddenError, InsufficientFundsError } from '../plugins/error-handler.plugin.js';
import { canUserBuild, getBuildingLimit, hasElevatedPrivileges, getBuildingCost, BUILDING_COSTS, type UserRole } from '../config/game.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { FastifyInstance } from 'fastify';
import type { Building, BuildingType } from '../models/types.js';

// Building costs are imported from config/game.ts

export interface BuildingQuote {
  type: BuildingType;
  floors: number;
  baseCost: number;
  totalCost: number;
  powerRequired: number;
  waterRequired: number;
  constructionTimeTicks: number;
}

export class BuildingService {
  private buildingRepo: BuildingRepository;
  private parcelRepo: ParcelRepository;
  private agentRepo: AgentRepository;
  private rentalRepo: RentalUnitRepository;
  private cityRepo: CityRepository;
  private roadRepo: RoadRepository;
  private activityService: ActivityService;

  constructor(db: DrizzleDb, fastify?: FastifyInstance) {
    this.buildingRepo = new BuildingRepository(db);
    this.parcelRepo = new ParcelRepository(db);
    this.agentRepo = new AgentRepository(db);
    this.rentalRepo = new RentalUnitRepository(db);
    this.cityRepo = new CityRepository(db);
    this.roadRepo = new RoadRepository(db);
    this.activityService = new ActivityService(db, fastify);
  }

  async getBuilding(id: string): Promise<Building | null> {
    return this.buildingRepo.getBuilding(id);
  }

  async getAllBuildings(): Promise<Building[]> {
    return this.buildingRepo.getAllBuildings();
  }

  async getBuildingAtParcel(parcelId: string): Promise<Building | null> {
    return this.buildingRepo.getBuildingAtParcel(parcelId);
  }

  async getBuildingsByOwner(ownerId: string): Promise<Building[]> {
    return this.buildingRepo.getBuildingsByOwner(ownerId);
  }

  getQuote(type: BuildingType, floors: number = 1): BuildingQuote {
    const totalCost = getBuildingCost(type, floors);
    const baseCost = BUILDING_COSTS[type] || 500;
    const powerRequired = this.buildingRepo.getPowerRequirement(type) * floors;
    const waterRequired = this.buildingRepo.getWaterRequirement(type) * floors;
    const constructionTimeTicks = type === 'road' ? 0 : floors * 240;

    return {
      type,
      floors,
      baseCost,
      totalCost,
      powerRequired,
      waterRequired,
      constructionTimeTicks,
    };
  }

  async createBuilding(params: {
    parcelId?: string;
    x?: number;
    y?: number;
    agentId?: string;
    moltbookId?: string;
    type: BuildingType;
    name: string;
    sprite?: string;
    floors?: number;
    createAgent?: boolean;
    agentName?: string;
    role?: UserRole;
  }): Promise<Building> {
    const role: UserRole = params.role || 'user';

    // Check building type restrictions
    if (!canUserBuild(params.type, role)) {
      throw new ForbiddenError(`Building type '${params.type}' requires elevated privileges`);
    }

    // Get parcel
    let parcel = null;
    if (params.parcelId) {
      parcel = await this.parcelRepo.getParcelById(params.parcelId);
    } else if (params.x !== undefined && params.y !== undefined) {
      parcel = await this.parcelRepo.getParcel(params.x, params.y);
    }

    if (!parcel) {
      throw new NotFoundError('Parcel');
    }

    // Check if parcel is owned (admins/mayors can build on any parcel)
    if (!parcel.ownerId && !hasElevatedPrivileges(role)) {
      throw new ValidationError('Parcel must be owned to build on it');
    }

    // Find agent
    let agent = null;
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

    // Auto-create agent if requested
    if (!agent && params.createAgent) {
      const name = params.agentName || 'New Citizen';
      const x = params.x ?? 25;
      const y = params.y ?? 25;
      agent = await this.agentRepo.createAgent(name, x, y, params.agentId);
    }

    // If no agent specified, use parcel owner or system for admin/mayor
    const ownerId = agent?.id || parcel.ownerId || 'system';

    // Check building limit for this type (only for regular users)
    if (!hasElevatedPrivileges(role) && agent) {
      const existingBuildings = await this.buildingRepo.getBuildingsByOwner(agent.id);
      const sameTypeCount = existingBuildings.filter(b => b.type === params.type).length;
      const limit = getBuildingLimit(params.type, role);
      if (sameTypeCount >= limit) {
        throw new ForbiddenError(`Building limit reached for '${params.type}' (max ${limit})`);
      }
    }

    // Verify owner permission (unless admin/mayor)
    if (!hasElevatedPrivileges(role) && agent && parcel.ownerId !== agent.id) {
      throw new ForbiddenError('Agent does not own this parcel');
    }

    // Check for existing building
    const existingBuilding = await this.buildingRepo.getBuildingAtParcel(parcel.id);
    if (existingBuilding) {
      throw new ConflictError('Parcel already has a building');
    }

    // Check for existing road (cannot build on roads)
    const existingRoad = await this.roadRepo.getRoad(parcel.id);
    if (existingRoad) {
      throw new ConflictError('Cannot build on a road');
    }

    // Get building cost and check agent wallet (unless admin/mayor)
    const quote = this.getQuote(params.type, params.floors || 1);
    if (!hasElevatedPrivileges(role) && agent) {
      if (agent.wallet.balance < quote.totalCost) {
        throw new InsufficientFundsError(quote.totalCost, agent.wallet.balance);
      }
      // Deduct building cost from agent wallet
      const deducted = await this.agentRepo.deductFromWallet(agent.id, quote.totalCost);
      if (!deducted) {
        throw new InsufficientFundsError(quote.totalCost, 0);
      }
      console.log(`[Building] Deducted ${quote.totalCost} MOLT from ${agent.name}'s wallet for ${params.type}`);
    }

    // Get current tick for construction
    const city = await this.cityRepo.getCity();
    const currentTick = city?.time.tick || 0;

    // Create building
    const building = await this.buildingRepo.createBuilding(
      parcel.id,
      params.type,
      params.name,
      ownerId,
      params.sprite,
      params.floors || 1,
      currentTick
    );

    // Log activity
    const actorName = agent?.name || (hasElevatedPrivileges(role) ? 'MoltCity' : 'Unknown');
    await this.activityService.logBuildingCreated(
      agent?.id,
      actorName,
      params.type,
      params.name,
      parcel.x,
      parcel.y
    );

    return building;
  }

  async updateBuilding(
    buildingId: string,
    updates: { name?: string; sprite?: string; type?: BuildingType },
    requesterId?: string
  ): Promise<Building> {
    const building = await this.buildingRepo.getBuilding(buildingId);
    if (!building) {
      throw new NotFoundError('Building', buildingId);
    }

    // Check ownership if requester is specified
    if (requesterId && building.ownerId !== requesterId) {
      throw new ForbiddenError('Not authorized to update this building');
    }

    await this.buildingRepo.updateBuilding(buildingId, updates);
    return (await this.buildingRepo.getBuilding(buildingId))!;
  }

  async demolishBuilding(buildingId: string, requesterId?: string): Promise<void> {
    const building = await this.buildingRepo.getBuilding(buildingId);
    if (!building) {
      throw new NotFoundError('Building', buildingId);
    }

    // Check ownership if requester is specified
    if (requesterId && building.ownerId !== requesterId) {
      throw new ForbiddenError('Not authorized to demolish this building');
    }

    // Delete associated rental units
    await this.rentalRepo.deleteUnitsForBuilding(buildingId);

    // Delete building
    await this.buildingRepo.deleteBuilding(buildingId);
  }

  async getBuildingsUnderConstruction(): Promise<Building[]> {
    return this.buildingRepo.getBuildingsUnderConstruction();
  }

  async updateConstructionProgress(buildingId: string, progress: number): Promise<void> {
    await this.buildingRepo.updateConstructionProgress(buildingId, Math.min(100, progress));
  }
}
