import { dateText, duration } from './calendar';
import { BUILDINGS } from './buildings';
import { AUTO_PENALTY, accessOf, matchScore, roomTier, type Match, type Wish } from './match';
import {
  DECAY,
  DEFAULT_PRICE,
  FAR_FACTOR,
  FAR_TILES,
  LINE_PATIENCE,
  NAP_REST,
  SUPPLIES_SHARE,
  roomRateOf,
  NEEDS,
  STROLL_FUN,
  VENUES,
  buyChance,
  lowestNeed,
  priceOf,
  type Meters,
  type PriceStep,
} from './needs';
import { PathGraph, UNREACHABLE } from './pathGraph';
import { NODES, OFFICE_POINTS, Research, nodeFor, type ResearchState } from './research';
import { categoryRating, rating, reviewText, starsFor, type Memory, type Review } from './reviews';
import {
  AppealMap,
  BASE_WEAR,
  MAINTENANCE_COST,
  MAINTENANCE_WEAR,
  addScore,
  emptyScores,
  overallScore,
  scoreOf,
  wearPenalty,
  type CategoryScores,
  type MaintenanceLevel,
} from './ratings';
import { RATING_CATEGORIES, ratingOf, type RatingCategory } from './buildings';
import { conditionOf } from './world';
import { Campaign, type CampaignState } from './scenario';
import { Rng } from './rng';
import { floorsOf, type Building, type Result, type Tile, type World } from './world';
import { ELEVATOR_ABOVE, MAX_FLOORS_EARLY, MAX_FLOORS_RESEARCHED, ROOMS_PER_FLOOR, type BuildingKind } from './buildings';

/**
 * The living resort: the day clock, the morning ferry, check-in (M3), and guests
 * walking the footpaths to fill their needs and spend money (M4), and the nightly
 * accounts, reviews and star rating (M5). Runs at a fixed tick, separate from drawing (GDD risk mitigation for
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
/** Parties on the island at once (a couple is one party of two). */
export const MAX_GUESTS = 150;
/** How long a party waits on the pier for a room before giving up (2 game hours). */
export const PATIENCE_SECONDS = 2 * SECONDS_PER_GAME_HOUR;
/** Timer value meaning "inside until morning". */
const OVERNIGHT = 1e9;

export type GuestType = 'backpacker' | 'couple' | 'family' | 'wellness' | 'party' | 'vip' | 'business';

export interface GuestTypeDef {
  name: string;
  /** People in the party, [min, max]; they share one room. */
  size: [number, number];
  nights: [number, number];
  /** Nightly budget in coins. */
  budget: [number, number];
  /** Coins the whole party will spend on the island per day. */
  spend: [number, number];
  /** Room tier their budget expects (1 = Basic Rooms … 4 = Suites). */
  tier: number;
  wishPool: Wish[];
  wishCount: [number, number];
  /** Star rating before they start arriving (GDD "Unlocks" column). */
  minStars: number;
  /** Share of the ferry, before the rating shifts the mix. */
  weight: number;
  /** Venues they seek out, and venues they avoid (GDD "Loves" / "Hates"). */
  likes: BuildingKind[];
  dislikes: BuildingKind[];
  /** Stay out until this time instead of heading in at 21:00. */
  bedtime?: number;
  /** Long walks put them off more than most (families). */
  walkShy?: boolean;
  /** A busy venue spoils it for them (VIPs). */
  hatesCrowds?: boolean;
  /** Only arrives when this building exists (business guests need a Conference Hall). */
  needs?: BuildingKind;
  /** Impatient: waits half as long and minds a slow check-in (business guests). */
  impatient?: boolean;
}

export const GUEST_TYPES: Record<GuestType, GuestTypeDef> = {
  backpacker: {
    name: 'Backpacker',
    size: [1, 1],
    nights: [1, 2],
    budget: [55, 90],
    spend: [50, 90],
    tier: 1,
    wishPool: ['snacks', 'shortWalk', 'bar'],
    wishCount: [1, 1],
    minStars: 0,
    weight: 1,
    likes: ['snackBar', 'beachBar'],
    dislikes: [],
  },
  couple: {
    name: 'Couple',
    size: [2, 2],
    nights: [2, 4],
    budget: [120, 190],
    spend: [160, 250],
    tier: 2,
    wishPool: ['buffet', 'quiet', 'snacks', 'pool'],
    wishCount: [1, 2],
    minStars: 0,
    weight: 0.8,
    likes: ['italianRestaurant', 'seafoodRestaurant', 'asianRestaurant', 'spa'],
    dislikes: ['kidsClub'],
  },
  family: {
    name: 'Family',
    size: [3, 4],
    nights: [3, 5],
    budget: [110, 170],
    spend: [150, 240],
    tier: 2,
    wishPool: ['buffet', 'pool', 'kidsClub', 'shortWalk'],
    wishCount: [1, 2],
    minStars: 2,
    weight: 0.35,
    likes: ['buffet', 'pool', 'kidsClub'],
    dislikes: ['nightclub'],
    walkShy: true,
  },
  wellness: {
    name: 'Wellness seeker',
    size: [1, 1],
    nights: [3, 7],
    budget: [180, 270],
    spend: [220, 340],
    tier: 3,
    wishPool: ['spa', 'gym', 'quiet'],
    wishCount: [1, 2],
    minStars: 3,
    weight: 0.25,
    likes: ['spa', 'gym', 'pool'],
    dislikes: ['snackBar', 'nightclub'],
  },
  party: {
    name: 'Party group',
    size: [3, 3],
    nights: [2, 3],
    budget: [100, 150],
    spend: [190, 290],
    tier: 2,
    wishPool: ['bar', 'nightclub'],
    wishCount: [1, 2],
    minStars: 3,
    weight: 0.25,
    likes: ['beachBar', 'nightclub'],
    dislikes: [],
    bedtime: 22 * 60 + 45,
  },
  vip: {
    name: 'VIP',
    size: [2, 2],
    nights: [2, 3],
    budget: [360, 520],
    spend: [450, 700],
    tier: 4,
    wishPool: ['quiet', 'spa'],
    wishCount: [1, 2],
    minStars: 4,
    weight: 0.12,
    likes: ['italianRestaurant', 'seafoodRestaurant', 'asianRestaurant', 'spa', 'boutique', 'fineDining', 'marina'],
    dislikes: ['snackBar', 'buffet'],
    hatesCrowds: true,
  },
  business: {
    name: 'Business guest',
    size: [1, 1],
    nights: [1, 2],
    budget: [150, 230],
    spend: [140, 220],
    tier: 3,
    wishPool: ['conference', 'shortWalk', 'gym'],
    wishCount: [1, 2],
    minStars: 3,
    weight: 0.3,
    likes: ['conferenceHall', 'fineDining', 'gym'],
    dislikes: ['kidsClub', 'nightclub'],
    needs: 'conferenceHall',
    impatient: true,
  },
};

export const GUEST_TYPE_KEYS = Object.keys(GUEST_TYPES) as GuestType[];

export interface Point {
  x: number;
  z: number;
}

