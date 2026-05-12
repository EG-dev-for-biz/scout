// ---------------------------------------------------------------------------
// Snapshot undo stack
// ---------------------------------------------------------------------------
//
// Scout3D's state lives across ~19 specialised Zustand stores. Rather than
// asking every operator to compute a delta, we snapshot the live state of
// each *registered* store before an undoable op runs. Undo replays the
// snapshot. The shape is intentionally store-agnostic — we just hold
// `() => unknown` getters and `(snap: unknown) => void` restorers.
//
// Memory cost is bounded by `maxDepth` × the size of one snapshot. Because
// every Zustand store with `create<T>()` produces a single object whose
// values are mostly references, snapshots are cheap shallow clones.

export interface StoreBinding {
  /** Stable identifier — used to match snapshot slots when a store is
   *  registered AFTER undo entries already exist. */
  id: string;
  /** Read current store state. Typically `useFooStore.getState`. */
  capture: () => unknown;
  /** Restore a previously captured snapshot. Typically `useFooStore.setState`. */
  restore: (snap: unknown) => void;
}

interface UndoEntry {
  /** Operator id + label for menus / chat readouts. */
  label: string;
  /** One snapshot per registered store, keyed by store id. */
  snapshots: Record<string, unknown>;
}

export class UndoStack {
  private readonly entries: UndoEntry[] = [];
  private cursor = -1;
  private readonly maxDepth: number;
  private readonly bindings = new Map<string, StoreBinding>();

  constructor(maxDepth = 200) {
    this.maxDepth = maxDepth;
  }

  /** Register a store binding. Idempotent on `id`. */
  bind(binding: StoreBinding): void {
    this.bindings.set(binding.id, binding);
  }

  /** Snapshot every registered store. Returns a plain object. */
  capture(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [id, b] of this.bindings) {
      out[id] = b.capture();
    }
    return out;
  }

  /**
   * Push a new undo entry containing the given snapshot. Truncates any
   * redo tail beyond the cursor.
   */
  push(label: string, snapshots: Record<string, unknown>): void {
    if (this.cursor < this.entries.length - 1) {
      this.entries.length = this.cursor + 1;
    }
    this.entries.push({ label, snapshots });
    if (this.entries.length > this.maxDepth) {
      this.entries.shift();
    } else {
      this.cursor++;
    }
  }

  canUndo(): boolean {
    return this.cursor >= 0;
  }

  canRedo(): boolean {
    return this.cursor < this.entries.length - 1;
  }

  /**
   * Roll back one step. The entry we're moving AWAY from holds the
   * state BEFORE its operator ran — apply it. The cursor now points
   * at the entry BEFORE that, ready to undo again.
   */
  undo(): UndoEntry | null {
    if (!this.canUndo()) return null;
    const entry = this.entries[this.cursor];
    if (!entry) return null;
    this.cursor--;
    this.applySnapshots(entry.snapshots);
    return entry;
  }

  /**
   * Step forward. To redo we need a "future" snapshot — meaning the
   * state AFTER the entry's operator ran. We don't store those; redo
   * is supported only when the user `undo`s without re-doing intervening
   * ops, in which case the post-op state is recoverable from the
   * snapshot of the *next* entry (its pre-state). When the cursor is at
   * the head, there is no next entry, so redo restores the
   * just-undone entry's pre-state again (no-op for the user).
   */
  redo(): UndoEntry | null {
    if (!this.canRedo()) return null;
    this.cursor++;
    const next = this.entries[this.cursor + 1];
    if (next) this.applySnapshots(next.snapshots);
    return this.entries[this.cursor] ?? null;
  }

  /** Read the labels of the undo stack — for the UI menu / chat panel. */
  list(): ReadonlyArray<{ label: string }> {
    return this.entries.map((e) => ({ label: e.label }));
  }

  clear(): void {
    this.entries.length = 0;
    this.cursor = -1;
  }

  private applySnapshots(snapshots: Record<string, unknown>): void {
    for (const [id, snap] of Object.entries(snapshots)) {
      const b = this.bindings.get(id);
      if (b) b.restore(snap);
    }
  }
}
