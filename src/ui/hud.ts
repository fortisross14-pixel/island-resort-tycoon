import { BUILDINGS, BUILDING_KINDS, PATH_COST, type BuildingKind } from '../sim/buildings';

export type TrayItem = BuildingKind | 'path';

export interface HudHandlers {
  onTrayDown(item: TrayItem, e: PointerEvent): void;
  onRotate(): void;
  onDemolish(): void;
  onUndo(): void;
  onCancel(): void;
  onNewIsland(): void;
}

const ICONS: Record<TrayItem, string> = {
  path: '<svg viewBox="0 0 32 32"><path d="M6 28 C 10 18, 22 20, 26 4" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/></svg>',
  basicRooms:
    '<svg viewBox="0 0 32 32"><path d="M4 15 L16 6 L28 15 Z" fill="#e0704f"/><rect x="7" y="15" width="18" height="12" fill="#fff4e2" stroke="#d9c4a0"/><rect x="10" y="19" width="4" height="8" fill="#7d5534"/><rect x="18" y="19" width="4" height="4" fill="#3b6e8f"/></svg>',
  snackBar:
    '<svg viewBox="0 0 32 32"><rect x="6" y="15" width="20" height="12" fill="#ffe2bd"/><path d="M4 15 L8 8 H24 L28 15 Z" fill="#f2b441"/><path d="M10 8 L8 15 M16 8 V15 M22 8 L24 15" stroke="#fff" stroke-width="2"/></svg>',
  buffet:
    '<svg viewBox="0 0 32 32"><path d="M2 14 L8 8 H24 L30 14 Z" fill="#3fa7a0"/><rect x="4" y="14" width="24" height="12" fill="#fff4e2"/><rect x="7" y="18" width="18" height="4" fill="#a8754a"/></svg>',
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
  private toastTimer = 0;

  constructor(root: HTMLElement, h: HudHandlers) {
    root.innerHTML = `
      <header class="topbar">
        <div class="stat coins" title="Coins"><span class="coin-icon"></span><b data-coins>0</b></div>
        <div class="stat" title="Day and time">Day <b>1</b> · <span>08:00</span></div>
        <div class="stat rating" title="Star rating (from M5)">☆☆☆☆☆</div>
        <div class="speed" title="Speed controls arrive in M2">
          <button disabled aria-label="Pause">❚❚</button><button disabled class="on">1×</button><button disabled>2×</button><button disabled>4×</button>
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
        <nav class="tray" data-tray></nav>
      </footer>`;
    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.coinsEl = q('[data-coins]');
    this.hintEl = q('[data-hint]');
    this.toastEl = q('[data-toast]');
    this.toolbar = q('[data-toolbar]');
    this.undoBtn = q('[data-undo]');
    this.rotateBtn = q('[data-rotate]');
    this.demolishBtn = q('[data-demolish]');

    const tray = q<HTMLElement>('[data-tray]');
    const items: TrayItem[] = ['path', ...BUILDING_KINDS];
    for (const item of items) {
      const b = document.createElement('button');
      b.className = 'card';
      const name = item === 'path' ? 'Footpath' : BUILDINGS[item].name;
      const price = item === 'path' ? `${PATH_COST} / tile` : BUILDINGS[item].cost.toLocaleString('en-US');
      const sub = item === 'path' ? 'Drag to draw' : `${BUILDINGS[item].w}×${BUILDINGS[item].h} · ${BUILDINGS[item].blurb}`;
      b.innerHTML = `<span class="icon">${ICONS[item]}</span><span class="name">${name}</span><span class="sub">${sub}</span><span class="price"><span class="coin-icon"></span>${price}</span>`;
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

  setCoins(n: number): void {
    this.coinsEl.textContent = Math.floor(n).toLocaleString('en-US');
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

  toast(text: string, tone: 'bad' | 'info' = 'bad'): void {
    this.toastEl.textContent = text;
    this.toastEl.dataset.tone = tone;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 1800);
  }
}
