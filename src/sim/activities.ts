import { BUILDINGS, type BuildingKind } from './buildings';
import type { Tile, World } from './world';

/**
 * Activities (Pass 4 step 3). Activity hubs run sessions you schedule in the planner: three
 * slots a month-day (morning, afternoon, evening). Guests sign up by interest, budget and how
 * bored they are, meet at the hub, and go out together. Trails and boat routes are drawn by
 * the player through the island's landmarks; the more a route shows, the better the trip.
 */

export type ActivityKind = 'hike' | 'yoga' | 'kayak' | 'boat';
export type RouteKind = 'trail' | 'water';
export type Slot = 'morning' | 'afternoon' | 'evening';
export const SLOTS: Slot[] = ['morning', 'afternoon', 'evening'];
export const SLOT_NAMES: Record<Slot, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
/** Start time of each slot, in schedule minutes. Sign-ups open 90 minutes before. */
export const SLOT_START: Record<Slot, number> = { morning: 10 * 60, afternoon: 14 * 60, evening: 18 * 60 };
/** Late enough that the morning ferry's guests (docking at 08:00) can join the morning session. */
export const SIGNUP_LEAD = 90;
/** Guests head to the meeting point this long before the start. */
export const GATHER_LEAD = 75;

export interface ActivityDef {
  kind: ActivityKind;
  hub: BuildingKind;
  name: string;
  /** Route the player draws, or none (yoga). */
  route: RouteKind | null;
  /** People per session. */
  capacity: number;
  /** Price per person at the middle price step. */
  basePrice: number;
  /** Length in schedule minutes when there's no route. */
  minutes?: number;
  /** Water a route may use ('water' routes): kayaks stay in calm water. */
  calmOnly?: boolean;
}

export const ACTIVITIES: Partial<Record<BuildingKind, ActivityDef>> = {
  trailHut: { kind: 'hike', hub: 'trailHut', name: 'Jungle hike', route: 'trail', capacity: 10, basePrice: 9 },
  yogaDeck: { kind: 'yoga', hub: 'yogaDeck', name: 'Yoga class', route: null, capacity: 8, basePrice: 11, minutes: 75 },
  kayakRental: { kind: 'kayak', hub: 'kayakRental', name: 'Kayak tour', route: 'water', capacity: 6, basePrice: 14, calmOnly: true },
  excursionPier: { kind: 'boat', hub: 'excursionPier', name: 'Boat tour', route: 'water', capacity: 12, basePrice: 24 },
};

export function activityOf(kind: BuildingKind): ActivityDef | undefined {
  return ACTIVITIES[kind];
}

/** How keen each guest type is on each activity (0–1). */
export const INTEREST: Record<string, Record<ActivityKind, number>> = {
  backpacker: { hike: 0.9, yoga: 0.35, kayak: 0.8, boat: 0.5 },
  couple: { hike: 0.5, yoga: 0.6, kayak: 0.6, boat: 0.8 },
  family: { hike: 0.45, yoga: 0.2, kayak: 0.65, boat: 0.85 },
  wellness: { hike: 0.6, yoga: 1, kayak: 0.5, boat: 0.4 },
  party: { hike: 0.3, yoga: 0.1, kayak: 0.45, boat: 0.9 },
  vip: { hike: 0.2, yoga: 0.6, kayak: 0.3, boat: 1 },
  business: { hike: 0.15, yoga: 0.45, kayak: 0.2, boat: 0.5 },
};

export function interestOf(type: string, kind: ActivityKind): number {
  return INTEREST[type]?.[kind] ?? 0.4;
}

// ---------- landmarks ----------

export type LandmarkKind = 'waterfall' | 'ruins' | 'viewpoint' | 'cave' | 'turtles' | 'dolphins' | 'coral' | 'mangroves';

export interface Landmark {
  x: number;
  y: number;
  kind: LandmarkKind;
  name: string;
}

export const LANDMARK_NAMES: Record<LandmarkKind, string> = {
  waterfall: 'Waterfall',
  ruins: 'Old ruins',
  viewpoint: 'Viewpoint',
  cave: 'Cave',
  turtles: 'Turtle bay',
  dolphins: 'Dolphin pod',
  coral: 'Coral garden',
  mangroves: 'Mangroves',
};

/** Land landmarks are seen from trails; sea life from boats and kayaks. */
export const LAND_LANDMARKS: LandmarkKind[] = ['waterfall', 'ruins', 'viewpoint', 'cave'];

