import { describe, expect, it } from 'vitest';
import { ISLANDS, islandLayout } from '../src/sim/islands';
import { JUNGLE_CLEAR_COST, World, type Layout } from '../src/sim/world';
import { BUILDINGS } from '../src/sim/buildings';
import { SCENARIOS } from '../src/sim/scenario';
import { Sim, TICK } from '../src/sim/sim';

describe('authored islands', () => {
  for (const def of ISLANDS)
    describe(def.name, () => {
      const size = def.terrain.length;

      it('has square layers of the same size with known codes', () => {
        for (const layer of [def.terrain, def.heights, def.plots]) {
          expect(layer.length).toBe(size);
          for (const row of layer) expect(row.length).toBe(size);
        }
        expect(def.terrain.join('')).toMatch(/^[~\-*osgjk]+$/);
        expect(def.heights.join('')).toMatch(/^[.0-3]+$/);
        // Water is never raised, and only land belongs to a plot.
        for (let y = 0; y < size; y++)
          for (let x = 0; x < size; x++) {
            const land = 'sgjk'.includes(def.terrain[y][x]);
            if (!land) expect(def.heights[y][x]).toBe('.');
            if (!land) expect(def.plots[y][x]).toBe('.');
          }
      });

      it('has a dock on sand at sea level, in a starting plot, with water to the south', () => {
        const { x, y } = def.dock;
        expect(def.terrain[y][x]).toBe('s');
        expect(def.heights[y][x]).toBe('.');
        expect(def.start).toContain(def.plots[y][x]);
        expect('~-*').toContain(def.terrain[y + 1][x]);
      });

      it('puts land landmarks on land and sea life on the water', () => {
        for (const l of def.landmarks) {
          const t = def.terrain[l.y][l.x];
          if (['waterfall', 'ruins', 'viewpoint', 'cave'].includes(l.kind)) expect('sgjk', l.name).toContain(t);
          else expect('~-*o', l.name).toContain(t);
        }
      });

      it('lets every plot be bought eventually, one neighbour at a time', () => {
        const w = World.onIsland(islandLayout(def.id), 10_000_000);
        for (let round = 0; round < 30; round++) for (const p of w.plots) if (!p.owned) w.buyPlot(p.id);
        expect(w.plots.every((p) => p.owned)).toBe(true);
      });

      it('starts with enough flat, buildable land for a small resort', () => {
        const w = World.onIsland(islandLayout(def.id));
        let flat = 0;
        for (let y = 0; y < w.size; y++)
          for (let x = 0; x < w.size; x++) if (w.isLand(x, y) && 'sg'.includes(w.terrainAt(x, y)) && w.heightAt(x, y) === 0) flat++;
        expect(flat).toBeGreaterThanOrEqual(40);
      });
    });

  it('puts every mission on a known island', () => {
    for (const s of SCENARIOS) expect(ISLANDS.map((i) => i.id)).toContain(s.island);
  });
});

/** A 6×6 test island: a hill of level 1 and 2 on the right, rock and jungle. */
function hillLayout(): Layout {
  const terrain = ['gggggg', 'gggjjg', 'ggggkg', 'gggggg', 'gggggg', 'gggggg'].join('');
  const heights = ['000122', '000122', '000122', '000011', '000000', '000000'].join('');
  return {
    id: 'test',
    size: 6,
    dock: { x: 1, y: 5 },
    plots: [{ id: 0, x: 0, y: 0, w: 6, h: 6, owned: true, buyable: false }],
    terrain,
    heights,
    plotMap: 'A'.repeat(36),
  };
}

