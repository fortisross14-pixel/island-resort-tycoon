import type { SimSnapshot } from './sim';
import { World, type WorldSnapshot } from './world';

/** What goes into storage: the world and (from M2) the simulation beside it. */
export interface SaveFile {
  world: WorldSnapshot;
  sim?: SimSnapshot;
}

export type LoadResult =
  | { ok: true; save: SaveFile; migrated: boolean }
  | { ok: false; reason: 'empty' | 'corrupt' | 'too-old' };

type AnySim = { version: number } & Record<string, unknown>;

/**
 * Sim snapshot upgrades, one step per version. Each takes version N and returns N+1.
 * Add a step here whenever SimSnapshot changes shape, and a fixture in tests/fixtures.
 */
const SIM_STEPS: Record<number, (s: AnySim) => AnySim> = {
  // Pass 1 step 4 added scenarios and the investor rescue.
  5: (s) => ({ ...s, version: 6, campaign: null, redDays: 0, investor: null, offer: null }),
  // Pass 4 step 2 added the four ratings and maintenance; guests start their category scores now.
  6: (s) => ({ ...s, version: 7, maintenance: 'normal' }),
  // Pass 4 step 3 added the day plan and activity sessions.
  7: (s) => ({ ...s, version: 8, plan: [], activityPrices: {}, trips: [], slotsDone: { morning: 0, afternoon: 0, evening: 0 } }),
  // Pass 5 added staff. Existing resorts get the handyman and one guide on every planned session,
  // so what ran before still runs.
  8: (s) => {
    const plan = (s.plan as Array<{ hubId: number; slot: string }>) ?? [];
    const staff: Array<Record<string, unknown>> = [{ id: 1, name: 'Old Joe', role: 'maintenance', skill: 1, wage: 0, hired: 1 }];
    let id = 2;
    for (const p of plan) staff.push({ id: id++, name: 'Guide', role: 'operations', skill: 2, wage: 135, hired: 1, shifts: { [p.slot]: `hub:${p.hubId}` } });
    return { ...s, version: 9, staff, candidates: {}, nextWorkerId: id, books: [] };
  },
};

export const SIM_VERSION = 9;

export function migrateSim(s: AnySim): SimSnapshot {
  let cur = s;
  while (cur.version < SIM_VERSION) {
    const step = SIM_STEPS[cur.version];
    if (!step) throw new Error(`No upgrade from sim v${cur.version}`);
    cur = step(cur);
  }
  if (cur.version !== SIM_VERSION) throw new Error(`Save is from a newer version (sim v${cur.version})`);
  return cur as unknown as SimSnapshot;
}

/**
 * Parse and upgrade a stored save. World snapshots from before the plotted map (M1–M5) can't be
 * mapped onto the new island and report 'too-old'; a sim that can't be upgraded is dropped and the
 * world kept, so the player at least keeps their buildings.
 */
export function parseSave(raw: string | null): LoadResult {
  if (!raw) return { ok: false, reason: 'empty' };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!data || typeof data !== 'object') return { ok: false, reason: 'corrupt' };
  // M1 saves held just the world snapshot.
  const file = ('world' in data ? data : { world: data }) as { world: WorldSnapshot; sim?: AnySim };
  try {
    World.fromSnapshot(file.world); // throws if the world doesn't fit this version
  } catch {
    return { ok: false, reason: 'too-old' };
  }
  let migrated = false;
  let sim: SimSnapshot | undefined;
  if (file.sim) {
    try {
      migrated = file.sim.version !== SIM_VERSION;
      sim = migrateSim(file.sim);
    } catch {
      sim = undefined;
      migrated = true;
    }
  }
  return { ok: true, save: { world: file.world, sim }, migrated };
}
