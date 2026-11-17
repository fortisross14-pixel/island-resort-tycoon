import { BUILDINGS, BUILDING_KINDS, PATH_COST, footprint, type BuildingKind, type Rotation } from './sim/buildings';
import { History } from './sim/history';
import { LEVEL_HEIGHT, World, manhattanSteps, type Tile } from './sim/world';
import { Sim, TICK, type SimEvent } from './sim/sim';
import { parseSave, type SaveFile } from './sim/save';
import { CoinPops } from './render/coinPops';
import { FerryView, GuestView } from './render/guestView';
import { InfoPanel } from './ui/panel';
import { NightReportView } from './ui/report';
import { GoalsView, certificateHtml, milestoneHtml, type NewGameChoice } from './ui/goals';
import { HomeScreen } from './ui/home';
import { Profile, type ProfileData } from './sim/profile';
import { MEDAL_NAMES, SCENARIOS, applyPrebuilt, type MedalTier } from './sim/scenario';
import { islandLayout } from './sim/islands';

/** The sandbox is played on the biggest island so far. */
const SANDBOX_ISLAND = 'twinPalms';
import { Stage } from './render/stage';
import { WorldView } from './render/worldView';
import { ActivityView } from './render/activityView';
import { SLOTS, SLOT_NAMES, activityOf, activityPrice, canStepOn, landmarksOn, routeQuality, routeStarts, type Slot } from './sim/activities';
import { GREET, ROLE_NAMES, hubTask, type Role } from './sim/staff';
import { setWindowGlow } from './render/models';
import { Hud, type PeopleData, type Speed, type Tab, type TrayItem } from './ui/hud';
import { Sound } from './ui/sfx';
import { monthName, monthYear } from './sim/calendar';
import { Coach, type CoachState } from './ui/coach';
import type { HighlightTone, RoomMark } from './render/worldView';

type Tool =
  | { type: 'none' }
  | { type: 'path' }
  | { type: 'land' }
  | { type: 'build'; kind: BuildingKind; rot: Rotation }
  | { type: 'demolish' }
  /** Carrying a building to a new spot (Pass 5). */
  | { type: 'move'; id: number; rot: Rotation }
  /** Painting the beach area: the first tile decides whether the drag tags or untags. */
  | { type: 'beach'; on: boolean | null }
  /** Drawing a hike trail or boat route for an activity hub (Pass 4 step 3). */
  | { type: 'route'; hubId: number; tiles: Tile[] };

const SAVE_KEY = 'irt.save.v1';
/** The save as it was at the start of the current day. */
const BACKUP_KEY = 'irt.save.backup';
const SETTINGS_KEY = 'irt.settings.v1';
const PROFILE_KEY = 'irt.profile.v1';

type Settings = { sound: boolean; reduceMotion: boolean };

function loadSettings(): Settings {
  const osReduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return { sound: s.sound ?? true, reduceMotion: s.reduceMotion ?? osReduce };
  } catch {
    return { sound: true, reduceMotion: osReduce };
  }
}
/** Real seconds between autosaves while the clock runs. */
const AUTOSAVE_SECONDS = 5;

/** Pointer travel (px) below which a press counts as a tap. */
const TAP_SLOP = 8;

interface Ptr {
  x: number;
  y: number;
  sx: number;
  sy: number;
}

const GUEST_HINT = 'Drag a guest onto a room';

