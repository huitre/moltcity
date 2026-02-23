// ============================================
// MOLTCITY - Configuration Constants
// ============================================

export const API_URL = "";
export const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

// Isometric tile dimensions
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const GRID_SIZE = 50;

// World bounds for camera
export const WORLD_MIN_X = -(GRID_SIZE * TILE_WIDTH) / 2;
export const WORLD_MAX_X = (GRID_SIZE * TILE_WIDTH) / 2;
export const WORLD_MIN_Y = 400;
export const WORLD_MAX_Y = GRID_SIZE * TILE_HEIGHT + WORLD_MIN_Y;

// Colors for rendering
export const COLORS = {
  grass: 0x7ec850,
  grassDark: 0x5da03a,
  water: 0x4a90d9,
  road: 0x555555,
  roadLines: 0xcccccc,
  building: 0x8b7355,
  roof: 0xc9302c,
  window: 0x87ceeb,
  windowLit: 0xffd700,
  highlight: 0xffff00,
  selected: 0x00ff00,
  powered: 0x4ecdc4,
  unpowered: 0xff6b6b,
};

// Ambient effects
export const CLOUD_COUNT = 8;
export const BIRD_COUNT = 12;

// Building limits
export const MAX_FLOORS = { house: 3, office: 5 };

// Building footprints (tiles wide x tiles tall)
export const BUILDING_FOOTPRINTS = {
  hospital: { w: 2, h: 2 },
  police_station: { w: 2, h: 2 },
  fire_station: { w: 2, h: 2 },
  power_plant: { w: 2, h: 2 },
  wind_turbine: { w: 1, h: 1 },
  coal_plant: { w: 2, h: 2 },
  nuclear_plant: { w: 3, h: 3 },
  water_tower: { w: 2, h: 2 },
  university: { w: 2, h: 2 },
  stadium: { w: 4, h: 4 },
  city_hall: { w: 2, h: 2 },
};

// Vehicle/pedestrian config
export const VEHICLE_SPEED = 0.5;
export const PEDESTRIAN_SPEED = 0.2;
export const PEDESTRIAN_COLORS = [
  0x4a90d9, 0xe74c3c, 0x2ecc71, 0x9b59b6, 0xf1c40f, 0xe67e22, 0x1abc9c,
  0xecf0f1,
];

// Direction vectors for pathfinding
export const DIR_VECTORS = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

export const OPPOSITE_DIR = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

// Cardinal directions → isometric sprite directions
export const CARDINAL_TO_ISO = {
  north: "NE",
  south: "SW",
  east: "SE",
  west: "NW",
};
