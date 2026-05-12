// ---------------------------------------------------------------------------
// App-wide singleton boot for the operator + AI layer
// ---------------------------------------------------------------------------
//
// Every UI component that wants to dispatch an operator imports `appOps`
// and `appCtx` from here. Lives on `globalThis` so Vite Fast Refresh
// re-evaluations don't kick the registry on every save (closures that
// captured `appOps` keep working — they hold the same instance across
// edits).
//
// On every module evaluation we `clear()` and `registerScoutOperators`
// into that same instance — new operators added during dev land in the
// AI's tool catalogue on the next chat turn without a window reload.

import { OperatorRegistry, UndoStack, bindUndoStores, registerScoutOperators } from "@/ops";
import type { Context } from "@/ops/types";
import { captureCanvasSnapshot } from "@/utils/geminiRestyle";

import { GeminiClient, type AgentClientLike } from "./gemini-client";

interface AppSingletons {
  ops: OperatorRegistry;
  ctx: Context;
  agent: AgentClientLike | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __scout3dApp: AppSingletons | undefined;
}

function bootApp(existing?: AppSingletons): AppSingletons {
  // Reuse the existing registry instance if its prototype hasn't drifted
  // since the last HMR pass — otherwise closures pointing at the old
  // instance keep working but new operators added since reload would be
  // invisible. The `clear` method check is a cheap shape probe.
  const compatible =
    existing?.ops && typeof (existing.ops as { clear?: unknown }).clear === "function";
  const ops = compatible ? existing!.ops : new OperatorRegistry();
  ops.clear();
  registerScoutOperators(ops);

  // Same logic for the undo stack — bindings re-register every time.
  const undo = existing?.ctx?.undo ?? new UndoStack();
  bindUndoStores(undo);

  const ctx: Context = {
    undo,
    services: {
      viewport: {
        capturePng(maxEdge = 1024) {
          const dataUrl = captureCanvasSnapshot(maxEdge);
          if (!dataUrl) return null;
          // Decode width/height from the dataURL prefix's natural size
          // is awkward; the renderer doesn't need them to be exact for
          // chat — round-trip via an in-memory <img> is overkill for the
          // current usage (we just hand the dataURL back).
          return { dataUrl, width: 0, height: 0 };
        },
      },
      execute: async (id, props) => ops.invokeAsync(ctx, id, props),
    },
  };

  const agent = makeAgent();
  return { ops, ctx, agent };
}

function makeAgent(): AgentClientLike | null {
  const apiKey =
    typeof import.meta !== "undefined"
      ? (import.meta as { env?: Record<string, string | undefined> }).env
          ?.VITE_GEMINI_API_KEY
      : undefined;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn(
      "[scout3d] AI agent disabled — VITE_GEMINI_API_KEY is not set in .env.local",
    );
    return null;
  }
  // Default model — fast + cheap + tool-calling capable. Swap to a pro
  // tier via the chat panel's settings if you want richer planning.
  const model = "gemini-2.5-flash";
  // eslint-disable-next-line no-console
  console.info(`[scout3d] AI agent: local Gemini mode (${model})`);
  return new GeminiClient({ apiKey, model });
}

const app: AppSingletons = (globalThis.__scout3dApp = bootApp(globalThis.__scout3dApp));

export const appOps = app.ops;
export const appCtx = app.ctx;
export const appAgent = app.agent;

/** Convenience wrapper: invoke and log on error. */
export function invoke(opId: string, props: Record<string, unknown> = {}) {
  const result = appOps.invoke(appCtx, opId, props);
  if (result.status === "error") {
    // eslint-disable-next-line no-console
    console.error(`[ops] ${opId} failed:`, result.message);
  }
  return result;
}

export function undo(): void {
  appCtx.undo.undo();
}

export function redo(): void {
  appCtx.undo.redo();
}

/** Whether the AI chat is operational (a Gemini key is configured). */
export function aiAvailable(): boolean {
  return appAgent !== null;
}
