// ============================================
// MOLTCITY - Database Tests
// ============================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DatabaseManager } from '../src/models/database.js';

const TEST_DB_PATH = path.join(process.cwd(), 'test-moltcity.db');

describe('DatabaseManager', () => {
  let db: DatabaseManager;

  beforeEach(() => {
    // Remove test database if exists
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_DB_PATH + '-wal')) {
      fs.unlinkSync(TEST_DB_PATH + '-wal');
    }
    if (fs.existsSync(TEST_DB_PATH + '-shm')) {
      fs.unlinkSync(TEST_DB_PATH + '-shm');
    }

    // Override the database path for testing
    process.env.DB_PATH = TEST_DB_PATH;
    db = new DatabaseManager();
  });

  afterEach(() => {
    db.close();
    // Cleanup
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_DB_PATH + '-wal')) {
      fs.unlinkSync(TEST_DB_PATH + '-wal');
    }
    if (fs.existsSync(TEST_DB_PATH + '-shm')) {
      fs.unlinkSync(TEST_DB_PATH + '-shm');
    }
  });

  describe('CityRepository', () => {
    it('should initialize a new city', () => {
      const city = db.city.initializeCity('TestCity', 50, 50);

      expect(city).toBeDefined();
      expect(city.name).toBe('TestCity');
      expect(city.gridWidth).toBe(50);
      expect(city.gridHeight).toBe(50);
    });

    it('should retrieve existing city', () => {
      db.city.initializeCity('TestCity', 100, 100);
      const city = db.city.getCity();

      expect(city).not.toBeNull();
      expect(city?.name).toBe('TestCity');
    });

    it('should update city time', () => {
      db.city.initializeCity('TestCity', 50, 50);
      db.city.updateTime(100, 12, 5, 1);

      const city = db.city.getCity();
      expect(city?.time.tick).toBe(100);
      expect(city?.time.hour).toBe(12);
      expect(city?.time.day).toBe(5);
    });
  });

  describe('ParcelRepository', () => {
    beforeEach(() => {
      db.city.initializeCity('TestCity', 10, 10);
      db.parcels.initializeGrid(10, 10);
    });

    it('should initialize grid with correct number of parcels', () => {
      const parcels = db.parcels.getAllParcels();
      expect(parcels.length).toBe(100); // 10x10
    });

    it('should get parcel by coordinates', () => {
      const parcel = db.parcels.getParcel(5, 5);

      expect(parcel).not.toBeNull();
      expect(parcel?.x).toBe(5);
      expect(parcel?.y).toBe(5);
      expect(parcel?.terrain).toBe('land');
    });

    it('should return null for non-existent parcel', () => {
      const parcel = db.parcels.getParcel(100, 100);
      expect(parcel).toBeNull();
    });

    it('should purchase parcel', () => {
      const parcel = db.parcels.getParcel(3, 3);
      expect(parcel?.ownerId).toBeNull();

      db.parcels.purchaseParcel(parcel!.id, 'agent-123', 100);

      const updated = db.parcels.getParcel(3, 3);
      expect(updated?.ownerId).toBe('agent-123');
      expect(updated?.purchasePrice).toBe(100);
      expect(updated?.purchaseDate).toBeDefined();
    });

    it('should get parcels in range', () => {
      const parcels = db.parcels.getParcelsInRange(2, 2, 4, 4);
      expect(parcels.length).toBe(9); // 3x3
    });

    it('should set zoning', () => {
      const parcel = db.parcels.getParcel(0, 0);
      db.parcels.setZoning(parcel!.id, 'commercial');

      const updated = db.parcels.getParcel(0, 0);
      expect(updated?.zoning).toBe('commercial');
    });
  });

  describe('BuildingRepository', () => {
    beforeEach(() => {
      db.city.initializeCity('TestCity', 10, 10);
      db.parcels.initializeGrid(10, 10);
    });

    it('should create a building', () => {
      const parcel = db.parcels.getParcel(5, 5);
      const building = db.buildings.createBuilding(
        parcel!.id,
        'house',
        'Test House',
        'agent-123'
      );

      expect(building).toBeDefined();
      expect(building.type).toBe('house');
      expect(building.name).toBe('Test House');
      expect(building.ownerId).toBe('agent-123');
      expect(building.powerRequired).toBeGreaterThan(0);
    });

    it('should get building at parcel', () => {
      const parcel = db.parcels.getParcel(5, 5);
      db.buildings.createBuilding(parcel!.id, 'shop', 'Test Shop', 'agent-123');

      const building = db.buildings.getBuildingAtParcel(parcel!.id);
      expect(building).not.toBeNull();
      expect(building?.type).toBe('shop');
    });

    it('should get all buildings', () => {
      const parcel1 = db.parcels.getParcel(1, 1);
      const parcel2 = db.parcels.getParcel(2, 2);

      db.buildings.createBuilding(parcel1!.id, 'house', 'House 1', 'agent-1');
      db.buildings.createBuilding(parcel2!.id, 'office', 'Office 1', 'agent-2');

      const buildings = db.buildings.getAllBuildings();
      expect(buildings.length).toBe(2);
    });

    it('should set correct power requirements by building type', () => {
      const parcel1 = db.parcels.getParcel(1, 1);
      const parcel2 = db.parcels.getParcel(2, 2);

      const house = db.buildings.createBuilding(parcel1!.id, 'house', 'House', 'agent-1');
      const factory = db.buildings.createBuilding(parcel2!.id, 'factory', 'Factory', 'agent-2');

      expect(house.powerRequired).toBe(100);
      expect(factory.powerRequired).toBe(2000);
    });
  });

  describe('RoadRepository', () => {
    beforeEach(() => {
      db.city.initializeCity('TestCity', 10, 10);
      db.parcels.initializeGrid(10, 10);
    });

    it('should create a road', () => {
      const parcel = db.parcels.getParcel(5, 5);
      const road = db.roads.createRoad(parcel!.id, 'horizontal', 2);

      expect(road).toBeDefined();
      expect(road.direction).toBe('horizontal');
      expect(road.lanes).toBe(2);
      expect(road.trafficLoad).toBe(0);
    });

    it('should get road at parcel', () => {
      const parcel = db.parcels.getParcel(3, 3);
      db.roads.createRoad(parcel!.id, 'vertical', 4);

      const road = db.roads.getRoad(parcel!.id);
      expect(road).not.toBeNull();
      expect(road?.lanes).toBe(4);
    });

    it('should update traffic load', () => {
      const parcel = db.parcels.getParcel(5, 5);
      const road = db.roads.createRoad(parcel!.id, 'horizontal', 2);

      db.roads.updateTrafficLoad(road.id, 0.75);

      const updated = db.roads.getRoad(parcel!.id);
      expect(updated?.trafficLoad).toBe(0.75);
    });

    it('should get all roads', () => {
      const parcel1 = db.parcels.getParcel(1, 1);
      const parcel2 = db.parcels.getParcel(2, 1);
      const parcel3 = db.parcels.getParcel(3, 1);

      db.roads.createRoad(parcel1!.id, 'horizontal', 2);
      db.roads.createRoad(parcel2!.id, 'horizontal', 2);
      db.roads.createRoad(parcel3!.id, 'horizontal', 2);

      const roads = db.roads.getAllRoads();
      expect(roads.length).toBe(3);
    });
  });

  describe('AgentRepository', () => {
    it('should create an agent', () => {
      const agent = db.agents.createAgent('TestBot', 10, 10);

      expect(agent).toBeDefined();
      expect(agent.name).toBe('TestBot');
      expect(agent.currentLocation.x).toBe(10);
      expect(agent.currentLocation.y).toBe(10);
      expect(agent.state).toBe('idle');
    });

    it('should create agent with moltbook ID', () => {
      const agent = db.agents.createAgent('MoltBot', 5, 5, 'moltbook-123');

      expect(agent.moltbookId).toBe('moltbook-123');
    });

    it('should update agent position', () => {
      const agent = db.agents.createAgent('TestBot', 0, 0);
      db.agents.updatePosition(agent.id, 15.5, 20.3);

      const updated = db.agents.getAgent(agent.id);
      expect(updated?.currentLocation.x).toBe(15.5);
      expect(updated?.currentLocation.y).toBe(20.3);
    });

    it('should update agent state', () => {
      const agent = db.agents.createAgent('TestBot', 0, 0);
      db.agents.updateState(agent.id, 'traveling');

      const updated = db.agents.getAgent(agent.id);
      expect(updated?.state).toBe('traveling');
    });

    it('should set agent destination with path', () => {
      const agent = db.agents.createAgent('TestBot', 0, 0);
      const path = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];

      db.agents.setDestination(agent.id, 3, 0, path);

      const updated = db.agents.getAgent(agent.id);
      expect(updated?.destination?.x).toBe(3);
      expect(updated?.destination?.y).toBe(0);
      expect(updated?.path.length).toBe(3);
    });

    it('should get agents in range', () => {
      db.agents.createAgent('Agent1', 5, 5);
      db.agents.createAgent('Agent2', 6, 6);
      db.agents.createAgent('Agent3', 50, 50);

      const agents = db.agents.getAgentsInRange(0, 0, 10, 10);
      expect(agents.length).toBe(2);
    });

    it('should set agent home and work', () => {
      db.city.initializeCity('TestCity', 10, 10);
      db.parcels.initializeGrid(10, 10);

      const homeParcel = db.parcels.getParcel(1, 1);
      const workParcel = db.parcels.getParcel(5, 5);

      const home = db.buildings.createBuilding(homeParcel!.id, 'house', 'Home', 'agent-1');
      const work = db.buildings.createBuilding(workParcel!.id, 'office', 'Work', 'agent-1');

      const agent = db.agents.createAgent('Worker', 1, 1);
      db.agents.setHome(agent.id, home.id);
      db.agents.setWork(agent.id, work.id);

      const updated = db.agents.getAgent(agent.id);
      expect(updated?.home).toBe(home.id);
      expect(updated?.work).toBe(work.id);
    });
  });

  describe('VehicleRepository', () => {
    let agentId: string;

    beforeEach(() => {
      const agent = db.agents.createAgent('Driver', 0, 0);
      agentId = agent.id;
    });

    it('should create a vehicle', () => {
      const vehicle = db.vehicles.createVehicle(agentId, 'car', 5, 5);

      expect(vehicle).toBeDefined();
      expect(vehicle.type).toBe('car');
      expect(vehicle.position.x).toBe(5);
      expect(vehicle.position.y).toBe(5);
    });

    it('should get vehicles by owner', () => {
      db.vehicles.createVehicle(agentId, 'car', 0, 0);
      db.vehicles.createVehicle(agentId, 'truck', 1, 1);

      const vehicles = db.vehicles.getVehiclesByOwner(agentId);
      expect(vehicles.length).toBe(2);
    });

    it('should update vehicle position', () => {
      const vehicle = db.vehicles.createVehicle(agentId, 'car', 0, 0);
      db.vehicles.updatePosition(vehicle.id, 10, 20);

      const updated = db.vehicles.getVehicle(vehicle.id);
      expect(updated?.position.x).toBe(10);
      expect(updated?.position.y).toBe(20);
    });
  });

  describe('PowerLineRepository', () => {
    it('should create a power line', () => {
      const id = db.powerLines.createPowerLine(0, 0, 5, 5, 1000);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should get all power lines', () => {
      db.powerLines.createPowerLine(0, 0, 5, 0);
      db.powerLines.createPowerLine(5, 0, 10, 0);

      const lines = db.powerLines.getAllPowerLines();
      expect(lines.length).toBe(2);
      expect(lines[0].from.x).toBe(0);
      expect(lines[0].to.x).toBe(5);
    });

    it('should delete a power line', () => {
      const id = db.powerLines.createPowerLine(0, 0, 5, 5);
      db.powerLines.deletePowerLine(id);

      const lines = db.powerLines.getAllPowerLines();
      expect(lines.length).toBe(0);
    });
  });

  describe('WaterPipeRepository', () => {
    it('should create a water pipe', () => {
      const id = db.waterPipes.createWaterPipe(0, 0, 5, 5, 100);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should get all water pipes', () => {
      db.waterPipes.createWaterPipe(0, 0, 5, 0);
      db.waterPipes.createWaterPipe(5, 0, 10, 0);

      const pipes = db.waterPipes.getAllWaterPipes();
      expect(pipes.length).toBe(2);
    });

    it('should delete a water pipe', () => {
      const id = db.waterPipes.createWaterPipe(0, 0, 5, 5);
      db.waterPipes.deleteWaterPipe(id);

      const pipes = db.waterPipes.getAllWaterPipes();
      expect(pipes.length).toBe(0);
    });
  });
});
