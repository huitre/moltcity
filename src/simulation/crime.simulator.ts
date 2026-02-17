// ============================================
// MOLTCITY - Crime Simulator
// ============================================
// Runs hourly (every 300 ticks). Generates random crimes
// near buildings, dispatches officers, and resolves crimes.

import type { SimulationDb } from './engine.adapter.js';
import { CRIME, CITY_SERVICES } from '../config/game.js';
import type { CityTime, CrimeType } from '../models/types.js';
import type { ActivityLogger } from './engine.js';

const OFFICER_NAMES = [
  'Officer Smith', 'Officer Johnson', 'Officer Williams', 'Officer Brown',
  'Officer Jones', 'Officer Davis', 'Officer Miller', 'Officer Wilson',
  'Sgt. Garcia', 'Sgt. Martinez', 'Sgt. Anderson', 'Sgt. Taylor',
  'Lt. Thomas', 'Lt. Jackson', 'Det. Harris', 'Det. Clark',
];

const CRIME_TYPES: CrimeType[] = ['theft', 'robbery', 'vandalism', 'arson'];

export class CrimeSimulator {
  private officersSpawned = false;

  constructor(private db: SimulationDb, private log?: ActivityLogger) {}

  simulate(time: CityTime, currentTick: number): void {
    // Ensure officers are spawned at police stations
    if (!this.officersSpawned) {
      this.spawnOfficers();
      this.officersSpawned = true;
    }

    // Generate crimes
    this.generateCrimes(time, currentTick);

    // Dispatch officers to active crimes
    this.dispatchOfficers();

    // Process responding officers
    this.processResponding(currentTick);
  }

  private spawnOfficers(): void {
    const buildings = this.db.buildings.getAllBuildings();
    const stations = buildings.filter(b => b.type === 'police_station' && b.constructionProgress >= 100);

    for (const station of stations) {
      const existing = this.db.policeOfficers.getOfficersByStation(station.id);
      const staffCount = CITY_SERVICES.STAFF.police_station;

      if (existing.length < staffCount) {
        const parcel = this.db.parcels.getParcelById(station.parcelId);
        if (!parcel) continue;

        const toSpawn = staffCount - existing.length;
        for (let i = 0; i < toSpawn; i++) {
          const name = OFFICER_NAMES[Math.floor(Math.random() * OFFICER_NAMES.length)];
          this.db.policeOfficers.createOfficer(station.id, name, parcel.x, parcel.y);
        }
        console.log(`[Crime] Spawned ${toSpawn} officers at station ${station.name}`);
      }
    }
  }

  private generateCrimes(time: CityTime, currentTick: number): void {
    const buildings = this.db.buildings.getAllBuildings();
    const completedBuildings = buildings.filter(b =>
      b.constructionProgress >= 100 &&
      !['road', 'power_plant', 'water_tower', 'park', 'plaza'].includes(b.type)
    );

    if (completedBuildings.length === 0) return;

    // Population stats for unemployment multiplier
    const totalPop = this.db.population.getTotalPopulation();
    const employed = this.db.population.getEmployedCount();
    const unemploymentRate = totalPop > 0 ? (totalPop - employed) / totalPop : 0;

    // Officer coverage
    const officers = this.db.policeOfficers.getAllOfficers();
    const officerPositions = officers.map(o => o.currentLocation);

    for (const building of completedBuildings) {
      const parcel = this.db.parcels.getParcelById(building.parcelId);
      if (!parcel) continue;

      // Base probability
      let crimeChance = CRIME.BASE_RATE_PER_TICK * 300; // Hourly rate

      // Night multiplier
      if (!time.isDaylight) {
        crimeChance *= CRIME.NIGHT_MULTIPLIER;
      }

      // Unemployment multiplier
      if (unemploymentRate > 0.3) {
        crimeChance *= CRIME.UNEMPLOYMENT_MULTIPLIER;
      }

      // Low land value increases crime
      if (parcel.landValue < 40) {
        crimeChance *= 1.5;
      }

      // Police coverage reduces crime
      const hasPoliceNearby = officerPositions.some(p =>
        Math.abs(p.x - parcel.x) + Math.abs(p.y - parcel.y) <= CRIME.PATROL_RADIUS
      );
      if (!hasPoliceNearby) {
        crimeChance *= CRIME.NO_POLICE_MULTIPLIER;
      }

      // Roll for crime
      if (Math.random() < crimeChance) {
        const crimeType = CRIME_TYPES[Math.floor(Math.random() * CRIME_TYPES.length)];
        const damage = this.calculateDamage(crimeType);

        this.db.crimes.createCrime(
          crimeType,
          parcel.id,
          parcel.x,
          parcel.y,
          building.id,
          damage,
          currentTick
        );

        console.log(`[Crime] ${crimeType} at ${building.name} (${parcel.x},${parcel.y}), damage: $${damage}`);
        this.log?.('crime_reported', `${crimeType} at ${building.name} (${parcel.x},${parcel.y})`, {
          crimeType, buildingId: building.id, buildingName: building.name, x: parcel.x, y: parcel.y, damage,
        });
      }
    }
  }

