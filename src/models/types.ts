// ============================================
// MOLTCITY - Core Type Definitions
// ============================================

// === Coordinates & Grid ===
export interface Coordinate {
  x: number;
  y: number;
}

export type TerrainType = 'land' | 'water' | 'hill';
export type ZoningType = 'residential' | 'office' | 'industrial' | 'municipal' | 'park' | 'suburban';

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
  landValue: number; // land value score (affects zone evolution)
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
  | 'jail'
  // Zone types
  | 'residential'
  | 'offices'
  | 'suburban'
  | 'industrial'
  // New service buildings
  | 'fire_station'
  | 'school'
  | 'high_school'
  | 'university'
  | 'hospital'
  | 'garbage_depot'
  // Landmarks
  | 'stadium'
  | 'theater'
  | 'library'
  | 'monument'
  | 'amusement_park';

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
  density: number; // zone density level (1-3)
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
export type VehicleType = 
  | 'car'          // Civilian commute
  | 'bus'          // Public transit
  | 'truck'        // Delivery/logistics
  | 'taxi'         // For-hire transport
  | 'police_car'   // Crime response
  | 'ambulance'    // Health emergencies
  | 'fire_truck'   // Fire response
  | 'garbage_truck'; // Sanitation

export interface Vehicle {
  id: string;
  ownerId: string;
  type: VehicleType;
  position: Coordinate;
  destination: Coordinate | null;
  path: Coordinate[];
  speed: number; // parcels per tick
  sprite: string;
  assignedTo?: string; // For service vehicles: crimeId, fireId, etc.
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

// === Economy Types ===
export interface Bond {
  id: string;
  amount: number;
  rate: number; // annual interest %
  issuedDay: number;
  issuedYear: number;
}

export interface DepartmentFunding {
  police: number;   // 0-100%
  fire: number;
  health: number;
  education: number;
  transit: number;
}

export interface BudgetYtd {
  revenues: {
    propertyTaxR: number;
    propertyTaxC: number;
    propertyTaxI: number;
    ordinances: number;
  };
  expenses: {
    police: number;
    fire: number;
    health: number;
    education: number;
    transit: number;
    bondInterest: number;
  };
}

export interface CityEconomy {
  taxRateR: number;
  taxRateC: number;
  taxRateI: number;
  ordinances: string[];
  bonds: Bond[];
  departmentFunding: DepartmentFunding;
  budgetYtd: BudgetYtd;
  creditRating: string;
}

export interface City {
  id: string;
  name: string;
  createdBy: string | null;
  time: CityTime;
  stats: CityStats;
  economy: CityEconomy;
  mayor: string | null; // userId
}

// === Events ===
export type CityEventType =
  | 'agent_moved'
  | 'building_placed'
  | 'buildings_updated'
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

// === Crime & Public Safety ===
export type CrimeType = 
  | 'theft'        // Steals from shops/homes (small loss)
  | 'robbery'      // Armed theft (larger loss)
  | 'vandalism'    // Damages buildings (repair cost)
  | 'arson';       // Can start fires!

export type CrimeStatus = 'active' | 'responding' | 'resolved' | 'unsolved';

export interface Crime {
  id: string;
  type: CrimeType;
  location: Coordinate;
  parcelId: string;
  victimId: string | null;      // Agent or building owner affected
  buildingId: string | null;    // Target building
  damageAmount: number;         // Economic damage
  reportedAt: number;           // Tick when crime occurred
  resolvedAt: number | null;    // Tick when resolved
  respondingOfficerId: string | null;
  status: CrimeStatus;
}

export type OfficerStatus = 'available' | 'patrolling' | 'responding' | 'arresting';

export interface PoliceOfficer {
  id: string;
  stationId: string;           // Police station building id
  name: string;
  currentLocation: Coordinate;
  status: OfficerStatus;
  assignedCrimeId: string | null;
  patrolRoute: Coordinate[];   // Patrol path
}

// === Fire System ===
export type FireIntensity = 1 | 2 | 3 | 4 | 5;
export type FireStatus = 'burning' | 'contained' | 'extinguished';

export interface Fire {
  id: string;
  buildingId: string;
  parcelId: string;
  intensity: FireIntensity;
  spreadChance: number;        // 0-100, affected by wind, materials
  startedAt: number;           // Tick when fire started
  containedAt: number | null;
  extinguishedAt: number | null;
  status: FireStatus;
  cause: 'arson' | 'electrical' | 'accident' | 'spread';
}

export type FirefighterStatus = 'available' | 'responding' | 'fighting' | 'returning';

export interface Firefighter {
  id: string;
  stationId: string;
  name: string;
  currentLocation: Coordinate;
  status: FirefighterStatus;
  assignedFireId: string | null;
  truckId: string | null;      // Vehicle id
}

// === Education ===
export type SchoolType = 'elementary' | 'high_school' | 'university';

export interface School {
  id: string;
  buildingId: string;
  schoolType: SchoolType;
  capacity: number;
  enrolledCount: number;
  educationBonus: number;      // +education per day of attendance
}

// === Sanitation ===
export interface GarbageDepot {
  id: string;
  buildingId: string;
  truckCount: number;
  collectionRoutes: Coordinate[][];
}

// === Agent Needs (Sims-style) ===
export interface AgentNeeds {
  hunger: number;      // 0-100, decays over time
  energy: number;      // 0-100, restored by sleep
  social: number;      // 0-100, restored by visiting public places
  fun: number;         // 0-100, restored by parks/entertainment
  comfort: number;     // 0-100, based on housing quality
  safety: number;      // 0-100, based on crime in area
}

// === Life Events ===
export type LifeEventType = 
  | 'got_raise'
  | 'got_fired'
  | 'had_baby'
  | 'got_married'
  | 'won_lottery'
  | 'got_robbed'
  | 'car_broke_down'
  | 'promotion'
  | 'moved_in'
  | 'moved_out';

export interface LifeEvent {
  id: string;
  agentId: string;
  type: LifeEventType;
  description: string;
  effectAmount: number;       // Economic or stat change
  occurredAt: number;         // Tick
}

// === City Services Coverage ===
export interface ServiceCoverage {
  police: Map<string, number>;    // parcelId -> coverage level (0-100)
  fire: Map<string, number>;
  education: Map<string, number>;
  sanitation: Map<string, number>;
}

// === Happiness ===
export interface HappinessFactors {
  employment: number;      // 0-100
  housing: number;         // 0-100
  safety: number;          // 0-100
  services: number;        // 0-100
  education: number;       // 0-100
  entertainment: number;   // 0-100
  commute: number;         // 0-100
  overall: number;         // Weighted average
}
