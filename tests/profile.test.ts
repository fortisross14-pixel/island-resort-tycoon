import { describe, expect, it } from 'vitest';
import { FIRST_XP, Profile, REPEAT_XP } from '../src/sim/profile';
import { SCENARIOS } from '../src/sim/scenario';
import { Sim } from '../src/sim/sim';
import { World } from '../src/sim/world';
import { islandLayout } from '../src/sim/islands';

const mission = (id: string) => SCENARIOS.find((s) => s.id === id)!;

describe('profile (Pass 4 step 4)', () => {
  it('pays a lot for a first medal and a little for repeats', () => {
    const p = new Profile();
    expect(p.awardMedal('driftwood', 'bronze')).toEqual({ xp: FIRST_XP.bronze, first: true });
    expect(p.awardMedal('driftwood', 'bronze')).toEqual({ xp: REPEAT_XP.bronze, first: false });
    expect(p.awardMedal('driftwood', 'gold')).toEqual({ xp: FIRST_XP.gold, first: true });
    expect(p.xp).toBe(FIRST_XP.bronze + REPEAT_XP.bronze + FIRST_XP.gold);
    expect(p.best('driftwood')).toBe('gold');
  });

  it('opens missions like a roadmap', () => {
    const p = new Profile();
    expect(p.missionState(mission('driftwood')).open).toBe(true);
    expect(p.missionState(mission('littleProfit'))).toEqual({ open: false, reason: 'Bronze on Driftwood Beginnings' });
    expect(p.missionState(mission('lagoonDays')).open).toBe(false);
    p.awardMedal('driftwood', 'bronze');
    expect(p.missionState(mission('littleProfit')).open).toBe(true);
    expect(p.missionState(mission('lagoonDays')).open).toBe(false);
    p.awardMedal('driftwood', 'silver');
    expect(p.missionState(mission('lagoonDays')).open).toBe(true);
    // Family Cove: gold on the first mission, or bronze on Lagoon Days.
    expect(p.missionState(mission('familyCove')).open).toBe(false);
    p.awardMedal('lagoonDays', 'bronze');
    expect(p.missionState(mission('familyCove')).open).toBe(true);
  });

  it('every mission can eventually be opened from the start', () => {
    const p = new Profile();
    for (let round = 0; round < SCENARIOS.length; round++)
      for (const s of SCENARIOS) if (p.missionState(s).open) for (const t of ['bronze', 'silver', 'gold'] as const) p.awardMedal(s.id, t);
    for (const s of SCENARIOS) expect(p.missionState(s).open, s.id).toBe(true);
  });

  it('opens the sandbox after bronze on two missions', () => {
    const p = new Profile();
    p.awardMedal('driftwood', 'bronze');
    expect(p.sandboxOpen).toBe(false);
    p.awardMedal('littleProfit', 'bronze');
    expect(p.sandboxOpen).toBe(true);
  });

  it('research is bought with XP on the home screen and applies to every resort', () => {
    const p = new Profile();
    p.awardMedal('driftwood', 'bronze');
    expect(p.buy('standardRooms').ok).toBe(true);
    expect(p.xp).toBe(FIRST_XP.bronze - 18);
    for (const island of ['coconutKey', 'twinPalms']) {
      const sim = new Sim(World.onIsland(islandLayout(island)));
      sim.research = p.research;
      sim.sharedResearch = true;
      sim.progression = true;
      expect(sim.isUnlocked('standardRooms')).toBe(true);
      expect(sim.isUnlocked('frontDesk')).toBe(false);
    }
  });

  it('resort saves and reviews leave shared research alone', () => {
    const p = new Profile();
    p.awardMedal('driftwood', 'gold');
    p.buy('pool');
    const sim = new Sim(World.onIsland(islandLayout('coconutKey')));
    sim.research = p.research;
    sim.sharedResearch = true;
    const before = p.xp;
    sim.reset();
    expect(p.research.done.has('pool')).toBe(true);
    expect(p.xp).toBe(before);
  });

  it('finishing a mission pays a little for the final rating', () => {
    const p = new Profile();
    expect(p.finishMission('driftwood', 3.5)).toBe(30);
    expect(p.finishMission('driftwood', 1.8)).toBe(0);
    expect(p.finished.driftwood).toBe(2);
  });

  it('round-trips through its saved data', () => {
    const p = new Profile();
    p.awardMedal('driftwood', 'silver');
    p.buy('giftShop');
    const back = new Profile(JSON.parse(JSON.stringify(p.data())));
    expect(back.xp).toBe(p.xp);
    expect(back.research.done.has('giftShop')).toBe(true);
    expect(back.hasMedal('driftwood', 'silver')).toBe(true);
  });
});