  private calculateDamage(type: CrimeType): number {
    const range = CRIME.DAMAGE[type];
    if (range.max === 0) return 0;
    return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
  }

  private dispatchOfficers(): void {
    const activeCrimes = this.db.crimes.getActiveCrimes().filter(c => c.status === 'active');
    if (activeCrimes.length === 0) return;

    const availableOfficers = this.db.policeOfficers.getAvailableOfficers();
    if (availableOfficers.length === 0) return;

    for (const crime of activeCrimes) {
      if (availableOfficers.length === 0) break;

      // Find nearest available officer
      let nearest = availableOfficers[0];
      let nearestDist = Infinity;

      for (const officer of availableOfficers) {
        const dist = Math.abs(officer.currentLocation.x - crime.location.x) +
                     Math.abs(officer.currentLocation.y - crime.location.y);
        if (dist < nearestDist) {
          nearest = officer;
          nearestDist = dist;
        }
      }

      // Dispatch
      this.db.policeOfficers.assignToCrime(nearest.id, crime.id);
      this.db.crimes.assignOfficer(crime.id, nearest.id);

      // Remove from available pool
      const idx = availableOfficers.indexOf(nearest);
      if (idx >= 0) availableOfficers.splice(idx, 1);

      console.log(`[Crime] ${nearest.name} dispatched to ${crime.type} at (${crime.location.x},${crime.location.y})`);
    }
  }

  private processResponding(currentTick: number): void {
    const activeCrimes = this.db.crimes.getActiveCrimes().filter(c => c.status === 'responding');

    for (const crime of activeCrimes) {
      if (!crime.respondingOfficerId) continue;

      const officer = this.db.policeOfficers.getOfficer(crime.respondingOfficerId);
      if (!officer) continue;

      // Move officer toward crime
      const dx = crime.location.x - officer.currentLocation.x;
      const dy = crime.location.y - officer.currentLocation.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= CRIME.RESPONSE_SPEED) {
        // Officer arrived - attempt arrest
        this.db.policeOfficers.updatePosition(officer.id, crime.location.x, crime.location.y);

        if (Math.random() < CRIME.ARREST_CHANCE) {
          // Crime resolved
          this.db.crimes.resolveCrime(crime.id, currentTick);
          this.db.policeOfficers.setAvailable(officer.id);
          console.log(`[Crime] ${officer.name} resolved ${crime.type} at (${crime.location.x},${crime.location.y})`);
          this.log?.('crime_resolved', `${officer.name} resolved ${crime.type} at (${crime.location.x},${crime.location.y})`, {
            officerName: officer.name, crimeType: crime.type, x: crime.location.x, y: crime.location.y,
          });
        } else {
          // Criminal escaped, crime becomes unsolved
          this.db.crimes.resolveCrime(crime.id, currentTick);
          this.db.policeOfficers.setAvailable(officer.id);
          console.log(`[Crime] Criminal escaped from ${officer.name} at (${crime.location.x},${crime.location.y})`);
        }
      } else {
        // Move toward crime
        const moveX = (dx / dist) * CRIME.RESPONSE_SPEED;
        const moveY = (dy / dist) * CRIME.RESPONSE_SPEED;
        this.db.policeOfficers.updatePosition(
          officer.id,
          officer.currentLocation.x + moveX,
          officer.currentLocation.y + moveY
        );
      }
    }
  }
}
