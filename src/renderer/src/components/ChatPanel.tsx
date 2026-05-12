import React, { useCallback, useEffect, useRef, useState } from "react";
import { css } from "@emotion/react";
import { MessageSquare, Send, X, Sparkles, RotateCcw, Loader2 } from "lucide-react";

import { runTurn } from "@/ai/turn-loop";
import {
  systemMessage,
  userMessage,
  type AssistantMessage,
  type Message,
} from "@/ai/messages";
import type { ToolCall, ToolResult } from "@/ai/types";
import { appAgent, appCtx, appOps, aiAvailable } from "@/ai/boot";
import { SCOUT_SYSTEM_PROMPT } from "@/ai/system-prompt";

// ---------------------------------------------------------------------------
// Tool call cards
// ---------------------------------------------------------------------------
//
// We render tool calls as inline cards inside the assistant's message
// block. Pending = grey spinner; ok = green check; error = red X. The
// argument JSON is collapsed by default — directors want the verb
// ("Set Weather Preset: storm"), not the schema.

interface ChatTurn {
  /** Stable id for React keying. */
  id: string;
  user: { text: string; imageDataUrl?: string };
  /** Mutable as the assistant streams. */
  assistantText: string;
  /** Tool call cards in execution order. */
  toolCalls: Array<{ call: ToolCall; result?: ToolResult }>;
  /** Set when the turn finishes; covers success, abort, and error. */
  finishState: "running" | "stop" | "max_iterations" | "aborted" | "error";
  errorMessage?: string;
}

const friendlyToolName = (name: string): string =>
  name
    .replace(/_/g, ".")
    .split(".")
    .map((part) => part.replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" / ");

