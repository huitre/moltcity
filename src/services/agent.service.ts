// ============================================
// MOLTCITY - Agent Service
// ============================================

import { AgentRepository } from '../repositories/agent.repository.js';
import { BuildingRepository } from '../repositories/building.repository.js';
import { ParcelRepository } from '../repositories/parcel.repository.js';
import { RoadRepository } from '../repositories/road.repository.js';
import { NotFoundError, ValidationError, InsufficientFundsError } from '../plugins/error-handler.plugin.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { Agent, AgentState, Coordinate } from '../models/types.js';

export class AgentService {
  private agentRepo: AgentRepository;
  private buildingRepo: BuildingRepository;
  private parcelRepo: ParcelRepository;
  private roadRepo: RoadRepository;

  constructor(db: DrizzleDb) {
    this.agentRepo = new AgentRepository(db);
    this.buildingRepo = new BuildingRepository(db);
    this.parcelRepo = new ParcelRepository(db);
    this.roadRepo = new RoadRepository(db);
  }

  async getAgent(id: string): Promise<Agent | null> {
    return this.agentRepo.getAgent(id);
  }

  async getAllAgents(cityId?: string): Promise<Agent[]> {
    return this.agentRepo.getAllAgents(cityId);
  }

  async findAgent(identifier: string): Promise<Agent | null> {
    return this.agentRepo.findAgent(identifier);
  }

  async getAgentByMoltbookId(moltbookId: string): Promise<Agent | null> {
    return this.agentRepo.getAgentByMoltbookId(moltbookId);
  }

  async createAgent(params: {
    name: string;
    x?: number;
    y?: number;
    moltbookId?: string;
    avatar?: string;
    initialBalance?: number;
  }): Promise<Agent> {
    const x = params.x ?? 25;
    const y = params.y ?? 25;

    const agent = await this.agentRepo.createAgent(
      params.name,
      x,
      y,
      params.moltbookId
    );

    // Set avatar if provided
    if (params.avatar) {
      await this.agentRepo.updateAvatar(agent.id, params.avatar);
    }

    // Add initial balance if specified
    if (params.initialBalance && params.initialBalance > 0) {
      await this.agentRepo.addToWallet(agent.id, params.initialBalance);
    }

    return (await this.agentRepo.getAgent(agent.id))!;
  }

  async moveAgent(agentId: string, destination: Coordinate): Promise<Agent> {
    const agent = await this.agentRepo.getAgent(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    // Validate destination is within grid
    const parcel = await this.parcelRepo.getParcel(
      Math.floor(destination.x),
      Math.floor(destination.y)
    );
    if (!parcel) {
      throw new ValidationError('Destination is outside city bounds');
    }

    // Calculate path (simplified - actual pathfinding is in simulation)
    const path = this.calculateSimplePath(agent.currentLocation, destination);

    // Set destination and path
    await this.agentRepo.setDestination(agentId, destination.x, destination.y, path);
    await this.agentRepo.updateState(agentId, 'traveling');

    return (await this.agentRepo.getAgent(agentId))!;
  }

  private calculateSimplePath(from: Coordinate, to: Coordinate): Coordinate[] {
    // Simple straight-line path (actual pathfinding uses A* in simulation)
    const path: Coordinate[] = [];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));

    if (steps === 0) return [to];

    for (let i = 1; i <= steps; i++) {
      path.push({
        x: from.x + (dx * i) / steps,
        y: from.y + (dy * i) / steps,
      });
    }

    return path;
  }

  async updateState(agentId: string, state: AgentState): Promise<void> {
    const agent = await this.agentRepo.getAgent(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    await this.agentRepo.updateState(agentId, state);
  }

  async updatePosition(agentId: string, x: number, y: number): Promise<void> {
    await this.agentRepo.updatePosition(agentId, x, y);
  }

  async setHome(agentId: string, buildingId: string): Promise<Agent> {
    const agent = await this.agentRepo.getAgent(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    const building = await this.buildingRepo.getBuilding(buildingId);
    if (!building) {
      throw new NotFoundError('Building', buildingId);
    }

    await this.agentRepo.setHome(agentId, buildingId);
    return (await this.agentRepo.getAgent(agentId))!;
  }

  async setWork(agentId: string, buildingId: string): Promise<Agent> {
    const agent = await this.agentRepo.getAgent(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    const building = await this.buildingRepo.getBuilding(buildingId);
    if (!building) {
      throw new NotFoundError('Building', buildingId);
    }

    await this.agentRepo.setWork(agentId, buildingId);
    return (await this.agentRepo.getAgent(agentId))!;
  }

  async addFunds(agentId: string, amount: number): Promise<Agent> {
    const agent = await this.agentRepo.getAgent(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    await this.agentRepo.addToWallet(agentId, amount);
    return (await this.agentRepo.getAgent(agentId))!;
  }

  async transferFunds(fromAgentId: string, toAgentId: string, amount: number): Promise<void> {
    const fromAgent = await this.agentRepo.getAgent(fromAgentId);
    if (!fromAgent) {
      throw new NotFoundError('Source agent', fromAgentId);
    }

    const toAgent = await this.agentRepo.getAgent(toAgentId);
    if (!toAgent) {
      throw new NotFoundError('Destination agent', toAgentId);
    }

    if (fromAgent.wallet.balance < amount) {
      throw new InsufficientFundsError(amount, fromAgent.wallet.balance);
    }

    await this.agentRepo.deductFromWallet(fromAgentId, amount);
    await this.agentRepo.addToWallet(toAgentId, amount);
  }
}