const HINTS: Record<Tool['type'], string> = {
  route: 'Drag from the hub past the landmarks · ✓ to save',
  land: 'Tap a plot next to your island',
  none: '',
  path: 'Draw from a path that reaches the dock',
  build: 'Tap or drag next to a path',
  demolish: 'Tap to bulldoze: buildings and paths (50% back), jungle or rock',
  move: 'Tap where it should go · R or ⟳ to turn',
  beach: 'Drag over your sand to mark the beach · drag over it again to clear · it needs a path',
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
  private goals: GoalsView;
  private newGame: HomeScreen;
  /** What carries over between missions: experience, research and medals (Pass 4 step 4). */
  readonly profile: Profile;
  private certificate: HTMLElement;
  /** Medals won at the moment on screen, and the speed to go back to (Pass 5). */
  private milestone: { won: Array<{ tier: MedalTier; xp: number; first: boolean }>; speed: Speed } | null = null;
  private speed: Speed = 1;
  private tickAcc = 0;
  private sinceSave = 0;
  private gaveUpToast = 0;
  private tab: Tab = 'none';
  private sfx = new Sound();
  private settings = loadSettings();
  private researchKey = '';
  private saveWarned = false;
  private lightInit = false;
  private lastBuildCost = 0;
  private peopleRole: Role = 'operations';
  private offerShown: Role | null = null;
  private activityView: ActivityView;
  private planRefresh = 0;
  private coach!: Coach;
  private coachBase = { paths: 0, arrived: false, checkedIn: 0, night: false };
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
    const { save, discarded, note } = loadSave();
    this.world = save ? World.fromSnapshot(save.world) : World.onIsland(islandLayout(SCENARIOS[0].island));
    this.sim = new Sim(this.world);
    this.profile = loadProfile(save?.sim?.research.done ?? []);
    this.sim.research = this.profile.research;
    this.sim.sharedResearch = true;
    let simLoaded = false;
    if (save?.sim) {
      try {
        this.sim.restore(save.sim);
        simLoaded = true;
      } catch {
        this.sim.reset();
      }
    }
    // Resorts from before Pass 5 get their Welcome Center too.
    if (this.world.layout.terrain) this.world.placeWelcomeCenter();
    this.history = new History(this.world);
    this.stage = new Stage(canvas);
    this.view = new WorldView(this.stage, this.world);
    this.guestView = new GuestView(this.stage, this.sim);
    this.ferryView = new FerryView(this.stage, this.sim);
    this.activityView = new ActivityView(this.stage, this.world, this.sim);
    this.coinPops = new CoinPops(this.stage);
    this.hud = new Hud(hudRoot, {
      onMaintenance: (level) => {
        this.sim.maintenance = level;
        this.refreshRatings();
        this.save();
      },
      onTrayDown: (item, e) => this.onTrayDown(item, e),
      onTraySelect: (item) => this.selectTrayItem(item),
      onGoals: () => {
        const open = !this.goals.isOpen;
        if (open) this.setTab('none');
        this.goals.toggle(open);
      },
      onToggleSound: () => this.applySettings({ ...this.settings, sound: !this.settings.sound }),
      onToggleMotion: () => this.applySettings({ ...this.settings, reduceMotion: !this.settings.reduceMotion }),
      onRotate: () => this.rotate(),
      onDemolish: () => this.setTool(this.tool.type === 'demolish' ? { type: 'none' } : { type: 'demolish' }),
      onUndo: () => this.undo(),
      onCancel: () => (this.tool.type === 'route' ? this.finishRoute(true) : this.setTool({ type: 'none' })),
      onPlanToggle: (hubId, slot) => this.togglePlan(hubId, slot),
      onStaffOffer: (role) => {
        this.sim.offerStaff(role);
        this.offerShown = role;
        this.refreshPeople();
      },
      onHire: (role, i) => {
        const r = this.sim.hire(role, i);
        if (!r.ok) return this.hud.toast(r.reason);
        this.sfx.play('chime');
        this.hud.toast(`${r.worker.name} joins the ${ROLE_NAMES[role].toLowerCase()} team`, 'good');
        this.offerShown = null;
        this.refreshPeople();
        this.save();
      },
      onFire: (id) => {
        const w = this.sim.staff.find((x) => x.id === id);
        this.sim.fire(id);
        if (w) this.hud.toast(`${w.name} has left`, 'info');
        this.refreshPeople();
        this.save();
      },
      onAssign: (workerId, target) => this.assignStaff(workerId, target),
      onPeopleRole: (role) => {
        this.peopleRole = role;
        this.offerShown = null;
        this.refreshPeople();
      },
      onPlanOpen: (hubId) => this.focusBuilding(hubId),
      onNewIsland: () => this.newIsland(),
      onSpeed: (sp) => this.setSpeed(sp),
      onTab: (tab) => this.setTab(tab),
      onGuestDown: (id, e) => this.onGuestDown(id, e),
      onAutoAssign: () => this.autoAssign(),
      onResearch: (id) => this.research(id),
    });
    this.hud.onBusinessView = () => this.refreshBusiness();
    this.panel = new InfoPanel(hudRoot, this.sim, {
      addFloor: (id) => {
        const r = this.history.run(() => this.world.addFloor(id, this.sim.maxFloors));
        this.hud.toast(r.ok ? 'New floor: 2 more rooms' : r.reason, r.ok ? 'good' : 'bad');
      },
      addElevator: (id) => {
        const r = this.history.run(() => this.world.addElevator(id));
        this.hud.toast(r.ok ? 'Elevator installed' : r.reason, r.ok ? 'good' : 'bad');
      },
      drawRoute: (id) => this.startRoute(id),
      move: (id) => {
        const b = this.world.buildings.find((x) => x.id === id);
        if (!b) return;
        this.panel.close();
        this.setTool({ type: 'move', id, rot: b.rot });
        this.hud.toast(`Moving costs ${this.world.moveCost(id).toLocaleString('en-US')} coins`, 'info');
      },
      togglePlan: (id, slot) => this.togglePlan(id, slot),
      upgrade: (id) => {
        const r = this.history.run(() => this.world.upgrade(id));
        if (!r.ok) {
          this.sfx.play('error');
          return this.hud.toast(r.reason);
        }
        this.sfx.play('fanfare');
        this.hud.toast(`Welcome Center upgraded: ${this.sim.welcomeCapacity} parties a month`, 'good');
      },
      welcome: (opt) => {
        this.sim.welcome = { ...this.sim.welcome, [opt]: !this.sim.welcome[opt] };
        this.save();
      },
      repair: (id) => {
        const r = this.history.run(() => this.world.repair(id));
        if (r.ok) this.sfx.play('place');
        this.hud.toast(r.ok ? 'Repaired: like new' : r.reason, r.ok ? 'good' : 'bad');
      },
    });
    this.sim.pauseAtNight = true;
    this.report = new NightReportView(hudRoot, {
      onStartDay: () => this.startDay(),
      onOffer: (accept) => {
        if (accept && this.sim.acceptOffer()) this.hud.toast('Investor on board: coins added', 'good');
        else this.sim.declineOffer();
        if (this.sim.night) this.report.show({ ...this.sim.night, offer: null });
      },
      onReview: (rv) => {
        const b = this.world.buildings.find((x) => x.id === rv.buildingId);
        if (!b) return;
        const { w, h } = footprint(b.kind, b.rot);
        this.stage.lookAt(b.x + w / 2, b.y + h / 2);
        this.panel.showBuilding(b.id);
      },
    });
    if (this.sim.night) this.report.show(this.sim.night);
    this.goals = new GoalsView(hudRoot, (open) => this.hud.setGoalsOpen(open));
    this.newGame = new HomeScreen(
      hudRoot,
      this.profile,
      {
        onPlay: (c) => this.startNewGame(c),
        onContinue: () => {},
        onBuy: (id) => this.buyResearch(id),
      },
      () => ({ name: this.sim.campaign?.def.name ?? 'Sandbox', when: monthYear(this.world.day) }),
    );
    this.coach = new Coach(hudRoot);
    this.certificate = document.createElement('div');
    this.certificate.className = 'report-backdrop';
    this.certificate.hidden = true;
    this.certificate.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-keep]')) {
        this.certificate.hidden = true;
        // Back to the speed the player had before the medal (unless the night report is up).
        if (this.milestone && this.milestone.speed > 0 && !this.sim.night) this.setSpeed(this.milestone.speed);
        this.milestone = null;
      }
      if (t.closest('[data-new]')) {
        this.certificate.hidden = true;
        this.milestone = null;
        this.newGame.show(true, !Coach.seen);
      }
    });
    hudRoot.appendChild(this.certificate);
    this.attachCampaign();
    this.sim.on((e) => this.onSimEvent(e));
    this.world.onMoney(() => this.onMoneyChange());
    this.stage.onFrame((dt) => this.frame(dt));
    this.setSpeed(1);
    this.world.onChange(() => this.onWorldChange());
    this.onWorldChange();
    this.setTool({ type: 'none' });
    this.setTab('none');
    this.applySettings(this.settings);
    this.bindInput(canvas);
    this.refreshResearch(true);
    this.refreshRatings();
    if (!simLoaded) {
      this.setSpeed(0);
      this.newGame.show(false, !Coach.seen);
    }
    if (discarded) this.hud.toast('The island is bigger now: an old prototype save was replaced', 'info');
    else if (note) this.hud.toast(note, 'info');
  }

  // ---------- clock ----------

  setSpeed(sp: Speed): void {
    this.speed = sp;
    this.updateCoach();
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
    const tripsMoving = this.activityView.update(this.speed > 0 ? dt : 0);
    if (this.tab === 'plan' && performance.now() - this.planRefresh > 500) this.refreshPlan();
    this.ferryView.update(this.speed > 0 ? dt : 0);
    // Both must run every frame (|| would skip the view while coins are popping).
    const coinsMoving = this.coinPops.update(dt * Math.max(this.speed, 1));
    const viewMoving = this.view.update(dt);
    const popping = coinsMoving || viewMoving || tripsMoving;
    this.panel.update(performance.now());
    this.hud.setClock(this.world.day, this.sim.clockText, this.sim.onIsland);
    this.updateLight();
    this.hud.setRating(this.sim.rating);
    this.goals.update(performance.now());
    this.refreshResearch();
    const queue = this.sim.queue;
    this.hud.setQueue(queue);
    this.followQueue(queue.length);
    return this.speed > 0 || popping;
  }

  /** Day and night: scene lights, glowing windows and the HUD's sky tint. */
  private updateLight(): void {
    const before = this.stage.night;
    this.stage.setTimeOfDay(this.sim.night ? 24 * 60 : this.sim.minutes);
    const n = this.stage.night;
    if (n === before && this.lightInit) return;
    this.lightInit = true;
    setWindowGlow(n);
    document.documentElement.style.setProperty('--night', n.toFixed(2));
  }

  private coachState(): CoachState {
    const b = this.world.buildings;
    const c = this.coachBase;
    return {
      newPaths: this.world.pathTiles().length - c.paths,
      rooms: b.filter((x) => BUILDINGS[x.kind].family === 'rooms').length,
      food: b.filter((x) => BUILDINGS[x.kind].family === 'food').length,
      playing: this.speed > 0,
      arrived: c.arrived,
      checkedIn: c.checkedIn,
      night: c.night,
    };
  }

  private updateCoach(): void {
    if (this.coach.active) this.coach.update(this.coachState());
  }

  /** Start the guided first day on a fresh island, paused so the player can build first. */
  private startCoach(): void {
    this.coachBase = { paths: this.world.pathTiles().length, arrived: false, checkedIn: 0, night: false };
    this.coach.start();
    this.setSpeed(0);
  }

  private onSimEvent(e: SimEvent): void {
    if (e.type === 'review' || e.type === 'night') this.refreshRatings();
    if (this.coach.active) {
      if (e.type === 'ferryDocked' && e.guests > 0) this.coachBase.arrived = true;
      if (e.type === 'checkedIn') this.coachBase.checkedIn++;
      if (e.type === 'night') this.coachBase.night = true;
      queueMicrotask(() => this.updateCoach());
    }
    switch (e.type) {
      case 'ferryArriving':
        this.sfx.play('horn');
        return this.hud.toast('The ferry is coming in', 'info');
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
        this.sfx.play('coin');
        return this.coinPops.spawn(b.x + w / 2, b.y + h / 2, e.amount, this.world.heightAt(b.x, b.y) * LEVEL_HEIGHT);
      }
      case 'checkedIn':
        this.sfx.play('chime');
        if (this.selectedGuest === e.guestId) this.selectNextGuest();
        else if (this.selectedGuest !== null) this.showRoomMarks();
        return;
      case 'night':
        this.selectGuest(null);
        this.report.show(e.report);
        this.save();
        return;
      case 'newDay':
        this.hud.toast(`${monthYear(e.day)}: the ferry docks early in the month`, 'info');
        this.save(true);
        return;
    }
  }

  private research(id: string): void {
    const r = this.sim.researchTopic(id);
    if (!r.ok) {
      this.sfx.play('error');
      return this.hud.toast(r.reason);
    }
    this.refreshResearch(true);
    this.sfx.play('chime');
    const node = this.sim.researchNodes.find((n) => n.node.id === id)?.node;
    this.hud.celebrate('Research done', node ? `${node.name}: new buildings to build` : 'New buildings to build', false);
  }

  /** The ratings popover: after reviews, at night, and on a new game or load. */
  private refreshRatings(): void {
    this.hud.setRatings(this.sim.ratings, this.sim.maintenance);
  }

  /** Research cards and build locks change only with points, rating or a finished topic. */
  private refreshResearch(force = false): void {
    const r = this.sim.research;
    const key = `${r.points}|${this.sim.rating.toFixed(2)}|${this.sim.progression}|${this.sim.researchNodes.filter((n) => n.status.state === 'done').length}`;
    if (!force && key === this.researchKey) return;
    this.researchKey = key;
    this.hud.setResearch(r.points, this.sim.researchNodes);
    this.updateLocks();
  }

  private applySettings(s: Settings): void {
    this.settings = s;
    this.sfx.enabled = s.sound;
    document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
    this.coinPops.reduceMotion = s.reduceMotion;
    this.view.reduceMotion = s.reduceMotion;
    this.hud.setSettings(s.sound, s.reduceMotion);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* settings are a convenience */
    }
  }

  private updateLocks(): void {
    for (const k of BUILDING_KINDS) {
      const g = this.sim.buildGate(k);
      this.hud.setLocked(k, g.ok ? null : g.reason);
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
    if (tab === 'plan') this.refreshBusiness();
    // Sheets and the side panel share the screen on phones: one at a time.
    if (tab !== 'none' && window.innerWidth < 700) this.panel.close();
    if (tab === 'guests') {
      if (this.tool.type !== 'none') this.setTool({ type: 'none' });
      const first = this.sim.queue[0];
      if (this.selectedGuest === null && first) this.selectGuest(first.id);
      this.hud.setHint(this.sim.queue.length ? GUEST_HINT : '');
    } else {
      this.selectGuest(null);
      this.hud.setHint(HINTS[this.tool.type]);
    }
    if (tab !== 'none') this.goals.toggle(false);
    if (tab !== 'build' && tab !== 'none' && this.tool.type !== 'none') this.setTool({ type: 'none' });
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
      this.hud.setHint(GUEST_HINT);
    }
  }

  /** After placing someone, move straight on to the next card (or back to building when done). */
  private selectNextGuest(): void {
    const next = this.sim.queue[0];
    if (next) return this.selectGuest(next.id);
    this.selectGuest(null);
    if (this.tab === 'guests') this.setTab('none');
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
      if (!this.sim.hasVacancy(b)) marks.push({ id: b.id, tiles, tone: 'info', label: 'Full', floors: b.floors });
      else {
        const { score } = this.sim.match(g, b);
        marks.push({ id: b.id, tiles, tone: this.markTone(score), label: String(score), floors: b.floors });
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
    if (!r.ok) {
      this.sfx.play('error');
      return this.hud.toast(r.reason);
    }
    const verdict = r.score >= 70 ? 'Great match' : r.score >= 45 ? 'Checked in' : 'Poor match';
    this.hud.toast(`${verdict} · ${r.score}`, r.score >= 45 ? 'good' : 'bad');
  }

  private autoAssign(): void {
    if (!this.sim.hasFrontDesk) return this.hud.toast('Build a Front Desk to auto-assign guests');
    const n = this.sim.autoCheckInAll();
    const left = this.sim.queue.length;
    if (n === 0) this.hud.toast(left ? 'No free rooms. Build more Basic Rooms!' : 'No one is waiting');
    else this.hud.toast(`Auto-assigned ${n}${left ? `, ${left} still waiting (no free rooms)` : ''}`, 'good');
  }

  // ---------- tools ----------

  setTool(t: Tool): void {
    if (this.tool.type === 'route' && t.type !== 'route') this.activityView.setDraft([], [], true, null);
    if (t.type === 'route') {
      this.panel.close();
      if (this.tab !== 'none') this.setTab('none');
    } else if (t.type === 'move') {
      if (this.tab !== 'none') this.setTab('none');
    } else if (t.type !== 'none' && this.tab !== 'build') this.setTab('build');
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
              ? 'bulldoze'
              : null;
    this.hud.setActive(t.type === 'route' ? 'route' : t.type === 'move' ? 'route' : active, t.type === 'build' || t.type === 'move');
    this.hud.setHint(HINTS[t.type]);
    if (t.type === 'route') this.drawDraft();
  }

  // ---------- activities (Pass 4 step 3) ----------

  private focusBuilding(id: number): void {
    const b = this.world.buildings.find((x) => x.id === id);
    if (!b) return;
    const { w, h } = footprint(b.kind, b.rot);
    this.stage.lookAt(b.x + w / 2, b.y + h / 2);
    this.setTab('none');
    this.panel.showBuilding(id);
  }

  private togglePlan(hubId: number, slot: Slot): void {
    const r = this.sim.setPlanned(hubId, slot, !this.sim.isPlanned(hubId, slot));
    if (!r.ok) {
      this.sfx.play('error');
      this.hud.toast(r.reason);
    } else this.sfx.play('tap');
    this.refreshPlan();
    this.save();
  }

  // ---------- business: finances and people (Pass 5) ----------

  private refreshBusiness(): void {
    this.refreshPlan();
    this.refreshPeople();
    this.refreshFinances();
  }

  private refreshFinances(): void {
    const months = this.sim.books.slice(-6).map((b) => ({
      label: monthName(b.month, true),
      revenue: { rooms: b.rooms, venues: b.venues, activities: b.activities },
      expenses: { upkeep: b.upkeep, wages: b.wages, supplies: b.supplies, other: b.other },
    }));
    this.hud.setFinances({ months });
  }

  /** Who is on what, for the People view. */
  private refreshPeople(): void {
    const sim = this.sim;
    const role = this.peopleRole;
    const name = (id: number) => this.world.buildings.find((b) => b.id === id);
    const taskLabel = (task: string) => {
      if (task === GREET) return 'greeting';
      const b = name(Number(task.split(':')[1]));
      return b ? (activityOf(b.kind)?.name ?? BUILDINGS[b.kind].name).toLowerCase() : '';
    };
    const workers = sim.staff
      .filter((w) => w.role === role)
      .map((w) => ({
        id: w.id,
        name: w.name,
        skill: w.skill,
        wage: w.wage,
        role: w.role,
        busy:
          w.role === 'operations'
            ? SLOTS.filter((sl) => w.shifts?.[sl]).map((sl) => `${SLOT_NAMES[sl].toLowerCase()}: ${taskLabel(w.shifts![sl]!)}`).join(', ')
            : w.role === 'security' && w.post
              ? `at the ${BUILDINGS[name(Number(w.post.split(':')[1]))?.kind ?? 'pool'].name}`
              : '',
      }));
    const data: PeopleData = { role, workers, candidates: this.offerShown === role ? (sim.candidates[role] ?? null) : null };
    if (role === 'maintenance') {
      const need = this.world.buildings.filter((b) => BUILDINGS[b.kind].family !== 'decor').length;
      const cov = sim.maintenanceCoverage;
      data.coverage =
        cov >= 1
          ? `The team keeps up with all ${need} buildings.`
          : `The team keeps up with about ${Math.round(cov * 100)}% of your ${need} buildings: things wear faster and rooms aren’t as clean. Hire more.`;
    }
    if (role === 'operations') {
      const rows: NonNullable<PeopleData['shifts']> = [];
      const who = (task: string, sl: Slot) => sim.staff.find((w) => w.role === 'operations' && w.shifts?.[sl] === task)?.name ?? null;
      if (this.world.buildings.some((b) => b.kind === 'welcomeCenter'))
        rows.push({
          task: GREET,
          label: 'Greeting',
          cells: {
            morning: { open: true, who: who(GREET, 'morning') },
            afternoon: { open: false, who: null, note: 'mornings only' },
            evening: { open: false, who: null, note: '' },
          },
        });
      for (const b of this.world.buildings.filter((x) => activityOf(x.kind))) {
        const task = hubTask(b.id);
        const cells = Object.fromEntries(
          SLOTS.map((sl) => [sl, sim.isPlanned(b.id, sl) ? { open: true, who: who(task, sl) } : { open: false, who: null, note: 'not planned' }]),
        ) as Record<Slot, { open: boolean; who: string | null; note?: string }>;
        rows.push({ task, label: activityOf(b.kind)!.name, cells });
      }
      data.shifts = rows;
    }
    if (role === 'security')
      data.posts = this.world.buildings
        .filter((b) => b.kind === 'pool' || b.kind === 'lifeguardTower')
        .map((b) => ({ id: b.id, label: BUILDINGS[b.kind].name, who: sim.guardAt(b.id)?.name ?? null }));
    this.hud.setPeople(data);
  }

  private assignStaff(workerId: number | null, target: string): void {
    const parts = target.split(':');
    let r: { ok: true } | { ok: false; reason: string } = { ok: true };
    if (parts[0] === 'shift') {
      const slot = parts[1] as Slot;
      const task = parts.slice(2).join(':');
      if (workerId === null) {
        const w = this.sim.staff.find((x) => x.shifts?.[slot] === task);
        if (w) r = this.sim.assignShift(w.id, slot, null);
      } else r = this.sim.assignShift(workerId, slot, task);
    } else if (parts[0] === 'post') {
      const id = Number(parts[1]);
      if (workerId === null) {
        const w = this.sim.guardAt(id);
        if (w) r = this.sim.assignPost(w.id, null);
      } else r = this.sim.assignPost(workerId, id);
    }
    if (!r.ok) {
      this.sfx.play('error');
      this.hud.toast(r.reason);
    } else this.sfx.play('tap');
    this.refreshPeople();
    this.refreshPlan();
    this.save();
  }

  /** The Plan sheet rows: every activity hub with its slots and today's turnout. */
  private refreshPlan(): void {
    this.planRefresh = performance.now();
    const rows = this.world.buildings
      .filter((b) => activityOf(b.kind))
      .map((b) => {
        const def = activityOf(b.kind)!;
        const blocked = def.route && !this.world.routeOf(b.id) ? 'Tap to draw its route' : null;
        const unguided = SLOTS.filter((sl) => this.sim.isPlanned(b.id, sl) && !this.sim.guideFor(b.id, sl)).map((sl) => SLOT_NAMES[sl].toLowerCase());
        const slots = Object.fromEntries(SLOTS.map((s) => [s, this.sim.isPlanned(b.id, s)])) as Record<Slot, boolean>;
        const went = Object.fromEntries(
          SLOTS.map((s) => {
            const t = this.sim.trips.find((x) => x.hubId === b.id && x.slot === s);
            return [s, t ? t.people : null];
          }),
        ) as Record<Slot, number | null>;
        return {
          hubId: b.id,
          name: BUILDINGS[b.kind].name,
          activity: def.name,
          icon: b.kind,
          quality: Math.round(this.sim.sessionQuality(b.id)),
          blocked: blocked ?? (unguided.length ? `No guide in the ${unguided.join(' and ')} (People)` : null),
          slots,
          went,
          price: activityPrice(def, this.sim.activityPrice(b.id)),
        };
      });
    this.hud.setPlan(rows);
  }

  private startRoute(hubId: number): void {
    this.setTool({ type: 'route', hubId, tiles: [] });
    this.hud.toast('Start beside the hub (white tiles), then drag through the landmarks', 'info');
  }

  /** Extend the route being drawn towards a tile; stepping back onto the last tile undoes. */
  private routeTo(t: Tile): void {
    if (this.tool.type !== 'route') return;
    const tool = this.tool;
    const hub = this.world.buildings.find((b) => b.id === tool.hubId);
    const def = hub && activityOf(hub.kind);
    if (!def) return;
    const tiles = tool.tiles;
    if (!tiles.length) {
      if (routeStarts(this.world, tool.hubId).some((s) => s.x === t.x && s.y === t.y)) tiles.push(t);
      return this.drawDraft();
    }
    for (const step of manhattanSteps(tiles[tiles.length - 1], t)) {
      const prev = tiles[tiles.length - 1];
      if (tiles.length >= 2 && tiles[tiles.length - 2].x === step.x && tiles[tiles.length - 2].y === step.y) {
        tiles.pop();
        continue;
      }
      if (tiles.length >= 40 || !canStepOn(this.world, def, step, prev).ok) break;
      tiles.push(step);
    }
    this.drawDraft();
  }

  private drawDraft(): void {
    if (this.tool.type !== 'route') return;
    const { hubId, tiles } = this.tool;
    const hub = this.world.buildings.find((b) => b.id === hubId);
    const def = hub && activityOf(hub.kind);
    if (!hub || !def?.route) return;
    const check = tiles.length ? this.world.checkRoute(hubId, tiles) : { ok: true as const };
    this.activityView.setDraft(tiles, routeStarts(this.world, hubId), check.ok, def.route);
    if (!tiles.length) return this.hud.setHint(HINTS.route);
    const route = { hubId, kind: def.route, tiles };
    const seen = landmarksOn(route, this.world.landmarks);
    const q = routeQuality(this.world, route, def, this.world.landmarks);
    this.hud.setHint(`${tiles.length} tiles · ${seen.length ? seen.map((l) => l.name).join(', ') : 'no landmarks yet'} · quality ${q}`);
  }

  /** ✓ saves the route (if it's valid); Esc throws the draft away. */
  private finishRoute(commit: boolean): void {
    if (this.tool.type !== 'route') return;
    const { hubId, tiles } = this.tool;
    if (commit && tiles.length) {
      const r = this.history.run(() => this.world.setRoute(hubId, tiles));
      if (!r.ok) {
        this.sfx.play('error');
        return this.hud.toast(r.reason);
      }
      this.sfx.play('chime');
      this.hud.toast('Route saved: add it to the plan', 'good');
    }
    this.setTool({ type: 'none' });
    this.focusBuilding(hubId);
  }

  private rotate(): void {
    if (this.tool.type !== 'build' && this.tool.type !== 'move') return;
    this.tool.rot = ((this.tool.rot + 1) % 4) as Rotation;
    if (this.ghostAt) this.previewBuild(this.ghostAt);
  }

  /** Tag (or untag) beach tiles under a drag; the first tile picks which. */
  private paintBeach(t: Tile): void {
    if (this.tool.type !== 'beach') return;
    if (this.tool.on === null) this.tool.on = !this.world.isBeach(t.x, t.y);
    if (this.world.isBeach(t.x, t.y) === this.tool.on) return;
    const r = this.world.setBeach(t.x, t.y, this.tool.on);
    if (r.ok) this.history.touch();
    this.view.highlight([t], r.ok ? 'ok' : 'bad');
  }

  private tryMove(t: Tile): void {
    if (this.tool.type !== 'move') return;
    const { id, rot } = this.tool;
    const a = this.buildAnchor(t);
    const r = this.history.run(() => this.world.moveBuilding(id, a.x, a.y, rot));
    if (!r.ok) {
      this.sfx.play('error');
      return this.hud.toast(r.reason);
    }
    this.sfx.play('place');
    this.setTool({ type: 'none' });
    this.hud.toast('Moved', 'good');
  }

  private undo(): void {
    // While drawing a route, undo takes back the last few tiles.
    if (this.tool.type === 'route') {
      this.tool.tiles.splice(Math.max(0, this.tool.tiles.length - 4));
      return this.drawDraft();
    }
    if (this.history.undo()) this.hud.toast('Undone', 'info');
    if (this.tool.type === 'build' && this.ghostAt) this.previewBuild(this.ghostAt);
  }

  private newIsland(): void {
    this.newGame.show(true, !Coach.seen);
  }

  /** Start a scenario or the sandbox on a fresh island. */
  private startNewGame(choice: NewGameChoice): void {
    const scenario = 'scenario' in choice ? SCENARIOS.find((x) => x.id === choice.scenario) : undefined;
    const island = scenario ? scenario.island : SANDBOX_ISLAND;
    const fresh = World.onIsland(islandLayout(island), scenario ? scenario.startMoney : 50000);
    if (scenario?.prebuilt) applyPrebuilt(fresh, scenario.prebuilt);
    fresh.placeWelcomeCenter();
    this.world.restore(fresh.snapshot());
    this.view.frameStart();
    this.sim.reset();
    this.sim.progression = !!scenario;
    this.sim.startScenario(scenario ? scenario.id : null);
    this.attachCampaign();
    this.refreshResearch(true);
    this.refreshRatings();
    this.report.hide();
    this.certificate.hidden = true;
    this.history.clear();
    this.setTool({ type: 'none' });
    this.onWorldChange();
    this.setSpeed(1);
    this.save();
    if ('scenario' in choice && choice.tutorial) return this.startCoach();
    this.coach.finish();
    this.hud.toast(scenario ? `${scenario.name}: ${scenario.prebuilt ? 'the old resort needs work' : 'build rooms and paths before the first ferry'}` : 'Sandbox: everything is unlocked', 'info');
  }

  /** Listen to the current scenario for medals, objectives and the end. */
  private attachCampaign(): void {
    const c = this.sim.campaign;
    this.goals.setCampaign(c);
    this.hud.setGoalsAvailable(!!c);
    if (!c) return;
    c.on((e) => {
      switch (e.type) {
        case 'objectiveDone': {
          const r = e.objective.reward;
          this.sfx.play('chime');
          if (r.coins) this.hud.bump('coins');
          return this.hud.toast(`Goal done: ${e.objective.label} · ${r.coins ? `+${r.coins} coins` : `+${r.research} research`}`, 'good');
        }
        case 'medal':
        {
          this.sfx.play('fanfare');
          const r = this.profile.awardMedal(c.def.id, e.tier);
          this.saveProfile();
          // A milestone: pause and show what was won. Two medals on one night share a card.
          if (!this.milestone) this.milestone = { won: [], speed: this.speed };
          this.milestone.won.push({ tier: e.tier, ...r });
          this.setSpeed(0);
          const motion = !this.settings.reduceMotion;
          if (motion) this.hud.celebrate(`${MEDAL_NAMES[e.tier]} medal!`, `+${r.xp} XP`, true);
          this.certificate.innerHTML = milestoneHtml(c, this.milestone.won, motion);
          this.certificate.hidden = false;
          this.save();
          return;
        }
        case 'finished': {
          const xp = this.profile.finishMission(c.def.id, this.sim.rating);
          this.saveProfile();
          // Gold ends the mission: the milestone card stays and notes the final-rating bonus.
          if (this.milestone && !this.certificate.hidden) {
            const line = this.certificate.querySelector('[data-finalxp]');
            if (line && xp) line.textContent = ` · +${xp} for the final rating`;
            // The mission is over: no next medal to play for.
            this.certificate.querySelector('.next-medal')?.remove();
            const keep = this.certificate.querySelector('[data-keep]');
            if (keep) keep.textContent = 'Keep playing this resort';
            this.save();
            return;
          }
          this.certificate.innerHTML = certificateHtml(c, xp, this.profile.xp);
          this.certificate.hidden = false;
          this.save();
          return;
        }
      }
    });
  }

  /** Research on the home screen, paid in experience; it applies to every resort. */
  private buyResearch(id: string): void {
    const r = this.profile.buy(id);
    if (!r.ok) {
      this.sfx.play('error');
      return this.hud.toast(r.reason.replace(' points', ' XP'));
    }
    this.sfx.play('chime');
    this.saveProfile();
    this.refreshResearch(true);
  }

  private saveProfile(): void {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(this.profile.data()));
    } catch {
      /* the save-failure notice covers this */
    }
    this.newGame.refresh();
  }

  private onMoneyChange(): void {
    this.hud.setCoins(this.world.money);
    this.hud.setAffordable('path', this.world.money >= PATH_COST);
    const land = this.world.nextPlotPrice ?? this.world.plotPrice;
    this.hud.setLandPrice(land);
    this.hud.setAffordable('land', this.world.money >= land);
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
    this.updateCoach();
  }

  /** Autosave; `backup` first keeps the previous save as the day's restore point. */
  private save(backup = false): void {
    this.sinceSave = 0;
    const ok = writeSave({ world: this.world.snapshot(), sim: this.sim.snapshot() }, backup);
    if (!ok && !this.saveWarned) {
      this.saveWarned = true;
      this.hud.toast("Can't save on this device (storage full or private mode): progress will be lost on reload", 'info');
    }
  }

  // ---------- previews ----------

  /** The tile under a screen point, taking hills into account: the highest level that matches. */
  private tileAt(clientX: number, clientY: number): Tile | null {
    for (let lvl = 3; lvl >= 1; lvl--) {
      const p = this.stage.groundAt(clientX, clientY, lvl * LEVEL_HEIGHT);
      if (!p) continue;
      const t = { x: Math.floor(p.x), y: Math.floor(p.z) };
      if (this.world.heightAt(t.x, t.y) === lvl) return t;
    }
    const p = this.stage.groundAt(clientX, clientY);
    return p ? { x: Math.floor(p.x), y: Math.floor(p.z) } : null;
  }

  /** Anchor so the finger sits over the middle of the footprint. */
  private buildAnchor(t: Tile): Tile {
    const kind = this.tool.type === 'build' ? this.tool.kind : this.tool.type === 'move' ? this.movingKind() : null;
    if (!kind || (this.tool.type !== 'build' && this.tool.type !== 'move')) return t;
    const { w, h } = footprint(kind, this.tool.rot);
    return { x: t.x - Math.floor((w - 1) / 2), y: t.y - Math.floor((h - 1) / 2) };
  }

  private movingKind(): BuildingKind | null {
    if (this.tool.type !== 'move') return null;
    const id = this.tool.id;
    return this.world.buildings.find((b) => b.id === id)?.kind ?? null;
  }

  private previewBuild(t: Tile): void {
    if (this.tool.type === 'move') {
      const kind = this.movingKind();
      if (!kind) return;
      this.ghostAt = t;
      const a = this.buildAnchor(t);
      this.view.showGhost(kind, a.x, a.y, this.tool.rot, this.world.canMoveBuilding(this.tool.id, a.x, a.y, this.tool.rot).ok);
      return;
    }
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
      case 'move':
        return this.previewBuild(t);
      case 'path':
        if (!this.world.inBounds(t.x, t.y)) return this.view.hideGhost();
        return this.view.highlight([t], this.world.isPath(t.x, t.y) || this.world.canPlacePath(t.x, t.y).ok ? 'ok' : 'bad');
      case 'demolish': {
        const b = this.world.buildingAt(t.x, t.y);
        if (b) return this.view.highlight(this.world.footprintTiles(b.kind, b.x, b.y, b.rot), 'bad');
        if (this.world.isPath(t.x, t.y))
          return this.view.highlight([t], this.world.canRemovePath(t.x, t.y).ok ? 'bad' : 'info');
        if (this.world.clearCost(t.x, t.y)) return this.view.highlight([t], this.world.canClear(t.x, t.y).ok ? 'warn' : 'info');
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
    this.lastBuildCost = this.world.buildCost(kind, a.x, a.y, rot);
    const r = this.history.run(() => this.world.placeBuilding(kind, a.x, a.y, rot));
    if (!r.ok) {
      this.sfx.play('error');
      this.hud.toast(r.reason);
    } else {
      const { w, h } = footprint(kind, rot);
      this.sfx.play('place');
      this.coinPops.spawn(a.x + w / 2, a.y + h / 2, -this.lastBuildCost, this.world.heightAt(a.x, a.y) * LEVEL_HEIGHT);
    }
    this.previewBuild(t);
  }

  private tryDemolish(t: Tile): void {
    const r = this.history.run(() => this.world.demolishAt(t.x, t.y));
    if (!r.ok) {
      this.sfx.play('error');
      this.hud.toast(r.reason);
    } else this.sfx.play('tap');
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
    if (this.stroke.placed === 0 && this.stroke.firstError) {
      this.sfx.play('error');
      this.hud.toast(this.stroke.firstError);
    } else if (this.stroke.placed > 0) this.sfx.play('place');
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
    if (this.selectTrayItem(item)) this.trayDrag = { item, sx: e.clientX, sy: e.clientY, moved: false };
  }

  /** Pick a build card's tool (tap, keyboard, or the start of a drag). */
  private selectTrayItem(item: TrayItem): boolean {
    const locked = this.hud.lockReason(item);
    if (locked) {
      this.sfx.play('error');
      this.hud.toast(`${locked} (research on the home screen)`);
      return false;
    }
    this.sfx.play('tap');
    if (item === 'path') this.setTool({ type: 'path' });
    else if (item === 'land') this.setTool(this.tool.type === 'land' ? { type: 'none' } : { type: 'land' });
    else if (item === 'bulldoze') this.setTool(this.tool.type === 'demolish' ? { type: 'none' } : { type: 'demolish' });
    else if (item === 'beach') this.setTool(this.tool.type === 'beach' ? { type: 'none' } : { type: 'beach', on: null });
    else {
      const rot = this.tool.type === 'build' && this.tool.kind === item ? this.tool.rot : 0;
      this.setTool({ type: 'build', kind: item, rot });
    }
    return true;
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
      if (e.key === 'Escape') return this.back();
      if (this.newGame.open || !this.certificate.hidden) return;
      if (e.key === 'Enter' && this.report.open) return this.startDay();
      if (e.key === ' ') {
        e.preventDefault();
        return this.setSpeed(this.speed === 0 ? 1 : 0);
      }
      switch (e.key.toLowerCase()) {
        case 'g':
          return this.setTab(this.tab === 'guests' ? 'none' : 'guests');
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
        case '5':
        case '6':
        case '7':
        case '8':
        case '9': {
          const kind = BUILDING_KINDS[Number(e.key) - 2];
          return kind ? this.setTool({ type: 'build', kind, rot: 0 }) : undefined;
        }
      }
    });
  }

  /**
   * Esc: close the topmost layer only, in stacking order — dialogs, popovers, side panels,
   * the selected guest, the active tool, then the sheet. The night report stays until Start day.
   */
  private back(): void {
    if (this.newGame.open) return void this.newGame.cancel();
    if (!this.certificate.hidden) return void (this.certificate.hidden = true);
    if (this.report.open) return;
    if (this.hud.closePopover()) return;
    if (this.goals.isOpen) return this.goals.toggle(false);
    if (this.panel.open) return this.panel.close();
    if (this.selectedGuest !== null) return this.selectGuest(null);
    if (this.tool.type === 'route') return this.finishRoute(false);
    if (this.tool.type !== 'none') return this.setTool({ type: 'none' });
    if (this.tab !== 'none') return this.setTab('none');
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
    if (this.tool.type === 'route') {
      if (t) this.routeTo(t);
      return;
    }
    if (this.tool.type === 'beach') {
      this.history.begin();
      this.tool.on = null;
      if (t) this.paintBeach(t);
      return;
    }
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
    if (this.tool.type === 'route') return this.routeTo(t);
    if (this.tool.type === 'beach') return this.paintBeach(t);
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
      case 'move':
        if (t) this.tryMove(t);
        return;
      case 'beach':
        this.history.commit();
        if (this.tool.on === true && !this.world.beachReached()) this.hud.toast('Guests need a path that touches the beach', 'info');
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
    const price = this.world.priceOf(plot.id);
    const r = this.history.run(() => this.world.buyPlot(plot.id));
    if (!r.ok) {
      this.sfx.play('error');
      return this.hud.toast(r.reason);
    }
    this.sfx.play('fanfare');
    this.hud.toast(`New land! ${price.toLocaleString('en-US')} coins`, 'good');
  }
}

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The autosave, or the copy kept at the start of the day if the autosave can't be read. */
function loadSave(): { save: SaveFile | null; discarded: boolean; note: string } {
  const main = parseSave(readKey(SAVE_KEY));
  if (main.ok) return { save: main.save, discarded: false, note: main.migrated ? 'Your save was upgraded to this version' : '' };
  const backup = parseSave(readKey(BACKUP_KEY));
  if (backup.ok) return { save: backup.save, discarded: false, note: 'The last save was damaged: restored the copy from the start of the month' };
  return { save: null, discarded: main.reason === 'too-old', note: '' };
}

function writeSave(s: SaveFile, backup = false): boolean {
  try {
    if (backup) {
      const prev = localStorage.getItem(SAVE_KEY);
      if (prev) localStorage.setItem(BACKUP_KEY, prev);
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false; // storage full or unavailable (private mode)
  }
}

/** The profile, or a fresh one; a first run after Pass 4 keeps the topics researched in the old save. */
function loadProfile(imported: string[]): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const d = JSON.parse(raw) as ProfileData;
      if (d.version === 1) return new Profile(d);
    }
  } catch {
    /* fall through to a fresh profile */
  }
  const p = new Profile();
  for (const id of imported) p.research.done.add(id);
  return p;
}
