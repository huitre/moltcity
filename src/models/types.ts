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
  | 'city_hall'
  | 'police_station'
  | 'courthouse'
  | 'jail';

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
  // Construction system
  constructionProgress: number; // 0-100, 100 = complete
  constructionStartedAt: number | null; // tick when construction started
  constructionTimeTicks: number; // total ticks needed to complete
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
export type AgentState = 'idle' | 'traveling' | 'working' | 'shopping' | 'sleeping' | 'socializing' | 'in_jail';

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

// === Rental System ===
export type RentalUnitType = 'residential' | 'commercial';
export type RentalUnitStatus = 'vacant' | 'occupied' | 'reserved';
export type RentWarningStatus = 'pending' | 'paid' | 'escalated';
export type CourtCaseStatus = 'pending' | 'in_progress' | 'closed';
export type CourtVerdict = 'guilty' | 'not_guilty' | 'dismissed';
export type CourtSentence = 'eviction' | 'jail' | 'fine';
export type JailStatus = 'incarcerated' | 'released';

export interface RentalUnit {
  id: string;
  buildingId: string;
  floorNumber: number;
  unitNumber: number; // 1, 2, or 3 per floor
  unitType: RentalUnitType;
  monthlyRent: number;
  tenantId: string | null;
  leaseStart: number | null; // tick when lease started
  status: RentalUnitStatus;
  createdAt: number;
}

export interface RentWarning {
  id: string;
  unitId: string;
  tenantId: string;
  amountOwed: number;
  warningDate: number; // tick when warning issued
  dueDate: number; // tick deadline to pay
  status: RentWarningStatus;
  createdAt: number;
}

export interface CourtCase {
  id: string;
  warningId: string | null;
  defendantId: string;
  plaintiffId: string; // building owner
  caseType: 'rent_nonpayment';
  amount: number;
  hearingDate: number | null; // tick of hearing
  verdict: CourtVerdict | null;
  sentence: CourtSentence | null;
  status: CourtCaseStatus;
  createdAt: number;
}

export interface JailInmate {
  id: string;
  agentId: string;
  caseId: string | null;
  checkIn: number; // tick when incarcerated
  releaseDate: number; // tick when to release
  status: JailStatus;
}

// === Rental API Types ===
export interface CreateRentalUnitsRequest {
  buildingId: string;
  floor: number;
  unitCount: number; // 1-3
  rent: number;
  unitType?: RentalUnitType;
}

export interface SignLeaseRequest {
  agentId: string;
  unitId: string;
}

export interface PayRentRequest {
  agentId: string;
  unitId: string;
}
