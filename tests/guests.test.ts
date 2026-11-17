import { describe, expect, it } from 'vitest';
import { GUEST_TYPES, GUEST_TYPE_KEYS, SECONDS_PER_GAME_HOUR, Sim, TICK, type Guest } from '../src/sim/sim';
import { World } from '../src/sim/world';

function runHours(sim: Sim, hours: number): void {
  const ticks = Math.round((hours * SECONDS_PER_GAME_HOUR) / TICK);
  for (let i = 0; i < ticks; i++) sim.step();
}

/** A big resort with a long spine, rooms both sides and plenty of money. */
function resort(): World {
  const w = new World(16, 500000);
  const d = w.dock;
  for (let y = d.y - 1; y >= 0; y--) w.placePath(d.x, y);
  for (let y = 0; y < 12; y += 2) {
    w.placeBuilding('standardRooms', d.x + 1, y, 0);
    w.placeBuilding('gardenBungalows', d.x - 3, y, 0);
  }
  return w;
}

/** Pretend the resort has earned a rating, with lots of 5-star or 1-star reviews. */
function setRating(sim: Sim, stars: number): void {
  sim.reviews = Array.from({ length: 50 }, (_, i) => ({ id: i, day: 1, guestType: 'couple', stars, text: '', buildingId: null }));
}

/** Collect the types of the next many arrivals. */
function arrivals(sim: Sim, days: number): Set<string> {
  const seen = new Set<string>();
  sim.autoCheckIn = true;
  for (let d = 0; d < days; d++) {
    runHours(sim, 16);
    for (const g of sim.guests) seen.add(g.type);
  }
  return seen;
}

describe('guest types (Pass 1)', () => {
  it('every type has a sensible definition', () => {
    for (const t of GUEST_TYPE_KEYS) {
      const d = GUEST_TYPES[t];
      expect(d.size[0]).toBeGreaterThanOrEqual(1);
      expect(d.size[1]).toBeLessThanOrEqual(4);
      expect(d.budget[0]).toBeLessThanOrEqual(d.budget[1]);
      expect(d.wishPool.length).toBeGreaterThan(0);
    }
  });

  it('a low rating brings only backpackers and couples', () => {
    const sim = new Sim(resort());
    setRating(sim, 1);
    const seen = arrivals(sim, 3);
    for (const t of seen) expect(['backpacker', 'couple']).toContain(t);
  });

  it('a 5-star rating brings families, wellness seekers, party groups and VIPs', () => {
    const sim = new Sim(resort());
    setRating(sim, 5);
    const seen = arrivals(sim, 6);
    for (const t of ['family', 'wellness', 'party', 'vip']) expect(seen.has(t), t).toBe(true);
  });

  it('only families use the Kids’ Club, and they pay per child', () => {
    const w = resort();
    const club = w.placeBuilding('kidsClub', w.dock.x + 1, 12, 0).building!;
    const sim = new Sim(w);
    setRating(sim, 5);
    sim.autoCheckIn = true;
    const users = new Set<string>();
    const amounts: number[] = [];
    sim.on((e) => {
      if (e.type !== 'purchase' || e.buildingId !== club.id) return;
      const g = sim.guest(e.guestId)!;
      users.add(g.type);
      amounts.push(e.amount / Math.max(1, g.size - 2));
    });
    for (let d = 0; d < 5; d++) runHours(sim, 16);
    expect([...users]).toEqual(['family']);
    for (const a of amounts) expect(a).toBe(15);
  });

  it('wellness seekers barely consider the Snack Bar; backpackers like it', () => {
    const w = resort();
    w.placeBuilding('snackBar', w.dock.x - 1, 13, 0);
    const sim = new Sim(w);
    setRating(sim, 5);
    sim.autoCheckIn = true;
    let w0: Guest | undefined;
    let b0: Guest | undefined;
    for (let i = 0; (!w0 || !b0) && i < 200000; i++) {
      sim.step();
      w0 ??= sim.guests.find((g) => g.type === 'wellness' && g.tile && g.roomId !== null);
      b0 ??= sim.guests.find((g) => g.type === 'backpacker' && g.tile && g.roomId !== null);
    }
    expect(w0 && b0).toBeTruthy();
    for (const g of [w0!, b0!]) {
      g.needs.hunger = 20;
      g.wallet = 500;
    }
    const snackUtility = (g: Guest) =>
      sim.options(g).find((o) => o.goal.kind === 'building' && w.buildings.find((b) => b.id === (o.goal as { id: number }).id)?.kind === 'snackBar')
        ?.utility ?? 0;
    expect(snackUtility(w0!)).toBeLessThan(snackUtility(b0!) * 0.3);
  });

  it('party groups stay out late; others head in at 21:00', () => {
    const sim = new Sim(resort());
    setRating(sim, 5);
    sim.autoCheckIn = true;
    for (let d = 0; d < 3; d++) runHours(sim, 16);
    for (let i = 0; sim.minutes < 22 * 60 && i < 100000; i++) sim.step();
    // In bed for the night = inside their own room with the overnight timer.
    const asleep = (g: Guest) => g.state === 'inside' && g.insideId === g.roomId && g.timer > 1e8;
    const party = sim.guests.filter((g) => g.type === 'party' && g.roomId !== null && !g.leaving);
    const others = sim.guests.filter((g) => g.type !== 'party' && g.roomId !== null && !g.leaving);
    expect(party.length).toBeGreaterThan(0);
    expect(party.some(asleep)).toBe(false);
    expect(others.some(asleep)).toBe(true);
  });

  it('a nightclub keeps nearby rooms awake, but not party groups', () => {
    const w = resort();
    const d = w.dock;
    w.placeBuilding('nightclub', d.x + 1, 12, 0);
    const sim = new Sim(w);
    setRating(sim, 5);
    sim.autoCheckIn = true;
    sim.pauseAtNight = true;
    for (let i = 0; !sim.night && i < 200000; i++) sim.step();
    const near = sim.guests.filter((g) => g.roomId !== null && g.memories.some((m) => m.text.includes('nightclub kept us up')));
    expect(near.length).toBeGreaterThan(0);
    expect(near.every((g) => g.type !== 'party')).toBe(true);
  });
});
