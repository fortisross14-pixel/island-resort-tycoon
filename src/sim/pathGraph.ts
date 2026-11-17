import type { Tile, World } from './world';

const NEIGHBOURS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Distance value for tiles that cannot reach the goal. */
export const UNREACHABLE = 0x7fff;

/**
 * Walking distances over the footpath network (GDD tech: "a path graph, paths as
 * edges, cached distances from each room").
 *
 * For each goal (a building's access tiles, the dock, or one tile) we BFS outwards
 * once and cache the distance field. A route is then just "step to the neighbour
 * with the smallest distance", which is cheap enough for hundreds of guests.
 * The cache is dropped whenever the map changes.
 */
export class PathGraph {
  private fields = new Map<string, Int16Array>();

  constructor(private world: World) {
    world.onChange(() => this.fields.clear());
  }

  invalidate(): void {
    this.fields.clear();
  }

  /** Distance field towards a set of goal tiles, keyed so it can be cached. */
  field(key: string, goals: Tile[]): Int16Array {
    let f = this.fields.get(key);
    if (f) return f;
    const w = this.world;
    const n = w.size;
    f = new Int16Array(n * n).fill(UNREACHABLE);
    const queue: number[] = [];
    for (const g of goals) {
      if (!w.isPath(g.x, g.y)) continue;
      const i = g.y * n + g.x;
      if (f[i] === 0) continue;
      f[i] = 0;
      queue.push(i);
    }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const x = i % n;
      const y = (i - x) / n;
      const d = f[i] + 1;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!w.isPath(nx, ny)) continue;
        const j = ny * n + nx;
        if (f[j] <= d) continue;
        f[j] = d;
        queue.push(j);
      }
    }
    this.fields.set(key, f);
    return f;
  }

  distance(key: string, goals: Tile[], from: Tile): number {
    if (!this.world.inBounds(from.x, from.y)) return UNREACHABLE;
    return this.field(key, goals)[from.y * this.world.size + from.x];
  }

  /**
   * Tiles to walk from `from` (exclusive) to the nearest goal (inclusive).
   * Empty if already there; null if the goal can't be reached.
   */
  route(key: string, goals: Tile[], from: Tile): Tile[] | null {
    const w = this.world;
    const n = w.size;
    const f = this.field(key, goals);
    if (!w.inBounds(from.x, from.y)) return null;
    let d = f[from.y * n + from.x];
    if (d === UNREACHABLE) return null;
    const out: Tile[] = [];
    let { x, y } = from;
    while (d > 0) {
      let best: Tile | null = null;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!w.inBounds(nx, ny)) continue;
        if (f[ny * n + nx] === d - 1) {
          best = { x: nx, y: ny };
          break;
        }
      }
      if (!best) return null;
      out.push(best);
      ({ x, y } = best);
      d--;
    }
    return out;
  }
}
