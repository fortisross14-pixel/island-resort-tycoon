import { describe, expect, it } from 'vitest';
import { PathGraph, UNREACHABLE } from '../src/sim/pathGraph';
import {
  DAY_START,
  FERRY_ARRIVES,
  ROOMS_PER_BUILDING,
  SECONDS_PER_GAME_HOUR,
  Sim,
  TICK,
  arrivalsForDay,
  isVisible,
  type SimEvent,
} from '../src/sim/sim';
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
    const sim = new Sim(starterResort());
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
    const sim = new Sim(w);
    for (let day = 0; day < 4; day++) runHours(sim, 16);
    const rooms = w.buildings.filter((b) => b.kind === 'basicRooms');
    for (const r of rooms) expect(sim.occupancy(r.id)).toBeLessThanOrEqual(ROOMS_PER_BUILDING);
    const housed = sim.guests.filter((g) => g.roomId !== null).length;
    expect(housed).toBeLessThanOrEqual(rooms.length * ROOMS_PER_BUILDING);
  });

  it('guests walk only on paths and visit food buildings', () => {
    const w = starterResort();
    const sim = new Sim(w);
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
    const sim = new Sim(starterResort());
    let departed = 0;
    sim.on((e) => e.type === 'newDay' && (departed += e.yesterday.departed));
    for (let day = 0; day < 6; day++) runHours(sim, 16);
    expect(departed).toBeGreaterThan(0);
    // Nobody is stuck: every guest still around is somewhere sensible.
    for (const g of sim.guests) expect(['walking', 'inside', 'waiting', 'boarding', 'arriving']).toContain(g.state);
  });

  it('copes with the map changing under the guests', () => {
    const w = starterResort();
    const sim = new Sim(w);
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

  it('turns everyone away when there are no rooms', () => {
    const w = new World();
    for (let y = w.dock.y - 1; y >= w.dock.y - 3; y--) w.placePath(w.dock.x, y);
    const sim = new Sim(w);
    runHours(sim, 3);
    expect(sim.today.turnedAway).toBe(arrivalsForDay(1));
    expect(sim.today.departed).toBeGreaterThan(0);
  });

  it('round-trips through a snapshot and stays deterministic', () => {
    const a = new Sim(starterResort());
    runHours(a, 3);
    const b = new Sim(World.fromSnapshot(a.world.snapshot()));
    b.restore(JSON.parse(JSON.stringify(a.snapshot())));
    runHours(a, 2);
    runHours(b, 2);
    const pos = (s: Sim) => s.guests.filter(isVisible).map((g) => [g.id, g.x.toFixed(3), g.z.toFixed(3)]);
    expect(pos(b)).toEqual(pos(a));
  });
});
