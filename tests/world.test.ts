import { describe, expect, it } from 'vitest';
import { BUILDINGS, PATH_COST, START_MONEY, footprint } from '../src/sim/buildings';
import { History } from '../src/sim/history';
import { PLOT_BASE_PRICE, World, manhattanSteps } from '../src/sim/world';

/** Lay a straight path north from the dock, n tiles long. */
function spine(w: World, n: number): void {
  const d = w.dock;
  for (let i = 1; i <= n; i++) expect(w.placePath(d.x, d.y - i).ok).toBe(true);
}

describe('World setup', () => {
  it('starts as a 10x10 island with 15,000 coins and a dock path', () => {
    const w = new World();
    expect(w.size).toBe(10);
    expect(w.money).toBe(START_MONEY);
    expect(w.isPath(w.dock.x, w.dock.y)).toBe(true);
    expect(w.pathTiles()).toHaveLength(1);
  });
});

describe('paths', () => {
  it('must connect to an existing path', () => {
    const w = new World();
    expect(w.placePath(0, 0)).toEqual({ ok: false, reason: 'Paths must lead back to the dock' });
    expect(w.placePath(w.dock.x, w.dock.y - 1).ok).toBe(true);
    expect(w.money).toBe(START_MONEY - PATH_COST);
  });

  it('cannot be placed off the island or twice', () => {
    const w = new World();
    expect(w.placePath(w.dock.x, w.size).ok).toBe(false);
    expect(w.placePath(w.dock.x, w.dock.y).ok).toBe(false);
  });

  it('cannot remove the dock tile or a tile that would cut the network', () => {
    const w = new World();
    spine(w, 3);
    const d = w.dock;
    expect(w.removePath(d.x, d.y).ok).toBe(false);
    expect(w.removePath(d.x, d.y - 1).ok).toBe(false); // middle of the spine
    expect(w.removePath(d.x, d.y - 3).ok).toBe(true); // the end is fine
    expect(w.money).toBe(START_MONEY - 3 * PATH_COST + PATH_COST / 2);
  });

  it('cannot remove the last path a building touches', () => {
    const w = new World();
    spine(w, 2);
    const d = w.dock;
    // Rooms west of the spine's end only touch tile (d.x, d.y - 2).
    expect(w.placeBuilding('basicRooms', d.x - 2, d.y - 3, 0).ok).toBe(true);
    const r = w.removePath(d.x, d.y - 2);
    expect(r).toEqual({ ok: false, reason: 'Basic Rooms would lose its path' });
  });
});

describe('buildings', () => {
  it('must touch a path', () => {
    const w = new World();
    expect(w.placeBuilding('snackBar', 0, 0, 0)).toEqual({ ok: false, reason: 'Must touch a path' });
  });

  it('cannot overlap paths, buildings or the sea', () => {
    const w = new World();
    spine(w, 4);
    const d = w.dock;
    expect(w.placeBuilding('snackBar', d.x, d.y - 2, 0).ok).toBe(false); // on the path
    expect(w.placeBuilding('buffet', d.x + 1, d.y - 3, 0).ok).toBe(true);
    expect(w.placeBuilding('snackBar', d.x + 2, d.y - 3, 0)).toEqual({ ok: false, reason: 'Blocked by a building' });
    expect(w.placeBuilding('buffet', 8, 0, 0)).toEqual({ ok: false, reason: 'Outside the island' });
  });

  it('charges the cost and refunds 50% on demolish', () => {
    const w = new World();
    spine(w, 1);
    const d = w.dock;
    const before = w.money;
    const r = w.placeBuilding('buffet', d.x + 1, d.y - 1, 0);
    expect(r.ok).toBe(true);
    expect(w.money).toBe(before - BUILDINGS.buffet.cost);
    expect(w.demolishAt(d.x + 2, d.y).ok).toBe(true);
    expect(w.money).toBe(before - BUILDINGS.buffet.cost / 2);
    expect(w.buildings).toHaveLength(0);
  });

  it('rotation swaps the footprint', () => {
    expect(footprint('buffet', 0)).toEqual({ w: 3, h: 2 });
    expect(footprint('buffet', 1)).toEqual({ w: 2, h: 3 });
    const w = new World();
    spine(w, 3);
    const d = w.dock;
    // 2 wide x 3 tall fits between the spine and x = d.x + 2.
    expect(w.placeBuilding('buffet', d.x + 1, d.y - 3, 1).ok).toBe(true);
    expect(w.buildingAt(d.x + 2, d.y - 1)?.kind).toBe('buffet');
  });

  it('refuses when coins run out', () => {
    const w = new World(10, 1000);
    spine(w, 1);
    expect(w.placeBuilding('basicRooms', w.dock.x + 1, w.dock.y - 1, 0)).toEqual({
      ok: false,
      reason: 'Not enough coins',
    });
  });

  it('the GDD starter layout fits in the budget with a little left over', () => {
    const w = new World();
    const d = w.dock;
    spine(w, 9);
    // Rooms in two columns either side of the spine, plus a buffet and a snack bar.
    const placed = [
      w.placeBuilding('basicRooms', d.x - 2, 0, 0),
      w.placeBuilding('basicRooms', d.x - 2, 2, 0),
      w.placeBuilding('basicRooms', d.x + 1, 0, 0),
      w.placeBuilding('basicRooms', d.x + 1, 2, 0),
      w.placeBuilding('buffet', d.x + 1, 5, 0),
      w.placeBuilding('snackBar', d.x - 1, 7, 0),
    ];
    expect(placed.every((r) => r.ok)).toBe(true);
    expect(w.money).toBeGreaterThan(0);
    expect(w.money).toBeLessThan(3000);
  });
});

