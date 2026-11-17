import type { BuildingKind } from './buildings';

/**
 * Needs, venues and prices (M4). GDD: "Each guest tracks four meters: Hunger, Fun,
 * Rest and Comfort. They walk to whatever building satisfies their lowest meter best,
 * weighted by walking distance and their own taste. Price, queue length and quality
 * decide whether they buy once they get there."
 *
 * Meters run 0–100 where 100 means fully satisfied.
 */

export type Need = 'hunger' | 'fun' | 'rest' | 'comfort';
export const NEEDS: Need[] = ['hunger', 'fun', 'rest', 'comfort'];
export const NEED_LABELS: Record<Need, string> = { hunger: 'Hunger', fun: 'Fun', rest: 'Rest', comfort: 'Comfort' };

export type Meters = Record<Need, number>;

/** Meter loss per sim second while out and about (a day is 200 s). */
export const DECAY: Meters = { hunger: 0.55, fun: 0.45, rest: 0.3, comfort: 0.22 };

/** Fun gained from a stroll to somewhere new on the island. */
export const STROLL_FUN = 14;
/** Rest gained from a nap in the room during the day. */
export const NAP_REST = 45;

/**
 * GDD 12-tile rule: "A building more than 12 path tiles from a guest's room loses
 * most of their visits."
 */
export const FAR_TILES = 12;
export const FAR_FACTOR = 0.15;

export interface VenueDef {
  need: Need;
  /** Meter points one visit gives. */
  gain: number;
  /** Guests served at the same time. */
  capacity: number;
  /** Sim seconds a visit takes. */
  service: number;
  /** Longest line guests will join. */
  lineMax: number;
  /** Price per person at the "Fair" step. */
  basePrice: number;
  /** Secondary meter bonus, e.g. a snack is a bit of fun. */
  bonus?: Partial<Meters>;
  /** Only these guest types use it (the Kids' Club is for families). */
  only?: string[];
  /** Priced per child (party size minus two adults) rather than per person. */
  perChild?: boolean;
}

const RESTAURANT: VenueDef = {
  need: 'hunger',
  gain: 80,
  capacity: 10,
  service: 8,
  lineMax: 6,
  basePrice: 45,
  bonus: { comfort: 10 },
};

export const VENUES: Partial<Record<BuildingKind, VenueDef>> = {
  snackBar: { need: 'hunger', gain: 35, capacity: 2, service: 2.5, lineMax: 4, basePrice: 10, bonus: { fun: 5 } },
  buffet: { need: 'hunger', gain: 70, capacity: 8, service: 6, lineMax: 6, basePrice: 25, bonus: { comfort: 5 } },
  beachBar: { need: 'fun', gain: 40, capacity: 4, service: 4, lineMax: 4, basePrice: 12, bonus: { hunger: 5 } },
  giftShop: { need: 'fun', gain: 25, capacity: 3, service: 3, lineMax: 3, basePrice: 18 },
  // Free to use: it earns through happier guests and better reviews (GDD "Free (appeal)").
  pool: { need: 'fun', gain: 35, capacity: 10, service: 7, lineMax: 6, basePrice: 0, bonus: { comfort: 25 } },
  // Tier 2 (Pass 1)
  italianRestaurant: RESTAURANT,
  seafoodRestaurant: RESTAURANT,
  asianRestaurant: RESTAURANT,
  gym: { need: 'comfort', gain: 25, capacity: 6, service: 6, lineMax: 4, basePrice: 10, bonus: { fun: 15 } },
  spa: { need: 'comfort', gain: 55, capacity: 4, service: 10, lineMax: 4, basePrice: 60, bonus: { rest: 25 } },
  boutique: { need: 'fun', gain: 30, capacity: 4, service: 5, lineMax: 3, basePrice: 50, bonus: { comfort: 10 } },
  diveShop: { need: 'fun', gain: 60, capacity: 4, service: 12, lineMax: 4, basePrice: 55 },
  kidsClub: { need: 'fun', gain: 50, capacity: 6, service: 9, lineMax: 4, basePrice: 15, only: ['family'], perChild: true, bonus: { rest: 10 } },
  nightclub: { need: 'fun', gain: 55, capacity: 14, service: 10, lineMax: 8, basePrice: 30, bonus: { hunger: 5 } },
};

/** Sim seconds a guest will stand in a line before walking off. */
export const LINE_PATIENCE = 10;

export type PriceStep = 0 | 1 | 2 | 3 | 4;
export const PRICE_STEPS: { label: string; mult: number }[] = [
  { label: 'Bargain', mult: 0.6 },
  { label: 'Low', mult: 0.8 },
  { label: 'Fair', mult: 1 },
  { label: 'High', mult: 1.3 },
  { label: 'Luxury', mult: 1.7 },
];
export const DEFAULT_PRICE: PriceStep = 2;

export function priceOf(kind: BuildingKind, step: PriceStep): number {
  const v = VENUES[kind];
  return v ? Math.round(v.basePrice * PRICE_STEPS[step].mult) : 0;
}

/** Price multiple a guest type accepts without hesitation. */
export const PRICE_TOLERANCE: Record<string, number> = {
  backpacker: 0.8,
  couple: 1.1,
  family: 0.95,
  wellness: 1.35,
  party: 1.05,
  vip: 1.7,
};

/** Chance a guest buys at a price step, before checking their wallet. */
export function buyChance(type: string, step: PriceStep): number {
  const over = Math.max(0, PRICE_STEPS[step].mult - (PRICE_TOLERANCE[type] ?? 1));
  return Math.max(0.05, Math.min(0.97, 0.95 - over * 1.5));
}

export function fullMeters(): Meters {
  return { hunger: 100, fun: 100, rest: 100, comfort: 100 };
}

export function lowestNeed(m: Meters): Need {
  let best: Need = 'hunger';
  for (const n of NEEDS) if (m[n] < m[best]) best = n;
  return best;
}

// ---------- room rates and costs (M5) ----------

/** Nightly room rate per party at the "Fair" step, by room tier. */
export const ROOM_BASE_RATE: Record<number, number> = { 1: 50, 2: 90, 3: 160, 4: 260 };

export function roomRateOf(tier: number, step: PriceStep): number {
  return Math.round((ROOM_BASE_RATE[tier] ?? 50) * PRICE_STEPS[step].mult);
}

/** GDD: "supplies (per sale, about 30% of food revenue)". */
export const SUPPLIES_SHARE = 0.3;
