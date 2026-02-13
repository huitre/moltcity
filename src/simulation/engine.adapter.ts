// ============================================
// MOLTCITY - Simulation Engine Adapter
// ============================================

// This adapter allows the new Fastify app to work with the existing
// simulation engine by providing a compatible DatabaseManager interface.

import { NewDatabaseManager } from '../db/manager.js';
import type { Agent, Building, Road, City, Coordinate, AgentState, RoadDirection, VehicleType, RentalUnit, RentWarning, CourtCase, JailInmate, BuildingType, TerrainType, ZoningType, Vehicle, RentWarningStatus, CourtCaseStatus, CourtVerdict, CourtSentence, RentalUnitType } from '../models/types.js';

/**
 * LegacyDatabaseManagerAdapter wraps the new Drizzle-based repositories
 * to provide the same interface as the old DatabaseManager class.
 * This enables gradual migration of the simulation engine.
 */
export class LegacyDatabaseManagerAdapter {
  private newDb: NewDatabaseManager;

  // Proxy repositories that match the old interface
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

  constructor() {
    this.newDb = new NewDatabaseManager();

    // Create synchronous wrappers around async repositories
    this.city = new LegacyCityRepository(this.newDb);
    this.parcels = new LegacyParcelRepository(this.newDb);
    this.buildings = new LegacyBuildingRepository(this.newDb);
    this.roads = new LegacyRoadRepository(this.newDb);
    this.agents = new LegacyAgentRepository(this.newDb);
    this.vehicles = new LegacyVehicleRepository(this.newDb);
    this.powerLines = new LegacyPowerLineRepository(this.newDb);
    this.waterPipes = new LegacyWaterPipeRepository(this.newDb);
    this.rentalUnits = new LegacyRentalUnitRepository(this.newDb);
    this.rentWarnings = new LegacyRentWarningRepository(this.newDb);
    this.courtCases = new LegacyCourtCaseRepository(this.newDb);
    this.jailInmates = new LegacyJailInmateRepository(this.newDb);
  }

  close(): void {
    this.newDb.close();
  }

  getRawDb(): ReturnType<NewDatabaseManager['getRawDb']> {
    return this.newDb.getRawDb();
  }
}

// Helper to make async functions sync (for backwards compatibility)
// The old code uses synchronous database operations
function runSync<T>(promise: Promise<T>): T {
  // Since better-sqlite3 is actually synchronous under the hood,
  // and Drizzle wraps it, we can safely use this pattern.
  // In production, you might want to refactor to async.
  let result: T;
  let error: Error | null = null;
  let resolved = false;

  promise.then(
    (r) => { result = r; resolved = true; },
    (e) => { error = e; resolved = true; }
  );

  // Since better-sqlite3 is sync, this should resolve immediately
  if (!resolved) {
    // For truly async operations, this would fail
    // But Drizzle with better-sqlite3 is actually synchronous
    throw new Error('Async operation not supported in sync context');
  }

  if (error) throw error;
  return result!;
}

// Legacy repository wrappers
class LegacyCityRepository {
  constructor(private db: NewDatabaseManager) {}

  getCity(): City | null {
    return runSync(this.db.city.getCity());
  }

  initializeCity(name: string, width: number, height: number): City {
    return runSync(this.db.city.initializeCity(name, width, height));
  }

  updateTime(tick: number, hour: number, day: number, year: number): void {
    runSync(this.db.city.updateTime(tick, hour, day, year));
  }
}

class LegacyParcelRepository {
  constructor(private db: NewDatabaseManager) {}

  getParcel(x: number, y: number) {
    return runSync(this.db.parcels.getParcel(x, y));
  }

  getParcelById(id: string) {
    return runSync(this.db.parcels.getParcelById(id));
  }

  getAllParcels() {
    return runSync(this.db.parcels.getAllParcels());
  }

  getParcelsInRange(minX: number, minY: number, maxX: number, maxY: number) {
    return runSync(this.db.parcels.getParcelsInRange(minX, minY, maxX, maxY));
  }

  purchaseParcel(parcelId: string, ownerId: string, price: number): void {
    runSync(this.db.parcels.purchaseParcel(parcelId, ownerId, price));
  }

  initializeGrid(width: number, height: number): void {
    runSync(this.db.parcels.initializeGrid(width, height));
  }
}

class LegacyBuildingRepository {
  constructor(private db: NewDatabaseManager) {}

  getBuilding(id: string) {
    return runSync(this.db.buildings.getBuilding(id));
  }

  getBuildingAtParcel(parcelId: string) {
    return runSync(this.db.buildings.getBuildingAtParcel(parcelId));
  }

  getAllBuildings() {
    return runSync(this.db.buildings.getAllBuildings());
  }

  updatePowerStatus(buildingId: string, powered: boolean): void {
    runSync(this.db.buildings.updatePowerStatus(buildingId, powered));
  }
}

class LegacyRoadRepository {
  constructor(private db: NewDatabaseManager) {}

  getRoad(parcelId: string) {
    return runSync(this.db.roads.getRoad(parcelId));
  }

