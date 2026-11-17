import { BUILDINGS, BUILDING_KINDS, PATH_COST, QUALITY_NAMES, type BuildingKind } from '../sim/buildings';
import { WISHES, type Wish } from '../sim/match';
import { BRANCHES, type NodeStatus, type ResearchNode } from '../sim/research';
import { GUEST_TYPES, PATIENCE_SECONDS, type Guest } from '../sim/sim';

export type TrayItem = BuildingKind | 'path' | 'land';

export interface HudHandlers {
  onTrayDown(item: TrayItem, e: PointerEvent): void;
  onRotate(): void;
  onDemolish(): void;
  onUndo(): void;
  onCancel(): void;
  onNewIsland(): void;
  onSpeed(speed: Speed): void;
  onTab(tab: Tab): void;
  onGuestDown(id: number, e: PointerEvent): void;
  onAutoAssign(): void;
  onResearch(id: string): void;
}

export type Tab = 'build' | 'guests' | 'research';

const WISH_ICONS: Record<Wish, string> = {
  snacks: '<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" fill="#ffe2bd"/><path d="M2 7 L4 3 H12 L14 7 Z" fill="#f2b441"/></svg>',
  buffet: '<svg viewBox="0 0 16 16"><path d="M1 7 L4 4 H12 L15 7 Z" fill="#3fa7a0"/><rect x="2" y="7" width="12" height="6" fill="#fff4e2" stroke="#d9c4a0" stroke-width=".6"/></svg>',
  quiet: '<svg viewBox="0 0 16 16"><path d="M11 2.5 A6 6 0 1 0 13.5 11 A4.6 4.6 0 0 1 11 2.5 Z" fill="#6b7fd6"/></svg>',
  pool: '<svg viewBox="0 0 16 16"><rect x="2" y="4" width="12" height="9" rx="2" fill="#4fc6e8"/><path d="M3 9 q2.5 -2 5 0 t5 0" stroke="#fff" stroke-width="1.2" fill="none"/></svg>',
  bar: '<svg viewBox="0 0 16 16"><path d="M2 7 L8 2 L14 7 Z" fill="#d9b46a"/><rect x="4" y="7" width="8" height="6" fill="#a8754a"/></svg>',
  shortWalk: '<svg viewBox="0 0 16 16"><path d="M2 10 H14 L12 13 H4 Z" fill="#a8754a"/><rect x="7.2" y="3" width="1.6" height="7" fill="#7d5534"/><path d="M8.8 3.5 L13 7 H8.8 Z" fill="#fff"/></svg>',
};

function peopleIcon(g: Guest): string {
  const shirt = g.type === 'couple' ? ['#ff7aa8', '#b38cf0'] : ['#ff9f43'];
  const fig = (x: number, c: string) =>
    `<circle cx="${x}" cy="9" r="4" fill="#f4cfa8"/><path d="M${x - 6} 26 Q${x - 6} 14 ${x} 14 Q${x + 6} 14 ${x + 6} 26 Z" fill="${c}"/>`;
  return `<svg viewBox="0 0 32 28">${g.size === 2 ? fig(11, shirt[0]) + fig(21, shirt[1]) : fig(16, shirt[0])}</svg>`;
}

/** 0 = paused. */
export type Speed = 0 | 1 | 2 | 4;

