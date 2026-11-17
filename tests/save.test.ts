import { describe, expect, it } from 'vitest';
import v5 from './fixtures/save-v5.json?raw';
import v6 from './fixtures/save-v6.json?raw';
import v7 from './fixtures/save-v7.json?raw';
import { parseSave, migrateSim, SIM_VERSION } from '../src/sim/save';
import { World } from '../src/sim/world';
import { Sim } from '../src/sim/sim';

const FIXTURES: Record<string, string> = { 'save-v5.json': v5, 'save-v6.json': v6, 'save-v7.json': v7 };
const fixture = (name: string) => FIXTURES[name];

/** Load a save the way the game does and run it for a while. */
function play(raw: string): { world: World; sim: Sim } {
  const r = parseSave(raw);
  if (!r.ok) throw new Error(r.reason);
  const world = World.fromSnapshot(r.save.world);
  const sim = new Sim(world);
  sim.restore(r.save.sim!);
  for (let i = 0; i < 2000; i++) sim.step();
  return { world, sim };
}

describe('saves', () => {
  it('loads a current (v7) save and keeps playing', () => {
    const r = parseSave(fixture('save-v7.json'));
    expect(r.ok && r.migrated).toBe(false);
    const { world, sim } = play(fixture('save-v7.json'));
    expect(world.buildings.length).toBeGreaterThan(0);
    expect(sim.campaign).not.toBeNull();
    expect(sim.maintenance).toBe('normal');
  });

  it('upgrades a v6 save (before the four ratings) and keeps its reviews', () => {
    const r = parseSave(fixture('save-v6.json'));
    expect(r.ok && r.migrated).toBe(true);
    const { sim } = play(fixture('save-v6.json'));
    expect(sim.maintenance).toBe('normal');
    // Old reviews count their overall stars in every category.
    expect(sim.categoryRating('decor')).toBeGreaterThan(0);
  });

  it('upgrades a v5 save (before scenarios) to the current version', () => {
    const r = parseSave(fixture('save-v5.json'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migrated).toBe(true);
    expect(r.save.sim!.version).toBe(SIM_VERSION);
    expect(r.save.sim!.campaign).toBeNull();
    const { sim } = play(fixture('save-v5.json'));
    expect(sim.redDays).toBe(0);
  });

  it('keeps the world when the sim is from an unknown version', () => {
    const data = JSON.parse(fixture('save-v7.json'));
    data.sim.version = 2;
    const r = parseSave(JSON.stringify(data));
    expect(r.ok && r.save.sim === undefined && r.migrated).toBe(true);
  });

  it('rejects a save from a newer game', () => {
    expect(() => migrateSim({ version: SIM_VERSION + 1 })).toThrow(/newer/);
  });

  it('reports empty, corrupt and too-old saves', () => {
    expect(parseSave(null)).toEqual({ ok: false, reason: 'empty' });
    expect(parseSave('{not json')).toEqual({ ok: false, reason: 'corrupt' });
    // An M1 save: a 10×10 world snapshot with no plots.
    expect(parseSave(JSON.stringify({ version: 1, size: 10, paths: [], buildings: [], money: 1 }))).toEqual({ ok: false, reason: 'too-old' });
  });
});

import { dateText, duration, monthYear, yearOf } from '../src/sim/calendar';

describe('calendar', () => {
  it('shows each schedule day as a month', () => {
    expect(dateText(1, 7 * 60)).toBe('Jan 1');
    expect(dateText(14, 23 * 60)).toBe('Feb 30');
    expect(monthYear(13)).toBe('January, year 2');
    expect(yearOf(36)).toBe(3);
    expect(yearOf(37)).toBe(4);
    expect(duration(30)).toBe('2 years 6 months');
    expect(duration(12)).toBe('1 year');
  });
});
