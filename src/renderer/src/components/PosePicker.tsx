import React, { useState, useRef, useEffect } from "react";
import { css } from "@emotion/react";
import { PersonStanding, ChevronDown } from "lucide-react";
import {
  usePoseStore,
  ALL_POSES,
  SCOUT_POSES,
  EXTRA_POSES,
  type PoseEntry,
} from "@/state/poseStore";
import { useCarStore } from "@/state/carStore";

/**
 * Top-bar mannequin pose picker. Only listed poses that successfully loaded
 * from `/anim/{id}.glb` appear in the dropdown — missing clips are silently
 * filtered out. Locomotion clips (idle/walk/jog/run) are hidden from the
 * dropdown because drive-mode auto-drives them from WASD velocity.
 *
 * When the user is in drive mode, the dropdown is disabled with an
 * explanatory tooltip — drive-mode locomotion takes precedence.
 */
export function PosePicker() {
  const activePose = usePoseStore((s) => s.activePose);
  const setActivePose = usePoseStore((s) => s.setActivePose);
  const availableIds = usePoseStore((s) => s.availableIds);
  const thirdMode = useCarStore((s) => s.thirdMode);
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

  // Only show scout + extra poses in the picker (locomotion is auto-driven).
  // Filter to what actually loaded from /anim/.
  const visibleScoutPoses = SCOUT_POSES.filter((p) =>
    availableIds.includes(p.id)
  );
  const visibleExtraPoses = EXTRA_POSES.filter((p) =>
    availableIds.includes(p.id)
  );
  const hasAnyVisible =
    visibleScoutPoses.length > 0 || visibleExtraPoses.length > 0;

  // Active pose readable label.
  const activeEntry = ALL_POSES.find((p) => p.id === activePose);
  const activeLabel = activeEntry?.label ?? activePose;

  const disabled = thirdMode || !hasAnyVisible;
  const title = thirdMode
    ? "Drive mode is on — locomotion is driven by WASD"
    : !hasAnyVisible
    ? "No pose clips found. Drop Mixamo GLBs into src/renderer/public/anim/"
    : "Pick a mannequin pose";

  return (
    <div ref={rootRef} css={css({ position: "relative" })}>
      <button
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        title={title}
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "5px",
          backgroundColor: disabled ? "#15151a" : "#1e1e22",
          border: "1px solid #2a2a2e",
          borderRadius: "6px",
          padding: "5px 9px",
          color: disabled ? "#4a4a54" : "#e8e8ec",
          fontSize: "11px",
          fontWeight: "500",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "0.15s",
          ":hover:not(:disabled)": {
            backgroundColor: "#2a2a2e",
            borderColor: "#3b82f6",
          },
        })}
      >
        <PersonStanding size={12} color={disabled ? "#4a4a54" : "#3b82f6"} />
        <span>Pose</span>
        <span
          css={css({
            color: disabled ? "#3a3a3e" : "#6b6b78",
            fontFamily: "monospace",
            fontSize: "10px",
            maxWidth: "80px",
            overflow: "hidden",
            textOverflow: "ellipsis",
          })}
        >
          {activeLabel}
        </span>
        <ChevronDown
          size={10}
          color={disabled ? "#3a3a3e" : "#6b6b78"}
          css={css({
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          })}
        />
      </button>

      {open && hasAnyVisible && (
        <div
          css={css({
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: "240px",
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
            maxHeight: "70vh",
            overflowY: "auto",
          })}
        >
          {visibleScoutPoses.length > 0 && (
            <PoseGroup
              title="Director / Scout"
              poses={visibleScoutPoses}
              activeId={activePose}
              onPick={(id) => {
                setActivePose(id);
                setOpen(false);
              }}
            />
          )}
          {visibleExtraPoses.length > 0 && (
            <PoseGroup
              title="Cast / Extras"
              poses={visibleExtraPoses}
              activeId={activePose}
              onPick={(id) => {
                setActivePose(id);
                setOpen(false);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function PoseGroup({
  title,
  poses,
  activeId,
  onPick,
}: {
  title: string;
  poses: PoseEntry[];
  activeId: string;
  onPick: (id: string) => void;
}) {
  return (
    <>
      <div
        css={css({
          padding: "6px 8px 2px",
          fontSize: "9px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#6b6b78",
          fontWeight: "600",
        })}
      >
        {title}
      </div>
      {poses.map((pose) => (
        <PoseRow
          key={pose.id}
          pose={pose}
          active={pose.id === activeId}
          onClick={() => onPick(pose.id)}
        />
      ))}
    </>
  );
}

function PoseRow({
  pose,
  active,
  onClick,
}: {
  pose: PoseEntry;
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
          flex: "0 0 90px",
          fontSize: "11px",
          fontWeight: "600",
          color: active ? "#3b82f6" : "#6b6b78",
        })}
      >
        {pose.label}
      </span>
      <span
        css={css({
          flex: 1,
          fontSize: "10px",
          color: active ? "#a0a0aa" : "#6b6b78",
          lineHeight: "1.3",
        })}
      >
        {pose.description}
      </span>
    </button>
  );
}
