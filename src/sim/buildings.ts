/**
 * Building catalogue for the prototype (GDD: "A new scenario starts with 4 of them:
 * Rooms, Snack Bar, Buffet and Footpath"). Numbers are first-pass balance values,
 * tuned against the GDD target of ~15,000 starting coins covering
 * 4 rooms + 1 snack bar + 1 buffet + paths with a little left over.
 */

export type BuildingKind = 'basicRooms' | 'snackBar' | 'buffet';

export type BuildingFamily = 'rooms' | 'food';

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
