import { BUILDINGS } from './buildings';
import { PathGraph } from './pathGraph';
import { Rng } from './rng';
import type { Building, Tile, World } from './world';

/**
 * The living resort (M2): the day clock, the morning ferry, and guests walking the
 * footpaths. Runs at a fixed tick, separate from drawing (GDD risk mitigation for
 * many guests on phones). Pure TypeScript, so it runs headless in tests.
 *
 * Time units: "sim seconds" drive movement (one real second at 1x speed);
 * "game minutes" drive the schedule. One game hour = 12.5 sim seconds, so the
 * 07:00–23:00 day lasts 200 s, inside the GDD's 3–4 minutes.
 */

export const TICK = 0.05;
export const SECONDS_PER_GAME_HOUR = 12.5;
export const MINUTES_PER_SECOND = 60 / SECONDS_PER_GAME_HOUR;
export const DAY_START = 7 * 60;
export const DAY_END = 23 * 60;
export const FERRY_ARRIVES = 8 * 60;
/** Earliest time the ferry leaves; it also waits until everyone waiting has boarded. */
export const FERRY_LEAVES = 9 * 60 + 30;
export const EVENING = 21 * 60;
export const FERRY_TRAVEL_SECONDS = 6;
export const UNLOAD_INTERVAL = 0.45;
export const WALK_SPEED = 1.4; // tiles per sim second
export const ROOMS_PER_BUILDING = 2;
export const MAX_GUESTS = 200;
/** Timer value meaning "inside until morning". */
const OVERNIGHT = 1e9;

export type GuestType = 'backpacker' | 'couple';

export const GUEST_TYPES: Record<GuestType, { name: string; nights: [number, number] }> = {
  backpacker: { name: 'Backpacker', nights: [1, 2] },
  couple: { name: 'Couple', nights: [2, 4] },
};

export interface Point {
  x: number;
  z: number;
}

export type Purpose = 'room' | 'rest' | 'food';

export type Goal =
  | { kind: 'building'; id: number; purpose: Purpose }
  | { kind: 'dock' }
  | { kind: 'tile'; tile: Tile };

export type GuestState = 'arriving' | 'walking' | 'inside' | 'waiting' | 'boarding' | 'gone';

export interface Guest {
  id: number;
  type: GuestType;
  /** Building id of their room, or null when unhoused. */
  roomId: number | null;
  nightsLeft: number;
  leaving: boolean;
  state: GuestState;
  /** World position (tile units; tile (x,y) centre = x+0.5, y+0.5). */
  x: number;
  z: number;
  /** Position at the previous tick, for render interpolation. */
  px: number;
  pz: number;
  waypoints: Point[];
  wp: number;
  goal: Goal | null;
  /** Last path tile reached, or null while on the pier. */
  tile: Tile | null;
  insideId: number | null;
  timer: number;
  /** One short line of what they're thinking (shown on tap from M4). */
  thought: string;
  /** Stable per-guest number for visual variety. */
  look: number;
}

export type FerryPhase = 'away' | 'arriving' | 'docked' | 'leaving';

export interface Ferry {
  phase: FerryPhase;
  /** 0 = far out at sea, 1 = at the berth. */
  t: number;
  toUnload: number;
  unloadTimer: number;
  cameToday: boolean;
}

export interface DayStats {
  arrived: number;
  housed: number;
  turnedAway: number;
  departed: number;
}

export interface SimSnapshot {
  version: 1;
  minutes: number;
  rng: number;
  nextGuestId: number;
  ferry: Ferry;
  guests: Guest[];
  today: DayStats;
}

export type SimEvent =
  | { type: 'ferryArriving' }
  | { type: 'ferryDocked'; guests: number }
  | { type: 'ferryLeft' }
  | { type: 'turnedAway'; guestId: number }
  | { type: 'newDay'; day: number; yesterday: DayStats };

const emptyStats = (): DayStats => ({ arrived: 0, housed: 0, turnedAway: 0, departed: 0 });

/** Guests arriving on a given day's ferry (first pass; M5 ties this to the star rating). */
export function arrivalsForDay(day: number): number {
  return Math.min(4 + 2 * day, 20);
}

