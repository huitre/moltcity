// ============================================
// MOLTCITY - Simulation Engine
// ============================================

import { EventEmitter } from 'events';
import type { Agent, Vehicle, Building, CityEvent, CityEventType, Coordinate, City, CityTime, AgentState, BuildingType } from '../models/types.js';
import { LegacyDatabaseManagerAdapter, CityScopedDatabaseAdapter, type SimulationDb } from './engine.adapter.js';
import { Pathfinder, WalkingPathfinder } from './pathfinding.js';
import { BUILDING_JOBS, TRAFFIC, INFRASTRUCTURE_FEES, BUILDING_COSTS, SC2K_ECONOMY, POWER_CAPACITY, CITY_SERVICES } from '../config/game.js';
import type { Bond, DepartmentFunding, BudgetYtd } from '../models/types.js';
import { LandValueSimulator } from './landvalue.simulator.js';
import { ZoneEvolutionSimulator } from './zone-evolution.simulator.js';
import { DemandCalculator } from './demand.calculator.js';
import { CrimeSimulator } from './crime.simulator.js';
import { FireSimulator } from './fire.simulator.js';
import { ZoneBuildSimulator } from './zone-build.simulator.js';
import { TaxPenaltySimulator } from './tax-penalty.simulator.js';

// ============================================
// Activity Logger
// ============================================

export type ActivityLogger = (type: string, message: string, metadata?: Record<string, unknown>) => void;

// ============================================
// Configuration
// ============================================

const TICK_INTERVAL_MS = 10;            // How often the simulation updates (10ms = 100 ticks/second) - 5x SPEED FOR TIMELAPSE
const TICKS_PER_MINUTE = 5;             // 5 ticks = 1 in-game minute (faster days)
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

const AGENT_WALK_SPEED = 0.5;           // Parcels per tick
const VEHICLE_BASE_SPEED = 2.0;         // Parcels per tick

// Time constants
const TICKS_PER_HOUR = TICKS_PER_MINUTE * MINUTES_PER_HOUR; // 5 ticks/min * 60 min = 300
const TICKS_PER_DAY = TICKS_PER_HOUR * 24;
const WARNING_DEADLINE_DAYS = 3; // Days to pay after warning
const JAIL_SENTENCE_DAYS = 7; // Days in jail for rent nonpayment

// Large bounds for infinite world pathfinding
const WORLD_BOUNDS = 10000;

// Population rules per building type
const POPULATION_RULES: Record<string, { min: number; max: number; perFloor: boolean }> = {
  house: { min: 2, max: 4, perFloor: false },
  apartment: { min: 3, max: 3, perFloor: true },
  residential: { min: 2, max: 4, perFloor: true },
  suburban: { min: 2, max: 4, perFloor: false },
};

// ============================================
// Rent Enforcement Simulator
// ============================================

export class RentEnforcementSimulator {
  private lastProcessedDay: number = 0;

  constructor(private db: SimulationDb, private log?: ActivityLogger) {}

  /**
   * Process rent enforcement - runs once per day at midnight
   */
  simulate(currentTick: number, time: CityTime): void {
    // Only run once per day (at hour 0)
    if (time.hour !== 0 || this.lastProcessedDay === time.day) {
      return;
    }
    this.lastProcessedDay = time.day;

    console.log(`[RentEnforcement] Processing rent enforcement for day ${time.day}`);

    // 1. Check for overdue rent and create warnings
    this.processOverdueRent(currentTick, time);

    // 2. Check for expired warnings and escalate to court
    this.processExpiredWarnings(currentTick);

    // 3. Process pending court cases (auto-judgment after 1 day)
    this.processCourtCases(currentTick);

    // 4. Release inmates whose sentence is complete
    this.processJailReleases(currentTick);
  }

  private processOverdueRent(currentTick: number, time: CityTime): void {
    const occupiedUnits = this.db.rentalUnits.getOccupiedUnits();

    for (const unit of occupiedUnits) {
      if (!unit.tenantId || !unit.leaseStart) continue;

      // Check if rent is due (monthly - every 30 days since lease start)
      const ticksSinceLeaseStart = currentTick - unit.leaseStart;
      const daysSinceLeaseStart = Math.floor(ticksSinceLeaseStart / TICKS_PER_DAY);

      // Rent is due on day 30, 60, 90, etc.
      if (daysSinceLeaseStart > 0 && daysSinceLeaseStart % 30 === 0) {
        // Check if there's already a pending warning for this unit
        const existingWarning = this.db.rentWarnings.getWarningForUnit(unit.id, 'pending');
        if (!existingWarning) {
          // Create a warning with 3-day deadline
          const dueDateTick = currentTick + (WARNING_DEADLINE_DAYS * TICKS_PER_DAY);
          this.db.rentWarnings.createWarning(unit.id, unit.tenantId, unit.monthlyRent, currentTick, dueDateTick);
          console.log(`[RentEnforcement] Warning issued to ${unit.tenantId} for unit ${unit.id}, amount: ${unit.monthlyRent}`);
        }
      }
    }
  }

  private processExpiredWarnings(currentTick: number): void {
    const pendingWarnings = this.db.rentWarnings.getPendingWarnings();

    for (const warning of pendingWarnings) {
      if (currentTick >= warning.dueDate) {
        // Warning expired - escalate to court
        this.db.rentWarnings.updateStatus(warning.id, 'escalated');

        // Get the unit to find the building owner (plaintiff)
        const unit = this.db.rentalUnits.getRentalUnit(warning.unitId);
        if (!unit) continue;

        const building = this.db.buildings.getBuilding(unit.buildingId);
        if (!building) continue;

        // Create court case - hearing in 1 day
        const hearingDateTick = currentTick + TICKS_PER_DAY;
        this.db.courtCases.createCase(
          warning.id,
          warning.tenantId,
          building.ownerId,
          'rent_nonpayment',
          warning.amountOwed,
          hearingDateTick
        );
        console.log(`[RentEnforcement] Court case created against ${warning.tenantId} for ${warning.amountOwed}`);
      }
    }
  }

  private processCourtCases(currentTick: number): void {
    const pendingCases = this.db.courtCases.getPendingCases();

    for (const courtCase of pendingCases) {
      if (courtCase.hearingDate && currentTick >= courtCase.hearingDate) {
        // Auto-judgment: guilty if they haven't paid
        // Check if the warning was paid (if there's a warning associated)
        let isPaid = false;
        if (courtCase.warningId) {
          const warning = this.db.rentWarnings.getWarning(courtCase.warningId);
          if (warning && warning.status === 'paid') {
            isPaid = true;
          }
        }

        if (isPaid) {
          // Dismiss the case
          this.db.courtCases.setVerdict(courtCase.id, 'dismissed', null);
          console.log(`[RentEnforcement] Case ${courtCase.id} dismissed - debt was paid`);
        } else {
          // Guilty - eviction and jail
          this.db.courtCases.setVerdict(courtCase.id, 'guilty', 'jail');

          // Evict the tenant
          if (courtCase.warningId) {
            const warning = this.db.rentWarnings.getWarning(courtCase.warningId);
            if (warning) {
              this.db.rentalUnits.terminateLease(warning.unitId);
              console.log(`[RentEnforcement] Tenant ${courtCase.defendantId} evicted from unit`);
            }
          }

          // Send to jail
          const releaseDateTick = currentTick + (JAIL_SENTENCE_DAYS * TICKS_PER_DAY);
          this.db.jailInmates.createInmate(courtCase.defendantId, courtCase.id, currentTick, releaseDateTick);

          // Update agent state
          this.db.agents.updateState(courtCase.defendantId, 'in_jail');
          console.log(`[RentEnforcement] Agent ${courtCase.defendantId} sent to jail for ${JAIL_SENTENCE_DAYS} days`);
          const jailedAgent = this.db.agents.findAgent(courtCase.defendantId);
          this.log?.('jail_update', `Agent ${jailedAgent?.name || courtCase.defendantId} sent to jail for ${JAIL_SENTENCE_DAYS} days`, {
            agentId: courtCase.defendantId, days: JAIL_SENTENCE_DAYS,
          });
        }
      }
    }
  }

