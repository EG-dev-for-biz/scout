import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { Sparkles, Send, Loader2, X, MessageSquare, CheckCircle2, XCircle } from "lucide-react";

import { runTurn } from "@/ai/turn-loop";
import { systemMessage, userMessage, type Message } from "@/ai/messages";
import type { ToolCall, ToolResult } from "@/ai/types";
import { appAgent, appCtx, appOps, aiAvailable } from "@/ai/boot";
import { SCOUT_SYSTEM_PROMPT } from "@/ai/system-prompt";

// ---------------------------------------------------------------------------
// PromptBar — floating Cmd+K prompt for the AI Director
// ---------------------------------------------------------------------------
//
// Companion to the full <ChatPanel>. Lives in the bottom-center of the
// viewport (above the shutter / filmstrip) and is the fastest path to
// firing an agent turn: hit Cmd+K, type, hit Enter. The full transcript
// is one click away via "Open chat".
//
// Why both this AND the ChatPanel? Different jobs:
//   - PromptBar: "do a thing right now". Single-shot, transient.
//   - ChatPanel: "I'm having a conversation". Multi-turn, sticky.
//
// Both share the same `runTurn` + history, so a turn fired from the
// prompt bar shows up in the full panel transcript and vice-versa.

interface RunningState {
  /** Latest tool call name (for the inline ticker). */
  latestCall: string | null;
  /** Total tool calls fired so far. */
  toolCount: number;
  /** Latest result status of the most recent tool. */
  latestStatus: "pending" | "ok" | "error";
  /** Accumulated assistant text. */
  text: string;
}

const friendlyLabel = (toolName: string): string => {
  const opId = toolName.replace(/_/g, ".");
  const op = appOps.get(opId);
  if (op) return op.label;
  return opId
    .split(".")
    .map((p) => p.replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" / ");
};

export interface PromptBarProps {
  /** Shared chat history. Mutated in place by the loop. */
  history: React.MutableRefObject<Message[]>;
  /** Called to surface the full chat panel ("Open chat" affordance). */
  onExpand: () => void;
}

/**
 * Imperative handle the parent uses to summon / focus / dismiss the bar.
 * Exposed via ref so a global Cmd+K shortcut at the App level can pop it
 * up without prop-drilling open state through every intermediate.
 */
export interface PromptBarHandle {
  open: () => void;
  close: () => void;
  toggle: () => void;
  focus: () => void;
}