export function isLandLandmark(k: LandmarkKind): boolean {
  return LAND_LANDMARKS.includes(k);
}

// ---------- routes ----------

export interface Route {
  hubId: number;
  kind: RouteKind;
  tiles: Tile[];
}

export const MAX_ROUTE = 40;
export const TRAIL_TILE_COST = 5;

/** Tiles next to a hub's footprint where a route can start. */
export function routeStarts(world: World, hubId: number): Tile[] {
  const b = world.buildings.find((x) => x.id === hubId);
  if (!b) return [];
  const def = activityOf(b.kind);
  if (!def?.route) return [];
  const fp = world.footprintTiles(b.kind, b.x, b.y, b.rot);
  const inside = new Set(fp.map((t) => `${t.x},${t.y}`));
  const out: Tile[] = [];
  for (const t of fp)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = { x: t.x + dx, y: t.y + dy };
      if (inside.has(`${n.x},${n.y}`)) continue;
      if (canStepOn(world, def, n, null).ok) out.push(n);
    }
  return out;
}

/** Can a route of this activity use a tile (coming from `prev`)? */
export function canStepOn(world: World, def: ActivityDef, t: Tile, prev: Tile | null): { ok: true } | { ok: false; reason: string } {
  if (!world.inBounds(t.x, t.y)) return { ok: false, reason: 'Off the map' };
  if (def.route === 'trail') {
    if (!world.isGround(t.x, t.y)) return { ok: false, reason: 'Trails stay on land' };
    if (world.buildingAt(t.x, t.y)) return { ok: false, reason: 'A building is in the way' };
    if (prev && Math.abs(world.heightAt(prev.x, prev.y) - world.heightAt(t.x, t.y)) > 1) return { ok: false, reason: 'Too steep: climb one level at a time' };
    return { ok: true };
  }
  if (world.isGround(t.x, t.y)) return { ok: false, reason: 'Boats stay on the water' };
  const ter = world.terrainAt(t.x, t.y);
  if (def.calmOnly && ter === '~') return { ok: false, reason: 'Kayaks keep to calm water' };
  return { ok: true };
}

/** Landmarks a route passes within one tile of. */
export function landmarksOn(route: Route, landmarks: Landmark[]): Landmark[] {
  const want = route.kind === 'trail';
  return landmarks.filter(
    (l) => isLandLandmark(l.kind) === want && route.tiles.some((t) => Math.abs(t.x - l.x) <= 1 && Math.abs(t.y - l.y) <= 1),
  );
}

/**
 * How good a trip on this route is (0–100), before the guest's own taste. Landmarks matter
 * most; then the scenery (jungle for hikes, reef and lagoon for boats); then a sensible length.
 */
export function routeQuality(world: World, route: Route | null, def: ActivityDef, landmarks: Landmark[], hubAppeal = 40): number {
  if (!def.route) return Math.min(95, 50 + hubAppeal * 0.45);
  if (!route || route.tiles.length < 3) return 0;
  const seen = landmarksOn(route, landmarks).length;
  const n = route.tiles.length;
  let scenic = 0;
  for (const t of route.tiles) {
    const ter = world.terrainAt(t.x, t.y);
    if (def.route === 'trail' && (ter === 'j' || world.heightAt(t.x, t.y) >= 2)) scenic++;
    if (def.route === 'water' && (ter === '*' || ter === 'o')) scenic++;
  }
  const ideal = def.route === 'trail' ? 16 : 22;
  const lengthFit = 1 - Math.min(1, Math.abs(n - ideal) / ideal);
  return Math.round(Math.min(98, 30 + Math.min(4, seen) * 12 + (scenic / n) * 18 + lengthFit * 10));
}

/** Trip length in schedule minutes: walking or paddling there and back. */
export function tripMinutes(def: ActivityDef, route: Route | null): number {
  if (!def.route) return def.minutes ?? 60;
  const n = route?.tiles.length ?? 0;
  return Math.round((def.route === 'trail' ? 40 : 30) + n * (def.kind === 'kayak' ? 6 : def.route === 'trail' ? 5 : 4));
}

/** Price per person at a price step (same five steps as venues). */
export function activityPrice(def: ActivityDef, step: number): number {
  const mult = [0.5, 0.75, 1, 1.4, 2][step] ?? 1;
  return Math.round(def.basePrice * mult);
}

/** The hub kinds, for menus. */
export const HUB_KINDS = Object.keys(ACTIVITIES) as BuildingKind[];

export function hubName(kind: BuildingKind): string {
  return BUILDINGS[kind].name;
}
