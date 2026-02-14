# MoltCity - Multiplayer Design Decisions

## Core Decision: Zoning + Parcels Model

**Chosen direction**: Real-world model — Mayor zones, players buy parcels, players build within zoning rules.

1. Mayor paints zones (city planning)
2. Players buy parcels within zones
3. Players build what the zoning allows
4. No auto-build — only real players build

---

## Open Questions

### Q1: Can players build on unzoned parcels?

- **A) No, must be zoned** — Mayor must zone land before anyone can build. Gives mayor full city planning control.
- **B) Yes, anything goes** — Unzoned parcels allow any building type. Zoning only adds restrictions.
- **C) Yes, limited types** — Unzoned parcels allow basic types only (house, shop). Zoning unlocks bigger buildings.

### Q2: What happens to zone evolution (auto density upgrades)?

- **A) Remove it** — Players manually upgrade/rebuild their buildings. Full control.
- **B) Player-initiated upgrade** — Players can pay to upgrade density (add floors) when demand is high enough.
- **C) Keep auto-evolution** — Buildings still auto-evolve based on land value/demand, but only player-owned ones.

### Q3: What happens to ZoneBuildSimulator (auto-build on zoned parcels)?

- **A) Remove entirely** — No NPC buildings. City only grows through player actions.
- **B) Keep for unowned parcels only** — NPC buildings fill gaps where no player has bought land. Gives the city life.
- **C) Replace with NPC agents** — Simulated AI citizens who buy parcels and build like players do.

### Q4: What role does demand play without auto-build?

- **A) UI indicator only** — Show R/O/I demand bars as market signals. Players decide if they care.
- **B) Affects profitability** — High demand = higher rent income, more residents. Low demand = vacancies.
- **C) Affects building permits** — Can only build in a zone if demand is positive (mayor can override).

### Q5: Who pays for zoning?

- **A) City treasury** — Mayor zones using city funds ($10/tile currently).
- **B) Free for mayor** — Zoning is a planning tool, not a purchase.
- **C) Player pays** — Player requests zoning change, pays a fee.

### Q6: How do infrastructure costs work in multiplayer?

- **A) Mayor/treasury only** — Roads, power, water all come from city budget. Players just build buildings.
- **B) Players contribute** — Players pay connection fees to hook into power/water grid.
- **C) Mixed** — Mayor builds the grid, players pay ongoing utility fees (already partially implemented).

### Q7: What happens to parcel pricing in multiplayer?

- **A) Keep current model** — First 5 free, then 100 x parcelsOwned.
- **B) Fixed price per parcel** — Simple flat rate.
- **C) Market-based pricing** — Price based on land value, location, zoning.
- **D) Auction system** — Players bid on parcels.

### Q8: How does the mayor get elected with real multiplayer?

- **A) Keep current system** — 90-day cycle, nomination + voting phases, $500 campaign fee.
- **B) Simplify** — Most active/highest net worth player becomes mayor automatically.
- **C) Real-time voting** — Players can call elections anytime with enough signatures.

### Q9: What makes multiplayer fun / what's the player loop?

- **A) Tycoon** — Buy land, build profitable buildings, collect rent, climb leaderboard.
- **B) Collaborative** — Players work together to grow the city, shared goals.
- **C) Competitive** — Players compete for land, resources, political power.
- **D) Mix of all** — Collaborative city growth + competitive leaderboard + political elections.

### Q10: How many players per city?

- **A) Small (2-10)** — Tight community, every player matters.
- **B) Medium (10-50)** — Neighborhood-scale competition.
- **C) Large (50+)** — MMO-style, needs more automated systems.

---

## Changes Required Once Decisions Are Made

- Remove or repurpose `ZoneBuildSimulator`
- Remove or repurpose `ZoneEvolutionSimulator`
- Adjust `DemandCalculator` role
- Review parcel pricing model
- Review building cost model (treasury vs wallet)
- Add multiplayer session management
- Add real-time player interactions
