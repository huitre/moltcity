// ============================================
// MOLTCITY - Crime & Public Safety Simulator
// ============================================

import type { 
  CityEvent, 
  CityEventType, 
  CityTime, 
  Coordinate,
  Crime,
  CrimeType,
  PoliceOfficer,
} from '../models/types.js';
import { DatabaseManager } from '../models/database.js';
import { CRIME, CITY_SERVICES } from '../config/game.js';
import { WalkingPathfinder } from './pathfinding.js';

// Crime names for events
const CRIME_NAMES: Record<CrimeType, string> = {
  theft: 'Theft',
  robbery: 'Robbery',
  vandalism: 'Vandalism',
  arson: 'Arson',
};

export class CrimeSimulator {
  private pathfinder: WalkingPathfinder;
  private lastCrimeCheck: number = 0;
  
  constructor(
    private db: DatabaseManager,
    gridWidth: number,
    gridHeight: number
  ) {
    this.pathfinder = new WalkingPathfinder(gridWidth, gridHeight);
  }

  /**
   * Main simulation tick
   */
  simulate(currentTick: number, time: CityTime): CityEvent[] {
    const events: CityEvent[] = [];

    // Check for new crimes every 100 ticks (~10 seconds)
    if (currentTick - this.lastCrimeCheck >= 100) {
      this.lastCrimeCheck = currentTick;
      const crimeEvents = this.checkForCrimes(currentTick, time);
      events.push(...crimeEvents);
    }

    // Update police patrols and responses
    const policeEvents = this.updatePolice(currentTick);
    events.push(...policeEvents);

    // Resolve old unsolved crimes (after 1 day)
    this.cleanupOldCrimes(currentTick);

    return events;
  }

  /**
   * Check if crimes should spawn
   */
  private checkForCrimes(currentTick: number, time: CityTime): CityEvent[] {
    const events: CityEvent[] = [];
    const parcels = this.db.parcels.getAllParcels();
    const populationStats = this.db.population.getStats();
    
    // Calculate crime multipliers
    const unemploymentRate = populationStats.total > 0 
      ? (populationStats.total - populationStats.employed) / populationStats.total 
      : 0;
    const unemploymentMultiplier = 1 + (unemploymentRate * CRIME.UNEMPLOYMENT_MULTIPLIER);
    const nightMultiplier = time.isDaylight ? 1 : CRIME.NIGHT_MULTIPLIER;

    for (const parcel of parcels) {
      // Skip if no buildings
      const building = this.db.buildings.getBuildingByParcel(parcel.id);
      if (!building || building.constructionProgress < 100) continue;

      // Calculate police coverage
      const policeCoverage = this.getPoliceCoverage(parcel.x, parcel.y);
      const policeMultiplier = policeCoverage > 0 ? 1 : CRIME.NO_POLICE_MULTIPLIER;

      // Calculate final crime chance
      const crimeChance = CRIME.BASE_RATE_PER_TICK 
        * unemploymentMultiplier 
        * nightMultiplier 
        * policeMultiplier;

      // Random check
      if (Math.random() < crimeChance) {
        const crime = this.spawnCrime(parcel.x, parcel.y, parcel.id, building.id, building.ownerId, currentTick);
        if (crime) {
          events.push({
            type: 'crime_reported' as CityEventType,
            timestamp: Date.now(),
            data: {
              crimeId: crime.id,
              type: crime.type,
              location: crime.location,
              buildingId: crime.buildingId,
              damage: crime.damageAmount,
            },
          });

          console.log(`[Crime] ${CRIME_NAMES[crime.type as CrimeType]} reported at (${parcel.x}, ${parcel.y})`);

          // Dispatch police if available
          this.dispatchPolice(crime);
        }
      }
    }

    return events;
  }

