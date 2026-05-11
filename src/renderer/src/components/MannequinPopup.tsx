import React from "react";
import { css } from "@emotion/react";
import { Html } from "@react-three/drei";
import { Eye, EyeOff, X, PersonStanding } from "lucide-react";
import {
  usePoseStore,
  SCOUT_POSES,
  EXTRA_POSES,
  LOCOMOTION_POSES,
} from "@/state/poseStore";

/**
 * Contextual popup rendered in 3D space near the mannequin's head when
 * the user clicks the mannequin to select it. Provides quick controls for:
 *   - Active pose (any clip that loaded from /anim/)
 *   - "Look At" target picker (next scene click rotates the head bone)
 *   - Clear look-at + close
 *
 * Uses drei's <Html occlude={false}> so it tracks the head in screen-space
 * and stays on top even when the camera moves behind buildings.
 */
export function MannequinPopup() {
  const setSelected = usePoseStore((s) => s.setSelected);
  const activePose = usePoseStore((s) => s.activePose);
  const setActivePose = usePoseStore((s) => s.setActivePose);
  const availableIds = usePoseStore((s) => s.availableIds);
  const lookAtTarget = usePoseStore((s) => s.lookAtTarget);
  const setLookAtTarget = usePoseStore((s) => s.setLookAtTarget);
  const lookAtPickMode = usePoseStore((s) => s.lookAtPickMode);
  const setLookAtPickMode = usePoseStore((s) => s.setLookAtPickMode);

  // Filter each pose category to only what actually loaded. Inline rows
  // are simpler than a dropdown — eliminates click-event bubbling weirdness
  // inside drei <Html>, and the user sees their entire pose library at a
  // glance.
  const visibleLocomotion = LOCOMOTION_POSES.filter((p) =>
    availableIds.includes(p.id)
  );
  const visibleScout = SCOUT_POSES.filter((p) => availableIds.includes(p.id));
  const visibleExtras = EXTRA_POSES.filter((p) => availableIds.includes(p.id));
  const totalAvailable =
    visibleLocomotion.length + visibleScout.length + visibleExtras.length;

  return (
    // Anchored to the parent group's local origin. Position offset 1.95m
    // upward sits the popup just above the mannequin's head.
    <Html
      position={[0, 1.95, 0]}
      center
      // Distance factor scales the popup with distance so it stays readable
      // when zooming out without becoming absurd when up close.
      distanceFactor={5}
      // Don't occlude — keeps the popup visible when buildings are between
      // it and the camera.
      occlude={false}
      // Don't intercept scene clicks below the popup itself.
      style={{ pointerEvents: "none" }}
    >
      <div
        css={css({
          pointerEvents: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          minWidth: "200px",
          backgroundColor: "#17171af5",
          backdropFilter: "blur(10px)",
          border: "1px solid #3a3a3e",
          borderRadius: "8px",
          padding: "6px",
          boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
          // Translate up half so anchor at top of head feels right.
          transform: "translate(0, -100%)",
        })}
        // Prevent clicks inside the popup from bubbling to the canvas
        // (which would deselect the mannequin).
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header — title + close button */}
        <div
          css={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "2px 4px",
          })}
        >
          <span
            css={css({
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "10px",
              fontWeight: "600",
              color: "#e8e8ec",
            })}
          >
            <PersonStanding size={11} color="#3b82f6" />
            Mannequin
          </span>
          <button
            onClick={() => {
              setSelected(false);
              setLookAtPickMode(false);
            }}
            title="Deselect"
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
            <X size={11} />
          </button>
        </div>

        {/* Inline pose list — flat layout avoids the brittle absolute-
            positioned dropdown inside drei <Html>. The user sees all
            available poses at once, grouped by category. */}
        {totalAvailable === 0 ? (
          <div
            css={css({
              fontSize: "10px",
              color: "#6b6b78",
              padding: "8px",
              textAlign: "center",
              lineHeight: "1.4",
            })}
          >
            No pose clips found.
            <br />
            Drop Mixamo files into
            <br />
            <code css={css({ color: "#a0a0aa" })}>
              src/renderer/public/anim/
            </code>
          </div>
        ) : (
          <div
            css={css({
              display: "flex",
              flexDirection: "column",
              gap: "1px",
              maxHeight: "280px",
              overflowY: "auto",
            })}
          >
            <InlinePoseGroup
              title="Locomotion"
              poses={visibleLocomotion}
              activeId={activePose}
              onPick={setActivePose}
            />
            <InlinePoseGroup
              title="Scout"
              poses={visibleScout}
              activeId={activePose}
              onPick={setActivePose}
            />
            <InlinePoseGroup
              title="Extras"
              poses={visibleExtras}
              activeId={activePose}
              onPick={setActivePose}
            />
          </div>
        )}

        {/* Look At toggle */}
        <button
          onClick={() => setLookAtPickMode(!lookAtPickMode)}
          css={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            backgroundColor: lookAtPickMode ? "#3b82f6" : "#1e1e22",
            border:
              "1px " +
              (lookAtPickMode ? "solid #3b82f6" : "dashed #3a3a3e"),
            borderRadius: "5px",
            padding: "5px 8px",
            color: lookAtPickMode ? "#fff" : "#a0a0aa",
            fontSize: "10px",
            fontWeight: "600",
            cursor: "pointer",
            transition: "0.12s",
            ":hover": {
              backgroundColor: lookAtPickMode ? "#2563eb" : "#2a2a2e",
              color: "#e8e8ec",
            },
          })}
        >
          <Eye size={10} />
          {lookAtPickMode ? "Click to set gaze…" : "Look at…"}
        </button>

        {lookAtTarget && (
          <button
            onClick={() => setLookAtTarget(null)}
            css={css({
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
              backgroundColor: "transparent",
              border: "1px solid #2a2a2e",
              borderRadius: "5px",
              padding: "4px 8px",
              color: "#6b6b78",
              fontSize: "9px",
              cursor: "pointer",
              transition: "0.12s",
              ":hover": { color: "#e8e8ec", borderColor: "#3a3a3e" },
            })}
          >
            <EyeOff size={9} />
            Clear gaze
          </button>
        )}
      </div>
    </Html>
  );
}

function InlinePoseGroup({
  title,
  poses,
  activeId,
  onPick,
}: {
  title: string;
  poses: { id: string; label: string }[];
  activeId: string;
  onPick: (id: string) => void;
}) {
  if (poses.length === 0) return null;
  return (
    <>
      <div
        css={css({
          padding: "6px 6px 2px",
          fontSize: "8px",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#6b6b78",
          fontWeight: "600",
        })}
      >
        {title}
      </div>
      {poses.map((pose) => (
        <button
          key={pose.id}
          onClick={() => onPick(pose.id)}
          css={css({
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "4px 8px",
            backgroundColor: pose.id === activeId ? "#2a2a2e" : "transparent",
            border: "none",
            borderRadius: "4px",
            color: pose.id === activeId ? "#3b82f6" : "#a0a0aa",
            fontSize: "10px",
            fontWeight: "500",
            cursor: "pointer",
            transition: "0.12s",
            ":hover": { backgroundColor: "#2a2a2e", color: "#e8e8ec" },
          })}
        >
          {pose.label}
        </button>
      ))}
    </>
  );
}
