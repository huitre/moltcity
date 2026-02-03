// ============================================
// MOLTCITY - Game Configuration & Rules
// ============================================

import type { BuildingType } from '../models/types.js';

// ============================================
// Parcel Limits
// ============================================
export const PARCEL_LIMITS = {
  MAX_PARCELS_PER_USER: 5,
  MAX_PARCELS_PER_ADMIN: 1000, // Admins can have more
};

// ============================================
// Building Type Restrictions
// ============================================

// Buildings that only admins can create (infrastructure)
export const ADMIN_ONLY_BUILDING_TYPES: BuildingType[] = [
  'road',
  'power_plant',
  'water_tower',
  'city_hall',
  'police_station',
  'courthouse',
  'jail',
  'park',
  'plaza',
];

// Buildings that regular users can create
export const USER_BUILDING_TYPES: BuildingType[] = [
  'house',
  'apartment',
  'shop',
  'office',
  'factory',
];

// ============================================
// Building Costs (MOLT currency)
// ============================================
export const BUILDING_COSTS: Record<BuildingType, number> = {
  house: 500,
  apartment: 1000,
  shop: 800,
  office: 1500,
  factory: 3000,
  power_plant: 5000,
  water_tower: 2000,
  road: 100,
  park: 300,
  plaza: 500,
  city_hall: 10000,
  police_station: 3000,
  courthouse: 5000,
  jail: 4000,
};

// ============================================
// Building Limits per User
// ============================================
export const BUILDING_LIMITS: Partial<Record<BuildingType, number>> = {
  house: 3,
  apartment: 2,
  shop: 2,
  office: 2,
  factory: 1,
};

// ============================================
// Helper Functions
// ============================================

// User role type
export type UserRole = 'user' | 'admin' | 'mayor';

export function isAdminOnlyBuilding(type: BuildingType): boolean {
  return ADMIN_ONLY_BUILDING_TYPES.includes(type);
}

export function canUserBuild(type: BuildingType, role: UserRole): boolean {
  // Admins and mayors can build infrastructure
  if (role === 'admin' || role === 'mayor') return true;
  return USER_BUILDING_TYPES.includes(type);
}

export function hasElevatedPrivileges(role: UserRole): boolean {
  return role === 'admin' || role === 'mayor';
}

export function getMaxParcels(role: UserRole): number {
  return hasElevatedPrivileges(role) ? PARCEL_LIMITS.MAX_PARCELS_PER_ADMIN : PARCEL_LIMITS.MAX_PARCELS_PER_USER;
}

export function getBuildingLimit(type: BuildingType, role: UserRole): number {
  if (hasElevatedPrivileges(role)) return 1000;
  return BUILDING_LIMITS[type] ?? 10;
}
