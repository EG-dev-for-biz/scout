import { useRef } from "react";
import { css, keyframes } from "@emotion/react";
import { useCameraStore } from "@/state/cameraStore";
import { useShutter, nextShotNumber } from "@/utils/useShutter";

// ---------------------------------------------------------------------------
// <ShutterButton />
// ---------------------------------------------------------------------------
//
// The cinema-style shutter release. Big red concentric circles, lives in
// the viewport center-bottom above the filmstrip + HUD. On press:
//   - 10 % scale-down snap, brief inner-ring highlight, 60 ms snap-back
//   - A short Web Audio click (synthesized — no asset shipping)
//   - Fires the capture pipeline via useShutter (pin + slate + thumbnail)
//
// Audio is generated lazily on first press so we don't claim an
// AudioContext at module load (modern browsers gate that on user
// gesture anyway). The oscillator is a brief 1200 Hz burst with a
// 30 ms exponential decay — reads as a "tac" not a "boop."

const press = keyframes`
  0%   { transform: translateX(-50%) scale(1.0); }
  35%  { transform: translateX(-50%) scale(0.86); }
  100% { transform: translateX(-50%) scale(1.0); }
`;

const innerFlash = keyframes`
  0%   { background-color: #dc2626; box-shadow: inset 0 1px 4px rgba(0,0,0,0.5); }
  35%  { background-color: #ff6464; box-shadow: 0 0 16px rgba(255,80,80,0.8); }
  100% { background-color: #dc2626; box-shadow: inset 0 1px 4px rgba(0,0,0,0.5); }
`;

export function ShutterButton() {
  const fire = useShutter();
  const cameraReady = useCameraStore((s) => s.current != null);

  // Animation toggles via a brief className flip. Using a ref so the
  // press animation can re-trigger on rapid fires without React state
  // churn.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  const handleClick = () => {
    if (!cameraReady) return;
    playShutterTone();

    // Force restart the CSS animation by toggling the class off then on
    // in a microtask. Without this, rapid presses don't re-run the
    // animation because the browser sees the same `animation` shorthand.
    const btn = buttonRef.current;
    const inner = innerRef.current;
    if (btn) {
      btn.classList.remove("shutter-press");
      void btn.offsetWidth; // force layout
      btn.classList.add("shutter-press");
    }
    if (inner) {
      inner.classList.remove("shutter-flash");
      void inner.offsetWidth;
      inner.classList.add("shutter-flash");
    }

    fire();
  };

  const upcomingShot = nextShotNumber();

  return (
    <button
      ref={buttonRef}
      onClick={handleClick}
      disabled={!cameraReady}
      title={cameraReady ? "Fire shutter (Space)" : "Camera not ready"}
      css={css({
        position: "absolute",
        bottom: "118px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "68px",
        height: "68px",
        borderRadius: "50%",
        // Body of the shutter — black knurled ring matching the camera
        // chrome elsewhere, with a subtle outer glow when ready.
        background:
          "radial-gradient(circle at 50% 35%, #2a2a30 0%, #0e0e14 70%, #050508 100%)",
        border: "1px solid #2a2a30",
        cursor: cameraReady ? "pointer" : "not-allowed",
        padding: 0,
        boxShadow: cameraReady
          ? "0 0 0 1px rgba(220,38,38,0.35), 0 8px 22px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: cameraReady ? 1 : 0.5,
        zIndex: 35,
        transition: "opacity 200ms, box-shadow 200ms",
        // Layered animation: outer button scales, inner cap flashes.
        // `.shutter-press` is toggled imperatively in handleClick.
        "&.shutter-press": {
          animation: `${press} 220ms cubic-bezier(0.32, 0, 0.18, 1)`,
        },
        ":hover:not(:disabled)": {
          boxShadow:
            "0 0 0 1px rgba(220,38,38,0.55), 0 0 16px rgba(220,38,38,0.35), 0 8px 22px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
        },
      })}
    >
      {/* Outer red ring — the iconic shutter-release red. */}
      <span
        css={css({
          width: "50px",
          height: "50px",
          borderRadius: "50%",
          background:
            "linear-gradient(to bottom, #ef4444 0%, #b91c1c 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow:
            "0 2px 4px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
        })}
      >
        {/* Inner button cap — flashes brighter on press. */}
        <span
          ref={innerRef}
          css={css({
            width: "30px",
            height: "30px",
            borderRadius: "50%",
            background: "#dc2626",
            boxShadow: "inset 0 1px 4px rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            "&.shutter-flash": {
              animation: `${innerFlash} 220ms cubic-bezier(0.32, 0, 0.18, 1)`,
            },
          })}
        >
          {/* Tiny shot-number readout in the cap. Reads as the "next
              take" number a slate would print. */}
          <span
            css={css({
              fontSize: "9px",
              fontWeight: 800,
              color: "#ffffff",
              fontFamily: "'SF Mono', Menlo, Consolas, monospace",
              letterSpacing: "0.03em",
              textShadow: "0 1px 0 rgba(0,0,0,0.5)",
              opacity: 0.9,
            })}
          >
            {String(upcomingShot).padStart(2, "0")}
          </span>
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

let audioContext: AudioContext | null = null;

/**
 * Synthesized shutter "tac" — short oscillator burst with exponential
 * volume decay. Built on demand (first press) since browsers gate
 * AudioContext creation on a user gesture.
 */
function playShutterTone(): void {
  try {
    if (!audioContext) {
      const AC =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      audioContext = new AC();
    }
    if (!audioContext) return;
    const ctx = audioContext;
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const dur = 0.035;

    // High-frequency "tac" — a short square-wave burst sounds more
    // mechanical than a sine. Filtered to keep it from feeling shrill.
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 600;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur + 0.01);
  } catch {
    // Audio is purely cosmetic — silently swallow errors so they never
    // break the shutter's primary job (creating the pin).
  }
}
