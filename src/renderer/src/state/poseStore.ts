import { create } from "zustand";

/**
 * Mannequin pose library. Each pose entry corresponds to a clip file
 * placed at `/anim/{id}.fbx` (or `.glb`). Files are loaded with a
 * tolerant filename probe (see `POSE_FILENAME_BASES` in Car.tsx), so
 * authoring conventions don't matter — anything missing simply doesn't
 * show up in the picker.
 *
 * The current library is Lily's matched-set animations. Locomotion
 * (`idle`, `walk`, `run`) is auto-driven by `carStore.velocityMS` in
 * drive mode; outside drive mode the user-selected `activePose` plays.
 */

export interface PoseEntry {
  id: string;
  label: string;
  category: "locomotion" | "scout" | "extra";
  description: string;
}

export const LOCOMOTION_POSES: PoseEntry[] = [
  { id: "idle", label: "Idle", category: "locomotion", description: "Standing still, arms relaxed" },
  { id: "walk", label: "Walk", category: "locomotion", description: "Walking forward" },
  { id: "run", label: "Run", category: "locomotion", description: "Running pace" },
];

export const SCOUT_POSES: PoseEntry[] = [
  { id: "sit", label: "Sit", category: "scout", description: "Sitting idle" },
  { id: "jump", label: "Jump", category: "scout", description: "Vertical jump" },
];

export const EXTRA_POSES: PoseEntry[] = [
  {
    id: "layingPose",
    label: "Laying",
    category: "extra",
    description: "Laying / reclining",
  },
  {
    id: "layingPose2",
    label: "Laying Alt",
    category: "extra",
    description: "Alternate laying pose",
  },
];

export const ALL_POSES: PoseEntry[] = [
  ...LOCOMOTION_POSES,
  ...SCOUT_POSES,
  ...EXTRA_POSES,
];

type PoseStore = {
  /**
   * Currently selected stationary pose (used when NOT in drive mode).
   * Defaults to "idle" — the standing-still loop.
   */
  activePose: string;
  /**
   * Pose ids that successfully loaded from /anim/. Populated by Car.tsx
   * once the probes resolve.
   */
  availableIds: string[];
  /**
   * Whether the user has clicked the mannequin to select it. When true a
   * floating popup appears next to the head with contextual controls
   * (pose, look-at, etc.).
   */
  selected: boolean;
  /**
   * World-space point the head bone should face. When set, the head
   * orientation overrides the active animation's head channel each frame.
   */
  lookAtTarget: [number, number, number] | null;
  /**
   * When true, the next scene click sets `lookAtTarget` instead of placing
   * a pin or changing focus. Auto-cleared after a successful pick.
   */
  lookAtPickMode: boolean;

  setActivePose: (id: string) => void;
  setAvailableIds: (ids: string[]) => void;
  setSelected: (v: boolean) => void;
  setLookAtTarget: (t: [number, number, number] | null) => void;
  setLookAtPickMode: (v: boolean) => void;
};

export const usePoseStore = create<PoseStore>((set) => ({
  activePose: "idle",
  availableIds: [],
  selected: false,
  lookAtTarget: null,
  lookAtPickMode: false,
  setActivePose: (activePose) => set({ activePose }),
  setAvailableIds: (availableIds) => set({ availableIds }),
  setSelected: (selected) => set({ selected }),
  setLookAtTarget: (lookAtTarget) => set({ lookAtTarget }),
  setLookAtPickMode: (lookAtPickMode) => set({ lookAtPickMode }),
}));
