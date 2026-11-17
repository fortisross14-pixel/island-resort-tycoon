import { islandDef } from '../sim/islands';
import { duration, monthYear } from '../sim/calendar';
import { MEDALS, MEDAL_NAMES, SCENARIOS, type Campaign, type MedalTier, STAR_METRICS } from '../sim/scenario';

const MEDAL_ICON: Record<MedalTier, string> = { bronze: '🥉', silver: '🥈', gold: '🥇' };
const coin = '<span class="coin-icon"></span>';

function fmt(n: number, metric: string): string {
  return (STAR_METRICS as string[]).includes(metric) ? n.toFixed(1) : Math.round(n).toLocaleString('en-US');
}

/** A pill under the top bar with the scenario's progress; tap it for the full list. */
export class GoalsView {
  private pill: HTMLButtonElement;
  private panel: HTMLElement;
  private campaign: Campaign | null = null;
  private last = 0;
  private openPanel = false;

  constructor(root: HTMLElement, private onOpenChange: (open: boolean) => void = () => {}) {
    this.pill = document.createElement('button');
    this.pill.className = 'goals-pill';
    this.pill.hidden = true;
    this.pill.addEventListener('click', () => this.toggle());
    root.appendChild(this.pill);
    this.panel = document.createElement('aside');
    this.panel.className = 'goals-panel';
    this.panel.hidden = true;
    this.panel.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.x')) this.toggle(false);
    });
    root.appendChild(this.panel);
  }

  setCampaign(c: Campaign | null): void {
    this.campaign = c;
    this.pill.hidden = !c;
    if (!c) this.toggle(false);
    this.render();
  }

  toggle(open = !this.openPanel): void {
    const was = this.openPanel;
    this.openPanel = open && !!this.campaign;
    this.panel.hidden = !this.openPanel;
    this.render();
    if (was !== this.openPanel) this.onOpenChange(this.openPanel);
  }

  get isOpen(): boolean {
    return this.openPanel;
  }

  update(now: number): void {
    if (now - this.last < 250) return;
    this.render();
  }

  private render(): void {
    this.last = performance.now();
    const c = this.campaign;
    if (!c) return;
    const best = c.bestMedal;
    const status = c.state.finished
      ? c.state.finished === 'none'
        ? 'Scenario over'
        : `${MEDAL_NAMES[c.state.finished]} medal`
      : `${duration(c.daysLeft)} left`;
    const done = c.state.objectives.filter((o) => o.done).length;
    const pill = `<span class="medal">${best ? MEDAL_ICON[best] : '🎯'}</span><b>${c.def.name}</b><span>${status}</span><span class="obj">${done}/${c.state.objectives.length} goals this month</span>`;
    if (this.pill.innerHTML !== pill) this.pill.innerHTML = pill;
    if (!this.openPanel) return;

    const tiers = MEDALS.map((t) => {
      const won = c.state.medals[t];
      const goals = c.def.medals[t]
        .map((g) => {
          const v = c.progress(g);
          const ok = v >= g.target;
          return `<li class="${ok ? 'ok' : ''}"><span>${ok ? '✓' : '○'} ${g.label}</span><em>${fmt(Math.min(v, g.target), g.metric)} / ${fmt(g.target, g.metric)}</em></li>`;
        })
        .join('');
      return `<section class="tier ${won !== undefined ? 'won' : ''}"><h4>${MEDAL_ICON[t]} ${MEDAL_NAMES[t]}${won !== undefined ? ` <small>won in ${monthYear(won)}</small>` : ''}</h4><ul>${goals}</ul></section>`;
    }).join('');
    const objectives = c.state.objectives
      .map((o) => {
        const pct = Math.round((o.progress / o.target) * 100);
        const reward = o.reward.coins ? `${coin}${o.reward.coins}` : `+${o.reward.research} research`;
        return `<li class="${o.done ? 'ok' : ''}"><span>${o.done ? '✓ ' : ''}${o.label}</span><small>${reward}</small><b class="bar"><i style="width:${pct}%"></i></b></li>`;
      })
      .join('');
    const html = `<header><b>${c.def.name}</b><button class="x" aria-label="Close">✕</button></header>
      <p class="muted">${status} · month ${Math.min(c.def.days, c.def.days - c.daysLeft + 1)} of ${c.def.days}</p>
      ${tiers}
      <h4>This month’s goals</h4><ul class="objectives">${objectives}</ul>`;
    if (this.panel.innerHTML !== html) this.panel.innerHTML = html;
  }
}