export class Sim {
  minutes = DAY_START;
  guests: Guest[] = [];
  ferry: Ferry = { phase: 'away', t: 0, toUnload: 0, unloadTimer: 0, cameToday: false };
  today: DayStats = emptyStats();
  readonly paths: PathGraph;
  private rng = new Rng();
  private nextGuestId = 1;
  private stale = false;
  private listeners = new Set<(e: SimEvent) => void>();

  constructor(readonly world: World) {
    this.paths = new PathGraph(world);
    world.onChange(() => (this.stale = true));
  }

  // ---------- geometry of the dock and pier ----------

  /** Where guests step on and off the boat, at the end of the pier. */
  get berth(): Point {
    const d = this.world.dock;
    return { x: d.x + 0.85, z: d.y + 3.7 };
  }

  /** The boat's position for a ferry progress value (0 = out at sea, 1 = docked). */
  ferryPosition(t: number): Point {
    const d = this.world.dock;
    const e = 1 - (1 - t) * (1 - t) * (1 - t); // ease out as it comes in
    return { x: d.x + 1.6, z: d.y + 3.6 + (1 - e) * 18 };
  }

  private pierWalk(towardsBoat: boolean): Point[] {
    const d = this.world.dock;
    const pts = [
      { x: d.x + 0.5, z: d.y + 0.5 },
      { x: d.x + 0.5, z: d.y + 1.2 },
      { x: d.x + 0.5, z: d.y + 3.5 },
      this.berth,
    ];
    return towardsBoat ? pts : pts.reverse();
  }

  private waitingSpot(): Point {
    const d = this.world.dock;
    return { x: d.x + 0.5 + this.rng.range(-0.25, 0.25), z: d.y + this.rng.range(1.3, 3.2) };
  }

  // ---------- queries ----------

  get day(): number {
    return this.world.day;
  }

