import type { World, WorldSnapshot } from './world';

/**
 * Undo for construction (GDD risk: "Paths becoming fiddly on small screens →
 * snapped drag-drawing, auto-joining, and undo"). Undo restores the exact prior
 * state, so it is a full refund, unlike demolishing.
 *
 * A "transaction" groups several edits, e.g. a whole path stroke, into one undo step.
 */
export class History {
  private stack: string[] = [];
  private pending: string | null = null;
  private dirty = false;

  constructor(
    private world: World,
    private limit = 50,
  ) {}

  /** Call before a group of edits. */
  begin(): void {
    this.pending = JSON.stringify(this.world.snapshot());
    this.dirty = false;
  }

  /** Mark that the current transaction changed something. */
  touch(): void {
    this.dirty = true;
  }

  /** Close the transaction; it becomes an undo step only if something changed. */
  commit(): void {
    if (this.pending && this.dirty) {
      this.stack.push(this.pending);
      if (this.stack.length > this.limit) this.stack.shift();
    }
    this.pending = null;
    this.dirty = false;
  }

  /** Run a single edit as its own undo step. Returns whatever the edit returns. */
  run<T extends { ok: boolean }>(edit: () => T): T {
    this.begin();
    const r = edit();
    if (r.ok) this.touch();
    this.commit();
    return r;
  }

  get canUndo(): boolean {
    return this.stack.length > 0;
  }

  undo(): boolean {
    const s = this.stack.pop();
    if (!s) return false;
    this.world.restore(JSON.parse(s) as WorldSnapshot);
    return true;
  }

  clear(): void {
    this.stack = [];
  }
}