  /**
   * Spawn a crime at location
   */
  private spawnCrime(
    x: number, 
    y: number, 
    parcelId: string, 
    buildingId: string, 
    victimId: string,
    currentTick: number
  ): Crime | null {
    // Random crime type (weighted)
    const roll = Math.random();
    let type: CrimeType;
    if (roll < 0.5) {
      type = 'theft';
    } else if (roll < 0.75) {
      type = 'vandalism';
    } else if (roll < 0.95) {
      type = 'robbery';
    } else {
      type = 'arson'; // Rare but dangerous
    }

    // Calculate damage
    const damageRange = CRIME.DAMAGE[type];
    const damage = Math.floor(Math.random() * (damageRange.max - damageRange.min + 1)) + damageRange.min;

    // Create crime record
    const crime = this.db.crimes.createCrime({
      type,
      parcelId,
      locationX: x,
      locationY: y,
      victimId,
      buildingId,
      damageAmount: damage,
      reportedAt: currentTick,
      status: 'active',
    });

    // If arson, start a fire!
    if (type === 'arson') {
      this.db.fires.createFire({
        buildingId,
        parcelId,
        intensity: 1,
        spreadChance: 20,
        startedAt: currentTick,
        status: 'burning',
        cause: 'arson',
      });
      console.log(`[Crime] Arson started a fire at building ${buildingId}!`);
    }

    // Deduct damage from victim's wallet (if theft/robbery)
    if (type === 'theft' || type === 'robbery') {
      this.db.agents.deductFromWallet(victimId, damage);
    }

    return crime;
  }

  /**
   * Calculate police coverage at a location (0-100)
   */
  private getPoliceCoverage(x: number, y: number): number {
    const stations = this.db.buildings.getBuildingsByType('police_station');
    let coverage = 0;

    for (const station of stations) {
      const parcel = this.db.parcels.getParcelById(station.parcelId);
      if (!parcel) continue;

      const distance = Math.sqrt(
        Math.pow(x - parcel.x, 2) + Math.pow(y - parcel.y, 2)
      );

      if (distance <= CITY_SERVICES.COVERAGE_RADIUS.police_station) {
        // Coverage decreases with distance
        const localCoverage = 100 * (1 - distance / CITY_SERVICES.COVERAGE_RADIUS.police_station);
        coverage = Math.max(coverage, localCoverage);
      }
    }

    return coverage;
  }

  /**
   * Dispatch nearest available officer to crime
   */
  private dispatchPolice(crime: Crime): void {
    const officers = this.db.policeOfficers.getAvailableOfficers();
    if (officers.length === 0) {
      console.log(`[Crime] No available officers to respond to crime ${crime.id}`);
      return;
    }

    // Find nearest officer
    let nearestOfficer: PoliceOfficer | null = null;
    let nearestDistance = Infinity;

    for (const officer of officers) {
      const distance = Math.sqrt(
        Math.pow(crime.location.x - officer.currentLocation.x, 2) +
        Math.pow(crime.location.y - officer.currentLocation.y, 2)
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestOfficer = officer;
      }
    }

    if (nearestOfficer) {
      // Calculate path to crime
      const path = this.pathfinder.findPath(
        nearestOfficer.currentLocation,
        crime.location
      );

      this.db.policeOfficers.assignToCrime(nearestOfficer.id, crime.id, path);
      this.db.crimes.updateStatus(crime.id, 'responding', nearestOfficer.id);

      console.log(`[Crime] Officer ${nearestOfficer.name} dispatched to crime ${crime.id}`);
    }
  }

