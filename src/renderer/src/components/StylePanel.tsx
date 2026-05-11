import React, { useState, useRef, useEffect } from "react";
import { css } from "@emotion/react";
import { Palette, Check, ChevronDown } from "lucide-react";
import { useStyleStore, STYLE_PRESETS } from "@/state/styleStore";
import { useProjectStore } from "@/state/projectStore";

/**
 * Compact dropdown selector that lives in the top bar.
 * Switches the active StyleProfile, which Space.tsx + PostFX.tsx
 * subscribe to via Zustand.
 */
export function StyleSelector() {
  const { activeId, active, setActiveById } = useStyleStore();
  const markDirty = useProjectStore((s) => s.markDirty);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} css={css({ position: "relative" })}>
      <button
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "6px",
          backgroundColor: "#1e1e22",
          border: "1px solid #2a2a2e",
          borderRadius: "6px",
          padding: "5px 10px",
          color: "#a0a0aa",
          fontSize: "11px",
          fontWeight: "500",
          cursor: "pointer",
          transition: "0.15s",
          ":hover": {
            backgroundColor: "#2a2a2e",
            color: "#e8e8ec",
          },
        })}
        onClick={() => setOpen(!open)}
        title="Change visual style"
      >
        <Palette size={12} color="#3b82f6" />
        <span css={css({ color: "#e8e8ec" })}>{active.name}</span>
        <ChevronDown size={11} />
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
            minWidth: "240px",
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
            Visual Style
          </div>

          <div css={css({ maxHeight: "400px", overflowY: "auto" })}>
            {STYLE_PRESETS.map((p) => {
              const isActive = p.id === activeId;
              return (
                <button
                  key={p.id}
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
                    transition: "0.1s",
                    ":hover": { backgroundColor: "#1e1e22" },
                  })}
                  onClick={() => {
                    setActiveById(p.id);
                    markDirty();
                    setOpen(false);
                  }}
                >
                  {/* Color swatch preview */}
                  <div
                    css={css({
                      width: "24px",
                      height: "24px",
                      borderRadius: "4px",
                      flexShrink: 0,
                      border: "1px solid #2a2a2e",
                      background: `linear-gradient(135deg, ${p.sky.sunColor} 0%, ${p.materials.buildingHover} 50%, ${p.sky.fogColor} 100%)`,
                    })}
                  />

                  {/* Text */}
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
                        {p.name}
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
                      {p.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div
            css={css({
              padding: "8px 12px",
              borderTop: "1px solid #2a2a2e",
              fontSize: "10px",
              color: "#4a4a54",
            })}
          >
            Style is saved with the project file.
          </div>
        </div>
      )}
    </div>
  );
}
