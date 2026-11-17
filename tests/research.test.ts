import { describe, expect, it } from 'vitest';
import { NODES, OFFICE_POINTS, RESEARCHABLE, nodeFor } from '../src/sim/research';
import { SECONDS_PER_GAME_HOUR, Sim, TICK } from '../src/sim/sim';
import { World } from '../src/sim/world';

function runHours(sim: Sim, hours: number): void {
  const ticks = Math.round((hours * SECONDS_PER_GAME_HOUR) / TICK);
  for (let i = 0; i < ticks; i++) sim.step();
}

function island(): { w: World; sim: Sim } {
  const w = new World(14, 500000);
  const d = w.dock;
  for (let y = d.y - 1; y >= 0; y--) w.placePath(d.x, y);
  const sim = new Sim(w);
  sim.progression = true;
  return { w, sim };
}

describe('research', () => {
  it('every building that needs unlocking has a research topic', () => {
    for (const k of RESEARCHABLE) expect(nodeFor(k), k).toBeDefined();
  });

  it('locks researchable buildings until their topic is done', () => {
    const { w, sim } = island();
    const d = w.dock;
    expect(w.placeBuilding('pool', d.x + 1, 2, 0)).toEqual({ ok: false, reason: 'Research Pool first' });
    expect(w.placeBuilding('basicRooms', d.x + 1, 2, 0).ok).toBe(true); // tier 0
    sim.research.points = 100;
    expect(sim.researchTopic('pool').ok).toBe(true);
    expect(sim.research.points).toBe(100 - NODES.find((n) => n.id === 'pool')!.cost);
    expect(w.placeBuilding('pool', d.x + 1, 5, 0).ok).toBe(true);
  });

  it('without progression (tests, sandbox) everything can be built', () => {
    const w = new World(14, 500000);
    const sim = new Sim(w);
    expect(sim.isUnlocked('spa')).toBe(true);
  });

  it('tier 2 needs two tier-1 topics, and premium topics need ★3', () => {
    const { sim } = island();
    sim.research.points = 1000;
    expect(sim.researchTopic('gym')).toEqual({ ok: false, reason: 'Needs 2 tier 1 topics (0/2)' });
    sim.researchTopic('giftShop');
    sim.researchTopic('beachBar');
    expect(sim.researchTopic('gym').ok).toBe(true); // mid class: no star gate
    // The rating starts at 2.5, below the ★3 needed for the Spa.
    expect(sim.rating).toBeLessThan(3);
    expect(sim.researchTopic('spa')).toEqual({ ok: false, reason: 'Needs a ★3 rating' });
    for (let i = 0; i < 20; i++)
      sim.reviews.push({ id: 1000 + i, day: 1, guestType: 'couple', stars: 5, text: '', buildingId: null });
    expect(sim.researchTopic('spa').ok).toBe(true);
  });

  it('cannot research without enough points, or twice', () => {
    const { sim } = island();
    sim.research.points = 2;
    expect(sim.researchTopic('pool')).toEqual({ ok: false, reason: 'Needs 7 points' });
    sim.research.points = 10;
    sim.researchTopic('pool');
    expect(sim.researchTopic('pool')).toEqual({ ok: false, reason: 'Already researched' });
  });

  it('earns a point per review star and more from Research Offices', () => {
    const { w, sim } = island();
    const d = w.dock;
    w.placeBuilding('basicRooms', d.x + 1, 2, 0);
    w.placeBuilding('basicRooms', d.x - 2, 2, 0);
    w.placeBuilding('researchOffice', d.x + 1, 6, 0);
    sim.autoCheckIn = true;
    let stars = 0;
    sim.on((e) => e.type === 'review' && (stars += e.review.stars));
    sim.pauseAtNight = true;
    for (let i = 0; !sim.night && i < 200000; i++) sim.step();
    expect(sim.night!.researchPoints).toBe(stars + OFFICE_POINTS);
    expect(sim.research.points).toBe(stars + OFFICE_POINTS);
  });

  it('keeps research through a snapshot', () => {
    const { w, sim } = island();
    sim.research.points = 50;
    sim.researchTopic('pool');
    const copy = new Sim(World.fromSnapshot(w.snapshot()));
    copy.restore(JSON.parse(JSON.stringify(sim.snapshot())));
    expect(copy.progression).toBe(true);
    expect(copy.isUnlocked('pool')).toBe(true);
    expect(copy.isUnlocked('spa')).toBe(false);
    expect(copy.research.points).toBe(sim.research.points);
  });
});

describe('tier 2 buildings', () => {
  it('restaurants, the spa and the boutique sell to guests who can afford them', () => {
    const w = new World(14, 500000);
    const d = w.dock;
    for (let y = d.y - 1; y >= 0; y--) w.placePath(d.x, y);
    for (let y = 0; y < 8; y += 2) {
      w.placeBuilding('standardRooms', d.x + 1, y, 0);
      w.placeBuilding('gardenBungalows', d.x - 3, y, 0);
    }
    const rest = w.placeBuilding('italianRestaurant', d.x + 1, 8, 0).building!;
    const spa = w.placeBuilding('spa', d.x - 3, 8, 0).building!;
    const sim = new Sim(w);
    sim.autoCheckIn = true;
    const sales = new Map<number, number>();
    sim.on((e) => e.type === 'purchase' && sales.set(e.buildingId, (sales.get(e.buildingId) ?? 0) + 1));
    for (let day = 0; day < 3; day++) runHours(sim, 16);
    expect(sales.get(rest.id) ?? 0).toBeGreaterThan(0);
    expect(sales.get(spa.id) ?? 0).toBeGreaterThan(0);
  });

  it('Garden Bungalows are premium rooms with a higher rate', () => {
    const w = new World(14, 500000);
    const d = w.dock;
    for (let y = d.y - 1; y >= 0; y--) w.placePath(d.x, y);
    const basic = w.placeBuilding('basicRooms', d.x + 1, 0, 0).building!;
    const garden = w.placeBuilding('gardenBungalows', d.x - 3, 0, 0).building!;
    const sim = new Sim(w);
    expect(sim.roomTier(garden)).toBe(3);
    expect(sim.roomRate(garden)).toBeGreaterThan(sim.roomRate(basic));
  });
});
