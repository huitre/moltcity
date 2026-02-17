// ============================================
// MOLTCITY - Leaderboard Controller
// ============================================

import { FastifyPluginAsync } from 'fastify';
import { eq, desc, sql, count, and } from 'drizzle-orm';
import { agents } from '../db/schema/agents.js';
import { buildings } from '../db/schema/buildings.js';
import { parcels } from '../db/schema/parcels.js';
import { residents } from '../db/schema/population.js';
import { users } from '../db/schema/auth.js';
import { extractOptionalCityId } from '../utils/city-context.js';

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
    const cityId = extractOptionalCityId(request);

    // Build building filter conditions
    const buildingConditions = [eq(buildings.constructionProgress, 100)];
    if (cityId) buildingConditions.push(eq(buildings.cityId, cityId));
    const buildingFilter = and(...buildingConditions);

    // Get building counts per owner
    const buildingStats = await db
      .select({
        ownerId: buildings.ownerId,
        buildingCount: count(buildings.id),
      })
      .from(buildings)
      .where(buildingFilter)
      .groupBy(buildings.ownerId);

    // Get population counts per building owner (residents in their buildings)
    const populationStats = await db
      .select({
        ownerId: buildings.ownerId,
        populationCount: count(residents.id),
      })
      .from(buildings)
      .leftJoin(residents, eq(residents.homeBuildingId, buildings.id))
      .where(buildingFilter)
      .groupBy(buildings.ownerId);

    // Get detailed building info for value calculation
    const BUILDING_VALUES: Record<string, number> = {
      house: 250, apartment: 600, shop: 500, office: 800, factory: 2000,
      park: 200, power_plant: 500, water_tower: 300, fire_station: 2000,
      school: 800, hospital: 8000, police_station: 1500,
    };

    const allBuildings = await db
      .select({
        ownerId: buildings.ownerId,
        type: buildings.type,
        floors: buildings.floors,
      })
      .from(buildings)
      .where(buildingFilter);

    // Calculate property value per owner
    const propertyValueMap = new Map<string, number>();
    for (const b of allBuildings) {
      const baseValue = BUILDING_VALUES[b.type] || 250;
      const value = baseValue * (b.floors || 1);
      propertyValueMap.set(b.ownerId, (propertyValueMap.get(b.ownerId) || 0) + value);
    }

    // Create lookup maps
    const buildingMap = new Map(buildingStats.map(b => [b.ownerId, b.buildingCount]));
    const populationMap = new Map(populationStats.map(p => [p.ownerId, p.populationCount]));

    // Derive unique owner IDs from buildings (agents are global, not per-city)
    const ownerIds = [...new Set(allBuildings.map(b => b.ownerId))];

    // Look up agents and users for those owners
    const allAgents = ownerIds.length > 0
      ? await db.select().from(agents)
      : [];
    const agentMap = new Map(allAgents.map(a => [a.id, a]));

    const allUsers = await db.select({
      id: users.id,
      name: users.name,
      agentId: users.agentId,
    }).from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u]));

    // Build leaderboard entries from building owners
    const entries: LeaderboardEntry[] = [];
    for (const ownerId of ownerIds) {
      const agent = agentMap.get(ownerId);
      const user = userMap.get(ownerId);
      const buildingCount = buildingMap.get(ownerId) || 0;
      const populationCount = populationMap.get(ownerId) || 0;
      const propertyValue = propertyValueMap.get(ownerId) || 0;
      const wealth = agent?.walletBalance || 0;
      const netWorth = wealth + propertyValue;

      entries.push({
        rank: 0,
        id: ownerId,
        name: agent?.name || user?.name || 'Unknown',
        avatar: agent?.avatar || undefined,
        wealth,
        buildingCount,
        populationCount,
        netWorth,
      });
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