export type Purpose = 'room' | 'rest' | 'food';

export type Goal =
  | { kind: 'building'; id: number; purpose: Purpose }
  | { kind: 'dock' }
  | { kind: 'tile'; tile: Tile };

/**
 * arriving: walking off the boat (to the queue, or to the island once checked in)
 * queued:   standing on the pier waiting for a room
 * waiting:  on the pier waiting for the ferry home
 * inline:   standing in line outside a busy venue
 */
export type GuestState = 'arriving' | 'queued' | 'walking' | 'inline' | 'inside' | 'waiting' | 'boarding' | 'gone';

/** One party: a backpacker, or a couple sharing a room. */
export interface Guest {
  id: number;
  type: GuestType;
  /** People in the party. */
  size: number;
  budget: number;
  tier: number;
  wishes: Wish[];
  /** Sim seconds of patience left while queued. */
  patience: number;
  /** 0–100; starts at the room match score. */
  satisfaction: number;
  /** Room match score, which sets how comfortable a stay in the room is. */
  roomScore: number;
  needs: Meters;
  /** Coins left to spend today, and spent so far today. */
  wallet: number;
  spentToday: number;
  /** A venue they just declined (too busy), skipped on the next choice. */
  avoid: number | null;
  /** Venues they found too pricey today; they won't go back until tomorrow. */
  declined: number[];
  /** Highlights and complaints for their review. */
  memories: Memory[];
  /** What they think of each rating category so far (Pass 4). */
  scores?: CategoryScores;
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
  /** Coins guests spent at venues today. */
  spending: number;
  /** Nightly room charges. */
  roomIncome: number;
  /** Cost of goods sold at venues. */
  supplies: number;
  /** Daily building upkeep. */
  upkeep: number;
  /** Research points earned today (review stars and offices). */
  research: number;
}

export interface NightLine {
  buildingId: number | null;
  name: string;
  amount: number;
  detail: string;
}

/** The one-screen summary at the end of each day (GDD "Night report"). */
export interface NightReport {
  day: number;
  income: NightLine[];
  costs: NightLine[];
  profit: number;
  stats: DayStats;
  checkingOut: number;
  reviews: Review[];
  ratingBefore: number;
  ratingAfter: number;
  /** The four resort ratings now, and a month ago (Pass 4). */
  ratings?: Record<RatingCategory | 'overall', number>;
  ratingsBefore?: Record<RatingCategory | 'overall', number>;
  best: string | null;
  worst: string | null;
  nextArrivals: number;
  researchPoints: number;
  /** Today's objectives and whether each was done (scenarios only). */
  objectives?: { label: string; done: boolean }[];
  /** An investor's rescue offer after three days in the red. */
  offer: InvestorOffer | null;
}

/** GDD: "three red days in a row trigger a rescue offer from an investor (cash in exchange for a share of revenue)". */
export interface InvestorOffer {
  cash: number;
  /** Share of each day's income (rooms and venues) paid to the investor. */
  share: number;
  days: number;
}

export interface Investor {
  share: number;
  daysLeft: number;
}

/** Days in the red before the investor calls. */
export const RED_DAYS_FOR_OFFER = 3;

/** Live state of a food venue (M4). */
export interface Venue {
  price: PriceStep;
  serving: number;
  line: number[];
  visitsToday: number;
  revenueToday: number;
  /** Guests who arrived but didn't buy (too pricey, line too long). */
  lostToday: number;
}

export interface SimSnapshot {
  version: 7;
  /** Monthly maintenance spend (Pass 4). */
  maintenance: MaintenanceLevel;
  campaign: CampaignState | null;
  redDays: number;
  investor: Investor | null;
  offer: InvestorOffer | null;
  research: ResearchState;
  progression: boolean;
  reviews: Review[];
  nextReviewId: number;
  roomRates: Record<number, PriceStep>;
  night: NightReport | null;
  venues: Record<number, Venue>;
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
  | { type: 'gaveUp'; guestId: number }
  | { type: 'checkedIn'; guestId: number; roomId: number; score: number; auto: boolean }
  | { type: 'purchase'; guestId: number; buildingId: number; amount: number }
  | { type: 'review'; review: Review }
  | { type: 'night'; report: NightReport }
  | { type: 'researched'; id: string }
  | { type: 'newDay'; day: number; yesterday: DayStats };

const emptyStats = (): DayStats => ({
  arrived: 0,
  housed: 0,
  turnedAway: 0,
  departed: 0,
  spending: 0,
  roomIncome: 0,
  supplies: 0,
  upkeep: 0,
  research: 0,
});

/** Parties on a day's ferry: grows with the days and, above all, with the star rating. */
export function arrivalsForDay(day: number, stars = 2.5): number {
  // Word of mouth: the rating scales the crowd far more than the calendar does.
  return Math.max(2, Math.min(18, Math.round((3 + day * 0.4) * (0.4 + 0.3 * stars))));
}

/** Share of couples (richer guests) on the ferry, which rises with the rating. */
export function coupleShare(stars: number): number {
  return Math.max(0.2, Math.min(0.75, 0.45 + (stars - 2.5) * 0.15));
}

export type CheckInResult = { ok: true; score: number } | { ok: false; reason: string };

export class Sim {
  minutes = DAY_START;
  guests: Guest[] = [];
  ferry: Ferry = { phase: 'away', t: 0, toUnload: 0, unloadTimer: 0, cameToday: false };
  today: DayStats = emptyStats();
  /** Food venue state by building id. */
  venues: Record<number, Venue> = {};
  /** Every review so far (the rating uses the latest 50). */
  reviews: Review[] = [];
  /** Nightly rate step per room tier. */
  roomRates: Record<number, PriceStep> = { 1: DEFAULT_PRICE };
  /** Set at 23:00 when `pauseAtNight` is on; the day resumes with startDay(). */
  night: NightReport | null = null;
  /** The game pauses on the night report; headless runs carry straight on. */
  pauseAtNight = false;
  readonly research = new Research();
  /** Monthly maintenance spend: more slows wear (Pass 4). */
  maintenance: MaintenanceLevel = 'normal';
  /** Decoration appeal per tile. */
  readonly appeal: AppealMap;
  /** When on, buildings must be researched before they can be built (off in tests and sandbox). */
  progression = false;
  /** The scenario being played, or null for sandbox and tests. */
  campaign: Campaign | null = null;
  /** Days in a row that ended with a loss. */
  redDays = 0;
  investor: Investor | null = null;
  /** An offer waiting for an answer (also shown on the night report). */
  offer: InvestorOffer | null = null;
  private nextReviewId = 1;
  /** Front Desk behaviour: place arrivals automatically (scores AUTO_PENALTY lower). */
  autoCheckIn = false;
  readonly paths: PathGraph;
  private rng = new Rng();
  private nextGuestId = 1;
  private stale = false;
  private listeners = new Set<(e: SimEvent) => void>();

  constructor(readonly world: World) {
    this.paths = new PathGraph(world);
    world.onChange(() => (this.stale = true));
    world.gate = (kind) => this.buildGate(kind);
    this.appeal = new AppealMap(world);
  }

