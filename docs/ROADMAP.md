# POC roadmap

This is the plan for the **Prototype** milestone in the Game Design Document (about 3 weeks):

> One 10×10 island, footpaths, Basic Rooms, Snack Bar, Buffet, the morning ferry,
> drag-to-room check-in, guests walking and spending, and the night report.
> **The question it answers: is placing guests and watching them spend fun for 15 minutes?**

The prototype is split into five milestones, then three passes. Each milestone ends with
something you can play. The simulation (`src/sim`) stays pure TypeScript with no DOM or
Three.js, so every rule can be unit tested and a playtest harness can drive it headless.

Until the passes, testing covers rules and function only: balance numbers and visual polish
are deliberately left rough.

| # | Milestone | Status |
|---|-----------|--------|
| M1 | Island and construction | **Done** |
| M2 | Clock, ferry and walkers | **Done** |
| M3 | Check-in | **Done** |
| M4 | Needs and spending | **Done** |
| M5 | Economy, night report and reviews | **Done** |
| Pass 1 | Depth and scenarios | **Done** |
| Pass 2 | Balance | **Done** |
| Pass 3 | Graphics, visuals and GUI | **Done** (Lagoon Glass) |
| Pass 4 | Islands, ratings, activities and the campaign | **In progress** (steps below) |

---

## M1 — Island and construction ✅

Goal: the map pillar on its own. You build a starter resort on a 10×10 island, and the
layout rules already push back.

- [x] Vite + TypeScript + Three.js project, with Vitest for the sim
- [x] Orthographic camera from a fixed corner, rendering only when something changes
- [x] Low-poly, flat-shaded island: grass plateau, beach rim, shallow and deep sea, palms, dock pier and boat
- [x] Touch-first camera: one finger pans (with no tool), two fingers pan and pinch; mouse wheel zooms, right-drag pans
- [x] Footpaths drawn by dragging, snapped to tiles, auto-joined at corners and junctions
- [x] Rule: every path must lead back to the dock (enforced when placing *and* when removing)
- [x] Basic Rooms (2×2), Snack Bar (1×1) and Buffet (3×2) with ghost previews in green or red
- [x] Rule: every building must touch a path; no overlaps; footprint must be on the island
- [x] 90° rotation (Rotate button or `R`)
- [x] Drag from the tray onto the map to build, or pick a card and tap
- [x] Demolish with a 50% refund; the dock path can't be removed, nor a path that would strand others
- [x] Undo (full refund); a whole path stroke is one undo step
- [x] Money: 15,000 coins to start, costs balanced so the GDD starter layout fits with a little left over
- [x] Autosave to local storage, and a "new island" button
- [x] Top bar (coins, day and time, rating, speed placeholders) and bottom build tray

Deferred from the GDD map section: moving buildings (free on day 1, 25% after), the
appeal/nuisance heat map, land plots and stacked floors (vertical slice).

## M2 — Clock, ferry and walkers ✅

Goal: the island comes alive.

- [x] Day clock from 07:00 to 23:00 (200 real seconds at 1×), with pause, 1×, 2× and 4× (Space pauses)
- [x] Fixed 20 Hz simulation tick, separate from drawing; positions interpolated between ticks
- [x] Path graph: BFS distance fields per goal (building access tiles, dock, tile), cached until the map changes
- [x] The morning ferry: sails in at 08:00, unloads, boards anyone waiting, leaves from 09:30
- [x] Arrivals grow day by day (4 + 2 × day, capped at 20)
- [x] Guests walk tile by tile on paths: off the pier, to their room, to food (closer is likelier), wandering, resting
- [x] Evenings: everyone heads to their room at 21:00; next morning, guests whose stay is over walk to the dock and leave
- [x] Guests re-route when you edit the map; if their room is demolished they head home
- [x] Instanced low-poly guests (two draw calls), with a walking bob; tap one to see who they are and what they think
- [x] Continuous rendering while the clock runs; render-on-demand while paused
- [x] Day, time and guest count in the top bar; toasts for the ferry, full rooms and each new day
- [x] Saves include the clock, ferry and guests (M1 saves still load)
- [x] Deploys to GitHub Pages from CI (`.github/workflows/deploy.yml`)

Placeholder until M3: arriving guests are checked in automatically to the free room nearest the
dock, and anyone without a room is turned away. The night between 23:00 and 07:00 is skipped
until the night report (M5).

## M3 — Check-in ✅

Goal: the player's main action.

