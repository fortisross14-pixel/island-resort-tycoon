import { islandLayout } from '../src/sim/islands';
import { World, manhattanSteps, type Tile } from '../src/sim/world';

/**
 * Coconut Key laid out for tests: the pier is on the west shore at (6,14). A path runs north
 * from it, east along row 12, and south down column 12 to the cove beach.
 */
export const COVE_BEACH: Tile[] = [
  { x: 8, y: 15 },
  { x: 9, y: 15 },
  { x: 10, y: 15 },
  { x: 8, y: 16 },
  { x: 9, y: 16 },
  { x: 10, y: 16 },
  { x: 11, y: 16 },
  { x: 9, y: 17 },
  { x: 10, y: 17 },
  { x: 11, y: 17 },
];

export function coconutPaths(w: World): void {
  const run = (a: Tile, b: Tile) => {
    w.placePath(a.x, a.y);
    for (const t of manhattanSteps(a, b)) w.placePath(t.x, t.y);
  };
  run({ x: 6, y: 13 }, { x: 6, y: 12 });
  run({ x: 7, y: 12 }, { x: 14, y: 12 });
  run({ x: 12, y: 13 }, { x: 12, y: 17 });
}

export function coconutWorld(money = 100000, buyAll = false): World {
  const w = World.onIsland(islandLayout('coconutKey'), money);
  if (buyAll) for (const p of w.plots) w.buyPlot(p.id);
  coconutPaths(w);
  return w;
}
