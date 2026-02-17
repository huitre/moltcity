// ============================================
// MOLTCITY - Vehicle Repository
// ============================================

import { eq } from 'drizzle-orm';
import { BaseRepository } from './base.repository.js';
import { vehicles, type VehicleRow, type VehicleInsert } from '../db/schema/vehicles.js';
import type { DrizzleDb } from '../db/drizzle.js';
import type { Vehicle, VehicleType, Coordinate } from '../models/types.js';

export class VehicleRepository extends BaseRepository<typeof vehicles, VehicleRow, VehicleInsert> {
  constructor(db: DrizzleDb) {
    super(db, vehicles);
  }

  async getVehicle(id: string): Promise<Vehicle | null> {
    const result = await this.findById(id, vehicles.id);
    return result ? this.rowToVehicle(result) : null;
  }

  async getVehiclesByOwner(ownerId: string): Promise<Vehicle[]> {
    const results = await this.db
      .select()
      .from(vehicles)
      .where(eq(vehicles.ownerId, ownerId));
    return results.map(row => this.rowToVehicle(row));
  }

  async getAllVehicles(cityId?: string): Promise<Vehicle[]> {
    if (!cityId) return [];
    const results = await this.db.select().from(vehicles).where(eq(vehicles.cityId, cityId));
    return results.map(row => this.rowToVehicle(row));
  }

  async createVehicle(ownerId: string, type: VehicleType, x: number, y: number, cityId?: string): Promise<Vehicle> {
    const id = this.generateId();
    await this.db.insert(vehicles).values({
      id,
      ownerId,
      type,
      positionX: x,
      positionY: y,
      cityId: cityId || null,
    });
    return (await this.getVehicle(id))!;
  }

  async updatePosition(vehicleId: string, x: number, y: number): Promise<void> {
    await this.db
      .update(vehicles)
      .set({ positionX: x, positionY: y })
      .where(eq(vehicles.id, vehicleId));
  }

  async setDestination(vehicleId: string, x: number, y: number, path: Coordinate[]): Promise<void> {
    await this.db
      .update(vehicles)
      .set({
        destinationX: x,
        destinationY: y,
        path: JSON.stringify(path),
      })
      .where(eq(vehicles.id, vehicleId));
  }

  async clearDestination(vehicleId: string): Promise<void> {
    await this.db
      .update(vehicles)
      .set({
        destinationX: null,
        destinationY: null,
        path: null,
      })
      .where(eq(vehicles.id, vehicleId));
  }

  async updateSprite(vehicleId: string, sprite: string): Promise<void> {
    await this.db
      .update(vehicles)
      .set({ sprite })
      .where(eq(vehicles.id, vehicleId));
  }

  async deleteVehicle(vehicleId: string): Promise<boolean> {
    return this.deleteById(vehicleId, vehicles.id);
  }

  private rowToVehicle(row: VehicleRow): Vehicle {
    return {
      id: row.id,
      ownerId: row.ownerId,
      type: row.type as VehicleType,
      position: { x: row.positionX, y: row.positionY },
      destination: row.destinationX != null && row.destinationY != null
        ? { x: row.destinationX, y: row.destinationY }
        : null,
      path: row.path ? JSON.parse(row.path) : [],
      speed: row.speed,
      sprite: row.sprite || '',
    };
  }
}
