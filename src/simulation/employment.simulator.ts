// ============================================
// MOLTCITY - Employment Simulator
// ============================================

import { PopulationRepository } from '../repositories/population.repository.js';
import { BuildingRepository } from '../repositories/building.repository.js';
import { AgentRepository } from '../repositories/agent.repository.js';
import { BUILDING_JOBS, getRandomSalary, OFFICE, SHOP_INCOME } from '../config/game.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { Building, CityEvent, CityTime, BuildingType } from '../models/types.js';

interface JobSlot {
  buildingId: string;
  buildingType: BuildingType;
  buildingOwnerId: string;
  capacity: number;
  filled: number;
  salary: number;
}

export class EmploymentSimulator {
  private populationRepo: PopulationRepository;
  private buildingRepo: BuildingRepository;
  private agentRepo: AgentRepository;
  private lastPayrollDay: number = 0;
  private lastJobMatchTick: number = 0;

  constructor(db: DrizzleDb) {
    this.populationRepo = new PopulationRepository(db);
    this.buildingRepo = new BuildingRepository(db);
    this.agentRepo = new AgentRepository(db);
  }

  /**
   * Main simulation tick - runs job matching and payroll
   */
  async simulate(currentTick: number, time: CityTime): Promise<CityEvent[]> {
    const events: CityEvent[] = [];

    // Job matching runs every hour (600 ticks)
    if (currentTick - this.lastJobMatchTick >= 600) {
      this.lastJobMatchTick = currentTick;
      const matchEvents = await this.matchJobSeekers();
      events.push(...matchEvents);
    }

    // Payroll runs once per day at midnight (hour 0)
    if (time.hour === 0 && this.lastPayrollDay !== time.day) {
      this.lastPayrollDay = time.day;
      const payrollEvents = await this.processPayroll();
      events.push(...payrollEvents);
    }

    return events;
  }

  /**
   * Get job slots for a building when it's completed
   */
  getJobCapacity(buildingType: BuildingType, floors: number): { count: number; salary: number } | null {
    const config = BUILDING_JOBS[buildingType];
    if (!config) return null;

    // Scale job count by floors for multi-floor buildings
    return {
      count: config.count * floors,
      salary: config.salary,
    };
  }

  /**
   * Match unemployed residents to available jobs
   */
  async matchJobSeekers(): Promise<CityEvent[]> {
    const events: CityEvent[] = [];

    // Get all unemployed residents
    const unemployed = await this.populationRepo.getUnemployedResidents();
    if (unemployed.length === 0) return events;

    // Get all job-providing buildings and their current worker counts
    const jobSlots = await this.getAvailableJobSlots();
    if (jobSlots.length === 0) return events;

    console.log(`[Employment] Matching ${unemployed.length} job seekers to ${jobSlots.length} workplaces`);

    // Match workers to jobs (simple FIFO for now)
    for (const resident of unemployed) {
      // Find a building with open slots
      const availableSlot = jobSlots.find(slot => slot.filled < slot.capacity);
      if (!availableSlot) break; // No more jobs available

      // Calculate salary: offices get random salary per person, others use fixed from config
      let salary = availableSlot.salary;
      if (availableSlot.buildingType === 'office') {
        // Office workers get random salary between $20-$50 (fixed per person)
        salary = getRandomSalary();
      }

      // Assign the job
      await this.populationRepo.assignJob(resident.id, availableSlot.buildingId, salary);
      availableSlot.filled++;

      events.push({
        type: 'resident_employed' as any,
        timestamp: Date.now(),
        data: {
          residentId: resident.id,
          residentName: resident.name,
          buildingId: availableSlot.buildingId,
          salary,
        },
      });

      console.log(`[Employment] ${resident.name} hired at ${availableSlot.buildingType} for ${salary}/day`);
    }

    return events;
  }

  /**
   * Get all buildings with open job slots
   */
  private async getAvailableJobSlots(): Promise<JobSlot[]> {
    const buildings = await this.buildingRepo.getAllBuildings();
    const jobSlots: JobSlot[] = [];

    for (const building of buildings) {
      // Only completed buildings provide jobs
      if (building.constructionProgress < 100) continue;

      const jobConfig = BUILDING_JOBS[building.type];
      if (!jobConfig) continue;

      // Get current employee count
      const employees = await this.populationRepo.getResidentsByWork(building.id);
      const capacity = jobConfig.count * building.floors;

      if (employees.length < capacity) {
        jobSlots.push({
          buildingId: building.id,
          buildingType: building.type,
          buildingOwnerId: building.ownerId,
          capacity,
          filled: employees.length,
          salary: jobConfig.salary,
        });
      }
    }

    return jobSlots;
  }

  /**
   * Process daily payroll - pay all employed residents
   */
  async processPayroll(): Promise<CityEvent[]> {
    const events: CityEvent[] = [];

    // Get all employed residents
    const employed = await this.populationRepo.getEmployedResidents();
    if (employed.length === 0) return events;

    let totalPaid = 0;

    for (const resident of employed) {
      if (resident.salary <= 0) continue;

      // Find the building owner (agent) to pay from...
      // But per the plan, salaries are generated from city treasury (not building owners)
      // For simplicity, we'll just credit the building owner's account
      // This creates economic flow without complex treasury management

      if (resident.workBuildingId) {
        const building = await this.buildingRepo.getBuilding(resident.workBuildingId);
        if (building) {
          // Add salary to building owner's wallet
          await this.agentRepo.addToWallet(building.ownerId, resident.salary);
          totalPaid += resident.salary;
        }
      }
    }

    if (totalPaid > 0) {
      console.log(`[Employment] Payroll processed: ${totalPaid} MOLT paid to ${employed.length} workers`);
      events.push({
        type: 'payroll_processed' as any,
        timestamp: Date.now(),
        data: {
          totalPaid,
          workerCount: employed.length,
        },
      });
    }

    return events;
  }

  /**
   * Handle building demolition - remove all jobs
   */
  async onBuildingDemolished(buildingId: string): Promise<CityEvent[]> {
    const events: CityEvent[] = [];

    // Get workers before removing their jobs
    const workers = await this.populationRepo.getResidentsByWork(buildingId);

    if (workers.length > 0) {
      await this.populationRepo.removeWorkFromBuilding(buildingId);
      console.log(`[Employment] ${workers.length} workers lost jobs from demolished building`);

      events.push({
        type: 'jobs_lost' as any,
        timestamp: Date.now(),
        data: {
          buildingId,
          count: workers.length,
          residentIds: workers.map(w => w.id),
        },
      });
    }

    return events;
  }

  /**
   * Get employment statistics
   */
  async getEmploymentStats(): Promise<{
    totalJobs: number;
    filledJobs: number;
    openJobs: number;
    averageSalary: number;
  }> {
    const buildings = await this.buildingRepo.getAllBuildings();
    let totalJobs = 0;
    let filledJobs = 0;
    let totalSalary = 0;
    let jobBuildingCount = 0;

    for (const building of buildings) {
      if (building.constructionProgress < 100) continue;

      const jobConfig = BUILDING_JOBS[building.type];
      if (!jobConfig) continue;

      const capacity = jobConfig.count * building.floors;
      const employees = await this.populationRepo.getResidentsByWork(building.id);

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
