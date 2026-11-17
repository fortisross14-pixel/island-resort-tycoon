import { ISLANDS, islandDef, type IslandDef } from '../sim/islands';
import { FIRST_XP, REPEAT_XP, type Profile } from '../sim/profile';
import { BRANCHES, GATE_COUNT } from '../sim/research';
import { MEDALS, MEDAL_NAMES, SCENARIOS, type ScenarioDef } from '../sim/scenario';
import { duration } from '../sim/calendar';
import type { NewGameChoice } from './goals';

const MEDAL_ICON = { bronze: '🥉', silver: '🥈', gold: '🥇' } as const;

/** Islands still to come (Pass 4 step 5), shown as silhouettes on the map. */
const SOON = [
  { name: 'Old Harbour', x: 13, y: 20 },
  { name: 'Far Sands', x: 87, y: 72 },
  { name: 'Emerald Reef', x: 86, y: 20 },
];
/** Where each island sits on the archipelago map (percent of the map). */
const PLACES: Record<string, { x: number; y: number; w: number }> = {
  coconutKey: { x: 20, y: 64, w: 26 },
  twinPalms: { x: 52, y: 46, w: 34 },
};

const TERRAIN_COLORS: Record<string, string> = {
  '~': 'rgba(0,0,0,0)',
  '-': '#7fdcdc',
  '*': '#69cfc6',
  o: '#8fe6dc',
  s: '#f2deaa',
  g: '#9fd36f',
  j: '#4f9a45',
  k: '#a39e8f',
};

/** A little top-down picture of an island, drawn from its terrain map. */
function minimap(def: IslandDef): string {
  const n = def.terrain.length;
  const px = 4;
  const c = document.createElement('canvas');
  c.width = c.height = n * px;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const t = def.terrain[y][x];
      ctx.fillStyle = TERRAIN_COLORS[t] ?? '#000';
      const h = def.heights[y][x] === '.' ? 0 : Number(def.heights[y][x]);
      ctx.fillRect(x * px, y * px, px, px);
      if (h > 0 && t !== 'j') {
        ctx.fillStyle = `rgba(0,0,0,${0.08 * h})`;
        ctx.fillRect(x * px, y * px, px, px);
      }
    }
  return c.toDataURL();
}

function goalsHtml(def: ScenarioDef): string {
  return MEDALS.map(
    (t) => `<li><span>${MEDAL_ICON[t]}</span><span>${def.medals[t].map((g) => g.label).join(' · ')}</span></li>`,
  ).join('');
}

export interface HomeHandlers {
  onPlay(choice: NewGameChoice): void;
  onContinue(): void;
  onBuy(nodeId: string): void;
}

/**
 * The home screen (Pass 4 step 4): the archipelago with its missions laid out as a roadmap,
 * the player's experience, and the research that applies to every resort.
 */
export class HomeScreen {
  private el: HTMLElement;
  private view: 'islands' | 'research' = 'islands';
  private island = ISLANDS[0].id;
  private canContinue = false;
  private maps = new Map<string, string>();

