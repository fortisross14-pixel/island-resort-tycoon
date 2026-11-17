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
  | 'frontDesk'
  | 'researchOffice'
  | 'gardenBungalows'
  | 'italianRestaurant'
  | 'seafoodRestaurant'
  | 'asianRestaurant'
  | 'gym'
  | 'spa'
  | 'boutique'
  | 'diveShop'
  | 'kidsClub'
  | 'nightclub'
  | 'suites'
  | 'fineDining'
  | 'movieTheater'
  | 'conferenceHall'
  | 'waterVillas'
  | 'helipad'
  | 'marina'
  // Activity hubs (Pass 4): scheduled in the planner.
  | 'trailHut'
  | 'yogaDeck'
  | 'kayakRental'
  | 'excursionPier'
  // Decor (Pass 4): small items that make the resort prettier.
  | 'palmTree'
  | 'bench'
  | 'lampPost'
  | 'beachChairs'
  | 'flowerBed'
  | 'tikiTorch'
  | 'surfboardRack'
  | 'tikiTotem'
  | 'hammocks'
  | 'bunting'
  | 'welcomeArch';

export type BuildingFamily = 'rooms' | 'food' | 'fun' | 'services' | 'decor';

/** The four resort ratings (Pass 4) plus the overall. */
export type RatingCategory = 'lodging' | 'amenities' | 'activities' | 'decor';
export const RATING_CATEGORIES: RatingCategory[] = ['lodging', 'amenities', 'activities', 'decor'];
export const RATING_NAMES: Record<RatingCategory, string> = {
  lodging: 'Lodging',
  amenities: 'Amenities',
  activities: 'Activities',
  decor: 'Decoration',
};

/** Decor themes: three or more of one theme together look better; mixing them clashes. */
export type DecorTheme = 'hawaiian' | 'caribbean';
export const THEME_NAMES: Record<DecorTheme, string> = { hawaiian: 'Hawaiian', caribbean: 'Caribbean' };

export interface DecorDef {
  /** Appeal added at the item's own tile; it fades out to `radius` tiles away. */
  appeal: number;
  radius: number;
  theme?: DecorTheme;
  /** Beach items go on sand only. */
  sand?: boolean;
}

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
  /** Decor items (family 'decor'). */
  decor?: DecorDef;
  /** Which rating a guest's visit counts towards (default: by family). */
  rating?: RatingCategory;
}

/** Which resort rating a building feeds. */
export function ratingOf(kind: BuildingKind): RatingCategory {
  const d = BUILDINGS[kind];
  if (d.rating) return d.rating;
  return d.family === 'rooms' ? 'lodging' : d.family === 'decor' ? 'decor' : 'amenities';
}

