import {
  BUILDINGS,
  DEMOLISH_REFUND,
  PATH_COST,
  START_MONEY,
  footprint,
  type BuildingKind,
  type Rotation,
} from './buildings';

/**
 * The resort's map state, with every construction rule from the GDD's "The map"
 * section. This module is pure (no DOM, no Three.js) so it can be unit tested and
 * later driven by the playtest harness.
 *
 * Invariants kept by every mutating call:
 *  - every path tile is connected to the dock through other path tiles;
 *  - every building touches at least one path tile (and so reaches the dock).
 */

export interface Building {
  id: number;
  kind: BuildingKind;
  /** Top-left tile of the footprint. */
  x: number;
  y: number;
  rot: Rotation;
  builtDay: number;
}

export interface Tile {
  x: number;
  y: number;
}

export type Result = { ok: true } | { ok: false; reason: string };

export interface WorldSnapshot {
  version: 1;
  size: number;
  money: number;
  day: number;
  nextId: number;
  paths: number[];
  buildings: Building[];
}

const OK: Result = { ok: true };
const fail = (reason: string): Result => ({ ok: false, reason });

const NEIGHBOURS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export class World {
  readonly size: number;
  money: number;
  day = 1;
  private nextId = 1;
  /** Path flag per tile, indexed y * size + x. */
  private paths: Uint8Array;
  /** Building id per tile, 0 = none. */
  private occ: Int32Array;
  private buildingsById = new Map<number, Building>();
  private listeners = new Set<() => void>();

  constructor(size = 10, money = START_MONEY) {
    this.size = size;
    this.money = money;
    this.paths = new Uint8Array(size * size);
    this.occ = new Int32Array(size * size);
    const dock = this.dock;
    this.paths[this.idx(dock.x, dock.y)] = 1;
  }

  /** The dock's landing tile: the middle of the edge nearest the camera. It is always a path. */
  get dock(): Tile {
    return { x: Math.floor(this.size / 2), y: this.size - 1 };
  }

  get buildings(): Building[] {
    return [...this.buildingsById.values()];
  }

  // ---------- queries ----------

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  isPath(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.paths[this.idx(x, y)] === 1;
  }

  buildingAt(x: number, y: number): Building | undefined {
    if (!this.inBounds(x, y)) return undefined;
    const id = this.occ[this.idx(x, y)];
    return id ? this.buildingsById.get(id) : undefined;
  }

  isFree(x: number, y: number): boolean {
    return this.inBounds(x, y) && !this.isPath(x, y) && !this.buildingAt(x, y);
  }

  pathTiles(): Tile[] {
    const out: Tile[] = [];
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) if (this.isPath(x, y)) out.push({ x, y });
    return out;
  }

  /** Tiles covered by a footprint placed at (x, y). */
  footprintTiles(kind: BuildingKind, x: number, y: number, rot: Rotation): Tile[] {
    const { w, h } = footprint(kind, rot);
    const out: Tile[] = [];
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ x: x + dx, y: y + dy });
    return out;
  }

  /** Path tiles orthogonally adjacent to a footprint. Guests will enter from these (M2). */
  accessTiles(tiles: Tile[]): Tile[] {
    const inside = new Set(tiles.map((t) => this.idx(t.x, t.y)));
    const seen = new Set<number>();
    const out: Tile[] = [];
    for (const t of tiles)
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = t.x + dx;
        const ny = t.y + dy;
        if (!this.isPath(nx, ny)) continue;
        const i = this.idx(nx, ny);
        if (inside.has(i) || seen.has(i)) continue;
        seen.add(i);
        out.push({ x: nx, y: ny });
      }
    return out;
  }

  // ---------- buildings ----------

  canPlaceBuilding(kind: BuildingKind, x: number, y: number, rot: Rotation): Result {
    const tiles = this.footprintTiles(kind, x, y, rot);
    for (const t of tiles) {
      if (!this.inBounds(t.x, t.y)) return fail('Outside the island');
      if (this.isPath(t.x, t.y)) return fail('Blocked by a path');
      if (this.buildingAt(t.x, t.y)) return fail('Blocked by a building');
    }
    if (this.accessTiles(tiles).length === 0) return fail('Must touch a path');
    if (this.money < BUILDINGS[kind].cost) return fail('Not enough coins');
    return OK;
  }

  placeBuilding(kind: BuildingKind, x: number, y: number, rot: Rotation): Result & { building?: Building } {
    const check = this.canPlaceBuilding(kind, x, y, rot);
    if (!check.ok) return check;
    const b: Building = { id: this.nextId++, kind, x, y, rot, builtDay: this.day };
    this.buildingsById.set(b.id, b);
    for (const t of this.footprintTiles(kind, x, y, rot)) this.occ[this.idx(t.x, t.y)] = b.id;
    this.money -= BUILDINGS[kind].cost;
    this.emit();
    return { ok: true, building: b };
  }

  removeBuilding(id: number): Result {
    const b = this.buildingsById.get(id);
    if (!b) return fail('No building there');
    for (const t of this.footprintTiles(b.kind, b.x, b.y, b.rot)) this.occ[this.idx(t.x, t.y)] = 0;
    this.buildingsById.delete(id);
    this.money += Math.floor(BUILDINGS[b.kind].cost * DEMOLISH_REFUND);
    this.emit();
    return OK;
  }

  // ---------- paths ----------

  canPlacePath(x: number, y: number): Result {
    if (!this.inBounds(x, y)) return fail('Outside the island');
    if (this.isPath(x, y)) return fail('Already a path');
    if (this.buildingAt(x, y)) return fail('Blocked by a building');
    const linked = NEIGHBOURS.some(([dx, dy]) => this.isPath(x + dx, y + dy));
    if (!linked) return fail('Paths must lead back to the dock');
    if (this.money < PATH_COST) return fail('Not enough coins');
    return OK;
  }

  placePath(x: number, y: number): Result {
    const check = this.canPlacePath(x, y);
    if (!check.ok) return check;
    this.paths[this.idx(x, y)] = 1;
    this.money -= PATH_COST;
    this.emit();
    return OK;
  }

  canRemovePath(x: number, y: number): Result {
    if (!this.isPath(x, y)) return fail('No path there');
    const dock = this.dock;
    if (x === dock.x && y === dock.y) return fail('The dock path stays');
    const i = this.idx(x, y);
    this.paths[i] = 0;
    try {
      const reach = this.reachableFromDock();
      for (const t of this.pathTiles())
        if (!reach.has(this.idx(t.x, t.y))) return fail('That would cut paths off from the dock');
      for (const b of this.buildingsById.values())
        if (this.accessTiles(this.footprintTiles(b.kind, b.x, b.y, b.rot)).length === 0)
          return fail(`${BUILDINGS[b.kind].name} would lose its path`);
      return OK;
    } finally {
      this.paths[i] = 1;
    }
  }

  removePath(x: number, y: number): Result {
    const check = this.canRemovePath(x, y);
    if (!check.ok) return check;
    this.paths[this.idx(x, y)] = 0;
    this.money += Math.floor(PATH_COST * DEMOLISH_REFUND);
    this.emit();
    return OK;
  }

  /** Demolish whatever is on a tile (building first, then path). */
  demolishAt(x: number, y: number): Result {
    const b = this.buildingAt(x, y);
    if (b) return this.removeBuilding(b.id);
    if (this.isPath(x, y)) return this.removePath(x, y);
    return fail('Nothing to demolish');
  }

  /** Path tile indices reachable from the dock. */
  reachableFromDock(): Set<number> {
    const seen = new Set<number>();
    const dock = this.dock;
    if (!this.isPath(dock.x, dock.y)) return seen;
    const queue: Tile[] = [dock];
    seen.add(this.idx(dock.x, dock.y));
    while (queue.length) {
      const t = queue.shift()!;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = t.x + dx;
        const ny = t.y + dy;
        if (!this.isPath(nx, ny)) continue;
        const i = this.idx(nx, ny);
        if (seen.has(i)) continue;
        seen.add(i);
        queue.push({ x: nx, y: ny });
      }
    }
    return seen;
  }

  // ---------- persistence ----------

  snapshot(): WorldSnapshot {
    const paths: number[] = [];
    this.paths.forEach((v, i) => v && paths.push(i));
    return {
      version: 1,
      size: this.size,
      money: this.money,
      day: this.day,
      nextId: this.nextId,
      paths,
      buildings: this.buildings.map((b) => ({ ...b })),
    };
  }

  /** Replace this world's state with a snapshot (used by undo and load). */
  restore(s: WorldSnapshot): void {
    if (s.version !== 1 || s.size !== this.size) throw new Error('Incompatible save');
    this.money = s.money;
    this.day = s.day;
    this.nextId = s.nextId;
    this.paths.fill(0);
    this.occ.fill(0);
    this.buildingsById.clear();
    for (const i of s.paths) this.paths[i] = 1;
    for (const b of s.buildings) {
      this.buildingsById.set(b.id, { ...b });
      for (const t of this.footprintTiles(b.kind, b.x, b.y, b.rot)) this.occ[this.idx(t.x, t.y)] = b.id;
    }
    this.emit();
  }

  static fromSnapshot(s: WorldSnapshot): World {
    const w = new World(s.size, s.money);
    w.restore(s);
    return w;
  }

  // ---------- change events ----------

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private idx(x: number, y: number): number {
    return y * this.size + x;
  }
}

/** Tiles on a 4-connected line from a to b (L-shaped: x first, then y), excluding a. */
export function manhattanSteps(a: Tile, b: Tile): Tile[] {
  const out: Tile[] = [];
  let { x, y } = a;
  while (x !== b.x) {
    x += Math.sign(b.x - x);
    out.push({ x, y });
  }
  while (y !== b.y) {
    y += Math.sign(b.y - y);
    out.push({ x, y });
  }
  return out;
}
