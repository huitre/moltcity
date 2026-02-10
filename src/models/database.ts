// ============================================
// MOLTCITY - Database Setup & Queries
// ============================================

import Database from 'better-sqlite3';
import path from 'path';
import type { Parcel, Building, Road, Agent, Vehicle, City, TerrainType, ZoningType, BuildingType, AgentState, RoadDirection, VehicleType, RentalUnit, RentWarning, CourtCase, JailInmate, RentalUnitType, RentalUnitStatus, RentWarningStatus, CourtCaseStatus, CourtVerdict, CourtSentence, JailStatus } from './types.js';

const DEFAULT_DB_PATH = path.join(process.cwd(), 'moltcity.db');

export function createDatabase(): Database.Database {
  const dbPath = process.env.DB_PATH || DEFAULT_DB_PATH;
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    -- City metadata
    CREATE TABLE IF NOT EXISTS city (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      grid_width INTEGER NOT NULL DEFAULT 100,
      grid_height INTEGER NOT NULL DEFAULT 100,
      tick INTEGER NOT NULL DEFAULT 0,
      hour INTEGER NOT NULL DEFAULT 8,
      day INTEGER NOT NULL DEFAULT 1,
      year INTEGER NOT NULL DEFAULT 1,
      mayor_id TEXT,
      treasury REAL NOT NULL DEFAULT 0
    );

    -- Land parcels
    CREATE TABLE IF NOT EXISTS parcels (
      id TEXT PRIMARY KEY,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      terrain TEXT NOT NULL DEFAULT 'land',
      zoning TEXT,
      owner_id TEXT,
      purchase_price REAL,
      purchase_date INTEGER,
      UNIQUE(x, y)
    );
    CREATE INDEX IF NOT EXISTS idx_parcels_coords ON parcels(x, y);
    CREATE INDEX IF NOT EXISTS idx_parcels_owner ON parcels(owner_id);

    -- Buildings
    CREATE TABLE IF NOT EXISTS buildings (
      id TEXT PRIMARY KEY,
      parcel_id TEXT NOT NULL REFERENCES parcels(id),
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      sprite TEXT,
      width INTEGER NOT NULL DEFAULT 1,
      height INTEGER NOT NULL DEFAULT 1,
      floors INTEGER NOT NULL DEFAULT 1,
      power_required INTEGER NOT NULL DEFAULT 0,
      water_required INTEGER NOT NULL DEFAULT 0,
      powered INTEGER NOT NULL DEFAULT 0,
      has_water INTEGER NOT NULL DEFAULT 0,
      operational INTEGER NOT NULL DEFAULT 0,
      built_at INTEGER NOT NULL,
      owner_id TEXT NOT NULL,
      construction_progress INTEGER NOT NULL DEFAULT 100,
      construction_started_at INTEGER,
      construction_time_ticks INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_buildings_parcel ON buildings(parcel_id);
    CREATE INDEX IF NOT EXISTS idx_buildings_owner ON buildings(owner_id);

    -- Roads
    CREATE TABLE IF NOT EXISTS roads (
      id TEXT PRIMARY KEY,
      parcel_id TEXT NOT NULL REFERENCES parcels(id),
      direction TEXT NOT NULL,
      lanes INTEGER NOT NULL DEFAULT 2,
      traffic_load REAL NOT NULL DEFAULT 0,
      speed_limit INTEGER NOT NULL DEFAULT 50
    );
    CREATE INDEX IF NOT EXISTS idx_roads_parcel ON roads(parcel_id);

    -- Power plants
    CREATE TABLE IF NOT EXISTS power_plants (
      id TEXT PRIMARY KEY,
      building_id TEXT NOT NULL REFERENCES buildings(id),
      capacity INTEGER NOT NULL,
      current_output INTEGER NOT NULL DEFAULT 0,
      fuel_type TEXT NOT NULL
    );

    -- Power lines
    CREATE TABLE IF NOT EXISTS power_lines (
      id TEXT PRIMARY KEY,
      from_x INTEGER NOT NULL,
      from_y INTEGER NOT NULL,
      to_x INTEGER NOT NULL,
      to_y INTEGER NOT NULL,
      capacity INTEGER NOT NULL,
      load INTEGER NOT NULL DEFAULT 0
    );

    -- Agents (citizens)
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT,
      home_building_id TEXT REFERENCES buildings(id),
      work_building_id TEXT REFERENCES buildings(id),
      current_x REAL NOT NULL,
      current_y REAL NOT NULL,
      destination_x REAL,
      destination_y REAL,
      path TEXT, -- JSON array of coordinates
      state TEXT NOT NULL DEFAULT 'idle',
      schedule TEXT, -- JSON object
      wallet_balance REAL NOT NULL DEFAULT 0,
      wallet_currency TEXT NOT NULL DEFAULT 'MOLT',
      moltbook_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agents_location ON agents(current_x, current_y);

    -- Vehicles
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES agents(id),
      type TEXT NOT NULL,
      position_x REAL NOT NULL,
      position_y REAL NOT NULL,
      destination_x REAL,
      destination_y REAL,
      path TEXT, -- JSON array of coordinates
      speed REAL NOT NULL DEFAULT 1,
      sprite TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vehicles_position ON vehicles(position_x, position_y);

    -- City events log
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      data TEXT -- JSON
    );
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

    -- Rental units
    CREATE TABLE IF NOT EXISTS rental_units (
      id TEXT PRIMARY KEY,
      building_id TEXT NOT NULL REFERENCES buildings(id),
      floor_number INTEGER NOT NULL,
      unit_number INTEGER NOT NULL,
      unit_type TEXT NOT NULL DEFAULT 'residential',
      monthly_rent REAL NOT NULL,
      tenant_id TEXT REFERENCES agents(id),
      lease_start INTEGER,
      status TEXT NOT NULL DEFAULT 'vacant',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rental_units_building ON rental_units(building_id);
    CREATE INDEX IF NOT EXISTS idx_rental_units_tenant ON rental_units(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_rental_units_status ON rental_units(status);

    -- Rent warnings
    CREATE TABLE IF NOT EXISTS rent_warnings (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL REFERENCES rental_units(id),
      tenant_id TEXT NOT NULL REFERENCES agents(id),
      amount_owed REAL NOT NULL,
      warning_date INTEGER NOT NULL,
      due_date INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rent_warnings_tenant ON rent_warnings(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_rent_warnings_status ON rent_warnings(status);

    -- Court cases
    CREATE TABLE IF NOT EXISTS court_cases (
      id TEXT PRIMARY KEY,
      warning_id TEXT REFERENCES rent_warnings(id),
      defendant_id TEXT NOT NULL REFERENCES agents(id),
      plaintiff_id TEXT NOT NULL,
      case_type TEXT NOT NULL,
      amount REAL NOT NULL,
      hearing_date INTEGER,
      verdict TEXT,
      sentence TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_court_cases_defendant ON court_cases(defendant_id);
    CREATE INDEX IF NOT EXISTS idx_court_cases_status ON court_cases(status);

    -- Jail inmates
    CREATE TABLE IF NOT EXISTS jail_inmates (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      case_id TEXT REFERENCES court_cases(id),
      check_in INTEGER NOT NULL,
      release_date INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'incarcerated'
    );
    CREATE INDEX IF NOT EXISTS idx_jail_inmates_agent ON jail_inmates(agent_id);
    CREATE INDEX IF NOT EXISTS idx_jail_inmates_status ON jail_inmates(status);
  `);

  return db;
}

// ============================================
// Repository Classes
// ============================================

export class CityRepository {
  constructor(private db: Database.Database) {}

  getCity(): City | null {
    const row = this.db.prepare('SELECT * FROM city LIMIT 1').get() as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      gridWidth: row.grid_width,
      gridHeight: row.grid_height,
      time: {
        tick: row.tick,
        hour: row.hour,
        day: row.day,
        year: row.year,
        isDaylight: row.hour >= 6 && row.hour < 20,
      },
      stats: {
        population: 0, // Calculated separately
        totalBuildings: 0,
        totalRoads: 0,
        powerCapacity: 0,
        powerDemand: 0,
        waterCapacity: 0,
        waterDemand: 0,
        treasury: row.treasury,
      },
      mayor: row.mayor_id,
    };
  }

  initializeCity(name: string, width: number, height: number): City {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO city (id, name, grid_width, grid_height)
      VALUES (?, ?, ?, ?)
    `).run(id, name, width, height);

    return this.getCity()!;
  }

  updateTime(tick: number, hour: number, day: number, year: number): void {
    this.db.prepare(`
      UPDATE city SET tick = ?, hour = ?, day = ?, year = ?
    `).run(tick, hour, day, year);
  }

  updateTreasury(amount: number): void {
    this.db.prepare(`
      UPDATE city SET treasury = ?
    `).run(amount);
  }
}

export class ParcelRepository {
  constructor(private db: Database.Database) {}

  getParcel(x: number, y: number): Parcel | null {
    const row = this.db.prepare('SELECT * FROM parcels WHERE x = ? AND y = ?').get(x, y) as any;
    if (!row) return null;

    return {
      id: row.id,
      x: row.x,
      y: row.y,
      terrain: row.terrain as TerrainType,
      zoning: row.zoning as ZoningType | null,
      ownerId: row.owner_id,
      purchasePrice: row.purchase_price,
      purchaseDate: row.purchase_date,
    };
  }

  getParcelById(id: string): Parcel | null {
    const row = this.db.prepare('SELECT * FROM parcels WHERE id = ?').get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      x: row.x,
      y: row.y,
      terrain: row.terrain as TerrainType,
      zoning: row.zoning as ZoningType | null,
      ownerId: row.owner_id,
      purchasePrice: row.purchase_price,
      purchaseDate: row.purchase_date,
    };
  }

  getAllParcels(): Parcel[] {
    const rows = this.db.prepare('SELECT * FROM parcels').all() as any[];
    return rows.map(row => ({
      id: row.id,
      x: row.x,
      y: row.y,
      terrain: row.terrain as TerrainType,
      zoning: row.zoning as ZoningType | null,
      ownerId: row.owner_id,
      purchasePrice: row.purchase_price,
      purchaseDate: row.purchase_date,
    }));
  }

  getParcelsInRange(minX: number, minY: number, maxX: number, maxY: number): Parcel[] {
    const rows = this.db.prepare(`
      SELECT * FROM parcels
      WHERE x >= ? AND x <= ? AND y >= ? AND y <= ?
    `).all(minX, maxX, minY, maxY) as any[];

    return rows.map(row => ({
      id: row.id,
      x: row.x,
      y: row.y,
      terrain: row.terrain as TerrainType,
      zoning: row.zoning as ZoningType | null,
      ownerId: row.owner_id,
      purchasePrice: row.purchase_price,
      purchaseDate: row.purchase_date,
    }));
  }

  createParcel(x: number, y: number, terrain: TerrainType = 'land'): Parcel {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO parcels (id, x, y, terrain)
      VALUES (?, ?, ?, ?)
    `).run(id, x, y, terrain);

    return { id, x, y, terrain, zoning: null, ownerId: null, purchasePrice: null, purchaseDate: null };
  }

  purchaseParcel(parcelId: string, ownerId: string, price: number): void {
    this.db.prepare(`
      UPDATE parcels
      SET owner_id = ?, purchase_price = ?, purchase_date = ?
      WHERE id = ?
    `).run(ownerId, price, Date.now(), parcelId);
  }

  setZoning(parcelId: string, zoning: ZoningType): void {
    this.db.prepare('UPDATE parcels SET zoning = ? WHERE id = ?').run(zoning, parcelId);
  }

  transferParcel(parcelId: string, newOwnerId: string, price: number): void {
    this.db.prepare(`
      UPDATE parcels
      SET owner_id = ?, purchase_price = ?, purchase_date = ?
      WHERE id = ?
    `).run(newOwnerId, price, Date.now(), parcelId);
  }

  releaseParcel(parcelId: string): void {
    this.db.prepare(`
      UPDATE parcels
      SET owner_id = NULL, purchase_price = NULL, purchase_date = NULL
      WHERE id = ?
    `).run(parcelId);
  }

  initializeGrid(width: number, height: number): void {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO parcels (id, x, y, terrain)
      VALUES (?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const id = `parcel_${x}_${y}`;
          insert.run(id, x, y, 'land');
        }
      }
    });

    transaction();
  }
}

export class BuildingRepository {
  constructor(private db: Database.Database) {}

  getBuilding(id: string): Building | null {
    const row = this.db.prepare('SELECT * FROM buildings WHERE id = ?').get(id) as any;
    if (!row) return null;

    return this.rowToBuilding(row);
  }

  getBuildingAtParcel(parcelId: string): Building | null {
    const row = this.db.prepare('SELECT * FROM buildings WHERE parcel_id = ?').get(parcelId) as any;
    if (!row) return null;

    return this.rowToBuilding(row);
  }

  getAllBuildings(): Building[] {
    const rows = this.db.prepare('SELECT * FROM buildings').all() as any[];
    return rows.map(row => this.rowToBuilding(row));
  }

  createBuilding(parcelId: string, type: BuildingType, name: string, ownerId: string, sprite?: string, floors: number = 1, currentTick: number = 0): Building {
    const id = crypto.randomUUID();
    // Power/water requirements scale with number of floors
    const basePower = this.getPowerRequirement(type);
    const baseWater = this.getWaterRequirement(type);
    const powerRequired = basePower * floors;
    const waterRequired = baseWater * floors;

    // Calculate construction time: 24 real seconds per floor
    // 10 ticks per second, so 24 seconds = 240 ticks per floor
    const TICKS_PER_FLOOR = 240;
    const constructionTimeTicks = type === 'road' ? 0 : floors * TICKS_PER_FLOOR;
    const constructionProgress = type === 'road' ? 100 : 0;
    const constructionStartedAt = type === 'road' ? null : currentTick;

    this.db.prepare(`
      INSERT INTO buildings (id, parcel_id, type, name, sprite, floors, power_required, water_required, built_at, owner_id, construction_progress, construction_started_at, construction_time_ticks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, parcelId, type, name, sprite || '', floors, powerRequired, waterRequired, Date.now(), ownerId, constructionProgress, constructionStartedAt, constructionTimeTicks);

    return this.getBuilding(id)!;
  }

  updatePowerStatus(buildingId: string, powered: boolean): void {
    this.db.prepare('UPDATE buildings SET powered = ?, operational = powered AND has_water WHERE id = ?')
      .run(powered ? 1 : 0, buildingId);
  }

  updateBuilding(buildingId: string, updates: { name?: string; sprite?: string; type?: BuildingType; ownerId?: string }): void {
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.sprite !== undefined) {
      setClauses.push('sprite = ?');
      values.push(updates.sprite);
    }
    if (updates.type !== undefined) {
      setClauses.push('type = ?');
      values.push(updates.type);
      // Also update power/water requirements when type changes
      setClauses.push('power_required = ?');
      values.push(this.getPowerRequirement(updates.type));
      setClauses.push('water_required = ?');
      values.push(this.getWaterRequirement(updates.type));
    }
    if (updates.ownerId !== undefined) {
      setClauses.push('owner_id = ?');
      values.push(updates.ownerId);
    }

    if (setClauses.length === 0) return;

    values.push(buildingId);
    this.db.prepare(`UPDATE buildings SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
  }

  deleteBuilding(buildingId: string): void {
    this.db.prepare('DELETE FROM buildings WHERE id = ?').run(buildingId);
  }

  updateConstructionProgress(buildingId: string, progress: number): void {
    this.db.prepare('UPDATE buildings SET construction_progress = ? WHERE id = ?').run(progress, buildingId);
  }

  getBuildingsUnderConstruction(): Building[] {
    const rows = this.db.prepare('SELECT * FROM buildings WHERE construction_progress < 100').all() as any[];
    return rows.map(row => this.rowToBuilding(row));
  }

  private rowToBuilding(row: any): Building {
    return {
      id: row.id,
      parcelId: row.parcel_id,
      type: row.type as BuildingType,
      name: row.name,
      sprite: row.sprite,
      width: row.width,
      height: row.height,
      floors: row.floors || 1,
      powerRequired: row.power_required,
      waterRequired: row.water_required,
      powered: row.powered === 1,
      hasWater: row.has_water === 1,
      operational: row.operational === 1,
      builtAt: row.built_at,
      ownerId: row.owner_id,
      constructionProgress: row.construction_progress ?? 100,
      constructionStartedAt: row.construction_started_at,
      constructionTimeTicks: row.construction_time_ticks ?? 0,
    };
  }

  private getPowerRequirement(type: BuildingType): number {
    const requirements: Record<BuildingType, number> = {
      house: 100,
      apartment: 500,
      shop: 300,
      office: 800,
      factory: 2000,
      power_plant: 0, // Generates power
      water_tower: 50,
      road: 10,
      park: 20,
      plaza: 100,
      city_hall: 1000,
      police_station: 800,
      courthouse: 1200,
      jail: 1500,
    };
    return requirements[type] || 100;
  }

  private getWaterRequirement(type: BuildingType): number {
    const requirements: Record<BuildingType, number> = {
      house: 50,
      apartment: 200,
      shop: 30,
      office: 100,
      factory: 500,
      power_plant: 1000,
      water_tower: 0,
      road: 0,
      park: 100,
      plaza: 50,
      city_hall: 200,
      police_station: 100,
      courthouse: 150,
      jail: 300,
    };
    return requirements[type] || 50;
  }
}

export class RoadRepository {
  constructor(private db: Database.Database) {}

  getRoad(parcelId: string): Road | null {
    const row = this.db.prepare('SELECT * FROM roads WHERE parcel_id = ?').get(parcelId) as any;
    if (!row) return null;

    return {
      id: row.id,
      parcelId: row.parcel_id,
      direction: row.direction as RoadDirection,
      lanes: row.lanes,
      trafficLoad: row.traffic_load,
      speedLimit: row.speed_limit,
    };
  }

  getAllRoads(): Road[] {
    const rows = this.db.prepare('SELECT * FROM roads').all() as any[];
    return rows.map(row => ({
      id: row.id,
      parcelId: row.parcel_id,
      direction: row.direction as RoadDirection,
      lanes: row.lanes,
      trafficLoad: row.traffic_load,
      speedLimit: row.speed_limit,
    }));
  }

  createRoad(parcelId: string, direction: RoadDirection, lanes: number = 2): Road {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO roads (id, parcel_id, direction, lanes)
      VALUES (?, ?, ?, ?)
    `).run(id, parcelId, direction, lanes);

    return this.getRoad(parcelId)!;
  }

  updateTrafficLoad(roadId: string, load: number): void {
    this.db.prepare('UPDATE roads SET traffic_load = ? WHERE id = ?').run(load, roadId);
  }
}

export class AgentRepository {
  constructor(private db: Database.Database) {}

  getAgent(id: string): Agent | null {
    const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as any;
    if (!row) return null;

    return this.rowToAgent(row);
  }

  getAllAgents(): Agent[] {
    const rows = this.db.prepare('SELECT * FROM agents').all() as any[];
    return rows.map(row => this.rowToAgent(row));
  }

  getAgentsInRange(minX: number, minY: number, maxX: number, maxY: number): Agent[] {
    const rows = this.db.prepare(`
      SELECT * FROM agents
      WHERE current_x >= ? AND current_x <= ? AND current_y >= ? AND current_y <= ?
    `).all(minX, maxX, minY, maxY) as any[];

    return rows.map(row => this.rowToAgent(row));
  }

  createAgent(name: string, startX: number, startY: number, moltbookId?: string): Agent {
    const id = crypto.randomUUID();
    const defaultSchedule = { wakeUp: 7, workStart: 9, workEnd: 17, sleepTime: 22 };

    this.db.prepare(`
      INSERT INTO agents (id, name, current_x, current_y, schedule, moltbook_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, startX, startY, JSON.stringify(defaultSchedule), moltbookId || null, Date.now());

    return this.getAgent(id)!;
  }

  updatePosition(agentId: string, x: number, y: number): void {
    this.db.prepare('UPDATE agents SET current_x = ?, current_y = ? WHERE id = ?').run(x, y, agentId);
  }

  updateState(agentId: string, state: AgentState): void {
    this.db.prepare('UPDATE agents SET state = ? WHERE id = ?').run(state, agentId);
  }

  setDestination(agentId: string, x: number, y: number, path: { x: number; y: number }[]): void {
    this.db.prepare(`
      UPDATE agents SET destination_x = ?, destination_y = ?, path = ? WHERE id = ?
    `).run(x, y, JSON.stringify(path), agentId);
  }

  setHome(agentId: string, buildingId: string): void {
    this.db.prepare('UPDATE agents SET home_building_id = ? WHERE id = ?').run(buildingId, agentId);
  }

  setWork(agentId: string, buildingId: string): void {
    this.db.prepare('UPDATE agents SET work_building_id = ? WHERE id = ?').run(buildingId, agentId);
  }

  getAgentByMoltbookId(moltbookId: string): Agent | null {
    const row = this.db.prepare('SELECT * FROM agents WHERE moltbook_id = ?').get(moltbookId) as any;
    if (!row) return null;
    return this.rowToAgent(row);
  }

  /**
   * Find an agent by ID, moltbookId, or wallet address.
   * Returns the agent if found, null otherwise.
   */
  findAgent(identifier: string): Agent | null {
    // Try direct ID first
    let agent = this.getAgent(identifier);
    if (agent) return agent;

    // Try moltbookId
    agent = this.getAgentByMoltbookId(identifier);
    if (agent) return agent;

    return null;
  }

  updateWalletBalance(agentId: string, newBalance: number): void {
    this.db.prepare('UPDATE agents SET wallet_balance = ? WHERE id = ?').run(newBalance, agentId);
  }

  addToWallet(agentId: string, amount: number): void {
    this.db.prepare('UPDATE agents SET wallet_balance = wallet_balance + ? WHERE id = ?').run(amount, agentId);
  }

  deductFromWallet(agentId: string, amount: number): boolean {
    const agent = this.getAgent(agentId);
    if (!agent || agent.wallet.balance < amount) return false;
    this.db.prepare('UPDATE agents SET wallet_balance = wallet_balance - ? WHERE id = ?').run(amount, agentId);
    return true;
  }

  private rowToAgent(row: any): Agent {
    return {
      id: row.id,
      name: row.name,
      avatar: row.avatar || '',
      home: row.home_building_id,
      work: row.work_building_id,
      currentLocation: { x: row.current_x, y: row.current_y },
      destination: row.destination_x != null ? { x: row.destination_x, y: row.destination_y } : null,
      path: row.path ? JSON.parse(row.path) : [],
      state: row.state as AgentState,
      schedule: row.schedule ? JSON.parse(row.schedule) : { wakeUp: 7, workStart: 9, workEnd: 17, sleepTime: 22 },
      wallet: {
        balance: row.wallet_balance,
        currency: row.wallet_currency as 'MOLT' | 'USD',
      },
      moltbookId: row.moltbook_id,
      createdAt: row.created_at,
    };
  }
}

export class VehicleRepository {
  constructor(private db: Database.Database) {}

  getVehicle(id: string): Vehicle | null {
    const row = this.db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id) as any;
    if (!row) return null;

    return this.rowToVehicle(row);
  }

  getVehiclesByOwner(ownerId: string): Vehicle[] {
    const rows = this.db.prepare('SELECT * FROM vehicles WHERE owner_id = ?').all(ownerId) as any[];
    return rows.map(row => this.rowToVehicle(row));
  }

  getAllVehicles(): Vehicle[] {
    const rows = this.db.prepare('SELECT * FROM vehicles').all() as any[];
    return rows.map(row => this.rowToVehicle(row));
  }

  createVehicle(ownerId: string, type: VehicleType, x: number, y: number): Vehicle {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO vehicles (id, owner_id, type, position_x, position_y)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, ownerId, type, x, y);

    return this.getVehicle(id)!;
  }

  updatePosition(vehicleId: string, x: number, y: number): void {
    this.db.prepare('UPDATE vehicles SET position_x = ?, position_y = ? WHERE id = ?').run(x, y, vehicleId);
  }

  setDestination(vehicleId: string, x: number, y: number, path: { x: number; y: number }[]): void {
    this.db.prepare(`
      UPDATE vehicles SET destination_x = ?, destination_y = ?, path = ? WHERE id = ?
    `).run(x, y, JSON.stringify(path), vehicleId);
  }

  private rowToVehicle(row: any): Vehicle {
    return {
      id: row.id,
      ownerId: row.owner_id,
      type: row.type as VehicleType,
      position: { x: row.position_x, y: row.position_y },
      destination: row.destination_x != null ? { x: row.destination_x, y: row.destination_y } : null,
      path: row.path ? JSON.parse(row.path) : [],
      speed: row.speed,
      sprite: row.sprite || '',
    };
  }
}

export class PowerLineRepository {
  constructor(private db: Database.Database) {}

  getAllPowerLines(): { id: string; from: { x: number; y: number }; to: { x: number; y: number }; capacity: number; load: number }[] {
    const rows = this.db.prepare('SELECT * FROM power_lines').all() as any[];
    return rows.map(row => ({
      id: row.id,
      from: { x: row.from_x, y: row.from_y },
      to: { x: row.to_x, y: row.to_y },
      capacity: row.capacity,
      load: row.load,
    }));
  }

  createPowerLine(fromX: number, fromY: number, toX: number, toY: number, capacity: number = 1000): string {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO power_lines (id, from_x, from_y, to_x, to_y, capacity)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, fromX, fromY, toX, toY, capacity);
    return id;
  }

  deletePowerLine(id: string): void {
    this.db.prepare('DELETE FROM power_lines WHERE id = ?').run(id);
  }
}

export class WaterPipeRepository {
  constructor(private db: Database.Database) {}

  createTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS water_pipes (
        id TEXT PRIMARY KEY,
        from_x INTEGER NOT NULL,
        from_y INTEGER NOT NULL,
        to_x INTEGER NOT NULL,
        to_y INTEGER NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 100,
        flow INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  getAllWaterPipes(): { id: string; from: { x: number; y: number }; to: { x: number; y: number }; capacity: number; flow: number }[] {
    try {
      const rows = this.db.prepare('SELECT * FROM water_pipes').all() as any[];
      return rows.map(row => ({
        id: row.id,
        from: { x: row.from_x, y: row.from_y },
        to: { x: row.to_x, y: row.to_y },
        capacity: row.capacity,
        flow: row.flow,
      }));
    } catch (e) {
      // Table might not exist yet
      this.createTable();
      return [];
    }
  }

  createWaterPipe(fromX: number, fromY: number, toX: number, toY: number, capacity: number = 100): string {
    this.createTable(); // Ensure table exists
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO water_pipes (id, from_x, from_y, to_x, to_y, capacity)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, fromX, fromY, toX, toY, capacity);
    return id;
  }

  deleteWaterPipe(id: string): void {
    this.db.prepare('DELETE FROM water_pipes WHERE id = ?').run(id);
  }
}

// ============================================
// Rental Unit Repository
// ============================================

export class RentalUnitRepository {
  constructor(private db: Database.Database) {}

  getRentalUnit(id: string): RentalUnit | null {
    const row = this.db.prepare('SELECT * FROM rental_units WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToRentalUnit(row);
  }

  getRentalUnitsForBuilding(buildingId: string): RentalUnit[] {
    const rows = this.db.prepare('SELECT * FROM rental_units WHERE building_id = ? ORDER BY floor_number, unit_number').all(buildingId) as any[];
    return rows.map(row => this.rowToRentalUnit(row));
  }

  getAvailableUnits(unitType?: RentalUnitType): RentalUnit[] {
    let query = 'SELECT * FROM rental_units WHERE status = ?';
    const params: any[] = ['vacant'];
    if (unitType) {
      query += ' AND unit_type = ?';
      params.push(unitType);
    }
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.rowToRentalUnit(row));
  }

  getUnitsByTenant(tenantId: string): RentalUnit[] {
    const rows = this.db.prepare('SELECT * FROM rental_units WHERE tenant_id = ?').all(tenantId) as any[];
    return rows.map(row => this.rowToRentalUnit(row));
  }

  getOccupiedUnits(): RentalUnit[] {
    const rows = this.db.prepare('SELECT * FROM rental_units WHERE status = ?').all('occupied') as any[];
    return rows.map(row => this.rowToRentalUnit(row));
  }

  createRentalUnit(buildingId: string, floorNumber: number, unitNumber: number, monthlyRent: number, unitType: RentalUnitType = 'residential'): RentalUnit {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO rental_units (id, building_id, floor_number, unit_number, unit_type, monthly_rent, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'vacant', ?)
    `).run(id, buildingId, floorNumber, unitNumber, unitType, monthlyRent, now);
    return this.getRentalUnit(id)!;
  }

  signLease(unitId: string, tenantId: string, currentTick: number): void {
    this.db.prepare(`
      UPDATE rental_units SET tenant_id = ?, lease_start = ?, status = 'occupied' WHERE id = ?
    `).run(tenantId, currentTick, unitId);
  }

  terminateLease(unitId: string): void {
    this.db.prepare(`
      UPDATE rental_units SET tenant_id = NULL, lease_start = NULL, status = 'vacant' WHERE id = ?
    `).run(unitId);
  }

  deleteUnit(id: string): void {
    this.db.prepare('DELETE FROM rental_units WHERE id = ?').run(id);
  }

  deleteUnitsForBuilding(buildingId: string): void {
    this.db.prepare('DELETE FROM rental_units WHERE building_id = ?').run(buildingId);
  }

  private rowToRentalUnit(row: any): RentalUnit {
    return {
      id: row.id,
      buildingId: row.building_id,
      floorNumber: row.floor_number,
      unitNumber: row.unit_number,
      unitType: row.unit_type as RentalUnitType,
      monthlyRent: row.monthly_rent,
      tenantId: row.tenant_id,
      leaseStart: row.lease_start,
      status: row.status as RentalUnitStatus,
      createdAt: row.created_at,
    };
  }
}

// ============================================
// Rent Warning Repository
// ============================================

export class RentWarningRepository {
  constructor(private db: Database.Database) {}

  getWarning(id: string): RentWarning | null {
    const row = this.db.prepare('SELECT * FROM rent_warnings WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToWarning(row);
  }

  getWarningsForTenant(tenantId: string): RentWarning[] {
    const rows = this.db.prepare('SELECT * FROM rent_warnings WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId) as any[];
    return rows.map(row => this.rowToWarning(row));
  }

  getPendingWarnings(): RentWarning[] {
    const rows = this.db.prepare('SELECT * FROM rent_warnings WHERE status = ?').all('pending') as any[];
    return rows.map(row => this.rowToWarning(row));
  }

  getWarningForUnit(unitId: string, status?: RentWarningStatus): RentWarning | null {
    let query = 'SELECT * FROM rent_warnings WHERE unit_id = ?';
    const params: any[] = [unitId];
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC LIMIT 1';
    const row = this.db.prepare(query).get(...params) as any;
    if (!row) return null;
    return this.rowToWarning(row);
  }

  createWarning(unitId: string, tenantId: string, amountOwed: number, currentTick: number, dueDateTick: number): RentWarning {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO rent_warnings (id, unit_id, tenant_id, amount_owed, warning_date, due_date, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, unitId, tenantId, amountOwed, currentTick, dueDateTick, now);
    return this.getWarning(id)!;
  }

  updateStatus(id: string, status: RentWarningStatus): void {
    this.db.prepare('UPDATE rent_warnings SET status = ? WHERE id = ?').run(status, id);
  }

  private rowToWarning(row: any): RentWarning {
    return {
      id: row.id,
      unitId: row.unit_id,
      tenantId: row.tenant_id,
      amountOwed: row.amount_owed,
      warningDate: row.warning_date,
      dueDate: row.due_date,
      status: row.status as RentWarningStatus,
      createdAt: row.created_at,
    };
  }
}

// ============================================
// Court Case Repository
// ============================================

export class CourtCaseRepository {
  constructor(private db: Database.Database) {}

  getCase(id: string): CourtCase | null {
    const row = this.db.prepare('SELECT * FROM court_cases WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToCase(row);
  }

  getCasesForDefendant(defendantId: string): CourtCase[] {
    const rows = this.db.prepare('SELECT * FROM court_cases WHERE defendant_id = ? ORDER BY created_at DESC').all(defendantId) as any[];
    return rows.map(row => this.rowToCase(row));
  }

  getPendingCases(): CourtCase[] {
    const rows = this.db.prepare('SELECT * FROM court_cases WHERE status = ?').all('pending') as any[];
    return rows.map(row => this.rowToCase(row));
  }

  getInProgressCases(): CourtCase[] {
    const rows = this.db.prepare('SELECT * FROM court_cases WHERE status = ?').all('in_progress') as any[];
    return rows.map(row => this.rowToCase(row));
  }

  createCase(warningId: string | null, defendantId: string, plaintiffId: string, caseType: 'rent_nonpayment', amount: number, hearingDateTick: number): CourtCase {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO court_cases (id, warning_id, defendant_id, plaintiff_id, case_type, amount, hearing_date, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, warningId, defendantId, plaintiffId, caseType, amount, hearingDateTick, now);
    return this.getCase(id)!;
  }

  updateStatus(id: string, status: CourtCaseStatus): void {
    this.db.prepare('UPDATE court_cases SET status = ? WHERE id = ?').run(status, id);
  }

  setVerdict(id: string, verdict: CourtVerdict, sentence: CourtSentence | null): void {
    this.db.prepare('UPDATE court_cases SET verdict = ?, sentence = ?, status = ? WHERE id = ?').run(verdict, sentence, 'closed', id);
  }

  private rowToCase(row: any): CourtCase {
    return {
      id: row.id,
      warningId: row.warning_id,
      defendantId: row.defendant_id,
      plaintiffId: row.plaintiff_id,
      caseType: row.case_type as 'rent_nonpayment',
      amount: row.amount,
      hearingDate: row.hearing_date,
      verdict: row.verdict as CourtVerdict | null,
      sentence: row.sentence as CourtSentence | null,
      status: row.status as CourtCaseStatus,
      createdAt: row.created_at,
    };
  }
}

// ============================================
// Jail Inmate Repository
// ============================================

export class JailInmateRepository {
  constructor(private db: Database.Database) {}

  getInmate(id: string): JailInmate | null {
    const row = this.db.prepare('SELECT * FROM jail_inmates WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToInmate(row);
  }

  getInmateByAgent(agentId: string): JailInmate | null {
    const row = this.db.prepare('SELECT * FROM jail_inmates WHERE agent_id = ? AND status = ?').get(agentId, 'incarcerated') as any;
    if (!row) return null;
    return this.rowToInmate(row);
  }

  getAllInmates(): JailInmate[] {
    const rows = this.db.prepare('SELECT * FROM jail_inmates WHERE status = ?').all('incarcerated') as any[];
    return rows.map(row => this.rowToInmate(row));
  }

  getInmatesForRelease(currentTick: number): JailInmate[] {
    const rows = this.db.prepare('SELECT * FROM jail_inmates WHERE status = ? AND release_date <= ?').all('incarcerated', currentTick) as any[];
    return rows.map(row => this.rowToInmate(row));
  }

  createInmate(agentId: string, caseId: string | null, currentTick: number, releaseDateTick: number): JailInmate {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO jail_inmates (id, agent_id, case_id, check_in, release_date, status)
      VALUES (?, ?, ?, ?, ?, 'incarcerated')
    `).run(id, agentId, caseId, currentTick, releaseDateTick);
    return this.getInmate(id)!;
  }

  releaseInmate(id: string): void {
    this.db.prepare('UPDATE jail_inmates SET status = ? WHERE id = ?').run('released', id);
  }

  private rowToInmate(row: any): JailInmate {
    return {
      id: row.id,
      agentId: row.agent_id,
      caseId: row.case_id,
      checkIn: row.check_in,
      releaseDate: row.release_date,
      status: row.status as JailStatus,
    };
  }
}

// ============================================
// Population Repository (Residents)
// ============================================

// Random name generation data
const FIRST_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery',
  'Peyton', 'Charlie', 'Skyler', 'Dakota', 'Sage', 'Phoenix', 'River', 'Blake',
  'Emerson', 'Finley', 'Harper', 'Hayden', 'Jamie', 'Jesse', 'Kai', 'Lane',
  'Max', 'Nico', 'Parker', 'Reese', 'Rory', 'Sam', 'Sawyer', 'Spencer'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor',
  'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris',
  'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen'
];

export interface Resident {
  id: string;
  name: string;
  homeBuildingId: string | null;
  workBuildingId: string | null;
  salary: number;
  createdAt: number;
}

export class PopulationRepository {
  constructor(private db: Database.Database) {
    // Create table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS residents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        home_building_id TEXT REFERENCES buildings(id),
        work_building_id TEXT,
        salary REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_residents_home ON residents(home_building_id);
      CREATE INDEX IF NOT EXISTS idx_residents_work ON residents(work_building_id);
    `);
  }

  generateRandomName(): string {
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    return `${firstName} ${lastName}`;
  }

  createResident(homeBuildingId: string, name?: string): Resident {
    const id = crypto.randomUUID();
    const residentName = name || this.generateRandomName();
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO residents (id, name, home_building_id, salary, created_at)
      VALUES (?, ?, ?, 0, ?)
    `).run(id, residentName, homeBuildingId, now);

    return this.getResident(id)!;
  }

  getResident(id: string): Resident | null {
    const row = this.db.prepare('SELECT * FROM residents WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToResident(row);
  }

  getAllResidents(): Resident[] {
    const rows = this.db.prepare('SELECT * FROM residents').all() as any[];
    return rows.map(row => this.rowToResident(row));
  }

  getResidentsByHome(homeBuildingId: string): Resident[] {
    const rows = this.db.prepare('SELECT * FROM residents WHERE home_building_id = ?').all(homeBuildingId) as any[];
    return rows.map(row => this.rowToResident(row));
  }

  getResidentsByWork(workBuildingId: string): Resident[] {
    const rows = this.db.prepare('SELECT * FROM residents WHERE work_building_id = ?').all(workBuildingId) as any[];
    return rows.map(row => this.rowToResident(row));
  }

  getUnemployedResidents(): Resident[] {
    const rows = this.db.prepare('SELECT * FROM residents WHERE work_building_id IS NULL').all() as any[];
    return rows.map(row => this.rowToResident(row));
  }

  getEmployedResidents(): Resident[] {
    const rows = this.db.prepare('SELECT * FROM residents WHERE work_building_id IS NOT NULL').all() as any[];
    return rows.map(row => this.rowToResident(row));
  }

  getTotalPopulation(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM residents').get() as any;
    return result?.count || 0;
  }

  getEmployedCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM residents WHERE work_building_id IS NOT NULL').get() as any;
    return result?.count || 0;
  }

  assignJob(residentId: string, workBuildingId: string, salary: number): void {
    this.db.prepare('UPDATE residents SET work_building_id = ?, salary = ? WHERE id = ?').run(workBuildingId, salary, residentId);
  }

  removeJob(residentId: string): void {
    this.db.prepare('UPDATE residents SET work_building_id = NULL, salary = 0 WHERE id = ?').run(residentId);
  }

  deleteResident(id: string): boolean {
    const result = this.db.prepare('DELETE FROM residents WHERE id = ?').run(id);
    return result.changes > 0;
  }

  deleteResidentsByHome(homeBuildingId: string): number {
    const result = this.db.prepare('DELETE FROM residents WHERE home_building_id = ?').run(homeBuildingId);
    return result.changes;
  }

  removeWorkFromBuilding(workBuildingId: string): void {
    this.db.prepare('UPDATE residents SET work_building_id = NULL, salary = 0 WHERE work_building_id = ?').run(workBuildingId);
  }

  private rowToResident(row: any): Resident {
    return {
      id: row.id,
      name: row.name,
      homeBuildingId: row.home_building_id,
      workBuildingId: row.work_building_id,
      salary: row.salary,
      createdAt: row.created_at,
    };
  }
}

// ============================================
// Database Manager
// ============================================

export class DatabaseManager {
  private db: Database.Database;
  public city: CityRepository;
  public parcels: ParcelRepository;
  public buildings: BuildingRepository;
  public roads: RoadRepository;
  public agents: AgentRepository;
  public vehicles: VehicleRepository;
  public powerLines: PowerLineRepository;
  public waterPipes: WaterPipeRepository;
  public rentalUnits: RentalUnitRepository;
  public rentWarnings: RentWarningRepository;
  public courtCases: CourtCaseRepository;
  public jailInmates: JailInmateRepository;
  public population: PopulationRepository;

  constructor() {
    this.db = createDatabase();
    this.city = new CityRepository(this.db);
    this.parcels = new ParcelRepository(this.db);
    this.buildings = new BuildingRepository(this.db);
    this.roads = new RoadRepository(this.db);
    this.agents = new AgentRepository(this.db);
    this.vehicles = new VehicleRepository(this.db);
    this.powerLines = new PowerLineRepository(this.db);
    this.waterPipes = new WaterPipeRepository(this.db);
    this.rentalUnits = new RentalUnitRepository(this.db);
    this.rentWarnings = new RentWarningRepository(this.db);
    this.courtCases = new CourtCaseRepository(this.db);
    this.jailInmates = new JailInmateRepository(this.db);
    this.population = new PopulationRepository(this.db);
  }

  close(): void {
    this.db.close();
  }

  getRawDb(): Database.Database {
    return this.db;
  }
}
