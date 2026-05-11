import { useEffect, useRef, useState } from "react";
import { css } from "@emotion/react";
import { Html } from "@react-three/drei";
import { useCameraStore } from "@/state/cameraStore";

// How long the persistent focus-target reticle stays visible after a
// new focus point is set. After this it fades out — DoF stays active
// and the HUD still reports focus distance, the reticle just stops
// crowding the frame. Reads like a focus-pull confirmation, not a
// permanent decal.
const FOCUS_MARKER_VISIBLE_MS = 1800;
const FOCUS_MARKER_FADE_MS = 600;

// ---------------------------------------------------------------------------
// FocusReticle
// ---------------------------------------------------------------------------
//
// Two related affordances, exported as two components:
//
//   <FocusPickReticle> — DOM overlay. When focusPickMode is on, a square
//                        reticle with corner brackets follows the mouse
//                        across the viewport and shows a "PICK FOCUS"
//                        hint. Replaces the cursor's normal `crosshair`
//                        cue with something that reads like an actual
//                        camera focus reticle.
//
//   <FocusTargetMarker> — scene-tree overlay using drei <Html>. When DoF
//                          is on AND a focusTarget is set, this projects
//                          the target world position to screen and pins
//                          a persistent reticle there with the focus
//                          distance label. Lives inside the Three.js
//                          scene because drei's <Html> needs access to
//                          the camera + scene context to project.

// =============================================================================
// 1. Mouse-follow pick reticle
// =============================================================================

interface FocusPickReticleProps {
  /** The viewport DOM element to track mouse movement over. */
  containerRef: React.RefObject<HTMLElement | null>;
}

export function FocusPickReticle({ containerRef }: FocusPickReticleProps) {
  const focusPickMode = useCameraStore((s) => s.focusPickMode);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!focusPickMode) {
      setMouse(null);
      return;
    }
    const el = containerRef.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      // Only show the reticle when the cursor is hovering a PICKABLE
      // surface — i.e. the 3D canvas itself. Hovering UI overlays
      // (Mannequin popup, drawers, lens dial, exposure meter,
      // shutter button, etc.) hides the reticle so the user can
      // interact with those overlays without a glowing focus
      // bracket crowding them. The picker is still active; the
      // reticle just isn't drawn over UI.
      const target = e.target as HTMLElement | null;
      const isCanvas = target?.tagName === "CANVAS";
      if (!isCanvas) {
        setMouse(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    const onLeave = () => setMouse(null);

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [focusPickMode, containerRef]);

  if (!focusPickMode || !mouse) return null;

  const SIZE = 56;
  const half = SIZE / 2;

  return (
    <div
      css={css({
        position: "absolute",
        left: `${mouse.x - half}px`,
        top: `${mouse.y - half}px`,
        width: `${SIZE}px`,
        height: `${SIZE}px`,
        pointerEvents: "none",
        zIndex: 40,
      })}
    >
      {/* Four corner brackets — the canonical "focus point" reticle. */}
      {[
        { top: 0, left: 0, rotate: 0 },
        { top: 0, right: 0, rotate: 90 },
        { bottom: 0, right: 0, rotate: 180 },
        { bottom: 0, left: 0, rotate: 270 },
      ].map((pos, i) => (
        <div
          key={i}
          css={css({
            position: "absolute",
            ...(pos as Record<string, string | number>),
            width: "14px",
            height: "14px",
            borderTop: "2px solid #d97757",
            borderLeft: "2px solid #d97757",
            transform: `rotate(${pos.rotate}deg)`,
            boxShadow: "0 0 4px rgba(217,119,87,0.6)",
          })}
        />
      ))}
      {/* Center dot */}
      <div
        css={css({
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "3px",
          height: "3px",
          marginTop: "-1.5px",
          marginLeft: "-1.5px",
          borderRadius: "50%",
          backgroundColor: "#d97757",
          boxShadow: "0 0 4px rgba(217,119,87,0.8)",
        })}
      />
      {/* Hint label below */}
      <div
        css={css({
          position: "absolute",
          top: `${SIZE + 6}px`,
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "rgba(10,10,14,0.85)",
          border: "1px solid #2a2a30",
          borderRadius: "3px",
          padding: "2px 6px",
          fontSize: "8px",
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#d97757",
          whiteSpace: "nowrap",
          fontFamily:
            "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
        })}
      >
        Pick Focus
      </div>
    </div>
  );
}

// =============================================================================
// 2. Persistent focus-target marker (in-scene)
// =============================================================================

