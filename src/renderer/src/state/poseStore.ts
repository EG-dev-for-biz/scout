import { create } from "zustand";

/**
 * Mannequin pose library. Each pose entry corresponds to a Mixamo clip
 * placed at `/anim/{id}.glb`. The user supplies these by downloading from
 * Mixamo (24 fps, GLB Binary, Without Skin, In Place) and dropping into
 * `src/renderer/public/anim/`. Anything missing simply doesn't show up in
 * the picker — the file probe is graceful.
 *
 * Locomotion (`idle`, `walk`, `jog`, `run`) is reserved for drive-mode
 * auto-playback driven by `carStore.velocityNorm`. Anything else is a
 * "pose" the user can select while NOT in drive mode to position the
 * mannequin as a human-scale prop for shot composition.
 */

export interface PoseEntry {
  id: string;
  label: string;
  category: "locomotion" | "scout" | "extra";
  description: string;
}

export const LOCOMOTION_POSES: PoseEntry[] = [
  { id: "idle", label: "Idle", category: "locomotion", description: "Standing still" },
  { id: "walk", label: "Walk", category: "locomotion", description: "Walking forward" },
  { id: "jog", label: "Jog", category: "locomotion", description: "Light jog" },
  { id: "run", label: "Run", category: "locomotion", description: "Running" },
];

export const SCOUT_POSES: PoseEntry[] = [
  { id: "sit", label: "Sit", category: "scout", description: "Sitting on bench / curb" },
  {
    id: "handsOnHips",
    label: "Hands on Hips",
    category: "scout",
    description: "Relaxed standing",
  },
  {
    id: "lookAround",
    label: "Look Around",
    category: "scout",
    description: "Head scan, eye-level",
  },
  { id: "phone", label: "Phone Call", category: "scout", description: "On the phone" },
];

export const EXTRA_POSES: PoseEntry[] = [
  { id: "talk", label: "Talking", category: "extra", description: "Gesture-heavy idle" },
  { id: "crouch", label: "Crouching", category: "extra", description: "Low subject" },
  {
    id: "leanWall",
    label: "Leaning Wall",
    category: "extra",
    description: "Leaning against a wall",
  },
  {
    id: "walkCircle",
    label: "Walk Circle",
    category: "extra",
    description: "Curved walk path",
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

  setActivePose: (id: string) => void;
  setAvailableIds: (ids: string[]) => void;
};

export const usePoseStore = create<PoseStore>((set) => ({
  activePose: "idle",
  availableIds: [],
  setActivePose: (activePose) => set({ activePose }),
  setAvailableIds: (availableIds) => set({ availableIds }),
}));