  private processJailReleases(currentTick: number): void {
    const toRelease = this.db.jailInmates.getInmatesForRelease(currentTick);

    for (const inmate of toRelease) {
      this.db.jailInmates.releaseInmate(inmate.id);
      this.db.agents.updateState(inmate.agentId, 'idle');
      console.log(`[RentEnforcement] Agent ${inmate.agentId} released from jail`);
      const releasedAgent = this.db.agents.findAgent(inmate.agentId);
      this.log?.('jail_update', `Agent ${releasedAgent?.name || inmate.agentId} released from jail`, {
        agentId: inmate.agentId,
      });
    }
  }
}

// ============================================
// Infrastructure Helpers
// ============================================

/**
 * Get all tile coordinates along a line between two points (Bresenham-style).
 * Ensures every intermediate tile is included so pipes/lines cover
 * the full visual path, not just the endpoints.
 */
function getTilesAlongLine(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const tiles: Array<{ x: number; y: number }> = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0, cy = y0;

  while (true) {
    tiles.push({ x: cx, y: cy });
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
  return tiles;
}

// ============================================
// Power Grid Simulation
// ============================================

/**
 * Check if any tile in a building's footprint is adjacent to a set of supplied tiles
 */
function isBuildingAdjacentToSupplied(
  px: number, py: number, bw: number, bh: number, suppliedTiles: Set<string>
): boolean {
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const cx = px + bx;
      const cy = py + by;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (suppliedTiles.has(`${cx + dx},${cy + dy}`)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Add all tiles of a building's footprint to a set
 */
function addBuildingTiles(set: Set<string>, px: number, py: number, bw: number, bh: number): void {
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      set.add(`${px + bx},${py + by}`);
    }
  }
}

export class PowerGridSimulator {
  constructor(private db: SimulationDb) {}

  /**
   * Distribute power from plants to buildings via power lines
   * Returns map of buildingId -> hasPower
   */
  simulate(): Map<string, boolean> {
    const buildings = this.db.buildings.getAllBuildings();
    const powerLines = this.db.powerLines.getAllPowerLines();
    const powerStatus = new Map<string, boolean>();

    // Build adjacency graph from power lines
    // Key: "x,y" -> Set of connected "x,y" coordinates
    const powerGrid = new Map<string, Set<string>>();

    const addConnection = (x1: number, y1: number, x2: number, y2: number) => {
      const key1 = `${x1},${y1}`;
      const key2 = `${x2},${y2}`;
      if (!powerGrid.has(key1)) powerGrid.set(key1, new Set());
      if (!powerGrid.has(key2)) powerGrid.set(key2, new Set());
      powerGrid.get(key1)!.add(key2);
      powerGrid.get(key2)!.add(key1);
    };

    // Add all power line connections (including intermediate tiles)
    for (const line of powerLines) {
      const tiles = getTilesAlongLine(line.from.x, line.from.y, line.to.x, line.to.y);
      for (let t = 0; t < tiles.length - 1; t++) {
        addConnection(tiles[t].x, tiles[t].y, tiles[t + 1].x, tiles[t + 1].y);
      }
    }

    // Find all power plant locations (all footprint tiles)
    const powerPlantTiles = new Set<string>();
    for (const building of buildings) {
      if (POWER_CAPACITY[building.type]) {
        const parcel = this.db.parcels.getParcelById(building.parcelId);
        if (parcel) {
          addBuildingTiles(powerPlantTiles, parcel.x, parcel.y, building.width || 1, building.height || 1);
        }
      }
    }

    // BFS to find all tiles connected to power plants via power lines
    const poweredTiles = new Set<string>();
    const queue: string[] = [];

    // Start from power plants and any power line endpoints adjacent to them
    for (const plantTile of powerPlantTiles) {
      poweredTiles.add(plantTile);
      const [px, py] = plantTile.split(',').map(Number);

      // Check all power grid tiles - if adjacent to power plant, add to queue
      for (const gridTile of powerGrid.keys()) {
        const [gx, gy] = gridTile.split(',').map(Number);
        if (Math.abs(gx - px) <= 1 && Math.abs(gy - py) <= 1) {
          if (!poweredTiles.has(gridTile)) {
            poweredTiles.add(gridTile);
            queue.push(gridTile);
          }
        }
      }
    }

    // BFS through power line network
    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = powerGrid.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!poweredTiles.has(neighbor)) {
            poweredTiles.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }

    // Propagate power through adjacent buildings (chain effect):
    // If a building is adjacent to a powered tile, it becomes powered
    // and its tiles become powered — so adjacent buildings also get power.
    const buildingFootprints: Array<{ building: typeof buildings[0]; tiles: Array<{ x: number; y: number }> }> = [];
    for (const building of buildings) {
      if (POWER_CAPACITY[building.type]) continue;
      const parcel = this.db.parcels.getParcelById(building.parcelId);
      if (!parcel) continue;
      const tiles: Array<{ x: number; y: number }> = [];
      for (let by = 0; by < (building.height || 1); by++) {
        for (let bx = 0; bx < (building.width || 1); bx++) {
          tiles.push({ x: parcel.x + bx, y: parcel.y + by });
        }
      }
      buildingFootprints.push({ building, tiles });
    }

    let changed = true;
    const poweredBuildings = new Set<string>();
    while (changed) {
      changed = false;
      for (const { building, tiles } of buildingFootprints) {
        if (poweredBuildings.has(building.id)) continue;
        // Check if any tile of this building is adjacent to a powered tile
        let adjacent = false;
        for (const tile of tiles) {
          for (let dx = -1; dx <= 1 && !adjacent; dx++) {
            for (let dy = -1; dy <= 1 && !adjacent; dy++) {
              if (poweredTiles.has(`${tile.x + dx},${tile.y + dy}`)) {
                adjacent = true;
              }
            }
          }
          if (adjacent) break;
        }
        if (adjacent) {
          poweredBuildings.add(building.id);
          // Add this building's tiles to poweredTiles so neighbors can chain
          for (const tile of tiles) {
            poweredTiles.add(`${tile.x},${tile.y}`);
          }
          changed = true;
        }
      }
    }

    // Calculate total power capacity from connected plants
    let totalCapacity = 0;
    for (const building of buildings) {
      const cap = POWER_CAPACITY[building.type];
      if (cap) totalCapacity += cap;
    }

    // Calculate total demand from connected buildings
    let totalDemand = 0;
    for (const building of buildings) {
      if (!POWER_CAPACITY[building.type] && poweredBuildings.has(building.id)) {
        totalDemand += building.powerRequired;
      }
    }

    const hasEnoughPower = totalCapacity >= totalDemand;

    // Types that don't need electricity
    const NO_POWER_TYPES = new Set(['park', 'plaza']);

    // Set power status for each building
    for (const building of buildings) {
      if (POWER_CAPACITY[building.type] || NO_POWER_TYPES.has(building.type)) {
        powerStatus.set(building.id, true); // Plants and parks always powered
      } else {
        powerStatus.set(building.id, poweredBuildings.has(building.id) && hasEnoughPower);
      }
    }

    return powerStatus;
  }

  /**
   * Apply power status to buildings in database
   */
  applyPowerStatus(status: Map<string, boolean>): void {
    for (const [buildingId, powered] of status) {
      this.db.buildings.updatePowerStatus(buildingId, powered);
    }
  }
}

// ============================================
// Water Grid Simulation
// ============================================

export class WaterGridSimulator {
  constructor(private db: SimulationDb) {}

  private lastStats = { capacity: 0, demand: 0, suppliedTiles: 0, connectedBuildings: 0 };

  getStats() { return this.lastStats; }

