// ============================================
// MOLTCITY - Database Manager (Adapter for Backwards Compatibility)
// ============================================

import { getDrizzleDb, getSqliteConnection, closeDatabaseConnection, type DrizzleDb } from './drizzle.js';
import {
  CityRepository,
  ParcelRepository,
  BuildingRepository,
  RoadRepository,
  AgentRepository,
  VehicleRepository,
  PowerLineRepository,
  WaterPipeRepository,
  RentalUnitRepository,
} from '../repositories/index.js';
import {
  RentWarningRepository,
  CourtCaseRepository,
  JailInmateRepository,
} from '../repositories/justice.repository.js';

/**
 * DatabaseManager provides a unified interface to all repositories.
 * This is an adapter that maintains backwards compatibility with the
 * existing simulation engine while using the new Drizzle-based repositories.
 */
export class NewDatabaseManager {
  private _db: DrizzleDb;

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

  constructor() {
    this._db = getDrizzleDb();

    // Initialize all repositories
    this.city = new CityRepository(this._db);
    this.parcels = new ParcelRepository(this._db);
    this.buildings = new BuildingRepository(this._db);
    this.roads = new RoadRepository(this._db);
    this.agents = new AgentRepository(this._db);
    this.vehicles = new VehicleRepository(this._db);
    this.powerLines = new PowerLineRepository(this._db);
    this.waterPipes = new WaterPipeRepository(this._db);
    this.rentalUnits = new RentalUnitRepository(this._db);
    this.rentWarnings = new RentWarningRepository(this._db);
    this.courtCases = new CourtCaseRepository(this._db);
    this.jailInmates = new JailInmateRepository(this._db);
  }

  /**
   * Get the raw SQLite database connection
   * (for backwards compatibility with old code that needs direct access)
   */
  getRawDb(): ReturnType<typeof getSqliteConnection> {
    return getSqliteConnection();
  }

  /**
   * Get the Drizzle database instance
   */
  getDrizzle(): DrizzleDb {
    return this._db;
  }

  /**
   * Close the database connection
   */
  close(): void {
    closeDatabaseConnection();
  }
}

// Singleton instance
let instance: NewDatabaseManager | null = null;

export function getNewDatabaseManager(): NewDatabaseManager {
  if (!instance) {
    instance = new NewDatabaseManager();
  }
  return instance;
}

export function closeNewDatabaseManager(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
