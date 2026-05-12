import type { Context } from "@/ops/types";
import type { OperatorRegistry } from "@/ops/registry";
import type { ToolCall, ToolDeclaration, ToolResult } from "./types";

/**
 * Look up a tool call's operator id and invoke it. The caller drives
 * the agent loop (streaming, history, reentry); this just dispatches.
 *
 * Resolution rules:
 *   1. If `tools` is supplied (the catalogue we sent up to the model
 *      this turn), look up `call.name` there to recover the original
 *      operator id. Robust even if the agent invents a tool name.
 *   2. Else fall back to converting underscores → dots. Works for our
 *      sanitisation scheme but is less safe.
 */
export async function executeToolCall(
  registry: OperatorRegistry,
  ctx: Context,
  call: ToolCall,
  tools?: ReadonlyArray<ToolDeclaration>,
): Promise<ToolResult> {
  const operatorId = resolveOperatorId(call.name, tools);
  if (!operatorId) {
    return errorResult(call, `Unknown tool: ${call.name}`);
  }
  if (!registry.get(operatorId)) {
    return errorResult(
      call,
      `Tool maps to operator id "${operatorId}" but it is not registered.`,
    );
  }
  const result = await registry.invokeAsync(ctx, operatorId, call.args);
  switch (result.status) {
    case "finished":
      return { id: call.id, name: call.name, ok: true, value: result.value };
    case "cancelled":
      return errorResult(call, result.reason ?? `${operatorId} was cancelled.`);
    case "error":
      return errorResult(call, result.message);
  }
}

const DATA_URL_TRUNCATE_BYTES = 4096;

/**
 * Strip large dataURLs (PNGs, baked geometry, etc.) out of a tool result
 * before it round-trips to the model. A 1080p PNG is ~500 KB / ~125k
 * tokens — re-sending burns context for no gain (the model can't render
 * inline, vision input goes through a separate `inlineData` channel).
 *
 * UI callbacks (`onToolResult`) see the FULL untouched value — that's
 * how renderer-side handlers (e.g. saving a captured PNG) still work.
 */
export function summarizeToolResultForAi(result: ToolResult): ToolResult {
  if (!result.ok) return result;
  return { ...result, value: summarizeValue(result.value) };
}

function summarizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > DATA_URL_TRUNCATE_BYTES && value.startsWith("data:")) {
      const semi = value.indexOf(";");
      const mime = semi > 0 ? value.slice(5, semi) : "unknown";
      return `<dataURL ${mime} ~${(value.length / 1024).toFixed(1)} KB, omitted from chat context>`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(summarizeValue);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = summarizeValue(v);
    }
    return out;
  }
  return value;
}

function resolveOperatorId(
  toolName: string,
  tools?: ReadonlyArray<ToolDeclaration>,
): string | null {
  if (tools) {
    const match = tools.find((t) => t.name === toolName);
    if (match) return match.operatorId;
  }
  return toolName.replace(/_/g, ".");
}

function errorResult(call: ToolCall, message: string): ToolResult {
  return { id: call.id, name: call.name, ok: false, error: message };
}
