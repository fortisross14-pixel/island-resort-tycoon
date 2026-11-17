import { BUILDINGS, footprint, type BuildingKind, type Rotation } from './buildings';
import { VENUES } from './needs';
import { NODES } from './research';
import { Sim, type NightReport } from './sim';
import { World, type Tile } from './world';

/**
 * Headless playtest harness (Pass 2). Runs the real simulation for many days with a
 * scripted player and logs the economy, so balance changes can be checked against the
 * GDD targets instead of by feel.
 */

export interface DayLog {
  day: number;
  money: number;
  profit: number;
  roomIncome: number;
  spending: number;
  costs: number;
  arrived: number;
  housed: number;
  turnedAway: number;
  rating: number;
  research: number;
  rooms: number;
  buildings: number;
  plots: number;
  avgSatisfaction: number;
  reviewStars: number;
  medal: string | null;
}

export type Strategy = 'starter' | 'bot';

export interface RunOptions {
  strategy: Strategy;
  days: number;
  seed?: number;
  scenario?: string | null;
}

/** The GDD's day-1 layout: a spine from the dock, 4 Basic Rooms, a Buffet and a Snack Bar. */
export function buildStarter(w: World): void {
  const d = w.dock;
  for (let y = d.y - 1; y >= d.y - 10; y--) w.placePath(d.x, y);
  const top = d.y - 10;
  w.placeBuilding('basicRooms', d.x + 1, top, 0);
  w.placeBuilding('basicRooms', d.x - 2, top, 0);
  w.placeBuilding('basicRooms', d.x + 1, top + 2, 0);
  w.placeBuilding('basicRooms', d.x - 2, top + 2, 0);
  w.placeBuilding('buffet', d.x + 1, top + 5, 0);
  w.placeBuilding('snackBar', d.x - 1, top + 6, 0);
}

/**
 * A simple player: each night it adds rooms when they fill up, adds venues for the
 * guests it has, researches whatever is available, adds floors and buys land when
 * it runs out of space. It keeps a cash reserve so it never goes broke on purpose.
 */
export class Bot {
  constructor(
    private sim: Sim,
    private reserve = 1500,
  ) {}

  private get w(): World {
    return this.sim.world;
  }

  nightly(r: NightReport): void {
    const sim = this.sim;
    // Research: cheapest available topic first.
    for (const { node, status } of [...sim.researchNodes].sort((a, b) => a.node.cost - b.node.cost))
      if (status.state === 'available') sim.researchTopic(node.id);
    if (sim.offer) sim.acceptOffer();

    const rooms = this.w.buildings.filter((b) => sim.isRoom(b));
    const capacity = rooms.reduce((s, b) => s + sim.capacity(b), 0);
    const demand = r.nextArrivals;
    const housed = sim.guests.filter((g) => g.roomId !== null && !g.leaving).length;
    const freeTomorrow = capacity - housed + r.checkingOut;

    // 1. Rooms, if tomorrow's ferry won't fit.
    let guard = 0;
    while (freeTomorrow + guard * 2 < demand && guard < 4) {
      if (!this.addRooms()) break;
      guard++;
    }
    // 2. Venues to match the guests: one food place per ~6 rooms, then fun.
    const venues = this.w.buildings.filter((b) => VENUES[b.kind]);
    const wantVenues = Math.ceil(capacity / 5);
    if (venues.length < wantVenues) this.addVenue();
    // 3. Front Desk and a Research Office once.
    for (const k of ['frontDesk', 'researchOffice'] as BuildingKind[])
      if (!this.w.buildings.some((b) => b.kind === k)) this.place(k);
    // 4. Out of space: buy land.
    if (this.w.money > this.w.plotPrice + this.reserve * 3 && this.spaceLeft() < 12) this.buyLand();
  }

  private affordable(kind: BuildingKind): boolean {
    return this.sim.isUnlocked(kind) && this.w.money - BUILDINGS[kind].cost >= this.reserve;
  }

