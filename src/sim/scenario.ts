import { BUILDINGS, type BuildingKind } from './buildings';
import { VENUES } from './needs';
import { Rng } from './rng';
import type { NightReport, Sim, SimEvent } from './sim';

/**
 * Scenarios, medals and daily objectives (Pass 1). GDD: "Each scenario has 3 medal
 * tiers (bronze, silver, gold), so casual players can finish and invested players can
 * master it" and "A small set of 3 active objectives … pays out coins or research
 * points. They give short sessions a clear target."
 */

export type Metric = 'served' | 'rating' | 'profit7' | 'research' | 'plots' | 'families' | 'building';

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
  startMoney: number;
  /** Days to earn medals in; after that the best medal so far is final. */
  days: number;
  medals: Record<MedalTier, Goal[]>;
  /** Multiplies how often each guest type arrives. */
  guestBias?: Partial<Record<string, number>>;
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'driftwood',
    name: 'Driftwood Beginnings',
    blurb: 'A quiet sandbar and a ferry full of curious travellers. Build rooms, feed people, and earn your first stars.',
    startMoney: 13000,
    days: 30,
    medals: {
      bronze: [
        { metric: 'served', target: 30, label: 'Serve 30 guests' },
        { metric: 'rating', target: 2.8, label: 'Reach a ★2.8 rating' },
      ],
      silver: [
        { metric: 'served', target: 120, label: 'Serve 120 guests' },
        { metric: 'rating', target: 3.5, label: 'Reach a ★3.5 rating' },
        { metric: 'research', target: 6, label: 'Research 6 topics' },
      ],
      gold: [
        { metric: 'served', target: 350, label: 'Serve 350 guests' },
        { metric: 'rating', target: 4.2, label: 'Reach a ★4.2 rating' },
        { metric: 'profit7', target: 40000, label: 'Make 40,000 profit over 7 months' },
        { metric: 'plots', target: 3, label: 'Buy 3 plots of land' },
      ],
    },
  },
  {
    id: 'familyCove',
    name: 'Family Cove',
    blurb: 'A calm bay where families come back year after year. Keep the kids busy and the walks short.',
    startMoney: 15000,
    days: 30,
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
];

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
    }
  }

  goalMet(g: Goal): boolean {
    if (g.metric === 'building') return this.sim.world.buildings.some((b) => b.kind === g.building);
    return this.metric(g.metric) >= g.target;
  }

  /** Progress shown for a goal (buildings count as 0 or 1). */
  progress(g: Goal): number {
    return g.metric === 'building' ? (this.goalMet(g) ? 1 : 0) : this.metric(g.metric);
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
      if (this.state.medals[t] !== undefined) continue;
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
        this.bump('checkins', 1);
        break;
      }
      case 'purchase': {
        const b = this.sim.world.buildings.find((x) => x.id === e.buildingId);
        if (b) this.bump('sales', 1, b.kind);
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
    const reward = this.rng.next() < 0.6 ? { coins } : { research };
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