- [x] Arriving parties queue on the pier; each is a card in the **Guests** tab: type, nights, nightly budget, wishes as icons, and a patience bar
- [x] A Backpacker is one person; a Couple is a party of two sharing one room (Basic Rooms holds 2 parties)
- [x] Drag a card onto a room to check in, or tap a card and then tap a room
- [x] While a card is selected, every room shows a score bubble (green, yellow or red, or grey when full); the room under your finger shows why
- [x] Match score (0–100): budget against room tier, plus each wish: Snack Bar nearby, Buffet nearby, quiet (no food within 2 tiles), short walk from the dock
- [x] The score becomes the party's starting satisfaction (used from M4)
- [x] Unplaced parties give up after 2 game hours, wait on the pier, and leave on the ferry, which waits for them
- [x] After a check-in the next card is selected, and the tray switches back to Build when the queue is empty
- [x] Auto-assign button (stand-in for the Front Desk unlock): best free room for everyone, always 10 points worse than placing by hand
- [x] Tap a queued guest on the pier to pick their card; tap a room to see how many rooms are taken

Couples expect a tier-2 room, so they always lose a few points in Basic Rooms until Standard
Rooms arrive in the vertical slice. That is deliberate: it shows the tier system working.

## M4 — Needs and spending ✅

Goal: money you can see.

- [x] Four meters per guest (Hunger, Fun, Rest, Comfort), 0–100, running down while they're out
- [x] Guests choose whatever best fills their emptiest meters: venues for hunger, strolls for fun, naps in the room for rest and comfort
- [x] Choices weigh walking distance and line length; the 12-tile rule cuts a venue's appeal to 15% when it's more than 12 path tiles from the guest's room
- [x] Venues have capacity, service time and a line (Snack Bar 2 at a time, line of 4; Buffet 8, line of 6); guests in a long line give up
- [x] Price steps per venue (Bargain, Low, Fair, High, Luxury); price is discovered on arrival, as in the GDD, and decides whether they buy
- [x] Backpackers are more price-sensitive than couples; each party has a daily spending wallet
- [x] Every sale goes into your coins, with a "+N" coin popping over the venue
- [x] Tap a guest: thought, mood, the four meters, wallet, today's spending, room match and stay
- [x] Tap a venue: price buttons with the live buy chance per guest type, sales, revenue, walk-aways, serving and line
- [x] Tap a room: occupancy and each party's mood
- [x] Satisfaction now moves: empty meters drain it, bargains lift it, lines and high prices dent it

Not yet: Fun and Comfort have no venues of their own (the pool, gift shop and spa come in Pass 1).

## M5 — Economy, night report and reviews ✅

Goal: one full day loop with consequences.

- [x] At 23:00 every housed party pays the nightly rate (capped at its budget, with a mood hit if overpriced)
- [x] Room rate: five steps per room tier, set from any room's panel; a rate above a party's budget lowers the match score
- [x] Daily upkeep per building; supplies of 30% are taken from every food sale
- [x] Night report: profit, income by building, costs, rating and its trend, guest counts, tomorrow's ferry size, best and worst moments, and the new reviews; the game waits until you start the next day (Enter works too)
- [x] Departures write a review: 1–5 stars from satisfaction and one line from their best and worst memories ("The Buffet was great value, but the walk to the Snack Bar was endless.")
- [x] Memories come from the room match, meals, bargains, long walks (12-tile rule), lines, high prices, hunger and boredom; parties who give up leave a 1-star review
- [x] Tap a review to jump the camera to its building and open its panel, then return to the report
- [x] Star rating: average of the last 50 reviews (starting near 2.5), shown in the top bar
- [x] The rating sets the ferry size and the share of richer couples
- [x] Saves keep reviews, room rates and a pending night report
- [x] Money can go negative (shown in red); the GDD's investor rescue belongs to Pass 1

## Pass 1 — Depth and scenarios ✅

More to build and more reasons to build it. The full building plan is in
[CATALOGUE.md](CATALOGUE.md): every building has an unlock tier and a separate quality class.

