import { create } from "zustand";

/**
 * Cinema toolkit state: user-loaded 3D LUTs and anamorphic preset.
 *
 * - LUT: a `.cube` lookup file shifts the final image through a cinema/film
 *   color grade. Applied in the atmospheric composer (and the legacy PostFX
 *   pipeline) right before the final tonemap.
 *
 * - Anamorphic: a "preset" that flips the viewport to 2.39:1, force-enables
 *   the takram lens flare, and adds subtle gate noise + chromatic aberration
 *   biases so the rig reads as anamorphic cinema instead of digital flat.
 *   The anamorphic flag is consumed by AtmosphericRig and TimeControls.
 */

export interface BuiltInLUT {
  id: string;
  name: string;
  url: string;
  description: string;
}

// Ship a single identity LUT for sanity-checking the pipeline. Users can
// drop in any .cube file (color grade, film stock emulation, vendor LUT)
// via the file picker — the loader handles 17×17×17 / 33×33×33 cube sizes.
export const BUILT_IN_LUTS: BuiltInLUT[] = [
  {
    id: "identity-17",
    name: "Identity (test)",
    url: "/luts/identity-17.cube",
    description: "Pass-through. Sanity check that the LUT pipeline is wired.",
  },
];

type CinemaStore = {
  /** True when a LUT3DEffect should be active in the composer. */
  lutEnabled: boolean;
  /** Friendly display name (built-in id, file name, or null). */
  lutName: string | null;
  /** Resolvable URL — either a public asset path or a blob: URL. */
  lutUrl: string | null;
  /** 0..1; modulates the LUT effect's blend-mode opacity. */
  lutIntensity: number;

  setLut: (name: string, url: string) => void;
  clearLut: () => void;
  setLutEnabled: (v: boolean) => void;
  setLutIntensity: (v: number) => void;
};

// NOTE on anamorphic: there is intentionally NO `anamorphicEnabled` field
// here. The single source of truth is `viewportStore.aspectRatio ===
// "anamorphic"`. AtmosphericRig and TimeControls derive the anamorphic FX
// from that value, avoiding cross-store sync bugs.

export const useCinemaStore = create<CinemaStore>((set) => ({
  lutEnabled: false,
  lutName: null,
  lutUrl: null,
  lutIntensity: 1,

  setLut: (name, url) =>
    set({ lutName: name, lutUrl: url, lutEnabled: true }),

  clearLut: () =>
    set({ lutName: null, lutUrl: null, lutEnabled: false }),

  setLutEnabled: (lutEnabled) => set({ lutEnabled }),
  setLutIntensity: (v) =>
    set({ lutIntensity: Math.max(0, Math.min(1, v)) }),
}));
