// ============================================
// MOLTCITY - Fire Simulator
// ============================================
// Runs every 10 ticks. Generates random fires,
// grows intensity, spreads to adjacent buildings,
// and dispatches firefighters.

import type { SimulationDb } from './engine.adapter.js';
import { FIRE, CITY_SERVICES } from '../config/game.js';
import type { CityTime } from '../models/types.js';
import type { ActivityLogger } from './engine.js';

const FIREFIGHTER_NAMES = [
  'FF Smith', 'FF Johnson', 'FF Williams', 'FF Brown',
  'FF Jones', 'FF Davis', 'FF Miller', 'FF Wilson',
  'Captain Garcia', 'Captain Martinez', 'Captain Anderson', 'Captain Taylor',
  'Chief Thomas', 'Chief Jackson', 'Lt. Harris', 'Lt. Clark',
];

export class FireSimulator {
  private firefightersSpawned = false;

  constructor(private db: SimulationDb, private log?: ActivityLogger) {}

  simulate(time: CityTime, currentTick: number): void {
    // Ensure firefighters are spawned at fire stations
    if (!this.firefightersSpawned) {
      this.spawnFirefighters();
      this.firefightersSpawned = true;
    }

    // Generate random fires (low probability)
    this.generateFires(currentTick);

    // Grow active fires
    this.growFires(currentTick);

    // Dispatch firefighters
    this.dispatchFirefighters();

    // Process fighting firefighters
    this.processFighting(currentTick);
  }

  private spawnFirefighters(): void {
    const buildings = this.db.buildings.getAllBuildings();
    const stations = buildings.filter(b => b.type === 'fire_station' && b.constructionProgress >= 100);

    for (const station of stations) {
      const existing = this.db.firefighters.getFirefightersByStation(station.id);
      const staffCount = CITY_SERVICES.STAFF.fire_station;

      if (existing.length < staffCount) {
        const parcel = this.db.parcels.getParcelById(station.parcelId);
        if (!parcel) continue;

        const toSpawn = staffCount - existing.length;
        for (let i = 0; i < toSpawn; i++) {
          const name = FIREFIGHTER_NAMES[Math.floor(Math.random() * FIREFIGHTER_NAMES.length)];
          this.db.firefighters.createFirefighter(station.id, name, parcel.x, parcel.y);
        }
        console.log(`[Fire] Spawned ${toSpawn} firefighters at station ${station.name}`);
      }
    }
  }

  private generateFires(currentTick: number): void {
    const buildings = this.db.buildings.getAllBuildings();
    const completedBuildings = buildings.filter(b =>
      b.constructionProgress >= 100 &&
      !['road', 'park', 'plaza'].includes(b.type)
    );

    // Very low chance per building per 10-tick interval
    const fireChance = 0.00005; // ~0.005% per building per check

    for (const building of completedBuildings) {
      // Check if building already on fire
      const activeFires = this.db.fires.getActiveFires();
      const alreadyOnFire = activeFires.some(f => f.buildingId === building.id);
      if (alreadyOnFire) continue;

      // Electrical fires more likely in powered buildings with high power usage
      let chance = fireChance;
      if (building.powered && building.powerRequired > 1000) {
        chance *= 1.5;
      }
      // Factories/industrial have higher fire risk
      if (building.type === 'factory' || building.type === 'industrial') {
        chance *= 2.0;
      }

      if (Math.random() < chance) {
        const parcel = this.db.parcels.getParcelById(building.parcelId);
        if (!parcel) continue;

        const cause = building.powered ? 'electrical' : 'accident';
        this.db.fires.createFire(building.id, parcel.id, cause, currentTick);
        console.log(`[Fire] ${cause} fire started at ${building.name} (${parcel.x},${parcel.y})`);
        this.log?.('fire_started', `${cause} fire at ${building.name} (${parcel.x},${parcel.y})`, {
          cause, buildingId: building.id, buildingName: building.name, x: parcel.x, y: parcel.y,
        });
      }
    }
  }

  private growFires(currentTick: number): void {
    const activeFires = this.db.fires.getActiveFires();

    for (const fire of activeFires) {
      // Grow intensity
      const newIntensity = Math.min(5, fire.intensity + FIRE.INTENSITY_GROWTH_RATE * 10);
      if (Math.floor(newIntensity) > fire.intensity) {
        this.db.fires.updateIntensity(fire.id, Math.floor(newIntensity));
        console.log(`[Fire] Fire at building ${fire.buildingId} grew to intensity ${Math.floor(newIntensity)}`);
      }

      // At intensity 5, building is destroyed
      if (fire.intensity >= FIRE.TOTAL_DESTRUCTION_INTENSITY) {
        const building = this.db.buildings.getBuilding(fire.buildingId);
        if (building) {
          const parcel = this.db.parcels.getParcelById(building.parcelId);
          console.log(`[Fire] Building ${building.name} DESTROYED by fire!`);
          this.log?.('building_destroyed', `${building.name} destroyed by fire!`, {
            buildingId: building.id, buildingName: building.name, x: parcel?.x, y: parcel?.y,
          });
          // Delete associated rental units
          // Then delete the building
          this.db.buildings.deleteBuilding(building.id);
          this.db.fires.extinguishFire(fire.id, currentTick);
        }
        continue;
      }

      // Check for fire spread to adjacent buildings
      const spreadChance = (FIRE.BASE_SPREAD_CHANCE + FIRE.SPREAD_CHANCE_PER_INTENSITY * fire.intensity) / 100;
      if (Math.random() < spreadChance * 0.1) { // Per 10 ticks
        this.trySpread(fire, currentTick);
      }
    }
  }

