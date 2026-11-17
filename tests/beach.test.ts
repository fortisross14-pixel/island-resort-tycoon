import { describe, expect, it } from 'vitest';
import { islandLayout } from '../src/sim/islands';
import { SECONDS_PER_GAME_HOUR, Sim, TICK } from '../src/sim/sim';
import { WELCOME_LEVELS, World } from '../src/sim/world';
import { COVE_BEACH, coconutWorld } from './coconut';

function runDays(sim: Sim, days: number): void {
  const ticks = Math.round((16.1 * SECONDS_PER_GAME_HOUR) / TICK);
  for (let d = 0; d < days; d++) for (let i = 0; i < ticks; i++) sim.step();
}

/** Coconut Key with rooms, food, and the cove beach tagged beside the path down to it. */
function resort(): { w: World; sim: Sim } {
  const w = coconutWorld();
  for (const t of COVE_BEACH) expect(w.setBeach(t.x, t.y, true).ok).toBe(true);
  let rooms = 0;
  for (let y = 9; y < 15 && rooms < 3; y++) for (let x = 3; x < 20 && rooms < 3; x++) if (w.placeBuilding('basicRooms', x, y, 0).ok) rooms++;
  w.placeBuilding('snackBar', 13, 13, 0);
  const sim = new Sim(w);
  sim.autoCheckIn = true;
  return { w, sim };
}

describe('the beach area (Pass 5)', () => {
  it('is tagged on owned sand only, and is free', () => {
    const w = World.onIsland(islandLayout('coconutKey'), 5000);
    const d = w.dock;
    const before = w.money;
    expect(w.setBeach(d.x - 1, d.y, true).ok).toBe(true);
    expect(w.money).toBe(before);
    expect(w.setBeach(d.x, d.y, true)).toEqual({ ok: false, reason: 'That’s a path' });
    // Grass up on the hill is not a beach.
    let grass: { x: number; y: number } | null = null;
    for (let y = 0; y < w.size && !grass; y++) for (let x = 0; x < w.size && !grass; x++) if (w.isLand(x, y) && w.terrainAt(x, y) === 'g') grass = { x, y };
    expect(w.setBeach(grass!.x, grass!.y, true)).toEqual({ ok: false, reason: 'A beach needs sand' });
  });

  it('beach buildings go on it, inland ones stay off it, and beach services need a path to the beach', () => {
    const { w } = resort();
    expect(w.canPlaceBuilding('basicRooms', 8, 15, 0)).toEqual({ ok: false, reason: 'Not on the beach area' });
    expect(w.canPlaceBuilding('lifeguardTower', 13, 14, 0)).toEqual({ ok: false, reason: 'Goes on the beach area' });
    expect(w.placeBuilding('lifeguardTower', 10, 16, 0).ok).toBe(true);
    expect(w.placeBuilding('umbrella', 10, 17, 0).ok).toBe(true);
    // A beach no path reaches can't be served yet.
    const lone = World.onIsland(islandLayout('coconutKey'), 50000);
    lone.setBeach(13, 16, true);
    expect(lone.canPlaceBuilding('lifeguardTower', 13, 16, 0)).toEqual({ ok: false, reason: 'Lay a path to the beach first' });
  });

  it('guests spend time on the beach; towels and lockers earn a little', () => {
    const { w, sim } = resort();
    expect(w.placeBuilding('towelRental', 9, 16, 0).ok).toBe(true);
    expect(w.placeBuilding('lockers', 8, 16, 0).ok).toBe(true);
    let lounged = 0;
    let beachTake = 0;
    sim.on((e) => {
      if (e.type === 'night') beachTake += e.report.stats.beach ?? 0;
    });
    const ticks = Math.round((16.1 * SECONDS_PER_GAME_HOUR) / TICK) * 3;
    for (let i = 0; i < ticks; i++) {
      sim.step();
      if (sim.guests.some((g) => g.state === 'lounging')) lounged++;
    }
    expect(lounged).toBeGreaterThan(0);
    expect(beachTake).toBeGreaterThan(0);
  });

  it('a lifeguard on duty and beach services make the beach better', () => {
    const { w, sim } = resort();
    const bare = sim.beachQuality();
    const tower = w.placeBuilding('lifeguardTower', 10, 16, 0).building!;
    expect(sim.beachQuality()).toBe(bare); // a tower without a lifeguard doesn't help
    sim.offerStaff('security');
    const g = sim.hire('security', 0);
    if (!g.ok) throw new Error(g.reason);
    sim.assignPost(g.worker.id, tower.id);
    expect(sim.beachGuarded).toBe(true);
    const guarded = sim.beachQuality();
    expect(guarded).toBeGreaterThan(bare + 20);
    expect(w.placeBuilding('changingRooms', 8, 15, 0).ok).toBe(true);
    expect(sim.beachQuality()).toBeGreaterThan(guarded);
  });
});

describe('the Welcome Center (Pass 5)', () => {
  it('stands next to the pier, and can be neither moved nor bulldozed', () => {
    const w = World.onIsland(islandLayout('coconutKey'), 13000);
    const wc = w.placeWelcomeCenter()!;
    expect(wc).toBeTruthy();
    expect(Math.abs(wc.x - w.dock.x) + Math.abs(wc.y - w.dock.y)).toBeLessThanOrEqual(4);
    // It leaves the way inland from the dock free.
    expect(w.placePath(w.dock.x, w.dock.y - 1).ok).toBe(true);
    expect(w.money).toBe(13000 - 10); // only the path just laid
    expect(w.demolishAt(wc.x, wc.y)).toEqual({ ok: false, reason: 'This one stays where it is' });
    expect(w.canMoveBuilding(wc.id, wc.x, wc.y - 2, 0)).toEqual({ ok: false, reason: 'This one stays where it is' });
    expect(w.placeWelcomeCenter()).toBeNull();
  });

  it('sets how many parties arrive a month; upgrades raise it', () => {
    const w = World.onIsland(islandLayout('coconutKey'), 2000);
    const wc = w.placeWelcomeCenter()!;
    const sim = new Sim(w);
    expect(sim.welcomeCapacity).toBe(WELCOME_LEVELS[0].parties);
    expect(WELCOME_LEVELS[0].parties).toBe(1);
    expect(w.upgrade(wc.id).ok).toBe(true);
    expect(w.money).toBe(2000 - WELCOME_LEVELS[1].cost);
    expect(sim.welcomeCapacity).toBe(3);
    // The next level costs more than is left.
    expect(w.canUpgrade(wc.id).ok).toBe(false);
  });

  it('drinks and flowers cost a little per guest and are remembered; a greeter keeps the queue patient', () => {
    const { w, sim } = resort();
    w.placeWelcomeCenter();
    sim.welcome = { drinks: true, leis: true };
    sim.offerStaff('operations');
    const g = sim.hire('operations', 0);
    if (!g.ok) throw new Error(g.reason);
    expect(sim.assignShift(g.worker.id, 'afternoon', 'greet')).toEqual({ ok: false, reason: 'Greeting happens in the morning' });
    sim.assignShift(g.worker.id, 'morning', 'greet');
    expect(sim.greetingActive).toBe(true);
    let cost = 0;
    sim.on((e) => {
      if (e.type === 'night') cost = -(e.report.costs.find((c) => c.name.startsWith('Welcome'))?.amount ?? 0);
    });
    runDays(sim, 1);
    expect(cost).toBeGreaterThan(0);
    const memories = sim.guests.flatMap((x) => x.memories.map((m) => m.text));
    expect(memories).toContain('a welcome drink on arrival');
    expect(memories).toContain('such a warm welcome at the pier');
  });
});
