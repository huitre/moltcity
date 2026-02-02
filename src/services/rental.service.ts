// ============================================
// MOLTCITY - Rental Service
// ============================================

import { RentalUnitRepository } from '../repositories/rental.repository.js';
import { RentWarningRepository, CourtCaseRepository, JailInmateRepository } from '../repositories/justice.repository.js';
import { BuildingRepository } from '../repositories/building.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { CityRepository } from '../repositories/city.repository.js';
import { NotFoundError, ValidationError, ConflictError, InsufficientFundsError, ForbiddenError } from '../plugins/error-handler.plugin.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { RentalUnit, RentWarning, CourtCase, JailInmate, RentalUnitType } from '../models/types.js';

export class RentalService {
  private rentalRepo: RentalUnitRepository;
  private warningRepo: RentWarningRepository;
  private caseRepo: CourtCaseRepository;
  private inmateRepo: JailInmateRepository;
  private buildingRepo: BuildingRepository;
  private agentRepo: AgentRepository;
  private cityRepo: CityRepository;

  constructor(db: DrizzleDb) {
    this.rentalRepo = new RentalUnitRepository(db);
    this.warningRepo = new RentWarningRepository(db);
    this.caseRepo = new CourtCaseRepository(db);
    this.inmateRepo = new JailInmateRepository(db);
    this.buildingRepo = new BuildingRepository(db);
    this.agentRepo = new AgentRepository(db);
    this.cityRepo = new CityRepository(db);
  }

  // ==========================================
  // Rental Units
  // ==========================================

  async createRentalUnits(
    buildingId: string,
    floor: number,
    unitCount: number,
    rent: number,
    unitType: RentalUnitType = 'residential'
  ): Promise<RentalUnit[]> {
    const building = await this.buildingRepo.getBuilding(buildingId);
    if (!building) {
      throw new NotFoundError('Building', buildingId);
    }

    if (floor > building.floors) {
      throw new ValidationError(`Building only has ${building.floors} floors`);
    }

    if (unitCount < 1 || unitCount > 3) {
      throw new ValidationError('Unit count must be between 1 and 3');
    }

    // Check for existing units on this floor
    const existingUnits = await this.rentalRepo.getRentalUnitsForBuilding(buildingId);
    const unitsOnFloor = existingUnits.filter(u => u.floorNumber === floor);
    if (unitsOnFloor.length > 0) {
      throw new ConflictError(`Floor ${floor} already has rental units`);
    }

    const units: RentalUnit[] = [];
    for (let i = 1; i <= unitCount; i++) {
      const unit = await this.rentalRepo.createRentalUnit(
        buildingId,
        floor,
        i,
        rent,
        unitType
      );
      units.push(unit);
    }

    return units;
  }

  async getAvailableUnits(unitType?: RentalUnitType): Promise<RentalUnit[]> {
    return this.rentalRepo.getAvailableUnits(unitType);
  }

  async getUnitsForBuilding(buildingId: string): Promise<RentalUnit[]> {
    return this.rentalRepo.getRentalUnitsForBuilding(buildingId);
  }

  async getUnitsByTenant(tenantId: string): Promise<RentalUnit[]> {
    return this.rentalRepo.getUnitsByTenant(tenantId);
  }

