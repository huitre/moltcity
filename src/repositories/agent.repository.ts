// ============================================
// MOLTCITY - Agent Repository
// ============================================

import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { agents, type AgentRow, type AgentInsert } from '../db/schema/agents.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { Agent, AgentState, Coordinate } from '../models/types.js';
import { CURRENCY } from '../config/game.js';

const DEFAULT_SCHEDULE = { wakeUp: 7, workStart: 9, workEnd: 17, sleepTime: 22 };

export class AgentRepository extends BaseRepository<typeof agents, AgentRow, AgentInsert> {
  constructor(db: DrizzleDb) {
    super(db, agents);
  }

  async getAgent(id: string): Promise<Agent | null> {
    const result = await this.findById(id, agents.id);
    return result ? this.rowToAgent(result) : null;
  }

  async getAllAgents(cityId?: string): Promise<Agent[]> {
    if (!cityId) return [];
    const results = await this.db.select().from(agents).where(eq(agents.cityId, cityId));
    return results.map(row => this.rowToAgent(row));
  }

  async getAgentsInRange(minX: number, minY: number, maxX: number, maxY: number): Promise<Agent[]> {
    const results = await this.db
      .select()
      .from(agents)
      .where(
        and(
          gte(agents.currentX, minX),
          lte(agents.currentX, maxX),
          gte(agents.currentY, minY),
          lte(agents.currentY, maxY)
        )
      );
    return results.map(row => this.rowToAgent(row));
  }

  async createAgent(name: string, startX: number, startY: number, moltbookId?: string): Promise<Agent> {
    const id = this.generateId();
    await this.db.insert(agents).values({
      id,
      name,
      currentX: startX,
      currentY: startY,
      schedule: JSON.stringify(DEFAULT_SCHEDULE),
      walletBalance: CURRENCY.STARTING_BALANCE,
      moltbookId: moltbookId || null,
      createdAt: this.now(),
    });
    return (await this.getAgent(id))!;
  }

  async updatePosition(agentId: string, x: number, y: number): Promise<void> {
    await this.db
      .update(agents)
      .set({ currentX: x, currentY: y })
      .where(eq(agents.id, agentId));
  }

  async updateState(agentId: string, state: AgentState): Promise<void> {
    await this.db
      .update(agents)
      .set({ state })
      .where(eq(agents.id, agentId));
  }

  async setDestination(agentId: string, x: number, y: number, path: Coordinate[]): Promise<void> {
    await this.db
      .update(agents)
      .set({
        destinationX: x,
        destinationY: y,
        path: JSON.stringify(path),
      })
      .where(eq(agents.id, agentId));
  }

  async clearDestination(agentId: string): Promise<void> {
    await this.db
      .update(agents)
      .set({
        destinationX: null,
        destinationY: null,
        path: null,
      })
      .where(eq(agents.id, agentId));
  }

  async setHome(agentId: string, buildingId: string | null): Promise<void> {
    await this.db
      .update(agents)
      .set({ homeBuildingId: buildingId })
      .where(eq(agents.id, agentId));
  }

  async setWork(agentId: string, buildingId: string | null): Promise<void> {
    await this.db
      .update(agents)
      .set({ workBuildingId: buildingId })
      .where(eq(agents.id, agentId));
  }

  async getAgentByMoltbookId(moltbookId: string): Promise<Agent | null> {
    const results = await this.db
      .select()
      .from(agents)
      .where(eq(agents.moltbookId, moltbookId))
      .limit(1);
    return results.length > 0 ? this.rowToAgent(results[0]) : null;
  }

  async findAgent(identifier: string): Promise<Agent | null> {
    // Try direct ID first
    let agent = await this.getAgent(identifier);
    if (agent) return agent;

    // Try moltbookId
    agent = await this.getAgentByMoltbookId(identifier);
    return agent;
  }

  async updateWalletBalance(agentId: string, newBalance: number): Promise<void> {
    await this.db
      .update(agents)
      .set({ walletBalance: newBalance })
      .where(eq(agents.id, agentId));
  }

  async addToWallet(agentId: string, amount: number): Promise<void> {
    await this.db
      .update(agents)
      .set({ walletBalance: sql`${agents.walletBalance} + ${amount}` })
      .where(eq(agents.id, agentId));
  }

  async deductFromWallet(agentId: string, amount: number): Promise<boolean> {
    const agent = await this.getAgent(agentId);
    if (!agent || agent.wallet.balance < amount) return false;
    await this.db
      .update(agents)
      .set({ walletBalance: sql`${agents.walletBalance} - ${amount}` })
      .where(eq(agents.id, agentId));
    return true;
  }

  async updateAvatar(agentId: string, avatar: string): Promise<void> {
    await this.db
      .update(agents)
      .set({ avatar })
      .where(eq(agents.id, agentId));
  }

  private rowToAgent(row: AgentRow): Agent {
    return {
      id: row.id,
      name: row.name,
      avatar: row.avatar || '',
      home: row.homeBuildingId,
      work: row.workBuildingId,
      currentLocation: { x: row.currentX, y: row.currentY },
      destination: row.destinationX != null && row.destinationY != null
        ? { x: row.destinationX, y: row.destinationY }
        : null,
      path: row.path ? JSON.parse(row.path) : [],
      state: row.state as AgentState,
      schedule: row.schedule ? JSON.parse(row.schedule) : DEFAULT_SCHEDULE,
      wallet: {
        balance: row.walletBalance,
        currency: row.walletCurrency as 'MOLT' | 'USD',
      },
      moltbookId: row.moltbookId,
      createdAt: row.createdAt,
    };
  }
}
