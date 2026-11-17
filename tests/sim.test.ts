import { describe, expect, it } from 'vitest';
import { PathGraph, UNREACHABLE } from '../src/sim/pathGraph';
import {
  DAY_START,
  FERRY_ARRIVES,
  ROOMS_PER_BUILDING,
  SECONDS_PER_GAME_HOUR,
  Sim,
  TICK,
  GUEST_TYPES,
  PATIENCE_SECONDS,
  arrivalsForDay,
  isVisible,
  type SimEvent,
} from '../src/sim/sim';
import { AUTO_PENALTY, matchScore } from '../src/sim/match';
import { World } from '../src/sim/world';

/** The starter layout from world.test: a spine with 4 rooms, a buffet and a snack bar. */
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

/** A sim with Front Desk auto check-in on, for tests about life after check-in. */
function autoSim(w: World): Sim {
  const s = new Sim(w);
  s.autoCheckIn = true;
  return s;
}

function runHours(sim: Sim, hours: number): void {
  const ticks = Math.round((hours * SECONDS_PER_GAME_HOUR) / TICK);
  for (let i = 0; i < ticks; i++) sim.step();
}

describe('PathGraph', () => {
  it('routes along paths, step by step', () => {
    const w = new World();
    const d = w.dock;
    for (let y = d.y - 1; y >= d.y - 3; y--) w.placePath(d.x, y);
    w.placePath(d.x + 1, d.y - 3);
    const g = new PathGraph(w);
    const goal = { x: d.x + 1, y: d.y - 3 };
    const route = g.route('g', [goal], d)!;
    expect(route).toEqual([
      { x: d.x, y: d.y - 1 },
      { x: d.x, y: d.y - 2 },
      { x: d.x, y: d.y - 3 },
      goal,
    ]);
    expect(g.distance('g', [goal], d)).toBe(4);
  });

  it('drops cached distances when the map changes', () => {
    const w = new World();
    const d = w.dock;
    const g = new PathGraph(w);
    const goal = { x: d.x, y: d.y - 2 };
    expect(g.distance('g', [goal], d)).toBe(UNREACHABLE);
    w.placePath(d.x, d.y - 1);
    w.placePath(d.x, d.y - 2);
    expect(g.distance('g', [goal], d)).toBe(2);
  });
});

