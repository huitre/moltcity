// ============================================
// MOLTCITY - Simulation Engine Adapter
// ============================================

// This adapter allows the new Fastify app to work with the existing
// simulation engine by providing a compatible DatabaseManager interface.
// All database operations use raw better-sqlite3 prepared statements
// for truly synchronous execution (required by the simulation tick loop).

import Database from 'better-sqlite3';
import { NewDatabaseManager } from '../db/manager.js';
import {
  CrimeRepository as LegacyRawCrimeRepository,
  PoliceOfficerRepository as LegacyRawPoliceOfficerRepository,
  FireRepository as LegacyRawFireRepository,
  FirefighterRepository as LegacyRawFirefighterRepository,
} from '../models/database.js';
import type { Agent, Building, Road, City, Coordinate, AgentState, RoadDirection, VehicleType, RentalUnit, RentWarning, CourtCase, JailInmate, BuildingType, TerrainType, ZoningType, Vehicle, RentWarningStatus, CourtCaseStatus, CourtVerdict, CourtSentence, RentalUnitType, Crime, CrimeType, CrimeStatus, PoliceOfficer, OfficerStatus, Fire, FireIntensity, FireStatus, Firefighter, FirefighterStatus, Bond, DepartmentFunding, BudgetYtd, Parcel } from '../models/types.js';
import type { Resident } from '../repositories/population.repository.js';

// ============================================
// Helper functions
// ============================================

function generateId(): string {
  return crypto.randomUUID();
}

function now(): number {
  return Date.now();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

// ============================================
// Row-to-model mapping functions
// (Raw SQL returns snake_case column names)
// ============================================

function rowToCity(row: any): City {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    time: {
      tick: row.tick,
      hour: row.hour,
      day: row.day,
      year: row.year,
      isDaylight: row.hour >= 6 && row.hour < 20,
    },
    stats: {
      population: 0,
      totalBuildings: 0,
      totalRoads: 0,
      powerCapacity: 0,
      powerDemand: 0,
      waterCapacity: 0,
      waterDemand: 0,
      treasury: row.treasury,
    },
    mayor: row.mayor_id,
    economy: {
      taxRateR: row.tax_rate_r,
      taxRateC: row.tax_rate_c,
      taxRateI: row.tax_rate_i,
      ordinances: parseJson<string[]>(row.ordinances, []),
      bonds: parseJson<Bond[]>(row.bonds, []),
      departmentFunding: parseJson<DepartmentFunding>(row.department_funding, { police: 100, fire: 100, health: 100, education: 100, transit: 100 }),
      budgetYtd: parseJson<BudgetYtd>(row.budget_ytd, { revenues: { propertyTaxR: 0, propertyTaxC: 0, propertyTaxI: 0, ordinances: 0 }, expenses: { police: 0, fire: 0, health: 0, education: 0, transit: 0, bondInterest: 0 } }),
      creditRating: row.credit_rating,
    },
  };
}

function rowToParcel(row: any): Parcel {
  return {
    id: row.id,
    x: row.x,
    y: row.y,
    terrain: row.terrain as TerrainType,
    zoning: row.zoning as ZoningType | null,
    ownerId: row.owner_id,
    purchasePrice: row.purchase_price,
    purchaseDate: row.purchase_date,
    landValue: row.land_value,
  };
}

function rowToBuilding(row: any): Building {
  return {
    id: row.id,
    parcelId: row.parcel_id,
    type: row.type as BuildingType,
    name: row.name,
    sprite: row.sprite || '',
    width: row.width,
    height: row.height,
    floors: row.floors,
    powerRequired: row.power_required,
    waterRequired: row.water_required,
    powered: !!row.powered,
    hasWater: !!row.has_water,
    operational: !!row.operational,
    builtAt: row.built_at,
    ownerId: row.owner_id,
    constructionProgress: row.construction_progress,
    constructionStartedAt: row.construction_started_at,
    constructionTimeTicks: row.construction_time_ticks,
    density: row.density,
  };
}

function rowToRoad(row: any): Road {
  return {
    id: row.id,
    parcelId: row.parcel_id,
    direction: row.direction as RoadDirection,
    lanes: row.lanes,
    trafficLoad: row.traffic_load,
    speedLimit: row.speed_limit,
  };
}

const DEFAULT_SCHEDULE = { wakeUp: 7, workStart: 9, workEnd: 17, sleepTime: 22 };

function rowToAgent(row: any): Agent {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar || '',
    home: row.home_building_id,
    work: row.work_building_id,
    currentLocation: { x: row.current_x, y: row.current_y },
    destination: row.destination_x != null && row.destination_y != null
      ? { x: row.destination_x, y: row.destination_y }
      : null,
    path: row.path ? JSON.parse(row.path) : [],
    state: row.state as AgentState,
    schedule: row.schedule ? JSON.parse(row.schedule) : DEFAULT_SCHEDULE,
    wallet: {
      balance: row.wallet_balance,
      currency: (row.wallet_currency || 'MOLT') as 'MOLT' | 'USD',
    },
    moltbookId: row.moltbook_id,
    createdAt: row.created_at,
  };
}

function rowToVehicle(row: any): Vehicle {
  return {
    id: row.id,
    ownerId: row.owner_id,
    type: row.type as VehicleType,
    position: { x: row.position_x, y: row.position_y },
    destination: row.destination_x != null && row.destination_y != null
      ? { x: row.destination_x, y: row.destination_y }
      : null,
    path: row.path ? JSON.parse(row.path) : [],
    speed: row.speed,
    sprite: row.sprite || '',
  };
}

