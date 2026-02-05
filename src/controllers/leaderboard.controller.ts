// ============================================
// MOLTCITY - Leaderboard Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { eq, desc, sql, count } from 'drizzle-orm';
import { agents } from '../db/schema/agents.js';
import { buildings } from '../db/schema/buildings.js';
import { parcels } from '../db/schema/parcels.js';
import { residents } from '../db/schema/population.js';
import { users } from '../db/schema/auth.js';

interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  avatar?: string;
  wealth: number;
  buildingCount: number;
  populationCount: number;
  netWorth: number;
}

export const leaderboardController: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db;

  // Get leaderboard - top players by net worth
  fastify.get('/api/leaderboard', async (request) => {
    const query = request.query as { limit?: string; sort?: string };
    const limit = Math.min(parseInt(query.limit || '10'), 50);
    const sortBy = query.sort || 'netWorth'; // netWorth, wealth, buildings, population

    // Get all agents with their wallet balance
    const allAgents = await db.select().from(agents);

    // Get building counts and values per owner
    const buildingStats = await db
      .select({
        ownerId: buildings.ownerId,
        buildingCount: count(buildings.id),
      })
      .from(buildings)
      .where(eq(buildings.constructionProgress, 100))
      .groupBy(buildings.ownerId);

    // Get population counts per building owner (residents in their buildings)
    const populationStats = await db
      .select({
        ownerId: buildings.ownerId,
        populationCount: count(residents.id),
      })
      .from(buildings)
      .leftJoin(residents, eq(residents.homeBuildingId, buildings.id))
      .where(eq(buildings.constructionProgress, 100))
      .groupBy(buildings.ownerId);

    // Also get user accounts (they can own buildings too)
    const allUsers = await db.select({
      id: users.id,
      name: users.name,
      agentId: users.agentId,
    }).from(users);

    // Create lookup maps
    const buildingMap = new Map(buildingStats.map(b => [b.ownerId, b.buildingCount]));
    const populationMap = new Map(populationStats.map(p => [p.ownerId, p.populationCount]));
    const userAgentMap = new Map(allUsers.map(u => [u.agentId, u]));

    // Building value estimates
    const BUILDING_VALUES: Record<string, number> = {
      house: 250,
      apartment: 600,
      shop: 500,
      office: 800,
      factory: 2000,
      park: 200,
      power_plant: 500,
      water_tower: 300,
    };

    // Get detailed building info for value calculation
    const allBuildings = await db
      .select({
        ownerId: buildings.ownerId,
        type: buildings.type,
        floors: buildings.floors,
      })
      .from(buildings)
      .where(eq(buildings.constructionProgress, 100));

    // Calculate property value per owner
    const propertyValueMap = new Map<string, number>();
    for (const b of allBuildings) {
      const baseValue = BUILDING_VALUES[b.type] || 250;
      const value = baseValue * (b.floors || 1);
      propertyValueMap.set(b.ownerId, (propertyValueMap.get(b.ownerId) || 0) + value);
    }

    // Build leaderboard entries for agents
    const entries: LeaderboardEntry[] = allAgents.map(agent => {
      const buildingCount = buildingMap.get(agent.id) || 0;
      const populationCount = populationMap.get(agent.id) || 0;
      const propertyValue = propertyValueMap.get(agent.id) || 0;
      const wealth = agent.walletBalance || 0;
      const netWorth = wealth + propertyValue;

      return {
        rank: 0,
        id: agent.id,
        name: agent.name,
        avatar: agent.avatar || undefined,
        wealth,
        buildingCount,
        populationCount,
        netWorth,
      };
    });

    // Also add users who own buildings but aren't agents
    const agentIds = new Set(allAgents.map(a => a.id));
    const userOwners = [...new Set(allBuildings.map(b => b.ownerId))].filter(id => !agentIds.has(id));
    
    for (const userId of userOwners) {
      const user = allUsers.find(u => u.id === userId);
      if (user) {
        const buildingCount = buildingMap.get(userId) || 0;
        const populationCount = populationMap.get(userId) || 0;
        const propertyValue = propertyValueMap.get(userId) || 0;

        entries.push({
          rank: 0,
          id: userId,
          name: user.name || 'Unknown',
          avatar: undefined,
          wealth: 0, // Users don't have wallet in agents table
          buildingCount,
          populationCount,
          netWorth: propertyValue,
        });
      }
    }

    // Sort based on requested criteria
    switch (sortBy) {
      case 'wealth':
        entries.sort((a, b) => b.wealth - a.wealth);
        break;
      case 'buildings':
        entries.sort((a, b) => b.buildingCount - a.buildingCount);
        break;
      case 'population':
        entries.sort((a, b) => b.populationCount - a.populationCount);
        break;
      case 'netWorth':
      default:
        entries.sort((a, b) => b.netWorth - a.netWorth);
        break;
    }

    // Assign ranks and limit
    const leaderboard = entries
      .slice(0, limit)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    // Calculate totals
    const totals = {
      totalPlayers: entries.length,
      totalWealth: entries.reduce((sum, e) => sum + e.wealth, 0),
      totalBuildings: entries.reduce((sum, e) => sum + e.buildingCount, 0),
      totalPopulation: entries.reduce((sum, e) => sum + e.populationCount, 0),
    };

    return {
      leaderboard,
      totals,
      sortBy,
    };
  });
};