  /** "08:05" for the HUD. */
  get clockText(): string {
    const m = Math.floor(this.minutes);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  get onIsland(): number {
    return this.guests.filter((g) => g.state !== 'gone').length;
  }

  occupancy(roomId: number): number {
    let n = 0;
    for (const g of this.guests) if (g.roomId === roomId) n++;
    return n;
  }

  /** True when something is moving, so the renderer must keep drawing. */
  get animating(): boolean {
    return this.ferry.phase === 'arriving' || this.ferry.phase === 'leaving' || this.guests.some((g) => isMoving(g));
  }

  on(fn: (e: SimEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: SimEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  // ---------- the tick ----------

  step(dt = TICK): void {
    for (const g of this.guests) {
      g.px = g.x;
      g.pz = g.z;
    }
    if (this.stale) this.reconcile();

    this.minutes += dt * MINUTES_PER_SECOND;
    if (this.minutes >= DAY_END) this.endDay();

    this.stepFerry(dt);
    for (const g of this.guests) this.stepGuest(g, dt);
    if (this.guests.length > MAX_GUESTS * 2) this.guests = this.guests.filter((g) => g.state !== 'gone');
  }

  private endDay(): void {
    const yesterday = this.today;
    for (const g of this.guests) if (g.roomId !== null) g.nightsLeft--;
    this.world.day++;
    this.minutes = DAY_START;
    this.ferry.cameToday = false;
    this.today = emptyStats();
    this.guests = this.guests.filter((g) => g.state !== 'gone');
    // Morning: everyone wakes up; guests whose stay is over check out.
    for (const g of this.guests) {
      if (g.nightsLeft <= 0 && g.roomId !== null) {
        g.leaving = true;
        g.roomId = null;
        g.thought = 'Time to go home.';
      }
      if (g.state === 'inside' && g.timer >= OVERNIGHT) g.timer = this.rng.range(0, 3);
    }
    this.emit({ type: 'newDay', day: this.world.day, yesterday });
  }

  private stepFerry(dt: number): void {
    const f = this.ferry;
    switch (f.phase) {
      case 'away':
        if (!f.cameToday && this.minutes >= FERRY_ARRIVES && this.minutes < DAY_END - 60) {
          f.phase = 'arriving';
          f.cameToday = true;
          f.t = 0;
          const room = MAX_GUESTS - this.onIsland;
          f.toUnload = Math.max(0, Math.min(arrivalsForDay(this.day), room));
          this.emit({ type: 'ferryArriving' });
        }
        return;
      case 'arriving':
        f.t = Math.min(1, f.t + dt / FERRY_TRAVEL_SECONDS);
        if (f.t >= 1) {
          f.phase = 'docked';
          f.unloadTimer = 0.3;
          this.emit({ type: 'ferryDocked', guests: f.toUnload });
        }
        return;
      case 'docked': {
        if (f.toUnload > 0) {
          f.unloadTimer -= dt;
          if (f.unloadTimer <= 0) {
            f.unloadTimer = UNLOAD_INTERVAL;
            f.toUnload--;
            this.spawnGuest();
          }
          return;
        }
        // Waiting guests walk aboard; leave once they're on and it's late enough.
        for (const g of this.guests)
          if (g.state === 'waiting') {
            g.state = 'boarding';
            g.waypoints = [{ x: g.x, z: g.z }, this.berth];
            g.wp = 0;
          }
        const boarding = this.guests.some((g) => g.state === 'boarding');
        if (!boarding && this.minutes >= FERRY_LEAVES) {
          f.phase = 'leaving';
          this.emit({ type: 'ferryLeft' });
        }
        return;
      }
      case 'leaving':
        f.t = Math.max(0, f.t - dt / FERRY_TRAVEL_SECONDS);
        if (f.t <= 0) f.phase = 'away';
        return;
    }
  }

  private spawnGuest(): void {
    const type: GuestType = this.rng.next() < 0.55 ? 'backpacker' : 'couple';
    const [lo, hi] = GUEST_TYPES[type].nights;
    const b = this.berth;
    const g: Guest = {
      id: this.nextGuestId++,
      type,
      roomId: null,
      nightsLeft: this.rng.int(lo, hi),
      leaving: false,
      state: 'arriving',
      x: b.x,
      z: b.z,
      px: b.x,
      pz: b.z,
      waypoints: this.pierWalk(false),
      wp: 0,
      goal: null,
      tile: null,
      insideId: null,
      timer: 0,
      thought: 'What a view!',
      look: Math.floor(this.rng.next() * 1000),
    };
    this.guests.push(g);
    this.today.arrived++;
  }

  private stepGuest(g: Guest, dt: number): void {
    switch (g.state) {
      case 'arriving':
      case 'walking':
      case 'boarding':
        if (this.walk(g, dt)) this.arrive(g);
        return;
      case 'inside':
        g.timer -= dt;
        if (g.timer <= 0) this.exitBuilding(g);
        return;
      case 'waiting':
      case 'gone':
        return;
    }
  }

  /** Move along waypoints. Returns true on reaching the last one. */
  private walk(g: Guest, dt: number): boolean {
    let budget = WALK_SPEED * dt;
    while (budget > 0 && g.wp < g.waypoints.length) {
      const t = g.waypoints[g.wp];
      const dx = t.x - g.x;
      const dz = t.z - g.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= budget) {
        g.x = t.x;
        g.z = t.z;
        budget -= dist;
        g.wp++;
        // Passing a tile centre on the grid updates the guest's tile.
        const tx = t.x - 0.5;
        const tz = t.z - 0.5;
        if (Number.isInteger(tx) && Number.isInteger(tz) && this.world.isPath(tx, tz)) g.tile = { x: tx, y: tz };
      } else {
        g.x += (dx / dist) * budget;
        g.z += (dz / dist) * budget;
        budget = 0;
      }
    }
    return g.wp >= g.waypoints.length;
  }

  private arrive(g: Guest): void {
    if (g.state === 'arriving') {
      g.state = 'walking';
      g.tile = { ...this.world.dock };
      this.checkIn(g);
      return this.decide(g);
    }
    if (g.state === 'boarding') {
      g.state = 'gone';
      this.today.departed++;
      return;
    }
    const goal = g.goal;
    if (!goal) return this.decide(g);
    if (goal.kind === 'dock') {
      g.state = 'waiting';
      return;
    }
    if (goal.kind === 'tile') return this.decide(g);
    const b = this.building(goal.id);
    if (!b) return this.decide(g);
    g.state = 'inside';
    g.insideId = b.id;
    g.timer =
      goal.purpose === 'food'
        ? this.rng.range(3, 6)
        : goal.purpose === 'room' && this.minutes >= EVENING
          ? OVERNIGHT
          : this.rng.range(8, 14);
    g.thought = goal.purpose === 'food' ? `Lunch at the ${BUILDINGS[b.kind].name}.` : 'A little rest.';
  }

  private exitBuilding(g: Guest): void {
    g.insideId = null;
    g.state = 'walking';
    // They reappear at the path tile they went in from (g.tile is unchanged).
    if (g.tile) {
      g.x = g.tile.x + 0.5;
      g.z = g.tile.y + 0.5;
    }
    this.decide(g);
  }

  /**
   * Auto check-in (placeholder until M3's drag-to-room check-in): take the free
   * room nearest the dock, or be turned away.
   */
  private checkIn(g: Guest): void {
    let best: Building | null = null;
    let bestD = Infinity;
    const dock = this.world.dock;
    for (const b of this.world.buildings) {
      if (BUILDINGS[b.kind].family !== 'rooms' || this.occupancy(b.id) >= ROOMS_PER_BUILDING) continue;
      const d = this.paths.distance(`b${b.id}`, this.access(b), dock);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (best && Number.isFinite(bestD)) {
      g.roomId = best.id;
      this.today.housed++;
      g.thought = 'Found my room!';
    } else {
      g.leaving = true;
      g.thought = 'No rooms left? I’m going home.';
      this.today.turnedAway++;
      this.emit({ type: 'turnedAway', guestId: g.id });
    }
  }

  /** Pick what to do next and plan the walk there. */
  private decide(g: Guest): void {
    if (g.leaving) return this.plan(g, { kind: 'dock' });
    if (g.roomId === null || !this.building(g.roomId)) {
      g.roomId = null;
      g.leaving = true;
      g.thought = 'My room is gone!';
      return this.plan(g, { kind: 'dock' });
    }
    if (this.minutes >= EVENING) return this.plan(g, { kind: 'building', id: g.roomId, purpose: 'room' });

    const r = this.rng.next();
    if (r < 0.55) {
      const food = this.pickFood(g);
      if (food) return this.plan(g, { kind: 'building', id: food.id, purpose: 'food' });
    }
    if (r < 0.8) {
      const tiles = this.world.pathTiles();
      return this.plan(g, { kind: 'tile', tile: this.rng.pick(tiles) });
    }
    return this.plan(g, { kind: 'building', id: g.roomId, purpose: 'rest' });
  }

  /** Food buildings weighted towards the closer ones (M4 replaces this with needs). */
  private pickFood(g: Guest): Building | null {
    if (!g.tile) return null;
    const options: Array<{ b: Building; w: number }> = [];
    for (const b of this.world.buildings) {
      if (BUILDINGS[b.kind].family !== 'food') continue;
      const d = this.paths.distance(`b${b.id}`, this.access(b), g.tile);
      if (!Number.isFinite(d) || d >= 0x7fff) continue;
      options.push({ b, w: 1 / (1 + d) });
    }
    if (!options.length) return null;
    let r = this.rng.next() * options.reduce((s, o) => s + o.w, 0);
    for (const o of options) if ((r -= o.w) <= 0) return o.b;
    return options[options.length - 1].b;
  }

  /** Turn a goal into waypoints from the guest's current tile. */
  private plan(g: Guest, goal: Goal): void {
    g.goal = goal;
    g.state = 'walking';
    const from = g.tile && this.world.isPath(g.tile.x, g.tile.y) ? g.tile : null;
    if (!from) return this.teleportToDock(g, goal);

    let key: string;
    let goals: Tile[];
    let b: Building | undefined;
    if (goal.kind === 'building') {
      b = this.building(goal.id);
      if (!b) return this.decide(g);
      key = `b${b.id}`;
      goals = this.access(b);
    } else if (goal.kind === 'dock') {
      key = 'dock';
      goals = [this.world.dock];
    } else {
      key = `t${goal.tile.x},${goal.tile.y}`;
      goals = [goal.tile];
    }

    const route = this.paths.route(key, goals, from);
    if (!route) return this.teleportToDock(g, goal);
    const pts: Point[] = [{ x: from.x + 0.5, z: from.y + 0.5 }, ...route.map((t) => ({ x: t.x + 0.5, z: t.y + 0.5 }))];
    const end = route.length ? route[route.length - 1] : from;
    if (b) pts.push(this.doorPoint(b, end));
    if (goal.kind === 'dock') pts.push(...this.pierWalk(true).slice(1, 2), this.waitingSpot());
    g.waypoints = pts;
    g.wp = 0;
  }

  /** Fallback when a guest is cut off (e.g. the path under them was removed). */
  private teleportToDock(g: Guest, goal: Goal): void {
    const d = this.world.dock;
    g.tile = { ...d };
    g.x = g.px = d.x + 0.5;
    g.z = g.pz = d.y + 0.5;
    if (goal.kind === 'dock' || !this.paths.route('dock', [d], d)) {
      g.goal = { kind: 'dock' };
      g.waypoints = [...this.pierWalk(true).slice(0, 2), this.waitingSpot()];
      g.wp = 0;
      return;
    }
    this.plan(g, goal);
  }

  /** A point just inside the building's edge next to the access tile. */
  private doorPoint(b: Building, access: Tile): Point {
    const tiles = this.world.footprintTiles(b.kind, b.x, b.y, b.rot);
    const inside = tiles.find((t) => Math.abs(t.x - access.x) + Math.abs(t.y - access.y) === 1) ?? tiles[0];
    return { x: access.x + 0.5 + (inside.x - access.x) * 0.45, z: access.y + 0.5 + (inside.y - access.y) * 0.45 };
  }

  private access(b: Building): Tile[] {
    return this.world.accessTiles(this.world.footprintTiles(b.kind, b.x, b.y, b.rot));
  }

  private building(id: number): Building | undefined {
    return this.world.buildings.find((b) => b.id === id);
  }

  /** After the map changes: fix guests whose room, target or path disappeared, and re-route walkers. */
  private reconcile(): void {
    this.stale = false;
    for (const g of this.guests) {
      if (g.roomId !== null && !this.building(g.roomId)) {
        g.roomId = null;
        if (!g.leaving) {
          g.leaving = true;
          g.thought = 'My room is gone!';
        }
      }
      if (g.state === 'inside' && (g.insideId === null || !this.building(g.insideId))) {
        g.insideId = null;
        g.state = 'walking';
        this.decide(g);
        continue;
      }
      if (g.state === 'walking' && g.goal) {
        if (g.goal.kind === 'building' && !this.building(g.goal.id)) this.decide(g);
        // Guests already heading out along the pier don't need a new route.
        else if (g.goal.kind === 'dock' && g.tile && g.tile.x === this.world.dock.x && g.tile.y === this.world.dock.y) continue;
        else this.plan(g, g.goal);
      }
    }
  }

  // ---------- persistence ----------

  snapshot(): SimSnapshot {
    return {
      version: 1,
      minutes: this.minutes,
      rng: this.rng.state,
      nextGuestId: this.nextGuestId,
      ferry: { ...this.ferry },
      guests: this.guests.filter((g) => g.state !== 'gone').map((g) => structuredClone(g)),
      today: { ...this.today },
    };
  }

  restore(s: SimSnapshot): void {
    if (s.version !== 1) throw new Error('Incompatible save');
    this.minutes = s.minutes;
    this.rng.state = s.rng;
    this.nextGuestId = s.nextGuestId;
    this.ferry = { ...s.ferry };
    this.guests = s.guests.map((g) => structuredClone(g));
    this.today = { ...s.today };
    // A snapshot is consistent with the world saved beside it, so routes stay valid.
    this.stale = false;
  }

  reset(): void {
    this.restore({
      version: 1,
      minutes: DAY_START,
      rng: 0x1234abcd,
      nextGuestId: 1,
      ferry: { phase: 'away', t: 0, toUnload: 0, unloadTimer: 0, cameToday: false },
      guests: [],
      today: emptyStats(),
    });
  }
}

export function isMoving(g: Guest): boolean {
  return g.state === 'arriving' || g.state === 'walking' || g.state === 'boarding';
}

/** True if a guest should be drawn. */
export function isVisible(g: Guest): boolean {
  return g.state !== 'inside' && g.state !== 'gone';
}
