import { SLOTS, SLOT_NAMES, activityOf, activityPrice, landmarksOn, tripMinutes, type Slot } from '../sim/activities';
import { BUILDINGS, ELEVATOR_ABOVE, ELEVATOR_COST, RATING_NAMES, THEME_NAMES, floorCost, ratingOf } from '../sim/buildings';
import { NEEDS, NEED_LABELS, PRICE_STEPS, VENUES, buyChance, priceOf, roomRateOf, type PriceStep } from '../sim/needs';
import { GUEST_TYPES, type Guest, type Sim } from '../sim/sim';
import { WELCOME_LEVELS, conditionOf, floorsOf, type Building } from '../sim/world';
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
    private actions: {
      addFloor(id: number): void;
      addElevator(id: number): void;
      repair(id: number): void;
      drawRoute(id: number): void;
      move(id: number): void;
      welcome(opt: 'drinks' | 'leis'): void;
      upgrade(id: number): void;
      togglePlan(id: number, slot: Slot): void;
    },
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
      if (t.closest('[data-route]')) this.actions.drawRoute(this.subject.id);
      if (t.closest('[data-move]')) return this.actions.move(this.subject.id);
      const wopt = t.closest<HTMLElement>('[data-welcome]');
      if (wopt) this.actions.welcome(wopt.dataset.welcome as 'drinks' | 'leis');
      if (t.closest('[data-upgrade]')) this.actions.upgrade(this.subject.id);
      const slot = t.closest<HTMLElement>('[data-hubslot]');
      if (slot) this.actions.togglePlan(this.subject.id, slot.dataset.hubslot as Slot);
      const ap = t.closest<HTMLButtonElement>('[data-aprice]');
      if (ap) this.sim.setActivityPrice(this.subject.id, Number(ap.dataset.aprice) as PriceStep);
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
    if (activityOf(b.kind)) return this.conditionHtml(b) + this.hubHtml(b);
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
        ${b.kind === 'pool' ? `<dt>Lifeguard</dt><dd>${this.sim.guardAt(b.id)?.name ?? '<span class="warn">Nobody on duty (Business, People)</span>'}</dd>` : ''}
      </dl>`;
  }

  /** Wear and the repair button (Pass 4). */
  private conditionHtml(b: Building): string {
    const c = conditionOf(b);
    const cost = this.sim.world.repairCost(b.id);
    const note = c < 50 ? '<p class="estimate warn">Run-down: guests notice, and it spoils the view nearby.</p>' : '';
    const repair = c < 99 && cost > 0 ? `<button data-repair class="${c < 50 ? 'urgent' : ''}">Repair <span>${coin}${cost.toLocaleString('en-US')}</span></button>` : '';
    const move = BUILDINGS[b.kind].fixed ? '' : `<button data-move title="Move it somewhere else">Move <span>${coin}${this.sim.world.moveCost(b.id).toLocaleString('en-US')}</span></button>`;
    return `<div class="condition">${bar(c, 'Condition')}<div class="cond-actions">${repair}${move}</div></div>${note}`;
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

  /** Activity hubs (Pass 4 step 3): route, quality, price and the three slots. */
  private hubHtml(b: Building): string {
    const def = activityOf(b.kind)!;
    const route = this.sim.world.routeOf(b.id);
    const step = this.sim.activityPrice(b.id);
    const prices = PRICE_STEPS.map(
      (p, i) => `<button data-aprice="${i}" class="${i === step ? 'on' : ''}"><span>${p.label}</span><b>${activityPrice(def, i)}</b></button>`,
    ).join('');
    const seen = route ? landmarksOn(route, this.sim.world.landmarks) : [];
    const routeInfo = def.route
      ? route
        ? `<dt>Route</dt><dd>${route.tiles.length} tiles · ${tripMinutes(def, route)} min</dd>
           <dt>Sights</dt><dd>${seen.length ? seen.map((l) => l.name).join(', ') : 'None yet: pass closer to a landmark'}</dd>`
        : `<dt>Route</dt><dd class="warn">Not drawn yet</dd>`
      : `<dt>Class</dt><dd>${tripMinutes(def, null)} min · better with a view and decor nearby</dd>`;
    const slots = SLOTS.map((s) => {
      const on = this.sim.isPlanned(b.id, s);
      const trip = this.sim.trips.find((t) => t.hubId === b.id && t.slot === s);
      return `<button class="slot ${on ? 'on' : ''}" data-hubslot="${s}" aria-pressed="${on}">${SLOT_NAMES[s]}${trip ? ` · ${trip.people}` : ''}</button>`;
    }).join('');
    return `<p class="estimate">${def.name} · up to ${def.capacity} people</p>
      <div class="meters">${bar(this.sim.sessionQuality(b.id), 'Quality')}</div>
      <dl>${routeInfo}</dl>
      ${def.route ? `<div class="floor-actions"><button data-route>${route ? 'Redraw route' : 'Draw route'}</button></div>` : ''}
      <h4 class="sub">Price per person</h4>
      <div class="prices" role="group" aria-label="Price per person">${prices}</div>
      <h4 class="sub">Runs every day</h4>
      <div class="hub-slots">${slots}</div>`;
  }

  private serviceHtml(b: Building): string {
    if (b.kind === 'welcomeCenter') {
      const w = this.sim.welcome;
      const greeter = this.sim.greeter;
      const opt = (k: 'drinks' | 'leis', label: string, cost: number) =>
        `<label class="check"><input type="checkbox" data-welcome="${k}" ${w[k] ? 'checked' : ''} /> ${label} <small>${coin}${cost} a guest</small></label>`;
      const lvl = b.level ?? 1;
      const cur = WELCOME_LEVELS[lvl - 1];
      const next = WELCOME_LEVELS[lvl];
      const demand = this.sim.demand;
      const short = demand > cur.parties;
      return `<dl><dt>Level</dt><dd>${cur.name} (${lvl} of ${WELCOME_LEVELS.length})</dd>
          <dt>Welcomes</dt><dd>${cur.parties} part${cur.parties === 1 ? 'y' : 'ies'} a month</dd>
          <dt>Want to come</dt><dd class="${short ? 'warn' : ''}">${demand} this month${short ? ': the rest stay home' : ''}</dd></dl>
        ${next ? `<div class="floor-actions"><button data-upgrade class="${short ? 'urgent' : ''}">Upgrade to ${next.name} · ${next.parties} a month <span>${coin}${next.cost.toLocaleString('en-US')}</span></button></div>` : '<p class="estimate">Fully upgraded.</p>'}
        <p class="estimate">Every party is welcomed here when they get their room.</p>
        ${opt('drinks', 'Free welcome drinks', 3)}${opt('leis', 'Flower necklaces', 2)}
        <dl><dt>Greeting team</dt><dd>${greeter ? `${greeter.name} (mornings)` : '<span class="warn">Nobody: put an Operations person on the morning greeting shift (Business, People)</span>'}</dd></dl>`;
    }
    if (b.kind === 'lifeguardTower' || b.kind === 'pool') {
      const guard = this.sim.guardAt(b.id);
      return `<p class="estimate">${BUILDINGS[b.kind].blurb}</p><dl><dt>Lifeguard</dt><dd>${guard ? guard.name : '<span class="warn">Nobody on duty (Business, People, Security)</span>'}</dd>${b.kind === 'lifeguardTower' ? `<dt>Beach</dt><dd>${Math.round(this.sim.beachQuality())} / 100</dd>` : ''}</dl>`;
    }
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