  // ---------- research (Pass 1) ----------

  /** Whether research allows a building yet. */
  buildGate(kind: BuildingKind): Result {
    if (!this.progression || this.research.isUnlocked(kind)) return { ok: true };
    const node = nodeFor(kind);
    return { ok: false, reason: node ? `Research ${node.name} first` : 'Not available yet' };
  }

  isUnlocked(kind: BuildingKind): boolean {
    return this.buildGate(kind).ok;
  }

  /** Spend research points on a topic. */
  researchTopic(id: string): Result {
    const r = this.research.research(id, this.rating);
    if (r.ok) this.emit({ type: 'researched', id });
    return r;
  }

  get researchNodes() {
    return NODES.map((node) => ({ node, status: this.research.status(node, this.rating) }));
  }

  private addResearch(points: number): void {
    this.research.points += points;
    this.today.research += points;
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

  /** Where unhoused arrivals stand, near the land end of the pier. */
  private queueSpot(): Point {
    const d = this.world.dock;
    return { x: d.x + 0.5 + this.rng.range(-0.22, 0.22), z: d.y + this.rng.range(1.25, 2.6) };
  }

  private waitingSpot(): Point {
    const d = this.world.dock;
    return { x: d.x + 0.5 + this.rng.range(-0.25, 0.25), z: d.y + this.rng.range(1.3, 3.2) };
  }

  // ---------- queries ----------

  get day(): number {
    return this.world.day;
  }

  /** "Mar 14" for the HUD: each schedule day is a month (Pass 4). */
  get clockText(): string {
    return dateText(this.world.day, this.minutes);
  }

  get onIsland(): number {
    return this.guests.filter((g) => g.state !== 'gone').length;
  }

  /** Parties still needing a room, in arrival order (the cards in the Guests panel). */
  get queue(): Guest[] {
    return this.guests.filter((g) => isUnhoused(g));
  }

  guest(id: number): Guest | undefined {
    return this.guests.find((g) => g.id === id);
  }

  isRoom(b: Building): boolean {
    return BUILDINGS[b.kind].family === 'rooms';
  }

  hasVacancy(b: Building): boolean {
    return this.isRoom(b) && this.occupancy(b.id) < this.capacity(b);
  }

  /** Rooms in a room building: two per floor. */
  capacity(b: Building): number {
    return this.isRoom(b) ? ROOMS_PER_FLOOR * floorsOf(b) : 0;
  }

  /** Floors a room building may have, which research raises. */
  get maxFloors(): number {
    return !this.progression || this.research.done.has('tallBuildings') ? MAX_FLOORS_RESEARCHED : MAX_FLOORS_EARLY;
  }

  /** A tall building without an elevator: guests resent the stairs. */
  needsElevator(b: Building): boolean {
    return floorsOf(b) > ELEVATOR_ABOVE && !b.elevator;
  }

  /** Venue state for a food building (created on first use). */
  venue(id: number): Venue {
    let v = this.venues[id];
    if (!v) {
      v = { price: DEFAULT_PRICE, serving: 0, line: [], visitsToday: 0, revenueToday: 0, lostToday: 0 };
      this.venues[id] = v;
    }
    return v;
  }

  setPrice(id: number, step: PriceStep): void {
    this.venue(id).price = step;
  }

  roomTier(b: Building): number {
    return roomTier(b.kind);
  }

  /** A Front Desk unlocks auto check-in and makes arrivals wait longer (GDD "Reception / Front Desk"). */
  get hasFrontDesk(): boolean {
    return this.world.buildings.some((b) => b.kind === 'frontDesk');
  }

  /** Nightly rate per party for a room building. */
  roomRate(b: Building): number {
    const tier = this.roomTier(b);
    return roomRateOf(tier, this.roomRates[tier] ?? DEFAULT_PRICE);
  }

  setRoomRate(tier: number, step: PriceStep): void {
    this.roomRates[tier] = step;
  }

  /** Current star rating, 1–5. */
  get rating(): number {
    return rating(this.reviews);
  }

  /** One of the four resort ratings, 1–5 (Pass 4). */
  categoryRating(cat: RatingCategory): number {
    return categoryRating(this.reviews, cat);
  }

  get ratings(): Record<RatingCategory | 'overall', number> {
    return {
      overall: this.rating,
      lodging: this.categoryRating('lodging'),
      amenities: this.categoryRating('amenities'),
      activities: this.categoryRating('activities'),
      decor: this.categoryRating('decor'),
    };
  }

  /** The ratings from reviews written before a month (for the report's trend). */
  private ratingsAt(month: number): Record<RatingCategory | 'overall', number> {
    const old = this.reviews.filter((rv) => rv.day < month);
    return {
      overall: rating(old),
      lodging: categoryRating(old, 'lodging'),
      amenities: categoryRating(old, 'amenities'),
      activities: categoryRating(old, 'activities'),
      decor: categoryRating(old, 'decor'),
    };
  }

  /** A guest's running category scores (created on first use; old saves have none). */
  private scores(g: Guest): CategoryScores {
    return (g.scores ??= emptyScores());
  }

  /** What a guest standing at their tile thinks of the view. */
  private lookAround(g: Guest): void {
    const t = g.tile;
    if (t) addScore(this.scores(g), 'decor', this.appeal.at(t.x, t.y));
  }

  match(g: Guest, room: Building): Match {
    const m = matchScore(this.paths, this.world, g, room, this.roomRate(room));
    if (this.needsElevator(room)) {
      m.score = Math.max(0, m.score - 15);
      m.notes.push({ ok: false, text: 'So many stairs!' });
    }
    return m;
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
    if (this.night) return;

    this.minutes += dt * MINUTES_PER_SECOND;
    if (this.minutes >= DAY_END) {
      this.closeDay();
      if (this.night) return;
    }

    this.stepFerry(dt);
    for (const g of this.guests) this.stepGuest(g, dt);
    this.campaign?.tick(dt);
    if (this.guests.length > MAX_GUESTS * 2) this.guests = this.guests.filter((g) => g.state !== 'gone');
  }

  /** 23:00: charge the night's rooms and the day's upkeep, collect reviews, write the report. */
  private closeDay(): void {
    const t = this.today;
    const roomLines = new Map<number, NightLine>();

    // Nightclubs are noisy after 22:00 (GDD): nearby rooms sleep badly, except party groups.
    const clubs = this.world.buildings.filter((b) => b.kind === 'nightclub');
    for (const g of this.guests) {
      const room = g.roomId !== null ? this.building(g.roomId) : undefined;
      if (!room || g.leaving) continue;
      if (g.type !== 'party') {
        const club = clubs.find((c) => this.near(room, c, 3));
        if (club) {
          g.satisfaction = Math.max(0, g.satisfaction - 6);
          addScore(this.scores(g), 'lodging', 25);
          this.remember(g, club.id, -10, 'the nightclub kept us up all night');
        }
      }
      // Each night in the room: how well it suits them, minus wear and tear.
      // A bed and a roof count for something even when the room isn't quite their style.
      addScore(this.scores(g), 'lodging', 25 + g.roomScore * 0.75 - wearPenalty(conditionOf(room)));
      const rate = this.roomRate(room);
      const paid = Math.min(rate, g.budget);
      if (rate > g.budget) {
        g.satisfaction = Math.max(0, g.satisfaction - 8);
        addScore(this.scores(g), 'lodging', 30);
        this.remember(g, room.id, -12, 'the room was overpriced');
      }
      this.world.earn(paid);
      t.roomIncome += paid;
      const line = roomLines.get(room.id) ?? { buildingId: room.id, name: BUILDINGS[room.kind].name, amount: 0, detail: '' };
      line.amount += paid;
      roomLines.set(room.id, line);
      g.nightsLeft--;
    }
    for (const l of roomLines.values()) {
      const n = this.occupancy(l.buildingId!);
      const b = this.building(l.buildingId!)!;
      l.detail = `${n} of ${this.capacity(b)} rooms`;
    }

    const costs: NightLine[] = [];
    for (const b of this.world.buildings) {
      // Each extra floor adds upkeep at the building's rate.
      const up = BUILDINGS[b.kind].upkeep * floorsOf(b) + (b.elevator ? 20 : 0);
      this.world.earn(-up);
      t.upkeep += up;
    }
    if (t.upkeep) costs.push({ buildingId: null, name: 'Upkeep', amount: -t.upkeep, detail: `${this.world.buildings.length} buildings` });
    const maint = Math.round(t.upkeep * MAINTENANCE_COST[this.maintenance]);
    if (maint) {
      this.world.earn(-maint);
      t.upkeep += maint;
      costs.push({ buildingId: null, name: 'Maintenance', amount: -maint, detail: `${this.maintenance} level` });
    }
    this.wearBuildings();
    if (t.supplies) costs.push({ buildingId: null, name: 'Supplies', amount: -t.supplies, detail: '30% of food sales' });
    let investorCut = 0;
    if (this.investor) {
      investorCut = Math.round((t.roomIncome + t.spending) * this.investor.share);
      this.world.earn(-investorCut);
      this.investor.daysLeft--;
      costs.push({
        buildingId: null,
        name: 'Investor share',
        amount: -investorCut,
        detail: `${Math.round(this.investor.share * 100)}% of income, ${duration(this.investor.daysLeft)} left`,
      });
      if (this.investor.daysLeft <= 0) this.investor = null;
    }

    const offices = this.world.buildings.filter((b) => b.kind === 'researchOffice').length;
    if (offices) this.addResearch(offices * OFFICE_POINTS);

    // Parties whose stay is over check out in the morning; they write their review tonight.
    let checkingOut = 0;
    for (const g of this.guests)
      if (g.roomId !== null && !g.leaving && g.nightsLeft <= 0) {
        checkingOut++;
        this.writeReview(g);
      }

    const income: NightLine[] = [...roomLines.values()].sort((a, b) => b.amount - a.amount);
    for (const b of this.world.buildings) {
      const v = this.venues[b.id];
      if (!v || !VENUES[b.kind]) continue;
      income.push({ buildingId: b.id, name: BUILDINGS[b.kind].name, amount: v.revenueToday, detail: `${v.visitsToday} sold` });
    }

    const reviews = this.reviews.filter((rv) => rv.day === this.day);
    const report: NightReport = {
      day: this.day,
      income,
      costs,
      profit: t.roomIncome + t.spending - t.supplies - t.upkeep - investorCut,
      stats: { ...t },
      checkingOut,
      reviews,
      ratingBefore: rating(this.reviews.filter((rv) => rv.day < this.day)),
      ratingAfter: this.rating,
      ratings: this.ratings,
      ratingsBefore: this.ratingsAt(this.day),
      best: this.bestMoment(income),
      worst: this.worstMoment(),
      nextArrivals: arrivalsForDay(this.day + 1, this.rating),
      researchPoints: t.research,
      offer: null,
    };
    // Bankruptcy is never instant: after three red days an investor offers a lifeline.
    this.redDays = report.profit < 0 ? this.redDays + 1 : 0;
    if (this.redDays >= RED_DAYS_FOR_OFFER && !this.investor && !this.offer)
      this.offer = { cash: 8000 + 2000 * this.world.plotsBought, share: 0.15, days: 20 };
    report.offer = this.offer;
    this.campaign?.onNight(report);
    this.emit({ type: 'night', report });
    if (this.pauseAtNight) this.night = report;
    else this.startDay();
  }

  /** A month of use: everything wears a little, busy places more, good maintenance less. */
  private wearBuildings(): void {
    const k = MAINTENANCE_WEAR[this.maintenance];
    for (const b of this.world.buildings) {
      const def = BUILDINGS[b.kind];
      let use = 0;
      if (def.family === 'rooms') use = this.capacity(b) ? this.occupancy(b.id) / this.capacity(b) : 0;
      else if (this.venues[b.id]) use = Math.min(1, this.venues[b.id].visitsToday / 40);
      const wear = (BASE_WEAR[def.family] ?? 1) * (1 + 0.5 * use) * k;
      b.condition = Math.max(0, Math.round((conditionOf(b) - wear) * 10) / 10);
    }
    this.appeal.invalidate();
  }

  private bestMoment(income: NightLine[]): string | null {
    const top = [...income].sort((a, b) => b.amount - a.amount)[0];
    if (!top || top.amount <= 0) return null;
    return `${top.name} brought in ${top.amount} coins (${top.detail})`;
  }

  private worstMoment(): string | null {
    const t = this.today;
    if (t.turnedAway > 0) return `${t.turnedAway} ${t.turnedAway === 1 ? 'party' : 'parties'} gave up waiting for a room`;
    let worst: { name: string; lost: number } | null = null;
    for (const b of this.world.buildings) {
      const v = this.venues[b.id];
      if (v && v.lostToday > (worst?.lost ?? 0)) worst = { name: BUILDINGS[b.kind].name, lost: v.lostToday };
    }
    if (worst) return `${worst.lost} guests walked away from the ${worst.name}`;
    if (t.roomIncome + t.spending < t.upkeep + t.supplies) return 'Costs were higher than income';
    return null;
  }

  acceptOffer(): boolean {
    const o = this.offer;
    if (!o) return false;
    this.world.earn(o.cash);
    this.investor = { share: o.share, daysLeft: o.days };
    this.offer = null;
    this.redDays = 0;
    return true;
  }

  declineOffer(): void {
    this.offer = null;
    this.redDays = 0;
  }

  /** Close the night report and start the next morning. */
  startDay(): void {
    this.night = null;
    const yesterday = this.today;
    this.world.day++;
    this.minutes = DAY_START;
    this.ferry.cameToday = false;
    this.today = emptyStats();
    this.guests = this.guests.filter((g) => g.state !== 'gone');
    for (const v of Object.values(this.venues)) {
      v.visitsToday = 0;
      v.revenueToday = 0;
      v.lostToday = 0;
    }
    // Morning: everyone wakes up rested with a fresh day's spending money;
    // guests whose stay is over check out.
    for (const g of this.guests) {
      if (g.roomId !== null) {
        g.needs.rest = 100;
        g.needs.comfort = Math.max(g.needs.comfort, this.roomComfort(g));
        g.needs.hunger = Math.max(0, g.needs.hunger - 25);
        g.wallet = this.dailySpend(g);
        g.spentToday = 0;
        g.declined = [];
      }
      if (g.nightsLeft <= 0 && g.roomId !== null) {
        g.leaving = true;
        g.roomId = null;
        g.thought = 'Time to go home.';
      }
      // The overnight timer ticks down from the moment they go to bed, so test against half of it.
      if (g.state === 'inside' && g.timer > OVERNIGHT / 2) g.timer = this.rng.range(0, 3);
    }
    this.campaign?.onMorning();
    this.emit({ type: 'newDay', day: this.world.day, yesterday });
  }

  /** Start a scenario (or sandbox with null) on the current world. */
  startScenario(id: string | null): void {
    this.campaign?.dispose();
    this.campaign = id ? new Campaign(this, id) : null;
  }

  // ---------- reviews (M5) ----------

  private remember(g: Guest, buildingId: number | null, weight: number, text: string): void {
    if (g.memories.some((m) => m.text === text)) return;
    g.memories.push({ buildingId, weight, text });
    if (g.memories.length > 12) {
      // Keep the most memorable ones.
      g.memories.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
      g.memories.length = 12;
    }
  }

  private writeReview(g: Guest, forceStars?: number): void {
    const sc = this.scores(g);
    // Satisfaction still counts for amenities: it carries how fed and entertained they were.
    const amen = sc.n.amenities ? 0.5 * scoreOf(sc, 'amenities') + 0.5 * g.satisfaction : 0.8 * g.satisfaction;
    sc.sum.amenities = amen;
    sc.n.amenities = 1;
    // A party that never got a room only judges the lodging and the welcome.
    const cats: Partial<Record<RatingCategory, number>> =
      forceStars !== undefined
        ? { lodging: forceStars, amenities: forceStars }
        : (Object.fromEntries(RATING_CATEGORIES.map((c) => [c, starsFor(scoreOf(sc, c))])) as Record<RatingCategory, number>);
    const stars = forceStars ?? starsFor(overallScore(g.type, sc));
    const { text, buildingId } = reviewText(stars, g.memories);
    const review: Review = { id: this.nextReviewId++, day: this.day, guestType: g.type, stars, text, buildingId, cats };
    this.reviews.push(review);
    // GDD: "Research Points come from guest reviews (each star = 1 point)".
    this.addResearch(stars);
    if (this.reviews.length > 500) this.reviews.splice(0, this.reviews.length - 500);
    this.emit({ type: 'review', review });
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
          f.toUnload = Math.max(0, Math.min(arrivalsForDay(this.day, this.rating), room));
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
        // It also waits while anyone is still queuing for a room, to take them home if they give up.
        const busy = this.guests.some((g) => g.state === 'boarding' || isUnhoused(g));
        if (!busy && this.minutes >= FERRY_LEAVES) {
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
    const type = this.pickGuestType();
    const def = GUEST_TYPES[type];
    const [lo, hi] = def.nights;
    const pool = [...def.wishPool];
    const wishes: Wish[] = [];
    for (let n = this.rng.int(...def.wishCount); n > 0 && pool.length; n--)
      wishes.push(pool.splice(Math.floor(this.rng.next() * pool.length), 1)[0]);
    const b = this.berth;
    const d = this.world.dock;
    const g: Guest = {
      id: this.nextGuestId++,
      type,
      size: this.rng.int(...def.size),
      budget: Math.round(this.rng.range(...def.budget) / 5) * 5,
      tier: def.tier,
      wishes,
      patience: PATIENCE_SECONDS * (this.hasFrontDesk ? 1.5 : 1) * (def.impatient ? 0.5 : 1),
      satisfaction: 50,
      roomScore: 50,
      needs: {
        hunger: this.rng.range(45, 75),
        fun: this.rng.range(50, 80),
        rest: this.rng.range(55, 85),
        comfort: this.rng.range(60, 85),
      },
      wallet: 0,
      spentToday: 0,
      avoid: null,
      declined: [],
      memories: [],
      roomId: null,
      nightsLeft: this.rng.int(lo, hi),
      leaving: false,
      state: 'arriving',
      x: b.x,
      z: b.z,
      px: b.x,
      pz: b.z,
      waypoints: [{ x: d.x + 0.5, z: d.y + 3.5 }, this.queueSpot()],
      wp: 0,
      goal: null,
      tile: null,
      insideId: null,
      timer: 0,
      thought: 'Which room is ours?',
      look: Math.floor(this.rng.next() * 1000),
    };
    g.wallet = this.dailySpend(g);
    this.guests.push(g);
    this.today.arrived++;
  }

  /**
   * Who is on the ferry: the rating unlocks richer types (GDD) and shifts the mix
   * from backpackers towards couples.
   */
  private pickGuestType(): GuestType {
    const stars = this.rating;
    const share = coupleShare(stars);
    const bias = this.campaign?.def.guestBias ?? {};
    const helipad = this.world.buildings.some((b) => b.kind === 'helipad');
    const weights = GUEST_TYPE_KEYS.map((t) => {
      const d = GUEST_TYPES[t];
      if (stars < d.minStars) return 0;
      if (d.needs && !this.world.buildings.some((b) => b.kind === d.needs)) return 0;
      let wgt = t === 'backpacker' ? 1 - share : t === 'couple' ? share : d.weight;
      // A Helipad flies VIPs in (GDD).
      if (t === 'vip' && helipad) wgt *= 3;
      return wgt * (bias[t] ?? 1);
    });
    let r = this.rng.next() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) <= 0) return GUEST_TYPE_KEYS[i];
    return 'backpacker';
  }