  private addRooms(): boolean {
    // Best room the bot can afford for the guests coming (higher tiers when rated well).
    const order: BuildingKind[] =
      this.sim.rating >= 3.2 ? ['gardenBungalows', 'standardRooms', 'basicRooms'] : ['standardRooms', 'basicRooms'];
    for (const k of order) if (this.affordable(k) && this.place(k)) return true;
    // No space or money for a new building: stack a floor.
    const rooms = this.w.buildings.filter((b) => this.sim.isRoom(b)).sort((a, b) => (a.floors ?? 1) - (b.floors ?? 1));
    for (const b of rooms) {
      if (this.w.money - BUILDINGS[b.kind].cost * 0.6 < this.reserve) break;
      if (this.w.addFloor(b.id, Math.min(3, this.sim.maxFloors)).ok) return true;
    }
    return false;
  }

  private addVenue(): void {
    const have = new Set(this.w.buildings.map((b) => b.kind));
    const wishlist: BuildingKind[] = [
      'snackBar',
      'buffet',
      'beachBar',
      'giftShop',
      'pool',
      'italianRestaurant',
      'spa',
      'gym',
      'kidsClub',
      'boutique',
      'seafoodRestaurant',
      'snackBar',
      'buffet',
    ];
    // Something new first; repeat the basics only once everything else is there.
    for (const k of wishlist) if (!have.has(k) && this.affordable(k) && this.place(k)) return;
    const count = (k: BuildingKind) => this.w.buildings.filter((b) => b.kind === k).length;
    const basic = count('snackBar') <= count('buffet') ? 'snackBar' : 'buffet';
    if (this.affordable(basic)) this.place(basic);
  }

  private buyLand(): void {
    for (const p of this.w.plots) if (this.w.buyPlot(p.id).ok) return;
  }

  /** Free land tiles next to a path. */
  private spaceLeft(): number {
    let n = 0;
    for (let y = 0; y < this.w.size; y++)
      for (let x = 0; x < this.w.size; x++)
        if (this.w.isFree(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.w.isPath(x + dx, y + dy))) n++;
    return n;
  }

  /** Place a building at the first spot that works, extending paths if needed. */
  place(kind: BuildingKind): boolean {
    if (this.tryPlace(kind)) return true;
    // Grow the network: extend a straight path from a path end into free land.
    for (let i = 0; i < 3; i++) {
      if (!this.extendPaths()) break;
      if (this.tryPlace(kind)) return true;
    }
    return false;
  }

  private tryPlace(kind: BuildingKind): boolean {
    for (const rot of [0, 1] as Rotation[]) {
      const { w, h } = footprint(kind, rot);
      for (let y = 0; y <= this.w.size - h; y++)
        for (let x = 0; x <= this.w.size - w; x++)
          if (this.w.canPlaceBuilding(kind, x, y, rot).ok) return this.w.placeBuilding(kind, x, y, rot).ok;
    }
    return false;
  }

  /** Lay a few path tiles: a rib every 4 rows off existing paths, into owned land. */
  private extendPaths(): boolean {
    const w = this.w;
    let laid = 0;
    const tiles = w.pathTiles();
    for (const t of tiles) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]] as Array<[number, number]>) {
        if ((dx !== 0 && t.y % 4 !== 0) || laid > 12) continue;
        let cur: Tile = { x: t.x + dx, y: t.y + dy };
        while (w.isLand(cur.x, cur.y) && w.isFree(cur.x, cur.y) && w.money > 100 && laid < 12) {
          if (!w.placePath(cur.x, cur.y).ok) break;
          laid++;
          cur = { x: cur.x + dx, y: cur.y + dy };
        }
      }
      if (laid) return true;
    }
    return laid > 0;
  }
}

export interface Analysis {
  /** Net coins a day each building kind earned on average (income minus supplies and upkeep), and its payback in days. */
  payback: Array<{ kind: BuildingKind; perDay: number; days: number; count: number }>;
  /** What reviews talked about most. */
  complaints: Array<[string, number]>;
  praise: Array<[string, number]>;
  reviews: number;
  avgStars: number;
}

/** Run a game for `days` and return one log line per day. */
export function playtest(opts: RunOptions): DayLog[] {
  return runPlaytest(opts).log;
}

