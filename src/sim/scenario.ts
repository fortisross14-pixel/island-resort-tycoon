import { BUILDINGS, type BuildingKind } from './buildings';
import { VENUES } from './needs';
import { Rng } from './rng';
import type { NightReport, Sim, SimEvent } from './sim';
import { manhattanSteps, type World } from './world';

/**
 * Scenarios, medals and daily objectives (Pass 1). GDD: "Each scenario has 3 medal
 * tiers (bronze, silver, gold), so casual players can finish and invested players can
 * master it" and "A small set of 3 active objectives … pays out coins or research
 * points. They give short sessions a clear target."
 */

export type Metric =
  | 'served'
  | 'rating'
  | 'profit7'
  | 'research'
  | 'plots'
  | 'families'
  | 'building'
  /** Rooms (beds for a party), across all room buildings. */
  | 'rooms'
  /** Coins taken since the mission began: rooms, venues and activities (Pass 4). */
  | 'revenue'
  | 'foodRevenue'
  | 'activityRevenue'
  | 'couples'
  // The four resort ratings (Pass 4).
  | 'lodging'
  | 'amenities'
  | 'activities'
  | 'decor';

/** Metrics shown with one decimal, as star ratings. */
export const STAR_METRICS: Metric[] = ['rating', 'lodging', 'amenities', 'activities', 'decor'];

export interface Goal {
  metric: Metric;
  target: number;
  label: string;
  /** For 'building': which building must exist. */
  building?: BuildingKind;
}

export type MedalTier = 'bronze' | 'silver' | 'gold';
export const MEDALS: MedalTier[] = ['bronze', 'silver', 'gold'];
export const MEDAL_NAMES: Record<MedalTier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

export interface ScenarioDef {
  id: string;
  name: string;
  blurb: string;
  /** Island the mission is played on (see islands.ts); the island's archipelago decides when it opens. */
  island: string;
  startMoney: number;
  /** Months to earn medals in; after that the best medal so far is final. */
  days: number;
  medals: Record<MedalTier, Goal[]>;
  /** A medal that must be won by the end of this month to count (the "do it fast" golds). */
  deadlines?: Partial<Record<MedalTier, number>>;
  /** Multiplies how often each guest type arrives. */
  guestBias?: Partial<Record<string, number>>;
  /** Research topics (ids) needed before the mission opens. */
  needsResearch?: string[];
  /** Buildings this mission provides without research. */
  kit?: BuildingKind[];
  /** An existing resort on the island at the start (Old Harbour). */
  prebuilt?: Prebuilt;
  /** How hard it plays, for the home screen. */
  level: 'beginner' | 'intermediate' | 'advanced';
}

export interface Prebuilt {
  /** Path runs from (x0, y0) to (x1, y1), laid one tile at a time from the dock outwards. */
  paths: Array<[number, number, number, number]>;
  buildings: Array<{ kind: BuildingKind; x: number; y: number; rot?: 0 | 1 | 2 | 3; condition?: number }>;
}

/**
 * The Caribbean archipelago (Pass 4): beaches and food. Points come from the best medal on
 * each mission (bronze 1, silver 2, gold 3) and open the next islands. The two beginner
 * missions on Coconut Key teach the basics and their silvers are easy; the golds add a time
 * limit. Twin Palms and Far Sands (3 points) ask for quality and sometimes research first.
 * Old Harbour (10 points) closes the archipelago with two hard missions.
 */
