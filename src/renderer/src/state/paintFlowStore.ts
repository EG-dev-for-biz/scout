import { create } from "zustand";

export type PaintFlowPhase =
  | "idle"
  | "init"
  | "capturing"
  | "painting"
  | "done"
  | "error";

interface PaintFlowStore {
  busy: boolean;
  phase: PaintFlowPhase;
  message: string;
  progress: { captured: number; painted: number; total: number };
  errorMessage: string | null;
  /** Data URL of the most recent capture sent to Gemini — used for debug. */
  lastCapturePreview: string | null;
  /** Data URL of the most recent painted result — used for debug. */
  lastPaintedPreview: string | null;

  start: (totalViews: number) => void;
  setPhase: (phase: PaintFlowPhase) => void;
  setMessage: (message: string) => void;
  setProgress: (p: { captured?: number; painted?: number }) => void;
  setLastCapture: (dataUrl: string | null) => void;
  setLastPainted: (dataUrl: string | null) => void;
  finish: (errorMessage?: string) => void;
  reset: () => void;
}

const INITIAL = {
  busy: false,
  phase: "idle" as PaintFlowPhase,
  message: "",
  progress: { captured: 0, painted: 0, total: 4 },
  errorMessage: null,
  lastCapturePreview: null,
  lastPaintedPreview: null,
};

/**
 * Drives the auto-paint UI: progress overlay, button busy state, error toast.
 * Owned by autoPaintBuildings.ts which calls start/setPhase/setProgress/finish.
 */
export const usePaintFlowStore = create<PaintFlowStore>((set) => ({
  ...INITIAL,

  start: (totalViews) =>
    set({
      busy: true,
      phase: "init",
      message: "Initializing…",
      progress: { captured: 0, painted: 0, total: totalViews },
      errorMessage: null,
      lastCapturePreview: null,
      lastPaintedPreview: null,
    }),

  setPhase: (phase) => set({ phase }),

  setMessage: (message) => set({ message }),

  setProgress: ({ captured, painted }) =>
    set((state) => ({
      progress: {
        ...state.progress,
        ...(captured !== undefined && { captured }),
        ...(painted !== undefined && { painted }),
      },
    })),

  setLastCapture: (lastCapturePreview) => set({ lastCapturePreview }),
  setLastPainted: (lastPaintedPreview) => set({ lastPaintedPreview }),

  finish: (errorMessage) =>
    set((state) => ({
      busy: false,
      phase: errorMessage ? "error" : "done",
      message: errorMessage ?? "Done",
      errorMessage: errorMessage ?? null,
      // keep progress so UI can show final state briefly
      progress: state.progress,
    })),

  reset: () => set(INITIAL),
}));
