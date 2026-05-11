import React, { useState, useRef, useEffect } from "react";
import { css } from "@emotion/react";
import { Aperture, ChevronDown } from "lucide-react";
import {
  useCameraStore,
  fovToFocalLength,
  LENS_PRESETS,
  type LensPreset,
} from "@/state/cameraStore";

/**
 * Top-bar lens picker. Shows the current focal length, opens a dropdown of
 * cinematographer-friendly presets (14 / 24 / 35 / 50 / 85 / 135 / 200 mm)
 * plus a custom slider for non-standard focal lengths.
 *
 * Reads live focal length from `cameraStore.current.fov` (continuously
 * updated by CameraController) so the badge stays in sync as the camera
 * settles toward the chosen lens — not just when the user picks one.
 */
export function LensPicker() {
  const current = useCameraStore((s) => s.current);
  const userFovDeg = useCameraStore((s) => s.userFovDeg);
  const setLensFocalMM = useCameraStore((s) => s.setLensFocalMM);
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

  // Live focal length read from the camera; falls back to the user-chosen
  // value before the camera publishes its first snapshot.
  const liveFocal = current
    ? Math.round(fovToFocalLength(current.fov))
    : Math.round(fovToFocalLength(userFovDeg));
  const userFocal = Math.round(fovToFocalLength(userFovDeg));

  // Determine which preset is "active" — exact match to user's chosen
  // focal length (within ±1mm tolerance).
  const activePreset = LENS_PRESETS.find(
    (p) => Math.abs(p.focalMM - userFocal) <= 1
  );

  return (
    <div ref={rootRef} css={css({ position: "relative" })}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Pick a lens"
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "5px",
          backgroundColor: "#1e1e22",
          border: "1px solid #2a2a2e",
          borderRadius: "6px",
          padding: "5px 9px",
          color: "#e8e8ec",
          fontSize: "11px",
          fontWeight: "500",
          cursor: "pointer",
          transition: "0.15s",
          ":hover": {
            backgroundColor: "#2a2a2e",
            borderColor: "#3b82f6",
          },
        })}
      >
        <Aperture size={12} color="#3b82f6" />
        <span>Lens</span>
        <span
          css={css({
            color: "#6b6b78",
            fontFamily: "monospace",
            fontSize: "10px",
            minWidth: "32px",
            textAlign: "right",
          })}
        >
          {liveFocal}mm
        </span>
        <ChevronDown
          size={10}
          color="#6b6b78"
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
            minWidth: "260px",
            backgroundColor: "#17171af5",
            backdropFilter: "blur(10px)",
            border: "1px solid #2a2a2e",
            borderRadius: "8px",
            padding: "4px",
            boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
            display: "flex",
            flexDirection: "column",
            gap: "1px",
            zIndex: 200,
          })}
        >
          {LENS_PRESETS.map((preset) => (
            <PresetRow
              key={preset.focalMM}
              preset={preset}
              active={preset === activePreset}
              onClick={() => {
                setLensFocalMM(preset.focalMM);
                setOpen(false);
              }}
            />
          ))}

          {/* Custom focal length slider */}
          <div
            css={css({
              marginTop: "4px",
              padding: "8px",
              borderTop: "1px solid #2a2a2e",
            })}
          >
            <div
              css={css({
                display: "flex",
                justifyContent: "space-between",
                fontSize: "10px",
                color: "#a0a0aa",
                marginBottom: "5px",
              })}
            >
              <span>Custom</span>
              <span
                css={css({
                  color: "#e8e8ec",
                  fontFamily: "monospace",
                })}
              >
                {userFocal}mm
              </span>
            </div>
            <input
              type="range"
              min={8}
              max={300}
              step={1}
              value={userFocal}
              onChange={(e) =>
                setLensFocalMM(parseInt(e.target.value, 10))
              }
              css={css({
                width: "100%",
                accentColor: "#3b82f6",
              })}
            />
            <div
              css={css({
                display: "flex",
                justifyContent: "space-between",
                fontSize: "9px",
                color: "#4a4a54",
                marginTop: "2px",
              })}
            >
              <span>8</span>
              <span>50</span>
              <span>150</span>
              <span>300</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PresetRow({
  preset,
  active,
  onClick,
}: {
  preset: LensPreset;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
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
          width: "44px",
          fontSize: "11px",
          fontWeight: "600",
          fontFamily: "monospace",
          color: active ? "#3b82f6" : "#6b6b78",
        })}
      >
        {preset.label}
      </span>
      <span
        css={css({
          flex: 1,
          fontSize: "10px",
          color: active ? "#a0a0aa" : "#6b6b78",
          lineHeight: "1.3",
        })}
      >
        {preset.description}
      </span>
    </button>
  );
}