  /**
   * Update police officer positions and actions
   */
  private updatePolice(currentTick: number): CityEvent[] {
    const events: CityEvent[] = [];
    const officers = this.db.policeOfficers.getAllOfficers();

    for (const officer of officers) {
      if (officer.status === 'responding' && officer.assignedCrimeId) {
        // Move towards crime
        const crime = this.db.crimes.getCrime(officer.assignedCrimeId);
        if (!crime || crime.status !== 'responding') {
          // Crime resolved or doesn't exist, return to patrol
          this.db.policeOfficers.clearAssignment(officer.id);
          continue;
        }

        // Move along path
        if (officer.patrolRoute && officer.patrolRoute.length > 0) {
          const nextPoint = officer.patrolRoute[0];
          const dx = nextPoint.x - officer.currentLocation.x;
          const dy = nextPoint.y - officer.currentLocation.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance <= CRIME.RESPONSE_SPEED) {
            // Reached waypoint
            officer.patrolRoute.shift();
            this.db.policeOfficers.updatePosition(officer.id, nextPoint.x, nextPoint.y);

            // Check if at crime location
            if (officer.patrolRoute.length === 0) {
              // Arrived at crime scene - attempt arrest
              const success = Math.random() < CRIME.ARREST_CHANCE;
              
              if (success) {
                this.db.crimes.resolveCrime(crime.id, currentTick);
                events.push({
                  type: 'crime_resolved' as CityEventType,
                  timestamp: Date.now(),
                  data: {
                    crimeId: crime.id,
                    officerId: officer.id,
                    arrested: true,
                  },
                });
                console.log(`[Crime] Officer ${officer.name} resolved crime ${crime.id}!`);
              } else {
                // Criminal escaped
                this.db.crimes.updateStatus(crime.id, 'unsolved', null);
                events.push({
                  type: 'crime_unsolved' as CityEventType,
                  timestamp: Date.now(),
                  data: {
                    crimeId: crime.id,
                    officerId: officer.id,
                  },
                });
                console.log(`[Crime] Criminal escaped from officer ${officer.name}`);
              }

              this.db.policeOfficers.clearAssignment(officer.id);
            }
          } else {
            // Move towards next waypoint
            const moveX = (dx / distance) * CRIME.RESPONSE_SPEED;
            const moveY = (dy / distance) * CRIME.RESPONSE_SPEED;
            this.db.policeOfficers.updatePosition(
              officer.id,
              officer.currentLocation.x + moveX,
              officer.currentLocation.y + moveY
            );
          }
        }
      } else if (officer.status === 'patrolling') {
        // Random patrol movement (simplified)
        // TODO: Implement proper patrol routes
      }
    }

    return events;
  }

  /**
   * Mark old crimes as unsolved
   */
  private cleanupOldCrimes(currentTick: number): void {
    const TICKS_PER_DAY = 600 * 24;
    const activeCrimes = this.db.crimes.getActiveCrimes();

    for (const crime of activeCrimes) {
      if (currentTick - crime.reportedAt > TICKS_PER_DAY) {
        this.db.crimes.updateStatus(crime.id, 'unsolved', null);
        console.log(`[Crime] Crime ${crime.id} went cold (unsolved)`);
      }
    }
  }

  /**
   * Spawn initial officers when a police station is built
   */
  onPoliceStationBuilt(stationId: string, parcelX: number, parcelY: number): void {
    const officerCount = CITY_SERVICES.STAFF.police_station;
    const names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];

    for (let i = 0; i < officerCount; i++) {
      const name = `Officer ${names[Math.floor(Math.random() * names.length)]}`;
      this.db.policeOfficers.createOfficer({
        stationId,
        name,
        currentX: parcelX,
        currentY: parcelY,
        status: 'available',
        createdAt: Date.now(),
      });
    }

    console.log(`[Crime] ${officerCount} officers deployed to new police station`);
  }

  /**
   * Get crime statistics
   */
  getCrimeStats(): { 
    activeCrimes: number; 
    resolvedToday: number; 
    totalDamage: number;
    officerCount: number;
  } {
    const activeCrimes = this.db.crimes.getActiveCrimes().length;
    const allCrimes = this.db.crimes.getAllCrimes();
    const today = Date.now() - (24 * 60 * 60 * 1000);
    
    const resolvedToday = allCrimes.filter(
      c => c.status === 'resolved' && c.resolvedAt && c.resolvedAt > today
    ).length;
    
    const totalDamage = allCrimes.reduce((sum, c) => sum + c.damageAmount, 0);
    const officerCount = this.db.policeOfficers.getAllOfficers().length;

    return { activeCrimes, resolvedToday, totalDamage, officerCount };
  }
}
