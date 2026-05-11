import { create } from "zustand";

// ---------------------------------------------------------------------------
// slateStore — slate-burn animation event bus
// ---------------------------------------------------------------------------
//
// A tiny pub/sub that the ShutterButton fires into and the SlateBurn
// component subscribes to. We do this as a store rather than a React
// ref / context so the slate can be triggered from anywhere (e.g. a
// keyboard handler, a drive-mode shortcut, an automation script) without
// having to thread props down.
//
// Lifecycle: `fire()` writes a new event with an incrementing id (so
// repeated shutters with identical metadata still re-trigger the
// animation). SlateBurn watches `event.id` and runs its fade animation.
// When the animation completes, SlateBurn calls `clear()` so the store
// returns to a neutral state.

export interface SlateEvent {
  /** Monotonic id — bumps every fire even when payload is identical. */
  id: number;
  /** Shot number — for "SHOT 12" line. */
  shotNumber: number;
  /** Focal length in mm equivalent (rounded). */
  focalMM: number;
  /** F-stop or null when DoF is off. */
  fStop: number | null;
  /** "16:30" scene time. */
  time: string;
  /** Compact weather label, e.g. "CLEAR", "RAIN 50%", "GUSTING NW". */
  wx: string;
}

interface SlateStore {
  event: SlateEvent | null;
  fire: (partial: Omit<SlateEvent, "id">) => void;
  clear: () => void;
}

let nextId = 1;

export const useSlateStore = create<SlateStore>((set) => ({
  event: null,
  fire: (partial) =>
    set({
      event: { id: nextId++, ...partial },
    }),
  clear: () => set({ event: null }),
}));