export type NewGameChoice = { scenario: string; tutorial: boolean } | { sandbox: true };

/** Choose a scenario or the sandbox. */
export class NewGameDialog {
  private el: HTMLElement;

  constructor(
    root: HTMLElement,
    private onChoose: (c: NewGameChoice) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'report-backdrop';
    this.el.hidden = true;
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const s = t.closest<HTMLElement>('[data-scenario]');
      if (s) {
        this.hide();
        const guide = this.el.querySelector<HTMLInputElement>('[data-tutorial]');
        return this.onChoose({ scenario: s.dataset.scenario!, tutorial: !!guide?.checked });
      }
      if (t.closest('[data-sandbox]')) {
        this.hide();
        return this.onChoose({ sandbox: true });
      }
      if (t.closest('[data-cancel]')) this.hide();
    });
  }

  /** Close if the dialog offers a way back (not on the very first launch). */
  cancel(): boolean {
    if (this.el.hidden || !this.el.querySelector('[data-cancel]')) return false;
    this.hide();
    return true;
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  /** `guide`: tick "Guide me through the first day" by default. */
  show(canCancel: boolean, guide = false): void {
    const cards = SCENARIOS.map(
      (s) => `<button class="choice" data-scenario="${s.id}">
        <b>${s.name}</b><span class="island">${islandDef(s.island).name} · ${islandDef(s.island).scale} island</span><span>${s.blurb}</span>
        <ul>${MEDALS.map((t) => `<li>${MEDAL_ICON[t]} ${s.medals[t].map((g) => g.label).join(', ')}</li>`).join('')}</ul>
        <small>${duration(s.days)} · ${s.startMoney.toLocaleString('en-US')} coins · research unlocks buildings</small>
      </button>`,
    ).join('');
    this.el.innerHTML = `<section class="report newgame" role="dialog" aria-label="New game">
      <header><small>Island Resort Tycoon</small><h2>New island</h2></header>
      <label class="guide"><input type="checkbox" data-tutorial ${guide ? 'checked' : ''} /> Guide me through the first day</label>
      <div class="choices">${cards}
        <button class="choice" data-sandbox><b>Sandbox</b><span class="island">Twin Palms · medium island</span><span>Every building unlocked, 50,000 coins, no goals. Build what you like.</span></button>
      </div>
      ${canCancel ? '<button class="cancel" data-cancel>Keep playing my island</button>' : ''}
    </section>`;
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
}

/** End-of-scenario certificate. */
export function certificateHtml(c: Campaign, xp = 0, totalXp = 0): string {
  const m = c.state.finished;
  const title = !m || m === 'none' ? 'No medal this time' : `${MEDAL_ICON[m]} ${MEDAL_NAMES[m]} medal`;
  const won = MEDALS.filter((t) => c.state.medals[t] !== undefined)
    .map((t) => `<li>${MEDAL_ICON[t]} ${MEDAL_NAMES[t]}: ${monthYear(c.state.medals[t]!)}</li>`)
    .join('');
  return `<section class="report certificate" role="dialog" aria-label="Scenario complete">
    <header><small>${c.def.name}</small><h2>${title}</h2><p>${c.state.served} guests served · ★${c.metric('rating').toFixed(1)}</p></header>
    <ul class="lines">${won || '<li class="muted">Try again: the bronze goals are a good first target.</li>'}</ul>
    <p class="xp-line">${xp ? `+${xp} XP for the final rating · ` : ''}⭐ ${totalXp} XP to spend on research</p>
    <button class="start" data-new>Back to the islands</button>
    <button class="cancel" data-keep>Keep playing this resort</button>
  </section>`;
}