const ICONS: Record<TrayItem, string> = {
  researchOffice: '<svg viewBox="0 0 32 32"><rect x="6" y="12" width="20" height="15" fill="#eef3f7"/><rect x="5" y="10" width="22" height="3" fill="#6b7fd6"/><path d="M19 9 a5 5 0 0 1 8 -4" stroke="#999" stroke-width="2" fill="none"/><rect x="9" y="16" width="5" height="4" fill="#3b6e8f"/><rect x="18" y="16" width="5" height="4" fill="#3b6e8f"/></svg>',
  gardenBungalows: '<svg viewBox="0 0 32 32"><rect x="2" y="22" width="28" height="6" fill="#8cc860"/><path d="M3 14 L9 9 L15 14 Z" fill="#7a5a3a"/><rect x="4" y="14" width="10" height="8" fill="#a8754a"/><path d="M17 14 L23 9 L29 14 Z" fill="#7a5a3a"/><rect x="18" y="14" width="10" height="8" fill="#a8754a"/></svg>',
  italianRestaurant: '<svg viewBox="0 0 32 32"><path d="M3 13 L16 5 L29 13 Z" fill="#c0392b"/><rect x="5" y="13" width="22" height="13" fill="#fff4e2"/><rect x="10" y="15" width="12" height="4" fill="#2e9e4f"/></svg>',
  seafoodRestaurant: '<svg viewBox="0 0 32 32"><path d="M3 13 L16 5 L29 13 Z" fill="#2e86c1"/><rect x="5" y="13" width="22" height="13" fill="#fff4e2"/><path d="M10 21 q6 -6 12 0 q-6 6 -12 0 Z" fill="#ff8a4c"/></svg>',
  asianRestaurant: '<svg viewBox="0 0 32 32"><path d="M2 13 Q16 3 30 13 Z" fill="#8e2e2e"/><rect x="5" y="13" width="22" height="13" fill="#fff4e2"/><circle cx="16" cy="19" r="3" fill="#f2b441"/></svg>',
  gym: '<svg viewBox="0 0 32 32"><rect x="6" y="12" width="20" height="15" fill="#e9eef0"/><rect x="5" y="10" width="22" height="3" fill="#4a5560"/><rect x="10" y="18" width="12" height="2" fill="#ff6b6b"/><rect x="8" y="16" width="3" height="6" fill="#ff6b6b"/><rect x="21" y="16" width="3" height="6" fill="#ff6b6b"/></svg>',
  spa: '<svg viewBox="0 0 32 32"><path d="M4 13 L16 6 L28 13 Z" fill="#5fb3a5"/><rect x="6" y="13" width="20" height="13" fill="#fff"/><path d="M16 15 q-4 4 0 8 q4 -4 0 -8 Z" fill="#7fd8e8"/></svg>',
  boutique: '<svg viewBox="0 0 32 32"><rect x="6" y="12" width="20" height="15" fill="#f6effa"/><rect x="4" y="10" width="24" height="4" fill="#7f55b8"/><path d="M12 18 h8 l-1 7 h-6 Z" fill="#ffd166"/></svg>',
  diveShop: '<svg viewBox="0 0 32 32"><rect x="2" y="22" width="28" height="6" fill="#6fd6d6"/><rect x="5" y="11" width="14" height="11" fill="#3b8fd6"/><rect x="22" y="6" width="1.5" height="14" fill="#9b6b43"/><rect x="23.5" y="6" width="6" height="4" fill="#ff4d4d"/></svg>',
  land: '<svg viewBox="0 0 32 32"><path d="M2 22 Q16 14 30 22 V28 H2 Z" fill="#6fd6d6"/><path d="M7 21 Q16 10 25 21 Z" fill="#9fd36f"/><rect x="15" y="6" width="2" height="10" fill="#7d5534"/><path d="M17 6 L24 9 L17 12 Z" fill="#ff8a4c"/></svg>',
  path: '<svg viewBox="0 0 32 32"><path d="M6 28 C 10 18, 22 20, 26 4" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/></svg>',
  basicRooms:
    '<svg viewBox="0 0 32 32"><path d="M4 15 L16 6 L28 15 Z" fill="#e0704f"/><rect x="7" y="15" width="18" height="12" fill="#fff4e2" stroke="#d9c4a0"/><rect x="10" y="19" width="4" height="8" fill="#7d5534"/><rect x="18" y="19" width="4" height="4" fill="#3b6e8f"/></svg>',
  snackBar:
    '<svg viewBox="0 0 32 32"><rect x="6" y="15" width="20" height="12" fill="#ffe2bd"/><path d="M4 15 L8 8 H24 L28 15 Z" fill="#f2b441"/><path d="M10 8 L8 15 M16 8 V15 M22 8 L24 15" stroke="#fff" stroke-width="2"/></svg>',
  buffet:
    '<svg viewBox="0 0 32 32"><path d="M2 14 L8 8 H24 L30 14 Z" fill="#3fa7a0"/><rect x="4" y="14" width="24" height="12" fill="#fff4e2"/><rect x="7" y="18" width="18" height="4" fill="#a8754a"/></svg>',
  standardRooms:
    '<svg viewBox="0 0 32 32"><path d="M4 12 L16 4 L28 12 Z" fill="#3fa7a0"/><rect x="7" y="12" width="18" height="15" fill="#ffe2bd"/><rect x="10" y="15" width="4" height="3" fill="#3b6e8f"/><rect x="18" y="15" width="4" height="3" fill="#3b6e8f"/><rect x="10" y="21" width="4" height="6" fill="#7d5534"/><rect x="18" y="21" width="4" height="3" fill="#3b6e8f"/></svg>',
  beachBar:
    '<svg viewBox="0 0 32 32"><path d="M2 14 L16 5 L30 14 Z" fill="#d9b46a"/><rect x="6" y="14" width="2" height="12" fill="#9b6b43"/><rect x="24" y="14" width="2" height="12" fill="#9b6b43"/><rect x="9" y="19" width="14" height="5" fill="#7d5534"/></svg>',
  giftShop:
    '<svg viewBox="0 0 32 32"><rect x="7" y="13" width="18" height="14" fill="#ffe7f0"/><path d="M5 13 L8 8 H24 L27 13 Z" fill="#ff7aa8"/><rect x="11" y="17" width="10" height="6" fill="#3b6e8f"/></svg>',
  pool: '<svg viewBox="0 0 32 32"><rect x="3" y="8" width="26" height="18" rx="3" fill="#f3e6cc"/><rect x="6" y="11" width="20" height="12" rx="2" fill="#4fc6e8"/><path d="M8 18 q4 -3 8 0 t8 0" stroke="#fff" stroke-width="2" fill="none"/></svg>',
  frontDesk:
    '<svg viewBox="0 0 32 32"><rect x="5" y="12" width="22" height="15" fill="#fff4e2"/><rect x="3" y="9" width="26" height="4" fill="#f2b441"/><rect x="10" y="4" width="12" height="5" fill="#3fa7a0"/><rect x="11" y="17" width="10" height="5" fill="#a8754a"/></svg>',
};

