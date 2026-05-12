import { defineOperator } from "../define";
import type { EnumProp } from "../prop";
import { useBookmarkStore } from "@/state/bookmarkStore";

/**
 * Mood bookmarks — three fixed slots that capture the entire scene
 * mood (time, atmosphere, weather, camera optics, style, aspect
 * ratio) for one-click A/B/C comparison.
 *
 * The AI uses these to "save the current look as Option A, then try
 * a stormy variant for Option B" without losing the user's work.
 */
const SLOT_VALUES = [
  { id: "0", label: "Slot A", description: "First mood bookmark slot." },
  { id: "1", label: "Slot B", description: "Second mood bookmark slot." },
  { id: "2", label: "Slot C", description: "Third mood bookmark slot." },
] as const;

type SlotId = (typeof SLOT_VALUES)[number]["id"];

export const CaptureBookmarkOp = defineOperator({
  id: "bookmark.capture",
  label: "Capture Bookmark",
  description:
    "Save the current scene mood (time, weather, atmosphere, camera, style, aspect ratio) into one of three named slots for later recall.",
  flags: { undo: true },
  props: {
    slot: {
      kind: "enum",
      default: "0",
      values: SLOT_VALUES.map((v) => ({ ...v })),
      ui: { tooltip: "Which slot to overwrite." },
    } as EnumProp<SlotId>,
    name: {
      kind: "string",
      default: "",
      ui: {
        tooltip:
          "Optional name for the bookmark. Leave empty to keep the current slot name (or default).",
      },
    },
  },
  exec(_ctx, props) {
    const idx = Number(props.slot);
    useBookmarkStore
      .getState()
      .capture(idx, props.name ? { name: props.name } : undefined);
    return { status: "finished", value: { slot: idx, name: props.name || undefined } };
  },
});

export const RestoreBookmarkOp = defineOperator({
  id: "bookmark.restore",
  label: "Restore Bookmark",
  description:
    "Restore a previously captured mood bookmark. No-op if the slot is empty.",
  flags: { undo: true },
  props: {
    slot: {
      kind: "enum",
      default: "0",
      values: SLOT_VALUES.map((v) => ({ ...v })),
      ui: { tooltip: "Which slot to restore." },
    } as EnumProp<SlotId>,
  },
  exec(_ctx, props) {
    const idx = Number(props.slot);
    const slot = useBookmarkStore.getState().slots[idx];
    if (!slot) return { status: "cancelled", reason: `Slot ${idx} is empty.` };
    useBookmarkStore.getState().restore(idx);
    return { status: "finished", value: { slot: idx, name: slot.name } };
  },
});

export const ListBookmarksOp = defineOperator({
  id: "bookmark.list",
  label: "List Bookmarks",
  description:
    "Read-only: list the three mood bookmark slots and which are filled.",
  flags: { readonly: true },
  props: {},
  exec() {
    const slots = useBookmarkStore.getState().slots.map((s, i) =>
      s
        ? {
            slot: i,
            name: s.name,
            capturedAt: s.capturedAt,
            styleId: s.styleId,
            aspectRatio: s.aspectRatio,
          }
        : { slot: i, name: null, capturedAt: null },
    );
    return { status: "finished", value: { slots } };
  },
});
