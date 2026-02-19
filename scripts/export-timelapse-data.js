#!/usr/bin/env node
/**
 * Export city construction timeline from SQLite database
 * Outputs JSON data for timelapse replay
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.argv[2] || path.join(__dirname, '..', 'moltcity.db');
const OUTPUT_PATH = process.argv[3] || path.join(__dirname, '..', 'client', 'timelapse-data.json');

console.log(`Reading database: ${DB_PATH}`);
const db = new Database(DB_PATH, { readonly: true });

// Get city info
const city = db.prepare('SELECT * FROM city LIMIT 1').get();
console.log(`City: ${city.name} (ID: ${city.id})`);

// Get all roads with coordinates
const roads = db.prepare(`
  SELECT r.id, r.direction, r.lanes, p.x, p.y
  FROM roads r
  JOIN parcels p ON r.parcel_id = p.id
  WHERE r.city_id = ?
  ORDER BY p.x, p.y
`).all(city.id);

console.log(`Roads: ${roads.length}`);

// Get all buildings with coordinates and timestamps, ordered by construction time
const buildings = db.prepare(`
  SELECT 
    b.id, b.type, b.name, b.sprite, b.width, b.height, b.floors, b.density,
    b.built_at, b.power_required, b.water_required,
    p.x, p.y
  FROM buildings b
  JOIN parcels p ON b.parcel_id = p.id
  WHERE b.city_id = ?
  ORDER BY b.built_at ASC
`).all(city.id);

console.log(`Buildings: ${buildings.length}`);

// Calculate timeline
const firstBuildTime = buildings.length > 0 ? buildings[0].built_at : 0;
const lastBuildTime = buildings.length > 0 ? buildings[buildings.length - 1].built_at : 0;
const totalDuration = lastBuildTime - firstBuildTime;

console.log(`Construction period: ${new Date(firstBuildTime).toISOString()} to ${new Date(lastBuildTime).toISOString()}`);
console.log(`Duration: ${Math.round(totalDuration / 1000 / 60)} minutes`);

// Process buildings with relative timestamps
const buildingTimeline = buildings.map(b => ({
  id: b.id,
  type: b.type,
  name: b.name,
  sprite: b.sprite,
  x: b.x,
  y: b.y,
  width: b.width,
  height: b.height,
  floors: b.floors,
  density: b.density,
  powerRequired: b.power_required,
  waterRequired: b.water_required,
  builtAt: b.built_at,
  relativeTime: b.built_at - firstBuildTime, // ms from start
  normalizedTime: totalDuration > 0 ? (b.built_at - firstBuildTime) / totalDuration : 0 // 0-1
}));

// Group buildings by approximate time (within 5 seconds)
const buildingGroups = [];
let currentGroup = [];
let lastTime = 0;

buildingTimeline.forEach(b => {
  if (currentGroup.length === 0 || b.builtAt - lastTime < 5000) {
    currentGroup.push(b);
  } else {
    buildingGroups.push([...currentGroup]);
    currentGroup = [b];
  }
  lastTime = b.builtAt;
});
if (currentGroup.length > 0) {
  buildingGroups.push(currentGroup);
}

console.log(`Building groups (by 5s intervals): ${buildingGroups.length}`);

// Output data structure
const timelapseData = {
  city: {
    id: city.id,
    name: city.name
  },
  meta: {
    totalRoads: roads.length,
    totalBuildings: buildings.length,
    firstBuildTime,
    lastBuildTime,
    totalDurationMs: totalDuration,
    buildingGroups: buildingGroups.length,
    exportedAt: new Date().toISOString()
  },
  roads: roads.map(r => ({
    id: r.id,
    x: r.x,
    y: r.y,
    direction: r.direction,
    lanes: r.lanes
  })),
  buildings: buildingTimeline,
  buildingGroups: buildingGroups.map(group => ({
    time: group[0].builtAt,
    relativeTime: group[0].relativeTime,
    normalizedTime: group[0].normalizedTime,
    buildings: group.map(b => b.id)
  }))
};

// Write output
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(timelapseData, null, 2));
console.log(`\nExported to: ${OUTPUT_PATH}`);
console.log(`File size: ${(fs.statSync(OUTPUT_PATH).size / 1024).toFixed(1)} KB`);

db.close();
