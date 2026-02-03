// ============================================
// MOLTCITY - Game Configuration & Rules
// ============================================

import type { BuildingType } from '../models/types.js';

// ============================================
// Currency
// ============================================
export const CURRENCY = {
  NAME: '$CITY',
  SYMBOL: '$',
  STARTING_BALANCE: 1000,
};

// ============================================
// Parcel Limits
// ============================================
export const PARCEL_LIMITS = {
  FREE_PARCELS_PER_USER: 5, // Users get 5 free parcels
  MAX_PARCELS_PER_USER: 100,
  MAX_PARCELS_PER_ADMIN: 1000,
};

// ============================================
// Building Type Restrictions
// ============================================

// Buildings that only mayor/admin can create (infrastructure)
export const MAYOR_ONLY_BUILDING_TYPES: BuildingType[] = [
  'road',
  'power_plant',
  'water_tower',
  'jail',
];

// Infrastructure that mayor can build
export const INFRASTRUCTURE_TYPES = ['power_line', 'water_pipe'] as const;

// Buildings that regular users can create
export const USER_BUILDING_TYPES: BuildingType[] = [
  'house',
  'apartment',
  'shop',
  'office',
  'factory',
];

// ============================================
// Housing Configuration
// ============================================
export const HOUSING = {
  // Costs per floor count
  FLOOR_COSTS: {
    1: 250,
    2: 600,
    3: 900,
  } as Record<number, number>,
  // Upgrade costs are the same as construction
  UPGRADE_COST_MULTIPLIER: 1,
  // Flats per floor
  FLATS_PER_FLOOR: 3,
  // Max floors for houses
  MAX_FLOORS: 3,
};

// ============================================
// Building Costs ($CITY currency)
// ============================================
export const BUILDING_COSTS: Record<string, number> = {
  // User buildings - base cost (housing uses FLOOR_COSTS instead)
  house: 250, // Base price for 1 floor
  apartment: 400,
  shop: 500,
  office: 800,
  factory: 2000,
  // Mayor/Infrastructure buildings
  road: 25,
  power_line: 10,
  water_pipe: 10,
  power_plant: 500,
  water_tower: 300,
  jail: 1000,
  // Special buildings
  park: 200,
  plaza: 300,
  city_hall: 5000,
  police_station: 1500,
  courthouse: 2500,
};

// ============================================
// Building Limits per User
// ============================================
export const BUILDING_LIMITS: Partial<Record<BuildingType, number>> = {
  house: 5,
  apartment: 3,
  shop: 3,
  office: 3,
  factory: 2,
};

// ============================================
// Shop Income Configuration
// ============================================
export const SHOP_INCOME = {
  MIN_DAILY: 10,
  MAX_DAILY: 25,
};

// ============================================
// Office & Employment Configuration
// ============================================
export const OFFICE = {
  // Jobs per office
  JOBS_PER_OFFICE: 10,
  // Salary range (randomized per person, not per day)
  SALARY: {
    MIN: 20,
    MAX: 50,
  },
  // Election bonus per office owned
  ELECTION_BONUS_PER_OFFICE: 5, // % bonus votes
};

// ============================================
// Rental Configuration
// ============================================
export const RENTAL = {
  // Base rent suggestions by building type
  SUGGESTED_RENT: {
    house: 30,
    apartment: 25,
  } as Partial<Record<BuildingType, number>>,
  // High rent penalty: if rent > population_average * threshold, less likely to rent
  HIGH_RENT_THRESHOLD: 1.5,
  // Chance reduction per % over threshold
  RENT_PENALTY_PER_PERCENT: 2,
};

// ============================================
// Mayor & Election Configuration
// ============================================
export const MAYOR = {
  // Election cycle
  ELECTION_INTERVAL_DAYS: 90, // 3 months
  // Campaign fee to run for mayor
  CAMPAIGN_FEE: 500,
  // Tax limits
  MAX_TAX_RATE: 10, // 10% maximum
  MIN_TAX_RATE: 0,
  DEFAULT_TAX_RATE: 5,
};

