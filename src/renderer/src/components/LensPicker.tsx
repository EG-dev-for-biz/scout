import React, { useState, useRef, useEffect } from "react";
import { css } from "@emotion/react";
import { Aperture, ChevronDown, Target, Focus, X } from "lucide-react";
import {
  useCameraStore,
  fovToFocalLength,
  LENS_PRESETS,
  F_STOP_PRESETS,
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
  // DoF state
  const dofEnabled = useCameraStore((s) => s.dofEnabled);
  const apertureF = useCameraStore((s) => s.apertureF);
  const focusTarget = useCameraStore((s) => s.focusTarget);
  const focusPickMode = useCameraStore((s) => s.focusPickMode);
  const setDofEnabled = useCameraStore((s) => s.setDofEnabled);
  const setApertureF = useCameraStore((s) => s.setApertureF);
  const setFocusTarget = useCameraStore((s) => s.setFocusTarget);
  const setFocusPickMode = useCameraStore((s) => s.setFocusPickMode);

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

  // Distance from live camera position to the focus point, for the readout.
  let focusDistanceM: number | null = null;
  if (focusTarget && current) {
    const dx = current.position[0] - focusTarget[0];
    const dy = current.position[1] - focusTarget[1];
    const dz = current.position[2] - focusTarget[2];
    focusDistanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

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

          {/* Depth of field section */}
          <div
            css={css({
              padding: "8px",
              borderTop: "1px solid #2a2a2e",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            })}
          >
            <label
              css={css({
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                userSelect: "none",
                fontSize: "11px",
                fontWeight: "600",
                color: "#e8e8ec",
              })}
            >
              <span
                css={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                })}
              >
                <Focus size={11} color="#d97757" />
                Depth of field
              </span>
              <input
                type="checkbox"
                checked={dofEnabled}
                onChange={(e) => setDofEnabled(e.target.checked)}
                css={css({ accentColor: "#3b82f6", margin: 0 })}
              />
            </label>

            {dofEnabled && (
              <>
                {/* F-stop dropdown */}
                <div
                  css={css({
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    fontSize: "10px",
                    color: "#a0a0aa",
                  })}
                >
                  <span>Aperture</span>
                  <select
                    value={apertureF}
                    onChange={(e) => setApertureF(parseFloat(e.target.value))}
                    css={css({
                      backgroundColor: "#0f0f11",
                      border: "1px solid #2a2a2e",
                      borderRadius: "4px",
                      padding: "3px 6px",
                      color: "#e8e8ec",
                      fontSize: "10px",
                      fontFamily: "monospace",
                      outline: "none",
                      colorScheme: "dark",
                      cursor: "pointer",
                      ":focus": { borderColor: "#3b82f6" },
                    })}
                  >
                    {F_STOP_PRESETS.map((fs) => (
                      <option key={fs.value} value={fs.value}>
                        {fs.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Click-to-focus toggle + focus point readout */}
                <button
                  onClick={() => setFocusPickMode(!focusPickMode)}
                  css={css({
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                    backgroundColor: focusPickMode ? "#3b82f6" : "#1e1e22",
                    border:
                      "1px " +
                      (focusPickMode ? "solid" : "dashed") +
                      " " +
                      (focusPickMode ? "#3b82f6" : "#3a3a3e"),
                    borderRadius: "5px",
                    padding: "6px 8px",
                    color: focusPickMode ? "#fff" : "#a0a0aa",
                    fontSize: "10px",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "0.15s",
                    ":hover": {
                      backgroundColor: focusPickMode ? "#2563eb" : "#2a2a2e",
                      color: "#e8e8ec",
                    },
                  })}
                >
                  <Target size={10} />
                  {focusPickMode
                    ? "Click in scene to set focus…"
                    : "Click to focus"}
                </button>

                {focusTarget && (
                  <div
                    css={css({
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "10px",
                      color: "#a0a0aa",
                    })}
                  >
                    <span>Focus distance</span>
                    <span
                      css={css({
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      })}
                    >
                      <span
                        css={css({
                          color: "#e8e8ec",
                          fontFamily: "monospace",
                        })}
                      >
                        {focusDistanceM != null
                          ? focusDistanceM > 1000
                            ? (focusDistanceM / 1000).toFixed(1) + "km"
                            : focusDistanceM.toFixed(1) + "m"
                          : "—"}
                      </span>
                      <button
                        onClick={() => setFocusTarget(null)}
                        title="Clear focus point"
                        css={css({
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: "#6b6b78",
                          padding: 0,
                          display: "flex",
                          ":hover": { color: "#e8e8ec" },
                        })}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  </div>
                )}

                <div
                  css={css({
                    fontSize: "9px",
                    color: "#4a4a54",
                    lineHeight: "1.3",
                  })}
                >
                  Wider aperture (smaller f-number) and longer lens =
                  shallower DoF.
                </div>
              </>
            )}
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
