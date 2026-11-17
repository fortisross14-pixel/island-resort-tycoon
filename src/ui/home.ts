import { ISLANDS, islandDef, type IslandDef } from '../sim/islands';
import { FIRST_XP, REPEAT_XP, type Profile } from '../sim/profile';
import { BRANCHES, GATE_COUNT, NODES } from '../sim/research';
import { ARCHIPELAGOS, pointsToOpen } from '../sim/archipelago';
import { BUILDINGS } from '../sim/buildings';
import { MEDALS, MEDAL_NAMES, SCENARIOS } from '../sim/scenario';
import { duration } from '../sim/calendar';
import type { NewGameChoice } from './goals';
import { INSTALL_STEPS, installWay, onInstallChange, promptInstall } from './install';

const MEDAL_ICON = { bronze: '🥉', silver: '🥈', gold: '🥇' } as const;

/** Archipelagos still to come, each with its own islands, decor and activities. */
const NEXT = [
  { name: 'Hawaii', theme: 'Volcanoes and land excursions' },
  { name: 'The Balearics', theme: 'Nightlife' },
  { name: 'Thailand', theme: 'Coming later' },
];
/** Where each island sits on the archipelago map (percent of the map). */
const PLACES: Record<string, { x: number; y: number; w: number }> = {
  coconutKey: { x: 16, y: 66, w: 22 },
  twinPalms: { x: 45, y: 40, w: 28 },
  farSands: { x: 77, y: 66, w: 32 },
  oldHarbour: { x: 82, y: 24, w: 24 },
};
const LEVELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

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
  /** The mission sheet lives beside the home screen: its blur would trap a fixed overlay. */
  private sheet: HTMLElement;
  private view: 'islands' | 'research' = 'islands';
  private island = ISLANDS[0].id;
  private canContinue = false;
  private maps = new Map<string, string>();
  /** The mission whose details are open, or null. */
  private detail: string | null = null;
  /** Install steps open (browsers without a prompt). */
  private howToInstall = false;

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
    this.sheet = document.createElement('div');
    this.sheet.className = 'home-sheet';
    root.appendChild(this.sheet);
    onInstallChange(() => this.refresh());
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-install]')) {
        if (installWay() === 'prompt') void promptInstall().then(() => this.render());
        else {
          this.howToInstall = true;
          this.render();
        }
        return;
      }
      // Close a detail sheet: its ✕, or a tap on the backdrop around it.
      if (t.closest('[data-close-sheet]') || t.classList.contains('m-backdrop')) {
        this.detail = null;
        this.howToInstall = false;
        return this.render();
      }
      const card = t.closest<HTMLElement>('[data-mission]');
      if (card) {
        this.detail = card.dataset.mission!;
        return this.render();
      }
      const v = t.closest<HTMLElement>('[data-view]');
      if (v) {
        this.view = v.dataset.view as 'islands' | 'research';
        return this.render();
      }
      const isl = t.closest<HTMLElement>('[data-island]');
      if (isl) {
        this.island = isl.dataset.island!;
        this.detail = null;
        return this.render();
      }
      const play = t.closest<HTMLElement>('[data-play-mission]');
      if (play) {
        const guide = this.sheet.querySelector<HTMLInputElement>('[data-tutorial]');
        this.detail = null;
        this.hide();
        return this.h.onPlay({ scenario: play.dataset.playMission!, tutorial: !!guide?.checked });
      }
      if (t.closest('[data-sandbox]')) {
        this.detail = null;
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
    };
    this.el.addEventListener('click', onClick);
    this.sheet.addEventListener('click', onClick);
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
    if (!this.el.hidden && (this.detail || this.howToInstall)) {
      this.detail = null;
      this.howToInstall = false;
      this.render();
      return true;
    }
    if (this.el.hidden || !this.canContinue) return false;
    this.hide();
    this.h.onContinue();
    return true;
  }

  hide(): void {
    this.el.hidden = true;
    this.sheet.innerHTML = '';
  }

  refresh(): void {
    if (!this.el.hidden) this.render();
  }

  private render(): void {
    const p = this.profile;
    const cur = this.canContinue ? this.current() : null;
    const head = `<header class="home-head">
        <div><small>Island Resort Tycoon</small><h1>The Archipelago</h1></div>
        <div class="head-right">${installWay() === 'installed' ? '' : '<button class="install" data-install aria-label="Install the game" title="Install the game">⤓<span> Install</span></button>'}<div class="xp" title="Experience: spend it on research">⭐ <b>${p.xp}</b> XP</div></div>
      </header>
      <nav class="home-tabs" role="tablist">
        <button role="tab" data-view="islands" class="${this.view === 'islands' ? 'on' : ''}">Islands</button>
        <button role="tab" data-view="research" class="${this.view === 'research' ? 'on' : ''}">Research</button>
      </nav>
      ${cur ? `<button class="continue" data-continue>▸ Continue <b>${cur.name}</b> <span>${cur.when}</span></button>` : ''}`;
    this.el.innerHTML = `<div class="home-inner">${head}${this.view === 'islands' ? this.islandsHtml() : this.researchHtml()}</div>`;
    this.sheet.innerHTML = this.sheetHtml();
  }

  private islandsHtml(): string {
    const p = this.profile;
    const arch = ARCHIPELAGOS[0];
    const points = p.points(arch.id);
    const maxPoints = SCENARIOS.filter((m) => arch.islands.some((i) => i.island === m.island)).length * 3;
    const isles = ISLANDS.filter((d) => arch.islands.some((i) => i.island === d.id)).map((d) => {
      const at = PLACES[d.id] ?? { x: 50, y: 50, w: 28 };
      if (!this.maps.has(d.id)) this.maps.set(d.id, minimap(d));
      const missions = SCENARIOS.filter((s) => s.island === d.id);
      const medals = missions.map((m) => p.best(m.id)).filter(Boolean).length;
      const open = p.islandOpen(d.id);
      const tag = open ? `${medals}/${missions.length} 🏅` : `🔒 ${pointsToOpen(d.id)} pts`;
      return `<button class="isle ${this.island === d.id ? 'on' : ''} ${open ? '' : 'locked'}" data-island="${d.id}" style="left:${at.x}%;top:${at.y}%;width:${at.w}%">
        <img src="${this.maps.get(d.id)}" alt="" />
        <span><b>${d.name}</b> ${tag}</span>
      </button>`;
    }).join('');
    const archHead = `<div class="arch-head"><div><b class="an">${arch.name}</b><small>${arch.theme}</small></div><div class="points" title="Bronze 1, silver 2, gold 3: your best medal on each mission">🏅 <span class="n">${points}</span> / ${maxPoints} points</div></div>`;
    const next = `<div class="next-arch">${NEXT.map((a) => `<span><b>${a.name}</b><small>${a.theme}</small></span>`).join('')}</div>`;
    const def = islandDef(this.island);
    const missions = SCENARIOS.filter((s) => s.island === def.id)
      .map((m) => {
        const st = p.missionState(m);
        const best = p.best(m.id);
        return `<button class="mission ${st.open ? '' : 'locked'}" data-mission="${m.id}">
          <span class="m-top"><b>${m.name}</b><span class="medals">${this.medalRow(m.id)}</span></span>
          <span class="m-sub"><em class="lvl ${m.level}">${LEVELS[m.level]}</em>${
            st.open ? `<span>${best ? `Best: ${MEDAL_NAMES[best]}` : duration(m.days)}</span>` : '<span class="lock">🔒 Locked</span>'
          }<i class="chev" aria-hidden="true">›</i></span>
        </button>`;
      })
      .join('');
    const sandbox = p.sandboxOpen
      ? `<button class="mission sandbox" data-sandbox><span class="m-top"><b>Sandbox</b></span><span class="m-sub"><span>Every building, 50,000 coins, no goals</span><i class="chev" aria-hidden="true">›</i></span></button>`
      : `<div class="mission sandbox locked"><span class="m-top"><b>Sandbox</b></span><span class="m-sub"><span class="lock">🔒 A medal on both beginner missions</span></span></div>`;
    const islandLock = p.islandOpen(def.id) ? '' : `<p class="lock-note">🔒 Opens at ${pointsToOpen(def.id)} points in ${arch.name} (you have ${points})</p>`;
    return `${archHead}<div class="sea-map">${isles}</div>${next}
      <section class="island-card">
        <h2>${def.name} <small>${def.scale} island</small></h2>${islandLock}
        <p class="muted">${def.blurb}</p>
        <div class="missions">${missions}${def.id === 'coconutKey' ? sandbox : ''}</div>
      </section>`;
  }

  private medalRow(id: string): string {
    const p = this.profile;
    return MEDALS.map((t) => `<span class="m ${p.hasMedal(id, t) ? 'won' : ''}" title="${MEDAL_NAMES[t]}">${MEDAL_ICON[t]}</span>`).join('');
  }

  /** The mission's full card (or the install steps), over the home screen. */
  private sheetHtml(): string {
    if (this.howToInstall) {
      const way = installWay();
      const steps = INSTALL_STEPS[way === 'ios' ? 'ios' : 'manual'];
      return `<div class="m-backdrop"><section class="m-sheet" role="dialog" aria-label="Install the game">
        <button class="x" data-close-sheet aria-label="Close">✕</button>
        <h2>Install the game</h2>
        <p class="muted">Play from your home screen, full screen and offline.</p>
        <ol class="steps">${steps.map((x) => `<li>${x}</li>`).join('')}</ol>
      </section></div>`;
    }
    const m = this.detail ? SCENARIOS.find((x) => x.id === this.detail) : undefined;
    if (!m) return '';
    const p = this.profile;
    const st = p.missionState(m);
    const extras = [
      m.kit?.length ? `Includes ${m.kit.map((k) => BUILDINGS[k].name).join(', ')}` : '',
      m.needsResearch?.length ? `Needs ${m.needsResearch.map((id) => NODES.find((n) => n.id === id)?.name ?? id).join(', ')}` : '',
      m.prebuilt ? 'Starts with an old resort' : '',
    ].filter(Boolean);
    const goals = MEDALS.map((t) => {
      const won = p.hasMedal(m.id, t);
      const xp = won ? `${REPEAT_XP[t]} XP again` : `${FIRST_XP[t]} XP`;
      return `<li class="${won ? 'won' : ''}"><span class="mi">${MEDAL_ICON[t]}</span><span>${m.medals[t].map((g) => g.label).join('<br>')}</span><small>${won ? '✓ ' : ''}${xp}</small></li>`;
    }).join('');
    return `<div class="m-backdrop"><section class="m-sheet" role="dialog" aria-label="${m.name}">
      <button class="x" data-close-sheet aria-label="Close">✕</button>
      <h2>${m.name}</h2>
      <p class="m-meta"><em class="lvl ${m.level}">${LEVELS[m.level]}</em><span>${islandDef(m.island).name}</span><span>${duration(m.days)}</span><span>${m.startMoney.toLocaleString('en-US')} coins</span></p>
      <p>${m.blurb}</p>
      ${extras.length ? `<p class="chips">${extras.map((x) => `<span>${x}</span>`).join('')}</p>` : ''}
      <ul class="goals">${goals}</ul>
      ${
        st.open
          ? `<label class="guide"><input type="checkbox" data-tutorial ${this.guide ? 'checked' : ''} /> Guide me through the first day</label>
             <button class="go" data-play-mission="${m.id}">Play</button>`
          : `<p class="lock">🔒 ${st.reason}</p>`
      }
    </section></div>`;
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