export const PromptBar = React.forwardRef<PromptBarHandle, PromptBarProps>(
  function PromptBar({ history, onExpand }, ref) {
    const [visible, setVisible] = useState(false);
    const [input, setInput] = useState("");
    const [running, setRunning] = useState(false);
    const [run, setRun] = useState<RunningState | null>(null);
    const [lastFinishReason, setLastFinishReason] = useState<
      "stop" | "max_iterations" | "aborted" | "error" | null
    >(null);
    const [lastError, setLastError] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    // Track the most-recently-fired tool call so the result handler can
    // flip its status by identity instead of name (parallel calls with
    // the same name would otherwise clobber each other).
    const callIndexRef = useRef(new Map<ToolCall, number>());

    useEffect(() => {
      // Auto-clear the post-run "✓ done" badge after a few seconds so
      // the bar fades back to its idle state.
      if (lastFinishReason && !running) {
        const t = setTimeout(() => {
          setLastFinishReason(null);
          setLastError(null);
          setRun(null);
        }, 4000);
        return () => clearTimeout(t);
      }
      return;
    }, [lastFinishReason, running]);

    const close = useCallback(() => {
      // Don't strand a running turn; let it finish (or the user can
      // hit Esc again to abort).
      if (running) {
        abortRef.current?.abort();
        return;
      }
      setVisible(false);
    }, [running]);

    const open = useCallback(() => {
      setVisible(true);
      // Defer the focus call by a tick so the textarea is mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }, []);

    const toggle = useCallback(() => {
      setVisible((v) => {
        if (!v) requestAnimationFrame(() => inputRef.current?.focus());
        return !v;
      });
    }, []);

    React.useImperativeHandle(ref, () => ({
      open,
      close,
      toggle,
      focus: () => inputRef.current?.focus(),
    }));

    const send = useCallback(async () => {
      const text = input.trim();
      if (!text || running || !appAgent) return;
      setInput("");
      setRunning(true);
      setLastFinishReason(null);
      setLastError(null);
      setRun({ latestCall: null, toolCount: 0, latestStatus: "pending", text: "" });
      callIndexRef.current = new Map();

      // System prompt is appended once per turn at the head — same
      // dedup approach as the full ChatPanel.
      history.current = dedupSystemMessages([
        ...history.current,
        systemMessage(SCOUT_SYSTEM_PROMPT),
        userMessage(text),
      ]);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const result = await runTurn({
          registry: appOps,
          ctx: appCtx,
          messages: history.current,
          agent: appAgent,
          system: SCOUT_SYSTEM_PROMPT,
          signal: ctrl.signal,
          captureViewport: () =>
            appCtx.services?.viewport?.capturePng()?.dataUrl ?? null,
          onTextDelta: (delta) => {
            setRun((s) => (s ? { ...s, text: s.text + delta } : s));
          },
          onToolCall: (call) => {
            setRun((s) => {
              if (!s) return s;
              callIndexRef.current.set(call, s.toolCount);
              return {
                ...s,
                latestCall: call.name,
                toolCount: s.toolCount + 1,
                latestStatus: "pending",
              };
            });
          },
          onToolResult: (call, res) => {
            setRun((s) =>
              s
                ? {
                    ...s,
                    latestCall: call.name,
                    latestStatus: res.ok ? "ok" : "error",
                  }
                : s,
            );
          },
          onAssistantMessage: (msg) => {
            history.current = [...history.current, msg];
          },
        });
        history.current = result.messages;
        setLastFinishReason(result.finishReason);
        if (result.error) setLastError(result.error);
      } catch (err) {
        setLastFinishReason("error");
        setLastError(err instanceof Error ? err.message : String(err));
      } finally {
        setRunning(false);
        abortRef.current = null;
      }
    }, [input, running, history]);

    const handleKey = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          void send();
        } else if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      },
      [send, close],
    );

    const enabled = aiAvailable();

    if (!visible) return null;

    return (
      <div
        css={css({
          position: "absolute",
          left: "50%",
          bottom: "76px",
          transform: "translateX(-50%)",
          width: "min(640px, calc(100% - 80px))",
          zIndex: 70,
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          pointerEvents: "none",
        })}
      >
        {/* Streaming readout — only shows while a turn is in flight
            (or just finished). Sits ABOVE the input so the user can
            see what the AI is doing without losing the prompt. */}
        {(running || run || lastFinishReason) && (
          <StreamingReadout
            run={run}
            running={running}
            finishReason={lastFinishReason}
            errorMessage={lastError}
            onAbort={() => abortRef.current?.abort()}
            onExpand={onExpand}
          />
        )}

        {/* Input — always present while visible. */}
        <div
          css={css({
            pointerEvents: "auto",
            display: "flex",
            alignItems: "flex-end",
            gap: "8px",
            backgroundColor: "#0f0f11f0",
            backdropFilter: "blur(16px)",
            border: "1px solid #2a2a30",
            borderRadius: "12px",
            padding: "8px 10px",
            boxShadow:
              "0 16px 48px rgba(0,0,0,0.6), 0 2px 0 rgba(255,255,255,0.04) inset",
            transition: "border-color 120ms",
            ":focus-within": { borderColor: "#a855f7" },
          })}
        >
          <div
            css={css({
              width: "20px",
              height: "20px",
              borderRadius: "5px",
              background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            })}
          >
            <Sparkles size={11} color="#fff" />
          </div>

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              enabled
                ? "Direct the scene…  (Enter to run, Shift+Enter newline, Esc to dismiss)"
                : "AI disabled — set VITE_GEMINI_API_KEY in .env.local"
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
              fontSize: "13px",
              fontFamily:
                "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
              lineHeight: 1.5,
              maxHeight: "120px",
              padding: "3px 0",
              "::placeholder": { color: "#6b7280" },
            })}
          />

          <KeyHint label="⌘K" />

          <button
            onClick={() => void send()}
            disabled={!enabled || running || input.trim().length === 0}
            title={running ? "Abort (Esc)" : "Send (Enter)"}
            css={css({
              background:
                running
                  ? "#2a2a30"
                  : input.trim().length
                    ? "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)"
                    : "#1c1c24",
              border: "none",
              borderRadius: "6px",
              padding: "6px 9px",
              color: "#fff",
              cursor:
                (input.trim().length && !running) || running
                  ? "pointer"
                  : "not-allowed",
              opacity: !enabled ? 0.4 : 1,
              display: "flex",
              alignItems: "center",
              transition: "0.15s",
            })}
          >
            {running ? <Loader2 size={13} className="prompt-spin" /> : <Send size={13} />}
          </button>

          <button
            onClick={close}
            title={running ? "Abort and close (Esc)" : "Close (Esc)"}
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
            <X size={13} />
          </button>
        </div>

        <style>{`
          @keyframes prompt-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          .prompt-spin { animation: prompt-spin 0.9s linear infinite; }
        `}</style>
      </div>
    );
  },
);