describe('Sim', () => {
  it('runs the clock from 07:00 and rolls over to the next day', () => {
    const w = starterResort();
    const sim = new Sim(w);
    const days: number[] = [];
    sim.on((e: SimEvent) => e.type === 'newDay' && days.push(e.day));
    expect(sim.clockText).toBe('07:00');
    runHours(sim, 16.1);
    expect(days).toEqual([2]);
    expect(w.day).toBe(2);
    expect(sim.minutes).toBeLessThan(DAY_START + 10);
  });

  it('brings the ferry at 08:00 and lands day 1 guests', () => {
    const sim = autoSim(starterResort());
    const events: string[] = [];
    sim.on((e) => events.push(e.type));
    runHours(sim, (FERRY_ARRIVES - DAY_START) / 60 - 0.05);
    expect(sim.ferry.phase).toBe('away');
    runHours(sim, 1);
    expect(events).toContain('ferryArriving');
    expect(events).toContain('ferryDocked');
    runHours(sim, 1);
    expect(sim.today.arrived).toBe(arrivalsForDay(1));
  });

  it('houses guests up to capacity and turns the rest away', () => {
    const w = starterResort();
    const sim = autoSim(w);
    for (let day = 0; day < 4; day++) runHours(sim, 16);
    const rooms = w.buildings.filter((b) => b.kind === 'basicRooms');
    for (const r of rooms) expect(sim.occupancy(r.id)).toBeLessThanOrEqual(ROOMS_PER_BUILDING);
    const housed = sim.guests.filter((g) => g.roomId !== null).length;
    expect(housed).toBeLessThanOrEqual(rooms.length * ROOMS_PER_BUILDING);
  });

  it('guests walk only on paths and visit food buildings', () => {
    const w = starterResort();
    const sim = autoSim(w);
    let ate = false;
    const ticks = Math.round((10 * SECONDS_PER_GAME_HOUR) / TICK);
    for (let i = 0; i < ticks; i++) {
      sim.step();
      for (const g of sim.guests) {
        if (g.state === 'inside' && g.insideId !== null) {
          const b = w.buildings.find((x) => x.id === g.insideId);
          if (b && b.kind !== 'basicRooms') ate = true;
        }
        if (g.tile) expect(w.isPath(g.tile.x, g.tile.y)).toBe(true);
      }
    }
    expect(ate).toBe(true);
  });

  it('guests check out when their stay ends and leave on the ferry', () => {
    const sim = autoSim(starterResort());
    let departed = 0;
    sim.on((e) => e.type === 'newDay' && (departed += e.yesterday.departed));
    for (let day = 0; day < 6; day++) runHours(sim, 16);
    expect(departed).toBeGreaterThan(0);
    // Nobody is stuck: every guest still around is somewhere sensible.
    for (const g of sim.guests) expect(['walking', 'inside', 'waiting', 'boarding', 'arriving']).toContain(g.state);
  });

  it('copes with the map changing under the guests', () => {
    const w = starterResort();
    const sim = autoSim(w);
    runHours(sim, 2.5);
    const room = w.buildings.find((b) => b.kind === 'basicRooms')!;
    const lodgers = sim.guests.filter((g) => g.roomId === room.id);
    w.removeBuilding(room.id);
    runHours(sim, 0.5);
    for (const g of lodgers) {
      expect(g.roomId).toBeNull();
      expect(g.leaving).toBe(true);
    }
    // Remove the end of the spine while people walk around.
    w.removePath(w.dock.x, 0);
    runHours(sim, 3);
    for (const g of sim.guests) if (g.tile) expect(w.isPath(g.tile.x, g.tile.y)).toBe(true);
  });

  it('parties with no room give up and leave on the ferry, which waits for them', () => {
    const w = new World();
    for (let y = w.dock.y - 1; y >= w.dock.y - 3; y--) w.placePath(w.dock.x, y);
    const sim = new Sim(w);
    runHours(sim, 2.5);
    expect(sim.queue.length).toBe(arrivalsForDay(1));
    expect(sim.ferry.phase).toBe('docked'); // past 09:30 but people are still queuing
    runHours(sim, 2);
    expect(sim.today.turnedAway).toBe(arrivalsForDay(1));
    expect(sim.today.departed).toBeGreaterThan(0);
  });

  it('round-trips through a snapshot and stays deterministic', () => {
    const a = autoSim(starterResort());
    runHours(a, 3);
    const b = new Sim(World.fromSnapshot(a.world.snapshot()));
    b.restore(JSON.parse(JSON.stringify(a.snapshot())));
    runHours(a, 2);
    runHours(b, 2);
    const pos = (s: Sim) => s.guests.filter(isVisible).map((g) => [g.id, g.x.toFixed(3), g.z.toFixed(3)]);
    expect(pos(b)).toEqual(pos(a));
  });
});

