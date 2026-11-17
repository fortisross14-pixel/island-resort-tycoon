import { BUILDINGS, BUILDING_KINDS, type BuildingKind } from './buildings';

/**
 * Research (Pass 1). GDD: "Research Points come from guest reviews (each star = 1 point)
 * and from a Research Office … Four branches: Hospitality, Dining, Leisure and
 * Operations … with gates: a Tier 3 node needs 2 Tier 2 nodes from any branch."
 *
 * Here a node is bought outright with points. Tier 2+ needs two nodes of the tier below
 * (any branch), and premium/luxury nodes also need a star rating, so luxury can't be
 * rushed before the service is good.
 */

export type Branch = 'hospitality' | 'dining' | 'leisure' | 'operations';

export const BRANCHES: Record<Branch, string> = {
  hospitality: 'Hospitality',
  dining: 'Dining',
  leisure: 'Leisure',
  operations: 'Operations',
};

export interface ResearchNode {
  id: string;
  name: string;
  branch: Branch;
  tier: number;
  cost: number;
  unlocks: BuildingKind[];
  /** Star rating needed before it can be researched. */
  minStars?: number;
  blurb: string;
}

export const NODES: ResearchNode[] = [
  // Tier 1
  { id: 'standardRooms', name: 'Standard Rooms', branch: 'hospitality', tier: 1, cost: 6, unlocks: ['standardRooms'], blurb: 'Mid-class rooms that couples expect' },
  { id: 'frontDesk', name: 'Front Desk', branch: 'operations', tier: 1, cost: 5, unlocks: ['frontDesk'], blurb: 'Auto-assign and longer patience' },
  { id: 'beachBar', name: 'Beach Bar', branch: 'dining', tier: 1, cost: 5, unlocks: ['beachBar'], blurb: 'Drinks on the shore' },
  { id: 'pool', name: 'Pool', branch: 'leisure', tier: 1, cost: 7, unlocks: ['pool'], blurb: 'Free fun and comfort' },
  { id: 'giftShop', name: 'Gift Shop', branch: 'leisure', tier: 1, cost: 4, unlocks: ['giftShop'], blurb: 'Souvenirs for every budget' },
  // Tier 2
  { id: 'gardenBungalows', name: 'Garden Bungalows', branch: 'hospitality', tier: 2, cost: 15, unlocks: ['gardenBungalows'], minStars: 3, blurb: 'Premium rooms in a quiet garden' },
  { id: 'restaurants', name: 'Themed Restaurants', branch: 'dining', tier: 2, cost: 15, unlocks: ['italianRestaurant', 'seafoodRestaurant', 'asianRestaurant'], minStars: 3, blurb: 'Italian, Seafood and Asian' },
  { id: 'gym', name: 'Gym', branch: 'leisure', tier: 2, cost: 10, unlocks: ['gym'], blurb: 'Comfort and a little fun' },
  { id: 'spa', name: 'Spa', branch: 'leisure', tier: 2, cost: 16, unlocks: ['spa'], minStars: 3, blurb: 'Premium comfort and rest' },
  { id: 'boutique', name: 'Boutique', branch: 'leisure', tier: 2, cost: 12, unlocks: ['boutique'], minStars: 3, blurb: 'Premium shopping' },
  { id: 'diveShop', name: 'Dive Shop', branch: 'operations', tier: 2, cost: 14, unlocks: ['diveShop'], minStars: 3, blurb: 'Dive trips from the shore' },
];

/** Nodes of the tier below needed before a node of tier ≥ 2. */
export const GATE_COUNT = 2;
/** Points a Research Office adds each night. */
export const OFFICE_POINTS = 4;

export type NodeStatus =
  | { state: 'done' }
  | { state: 'available' }
  | { state: 'locked'; reason: string };

export interface ResearchState {
  points: number;
  done: string[];
}

export function nodeFor(kind: BuildingKind): ResearchNode | undefined {
  return NODES.find((n) => n.unlocks.includes(kind));
}

export class Research {
  points = 0;
  done = new Set<string>();

  status(node: ResearchNode, stars: number): NodeStatus {
    if (this.done.has(node.id)) return { state: 'done' };
    if (node.tier >= 2) {
      const below = NODES.filter((n) => n.tier === node.tier - 1 && this.done.has(n.id)).length;
      if (below < GATE_COUNT) return { state: 'locked', reason: `Needs ${GATE_COUNT} tier ${node.tier - 1} topics (${below}/${GATE_COUNT})` };
    }
    if (node.minStars && stars < node.minStars) return { state: 'locked', reason: `Needs a ★${node.minStars} rating` };
    if (this.points < node.cost) return { state: 'locked', reason: `Needs ${node.cost} points` };
    return { state: 'available' };
  }

  research(id: string, stars: number): { ok: true } | { ok: false; reason: string } {
    const node = NODES.find((n) => n.id === id);
    if (!node) return { ok: false, reason: 'Unknown research' };
    const s = this.status(node, stars);
    if (s.state === 'done') return { ok: false, reason: 'Already researched' };
    if (s.state === 'locked') return { ok: false, reason: s.reason };
    this.points -= node.cost;
    this.done.add(node.id);
    return { ok: true };
  }

  /** True if a building can be built: it starts unlocked or its research is done. */
  isUnlocked(kind: BuildingKind): boolean {
    if (BUILDINGS[kind].unlock === 0) return true;
    const node = nodeFor(kind);
    return !!node && this.done.has(node.id);
  }

  /** Everything at once (sandbox, tests). */
  unlockAll(): void {
    for (const n of NODES) this.done.add(n.id);
  }

  snapshot(): ResearchState {
    return { points: this.points, done: [...this.done] };
  }

  restore(s: ResearchState): void {
    this.points = s.points;
    this.done = new Set(s.done);
  }
}

/** Buildings that research can unlock, for checks that every one has a node. */
export const RESEARCHABLE = BUILDING_KINDS.filter((k) => BUILDINGS[k].unlock > 0);