  private dailySpend(g: Guest): number {
    return Math.round(this.rng.range(...GUEST_TYPES[g.type].spend));
  }

  /** How comfortable their room is, from its match score. */
  private roomComfort(g: Guest): number {
    return 40 + g.roomScore * 0.6;
  }

  private stepGuest(g: Guest, dt: number): void {
    this.stepNeeds(g, dt);
    switch (g.state) {
      case 'inline':
        g.timer -= dt;
        if (g.timer <= 0) this.leaveLine(g);
        return;
      case 'arriving':
      case 'walking':
      case 'boarding':
        if (this.walk(g, dt)) this.arrive(g);
        return;
      case 'inside':
        g.timer -= dt;
        if (g.timer <= 0) this.exitBuilding(g);
        return;
      case 'queued':
        g.patience -= dt;
        if (g.patience <= 0) this.giveUp(g);
        return;
      case 'waiting':
      case 'gone':
        return;
    }
  }

  /** Meters run down while out on the island; satisfaction follows how they feel. */
  private stepNeeds(g: Guest, dt: number): void {
    if (g.roomId === null || g.leaving) return;
    if (g.state === 'inside' && g.insideId === g.roomId) return;
    if (g.state !== 'walking' && g.state !== 'inline' && g.state !== 'inside') return;
    for (const n of NEEDS) g.needs[n] = Math.max(0, g.needs[n] - DECAY[n] * dt);
    if (g.needs.hunger < 10 && !g.memories.some((m) => m.text === 'we were always hungry')) {
      addScore(this.scores(g), 'amenities', 15);
      this.remember(g, null, -8, 'we were always hungry');
    }
    if (g.needs.fun < 10 && !g.memories.some((m) => m.text === 'there was nothing to do')) {
      addScore(this.scores(g), 'activities', 15);
      this.remember(g, null, -6, 'there was nothing to do');
    }
    const low = g.needs[lowestNeed(g.needs)];
    if (low < 25) g.satisfaction = Math.max(0, g.satisfaction - 0.25 * dt);
    else if (low > 60) g.satisfaction = Math.min(100, g.satisfaction + 0.04 * dt);
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
      if (g.roomId === null) {
        g.state = 'queued';
        if (this.autoCheckIn) this.autoAssign(g);
        return;
      }
      g.state = 'walking';
      g.tile = { ...this.world.dock };
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
    if (goal.kind === 'tile') {
      g.needs.fun = Math.min(100, g.needs.fun + STROLL_FUN);
      // Exploring counts as a (modest) activity, better where the island is pretty.
      addScore(this.scores(g), 'activities', 38 + this.appeal.at(goal.tile.x, goal.tile.y) * 0.3);
      this.lookAround(g);
      g.thought = this.rng.pick(['What a lovely island.', 'Look at that water!', 'Nice little stroll.']);
      return this.decide(g);
    }
    const b = this.building(goal.id);
    if (!b) return this.decide(g);
    if (goal.purpose === 'food') return this.arriveAtVenue(g, b);
    g.state = 'inside';
    g.insideId = b.id;
    g.timer =
      goal.purpose === 'room' && this.minutes >= (GUEST_TYPES[g.type].bedtime ?? EVENING) ? OVERNIGHT : this.rng.range(8, 14);
    g.thought = g.timer > OVERNIGHT / 2 ? 'Good night!' : 'A little rest.';
  }

