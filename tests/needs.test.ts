import { describe, expect, it } from 'vitest';
import { VENUES, buyChance, priceOf, type PriceStep } from '../src/sim/needs';
import { SECONDS_PER_GAME_HOUR, Sim, TICK, type SimEvent } from '../src/sim/sim';
import { World } from '../src/sim/world';

function starterResort(): World {
  const w = new World();
  const d = w.dock;
  for (let y = d.y - 1; y >= 0; y--) w.placePath(d.x, y);
  w.placeBuilding('basicRooms', d.x - 2, 0, 0);
  w.placeBuilding('basicRooms', d.x - 2, 2, 0);
  w.placeBuilding('basicRooms', d.x + 1, 0, 0);
  w.placeBuilding('basicRooms', d.x + 1, 2, 0);
  w.placeBuilding('buffet', d.x + 1, 5, 0);
  w.placeBuilding('snackBar', d.x - 1, 7, 0);
  return w;
}

function autoSim(w: World, seed?: number): Sim {
  const s = new Sim(w);
  s.autoCheckIn = true;
  if (seed !== undefined) (s as unknown as { rng: { state: number } }).rng.state = seed;
  return s;
}

function runHours(sim: Sim, hours: number, each?: () => void): void {
  const ticks = Math.round((hours * SECONDS_PER_GAME_HOUR) / TICK);
  for (let i = 0; i < ticks; i++) {
    sim.step();
    each?.();
  }
}

describe('prices', () => {
  it('has five steps around a fair base price', () => {
    expect([0, 1, 2, 3, 4].map((s) => priceOf('snackBar', s as PriceStep))).toEqual([6, 8, 10, 13, 17]);
    expect(priceOf('buffet', 2)).toBe(25);
  });

  it('backpackers are more price-sensitive than couples', () => {
    expect(buyChance('backpacker', 0)).toBeGreaterThan(0.9);
    expect(buyChance('backpacker', 3)).toBeLessThan(buyChance('couple', 3));
    expect(buyChance('couple', 4)).toBeLessThan(0.5);
  });
});

describe('needs and spending', () => {
  it('meters run down while guests are out', () => {
    const sim = autoSim(starterResort());
    // Find a housed guest in the middle of a walk (so this tick can't end at a venue).
    const midWalk = () =>
      sim.guests.find((x) => x.roomId !== null && x.state === 'walking' && x.wp < x.waypoints.length - 2);
    let g = midWalk();
    for (let i = 0; !g && i < 20000; i++) {
      sim.step();
      g = midWalk();
    }
    expect(g).toBeDefined();
    const before = { ...g!.needs };
    sim.step();
    expect(g!.needs.hunger).toBeLessThan(before.hunger);
    expect(g!.needs.fun).toBeLessThan(before.fun);
  });

  it('guests buy food, and every coin lands in the resort’s money', () => {
    const w = starterResort();
    const sim = autoSim(w);
    const start = w.money;
    let fromEvents = 0;
    sim.on((e: SimEvent) => {
      if (e.type === 'purchase') fromEvents += e.amount;
    });
    runHours(sim, 12);
    expect(fromEvents).toBeGreaterThan(0);
    expect(sim.today.spending).toBe(fromEvents);
    // Before the night's room charges and upkeep, the resort keeps sales minus supplies.
    expect(w.money - start).toBe(fromEvents - sim.today.supplies);
    const venueTotal = Object.values(sim.venues).reduce((s, v) => s + v.revenueToday, 0);
    expect(venueTotal).toBe(fromEvents);
  });

  it('never serves more than a venue’s capacity or lets lines grow past their limit', () => {
    const w = starterResort();
    const sim = autoSim(w);
    for (let day = 0; day < 3; day++)
      runHours(sim, 16, () => {
        for (const b of w.buildings) {
          const def = VENUES[b.kind];
          if (!def) continue;
          const v = sim.venue(b.id);
          expect(v.serving).toBeLessThanOrEqual(def.capacity);
          expect(v.line.length).toBeLessThanOrEqual(def.lineMax);
        }
      });
  });

  it('nobody spends more than their wallet', () => {
    const sim = autoSim(starterResort());
    runHours(sim, 14, () => {
      for (const g of sim.guests) expect(g.wallet).toBeGreaterThanOrEqual(0);
    });
  });

  it('luxury prices lose customers compared with bargain prices', () => {
    const visits = (step: PriceStep) => {
      const w = starterResort();
      const sim = autoSim(w, 99);
      for (const b of w.buildings) if (VENUES[b.kind]) sim.setPrice(b.id, step);
      let v = 0;
      let lost = 0;
      for (let day = 0; day < 3; day++) {
        runHours(sim, 15.9);
        for (const b of w.buildings)
          if (VENUES[b.kind]) {
            v += sim.venue(b.id).visitsToday;
            lost += sim.venue(b.id).lostToday;
          }
        runHours(sim, 0.2);
      }
      return { v, lost };
    };
    const bargain = visits(0);
    const luxury = visits(4);
    expect(luxury.v).toBeLessThan(bargain.v * 0.6);
    expect(luxury.lost).toBeGreaterThan(bargain.lost);
  });

  it('the 12-tile rule: a far venue gets far fewer visits than a near one', () => {
    const w = new World();
    const d = w.dock;
    // Spine up from the dock, along the top edge, and down the west edge.
    for (let y = d.y - 1; y >= 0; y--) w.placePath(d.x, y);
    for (let x = d.x - 1; x >= 0; x--) w.placePath(x, 0);
    for (let y = 1; y <= 9; y++) w.placePath(0, y);
    w.placeBuilding('basicRooms', d.x + 1, d.y - 3, 0);
    w.placeBuilding('basicRooms', d.x + 1, d.y - 5, 0);
    const near = w.placeBuilding('snackBar', d.x - 1, d.y - 3, 0).building!;
    const far = w.placeBuilding('snackBar', 1, 8, 0).building!;
    const sim = autoSim(w, 7);
    let nearVisits = 0;
    let farVisits = 0;
    sim.on((e) => {
      if (e.type !== 'purchase') return;
      if (e.buildingId === near.id) nearVisits++;
      if (e.buildingId === far.id) farVisits++;
    });
    for (let day = 0; day < 3; day++) runHours(sim, 16);
    expect(nearVisits).toBeGreaterThan(5);
    expect(farVisits).toBeLessThan(nearVisits * 0.25);
  });

  it('keeps venue prices and stats through a snapshot', () => {
    const w = starterResort();
    const sim = autoSim(w);
    const buffet = w.buildings.find((b) => b.kind === 'buffet')!;
    sim.setPrice(buffet.id, 4);
    runHours(sim, 6);
    const copy = new Sim(World.fromSnapshot(w.snapshot()));
    copy.restore(JSON.parse(JSON.stringify(sim.snapshot())));
    expect(copy.venue(buffet.id).price).toBe(4);
    expect(copy.venue(buffet.id).visitsToday).toBe(sim.venue(buffet.id).visitsToday);
  });

  it('demolishing a busy venue sends its guests on their way', () => {
    const w = starterResort();
    const sim = autoSim(w);
    runHours(sim, 5);
    const buffet = w.buildings.find((b) => b.kind === 'buffet')!;
    w.removeBuilding(buffet.id);
    runHours(sim, 0.2);
    expect(sim.venues[buffet.id]).toBeUndefined();
    for (const g of sim.guests) expect(g.insideId === buffet.id).toBe(false);
  });
});