describe('terrain rules', () => {
  it('climbs one level at a time with stairs, never two', () => {
    const w = new World(hillLayout(), 100000);
    for (const [x, y] of [
      [1, 4],
      [2, 4],
      [3, 4],
      [3, 3],
    ])
      expect(w.placePath(x, y).ok).toBe(true);
    // (4,3) is level 1 next to (3,3) at level 0: stairs.
    expect(w.placePath(4, 3).ok).toBe(true);
    expect(w.linked(3, 3, 4, 3)).toBe(true);
    // (4,2) is level 2 next to level 1 at (4,3)? No: (4,2) is rock. (5,3) is level 1, (5,2) level 2.
    expect(w.placePath(4, 2)).toEqual({ ok: false, reason: 'Too rocky for a path' });
    expect(w.placePath(5, 3).ok).toBe(true);
    expect(w.placePath(5, 2).ok).toBe(true);
    // A cliff: level 0 at (3,2) beside level 2 at... (3,2) is level 1. Build (2,3)→(2,2) at 0, then (3,1) is 1.
    const tall = new World({ ...hillLayout(), heights: ['000222', '000222', '000222', '000000', '000000', '000000'].join('') }, 100000);
    for (const [x, y] of [
      [1, 4],
      [2, 4],
      [2, 3],
      [2, 2],
    ])
      expect(tall.placePath(x, y).ok).toBe(true);
    expect(tall.placePath(3, 2)).toEqual({ ok: false, reason: 'Too steep: climb one level at a time' });
  });

  it('only builds on flat ground, never on rock or water', () => {
    const w = new World(hillLayout(), 100000);
    w.placePath(1, 4);
    w.placePath(2, 4);
    expect(w.canPlaceBuilding('basicRooms', 2, 2, 0)).toEqual({ ok: false, reason: 'Needs flat ground' });
    expect(w.canPlaceBuilding('basicRooms', 0, 2, 0).ok).toBe(true);
  });

  it('clears jungle for a fee and turns it to grass', () => {
    const w = new World({ ...hillLayout(), heights: '0'.repeat(36) }, 100000);
    for (const [x, y] of [
      [1, 4],
      [1, 3],
      [1, 2],
      [1, 1],
      [2, 1],
    ])
      expect(w.placePath(x, y).ok).toBe(true);
    const before = w.money;
    expect(w.buildCost('basicRooms', 3, 0, 0)).toBe(BUILDINGS.basicRooms.cost + 2 * JUNGLE_CLEAR_COST);
    expect(w.placeBuilding('basicRooms', 3, 0, 0).ok).toBe(true);
    expect(before - w.money).toBe(BUILDINGS.basicRooms.cost + 2 * JUNGLE_CLEAR_COST);
    expect(w.terrainAt(3, 1)).toBe('g');
    // Undo-style restore brings the jungle back.
    const snap = new World({ ...hillLayout(), heights: '0'.repeat(36) }, 100000).snapshot();
    w.restore(snap);
    expect(w.terrainAt(3, 1)).toBe('j');
  });

  it('prices plots by their land area', () => {
    const w = World.onIsland(islandLayout('twinPalms'));
    const prices = w.plots.filter((p) => !p.owned).map((p) => ({ tiles: w.plotTiles(p.id).length, price: w.priceOf(p.id) }));
    const big = prices.reduce((a, b) => (b.tiles > a.tiles ? b : a));
    const small = prices.reduce((a, b) => (b.tiles < a.tiles ? b : a));
    expect(big.price).toBeGreaterThan(small.price);
  });

  it('saves and reloads an island with its terrain', () => {
    const w = World.onIsland(islandLayout('coconutKey'));
    const back = World.fromSnapshot(JSON.parse(JSON.stringify(w.snapshot())));
    expect(back.size).toBe(w.size);
    expect(back.terrainAt(10, 7)).toBe(w.terrainAt(10, 7));
    expect(back.heightAt(11, 7)).toBe(w.heightAt(11, 7));
  });

  it('switches island in place for a new game (the views keep their World)', () => {
    const w = World.onIsland(islandLayout('coconutKey'));
    w.restore(World.onIsland(islandLayout('twinPalms')).snapshot());
    expect(w.size).toBe(36);
    expect(w.layout.id).toBe('twinPalms');
    expect(w.isPath(w.dock.x, w.dock.y)).toBe(true);
  });
});

describe('playing on an island', () => {
  it('runs a first month on Coconut Key: guests arrive, check in and spend', () => {
    const w = World.onIsland(islandLayout('coconutKey'), 30000);
    const d = w.dock;
    // A spine north from the dock and a cross path.
    for (let y = d.y - 1; y >= 11; y--) expect(w.placePath(d.x, y).ok).toBe(true);
    for (let x = d.x - 1; x >= 9; x--) w.placePath(x, 14);
    for (let x = d.x + 1; x <= 17; x++) w.placePath(x, 14);
    let rooms = 0;
    let food = 0;
    for (let y = 9; y < 20; y++)
      for (let x = 5; x < 20; x++) {
        if (rooms < 3 && w.placeBuilding('basicRooms', x, y, 0).ok) rooms++;
        else if (food < 1 && w.placeBuilding('snackBar', x, y, 0).ok) food++;
      }
    expect(rooms).toBe(3);
    expect(food).toBe(1);
    const sim = new Sim(w);
    sim.autoCheckIn = true;
    let report: { income: Array<{ amount: number }> } | null = null;
    let checkedIn = 0;
    sim.on((e) => {
      if (e.type === 'night') report = e.report;
      if (e.type === 'checkedIn') checkedIn++;
    });
    const steps = Math.ceil((16.2 * 12.5) / TICK);
    for (let i = 0; i < steps && !report; i++) sim.step();
    expect(checkedIn).toBeGreaterThan(0);
    expect(report).not.toBeNull();
    const income = report!.income.reduce((a, l) => a + l.amount, 0);
    expect(income).toBeGreaterThan(0);
  });
});
