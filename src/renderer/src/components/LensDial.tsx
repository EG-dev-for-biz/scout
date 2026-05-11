import { useEffect, useRef, useState } from "react";
import { css } from "@emotion/react";
import { Focus, Target, X, Aperture } from "lucide-react";
import {
  useCameraStore,
  fovToFocalLength,
  LENS_PRESETS,
  F_STOP_PRESETS,
} from "@/state/cameraStore";

// ---------------------------------------------------------------------------
// <LensDial />
// ---------------------------------------------------------------------------
//
// Floating cine-prime dial. Lives in the top-left corner of the viewport
// and is always visible. The big monospace number is the focal length
// (live, reads from cameraStore.current.fov so it stays in sync as the
// camera lerps toward the chosen value). Below it sits the f-stop
// badge when DoF is on.
//
// Interaction:
//   - Drag vertically across the dial face → focal length sweeps
//     (up = wider, down = longer). Mimics rocking a lens.
//   - Mouse-wheel over the dial → 1 mm per click.
//   - Click → opens a compact dropdown panel anchored to the dial with
//     preset shortcuts (24 / 35 / 50 / 85 / 135 / 200), the custom
//     slider, DoF toggle + f-stop, and the focus-pick button. Mirrors
//     what the old top-bar LensPicker offered, just attached to the
//     viewport instead of buried in a toolbar.

const DIAL_SIZE = 96;
const CENTER = DIAL_SIZE / 2;
const OUTER_R = CENTER - 4;
const SCALE_R = OUTER_R - 6;

// Engraved focal-length scale marks. The active mark gets highlighted.
const SCALE_FOCALS = [16, 24, 35, 50, 85, 135, 200];
// Anchor angles for each scale mark (degrees from "up"). Wider lenses
// sit on the left half, longer on the right — same convention as a
// real cine lens's focus or zoom ring as you'd see it head-on.
function angleForFocal(f: number): number {
  // Logarithmic mapping so the wider end of the scale isn't crammed.
  const t = Math.log2(f / 16) / Math.log2(300 / 16); // 0..1 across 16..300
  return -120 + t * 240; // -120° .. +120°
}