  // ---------- venues (M4) ----------

  /** At a food venue: buy if the price suits them, then get served or join the line. */
  private arriveAtVenue(g: Guest, b: Building): void {
    const def = VENUES[b.kind];
    if (!def) return this.decide(g);
    const v = this.venue(b.id);
    const price = this.partyPrice(g, b, v);
    const name = BUILDINGS[b.kind].name;
    if (price > 0) {
      if (g.wallet < price) return this.walkAway(g, b, v, `Can’t afford the ${name}.`, 2);
      if (this.rng.next() > buyChance(g.type, v.price)) {
        g.declined.push(b.id);
        return this.walkAway(g, b, v, `The ${name} is too pricey!`, 4);
      }
    }
    if (v.serving < def.capacity) return this.serve(g, b, v);
    if (v.line.length >= def.lineMax) return this.walkAway(g, b, v, `The line at the ${name} is huge!`, 4);
    v.line.push(g.id);
    g.state = 'inline';
    g.insideId = b.id;
    g.timer = LINE_PATIENCE;
    g.thought = `Waiting in line at the ${name}.`;
  }

  /** What a party pays at a venue: per person, or per child at the Kids' Club. */
  private partyPrice(g: Guest, b: Building, v: Venue): number {
    const each = priceOf(b.kind, v.price);
    const people = VENUES[b.kind]?.perChild ? Math.max(1, g.size - 2) : g.size;
    return each * people;
  }