1. ✅ **Land.** The map is 28×28 in 7×7 plots; you start with the middle 14×14. Buy plots that border your land (from 3,000, ×1.35 each); they rise out of the sea. The harbour plot in front of the dock is never for sale.
2. ✅ **Catalogue and tier 1.** Quality classes; Standard Rooms, Beach Bar (shore only), Gift Shop, Pool (free) and Front Desk (enables auto-assign, longer patience). New wishes: pool and bar. Guests who balk at a price skip that venue for the rest of the day.
3. ✅ **Research and unlocks.** Research points from review stars and Research Offices; a Research tab with topics in four branches; tier-1 buildings locked until researched; tier 2 needs two tier-1 topics and premium topics a ★3 rating. Tier 2 added: Garden Bungalows, Italian/Seafood/Asian restaurants, Gym, Spa, Boutique, Dive Shop.
4. ✅ **Scenarios, goals and the investor rescue.** New-game dialog (Driftwood Beginnings or Sandbox). Scenario 1 has 30 days and three medal tiers (guests served, rating, research, 7-day profit), a goals pill and panel, and a certificate at the end. Three daily goals pay coins or research. After three days in the red, an investor offers cash for 15% of income for 20 days.
5. ✅ **More guest types.** Families (★2, parties of 3–4), Wellness seekers (★3), Party groups (★3, out late) and VIPs (★4, hate crowds), each with loves and dislikes; Kids' Club (tier 2, per child) and Nightclub (tier 3, keeps neighbours awake). Fixed a long-standing bug where guests who went to bed before 23:00 slept through the next day.
6. ✅ **Stacked floors.** Room buildings get floors from their panel (2 rooms each, 60% of the price, upkeep per floor): 3 at first, 6 after the Tall Buildings research. Above 3 floors guests mind the stairs (−15 match) until a 2,000 Elevator goes in. Demolishing refunds half of everything spent.

Pass 1 is done.

### Expansion (after Pass 2) ✅

- Tier 3: Suites (luxury rooms), Fine Dining, Movie Theater, Conference Hall (brings Business guests).
- Tier 4 (two tier-3 topics, ★4+): Water Villas (shore-only for now), Helipad (triples VIP arrivals), Marina.
- Business guest type: impatient, minds a slow check-in without a Front Desk, holds events at the Conference Hall.
- Scenario 2, **Family Cove**: families dominate the ferry; medals for families hosted, a Kids' Club, a Pool, rating and profit.

Still for later: scenarios 3–8, rival resorts and rankings, staff, decoration and utilities, special plot types (beach, cliff, jungle), building over water.

## Pass 2 — Balance ✅

A headless playtest harness (`npm run playtest`) plays many days with a fixed starter resort and a scripted
bot, and logs the economy, payback per building and review complaints. The game was tuned against the GDD
targets and the targets became tests (`tests/balance.test.ts`). Details and results: [BALANCE.md](BALANCE.md).

## Pass 3 — Graphics, visuals and GUI ✅

Audited against the game-dev skills in `.claude/skills/` ([AUDIT.md](AUDIT.md)); the chosen
direction is **Lagoon Glass**.

First cut:

- New HUD: glass chips (coins, rating, clock with a speed chip, menu), a five-icon dock (Build,
  Guests, play/pause, Research, Goals) and one sheet above it. Build cards are grouped into
  five categories and show only an icon and a price; details sit behind ⓘ or a long-press.
- Readability: 12 px text floor, 44 px tap targets, contrast-checked colours (including the
  check-in score bubbles), Outfit and Nunito Sans, focus rings and keyboard-usable cards.
- Feel: buildings pop in with a dust ring and a red "−cost" number; medals get a banner with
  confetti; research gets a banner; rating, coins, research and the guest queue pulse.
- Sound: synthesized effects for coins, building, the ferry horn, check-in, errors and fanfares,
  with a mute in the menu.
- Reduce motion: follows the OS setting, can be toggled in the menu.
- Performance: buildings are merged per material and paths are one mesh; only changed buildings
  are rebuilt; pixel ratio 1.5 on touch screens; `PCFShadowMap`; research and lock updates only
  when something changed.
- A one-time notice when the game can't save.

Second cut:

- Day and night: the light follows the clock (warm morning, golden evening, blue night), the sun
  swings across the sky, windows glow after dark and the HUD gets a night wash.
- Guided first day: six steps (path, room, food, play, check-in, night report), each ticked off
  by doing it, with the dock button to press pulsing. On by default for a first scenario, a
  checkbox on the New island screen, and Skip.
- One static layer: settled buildings are baked into one mesh per material (599 → 158 draw calls
  for 17 buildings); a building only leaves it while it pops in.
- Saves: a migration chain (sim v5 → v6 so far) with fixture tests, and a copy kept from the start
  of each day that loads if the autosave is damaged.
- Installable app: web manifest, icons and a service worker, so the game installs to the home
  screen and plays offline.