export function LensDial() {
  const current = useCameraStore((s) => s.current);
  const userFovDeg = useCameraStore((s) => s.userFovDeg);
  const setLensFocalMM = useCameraStore((s) => s.setLensFocalMM);
  const dofEnabled = useCameraStore((s) => s.dofEnabled);
  const apertureF = useCameraStore((s) => s.apertureF);
  const focusTarget = useCameraStore((s) => s.focusTarget);
  const focusPickMode = useCameraStore((s) => s.focusPickMode);
  const setDofEnabled = useCameraStore((s) => s.setDofEnabled);
  const setApertureF = useCameraStore((s) => s.setApertureF);
  const setFocusTarget = useCameraStore((s) => s.setFocusTarget);
  const setFocusPickMode = useCameraStore((s) => s.setFocusPickMode);

  const liveFocal = current
    ? Math.round(fovToFocalLength(current.fov))
    : Math.round(fovToFocalLength(userFovDeg));
  const userFocal = Math.round(fovToFocalLength(userFovDeg));

  // Distance camera→focusTarget for the readout.
  let focusDistanceM: number | null = null;
  if (focusTarget && current) {
    const dx = current.position[0] - focusTarget[0];
    const dy = current.position[1] - focusTarget[1];
    const dz = current.position[2] - focusTarget[2];
    focusDistanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // ---- drag interaction --------------------------------------------------
  const dragRef = useRef<{ startY: number; startFocal: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startFocal: userFocal };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    // 4 px ≈ 1 mm focal step. Feels close to a real focus-ring rate.
    const delta = Math.round(dy / 4);
    const next = Math.max(8, Math.min(300, dragRef.current.startFocal + delta));
    if (next !== userFocal) setLensFocalMM(next);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
    setDragging(false);
  };

  // Wheel-to-scrub. Native wheel events on a small element can be touchy
  // (passive listeners block preventDefault), so we attach manually.
  const wheelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? -1 : 1;
      const next = Math.max(8, Math.min(300, userFocal + dir));
      setLensFocalMM(next);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [userFocal, setLensFocalMM]);

  // ---- click-to-open dropdown -------------------------------------------
  // Track movement during a pointer-down so we can distinguish a "drag"
  // from a "click" — clicks open the dropdown, drags scrub the dial.
  const moveDistRef = useRef(0);
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

  return (
    <div
      ref={rootRef}
      css={css({
        position: "absolute",
        top: "12px",
        left: "12px",
        zIndex: 30,
        userSelect: "none",
      })}
    >
      <div
        ref={wheelRef}
        onPointerDown={(e) => {
          moveDistRef.current = 0;
          onPointerDown(e);
        }}
        onPointerMove={(e) => {
          if (dragRef.current) {
            moveDistRef.current += Math.abs(e.movementY) + Math.abs(e.movementX);
          }
          onPointerMove(e);
        }}
        onPointerUp={(e) => {
          const wasDrag = moveDistRef.current > 5;
          onPointerUp(e);
          if (!wasDrag) setOpen((v) => !v);
        }}
        title="Drag to change focal length · click for presets · scroll to fine-tune"
        css={css({
          position: "relative",
          width: `${DIAL_SIZE}px`,
          height: `${DIAL_SIZE}px`,
          borderRadius: "50%",
          cursor: dragging ? "grabbing" : "grab",
          // Layered backgrounds: outer ring (knurled), inner face.
          background:
            "radial-gradient(circle at 50% 30%, #2a2a30 0%, #0e0e14 65%, #050508 100%)",
          boxShadow:
            "0 6px 18px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.6)",
          transition: "transform 120ms",
          ":hover": {
            boxShadow:
              "0 6px 18px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
          },
        })}
      >
        {/* Engraved scale marks ring — SVG so it stays crisp. */}
        <svg
          width={DIAL_SIZE}
          height={DIAL_SIZE}
          css={css({
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
          })}
        >
          {SCALE_FOCALS.map((f) => {
            const angle = angleForFocal(f);
            const rad = (angle * Math.PI) / 180;
            const x1 = CENTER + Math.sin(rad) * (SCALE_R - 4);
            const y1 = CENTER - Math.cos(rad) * (SCALE_R - 4);
            const x2 = CENTER + Math.sin(rad) * SCALE_R;
            const y2 = CENTER - Math.cos(rad) * SCALE_R;
            const isClosest =
              Math.abs(Math.log2(f) - Math.log2(userFocal)) < 0.15;
            return (
              <g key={f}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={isClosest ? "#3b82f6" : "#3a3a44"}
                  strokeWidth={isClosest ? 1.5 : 1}
                />
                {/* Numeric label outside the scale */}
                <text
                  x={CENTER + Math.sin(rad) * (SCALE_R + 7)}
                  y={CENTER - Math.cos(rad) * (SCALE_R + 7) + 3}
                  fontSize={7}
                  fontFamily="'SF Mono', Menlo, Consolas, monospace"
                  fontWeight={isClosest ? 700 : 500}
                  fill={isClosest ? "#7da6e8" : "#4a4a54"}
                  textAnchor="middle"
                >
                  {f}
                </text>
              </g>
            );
          })}
          {/* Pointer needle at the current focal length. */}
          <line
            x1={CENTER}
            y1={CENTER}
            x2={
              CENTER +
              Math.sin((angleForFocal(userFocal) * Math.PI) / 180) *
                (SCALE_R - 8)
            }
            y2={
              CENTER -
              Math.cos((angleForFocal(userFocal) * Math.PI) / 180) *
                (SCALE_R - 8)
            }
            stroke="#3b82f6"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <circle cx={CENTER} cy={CENTER} r={3} fill="#7da6e8" />
        </svg>

        {/* Center readout — focal length + f-stop badge */}
        <div
          css={css({
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            paddingTop: "4px",
          })}
        >
          <span
            css={css({
              display: "flex",
              alignItems: "baseline",
              gap: "1px",
              fontFamily: "'SF Mono', Menlo, Consolas, monospace",
              fontWeight: 700,
              color: "#e8e8ec",
              lineHeight: 1,
              textShadow: "0 1px 0 rgba(0,0,0,0.5)",
            })}
          >
            <span css={css({ fontSize: "20px", letterSpacing: "0.01em" })}>
              {liveFocal}
            </span>
            <span css={css({ fontSize: "9px", color: "#7a7a86" })}>mm</span>
          </span>
          {dofEnabled && (
            <span
              css={css({
                marginTop: "2px",
                fontFamily: "'SF Mono', Menlo, Consolas, monospace",
                fontSize: "10px",
                fontWeight: 600,
                color: "#d97757",
                lineHeight: 1,
              })}
            >
              f/{apertureF % 1 === 0 ? apertureF.toFixed(0) : apertureF.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* Dropdown panel anchored under the dial. */}
      {open && (
        <div
          css={css({
            position: "absolute",
            top: `${DIAL_SIZE + 10}px`,
            left: 0,
            width: "260px",
            backgroundColor: "#13131af2",
            backdropFilter: "blur(10px)",
            border: "1px solid #2a2a30",
            borderRadius: "6px",
            padding: "6px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
            zIndex: 31,
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          })}
        >
          {/* Header */}
          <div
            css={css({
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 6px 8px",
              borderBottom: "1px solid #1c1c22",
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#7a7a86",
            })}
          >
            <Aperture size={11} color="#3b82f6" />
            Lens
          </div>

          {/* Preset rows */}
          {LENS_PRESETS.map((preset) => {
            const active = Math.abs(preset.focalMM - userFocal) <= 1;
            return (
              <button
                key={preset.focalMM}
                onClick={() => {
                  setLensFocalMM(preset.focalMM);
                  setOpen(false);
                }}
                css={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "5px 8px",
                  backgroundColor: active ? "#1c1c24" : "transparent",
                  border: "none",
                  borderRadius: "3px",
                  color: active ? "#e8e8ec" : "#a8a8b0",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "120ms",
                  ":hover": { backgroundColor: "#1c1c24", color: "#e8e8ec" },
                })}
              >
                <span
                  css={css({
                    width: "42px",
                    fontFamily: "'SF Mono', Menlo, Consolas, monospace",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: active ? "#3b82f6" : "#7a7a86",
                  })}
                >
                  {preset.label}
                </span>
                <span
                  css={css({
                    flex: 1,
                    fontSize: "9px",
                    color: active ? "#a8a8b0" : "#6b6b78",
                    lineHeight: 1.3,
                  })}
                >
                  {preset.description}
                </span>
              </button>
            );
          })}

          {/* Custom slider */}
          <div
            css={css({
              marginTop: "4px",
              padding: "8px",
              borderTop: "1px solid #1c1c22",
            })}
          >
            <div
              css={css({
                display: "flex",
                justifyContent: "space-between",
                fontSize: "9px",
                color: "#7a7a86",
                marginBottom: "4px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 700,
              })}
            >
              <span>Custom</span>
              <span
                css={css({
                  color: "#e8e8ec",
                  fontFamily: "'SF Mono', Menlo, Consolas, monospace",
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
              onChange={(e) => setLensFocalMM(parseInt(e.target.value, 10))}
              css={css({ width: "100%", accentColor: "#3b82f6" })}
            />
          </div>

          {/* DoF section */}
          <div
            css={css({
              padding: "8px",
              borderTop: "1px solid #1c1c22",
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
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
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
                <div
                  css={css({
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "10px",
                    color: "#a8a8b0",
                  })}
                >
                  <span
                    css={css({
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontWeight: 600,
                      fontSize: "9px",
                      color: "#7a7a86",
                    })}
                  >
                    Aperture
                  </span>
                  <select
                    value={apertureF}
                    onChange={(e) => setApertureF(parseFloat(e.target.value))}
                    css={css({
                      backgroundColor: "#0a0a0e",
                      border: "1px solid #2a2a30",
                      borderRadius: "3px",
                      padding: "3px 6px",
                      color: "#e8e8ec",
                      fontSize: "10px",
                      fontFamily: "'SF Mono', Menlo, Consolas, monospace",
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

                <button
                  onClick={() => setFocusPickMode(!focusPickMode)}
                  css={css({
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                    backgroundColor: focusPickMode ? "#d97757" : "#13131a",
                    border: `1px ${
                      focusPickMode ? "solid #d97757" : "dashed #3a3a44"
                    }`,
                    borderRadius: "3px",
                    padding: "5px 8px",
                    color: focusPickMode ? "#fff" : "#a8a8b0",
                    fontSize: "9px",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    transition: "120ms",
                    ":hover": {
                      backgroundColor: focusPickMode ? "#c8642a" : "#1c1c24",
                      color: "#fff",
                    },
                  })}
                >
                  <Target size={10} />
                  {focusPickMode ? "Click in scene…" : "Pick focus"}
                </button>

                {focusTarget && (
                  <div
                    css={css({
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "10px",
                      color: "#a8a8b0",
                    })}
                  >
                    <span
                      css={css({
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        fontWeight: 600,
                        fontSize: "9px",
                        color: "#7a7a86",
                      })}
                    >
                      Focus dist
                    </span>
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
                          fontFamily: "'SF Mono', Menlo, Consolas, monospace",
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