  private walkAway(g: Guest, b: Building, v: Venue, thought: string, penalty: number): void {
    v.lostToday++;
    addScore(this.scores(g), ratingOf(b.kind) === 'activities' ? 'activities' : 'amenities', 30);
    this.remember(g, b.id, -penalty * 2, thought.replace(/[.!]$/, '').replace(/^./, (c) => c.toLowerCase()));
    g.satisfaction = Math.max(0, g.satisfaction - penalty);
    g.thought = thought;
    g.avoid = b.id;
    this.decide(g);
  }

  private serve(g: Guest, b: Building, v: Venue): void {
    const def = VENUES[b.kind]!;
    const price = this.partyPrice(g, b, v);
    const crowded = v.serving + 1 > def.capacity / 2 || v.line.length > 0;
    v.serving++;
    v.visitsToday++;
    v.revenueToday += price;
    g.wallet -= price;
    g.spentToday += price;
    this.today.spending += price;
    const supplies = Math.round(price * SUPPLIES_SHARE);
    this.today.supplies += supplies;
    this.world.earn(price - supplies);
    const name = BUILDINGS[b.kind].name;
    const room = g.roomId !== null ? this.building(g.roomId) : undefined;
    if (room && this.roomDistance(room, `b${b.id}`, this.access(b)) > FAR_TILES)
      this.remember(g, b.id, -9, `the walk to the ${name} was endless`);
    else if (v.price <= 1) this.remember(g, b.id, 7, `the ${name} was great value`);
    else this.remember(g, b.id, 4, `we loved the ${name}`);
    g.needs[def.need] = Math.min(100, g.needs[def.need] + def.gain);
    for (const [n, add] of Object.entries(def.bonus ?? {})) {
      const k = n as keyof Meters;
      g.needs[k] = Math.min(100, g.needs[k] + (add ?? 0));
    }
    // A bargain pleases; a steep price stings a little even when they pay it.
    let mood = price === 0 || v.price <= 2 ? 3 : -2;
    const type = GUEST_TYPES[g.type];
    if (type.likes.includes(b.kind)) {
      mood += 3;
      this.remember(g, b.id, 8, `we loved the ${name}`);
    }
    if (type.dislikes.includes(b.kind)) {
      mood -= 4;
      this.remember(g, b.id, -6, `the ${name} wasn’t for us`);
    }
    if (type.hatesCrowds && crowded) {
      mood -= 4;
      this.remember(g, b.id, -8, `the ${name} was far too crowded`);
    }
    // Richer guests notice a budget venue (quality class below their tier).
    if (g.tier - BUILDINGS[b.kind].quality >= 2) {
      mood -= 2;
      this.remember(g, b.id, -3, `the ${name} felt a bit basic`);
    }
    g.satisfaction = Math.max(0, Math.min(100, g.satisfaction + mood));
    const cat = ratingOf(b.kind) === 'activities' ? 'activities' : 'amenities';
    addScore(this.scores(g), cat, 64 + mood * 6 - wearPenalty(conditionOf(b)));
    this.lookAround(g);
    g.state = 'inside';
    g.insideId = b.id;
    g.timer = def.service * this.rng.range(0.85, 1.15);
    g.avoid = null;
    g.thought =
      price === 0
        ? `Splashing about in the ${name}!`
        : v.price <= 1
          ? `Great prices at the ${name}!`
          : def.need === 'hunger'
            ? `Eating at the ${name}.`
            : `Having fun at the ${name}.`;
    if (price > 0) this.emit({ type: 'purchase', guestId: g.id, buildingId: b.id, amount: price });
  }

