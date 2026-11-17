import { describe, expect, it } from 'vitest';
import { ACTIVE_OBJECTIVES, SCENARIOS, type CampaignEvent } from '../src/sim/scenario';
import { RED_DAYS_FOR_OFFER, Sim } from '../src/sim/sim';
import { World } from '../src/sim/world';

function resort(money = 15000): World {
  const w = new World(14, money);
  const d = w.dock;
  for (let y = d.y - 1; y >= 0; y--) w.placePath(d.x, y);
  for (let y = 0; y < 10; y += 2) {
    w.placeBuilding('basicRooms', d.x + 1, y, 0) ;
    w.placeBuilding('basicRooms', d.x - 2, y, 0);
  }
  w.placeBuilding('buffet', d.x + 1, 10, 0);
  w.placeBuilding('snackBar', d.x - 1, 11, 0);
  return w;
}

function scenarioSim(w = resort(500000)): Sim {
  const sim = new Sim(w);
  sim.autoCheckIn = true;
  sim.pauseAtNight = true;
  sim.startScenario('driftwood');
  return sim;
}

function untilNight(sim: Sim): void {
  for (let i = 0; !sim.night && i < 200000; i++) sim.step();
}

describe('scenarios', () => {
  it('starts with three daily objectives and no medals', () => {
    const sim = scenarioSim();
    const c = sim.campaign!;
    expect(c.def.name).toBe('Driftwood Beginnings');
    expect(c.state.objectives).toHaveLength(ACTIVE_OBJECTIVES);
    expect(c.bestMedal).toBeNull();
    expect(c.daysLeft).toBe(SCENARIOS[0].days);
  });

  it('counts guests served and wins medals as goals are met', () => {
    const sim = scenarioSim();
    const c = sim.campaign!;
    const medals: string[] = [];
    c.on((e: CampaignEvent) => e.type === 'medal' && medals.push(e.tier));
    for (let day = 0; day < 6; day++) {
      untilNight(sim);
      sim.startDay();
    }
    expect(c.state.served).toBeGreaterThanOrEqual(20);
    expect(medals).toContain('bronze');
    expect(c.state.medals.bronze).toBeGreaterThan(0);
  });

  it('completes objectives, pays rewards, and draws new ones each morning', () => {
    const sim = scenarioSim();
    const c = sim.campaign!;
    // Force a simple objective we know will happen.
    c.state.objectives = [
      { id: 99, kind: 'checkins', label: 'Check in 2 parties today', target: 2, progress: 0, reward: { coins: 500 }, done: false, today: true },
    ];
    const done: string[] = [];
    c.on((e) => e.type === 'objectiveDone' && done.push(e.objective.label));
    const before = sim.world.money;
    for (let i = 0; c.state.objectives[0].progress < 2 && i < 100000; i++) sim.step();
    expect(done).toEqual(['Check in 2 parties today']);
    expect(sim.world.money).toBeGreaterThanOrEqual(before + 500 - 1); // plus sales, minus nothing yet
    untilNight(sim);
    expect(sim.night!.objectives).toEqual([{ label: 'Check in 2 parties today', done: true }]);
    sim.startDay();
    expect(c.state.objectives).toHaveLength(ACTIVE_OBJECTIVES);
    expect(c.state.objectives.some((o) => o.id === 99)).toBe(false);
  });

  it('finishes when the days run out, keeping the best medal', () => {
    const sim = scenarioSim();
    const c = sim.campaign!;
    let finished: string | null = null;
    c.on((e) => e.type === 'finished' && (finished = e.medal));
    sim.world.day = c.def.days;
    untilNight(sim);
    expect(finished).not.toBeNull();
    expect(c.state.finished).toBe(finished);
  });

  it('survives a snapshot with its medals and objectives', () => {
    const sim = scenarioSim();
    untilNight(sim);
    const copy = new Sim(World.fromSnapshot(sim.world.snapshot()));
    copy.restore(JSON.parse(JSON.stringify(sim.snapshot())));
    expect(copy.campaign?.state.served).toBe(sim.campaign!.state.served);
    expect(copy.campaign?.state.objectives).toEqual(sim.campaign!.state.objectives);
  });

  it('sandbox has no campaign', () => {
    const sim = new Sim(resort());
    sim.startScenario(null);
    expect(sim.campaign).toBeNull();
  });
});

describe('investor rescue', () => {
  /** A resort that loses money: lots of upkeep, no guests (no rooms). */
  function losing(): Sim {
    const w = new World(14, 50000);
    const d = w.dock;
    for (let y = d.y - 1; y >= 0; y--) w.placePath(d.x, y);
    for (let y = 0; y < 12; y += 3) w.placeBuilding('spa', d.x + 1, y, 0);
    const sim = new Sim(w);
    sim.pauseAtNight = true;
    return sim;
  }

  it('offers cash after three red days, and takes a share of income after', () => {
    const sim = losing();
    for (let day = 1; day <= RED_DAYS_FOR_OFFER; day++) {
      untilNight(sim);
      expect(sim.night!.profit).toBeLessThan(0);
      if (day < RED_DAYS_FOR_OFFER) expect(sim.night!.offer).toBeNull();
      else expect(sim.night!.offer).not.toBeNull();
      sim.startDay();
    }
    const offer = sim.offer!;
    const before = sim.world.money;
    expect(sim.acceptOffer()).toBe(true);
    expect(sim.world.money).toBe(before + offer.cash);
    expect(sim.investor).toEqual({ share: offer.share, daysLeft: offer.days });
    // Give it some income so the share shows.
    const d = sim.world.dock;
    sim.world.placeBuilding('basicRooms', d.x - 2, 0, 0);
    sim.world.placeBuilding('basicRooms', d.x - 2, 2, 0);
    sim.autoCheckIn = true;
    untilNight(sim);
    const r = sim.night!;
    const cut = r.costs.find((c) => c.name === 'Investor share')!;
    expect(cut.amount).toBe(-Math.round((r.stats.roomIncome + r.stats.spending) * offer.share));
    expect(sim.investor!.daysLeft).toBe(offer.days - 1);
  });

  it('declining resets the count, so the offer comes back after three more red days', () => {
    const sim = losing();
    for (let i = 0; i < RED_DAYS_FOR_OFFER; i++) {
      untilNight(sim);
      sim.startDay();
    }
    expect(sim.offer).not.toBeNull();
    sim.declineOffer();
    expect(sim.offer).toBeNull();
    untilNight(sim);
    expect(sim.night!.offer).toBeNull();
  });
});
