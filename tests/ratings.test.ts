import { describe, expect, it } from 'vitest';
import { BUILDINGS, RATING_CATEGORIES } from '../src/sim/buildings';
import { AppealMap, WEIGHTS, emptyScores, addScore, overallScore } from '../src/sim/ratings';
import { categoryRating, type Review } from '../src/sim/reviews';
import { SECONDS_PER_GAME_HOUR, Sim, TICK } from '../src/sim/sim';
import { World } from '../src/sim/world';

/** A 16×16 island with a spine from the dock and two side paths. */
function island(money = 200000): World {
  const w = new World(16, money);
  const d = w.dock;
  for (let y = d.y - 1; y >= 1; y--) w.placePath(d.x, y);
  for (let x = d.x - 1; x >= 1; x--) w.placePath(x, 8);
  for (let x = d.x + 1; x < 15; x++) w.placePath(x, 8);
  return w;
}

function runDays(sim: Sim, days: number): void {
  const ticks = Math.round((16.1 * SECONDS_PER_GAME_HOUR) / TICK);
  for (let d = 0; d < days; d++) for (let i = 0; i < ticks; i++) sim.step();
}

describe('decoration appeal', () => {
  it('decor raises appeal around it, fading with distance', () => {
    const w = island();
    const appeal = new AppealMap(w);
    const before = appeal.at(4, 4);
    expect(w.placeBuilding('tikiTotem', 4, 4, 0).ok).toBe(true);
    expect(appeal.at(4, 4)).toBeGreaterThan(before + 10);
    expect(appeal.at(5, 4)).toBeGreaterThan(appeal.at(6, 4));
    expect(appeal.at(4, 12)).toBeCloseTo(before, 5);
  });

  it('three of a theme together look better; mixing themes clashes', () => {
    const themed = island();
    for (const [k, x] of [['tikiTorch', 3], ['flowerBed', 4], ['tikiTorch', 5]] as const) themed.placeBuilding(k, x, 3, 0);
    const mixed = island();
    for (const [k, x] of [['tikiTorch', 3], ['bunting', 4], ['flowerBed', 5], ['hammocks', 6]] as const) mixed.placeBuilding(k, x, 3, 0);
    const a = new AppealMap(themed).at(4, 4);
    const plain = island();
    for (const [k, x] of [['lampPost', 3], ['lampPost', 4], ['lampPost', 5]] as const) plain.placeBuilding(k, x, 3, 0);
    // Same appeal per item would be lower without the theme bonus.
    expect(a).toBeGreaterThan(new AppealMap(plain).at(4, 4));
    const m = new AppealMap(mixed);
    // The mixed set has more items but loses the bonus and clashes.
    expect(m.at(4, 4)).toBeLessThan(a + 8);
  });

  it('too much decor in one spot is clutter', () => {
    const w = island();
    const appeal = new AppealMap(w);
    for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) w.placeBuilding('bench', x, y, 0);
    const crowded = appeal.at(3, 3);
    const w2 = island();
    for (const [x, y] of [[2, 2], [4, 2], [2, 4], [4, 4]]) w2.placeBuilding('bench', x, y, 0);
    // Nine benches score little more than four: the extra five are clutter.
    expect(crowded).toBeLessThan(new AppealMap(w2).at(3, 3) + 6);
  });

  it('decor needs no path, beach items need sand, and decor never blocks removing a path', () => {
    const w = island();
    expect(w.placeBuilding('palmTree', 1, 1, 0).ok).toBe(true);
    // The prototype map has no sand, so beach items are allowed anywhere there.
    expect(w.placeBuilding('beachChairs', 1, 3, 0).ok).toBe(true);
    w.placePath(2, 7);
    w.placeBuilding('bench', 2, 6, 0);
    expect(w.removePath(2, 7).ok).toBe(true);
  });
});

