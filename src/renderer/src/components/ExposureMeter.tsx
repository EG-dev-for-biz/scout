import { useEffect, useRef, useState } from "react";
import { css } from "@emotion/react";
import { BarChart2, AlertTriangle, X } from "lucide-react";

// ---------------------------------------------------------------------------
// <ExposureMeter />
// ---------------------------------------------------------------------------
//
// Floating top-right panel that reads the canvas every 250 ms and plots
// a live luminance histogram of the current frame. Switchable to a
// "ZEBRA" mode that reports the percent of highlight-clipped pixels —
// the cinematographer's quick read on "am I blowing out?"
//
// Implementation notes:
//   - Sampling: we copy a downscaled image of the rendered canvas into
//     an offscreen 2D context, then `getImageData` once per frame. WebGL
//     canvases require preserveDrawingBuffer=true for this; scout3d's
//     Space.tsx already enables that for GLB export, so we get it free.
//   - Cost: 192×108 sample × 4 bytes × 4 buckets/loop ≈ 80 µs per tick.
//     Way under the 16 ms frame budget.
//   - Histogram is rendered with a path on a <canvas> to keep React
//     re-renders cheap (the histogram itself doesn't trigger a render;
//     only mode changes / collapse changes do).

const SAMPLE_W = 192;
const SAMPLE_H = 108;
const HIST_BINS = 64;
const SAMPLE_INTERVAL_MS = 250;

const METER_W = 168;
const METER_H = 84;

type Mode = "hist" | "zebra";

