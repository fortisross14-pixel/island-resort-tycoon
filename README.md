# Island Resort Tycoon (prototype)

A premium mobile tycoon game: grow a tiny island into a five-star resort, check guests in by
hand, and watch them walk your paths and spend money.

This repository holds the proof of concept. The plan is in [docs/ROADMAP.md](docs/ROADMAP.md).
**M1–M5 are done:** island and construction, clock and ferry, check-in, needs and spending, and the nightly accounts, reviews and star rating. Next come three passes: depth and scenarios, balance, and graphics/GUI.
Play it on GitHub Pages: https://fortisross14-pixel.github.io/island-resort-tycoon/

![M3: dragging a backpacker onto a room shows the match score](docs/m3.png)

## Run it

```sh
npm install
npm run dev        # http://localhost:5173, also reachable from a phone on the same network
npm test           # simulation rules (Vitest)
npm run build      # type-check and build to dist/
```

## Controls

| Action | Touch | Mouse / keyboard |
|---|---|---|
| Pan | one finger (no tool selected), or two fingers | drag, or right/middle-drag with a tool |
| Zoom | pinch | wheel |
| Draw paths | pick **Footpath**, drag from an existing path | `1`, then drag |
| Build | drag a card onto the map, or pick it and tap | `2`–`4`, then click |
| Rotate | **Rotate** | `R` |
| Demolish (50% refund) | **Demolish**, then tap | `X`, then click |
| Undo (full refund) | **Undo** | `Ctrl/Cmd+Z` |
| Leave the tool | **Done** | `Esc` |
| Pause / speed | ❚❚ 1× 2× 4× | `Space` pauses |
| Check in a guest | **Guests** tab: drag a card onto a room, or tap a card then a room | same; `G` toggles the tab |

Tap a guest or a building with no tool selected to open its panel. A venue's panel sets its price; a room's panel sets the nightly rate. At 23:00 the night report appears: tap a review to see where it happened, then **Start day** (or Enter).

## Layout

```
src/
  sim/        pure game rules, with no DOM or Three.js; unit tested
    buildings.ts   catalogue, costs, footprints
    world.ts       grid, paths, buildings, placement rules, snapshots
    history.ts     undo
    pathGraph.ts   cached walking distances over the footpaths
    sim.ts         clock, ferry, check-in queue and guest agents (fixed tick)
    match.ts       room match score: budget tier and wishes
    needs.ts       meters, venues, price steps, room rates
    reviews.ts     review lines, stars and the rating
    rng.ts         seeded RNG
  render/     Three.js
    stage.ts       renderer, ortho camera, picking, pan/zoom, render-on-demand
    models.ts      low-poly building, palm and path models
    worldView.ts   keeps the scene in sync with the World; ghosts and highlights
    guestView.ts   instanced guests and the ferry
    coinPops.ts    floating +N coins on purchases
  ui/hud.ts   DOM overlay: top bar, build tray, guest cards, toasts
  ui/panel.ts guest and building info panel
  ui/report.ts night report
  game.ts     input handling and tools; glues sim, render and UI
tests/        Vitest specs for the sim
```

In the browser console, `game.world` and `game.sim` give you the live simulation.

## Deploy

Every push to the default branch builds, tests and publishes to GitHub Pages through
`.github/workflows/deploy.yml`. One-time setup: **Settings → Pages → Source: GitHub Actions**.
