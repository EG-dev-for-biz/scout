import React from "react";
import { css } from "@emotion/react";
import { Camera } from "lucide-react";
import { useCameraStore, fovToFocalLength } from "@/state/cameraStore";
import { useAnnotationStore } from "@/state/annotationStore";
import { useProjectStore } from "@/state/projectStore";

/**
 * Top-bar button. Clicking it captures the current camera framing as a new
 * Shot pin. The pin remembers position+target+fov so the user can later
 * "Frame this shot" to jump back to the exact angle.
 */
export function CaptureShotButton() {
  const current = useCameraStore((s) => s.current);
  const addPin = useAnnotationStore((s) => s.addPin);
  const selectPin = useAnnotationStore((s) => s.selectPin);
  const markDirty = useProjectStore((s) => s.markDirty);

  const handleCapture = () => {
    if (!current) return;
    const focal = Math.round(fovToFocalLength(current.fov));

    const id = addPin({
      name: `Shot ${shotCount() + 1}`,
      type: "shot",
      position: { x: current.target[0], y: current.target[1], z: current.target[2] },
      camera: {
        position: current.position,
        target: current.target,
        fov: current.fov,
      },
      description: `${focal}mm equivalent`,
      tags: ["shot"],
    });
    selectPin(id);
    markDirty();
  };

  const focalLabel = current
    ? `${Math.round(fovToFocalLength(current.fov))}mm`
    : "—";

  return (
    <button
      onClick={handleCapture}
      title="Capture current framing as a Shot pin"
      disabled={!current}
      css={css({
        display: "flex",
        alignItems: "center",
        gap: "6px",
        position: "relative",
        // Shutter-release styling. Always-visible red dot reads as the
        // record light; on hover the dot brightens + the button gains a
        // subtle red glow. Disabled state keeps the layout but desaturates
        // and dims everything.
        backgroundColor: current ? "#13131a" : "#0e0e12",
        border: `1px solid ${current ? "#2a2a30" : "#1c1c24"}`,
        borderRadius: "4px",
        padding: "5px 11px",
        color: current ? "#e8e8ec" : "#3a3a40",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        fontFamily:
          "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
        cursor: current ? "pointer" : "not-allowed",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 0 rgba(0,0,0,0.6)",
        transition: "120ms cubic-bezier(0.4, 0, 0.2, 1)",
        ":hover:not(:disabled)": {
          backgroundColor: "#1c1c24",
          borderColor: "#a83838",
          color: "#fff",
          boxShadow:
            "inset 0 1px 0 rgba(255,180,180,0.08), 0 0 10px rgba(220,38,38,0.45), 0 1px 0 rgba(0,0,0,0.6)",
        },
        ":active:not(:disabled)": {
          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.6)",
          backgroundColor: "#0e0e14",
        },
      })}
    >
      {/* Red shutter LED — always on when the button is active. */}
      <span
        css={css({
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          backgroundColor: current ? "#ef4444" : "#3a1a1a",
          boxShadow: current ? "0 0 6px rgba(239,68,68,0.6)" : "none",
          flexShrink: 0,
        })}
      />
      <Camera size={11} color={current ? "#e8e8ec" : "#3a3a40"} />
      <span>Roll</span>
      <span
        css={css({
          color: current ? "#7a7a86" : "#2a2a30",
          fontFamily: "'SF Mono', Menlo, Consolas, monospace",
          fontSize: "9px",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "none",
          paddingLeft: "3px",
          borderLeft: `1px solid ${current ? "#2a2a30" : "#1c1c24"}`,
          marginLeft: "1px",
        })}
      >
        {focalLabel}
      </span>
    </button>
  );
}

function shotCount(): number {
  const pins = useAnnotationStore.getState().pins;
  return pins.filter((p) => p.type === "shot").length;
}