  private trySpread(fire: { buildingId: string; parcelId: string }, currentTick: number): void {
    const parcel = this.db.parcels.getParcelById(fire.parcelId);
    if (!parcel) return;

    // Check adjacent parcels for buildings
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;

        const adjParcel = this.db.parcels.getParcel(parcel.x + dx, parcel.y + dy);
        if (!adjParcel) continue;

        const adjBuilding = this.db.buildings.getBuildingAtParcel(adjParcel.id);
        if (!adjBuilding || adjBuilding.type === 'road') continue;

        // Check if already on fire
        const existingFires = this.db.fires.getActiveFires();
        if (existingFires.some(f => f.buildingId === adjBuilding.id)) continue;

        // Fire spreads!
        this.db.fires.createFire(adjBuilding.id, adjParcel.id, 'spread', currentTick);
        console.log(`[Fire] Fire spread to ${adjBuilding.name} at (${adjParcel.x},${adjParcel.y})`);
        this.log?.('fire_spread', `Fire spread to ${adjBuilding.name} (${adjParcel.x},${adjParcel.y})`, {
          buildingId: adjBuilding.id, buildingName: adjBuilding.name, x: adjParcel.x, y: adjParcel.y,
        });
        return; // Only spread to one building per tick
      }
    }
  }

  private dispatchFirefighters(): void {
    const activeFires = this.db.fires.getActiveFires();
    if (activeFires.length === 0) return;

    const availableFF = this.db.firefighters.getAvailableFirefighters();
    if (availableFF.length === 0) return;

    // Only dispatch to fires that don't already have a firefighter
    const allFF = this.db.firefighters.getAllFirefighters();
    const assignedFireIds = new Set(allFF.filter(f => f.assignedFireId).map(f => f.assignedFireId));

    for (const fire of activeFires) {
      if (assignedFireIds.has(fire.id)) continue;
      if (availableFF.length === 0) break;

      const fireParcel = this.db.parcels.getParcelById(fire.parcelId);
      if (!fireParcel) continue;

      // Find nearest available firefighter
      let nearest = availableFF[0];
      let nearestDist = Infinity;

      for (const ff of availableFF) {
        const dist = Math.abs(ff.currentLocation.x - fireParcel.x) +
                     Math.abs(ff.currentLocation.y - fireParcel.y);
        if (dist < nearestDist) {
          nearest = ff;
          nearestDist = dist;
        }
      }

      this.db.firefighters.assignToFire(nearest.id, fire.id);
      const idx = availableFF.indexOf(nearest);
      if (idx >= 0) availableFF.splice(idx, 1);

      console.log(`[Fire] ${nearest.name} dispatched to fire at building ${fire.buildingId}`);
    }
  }

  private processFighting(currentTick: number): void {
    const allFF = this.db.firefighters.getAllFirefighters();
    const respondingFF = allFF.filter(f => f.status === 'responding' || f.status === 'fighting');

    for (const ff of respondingFF) {
      if (!ff.assignedFireId) continue;

      const fire = this.db.fires.getFire(ff.assignedFireId);
      if (!fire || fire.status !== 'burning') {
        // Fire is out, return to available
        this.db.firefighters.setAvailable(ff.id);
        continue;
      }

      const fireParcel = this.db.parcels.getParcelById(fire.parcelId);
      if (!fireParcel) continue;

      const dx = fireParcel.x - ff.currentLocation.x;
      const dy = fireParcel.y - ff.currentLocation.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= FIRE.RESPONSE_SPEED) {
        // At fire location - fight it
        this.db.firefighters.updatePosition(ff.id, fireParcel.x, fireParcel.y);
        this.db.firefighters.setFighting(ff.id);

        // Suppress fire intensity
        const newIntensity = fire.intensity - FIRE.SUPPRESS_RATE;
        if (newIntensity <= 0) {
          // Fire extinguished!
          this.db.fires.extinguishFire(fire.id, currentTick);
          this.db.firefighters.setAvailable(ff.id);
          const building = this.db.buildings.getBuilding(fire.buildingId);
          console.log(`[Fire] ${ff.name} extinguished fire at building ${fire.buildingId}`);
          this.log?.('fire_extinguished', `${ff.name} extinguished fire at ${building?.name || fire.buildingId}`, {
            firefighterName: ff.name, buildingId: fire.buildingId,
          });
        } else {
          this.db.fires.updateIntensity(fire.id, Math.max(1, Math.round(newIntensity)));
        }
      } else {
        // Move toward fire
        const moveX = (dx / dist) * FIRE.RESPONSE_SPEED;
        const moveY = (dy / dist) * FIRE.RESPONSE_SPEED;
        this.db.firefighters.updatePosition(
          ff.id,
          ff.currentLocation.x + moveX,
          ff.currentLocation.y + moveY
        );
      }
    }
  }
}
