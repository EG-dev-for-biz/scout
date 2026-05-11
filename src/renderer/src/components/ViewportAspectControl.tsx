import React, { useState, useRef, useEffect } from "react";
import { css } from "@emotion/react";
import {
  RectangleHorizontal,
  Square,
  RectangleVertical,
  Maximize,
  ChevronDown,
} from "lucide-react";
import {
  useViewportStore,
  ASPECT_RATIO_OPTIONS,
  type AspectRatio,
} from "@/state/viewportStore";

/**
 * Floating viewport aspect-ratio picker. Sits top-right inside the 3D
 * canvas frame so the available presets reflect the currently visible
 * letterbox/pillarbox.
 *
 * Closed: a compact pill showing current ratio + chevron.
 * Open: a small menu of ratio presets (Free / 16:9 / 1:1 / 21:9 / 9:16).
 */
export function ViewportAspectControl() {
  const aspectRatio = useViewportStore((s) => s.aspectRatio);
  const setAspectRatio = useViewportStore((s) => s.setAspectRatio);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const current = ASPECT_RATIO_OPTIONS.find((o) => o.id === aspectRatio);

  return (
    <div
      ref={rootRef}
      css={css({
        position: "absolute",
        top: "12px",
        right: "12px",
        zIndex: 40,
      })}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        title="Viewport aspect ratio"
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "5px",
          backgroundColor: "#17171af0",
          backdropFilter: "blur(8px)",
          border: "1px solid #2a2a2e",
          borderRadius: "6px",
          padding: "5px 8px",
          color: "#a0a0aa",
          fontSize: "11px",
          fontWeight: "600",
          fontFamily: "system-ui, -apple-system, sans-serif",
          cursor: "pointer",
          transition: "0.15s",
          ":hover": { color: "#e8e8ec", borderColor: "#3a3a3e" },
        })}
      >
        <AspectIcon id={aspectRatio} />
        <span>{current?.label ?? "Free"}</span>
        <ChevronDown
          size={11}
          css={css({
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          })}
        />
      </button>

      {open && (
        <div
          css={css({
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: "180px",
            backgroundColor: "#17171af5",
            backdropFilter: "blur(10px)",
            border: "1px solid #2a2a2e",
            borderRadius: "8px",
            padding: "4px",
            boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
            display: "flex",
            flexDirection: "column",
            gap: "1px",
          })}
        >
          {ASPECT_RATIO_OPTIONS.map((opt) => {
            const active = opt.id === aspectRatio;
            return (
              <button
                key={opt.id}
                onClick={() => {
                  setAspectRatio(opt.id);
                  setOpen(false);
                }}
                css={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 8px",
                  backgroundColor: active ? "#2a2a2e" : "transparent",
                  border: "none",
                  borderRadius: "5px",
                  color: active ? "#e8e8ec" : "#a0a0aa",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "0.12s",
                  ":hover": { backgroundColor: "#2a2a2e", color: "#e8e8ec" },
                })}
              >
                <span
                  css={css({
                    width: "14px",
                    display: "flex",
                    justifyContent: "center",
                    color: active ? "#3b82f6" : "#6b6b78",
                  })}
                >
                  <AspectIcon id={opt.id} />
                </span>
                <span
                  css={css({
                    flex: 1,
                    fontSize: "11px",
                    fontWeight: "600",
                  })}
                >
                  {opt.label}
                </span>
                <span
                  css={css({
                    fontSize: "10px",
                    color: "#6b6b78",
                  })}
                >
                  {opt.description}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AspectIcon({ id }: { id: AspectRatio }) {
  switch (id) {
    case "free":
      return <Maximize size={12} />;
    case "1:1":
      return <Square size={12} />;
    case "9:16":
      return <RectangleVertical size={12} />;
    case "16:9":
    case "21:9":
    default:
      return <RectangleHorizontal size={12} />;
  }
}
