/**
 * Building catalogue. The prototype started with Rooms, Snack Bar, Buffet and Footpath
 * (GDD); Pass 1 adds research tier 1. The full plan, with unlock tiers and quality
 * classes, is in docs/CATALOGUE.md. Numbers are first-pass values for the balance pass.
 */

export type BuildingKind =
  | 'basicRooms'
  | 'standardRooms'
  | 'snackBar'
  | 'buffet'
  | 'beachBar'
  | 'giftShop'
  | 'pool'
  | 'frontDesk';

export type BuildingFamily = 'rooms' | 'food' | 'fun' | 'services';

/**
 * Quality class (Pass 1): how premium a building is, separate from when it unlocks.
 * Rooms use it as their tier; richer guests expect a higher class.
 */
export type Quality = 1 | 2 | 3 | 4;
export const QUALITY_NAMES: Record<Quality, string> = { 1: 'Budget', 2: 'Mid', 3: 'Premium', 4: 'Luxury' };

export interface BuildingDef {
  kind: BuildingKind;
  name: string;
  family: BuildingFamily;
  /** Footprint at rotation 0, in tiles. */
  w: number;
  h: number;
  cost: number;
  /** Daily upkeep (GDD: ~1–2% of build cost). Charged from M5. */
  upkeep: number;
  /** Short line for the build tray. */
  blurb: string;
  quality: Quality;
  /** Research tier that unlocks it; 0 = available from the start. */
  unlock: number;
  /** Must have a side on the shore (GDD "(beach)" buildings). */
  coast?: boolean;
  /** Makes nearby rooms less quiet. */
  noisy?: boolean;
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  basicRooms: {
    kind: 'basicRooms',
    name: 'Basic Rooms',
    family: 'rooms',
    w: 2,
    h: 2,
    cost: 2000,
    upkeep: 30,
    blurb: '2 rooms',
    quality: 1,
    unlock: 0,
  },
  standardRooms: {
    kind: 'standardRooms',
    name: 'Standard Rooms',
    family: 'rooms',
    w: 2,
    h: 2,
    cost: 3500,
    upkeep: 50,
    blurb: '2 nicer rooms',
    quality: 2,
    unlock: 1,
  },
  snackBar: {
    kind: 'snackBar',
    name: 'Snack Bar',
    family: 'food',
    w: 1,
    h: 1,
    cost: 1200,
    upkeep: 15,
    blurb: 'Snacks',
    quality: 1,
    unlock: 0,
    noisy: true,
  },
  buffet: {
    kind: 'buffet',
    name: 'Buffet',
    family: 'food',
    w: 3,
    h: 2,
    cost: 4000,
    upkeep: 60,
    blurb: 'Meals',
    quality: 1,
    unlock: 0,
    noisy: true,
  },
  beachBar: {
    kind: 'beachBar',
    name: 'Beach Bar',
    family: 'fun',
    w: 2,
    h: 1,
    cost: 2500,
    upkeep: 35,
    blurb: 'Drinks · shore',
    quality: 2,
    unlock: 1,
    coast: true,
    noisy: true,
  },
  giftShop: {
    kind: 'giftShop',
    name: 'Gift Shop',
    family: 'fun',
    w: 1,
    h: 2,
    cost: 2000,
    upkeep: 25,
    blurb: 'Souvenirs',
    quality: 2,
    unlock: 1,
  },
  pool: {
    kind: 'pool',
    name: 'Pool',
    family: 'fun',
    w: 4,
    h: 3,
    cost: 6000,
    upkeep: 80,
    blurb: 'Free · fun, comfort',
    quality: 2,
    unlock: 1,
  },
  frontDesk: {
    kind: 'frontDesk',
    name: 'Front Desk',
    family: 'services',
    w: 2,
    h: 2,
    cost: 3000,
    upkeep: 40,
    blurb: 'Auto check-in',
    quality: 2,
    unlock: 1,
  },
};

export const BUILDING_KINDS = Object.keys(BUILDINGS) as BuildingKind[];

export const PATH_COST = 10;

/** Demolishing refunds this share of the build cost (GDD: 50%). */
export const DEMOLISH_REFUND = 0.5;

export const START_MONEY = 15000;

export type Rotation = 0 | 1 | 2 | 3;

/** Footprint after rotation: odd rotations swap width and height. */
export function footprint(kind: BuildingKind, rot: Rotation): { w: number; h: number } {
  const d = BUILDINGS[kind];
  return rot % 2 === 0 ? { w: d.w, h: d.h } : { w: d.h, h: d.w };
}
