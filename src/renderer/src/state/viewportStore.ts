import { create } from "zustand";

/**
 * Aspect-ratio presets the viewport can be locked to.
 *   - "free": fills the available space (default; preserves legacy behavior)
 *   - others: letterbox/pillarbox the canvas inside the available space
 */
export type AspectRatio =
  | "free"
  | "16:9"
  | "1:1"
  | "21:9"
  | "9:16"
  | "anamorphic";

export const ASPECT_RATIO_OPTIONS: {
  id: AspectRatio;
  label: string;
  description: string;
  /** Width / Height ratio as a number. null = unconstrained. */
  ratio: number | null;
}[] = [
  { id: "free", label: "Free", description: "Fills available space", ratio: null },
  { id: "16:9", label: "16:9", description: "Cinematic widescreen", ratio: 16 / 9 },
  { id: "1:1", label: "1:1", description: "Square (Instagram)", ratio: 1 },
  { id: "21:9", label: "21:9", description: "Ultrawide / cinemascope", ratio: 21 / 9 },
  {
    id: "anamorphic",
    label: "2.39 Anamorphic",
    description: "Cinema anamorphic — pairs with cinema toolkit",
    ratio: 2.39,
  },
  { id: "9:16", label: "9:16", description: "Vertical (TikTok / Reels)", ratio: 9 / 16 },
];

type ViewportStore = {
  aspectRatio: AspectRatio;
  setAspectRatio: (ratio: AspectRatio) => void;
};

export const useViewportStore = create<ViewportStore>((set) => ({
  // Default to "free" so existing users see no UX change on first launch;
  // a quick click switches to a cinematic frame when needed.
  aspectRatio: "free",
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
}));

/** Convenience: lookup the numeric ratio for an id (or null for "free"). */
export function ratioFor(id: AspectRatio): number | null {
  return ASPECT_RATIO_OPTIONS.find((o) => o.id === id)?.ratio ?? null;
}