  constructor(
    root: HTMLElement,
    private profile: Profile,
    private h: HomeHandlers,
    private current: () => { name: string; when: string } | null,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'home';
    this.el.hidden = true;
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const v = t.closest<HTMLElement>('[data-view]');
      if (v) {
        this.view = v.dataset.view as 'islands' | 'research';
        return this.render();
      }
      const isl = t.closest<HTMLElement>('[data-island]');
      if (isl) {
        this.island = isl.dataset.island!;
        return this.render();
      }
      const play = t.closest<HTMLElement>('[data-play-mission]');
      if (play) {
        const guide = this.el.querySelector<HTMLInputElement>('[data-tutorial]');
        this.hide();
        return this.h.onPlay({ scenario: play.dataset.playMission!, tutorial: !!guide?.checked });
      }
      if (t.closest('[data-sandbox]')) {
        this.hide();
        return this.h.onPlay({ sandbox: true });
      }
      if (t.closest('[data-continue]')) {
        this.hide();
        return this.h.onContinue();
      }
      const buy = t.closest<HTMLElement>('[data-buy]');
      if (buy) {
        this.h.onBuy(buy.dataset.buy!);
        return this.render();
      }
    });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  /** Same shape as the old New Game dialog: `canContinue` offers a way back to the resort. */
  show(canContinue: boolean, guide = false, view: 'islands' | 'research' = 'islands'): void {
    this.canContinue = canContinue;
    this.view = view;
    this.guide = guide;
    this.render();
    this.el.hidden = false;
  }

  private guide = false;

  /** Esc: back to the resort, if there is one. */
  cancel(): boolean {
    if (this.el.hidden || !this.canContinue) return false;
    this.hide();
    this.h.onContinue();
    return true;
  }

  hide(): void {
    this.el.hidden = true;
  }

  refresh(): void {
    if (!this.el.hidden) this.render();
  }

  private render(): void {
    const p = this.profile;
    const cur = this.canContinue ? this.current() : null;
    const head = `<header class="home-head">
        <div><small>Island Resort Tycoon</small><h1>The Archipelago</h1></div>
        <div class="xp" title="Experience: spend it on research">⭐ <b>${p.xp}</b> XP</div>
      </header>
      <nav class="home-tabs" role="tablist">
        <button role="tab" data-view="islands" class="${this.view === 'islands' ? 'on' : ''}">Islands</button>
        <button role="tab" data-view="research" class="${this.view === 'research' ? 'on' : ''}">Research</button>
      </nav>
      ${cur ? `<button class="continue" data-continue>▸ Continue <b>${cur.name}</b> <span>${cur.when}</span></button>` : ''}`;
    this.el.innerHTML = `<div class="home-inner">${head}${this.view === 'islands' ? this.islandsHtml() : this.researchHtml()}</div>`;
  }

  private islandsHtml(): string {
    const p = this.profile;
    const isles = ISLANDS.map((d) => {
      const at = PLACES[d.id] ?? { x: 50, y: 50, w: 28 };
      if (!this.maps.has(d.id)) this.maps.set(d.id, minimap(d));
      const missions = SCENARIOS.filter((s) => s.island === d.id);
      const medals = missions.map((m) => p.best(m.id)).filter(Boolean).length;
      const open = missions.some((m) => p.missionState(m).open);
      return `<button class="isle ${this.island === d.id ? 'on' : ''} ${open ? '' : 'locked'}" data-island="${d.id}" style="left:${at.x}%;top:${at.y}%;width:${at.w}%">
        <img src="${this.maps.get(d.id)}" alt="" />
        <span><b>${d.name}</b> ${medals}/${missions.length} 🏅</span>
      </button>`;
    }).join('');
    const soon = SOON.map((s) => `<div class="isle soon" style="left:${s.x}%;top:${s.y}%"><span>${s.name}<small>coming soon</small></span></div>`).join('');
    const def = islandDef(this.island);
    const missions = SCENARIOS.filter((s) => s.island === def.id)
      .map((m) => {
        const st = p.missionState(m);
        const won = MEDALS.map((t) => `<span class="m ${p.hasMedal(m.id, t) ? 'won' : ''}" title="${MEDAL_NAMES[t]}: ${p.hasMedal(m.id, t) ? `${REPEAT_XP[t]} XP again` : `${FIRST_XP[t]} XP the first time`}">${MEDAL_ICON[t]}</span>`).join('');
        return `<article class="mission ${st.open ? '' : 'locked'}">
          <header><b>${m.name}</b><span class="medals">${won}</span></header>
          <p>${m.blurb}</p>
          <ul class="goals">${goalsHtml(m)}</ul>
          <footer><small>${duration(m.days)} · ${m.startMoney.toLocaleString('en-US')} coins</small>${
            st.open ? `<button class="go" data-play-mission="${m.id}">Play</button>` : `<span class="lock">🔒 ${st.reason}</span>`
          }</footer>
        </article>`;
      })
      .join('');
    const sandbox = p.sandboxOpen
      ? `<article class="mission sandbox"><header><b>Sandbox</b></header><p>Every building unlocked, 50,000 coins, no goals, on Twin Palms.</p><footer><span></span><button class="go" data-sandbox>Play</button></footer></article>`
      : `<article class="mission sandbox locked"><header><b>Sandbox</b></header><p>Every building, no goals.</p><footer><span class="lock">🔒 Bronze on two missions</span></footer></article>`;
    return `<div class="sea-map">${soon}${isles}</div>
      <section class="island-card">
        <h2>${def.name} <small>${def.scale} island</small></h2>
        <p class="muted">${def.blurb}</p>
        <label class="guide"><input type="checkbox" data-tutorial ${this.guide ? 'checked' : ''} /> Guide me through the first day</label>
        <div class="missions">${missions}${def.id === 'twinPalms' ? sandbox : ''}</div>
      </section>`;
  }

  private researchHtml(): string {
    const nodes = this.profile.nodes;
    const tiers = [...new Set(nodes.map((n) => n.node.tier))].sort((a, b) => a - b);
    const cols = tiers
      .map((tier) => {
        const inTier = nodes.filter((n) => n.node.tier === tier).sort((a, b) => a.node.branch.localeCompare(b.node.branch));
        const done = inTier.filter((n) => n.status.state === 'done').length;
        const cards = inTier
          .map(({ node, status }) => {
            const foot =
              status.state === 'done'
                ? '<span class="state done">✓ Done</span>'
                : status.state === 'available'
                  ? `<button class="state go" data-buy="${node.id}">${node.cost} XP</button>`
                  : `<span class="state">${status.reason.replace(' points', ' XP')}</span>`;
            return `<div class="topic ${status.state} b-${node.branch}" title="${BRANCHES[node.branch]}"><b>${node.name}</b><small>${node.blurb}</small>${foot}</div>`;
          })
          .join('');
        return `<section class="tier"><h3>Tier ${tier} <small>${done}/${inTier.length}${tier < tiers[tiers.length - 1] ? ` · ${GATE_COUNT} open tier ${tier + 1}` : ''}</small></h3><div class="topics">${cards}</div></section>`;
      })
      .join('');
    return `<p class="muted research-note">Research applies to every resort. Earn XP with medals: the first bronze, silver and gold on each mission pay the most.</p><div class="research-tree">${cols}</div>`;
  }
}
