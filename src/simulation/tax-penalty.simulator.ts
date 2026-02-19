// ============================================
// MOLTCITY - Tax Penalty Simulator
// ============================================
// Runs daily (hour === 3). Applies punishing consequences for high taxes:
// - Residential: population exodus
// - Commercial/Office: salary cuts
// - Industrial: building destruction

import type { SimulationDb } from './engine.adapter.js';
import { TAX_PENALTIES } from '../config/game.js';
import type { CityTime, CityEvent, BuildingType } from '../models/types.js';
import type { ActivityLogger } from './engine.js';

const OFFICE_TYPES: BuildingType[] = ['office', 'offices'];
const INDUSTRIAL_TYPES: BuildingType[] = ['industrial', 'factory'];

export class TaxPenaltySimulator {
  private lastProcessedDay: number = 0;

  constructor(private db: SimulationDb, private cityId: string, private log?: ActivityLogger) {}

  simulate(currentTick: number, time: CityTime): CityEvent[] {
    if (time.hour !== 3 || time.day === this.lastProcessedDay) return [];
    this.lastProcessedDay = time.day;

    const city = this.db.city.getCity(this.cityId);
    if (!city) return [];

    const taxRateR = city.economy?.taxRateR ?? 7;
    const taxRateC = city.economy?.taxRateC ?? 7;
    const taxRateI = city.economy?.taxRateI ?? 7;

    const events: CityEvent[] = [];
    events.push(...this.processResidentialExodus(taxRateR));
    events.push(...this.processOfficeSalaryCuts(taxRateC));
    events.push(...this.processIndustrialDestruction(taxRateI));
    return events;
  }

  private processResidentialExodus(taxRateR: number): CityEvent[] {
    if (taxRateR <= TAX_PENALTIES.PENALTY_THRESHOLD) return [];

    const excess = taxRateR - TAX_PENALTIES.PENALTY_THRESHOLD;
    const toLeave = Math.max(1, Math.floor(excess * TAX_PENALTIES.EXODUS_RATE));

    const residents = this.db.population.getAllResidents();
    if (residents.length === 0) return [];

    const count = Math.min(toLeave, residents.length);

    // Shuffle and pick random residents to evict
    for (let i = residents.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [residents[i], residents[j]] = [residents[j], residents[i]];
    }

    for (let i = 0; i < count; i++) {
      const resident = residents[i];
      // Remove job first if employed
      if (resident.workBuildingId) {
        this.db.population.removeJob(resident.id);
      }
      this.db.population.deleteResident(resident.id);
    }

    console.log(`[TaxPenalty] ${count} residents fled due to high residential tax (${taxRateR}%)`);
    this.log?.('tax_penalty', `${count} resident${count !== 1 ? 's' : ''} fled due to high taxes (R: ${taxRateR}%)`, {
      type: 'exodus', count, taxRateR,
    });

    return [{ type: 'population_changed' as CityEvent['type'], timestamp: Date.now(), data: { left: count } }];
  }

  private processOfficeSalaryCuts(taxRateC: number): CityEvent[] {
    if (taxRateC <= TAX_PENALTIES.PENALTY_THRESHOLD) return [];

    const excess = taxRateC - TAX_PENALTIES.PENALTY_THRESHOLD;
    const cutFactor = 1 - (excess * TAX_PENALTIES.SALARY_CUT_PER_PERCENT);
    if (cutFactor >= 1) return [];

    const residents = this.db.population.getAllResidents();
    const buildings = this.db.buildings.getAllBuildings();
    const officeBuildingIds = new Set(
      buildings.filter(b => OFFICE_TYPES.includes(b.type)).map(b => b.id)
    );

    let updated = 0;
    for (const resident of residents) {
      if (!resident.workBuildingId || !officeBuildingIds.has(resident.workBuildingId)) continue;
      if (resident.salary <= TAX_PENALTIES.MIN_SALARY) continue;

      const newSalary = Math.max(TAX_PENALTIES.MIN_SALARY, Math.floor(resident.salary * cutFactor));
      if (newSalary < resident.salary) {
        this.db.population.updateSalary(resident.id, newSalary);
        updated++;
      }
    }

    if (updated > 0) {
      const cutPercent = Math.round((1 - cutFactor) * 100);
      console.log(`[TaxPenalty] ${updated} office worker salaries cut by ${cutPercent}% (C: ${taxRateC}%)`);
      this.log?.('tax_penalty', `Office salaries cut by ${cutPercent}% due to high taxes (C: ${taxRateC}%)`, {
        type: 'salary_cut', updated, cutPercent, taxRateC,
      });
    }

    return [];
  }

  private processIndustrialDestruction(taxRateI: number): CityEvent[] {
    if (taxRateI <= TAX_PENALTIES.INDUSTRIAL_DESTROY_THRESHOLD) return [];

    const excess = taxRateI - TAX_PENALTIES.INDUSTRIAL_DESTROY_THRESHOLD;
    const buildings = this.db.buildings.getAllBuildings();
    const industrialBuildings = buildings.filter(b => INDUSTRIAL_TYPES.includes(b.type));

    let destroyed = 0;
    for (const building of industrialBuildings) {
      if (Math.random() < excess * TAX_PENALTIES.DESTROY_CHANCE_PER_PERCENT) {
        // Fire all workers first
        this.db.population.removeWorkFromBuilding(building.id);
        // Destroy building
        this.db.buildings.deleteBuilding(building.id);
        destroyed++;
      }
    }

    if (destroyed > 0) {
      console.log(`[TaxPenalty] ${destroyed} industrial building${destroyed !== 1 ? 's' : ''} destroyed (I: ${taxRateI}%)`);
      this.log?.('tax_penalty', `${destroyed} industrial building${destroyed !== 1 ? 's' : ''} destroyed due to high taxes (I: ${taxRateI}%)`, {
        type: 'industrial_destruction', destroyed, taxRateI,
      });

      return [{ type: 'buildings_updated' as CityEvent['type'], timestamp: Date.now(), data: { destroyed } }];
    }

    return [];
  }
}
