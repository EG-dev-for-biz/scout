import type { StructDef } from "./prop";
import type { UndoStack } from "./undo";

/** Operator behaviour flags. */
export interface OpFlags {
  /** Pushes an undo snapshot when the op finishes successfully. */
  undo?: boolean;
  /** Read-only: the op only inspects state. AI agents can call freely. */
  readonly?: boolean;
  /** Hidden from the AI tool projection (advanced / unsafe). */
  internal?: boolean;
}

export type OpResult<R = unknown> =
  | { status: "finished"; value?: R }
  | { status: "cancelled"; reason?: string }
  | { status: "error"; message: string };

/**
 * One registered action. Operators are dispatched identically by UI clicks,
 * keyboard shortcuts, undo replays, and AI tool calls.
 */
export interface OperatorDef<R = unknown> {
  /** Dotted ID, lower-snake. e.g. `"weather.set_preset"`, `"camera.set_lens"`. */
  id: string;
  /** Short human label for menus / chat cards. */
  label: string;
  /**
   * Plain-English description for the AI tool catalogue + UI tooltips.
   * **The model reads this. Be precise.**
   */
  description: string;
  flags: OpFlags;
  /** Property schema — drives validation, AI tool schema, defaults. */
  props: StructDef;
  /** Pre-check. Returns false to disable. Defaults to "always available". */
  poll?: (ctx: Context) => boolean;
  /**
   * Run the operator. Mutates state via Zustand setState calls.
   * `props` is the validated + default-filled prop bag.
   * `raw` is the original caller-supplied bag (pre-merge) for ops that
   * need partial-update semantics.
   */
  exec: (
    ctx: Context,
    props: Record<string, unknown>,
    raw: Record<string, unknown>,
  ) => OpResult<R> | Promise<OpResult<R>>;
}

/**
 * Renderer services threaded into operators. Headless / test contexts
 * may leave any of these undefined — operators must defensively check.
 */
export interface ViewportService {
  /** Capture the WebGL canvas as a PNG dataURL. */
  capturePng(maxEdge?: number): { dataUrl: string; width: number; height: number } | null;
}

export interface OperatorServices {
  viewport?: ViewportService;
  /** Self-reference so one operator can compose another. */
  execute?: (id: string, props: Record<string, unknown>) => Promise<OpResult>;
}

/** Context every operator receives. */
export interface Context {
  /** Undo stack the registry pushes onto when `flags.undo` is set. */
  readonly undo: UndoStack;
  /** Optional renderer-side services. */
  readonly services?: OperatorServices;
}
