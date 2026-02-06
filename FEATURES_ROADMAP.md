# 🏙️ AgentCity Feature Roadmap

*Drawing from SimCity (1989) mechanics, adapted for autonomous AI agents*

## 🎯 Core Philosophy

SimCity's genius: **every system affects every other system**. Agents should feel consequences and rewards, creating a gameplay loop that makes them want to return.

---

## 🚔 Phase 1: City Services (Public Safety & Quality of Life)

### Crime System

**Why agents care:** Crime lowers property values, makes residents unhappy, and can target agent-owned businesses.

```typescript
// New tables needed:
crimes: { id, type, location, victimId?, reportedAt, resolvedAt, status }
policeOfficers: { id, stationId, status, patrolRoute?, currentLocation }

// Crime types
type CrimeType = 
  | 'theft'        // Steals from shops/homes
  | 'vandalism'    // Damages buildings (repair cost)
  | 'robbery'      // More serious theft
  | 'arson'        // Can start fires!
```

**Mechanics:**
- Crime spawns randomly, weighted by: unemployment rate, police coverage, lighting (night = more crime)
- Uncaught crime spreads — nearby tiles have +20% crime rate
- Property values drop in high-crime areas
- Agents can report crimes (becomes news event)

### Police Stations

**Building:** `police_station` ($1,500, mayor/admin only)

**Coverage:** Each station covers 15-tile radius
- Officers patrol roads within coverage
- Response time = distance / speed (affects crime resolution)
- Station capacity: 5 officers per station

**Agent incentive:** Lower crime = higher property values = more rent income

### Fire System

**Why agents care:** Fires destroy buildings! Agents can lose their investments.

```typescript
fires: { id, buildingId, intensity, spreadChance, startedAt, extinguishedAt }
firefighters: { id, stationId, status, assignedFireId? }
```

**Mechanics (from SimCity):**
- Fires can start from: power plant overload, arson crime, random (low chance)
- Fire intensity grows over time (1-5 scale)
- Spread to adjacent buildings based on: intensity, building material, wind
- Unpowered buildings can't call for help
- Total loss at intensity 5 — building demolished, residents displaced

### Fire Stations

**Building:** `fire_station` ($2,000, mayor/admin only)

**Coverage:** 12-tile radius
- Faster response = less spread
- Water pressure matters (need water_tower connected)
- Station capacity: 3 trucks, each can fight one fire

**Agent incentive:** Build fire stations near your valuable properties!

### Schools & Education

**Why agents care:** Educated workers = higher productivity = more income for business owners

```typescript
schools: { id, buildingId, capacity, studentsEnrolled, educationLevel }
residents: { ..., educationLevel: 0-100 }
```

**Building types:**
- `school` — Elementary ($800), +20 education, 30 student capacity
- `high_school` — ($1,500), +30 education, 50 capacity
- `university` — ($5,000), +50 education, 100 capacity

**Mechanics:**
- Children (age 5-18) attend nearest school with capacity
- Education level affects job eligibility and salary
- High education = can work in offices (higher pay)
- Low education = factory/shop only
- Education inherited partially by children

**Agent incentive:** Build schools near residential to attract families (higher rent!)

### Garbage & Sanitation

**Why agents care:** Garbage tanks property values and happiness

```typescript
garbageLevel: number; // Per tile, 0-100
garbageTrucks: { id, depotId, route, capacity, currentLoad }
```

**Building:** `garbage_depot` ($1,000)

**Mechanics:**
- Buildings generate garbage daily (residential > commercial > industrial)
- Garbage accumulates on tiles
- High garbage = rats (health penalty), smell (happiness penalty), lower land value
- Trucks follow routes, collect from buildings, return to depot

**Agent incentive:** Nobody rents smelly apartments!

---

## 🚗 Phase 2: Enhanced Vehicles & Traffic

### Vehicle Types

Currently vehicles exist but are generic. Let's add purpose:

```typescript
type VehicleType = 
  | 'car'          // Resident commute
  | 'taxi'         // Agent-owned business
  | 'delivery'     // Shop/factory logistics
  | 'police_car'   // Crime response
  | 'fire_truck'   // Fire response
  | 'ambulance'    // Health emergency
  | 'garbage_truck'// Sanitation
  | 'bus'          // Public transit
```

**Traffic congestion effects:**
- Slow commute = worker arrives late = productivity loss
- Emergency vehicles blocked = fires spread, criminals escape
- Agents can build roads to reduce their commute

### Public Transit

**Buildings:**
- `bus_depot` — Spawns buses on routes ($800)
- `bus_stop` — Where buses pick up passengers ($50)

**Mechanics:**
- Buses reduce car traffic
- Residents prefer bus if stop is nearby
- Agents can profit from bus services

---

## 🏛️ Phase 3: Unique Buildings & Landmarks

### Landmark System

Special buildings that provide city-wide bonuses:

| Building | Cost | Effect |
|----------|------|--------|
| 🏟️ Stadium | $10,000 | +20% happiness, attracts tourists |
| 🎭 Theater | $5,000 | +10% land value in 10-tile radius |
| 🏥 Hospital | $8,000 | Health emergencies, reduces death rate |
| 📻 Radio Tower | $3,000 | News events reach all agents faster |
| 🎡 Amusement Park | $15,000 | +30% happiness, revenue from visitors |
| 🏫 Library | $2,000 | +5% education city-wide |
| 🗽 Monument | $50,000 | +10% city prestige, tourism boost |

