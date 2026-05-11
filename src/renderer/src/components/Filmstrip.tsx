import React, { useEffect, useRef, useState } from "react";
import { css } from "@emotion/react";
import { Film, Trash2, Camera } from "lucide-react";
import {
  useAnnotationStore,
  type AnnotationPin,
} from "@/state/annotationStore";
import { useCameraStore, fovToFocalLength } from "@/state/cameraStore";
import { useCarStore } from "@/state/carStore";
import { useProjectStore } from "@/state/projectStore";

// ---------------------------------------------------------------------------
// <Filmstrip />
// ---------------------------------------------------------------------------
//
// Horizontal scrolling strip docked along the viewport bottom (above the
// existing ViewportHUD). Shows one tile per shot-type pin in capture
// order:
//
//   ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
//   │ S01 │ │ S02 │ │ S03 │ │ S04 │  ← thumbnails
//   │ 35  │ │ 50  │ │ 24  │ │ 85  │  ← focal length badge
//   └─────┘ └─────┘ └─────┘ └─────┘
//
//   - Click a tile → frames the camera to that shot (cameraStore.requestFraming)
//   - Right-click → context menu (Frame / Rename / Delete)
//   - Auto-scrolls to the newest tile when a shot is captured
//   - Empty state: dashed-border placeholder telling the user to press the shutter

const TILE_W = 96;
const TILE_H = 54;

interface ShotTileProps {
  pin: AnnotationPin;
  index: number;
  isSelected: boolean;
  onFrame: (pin: AnnotationPin) => void;
  onContext: (e: React.MouseEvent, pin: AnnotationPin) => void;
}

const ShotTile = React.forwardRef<HTMLButtonElement, ShotTileProps>(
  function ShotTile({ pin, index, isSelected, onFrame, onContext }, ref) {
    const focal = pin.camera
      ? Math.round(fovToFocalLength(pin.camera.fov))
      : null;

    return (
      <button
        ref={ref}
        onClick={() => onFrame(pin)}
        onContextMenu={(e) => onContext(e, pin)}
        title={`${pin.name} — click to frame`}
        css={css({
          flexShrink: 0,
          width: `${TILE_W}px`,
          height: `${TILE_H}px`,
          padding: 0,
          backgroundColor: "#0a0a0e",
          border: `1px solid ${isSelected ? "#3b82f6" : "#2a2a30"}`,
          borderRadius: "3px",
          cursor: "pointer",
          position: "relative",
          overflow: "hidden",
          transition: "120ms cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: isSelected
            ? "0 0 0 1px rgba(59,130,246,0.6), 0 4px 12px rgba(0,0,0,0.5)"
            : "0 2px 6px rgba(0,0,0,0.4)",
          ":hover": {
            borderColor: "#3b82f6",
            transform: "translateY(-2px)",
            boxShadow:
              "0 0 0 1px rgba(59,130,246,0.4), 0 6px 14px rgba(0,0,0,0.5)",
          },
        })}
      >
        {/* Thumbnail */}
        {pin.thumbnail ? (
          <img
            src={pin.thumbnail}
            alt={pin.name}
            css={css({
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              opacity: isSelected ? 1 : 0.92,
            })}
          />
        ) : (
          // Older pins without a thumbnail get a placeholder icon —
          // still navigable, just visually marked as "no preview."
          <div
            css={css({
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#3a3a44",
              backgroundColor: "#13131a",
            })}
          >
            <Film size={20} />
          </div>
        )}

        {/* Shot number badge — top-left */}
        <span
          css={css({
            position: "absolute",
            top: "3px",
            left: "4px",
            fontSize: "8px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "#ffffff",
            backgroundColor: "rgba(0,0,0,0.7)",
            padding: "1px 4px",
            borderRadius: "2px",
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            pointerEvents: "none",
          })}
        >
          S{String(index + 1).padStart(2, "0")}
        </span>

        {/* Focal length badge — bottom-right */}
        {focal != null && (
          <span
            css={css({
              position: "absolute",
              bottom: "3px",
              right: "4px",
              fontSize: "8px",
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "#ffffff",
              backgroundColor: "rgba(0,0,0,0.7)",
              padding: "1px 4px",
              borderRadius: "2px",
              fontFamily: "'SF Mono', Menlo, Consolas, monospace",
              pointerEvents: "none",
            })}
          >
            {focal}mm
          </span>
        )}
      </button>
    );
  }
);

// ---------------------------------------------------------------------------
// Context menu for a shot tile (Frame / Rename / Delete).
// ---------------------------------------------------------------------------

interface ContextMenu {
  pin: AnnotationPin;
  x: number;
  y: number;
}

