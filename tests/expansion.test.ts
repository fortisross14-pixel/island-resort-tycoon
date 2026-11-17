import { describe, expect, it } from 'vitest';
import { RESEARCHABLE, nodeFor } from '../src/sim/research';
import { SCENARIOS } from '../src/sim/scenario';
import { PATIENCE_SECONDS, Sim, type GuestType } from '../src/sim/sim';
import { World } from '../src/sim/world';

function island(): { w: World; sim: Sim } {
  const w = new World(18, 900000);
  const d = w.dock;
  for (let y = d.y - 1; y >= 0; y--) w.placePath(d.x, y);
  const sim = new Sim(w);
  return { w, sim };
}

function rate(sim: Sim, stars: number): void {
  sim.reviews = Array.from({ length: 50 }, (_, i) => ({ id: i, day: 1, guestType: 'couple', stars, text: '', buildingId: null }));
}

/** Sample the ferry's guest mix. */
function mix(sim: Sim, n = 3000): Record<string, number> {
  const out: Record<string, number> = {};
  const pick = (sim as unknown as { pickGuestType(): GuestType }).pickGuestType.bind(sim);
  for (let i = 0; i < n; i++) {
    const t = pick();
    out[t] = (out[t] ?? 0) + 1;
  }
  return out;
}

describe('tiers 3 and 4 (expansion)', () => {
  it('every new building has research behind it', () => {
    for (const k of ['suites', 'fineDining', 'movieTheater', 'conferenceHall', 'waterVillas', 'helipad', 'marina'] as const) {
      expect(RESEARCHABLE).toContain(k);
      expect(nodeFor(k)).toBeDefined();
    }
  });

  it('tier 4 needs two tier-3 topics and a ★4 rating', () => {
    const { sim } = island();
    sim.progression = true;
    sim.research.points = 5000;
    rate(sim, 5);
    expect(sim.researchTopic('helipad')).toEqual({ ok: false, reason: 'Needs 2 tier 3 topics (0/2)' });
    for (const id of ['beachBar', 'giftShop', 'gym', 'kidsClub', 'movieTheater', 'conferenceHall']) expect(sim.researchTopic(id).ok, id).toBe(true);
    expect(sim.researchTopic('helipad').ok).toBe(true);
    rate(sim, 3.5);
    expect(sim.researchTopic('marina')).toEqual({ ok: false, reason: 'Needs a ★4 rating' });
  });

  it('VIPs finally find a room that suits them in the Suites', () => {
    const { w, sim } = island();
    const d = w.dock;
    const garden = w.placeBuilding('gardenBungalows', d.x + 1, 0, 0).building!;
    const suites = w.placeBuilding('suites', d.x - 3, 0, 0).building!;
    const vip = { tier: 4, wishes: [], budget: 450 };
    expect(sim.match(vip as never, suites).score).toBeGreaterThan(sim.match(vip as never, garden).score);
    expect(sim.roomRate(suites)).toBeGreaterThan(sim.roomRate(garden));
  });

  it('shore rules apply to the Marina and Water Villas', () => {
    const { w } = island();
    const d = w.dock;
    expect(w.placeBuilding('marina', d.x + 1, 6, 0)).toEqual({ ok: false, reason: 'Must be on the shore' });
    expect(w.placeBuilding('waterVillas', d.x + 1, 0, 0).ok).toBe(true);
  });
});

describe('business guests', () => {
  it('only come once there is a Conference Hall', () => {
    const { w, sim } = island();
    rate(sim, 5);
    expect(mix(sim).business ?? 0).toBe(0);
    w.placeBuilding('conferenceHall', w.dock.x + 1, 0, 0);
    expect(mix(sim).business ?? 0).toBeGreaterThan(50);
  });

  it('are impatient, and mind a slow check-in without a Front Desk', () => {
    const { w, sim } = island();
    const d = w.dock;
    w.placeBuilding('conferenceHall', d.x + 1, 0, 0);
    w.placeBuilding('standardRooms', d.x - 2, 0, 0);
    rate(sim, 5);
    const pick = sim as unknown as { pickGuestType(): GuestType };
    pick.pickGuestType = () => 'business';
    for (let i = 0; !sim.queue.length && i < 100000; i++) sim.step();
    const g = sim.queue[0];
    expect(g.type).toBe('business');
    expect(g.patience).toBe(PATIENCE_SECONDS * 0.5);
    const room = w.buildings.find((b) => b.kind === 'standardRooms')!;
    expect(sim.checkIn(g.id, room.id).ok).toBe(true);
    expect(g.memories.map((m) => m.text)).toContain('check-in took forever');
  });
});

describe('Helipad', () => {
  it('brings far more VIPs', () => {
    const { w, sim } = island();
    rate(sim, 5);
    const before = mix(sim).vip ?? 0;
    w.placeBuilding('helipad', w.dock.x + 1, 0, 0);
    expect(mix(sim).vip ?? 0).toBeGreaterThan(before * 2);
  });
});

describe('Family Cove (scenario 2)', () => {
  it('is mostly families, and its goals count families and buildings', () => {
    const def = SCENARIOS.find((s) => s.id === 'familyCove')!;
    expect(def).toBeDefined();
    const { w, sim } = island();
    sim.startScenario('familyCove');
    rate(sim, 3);
    const m = mix(sim);
    expect(m.family).toBeGreaterThan((m.couple ?? 0) + (m.party ?? 0));
    const c = sim.campaign!;
    const kidsGoal = def.medals.bronze.find((g) => g.metric === 'building')!;
    expect(c.goalMet(kidsGoal)).toBe(false);
    w.placeBuilding('kidsClub', w.dock.x + 1, 0, 0);
    expect(c.goalMet(kidsGoal)).toBe(true);
  });
});
