import type { Context } from "@/ops/types";
import type { OperatorRegistry } from "@/ops/registry";

import type { AgentClientLike } from "./gemini-client";
import { executeToolCall, summarizeToolResultForAi } from "./execute";
import {
  assistantMessage,
  toolMessage,
  userMessage,
  type AssistantMessage,
  type Message,
} from "./messages";
import { toAITools } from "./tool-projection";
import type { ToolCall, ToolResult } from "./types";

/**
 * One call drives the conversation forward by one user turn:
 *
 *   1. Send history + tool catalogue to the model.
 *   2. Stream events until `end` arrives.
 *   3. If end reason is `tool_calls`, execute them via the registry,
 *      append assistant + tool messages, and recurse.
 *   4. If end reason is `stop`, append the final assistant message
 *      and return.
 *
 * Bounded by `maxIterations` (default 32). Includes:
 *   - Viewport screenshot injection on visual prompts
 *   - Per-tool result truncation (data URLs → placeholders) before
 *     looping back so the model's context stays clean
 *   - Optional after-tool capture for visual self-evaluation
 */
export interface RunTurnOptions {
  registry: OperatorRegistry;
  ctx: Context;
  messages: Message[];
  agent: AgentClientLike;
  system?: string;
  /**
   * Optional hook to capture a viewport snapshot before starting the
   * turn. If the user's prompt implies a visual check (or
   * `captureViewportAlways` is true), the loop attaches the resulting
   * dataURL to the user's message.
   */
  captureViewport?: () => string | null;
  captureViewportAlways?: boolean;
  /**
   * After any iteration that executed a tool whose name appears in
   * `opIds`, await `capture()` and inject a synthetic user message
   * carrying the new viewport screenshot. Capped at `maxCaptures`.
   */
  afterToolCapture?: {
    opIds: ReadonlySet<string>;
    capture: () => Promise<string | null>;
    message: string;
    maxCaptures?: number;
  };
  onTextDelta?: (delta: string) => void;
  onToolCall?: (call: ToolCall) => void;
  onToolResult?: (call: ToolCall, result: ToolResult) => void;
  onAssistantMessage?: (msg: AssistantMessage) => void;
  maxIterations?: number;
  signal?: AbortSignal;
}

export interface RunTurnResult {
  messages: Message[];
  finishReason: "stop" | "max_iterations" | "aborted" | "error";
  finalText: string;
  error?: string;
}

export async function runTurn(opts: RunTurnOptions): Promise<RunTurnResult> {
  const maxIterations = opts.maxIterations ?? 32;
  const messages = opts.messages.slice();
  const tools = toAITools(opts.registry);

  let finalText = "";

  // Vision input: attach a viewport screenshot to the user's opening
  // message when relevant.
  const lastUserText = getLastUserMessageText(messages);
  if (opts.captureViewport && lastUserText) {
    const lower = lastUserText.toLowerCase();
    const impliesVisualCheck =
      opts.captureViewportAlways ||
      /\b(look|see|show|where|move|fix|frame|composition|lighting|sky|weather|color|colour)\b/.test(
        lower,
      );
    if (impliesVisualCheck) {
      const dataUrl = opts.captureViewport();
      if (dataUrl) {
        for (let j = messages.length - 1; j >= 0; j--) {
          const msg = messages[j];
          if (msg && msg.role === "user") {
            msg.imageDataUrl = dataUrl;
            break;
          }
        }
      }
    }
  }

  let capturesUsed = 0;
  const maxCaptures = opts.afterToolCapture?.maxCaptures ?? 3;

  for (let i = 0; i < maxIterations; i++) {
    if (opts.signal?.aborted) {
      return { messages, finishReason: "aborted", finalText };
    }

    let pendingText = "";
    let pendingCalls: ToolCall[] = [];
    let endReason: "stop" | "tool_calls" | "max_tokens" | "error" | null = null;
    let errorMessage: string | undefined;

    const iterator = opts.agent.streamTurn(
      {
        messages,
        tools,
        ...(opts.system !== undefined ? { system: opts.system } : {}),
      },
      opts.signal,
    );

    for await (const event of iterator) {
      switch (event.kind) {
        case "text":
          pendingText += event.delta;
          finalText += event.delta;
          opts.onTextDelta?.(event.delta);
          break;
        case "tool_call":
          pendingCalls.push(event.call);
          opts.onToolCall?.(event.call);
          break;
        case "end":
          endReason = event.reason;
          break;
        case "error":
          errorMessage = event.message;
          break;
      }
    }

    if (errorMessage) {
      return { messages, finishReason: "error", finalText, error: errorMessage };
    }

    const assistant = assistantMessage(
      pendingText,
      pendingCalls.length > 0 ? pendingCalls : undefined,
    );
    messages.push(assistant);
    opts.onAssistantMessage?.(assistant);

    if (endReason !== "tool_calls" || pendingCalls.length === 0) {
      return { messages, finishReason: "stop", finalText };
    }

    // Execute every tool call from this iteration in order. Truncate
    // the result on the way INTO the model history; UI callbacks see
    // the full untouched value.
    for (const call of pendingCalls) {
      const result = await executeToolCall(opts.registry, opts.ctx, call, tools);
      const summarized = summarizeToolResultForAi(result);
      messages.push(toolMessage(call.name, summarized, call.id));
      opts.onToolResult?.(call, result);
    }

    // Visual self-evaluation: if this iteration ran a watched tool and
    // we have captures left, await renderer flush and inject a
    // screenshot so the model can inspect what it produced.
    if (
      opts.afterToolCapture &&
      capturesUsed < maxCaptures &&
      pendingCalls.some((c) => {
        const { opIds } = opts.afterToolCapture!;
        return opIds.has(c.name) || opIds.has(c.name.replace(/_/g, "."));
      })
    ) {
      const dataUrl = await opts.afterToolCapture.capture();
      if (dataUrl) {
        capturesUsed++;
        messages.push(userMessage(opts.afterToolCapture.message, dataUrl));
      }
    }

    pendingCalls = [];
    pendingText = "";
  }

  return { messages, finishReason: "max_iterations", finalText };
}

function getLastUserMessageText(messages: ReadonlyArray<Message>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "user") return m.content;
  }
  return "";
}