export const SCENARIOS: ScenarioDef[] = [
  // ---------- Coconut Key (open from the start) ----------
  {
    id: 'openForBusiness',
    name: 'Open for Business',
    island: 'coconutKey',
    level: 'beginner',
    blurb: 'Two rooms, a bar on the sand and a ferry full of curious travellers. Open the doors and make your first coins.',
    startMoney: 9000,
    days: 24,
    kit: ['beachBar'],
    deadlines: { gold: 7 },
    medals: {
      bronze: [
        { metric: 'building', target: 2, building: 'basicRooms', label: 'Build 2 Basic Rooms' },
        { metric: 'building', target: 1, building: 'beachBar', label: 'Build a Beach Bar' },
        { metric: 'served', target: 15, label: 'Host 15 guests' },
      ],
      silver: [{ metric: 'revenue', target: 9000, label: 'Earn 9,000 in revenue' }],
      gold: [{ metric: 'revenue', target: 9000, label: 'Earn 9,000 in revenue within 7 months' }],
    },
  },
  {
    id: 'islandKitchen',
    name: 'Island Kitchen',
    island: 'coconutKey',
    level: 'beginner',
    blurb: 'Coconut Key is small: there is room for one good kitchen. Get guests in, then feed them well.',
    startMoney: 11000,
    days: 24,
    deadlines: { gold: 10 },
    medals: {
      bronze: [{ metric: 'foodRevenue', target: 1500, label: 'Earn 1,500 from food' }],
      silver: [{ metric: 'foodRevenue', target: 3500, label: 'Earn 3,500 from food' }],
      gold: [{ metric: 'foodRevenue', target: 3500, label: 'Earn 3,500 from food within 10 months' }],
    },
  },
  // ---------- Twin Palms (3 points) ----------
  {
    id: 'lagoonDays',
    name: 'Lagoon Days',
    island: 'twinPalms',
    level: 'intermediate',
    blurb: 'Calm water, two jungle hills and a waterfall. Guests come here to do things: give them days to remember.',
    startMoney: 20000,
    days: 36,
    medals: {
      bronze: [
        { metric: 'building', target: 1, building: 'trailHut', label: 'Build a Trail Hut' },
        { metric: 'activities', target: 3, label: 'Reach Activities ★3.0' },
      ],
      silver: [
        { metric: 'activities', target: 3.6, label: 'Reach Activities ★3.6' },
        { metric: 'served', target: 150, label: 'Host 150 guests' },
      ],
      gold: [
        { metric: 'activities', target: 4.2, label: 'Reach Activities ★4.2' },
        { metric: 'rating', target: 3.8, label: 'Reach a ★3.8 rating' },
        { metric: 'decor', target: 3.4, label: 'Reach Decoration ★3.4' },
      ],
    },
  },
  {
    id: 'familyCove',
    name: 'Family Cove',
    island: 'twinPalms',
    level: 'intermediate',
    blurb: 'A calm bay where families come back year after year. Keep the kids busy and the walks short.',
    startMoney: 15000,
    days: 30,
    needsResearch: ['kidsClub'],
    guestBias: { family: 4, party: 0.2, couple: 0.8 },
    medals: {
      bronze: [
        { metric: 'families', target: 10, label: 'Host 10 families' },
        { metric: 'building', target: 1, building: 'kidsClub', label: 'Build a Kids’ Club' },
      ],
      silver: [
        { metric: 'families', target: 40, label: 'Host 40 families' },
        { metric: 'rating', target: 3.6, label: 'Reach a ★3.6 rating' },
        { metric: 'building', target: 1, building: 'pool', label: 'Build a Pool' },
      ],
      gold: [
        { metric: 'families', target: 100, label: 'Host 100 families' },
        { metric: 'rating', target: 4.2, label: 'Reach a ★4.2 rating' },
        { metric: 'profit7', target: 35000, label: 'Make 35,000 profit over 7 months' },
      ],
    },
  },
  {
    id: 'hideaway',
    name: 'Couples’ Hideaway',
    island: 'twinPalms',
    level: 'intermediate',
    blurb: 'Honeymooners want a nice room, a quiet path and a pretty view. Standard Rooms are a must.',
    startMoney: 18000,
    days: 30,
    needsResearch: ['standardRooms'],
    guestBias: { couple: 3, backpacker: 0.4, party: 0.3 },
    medals: {
      bronze: [
        { metric: 'couples', target: 25, label: 'Host 25 couples' },
        { metric: 'lodging', target: 3.2, label: 'Reach Lodging ★3.2' },
      ],
      silver: [
        { metric: 'couples', target: 70, label: 'Host 70 couples' },
        { metric: 'lodging', target: 3.7, label: 'Reach Lodging ★3.7' },
      ],
      gold: [
        { metric: 'lodging', target: 4.2, label: 'Reach Lodging ★4.2' },
        { metric: 'decor', target: 3.8, label: 'Reach Decoration ★3.8' },
        { metric: 'rating', target: 4, label: 'Reach a ★4.0 rating' },
      ],
    },
  },
  // ---------- Far Sands (3 points) ----------
  {
    id: 'longBeach',
    name: 'The Long Beach',
    island: 'farSands',
    level: 'intermediate',
    blurb: 'The best beach in the Caribbean, at the far end of the island. Bring the guests to it, and make it beautiful.',
    startMoney: 20000,
    days: 30,
    kit: ['beachBar'],
    deadlines: { gold: 20 },
    medals: {
      bronze: [
        { metric: 'building', target: 2, building: 'beachBar', label: 'Build 2 Beach Bars' },
        { metric: 'served', target: 80, label: 'Host 80 guests' },
      ],
      silver: [
        { metric: 'decor', target: 3.4, label: 'Reach Decoration ★3.4' },
        { metric: 'revenue', target: 30000, label: 'Earn 30,000 in revenue' },
      ],
      gold: [
        { metric: 'decor', target: 4, label: 'Reach Decoration ★4.0' },
        { metric: 'revenue', target: 30000, label: 'Earn 30,000 in revenue within 20 months' },
      ],
    },
  },
  {
    id: 'sunAndSea',
    name: 'Sun & Sea',
    island: 'farSands',
    level: 'intermediate',
    blurb: 'Turtles in the shallows and dolphins off the point. Research Excursions and sell the sea.',
    startMoney: 18000,
    days: 30,
    needsResearch: ['excursions'],
    medals: {
      bronze: [{ metric: 'activityRevenue', target: 1500, label: 'Earn 1,500 from activities' }],
      silver: [
        { metric: 'activityRevenue', target: 5000, label: 'Earn 5,000 from activities' },
        { metric: 'activities', target: 3.6, label: 'Reach Activities ★3.6' },
      ],
      gold: [
        { metric: 'activityRevenue', target: 12000, label: 'Earn 12,000 from activities' },
        { metric: 'activities', target: 4.2, label: 'Reach Activities ★4.2' },
        { metric: 'rating', target: 3.9, label: 'Reach a ★3.9 rating' },
      ],
    },
  },
  // ---------- Old Harbour (10 points) ----------
  {
    id: 'newPaint',
    name: 'New Paint',
    island: 'oldHarbour',
    level: 'advanced',
    blurb: 'An old resort with peeling paint and creaky beds. Repair, rebuild and win back the reviews.',
    startMoney: 14000,
    days: 30,
    deadlines: { gold: 24 },
    prebuilt: {
      paths: [
        [21, 26, 21, 18],
        [20, 22, 14, 22],
      ],
      buildings: [
        { kind: 'basicRooms', x: 19, y: 17, condition: 30 },
        { kind: 'basicRooms', x: 19, y: 19, condition: 25 },
        { kind: 'basicRooms', x: 13, y: 20, condition: 35 },
        { kind: 'basicRooms', x: 15, y: 20, condition: 28 },
        { kind: 'snackBar', x: 21, y: 17, condition: 40 },
        { kind: 'buffet', x: 13, y: 23, condition: 35 },
      ],
    },
    medals: {
      bronze: [{ metric: 'lodging', target: 3.5, label: 'Reach Lodging ★3.5' }],
      silver: [
        { metric: 'lodging', target: 3.9, label: 'Reach Lodging ★3.9' },
        { metric: 'rating', target: 3.7, label: 'Reach a ★3.7 rating' },
      ],
      gold: [
        { metric: 'lodging', target: 4.3, label: 'Reach Lodging ★4.3 within 24 months' },
        { metric: 'rating', target: 4.1, label: 'Reach a ★4.1 rating' },
      ],
    },
  },
  {
    id: 'jewel',
    name: 'Jewel of the Caribbean',
    island: 'oldHarbour',
    level: 'advanced',
    blurb: 'The finale: a resort that is good at everything. Every rating counts.',
    startMoney: 25000,
    days: 48,
    needsResearch: ['restaurants'],
    medals: {
      bronze: [
        { metric: 'lodging', target: 3, label: 'Lodging ★3.0' },
        { metric: 'amenities', target: 3, label: 'Amenities ★3.0' },
        { metric: 'activities', target: 3, label: 'Activities ★3.0' },
        { metric: 'decor', target: 3, label: 'Decoration ★3.0' },
      ],
      silver: [
        { metric: 'lodging', target: 3.6, label: 'Lodging ★3.6' },
        { metric: 'amenities', target: 3.6, label: 'Amenities ★3.6' },
        { metric: 'activities', target: 3.6, label: 'Activities ★3.6' },
        { metric: 'decor', target: 3.6, label: 'Decoration ★3.6' },
      ],
      gold: [
        { metric: 'lodging', target: 4.1, label: 'Lodging ★4.1' },
        { metric: 'amenities', target: 4.1, label: 'Amenities ★4.1' },
        { metric: 'activities', target: 4.1, label: 'Activities ★4.1' },
        { metric: 'decor', target: 4.1, label: 'Decoration ★4.1' },
        { metric: 'rating', target: 4.3, label: 'A ★4.3 rating' },
      ],
    },
  },
];

