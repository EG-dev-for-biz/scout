import { useEffect, useState } from "react";
import { css, keyframes } from "@emotion/react";
import { useSlateStore } from "@/state/slateStore";

// ---------------------------------------------------------------------------
// <SlateBurn />
// ---------------------------------------------------------------------------
//
// Production-style slate burn-in. When the shutter fires, the slateStore
// gets a new event; we play a short fade-in → hold → fade-out animation
// centered in the viewport. Reads exactly like a digital slate / clapboard
// in a virtual production HUD:
//
//     ┌──────────────────────────────┐
//     │   SHOT 12                    │
//     │   35MM   F/2.8               │
//     │   16:30  CLEAR · 8 M/S       │
//     └──────────────────────────────┘
//
// The horizontal sweep across the top mimics a clapper closing — the
// visual analog of the audio "tac" from the shutter button.
//
// Timing: 220 ms in → 900 ms hold → 600 ms out. Total ~1.7 s on screen.

const TOTAL_MS = 220 + 900 + 600;

const slateAnim = keyframes`
  0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
  13%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  64%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.05); }
`;

const clapper = keyframes`
  0%   { transform: translateX(-110%); }
  20%  { transform: translateX(0%); }
  100% { transform: translateX(0%); }
`;

export function SlateBurn() {
  const event = useSlateStore((s) => s.event);
  const clear = useSlateStore((s) => s.clear);
  // We keep a local "showing" snapshot so the animation can play out
  // even after the store has cleared. Each fire bumps the event id;
  // we react to that and re-snapshot.
  const [shown, setShown] = useState<typeof event>(null);

  useEffect(() => {
    if (!event) return;
    setShown(event);
    const t = window.setTimeout(() => {
      setShown(null);
      // Tell the store this event is finished so re-fires with the same
      // payload still trigger correctly via the id bump.
      clear();
    }, TOTAL_MS);
    return () => window.clearTimeout(t);
    // event id is the only signal we care about — payload is read
    // inside the effect via the snapshot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  if (!shown) return null;

  const fStopLabel =
    shown.fStop == null
      ? "—"
      : shown.fStop % 1 === 0
        ? shown.fStop.toFixed(0)
        : shown.fStop.toFixed(1);

  return (
    <div
      // The slate card itself. animation: name 0s linear forwards =>
      // ensures it inherits the keyframes and runs once.
      css={css({
        position: "absolute",
        top: "32%",
        left: "50%",
        // Initial position is set inside keyframes (translate -50% -50%),
        // so we don't need a static transform here.
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 60,
        animation: `${slateAnim} ${TOTAL_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`,
      })}
    >
      <div
        css={css({
          position: "relative",
          padding: "14px 22px",
          minWidth: "220px",
          // Slate body — matte black, hard edges, slim red trim along the
          // top to read as a clapper-board hinge.
          backgroundColor: "#0a0a0e",
          border: "1px solid #2a2a30",
          borderRadius: "3px",
          boxShadow:
            "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
          fontFamily: "'SF Mono', Menlo, Consolas, monospace",
          color: "#e8e8ec",
          overflow: "hidden",
        })}
      >
        {/* Clapper sweep — a black bar with diagonal stripes that
            slides in from the left, simulating the slate clack. */}
        <div
          css={css({
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "6px",
            background:
              "repeating-linear-gradient(45deg, #f5f5f5 0 8px, #0a0a0e 8px 16px)",
            transformOrigin: "left",
            animation: `${clapper} ${TOTAL_MS}ms cubic-bezier(0.32, 0.94, 0.46, 1) forwards`,
          })}
        />

        {/* SHOT N — the primary readout */}
        <div
          css={css({
            marginTop: "4px",
            fontSize: "20px",
            fontWeight: 800,
            letterSpacing: "0.12em",
            color: "#ffffff",
            display: "flex",
            alignItems: "baseline",
            gap: "10px",
          })}
        >
          <span css={css({ fontSize: "10px", color: "#7a7a86" })}>SHOT</span>
          <span>{String(shown.shotNumber).padStart(2, "0")}</span>
        </div>

        {/* Lens line */}
        <div
          css={css({
            marginTop: "6px",
            display: "flex",
            alignItems: "baseline",
            gap: "14px",
            fontSize: "13px",
            color: "#e8e8ec",
            letterSpacing: "0.05em",
          })}
        >
          <span>
            <span css={css({ color: "#7a7a86", fontSize: "9px" })}>LENS </span>
            <span css={css({ fontWeight: 700 })}>{shown.focalMM}</span>
            <span css={css({ color: "#7a7a86", fontSize: "10px" })}>MM</span>
          </span>
          {shown.fStop != null && (
            <span css={css({ color: "#d97757", fontWeight: 700 })}>
              f/{fStopLabel}
            </span>
          )}
        </div>

        {/* Time + WX line */}
        <div
          css={css({
            marginTop: "4px",
            fontSize: "11px",
            color: "#a8a8b0",
            letterSpacing: "0.05em",
            display: "flex",
            gap: "10px",
          })}
        >
          <span css={css({ color: "#e8e8ec", fontWeight: 600 })}>
            {shown.time}
          </span>
          <span css={css({ color: "#4a4a54" })}>·</span>
          <span>{shown.wx}</span>
        </div>

        {/* "REC" indicator in the corner — small detail that says this
            is a take, not just a label. */}
        <div
          css={css({
            position: "absolute",
            top: "14px",
            right: "12px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "8px",
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "#ef4444",
          })}
        >
          <span
            css={css({
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "#ef4444",
              boxShadow: "0 0 5px rgba(239,68,68,0.7)",
            })}
          />
          REC
        </div>
      </div>
    </div>
  );
}