  /**
   * Distribute water from towers to buildings via water pipes
   * Returns map of buildingId -> hasWater
   */
  simulate(): Map<string, boolean> {
    const buildings = this.db.buildings.getAllBuildings();
    const waterPipes = this.db.waterPipes.getAllWaterPipes();
    const waterStatus = new Map<string, boolean>();

    // Build adjacency graph from water pipes
    const waterGrid = new Map<string, Set<string>>();

    const addConnection = (x1: number, y1: number, x2: number, y2: number) => {
      const key1 = `${x1},${y1}`;
      const key2 = `${x2},${y2}`;
      if (!waterGrid.has(key1)) waterGrid.set(key1, new Set());
      if (!waterGrid.has(key2)) waterGrid.set(key2, new Set());
      waterGrid.get(key1)!.add(key2);
      waterGrid.get(key2)!.add(key1);
    };

    // Add all water pipe connections (including intermediate tiles)
    for (const pipe of waterPipes) {
      const tiles = getTilesAlongLine(pipe.from.x, pipe.from.y, pipe.to.x, pipe.to.y);
      for (let t = 0; t < tiles.length - 1; t++) {
        addConnection(tiles[t].x, tiles[t].y, tiles[t + 1].x, tiles[t + 1].y);
      }
    }

    // Find all water tower locations (all footprint tiles)
    const waterTowerTiles = new Set<string>();
    for (const building of buildings) {
      if (building.type === 'water_tower') {
        const parcel = this.db.parcels.getParcelById(building.parcelId);
        if (parcel) {
          addBuildingTiles(waterTowerTiles, parcel.x, parcel.y, building.width || 1, building.height || 1);
        }
      }
    }

    // BFS to find all tiles connected to water towers via water pipes
    const suppliedTiles = new Set<string>();
    const queue: string[] = [];

    for (const towerTile of waterTowerTiles) {
      suppliedTiles.add(towerTile);
      const [tx, ty] = towerTile.split(',').map(Number);

      for (const gridTile of waterGrid.keys()) {
        const [gx, gy] = gridTile.split(',').map(Number);
        if (Math.abs(gx - tx) <= 1 && Math.abs(gy - ty) <= 1) {
          if (!suppliedTiles.has(gridTile)) {
            suppliedTiles.add(gridTile);
            queue.push(gridTile);
          }
        }
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = waterGrid.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!suppliedTiles.has(neighbor)) {
            suppliedTiles.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }

    // Propagate water through adjacent buildings (chain effect)
    const buildingFootprints: Array<{ building: typeof buildings[0]; tiles: Array<{ x: number; y: number }> }> = [];
    for (const building of buildings) {
      if (building.type === 'water_tower') continue;
      const parcel = this.db.parcels.getParcelById(building.parcelId);
      if (!parcel) continue;
      const tiles: Array<{ x: number; y: number }> = [];
      for (let by = 0; by < (building.height || 1); by++) {
        for (let bx = 0; bx < (building.width || 1); bx++) {
          tiles.push({ x: parcel.x + bx, y: parcel.y + by });
        }
      }
      buildingFootprints.push({ building, tiles });
    }

    let changed = true;
    const suppliedBuildings = new Set<string>();
    while (changed) {
      changed = false;
      for (const { building, tiles } of buildingFootprints) {
        if (suppliedBuildings.has(building.id)) continue;
        let adjacent = false;
        for (const tile of tiles) {
          for (let dx = -1; dx <= 1 && !adjacent; dx++) {
            for (let dy = -1; dy <= 1 && !adjacent; dy++) {
              if (suppliedTiles.has(`${tile.x + dx},${tile.y + dy}`)) {
                adjacent = true;
              }
            }
          }
          if (adjacent) break;
        }
        if (adjacent) {
          suppliedBuildings.add(building.id);
          for (const tile of tiles) {
            suppliedTiles.add(`${tile.x},${tile.y}`);
          }
          changed = true;
        }
      }
    }

    // Calculate capacity vs demand
    let totalCapacity = 0;
    for (const building of buildings) {
      if (building.type === 'water_tower') {
        totalCapacity += 10000; // Each tower supplies 10000 units
      }
    }

    let totalDemand = 0;
    let connectedBuildings = 0;
    for (const building of buildings) {
      if (building.type !== 'water_tower' && suppliedBuildings.has(building.id)) {
        totalDemand += building.waterRequired;
        connectedBuildings++;
      }
    }

    const hasEnoughWater = totalCapacity >= totalDemand;

    // Set water status for each building
    for (const building of buildings) {
      if (building.type === 'water_tower') {
        waterStatus.set(building.id, true);
      } else {
        waterStatus.set(building.id, suppliedBuildings.has(building.id) && hasEnoughWater);
      }
    }

    this.lastStats = { capacity: totalCapacity, demand: totalDemand, suppliedTiles: suppliedTiles.size, connectedBuildings };
    return waterStatus;
  }

  applyWaterStatus(status: Map<string, boolean>): void {
    for (const [buildingId, hasWater] of status) {
      this.db.buildings.updateWaterStatus(buildingId, hasWater);
    }
  }
}

// ============================================
// Waste Grid Simulation (road-based BFS)
// ============================================

const WASTE_CAPACITY_PER_DEPOT = 10000;
const WASTE_DEMAND_PER_FLOOR: Partial<Record<string, number>> = {
  residential: 2, offices: 2, suburban: 1, industrial: 8,
  house: 2, apartment: 3, shop: 2, office: 2, factory: 8,
};

// Infrastructure and utility types always get waste service
const WASTE_EXEMPT_TYPES = new Set([
  'park', 'plaza', 'road', 'power_plant', 'wind_turbine', 'coal_plant',
  'nuclear_plant', 'water_tower', 'garbage_depot', 'city_hall',
]);

export class WasteGridSimulator {
  constructor(private db: SimulationDb) {}

  private lastStats = { capacity: 0, demand: 0, connectedBuildings: 0 };

  getStats() { return this.lastStats; }