export function Filmstrip() {
  const pins = useAnnotationStore((s) => s.pins);
  const selectedPinId = useAnnotationStore((s) => s.selectedPinId);
  const selectPin = useAnnotationStore((s) => s.selectPin);
  const removePin = useAnnotationStore((s) => s.removePin);
  const updatePin = useAnnotationStore((s) => s.updatePin);
  const requestFraming = useCameraStore((s) => s.requestFraming);
  const setThirdMode = useCarStore((s) => s.setThirdMode);
  const markDirty = useProjectStore((s) => s.markDirty);

  // Shot pins only — non-shot pins (notes, hazards, locations) live in
  // the right-side annotation drawer.
  const shots = pins.filter((p) => p.type === "shot");

  const scrollRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const prevCountRef = useRef(shots.length);

  // Auto-scroll to the newest tile when a shot is captured (count grew).
  useEffect(() => {
    if (shots.length > prevCountRef.current) {
      const last = shots[shots.length - 1];
      const el = tileRefs.current[last.id];
      el?.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" });
    }
    prevCountRef.current = shots.length;
  }, [shots.length]);

  // Close the context menu on any click elsewhere or Esc.
  useEffect(() => {
    if (!menu) return;
    const handleClick = () => setMenu(null);
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [menu]);

  const handleFrame = (pin: AnnotationPin) => {
    if (!pin.camera) return;
    setThirdMode(false);
    requestFraming(pin.camera);
    selectPin(pin.id);
  };

  const handleContext = (e: React.MouseEvent, pin: AnnotationPin) => {
    e.preventDefault();
    setMenu({ pin, x: e.clientX, y: e.clientY });
  };

  const handleRename = (pin: AnnotationPin) => {
    setMenu(null);
    const name = window.prompt("Rename shot:", pin.name);
    if (name && name.trim().length > 0) {
      updatePin(pin.id, { name: name.trim() });
      markDirty();
    }
  };

  const handleDelete = (pin: AnnotationPin) => {
    setMenu(null);
    removePin(pin.id);
    markDirty();
  };

  return (
    <>
      <div
        css={css({
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "28px", // sits directly above ViewportHUD
          height: `${TILE_H + 24}px`,
          // Slim matte rail. Subtle top highlight + bottom shadow reads
          // as a recessed slot in the camera body.
          background:
            "linear-gradient(to bottom, rgba(14,14,20,0.85) 0%, rgba(10,10,14,0.92) 100%)",
          borderTop: "1px solid #1c1c22",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -4px 8px rgba(0,0,0,0.25)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "0 16px 0 12px",
          zIndex: 12,
        })}
      >
        {/* Label tab on the left — reads like the engraved "REEL" or
            "SHOTS" label on a camera mag. */}
        <div
          css={css({
            display: "flex",
            alignItems: "center",
            gap: "5px",
            color: "#7a7a86",
            fontSize: "9px",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontFamily:
              "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
            flexShrink: 0,
            paddingRight: "6px",
            borderRight: "1px solid #1c1c22",
            height: "100%",
            marginRight: "2px",
          })}
        >
          <Film size={11} color="#3b82f6" />
          <span>
            REEL
            <br />
            <span css={css({ color: "#4a4a54", fontSize: "8px" })}>
              {String(shots.length).padStart(2, "0")}
            </span>
          </span>
        </div>

        {/* Scrollable tile track */}
        <div
          ref={scrollRef}
          css={css({
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: "6px",
            overflowX: "auto",
            overflowY: "hidden",
            scrollbarWidth: "thin",
            scrollbarColor: "#2a2a30 transparent",
            paddingBottom: "4px",
            "::-webkit-scrollbar": { height: "4px" },
            "::-webkit-scrollbar-thumb": {
              backgroundColor: "#2a2a30",
              borderRadius: "2px",
            },
            "::-webkit-scrollbar-track": { background: "transparent" },
          })}
        >
          {shots.length === 0 ? (
            <div
              css={css({
                flex: 1,
                height: `${TILE_H}px`,
                border: "1px dashed #2a2a30",
                borderRadius: "3px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                color: "#4a4a54",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontFamily:
                  "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
              })}
            >
              <Camera size={12} />
              Press the shutter to capture a shot
            </div>
          ) : (
            shots.map((pin, i) => (
              <ShotTile
                key={pin.id}
                ref={(el) => {
                  tileRefs.current[pin.id] = el;
                }}
                pin={pin}
                index={i}
                isSelected={selectedPinId === pin.id}
                onFrame={handleFrame}
                onContext={handleContext}
              />
            ))
          )}
        </div>
      </div>

      {/* Context menu portal — positioned absolutely from the viewport
          so it floats above everything including the slate burn. */}
      {menu && (
        <div
          onClick={(e) => e.stopPropagation()}
          css={css({
            position: "fixed",
            top: `${menu.y}px`,
            left: `${menu.x}px`,
            backgroundColor: "#13131af5",
            backdropFilter: "blur(10px)",
            border: "1px solid #2a2a30",
            borderRadius: "5px",
            boxShadow: "0 10px 28px rgba(0,0,0,0.6)",
            padding: "4px",
            minWidth: "140px",
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
          })}
        >
          <MenuItem
            onClick={() => {
              handleFrame(menu.pin);
              setMenu(null);
            }}
          >
            <Camera size={11} /> Frame this shot
          </MenuItem>
          <MenuItem onClick={() => handleRename(menu.pin)}>
            <Film size={11} /> Rename
          </MenuItem>
          <MenuItem onClick={() => handleDelete(menu.pin)} danger>
            <Trash2 size={11} /> Delete
          </MenuItem>
        </div>
      )}
    </>
  );
}

function MenuItem({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      css={css({
        display: "flex",
        alignItems: "center",
        gap: "8px",
        background: "transparent",
        border: "none",
        padding: "6px 10px",
        color: danger ? "#ef4444" : "#a8a8b0",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        fontFamily:
          "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
        cursor: "pointer",
        borderRadius: "3px",
        textAlign: "left",
        ":hover": {
          backgroundColor: danger ? "#3a1414" : "#1c1c24",
          color: danger ? "#ff6464" : "#e8e8ec",
        },
      })}
    >
      {children}
    </button>
  );
}
