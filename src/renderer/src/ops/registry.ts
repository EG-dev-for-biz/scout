import { defaultStruct, type StructDef } from "./prop";
import type { Context, OperatorDef, OpResult } from "./types";

/**
 * The single registry every action flows through.
 *
 * Mirrors Blender's `WM_operatortype_*` (collapsed to a typed TS class).
 * UI clicks, hotkeys, AI tool calls, and replayed macros all hit
 * `invoke` / `invokeAsync` here — the model cannot do anything a button
 * can't, because they share the same code path.
 */
export class OperatorRegistry {
  private readonly ops = new Map<string, OperatorDef>();

  register<R>(def: OperatorDef<R>): void {
    if (this.ops.has(def.id)) {
      throw new Error(`Operator already registered: ${def.id}`);
    }
    this.ops.set(def.id, def as OperatorDef);
  }

  get(id: string): OperatorDef | undefined {
    return this.ops.get(id);
  }

  list(): ReadonlyArray<OperatorDef> {
    return Array.from(this.ops.values());
  }

  /** Drop every registered operator. Used by HMR boot. */
  clear(): void {
    this.ops.clear();
  }

  /** Sync invoke — rejects async exec implementations. */
  invoke(ctx: Context, id: string, props: Record<string, unknown> = {}): OpResult {
    const prep = this.prepareInvoke(ctx, id, props);
    if (prep.ok === false) return prep.err;
    const { op, validated } = prep;
    const snapshot = op.flags.undo ? ctx.undo.capture() : null;

    let result: OpResult;
    try {
      const out = op.exec(ctx, validated, props);
      if (out instanceof Promise) {
        return {
          status: "error",
          message: `Operator "${id}" is asynchronous; use invokeAsync.`,
        };
      }
      result = out;
    } catch (err) {
      return { status: "error", message: `${id} threw: ${(err as Error).message}` };
    }
    if (result.status === "finished" && snapshot) {
      ctx.undo.push(`${op.label}`, snapshot);
    }
    return result;
  }

  async invokeAsync(
    ctx: Context,
    id: string,
    props: Record<string, unknown> = {},
  ): Promise<OpResult> {
    const prep = this.prepareInvoke(ctx, id, props);
    if (prep.ok === false) return prep.err;
    const { op, validated } = prep;
    const snapshot = op.flags.undo ? ctx.undo.capture() : null;

    let result: OpResult;
    try {
      result = await Promise.resolve(op.exec(ctx, validated, props));
    } catch (err) {
      return { status: "error", message: `${id} threw: ${(err as Error).message}` };
    }
    if (result.status === "finished" && snapshot) {
      ctx.undo.push(`${op.label}`, snapshot);
    }
    return result;
  }

  private prepareInvoke(
    ctx: Context,
    id: string,
    props: Record<string, unknown>,
  ):
    | { ok: true; op: OperatorDef; validated: Record<string, unknown> }
    | { ok: false; err: OpResult } {
    const op = this.ops.get(id);
    if (!op) {
      return { ok: false, err: { status: "error", message: `Unknown operator: ${id}` } };
    }
    if (op.poll && !op.poll(ctx)) {
      return {
        ok: false,
        err: { status: "cancelled", reason: `Operator unavailable in current context: ${id}` },
      };
    }
    let validated: Record<string, unknown>;
    try {
      validated = mergeProps(op.props, props);
    } catch (err) {
      return {
        ok: false,
        err: { status: "error", message: `Invalid props for ${id}: ${(err as Error).message}` },
      };
    }
    return { ok: true, op, validated };
  }
}

/**
 * Merge caller props onto the StructDef's defaults. Validates loosely so
 * AI tool args (the path that bypasses the TS compiler) hit a clean
 * error rather than corrupting state.
 */
function mergeProps(def: StructDef, raw: Record<string, unknown>): Record<string, unknown> {
  const out = defaultStruct(def) as Record<string, unknown>;
  for (const key of Object.keys(def)) {
    if (key in raw) {
      const value = raw[key];
      const prop = def[key];
      if (!prop) continue;
      validateValue(key, prop.kind, value);
      out[key] = coerce(prop.kind, value);
    }
  }
  return out;
}

function validateValue(name: string, kind: string, value: unknown): void {
  switch (kind) {
    case "float":
    case "int":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${name} must be a finite number`);
      }
      return;
    case "bool":
      if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
      return;
    case "string":
    case "enum":
      if (typeof value !== "string") throw new Error(`${name} must be a string`);
      return;
    case "vec3":
      if (
        !Array.isArray(value) ||
        value.length !== 3 ||
        !value.every((v) => typeof v === "number" && Number.isFinite(v))
      ) {
        throw new Error(`${name} must be a 3-element number array`);
      }
      return;
  }
}

function coerce(kind: string, value: unknown): unknown {
  if (kind === "int" && typeof value === "number") return Math.trunc(value);
  return value;
}
