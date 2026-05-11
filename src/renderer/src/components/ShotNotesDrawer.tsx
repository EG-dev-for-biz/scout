import { useEffect, useRef } from "react";
import { css } from "@emotion/react";
import { Film, X as XIcon } from "lucide-react";
import { useAnnotationStore, type PinType } from "@/state/annotationStore";
import { AnnotationPanel } from "./AnnotationPanel";

// ---------------------------------------------------------------------------
// <ShotNotesDrawer />
// ---------------------------------------------------------------------------
//
// Right-edge drawer wrapping the existing <AnnotationPanel> body. Used
// to view + edit annotation pins (shots, locations, notes, hazards) and
// to start adding new ones via the pin-type buttons.
//
// Behavior:
//   - Auto-opens when a new pin gets selected (e.g. shutter capture
//     selects the new shot pin) — director's reflex: capture, then
//     immediately see the slate / notes for that take.
//   - The shot list itself is now in the bottom filmstrip; this drawer
//     focuses on per-shot metadata (rename, notes, tags, delete).

const DRAWER_WIDTH = 290;

interface ShotNotesDrawerProps {
  open: boolean;
  onToggle: () => void;
  onRequestPin: (type: PinType) => void;
  /** When true, an external trigger (pin selection) wants the drawer
   *  open. The drawer's owner is responsible for syncing `open` with
   *  this — we surface a callback rather than mutate parent state
   *  directly so the parent can apply policy (e.g. don't auto-open
   *  during paint flow). */
  onAutoOpen?: () => void;
}

export function ShotNotesDrawer({
  open,
  onToggle,
  onRequestPin,
  onAutoOpen,
}: ShotNotesDrawerProps) {
  const selectedPinId = useAnnotationStore((s) => s.selectedPinId);
  const pins = useAnnotationStore((s) => s.pins);

  // Auto-open on pin selection. Only fire when selection transitions
  // from null to non-null; staying on the same pin or moving between
  // pins shouldn't re-open the drawer if the user closed it manually.
  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      selectedPinId &&
      !prevSelectedRef.current &&
      onAutoOpen &&
      !open
    ) {
      onAutoOpen();
    }
    prevSelectedRef.current = selectedPinId;
    // We deliberately don't depend on `open` — auto-open only triggers
    // on the selection rising edge, not on open-state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPinId]);

  return (
    <>
      {/* Edge tab */}
      <button
        onClick={onToggle}
        title={open ? "Close shot notes" : "Open shot notes"}
        css={css({
          position: "absolute",
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          width: "30px",
          height: "120px",
          backgroundColor: "#13131a",
          border: "1px solid #2a2a30",
          borderRight: "none",
          borderRadius: "4px 0 0 4px",
          padding: "10px 4px",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "6px",
          zIndex: 25,
          color: open ? "#3b82f6" : "#a8a8b0",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.04), -2px 0 8px rgba(0,0,0,0.5)",
          transition: "120ms cubic-bezier(0.4, 0, 0.2, 1)",
          ":hover": {
            backgroundColor: "#1c1c24",
            color: "#e8e8ec",
          },
        })}
      >
        <Film size={13} />
        <span
          css={css({
            writingMode: "vertical-rl",
            fontSize: "9px",
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontFamily:
              "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
          })}
        >
          Notes
        </span>
        {pins.length > 0 && (
          <span
            css={css({
              fontSize: "8px",
              fontFamily: "'SF Mono', Menlo, Consolas, monospace",
              color: "#7a7a86",
            })}
          >
            {pins.length}
          </span>
        )}
      </button>

      {/* Backdrop dim */}
      {open && (
        <div
          onClick={onToggle}
          css={css({
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(2px)",
            zIndex: 20,
            animation: "fadeIn 200ms ease",
            "@keyframes fadeIn": {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
          })}
        />
      )}

      {/* Drawer panel */}
      <div
        css={css({
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: `${DRAWER_WIDTH}px`,
          backgroundColor: "#0f0f11",
          borderLeft: "1px solid #2a2a30",
          boxShadow: open ? "-8px 0 24px rgba(0,0,0,0.55)" : "none",
          transform: open ? "translateX(0)" : `translateX(${DRAWER_WIDTH}px)`,
          transition: "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          zIndex: 22,
        })}
      >
        {/* Drawer header — mirrors the camera-body chrome on SetupDrawer.
            The existing AnnotationPanel renders its own header inside,
            but we want a consistent vocabulary across both drawers, so
            we suppress its built-in header via CSS and put our own
            above. AnnotationPanel doesn't expose a "no header" prop, so
            we leave its header visible too; the cost is one extra row,
            but the vocabulary stays consistent if we ever simplify. */}
        <div
          css={css({
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 14px",
            borderBottom: "1px solid #2a2a30",
            flexShrink: 0,
            background:
              "linear-gradient(to bottom, #18181c 0%, #13131a 100%)",
            boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.03)",
          })}
        >
          <div
            css={css({
              display: "flex",
              alignItems: "center",
              gap: "7px",
              color: "#3b82f6",
            })}
          >
            <Film size={13} />
            <span
              css={css({
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#e8e8ec",
                fontFamily:
                  "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif",
              })}
            >
              Shot Notes
            </span>
          </div>
          <button
            css={css({
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#6b6b78",
              display: "flex",
              padding: "2px",
              borderRadius: "3px",
              ":hover": { color: "#e8e8ec", backgroundColor: "#1c1c24" },
            })}
            onClick={onToggle}
            title="Close"
          >
            <XIcon size={13} />
          </button>
        </div>

        {/* The actual annotation list / editor. AnnotationPanel is forced
            open (its `isOpen` width-toggling is what we used to use; now
            the drawer-wrapper handles slide animation, so we always
            keep the inner panel's content visible). The internal close
            button calls onToggle which is the same as our outer close. */}
        <div css={css({ flex: 1, overflow: "hidden", display: "flex" })}>
          <AnnotationPanel
            isOpen={true}
            onToggle={onToggle}
            onRequestPin={onRequestPin}
          />
        </div>
      </div>
    </>
  );
}
