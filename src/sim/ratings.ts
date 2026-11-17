import { BUILDINGS, RATING_CATEGORIES, type DecorTheme, type RatingCategory } from './buildings';
import { conditionOf, type World } from './world';

/**
 * The four resort ratings (Pass 4): Lodging, Amenities, Activities and Decoration, plus an
 * Overall that weighs them by who is staying. Each guest keeps a score per category during
 * their stay; their review gives one star value per category and an overall made from the
 * weights of their guest type.
 */

/** Running scores a guest collects (sum and count per category). */
export interface CategoryScores {
  sum: Record<RatingCategory, number>;
  n: Record<RatingCategory, number>;
}

export function emptyScores(): CategoryScores {
  return { sum: { lodging: 0, amenities: 0, activities: 0, decor: 0 }, n: { lodging: 0, amenities: 0, activities: 0, decor: 0 } };
}

export function addScore(s: CategoryScores, cat: RatingCategory, value: number): void {
  s.sum[cat] += Math.max(0, Math.min(100, value));
  s.n[cat]++;
}

/**
 * A guest's score in a category (0–100). With nothing to judge, they fall back on a middling
 * opinion; for activities, nothing to do is itself a poor mark.
 */
export const FALLBACK: Record<RatingCategory, number> = { lodging: 50, amenities: 40, activities: 38, decor: 40 };

export function scoreOf(s: CategoryScores, cat: RatingCategory): number {
  return s.n[cat] ? s.sum[cat] / s.n[cat] : FALLBACK[cat];
}

/** How much each guest type cares about each rating (each row sums to 1). */
export const WEIGHTS: Record<string, Record<RatingCategory, number>> = {
  backpacker: { lodging: 0.25, amenities: 0.3, activities: 0.3, decor: 0.15 },
  couple: { lodging: 0.35, amenities: 0.3, activities: 0.15, decor: 0.2 },
  family: { lodging: 0.3, amenities: 0.3, activities: 0.25, decor: 0.15 },
  wellness: { lodging: 0.3, amenities: 0.4, activities: 0.15, decor: 0.15 },
  party: { lodging: 0.2, amenities: 0.45, activities: 0.2, decor: 0.15 },
  vip: { lodging: 0.45, amenities: 0.3, activities: 0.1, decor: 0.15 },
  business: { lodging: 0.5, amenities: 0.35, activities: 0.05, decor: 0.1 },
};
const DEFAULT_WEIGHTS: Record<RatingCategory, number> = { lodging: 0.35, amenities: 0.35, activities: 0.15, decor: 0.15 };

export function weightsFor(type: string): Record<RatingCategory, number> {
  return WEIGHTS[type] ?? DEFAULT_WEIGHTS;
}

/** The overall score a guest gives (0–100): their categories, weighted by what they care about. */
export function overallScore(type: string, s: CategoryScores): number {
  const w = weightsFor(type);
  return RATING_CATEGORIES.reduce((sum, c) => sum + w[c] * scoreOf(s, c), 0);
}

// ---------- decoration appeal ----------

/** Appeal of bare land, and the bonus for a sea view or lush jungle nearby. */
const NATURE = 40;
const SEA_VIEW = 10;
const LUSH = 4;
const THEME_BONUS = 1.25;
const THEME_CLASH = 0.85;
/** More decor than this in a 3×3 square starts to look cluttered. */
const CLUTTER_AT = 4;

/**
 * Decoration appeal per tile (0–100), cached until the map changes. Decor adds appeal that
 * fades with distance and with wear; three of one theme together look better, two themes
 * side by side clash; too much in one spot is clutter; run-down buildings nearby look shabby.
 */
export class AppealMap {
  private field: Float32Array | null = null;

  constructor(private world: World) {
    world.onChange(() => (this.field = null));
  }

  /** Call after condition changes (monthly wear), which don't fire a map change. */
  invalidate(): void {
    this.field = null;
  }

