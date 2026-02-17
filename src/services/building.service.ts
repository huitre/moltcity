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
import { canUserBuild, getBuildingLimit, hasElevatedPrivileges, getBuildingCost, BUILDING_COSTS, BUILDING_FOOTPRINTS, type UserRole } from '../config/game.js';
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

  async getAllBuildings(cityId?: string): Promise<Building[]> {
    return this.buildingRepo.getAllBuildings(cityId);
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
    return {
      type,
      floors,
      baseCost,
      totalCost,
      powerRequired,
      waterRequired,
      constructionTimeTicks: 0,
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
    isMayor?: boolean;
    cityId?: string;
    internal?: boolean; // true when called by simulation engine (bypasses zone restriction)
  }): Promise<Building> {
    const role: UserRole = params.role || 'user';

    // Zone types can only be built by the simulation engine, not directly by users
    const ZONE_ONLY_TYPES: BuildingType[] = ['residential', 'offices', 'industrial', 'suburban'];
    if (ZONE_ONLY_TYPES.includes(params.type) && !params.internal) {
      throw new ForbiddenError(`'${params.type}' buildings are auto-built by the simulation. Use zoning instead.`);
    }

    // Check building type restrictions
    const isMayor = params.isMayor || false;
    if (!canUserBuild(params.type, role, isMayor)) {
      throw new ForbiddenError(`Building type '${params.type}' requires elevated privileges`);
    }

    // Get parcel
    let parcel = null;
    if (params.parcelId) {
      parcel = await this.parcelRepo.getParcelById(params.parcelId);
    } else if (params.x !== undefined && params.y !== undefined) {
      parcel = await this.parcelRepo.getOrCreateParcel(params.x, params.y, params.cityId);
    }

    if (!parcel) {
      throw new NotFoundError('Parcel');
    }

    // Auto-claim unowned parcels when building
    if (!parcel.ownerId) {
      let claimAgent = null;
      if (params.agentId) {
        claimAgent = await this.agentRepo.getAgent(params.agentId);
        if (!claimAgent) claimAgent = await this.agentRepo.getAgentByMoltbookId(params.agentId);
      }
      if (!claimAgent && params.moltbookId) {
        claimAgent = await this.agentRepo.getAgentByMoltbookId(params.moltbookId);
      }
      const claimOwnerId = claimAgent?.id || 'system';
      await this.parcelRepo.purchaseParcel(parcel.id, claimOwnerId, 0);
      parcel = (await this.parcelRepo.getParcelById(parcel.id))!;
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
    if (!hasElevatedPrivileges(role, isMayor) && agent) {
      const existingBuildings = await this.buildingRepo.getBuildingsByOwner(agent.id);
      const sameTypeCount = existingBuildings.filter(b => b.type === params.type).length;
      const limit = getBuildingLimit(params.type, role, isMayor);
      if (sameTypeCount >= limit) {
        throw new ForbiddenError(`Building limit reached for '${params.type}' (max ${limit})`);
      }
    }

    // Verify owner permission (unless admin/mayor)
    if (!hasElevatedPrivileges(role, isMayor) && agent && parcel.ownerId !== agent.id) {
      throw new ForbiddenError('Agent does not own this parcel');
    }

    // Get building footprint
    const footprint = BUILDING_FOOTPRINTS[params.type] || { w: 1, h: 1 };
    const claimOwnerId = agent?.id || parcel.ownerId || 'system';

    // Validate ALL tiles in footprint
    // First, load all existing buildings to check multi-tile overlaps
    const allBuildings = await this.buildingRepo.getAllBuildings();

    for (let dy = 0; dy < footprint.h; dy++) {
      for (let dx = 0; dx < footprint.w; dx++) {
        const tileX = parcel.x + dx;
        const tileY = parcel.y + dy;

        let tileParcel = (dx === 0 && dy === 0)
          ? parcel
          : await this.parcelRepo.getOrCreateParcel(tileX, tileY, params.cityId);

        if (!tileParcel) {
          throw new ValidationError(`Tile (${tileX}, ${tileY}) doesn't exist`);
        }

        // Check for existing building at this parcel
        const existingBuilding = await this.buildingRepo.getBuildingAtParcel(tileParcel.id);
        if (existingBuilding) {
          throw new ConflictError(`Tile (${tileX}, ${tileY}) already has a building`);
        }

        // Check for existing road
        const existingRoad = await this.roadRepo.getRoad(tileParcel.id);
        if (existingRoad) {
          throw new ConflictError(`Cannot build on road at (${tileX}, ${tileY})`);
        }

        // Check overlap with existing multi-tile buildings
        for (const b of allBuildings) {
          if (b.width <= 1 && b.height <= 1) continue;
          const bParcel = await this.parcelRepo.getParcelById(b.parcelId);
          if (!bParcel) continue;
          if (tileX >= bParcel.x && tileX < bParcel.x + b.width &&
              tileY >= bParcel.y && tileY < bParcel.y + b.height) {
            throw new ConflictError(`Tile (${tileX}, ${tileY}) is occupied by ${b.name}`);
          }
        }

        // Auto-claim unowned parcels in footprint
        if (!tileParcel.ownerId) {
          await this.parcelRepo.purchaseParcel(tileParcel.id, claimOwnerId, 0);
        }
      }
    }

    // Auto-set parcel zoning for zone buildings
    const zoningMap: Partial<Record<BuildingType, string>> = {
      suburban: 'suburban',
      residential: 'residential',
      offices: 'office',
      industrial: 'industrial',
    };
    const autoZoning = zoningMap[params.type];
    if (autoZoning) {
      await this.parcelRepo.setZoning(parcel.id, autoZoning as any);
    }

    // Enforce floor limits for zone types
    let floors = params.floors || 1;
    if (params.type === 'suburban') floors = 1;
    if (params.type === 'industrial') floors = Math.min(floors, 2);

    // Get building cost and deduct from treasury (mayor/admin) or agent wallet (user)
    const quote = this.getQuote(params.type, floors);
    if (hasElevatedPrivileges(role, isMayor)) {
      // Mayor/admin: deduct from city treasury
      const cityData = await this.cityRepo.getCity(params.cityId);
      if (cityData && quote.totalCost > 0) {
        if (cityData.stats.treasury < quote.totalCost) {
          throw new InsufficientFundsError(quote.totalCost, cityData.stats.treasury);
        }
        await this.cityRepo.updateTreasury(cityData.id, cityData.stats.treasury - quote.totalCost);
        console.log(`[Building] Deducted ${quote.totalCost} from treasury for ${params.type}`);
      }
    } else if (agent) {
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
    const city = await this.cityRepo.getCity(params.cityId);
    const currentTick = city?.time.tick || 0;

    // Create building with footprint dimensions
    const building = await this.buildingRepo.createBuilding(
      parcel.id,
      params.type,
      params.name,
      ownerId,
      params.sprite,
      floors,
      currentTick,
      footprint.w,
      footprint.h,
      params.cityId || city?.id
    );

    // Log activity
    const actorName = agent?.name || (hasElevatedPrivileges(role, isMayor) ? 'MoltCity' : 'Unknown');
    await this.activityService.logBuildingCreated(
      agent?.id,
      actorName,
      params.type,
      params.name,
      parcel.x,
      parcel.y,
      params.cityId || city?.id
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

}
