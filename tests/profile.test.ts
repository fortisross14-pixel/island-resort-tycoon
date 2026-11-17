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
    expect(p.awardMedal('openForBusiness', 'bronze')).toEqual({ xp: FIRST_XP.bronze, first: true });
    expect(p.awardMedal('openForBusiness', 'bronze')).toEqual({ xp: REPEAT_XP.bronze, first: false });
    expect(p.awardMedal('openForBusiness', 'gold')).toEqual({ xp: FIRST_XP.gold, first: true });
    expect(p.xp).toBe(FIRST_XP.bronze + REPEAT_XP.bronze + FIRST_XP.gold);
    expect(p.best('openForBusiness')).toBe('gold');
  });

  it('opens islands with points: bronze 1, silver 2, gold 3 (best medal per mission)', () => {
    const p = new Profile();
    expect(p.missionState(mission('openForBusiness')).open).toBe(true);
    expect(p.missionState(mission('islandKitchen')).open).toBe(true);
    expect(p.missionState(mission('lagoonDays'))).toEqual({ open: false, reason: '3 points in The Caribbean (you have 0)' });
    p.awardMedal('openForBusiness', 'bronze');
    p.awardMedal('openForBusiness', 'silver');
    expect(p.points('caribbean')).toBe(2);
    expect(p.missionState(mission('longBeach')).open).toBe(false);
    p.awardMedal('islandKitchen', 'bronze');
    // A bronze and a silver on the beginner missions open Twin Palms and Far Sands.
    expect(p.points('caribbean')).toBe(3);
    expect(p.missionState(mission('lagoonDays')).open).toBe(true);
    expect(p.missionState(mission('longBeach')).open).toBe(true);
    expect(p.missionState(mission('newPaint')).open).toBe(false);
  });

  it('some missions need research first', () => {
    const p = new Profile();
    p.awardMedal('openForBusiness', 'gold');
    expect(p.missionState(mission('familyCove'))).toEqual({ open: false, reason: 'Research Kids’ Club first' });
    p.research.done.add('kidsClub');
    expect(p.missionState(mission('familyCove')).open).toBe(true);
  });

  it('opens the last island at 10 points', () => {
    const p = new Profile();
    for (const id of ['openForBusiness', 'islandKitchen', 'lagoonDays']) p.awardMedal(id, 'gold');
    expect(p.points('caribbean')).toBe(9);
    expect(p.missionState(mission('newPaint')).open).toBe(false);
    p.awardMedal('longBeach', 'bronze');
    expect(p.missionState(mission('newPaint')).open).toBe(true);
  });

  it('every mission can eventually be opened', () => {
    const p = new Profile();
    for (const s of SCENARIOS) for (const id of s.needsResearch ?? []) p.research.done.add(id);
    for (let round = 0; round < SCENARIOS.length; round++)
      for (const s of SCENARIOS) if (p.missionState(s).open) p.awardMedal(s.id, 'gold');
    for (const s of SCENARIOS) expect(p.missionState(s).open, s.id).toBe(true);
  });

  it('opens the sandbox once both beginner missions have a medal', () => {
    const p = new Profile();
    p.awardMedal('openForBusiness', 'bronze');
    expect(p.sandboxOpen).toBe(false);
    p.awardMedal('islandKitchen', 'bronze');
    expect(p.sandboxOpen).toBe(true);
  });

  it('research is bought with XP on the home screen and applies to every resort', () => {
    const p = new Profile();
    p.awardMedal('openForBusiness', 'bronze');
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
    p.awardMedal('openForBusiness', 'gold');
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
    expect(p.finishMission('openForBusiness', 3.5)).toBe(30);
    expect(p.finishMission('openForBusiness', 1.8)).toBe(0);
    expect(p.finished.openForBusiness).toBe(2);
  });

  it('round-trips through its saved data', () => {
    const p = new Profile();
    p.awardMedal('openForBusiness', 'silver');
    p.buy('giftShop');
    const back = new Profile(JSON.parse(JSON.stringify(p.data())));
    expect(back.xp).toBe(p.xp);
    expect(back.research.done.has('giftShop')).toBe(true);
    expect(back.hasMedal('openForBusiness', 'silver')).toBe(true);
  });
});
