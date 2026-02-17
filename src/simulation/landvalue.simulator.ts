// ============================================
// MOLTCITY - Land Value Simulator
// ============================================
// Runs daily (hour === 1). Calculates land value for each parcel
// based on nearby parks, water, factories, crime, roads, services, etc.

import type { SimulationDb } from './engine.adapter.js';
import { HAPPINESS } from '../config/game.js';
import type { CityTime, Building, Parcel } from '../models/types.js';

export class LandValueSimulator {
  private lastProcessedDay: number = 0;

  constructor(private db: SimulationDb) {}

  simulate(time: CityTime): void {
    if (time.hour !== 1 || this.lastProcessedDay === time.day) return;
    this.lastProcessedDay = time.day;

    console.log(`[LandValue] Recalculating land values for day ${time.day}`);

    const parcels = this.db.parcels.getAllParcels();
    const buildings = this.db.buildings.getAllBuildings();
    const roads = this.db.roads.getAllRoads();

    // Build spatial lookups
    const buildingByParcel = new Map<string, Building>();
    const buildingCoords: { b: Building; x: number; y: number }[] = [];
    for (const b of buildings) {
      buildingByParcel.set(b.parcelId, b);
      const p = this.db.parcels.getParcelById(b.parcelId);
      if (p) buildingCoords.push({ b, x: p.x, y: p.y });
    }

    const roadTiles = new Set<string>();
    for (const r of roads) {
      const p = this.db.parcels.getParcelById(r.parcelId);
      if (p) roadTiles.add(`${p.x},${p.y}`);
    }

    const parcelMap = new Map<string, Parcel>();
    for (const p of parcels) {
      parcelMap.set(`${p.x},${p.y}`, p);
    }

    // Compute bounding box from parcels for distance-to-downtown
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of parcels) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const centerX = parcels.length > 0 ? Math.floor((minX + maxX) / 2) : 25;
    const centerY = parcels.length > 0 ? Math.floor((minY + maxY) / 2) : 25;
    const halfW = parcels.length > 0 ? (maxX - minX) / 2 : 25;
    const halfH = parcels.length > 0 ? (maxY - minY) / 2 : 25;
    const maxDist = Math.sqrt(halfW * halfW + halfH * halfH) || 1;

    const updates: { parcelId: string; value: number }[] = [];

    for (const parcel of parcels) {
      let value = 50; // Base land value

      // Check nearby buildings
      for (const bc of buildingCoords) {
        const dist = Math.abs(bc.x - parcel.x) + Math.abs(bc.y - parcel.y);

        // Parks within radius 5 boost value
        if ((bc.b.type === 'park' || bc.b.type === 'plaza') && dist <= 5) {
          value += 10;
        }

        // Factories/industrial within pollution radius decrease value
        if ((bc.b.type === 'factory' || bc.b.type === 'industrial') && dist <= HAPPINESS.POLLUTION_RADIUS) {
          value -= 10;
        }

        // Police/fire station coverage
        if ((bc.b.type === 'police_station' || bc.b.type === 'fire_station') && dist <= 15) {
          value += 5;
        }
      }

      // Check for water terrain within radius 3
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          const np = parcelMap.get(`${parcel.x + dx},${parcel.y + dy}`);
          if (np && np.terrain === 'water') {
            value += 5;
            break; // Only count once
          }
        }
      }

      // Adjacent to road bonus
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (roadTiles.has(`${parcel.x + dx},${parcel.y + dy}`)) {
            value += 20;
            break;
          }
        }
      }

      // Distance-to-downtown penalty
      const distToCenter = Math.sqrt(
        (parcel.x - centerX) ** 2 + (parcel.y - centerY) ** 2
      );
      const distPenalty = Math.floor((distToCenter / maxDist) * 30);
      value -= distPenalty;

      // Clamp value to reasonable range
      value = Math.max(10, Math.min(300, value));

      if (Math.abs(value - parcel.landValue) >= 1) {
        updates.push({ parcelId: parcel.id, value });
      }
    }

    if (updates.length > 0) {
      this.db.parcels.updateLandValues(updates);
      console.log(`[LandValue] Updated ${updates.length} parcel land values`);
    }
  }
}
