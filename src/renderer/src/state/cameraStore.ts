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

  // Depth-of-field state. When enabled the AtmosphericRig and PostFX
  // composers mount a <DepthOfField> pass driven by these values.
  dofEnabled: boolean;
  /** F-stop / aperture (1.4 = wide / shallow DoF, 22 = pinhole / deep DoF). */
  apertureF: number;
  /**
   * World-space point the focus plane snaps to. When null, DoF defaults to
   * a point ~50 units in front of the camera. Updated via "click to focus"
   * or by Space.tsx when focusPickMode is active.
   */
  focusTarget: [number, number, number] | null;
  /**
   * When true, the next scene click sets focusTarget instead of placing a
   * pin. Auto-cleared after a successful pick.
   */
  focusPickMode: boolean;

  setCurrent: (snap: CameraSnapshot) => void;
  requestFraming: (snap: CameraSnapshot) => void;
  clearFraming: () => void;
  /** Set the lens by 35mm-equivalent focal length (mm). */
  setLensFocalMM: (focalMM: number) => void;
  setDofEnabled: (v: boolean) => void;
  setApertureF: (f: number) => void;
  setFocusTarget: (t: [number, number, number] | null) => void;
  setFocusPickMode: (v: boolean) => void;
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
  dofEnabled: false,
  apertureF: 2.8,
  focusTarget: null,
  focusPickMode: false,
  setCurrent: (snap) => set({ current: snap }),
  requestFraming: (snap) => set({ framingTarget: snap }),
  clearFraming: () => set({ framingTarget: null }),
  setLensFocalMM: (focalMM) =>
    set({ userFovDeg: focalLengthToFov(Math.max(4, focalMM)) }),
  setDofEnabled: (dofEnabled) => set({ dofEnabled }),
  setApertureF: (apertureF) => set({ apertureF: Math.max(1, apertureF) }),
  setFocusTarget: (focusTarget) => set({ focusTarget }),
  setFocusPickMode: (focusPickMode) => set({ focusPickMode }),
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

// ---------------------------------------------------------------------------
// F-stop presets (cinema standard scale, full + third stops)
// ---------------------------------------------------------------------------

export const F_STOP_PRESETS: { value: number; label: string }[] = [
  { value: 1.4, label: "f/1.4" },
  { value: 2, label: "f/2" },
  { value: 2.8, label: "f/2.8" },
  { value: 4, label: "f/4" },
  { value: 5.6, label: "f/5.6" },
  { value: 8, label: "f/8" },
  { value: 11, label: "f/11" },
  { value: 16, label: "f/16" },
  { value: 22, label: "f/22" },
];

/**
 * Map a (focal length, f-stop) pair to the `bokehScale` parameter the
 * `<DepthOfField>` postprocessing effect expects.
 *
 * Real cinema math: depth of field is proportional to (N × c) / f², where
 * f is focal length, N is f-stop, c is the sensor's circle of confusion.
 * That means a longer lens or a smaller f-number → shallower DoF → bigger
 * blur kernel. We collapse this into bokehScale ≈ f² / N / k, where k is
 * a constant tuned so f/2.8 on a 50mm reads as a believable shallow-focus.
 * Clamped to a comfortable range; the effect gets very expensive at very
 * high bokehScale values.
 */
export function bokehScaleFromLens(focalMM: number, apertureF: number): number {
  const raw = (focalMM * focalMM) / Math.max(apertureF, 1) / 250;
  return Math.max(0.2, Math.min(12, raw));
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
