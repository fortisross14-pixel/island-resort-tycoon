import { BUILDINGS, BUILDING_KINDS, PATH_COST, footprint, type BuildingKind, type Rotation } from './sim/buildings';
import { History } from './sim/history';
import { World, manhattanSteps, type Tile, type WorldSnapshot } from './sim/world';
import { Sim, TICK, type SimEvent, type SimSnapshot } from './sim/sim';
import { CoinPops } from './render/coinPops';
import { FerryView, GuestView } from './render/guestView';
import { InfoPanel } from './ui/panel';
import { NightReportView } from './ui/report';
import { Stage } from './render/stage';
import { WorldView } from './render/worldView';
import { Hud, type Speed, type Tab, type TrayItem } from './ui/hud';
import type { HighlightTone, RoomMark } from './render/worldView';

type Tool =
  | { type: 'none' }
  | { type: 'path' }
  | { type: 'land' }
  | { type: 'build'; kind: BuildingKind; rot: Rotation }
  | { type: 'demolish' };

const SAVE_KEY = 'irt.save.v1';
/** Real seconds between autosaves while the clock runs. */
const AUTOSAVE_SECONDS = 5;

interface SaveFile {
  world: WorldSnapshot;
  sim?: SimSnapshot;
}
/** Pointer travel (px) below which a press counts as a tap. */
const TAP_SLOP = 8;

interface Ptr {
  x: number;
  y: number;
  sx: number;
  sy: number;
}

const HINTS: Record<Tool['type'], string> = {
  land: 'Tap a plot next to your island to buy it. Each plot costs more than the last.',
  none: '',
  path: 'Drag from an existing path to draw. Paths must lead back to the dock.',
  build: 'Drag to position, release to build. Must touch a path.',
  demolish: 'Tap a building or path to remove it (50% refund).',
};

/**
 * Glue between input, the World and the views. Touch rules:
 * one finger = the active tool (or pan when no tool), two fingers = pan + pinch.
 * Mouse: left = tool/pan, right or middle drag = pan, wheel = zoom.
 */
