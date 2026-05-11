import React, { useState } from "react";
import { css } from "@emotion/react";
import { Bookmark, Camera, X, Edit2, Check } from "lucide-react";
import { useBookmarkStore, type MoodSnapshot } from "@/state/bookmarkStore";
import { useProjectStore } from "@/state/projectStore";
import { captureCanvasSnapshot } from "@/utils/geminiRestyle";

// ---------------------------------------------------------------------------
// <MoodBookmarks />
// ---------------------------------------------------------------------------
//
// Three named slots (A / B / C). Each tile:
//   - Empty   → dashed border, "Empty" label. Click to capture current.
//   - Filled  → thumbnail + name. Click to restore. Edit + clear icons.
//
// A captured slot stores the full mood: time, atmosphere, weather, cinema,
// camera optics, style preset, and aspect ratio. Restoring a slot pushes
// all those values back into their respective stores.

const SLOT_COUNT = 3;
const DEFAULT_NAMES = ["A", "B", "C"];

export function MoodBookmarks() {
  const slots = useBookmarkStore((s) => s.slots);
  const capture = useBookmarkStore((s) => s.capture);
  const restore = useBookmarkStore((s) => s.restore);
  const clear = useBookmarkStore((s) => s.clear);
  const rename = useBookmarkStore((s) => s.rename);
  const markDirty = useProjectStore((s) => s.markDirty);

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleCapture = (idx: number) => {
    // Downscale to ~256px thumbnail. Larger than necessary for the tile
    // but lets it survive a future "show full preview" hover affordance.
    const thumb = captureCanvasSnapshot(256) ?? undefined;
    capture(idx, {
      name: slots[idx]?.name ?? `Mood ${DEFAULT_NAMES[idx]}`,
      thumbnail: thumb,
    });
    markDirty();
  };

  const handleClear = (idx: number) => {
    clear(idx);
    markDirty();
  };

  const handleRestore = (idx: number) => {
    restore(idx);
    // Restoring is a content change worth marking dirty so the user is
    // prompted to save the new derived state on close.
    markDirty();
  };

  const startEdit = (idx: number, snap: MoodSnapshot) => {
    setEditingIdx(idx);
    setEditingName(snap.name);
  };

  const commitEdit = () => {
    if (editingIdx === null) return;
    const name = editingName.trim();
    if (name.length > 0) {
      rename(editingIdx, name);
      markDirty();
    }
    setEditingIdx(null);
    setEditingName("");
  };

  return (
    <div
      css={css({
        backgroundColor: "#0f0f11",
        border: "1px solid #2a2a2e",
        borderRadius: "8px",
        padding: "10px 12px",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      })}
    >
      <div css={css({ display: "flex", alignItems: "center", gap: "6px" })}>
        <Bookmark size={13} color="#d97757" />
        <span css={css({ fontSize: "12px", fontWeight: "600", color: "#e8e8ec" })}>
          Mood bookmarks
        </span>
      </div>

      <div
        css={css({
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "6px",
        })}
      >
        {Array.from({ length: SLOT_COUNT }).map((_, idx) => {
          const slot = slots[idx];
          const editing = editingIdx === idx;
          return (
            <div
              key={idx}
              css={css({
                position: "relative",
                aspectRatio: "16 / 10",
                borderRadius: "6px",
                overflow: "hidden",
                border: slot ? "1px solid #2a2a2e" : "1px dashed #2a2a2e",
                backgroundColor: slot ? "#1a1a20" : "#0f0f11",
                cursor: editing ? "default" : "pointer",
                transition: "0.15s",
                ":hover": {
                  borderColor: slot ? "#3b82f6" : "#3a3a3e",
                },
              })}
              onClick={() => {
                if (editing) return;
                if (slot) handleRestore(idx);
                else handleCapture(idx);
              }}
              title={slot ? `Restore "${slot.name}"` : "Capture current scene"}
            >
              {slot ? (
                <>
                  {slot.thumbnail ? (
                    <img
                      src={slot.thumbnail}
                      alt={slot.name}
                      css={css({
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        opacity: 0.75,
                      })}
                    />
                  ) : null}
                  {/* Bottom name banner */}
                  <div
                    css={css({
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 0,
                      padding: "3px 6px",
                      fontSize: "10px",
                      fontWeight: "600",
                      color: "#fff",
                      background:
                        "linear-gradient(transparent, rgba(0,0,0,0.85))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "4px",
                    })}
                  >
                    {editing ? (
                      <>
                        <input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") {
                              setEditingIdx(null);
                              setEditingName("");
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          css={css({
                            flex: 1,
                            minWidth: 0,
                            background: "rgba(0,0,0,0.5)",
                            border: "1px solid #3b82f6",
                            borderRadius: "3px",
                            color: "#fff",
                            fontSize: "10px",
                            padding: "1px 4px",
                            outline: "none",
                          })}
                        />
                        <IconBtn
                          onClick={(e) => {
                            e.stopPropagation();
                            commitEdit();
                          }}
                          title="Save name"
                        >
                          <Check size={10} />
                        </IconBtn>
                      </>
                    ) : (
                      <>
                        <span
                          css={css({
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          })}
                        >
                          {slot.name}
                        </span>
                        <IconBtn
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(idx, slot);
                          }}
                          title="Rename"
                        >
                          <Edit2 size={10} />
                        </IconBtn>
                        <IconBtn
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCapture(idx);
                          }}
                          title="Overwrite with current scene"
                        >
                          <Camera size={10} />
                        </IconBtn>
                        <IconBtn
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClear(idx);
                          }}
                          title="Clear slot"
                        >
                          <X size={10} />
                        </IconBtn>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div
                  css={css({
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px",
                    color: "#4a4a54",
                    fontSize: "10px",
                  })}
                >
                  <Camera size={14} />
                  <span>Slot {DEFAULT_NAMES[idx]}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        css={css({
          fontSize: "9px",
          color: "#4a4a54",
          lineHeight: "1.4",
        })}
      >
        Each slot captures the entire scene mood: time, weather, cinema,
        style, and aspect ratio. Click an empty slot to capture; click a
        filled slot to restore.
      </div>
    </div>
  );
}

function IconBtn({
  onClick,
  title,
  children,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      css={css({
        background: "transparent",
        border: "none",
        padding: "2px",
        cursor: "pointer",
        color: "#a0a0aa",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "3px",
        ":hover": { background: "rgba(255,255,255,0.1)", color: "#fff" },
      })}
    >
      {children}
    </button>
  );
}
