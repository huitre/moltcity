// ============================================
// MOLTCITY - Simulation Engine
// ============================================

import { EventEmitter } from 'events';
import type { Agent, Vehicle, Building, CityEvent, CityEventType, Coordinate, City, CityTime } from '../models/types.js';
import { DatabaseManager } from '../models/database.js';
import { Pathfinder, WalkingPathfinder } from './pathfinding.js';

// ============================================
// Configuration
// ============================================

const TICK_INTERVAL_MS = 100;          // How often the simulation updates (100ms = 10 ticks/second)
const TICKS_PER_MINUTE = 10;            // 10 ticks = 1 in-game minute
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

const AGENT_WALK_SPEED = 0.5;           // Parcels per tick
const VEHICLE_BASE_SPEED = 2.0;         // Parcels per tick

// ============================================
// Power Grid Simulation
// ============================================

export class PowerGridSimulator {
  constructor(private db: DatabaseManager) {}

  /**
   * Distribute power from plants to buildings
   * Returns map of buildingId -> hasPower
   */
  simulate(): Map<string, boolean> {
    const buildings = this.db.buildings.getAllBuildings();
    const powerStatus = new Map<string, boolean>();

    // Calculate total power capacity (from power plants)
    let totalCapacity = 0;
    const powerPlants = buildings.filter(b => b.type === 'power_plant');
    for (const plant of powerPlants) {
      // Each power plant produces 10000 watts
      totalCapacity += 10000;
    }

    // Calculate total power demand
    let totalDemand = 0;
    for (const building of buildings) {
      if (building.type !== 'power_plant') {
        totalDemand += building.powerRequired;
      }
    }

    // If we have enough power, everyone gets power
    // Otherwise, we ration (could implement priority-based distribution later)
    const hasEnoughPower = totalCapacity >= totalDemand;

    for (const building of buildings) {
      if (building.type === 'power_plant') {
        powerStatus.set(building.id, true); // Plants are always "powered"
      } else {
        powerStatus.set(building.id, hasEnoughPower);
      }
    }

    return powerStatus;
  }

  /**
   * Apply power status to buildings in database
   */
  applyPowerStatus(status: Map<string, boolean>): void {
    for (const [buildingId, powered] of status) {
      this.db.buildings.updatePowerStatus(buildingId, powered);
    }
  }
}

// ============================================
// Agent Behavior Simulator
// ============================================

export class AgentSimulator {
  private pathfinder: Pathfinder;
  private walkingPathfinder: WalkingPathfinder;

  constructor(
    private db: DatabaseManager,
    gridWidth: number,
    gridHeight: number
  ) {
    const roads = this.db.roads.getAllRoads();
    this.pathfinder = new Pathfinder(roads, gridWidth, gridHeight);
    this.walkingPathfinder = new WalkingPathfinder(gridWidth, gridHeight);
  }

  /**
   * Update all agents for one tick
   */
  simulate(time: CityTime): CityEvent[] {
    const events: CityEvent[] = [];
    const agents = this.db.agents.getAllAgents();

    for (const agent of agents) {
      const agentEvents = this.updateAgent(agent, time);
      events.push(...agentEvents);
    }

    return events;
  }

  private updateAgent(agent: Agent, time: CityTime): CityEvent[] {
    const events: CityEvent[] = [];

    // If agent has a path, move along it
    if (agent.path.length > 0) {
      const nextPoint = agent.path[0];
      const dx = nextPoint.x - agent.currentLocation.x;
      const dy = nextPoint.y - agent.currentLocation.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= AGENT_WALK_SPEED) {
        // Reached the next waypoint
        agent.currentLocation = nextPoint;
        agent.path.shift();

        this.db.agents.updatePosition(agent.id, nextPoint.x, nextPoint.y);

        // If we've reached the destination
        if (agent.path.length === 0) {
          this.db.agents.setDestination(agent.id, 0, 0, []);
          events.push({
            type: 'agent_arrived',
            timestamp: Date.now(),
            data: { agentId: agent.id, location: nextPoint },
          });
        }
      } else {
        // Move towards next waypoint
        const moveX = (dx / distance) * AGENT_WALK_SPEED;
        const moveY = (dy / distance) * AGENT_WALK_SPEED;
        const newX = agent.currentLocation.x + moveX;
        const newY = agent.currentLocation.y + moveY;

        this.db.agents.updatePosition(agent.id, newX, newY);

        events.push({
          type: 'agent_moved',
          timestamp: Date.now(),
          data: { agentId: agent.id, from: agent.currentLocation, to: { x: newX, y: newY } },
        });
      }
    } else {
      // No current path - check if agent should go somewhere based on schedule
      const action = this.decideAction(agent, time);
      if (action) {
        const path = this.walkingPathfinder.findPath(agent.currentLocation, action.destination);
        if (path.length > 0) {
          this.db.agents.setDestination(agent.id, action.destination.x, action.destination.y, path);
          this.db.agents.updateState(agent.id, action.state);
        }
      }
    }