export function runPlaytest(opts: RunOptions): { log: DayLog[]; analysis: Analysis } {
  const scenario = opts.scenario === undefined ? 'driftwood' : opts.scenario;
  const w = World.newGame();
  const sim = new Sim(w);
  (sim as unknown as { rng: { state: number } }).rng.state = opts.seed ?? 1;
  sim.progression = !!scenario;
  sim.startScenario(scenario);
  sim.pauseAtNight = true;
  sim.autoCheckIn = true; // the bot always places guests in their best room
  buildStarter(w);
  const bot = opts.strategy === 'bot' ? new Bot(sim) : null;
  const log: DayLog[] = [];
  // Per building: days alive and net earnings.
  const earned = new Map<number, { kind: BuildingKind; net: number; days: number }>();
  const complaints = new Map<string, number>();
  const praise = new Map<string, number>();
  let stars = 0;
  let reviews = 0;
  sim.on((e) => {
    if (e.type !== 'review') return;
    reviews++;
    stars += e.review.stars;
  });
  const roomIncome = new Map<number, number>();
  sim.on((e) => {
    if (e.type === 'night') for (const l of e.report.income) if (l.buildingId !== null) roomIncome.set(l.buildingId, l.amount);
  });
  // Read memories of guests as they write reviews (just before checkout).
  sim.on((e) => {
    if (e.type !== 'night') return;
    for (const g of sim.guests) {
      if (!(g.roomId !== null && g.nightsLeft <= 0) && !g.leaving) continue;
      for (const m of g.memories) {
        const key = m.text.replace(/the [A-Z][\w’' ]+?(?= was| is| felt| kept|!|$)/, 'the X');
        const map = m.weight < 0 ? complaints : praise;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
  });
  for (let day = 1; day <= opts.days; day++) {
    for (let i = 0; !sim.night && i < 400000; i++) sim.step();
    const r = sim.night!;
    const housedNow = sim.guests.filter((g) => g.roomId !== null);
    log.push({
      day: r.day,
      money: Math.round(w.money),
      profit: r.profit,
      roomIncome: r.stats.roomIncome,
      spending: r.stats.spending,
      costs: r.stats.upkeep + r.stats.supplies,
      arrived: r.stats.arrived,
      housed: r.stats.housed,
      turnedAway: r.stats.turnedAway,
      rating: Math.round(sim.rating * 100) / 100,
      research: sim.research.points,
      rooms: w.buildings.filter((b) => sim.isRoom(b)).reduce((s, b) => s + sim.capacity(b), 0),
      buildings: w.buildings.length,
      plots: w.plotsBought,
      avgSatisfaction: Math.round(housedNow.reduce((s, g) => s + g.satisfaction, 0) / Math.max(1, housedNow.length)),
      reviewStars: r.reviews.length ? Math.round((r.reviews.reduce((s, x) => s + x.stars, 0) / r.reviews.length) * 10) / 10 : 0,
      medal: sim.campaign?.bestMedal ?? null,
    });
    for (const b of w.buildings) {
      const e = earned.get(b.id) ?? { kind: b.kind, net: 0, days: 0 };
      const v = sim.venues[b.id];
      const income = v ? v.revenueToday * 0.7 : (roomIncome.get(b.id) ?? 0);
      e.net += income - BUILDINGS[b.kind].upkeep * (b.floors ?? 1);
      e.days++;
      earned.set(b.id, e);
    }
    roomIncome.clear();
    bot?.nightly(r);
    sim.startDay();
  }
  const byKind = new Map<BuildingKind, { net: number; days: number; count: number }>();
  for (const e of earned.values()) {
    const k = byKind.get(e.kind) ?? { net: 0, days: 0, count: 0 };
    k.net += e.net;
    k.days += e.days;
    k.count++;
    byKind.set(e.kind, k);
  }
  const payback = [...byKind.entries()].map(([kind, k]) => {
    const perDay = Math.round(k.net / Math.max(1, k.days));
    return { kind, perDay, days: perDay > 0 ? Math.round(BUILDINGS[kind].cost / perDay) : Infinity, count: k.count };
  });
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return {
    log,
    analysis: { payback, complaints: top(complaints), praise: top(praise), reviews, avgStars: Math.round((stars / Math.max(1, reviews)) * 100) / 100 },
  };
}

export const ALL_TOPICS = NODES.length;