/**
 * Drei <Html> rendered at the world-space focus target. Mounted INSIDE
 * the <Canvas> in Space.tsx so it has access to camera + projection
 * matrices.
 *
 * VISIBILITY: appears for ~1.8 s after a new focus point is set, then
 * fades out over 600 ms. DoF stays active and the bottom HUD still
 * reports focus distance — this marker is a focus-pull CONFIRMATION,
 * not a permanent badge. Re-fires the show animation whenever the
 * focus target changes (so a fresh pick re-displays the readout).
 */
export function FocusTargetMarker() {
  const dofEnabled = useCameraStore((s) => s.dofEnabled);
  const focusTarget = useCameraStore((s) => s.focusTarget);
  const current = useCameraStore((s) => s.current);

  // Visibility key — bumps each time focusTarget changes (identity).
  // We track the focusTarget reference itself; the camera store always
  // creates a new array when setFocusTarget is called, so a change in
  // reference is a reliable "user just picked" signal.
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<"hidden" | "show" | "fade">("hidden");
  const lastTargetRef = useRef<typeof focusTarget>(null);

  useEffect(() => {
    if (!focusTarget) {
      setVisible(false);
      setPhase("hidden");
      lastTargetRef.current = null;
      return;
    }
    // Same reference → no-op (avoids re-flashing on parent re-renders
    // that re-create the focusTarget array but with same contents).
    if (lastTargetRef.current === focusTarget) return;
    lastTargetRef.current = focusTarget;

    setVisible(true);
    setPhase("show");
    const fadeTimer = window.setTimeout(() => {
      setPhase("fade");
    }, FOCUS_MARKER_VISIBLE_MS);
    const hideTimer = window.setTimeout(() => {
      setVisible(false);
      setPhase("hidden");
    }, FOCUS_MARKER_VISIBLE_MS + FOCUS_MARKER_FADE_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [focusTarget]);

  if (!dofEnabled || !focusTarget || !visible) return null;

  // Compute live focus distance for the readout (camera position is
  // already in the snapshot store, kept fresh every frame).
  let dist: number | null = null;
  if (current) {
    const dx = current.position[0] - focusTarget[0];
    const dy = current.position[1] - focusTarget[1];
    const dz = current.position[2] - focusTarget[2];
    dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  return (
    <Html
      position={focusTarget}
      center
      // distanceFactor scales the reticle with distance so it shrinks
      // when zoomed out and grows when close — matches how a real focus
      // ring's tick gets smaller in the viewfinder when you stop down.
      distanceFactor={4}
      occlude={false}
      style={{ pointerEvents: "none" }}
    >
      <div
        css={css({
          position: "relative",
          width: "40px",
          height: "40px",
          // Defer center positioning to Html's `center` prop above; we
          // just need the reticle drawing. Fade controlled by phase:
          // 'show' rides at full opacity, 'fade' transitions to 0 over
          // FOCUS_MARKER_FADE_MS.
          opacity: phase === "fade" ? 0 : 1,
          transition: `opacity ${FOCUS_MARKER_FADE_MS}ms ease-out`,
        })}
      >
        {/* Four small ticks forming a square */}
        {[
          { top: "0%", left: "50%", transform: "translateX(-50%)", w: "1px", h: "8px" },
          { bottom: "0%", left: "50%", transform: "translateX(-50%)", w: "1px", h: "8px" },
          { top: "50%", left: "0%", transform: "translateY(-50%)", w: "8px", h: "1px" },
          { top: "50%", right: "0%", transform: "translateY(-50%)", w: "8px", h: "1px" },
        ].map((t, i) => (
          <div
            key={i}
            css={css({
              position: "absolute",
              top: t.top,
              left: t.left,
              right: t.right,
              bottom: t.bottom,
              width: t.w,
              height: t.h,
              transform: t.transform,
              backgroundColor: "#d97757",
              boxShadow: "0 0 3px rgba(217,119,87,0.5)",
            })}
          />
        ))}
        {/* Center dot */}
        <div
          css={css({
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "4px",
            height: "4px",
            marginTop: "-2px",
            marginLeft: "-2px",
            borderRadius: "50%",
            backgroundColor: "#d97757",
            boxShadow: "0 0 5px rgba(217,119,87,0.6)",
          })}
        />
        {/* Distance readout — small label off to the side */}
        {dist != null && (
          <div
            css={css({
              position: "absolute",
              top: "-2px",
              left: "100%",
              marginLeft: "6px",
              backgroundColor: "rgba(10,10,14,0.85)",
              border: "1px solid #2a2a30",
              borderRadius: "3px",
              padding: "1px 5px",
              fontSize: "8px",
              fontWeight: 700,
              color: "#d97757",
              fontFamily: "'SF Mono', Menlo, Consolas, monospace",
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
            })}
          >
            {dist > 1000
              ? `${(dist / 1000).toFixed(1)}km`
              : `${dist.toFixed(1)}m`}
          </div>
        )}
      </div>
    </Html>
  );
}