  /**
   * Determine waste service via road-network BFS from garbage depots.
   * Returns map of buildingId -> hasWaste
   */
  simulate(): Map<string, boolean> {
    const buildings = this.db.buildings.getAllBuildings();
    const roads = this.db.roads.getAllRoads();
    const wasteStatus = new Map<string, boolean>();

    // 1. Build a set of road tile coordinates and a lookup by parcelId -> (x,y)
    const roadTileSet = new Set<string>();
    const parcelCoordCache = new Map<string, { x: number; y: number }>();

    for (const road of roads) {
      const parcel = this.db.parcels.getParcelById(road.parcelId);
      if (parcel) {
        roadTileSet.add(`${parcel.x},${parcel.y}`);
        parcelCoordCache.set(road.parcelId, { x: parcel.x, y: parcel.y });
      }
    }

    // 2. Find garbage depot footprint tiles
    const depotTiles = new Set<string>();
    for (const building of buildings) {
      if (building.type === 'garbage_depot') {
        const parcel = this.db.parcels.getParcelById(building.parcelId);
        if (parcel) {
          for (let dy = 0; dy < (building.height || 1); dy++) {
            for (let dx = 0; dx < (building.width || 1); dx++) {
              depotTiles.add(`${parcel.x + dx},${parcel.y + dy}`);
            }
          }
        }
      }
    }

    // 3. BFS from road tiles adjacent to depot tiles through road network
    const servedRoadTiles = new Set<string>();
    const queue: string[] = [];

    // Seed: road tiles that are 4-directionally adjacent to any depot tile
    for (const depotTile of depotTiles) {
      const [dx, dy] = depotTile.split(',').map(Number);
      for (const [ox, oy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const key = `${dx + ox},${dy + oy}`;
        if (roadTileSet.has(key) && !servedRoadTiles.has(key)) {
          servedRoadTiles.add(key);
          queue.push(key);
        }
      }
    }

    // BFS through 4-directional road adjacency
    while (queue.length > 0) {
      const current = queue.shift()!;
      const [cx, cy] = current.split(',').map(Number);
      for (const [ox, oy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const key = `${cx + ox},${cy + oy}`;
        if (roadTileSet.has(key) && !servedRoadTiles.has(key)) {
          servedRoadTiles.add(key);
          queue.push(key);
        }
      }
    }

    // 4. For each building, check if any footprint tile is 4-directionally adjacent to a served road
    const buildingConnected = new Map<string, boolean>();
    for (const building of buildings) {
      if (WASTE_EXEMPT_TYPES.has(building.type)) {
        buildingConnected.set(building.id, true);
        continue;
      }
      const parcel = this.db.parcels.getParcelById(building.parcelId);
      if (!parcel) { buildingConnected.set(building.id, false); continue; }

      let connected = false;
      for (let dy = 0; dy < (building.height || 1) && !connected; dy++) {
        for (let dx = 0; dx < (building.width || 1) && !connected; dx++) {
          const bx = parcel.x + dx;
          const by = parcel.y + dy;
          for (const [ox, oy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            if (servedRoadTiles.has(`${bx + ox},${by + oy}`)) {
              connected = true;
              break;
            }
          }
        }
      }
      buildingConnected.set(building.id, connected);
    }

    // 5. Calculate total capacity vs demand
    let totalCapacity = 0;
    let totalDemand = 0;
    let connectedBuildings = 0;

    for (const building of buildings) {
      if (building.type === 'garbage_depot') {
        totalCapacity += WASTE_CAPACITY_PER_DEPOT;
        continue;
      }
      const demandPerFloor = WASTE_DEMAND_PER_FLOOR[building.type] || 0;
      if (demandPerFloor > 0) {
        totalDemand += demandPerFloor * (building.floors || 1);
      }
    }

    const hasEnoughCapacity = totalCapacity >= totalDemand;

    // 6. Set waste status
    for (const building of buildings) {
      if (WASTE_EXEMPT_TYPES.has(building.type) || building.type === 'garbage_depot') {
        wasteStatus.set(building.id, true);
      } else {
        const connected = buildingConnected.get(building.id) || false;
        wasteStatus.set(building.id, connected && hasEnoughCapacity);
        if (connected) connectedBuildings++;
      }
    }

    this.lastStats = { capacity: totalCapacity, demand: totalDemand, connectedBuildings };
    return wasteStatus;
  }

  applyWasteStatus(status: Map<string, boolean>): void {
    for (const [buildingId, hasWaste] of status) {
      this.db.buildings.updateWasteStatus(buildingId, hasWaste);
    }
  }

  /**
   * Accumulate garbage on buildings without waste service,
   * and decrease garbage on buildings with waste service.
   * Called once per in-game day.
   */
  accumulateGarbage(): void {
    const buildings = this.db.buildings.getAllBuildings();
    const garbagePerDay = CITY_SERVICES.GARBAGE_PER_DAY as Record<string, number>;
    const maxLevel = CITY_SERVICES.MAX_GARBAGE_LEVEL;
    const updates: { id: string; level: number }[] = [];

    for (const building of buildings) {
      if (WASTE_EXEMPT_TYPES.has(building.type)) continue;
      if (building.constructionProgress < 100) continue;

      const current = building.garbageLevel ?? 0;
      let newLevel: number;

      const rate = garbagePerDay[building.type] || 1;
      if (building.hasWaste) {
        // Collection active: decrease at same rate as accumulation
        newLevel = Math.max(0, current - rate);
      } else {
        // No collection: accumulate based on building type
        newLevel = Math.min(maxLevel, current + rate);
      }

      if (newLevel !== current) {
        updates.push({ id: building.id, level: newLevel });
      }
    }

    if (updates.length > 0) {
      (this.db.buildings as any).updateGarbageLevelsBatch(updates);
    }
  }
}

// ============================================
// Agent Behavior Simulator
// ============================================

export class AgentSimulator {
  private pathfinder: Pathfinder;
  private walkingPathfinder: WalkingPathfinder;

  constructor(private db: SimulationDb) {
    const roads = this.db.roads.getAllRoads();
    this.pathfinder = new Pathfinder(roads, WORLD_BOUNDS, WORLD_BOUNDS);
    this.walkingPathfinder = new WalkingPathfinder(WORLD_BOUNDS, WORLD_BOUNDS);
  }

  /**
   * Update all agents for one tick
   */
  simulate(time: CityTime): CityEvent[] {
    const events: CityEvent[] = [];
    const agents = this.db.agents.getAllAgents();

    for (const agent of agents) {
      const agentEvents = this.updateAgent(agent, time);
      events.push(...agentEvents);
    }

    return events;
  }

  private updateAgent(agent: Agent, time: CityTime): CityEvent[] {
    const events: CityEvent[] = [];

    // If agent has a path, move along it
    if (agent.path.length > 0) {
      const nextPoint = agent.path[0];
      const dx = nextPoint.x - agent.currentLocation.x;
      const dy = nextPoint.y - agent.currentLocation.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= AGENT_WALK_SPEED) {
        // Reached the next waypoint
        agent.currentLocation = nextPoint;
        agent.path.shift();

        this.db.agents.updatePosition(agent.id, nextPoint.x, nextPoint.y);

        // If we've reached the destination
        if (agent.path.length === 0) {
          this.db.agents.setDestination(agent.id, 0, 0, []);
          events.push({
            type: 'agent_arrived',
            timestamp: Date.now(),
            data: { agentId: agent.id, location: nextPoint },
          });
        }
      } else {
        // Move towards next waypoint
        const moveX = (dx / distance) * AGENT_WALK_SPEED;
        const moveY = (dy / distance) * AGENT_WALK_SPEED;
        const newX = agent.currentLocation.x + moveX;
        const newY = agent.currentLocation.y + moveY;

        this.db.agents.updatePosition(agent.id, newX, newY);

        events.push({
          type: 'agent_moved',
          timestamp: Date.now(),
          data: { agentId: agent.id, from: agent.currentLocation, to: { x: newX, y: newY } },
        });
      }
    } else {
      // No current path - check if agent should go somewhere based on schedule
      const action = this.decideAction(agent, time);
      if (action) {
        const path = this.walkingPathfinder.findPath(agent.currentLocation, action.destination);
        if (path.length > 0) {
          this.db.agents.setDestination(agent.id, action.destination.x, action.destination.y, path);
          this.db.agents.updateState(agent.id, action.state);
        }
      }
    }

    return events;
  }

  private decideAction(agent: Agent, time: CityTime): { destination: Coordinate; state: Agent['state'] } | null {
    const hour = time.hour;
    const schedule = agent.schedule;

    // Check schedule
    if (hour === schedule.workStart && agent.state !== 'working' && agent.work) {
      const workBuilding = this.db.buildings.getBuilding(agent.work);
      if (workBuilding) {
        const parcel = this.db.parcels.getParcelById(workBuilding.parcelId);
        if (parcel) {
          return { destination: { x: parcel.x, y: parcel.y }, state: 'traveling' };
        }
      }
    }

    if (hour === schedule.workEnd && agent.state === 'working' && agent.home) {
      const homeBuilding = this.db.buildings.getBuilding(agent.home);
      if (homeBuilding) {
        const parcel = this.db.parcels.getParcelById(homeBuilding.parcelId);
        if (parcel) {
          return { destination: { x: parcel.x, y: parcel.y }, state: 'traveling' };
        }
      }
    }

    return null;
  }

  /**
   * Update pathfinder when roads change
   */
  updateRoads(): void {
    const roads = this.db.roads.getAllRoads();
    this.pathfinder.updateRoads(roads);
  }
}

// ============================================
// Vehicle Simulator
// ============================================

export class VehicleSimulator {
  private pathfinder: Pathfinder;

  constructor(private db: SimulationDb) {
    const roads = this.db.roads.getAllRoads();
    this.pathfinder = new Pathfinder(roads, WORLD_BOUNDS, WORLD_BOUNDS);
  }

  /**
   * Update all vehicles for one tick
   */
  simulate(): CityEvent[] {
    const events: CityEvent[] = [];
    const vehicles = this.db.vehicles.getAllVehicles();

    for (const vehicle of vehicles) {
      const vehicleEvents = this.updateVehicle(vehicle);
      events.push(...vehicleEvents);
    }

    // Update traffic load on roads based on vehicle positions
    this.updateTraffic(vehicles);

    return events;
  }

  private updateVehicle(vehicle: Vehicle): CityEvent[] {
    const events: CityEvent[] = [];

    if (vehicle.path.length > 0) {
      const nextPoint = vehicle.path[0];
      const dx = nextPoint.x - vehicle.position.x;
      const dy = nextPoint.y - vehicle.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Get road speed limit
      const road = this.db.roads.getRoad(`parcel_${Math.round(vehicle.position.x)}_${Math.round(vehicle.position.y)}`);
      const speedLimit = road ? road.speedLimit / 50 : 1; // Normalize speed
      const actualSpeed = vehicle.speed * speedLimit;

      if (distance <= actualSpeed) {
        vehicle.position = nextPoint;
        vehicle.path.shift();
        this.db.vehicles.updatePosition(vehicle.id, nextPoint.x, nextPoint.y);
      } else {
        const moveX = (dx / distance) * actualSpeed;
        const moveY = (dy / distance) * actualSpeed;
        const newX = vehicle.position.x + moveX;
        const newY = vehicle.position.y + moveY;
        this.db.vehicles.updatePosition(vehicle.id, newX, newY);
      }
    }

    return events;
  }

  private updateTraffic(vehicles: Vehicle[]): void {
    // Count vehicles on each road segment
    const trafficCount = new Map<string, number>();

    for (const vehicle of vehicles) {
      const parcelId = `parcel_${Math.round(vehicle.position.x)}_${Math.round(vehicle.position.y)}`;
      trafficCount.set(parcelId, (trafficCount.get(parcelId) || 0) + 1);
    }

    // Update road traffic loads
    const roads = this.db.roads.getAllRoads();
    for (const road of roads) {
      const count = trafficCount.get(road.parcelId) || 0;
      const load = Math.min(count / road.lanes, 1); // Normalize to 0-1
      this.db.roads.updateTrafficLoad(road.id, load);
    }
  }

  updateRoads(): void {
    const roads = this.db.roads.getAllRoads();
    this.pathfinder.updateRoads(roads);
  }
}

// ============================================
// Population Simulator
// ============================================

export class PopulationSimulator {
  constructor(private db: SimulationDb) {}

  /**
   * Spawn residents when a residential building is completed
   */
  onBuildingCompleted(building: Building): CityEvent[] {
    const events: CityEvent[] = [];
    const rules = POPULATION_RULES[building.type];

    if (!rules) {
      return events;
    }

    let residentCount: number;
    if (rules.perFloor) {
      residentCount = rules.min * building.floors;
    } else {
      residentCount = Math.floor(Math.random() * (rules.max - rules.min + 1)) + rules.min;
    }

    console.log(`[Population] Spawning ${residentCount} residents for ${building.type} "${building.name}"`);

    for (let i = 0; i < residentCount; i++) {
      const resident = this.db.population.createResident(building.id);
      events.push({
        type: 'resident_spawned' as CityEventType,
        timestamp: Date.now(),
        data: {
          residentId: resident.id,
          name: resident.name,
          buildingId: building.id,
          buildingName: building.name,
        },
      });
    }

    return events;
  }

  /**
   * Remove residents when a building is demolished
   */
  onBuildingDemolished(buildingId: string): CityEvent[] {
    const events: CityEvent[] = [];
    const residents = this.db.population.getResidentsByHome(buildingId);
    const count = this.db.population.deleteResidentsByHome(buildingId);

    if (count > 0) {
      console.log(`[Population] ${count} residents displaced from demolished building`);
      events.push({
        type: 'residents_displaced' as CityEventType,
        timestamp: Date.now(),
        data: {
          buildingId,
          count,
          residentIds: residents.map(r => r.id),
        },
      });
    }

    this.db.population.removeWorkFromBuilding(buildingId);
    return events;
  }

  getPopulationStats(): { total: number; employed: number; unemployed: number; employmentRate: number } {
    const total = this.db.population.getTotalPopulation();
    const employed = this.db.population.getEmployedCount();
    const unemployed = total - employed;
    const employmentRate = total > 0 ? (employed / total) * 100 : 0;
    return { total, employed, unemployed, employmentRate };
  }
}

// ============================================
// Employment Simulator
// ============================================

export class EmploymentSimulator {
  private lastPayrollDay: number = 0;
  private lastJobMatchTick: number = 0;

  constructor(private db: SimulationDb) {}

  /**
   * Main simulation tick
   */
  simulate(currentTick: number, time: CityTime): CityEvent[] {
    const events: CityEvent[] = [];

    // Job matching runs every hour (600 ticks)
    if (currentTick - this.lastJobMatchTick >= 600) {
      this.lastJobMatchTick = currentTick;
      const matchEvents = this.matchJobSeekers();
      events.push(...matchEvents);
    }

    // Payroll runs once per day at midnight (hour 0)
    if (time.hour === 0 && this.lastPayrollDay !== time.day) {
      this.lastPayrollDay = time.day;
      const payrollEvents = this.processPayroll();
      events.push(...payrollEvents);
    }

    return events;
  }

  /**
   * Match unemployed residents to available jobs
   */
  private matchJobSeekers(): CityEvent[] {
    const events: CityEvent[] = [];
    const unemployed = this.db.population.getUnemployedResidents();
    if (unemployed.length === 0) return events;

    const jobSlots = this.getAvailableJobSlots();
    if (jobSlots.length === 0) return events;

    console.log(`[Employment] Matching ${unemployed.length} job seekers to ${jobSlots.length} workplaces`);

    for (const resident of unemployed) {
      const availableSlot = jobSlots.find(slot => slot.filled < slot.capacity);
      if (!availableSlot) break;

      this.db.population.assignJob(resident.id, availableSlot.buildingId, availableSlot.salary);
      availableSlot.filled++;

      events.push({
        type: 'resident_employed' as CityEventType,
        timestamp: Date.now(),
        data: {
          residentId: resident.id,
          residentName: resident.name,
          buildingId: availableSlot.buildingId,
          salary: availableSlot.salary,
        },
      });

      console.log(`[Employment] ${resident.name} hired at ${availableSlot.buildingType} for ${availableSlot.salary}/day`);
    }

    return events;
  }

  private getAvailableJobSlots(): { buildingId: string; buildingType: BuildingType; capacity: number; filled: number; salary: number }[] {
    const buildings = this.db.buildings.getAllBuildings();
    const jobSlots: { buildingId: string; buildingType: BuildingType; capacity: number; filled: number; salary: number }[] = [];

    for (const building of buildings) {
      if (building.constructionProgress < 100) continue;

      const jobConfig = BUILDING_JOBS[building.type];
      if (!jobConfig) continue;

      const employees = this.db.population.getResidentsByWork(building.id);
      const capacity = jobConfig.count * building.floors;

      if (employees.length < capacity) {
        jobSlots.push({
          buildingId: building.id,
          buildingType: building.type,
          capacity,
          filled: employees.length,
          salary: jobConfig.salary,
        });
      }
    }

    return jobSlots;
  }

  /**
   * Process daily payroll
   */
  private processPayroll(): CityEvent[] {
    const events: CityEvent[] = [];
    const employed = this.db.population.getEmployedResidents();
    if (employed.length === 0) return events;

    let totalPaid = 0;

    for (const resident of employed) {
      if (resident.salary <= 0 || !resident.workBuildingId) continue;

      const building = this.db.buildings.getBuilding(resident.workBuildingId);
      if (building) {
        // Add salary to building owner's wallet (simulating economic flow)
        this.db.agents.addToWallet(building.ownerId, resident.salary);
        totalPaid += resident.salary;
      }
    }

    if (totalPaid > 0) {
      console.log(`[Employment] Payroll processed: ${totalPaid} MOLT paid to ${employed.length} workers`);
      events.push({
        type: 'payroll_processed' as CityEventType,
        timestamp: Date.now(),
        data: { totalPaid, workerCount: employed.length },
      });
    }

    return events;
  }

  /**
   * Handle building demolition
   */
  onBuildingDemolished(buildingId: string): CityEvent[] {
    const events: CityEvent[] = [];
    const workers = this.db.population.getResidentsByWork(buildingId);

    if (workers.length > 0) {
      this.db.population.removeWorkFromBuilding(buildingId);
      console.log(`[Employment] ${workers.length} workers lost jobs from demolished building`);

      events.push({
        type: 'jobs_lost' as CityEventType,
        timestamp: Date.now(),
        data: { buildingId, count: workers.length, residentIds: workers.map(w => w.id) },
      });
    }

    return events;
  }

  getEmploymentStats(): { totalJobs: number; filledJobs: number; openJobs: number; averageSalary: number } {
    const buildings = this.db.buildings.getAllBuildings();
    let totalJobs = 0;
    let filledJobs = 0;
    let totalSalary = 0;
    let jobBuildingCount = 0;

    for (const building of buildings) {
      if (building.constructionProgress < 100) continue;

      const jobConfig = BUILDING_JOBS[building.type];
      if (!jobConfig) continue;

      const capacity = jobConfig.count * building.floors;
      const employees = this.db.population.getResidentsByWork(building.id);

      totalJobs += capacity;
      filledJobs += employees.length;
      totalSalary += jobConfig.salary;
      jobBuildingCount++;
    }

    return {
      totalJobs,
      filledJobs,
      openJobs: totalJobs - filledJobs,
      averageSalary: jobBuildingCount > 0 ? totalSalary / jobBuildingCount : 0,
    };
  }
}

// ============================================
// Taxation Simulator (SC2K-style)
// ============================================

export function calculateCreditRating(treasury: number, bonds: Bond[], buildings: Building[]): string {
  const totalDebt = bonds.reduce((sum, b) => sum + b.amount, 0);
  const cityValue = buildings.reduce((sum, b) => sum + (BUILDING_COSTS[b.type] || 500), 0) + treasury;
  const ratio = totalDebt / Math.max(cityValue, 1);
  if (ratio < 0.05) return 'AAA';
  if (ratio < 0.1) return 'AA';
  if (ratio < 0.2) return 'A';
  if (ratio < 0.35) return 'BBB';
  if (ratio < 0.5) return 'BB';
  if (ratio < 0.7) return 'B';
  return 'F';
}

export class TaxationSimulator {
  private lastProcessedDay: number = 0;

  constructor(private db: SimulationDb, private cityId: string, private log?: ActivityLogger) {}

  /**
   * Process daily taxation - SC2k style with separate R/C/I rates
   * Runs once per day at midnight
   */
  simulate(currentTick: number, time: CityTime): CityEvent[] {
    const events: CityEvent[] = [];

    if (time.hour !== 0 || time.day === this.lastProcessedDay) {
      return events;
    }
    this.lastProcessedDay = time.day;

    const city = this.db.city.getCity(this.cityId);
    if (!city) return events;

    const buildings = this.db.buildings.getAllBuildings();
    const completedBuildings = buildings.filter(b => b.constructionProgress >= 100);

    // ── 1. Per-building infrastructure fees (deducted from owners) ──
    let infraFeesCollected = 0;
    for (const building of completedBuildings) {
      if (['road', 'power_plant', 'wind_turbine', 'coal_plant', 'nuclear_plant', 'water_tower', 'garbage_depot', 'park', 'plaza', 'power_line', 'water_pipe'].includes(building.type)) {
        continue;
      }
      const owner = this.db.agents.findAgent(building.ownerId);
      if (!owner) continue;

      const powerFee = Math.ceil((building.powerRequired / 1000) * INFRASTRUCTURE_FEES.POWER_RATE);
      const waterFee = Math.ceil((building.waterRequired / 100) * INFRASTRUCTURE_FEES.WATER_RATE);
      const garbageFee = INFRASTRUCTURE_FEES.GARBAGE_FEE[building.type] || 1;
      const totalFee = powerFee + waterFee + garbageFee;

      if (owner.wallet.balance >= totalFee) {
        this.db.agents.updateWalletBalance(owner.id, owner.wallet.balance - totalFee);
        infraFeesCollected += totalFee;
      }
    }

    // ── 2. SC2k property tax revenue (population-based) ──
    // Count populations by zone type
    const residents = this.db.population.getAllResidents();
    let rPop = 0, cPop = 0, iPop = 0;

    // Build lookup for building types
    const buildingMap = new Map<string, Building>();
    for (const b of completedBuildings) buildingMap.set(b.id, b);

    for (const r of residents) {
      // Count by home building type for R population
      const home = r.homeBuildingId ? buildingMap.get(r.homeBuildingId) : null;
      if (home) {
        if (['residential', 'suburban', 'house', 'apartment'].includes(home.type)) {
          rPop++;
        }
      }
      // Count by work building type for C/I population
      const work = r.workBuildingId ? buildingMap.get(r.workBuildingId) : null;
      if (work) {
        if (['offices', 'office', 'shop'].includes(work.type)) {
          cPop++;
        } else if (['industrial', 'factory'].includes(work.type)) {
          iPop++;
        }
      }
    }

    const { taxRateR, taxRateC, taxRateI } = city.economy;
    const mult = SC2K_ECONOMY.TAX.SC2K_MULTIPLIER;

    // SC2k formula: annual revenue = Pop * Rate/100 * 1.29, divide by 365 for daily
    const dailyTaxR = (rPop * (taxRateR / 100) * mult) / 365;
    const dailyTaxC = (cPop * (taxRateC / 100) * mult) / 365;
    const dailyTaxI = (iPop * (taxRateI / 100) * mult) / 365;
    const totalPropertyTax = dailyTaxR + dailyTaxC + dailyTaxI;

    // ── 3. Ordinance revenue & costs ──
    const totalPop = rPop + cPop + iPop;
    let ordinanceRevenue = 0;
    let ordinanceCost = 0;
    for (const ordId of city.economy.ordinances) {
      const ord = SC2K_ECONOMY.ORDINANCES[ordId];
      if (!ord) continue;
      ordinanceRevenue += (totalPop * ord.revenuePerCapita) / 365;
      ordinanceCost += (totalPop * ord.costPerCapita) / 365;
    }

    // ── 4. Department expenses ──
    const funding = city.economy.departmentFunding;
    const countType = (type: string) => completedBuildings.filter(b => b.type === type).length;

    const policeExp = countType('police_station') * SC2K_ECONOMY.DEPARTMENTS.police.costPerBuilding * (funding.police / 100) / 365;
    const fireExp = countType('fire_station') * SC2K_ECONOMY.DEPARTMENTS.fire.costPerBuilding * (funding.fire / 100) / 365;
    const healthExp = countType('hospital') * SC2K_ECONOMY.DEPARTMENTS.health.costPerBuilding * (funding.health / 100) / 365;
    const eduExp = (
      countType('school') * SC2K_ECONOMY.DEPARTMENTS.education_school.costPerBuilding +
      countType('university') * SC2K_ECONOMY.DEPARTMENTS.education_university.costPerBuilding
    ) * (funding.education / 100) / 365;

    // ── 5. Transit maintenance ──
    const roads = this.db.roads.getAllRoads();
    const powerLines = this.db.powerLines.getAllPowerLines();
    const waterPipes = this.db.waterPipes.getAllWaterPipes();
    const transitExp = (
      roads.length * SC2K_ECONOMY.TRANSIT_MAINTENANCE.road +
      powerLines.length * SC2K_ECONOMY.TRANSIT_MAINTENANCE.power_line +
      waterPipes.length * SC2K_ECONOMY.TRANSIT_MAINTENANCE.water_pipe
    ) * (funding.transit / 100) / 365;

    // ── 6. Bond interest ──
    let bondInterest = 0;
    for (const bond of city.economy.bonds) {
      bondInterest += (bond.amount * (bond.rate / 100)) / 365;
    }

    // ── 7. Net cash flow ──
    const totalRevenue = totalPropertyTax + ordinanceRevenue + infraFeesCollected;
    const totalExpense = policeExp + fireExp + healthExp + eduExp + transitExp + bondInterest + ordinanceCost;
    const netCashFlow = totalRevenue - totalExpense;

    const newTreasury = city.stats.treasury + netCashFlow;
    this.db.city.updateTreasury(this.cityId, newTreasury);

    // ── 8. Update YTD budget tracking ──
    const ytd = city.economy.budgetYtd;
    ytd.revenues.propertyTaxR += dailyTaxR;
    ytd.revenues.propertyTaxC += dailyTaxC;
    ytd.revenues.propertyTaxI += dailyTaxI;
    ytd.revenues.ordinances += ordinanceRevenue;
    ytd.expenses.police += policeExp;
    ytd.expenses.fire += fireExp;
    ytd.expenses.health += healthExp;
    ytd.expenses.education += eduExp;
    ytd.expenses.transit += transitExp;
    ytd.expenses.bondInterest += bondInterest;
    this.db.city.updateBudgetYtd(this.cityId, ytd);

    // ── 9. Update credit rating ──
    const rating = calculateCreditRating(newTreasury, city.economy.bonds, completedBuildings);
    if (rating !== city.economy.creditRating) {
      this.db.city.updateCreditRating(this.cityId, rating);
    }

    // ── 10. Reset YTD on new year (day 1) ──
    if (time.day === 1) {
      this.db.city.resetBudgetYtd(this.cityId);
    }

    if (Math.abs(netCashFlow) > 0.01) {
      console.log(`[Taxation] Day ${time.day}: Revenue $${totalRevenue.toFixed(2)} - Expenses $${totalExpense.toFixed(2)} = Net $${netCashFlow.toFixed(2)} (Treasury: $${newTreasury.toFixed(2)})`);
      this.log?.('tax_collected', `Daily budget: +$${totalRevenue.toFixed(0)} -$${totalExpense.toFixed(0)} = $${netCashFlow.toFixed(0)}`, {
        revenue: totalRevenue, expense: totalExpense, net: netCashFlow, day: time.day,
        rPop, cPop, iPop, taxRateR, taxRateC, taxRateI,
      });
    }

    return events;
  }
}

// ============================================
// Per-City Simulator Bundle
// ============================================

/**
 * Groups all simulators for a single city, operating on a city-scoped DB adapter.
 */
class CitySimulatorBundle {
  public powerGrid: PowerGridSimulator;
  public waterGrid: WaterGridSimulator;
  public wasteGrid: WasteGridSimulator;
  public agentSimulator: AgentSimulator;
  public vehicleSimulator: VehicleSimulator;
  public rentEnforcementSimulator: RentEnforcementSimulator;
  public populationSimulator: PopulationSimulator;
  public employmentSimulator: EmploymentSimulator;
  public taxationSimulator: TaxationSimulator;
  public landValueSimulator: LandValueSimulator;
  public zoneEvolutionSimulator: ZoneEvolutionSimulator;
  public demandCalculator: DemandCalculator;
  public crimeSimulator: CrimeSimulator;
  public fireSimulator: FireSimulator;
  public zoneBuildSimulator: ZoneBuildSimulator;
  public taxPenaltySimulator: TaxPenaltySimulator;

  constructor(db: CityScopedDatabaseAdapter, logger?: ActivityLogger) {
    this.powerGrid = new PowerGridSimulator(db);
    this.waterGrid = new WaterGridSimulator(db);
    this.wasteGrid = new WasteGridSimulator(db);
    this.agentSimulator = new AgentSimulator(db);
    this.vehicleSimulator = new VehicleSimulator(db);
    this.rentEnforcementSimulator = new RentEnforcementSimulator(db, logger);
    this.populationSimulator = new PopulationSimulator(db);
    this.employmentSimulator = new EmploymentSimulator(db);
    this.taxationSimulator = new TaxationSimulator(db, db.cityId, logger);
    this.landValueSimulator = new LandValueSimulator(db);
    this.zoneEvolutionSimulator = new ZoneEvolutionSimulator(db, logger);
    this.demandCalculator = new DemandCalculator(db);
    this.crimeSimulator = new CrimeSimulator(db, logger);
    this.fireSimulator = new FireSimulator(db, logger);
    this.zoneBuildSimulator = new ZoneBuildSimulator(db, logger);
    this.taxPenaltySimulator = new TaxPenaltySimulator(db, db.cityId, logger);
  }
}

// ============================================
// Main Simulation Engine
// ============================================

export class SimulationEngine extends EventEmitter {
  private db: LegacyDatabaseManagerAdapter;
  private running: boolean = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private currentTick: number = 0;
  private activityLogger?: ActivityLogger;

  // Per-city simulator bundles, keyed by cityId
  private cityBundles = new Map<string, CitySimulatorBundle>();

  constructor(db: LegacyDatabaseManagerAdapter) {
    super();
    this.db = db;
  }

  /**
   * Set activity logger callback for simulation events
   */
  setActivityLogger(logger: ActivityLogger): void {
    this.activityLogger = logger;
    // Clear existing bundles so they get recreated with the logger
    this.cityBundles.clear();
  }

  getCurrentTick(): number {
    return this.currentTick;
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get or create a simulator bundle for a city
   */
  private getBundle(cityId: string): CitySimulatorBundle {
    let bundle = this.cityBundles.get(cityId);
    if (!bundle) {
      const scopedDb = this.db.forCity(cityId);
      bundle = new CitySimulatorBundle(scopedDb, this.activityLogger);
      this.cityBundles.set(cityId, bundle);
    }
    return bundle;
  }

  /**
   * Set the engine's internal tick to match a given hour/day/year.
   * Used by the debug endpoint to sync time after admin changes.
   */
  setTime(hour: number, day: number, year: number): void {
    // Reverse the deriveTime() formula:
    // hour = (8 + Math.floor(totalMinutes / 60)) % 24
    // day = 1 + Math.floor(totalHours / 24)
    // year = 1 + Math.floor(absoluteDay / 365)
    const absoluteDay = (year - 1) * 365 + (day - 1);
    const totalHours = absoluteDay * HOURS_PER_DAY + (hour >= 8 ? hour - 8 : hour + 16);
    const totalMinutes = totalHours * MINUTES_PER_HOUR;
    this.currentTick = totalMinutes * TICKS_PER_MINUTE;
    console.log(`[SimulationEngine] Time set to hour=${hour} day=${day} year=${year} (tick=${this.currentTick})`);
  }

  /**
   * Start the simulation loop
   */
  start(): void {
    if (this.running) return;

    // Initialize tick from DB so time persists across restarts
    const cities = this.db.city.getAllCities();
    if (cities.length > 0) {
      const maxTick = Math.max(...cities.map(c => c.time.tick));
      if (maxTick > 0) {
        this.currentTick = maxTick;
        console.log(`[SimulationEngine] Resumed from tick ${maxTick}`);
      }
    }

    this.running = true;
    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    this.emit('started');
    console.log('[SimulationEngine] Started');
  }

  /**
   * Stop the simulation loop
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.emit('stopped');
    console.log('[SimulationEngine] Stopped');
  }

  /**
   * Execute one simulation tick — iterates all cities
   */
  private tick(): void {
    this.currentTick++;

    // Calculate shared time from ticks
    const time = this.deriveTime();

    // Get all cities and simulate each one
    const cities = this.db.city.getAllCities();

    for (const city of cities) {
      const events = this.tickCity(city, time);

      // Update time for this city
      this.db.city.updateTime(city.id, time.tick, time.hour, time.day, time.year);

      // Emit per-city tick event
      this.emit('tick', {
        tick: this.currentTick,
        time,
        events,
        cityId: city.id,
      });
    }

    // Check for day/night transitions (global, emitted once)
    if (time.hour === 6 && this.currentTick % (TICKS_PER_MINUTE * MINUTES_PER_HOUR) === 0) {
      this.emit('day_started', time);
    }
    if (time.hour === 20 && this.currentTick % (TICKS_PER_MINUTE * MINUTES_PER_HOUR) === 0) {
      this.emit('night_started', time);
    }
  }

  /**
   * Run all simulators for a single city
   */
  private tickCity(city: City, time: CityTime): CityEvent[] {
    const events: CityEvent[] = [];
    const bundle = this.getBundle(city.id);

    // Simulate power grid (every 10 ticks / 1 minute)
    if (this.currentTick % 10 === 0) {
      const powerStatus = bundle.powerGrid.simulate();
      bundle.powerGrid.applyPowerStatus(powerStatus);

      const waterStatus = bundle.waterGrid.simulate();
      bundle.waterGrid.applyWaterStatus(waterStatus);

      const wasteStatus = bundle.wasteGrid.simulate();
      bundle.wasteGrid.applyWasteStatus(wasteStatus);
    }

    // Accumulate garbage once per in-game day (at hour 0, first tick of the hour)
    if (time.hour === 0 && this.currentTick % TICKS_PER_HOUR < 10) {
      bundle.wasteGrid.accumulateGarbage();
      events.push({ type: 'buildings_updated', timestamp: Date.now(), data: { action: 'garbage_accumulated' } });
    }

    // Simulate employment (job matching and payroll)
    const employmentEvents = bundle.employmentSimulator.simulate(this.currentTick, time);
    events.push(...employmentEvents);

    // Simulate rent enforcement (runs daily at midnight)
    bundle.rentEnforcementSimulator.simulate(this.currentTick, time);

    // Simulate taxation (infrastructure fees, runs daily at midnight)
    const taxEvents = bundle.taxationSimulator.simulate(this.currentTick, time);
    events.push(...taxEvents);

    // Simulate land value recalculation (runs daily at hour 1)
    bundle.landValueSimulator.simulate(time);

    // Simulate zone auto-building (every 100 ticks)
    const newBuildings = bundle.zoneBuildSimulator.simulate(this.currentTick, time);
    if (newBuildings.length > 0) {
      events.push({ type: 'buildings_updated', timestamp: Date.now(), data: { count: newBuildings.length } });
      // Spawn residents for newly built residential buildings
      for (const building of newBuildings) {
        const popEvents = bundle.populationSimulator.onBuildingCompleted(building);
        events.push(...popEvents);
      }
    }

    // Simulate zone evolution (runs daily at hour 2)
    bundle.zoneEvolutionSimulator.simulate(time);

    // Simulate tax penalties (runs daily at hour 3)
    const penaltyEvents = bundle.taxPenaltySimulator.simulate(this.currentTick, time);
    events.push(...penaltyEvents);

    // Simulate crime (every 300 ticks / hourly)
    if (this.currentTick % 300 === 0) {
      bundle.crimeSimulator.simulate(time, this.currentTick);
    }

    // Simulate fire (every 10 ticks)
    if (this.currentTick % 10 === 0) {
      bundle.fireSimulator.simulate(time, this.currentTick);
    }

    // Simulate agents
    const agentEvents = bundle.agentSimulator.simulate(time);
    events.push(...agentEvents);

    // Simulate vehicles
    const vehicleEvents = bundle.vehicleSimulator.simulate();
    events.push(...vehicleEvents);

    return events;
  }

  /**
   * Derive time from current tick (shared across all cities)
   */
  private deriveTime(): CityTime {
    const totalMinutes = Math.floor(this.currentTick / TICKS_PER_MINUTE);
    const hour = (8 + Math.floor(totalMinutes / MINUTES_PER_HOUR)) % HOURS_PER_DAY; // Start at 8am
    const totalHours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
    let day = 1 + Math.floor(totalHours / HOURS_PER_DAY);
    const year = 1 + Math.floor(day / 365);
    day = ((day - 1) % 365) + 1;
    const isDaylight = hour >= 6 && hour < 20;

    return { tick: this.currentTick, hour, day, year, isDaylight };
  }

  /**
   * Get current simulation state for a specific city (or first city)
   */
  getState(cityId?: string) {
    const city = this.db.city.getCity(cityId);
    if (!city) {
      return {
        running: this.running,
        tick: this.currentTick,
        city: null,
        agentCount: 0,
        vehicleCount: 0,
        buildingCount: 0,
        population: { total: 0, employed: 0, unemployed: 0, employmentRate: 0 },
        employment: { totalJobs: 0, filledJobs: 0, openJobs: 0, averageSalary: 0 },
        demand: { residential: 0, office: 0, industrial: 0, counts: { residential: 0, office: 0, industrial: 0, total: 0 } },
      };
    }

    const bundle = this.getBundle(city.id);
    const scopedDb = this.db.forCity(city.id);
    const agents = scopedDb.agents.getAllAgents();
    const vehicles = scopedDb.vehicles.getAllVehicles();
    const buildings = scopedDb.buildings.getAllBuildings();
    const populationStats = bundle.populationSimulator.getPopulationStats();
    const employmentStats = bundle.employmentSimulator.getEmploymentStats();
    const demandStats = bundle.demandCalculator.calculate();

    return {
      running: this.running,
      tick: this.currentTick,
      city,
      agentCount: agents.length,
      vehicleCount: vehicles.length,
      buildingCount: buildings.length,
      population: populationStats,
      employment: employmentStats,
      demand: demandStats,
    };
  }

  /**
   * Get population statistics for a specific city
   */
  getPopulationStats(cityId?: string) {
    if (!cityId) {
      const city = this.db.city.getCity();
      cityId = city?.id;
    }
    if (!cityId) return { total: 0, employed: 0, unemployed: 0, employmentRate: 0 };
    return this.getBundle(cityId).populationSimulator.getPopulationStats();
  }

  /**
   * Get employment statistics for a specific city
   */
  getEmploymentStats(cityId?: string) {
    if (!cityId) {
      const city = this.db.city.getCity();
      cityId = city?.id;
    }
    if (!cityId) return { totalJobs: 0, filledJobs: 0, openJobs: 0, averageSalary: 0 };
    return this.getBundle(cityId).employmentSimulator.getEmploymentStats();
  }

  /**
   * Get water system statistics for a specific city
   */
  getWaterStats(cityId?: string) {
    if (!cityId) {
      const city = this.db.city.getCity();
      cityId = city?.id;
    }
    if (!cityId) return { capacity: 0, demand: 0, suppliedTiles: 0, connectedBuildings: 0 };
    return this.getBundle(cityId).waterGrid.getStats();
  }

  /**
   * Get waste system statistics for a specific city
   */
  getWasteStats(cityId?: string) {
    if (!cityId) {
      const city = this.db.city.getCity();
      cityId = city?.id;
    }
    if (!cityId) return { capacity: 0, demand: 0, connectedBuildings: 0 };
    return this.getBundle(cityId).wasteGrid.getStats();
  }

  /**
   * Calculate traffic multiplier based on time of day
   */
  getTrafficMultiplier(time: CityTime): number {
    const hour = time.hour;

    // Rush hours: morning (7-9) and evening (17-19)
    if ((hour >= TRAFFIC.RUSH_HOURS.morning.start && hour < TRAFFIC.RUSH_HOURS.morning.end) ||
        (hour >= TRAFFIC.RUSH_HOURS.evening.start && hour < TRAFFIC.RUSH_HOURS.evening.end)) {
      return TRAFFIC.RUSH_HOUR_MULTIPLIER;
    }

    // Night hours (22-5)
    if (hour >= TRAFFIC.NIGHT_HOURS.start || hour < TRAFFIC.NIGHT_HOURS.end) {
      return TRAFFIC.NIGHT_MULTIPLIER;
    }

    return 1;
  }

  /**
   * Calculate target vehicle count based on population and time
   */
  getTargetVehicleCount(time: CityTime, cityId?: string): number {
    const stats = this.getPopulationStats(cityId);
    const baseCount = Math.floor(stats.total * TRAFFIC.VEHICLE_MULTIPLIER);
    const multiplier = this.getTrafficMultiplier(time);
    return Math.max(1, Math.floor(baseCount * multiplier));
  }

  /**
   * Notify engine that roads have changed for a specific city
   */
  onRoadsChanged(cityId?: string): void {
    if (cityId) {
      const bundle = this.cityBundles.get(cityId);
      if (bundle) {
        bundle.agentSimulator.updateRoads();
        bundle.vehicleSimulator.updateRoads();
      }
    } else {
      // Update all cities
      for (const bundle of this.cityBundles.values()) {
        bundle.agentSimulator.updateRoads();
        bundle.vehicleSimulator.updateRoads();
      }
    }
  }
}