    return events;
  }

  private decideAction(agent: Agent, time: CityTime): { destination: Coordinate; state: Agent['state'] } | null {
    const hour = time.hour;
    const schedule = agent.schedule;

    // Check schedule
    if (hour === schedule.workStart && agent.state !== 'working' && agent.work) {
      const workBuilding = this.db.buildings.getBuilding(agent.work);
      if (workBuilding) {
        const parcel = this.db.parcels.getParcelById(workBuilding.parcelId);
        if (parcel) {
          return { destination: { x: parcel.x, y: parcel.y }, state: 'traveling' };
        }
      }
    }

    if (hour === schedule.workEnd && agent.state === 'working' && agent.home) {
      const homeBuilding = this.db.buildings.getBuilding(agent.home);
      if (homeBuilding) {
        const parcel = this.db.parcels.getParcelById(homeBuilding.parcelId);
        if (parcel) {
          return { destination: { x: parcel.x, y: parcel.y }, state: 'traveling' };
        }
      }
    }

    return null;
  }

  /**
   * Update pathfinder when roads change
   */
  updateRoads(): void {
    const roads = this.db.roads.getAllRoads();
    this.pathfinder.updateRoads(roads);
  }
}

// ============================================
// Vehicle Simulator
// ============================================

export class VehicleSimulator {
  private pathfinder: Pathfinder;

  constructor(
    private db: DatabaseManager,
    gridWidth: number,
    gridHeight: number
  ) {
    const roads = this.db.roads.getAllRoads();
    this.pathfinder = new Pathfinder(roads, gridWidth, gridHeight);
  }

  /**
   * Update all vehicles for one tick
   */
  simulate(): CityEvent[] {
    const events: CityEvent[] = [];
    const vehicles = this.db.vehicles.getAllVehicles();

    for (const vehicle of vehicles) {
      const vehicleEvents = this.updateVehicle(vehicle);
      events.push(...vehicleEvents);
    }

    // Update traffic load on roads based on vehicle positions
    this.updateTraffic(vehicles);

    return events;
  }

  private updateVehicle(vehicle: Vehicle): CityEvent[] {
    const events: CityEvent[] = [];

    if (vehicle.path.length > 0) {
      const nextPoint = vehicle.path[0];
      const dx = nextPoint.x - vehicle.position.x;
      const dy = nextPoint.y - vehicle.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Get road speed limit
      const road = this.db.roads.getRoad(`parcel_${Math.round(vehicle.position.x)}_${Math.round(vehicle.position.y)}`);
      const speedLimit = road ? road.speedLimit / 50 : 1; // Normalize speed
      const actualSpeed = vehicle.speed * speedLimit;

      if (distance <= actualSpeed) {
        vehicle.position = nextPoint;
        vehicle.path.shift();
        this.db.vehicles.updatePosition(vehicle.id, nextPoint.x, nextPoint.y);
      } else {
        const moveX = (dx / distance) * actualSpeed;
        const moveY = (dy / distance) * actualSpeed;
        const newX = vehicle.position.x + moveX;
        const newY = vehicle.position.y + moveY;
        this.db.vehicles.updatePosition(vehicle.id, newX, newY);
      }
    }

    return events;
  }

