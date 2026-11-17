import { NODES, Research, type NodeStatus, type ResearchNode } from './research';
import { MEDALS, MEDAL_POINTS, SCENARIOS, type MedalTier, type ScenarioDef } from './scenario';
import { ARCHIPELAGOS, archipelagoOf, pointsToOpen } from './archipelago';

/**
 * The player's profile (Pass 4 step 4): what carries over between missions. Experience comes
 * from medals: the first bronze, silver and gold on each mission pay well, repeats pay a
 * little. Experience buys research on the home screen, and research applies to every resort.
 * Missions open like a roadmap: a few from the start, more as medals come in.
 */

/** Experience for a medal the first time it's won on a mission, and on later wins. */
export const FIRST_XP: Record<MedalTier, number> = { bronze: 30, silver: 50, gold: 80 };
export const REPEAT_XP: Record<MedalTier, number> = { bronze: 5, silver: 8, gold: 12 };
/** Finishing a mission pays a little for the final rating (2 per tenth of a star above 2). */
export const FINISH_XP_PER_STAR = 20;
/** The sandbox opens once every mission on the first island has a medal. */
export const SANDBOX_ISLAND_DONE = 'coconutKey';

export interface ProfileData {
  version: 1;
  /** Unspent experience (the research currency). */
  xp: number;
  /** Experience ever earned, for the home screen. */
  earned: number;
  research: string[];
  /** Best medal tiers ever won per mission. */
  medals: Record<string, MedalTier[]>;
  /** Times each mission was finished. */
  finished: Record<string, number>;
}

export function emptyProfile(): ProfileData {
  return { version: 1, xp: 0, earned: 0, research: [], medals: {}, finished: {} };
}

export type MissionState = { open: true } | { open: false; reason: string };

export class Profile {
  /** Shared by every resort: its points are the experience. */
  readonly research = new Research();
  earned = 0;
  medals: Record<string, MedalTier[]> = {};
  finished: Record<string, number> = {};

  constructor(data: ProfileData = emptyProfile()) {
    this.load(data);
  }

  get xp(): number {
    return this.research.points;
  }

  load(d: ProfileData): void {
    this.research.restore({ points: d.xp, done: d.research });
    this.earned = d.earned;
    this.medals = structuredClone(d.medals);
    this.finished = { ...d.finished };
  }

  data(): ProfileData {
    return {
      version: 1,
      xp: this.research.points,
      earned: this.earned,
      research: [...this.research.done],
      medals: structuredClone(this.medals),
      finished: { ...this.finished },
    };
  }

  private addXp(n: number): void {
    this.research.points += n;
    this.earned += n;
  }

  hasMedal(mission: string, tier: MedalTier): boolean {
    return this.medals[mission]?.includes(tier) ?? false;
  }

  /** Best medal ever won on a mission. */
  best(mission: string): MedalTier | null {
    const won = this.medals[mission] ?? [];
    for (const t of [...MEDALS].reverse()) if (won.includes(t)) return t;
    return null;
  }

  /** Record a medal; returns the experience it paid and whether it was a first. */
  awardMedal(mission: string, tier: MedalTier): { xp: number; first: boolean } {
    const first = !this.hasMedal(mission, tier);
    const xp = first ? FIRST_XP[tier] : REPEAT_XP[tier];
    if (first) (this.medals[mission] ??= []).push(tier);
    this.addXp(xp);
    return { xp, first };
  }

  /** A mission ran its course: a little experience for the final rating. */
  finishMission(mission: string, rating: number): number {
    this.finished[mission] = (this.finished[mission] ?? 0) + 1;
    const xp = Math.max(0, Math.round((rating - 2) * FINISH_XP_PER_STAR));
    this.addXp(xp);
    return xp;
  }

  /** Points in an archipelago: the best medal on each of its missions. */
  points(archipelago: string): number {
    const a = ARCHIPELAGOS.find((x) => x.id === archipelago);
    if (!a) return 0;
    const isles = new Set(a.islands.map((i) => i.island));
    return SCENARIOS.filter((s) => isles.has(s.island)).reduce((n, s) => {
      const b = this.best(s.id);
      return n + (b ? MEDAL_POINTS[b] : 0);
    }, 0);
  }

  /** An island opens at a points total in its archipelago. */
  islandOpen(island: string): boolean {
    const a = archipelagoOf(island);
    return !a || this.points(a.id) >= pointsToOpen(island);
  }

  /** A mission is open when its island is, and its research is done. */
  missionState(def: ScenarioDef): MissionState {
    const a = archipelagoOf(def.island);
    if (a && !this.islandOpen(def.island)) {
      const need = pointsToOpen(def.island);
      return { open: false, reason: `${need} points in ${a.name} (you have ${this.points(a.id)})` };
    }
    const missing = (def.needsResearch ?? []).filter((id) => !this.research.done.has(id));
    if (missing.length) {
      const names = missing.map((id) => NODES.find((n) => n.id === id)?.name ?? id);
      return { open: false, reason: `Research ${names.join(' and ')} first` };
    }
    return { open: true };
  }

  /** True if the best medal won on a mission is this tier or better. */
  medalAtLeast(mission: string, tier: MedalTier): boolean {
    const best = this.best(mission);
    return best !== null && MEDALS.indexOf(best) >= MEDALS.indexOf(tier);
  }

  get sandboxOpen(): boolean {
    return SCENARIOS.filter((s) => s.island === SANDBOX_ISLAND_DONE).every((s) => this.best(s.id) !== null);
  }

  /** Research on the home screen: tier gates still apply; resort ratings don't. */
  researchStatus(node: ResearchNode): NodeStatus {
    return this.research.status(node, 5);
  }

  buy(id: string): { ok: true } | { ok: false; reason: string } {
    return this.research.research(id, 5);
  }

  get nodes(): Array<{ node: ResearchNode; status: NodeStatus }> {
    return NODES.map((node) => ({ node, status: this.researchStatus(node) }));
  }
}