describe('check-in (M3)', () => {
  /** Run until the ferry has unloaded everyone into the queue. */
  function untilQueued(sim: Sim): void {
    let n = 0;
    while ((sim.ferry.phase !== 'docked' || sim.ferry.toUnload > 0 || sim.queue.some((g) => g.state === 'arriving')) && n++ < 10000)
      sim.step();
  }

  it('arrivals queue on the pier until placed by hand', () => {
    const w = starterResort();
    const sim = new Sim(w);
    untilQueued(sim);
    expect(sim.queue).toHaveLength(arrivalsForDay(1));
    expect(sim.queue.every((g) => g.state === 'queued' && g.roomId === null)).toBe(true);
    const room = w.buildings.find((b) => b.kind === 'basicRooms')!;
    const g = sim.queue[0];
    const r = sim.checkIn(g.id, room.id);
    expect(r.ok).toBe(true);
    expect(g.roomId).toBe(room.id);
    expect(sim.queue).toHaveLength(arrivalsForDay(1) - 1);
    runHours(sim, 1);
    expect(g.tile).not.toBeNull(); // walked onto the island
  });

  it('refuses full rooms, non-rooms and parties already housed', () => {
    const w = starterResort();
    const sim = new Sim(w);
    untilQueued(sim);
    const [a, b, c] = sim.queue;
    const room = w.buildings.find((x) => x.kind === 'basicRooms')!;
    const buffet = w.buildings.find((x) => x.kind === 'buffet')!;
    expect(sim.checkIn(a.id, buffet.id)).toEqual({ ok: false, reason: 'That isn’t a room' });
    expect(sim.checkIn(a.id, room.id).ok).toBe(true);
    expect(sim.checkIn(a.id, room.id)).toEqual({ ok: false, reason: 'They already have a room' });
    expect(sim.checkIn(b.id, room.id).ok).toBe(true);
    expect(sim.checkIn(c.id, room.id)).toEqual({ ok: false, reason: 'No free room there' });
  });

  it('a queued party gives up after its patience runs out', () => {
    const sim = new Sim(starterResort());
    const events: string[] = [];
    sim.on((e) => events.push(e.type));
    untilQueued(sim);
    const g = sim.queue[0];
    const ticks = Math.ceil(PATIENCE_SECONDS / TICK) + 2;
    for (let i = 0; i < ticks; i++) sim.step();
    expect(g.leaving).toBe(true);
    expect(g.satisfaction).toBe(0);
    expect(events).toContain('gaveUp');
    expect(sim.today.turnedAway).toBeGreaterThan(0);
  });

  it('scores wishes against what is near the room', () => {
    const w = new World();
    const d = w.dock;
    for (let y = d.y - 1; y >= 0; y--) w.placePath(d.x, y);
    const nearDock = w.placeBuilding('basicRooms', d.x + 1, d.y - 2, 0).building!;
    const farRoom = w.placeBuilding('basicRooms', d.x + 1, 0, 0).building!;
    w.placeBuilding('snackBar', d.x - 1, 0, 0);
    const sim = new Sim(w);
    const backpacker = { tier: 1, wishes: ['shortWalk' as const] };
    expect(matchScore(sim.paths, w, backpacker, nearDock).score).toBeGreaterThan(
      matchScore(sim.paths, w, backpacker, farRoom).score,
    );
    const snacker = { tier: 1, wishes: ['snacks' as const] };
    expect(matchScore(sim.paths, w, snacker, farRoom).notes).toContainEqual({ ok: true, text: 'Snack Bar close by' });
    // Couples expect a nicer room than Basic Rooms, and want quiet away from the snack bar.
    const couple = matchScore(sim.paths, w, { tier: 2, wishes: ['quiet'] }, farRoom);
    expect(couple.notes).toContainEqual({ ok: false, text: 'Hoped for a nicer room' });
    expect(couple.notes).toContainEqual({ ok: false, text: 'Too close to the kitchens' });
  });

  it('hand placement beats auto check-in by the auto penalty', () => {
    const w = starterResort();
    w.money += 5000;
    expect(w.placeBuilding('frontDesk', w.dock.x - 2, 4, 0).ok).toBe(true);
    const hand = new Sim(w);
    untilQueued(hand);
    const g = hand.queue[0];
    const best = hand.bestRoom(g)!;
    const scoreHand = hand.match(g, best.room).score;
    expect(hand.autoCheckInAll()).toBeGreaterThan(0);
    expect(g.satisfaction).toBe(Math.max(0, scoreHand - AUTO_PENALTY));
  });

  it('every party has a size within its type’s range', () => {
    const sim = new Sim(starterResort());
    for (let i = 0; i < 3; i++) {
      untilQueued(sim);
      for (const g of sim.queue) {
        const [lo, hi] = GUEST_TYPES[g.type].size;
        expect(g.size).toBeGreaterThanOrEqual(lo);
        expect(g.size).toBeLessThanOrEqual(hi);
      }
      runHours(sim, 16);
    }
  });
});

describe('overnight (regression)', () => {
  it('everyone who went to bed wakes up the next morning', () => {
    const sim = autoSim(starterResort());
    runHours(sim, 14.5); // to 21:30: plenty of guests in bed
    const asleep = () => sim.guests.filter((g) => g.state === 'inside' && g.timer > 1e8);
    expect(asleep().length).toBeGreaterThan(0);
    runHours(sim, 1.6); // past 23:00 into the next morning (07:06)
    expect(sim.minutes).toBeLessThan(8 * 60);
    runHours(sim, 0.5);
    expect(asleep()).toHaveLength(0);
  });
});