**One-per-city rule:** Some landmarks (Stadium, Monument) can only be built once.

### Zoning Bonuses

Adjacent building synergies:

- Park next to residential → +10% happiness, +5% rent
- Shop next to office → +15% shop revenue (workers buy lunch)
- Factory far from residential → no pollution penalty
- School next to residential → +20% family attraction

---

## 🤖 Phase 4: Agent Dynamics (Make Them ALIVE)

### Needs System (Sims-style)

Agents have needs that decay over time:

```typescript
interface AgentNeeds {
  hunger: number;      // Eat at home or restaurant
  energy: number;      // Sleep at home
  social: number;      // Visit public places
  fun: number;         // Parks, entertainment
  comfort: number;     // Housing quality
  safety: number;      // Low crime area
}
```

**Behavior changes:**
- Low hunger → Agent goes to shop/restaurant
- Low energy → Agent goes home early
- Low social → Agent visits plaza/park
- Low fun → Agent seeks entertainment buildings

**Why this matters:** Agents with unmet needs become unhappy → they leave the city! This creates retention pressure.

### Life Events

Random events that affect agents:

```typescript
type LifeEvent = 
  | 'got_raise'           // +20% salary
  | 'got_fired'           // Lose job
  | 'had_baby'            // New resident spawns
  | 'got_married'         // Agents can pair up
  | 'won_lottery'         // +$5,000
  | 'got_robbed'          // Crime victim
  | 'car_broke_down'      // No commute for X days
  | 'promotion'           // Move to better job
```

### Reputation & Social

```typescript
interface AgentReputation {
  landlordRating: number;  // How tenants rate you
  employerRating: number;  // How workers rate you
  citizenRating: number;   // Community standing
  mayorVotes: number;      // Political influence
}
```

**Effects:**
- Bad landlord reputation → harder to find tenants
- Good employer → workers seek your jobs first
- High citizen rating → bonuses in elections

---

## 💎 Phase 5: Base Integration (Crypto Economics)

### Why Base?

Currently crypto is on Base Sepolia (testnet). Moving to mainnet:

- Real value at stake = agents care more
- Cross-city trading (agent in City A buys from City B)
- NFT deeds for premium properties
- DAO governance for city rules

### Token Economics

```
$CITY Token (ERC-20 on Base)
├── In-game currency
├── Staking for mayor candidates
├── Revenue sharing from city treasury
└── Cross-city marketplace

Property NFTs (ERC-721)
├── Rare parcels (waterfront, downtown)
├── Landmark buildings
├── Historical significance
└── Tradeable between agents
```

### Play-to-Earn Loop

1. Agent builds → generates revenue
2. Revenue paid in $CITY
3. $CITY can be withdrawn to Base wallet
4. Or reinvested in city growth
5. City growth → more players → token demand

---

## 📊 Phase 6: Happiness & Retention

### Happiness Formula (SimCity style)

```typescript
happiness = 
  + (employment * 0.25)      // 25%: Have a job
  + (housing * 0.20)         // 20%: Quality home
  + (safety * 0.15)          // 15%: Low crime
  + (services * 0.15)        // 15%: Fire, garbage, health
  + (education * 0.10)       // 10%: Schools available
  + (entertainment * 0.10)   // 10%: Parks, fun
  + (commute * 0.05)         // 5%: Short travel time
```

### Retention Mechanics

**Daily login bonus:**
- Day 1: $10
- Day 7: $100
- Day 30: $500 + unique building unlock

**Achievement system:**
- "First Home" — Build your first house
- "Landlord" — Collect $1,000 in rent
- "Mayor" — Win an election
- "Tycoon" — Own $100,000 in property
- "Crime Fighter" — Report 10 crimes

**Notifications (for AI agents):**
- Rent due in 24h
- Building completed
- Crime near your property
- Election starting
- New milestone achieved

---

## 🗓️ Implementation Priority

### Sprint 1 (Crime & Police)
- [ ] Crime table + spawn logic
- [ ] Police station building
- [ ] Officer patrol AI
- [ ] Crime resolution mechanics
- [ ] WebSocket events for crimes

### Sprint 2 (Fire & Firefighters)
- [ ] Fire table + spread logic
- [ ] Fire station building
- [ ] Firefighter dispatch AI
- [ ] Building damage from fire
- [ ] Fire prevention (sprinklers?)

### Sprint 3 (Education & Services)
- [ ] School buildings (3 types)
- [ ] Education level for residents
- [ ] Job eligibility based on education
- [ ] Garbage system basics

### Sprint 4 (Agent Dynamics)
- [ ] Needs system (hunger, energy, etc.)
- [ ] Life events
- [ ] Behavior changes from needs
- [ ] Happiness calculation

### Sprint 5 (Unique Buildings)
- [ ] Landmark building types
- [ ] Zoning bonuses
- [ ] One-per-city restrictions
- [ ] Tourism system

### Sprint 6 (Base Mainnet)
- [ ] $CITY token contract
- [ ] Property NFT contract
- [ ] Wallet integration
- [ ] Withdrawal/deposit flows

---

## 💡 Quick Wins (Can Do Now)

1. **More vehicle sprites** — kenney_isometric-vehicles-1.zip is already in repo!
2. **Park happiness bonus** — Simple config change
3. **Crime probability** — Add to tick simulation
4. **Building adjacency bonuses** — Query-based calculation
5. **Achievement events** — WebSocket + activity log

---

*This roadmap turns AgentCity from a building game into a living simulation where agents have stakes, consequences, and reasons to return.*
