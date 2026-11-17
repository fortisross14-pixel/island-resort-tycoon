import { NODES, Research, type NodeStatus, type ResearchNode } from './research';
import { MEDALS, SCENARIOS, type MedalTier, type ScenarioDef } from './scenario';

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
/** Bronze on this many different missions opens the sandbox. */
export const SANDBOX_AFTER = 2;

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

  /** Missions open like a roadmap: open from the start, or after any one listed medal. */
  missionState(def: ScenarioDef): MissionState {
    const req = def.requires ?? [];
    if (!req.length || req.some((r) => this.medalAtLeast(r.mission, r.medal))) return { open: true };
    const r = req[0];
    const other = SCENARIOS.find((s) => s.id === r.mission);
    return { open: false, reason: `${cap(r.medal)} on ${other?.name ?? r.mission}` };
  }

  /** True if the best medal won on a mission is this tier or better. */
  medalAtLeast(mission: string, tier: MedalTier): boolean {
    const best = this.best(mission);
    return best !== null && MEDALS.indexOf(best) >= MEDALS.indexOf(tier);
  }

  get sandboxOpen(): boolean {
    return Object.values(this.medals).filter((m) => m.length > 0).length >= SANDBOX_AFTER;
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

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