function decor(kind: BuildingKind, name: string, cost: number, quality: Quality, blurb: string, def: DecorDef): BuildingDef {
  return { kind, name, family: 'decor', w: 1, h: 1, cost, upkeep: Math.max(1, Math.round(cost * 0.01)), blurb, quality, unlock: 0, decor: def };
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  basicRooms: {
    kind: 'basicRooms',
    name: 'Basic Rooms',
    family: 'rooms',
    w: 2,
    h: 2,
    cost: 1500,
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
    cost: 2800,
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
  researchOffice: {
    kind: 'researchOffice',
    name: 'Research Office',
    family: 'services',
    w: 2,
    h: 2,
    cost: 2500,
    upkeep: 30,
    blurb: '+4 research a night',
    quality: 1,
    unlock: 0,
  },
  // ---------- tier 2 ----------
  gardenBungalows: {
    kind: 'gardenBungalows',
    name: 'Garden Bungalows',
    family: 'rooms',
    w: 3,
    h: 2,
    cost: 4500,
    upkeep: 85,
    blurb: '2 premium rooms',
    quality: 3,
    unlock: 2,
  },
  italianRestaurant: restaurant('italianRestaurant', 'Italian Restaurant'),
  seafoodRestaurant: restaurant('seafoodRestaurant', 'Seafood Restaurant'),
  asianRestaurant: restaurant('asianRestaurant', 'Asian Restaurant'),
  gym: {
    kind: 'gym',
    name: 'Gym',
    family: 'fun',
    w: 2,
    h: 2,
    cost: 4000,
    upkeep: 50,
    blurb: 'Comfort · fun',
    quality: 2,
    unlock: 2,
  },
  spa: {
    kind: 'spa',
    name: 'Spa',
    family: 'fun',
    w: 3,
    h: 3,
    cost: 8000,
    upkeep: 100,
    blurb: 'Comfort · rest',
    quality: 3,
    unlock: 2,
  },
  boutique: {
    kind: 'boutique',
    name: 'Boutique',
    family: 'fun',
    w: 2,
    h: 2,
    cost: 5000,
    upkeep: 60,
    blurb: 'Premium shopping',
    quality: 3,
    unlock: 2,
  },
  diveShop: {
    kind: 'diveShop',
    name: 'Dive Shop',
    family: 'fun',
    w: 2,
    h: 2,
    cost: 6000,
    upkeep: 70,
    blurb: 'Dive trips · shore',
    quality: 3,
    unlock: 2,
    coast: true,
    rating: 'activities',
  },
  kidsClub: {
    kind: 'kidsClub',
    name: 'Kids’ Club',
    family: 'fun',
    w: 3,
    h: 2,
    cost: 4500,
    upkeep: 55,
    blurb: 'Families · per child',
    quality: 2,
    unlock: 2,
    noisy: true,
  },
  nightclub: {
    kind: 'nightclub',
    name: 'Nightclub',
    family: 'fun',
    w: 3,
    h: 3,
    cost: 9000,
    upkeep: 110,
    blurb: 'Party · loud at night',
    quality: 3,
    unlock: 3,
    noisy: true,
  },
  // ---------- tiers 3 and 4 (expansion) ----------
  suites: {
    kind: 'suites',
    name: 'Suites',
    family: 'rooms',
    w: 3,
    h: 3,
    cost: 9000,
    upkeep: 140,
    blurb: '2 luxury suites',
    quality: 4,
    unlock: 3,
  },
  fineDining: {
    kind: 'fineDining',
    name: 'Fine Dining',
    family: 'food',
    w: 3,
    h: 3,
    cost: 11000,
    upkeep: 140,
    blurb: 'Luxury meals',
    quality: 4,
    unlock: 3,
  },
  movieTheater: {
    kind: 'movieTheater',
    name: 'Movie Theater',
    family: 'fun',
    w: 3,
    h: 3,
    cost: 7000,
    upkeep: 90,
    blurb: 'Films · fun',
    quality: 2,
    unlock: 3,
  },
  conferenceHall: {
    kind: 'conferenceHall',
    name: 'Conference Hall',
    family: 'services',
    w: 4,
    h: 3,
    cost: 10000,
    upkeep: 120,
    blurb: 'Brings business guests',
    quality: 3,
    unlock: 3,
  },
  waterVillas: {
    kind: 'waterVillas',
    name: 'Water Villas',
    family: 'rooms',
    w: 2,
    h: 2,
    cost: 8000,
    upkeep: 120,
    blurb: '2 luxury villas · shore',
    quality: 4,
    unlock: 4,
    coast: true,
  },
  helipad: {
    kind: 'helipad',
    name: 'Helipad',
    family: 'services',
    w: 3,
    h: 3,
    cost: 12000,
    upkeep: 150,
    blurb: 'Brings VIPs',
    quality: 4,
    unlock: 4,
    noisy: true,
  },
  marina: {
    kind: 'marina',
    name: 'Marina',
    family: 'fun',
    w: 4,
    h: 2,
    cost: 12000,
    upkeep: 140,
    blurb: 'Yacht trips · shore',
    quality: 4,
    unlock: 4,
    coast: true,
    rating: 'activities',
  },
  trailHut: {
    kind: 'trailHut',
    name: 'Trail Hut',
    family: 'fun',
    w: 1,
    h: 1,
    cost: 1800,
    upkeep: 20,
    blurb: 'Guided jungle hikes · draw a trail',
    quality: 1,
    unlock: 0,
    rating: 'activities',
  },
  yogaDeck: {
    kind: 'yogaDeck',
    name: 'Yoga Deck',
    family: 'fun',
    w: 2,
    h: 2,
    cost: 2500,
    upkeep: 25,
    blurb: 'Classes · best with a view',
    quality: 2,
    unlock: 0,
    rating: 'activities',
  },
  kayakRental: {
    kind: 'kayakRental',
    name: 'Kayak Rental',
    family: 'fun',
    w: 1,
    h: 1,
    cost: 2200,
    upkeep: 25,
    blurb: 'Paddle tours · shore · draw a route',
    quality: 1,
    unlock: 1,
    coast: true,
    rating: 'activities',
  },
  excursionPier: {
    kind: 'excursionPier',
    name: 'Excursion Pier',
    family: 'fun',
    w: 1,
    h: 2,
    cost: 4000,
    upkeep: 45,
    blurb: 'Boat tours to sea life · shore · draw a route',
    quality: 2,
    unlock: 1,
    coast: true,
    rating: 'activities',
  },
  palmTree: decor('palmTree', 'Palm Tree', 150, 1, 'Shade and a postcard look', { appeal: 6, radius: 2 }),
  bench: decor('bench', 'Bench', 100, 1, 'A place to sit by the path', { appeal: 3, radius: 1 }),
  lampPost: decor('lampPost', 'Lamp Post', 180, 1, 'Warm light along the paths', { appeal: 4, radius: 2 }),
  beachChairs: decor('beachChairs', 'Beach Chairs', 250, 2, 'Loungers and an umbrella · sand', { appeal: 7, radius: 2, sand: true }),
  flowerBed: decor('flowerBed', 'Hibiscus Bed', 120, 1, 'Bright flowers · Hawaiian', { appeal: 5, radius: 2, theme: 'hawaiian' }),
  tikiTorch: decor('tikiTorch', 'Tiki Torch', 160, 1, 'Flames at dusk · Hawaiian', { appeal: 5, radius: 2, theme: 'hawaiian' }),
  surfboardRack: decor('surfboardRack', 'Surfboard Rack', 350, 2, 'Boards in the sand · Hawaiian · sand', { appeal: 8, radius: 2, theme: 'hawaiian', sand: true }),
  tikiTotem: decor('tikiTotem', 'Tiki Totem', 600, 3, 'A carved landmark · Hawaiian', { appeal: 13, radius: 3, theme: 'hawaiian' }),
  hammocks: decor('hammocks', 'Hammocks', 300, 2, 'Swing between palms · Caribbean', { appeal: 7, radius: 2, theme: 'caribbean' }),
  bunting: decor('bunting', 'Bunting', 200, 1, 'Strings of colour · Caribbean', { appeal: 5, radius: 2, theme: 'caribbean' }),
  welcomeArch: decor('welcomeArch', 'Welcome Arch', 700, 3, 'A painted gateway · Caribbean', { appeal: 14, radius: 3, theme: 'caribbean' }),
};

/** GDD: "Restaurant (themed: Italian, Seafood, Asian)", moved to tier 2 in Pass 1. */
function restaurant(kind: BuildingKind, name: string): BuildingDef {
  return {
    kind,
    name,
    family: 'food',
    w: 3,
    h: 3,
    cost: 7000,
    upkeep: 90,
    blurb: 'Premium meals',
    quality: 3,
    unlock: 2,
    noisy: true,
  };
}

export const BUILDING_KINDS = Object.keys(BUILDINGS) as BuildingKind[];

export const PATH_COST = 10;

// ---------- floors (Pass 1) ----------

/** Rooms per floor of a room building (GDD "Basic Rooms (2 per floor)"). */
export const ROOMS_PER_FLOOR = 2;
/** An extra floor costs this share of the building's price. */
export const FLOOR_COST_SHARE = 0.6;
/** Floors allowed before research, and after Tall Buildings (GDD: 3 early on, 6 after research). */
export const MAX_FLOORS_EARLY = 3;
export const MAX_FLOORS_RESEARCHED = 6;
/** Above this many floors, guests need an Elevator (GDD). */
export const ELEVATOR_ABOVE = 3;
export const ELEVATOR_COST = 2000;

export function floorCost(kind: BuildingKind): number {
  return Math.round((BUILDINGS[kind].cost * FLOOR_COST_SHARE) / 50) * 50;
}

/** Demolishing refunds this share of the build cost (GDD: 50%). */
export const DEMOLISH_REFUND = 0.5;

export const START_MONEY = 13000;

export type Rotation = 0 | 1 | 2 | 3;

/** Footprint after rotation: odd rotations swap width and height. */
export function footprint(kind: BuildingKind, rot: Rotation): { w: number; h: number } {
  const d = BUILDINGS[kind];
  return rot % 2 === 0 ? { w: d.w, h: d.h } : { w: d.h, h: d.w };
}