  private leaveLine(g: Guest): void {
    const b = g.insideId !== null ? this.building(g.insideId) : undefined;
    if (b) {
      const v = this.venue(b.id);
      v.line = v.line.filter((id) => id !== g.id);
      g.insideId = null;
      return this.walkAway(g, b, v, 'I waited too long in that line.', 5);
    }
    g.insideId = null;
    g.state = 'walking';
    this.decide(g);
  }

  /** A seat came free: serve the next guest in line. */
  private pullLine(b: Building): void {
    const def = VENUES[b.kind];
    if (!def) return;
    const v = this.venue(b.id);
    while (v.serving < def.capacity && v.line.length) {
      const g = this.guest(v.line.shift()!);
      if (g && g.state === 'inline') this.serve(g, b, v);
    }
  }

  private exitBuilding(g: Guest): void {
    const b = g.insideId !== null ? this.building(g.insideId) : undefined;
    if (b && VENUES[b.kind]) {
      const v = this.venue(b.id);
      v.serving = Math.max(0, v.serving - 1);
      this.pullLine(b);
    } else if (b && b.id === g.roomId) {
      g.needs.rest = Math.min(100, g.needs.rest + NAP_REST);
      g.needs.comfort = Math.max(g.needs.comfort, this.roomComfort(g));
    }
    g.insideId = null;
    g.state = 'walking';
    // They reappear at the path tile they went in from (g.tile is unchanged).
    if (g.tile) {
      g.x = g.tile.x + 0.5;
      g.z = g.tile.y + 0.5;
    }
    this.decide(g);
  }

  // ---------- check-in (M3) ----------

  /** Put a queued (or still arriving) party into a room. */
  checkIn(guestId: number, roomId: number, auto = false): CheckInResult {
    const g = this.guest(guestId);
    if (!g || !isUnhoused(g)) return { ok: false, reason: 'They already have a room' };
    const room = this.building(roomId);
    if (!room || !this.isRoom(room)) return { ok: false, reason: 'That isn’t a room' };
    if (!this.hasVacancy(room)) return { ok: false, reason: 'No free room there' };
    const route = this.paths.route(`b${room.id}`, accessOf(this.world, room), this.world.dock);
    if (!route) return { ok: false, reason: 'They can’t walk there' };

    const score = Math.max(0, this.match(g, room).score - (auto ? AUTO_PENALTY : 0));
    g.roomId = room.id;
    g.satisfaction = score;
    g.roomScore = score;
    addScore(this.scores(g), 'lodging', score - wearPenalty(conditionOf(room)));
    addScore(this.scores(g), 'decor', this.appeal.at(room.x, room.y));
    if (GUEST_TYPES[g.type].impatient && !this.hasFrontDesk) {
      g.satisfaction = Math.max(0, g.satisfaction - 10);
      this.remember(g, null, -8, 'check-in took forever');
    }
    if (score >= 75) this.remember(g, room.id, 8, 'our room was perfect');
    else if (score < 45) this.remember(g, room.id, -8, 'our room wasn’t what we hoped for');
    g.thought = score >= 75 ? 'This is perfect!' : score >= 50 ? 'This will do.' : 'Hmm, not what we hoped for.';
    // Walk from wherever they stand on the pier onto the island.
    const d = this.world.dock;
    g.state = 'arriving';
    g.waypoints = [
      { x: d.x + 0.5, z: Math.min(g.z, d.y + 3.5) },
      { x: d.x + 0.5, z: d.y + 1.2 },
      { x: d.x + 0.5, z: d.y + 0.5 },
    ];
    g.wp = 0;
    this.today.housed++;
    this.emit({ type: 'checkedIn', guestId: g.id, roomId: room.id, score, auto });
    return { ok: true, score };
  }

  /** Best free room for a party, or null. */
  bestRoom(g: Guest): { room: Building; score: number } | null {
    let best: { room: Building; score: number } | null = null;
    for (const b of this.world.buildings) {
      if (!this.hasVacancy(b)) continue;
      const score = this.match(g, b).score;
      if (!best || score > best.score) best = { room: b, score };
    }
    return best;
  }

  private autoAssign(g: Guest): boolean {
    const best = this.bestRoom(g);
    return !!best && this.checkIn(g.id, best.room.id, true).ok;
  }

  /** Auto-assign every party in the queue (needs a Front Desk). Returns how many got a room. */
  autoCheckInAll(): number {
    if (!this.hasFrontDesk && !this.autoCheckIn) return 0;
    let n = 0;
    for (const g of this.queue) if (this.autoAssign(g)) n++;
    return n;
  }

  private giveUp(g: Guest): void {
    g.leaving = true;
    g.satisfaction = 0;
    g.thought = 'We waited ages for a room. Never again!';
    g.state = 'waiting';
    this.today.turnedAway++;
    this.remember(g, null, -20, 'we waited ages on the pier and never got a room');
    // Not everyone who leaves bothers to write a review.
    if (this.rng.next() < 0.5) this.writeReview(g, 1);
    this.emit({ type: 'gaveUp', guestId: g.id });
  }

  /**
   * Pick what to do next: whatever best fills their emptiest meters, weighted by
   * walking distance, the 12-tile rule, queues and prices.
   */
  private decide(g: Guest): void {
    if (g.leaving) return this.plan(g, { kind: 'dock' });
    if (g.roomId === null || !this.building(g.roomId)) {
      g.roomId = null;
      g.leaving = true;
      g.thought = 'My room is gone!';
      return this.plan(g, { kind: 'dock' });
    }
    if (this.minutes >= (GUEST_TYPES[g.type].bedtime ?? EVENING))
      return this.plan(g, { kind: 'building', id: g.roomId, purpose: 'room' });

    const options = this.options(g);
    let best = options[0];
    let bestU = -1;
    for (const o of options) {
      const u = o.utility * this.rng.range(0.75, 1.25);
      if (u > bestU) {
        bestU = u;
        best = o;
      }
    }
    g.avoid = null;
    if (best.goal.kind === 'building' && best.goal.purpose === 'food' && g.needs.hunger < 35)
      g.thought = 'I’m starving!';
    this.plan(g, best.goal);
  }