describe('snapshots and undo', () => {
  it('round-trips through a snapshot', () => {
    const w = new World();
    spine(w, 2);
    w.placeBuilding('snackBar', w.dock.x + 1, w.dock.y - 1, 0);
    const copy = World.fromSnapshot(JSON.parse(JSON.stringify(w.snapshot())));
    expect(copy.snapshot()).toEqual(w.snapshot());
    expect(copy.buildingAt(w.dock.x + 1, w.dock.y - 1)?.kind).toBe('snackBar');
  });

  it('undoes a whole path stroke as one step, with a full refund', () => {
    const w = new World();
    const h = new History(w);
    h.begin();
    for (const t of manhattanSteps(w.dock, { x: w.dock.x + 2, y: w.dock.y - 2 })) if (w.placePath(t.x, t.y).ok) h.touch();
    h.commit();
    expect(w.pathTiles()).toHaveLength(5);
    expect(h.undo()).toBe(true);
    expect(w.pathTiles()).toHaveLength(1);
    expect(w.money).toBe(START_MONEY);
    expect(h.canUndo).toBe(false);
  });

  it('does not record failed edits', () => {
    const w = new World();
    const h = new History(w);
    h.run(() => w.placeBuilding('snackBar', 0, 0, 0));
    expect(h.canUndo).toBe(false);
  });
});

describe('land plots (Pass 1)', () => {
  it('starts with a 14×14 island in the middle of a 28×28 map', () => {
    const w = World.newGame();
    expect(w.size).toBe(28);
    let land = 0;
    for (let y = 0; y < w.size; y++) for (let x = 0; x < w.size; x++) if (w.isLand(x, y)) land++;
    expect(land).toBe(14 * 14);
    expect(w.isLand(w.dock.x, w.dock.y)).toBe(true);
    expect(w.isPath(w.dock.x, w.dock.y)).toBe(true);
    expect(w.isLand(w.dock.x, w.dock.y + 1)).toBe(false); // the harbour
  });

  it('cannot build on land you don’t own', () => {
    const w = World.newGame();
    expect(w.placePath(w.dock.x, w.dock.y + 1)).toEqual({ ok: false, reason: 'Buy this land first' });
    const d = w.dock;
    for (let y = d.y - 1; y >= 7; y--) expect(w.placePath(d.x, y).ok).toBe(true);
    expect(w.placePath(d.x, 6)).toEqual({ ok: false, reason: 'Buy this land first' });
  });

  it('buys plots next to the island, at rising prices, then builds on them', () => {
    const w = World.newGame(100000);
    const north = w.plotAt(10, 3)!;
    const corner = w.plotAt(3, 3)!;
    expect(w.canBuyPlot(corner.id)).toEqual({ ok: false, reason: 'Buy land next to your island first' });
    const price1 = w.plotPrice;
    expect(price1).toBe(PLOT_BASE_PRICE);
    const before = w.money;
    expect(w.buyPlot(north.id).ok).toBe(true);
    expect(w.money).toBe(before - price1);
    expect(w.isLand(10, 3)).toBe(true);
    expect(w.plotPrice).toBeGreaterThan(price1);
    // The corner now shares a side with the plot just bought.
    expect(w.canBuyPlot(corner.id).ok).toBe(true);
    // Extend the spine onto the new land.
    const d = w.dock;
    for (let y = d.y - 1; y >= 0; y--) expect(w.placePath(d.x, y).ok).toBe(true);
    expect(w.placeBuilding('basicRooms', d.x - 2, 1, 0).ok).toBe(true);
    expect(w.placeBuilding('basicRooms', d.x + 1, 1, 0)).toEqual({ ok: false, reason: 'Buy this land first' });
  });

  it('never sells the harbour, owned land, or land it can’t afford', () => {
    const w = World.newGame(1000);
    const harbour = w.plotAt(w.dock.x, w.dock.y + 1)!;
    expect(w.canBuyPlot(harbour.id)).toEqual({ ok: false, reason: 'The harbour stays open water' });
    expect(w.canBuyPlot(w.plotAt(10, 10)!.id)).toEqual({ ok: false, reason: 'You already own this land' });
    expect(w.canBuyPlot(w.plotAt(10, 3)!.id)).toEqual({ ok: false, reason: 'Not enough coins' });
  });

  it('plot purchases survive snapshots and undo', () => {
    const w = World.newGame(100000);
    const h = new History(w);
    const p = w.plotAt(10, 3)!;
    h.run(() => w.buyPlot(p.id));
    const copy = World.fromSnapshot(JSON.parse(JSON.stringify(w.snapshot())));
    expect(copy.isLand(10, 3)).toBe(true);
    h.undo();
    expect(w.isLand(10, 3)).toBe(false);
    expect(w.money).toBe(100000);
  });
});