  async signLease(agentId: string, unitId: string): Promise<RentalUnit> {
    const unit = await this.rentalRepo.getRentalUnit(unitId);
    if (!unit) {
      throw new NotFoundError('Rental unit', unitId);
    }

    if (unit.status !== 'vacant') {
      throw new ConflictError('Unit is not available');
    }

    const agent = await this.agentRepo.getAgent(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    // Check if agent can afford first month's rent
    if (agent.wallet.balance < unit.monthlyRent) {
      throw new InsufficientFundsError(unit.monthlyRent, agent.wallet.balance);
    }

    // Get current tick
    const city = await this.cityRepo.getCity();
    const currentTick = city?.time.tick || 0;

    // Deduct first month's rent
    await this.agentRepo.deductFromWallet(agentId, unit.monthlyRent);

    // Sign the lease
    await this.rentalRepo.signLease(unitId, agentId, currentTick);

    // Set as agent's home if residential
    if (unit.unitType === 'residential') {
      await this.agentRepo.setHome(agentId, unit.buildingId);
    } else {
      await this.agentRepo.setWork(agentId, unit.buildingId);
    }

    return (await this.rentalRepo.getRentalUnit(unitId))!;
  }

  async payRent(agentId: string, unitId: string, amount?: number): Promise<void> {
    const unit = await this.rentalRepo.getRentalUnit(unitId);
    if (!unit) {
      throw new NotFoundError('Rental unit', unitId);
    }

    if (unit.tenantId !== agentId) {
      throw new ForbiddenError('Agent is not the tenant of this unit');
    }

    const agent = await this.agentRepo.getAgent(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    const paymentAmount = amount || unit.monthlyRent;

    if (agent.wallet.balance < paymentAmount) {
      throw new InsufficientFundsError(paymentAmount, agent.wallet.balance);
    }

    // Deduct payment
    await this.agentRepo.deductFromWallet(agentId, paymentAmount);

    // Pay to building owner
    const building = await this.buildingRepo.getBuilding(unit.buildingId);
    if (building) {
      await this.agentRepo.addToWallet(building.ownerId, paymentAmount);
    }

    // Clear any pending warnings
    const pendingWarning = await this.warningRepo.getWarningForUnit(unitId, 'pending');
    if (pendingWarning && paymentAmount >= pendingWarning.amountOwed) {
      await this.warningRepo.updateStatus(pendingWarning.id, 'paid');
    }
  }

  async terminateLease(unitId: string, reason?: string): Promise<void> {
    const unit = await this.rentalRepo.getRentalUnit(unitId);
    if (!unit) {
      throw new NotFoundError('Rental unit', unitId);
    }

    if (!unit.tenantId) {
      throw new ValidationError('Unit is not occupied');
    }

    // Clear tenant's home/work association
    const agent = await this.agentRepo.getAgent(unit.tenantId);
    if (agent) {
      if (unit.unitType === 'residential' && agent.home === unit.buildingId) {
        await this.agentRepo.setHome(unit.tenantId, null as any);
      } else if (unit.unitType === 'commercial' && agent.work === unit.buildingId) {
        await this.agentRepo.setWork(unit.tenantId, null as any);
      }
    }

    // Terminate the lease
    await this.rentalRepo.terminateLease(unitId);
  }

  // ==========================================
  // Justice System
  // ==========================================

  async getWarningsForTenant(tenantId: string): Promise<RentWarning[]> {
    return this.warningRepo.getWarningsForTenant(tenantId);
  }

  async getCasesForDefendant(defendantId: string): Promise<CourtCase[]> {
    return this.caseRepo.getCasesForDefendant(defendantId);
  }

  async getAllInmates(): Promise<JailInmate[]> {
    return this.inmateRepo.getAllInmates();
  }

  async getInmateStatus(agentId: string): Promise<JailInmate | null> {
    return this.inmateRepo.getInmateByAgent(agentId);
  }

  async createWarning(unitId: string, tenantId: string, amountOwed: number): Promise<RentWarning> {
    const city = await this.cityRepo.getCity();
    const currentTick = city?.time.tick || 0;

    // Due in 3 days (3 * 14400 ticks = 43200 ticks)
    const dueDateTick = currentTick + 43200;

    return this.warningRepo.createWarning(unitId, tenantId, amountOwed, currentTick, dueDateTick);
  }

  async escalateToCourtCase(warningId: string): Promise<CourtCase> {
    const warning = await this.warningRepo.getWarning(warningId);
    if (!warning) {
      throw new NotFoundError('Warning', warningId);
    }

    const unit = await this.rentalRepo.getRentalUnit(warning.unitId);
    if (!unit) {
      throw new NotFoundError('Rental unit', warning.unitId);
    }

    const building = await this.buildingRepo.getBuilding(unit.buildingId);
    if (!building) {
      throw new NotFoundError('Building', unit.buildingId);
    }

    // Mark warning as escalated
    await this.warningRepo.updateStatus(warningId, 'escalated');

    const city = await this.cityRepo.getCity();
    const currentTick = city?.time.tick || 0;

    // Hearing in 1 day
    const hearingDateTick = currentTick + 14400;

    return this.caseRepo.createCase(
      warningId,
      warning.tenantId,
      building.ownerId,
      'rent_nonpayment',
      warning.amountOwed,
      hearingDateTick
    );
  }

  async incarcerateAgent(agentId: string, caseId: string | null, durationTicks: number): Promise<JailInmate> {
    const city = await this.cityRepo.getCity();
    const currentTick = city?.time.tick || 0;
    const releaseDateTick = currentTick + durationTicks;

    // Update agent state
    await this.agentRepo.updateState(agentId, 'in_jail');

    return this.inmateRepo.createInmate(agentId, caseId, currentTick, releaseDateTick);
  }

  async releaseInmate(inmateId: string): Promise<void> {
    const inmate = await this.inmateRepo.getInmate(inmateId);
    if (!inmate) {
      throw new NotFoundError('Inmate', inmateId);
    }

    // Update agent state
    await this.agentRepo.updateState(inmate.agentId, 'idle');

    // Release
    await this.inmateRepo.releaseInmate(inmateId);
  }
}
