import { describe, expect, it } from 'vitest';
import { activityOf, canStepOn, landmarksOn, routeQuality, routeStarts, tripMinutes } from '../src/sim/activities';
import { SECONDS_PER_GAME_HOUR, Sim, TICK } from '../src/sim/sim';
import { World, type Tile } from '../src/sim/world';
import { coconutWorld } from './coconut';

/** Shortest route (by the activity's rules) from a hub to a target tile, or null. */
function routeTo(w: World, hubId: number, goal: Tile): Tile[] | null {
  const hub = w.buildings.find((b) => b.id === hubId)!;
  const def = activityOf(hub.kind)!;
  const starts = routeStarts(w, hubId);
  const key = (t: Tile) => `${t.x},${t.y}`;
  const prev = new Map<string, Tile | null>();
  const queue: Tile[] = [];
  for (const s of starts) {
    prev.set(key(s), null);
    queue.push(s);
  }
  while (queue.length) {
    const t = queue.shift()!;
    if (Math.abs(t.x - goal.x) <= 1 && Math.abs(t.y - goal.y) <= 1) {
      const out: Tile[] = [];
      for (let c: Tile | null = t; c; c = prev.get(key(c)) ?? null) out.unshift(c);
      return out;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: t.x + dx, y: t.y + dy };
      if (prev.has(key(n)) || !canStepOn(w, def, n, t).ok) continue;
      prev.set(key(n), t);
      queue.push(n);
    }
  }
  return null;
}

/** Coconut Key with a small resort, a Trail Hut and an Excursion Pier. */
function resort(): { w: World; hut: number; pier: number } {
  const w = coconutWorld(100000, true);
  let rooms = 0;
  for (let y = 9; y < 15 && rooms < 4; y++) for (let x = 3; x < 20 && rooms < 4; x++) if (w.placeBuilding('basicRooms', x, y, 0).ok) rooms++;
  for (const k of ['snackBar', 'buffet'] as const) {
    let ok = false;
    for (let y = 9; y < 15 && !ok; y++) for (let x = 3; x < 20 && !ok; x++) ok = w.placeBuilding(k, x, y, 0).ok;
  }
  let hut = 0;
  for (let y = 9; y < 14 && !hut; y++) for (let x = 7; x < 16 && !hut; x++) hut = w.placeBuilding('trailHut', x, y, 0).building?.id ?? 0;
  const pier = w.placeBuilding('excursionPier', 13, 17, 0).building?.id ?? 0;
  expect(hut).toBeGreaterThan(0);
  expect(pier).toBeGreaterThan(0);
  return { w, hut, pier };
}

/** Hire the best guide on offer and put them on a hub's session (Pass 5: no guide, no session). */
function guide(sim: Sim, hubId: number, slot: 'morning' | 'afternoon' | 'evening'): void {
  const offer = sim.offerStaff('operations');
  const best = offer.indexOf(offer.reduce((a, b) => (b.skill > a.skill ? b : a)));
  const r = sim.hire('operations', best);
  if (!r.ok) throw new Error(r.reason);
  sim.assignShift(r.worker.id, slot, `hub:${hubId}`);
}

function runDays(sim: Sim, days: number): void {
  const ticks = Math.round((16.1 * SECONDS_PER_GAME_HOUR) / TICK);
  for (let d = 0; d < days; d++) for (let i = 0; i < ticks; i++) sim.step();
}

describe('routes', () => {
  it('trails start beside the hut, stay on land and climb one level at a time', () => {
    const { w, hut } = resort();
    const peak = w.landmarks.find((l) => l.kind === 'viewpoint')!;
    const trail = routeTo(w, hut, peak)!;
    expect(trail).not.toBeNull();
    expect(w.setRoute(hut, trail).ok).toBe(true);
    expect(landmarksOn(w.routeOf(hut)!, w.landmarks).map((l) => l.kind)).toContain('viewpoint');
    // Not from the far side of the island, not into the sea, not jumping.
    expect(w.checkRoute(hut, [{ x: 20, y: 3 }, { x: 21, y: 3 }, { x: 22, y: 3 }])).toEqual({ ok: false, reason: 'Start the trail next to the hut' });
    expect(w.checkRoute(hut, [trail[0], trail[2], trail[3]])).toEqual({ ok: false, reason: 'Each step must be next to the last' });
  });

  it('boat routes stay on the water; kayaks keep to calm water', () => {
    const { w, pier } = resort();
    const turtles = w.landmarks.find((l) => l.kind === 'turtles')!;
    const route = routeTo(w, pier, turtles)!;
    expect(route).not.toBeNull();
    expect(w.setRoute(pier, route).ok).toBe(true);
    for (const t of route) expect(w.isWater(t.x, t.y)).toBe(true);
    const kayak = activityOf('kayakRental')!;
    expect(canStepOn(w, kayak, { x: 0, y: 0 }, null)).toEqual({ ok: false, reason: 'Kayaks keep to calm water' });
  });

  it('a route that passes landmarks makes a better trip', () => {
    const { w, hut } = resort();
    const def = activityOf('trailHut')!;
    const peak = w.landmarks.find((l) => l.kind === 'viewpoint')!;
    const good = routeTo(w, hut, peak)!;
    const dull = routeStarts(w, hut).slice(0, 1).concat();
    // A short dull loop: three tiles straight out from the hut on the grass.
    const s = dull[0];
    const plain = [s, { x: s.x, y: s.y + 1 }, { x: s.x, y: s.y + 2 }].filter((t) => canStepOn(w, def, t, null).ok);
    const q = (tiles: Tile[]) => routeQuality(w, { hubId: hut, kind: 'trail', tiles }, def, w.landmarks);
    expect(q(good)).toBeGreaterThan(q(plain) + 10);
    expect(tripMinutes(def, { hubId: hut, kind: 'trail', tiles: good })).toBeGreaterThan(tripMinutes(def, null));
  });

  it('demolishing a hub removes its route and its sessions', () => {
    const { w, hut } = resort();
    const sim = new Sim(w);
    w.setRoute(hut, routeTo(w, hut, w.landmarks[0])!);
    expect(sim.setPlanned(hut, 'morning', true).ok).toBe(true);
    w.removeBuilding(hut);
    expect(w.routeOf(hut)).toBeNull();
    sim.step();
    expect(sim.dayPlan).toHaveLength(0);
  });
});