  /** Every choice a guest could make right now, with how much they'd like it. */
  options(g: Guest): Array<{ goal: Goal; utility: number }> {
    const out: Array<{ goal: Goal; utility: number }> = [];
    const room = g.roomId !== null ? this.building(g.roomId) : undefined;
    const from = g.tile;
    const m = g.needs;

    for (const b of this.world.buildings) {
      const def = VENUES[b.kind];
      if (!def || !from || b.id === g.avoid || g.declined.includes(b.id)) continue;
      const key = `b${b.id}`;
      const goals = this.access(b);
      const d = this.paths.distance(key, goals, from);
      if (d >= UNREACHABLE) continue;
      const v = this.venue(b.id);
      const deficit = 100 - m[def.need];
      const type = GUEST_TYPES[g.type];
      if (def.only && !def.only.includes(g.type)) continue;
      let u = Math.min(def.gain, deficit) * (deficit > 30 ? 1 : 0.3);
      if (type.likes.includes(b.kind)) u *= 1.6;
      // Taste: a place two classes above their budget isn't their kind of place.
      if (BUILDINGS[b.kind].quality - g.tier >= 2) u *= 0.25;
      if (type.dislikes.includes(b.kind)) u *= 0.15;
      for (const [n, add] of Object.entries(def.bonus ?? {})) u += Math.min(add ?? 0, 100 - m[n as keyof Meters]) * 0.5;
      u *= 1 / (1 + d / (GUEST_TYPES[g.type].walkShy ? 5 : 8));
      // The 12-tile rule is measured from their room's door.
      if (room && this.roomDistance(room, key, goals) > FAR_TILES) u *= FAR_FACTOR;
      u *= 1 / (1 + v.line.length / 2);
      // Price isn't known until they get there (GDD); only an empty wallet keeps them away.
      if (g.wallet < this.partyPrice(g, b, v)) u = 0;
      out.push({ goal: { kind: 'building', id: b.id, purpose: 'food' }, utility: u });
    }

    if (room) {
      const deficit = 100 - m.rest + (100 - m.comfort) * 0.5;
      const d = from ? this.paths.distance(`b${room.id}`, this.access(room), from) : 0;
      out.push({ goal: { kind: 'building', id: room.id, purpose: 'rest' }, utility: (deficit * 0.6) / (1 + d / 10) });
    }

    const tiles = this.world.pathTiles();
    // A stroll is the free fallback for fun: always possible, but less fun than a venue.
    out.push({ goal: { kind: 'tile', tile: this.rng.pick(tiles) }, utility: (100 - m.fun) * 0.2 + 4 });
    return out;
  }

  private roomDistance(room: Building, key: string, goals: Tile[]): number {
    let best = UNREACHABLE;
    for (const t of this.access(room)) best = Math.min(best, this.paths.distance(key, goals, t));
    return best;
  }

  /** Turn a goal into waypoints from the guest's current tile. */
  private plan(g: Guest, goal: Goal, retried = false): void {
    // A stroll target that is no longer a path is simply forgotten.
    if (goal.kind === 'tile' && !this.world.isPath(goal.tile.x, goal.tile.y)) {
      if (retried) goal = { kind: 'dock' };
      else return this.decide(g);
    }
    g.goal = goal;
    g.state = 'walking';
    const from = g.tile && this.world.isPath(g.tile.x, g.tile.y) ? g.tile : null;
    if (!from) return retried ? this.strand(g) : this.teleportToDock(g, goal);

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
    if (!route) return retried ? this.strand(g) : this.teleportToDock(g, goal);
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
    if (goal.kind === 'dock') return this.strand(g);
    this.plan(g, goal, true);
  }

  /** Last resort: walk out along the pier and wait there. */
  private strand(g: Guest): void {
    g.goal = { kind: 'dock' };
    g.state = 'walking';
    g.waypoints = [...this.pierWalk(true).slice(0, 2), this.waitingSpot()];
    g.wp = 0;
  }

  /** A point just inside the building's edge next to the access tile. */
  private doorPoint(b: Building, access: Tile): Point {
    const tiles = this.world.footprintTiles(b.kind, b.x, b.y, b.rot);
    const inside = tiles.find((t) => Math.abs(t.x - access.x) + Math.abs(t.y - access.y) === 1) ?? tiles[0];
    return { x: access.x + 0.5 + (inside.x - access.x) * 0.45, z: access.y + 0.5 + (inside.y - access.y) * 0.45 };
  }

  private access(b: Building): Tile[] {
    return accessOf(this.world, b);
  }

  /** Footprints within `radius` tiles of each other (any direction). */
  private near(a: Building, b: Building, radius: number): boolean {
    const ta = this.world.footprintTiles(a.kind, a.x, a.y, a.rot);
    const tb = this.world.footprintTiles(b.kind, b.x, b.y, b.rot);
    return ta.some((p) => tb.some((q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) <= radius));
  }

  private building(id: number): Building | undefined {
    return this.world.buildings.find((b) => b.id === id);
  }

  /** After the map changes: fix guests whose room, target or path disappeared, and re-route walkers. */
  private reconcile(): void {
    this.stale = false;
    for (const id of Object.keys(this.venues).map(Number)) if (!this.building(id)) delete this.venues[id];
    for (const g of this.guests) {
      if (g.state === 'inline' && (g.insideId === null || !this.building(g.insideId))) {
        g.insideId = null;
        g.state = 'walking';
        this.decide(g);
        continue;
      }
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
      version: 7,
      maintenance: this.maintenance,
      campaign: this.campaign ? this.campaign.snapshot() : null,
      redDays: this.redDays,
      investor: this.investor ? { ...this.investor } : null,
      offer: this.offer ? { ...this.offer } : null,
      research: this.research.snapshot(),
      progression: this.progression,
      reviews: structuredClone(this.reviews),
      nextReviewId: this.nextReviewId,
      roomRates: { ...this.roomRates },
      night: this.night ? structuredClone(this.night) : null,
      venues: structuredClone(this.venues),
      minutes: this.minutes,
      rng: this.rng.state,
      nextGuestId: this.nextGuestId,
      ferry: { ...this.ferry },
      guests: this.guests.filter((g) => g.state !== 'gone').map((g) => structuredClone(g)),
      today: { ...this.today },
    };
  }

  restore(s: SimSnapshot): void {
    if (s.version !== 7) throw new Error('Incompatible save');
    this.maintenance = s.maintenance;
    this.campaign?.dispose();
    this.campaign = s.campaign ? new Campaign(this, s.campaign.scenario, structuredClone(s.campaign)) : null;
    this.redDays = s.redDays;
    this.investor = s.investor ? { ...s.investor } : null;
    this.offer = s.offer ? { ...s.offer } : null;
    this.research.restore(s.research);
    this.progression = s.progression;
    this.reviews = structuredClone(s.reviews);
    this.nextReviewId = s.nextReviewId;
    this.roomRates = { ...s.roomRates };
    this.night = s.night ? structuredClone(s.night) : null;
    this.venues = structuredClone(s.venues);
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
      version: 7,
      maintenance: 'normal',
      campaign: null,
      redDays: 0,
      investor: null,
      offer: null,
      research: { points: 0, done: [] },
      progression: this.progression,
      reviews: [],
      nextReviewId: 1,
      roomRates: { 1: DEFAULT_PRICE },
      night: null,
      venues: {},
      minutes: DAY_START,
      rng: 0x1234abcd,
      nextGuestId: 1,
      ferry: { phase: 'away', t: 0, toUnload: 0, unloadTimer: 0, cameToday: false },
      guests: [],
      today: emptyStats(),
    });
  }
}

/** Still needs a room: on the pier, or walking off the boat without one. */
export function isUnhoused(g: Guest): boolean {
  return !g.leaving && g.roomId === null && (g.state === 'queued' || g.state === 'arriving');
}

export function isMoving(g: Guest): boolean {
  return g.state === 'arriving' || g.state === 'walking' || g.state === 'boarding';
}

/** True if a guest should be drawn. */
export function isVisible(g: Guest): boolean {
  return g.state !== 'inside' && g.state !== 'gone';
}
