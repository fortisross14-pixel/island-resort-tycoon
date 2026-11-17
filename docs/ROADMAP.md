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
| M2 | Clock, ferry and walkers | **Done** |
| M3 | Check-in | **Done** |
| M4 | Needs and spending | Next |
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
