import React, { useEffect, useState } from "react";
import { css, keyframes } from "@emotion/react";
import { Sparkles, Camera, Brush, Check, AlertCircle } from "lucide-react";
import { usePaintFlowStore } from "@/state/paintFlowStore";
import { useStyleStore } from "@/state/styleStore";

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
`;

/**
 * Shown during auto-paint. During the `"capturing"` phase we shrink to a
 * compact corner card with NO fullscreen backdrop so the user can watch the
 * camera fly through the scene — and we display a live thumbnail of the most
 * recently captured frame so they can verify it's actually a perpendicular
 * facade view, not an aerial shot. Other phases keep the full overlay since
 * nothing visual is happening in the canvas at those times.
 */
export function PaintFlowOverlay() {
  const busy = usePaintFlowStore((s) => s.busy);
  const phase = usePaintFlowStore((s) => s.phase);
  const message = usePaintFlowStore((s) => s.message);
  const progress = usePaintFlowStore((s) => s.progress);
  const errorMessage = usePaintFlowStore((s) => s.errorMessage);
  const lastCapturePreview = usePaintFlowStore((s) => s.lastCapturePreview);
  const lastPaintedPreview = usePaintFlowStore((s) => s.lastPaintedPreview);
  const reset = usePaintFlowStore((s) => s.reset);
  const styleName = useStyleStore((s) => s.active.name);

  const [visible, setVisible] = useState(false);

  // Fade out 1.5s after finishing
  useEffect(() => {
    if (busy) {
      setVisible(true);
    } else if (phase === "done" || phase === "error") {
      setVisible(true);
      const t = setTimeout(() => {
        setVisible(false);
        // Reset state slightly later so the closing animation can complete
        setTimeout(() => reset(), 300);
      }, 1500);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [busy, phase, reset]);

  if (!visible) return null;

  const pct = progress.total > 0
    ? ((progress.captured + progress.painted) / (progress.total * 2)) * 100
    : 0;

  // During capture, show a small corner card so the 3D scene is visible.
  const compact = phase === "capturing";

  return (
    <div
      css={css(
        compact
          ? {
              position: "absolute",
              top: 16,
              right: 16,
              zIndex: 200,
              animation: `${fadeIn} 0.25s ease-out`,
              pointerEvents: "none",
            }
          : {
              position: "absolute",
              inset: 0,
              zIndex: 200,
              backgroundColor: "rgba(8, 8, 12, 0.78)",
              backdropFilter: "blur(8px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              animation: `${fadeIn} 0.25s ease-out`,
              pointerEvents: "auto",
            }
      )}
    >
      <div
        css={css({
          backgroundColor: compact ? "rgba(21,21,26,0.92)" : "#15151a",
          border: "1px solid #2a2a2e",
          borderRadius: "12px",
          padding: compact ? "14px 16px" : "24px 32px",
          minWidth: compact ? "320px" : "360px",
          maxWidth: compact ? "360px" : "480px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
          backdropFilter: compact ? "blur(10px)" : undefined,
          display: "flex",
          flexDirection: "column",
          gap: compact ? "10px" : "16px",
          pointerEvents: "auto",
        })}
      >
        {/* Header */}
        <div
          css={css({
            display: "flex",
            alignItems: "center",
            gap: "10px",
          })}
        >
          {phase === "error" ? (
            <AlertCircle size={20} color="#ef4444" />
          ) : phase === "done" ? (
            <Check size={20} color="#22c55e" />
          ) : (
            <Sparkles
              size={compact ? 16 : 20}
              color="#a855f7"
              css={css({ animation: `${pulse} 1.5s ease-in-out infinite` })}
            />
          )}
          <div>
            <div
              css={css({
                fontSize: compact ? "12px" : "14px",
                fontWeight: "700",
                color: "#e8e8ec",
              })}
            >
              {phase === "error"
                ? "Auto-Paint Error"
                : phase === "done"
                  ? "Painted!"
                  : compact
                    ? "Capturing facades…"
                    : "Auto-Painting Buildings"}
            </div>
            {!compact && (
              <div
                css={css({
                  fontSize: "11px",
                  color: "#6b6b78",
                  marginTop: "1px",
                })}
              >
                Source: Google Photoreal 3D Tiles · Style: {styleName}
              </div>
            )}
          </div>
        </div>

        {/* Live capture preview — debug affordance to confirm we're capturing
            actual facade views, not aerial. Shown during capturing + painting. */}
        {(phase === "capturing" || phase === "painting") && (
          <div
            css={css({
              display: "flex",
              gap: "8px",
            })}
          >
            <PreviewTile
              label="Capture"
              dataUrl={lastCapturePreview}
              accent="#06b6d4"
            />
            <PreviewTile
              label="Painted"
              dataUrl={lastPaintedPreview}
              accent="#8b5cf6"
            />
          </div>
        )}

        {/* Phase indicators */}
        {!compact && (
          <div
            css={css({
              display: "flex",
              gap: "10px",
              justifyContent: "space-between",
            })}
          >
            <PhaseStep
              label="Capture"
              icon={<Camera size={12} />}
              done={progress.captured >= progress.total && progress.total > 0}
              active={phase === "capturing"}
              count={`${progress.captured}/${progress.total}`}
            />
            <PhaseStep
              label="Paint"
              icon={<Brush size={12} />}
              done={
                progress.painted >= progress.total &&
                progress.total > 0 &&
                phase === "done"
              }
              active={phase === "painting"}
              count={`${progress.painted}/${progress.total}`}
            />
          </div>
        )}

        {/* Progress bar */}
        <div
          css={css({
            backgroundColor: "#0a0a0c",
            height: "4px",
            borderRadius: "999px",
            overflow: "hidden",
          })}
        >
          <div
            css={css({
              width: `${pct}%`,
              height: "100%",
              background:
                phase === "error"
                  ? "#ef4444"
                  : "linear-gradient(90deg, #06b6d4 0%, #8b5cf6 100%)",
              transition: "width 0.3s ease-out",
            })}
          />
        </div>

        {/* Status message */}
        <div
          css={css({
            fontSize: compact ? "11px" : "12px",
            color: phase === "error" ? "#fca5a5" : "#a0a0aa",
            textAlign: compact ? "left" : "center",
            lineHeight: "1.5",
            minHeight: "16px",
          })}
        >
          {errorMessage ?? message}
          {compact && (
            <span css={css({ color: "#6b6b78", marginLeft: 6 })}>
              · {progress.captured}/{progress.total}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewTile({
  label,
  dataUrl,
  accent,
}: {
  label: string;
  dataUrl: string | null;
  accent: string;
}) {
  return (
    <div
      css={css({
        flex: 1,
        aspectRatio: "1 / 1",
        borderRadius: "6px",
        overflow: "hidden",
        backgroundColor: "#0a0a0c",
        border: `1px solid ${dataUrl ? `${accent}66` : "#1e1e22"}`,
        position: "relative",
      })}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={label}
          css={css({
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          })}
        />
      ) : (
        <div
          css={css({
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "10px",
            color: "#4a4a54",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          })}
        >
          {label}…
        </div>
      )}
      <div
        css={css({
          position: "absolute",
          bottom: 4,
          left: 4,
          fontSize: "9px",
          fontWeight: "700",
          color: "#e8e8ec",
          backgroundColor: "rgba(0,0,0,0.65)",
          padding: "2px 5px",
          borderRadius: "3px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        })}
      >
        {label}
      </div>
    </div>
  );
}

function PhaseStep({
  label,
  icon,
  active,
  done,
  count,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  done: boolean;
  count: string;
}) {
  return (
    <div
      css={css({
        flex: 1,
        backgroundColor: active
          ? "#1e2230"
          : done
            ? "#0e1a14"
            : "#0a0a0c",
        border: `1px solid ${active ? "#3b82f6" : done ? "#22c55e44" : "#1e1e22"}`,
        borderRadius: "8px",
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      })}
    >
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "6px",
          color: active ? "#3b82f6" : done ? "#22c55e" : "#4a4a54",
        })}
      >
        {done ? <Check size={12} /> : icon}
        <span
          css={css({
            fontSize: "10px",
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          })}
        >
          {label}
        </span>
      </div>
      <div
        css={css({
          fontSize: "16px",
          fontWeight: "700",
          color: "#e8e8ec",
          fontFamily: "monospace",
        })}
      >
        {count}
      </div>
    </div>
  );
}
