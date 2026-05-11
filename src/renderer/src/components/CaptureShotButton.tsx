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
        gap: "5px",
        backgroundColor: current ? "#1e1e22" : "#15151a",
        border: "1px solid #2a2a2e",
        borderRadius: "6px",
        padding: "5px 9px",
        color: current ? "#e8e8ec" : "#4a4a54",
        fontSize: "11px",
        fontWeight: "500",
        cursor: current ? "pointer" : "not-allowed",
        transition: "0.15s",
        ":hover:not(:disabled)": {
          backgroundColor: "#2a2a2e",
          borderColor: "#3b82f6",
        },
      })}
    >
      <Camera size={12} color={current ? "#3b82f6" : "#4a4a54"} />
      <span>Capture Shot</span>
      <span
        css={css({
          color: "#6b6b78",
          fontFamily: "monospace",
          fontSize: "10px",
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
