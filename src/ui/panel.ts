import { BUILDINGS, ELEVATOR_ABOVE, ELEVATOR_COST, RATING_NAMES, THEME_NAMES, floorCost, ratingOf } from '../sim/buildings';
import { NEEDS, NEED_LABELS, PRICE_STEPS, VENUES, buyChance, priceOf, roomRateOf, type PriceStep } from '../sim/needs';
import { GUEST_TYPES, type Guest, type Sim } from '../sim/sim';
import { conditionOf, floorsOf, type Building } from '../sim/world';
import { monthYear } from '../sim/calendar';

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
    private actions: { addFloor(id: number): void; addElevator(id: number): void; repair(id: number): void },
  ) {
    this.el = document.createElement('aside');
    this.el.className = 'panel';
    this.el.innerHTML = `<header><b data-title></b><button class="x" aria-label="Close">✕</button></header><div data-body></div>`;
    this.title = this.el.querySelector('[data-title]')!;
    this.body = this.el.querySelector('[data-body]')!;
    this.el.querySelector('.x')!.addEventListener('click', () => this.close());
    // Price buttons are re-rendered, so listen on the panel.
    this.el.addEventListener('click', (e) => {
      if (this.subject?.kind !== 'building') return;
      const t = e.target as HTMLElement;
      const price = t.closest<HTMLButtonElement>('[data-price]');
      if (price) this.sim.setPrice(this.subject.id, Number(price.dataset.price) as PriceStep);
      const rate = t.closest<HTMLButtonElement>('[data-rate]');
      if (rate) this.sim.setRoomRate(Number(rate.dataset.tier), Number(rate.dataset.rate) as PriceStep);
      if (t.closest('[data-floor]')) this.actions.addFloor(this.subject.id);
      if (t.closest('[data-elevator]')) this.actions.addElevator(this.subject.id);
      if (t.closest('[data-repair]')) this.actions.repair(this.subject.id);
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
    const kind = BUILDINGS[b.kind];
    if (kind.decor) return this.conditionHtml(b) + this.decorHtml(b);
    if (!def) return this.conditionHtml(b) + (kind.family === 'rooms' ? this.roomHtml(b) : this.serviceHtml(b));
    const v = this.sim.venue(b.id);
    const free = def.basePrice === 0;
    const prices = PRICE_STEPS.map(
      (p, i) =>
        `<button data-price="${i}" class="${i === v.price ? 'on' : ''}"><span>${p.label}</span><b>${priceOf(b.kind, i as PriceStep)}</b></button>`,
    ).join('');
    const pct = (t: 'backpacker' | 'couple') => `${Math.round(buyChance(t, v.price) * 100)}%`;
    const pricing = free
      ? '<p class="estimate">Free to use: it pays off in happier guests and better reviews.</p>'
      : `<div class="prices" role="group" aria-label="Price per person">${prices}</div>
      <p class="estimate">Buy chance at this price: Backpackers <b>${pct('backpacker')}</b> · Couples <b>${pct('couple')}</b></p>`;
    return `${this.conditionHtml(b)}
      ${pricing}
      <dl>
        <dt>This month</dt><dd>${free ? `${v.visitsToday} visits` : `${v.visitsToday} sold · ${coin}${v.revenueToday}`}</dd>
        <dt>Lost</dt><dd>${v.lostToday} walked away</dd>
        <dt>Now</dt><dd>${v.serving} of ${def.capacity} served · ${v.line.length} in line</dd>
        <dt>Fills</dt><dd>${NEED_LABELS[def.need]} +${def.gain}</dd>
        <dt>Rates</dt><dd>${RATING_NAMES[ratingOf(b.kind)]}</dd>
      </dl>`;
  }

  /** Wear and the repair button (Pass 4). */
  private conditionHtml(b: Building): string {
    const c = conditionOf(b);
    const cost = this.sim.world.repairCost(b.id);
    const note = c < 50 ? '<p class="estimate warn">Run-down: guests notice, and it spoils the view nearby.</p>' : '';
    const repair = c < 99 ? `<button data-repair class="${c < 50 ? 'urgent' : ''}">Repair <span>${coin}${cost.toLocaleString('en-US')}</span></button>` : '';
    return `<div class="condition">${bar(c, 'Condition')}${repair}</div>${note}`;
  }

  private decorHtml(b: Building): string {
    const d = BUILDINGS[b.kind].decor!;
    const here = Math.round(this.sim.appeal.at(b.x, b.y));
    return `<p class="estimate">${BUILDINGS[b.kind].blurb}</p>
      <dl>
        <dt>Appeal</dt><dd>+${d.appeal} · reaches ${d.radius} tiles</dd>
        <dt>Theme</dt><dd>${d.theme ? THEME_NAMES[d.theme] : 'Any'}</dd>
        <dt>View here</dt><dd>${here} / 100</dd>
        <dt>Placed</dt><dd>${monthYear(b.builtDay)}</dd>
      </dl>
      <p class="estimate">Three of one theme together look better; mixing themes clashes; too many in one spot is clutter.</p>`;
  }

  private serviceHtml(b: Building): string {
    return `<p class="estimate">${BUILDINGS[b.kind].blurb}</p><dl><dt>Built</dt><dd>${monthYear(b.builtDay)}</dd></dl>`;
  }

  private roomHtml(b: Building): string {
    const tier = this.sim.roomTier(b);
    const step = this.sim.roomRates[tier] ?? 2;
    const rates = PRICE_STEPS.map(
      (p, i) =>
        `<button data-rate="${i}" data-tier="${tier}" class="${i === step ? 'on' : ''}"><span>${p.label}</span><b>${roomRateOf(tier, i as PriceStep)}</b></button>`,
    ).join('');
    const lodgers = this.sim.guests.filter((g) => g.roomId === b.id);
    const rows = lodgers.length
      ? lodgers
          .map((g) => `<li>${GUEST_TYPES[g.type].name} · ${mood(g.satisfaction).toLowerCase()} (${Math.round(g.satisfaction)})</li>`)
          .join('')
      : '<li class="muted">Empty</li>';
    return `
      <div class="prices" role="group" aria-label="Nightly rate per party, all tier ${tier} rooms">${rates}</div>
      <p class="estimate">Nightly rate for every tier ${tier} room. Backpackers budget about 55–90, couples 120–190.</p>
      <dl>
        <dt>Tonight</dt><dd>${coin}${lodgers.filter((g) => !g.leaving).reduce((sum, g) => sum + Math.min(this.sim.roomRate(b), g.budget), 0)} expected</dd>
        <dt>Rooms</dt><dd>${lodgers.length} of ${this.sim.capacity(b)} taken</dd>
        <dt>Floors</dt><dd>${floorsOf(b)} of ${this.sim.maxFloors}${b.elevator ? ' · elevator' : ''}</dd>
        <dt>Built</dt><dd>${monthYear(b.builtDay)}</dd>
      </dl>
      <div class="floor-actions">
        ${
          floorsOf(b) < this.sim.maxFloors
            ? `<button data-floor>+ Add floor <span>${coin}${floorCost(b.kind).toLocaleString('en-US')}</span></button>`
            : `<small class="muted">${this.sim.maxFloors < 6 ? 'Research Tall Buildings for more floors' : 'As tall as it gets'}</small>`
        }
        ${
          !b.elevator && floorsOf(b) >= ELEVATOR_ABOVE
            ? `<button data-elevator class="${this.sim.needsElevator(b) ? 'urgent' : ''}">Elevator <span>${coin}${ELEVATOR_COST.toLocaleString('en-US')}</span></button>`
            : ''
        }
      </div>
      ${this.sim.needsElevator(b) ? '<p class="estimate warn">Guests hate climbing past 3 floors: add an elevator.</p>' : ''}
      <ul class="lodgers">${rows}</ul>`;
  }
}