/** Plain-DOM overlay: top bar, build tray, tool bar and toasts. */
export class Hud {
  private coinsEl: HTMLElement;
  private hintEl: HTMLElement;
  private toastEl: HTMLElement;
  private toolbar: HTMLElement;
  private undoBtn: HTMLButtonElement;
  private rotateBtn: HTMLButtonElement;
  private demolishBtn: HTMLButtonElement;
  private cards = new Map<TrayItem, HTMLButtonElement>();
  private dayEl: HTMLElement;
  private timeEl: HTMLElement;
  private guestsEl: HTMLElement;
  private speedBtns: HTMLButtonElement[];
  private tabBtns: HTMLButtonElement[];
  private buildTray: HTMLElement;
  private guestTray: HTMLElement;
  private guestCards: HTMLElement;
  private emptyEl: HTMLElement;
  private badgeEl: HTMLElement;
  private chipEl: HTMLElement;
  private queueKey = '';
  private patienceBars = new Map<number, HTMLElement>();
  private guestEls = new Map<number, HTMLElement>();
  private handlers: HudHandlers;
  private researchTray!: HTMLElement;
  private researchKey = '';
  private toastTimer = 0;

  constructor(
    private root: HTMLElement,
    h: HudHandlers,
  ) {
    root.innerHTML = `
      <header class="topbar">
        <div class="stat coins" title="Coins"><span class="coin-icon"></span><b data-coins>0</b></div>
        <div class="stat" title="Day and time"><span class="lbl">Day </span><b data-day>1</b> · <span data-time>07:00</span></div>
        <div class="stat guests" title="Guests on the island"><span class="guest-icon"></span><b data-guests>0</b></div>
        <div class="stat rating" title="Star rating: average of the last 50 reviews" data-rating>☆☆☆☆☆</div>
        <div class="speed" title="Speed (Space pauses)">
          <button data-speed="0" aria-label="Pause">❚❚</button><button data-speed="1">1×</button><button data-speed="2">2×</button><button data-speed="4">4×</button>
        </div>
        <button class="menu" data-new title="Start a new island" aria-label="New island">↺</button>
      </header>
      <div class="toast" data-toast role="status" aria-live="polite"></div>
      <footer class="bottom">
        <div class="hint" data-hint></div>
        <div class="toolbar" data-toolbar>
          <button data-rotate title="Rotate (R)">⟳ Rotate</button>
          <button data-demolish title="Demolish (X)">✕ Demolish</button>
          <button data-undo title="Undo (Ctrl+Z)">↶ Undo</button>
          <button data-cancel class="done" title="Done (Esc)">Done</button>
        </div>
        <div class="tabs" role="tablist">
          <button data-tab="build" role="tab" class="on">Build</button>
          <button data-tab="guests" role="tab">Guests <span class="badge" data-badge></span></button>
          <button data-tab="research" role="tab">Research <span class="badge ok" data-rbadge></span></button>
        </div>
        <nav class="tray" data-tray></nav>
        <div class="tray guest-tray" data-guest-tray hidden>
          <button class="card auto" data-auto title="Place everyone in their best free room (−10 match)">
            <span class="icon"><svg viewBox="0 0 32 32"><path d="M6 16 a10 10 0 0 1 17-7 l3-3 v9 h-9 l3-3 a6 6 0 1 0 2 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></span>
            <span class="name">Auto-assign</span><span class="sub">Best free rooms</span><span class="sub">−10 match</span>
          </button>
          <div class="guest-cards" data-guest-cards></div>
          <div class="empty" data-empty>No one is waiting. The ferry docks at 08:00.</div>
        </div>
        <div class="tray research-tray" data-research-tray hidden>
          <div class="points"><b data-points>0</b><span>research points</span><small>1 per review star, +4 a night per Research Office</small></div>
          <div class="research-cards" data-research-cards></div>
        </div>
        <div class="chip" data-chip></div>
      </footer>`;
    this.handlers = h;
    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.tabBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-tab]')];
    for (const b of this.tabBtns) b.addEventListener('click', () => h.onTab(b.dataset.tab as Tab));
    this.buildTray = q('[data-tray]');
    this.guestTray = q('[data-guest-tray]');
    this.guestCards = q('[data-guest-cards]');
    this.emptyEl = q('[data-empty]');
    this.badgeEl = q('[data-badge]');
    this.chipEl = q('[data-chip]');
    this.researchTray = q('[data-research-tray]');
    this.researchTray.addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-node]');
      if (c) h.onResearch(c.dataset.node!);
    });
    q('[data-auto]').addEventListener('click', () => h.onAutoAssign());
    this.coinsEl = q('[data-coins]');
    this.hintEl = q('[data-hint]');
    this.toastEl = q('[data-toast]');
    this.toolbar = q('[data-toolbar]');
    this.undoBtn = q('[data-undo]');
    this.rotateBtn = q('[data-rotate]');
    this.demolishBtn = q('[data-demolish]');
    this.dayEl = q('[data-day]');
    this.timeEl = q('[data-time]');
    this.guestsEl = q('[data-guests]');
    this.speedBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-speed]')];
    for (const b of this.speedBtns) b.addEventListener('click', () => h.onSpeed(Number(b.dataset.speed) as Speed));

    const tray = q<HTMLElement>('[data-tray]');
    const items: TrayItem[] = ['path', ...BUILDING_KINDS, 'land'];
    for (const item of items) {
      const b = document.createElement('button');
      b.className = 'card';
      const name = item === 'path' ? 'Footpath' : item === 'land' ? 'Buy land' : BUILDINGS[item].name;
      const price =
        item === 'path' ? `${PATH_COST} / tile` : item === 'land' ? '' : BUILDINGS[item].cost.toLocaleString('en-US');
      const sub =
        item === 'path'
          ? 'Drag to draw'
          : item === 'land'
            ? '7×7 plots'
            : `${QUALITY_NAMES[BUILDINGS[item].quality]} · ${BUILDINGS[item].blurb}`;
      if (item !== 'path' && item !== 'land') {
        const d = BUILDINGS[item];
        b.title = `${d.name}: ${d.w}×${d.h}, ${QUALITY_NAMES[d.quality].toLowerCase()} class, ${d.blurb.toLowerCase()}${d.coast ? ', must be on the shore' : ''}`;
      }
      b.innerHTML = `<span class="icon">${ICONS[item]}</span><span class="name">${name}</span><span class="sub">${sub}</span><span class="price"><span class="coin-icon"></span><span data-price>${price}</span></span>`;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        h.onTrayDown(item, e);
      });
      tray.appendChild(b);
      this.cards.set(item, b);
    }

    this.rotateBtn.addEventListener('click', () => h.onRotate());
    this.demolishBtn.addEventListener('click', () => h.onDemolish());
    this.undoBtn.addEventListener('click', () => h.onUndo());
    q('[data-cancel]').addEventListener('click', () => h.onCancel());
    q('[data-new]').addEventListener('click', () => h.onNewIsland());
  }

  setClock(day: number, time: string, guests: number): void {
    const d = String(day);
    if (this.dayEl.textContent !== d) this.dayEl.textContent = d;
    if (this.timeEl.textContent !== time) this.timeEl.textContent = time;
    const g = String(guests);
    if (this.guestsEl.textContent !== g) this.guestsEl.textContent = g;
  }

  setRating(stars: number): void {
    const el = this.root.querySelector<HTMLElement>('[data-rating]')!;
    const full = Math.round(stars);
    const text = `${'★'.repeat(full)}${'☆'.repeat(5 - full)} ${stars.toFixed(1)}`;
    if (el.textContent !== text) el.textContent = text;
  }

  setSpeed(speed: Speed): void {
    for (const b of this.speedBtns) b.classList.toggle('on', Number(b.dataset.speed) === speed);
  }

  setTab(tab: Tab): void {
    for (const b of this.tabBtns) b.classList.toggle('on', b.dataset.tab === tab);
    this.buildTray.hidden = tab !== 'build';
    this.guestTray.hidden = tab !== 'guests';
    this.researchTray.hidden = tab !== 'research';
    this.toolbar.classList.toggle('hidden', tab !== 'build');
  }

  /** Rebuild the arrival cards when the queue changes; cheap to call every frame. */
  setQueue(queue: Guest[]): void {
    const key = queue.map((g) => g.id).join(',');
    if (key !== this.queueKey) {
      this.queueKey = key;
      this.guestCards.textContent = '';
      this.patienceBars.clear();
      this.guestEls.clear();
      for (const g of queue) this.guestCards.appendChild(this.guestCard(g));
      this.emptyEl.hidden = queue.length > 0;
      this.badgeEl.textContent = queue.length ? String(queue.length) : '';
      this.guestTray.querySelector<HTMLButtonElement>('[data-auto]')!.disabled = queue.length === 0;
    }
    for (const g of queue) {
      const bar = this.patienceBars.get(g.id);
      if (!bar) continue;
      const f = Math.max(0, g.patience / PATIENCE_SECONDS);
      bar.style.width = `${(f * 100).toFixed(1)}%`;
      bar.classList.toggle('urgent', f < 0.3);
    }
  }

  setSelectedGuest(id: number | null): void {
    for (const [gid, el] of this.guestEls) el.classList.toggle('active', gid === id);
  }

  private guestCard(g: Guest): HTMLElement {
    const def = GUEST_TYPES[g.type];
    const b = document.createElement('button');
    b.className = 'card guest';
    const wishes = g.wishes
      .map((w) => `<span class="wish" title="${WISHES[w].label}">${WISH_ICONS[w]}</span>`)
      .join('');
    b.innerHTML = `<span class="icon">${peopleIcon(g)}</span><span class="name">${def.name}</span><span class="sub">${g.nightsLeft} night${g.nightsLeft === 1 ? '' : 's'} · <span class="coin-icon"></span>${g.budget}</span><span class="wishes">${wishes}</span><span class="patience"><i></i></span>`;
    b.title = `${def.name}: wants ${g.wishes.map((w) => WISHES[w].label.toLowerCase()).join(', ')}`;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.handlers.onGuestDown(g.id, e);
    });
    this.patienceBars.set(g.id, b.querySelector<HTMLElement>('.patience i')!);
    this.guestEls.set(g.id, b);
    return b;
  }

  /** A label that follows the finger while a guest card is dragged. */
  showChip(text: string, tone: 'ok' | 'warn' | 'bad' | 'info', x: number, y: number): void {
    const c = this.chipEl;
    c.textContent = text;
    c.dataset.tone = tone;
    c.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - 64)}px) translateX(-50%)`;
    c.classList.add('show');
  }

  hideChip(): void {
    this.chipEl.classList.remove('show');
  }

  setCoins(n: number): void {
    this.coinsEl.textContent = Math.floor(n).toLocaleString('en-US');
    this.coinsEl.classList.toggle('neg', n < 0);
  }

  /** Lock or unlock a build card; `reason` says what research it needs. */
  setLocked(item: TrayItem, reason: string | null): void {
    const c = this.cards.get(item);
    if (!c || (c.dataset.lock ?? '') === (reason ?? '')) return;
    c.classList.toggle('locked', reason !== null);
    c.dataset.lock = reason ?? '';
  }

  lockReason(item: TrayItem): string | null {
    return this.cards.get(item)?.dataset.lock || null;
  }

  /** Research topics as cards, grouped by branch. Cheap to call often. */
  setResearch(points: number, nodes: Array<{ node: ResearchNode; status: NodeStatus }>): void {
    const key = points + '|' + nodes.map((n) => n.node.id + n.status.state + ('reason' in n.status ? n.status.reason : '')).join(',');
    const available = nodes.filter((n) => n.status.state === 'available').length;
    const rb = this.root.querySelector<HTMLElement>('[data-rbadge]')!;
    rb.textContent = available ? String(available) : '';
    if (key === this.researchKey) return;
    this.researchKey = key;
    this.root.querySelector('[data-points]')!.textContent = String(points);
    const html = nodes
      .slice()
      .sort((a, b) => a.node.tier - b.node.tier || a.node.branch.localeCompare(b.node.branch))
      .map(({ node, status }) => {
        const foot =
          status.state === 'done'
            ? '<span class="state done">✓ Researched</span>'
            : status.state === 'available'
              ? `<span class="state go">Research · ${node.cost} pts</span>`
              : `<span class="state">${status.reason}</span>`;
        return `<button class="card topic ${status.state}" data-node="${node.id}" title="${node.blurb}">
          <span class="branch">${BRANCHES[node.branch]} · T${node.tier}</span>
          <span class="name">${node.name}</span>
          <span class="sub">${node.blurb}</span>
          ${foot}
        </button>`;
      })
      .join('');
    this.root.querySelector('[data-research-cards]')!.innerHTML = html;
  }

  setLandPrice(price: number): void {
    const el = this.cards.get('land')?.querySelector('[data-price]');
    if (el) el.textContent = price.toLocaleString('en-US');
  }

  setAffordable(item: TrayItem, ok: boolean): void {
    this.cards.get(item)?.classList.toggle('poor', !ok);
  }

  setActive(item: TrayItem | 'demolish' | null, canRotate: boolean): void {
    for (const [k, b] of this.cards) b.classList.toggle('active', k === item);
    this.demolishBtn.classList.toggle('active', item === 'demolish');
    this.rotateBtn.disabled = !canRotate;
    this.toolbar.classList.toggle('tool-on', item !== null);
  }

  setUndo(enabled: boolean): void {
    this.undoBtn.disabled = !enabled;
  }

  setHint(text: string): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.toggle('show', text.length > 0);
  }

  toast(text: string, tone: 'bad' | 'info' | 'good' = 'bad'): void {
    this.toastEl.textContent = text;
    this.toastEl.dataset.tone = tone;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 1800);
  }
}
