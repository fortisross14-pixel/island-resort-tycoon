# POC roadmap

This is the plan for the **Prototype** milestone in the Game Design Document (about 3 weeks):

> One 10×10 island, footpaths, Basic Rooms, Snack Bar, Buffet, the morning ferry,
> drag-to-room check-in, guests walking and spending, and the night report.
> **The question it answers: is placing guests and watching them spend fun for 15 minutes?**

The prototype is split into six milestones. Each one ends with something you can play. The
simulation (`src/sim`) stays pure TypeScript with no DOM or Three.js, so every rule can be
unit tested and a playtest harness can drive it headless in M6.

| # | Milestone | Status |
|---|-----------|--------|
| M1 | Island and construction | **Done** |
| M2 | Clock, ferry and walkers | Next |
| M3 | Check-in | Planned |
| M4 | Needs and spending | Planned |
| M5 | Economy, night report and reviews | Planned |
| M6 | Playtest build | Planned |

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

## M2 — Clock, ferry and walkers

Goal: the island comes alive.

- Day clock (about 3–4 real minutes per day) with pause, 1×, 2× and 4×
- Fixed-tick simulation separate from drawing (GDD risk: many guests on phones)
- Path graph: paths as nodes and edges, cached distances from each building's access tiles
- The morning ferry: the boat sails in and docks, and guests step off onto the pier
- Guest agents walking tile by tile along paths to a target building, then back
- Guests drawn as simple low-poly figures, capped at about 200 visible
- Continuous rendering while the clock runs; render-on-demand while paused

## M3 — Check-in

Goal: the player's main action.

- Each arriving guest shows as a card: type (Backpacker or Couple), budget, length of stay and wishes as icons
- Arrivals queue panel (the "Guests" tab)
- Drag a card onto Basic Rooms to check in; rooms that suit the guest light up while you drag
- Room capacity (2 rooms per Basic Rooms, 1 floor)
- Match score: budget against room tier, wishes against nearby amenities
- Unhoused guests wait at the dock and leave unhappy after a timeout

## M4 — Needs and spending

Goal: money you can see.

- Four meters per guest: Hunger, Fun, Rest and Comfort, decaying over the day
- Guests walk to whichever building best fills their lowest meter, weighted by walking distance
- The 12-tile rule: buildings more than 12 path tiles from a guest's room lose most of their visits
- Snack Bar and Buffet capacity, queues and service time
- One price slider per building with 5 steps (Bargain to Luxury), with a live visit estimate
- A coin pops above the building on every purchase
- Tap a guest to see their meters, wallet, current thought and today's spending

## M5 — Economy, night report and reviews

Goal: one full day loop with consequences.

- Evening: rooms charge their nightly rate; upkeep and supplies (about 30% of food revenue) are deducted
- Night report: revenue by building, best and worst moments, new reviews, change in star rating
- Departures at the end of a stay, with a review: 1–5 stars, one generated line and a pointer to the building
- Tap a review to jump the camera to that building
- Star rating from the rolling review average, which drives the next ferry's size
- Balance check against the GDD targets: profitable by day 2, buildings pay back in 4–8 days when well placed

## M6 — Playtest build

Goal: answer the prototype's question with real players.

- Headless playtest harness: run N days with a scripted layout and log the economy
- Balance pass on the numbers from M1–M5
- First-time hints for the first day
- PWA manifest and offline caching; installable on phones
- Performance pass on a low-end phone
- A 15-minute playtest script and feedback form