interface PowerLine {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  capacity: number;
  load: number;
}

interface WaterPipe {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  capacity: number;
  flow: number;
}

function rowToPowerLine(row: any): PowerLine {
  return {
    id: row.id,
    from: { x: row.from_x, y: row.from_y },
    to: { x: row.to_x, y: row.to_y },
    capacity: row.capacity,
    load: row.load,
  };
}

function rowToWaterPipe(row: any): WaterPipe {
  return {
    id: row.id,
    from: { x: row.from_x, y: row.from_y },
    to: { x: row.to_x, y: row.to_y },
    capacity: row.capacity,
    flow: row.flow,
  };
}

function rowToRentalUnit(row: any): RentalUnit {
  return {
    id: row.id,
    buildingId: row.building_id,
    floorNumber: row.floor_number,
    unitNumber: row.unit_number,
    unitType: row.unit_type as RentalUnitType,
    monthlyRent: row.monthly_rent,
    tenantId: row.tenant_id,
    leaseStart: row.lease_start,
    status: row.status as any,
    createdAt: row.created_at,
  };
}

function rowToRentWarning(row: any): RentWarning {
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

function rowToCourtCase(row: any): CourtCase {
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

function rowToJailInmate(row: any): JailInmate {
  return {
    id: row.id,
    agentId: row.agent_id,
    caseId: row.case_id,
    checkIn: row.check_in,
    releaseDate: row.release_date,
    status: row.status as any,
  };
}

function rowToResident(row: any): Resident {
  return {
    id: row.id,
    name: row.name,
    homeBuildingId: row.home_building_id,
    workBuildingId: row.work_building_id,
    salary: row.salary,
    createdAt: row.created_at,
  };
}

// Power/water requirements (duplicated from building.repository.ts for sync access)
const POWER_REQUIREMENTS: Partial<Record<string, number>> = {
  residential: 100, offices: 800, suburban: 50, industrial: 1500,
  fire_station: 500, hospital: 2000, house: 100, apartment: 500,
  shop: 300, office: 800, factory: 2000, power_plant: 0, wind_turbine: 0, coal_plant: 0, nuclear_plant: 0,
  water_tower: 50, road: 10, park: 0, plaza: 100,
  city_hall: 1000, police_station: 800, courthouse: 1200, jail: 1500,
};
const WATER_REQUIREMENTS: Partial<Record<string, number>> = {
  residential: 10, offices: 12, suburban: 5, industrial: 18,
  fire_station: 20, hospital: 40, house: 10, apartment: 15,
  shop: 12, office: 12, factory: 18, power_plant: 50, wind_turbine: 0, coal_plant: 50, nuclear_plant: 100,
  water_tower: 0, road: 0, park: 8, plaza: 6,
  city_hall: 20, police_station: 15, courthouse: 15, jail: 20,
};

// Random resident names (duplicated from population.repository.ts)
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

function randomName(): string {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

// ============================================
// Main adapter classes
// ============================================

/**
 * LegacyDatabaseManagerAdapter wraps raw better-sqlite3
 * to provide the same interface as the old DatabaseManager class.
 * All operations are truly synchronous.
 */
export class LegacyDatabaseManagerAdapter {
  private newDb: NewDatabaseManager;
  private raw: Database.Database;

  public city: LegacyCityRepository;
  public parcels: LegacyParcelRepository;
  public buildings: LegacyBuildingRepository;
  public roads: LegacyRoadRepository;
  public agents: LegacyAgentRepository;
  public vehicles: LegacyVehicleRepository;
  public powerLines: LegacyPowerLineRepository;
  public waterPipes: LegacyWaterPipeRepository;
  public rentalUnits: LegacyRentalUnitRepository;
  public rentWarnings: LegacyRentWarningRepository;
  public courtCases: LegacyCourtCaseRepository;
  public jailInmates: LegacyJailInmateRepository;
  public population: LegacyPopulationRepository;
  public crimes: LegacyCrimeRepository;
  public policeOfficers: LegacyPoliceOfficerRepository;
  public fires: LegacyFireRepository;
  public firefighters: LegacyFirefighterRepository;

  constructor() {
    this.newDb = new NewDatabaseManager();
    this.raw = this.newDb.getRawDb();

    this.city = new LegacyCityRepository(this.raw);
    this.parcels = new LegacyParcelRepository(this.raw);
    this.buildings = new LegacyBuildingRepository(this.raw);
    this.roads = new LegacyRoadRepository(this.raw);
    this.agents = new LegacyAgentRepository(this.raw);
    this.vehicles = new LegacyVehicleRepository(this.raw);
    this.powerLines = new LegacyPowerLineRepository(this.raw);
    this.waterPipes = new LegacyWaterPipeRepository(this.raw);
    this.rentalUnits = new LegacyRentalUnitRepository(this.raw);
    this.rentWarnings = new LegacyRentWarningRepository(this.raw);
    this.courtCases = new LegacyCourtCaseRepository(this.raw);
    this.jailInmates = new LegacyJailInmateRepository(this.raw);
    this.population = new LegacyPopulationRepository(this.raw);
    this.crimes = new LegacyCrimeRepository(this.raw);
    this.policeOfficers = new LegacyPoliceOfficerRepository(this.raw);
    this.fires = new LegacyFireRepository(this.raw);
    this.firefighters = new LegacyFirefighterRepository(this.raw);
  }

  forCity(cityId: string): CityScopedDatabaseAdapter {
    return new CityScopedDatabaseAdapter(this.raw, cityId);
  }

  close(): void {
    this.newDb.close();
  }

  getRawDb(): Database.Database {
    return this.raw;
  }
}

/**
 * City-scoped adapter that pre-binds cityId to all repository method calls.
 */
export class CityScopedDatabaseAdapter {
  public city: LegacyCityRepository;
  public parcels: CityScopedParcelRepository;
  public buildings: CityScopedBuildingRepository;
  public roads: CityScopedRoadRepository;
  public agents: CityScopedAgentRepository;
  public vehicles: LegacyVehicleRepository;
  public powerLines: CityScopedPowerLineRepository;
  public waterPipes: CityScopedWaterPipeRepository;
  public rentalUnits: LegacyRentalUnitRepository;
  public rentWarnings: LegacyRentWarningRepository;
  public courtCases: LegacyCourtCaseRepository;
  public jailInmates: LegacyJailInmateRepository;
  public population: CityScopedPopulationRepository;
  public crimes: CityScopedCrimeRepository;
  public policeOfficers: CityScopedPoliceOfficerRepository;
  public fires: CityScopedFireRepository;
  public firefighters: CityScopedFirefighterRepository;
  public readonly cityId: string;

  constructor(raw: Database.Database, cityId: string) {
    this.cityId = cityId;
    this.city = new LegacyCityRepository(raw);
    this.parcels = new CityScopedParcelRepository(raw, cityId);
    this.buildings = new CityScopedBuildingRepository(raw, cityId);
    this.roads = new CityScopedRoadRepository(raw, cityId);
    this.agents = new CityScopedAgentRepository(raw, cityId);
    this.vehicles = new LegacyVehicleRepository(raw);
    this.powerLines = new CityScopedPowerLineRepository(raw, cityId);
    this.waterPipes = new CityScopedWaterPipeRepository(raw, cityId);
    this.rentalUnits = new LegacyRentalUnitRepository(raw);
    this.rentWarnings = new LegacyRentWarningRepository(raw);
    this.courtCases = new LegacyCourtCaseRepository(raw);
    this.jailInmates = new LegacyJailInmateRepository(raw);
    this.population = new CityScopedPopulationRepository(raw, cityId);
    this.crimes = new CityScopedCrimeRepository(raw, cityId);
    this.policeOfficers = new CityScopedPoliceOfficerRepository(raw, cityId);
    this.fires = new CityScopedFireRepository(raw, cityId);
    this.firefighters = new CityScopedFirefighterRepository(raw, cityId);
  }
}

/** Type alias for DB used by simulators */
export type SimulationDb = LegacyDatabaseManagerAdapter | CityScopedDatabaseAdapter;

// ============================================
// Legacy repository wrappers (raw SQL, synchronous)
// ============================================

class LegacyCityRepository {
  constructor(protected raw: Database.Database) {}

  getCity(cityId?: string): City | null {
    const row = cityId
      ? this.raw.prepare('SELECT * FROM city WHERE id = ?').get(cityId)
      : this.raw.prepare('SELECT * FROM city LIMIT 1').get();
    return row ? rowToCity(row) : null;
  }

  getAllCities(): City[] {
    const rows = this.raw.prepare('SELECT * FROM city').all();
    return rows.map(row => rowToCity(row));
  }

  updateTime(cityId: string, tick: number, hour: number, day: number, year: number): void {
    this.raw.prepare('UPDATE city SET tick = ?, hour = ?, day = ?, year = ? WHERE id = ?').run(tick, hour, day, year, cityId);
  }

  updateTreasury(cityId: string, amount: number): void {
    this.raw.prepare('UPDATE city SET treasury = ? WHERE id = ?').run(amount, cityId);
  }

  updateTaxRates(cityId: string, taxRateR: number, taxRateC: number, taxRateI: number): void {
    this.raw.prepare('UPDATE city SET tax_rate_r = ?, tax_rate_c = ?, tax_rate_i = ? WHERE id = ?').run(taxRateR, taxRateC, taxRateI, cityId);
  }

  updateOrdinances(cityId: string, ordinances: string[]): void {
    this.raw.prepare('UPDATE city SET ordinances = ? WHERE id = ?').run(JSON.stringify(ordinances), cityId);
  }

  updateBonds(cityId: string, bonds: Bond[]): void {
    this.raw.prepare('UPDATE city SET bonds = ? WHERE id = ?').run(JSON.stringify(bonds), cityId);
  }

  updateDepartmentFunding(cityId: string, funding: DepartmentFunding): void {
    this.raw.prepare('UPDATE city SET department_funding = ? WHERE id = ?').run(JSON.stringify(funding), cityId);
  }

  updateBudgetYtd(cityId: string, ytd: any): void {
    this.raw.prepare('UPDATE city SET budget_ytd = ? WHERE id = ?').run(JSON.stringify(ytd), cityId);
  }

  updateCreditRating(cityId: string, rating: string): void {
    this.raw.prepare('UPDATE city SET credit_rating = ? WHERE id = ?').run(rating, cityId);
  }

  resetBudgetYtd(cityId: string): void {
    const empty = JSON.stringify({
      revenues: { propertyTaxR: 0, propertyTaxC: 0, propertyTaxI: 0, ordinances: 0 },
      expenses: { police: 0, fire: 0, health: 0, education: 0, transit: 0, bondInterest: 0 },
    });
    this.raw.prepare('UPDATE city SET budget_ytd = ? WHERE id = ?').run(empty, cityId);
  }
}

class LegacyParcelRepository {
  constructor(protected raw: Database.Database) {}

  getParcel(x: number, y: number, cityId?: string): Parcel | null {
    const row = cityId
      ? this.raw.prepare('SELECT * FROM parcels WHERE x = ? AND y = ? AND city_id = ? LIMIT 1').get(x, y, cityId)
      : this.raw.prepare('SELECT * FROM parcels WHERE x = ? AND y = ? LIMIT 1').get(x, y);
    return row ? rowToParcel(row) : null;
  }

  getParcelById(id: string): Parcel | null {
    const row = this.raw.prepare('SELECT * FROM parcels WHERE id = ?').get(id);
    return row ? rowToParcel(row) : null;
  }

  getAllParcels(): Parcel[] {
    const rows = this.raw.prepare('SELECT * FROM parcels').all();
    return rows.map(row => rowToParcel(row));
  }

  getZonedParcelsWithoutBuilding(cityId?: string): Parcel[] {
    const sql = cityId
      ? 'SELECT p.* FROM parcels p WHERE p.city_id = ? AND p.zoning IS NOT NULL AND NOT EXISTS (SELECT 1 FROM buildings b WHERE b.parcel_id = p.id)'
      : 'SELECT p.* FROM parcels p WHERE p.zoning IS NOT NULL AND NOT EXISTS (SELECT 1 FROM buildings b WHERE b.parcel_id = p.id)';
    const rows = cityId
      ? this.raw.prepare(sql).all(cityId)
      : this.raw.prepare(sql).all();
    const candidates = rows.map(row => rowToParcel(row));
    return this.filterOutMultiTileFootprints(candidates);
  }

  protected filterOutMultiTileFootprints(candidates: Parcel[]): Parcel[] {
    const multiTileBuildings = this.raw.prepare(
      'SELECT b.*, p.x AS base_x, p.y AS base_y FROM buildings b JOIN parcels p ON b.parcel_id = p.id WHERE b.width > 1 OR b.height > 1'
    ).all() as any[];
    if (multiTileBuildings.length === 0) return candidates;

    const occupied = new Set<string>();
    for (const b of multiTileBuildings) {
      for (let dx = 0; dx < b.width; dx++) {
        for (let dy = 0; dy < b.height; dy++) {
          occupied.add(`${b.base_x + dx},${b.base_y + dy}`);
        }
      }
    }

    return candidates.filter(p => !occupied.has(`${p.x},${p.y}`));
  }

  getParcelsInRange(minX: number, minY: number, maxX: number, maxY: number): Parcel[] {
    const rows = this.raw.prepare('SELECT * FROM parcels WHERE x >= ? AND x <= ? AND y >= ? AND y <= ?').all(minX, maxX, minY, maxY);
    return rows.map(row => rowToParcel(row));
  }

  purchaseParcel(parcelId: string, ownerId: string, price: number): void {
    this.raw.prepare('UPDATE parcels SET owner_id = ?, purchase_price = ?, purchase_date = ? WHERE id = ?').run(ownerId, price, now(), parcelId);
  }

  getOrCreateParcel(x: number, y: number, cityId?: string): Parcel {
    const existing = this.getParcel(x, y, cityId);
    if (existing) return existing;
    const id = generateId();
    this.raw.prepare('INSERT INTO parcels (id, x, y, terrain, city_id) VALUES (?, ?, ?, ?, ?)').run(id, x, y, 'land', cityId || null);
    return this.getParcel(x, y, cityId)!;
  }

  updateLandValues(updates: { parcelId: string; value: number }[]): void {
    const stmt = this.raw.prepare('UPDATE parcels SET land_value = ? WHERE id = ?');
    for (const u of updates) {
      stmt.run(u.value, u.parcelId);
    }
  }
}

class LegacyBuildingRepository {
  constructor(protected raw: Database.Database) {}

  getBuilding(id: string): Building | null {
    const row = this.raw.prepare('SELECT * FROM buildings WHERE id = ?').get(id);
    return row ? rowToBuilding(row) : null;
  }

  getBuildingAtParcel(parcelId: string): Building | null {
    const row = this.raw.prepare('SELECT * FROM buildings WHERE parcel_id = ? LIMIT 1').get(parcelId);
    return row ? rowToBuilding(row) : null;
  }

  getAllBuildings(): Building[] {
    const rows = this.raw.prepare('SELECT * FROM buildings').all();
    return rows.map(row => rowToBuilding(row));
  }

  createBuilding(
    parcelId: string,
    type: BuildingType,
    name: string,
    ownerId: string,
    sprite?: string,
    floors: number = 1,
    currentTick: number = 0,
    width: number = 1,
    height: number = 1,
    cityId?: string
  ): Building {
    const id = generateId();
    const powerRequired = (POWER_REQUIREMENTS[type] || 100) * floors;
    const waterRequired = (WATER_REQUIREMENTS[type] || 10) * floors;
    this.raw.prepare(`
      INSERT OR IGNORE INTO buildings (id, city_id, parcel_id, type, name, sprite, floors, width, height,
        power_required, water_required, built_at, owner_id, construction_progress,
        construction_started_at, construction_time_ticks, density)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, NULL, 0, 1)
    `).run(id, cityId || '', parcelId, type, name, sprite || '', floors, width, height, powerRequired, waterRequired, now(), ownerId);
    return this.getBuilding(id) || this.getBuildingAtParcel(parcelId)!;
  }

  deleteBuilding(buildingId: string): boolean {
    const result = this.raw.prepare('DELETE FROM buildings WHERE id = ?').run(buildingId);
    return result.changes > 0;
  }

  updatePowerStatus(buildingId: string, powered: boolean): void {
    this.raw.prepare('UPDATE buildings SET powered = ? WHERE id = ?').run(powered ? 1 : 0, buildingId);
  }

  updateWaterStatus(buildingId: string, hasWater: boolean): void {
    this.raw.prepare('UPDATE buildings SET has_water = ? WHERE id = ?').run(hasWater ? 1 : 0, buildingId);
  }

  updateDensityAndFloors(buildingId: string, density: number, floors: number, width?: number, height?: number): void {
    if (width !== undefined && height !== undefined) {
      this.raw.prepare('UPDATE buildings SET density = ?, floors = ?, width = ?, height = ? WHERE id = ?')
        .run(density, floors, width, height, buildingId);
    } else {
      this.raw.prepare('UPDATE buildings SET density = ?, floors = ? WHERE id = ?')
        .run(density, floors, buildingId);
    }
  }
}

class LegacyRoadRepository {
  constructor(protected raw: Database.Database) {}

  getRoad(parcelId: string): Road | null {
    const row = this.raw.prepare('SELECT * FROM roads WHERE parcel_id = ? LIMIT 1').get(parcelId);
    return row ? rowToRoad(row) : null;
  }

  getAllRoads(): Road[] {
    const rows = this.raw.prepare('SELECT * FROM roads').all();
    return rows.map(row => rowToRoad(row));
  }

  updateTrafficLoad(roadId: string, load: number): void {
    this.raw.prepare('UPDATE roads SET traffic_load = ? WHERE id = ?').run(load, roadId);
  }
}

class LegacyAgentRepository {
  constructor(protected raw: Database.Database) {}

  getAgent(id: string): Agent | null {
    const row = this.raw.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    return row ? rowToAgent(row) : null;
  }

  getAllAgents(): Agent[] {
    const rows = this.raw.prepare('SELECT * FROM agents').all();
    return rows.map(row => rowToAgent(row));
  }

  getAgentByMoltbookId(moltbookId: string): Agent | null {
    const row = this.raw.prepare('SELECT * FROM agents WHERE moltbook_id = ? LIMIT 1').get(moltbookId);
    return row ? rowToAgent(row) : null;
  }

  findAgent(identifier: string): Agent | null {
    let agent = this.getAgent(identifier);
    if (agent) return agent;
    return this.getAgentByMoltbookId(identifier);
  }

  updatePosition(agentId: string, x: number, y: number): void {
    this.raw.prepare('UPDATE agents SET current_x = ?, current_y = ? WHERE id = ?').run(x, y, agentId);
  }

  updateState(agentId: string, state: AgentState): void {
    this.raw.prepare('UPDATE agents SET state = ? WHERE id = ?').run(state, agentId);
  }

  setDestination(agentId: string, x: number, y: number, path: Coordinate[]): void {
    this.raw.prepare('UPDATE agents SET destination_x = ?, destination_y = ?, path = ? WHERE id = ?').run(x, y, JSON.stringify(path), agentId);
  }

  addToWallet(agentId: string, amount: number): void {
    this.raw.prepare('UPDATE agents SET wallet_balance = wallet_balance + ? WHERE id = ?').run(amount, agentId);
  }

  deductFromWallet(agentId: string, amount: number): boolean {
    const row = this.raw.prepare('SELECT wallet_balance FROM agents WHERE id = ?').get(agentId) as any;
    if (!row || row.wallet_balance < amount) return false;
    this.raw.prepare('UPDATE agents SET wallet_balance = wallet_balance - ? WHERE id = ?').run(amount, agentId);
    return true;
  }

  updateWalletBalance(agentId: string, balance: number): void {
    this.raw.prepare('UPDATE agents SET wallet_balance = ? WHERE id = ?').run(balance, agentId);
  }
}

class LegacyVehicleRepository {
  constructor(protected raw: Database.Database) {}

  getVehicle(id: string): Vehicle | null {
    const row = this.raw.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    return row ? rowToVehicle(row) : null;
  }

  getAllVehicles(): Vehicle[] {
    const rows = this.raw.prepare('SELECT * FROM vehicles').all();
    return rows.map(row => rowToVehicle(row));
  }

  updatePosition(vehicleId: string, x: number, y: number): void {
    this.raw.prepare('UPDATE vehicles SET position_x = ?, position_y = ? WHERE id = ?').run(x, y, vehicleId);
  }

  setDestination(vehicleId: string, x: number, y: number, path: Coordinate[]): void {
    this.raw.prepare('UPDATE vehicles SET destination_x = ?, destination_y = ?, path = ? WHERE id = ?').run(x, y, JSON.stringify(path), vehicleId);
  }
}

class LegacyPowerLineRepository {
  constructor(protected raw: Database.Database) {}

  getAllPowerLines(): PowerLine[] {
    const rows = this.raw.prepare('SELECT * FROM power_lines').all();
    return rows.map(row => rowToPowerLine(row));
  }
}

class LegacyWaterPipeRepository {
  constructor(protected raw: Database.Database) {}

  getAllWaterPipes(): WaterPipe[] {
    const rows = this.raw.prepare('SELECT * FROM water_pipes').all();
    return rows.map(row => rowToWaterPipe(row));
  }
}

class LegacyRentalUnitRepository {
  constructor(protected raw: Database.Database) {}

  getRentalUnit(id: string): RentalUnit | null {
    const row = this.raw.prepare('SELECT * FROM rental_units WHERE id = ?').get(id);
    return row ? rowToRentalUnit(row) : null;
  }

  getOccupiedUnits(): RentalUnit[] {
    const rows = this.raw.prepare("SELECT * FROM rental_units WHERE status = 'occupied'").all();
    return rows.map(row => rowToRentalUnit(row));
  }

  terminateLease(unitId: string): void {
    this.raw.prepare("UPDATE rental_units SET tenant_id = NULL, lease_start = NULL, status = 'vacant' WHERE id = ?").run(unitId);
  }
}

class LegacyRentWarningRepository {
  constructor(protected raw: Database.Database) {}

  getPendingWarnings(): RentWarning[] {
    const rows = this.raw.prepare("SELECT * FROM rent_warnings WHERE status = 'pending'").all();
    return rows.map(row => rowToRentWarning(row));
  }

  getWarningForUnit(unitId: string, status?: RentWarningStatus): RentWarning | null {
    const row = status
      ? this.raw.prepare('SELECT * FROM rent_warnings WHERE unit_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1').get(unitId, status)
      : this.raw.prepare('SELECT * FROM rent_warnings WHERE unit_id = ? ORDER BY created_at DESC LIMIT 1').get(unitId);
    return row ? rowToRentWarning(row) : null;
  }

  getWarning(id: string): RentWarning | null {
    const row = this.raw.prepare('SELECT * FROM rent_warnings WHERE id = ?').get(id);
    return row ? rowToRentWarning(row) : null;
  }

  createWarning(unitId: string, tenantId: string, amountOwed: number, currentTick: number, dueDateTick: number): RentWarning {
    const id = generateId();
    this.raw.prepare(`
      INSERT INTO rent_warnings (id, city_id, unit_id, tenant_id, amount_owed, warning_date, due_date, status, created_at)
      VALUES (?, '', ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, unitId, tenantId, amountOwed, currentTick, dueDateTick, now());
    return this.getWarning(id)!;
  }

  updateStatus(id: string, status: RentWarningStatus): void {
    this.raw.prepare('UPDATE rent_warnings SET status = ? WHERE id = ?').run(status, id);
  }
}

class LegacyCourtCaseRepository {
  constructor(protected raw: Database.Database) {}

  getPendingCases(): CourtCase[] {
    const rows = this.raw.prepare("SELECT * FROM court_cases WHERE status = 'pending'").all();
    return rows.map(row => rowToCourtCase(row));
  }

  createCase(warningId: string | null, defendantId: string, plaintiffId: string, caseType: 'rent_nonpayment', amount: number, hearingDateTick: number): CourtCase {
    const id = generateId();
    this.raw.prepare(`
      INSERT INTO court_cases (id, city_id, warning_id, defendant_id, plaintiff_id, case_type, amount, hearing_date, status, created_at)
      VALUES (?, '', ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, warningId, defendantId, plaintiffId, caseType, amount, hearingDateTick, now());
    const row = this.raw.prepare('SELECT * FROM court_cases WHERE id = ?').get(id);
    return rowToCourtCase(row);
  }

  updateStatus(id: string, status: CourtCaseStatus): void {
    this.raw.prepare('UPDATE court_cases SET status = ? WHERE id = ?').run(status, id);
  }

  setVerdict(id: string, verdict: CourtVerdict, sentence: CourtSentence | null): void {
    this.raw.prepare("UPDATE court_cases SET verdict = ?, sentence = ?, status = 'closed' WHERE id = ?").run(verdict, sentence, id);
  }
}

class LegacyJailInmateRepository {
  constructor(protected raw: Database.Database) {}

  getAllInmates(): JailInmate[] {
    const rows = this.raw.prepare("SELECT * FROM jail_inmates WHERE status = 'incarcerated'").all();
    return rows.map(row => rowToJailInmate(row));
  }

  getInmatesForRelease(currentTick: number): JailInmate[] {
    const rows = this.raw.prepare("SELECT * FROM jail_inmates WHERE status = 'incarcerated' AND release_date <= ?").all(currentTick);
    return rows.map(row => rowToJailInmate(row));
  }

  createInmate(agentId: string, caseId: string | null, currentTick: number, releaseDateTick: number): JailInmate {
    const id = generateId();
    this.raw.prepare(`
      INSERT INTO jail_inmates (id, city_id, agent_id, case_id, check_in, release_date, status)
      VALUES (?, '', ?, ?, ?, ?, 'incarcerated')
    `).run(id, agentId, caseId, currentTick, releaseDateTick);
    const row = this.raw.prepare('SELECT * FROM jail_inmates WHERE id = ?').get(id);
    return rowToJailInmate(row);
  }

  releaseInmate(id: string): void {
    this.raw.prepare("UPDATE jail_inmates SET status = 'released' WHERE id = ?").run(id);
  }
}

class LegacyPopulationRepository {
  constructor(protected raw: Database.Database) {}

  createResident(homeBuildingId: string, name?: string, cityId?: string): Resident {
    const id = generateId();
    const residentName = name || randomName();
    this.raw.prepare(`
      INSERT INTO residents (id, city_id, name, home_building_id, work_building_id, salary, created_at)
      VALUES (?, ?, ?, ?, NULL, 0, ?)
    `).run(id, cityId || '', residentName, homeBuildingId, now());
    const row = this.raw.prepare('SELECT * FROM residents WHERE id = ?').get(id);
    return rowToResident(row);
  }

  getResident(id: string): Resident | null {
    const row = this.raw.prepare('SELECT * FROM residents WHERE id = ?').get(id);
    return row ? rowToResident(row) : null;
  }

  getAllResidents(cityId?: string): Resident[] {
    const rows = cityId
      ? this.raw.prepare('SELECT * FROM residents WHERE city_id = ?').all(cityId)
      : this.raw.prepare('SELECT * FROM residents').all();
    return rows.map(row => rowToResident(row));
  }

  getResidentsByHome(homeBuildingId: string): Resident[] {
    const rows = this.raw.prepare('SELECT * FROM residents WHERE home_building_id = ?').all(homeBuildingId);
    return rows.map(row => rowToResident(row));
  }

  getResidentsByWork(workBuildingId: string): Resident[] {
    const rows = this.raw.prepare('SELECT * FROM residents WHERE work_building_id = ?').all(workBuildingId);
    return rows.map(row => rowToResident(row));
  }

  getUnemployedResidents(): Resident[] {
    const rows = this.raw.prepare('SELECT * FROM residents WHERE work_building_id IS NULL').all();
    return rows.map(row => rowToResident(row));
  }

  getEmployedResidents(): Resident[] {
    const rows = this.raw.prepare('SELECT * FROM residents WHERE work_building_id IS NOT NULL').all();
    return rows.map(row => rowToResident(row));
  }

  getTotalPopulation(): number {
    const row = this.raw.prepare('SELECT count(*) as count FROM residents').get() as any;
    return row?.count || 0;
  }

  getEmployedCount(): number {
    const row = this.raw.prepare('SELECT count(*) as count FROM residents WHERE work_building_id IS NOT NULL').get() as any;
    return row?.count || 0;
  }

  assignJob(residentId: string, workBuildingId: string, salary: number): void {
    this.raw.prepare('UPDATE residents SET work_building_id = ?, salary = ? WHERE id = ?').run(workBuildingId, salary, residentId);
  }

  removeJob(residentId: string): void {
    this.raw.prepare('UPDATE residents SET work_building_id = NULL, salary = 0 WHERE id = ?').run(residentId);
  }

  updateSalary(residentId: string, salary: number): void {
    this.raw.prepare('UPDATE residents SET salary = ? WHERE id = ?').run(salary, residentId);
  }

  deleteResident(id: string): boolean {
    const result = this.raw.prepare('DELETE FROM residents WHERE id = ?').run(id);
    return result.changes > 0;
  }

  deleteResidentsByHome(homeBuildingId: string): number {
    const result = this.raw.prepare('DELETE FROM residents WHERE home_building_id = ?').run(homeBuildingId);
    return result.changes;
  }

  removeWorkFromBuilding(workBuildingId: string): void {
    this.raw.prepare('UPDATE residents SET work_building_id = NULL, salary = 0 WHERE work_building_id = ?').run(workBuildingId);
  }
}

// ============================================
// City-scoped repository overrides
// ============================================

class CityScopedBuildingRepository extends LegacyBuildingRepository {
  constructor(raw: Database.Database, private cityId: string) {
    super(raw);
  }

  getAllBuildings() {
    const rows = this.raw.prepare('SELECT * FROM buildings WHERE city_id = ?').all(this.cityId);
    return rows.map(row => rowToBuilding(row));
  }

  createBuilding(
    parcelId: string,
    type: BuildingType,
    name: string,
    ownerId: string,
    sprite?: string,
    floors: number = 1,
    currentTick: number = 0,
    width: number = 1,
    height: number = 1,
  ): Building {
    return super.createBuilding(parcelId, type, name, ownerId, sprite, floors, currentTick, width, height, this.cityId);
  }
}

class CityScopedRoadRepository extends LegacyRoadRepository {
  constructor(raw: Database.Database, private cityId: string) {
    super(raw);
  }

  getAllRoads() {
    const rows = this.raw.prepare('SELECT * FROM roads WHERE city_id = ?').all(this.cityId);
    return rows.map(row => rowToRoad(row));
  }
}

class CityScopedAgentRepository extends LegacyAgentRepository {
  constructor(raw: Database.Database, private cityId: string) {
    super(raw);
  }

  getAllAgents() {
    const rows = this.raw.prepare('SELECT * FROM agents WHERE city_id = ?').all(this.cityId);
    return rows.map(row => rowToAgent(row));
  }
}

class CityScopedPowerLineRepository extends LegacyPowerLineRepository {
  constructor(raw: Database.Database, private cityId: string) {
    super(raw);
  }

  getAllPowerLines() {
    const rows = this.raw.prepare('SELECT * FROM power_lines WHERE city_id = ?').all(this.cityId);
    return rows.map(row => rowToPowerLine(row));
  }
}

class CityScopedWaterPipeRepository extends LegacyWaterPipeRepository {
  constructor(raw: Database.Database, private cityId: string) {
    super(raw);
  }

  getAllWaterPipes() {
    const rows = this.raw.prepare('SELECT * FROM water_pipes WHERE city_id = ?').all(this.cityId);
    return rows.map(row => rowToWaterPipe(row));
  }
}

class CityScopedParcelRepository extends LegacyParcelRepository {
  constructor(raw: Database.Database, private cityId: string) {
    super(raw);
  }

  getParcel(x: number, y: number): Parcel | null {
    return super.getParcel(x, y, this.cityId);
  }

  getOrCreateParcel(x: number, y: number): Parcel {
    return super.getOrCreateParcel(x, y, this.cityId);
  }

  getZonedParcelsWithoutBuilding(): Parcel[] {
    const rows = this.raw.prepare('SELECT p.* FROM parcels p WHERE p.city_id = ? AND p.zoning IS NOT NULL AND NOT EXISTS (SELECT 1 FROM buildings b WHERE b.parcel_id = p.id)').all(this.cityId);
    const candidates = rows.map(row => rowToParcel(row));
    return this.filterOutMultiTileFootprints(candidates);
  }
}

class CityScopedPopulationRepository extends LegacyPopulationRepository {
  constructor(raw: Database.Database, private cityId: string) {
    super(raw);
  }

  createResident(homeBuildingId: string, name?: string): Resident {
    return super.createResident(homeBuildingId, name, this.cityId);
  }

  getAllResidents(): Resident[] {
    return super.getAllResidents(this.cityId);
  }

  getTotalPopulation(): number {
    const row = this.raw.prepare('SELECT count(*) as count FROM residents WHERE city_id = ?').get(this.cityId) as any;
    return row?.count || 0;
  }

  getEmployedCount(): number {
    const row = this.raw.prepare('SELECT count(*) as count FROM residents WHERE city_id = ? AND work_building_id IS NOT NULL').get(this.cityId) as any;
    return row?.count || 0;
  }

  getUnemployedResidents(): Resident[] {
    const rows = this.raw.prepare('SELECT * FROM residents WHERE city_id = ? AND work_building_id IS NULL').all(this.cityId);
    return rows.map(row => rowToResident(row));
  }

  getEmployedResidents(): Resident[] {
    const rows = this.raw.prepare('SELECT * FROM residents WHERE city_id = ? AND work_building_id IS NOT NULL').all(this.cityId);
    return rows.map(row => rowToResident(row));
  }

  getResidentsByHome(homeBuildingId: string): Resident[] {
    const rows = this.raw.prepare('SELECT * FROM residents WHERE city_id = ? AND home_building_id = ?').all(this.cityId, homeBuildingId);
    return rows.map(row => rowToResident(row));
  }

  getResidentsByWork(workBuildingId: string): Resident[] {
    const rows = this.raw.prepare('SELECT * FROM residents WHERE city_id = ? AND work_building_id = ?').all(this.cityId, workBuildingId);
    return rows.map(row => rowToResident(row));
  }
}

// ============================================
// Raw better-sqlite3 wrappers for crime/fire
// (These delegate to the legacy repos in models/database.ts)
// ============================================

class LegacyCrimeRepository extends LegacyRawCrimeRepository {}
class LegacyPoliceOfficerRepository extends LegacyRawPoliceOfficerRepository {}
class LegacyFireRepository extends LegacyRawFireRepository {}
class LegacyFirefighterRepository extends LegacyRawFirefighterRepository {}

class CityScopedCrimeRepository extends LegacyRawCrimeRepository {
  constructor(db: Database.Database, private cityId: string) {
    super(db);
  }

  createCrime(type: CrimeType, parcelId: string, x: number, y: number, buildingId: string | null, damageAmount: number, tick: number): Crime {
    return super.createCrime(type, parcelId, x, y, buildingId, damageAmount, tick, this.cityId);
  }

  getActiveCrimes(): Crime[] {
    const rows = this.db.prepare("SELECT * FROM crimes WHERE city_id = ? AND status IN (?, ?)").all(this.cityId, 'active', 'responding') as any[];
    return rows.map(r => this.rowToCrime(r));
  }
}

class CityScopedPoliceOfficerRepository extends LegacyRawPoliceOfficerRepository {
  constructor(db: Database.Database, private cityId: string) {
    super(db);
  }

  createOfficer(stationId: string, name: string, x: number, y: number): PoliceOfficer {
    return super.createOfficer(stationId, name, x, y, this.cityId);
  }

  getAllOfficers(): PoliceOfficer[] {
    const rows = this.db.prepare('SELECT * FROM police_officers WHERE city_id = ?').all(this.cityId) as any[];
    return rows.map(r => this.rowToOfficer(r));
  }

  getAvailableOfficers(): PoliceOfficer[] {
    const rows = this.db.prepare('SELECT * FROM police_officers WHERE city_id = ? AND status = ?').all(this.cityId, 'available') as any[];
    return rows.map(r => this.rowToOfficer(r));
  }
}

class CityScopedFireRepository extends LegacyRawFireRepository {
  constructor(db: Database.Database, private cityId: string) {
    super(db);
  }

  createFire(buildingId: string, parcelId: string, cause: string, tick: number): Fire {
    return super.createFire(buildingId, parcelId, cause, tick, this.cityId);
  }

  getActiveFires(): Fire[] {
    const rows = this.db.prepare("SELECT * FROM fires WHERE city_id = ? AND status = ?").all(this.cityId, 'burning') as any[];
    return rows.map(r => this.rowToFire(r));
  }
}

class CityScopedFirefighterRepository extends LegacyRawFirefighterRepository {
  constructor(db: Database.Database, private cityId: string) {
    super(db);
  }

  createFirefighter(stationId: string, name: string, x: number, y: number): Firefighter {
    return super.createFirefighter(stationId, name, x, y, this.cityId);
  }

  getAllFirefighters(): Firefighter[] {
    const rows = this.db.prepare('SELECT * FROM firefighters WHERE city_id = ?').all(this.cityId) as any[];
    return rows.map(r => this.rowToFirefighter(r));
  }

  getAvailableFirefighters(): Firefighter[] {
    const rows = this.db.prepare('SELECT * FROM firefighters WHERE city_id = ? AND status = ?').all(this.cityId, 'available') as any[];
    return rows.map(r => this.rowToFirefighter(r));
  }
}