// ============================================
// Traffic Configuration
// ============================================
export const TRAFFIC = {
  VEHICLE_MULTIPLIER: 0.2,
  RUSH_HOUR_MULTIPLIER: 2,
  NIGHT_MULTIPLIER: 0.2,
  RUSH_HOURS: {
    morning: { start: 7, end: 9 },
    evening: { start: 17, end: 19 },
  },
  NIGHT_HOURS: { start: 22, end: 5 },
};

// ============================================
// Pedestrian Configuration
// ============================================
export const PEDESTRIANS = {
  BASE_COUNT: 30,
  COMMERCIAL_MULTIPLIER: 1.5,
  NIGHT_MULTIPLIER: 0.3,
  SPEED: 0.2,
};

// ============================================
// Legacy exports for backward compatibility
// ============================================
export const ECONOMY = {
  STARTING_BALANCE: CURRENCY.STARTING_BALANCE,
  RENT_MULTIPLIER: 1,
  DAILY_RENT: RENTAL.SUGGESTED_RENT,
};

export const BUILDING_JOBS: Partial<Record<BuildingType, { count: number; salary: number }>> = {
  shop: { count: 3, salary: (SHOP_INCOME.MIN_DAILY + SHOP_INCOME.MAX_DAILY) / 2 },
  office: { count: OFFICE.JOBS_PER_OFFICE, salary: (OFFICE.SALARY.MIN + OFFICE.SALARY.MAX) / 2 },
  factory: { count: 20, salary: 40 },
};

export const ADMIN_ONLY_BUILDING_TYPES = MAYOR_ONLY_BUILDING_TYPES;

// ============================================
// Helper Functions
// ============================================

export type UserRole = 'user' | 'admin' | 'mayor';

export function isAdminOnlyBuilding(type: BuildingType): boolean {
  return MAYOR_ONLY_BUILDING_TYPES.includes(type);
}

export function canUserBuild(type: BuildingType, role: UserRole): boolean {
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

/**
 * Get housing cost based on number of floors
 */
export function getHousingCost(floors: number): number {
  return HOUSING.FLOOR_COSTS[floors] ?? HOUSING.FLOOR_COSTS[1] * floors;
}

/**
 * Get random shop daily income
 */
export function getShopDailyIncome(): number {
  return Math.floor(Math.random() * (SHOP_INCOME.MAX_DAILY - SHOP_INCOME.MIN_DAILY + 1)) + SHOP_INCOME.MIN_DAILY;
}

/**
 * Get random salary for a new employee (fixed per person)
 */
export function getRandomSalary(): number {
  return Math.floor(Math.random() * (OFFICE.SALARY.MAX - OFFICE.SALARY.MIN + 1)) + OFFICE.SALARY.MIN;
}

/**
 * Calculate rent attractiveness (0-100)
 * Higher rent with low population = less attractive
 */
export function calculateRentAttractiveness(rent: number, averageRent: number, populationDemand: number): number {
  if (rent <= averageRent) return 100;

  const percentOver = ((rent - averageRent) / averageRent) * 100;
  const penalty = percentOver * RENTAL.RENT_PENALTY_PER_PERCENT;
  const demandBonus = Math.min(populationDemand * 10, 50); // High demand increases attractiveness

  return Math.max(0, Math.min(100, 100 - penalty + demandBonus));
}

/**
 * Calculate parcel purchase cost based on number of parcels already owned
 * First 5 parcels are free, then 100$ * number of parcels owned
 */
export function getParcelCost(parcelsOwned: number): number {
  if (parcelsOwned < PARCEL_LIMITS.FREE_PARCELS_PER_USER) {
    return 0; // Free parcels
  }
  return 100 * parcelsOwned;
}

/**
 * Get building cost by type (uses FLOOR_COSTS for housing)
 */
export function getBuildingCost(type: BuildingType, floors: number = 1): number {
  // Housing uses floor-based pricing
  if (type === 'house' || type === 'apartment') {
    return getHousingCost(floors);
  }
  // Other buildings use flat cost from config
  return BUILDING_COSTS[type] ?? 500;
}
