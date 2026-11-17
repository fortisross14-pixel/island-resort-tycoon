import { BUILDINGS, type BuildingKind } from './buildings';
import type { PathGraph } from './pathGraph';
import type { Building, Tile, World } from './world';

/**
 * Room matching for check-in (GDD: "A good match (budget to room tier, wishes to the
 * nearby amenities) gives a satisfaction bonus"). Pure functions over the map, so the
 * HUD can preview a score for every room while a guest card is being dragged.
 */

export type Wish = 'snacks' | 'buffet' | 'quiet' | 'shortWalk';

export const WISHES: Record<Wish, { label: string; met: string; unmet: string }> = {
  snacks: { label: 'Snack Bar nearby', met: 'Snack Bar close by', unmet: 'No Snack Bar nearby' },
  buffet: { label: 'Buffet nearby', met: 'Buffet close by', unmet: 'No Buffet nearby' },
  quiet: { label: 'Quiet spot', met: 'Nice and quiet', unmet: 'Too close to the kitchens' },
  shortWalk: { label: 'Short walk from the dock', met: 'Close to the dock', unmet: 'Long walk from the dock' },
};

/** Room tier per room building (Standard Rooms and Suites join in the vertical slice). */
export const ROOM_TIER: Partial<Record<BuildingKind, number>> = { basicRooms: 1 };

/** Path tiles from a room's door to count as "nearby". */
export const NEARBY_TILES = 6;
/** Food buildings within this many tiles (any direction) make a room noisy. */
export const NOISE_RADIUS = 2;
/** Hand placement always scores this much better than auto check-in (GDD). */
export const AUTO_PENALTY = 10;

export interface MatchNote {
  ok: boolean;
  text: string;
}

export interface Match {
  score: number;
  notes: MatchNote[];
}

export interface Matchable {
  tier: number;
  wishes: Wish[];
  /** Nightly budget; compared with the room rate when given (M5). */
  budget?: number;
}

export function accessOf(world: World, b: Building): Tile[] {
  return world.accessTiles(world.footprintTiles(b.kind, b.x, b.y, b.rot));
}

/** Shortest path distance between two buildings' doors (or a building and the dock). */
function doorDistance(paths: PathGraph, world: World, from: Building, toKey: string, toGoals: Tile[]): number {
  let best = Infinity;
  for (const t of accessOf(world, from)) best = Math.min(best, paths.distance(toKey, toGoals, t));
  return best;
}

function nearKind(paths: PathGraph, world: World, room: Building, kind: BuildingKind): boolean {
  return world.buildings.some(
    (b) => b.kind === kind && doorDistance(paths, world, room, `b${b.id}`, accessOf(world, b)) <= NEARBY_TILES,
  );
}

function isQuiet(world: World, room: Building): boolean {
  const tiles = world.footprintTiles(room.kind, room.x, room.y, room.rot);
  for (const b of world.buildings) {
    if (BUILDINGS[b.kind].family !== 'food') continue;
    for (const f of world.footprintTiles(b.kind, b.x, b.y, b.rot))
      for (const t of tiles) if (Math.max(Math.abs(f.x - t.x), Math.abs(f.y - t.y)) <= NOISE_RADIUS) return false;
  }
  return true;
}

export function wishMet(paths: PathGraph, world: World, room: Building, wish: Wish): boolean {
  switch (wish) {
    case 'snacks':
      return nearKind(paths, world, room, 'snackBar');
    case 'buffet':
      return nearKind(paths, world, room, 'buffet');
    case 'quiet':
      return isQuiet(world, room);
    case 'shortWalk':
      return doorDistance(paths, world, room, 'dock', [world.dock]) <= NEARBY_TILES;
  }
}

/**
 * Score 0–100 for putting a guest in a room; it becomes their starting satisfaction.
 * `rate` is the room's nightly rate, if known.
 */
export function matchScore(paths: PathGraph, world: World, guest: Matchable, room: Building, rate?: number): Match {
  const notes: MatchNote[] = [];
  let score = 60;
  const tier = ROOM_TIER[room.kind] ?? 1;
  const gap = guest.tier - tier;
  if (gap > 0) {
    score -= 12 * gap;
    notes.push({ ok: false, text: 'Hoped for a nicer room' });
  } else if (gap === 0) {
    score += 10;
    notes.push({ ok: true, text: 'Fits the budget' });
  } else {
    // Over-housing is fine for the guest but costs you money (M5: they pay their own rate).
    score += 10;
    notes.push({ ok: true, text: 'A treat for the budget' });
  }
  if (rate !== undefined && guest.budget !== undefined) {
    if (rate > guest.budget) {
      score -= 15;
      notes.push({ ok: false, text: 'Too pricey for us' });
    } else if (rate <= guest.budget * 0.7) {
      score += 5;
      notes.push({ ok: true, text: 'Great value' });
    }
  }
  for (const w of guest.wishes) {
    const met = wishMet(paths, world, room, w);
    score += met ? 15 : -10;
    notes.push({ ok: met, text: met ? WISHES[w].met : WISHES[w].unmet });
  }
  return { score: Math.max(0, Math.min(100, score)), notes };
}
