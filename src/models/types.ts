// ============================================
// MOLTCITY - Core Type Definitions
// ============================================

// === Coordinates & Grid ===
export interface Coordinate {
  x: number;
  y: number;
}

export type TerrainType = 'land' | 'water' | 'hill';
export type ZoningType = 'residential' | 'commercial' | 'industrial' | 'municipal' | 'park';

// === Parcel (Land Unit) ===
export interface Parcel {
  id: string;
  x: number;
  y: number;
  terrain: TerrainType;
  zoning: ZoningType | null;
  ownerId: string | null;
  purchasePrice: number | null;
  purchaseDate: number | null; // Unix timestamp
}

// === Buildings ===
export type BuildingType =
  | 'house'
  | 'apartment'
  | 'shop'
  | 'office'
  | 'factory'
  | 'power_plant'
  | 'water_tower'
  | 'road'
  | 'park'
  | 'plaza'
  | 'city_hall';

export interface Building {
  id: string;
  parcelId: string;
  type: BuildingType;
  name: string;
  sprite: string; // URL to isometric asset
  width: number;  // in parcels
  height: number; // in parcels
  floors: number; // number of stacked floors (affects appearance and cost)
  powerRequired: number;  // watts
  waterRequired: number;  // liters/tick
  powered: boolean;
  hasWater: boolean;
  operational: boolean;
  builtAt: number; // Unix timestamp
  ownerId: string;
}

// === Infrastructure: Roads ===
export type RoadDirection = 'horizontal' | 'vertical' | 'intersection' | 'corner_ne' | 'corner_nw' | 'corner_se' | 'corner_sw';

export interface Road {
  id: string;
  parcelId: string;
  direction: RoadDirection;
  lanes: number;
  trafficLoad: number; // 0.0 to 1.0
  speedLimit: number;
}

// === Infrastructure: Power Grid ===
export interface PowerPlant {
  id: string;
  buildingId: string;
  capacity: number; // watts
  currentOutput: number;
  fuelType: 'coal' | 'gas' | 'solar' | 'nuclear' | 'wind';
}

export interface PowerLine {
  id: string;
  from: Coordinate;
  to: Coordinate;
  capacity: number;
  load: number;
}

export interface PowerGrid {
  plants: PowerPlant[];
  lines: PowerLine[];
  totalCapacity: number;
  totalDemand: number;
  distribution: Map<string, boolean>; // parcelId -> hasPower
}

// === Infrastructure: Water ===
export interface WaterTower {
  id: string;
  buildingId: string;
  capacity: number;
  currentLevel: number;
}

export interface WaterPipe {
  id: string;
  from: Coordinate;
  to: Coordinate;
  capacity: number;
  flow: number;
}

// === Agents (Citizens) ===
export type AgentState = 'idle' | 'traveling' | 'working' | 'shopping' | 'sleeping' | 'socializing';

export interface DailySchedule {
  wakeUp: number;    // hour (0-23)
  workStart: number;
  workEnd: number;
  sleepTime: number;
}

export interface Agent {
  id: string;
  name: string;
  avatar: string; // URL to sprite
  home: string | null; // buildingId
  work: string | null; // buildingId
  currentLocation: Coordinate;
  destination: Coordinate | null;
  path: Coordinate[];
  state: AgentState;
  schedule: DailySchedule;
  wallet: {
    balance: number;
    currency: 'MOLT' | 'USD';
  };
  moltbookId: string | null; // Link to Moltbook account
  createdAt: number;
}

// === Vehicles ===
export type VehicleType = 'car' | 'bus' | 'truck' | 'taxi';

export interface Vehicle {
  id: string;
  ownerId: string;
  type: VehicleType;
  position: Coordinate;
  destination: Coordinate | null;
  path: Coordinate[];
  speed: number; // parcels per tick
  sprite: string;
}

// === City State ===
export interface CityTime {
  tick: number;
  hour: number;   // 0-23
  day: number;    // 1-365
  year: number;
  isDaylight: boolean;
}

export interface CityStats {
  population: number;
  totalBuildings: number;
  totalRoads: number;
  powerCapacity: number;
  powerDemand: number;
  waterCapacity: number;
  waterDemand: number;
  treasury: number;
}

export interface City {
  id: string;
  name: string;
  gridWidth: number;
  gridHeight: number;
  time: CityTime;
  stats: CityStats;
  mayor: string | null; // agentId
}

// === Events ===
export type CityEventType =
  | 'agent_moved'
  | 'building_placed'
  | 'parcel_purchased'
  | 'power_outage'
  | 'building_powered'
  | 'agent_arrived'
  | 'day_started'
  | 'night_started';

export interface CityEvent {
  type: CityEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

// === API Types ===
export interface PurchaseRequest {
  agentId: string;
  parcelId: string;
  price: number;
  currency: 'MOLT' | 'USD';
}

export interface BuildRequest {
  agentId: string;
  parcelId: string;
  buildingType: BuildingType;
  name: string;
  sprite?: string;
}

export interface MoveAgentRequest {
  agentId: string;
  destination: Coordinate;
}