function ToolCallCard({
  call,
  result,
}: {
  call: ToolCall;
  result?: ToolResult;
}) {
  const [expanded, setExpanded] = useState(false);
  const op = appOps.get(call.name.replace(/_/g, "."));

  const status: "pending" | "ok" | "error" = !result
    ? "pending"
    : result.ok
      ? "ok"
      : "error";

  const accent =
    status === "ok" ? "#22c55e" : status === "error" ? "#ef4444" : "#6b7280";

  return (
    <div
      css={css({
        margin: "6px 0",
        border: `1px solid ${accent}40`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: "6px",
        background: "#13131a",
        fontSize: "11px",
      })}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        css={css({
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 10px",
          background: "transparent",
          border: "none",
          color: "#e8e8ec",
          cursor: "pointer",
          textAlign: "left",
        })}
      >
        <span
          css={css({
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: accent,
            boxShadow: `0 0 4px ${accent}`,
            flexShrink: 0,
          })}
        />
        <span css={css({ fontWeight: 600, letterSpacing: "0.02em" })}>
          {op?.label ?? friendlyToolName(call.name)}
        </span>
        <span css={css({ marginLeft: "auto", color: "#6b7280", fontSize: "10px" })}>
          {status === "pending" ? "…" : status === "ok" ? "✓" : "✗"}
        </span>
      </button>
      {expanded && (
        <div
          css={css({
            padding: "0 10px 8px 22px",
            color: "#a8a8b0",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "10px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          })}
        >
          <div css={css({ color: "#6b7280" })}>args:</div>
          <div>{JSON.stringify(call.args, null, 2)}</div>
          {result?.ok && result.value !== undefined && (
            <>
              <div css={css({ color: "#6b7280", marginTop: "6px" })}>result:</div>
              <div>{formatResult(result.value)}</div>
            </>
          )}
          {!result?.ok && result?.error && (
            <>
              <div css={css({ color: "#ef4444", marginTop: "6px" })}>error:</div>
              <div>{result.error}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatResult(value: unknown): string {
  try {
    const s = JSON.stringify(value, null, 2);
    return s.length > 1500 ? s.slice(0, 1500) + "\n… (truncated)" : s;
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// Chat panel
// ---------------------------------------------------------------------------

export function ChatPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new content. Anchored to bottom while streaming.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  // Keep a running history for the model. Derived from `turns` so undo
  // / clear stay coherent.
  const historyRef = useRef<Message[]>([]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setTurns([]);
    setRunning(false);
    historyRef.current = [];
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || running || !appAgent) return;
    setInput("");

    const turnId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newTurn: ChatTurn = {
      id: turnId,
      user: { text },
      assistantText: "",
      toolCalls: [],
      finishState: "running",
    };
    setTurns((prev) => [...prev, newTurn]);
    setRunning(true);

    historyRef.current = [
      ...historyRef.current,
      systemMessage(SCOUT_SYSTEM_PROMPT),
      userMessage(text),
    ];
    // Collapse consecutive system messages so the model history stays
    // clean — we only need ONE system message at the head. The dedup
    // happens here rather than in turn-loop because system content
    // doesn't survive vendor mapping (Gemini lifts it to a separate
    // field).
    historyRef.current = dedupSystemMessages(historyRef.current);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const result = await runTurn({
        registry: appOps,
        ctx: appCtx,
        messages: historyRef.current,
        agent: appAgent,
        system: SCOUT_SYSTEM_PROMPT,
        signal: ctrl.signal,
        captureViewport: () => appCtx.services?.viewport?.capturePng()?.dataUrl ?? null,
        onTextDelta: (delta) => {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId ? { ...t, assistantText: t.assistantText + delta } : t,
            ),
          );
        },
        onToolCall: (call) => {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId
                ? { ...t, toolCalls: [...t.toolCalls, { call }] }
                : t,
            ),
          );
        },
        onToolResult: (call, res) => {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId
                ? {
                    ...t,
                    toolCalls: t.toolCalls.map((c) =>
                      c.call === call || c.call.id === call.id ? { ...c, result: res } : c,
                    ),
                  }
                : t,
            ),
          );
        },
        onAssistantMessage: (msg) => {
          // The loop appends to its local copy of messages; we mirror
          // into the persistent history so the next turn picks up
          // tool history correctly.
          historyRef.current = [...historyRef.current, msg];
        },
      });

      historyRef.current = result.messages;
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? {
                ...t,
                finishState: result.finishReason,
                errorMessage: result.error,
              }
            : t,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTurns((prev) =>
        prev.map((t) =>
          t.id === turnId
            ? { ...t, finishState: "error", errorMessage: msg }
            : t,
        ),
      );
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [input, running]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void send();
      }
    },
    [send],
  );

  if (!open) return null;

  const enabled = aiAvailable();

  return (
    <div
      css={css({
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: "360px",
        backgroundColor: "#0f0f11ee",
        backdropFilter: "blur(12px)",
        borderLeft: "1px solid #2a2a2e",
        display: "flex",
        flexDirection: "column",
        zIndex: 60,
        boxShadow: "-8px 0 32px rgba(0,0,0,0.5)",
      })}
    >
      {/* Header */}
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 14px",
          borderBottom: "1px solid #1e1e22",
          background: "linear-gradient(to bottom, #18181c 0%, #131318 100%)",
        })}
      >
        <Sparkles size={14} color="#a855f7" />
        <span
          css={css({
            fontSize: "11px",
            fontWeight: 700,
            color: "#e8e8ec",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            flex: 1,
          })}
        >
          AI Director
        </span>
        <button
          onClick={reset}
          title="Reset conversation"
          css={css({
            background: "transparent",
            border: "none",
            color: "#6b7280",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            ":hover": { color: "#a8a8b0" },
          })}
        >
          <RotateCcw size={13} />
        </button>
        <button
          onClick={onClose}
          title="Close (ESC)"
          css={css({
            background: "transparent",
            border: "none",
            color: "#6b7280",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            ":hover": { color: "#a8a8b0" },
          })}
        >
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        css={css({
          flex: 1,
          overflowY: "auto",
          padding: "12px 14px",
          fontSize: "12px",
          lineHeight: 1.5,
          color: "#e8e8ec",
        })}
      >
        {!enabled && (
          <div
            css={css({
              padding: "12px",
              background: "#2a1a1a",
              border: "1px solid #4a2a2a",
              borderRadius: "6px",
              color: "#ff9898",
              fontSize: "11px",
              lineHeight: 1.5,
            })}
          >
            AI chat is disabled — set <code>VITE_GEMINI_API_KEY</code> in{" "}
            <code>.env.local</code> and restart <code>npm run dev</code>.
          </div>
        )}

        {enabled && turns.length === 0 && (
          <div
            css={css({
              padding: "16px 4px",
              color: "#6b7280",
              fontSize: "11px",
              lineHeight: 1.6,
            })}
          >
            <div css={css({ fontWeight: 600, color: "#a8a8b0", marginBottom: "6px" })}>
              Try
            </div>
            <ul css={css({ paddingLeft: "18px", margin: 0 })}>
              <li>"make it look like a stormy noir scout"</li>
              <li>"golden hour, 50mm, shallow DoF"</li>
              <li>"capture this as Slot A, then try a Wes Anderson variant"</li>
              <li>"drop a hazard pin where the camera is looking"</li>
            </ul>
          </div>
        )}

        {turns.map((t) => (
          <div key={t.id} css={css({ marginBottom: "18px" })}>
            {/* User turn */}
            <div
              css={css({
                display: "flex",
                gap: "8px",
                marginBottom: "10px",
              })}
            >
              <div
                css={css({
                  width: "20px",
                  height: "20px",
                  flexShrink: 0,
                  borderRadius: "4px",
                  background: "#1c1c24",
                  border: "1px solid #2a2a30",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "9px",
                  color: "#a8a8b0",
                  fontWeight: 700,
                })}
              >
                YOU
              </div>
              <div css={css({ flex: 1, color: "#e8e8ec" })}>{t.user.text}</div>
            </div>
            {/* Assistant turn */}
            <div css={css({ display: "flex", gap: "8px" })}>
              <div
                css={css({
                  width: "20px",
                  height: "20px",
                  flexShrink: 0,
                  borderRadius: "4px",
                  background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "9px",
                  color: "#fff",
                  fontWeight: 700,
                })}
              >
                AI
              </div>
              <div css={css({ flex: 1, minWidth: 0 })}>
                {t.toolCalls.map((tc, i) => (
                  <ToolCallCard
                    key={tc.call.id ?? `${tc.call.name}-${i}`}
                    call={tc.call}
                    result={tc.result}
                  />
                ))}
                {t.assistantText && (
                  <div
                    css={css({
                      marginTop: "6px",
                      color: "#e8e8ec",
                      whiteSpace: "pre-wrap",
                    })}
                  >
                    {t.assistantText}
                  </div>
                )}
                {t.finishState === "running" && (
                  <div
                    css={css({
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      color: "#6b7280",
                      fontSize: "10px",
                      marginTop: "6px",
                    })}
                  >
                    <Loader2 size={11} className="spin" />
                    Thinking…
                  </div>
                )}
                {t.finishState === "error" && (
                  <div
                    css={css({
                      marginTop: "6px",
                      padding: "6px 8px",
                      background: "#2a1a1a",
                      borderRadius: "4px",
                      color: "#ff9898",
                      fontSize: "10px",
                    })}
                  >
                    Error: {t.errorMessage ?? "unknown"}
                  </div>
                )}
                {t.finishState === "max_iterations" && (
                  <div
                    css={css({
                      marginTop: "6px",
                      color: "#a8a8b0",
                      fontSize: "10px",
                      fontStyle: "italic",
                    })}
                  >
                    (stopped after max iterations)
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div
        css={css({
          padding: "10px 12px",
          borderTop: "1px solid #1e1e22",
          background: "#0f0f11",
        })}
      >
        <div
          css={css({
            display: "flex",
            alignItems: "flex-end",
            gap: "6px",
            background: "#13131a",
            border: "1px solid #2a2a30",
            borderRadius: "8px",
            padding: "6px 8px",
            ":focus-within": { borderColor: "#3a3a44" },
          })}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              enabled ? "Direct the scene…  (Enter to send, Shift+Enter for newline)" : "Disabled"
            }
            disabled={!enabled || running}
            rows={1}
            css={css({
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              color: "#e8e8ec",
              fontSize: "12px",
              fontFamily: "inherit",
              lineHeight: 1.5,
              maxHeight: "120px",
              "::placeholder": { color: "#6b7280" },
            })}
          />
          <button
            onClick={() => void send()}
            disabled={!enabled || running || input.trim().length === 0}
            title="Send (Enter)"
            css={css({
              background: input.trim().length
                ? "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)"
                : "#2a2a30",
              border: "none",
              borderRadius: "6px",
              padding: "6px 8px",
              color: "#fff",
              cursor: input.trim().length && !running ? "pointer" : "not-allowed",
              opacity: running ? 0.5 : 1,
              display: "flex",
              alignItems: "center",
              transition: "0.15s",
            })}
          >
            {running ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
          </button>
        </div>
      </div>

      {/* Local keyframes for the spinner */}
      <style>{`
        @keyframes scout-ai-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: scout-ai-spin 0.9s linear infinite; }
      `}</style>
    </div>
  );
}

function dedupSystemMessages(messages: Message[]): Message[] {
  let firstKept = false;
  return messages.filter((m) => {
    if (m.role !== "system") return true;
    if (firstKept) return false;
    firstKept = true;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Toolbar trigger
// ---------------------------------------------------------------------------

export function ChatPanelTrigger({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      title="AI Director chat"
      css={css({
        display: "flex",
        alignItems: "center",
        gap: "5px",
        background: open
          ? "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)"
          : "#13131a",
        border: open ? "1px solid #a855f7" : "1px solid #2a2a30",
        borderRadius: "6px",
        padding: "5px 10px",
        color: open ? "#fff" : "#a8a8b0",
        fontSize: "11px",
        fontWeight: 600,
        cursor: "pointer",
        transition: "0.15s",
        ":hover": {
          borderColor: "#a855f7",
          color: "#fff",
          boxShadow: "0 2px 12px rgba(168,85,247,0.4)",
        },
      })}
    >
      <MessageSquare size={11} />
      AI Chat
    </button>
  );
}
