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
 * Real cinema math: depth of field's blur radius is proportional to f²/N,
 * but applying that linearly across the focal-length range produces a
 * uniform "soft" look — by 50mm the kernel is already big enough that
 * the sky/horizon turns to mush. In practice DPs read wide lenses as
 * "forgiving" (subtle bokeh, clouds visible) and only step into heavy
 * isolation at portrait+ focal lengths.
 *
 * We model that by anchoring the curve at 50 mm = baseline and using a
 * power exponent of 2.5 so the slope ramps SOFT below 50 mm and HARD
 * above:
 *   24 mm f/2.4 → 0.27 px (effectively no visible bokeh)
 *   35 mm f/2.4 → 0.68 px (gentle, clouds still read)
 *   50 mm f/2.4 → 1.67 px (mild subject isolation)
 *   85 mm f/2.4 → 6.32 px (clear isolation)
 *  200 mm f/2.4 → 12 px clamp (dramatic, background dissolves)
 *
 * Combined with `physicalFocusRange` below — which extends the in-focus
 * BAND wide for wide-to-normal lenses via hyperfocal math — this gives
 * the cinematographer-expected behavior: wide lenses keep the sky
 * visible, telephotos isolate cleanly.
 */
export function bokehScaleFromLens(focalMM: number, apertureF: number): number {
  const focalFactor = Math.pow(focalMM / 50, 2.5);
  const raw = (focalFactor * 4) / Math.max(apertureF, 1);
  return Math.max(0.1, Math.min(12, raw));
}

// Full-frame circle of confusion, in millimetres. Standard cinematography
// figure for 35mm. The CoC defines what counts as "acceptably sharp" —
// anything within this CoC at the image plane reads as in-focus.
const COC_MM = 0.03;

/**
 * Physically-correct width (in metres) of the in-focus band, given focal
 * length, f-stop, and the world-space distance from the camera to the
 * focus target. Used as the `worldFocusRange` prop on `<DepthOfField>`.
 *
 * Why this matters: a 24mm at f/2.4 focused on a subject 5 m away has a
 * hyperfocal distance ≈ 8 m, so focus depth extends practically to
 * infinity — clouds, distant buildings, the horizon all stay sharp.
 * A 200mm at f/2.4 on the same subject has hyperfocal ≈ 555 m, and
 * everything past ~5.05 m blurs. The previous naive `apertureF * 4`
 * applied the same focus band to every lens and turned the sky into
 * mush even on a 24mm.
 *
 * Math: hyperfocal distance H = f² / (N × c). When focus distance D < H,
 * the FAR DoF limit is finite (D·H / (H − D + f)); when D ≥ H, the far
 * limit is infinity and we return a very large range so the post pass
 * keeps the distance background sharp. NEAR limit follows symmetrically.
 * We return (far − near), the symmetric width the postprocessing effect
 * uses around the focus target.
 */
export function physicalFocusRange(
  focalMM: number,
  apertureF: number,
  focusDistanceM: number
): number {
  const N = Math.max(1, apertureF);
  const f_m = focalMM / 1000;
  const D = Math.max(0.3, focusDistanceM);
  // Hyperfocal in metres.
  const H_m = (focalMM * focalMM) / (N * COC_MM) / 1000;

  const denomFar = H_m - D + f_m;
  // Past hyperfocal: far limit is infinity. Return a generous (but
  // bounded) range so the post-process pass classifies "everywhere
  // distant" as in-focus. We DON'T return Infinity / a huge value
  // because some downstream CoC math doesn't handle that gracefully —
  // 500 m is already vastly larger than any scout-scale subject so
  // the visual result is the same.
  if (denomFar <= 0) return 500;

  const far = (D * H_m) / denomFar;
  const near = (D * H_m) / (H_m + D - f_m);
  // Floor at 2 m so the user always has a tactile band even at extreme
  // telephoto / wide-open; cap at 500 m so the post pass's internal
  // float math stays well-conditioned (worldFocusRange feeds an
  // exponential CoC ramp inside DepthOfField).
  return Math.max(2, Math.min(500, far - near));
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