/** Points a medal is worth towards opening islands. */
export const MEDAL_POINTS: Record<MedalTier, number> = { bronze: 1, silver: 2, gold: 3 };

export function scenarioDef(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

// ---------- daily objectives ----------

export type ObjectiveKind = 'sales' | 'checkins' | 'happy' | 'spending' | 'noGiveUps' | 'build';

export interface Objective {
  id: number;
  kind: ObjectiveKind;
  label: string;
  target: number;
  progress: number;
  /** Building kind for 'sales' and 'build'. */
  building?: BuildingKind;
  reward: { coins?: number; research?: number };
  done: boolean;
  /** Ends with the day (most do); 'build' objectives last until done. */
  today: boolean;
}

export const ACTIVE_OBJECTIVES = 3;

export interface CampaignState {
  scenario: string;
  /** Day each medal was won, if it has been. */
  medals: Partial<Record<MedalTier, number>>;
  /** People checked in so far (the GDD Visitors measure). */
  served: number;
  /** Family parties checked in. */
  families?: number;
  couples?: number;
  /** Coins taken since the start, in total and from food and activities (Pass 4). */
  revenue?: number;
  foodRevenue?: number;
  activityRevenue?: number;
  /** Profit of each finished day, newest last. */
  profits: number[];
  objectives: Objective[];
  nextObjectiveId: number;
  finished: MedalTier | 'none' | null;
  rng: number;
}

export type CampaignEvent =
  | { type: 'medal'; tier: MedalTier }
  | { type: 'objectiveDone'; objective: Objective }
  | { type: 'finished'; medal: MedalTier | 'none' };

export class Campaign {
  readonly def: ScenarioDef;
  state: CampaignState;
  private rng: Rng;
  private listeners = new Set<(e: CampaignEvent) => void>();
  private tickAcc = 0;
  private unsubscribe: () => void;

  constructor(
    private sim: Sim,
    scenarioId: string,
    state?: CampaignState,
  ) {
    const def = SCENARIOS.find((s) => s.id === scenarioId);
    if (!def) throw new Error(`Unknown scenario ${scenarioId}`);
    this.def = def;
    this.state = state ?? {
      scenario: def.id,
      medals: {},
      served: 0,
      profits: [],
      objectives: [],
      nextObjectiveId: 1,
      finished: null,
      rng: 0x5eed,
    };
    this.rng = new Rng(this.state.rng);
    this.unsubscribe = sim.on((e) => this.onSimEvent(e));
    if (!state) this.refillObjectives();
  }

  /** Stop listening (when a new game replaces this one). */
  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
  }

  on(fn: (e: CampaignEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: CampaignEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  // ---------- medals ----------

  metric(m: Metric): number {
    switch (m) {
      case 'served':
        return this.state.served;
      case 'rating':
        return this.sim.rating;
      case 'profit7':
        return this.state.profits.slice(-7).reduce((s, p) => s + p, 0);
      case 'research':
        return this.sim.research.done.size;
      case 'plots':
        return this.sim.world.plotsBought;
      case 'families':
        return this.state.families ?? 0;
      case 'building':
        return 0;
      case 'rooms':
        return this.sim.world.buildings.reduce((n, b) => n + this.sim.capacity(b), 0);
      case 'revenue':
        return this.state.revenue ?? 0;
      case 'foodRevenue':
        return this.state.foodRevenue ?? 0;
      case 'activityRevenue':
        return this.state.activityRevenue ?? 0;
      case 'couples':
        return this.state.couples ?? 0;
      case 'lodging':
      case 'amenities':
      case 'activities':
      case 'decor':
        return this.sim.categoryRating(m);
    }
  }

  goalMet(g: Goal): boolean {
    return this.progress(g) >= g.target;
  }

  /** Progress shown for a goal (buildings: how many of that kind stand). */
  progress(g: Goal): number {
    return g.metric === 'building' ? this.sim.world.buildings.filter((b) => b.kind === g.building).length : this.metric(g.metric);
  }

  /** A medal whose deadline has passed can't be won any more. */
  missed(t: MedalTier): boolean {
    const d = this.def.deadlines?.[t];
    return d !== undefined && this.state.medals[t] === undefined && this.sim.day > d;
  }

  /** The best medal won so far. */
  get bestMedal(): MedalTier | null {
    let best: MedalTier | null = null;
    for (const t of MEDALS) if (this.state.medals[t] !== undefined) best = t;
    return best;
  }

  get daysLeft(): number {
    return Math.max(0, this.def.days - this.sim.day + 1);
  }

  private checkMedals(): void {
    if (this.state.finished) return;
    for (const t of MEDALS) {
      if (this.state.medals[t] !== undefined || this.missed(t)) continue;
      if (this.def.medals[t].every((g) => this.goalMet(g))) {
        this.state.medals[t] = this.sim.day;
        this.emit({ type: 'medal', tier: t });
      }
    }
    if (this.state.medals.gold !== undefined) this.finish();
  }

  private finish(): void {
    if (this.state.finished) return;
    this.state.finished = this.bestMedal ?? 'none';
    this.emit({ type: 'finished', medal: this.state.finished });
  }

  // ---------- objectives ----------

  private onSimEvent(e: SimEvent): void {
    switch (e.type) {
      case 'checkedIn': {
        const g = this.sim.guest(e.guestId);
        this.state.served += g?.size ?? 1;
        if (g?.type === 'family') this.state.families = (this.state.families ?? 0) + 1;
        if (g?.type === 'couple') this.state.couples = (this.state.couples ?? 0) + 1;
        this.bump('checkins', 1);
        break;
      }
      case 'purchase': {
        const b = this.sim.world.buildings.find((x) => x.id === e.buildingId);
        if (b) this.bump('sales', 1, b.kind);
        if (b && BUILDINGS[b.kind].family === 'food') this.state.foodRevenue = (this.state.foodRevenue ?? 0) + e.amount;
        this.bump('spending', e.amount);
        break;
      }
    }
  }

  private bump(kind: ObjectiveKind, by: number, building?: BuildingKind): void {
    for (const o of this.state.objectives) {
      if (o.done || o.kind !== kind || (o.building && o.building !== building)) continue;
      o.progress = Math.min(o.target, o.progress + by);
      if (o.progress >= o.target) this.complete(o);
    }
  }

  private complete(o: Objective): void {
    if (o.done) return;
    o.done = true;
    o.progress = o.target;
    if (o.reward.coins) this.sim.world.earn(o.reward.coins);
    if (o.reward.research) this.sim.research.points += o.reward.research;
    this.emit({ type: 'objectiveDone', objective: o });
  }

  /** State-based checks, a few times a second. */
  tick(dt: number): void {
    this.tickAcc += dt;
    if (this.tickAcc < 0.5) return;
    this.tickAcc = 0;
    for (const o of this.state.objectives) {
      if (o.done) continue;
      if (o.kind === 'happy') {
        const best = Math.max(0, ...this.sim.guests.filter((g) => g.roomId !== null).map((g) => g.satisfaction));
        o.progress = Math.min(o.target, Math.round(best));
        if (best >= o.target) this.complete(o);
      } else if (o.kind === 'build' && o.building && this.sim.world.buildings.some((b) => b.kind === o.building)) {
        this.complete(o);
      }
    }
    this.checkMedals();
  }

  /** At 23:00, before the report is shown. */
  onNight(report: NightReport): void {
    this.state.profits.push(report.profit);
    this.state.revenue = (this.state.revenue ?? 0) + report.stats.roomIncome + report.stats.spending;
    this.state.activityRevenue = (this.state.activityRevenue ?? 0) + this.sim.trips.reduce((s, t) => s + t.revenue, 0);
    if (this.state.profits.length > 30) this.state.profits.shift();
    for (const o of this.state.objectives)
      if (!o.done && o.kind === 'noGiveUps' && report.stats.arrived > 0 && report.stats.turnedAway === 0) this.complete(o);
    report.objectives = this.state.objectives.map((o) => ({ label: o.label, done: o.done }));
    this.checkMedals();
    // Past the last day: whatever medal you have is final.
    if (!this.state.finished && this.sim.day >= this.def.days) this.finish();
  }

  /** Each morning: drop finished and expired objectives and draw new ones. */
  onMorning(): void {
    this.state.objectives = this.state.objectives.filter((o) => !o.done && !o.today);
    this.refillObjectives();
  }

  private refillObjectives(): void {
    const day = this.sim.day;
    const have = new Set(this.state.objectives.map((o) => o.kind + (o.building ?? '')));
    for (let tries = 0; this.state.objectives.length < ACTIVE_OBJECTIVES && tries < 30; tries++) {
      const o = this.makeObjective(day);
      if (!o || have.has(o.kind + (o.building ?? ''))) continue;
      have.add(o.kind + (o.building ?? ''));
      this.state.objectives.push(o);
    }
    this.state.rng = this.rng.state;
  }

  private makeObjective(day: number): Objective | null {
    const id = this.state.nextObjectiveId;
    const coins = Math.min(1500, 300 + day * 50);
    const research = 3 + Math.floor(day / 5);
    // With research on the home screen (Pass 4), objectives always pay coins.
    const roll = this.rng.next();
    const reward = roll < 0.6 || this.sim.sharedResearch ? { coins: roll < 0.6 ? coins : research * 120 } : { research };
    const base = { id, progress: 0, reward, done: false, today: true };
    const kind = this.rng.pick<ObjectiveKind>(['sales', 'checkins', 'happy', 'spending', 'noGiveUps', 'build']);
    let o: Objective | null = null;
    switch (kind) {
      case 'sales': {
        const kinds = [...new Set(this.sim.world.buildings.map((b) => b.kind))].filter((k) => (VENUES[k]?.basePrice ?? 0) > 0);
        if (!kinds.length) return null;
        const k = this.rng.pick(kinds);
        const target = 4 + Math.floor(day / 2);
        o = { ...base, kind, building: k, target, label: `Sell ${target} at the ${BUILDINGS[k].name} this month` };
        break;
      }
      case 'checkins': {
        const target = Math.max(3, Math.min(10, 2 + Math.floor(day / 2)));
        o = { ...base, kind, target, label: `Check in ${target} parties this month` };
        break;
      }
      case 'happy':
        o = { ...base, kind, target: 90, label: 'Get a guest to 90 satisfaction this month' };
        break;
      case 'spending': {
        const target = 150 + day * 40;
        o = { ...base, kind, target, label: `Guests spend ${target} at venues this month` };
        break;
      }
      case 'noGiveUps':
        o = { ...base, kind, target: 1, label: 'Nobody gives up waiting this month' };
        break;
      case 'build': {
        const options = (Object.keys(BUILDINGS) as BuildingKind[]).filter(
          (k) => BUILDINGS[k].family !== 'rooms' && this.sim.isUnlocked(k) && !this.sim.world.buildings.some((b) => b.kind === k),
        );
        if (!options.length) return null;
        const k = this.rng.pick(options);
        o = { ...base, kind, building: k, target: 1, today: false, label: `Build a ${BUILDINGS[k].name}` };
        break;
      }
    }
    this.state.nextObjectiveId++;
    return o;
  }

  snapshot(): CampaignState {
    this.state.rng = this.rng.state;
    return structuredClone(this.state);
  }
}

/** Lay out a mission's existing resort (paths, then worn buildings) at no cost. */
export function applyPrebuilt(world: World, p: Prebuilt): void {
  const money = world.money;
  world.money = 1e9;
  for (const [x0, y0, x1, y1] of p.paths) {
    world.placePath(x0, y0);
    for (const t of manhattanSteps({ x: x0, y: y0 }, { x: x1, y: y1 })) world.placePath(t.x, t.y);
  }
  for (const b of p.buildings) {
    const r = world.placeBuilding(b.kind, b.x, b.y, b.rot ?? 0);
    if (r.ok && r.building && b.condition !== undefined) r.building.condition = b.condition;
  }
  world.money = money;
}
