import { create } from "zustand";

export interface CameraSnapshot {
  position: [number, number, number];
  target: [number, number, number];
  /** Vertical field of view in degrees. */
  fov: number;
}

interface CameraStore {
  /** Live snapshot of the active camera, updated each frame from Space.tsx. */
  current: CameraSnapshot | null;
  /** A pending "frame this shot" command. Space.tsx watches this and tweens. */
  framingTarget: CameraSnapshot | null;
  /**
   * User-selected vertical FOV in degrees, derived from the chosen lens
   * focal length. CameraController smoothly lerps the live camera.fov
   * toward this value each frame.
   */
  userFovDeg: number;

  setCurrent: (snap: CameraSnapshot) => void;
  requestFraming: (snap: CameraSnapshot) => void;
  clearFraming: () => void;
  /** Set the lens by 35mm-equivalent focal length (mm). */
  setLensFocalMM: (focalMM: number) => void;
}

// Default 35mm — natural "documentary" focal length, midway between wide
// and standard. Easy to compose with and matches what most directors mean
// by "a normal lens".
const DEFAULT_FOCAL_MM = 35;
const DEFAULT_FOV_DEG = 2 * Math.atan(24 / 2 / DEFAULT_FOCAL_MM) * (180 / Math.PI);

export const useCameraStore = create<CameraStore>((set) => ({
  current: null,
  framingTarget: null,
  userFovDeg: DEFAULT_FOV_DEG,
  setCurrent: (snap) => set({ current: snap }),
  requestFraming: (snap) => set({ framingTarget: snap }),
  clearFraming: () => set({ framingTarget: null }),
  setLensFocalMM: (focalMM) =>
    set({ userFovDeg: focalLengthToFov(Math.max(4, focalMM)) }),
}));

// ---------------------------------------------------------------------------
// Lens presets (35mm full-frame equivalent focal lengths)
// ---------------------------------------------------------------------------

export interface LensPreset {
  /** 35mm-equivalent focal length in mm. */
  focalMM: number;
  /** Display label, e.g. "35mm". */
  label: string;
  /** Cinematographer-friendly category. */
  category: "ultrawide" | "wide" | "standard" | "tele" | "longtele";
  /** Short description shown in the picker. */
  description: string;
}

export const LENS_PRESETS: LensPreset[] = [
  {
    focalMM: 14,
    label: "14mm",
    category: "ultrawide",
    description: "Extreme wide — architecture, dramatic verticals",
  },
  {
    focalMM: 24,
    label: "24mm",
    category: "wide",
    description: "Wide — environmental, landscape, group",
  },
  {
    focalMM: 35,
    label: "35mm",
    category: "wide",
    description: "Natural wide — documentary, walk-and-talk",
  },
  {
    focalMM: 50,
    label: "50mm",
    category: "standard",
    description: "Standard — human-perspective, dialogue",
  },
  {
    focalMM: 85,
    label: "85mm",
    category: "tele",
    description: "Portrait — face close-up, shallow background",
  },
  {
    focalMM: 135,
    label: "135mm",
    category: "tele",
    description: "Telephoto — compression, isolated subject",
  },
  {
    focalMM: 200,
    label: "200mm",
    category: "longtele",
    description: "Long lens — far compression, stalker POV",
  },
];

// ---------------------------------------------------------------------------
// FOV ↔ Focal length conversion (35mm full-frame equivalent)
// ---------------------------------------------------------------------------

/**
 * Convert a vertical FOV (degrees) to its 35mm-equivalent focal length.
 * Useful for cinematographer-friendly readouts.
 */
export function fovToFocalLength(fovDeg: number): number {
  // 35mm full-frame sensor height is 24mm.
  // f = (sensorH/2) / tan(FOV/2)
  const sensorH = 24;
  const halfFov = (fovDeg / 2) * (Math.PI / 180);
  return sensorH / 2 / Math.tan(halfFov);
}

/** Convert 35mm focal length back to vertical FOV in degrees. */
export function focalLengthToFov(focalMM: number): number {
  const sensorH = 24;
  const fovRad = 2 * Math.atan(sensorH / 2 / focalMM);
  return fovRad * (180 / Math.PI);
}