  getAllRoads() {
    return runSync(this.db.roads.getAllRoads());
  }

  updateTrafficLoad(roadId: string, load: number): void {
    runSync(this.db.roads.updateTrafficLoad(roadId, load));
  }
}

class LegacyAgentRepository {
  constructor(private db: NewDatabaseManager) {}

  getAgent(id: string) {
    return runSync(this.db.agents.getAgent(id));
  }

  getAllAgents() {
    return runSync(this.db.agents.getAllAgents());
  }

  getAgentByMoltbookId(moltbookId: string) {
    return runSync(this.db.agents.getAgentByMoltbookId(moltbookId));
  }

  findAgent(identifier: string) {
    return runSync(this.db.agents.findAgent(identifier));
  }

  updatePosition(agentId: string, x: number, y: number): void {
    runSync(this.db.agents.updatePosition(agentId, x, y));
  }

  updateState(agentId: string, state: AgentState): void {
    runSync(this.db.agents.updateState(agentId, state));
  }

  setDestination(agentId: string, x: number, y: number, path: Coordinate[]): void {
    runSync(this.db.agents.setDestination(agentId, x, y, path));
  }

  addToWallet(agentId: string, amount: number): void {
    runSync(this.db.agents.addToWallet(agentId, amount));
  }

  deductFromWallet(agentId: string, amount: number): boolean {
    return runSync(this.db.agents.deductFromWallet(agentId, amount));
  }
}

class LegacyVehicleRepository {
  constructor(private db: NewDatabaseManager) {}

  getVehicle(id: string) {
    return runSync(this.db.vehicles.getVehicle(id));
  }

  getAllVehicles() {
    return runSync(this.db.vehicles.getAllVehicles());
  }

  updatePosition(vehicleId: string, x: number, y: number): void {
    runSync(this.db.vehicles.updatePosition(vehicleId, x, y));
  }

  setDestination(vehicleId: string, x: number, y: number, path: Coordinate[]): void {
    runSync(this.db.vehicles.setDestination(vehicleId, x, y, path));
  }
}

class LegacyPowerLineRepository {
  constructor(private db: NewDatabaseManager) {}

  getAllPowerLines() {
    return runSync(this.db.powerLines.getAllPowerLines());
  }
}

class LegacyWaterPipeRepository {
  constructor(private db: NewDatabaseManager) {}

  getAllWaterPipes() {
    return runSync(this.db.waterPipes.getAllWaterPipes());
  }
}

class LegacyRentalUnitRepository {
  constructor(private db: NewDatabaseManager) {}

  getRentalUnit(id: string) {
    return runSync(this.db.rentalUnits.getRentalUnit(id));
  }

  getOccupiedUnits() {
    return runSync(this.db.rentalUnits.getOccupiedUnits());
  }

  terminateLease(unitId: string): void {
    runSync(this.db.rentalUnits.terminateLease(unitId));
  }
}

class LegacyRentWarningRepository {
  constructor(private db: NewDatabaseManager) {}

  getPendingWarnings() {
    return runSync(this.db.rentWarnings.getPendingWarnings());
  }

  getWarningForUnit(unitId: string, status?: RentWarningStatus) {
    return runSync(this.db.rentWarnings.getWarningForUnit(unitId, status));
  }

  createWarning(unitId: string, tenantId: string, amountOwed: number, currentTick: number, dueDateTick: number) {
    return runSync(this.db.rentWarnings.createWarning(unitId, tenantId, amountOwed, currentTick, dueDateTick));
  }

  updateStatus(id: string, status: RentWarningStatus): void {
    runSync(this.db.rentWarnings.updateStatus(id, status));
  }
}

class LegacyCourtCaseRepository {
  constructor(private db: NewDatabaseManager) {}

  getPendingCases() {
    return runSync(this.db.courtCases.getPendingCases());
  }

  createCase(warningId: string | null, defendantId: string, plaintiffId: string, caseType: 'rent_nonpayment', amount: number, hearingDateTick: number) {
    return runSync(this.db.courtCases.createCase(warningId, defendantId, plaintiffId, caseType, amount, hearingDateTick));
  }

  updateStatus(id: string, status: CourtCaseStatus): void {
    runSync(this.db.courtCases.updateStatus(id, status));
  }

  setVerdict(id: string, verdict: CourtVerdict, sentence: CourtSentence | null): void {
    runSync(this.db.courtCases.setVerdict(id, verdict, sentence));
  }
}

class LegacyJailInmateRepository {
  constructor(private db: NewDatabaseManager) {}

  getAllInmates() {
    return runSync(this.db.jailInmates.getAllInmates());
  }

  getInmatesForRelease(currentTick: number) {
    return runSync(this.db.jailInmates.getInmatesForRelease(currentTick));
  }

  createInmate(agentId: string, caseId: string | null, currentTick: number, releaseDateTick: number) {
    return runSync(this.db.jailInmates.createInmate(agentId, caseId, currentTick, releaseDateTick));
  }

  releaseInmate(id: string): void {
    runSync(this.db.jailInmates.releaseInmate(id));
  }
}