// ---------------------------------------------------------------------------
// StreamingReadout — the live status pill above the input
// ---------------------------------------------------------------------------
//
// Three visual states layered into one component:
//   - running: spinner + "Director · running step N · <latest tool>"
//   - finished + tools: "✓ done · N steps" with an "open chat" affordance
//   - text-only: shows the assistant text directly (small + truncated)
//
// Truncation matters here — a 10-line response would dominate the
// viewport. We clamp to ~3 lines visually and route the user to the
// full ChatPanel for the complete transcript.

function StreamingReadout({
  run,
  running,
  finishReason,
  errorMessage,
  onAbort,
  onExpand,
}: {
  run: RunningState | null;
  running: boolean;
  finishReason: "stop" | "max_iterations" | "aborted" | "error" | null;
  errorMessage: string | null;
  onAbort: () => void;
  onExpand: () => void;
}) {
  const status: "running" | "ok" | "warn" | "error" = running
    ? "running"
    : finishReason === "error" || finishReason === "aborted"
      ? "error"
      : finishReason === "max_iterations"
        ? "warn"
        : "ok";

  const accent = useMemo(() => {
    if (status === "running") return "#a855f7";
    if (status === "ok") return "#22c55e";
    if (status === "warn") return "#f59e0b";
    return "#ef4444";
  }, [status]);

  const headerLine = useMemo(() => {
    if (status === "running") {
      if (run?.latestCall) {
        return `Step ${run.toolCount} · ${friendlyLabel(run.latestCall)}`;
      }
      return "Thinking…";
    }
    if (status === "ok") {
      return run && run.toolCount > 0
        ? `Done · ${run.toolCount} step${run.toolCount === 1 ? "" : "s"}`
        : "Done";
    }
    if (status === "warn") return "Stopped at iteration limit";
    if (finishReason === "aborted") return "Aborted";
    return errorMessage ?? "Error";
  }, [status, run, finishReason, errorMessage]);

  return (
    <div
      css={css({
        pointerEvents: "auto",
        backgroundColor: "#13131af0",
        backdropFilter: "blur(12px)",
        border: `1px solid ${accent}40`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: "10px",
        padding: "8px 12px",
        fontSize: "11px",
        color: "#e8e8ec",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        boxShadow: "0 10px 32px rgba(0,0,0,0.4)",
      })}
    >
      {/* Header row: status icon + headline + actions. */}
      <div css={css({ display: "flex", alignItems: "center", gap: "8px" })}>
        {status === "running" ? (
          <Loader2 size={12} className="prompt-spin" color={accent} />
        ) : status === "ok" ? (
          <CheckCircle2 size={12} color={accent} />
        ) : (
          <XCircle size={12} color={accent} />
        )}
        <span
          css={css({
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: "#e8e8ec",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          })}
        >
          {headerLine}
        </span>

        {status === "running" && (
          <button
            onClick={onAbort}
            css={css({
              background: "transparent",
              border: "1px solid #2a2a30",
              borderRadius: "4px",
              padding: "1px 6px",
              color: "#a8a8b0",
              fontSize: "10px",
              cursor: "pointer",
              ":hover": { color: "#e8e8ec", borderColor: "#3a3a44" },
            })}
          >
            Abort
          </button>
        )}

        <button
          onClick={onExpand}
          title="Open full chat"
          css={css({
            display: "flex",
            alignItems: "center",
            gap: "4px",
            background: "transparent",
            border: "none",
            color: "#6b7280",
            cursor: "pointer",
            padding: "0",
            fontSize: "10px",
            ":hover": { color: "#a8a8b0" },
          })}
        >
          <MessageSquare size={11} />
          Chat
        </button>
      </div>

      {/* Body: latest tool result indicator (when running) or
          accumulated assistant text (when done). Clamped to 3 lines so
          the readout never grows tall enough to obscure the scene. */}
      {run?.text && (
        <div
          css={css({
            color: "#a8a8b0",
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            fontSize: "11px",
          })}
        >
          {run.text}
        </div>
      )}

      {status === "error" && errorMessage && !run?.text && (
        <div
          css={css({
            color: "#ff9898",
            fontSize: "10px",
            lineHeight: 1.5,
            wordBreak: "break-word",
          })}
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}

function KeyHint({ label }: { label: string }) {
  return (
    <span
      css={css({
        fontSize: "9px",
        color: "#6b7280",
        backgroundColor: "#1c1c24",
        border: "1px solid #2a2a30",
        borderRadius: "3px",
        padding: "1px 5px",
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        letterSpacing: "0.04em",
        userSelect: "none",
      })}
    >
      {label}
    </span>
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