describe('condition and maintenance', () => {
  function resort(level: 'low' | 'normal' | 'high'): { w: World; sim: Sim } {
    const w = island();
    const d = w.dock;
    w.placeBuilding('basicRooms', d.x + 1, 2, 0);
    w.placeBuilding('snackBar', d.x - 1, 3, 0);
    const sim = new Sim(w);
    sim.autoCheckIn = true;
    sim.maintenance = level;
    return { w, sim };
  }

  it('buildings wear every month, slower with more maintenance', () => {
    const cond = (level: 'low' | 'normal' | 'high') => {
      const { w, sim } = resort(level);
      runDays(sim, 6);
      return w.buildings.find((b) => b.kind === 'basicRooms')!.condition!;
    };
    const low = cond('low');
    const normal = cond('normal');
    const high = cond('high');
    expect(normal).toBeLessThan(100);
    expect(low).toBeLessThan(normal);
    expect(high).toBeGreaterThan(normal);
    // Normal maintenance: roughly 100 → 70 over two years.
    expect(normal).toBeGreaterThan(88);
  });

  it('low maintenance saves money, high costs more', () => {
    const upkeep = (level: 'low' | 'normal' | 'high') => {
      const { sim } = resort(level);
      let cost = 0;
      sim.on((e) => {
        if (e.type === 'night') cost = -e.report.costs.filter((c) => c.name === 'Upkeep' || c.name === 'Maintenance').reduce((s, c) => s + c.amount, 0);
      });
      runDays(sim, 1);
      return cost;
    };
    expect(upkeep('low')).toBeLessThan(upkeep('normal'));
    expect(upkeep('high')).toBeGreaterThan(upkeep('normal'));
  });

  it('repairs cost a share of the building and restore it', () => {
    const w = island();
    const b = w.placeBuilding('basicRooms', 9, 2, 0).building!;
    expect(w.repair(b.id)).toEqual({ ok: false, reason: 'It’s in good shape' });
    b.condition = 50;
    expect(w.repairCost(b.id)).toBe(Math.round((BUILDINGS.basicRooms.cost * 0.4 * 0.5) / 10) * 10);
    const before = w.money;
    expect(w.repair(b.id).ok).toBe(true);
    expect(b.condition).toBe(100);
    expect(before - w.money).toBe(300);
  });

  it('run-down rooms earn worse lodging reviews', () => {
    const lodging = (condition: number) => {
      const { w, sim } = resort('normal');
      for (const b of w.buildings) b.condition = condition;
      runDays(sim, 4);
      return sim.categoryRating('lodging');
    };
    expect(lodging(20)).toBeLessThan(lodging(100));
  });
});

describe('the four ratings', () => {
  it('every guest type weighs the four ratings to a total of 1', () => {
    for (const w of Object.values(WEIGHTS)) expect(RATING_CATEGORIES.reduce((s, c) => s + w[c], 0)).toBeCloseTo(1, 5);
  });

  it('VIPs care most about lodging, party groups about amenities', () => {
    const s = emptyScores();
    addScore(s, 'lodging', 90);
    addScore(s, 'amenities', 30);
    addScore(s, 'activities', 50);
    addScore(s, 'decor', 50);
    expect(overallScore('vip', s)).toBeGreaterThan(overallScore('party', s));
  });

  it('reviews carry a star per category, and old reviews count their overall', () => {
    const old: Review = { id: 1, day: 1, guestType: 'couple', stars: 5, text: '', buildingId: null };
    const now: Review = { ...old, id: 2, stars: 3, cats: { lodging: 1, amenities: 5, activities: 3, decor: 3 } };
    const waited: Review = { ...old, id: 3, stars: 1, cats: { lodging: 1, amenities: 1 } };
    expect(categoryRating([old], 'decor')).toBeGreaterThan(2.9);
    expect(categoryRating([now], 'lodging')).toBeLessThan(categoryRating([now], 'amenities'));
    // A party that never got a room doesn't judge the decoration.
    expect(categoryRating([waited], 'decor')).toBe(categoryRating([], 'decor'));
  });

  it('a running resort writes reviews with all four categories', () => {
    const w = island();
    const d = w.dock;
    w.placeBuilding('basicRooms', d.x + 1, 2, 0);
    w.placeBuilding('basicRooms', d.x + 1, 5, 0);
    w.placeBuilding('snackBar', d.x - 1, 3, 0);
    w.placeBuilding('palmTree', d.x - 1, 5, 0);
    const sim = new Sim(w);
    sim.autoCheckIn = true;
    runDays(sim, 4);
    const withCats = sim.reviews.filter((r) => r.cats?.decor !== undefined);
    expect(withCats.length).toBeGreaterThan(0);
    for (const r of withCats) for (const c of RATING_CATEGORIES) expect(r.cats![c]).toBeGreaterThanOrEqual(1);
    expect(Object.keys(sim.ratings)).toEqual(['overall', 'lodging', 'amenities', 'activities', 'decor']);
  });
});
