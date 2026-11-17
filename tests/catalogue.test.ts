import { describe, expect, it } from 'vitest';
import { BUILDINGS, BUILDING_KINDS } from '../src/sim/buildings';
import { matchScore } from '../src/sim/match';
import { VENUES } from '../src/sim/needs';
import { PATIENCE_SECONDS, SECONDS_PER_GAME_HOUR, Sim, TICK } from '../src/sim/sim';
import { World } from '../src/sim/world';

function runHours(sim: Sim, hours: number): void {
  const ticks = Math.round((hours * SECONDS_PER_GAME_HOUR) / TICK);
  for (let i = 0; i < ticks; i++) sim.step();
}

/** A 14×14 island with a long spine from the dock, and lots of money. */
function bigIsland(): World {
  const w = new World(14, 200000);
  const d = w.dock;
  for (let y = d.y - 1; y >= 0; y--) w.placePath(d.x, y);
  return w;
}

describe('catalogue (Pass 1)', () => {
  it('every building has a quality class and an unlock tier', () => {
    for (const k of BUILDING_KINDS) {
      const d = BUILDINGS[k];
      expect([1, 2, 3, 4]).toContain(d.quality);
      expect(d.unlock).toBeGreaterThanOrEqual(0);
    }
    expect(BUILDINGS.basicRooms.unlock).toBe(0);
    expect(BUILDINGS.standardRooms.quality).toBe(2);
  });

  it('shore buildings must have a side on the water', () => {
    const w = bigIsland();
    const d = w.dock;
    // Inland, next to the spine.
    expect(w.placeBuilding('beachBar', d.x + 1, 5, 0)).toEqual({ ok: false, reason: 'Must be on the shore' });
    // At the top edge of the island.
    expect(w.placeBuilding('beachBar', d.x + 1, 0, 0).ok).toBe(true);
  });

  it('couples match Standard Rooms better than Basic Rooms', () => {
    const w = bigIsland();
    const d = w.dock;
    const basic = w.placeBuilding('basicRooms', d.x + 1, 2, 0).building!;
    const standard = w.placeBuilding('standardRooms', d.x - 2, 2, 0).building!;
    const sim = new Sim(w);
    const couple = { tier: 2, wishes: [] };
    expect(matchScore(sim.paths, w, couple, standard).score).toBeGreaterThan(matchScore(sim.paths, w, couple, basic).score);
    expect(sim.roomRate(standard)).toBeGreaterThan(sim.roomRate(basic));
  });

  it('the pool is free to use and fills fun and comfort', () => {
    const w = bigIsland();
    const d = w.dock;
    w.placeBuilding('basicRooms', d.x + 1, 2, 0);
    w.placeBuilding('basicRooms', d.x - 2, 2, 0);
    const pool = w.placeBuilding('pool', d.x + 1, 5, 0).building!;
    const sim = new Sim(w);
    sim.autoCheckIn = true;
    const start = w.money;
    let poolSales = 0;
    sim.on((e) => e.type === 'purchase' && e.buildingId === pool.id && poolSales++);
    runHours(sim, 14);
    expect(VENUES.pool!.basePrice).toBe(0);
    expect(sim.venue(pool.id).visitsToday).toBeGreaterThan(0);
    expect(sim.venue(pool.id).revenueToday).toBe(0);
    expect(poolSales).toBe(0);
    expect(w.money).toBe(start); // no food here, so no income before the night
  });

  it('fun venues earn money from guests with nothing else to do', () => {
    const w = bigIsland();
    const d = w.dock;
    w.placeBuilding('basicRooms', d.x + 1, 2, 0);
    w.placeBuilding('basicRooms', d.x - 2, 2, 0);
    const shop = w.placeBuilding('giftShop', d.x + 1, 5, 0).building!;
    const bar = w.placeBuilding('beachBar', d.x - 2, 0, 0).building!;
    const sim = new Sim(w);
    sim.autoCheckIn = true;
    const sales = { shop: 0, bar: 0 };
    sim.on((e) => {
      if (e.type !== 'purchase') return;
      if (e.buildingId === shop.id) sales.shop++;
      if (e.buildingId === bar.id) sales.bar++;
    });
    for (let day = 0; day < 2; day++) runHours(sim, 16);
    expect(sales.shop + sales.bar).toBeGreaterThan(0);
  });

  it('a Front Desk makes arrivals wait longer and enables auto-assign', () => {
    const w = bigIsland();
    const d = w.dock;
    w.placeBuilding('basicRooms', d.x + 1, 2, 0);
    const sim = new Sim(w);
    for (let i = 0; !sim.queue.length && i < 100000; i++) sim.step();
    expect(sim.queue[0].patience).toBe(PATIENCE_SECONDS);
    expect(sim.autoCheckInAll()).toBe(0);
    w.placeBuilding('frontDesk', d.x - 2, 8, 0);
    expect(sim.hasFrontDesk).toBe(true);
    expect(sim.autoCheckInAll()).toBeGreaterThan(0);
  });
});