export function ExposureMeter() {
  const [mode, setMode] = useState<Mode>("hist");
  const [collapsed, setCollapsed] = useState(false);
  const [clipPct, setClipPct] = useState(0);

  // Histogram canvas — drawn imperatively each tick.
  const histCanvasRef = useRef<HTMLCanvasElement>(null);
  // Offscreen sampling canvas — reused across ticks to avoid alloc churn.
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Pre-allocated histogram buffer reused every tick. Allocating a new
  // Uint32Array each sample wasn't catastrophic but it was 256 bytes ×
  // 4 Hz × N seconds of churn that the GC had to keep clearing.
  const histBufRef = useRef<Uint32Array>(new Uint32Array(HIST_BINS));
  // Throttle React re-renders for the clipped-percentage readout. The
  // raw value updates 4×/s, but the user sees the same digit-resolution
  // result; only invalidate state when it actually changes.
  const lastClipPctRef = useRef<number>(-1);

  // Sampling loop. Runs while NOT collapsed (no point computing a
  // histogram nobody is looking at).
  useEffect(() => {
    if (collapsed) return;

    if (!sampleCanvasRef.current) {
      sampleCanvasRef.current = document.createElement("canvas");
      sampleCanvasRef.current.width = SAMPLE_W;
      sampleCanvasRef.current.height = SAMPLE_H;
    }

    let stopped = false;
    let timeoutId: number | null = null;

    const tick = () => {
      if (stopped) return;
      sampleAndPaint();
      timeoutId = window.setTimeout(tick, SAMPLE_INTERVAL_MS);
    };
    tick();

    return () => {
      stopped = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
    // Re-fire sampling loop on mode change so a fresh frame shows up.
  }, [collapsed, mode]);

  const sampleAndPaint = () => {
    // Grab the WebGL canvas. Same heuristic as captureCanvasSnapshot:
    // pick the largest <canvas> on the page.
    const canvases = Array.from(document.querySelectorAll("canvas")).filter(
      (c) => c !== sampleCanvasRef.current && c !== histCanvasRef.current
    );
    if (canvases.length === 0) return;
    const src = canvases.reduce((best, c) =>
      c.width * c.height > best.width * best.height ? c : best
    );
    if (src.width === 0 || src.height === 0) return;

    const off = sampleCanvasRef.current!;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    try {
      ctx.drawImage(src, 0, 0, SAMPLE_W, SAMPLE_H);
    } catch {
      // CORS-tainted canvases throw — silently skip, the meter just
      // pauses until the canvas is readable again.
      return;
    }
    const img = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;

    // Reuse the histogram buffer instead of allocating per tick.
    const hist = histBufRef.current;
    hist.fill(0);
    let clipped = 0;
    const total = SAMPLE_W * SAMPLE_H;
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i];
      const g = img[i + 1];
      const b = img[i + 2];
      // Rec. 709 luma.
      const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const bin = Math.min(HIST_BINS - 1, Math.floor(luma * HIST_BINS));
      hist[bin]++;
      if (luma > 0.95) clipped++;
    }
    const nextClipPct = Math.round((clipped / total) * 1000) / 10;
    // Only invalidate React state when the displayed value actually
    // changes. Cuts most of the 4 Hz re-render churn.
    if (nextClipPct !== lastClipPctRef.current) {
      lastClipPctRef.current = nextClipPct;
      setClipPct(nextClipPct);
    }

    // Render histogram canvas.
    if (mode === "hist") {
      const hc = histCanvasRef.current;
      if (!hc) return;
      const hctx = hc.getContext("2d");
      if (!hctx) return;
      hctx.clearRect(0, 0, hc.width, hc.height);

      // Background grid — three faint horizontal lines (low / mid / high).
      hctx.strokeStyle = "#1c1c22";
      hctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        const y = (hc.height * k) / 4;
        hctx.beginPath();
        hctx.moveTo(0, y);
        hctx.lineTo(hc.width, y);
        hctx.stroke();
      }
      // 18 % grey vertical marker — the photographer's "key tone."
      hctx.strokeStyle = "#3a3a44";
      const x18 = Math.round(hc.width * 0.18);
      hctx.beginPath();
      hctx.moveTo(x18, 0);
      hctx.lineTo(x18, hc.height);
      hctx.stroke();

      // Find max for normalization, ignoring the deep-black bin which
      // tends to dominate (sky/letterbox) and squashes the rest flat.
      let max = 0;
      for (let i = 1; i < HIST_BINS - 1; i++) {
        if (hist[i] > max) max = hist[i];
      }
      if (max === 0) max = 1;

      const binW = hc.width / HIST_BINS;
      for (let i = 0; i < HIST_BINS; i++) {
        const h = Math.min(hc.height, (hist[i] / max) * hc.height);
        // Color band: shadows (cool), mids (neutral), highlights (warm).
        const t = i / HIST_BINS;
        const fill =
          t < 0.18
            ? "#3b82f6"
            : t > 0.85
              ? "#ef4444"
              : t > 0.95
                ? "#ff6464"
                : "#e8e8ec";
        hctx.fillStyle = fill;
        hctx.fillRect(i * binW, hc.height - h, binW + 0.5, h);
      }
    }
  };

  return (
    <div
      css={css({
        position: "absolute",
        top: "12px",
        right: "12px",
        zIndex: 30,
        userSelect: "none",
        pointerEvents: "auto",
        // Matte plate body. Same vocabulary as TopBar buttons.
        backgroundColor: "#0a0a0ef0",
        backdropFilter: "blur(8px)",
        border: "1px solid #2a2a30",
        borderRadius: "4px",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.04), 0 6px 18px rgba(0,0,0,0.55)",
        overflow: "hidden",
      })}
    >
      {/* Header — mode toggle + collapse */}
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px 6px",
          borderBottom: collapsed ? "none" : "1px solid #1c1c22",
        })}
      >
        <button
          onClick={() => setMode("hist")}
          css={tabBtnCss(mode === "hist")}
          title="Luminance histogram"
        >
          <BarChart2 size={9} />
          HIST
        </button>
        <button
          onClick={() => setMode("zebra")}
          css={tabBtnCss(mode === "zebra")}
          title="Highlight-clipping percentage"
        >
          <AlertTriangle size={9} />
          ZEBRA
        </button>
        <div css={css({ flex: 1 })} />
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand exposure meter" : "Collapse"}
          css={css({
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "2px",
            color: "#6b6b78",
            display: "flex",
            ":hover": { color: "#e8e8ec" },
          })}
        >
          {collapsed ? <BarChart2 size={11} /> : <X size={11} />}
        </button>
      </div>

      {!collapsed && (
        <div
          css={css({
            width: `${METER_W}px`,
            height: `${METER_H}px`,
            position: "relative",
            backgroundColor: "#050508",
          })}
        >
          {mode === "hist" ? (
            <canvas
              ref={histCanvasRef}
              width={METER_W}
              height={METER_H}
              css={css({
                width: "100%",
                height: "100%",
                display: "block",
              })}
            />
          ) : (
            <ZebraReadout pct={clipPct} />
          )}

          {/* Tonal range labels along the bottom of the histogram. */}
          {mode === "hist" && (
            <div
              css={css({
                position: "absolute",
                bottom: "1px",
                left: "4px",
                right: "4px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "8px",
                color: "#4a4a54",
                fontFamily: "'SF Mono', Menlo, Consolas, monospace",
                letterSpacing: "0.04em",
                pointerEvents: "none",
              })}
            >
              <span>0</span>
              <span>18</span>
              <span>50</span>
              <span>90</span>
              <span>100</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ZebraReadout({ pct }: { pct: number }) {
  const dangerous = pct > 5;
  return (
    <div
      css={css({
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2px",
        padding: "6px",
      })}
    >
      <div
        css={css({
          fontSize: "9px",
          color: "#7a7a86",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 700,
        })}
      >
        Clipped
      </div>
      <div
        css={css({
          fontFamily: "'SF Mono', Menlo, Consolas, monospace",
          fontSize: "22px",
          fontWeight: 700,
          color: dangerous ? "#ef4444" : "#e8e8ec",
          lineHeight: 1,
          textShadow: dangerous ? "0 0 12px rgba(239,68,68,0.5)" : "none",
        })}
      >
        {pct.toFixed(1)}%
      </div>
      <div
        css={css({
          fontSize: "8px",
          color: dangerous ? "#ef4444" : "#4a4a54",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        })}
      >
        {dangerous ? "Highlights blown" : "Within range"}
      </div>
    </div>
  );
}

function tabBtnCss(active: boolean) {
  return css({
    display: "flex",
    alignItems: "center",
    gap: "3px",
    background: active ? "#1c1c24" : "transparent",
    border: `1px solid ${active ? "#3a3a44" : "transparent"}`,
    borderRadius: "3px",
    padding: "2px 6px",
    color: active ? "#e8e8ec" : "#6b6b78",
    fontSize: "8.5px",
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    fontFamily:
      "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
    cursor: "pointer",
    transition: "120ms",
    ":hover": {
      color: "#e8e8ec",
      backgroundColor: "#1c1c24",
    },
  });
}
