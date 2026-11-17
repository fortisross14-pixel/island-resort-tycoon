import { describe, expect, it } from 'vitest';
import { START_MONEY } from '../src/sim/buildings';
import { buildStarter, runPlaytest, type DayLog } from '../src/sim/harness';
import { SCENARIOS } from '../src/sim/scenario';
import { PLOT_BASE_PRICE, World } from '../src/sim/world';

/**
 * Balance targets from the GDD (Pass 2). These run the headless playtest harness, so a
 * change that breaks the economy shows up here. `npm run playtest` prints the details.
 */

// The bot plays a whole 30-month mission (Pass 4: the four ratings make silver a full-length goal).
// Economy targets run on the prototype map with a mission's daily objectives attached.
const bot = [1, 2].map((seed) => runPlaytest({ strategy: 'bot', days: 30, seed, scenario: 'islandKitchen' }));
const starter = [1, 2, 3].map((seed) => runPlaytest({ strategy: 'starter', days: 8, seed, scenario: 'islandKitchen' }).log);
/** First month a medal of this tier or better was held. */
const monthOf = (log: DayLog[], tiers: string[]) => log.find((l) => l.medal && tiers.includes(l.medal))?.day ?? Infinity;
const BRONZE = ['bronze', 'silver', 'gold'];
const SILVER = ['silver', 'gold'];

/**
 * The difficulty curve of the Caribbean (Pass 4), played by the simple bot: it builds rooms,
 * food and fun as demand grows, a little decor and repairs, but never runs activities. An
 * average player should silver the beginner missions without trying; golds need speed;
 * intermediate missions need quality or activities; advanced ones are out of its reach.
 */
const missionRun = (id: string, seed: number) => {
  const def = SCENARIOS.find((s) => s.id === id)!;
  return runPlaytest({ strategy: 'bot', days: def.days, seed, mission: id }).log;
};

describe('balance (GDD targets)', () => {
  it('the starting coins buy the starter resort with a little left over', () => {
    const w = World.newGame();
    buildStarter(w);
    expect(w.buildings).toHaveLength(6);
    expect(w.money).toBeGreaterThan(500);
    expect(w.money).toBeLessThan(START_MONEY * 0.25);
  });

  it('the starter resort is profitable by day 2', () => {
    for (const log of starter) expect(log[1].profit).toBeGreaterThan(0);
  });

  it('the first land plot is affordable within the first week', () => {
    for (const log of starter) expect(log.find((l) => l.money >= PLOT_BASE_PRICE)?.day ?? 99).toBeLessThanOrEqual(6);
  });

  it('venue spending overtakes room income as the resort grows', () => {
    for (const { log } of bot) {
      const late = log.slice(-5);
      const rooms = late.reduce((s, l) => s + l.roomIncome, 0);
      const spending = late.reduce((s, l) => s + l.spending, 0);
      const share = spending / (rooms + spending);
      expect(share).toBeGreaterThan(0.45);
      expect(share).toBeLessThan(0.8);
    }
  });

  it('well-used rooms pay back within about two weeks', () => {
    for (const { analysis } of bot) {
      const basic = analysis.payback.find((p) => p.kind === 'basicRooms')!;
      expect(basic.days).toBeLessThanOrEqual(15);
    }
  });

  it('beginner missions: silver comes without trying, gold needs speed', () => {
    for (const id of ['openForBusiness', 'islandKitchen'])
      for (const seed of [1, 2]) {
        const log = missionRun(id, seed);
        expect(monthOf(log, BRONZE), `${id} bronze`).toBeLessThanOrEqual(10);
        expect(monthOf(log, SILVER), `${id} silver`).toBeLessThanOrEqual(15);
        expect(monthOf(log, ['gold']), `${id} gold`).toBe(Infinity);
      }
  }, 30000);

  it('intermediate missions: no gold without real effort, and activity missions need activities', () => {
    for (const id of ['lagoonDays', 'familyCove', 'hideaway', 'longBeach', 'sunAndSea']) {
      const log = missionRun(id, 1);
      expect(monthOf(log, ['gold']), id).toBe(Infinity);
      if (id === 'lagoonDays' || id === 'sunAndSea') expect(monthOf(log, BRONZE), id).toBe(Infinity);
    }
  }, 30000);

  it('advanced missions: even bronze is out of reach for a simple player', () => {
    for (const id of ['newPaint', 'jewel']) expect(monthOf(missionRun(id, 1), BRONZE), id).toBe(Infinity);
  }, 30000);

  it('a resort that never grows keeps a modest rating', () => {
    for (const log of starter) expect(log[log.length - 1].rating).toBeLessThan(3.3);
  });

  it('a growing resort earns a good rating', () => {
    // Pass 4: without activities and with only a little decor, a well-run resort sits in the low 3s.
    for (const { log } of bot) expect(log[log.length - 1].rating).toBeGreaterThan(3.15);
  });

  it('decor and activities are where a growing resort is weakest (the four ratings pull apart)', () => {
    for (const { log } of bot) {
      const c = log[log.length - 1].cats;
      expect(c.amenities).toBeGreaterThan(c.activities);
      expect(c.lodging).toBeGreaterThan(c.decor - 0.5);
    }
  });
});