- Esc closes the topmost layer only (dialogs, popovers, panels, the selected guest, the tool, the
  sheet).
- Research is drawn as a tree: one column per tier, colour-coded by branch, with the gate (two topics of
  the tier before) between tiers.

Left for later: a string table for translations, GDD neighbour appeal for fun venues (a design
change, not a visual one) and numbers from a real mid-range phone.

## Pass 4 — Islands, ratings, activities and the campaign

The island stops being a square with a beach ring. Each island is authored with its own shape,
heights, water and jungle, and carries several missions. The resort is judged on four ratings, and a
campaign map with shared research ties the missions together.

### Decisions

- **Time:** one in-game "day" becomes a **month**; the clock ticks days of the month. A year is
  12 months, so "by year 3" means within 36 months (about two hours of play). The sun and night
  cycle stays as an indicative rhythm through each month, as in Cities: Skylines.
- **Resort ratings** are out of 5 with one decimal, like map reviews: **Lodging**, **Amenities**,
  **Activities**, **Decoration** and an **Overall** weighted by the guest mix. Excelling at all
  four is hard on purpose; each mission and budget favours a different balance.
- **Missions** (also called scenarios) award **bronze, silver and gold**, each with a short list
  of clear goals.
- **Experience** carries between missions. A first bronze, first silver and first gold on a
  mission each pay a large amount; repeating a medal you already hold pays a little.
- **Unlocks** work like a roadmap: a few missions are always open, and gold medals open more.
  The sandbox opens after the beginner missions.
- **Research** lives on the home screen and applies to every resort; it is bought with
  experience.

### Steps

1. ✅ **Calendar and terrain.** Months and years on the clock and in reports. Islands as data:
   terrain per tile (deep and shallow sea, reef, lagoon, sand, grass, jungle, rock), heights 0–3
   with stairs between neighbouring levels and cliffs elsewhere, irregular plots to buy, and
   the dock. Two islands to start: **Coconut Key** (tiny) and **Twin Palms** (medium, with an
   interior lagoon). The current missions move onto them.
   Done: `src/sim/calendar.ts` and `src/sim/islands.ts` (each island is three text layers you can
   edit by hand: terrain, heights, plots). Paths climb one level at a time (drawn as ramps);
   buildings need flat ground; rock can't be built on; building on jungle clears it for 150
   coins a tile; plot prices scale with their land area. Driftwood Beginnings is on Coconut
   Key, Family Cove and the sandbox on Twin Palms. Guest stays still read in nights: a booking
   length, not calendar time.
2. **Ratings, decoration and maintenance.** The four ratings and the overall; a decor catalogue
   (palms, flower beds, tiki torches, lamp posts, benches, hammocks, beach chairs, signs) with
   an appeal radius and Hawaiian and Caribbean themes; condition on every building and decor
   item, a monthly maintenance budget and repairs.
3. **Activities and the planner.** Dive shop and excursion pier, trail hut, yoga deck and kayak
   rental; jungle trails and boat routes drawn through points of interest; a planner with
   morning, afternoon and evening slots; guests sign up by interest and budget.
4. **Home screen and progression.** An archipelago map with missions as a roadmap, experience
   and first-medal bonuses, global research and perks, a profile save separate from each
   resort, and the sandbox unlock.
5. **Islands and missions.** Old Harbour (a run-down resort to renovate), Far Sands (a great
   beach far from the dock: beach club, boardwalk, shuttle) and Emerald Reef (jungle and reef,
   the advanced missions), each with two to four missions, balanced with the playtest harness
   so beginner golds are easy, the middle needs replays and research, and advanced bronzes are
   a real challenge.

### Planned missions

| Island | Mission | Goals (bronze → gold raise the bar) |
|---|---|---|
| Coconut Key | First Guests | 3 rooms and Lodging ★X by the end of year 3 |
| Coconut Key | Little Profit | A profitable year with 6 rooms |
| Twin Palms | Lagoon Days | Activities ★Y (kayaks, yoga) |
| Twin Palms | Family Cove | Families hosted, a Kids' Club, rating and profit |
| Old Harbour | New Paint | Lodging from ★1.5 to ★3.5: research, demolish, rebuild, wait for reviews |
| Far Sands | The Long Beach | A beach club, boardwalk and shuttle so the beach counts |
| Far Sands | Picture Perfect | Decoration ★4 |
| Emerald Reef | Into the Blue | Activities ★4.5 with sea and jungle excursions |
| Emerald Reef | Five-Star Island | ★4 in every rating |