  private updateTraffic(vehicles: Vehicle[]): void {
    // Count vehicles on each road segment
    const trafficCount = new Map<string, number>();

    for (const vehicle of vehicles) {
      const parcelId = `parcel_${Math.round(vehicle.position.x)}_${Math.round(vehicle.position.y)}`;
      trafficCount.set(parcelId, (trafficCount.get(parcelId) || 0) + 1);
    }

    // Update road traffic loads
    const roads = this.db.roads.getAllRoads();
    for (const road of roads) {
      const count = trafficCount.get(road.parcelId) || 0;
      const load = Math.min(count / road.lanes, 1); // Normalize to 0-1
      this.db.roads.updateTrafficLoad(road.id, load);
    }
  }

  updateRoads(): void {
    const roads = this.db.roads.getAllRoads();
    this.pathfinder.updateRoads(roads);
  }
}

// ============================================
// Main Simulation Engine
// ============================================

export class SimulationEngine extends EventEmitter {
  private db: DatabaseManager;
  private powerGrid: PowerGridSimulator;
  private agentSimulator: AgentSimulator;
  private vehicleSimulator: VehicleSimulator;
  private running: boolean = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private currentTick: number = 0;

  constructor(db: DatabaseManager, gridWidth: number, gridHeight: number) {
    super();
    this.db = db;
    this.powerGrid = new PowerGridSimulator(db);
    this.agentSimulator = new AgentSimulator(db, gridWidth, gridHeight);
    this.vehicleSimulator = new VehicleSimulator(db, gridWidth, gridHeight);
  }

  /**
   * Start the simulation loop
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    this.emit('started');
    console.log('[SimulationEngine] Started');
  }

  /**
   * Stop the simulation loop
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.emit('stopped');
    console.log('[SimulationEngine] Stopped');
  }

  /**
   * Execute one simulation tick
   */
  private tick(): void {
    this.currentTick++;
    const events: CityEvent[] = [];

    // Update city time
    const time = this.updateTime();

    // Simulate power grid (every 10 ticks / 1 minute)
    if (this.currentTick % 10 === 0) {
      const powerStatus = this.powerGrid.simulate();
      this.powerGrid.applyPowerStatus(powerStatus);
    }

    // Simulate agents
    const agentEvents = this.agentSimulator.simulate(time);
    events.push(...agentEvents);

    // Simulate vehicles
    const vehicleEvents = this.vehicleSimulator.simulate();
    events.push(...vehicleEvents);

    // Emit tick event with all changes
    this.emit('tick', {
      tick: this.currentTick,
      time,
      events,
    });

    // Check for day/night transitions
    if (time.hour === 6 && this.currentTick % (TICKS_PER_MINUTE * MINUTES_PER_HOUR) === 0) {
      this.emit('day_started', time);
    }
    if (time.hour === 20 && this.currentTick % (TICKS_PER_MINUTE * MINUTES_PER_HOUR) === 0) {
      this.emit('night_started', time);
    }
  }

  /**
   * Update and return current city time
   */
  private updateTime(): CityTime {
    const city = this.db.city.getCity();
    if (!city) {
      return { tick: 0, hour: 8, day: 1, year: 1, isDaylight: true };
    }

    let { tick, hour, day, year } = city.time;
    tick = this.currentTick;

    // Calculate time from ticks
    const totalMinutes = Math.floor(this.currentTick / TICKS_PER_MINUTE);
    hour = (8 + Math.floor(totalMinutes / MINUTES_PER_HOUR)) % HOURS_PER_DAY; // Start at 8am
    const totalHours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
    day = 1 + Math.floor(totalHours / HOURS_PER_DAY);
    year = 1 + Math.floor(day / 365);
    day = ((day - 1) % 365) + 1;

    const isDaylight = hour >= 6 && hour < 20;

    // Update database
    this.db.city.updateTime(tick, hour, day, year);

    return { tick, hour, day, year, isDaylight };
  }

  /**
   * Get current simulation state
   */
  getState() {
    const city = this.db.city.getCity();
    const agents = this.db.agents.getAllAgents();
    const vehicles = this.db.vehicles.getAllVehicles();
    const buildings = this.db.buildings.getAllBuildings();

    return {
      running: this.running,
      tick: this.currentTick,
      city,
      agentCount: agents.length,
      vehicleCount: vehicles.length,
      buildingCount: buildings.length,
    };
  }

  /**
   * Notify engine that roads have changed
   */
  onRoadsChanged(): void {
    this.agentSimulator.updateRoads();
    this.vehicleSimulator.updateRoads();
  }
}
