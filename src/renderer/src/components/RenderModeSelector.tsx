import React, { useState, useRef, useEffect } from "react";
import { css } from "@emotion/react";
import { Layers3, Box, Building2, Check, ChevronDown } from "lucide-react";
import { useRenderModeStore, RENDER_MODE_OPTIONS, RenderMode } from "@/state/renderModeStore";
import { useProjectStore } from "@/state/projectStore";

const ICON_FOR_MODE: Record<RenderMode, React.ReactNode> = {
  osm: <Box size={12} />,
  photoreal: <Building2 size={12} />,
  hybrid: <Layers3 size={12} />,
};

const SHORT_LABEL: Record<RenderMode, string> = {
  osm: "OSM",
  photoreal: "Photoreal",
  hybrid: "Hybrid",
};

export function RenderModeSelector() {
  const { mode, setMode } = useRenderModeStore();
  const markDirty = useProjectStore((s) => s.markDirty);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} css={css({ position: "relative" })}>
      <button
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "5px",
          backgroundColor: "#13131a",
          border: "1px solid #2a2a30",
          borderRadius: "4px",
          padding: "5px 9px",
          color: "#a8a8b0",
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          fontFamily:
            "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
          cursor: "pointer",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 0 rgba(0,0,0,0.6)",
          transition: "120ms cubic-bezier(0.4, 0, 0.2, 1)",
          ":hover": {
            backgroundColor: "#1c1c24",
            borderColor: "#3a3a44",
            color: "#e8e8ec",
          },
          ":active": {
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
            backgroundColor: "#0e0e14",
          },
        })}
        onClick={() => setOpen(!open)}
        title="Switch render mode"
      >
        <span css={css({ color: "#3b82f6", display: "flex" })}>
          {ICON_FOR_MODE[mode]}
        </span>
        <span css={css({ color: "#e8e8ec" })}>{SHORT_LABEL[mode]}</span>
        <ChevronDown size={11} color="#6b6b78" />
      </button>

      {open && (
        <div
          css={css({
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            backgroundColor: "#17171a",
            border: "1px solid #2a2a2e",
            borderRadius: "8px",
            boxShadow: "0 8px 28px rgba(0,0,0,0.6)",
            zIndex: 100,
            minWidth: "260px",
            overflow: "hidden",
          })}
        >
          <div
            css={css({
              padding: "8px 12px",
              borderBottom: "1px solid #2a2a2e",
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#6b6b78",
              fontWeight: "600",
            })}
          >
            Render Mode
          </div>

          {RENDER_MODE_OPTIONS.map((opt) => {
            const isActive = opt.id === mode;
            return (
              <button
                key={opt.id}
                css={css({
                  width: "100%",
                  background: isActive ? "#1e2230" : "transparent",
                  border: "none",
                  borderLeft: isActive
                    ? "2px solid #3b82f6"
                    : "2px solid transparent",
                  padding: "10px 12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  textAlign: "left",
                  ":hover": { backgroundColor: "#1e1e22" },
                })}
                onClick={() => {
                  setMode(opt.id);
                  markDirty();
                  setOpen(false);
                }}
              >
                <div
                  css={css({
                    width: "22px",
                    height: "22px",
                    borderRadius: "5px",
                    backgroundColor: "#0f0f11",
                    border: "1px solid #2a2a2e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: "#3b82f6",
                  })}
                >
                  {ICON_FOR_MODE[opt.id]}
                </div>
                <div css={css({ flex: 1, minWidth: 0 })}>
                  <div
                    css={css({
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      marginBottom: "2px",
                    })}
                  >
                    <span
                      css={css({
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#e8e8ec",
                      })}
                    >
                      {opt.label}
                    </span>
                    {isActive && <Check size={11} color="#3b82f6" />}
                  </div>
                  <div
                    css={css({
                      fontSize: "10px",
                      color: "#6b6b78",
                      lineHeight: "1.4",
                    })}
                  >
                    {opt.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