  at(x: number, y: number): number {
    const w = this.world;
    if (!w.inBounds(x, y)) return 0;
    if (!this.field) this.field = this.compute();
    return this.field[y * w.size + x];
  }

  private compute(): Float32Array {
    const w = this.world;
    const n = w.size;
    const decor = new Float32Array(n * n);
    const themes: Record<DecorTheme, Float32Array> = { hawaiian: new Float32Array(n * n), caribbean: new Float32Array(n * n) };
    const count = new Uint8Array(n * n);
    const shabby = new Float32Array(n * n);
    for (const b of w.buildings) {
      const def = BUILDINGS[b.kind];
      const cond = conditionOf(b);
      if (def.decor) {
        const { appeal, radius, theme } = def.decor;
        for (let dy = -radius; dy <= radius; dy++)
          for (let dx = -radius; dx <= radius; dx++) {
            const x = b.x + dx;
            const y = b.y + dy;
            if (!w.inBounds(x, y)) continue;
            const d = Math.hypot(dx, dy);
            if (d > radius + 0.5) continue;
            const i = y * n + x;
            decor[i] += appeal * (cond / 100) * (1 - d / (radius + 1));
            if (theme && d <= 3) themes[theme][i]++;
            if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) count[i]++;
          }
      } else if (cond < 50) {
        // Peeling paint and broken shutters put people off nearby.
        const fp = w.footprintTiles(b.kind, b.x, b.y, b.rot);
        for (const t of fp)
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++) {
              const x = t.x + dx;
              const y = t.y + dy;
              if (w.inBounds(x, y)) shabby[y * n + x] = Math.max(shabby[y * n + x], (50 - cond) * 0.5);
            }
      }
    }
    const out = new Float32Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        let v = NATURE;
        if (this.nearWater(x, y)) v += SEA_VIEW;
        if (this.nearJungle(x, y)) v += LUSH;
        let d = decor[i];
        const h = themes.hawaiian[i];
        const c = themes.caribbean[i];
        if ((h >= 3 && c === 0) || (c >= 3 && h === 0)) d *= THEME_BONUS;
        else if (h >= 2 && c >= 2) d *= THEME_CLASH;
        v += d;
        if (count[i] > CLUTTER_AT) v -= (count[i] - CLUTTER_AT) * 5;
        v -= shabby[i];
        out[i] = Math.max(0, Math.min(100, v));
      }
    return out;
  }

  private nearWater(x: number, y: number): boolean {
    const w = this.world;
    if (!w.layout.terrain) return !w.isLand(x, y) || [-2, 2].some((d) => !w.isLand(x + d, y) || !w.isLand(x, y + d));
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (w.isWater(x + dx, y + dy)) return true;
    return false;
  }

  private nearJungle(x: number, y: number): boolean {
    const w = this.world;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.terrainAt(x + dx, y + dy) === 'j') return true;
    return false;
  }
}

// ---------- maintenance ----------

export type MaintenanceLevel = 'low' | 'normal' | 'high';
export const MAINTENANCE_LEVELS: MaintenanceLevel[] = ['low', 'normal', 'high'];
export const MAINTENANCE_NAMES: Record<MaintenanceLevel, string> = { low: 'Low', normal: 'Normal', high: 'High' };
/** Change to the monthly upkeep bill: normal is what upkeep already covers. */
export const MAINTENANCE_COST: Record<MaintenanceLevel, number> = { low: -0.3, normal: 0, high: 0.6 };
/** How fast things wear at each level. */
export const MAINTENANCE_WEAR: Record<MaintenanceLevel, number> = { low: 1.8, normal: 1, high: 0.35 };

/** Condition lost in a month at normal maintenance, before use. */
// About 100 → 70 over two years of normal use: repairs every few years, not every season.
export const BASE_WEAR: Record<string, number> = { rooms: 1.1, food: 0.9, fun: 0.9, services: 0.7, decor: 0.8 };

/** A building's condition costs it this many points of its rating category's score. */
export function wearPenalty(condition: number): number {
  return (100 - condition) * 0.3;
}