export class Game {
  readonly world: World;
  readonly history: History;
  readonly sim: Sim;
  private stage: Stage;
  private view: WorldView;
  private guestView: GuestView;
  private ferryView: FerryView;
  private coinPops: CoinPops;
  private panel: InfoPanel;
  private report: NightReportView;
  private speed: Speed = 1;
  private tickAcc = 0;
  private sinceSave = 0;
  private gaveUpToast = 0;
  private tab: Tab = 'build';
  /** The arrival card being placed (dragged, or tapped then a room tapped). */
  private selectedGuest: number | null = null;
  private cardDrag: { id: number; sx: number; sy: number; moved: boolean } | null = null;
  private hud: Hud;
  private tool: Tool = { type: 'none' };
  private ptrs = new Map<number, Ptr>();
  /** What the current single-pointer press is doing. */
  private press: 'none' | 'tool' | 'pan' | 'gesture' = 'none';
  private stroke: { last: Tile | null; placed: number; firstError: string | null } | null = null;
  private ghostAt: Tile | null = null;
  private trayDrag: { item: TrayItem; sx: number; sy: number; moved: boolean } | null = null;
  private saveTimer = 0;

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement) {
    const { save, discarded } = loadSave();
    this.world = save ? World.fromSnapshot(save.world) : World.newGame();
    this.sim = new Sim(this.world);
    if (save?.sim) {
      try {
        this.sim.restore(save.sim);
      } catch {
        this.sim.reset();
      }
    }
    this.history = new History(this.world);
    this.stage = new Stage(canvas);
    this.view = new WorldView(this.stage, this.world);
    this.guestView = new GuestView(this.stage, this.sim);
    this.ferryView = new FerryView(this.stage, this.sim);
    this.coinPops = new CoinPops(this.stage);
    this.hud = new Hud(hudRoot, {
      onTrayDown: (item, e) => this.onTrayDown(item, e),
      onRotate: () => this.rotate(),
      onDemolish: () => this.setTool(this.tool.type === 'demolish' ? { type: 'none' } : { type: 'demolish' }),
      onUndo: () => this.undo(),
      onCancel: () => this.setTool({ type: 'none' }),
      onNewIsland: () => this.newIsland(),
      onSpeed: (sp) => this.setSpeed(sp),
      onTab: (tab) => this.setTab(tab),
      onGuestDown: (id, e) => this.onGuestDown(id, e),
      onAutoAssign: () => this.autoAssign(),
    });
    this.panel = new InfoPanel(hudRoot, this.sim);
    this.sim.pauseAtNight = true;
    this.report = new NightReportView(hudRoot, {
      onStartDay: () => this.startDay(),
      onReview: (rv) => {
        const b = this.world.buildings.find((x) => x.id === rv.buildingId);
        if (!b) return;
        const { w, h } = footprint(b.kind, b.rot);
        this.stage.lookAt(b.x + w / 2, b.y + h / 2);
        this.panel.showBuilding(b.id);
      },
    });
    if (this.sim.night) this.report.show(this.sim.night);
    this.sim.on((e) => this.onSimEvent(e));
    this.world.onMoney(() => this.onMoneyChange());
    this.stage.onFrame((dt) => this.frame(dt));
    this.setSpeed(1);
    this.world.onChange(() => this.onWorldChange());
    this.onWorldChange();
    this.setTool({ type: 'none' });
    this.bindInput(canvas);
    if (discarded) this.hud.toast('The island is bigger now: an old prototype save was replaced', 'info');
  }

  // ---------- clock ----------

  setSpeed(sp: Speed): void {
    this.speed = sp;
    this.hud.setSpeed(sp);
    this.stage.requestRender();
  }

  /** Per animation frame: advance the fixed-tick sim, then move the views. */
  private frame(dt: number): boolean {
    if (this.speed > 0) {
      this.tickAcc += dt * this.speed;
      let steps = 0;
      while (this.tickAcc >= TICK && steps < 40) {
        this.sim.step();
        this.tickAcc -= TICK;
        steps++;
      }
      if (steps === 40) this.tickAcc = 0; // tab was asleep: don't try to catch up
      this.sinceSave += dt;
      if (this.sinceSave >= AUTOSAVE_SECONDS) this.save();
    }
    const alpha = this.speed > 0 ? this.tickAcc / TICK : 1;
    this.guestView.update(alpha, this.speed > 0 ? dt : 0);
    this.ferryView.update(this.speed > 0 ? dt : 0);
    const popping = this.coinPops.update(dt * Math.max(this.speed, 1)) || this.view.update(dt);
    this.panel.update(performance.now());
    this.hud.setClock(this.world.day, this.sim.clockText, this.sim.onIsland);
    this.hud.setRating(this.sim.rating);
    const queue = this.sim.queue;
    this.hud.setQueue(queue);
    this.followQueue(queue.length);
    return this.speed > 0 || popping;
  }

  private onSimEvent(e: SimEvent): void {
    switch (e.type) {
      case 'ferryArriving':
        return this.hud.toast('The morning ferry is coming in', 'info');
      case 'ferryDocked':
        if (e.guests === 0) return;
        this.setTab('guests');
        return this.hud.toast(`${e.guests} ${e.guests === 1 ? 'party' : 'parties'} arrived: drag them to rooms`, 'good');
      case 'gaveUp': {
        if (this.selectedGuest === e.guestId) this.selectNextGuest();
        // One toast per wave of departures, not one per party.
        const now = performance.now();
        if (now - this.gaveUpToast > 4000) this.hud.toast('A party gave up waiting and is heading home');
        this.gaveUpToast = now;
        return;
      }
      case 'purchase': {
        const b = this.world.buildings.find((x) => x.id === e.buildingId);
        if (!b) return;
        const { w, h } = footprint(b.kind, b.rot);
        return this.coinPops.spawn(b.x + w / 2, b.y + h / 2, e.amount);
      }
      case 'checkedIn':
        if (this.selectedGuest === e.guestId) this.selectNextGuest();
        else if (this.selectedGuest !== null) this.showRoomMarks();
        return;
      case 'night':
        this.selectGuest(null);
        this.report.show(e.report);
        this.save();
        return;
      case 'newDay':
        this.hud.toast(`Day ${e.day}: the ferry arrives at 08:00`, 'info');
        this.save();
        return;
    }
  }

  private startDay(): void {
    this.report.hide();
    this.sim.startDay();
    if (this.speed === 0) this.setSpeed(1);
  }

  // ---------- check-in (M3) ----------

  setTab(tab: Tab): void {
    this.tab = tab;
    this.hud.setTab(tab);
    if (tab === 'guests') {
      if (this.tool.type !== 'none') this.setTool({ type: 'none' });
      const first = this.sim.queue[0];
      if (this.selectedGuest === null && first) this.selectGuest(first.id);
      this.hud.setHint(this.sim.queue.length ? 'Drag a guest onto a room, or tap a guest and then a room.' : '');
    } else {
      this.selectGuest(null);
      this.hud.setHint(HINTS[this.tool.type]);
    }
  }

  selectGuest(id: number | null): void {
    this.selectedGuest = id;
    this.hud.setSelectedGuest(id);
    this.guestView.setSelected(id);
    if (id === null) this.view.clearRoomMarks();
    else this.showRoomMarks();
    this.stage.requestRender();
  }

  /** Keep the Guests tab pointing at someone while people are waiting. */
  private followQueue(waiting: number): void {
    if (this.tab !== 'guests' || this.cardDrag) return;
    const sel = this.selectedGuest;
    if (sel !== null && !this.sim.queue.some((g) => g.id === sel)) return this.selectNextGuest();
    if (sel === null && waiting > 0) {
      this.selectGuest(this.sim.queue[0].id);
      this.hud.setHint('Drag a guest onto a room, or tap a guest and then a room.');
    }
  }

  /** After placing someone, move straight on to the next card (or back to building when done). */
  private selectNextGuest(): void {
    const next = this.sim.queue[0];
    if (next) return this.selectGuest(next.id);
    this.selectGuest(null);
    if (this.tab === 'guests') this.setTab('build');
  }

  private markTone(score: number): HighlightTone {
    return score >= 70 ? 'ok' : score >= 45 ? 'warn' : 'bad';
  }

  /** Light up every room with how well it suits the selected party. */
  private showRoomMarks(): void {
    const g = this.selectedGuest !== null ? this.sim.guest(this.selectedGuest) : undefined;
    if (!g) return this.view.clearRoomMarks();
    const marks: RoomMark[] = [];
    for (const b of this.world.buildings) {
      if (!this.sim.isRoom(b)) continue;
      const tiles = this.world.footprintTiles(b.kind, b.x, b.y, b.rot);
      if (!this.sim.hasVacancy(b)) marks.push({ id: b.id, tiles, tone: 'info', label: 'Full' });
      else {
        const { score } = this.sim.match(g, b);
        marks.push({ id: b.id, tiles, tone: this.markTone(score), label: String(score) });
      }
    }
    this.view.showRoomMarks(marks);
  }

  /** Room under a screen point, if any. */
  private roomAt(clientX: number, clientY: number) {
    const t = this.tileAt(clientX, clientY);
    const b = t && this.world.buildingAt(t.x, t.y);
    return b && this.sim.isRoom(b) ? b : null;
  }

  private onGuestDown(id: number, e: PointerEvent): void {
    if (this.tool.type !== 'none') this.setTool({ type: 'none' });
    this.selectGuest(id);
    this.cardDrag = { id, sx: e.clientX, sy: e.clientY, moved: false };
  }

  private dragCardTo(e: PointerEvent, canvas: HTMLCanvasElement): void {
    const d = this.cardDrag;
    if (!d) return;
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > TAP_SLOP) d.moved = true;
    if (!d.moved) return;
    const g = this.sim.guest(d.id);
    const room = document.elementFromPoint(e.clientX, e.clientY) === canvas ? this.roomAt(e.clientX, e.clientY) : null;
    this.view.focusRoomMark(room?.id ?? null);
    if (!g) return this.hud.hideChip();
    if (!room) return this.hud.showChip('Drop on a room', 'info', e.clientX, e.clientY);
    if (!this.sim.hasVacancy(room)) return this.hud.showChip('Full', 'bad', e.clientX, e.clientY);
    const m = this.sim.match(g, room);
    const notes = m.notes.map((n) => `${n.ok ? '✓' : '✗'} ${n.text}`).join('  ');
    this.hud.showChip(`${m.score} · ${notes}`, this.markTone(m.score), e.clientX, e.clientY);
  }

  private dropCard(e: PointerEvent, canvas: HTMLCanvasElement): void {
    const d = this.cardDrag;
    this.cardDrag = null;
    this.hud.hideChip();
    this.view.focusRoomMark(null);
    if (!d || !d.moved) return; // a tap: the card stays selected, tap a room next
    if (document.elementFromPoint(e.clientX, e.clientY) !== canvas) return;
    const room = this.roomAt(e.clientX, e.clientY);
    if (room) this.tryCheckIn(d.id, room.id);
  }

  private tryCheckIn(guestId: number, roomId: number): void {
    const r = this.sim.checkIn(guestId, roomId);
    if (!r.ok) return this.hud.toast(r.reason);
    const verdict = r.score >= 70 ? 'Great match' : r.score >= 45 ? 'Checked in' : 'Poor match';
    this.hud.toast(`${verdict} · ${r.score}`, r.score >= 45 ? 'good' : 'bad');
  }

  private autoAssign(): void {
    const n = this.sim.autoCheckInAll();
    const left = this.sim.queue.length;
    if (n === 0) this.hud.toast(left ? 'No free rooms. Build more Basic Rooms!' : 'No one is waiting');
    else this.hud.toast(`Auto-assigned ${n}${left ? `, ${left} still waiting (no free rooms)` : ''}`, 'good');
  }

  // ---------- tools ----------

  setTool(t: Tool): void {
    if (t.type !== 'none' && this.tab !== 'build') this.setTab('build');
    this.tool = t;
    this.ghostAt = null;
    this.view.hideGhost();
    this.view.setGridVisible(t.type !== 'none');
    this.view.setLandMode(t.type === 'land');
    const active: TrayItem | 'demolish' | null =
      t.type === 'build'
        ? t.kind
        : t.type === 'path'
          ? 'path'
          : t.type === 'land'
            ? 'land'
            : t.type === 'demolish'
              ? 'demolish'
              : null;
    this.hud.setActive(active, t.type === 'build');
    this.hud.setHint(HINTS[t.type]);
  }

  private rotate(): void {
    if (this.tool.type !== 'build') return;
    this.tool.rot = ((this.tool.rot + 1) % 4) as Rotation;
    if (this.ghostAt) this.previewBuild(this.ghostAt);
  }

  private undo(): void {
    if (this.history.undo()) this.hud.toast('Undone', 'info');
    if (this.tool.type === 'build' && this.ghostAt) this.previewBuild(this.ghostAt);
  }

  private newIsland(): void {
    if (!window.confirm('Start a new island? Your current island will be lost.')) return;
    this.world.restore(World.newGame().snapshot());
    this.view.frameStart();
    this.sim.reset();
    this.report.hide();
    this.history.clear();
    this.setTool({ type: 'none' });
    this.onWorldChange();
  }

  private onMoneyChange(): void {
    this.hud.setCoins(this.world.money);
    this.hud.setAffordable('path', this.world.money >= PATH_COST);
    this.hud.setLandPrice(this.world.plotPrice);
    this.hud.setAffordable('land', this.world.money >= this.world.plotPrice);
    for (const k of BUILDING_KINDS) this.hud.setAffordable(k, this.world.money >= BUILDINGS[k].cost);
    // A ghost that just became affordable should turn green.
    if (this.tool.type === 'build' && this.ghostAt) this.previewBuild(this.ghostAt);
  }

  private onWorldChange(): void {
    this.onMoneyChange();
    // History commits after the edit that triggered this event, so read it next tick.
    queueMicrotask(() => this.hud.setUndo(this.history.canUndo));
    if (this.selectedGuest !== null) this.showRoomMarks();
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.save(), 300);
  }

  private save(): void {
    this.sinceSave = 0;
    writeSave({ world: this.world.snapshot(), sim: this.sim.snapshot() });
  }

  // ---------- previews ----------

  private tileAt(clientX: number, clientY: number): Tile | null {
    const p = this.stage.groundAt(clientX, clientY);
    return p ? { x: Math.floor(p.x), y: Math.floor(p.z) } : null;
  }

  /** Anchor so the finger sits over the middle of the footprint. */
  private buildAnchor(t: Tile): Tile {
    if (this.tool.type !== 'build') return t;
    const { w, h } = footprint(this.tool.kind, this.tool.rot);
    return { x: t.x - Math.floor((w - 1) / 2), y: t.y - Math.floor((h - 1) / 2) };
  }

  private previewBuild(t: Tile): void {
    if (this.tool.type !== 'build') return;
    this.ghostAt = t;
    const a = this.buildAnchor(t);
    const ok = this.world.canPlaceBuilding(this.tool.kind, a.x, a.y, this.tool.rot).ok;
    this.view.showGhost(this.tool.kind, a.x, a.y, this.tool.rot, ok);
  }

  private previewHover(t: Tile | null): void {
    if (!t) return this.view.hideGhost();
    switch (this.tool.type) {
      case 'build':
        return this.previewBuild(t);
      case 'path':
        if (!this.world.inBounds(t.x, t.y)) return this.view.hideGhost();
        return this.view.highlight([t], this.world.isPath(t.x, t.y) || this.world.canPlacePath(t.x, t.y).ok ? 'ok' : 'bad');
      case 'demolish': {
        const b = this.world.buildingAt(t.x, t.y);
        if (b) return this.view.highlight(this.world.footprintTiles(b.kind, b.x, b.y, b.rot), 'bad');
        if (this.world.isPath(t.x, t.y))
          return this.view.highlight([t], this.world.canRemovePath(t.x, t.y).ok ? 'bad' : 'info');
        return this.view.hideGhost();
      }
      default:
        return this.view.hideGhost();
    }
  }

  // ---------- actions ----------

  private tryBuild(t: Tile): void {
    if (this.tool.type !== 'build') return;
    const a = this.buildAnchor(t);
    const { kind, rot } = this.tool;
    const r = this.history.run(() => this.world.placeBuilding(kind, a.x, a.y, rot));
    if (!r.ok) this.hud.toast(r.reason);
    this.previewBuild(t);
  }

  private tryDemolish(t: Tile): void {
    const r = this.history.run(() => this.world.demolishAt(t.x, t.y));
    if (!r.ok) this.hud.toast(r.reason);
    this.previewHover(t);
  }

  private strokeTo(t: Tile): void {
    const s = this.stroke;
    if (!s) return;
    const steps = s.last ? manhattanSteps(s.last, t) : [t];
    for (const step of steps) {
      if (this.world.isPath(step.x, step.y)) continue;
      const r = this.world.placePath(step.x, step.y);
      if (r.ok) {
        s.placed++;
        this.history.touch();
      } else if (!s.firstError) s.firstError = r.reason;
    }
    s.last = t;
    this.view.highlight([t], this.world.isPath(t.x, t.y) ? 'ok' : 'bad');
  }

  private endStroke(): void {
    if (!this.stroke) return;
    if (this.stroke.placed === 0 && this.stroke.firstError) this.hud.toast(this.stroke.firstError);
    this.history.commit();
    this.stroke = null;
    this.onWorldChange();
  }

  /** A tap with no tool: pick a guest or building, or place the selected arrival. */
  private inspect(t: Tile, clientX: number, clientY: number): void {
    const g = this.guestView.pickScreen(clientX, clientY, this.stage.camera, this.stage.canvas);
    if (g && this.sim.queue.includes(g)) {
      this.setTab('guests');
      return this.selectGuest(g.id);
    }
    const b = this.world.buildingAt(t.x, t.y);
    if (this.selectedGuest !== null) {
      if (b && this.sim.isRoom(b)) return this.tryCheckIn(this.selectedGuest, b.id);
      if (!g) return this.selectGuest(null);
    }
    if (g) return this.panel.showGuest(g.id);
    if (b) return this.panel.showBuilding(b.id);
    this.panel.close();
  }

  // ---------- input ----------

  private onTrayDown(item: TrayItem, e: PointerEvent): void {
    if (item === 'path') this.setTool({ type: 'path' });
    else if (item === 'land') this.setTool(this.tool.type === 'land' ? { type: 'none' } : { type: 'land' });
    else {
      const rot = this.tool.type === 'build' && this.tool.kind === item ? this.tool.rot : 0;
      this.setTool({ type: 'build', kind: item, rot });
    }
    this.trayDrag = { item, sx: e.clientX, sy: e.clientY, moved: false };
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    // Drags that start on a tray card.
    window.addEventListener('pointermove', (e) => this.dragCardTo(e, canvas));
    window.addEventListener('pointerup', (e) => this.dropCard(e, canvas));
    window.addEventListener('pointercancel', () => {
      this.cardDrag = null;
      this.hud.hideChip();
    });
    window.addEventListener('pointermove', (e) => {
      const d = this.trayDrag;
      if (!d) return;
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > TAP_SLOP) d.moved = true;
      if (d.moved && document.elementFromPoint(e.clientX, e.clientY) === canvas && this.tool.type === 'build') {
        const t = this.tileAt(e.clientX, e.clientY);
        if (t) this.previewBuild(t);
      }
    });
    window.addEventListener('pointerup', (e) => {
      const d = this.trayDrag;
      this.trayDrag = null;
      if (!d || !d.moved || this.tool.type !== 'build') return;
      if (document.elementFromPoint(e.clientX, e.clientY) !== canvas) return this.view.hideGhost();
      const t = this.tileAt(e.clientX, e.clientY);
      if (t) this.tryBuild(t);
    });
    window.addEventListener('pointercancel', () => (this.trayDrag = null));

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.onDown(e, canvas));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e, true));
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.ptrs.size && this.tool.type !== 'none') this.view.hideGhost();
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.stage.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        return this.undo();
      }
      if (e.key === 'Enter' && this.report.open) return this.startDay();
      if (e.key === ' ') {
        e.preventDefault();
        return this.setSpeed(this.speed === 0 ? 1 : 0);
      }
      switch (e.key.toLowerCase()) {
        case 'escape':
          if (this.selectedGuest !== null) return this.selectGuest(null);
          if (this.panel.open) return this.panel.close();
          return this.setTool({ type: 'none' });
        case 'g':
          return this.setTab(this.tab === 'guests' ? 'build' : 'guests');
        case 'l':
          return this.setTool({ type: 'land' });
        case 'r':
          return this.rotate();
        case 'x':
          return this.setTool({ type: 'demolish' });
        case '1':
          return this.setTool({ type: 'path' });
        case '2':
        case '3':
        case '4':
          return this.setTool({ type: 'build', kind: BUILDING_KINDS[Number(e.key) - 2], rot: 0 });
      }
    });
  }

  private onDown(e: PointerEvent, canvas: HTMLCanvasElement): void {
    canvas.setPointerCapture(e.pointerId);
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });

    if (this.ptrs.size === 2) {
      // Second finger: switch to pan + pinch and drop whatever the first finger was doing.
      if (this.stroke) this.endStroke();
      this.press = 'gesture';
      this.view.hideGhost();
      return;
    }
    if (this.ptrs.size > 2) return;

    const panButton = e.pointerType === 'mouse' && (e.button === 1 || e.button === 2);
    if (panButton || this.tool.type === 'none') {
      this.press = 'pan';
      return;
    }
    this.press = 'tool';
    const t = this.tileAt(e.clientX, e.clientY);
    if (this.tool.type === 'path') {
      this.history.begin();
      this.stroke = { last: null, placed: 0, firstError: null };
      if (t) {
        // Starting on an existing path just anchors the stroke there.
        if (this.world.isPath(t.x, t.y)) this.stroke.last = t;
        else this.strokeTo(t);
      }
    } else if (t) this.previewHover(t);
  }

  private onMove(e: PointerEvent): void {
    const p = this.ptrs.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.previewHover(this.tileAt(e.clientX, e.clientY));
      return;
    }
    const px = p.x;
    const py = p.y;

    if (this.press === 'gesture' && this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()];
      const midBefore = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distBefore = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = e.clientX;
      p.y = e.clientY;
      const [a2, b2] = [...this.ptrs.values()];
      const mid = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
      const dist = Math.hypot(a2.x - b2.x, a2.y - b2.y);
      this.stage.panScreen(midBefore.x, midBefore.y, mid.x, mid.y);
      if (distBefore > 0) this.stage.zoomAt(dist / distBefore, mid.x, mid.y);
      return;
    }

    p.x = e.clientX;
    p.y = e.clientY;
    if (this.press === 'pan') return this.stage.panScreen(px, py, p.x, p.y);
    if (this.press !== 'tool') return;

    const t = this.tileAt(e.clientX, e.clientY);
    if (!t) return;
    if (this.tool.type === 'path') {
      const last = this.stroke?.last;
      if (!last || last.x !== t.x || last.y !== t.y) this.strokeTo(t);
    } else this.previewHover(t);
  }

  private onUp(e: PointerEvent, cancelled = false): void {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    const press = this.press;
    if (this.ptrs.size > 0) {
      // Lifting one finger of a pinch: wait for the rest without acting.
      if (press === 'gesture') return;
    }
    this.press = 'none';
    if (press === 'gesture') {
      if (e.pointerType !== 'mouse') this.view.hideGhost();
      return;
    }

    const tap = Math.hypot(p.x - p.sx, p.y - p.sy) <= TAP_SLOP;
    const t = this.tileAt(e.clientX, e.clientY);
    if (cancelled) {
      if (this.stroke) this.endStroke();
      return;
    }
    if (press === 'pan') {
      if (tap && t && this.tool.type === 'none') this.inspect(t, e.clientX, e.clientY);
      return;
    }
    if (press !== 'tool') return;
    switch (this.tool.type) {
      case 'path':
        this.endStroke();
        if (e.pointerType !== 'mouse') this.view.hideGhost();
        return;
      case 'build':
        if (t) this.tryBuild(t);
        if (e.pointerType !== 'mouse') this.view.hideGhost();
        return;
      case 'demolish':
        if (t && tap) this.tryDemolish(t);
        if (e.pointerType !== 'mouse') this.view.hideGhost();
        return;
      case 'land':
        if (t && tap) this.tryBuyLand(t);
        return;
    }
  }

  private tryBuyLand(t: Tile): void {
    const plot = this.world.plotAt(t.x, t.y);
    if (!plot) return;
    const price = this.world.plotPrice;
    const r = this.history.run(() => this.world.buyPlot(plot.id));
    if (!r.ok) return this.hud.toast(r.reason);
    this.hud.toast(`New land! ${price.toLocaleString('en-US')} coins`, 'good');
  }
}

function loadSave(): { save: SaveFile | null; discarded: boolean } {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { save: null, discarded: false };
    const data = JSON.parse(raw) as SaveFile | WorldSnapshot;
    // M1 saves held just the world snapshot.
    const save = 'world' in data ? data : { world: data };
    World.fromSnapshot(save.world); // throws if the save doesn't fit this version
    return { save, discarded: false };
  } catch {
    // Saves from before the plotted map (M1–M5) don't fit the new island.
    return { save: null, discarded: true };
  }
}

function writeSave(s: SaveFile): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode): the island just won't persist */
  }
}
