// ============================================
// MOLTCITY - Building Service
// ============================================

import { BuildingRepository } from '../repositories/building.repository.js';
import { ParcelRepository } from '../repositories/parcel.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { RentalUnitRepository } from '../repositories/rental.repository.js';
import { CityRepository } from '../repositories/city.repository.js';
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from '../plugins/error-handler.plugin.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { Building, BuildingType } from '../models/types.js';

// Building costs per type (base cost per floor)
const BUILDING_COSTS: Record<BuildingType, number> = {
  house: 500,
  apartment: 1000,
  shop: 800,
  office: 1500,
  factory: 3000,
  power_plant: 5000,
  water_tower: 2000,
  road: 100,
  park: 300,
  plaza: 500,
  city_hall: 10000,
  police_station: 3000,
  courthouse: 5000,
  jail: 4000,
};

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

  constructor(db: DrizzleDb) {
    this.buildingRepo = new BuildingRepository(db);
    this.parcelRepo = new ParcelRepository(db);
    this.agentRepo = new AgentRepository(db);
    this.rentalRepo = new RentalUnitRepository(db);
    this.cityRepo = new CityRepository(db);
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
    const baseCost = BUILDING_COSTS[type] || 500;
    const totalCost = baseCost * floors;
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
  }): Promise<Building> {
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

    // Check if parcel is owned
    if (!parcel.ownerId) {
      throw new ValidationError('Parcel must be owned to build on it');
    }

    // Find agent
    let agent = null;
    if (params.agentId) {
      agent = await this.agentRepo.getAgent(params.agentId);
    } else if (params.moltbookId) {
      agent = await this.agentRepo.getAgentByMoltbookId(params.moltbookId);
    }

    // If no agent specified, use parcel owner
    const ownerId = agent?.id || parcel.ownerId;

    // Verify owner permission
    if (agent && parcel.ownerId !== agent.id) {
      throw new ForbiddenError('Agent does not own this parcel');
    }

    // Check for existing building
    const existingBuilding = await this.buildingRepo.getBuildingAtParcel(parcel.id);
    if (existingBuilding) {
      throw new ConflictError('Parcel already has a building');
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