describe('the day plan', () => {
  it('needs a route before a hike can be planned', () => {
    const { w, hut } = resort();
    const sim = new Sim(w);
    expect(sim.setPlanned(hut, 'morning', true)).toEqual({ ok: false, reason: 'Draw a route first' });
  });

  it('guests sign up, meet at the hub, go out, pay and come back happier', () => {
    const { w, hut, pier } = resort();
    w.setRoute(hut, routeTo(w, hut, w.landmarks.find((l) => l.kind === 'viewpoint')!)!);
    w.setRoute(pier, routeTo(w, pier, w.landmarks.find((l) => l.kind === 'turtles')!)!);
    const sim = new Sim(w);
    sim.autoCheckIn = true;
    for (const slot of ['morning', 'afternoon'] as const) {
      sim.setPlanned(hut, slot, true);
      sim.setPlanned(pier, slot, true);
      guide(sim, hut, slot);
      guide(sim, pier, slot);
    }
    const lines: Array<{ name: string; amount: number }> = [];
    sim.on((e) => {
      if (e.type === 'night') lines.push(...e.report.income);
    });
    runDays(sim, 4);
    const trips = lines.filter((l) => l.name === 'Trail Hut' || l.name === 'Excursion Pier');
    expect(trips.length).toBeGreaterThan(0);
    expect(trips.reduce((s, l) => s + l.amount, 0)).toBeGreaterThan(0);
    // Reviews now judge real activities, not just strolls.
    expect(sim.reviews.some((r) => (r.cats?.activities ?? 0) >= 4)).toBe(true);
  });

  it('a resort with good activities rates its Activities higher than one without', () => {
    const rating = (withActivities: boolean) => {
      const { w, hut, pier } = resort();
      const sim = new Sim(w);
      sim.autoCheckIn = true;
      if (withActivities) {
        w.setRoute(hut, routeTo(w, hut, w.landmarks.find((l) => l.kind === 'viewpoint')!)!);
        w.setRoute(pier, routeTo(w, pier, w.landmarks.find((l) => l.kind === 'turtles')!)!);
        for (const slot of ['morning', 'afternoon', 'evening'] as const) {
          sim.setPlanned(hut, slot, true);
          sim.setPlanned(pier, slot, true);
          guide(sim, hut, slot);
          guide(sim, pier, slot);
        }
      }
      runDays(sim, 8);
      return sim.categoryRating('activities');
    };
    expect(rating(true)).toBeGreaterThan(rating(false) + 0.3);
  });

  it('saves the plan, prices and routes', () => {
    const { w, hut } = resort();
    w.setRoute(hut, routeTo(w, hut, w.landmarks[0])!);
    const sim = new Sim(w);
    sim.setPlanned(hut, 'evening', true);
    sim.setActivityPrice(hut, 4);
    const back = World.fromSnapshot(JSON.parse(JSON.stringify(w.snapshot())));
    const sim2 = new Sim(back);
    sim2.restore(JSON.parse(JSON.stringify(sim.snapshot())));
    expect(back.routeOf(hut)?.tiles.length).toBe(w.routeOf(hut)!.tiles.length);
    expect(sim2.isPlanned(hut, 'evening')).toBe(true);
    expect(sim2.activityPrice(hut)).toBe(4);
  });

  it('a session without a guide does not run; a guide in two places is moved, not doubled', () => {
    const { w, hut, pier } = resort();
    w.setRoute(hut, routeTo(w, hut, w.landmarks.find((l) => l.kind === 'viewpoint')!)!);
    w.setRoute(pier, routeTo(w, pier, w.landmarks.find((l) => l.kind === 'turtles')!)!);
    const sim = new Sim(w);
    sim.autoCheckIn = true;
    sim.setPlanned(hut, 'afternoon', true);
    sim.setPlanned(pier, 'afternoon', true);
    sim.offerStaff('operations');
    const g = (sim.hire('operations', 0) as { ok: true; worker: { id: number } }).worker;
    sim.assignShift(g.id, 'afternoon', `hub:${hut}`);
    // The same person can't also take the boat out at the same time: it moves them.
    sim.assignShift(g.id, 'afternoon', `hub:${pier}`);
    expect(sim.guideFor(hut, 'afternoon')).toBeUndefined();
    expect(sim.guideFor(pier, 'afternoon')?.id).toBe(g.id);
    // But they can guide the hike in the morning and the boat in the afternoon.
    sim.assignShift(g.id, 'morning', `hub:${hut}`);
    expect(sim.guideFor(hut, 'morning')?.id).toBe(g.id);
    runDays(sim, 3);
    const hutAfternoon = sim.trips.filter((t) => t.hubId === hut && t.slot === 'afternoon');
    expect(hutAfternoon.every((t) => t.people === 0)).toBe(true);
  });
});
