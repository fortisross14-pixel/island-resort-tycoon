import { BUILDINGS } from '../sim/buildings';
import { NEEDS, NEED_LABELS, PRICE_STEPS, VENUES, buyChance, priceOf, type PriceStep } from '../sim/needs';
import { GUEST_TYPES, ROOMS_PER_BUILDING, type Guest, type Sim } from '../sim/sim';
import type { Building } from '../sim/world';

type Subject = { kind: 'guest'; id: number } | { kind: 'building'; id: number } | null;

const REFRESH_MS = 200;

function mood(s: number): string {
  return s >= 75 ? 'Delighted' : s >= 55 ? 'Happy' : s >= 35 ? 'Meh' : 'Unhappy';
}

function bar(value: number, label: string): string {
  const v = Math.max(0, Math.min(100, value));
  const tone = v < 25 ? 'bad' : v < 55 ? 'warn' : 'ok';
  return `<div class="meter"><span>${label}</span><b class="track"><i class="${tone}" style="width:${v.toFixed(0)}%"></i></b><em>${v.toFixed(0)}</em></div>`;
}

const coin = '<span class="coin-icon"></span>';

/**
 * A panel that slides over the map with live details of the guest or building you
 * tapped (GDD: "business panels slide over it rather than replacing it").
 */
export class InfoPanel {
  private el: HTMLElement;
  private body: HTMLElement;
  private title: HTMLElement;
  private subject: Subject = null;
  private last = 0;

  constructor(
    root: HTMLElement,
    private sim: Sim,
  ) {
    this.el = document.createElement('aside');
    this.el.className = 'panel';
    this.el.innerHTML = `<header><b data-title></b><button class="x" aria-label="Close">✕</button></header><div data-body></div>`;
    this.title = this.el.querySelector('[data-title]')!;
    this.body = this.el.querySelector('[data-body]')!;
    this.el.querySelector('.x')!.addEventListener('click', () => this.close());
    // Price buttons are re-rendered, so listen on the panel.
    this.el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-price]');
      if (!btn || this.subject?.kind !== 'building') return;
      this.sim.setPrice(this.subject.id, Number(btn.dataset.price) as PriceStep);
      this.render();
    });
    root.appendChild(this.el);
  }

  get open(): boolean {
    return this.subject !== null;
  }

  showGuest(id: number): void {
    this.subject = { kind: 'guest', id };
    this.render();
  }

  showBuilding(id: number): void {
    this.subject = { kind: 'building', id };
    this.render();
  }

  close(): void {
    this.subject = null;
    this.el.classList.remove('show');
  }

  /** Call every frame; it redraws a few times a second. */
  update(now: number): void {
    if (!this.subject || now - this.last < REFRESH_MS) return;
    this.render();
  }

  private render(): void {
    this.last = performance.now();
    const s = this.subject;
    if (!s) return;
    const html =
      s.kind === 'guest' ? this.guestHtml(this.sim.guest(s.id)) : this.buildingHtml(this.sim.world.buildings.find((b) => b.id === s.id));
    if (html === null) return this.close();
    if (this.body.innerHTML !== html) this.body.innerHTML = html;
    this.el.classList.add('show');
  }

  private guestHtml(g: Guest | undefined): string | null {
    if (!g || g.state === 'gone') return null;
    const def = GUEST_TYPES[g.type];
    this.title.textContent = def.name;
    const room = g.roomId !== null ? this.sim.world.buildings.find((b) => b.id === g.roomId) : undefined;
    const roomLine = room
      ? `${BUILDINGS[room.kind].name} · match ${g.roomScore}`
      : g.leaving
        ? 'Heading home'
        : 'Waiting for a room';
    const stay = g.leaving ? 'Leaving on the next ferry' : `${g.nightsLeft} night${g.nightsLeft === 1 ? '' : 's'} left`;
    return `
      <p class="thought">“${g.thought}”</p>
      ${bar(g.satisfaction, `${mood(g.satisfaction)}`)}
      <div class="meters">${NEEDS.map((n) => bar(g.needs[n], NEED_LABELS[n])).join('')}</div>
      <dl>
        <dt>Wallet</dt><dd>${coin}${g.wallet} left today</dd>
        <dt>Spent</dt><dd>${coin}${g.spentToday} today</dd>
        <dt>Room</dt><dd>${roomLine}</dd>
        <dt>Stay</dt><dd>${stay}</dd>
      </dl>`;
  }

  private buildingHtml(b: Building | undefined): string | null {
    if (!b) return null;
    this.title.textContent = BUILDINGS[b.kind].name;
    const def = VENUES[b.kind];
    if (!def) return this.roomHtml(b);
    const v = this.sim.venue(b.id);
    const prices = PRICE_STEPS.map(
      (p, i) =>
        `<button data-price="${i}" class="${i === v.price ? 'on' : ''}"><span>${p.label}</span><b>${priceOf(b.kind, i as PriceStep)}</b></button>`,
    ).join('');
    const pct = (t: 'backpacker' | 'couple') => `${Math.round(buyChance(t, v.price) * 100)}%`;
    return `
      <div class="prices" role="group" aria-label="Price per person">${prices}</div>
      <p class="estimate">Buy chance at this price: Backpackers <b>${pct('backpacker')}</b> · Couples <b>${pct('couple')}</b></p>
      <dl>
        <dt>Today</dt><dd>${v.visitsToday} sold · ${coin}${v.revenueToday}</dd>
        <dt>Lost</dt><dd>${v.lostToday} walked away</dd>
        <dt>Now</dt><dd>${v.serving} of ${def.capacity} served · ${v.line.length} in line</dd>
        <dt>Fills</dt><dd>${NEED_LABELS[def.need]} +${def.gain}</dd>
      </dl>`;
  }

  private roomHtml(b: Building): string {
    const lodgers = this.sim.guests.filter((g) => g.roomId === b.id);
    const rows = lodgers.length
      ? lodgers
          .map((g) => `<li>${GUEST_TYPES[g.type].name} · ${mood(g.satisfaction).toLowerCase()} (${Math.round(g.satisfaction)})</li>`)
          .join('')
      : '<li class="muted">Empty</li>';
    return `
      <dl>
        <dt>Rooms</dt><dd>${lodgers.length} of ${ROOMS_PER_BUILDING} taken</dd>
        <dt>Built</dt><dd>Day ${b.builtDay}</dd>
      </dl>
      <ul class="lodgers">${rows}</ul>`;
  }
}
