// GeneratedObjectToolbar.tsx
//
// Floating selection toolbar for an AI-placed prop. Mirrors the
// DriveHUD pattern in App.tsx: a centred bottom strip that only
// appears when a generatedObjectStore entry is selected.
//
// Buttons:
//   - Move / Rotate / Scale     gizmo mode for drei TransformControls
//   - 0.5× / 2×                 quick uniform scale nudges
//   - Reset rotation            zero out yaw/pitch/roll
//   - Delete                    remove + clear selection (Backspace also)

import React from "react";
import { css } from "@emotion/react";
import {
  Move3D,
  RotateCw,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useGeneratedObjectStore } from "@/state/generatedObjectStore";
import { useProjectStore } from "@/state/projectStore";

const MODE_OPTIONS: Array<{
  id: "translate" | "rotate" | "scale";
  icon: React.ReactNode;
  label: string;
}> = [
  { id: "translate", icon: <Move3D size={11} />, label: "Move" },
  { id: "rotate", icon: <RotateCw size={11} />, label: "Rotate" },
  { id: "scale", icon: <Maximize2 size={11} />, label: "Scale" },
];

export function GeneratedObjectToolbar() {
  const selectedId = useGeneratedObjectStore((s) => s.selectedId);
  const objects = useGeneratedObjectStore((s) => s.objects);
  const transformMode = useGeneratedObjectStore((s) => s.transformMode);
  const setTransformMode = useGeneratedObjectStore((s) => s.setTransformMode);
  const updateObject = useGeneratedObjectStore((s) => s.updateObject);
  const removeObject = useGeneratedObjectStore((s) => s.removeObject);
  const selectObject = useGeneratedObjectStore((s) => s.selectObject);
  const markDirty = useProjectStore((s) => s.markDirty);

  if (!selectedId) return null;
  const obj = objects.find((o) => o.id === selectedId);
  if (!obj) return null;

  const nudgeScale = (factor: number) => {
    updateObject(selectedId, {
      scale: Math.max(0.05, Math.min(500, obj.scale * factor)),
    });
    markDirty();
  };

  const resetRotation = () => {
    updateObject(selectedId, { rotation: { x: 0, y: 0, z: 0 } });
    markDirty();
  };

  const handleDelete = () => {
    removeObject(selectedId);
    markDirty();
  };

  return (
    <div
      css={css({
        position: "absolute",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "8px 10px",
        backgroundColor: "rgba(17,17,21,0.92)",
        backdropFilter: "blur(10px)",
        border: "1px solid #2a2a2e",
        borderRadius: "10px",
        boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
      })}
    >
      {/* Object label */}
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "8px",
          paddingRight: "8px",
          borderRight: "1px solid #2a2a2e",
        })}
      >
        {obj.sourceThumb && (
          <img
            src={obj.sourceThumb}
            alt=""
            css={css({
              width: 22,
              height: 22,
              borderRadius: 4,
              objectFit: "cover",
              border: "1px solid #2a2a2e",
            })}
          />
        )}
        <span
          css={css({
            fontSize: "11px",
            color: "#e8e8ec",
            fontWeight: 500,
            maxWidth: 140,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          })}
        >
          {obj.name}
        </span>
      </div>

      {/* Gizmo mode toggle */}
      <div
        css={css({
          display: "flex",
          gap: "2px",
          backgroundColor: "#0a0a0c",
          padding: "2px",
          borderRadius: "6px",
          border: "1px solid #2a2a2e",
        })}
      >
        {MODE_OPTIONS.map((m) => (
          <button
            key={m.id}
            onClick={() => setTransformMode(m.id)}
            title={m.label}
            css={css({
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              border: "none",
              borderRadius: "4px",
              fontSize: "10px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "0.12s",
              backgroundColor:
                transformMode === m.id ? "#22d3ee" : "transparent",
              color: transformMode === m.id ? "#0a0a0c" : "#a0a0aa",
              ":hover": {
                color: transformMode === m.id ? "#0a0a0c" : "#e8e8ec",
                backgroundColor:
                  transformMode === m.id ? "#22d3ee" : "#1a1a1f",
              },
            })}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>

      {/* Quick scale nudges */}
      <div
        css={css({
          display: "flex",
          gap: "2px",
          padding: "2px",
          borderRadius: "6px",
          border: "1px solid #2a2a2e",
        })}
      >
        <ToolbarIconButton onClick={() => nudgeScale(0.5)} title="Halve scale">
          <Minus size={11} />
        </ToolbarIconButton>
        <div
          css={css({
            fontSize: "10px",
            color: "#6b6b78",
            padding: "0 6px",
            display: "flex",
            alignItems: "center",
            minWidth: 38,
            justifyContent: "center",
            fontFamily: "monospace",
          })}
        >
          {obj.scale.toFixed(1)}m
        </div>
        <ToolbarIconButton onClick={() => nudgeScale(2)} title="Double scale">
          <Plus size={11} />
        </ToolbarIconButton>
      </div>

      {/* Reset rotation */}
      <ToolbarIconButton onClick={resetRotation} title="Reset rotation">
        <RotateCcw size={11} />
      </ToolbarIconButton>

      {/* Deselect */}
      <ToolbarIconButton onClick={() => selectObject(null)} title="Deselect">
        <X size={11} />
      </ToolbarIconButton>

      {/* Delete */}
      <ToolbarIconButton onClick={handleDelete} title="Delete object" danger>
        <Trash2 size={11} />
      </ToolbarIconButton>
    </div>
  );
}

function ToolbarIconButton({
  onClick,
  title,
  children,
  danger,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      css={css({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        background: "transparent",
        border: "none",
        borderRadius: 4,
        color: danger ? "#fca5a5" : "#a0a0aa",
        cursor: "pointer",
        transition: "0.12s",
        ":hover": {
          backgroundColor: danger ? "#3a1414" : "#1a1a1f",
          color: danger ? "#ef4444" : "#e8e8ec",
        },
      })}
    >
      {children}
    </button>
  );
}
