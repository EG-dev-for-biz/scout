import { create } from "zustand";
import type { DerivedBuildingPalette } from "@/utils/colorPalette";

/**
 * Holds AI-painted texture overrides for the 3D scene's surfaces.
 *
 * Phase 1 (live): groundTexture overrides the satellite ground.
 * Phase 1.5 (live): skyTexture overrides the procedural sky.
 * Phase 1.6 (live): derivedBuildingPalette auto-tints buildings to harmonize
 *                   with the painted ground.
 *
 * Future: roofTextures, facadeTextures (per cardinal direction).
 */
type PaintedSceneStore = {
  /** Data URL of the AI-restyled aerial ground image, or null. */
  groundTexture: string | null;
  /** Style id used for the current ground. */
  paintedStyleId: string | null;

  /** Data URL of the AI-painted equirectangular sky panorama, or null. */
  skyTexture: string | null;
  /** Style id used for the current sky. */
  paintedSkyStyleId: string | null;

  /** Auto-derived building colors that harmonize with the painted ground. */
  derivedBuildingPalette: DerivedBuildingPalette | null;

  /**
   * Painted projection texture(s) for buildings. Up to 4 entries — each
   * captured from a different angle. The Building shader blends them based
   * on per-face normal alignment with each capture's camera direction, so
   * the result looks correct from many viewing angles.
   *
   * Older entries are dropped (FIFO) when the array exceeds 4.
   */
  buildingsPaintedViews: Array<{
    /** Painted PNG data URL. */
    imageDataUrl: string;
    /** Combined projection*viewInverse 4×4 matrix (16 floats, column-major Three.js). */
    viewProjMatrix: number[];
    /** Captured camera world position (for back-face/alignment checks). */
    cameraPos: [number, number, number];
    /** Style id used for this paint. */
    styleId: string;
  }>;

  /**
   * Per-building painted facade textures + the captured camera matrix used
   * when each was painted. Keyed by OSM building id (as string).
   *
   * The view-proj matrix is essential: the building shader uses it to
   * projectively sample the painted texture from the same angle the photo
   * was captured at. Otherwise the texture would be wrapped weirdly via
   * default UVs (causing rooftops to appear on side walls).
   */
  perBuildingViews: Record<
    string,
    {
      imageDataUrl: string;
      viewProjMatrix: number[];
      cameraPos: [number, number, number];
    }
  >;
  /** Style id used when the per-building bake was last performed. */
  perBuildingStyleId: string | null;

  /** True while ANY paint request is in flight. */
  paintingInProgress: boolean;
  /** Optional progress message: "Painting ground..." / "Painting sky...". */
  paintingMessage: string | null;

  setGroundTexture: (url: string | null, styleId?: string | null) => void;
  setSkyTexture: (url: string | null, styleId?: string | null) => void;
  setDerivedBuildingPalette: (palette: DerivedBuildingPalette | null) => void;
  setPerBuildingView: (
    buildingId: string,
    view:
      | {
          imageDataUrl: string;
          viewProjMatrix: number[];
          cameraPos: [number, number, number];
        }
      | null
  ) => void;
  setPerBuildingViews: (
    map: Record<
      string,
      {
        imageDataUrl: string;
        viewProjMatrix: number[];
        cameraPos: [number, number, number];
      }
    >,
    styleId: string | null
  ) => void;
  clearPerBuildingViews: () => void;
  /** Append a new view. FIFO at 4 entries. */
  addBuildingsPaintedView: (view: {
    imageDataUrl: string;
    viewProjMatrix: number[];
    cameraPos: [number, number, number];
    styleId: string;
  }) => void;
  /** Replace the entire array (used when loading projects). */
  setBuildingsPaintedViews: (
    views: Array<{
      imageDataUrl: string;
      viewProjMatrix: number[];
      cameraPos: [number, number, number];
      styleId: string;
    }>
  ) => void;
  clearBuildingsPaintedViews: () => void;
  setPaintingInProgress: (b: boolean, message?: string | null) => void;
  clear: () => void;
};

export const usePaintedSceneStore = create<PaintedSceneStore>((set) => ({
  groundTexture: null,
  paintedStyleId: null,
  skyTexture: null,
  paintedSkyStyleId: null,
  derivedBuildingPalette: null,
  buildingsPaintedViews: [],
  perBuildingViews: {},
  perBuildingStyleId: null,
  paintingInProgress: false,
  paintingMessage: null,

  setGroundTexture: (groundTexture, styleId) =>
    set((state) => ({
      groundTexture,
      paintedStyleId: groundTexture ? styleId ?? null : null,
      // Clearing ground also clears derived building colors.
      // Setting ground keeps the existing palette (until a new one is computed).
      derivedBuildingPalette: groundTexture ? state.derivedBuildingPalette : null,
    })),

  setSkyTexture: (skyTexture, styleId) =>
    set({
      skyTexture,
      paintedSkyStyleId: skyTexture ? styleId ?? null : null,
    }),

  setDerivedBuildingPalette: (derivedBuildingPalette) =>
    set({ derivedBuildingPalette }),

  addBuildingsPaintedView: (view) =>
    set((state) => {
      const next = [...state.buildingsPaintedViews, view];
      // Cap at 4 — drop oldest. The shader supports up to 4 simultaneous views.
      return { buildingsPaintedViews: next.slice(-4) };
    }),

  setBuildingsPaintedViews: (buildingsPaintedViews) =>
    set({ buildingsPaintedViews: buildingsPaintedViews.slice(-4) }),

  clearBuildingsPaintedViews: () => set({ buildingsPaintedViews: [] }),

  setPerBuildingView: (buildingId, view) =>
    set((state) => {
      const next = { ...state.perBuildingViews };
      if (view) {
        next[buildingId] = view;
      } else {
        delete next[buildingId];
      }
      return { perBuildingViews: next };
    }),

  setPerBuildingViews: (map, styleId) =>
    set({ perBuildingViews: map, perBuildingStyleId: styleId }),

  clearPerBuildingViews: () =>
    set({ perBuildingViews: {}, perBuildingStyleId: null }),

  setPaintingInProgress: (paintingInProgress, paintingMessage = null) =>
    set({ paintingInProgress, paintingMessage }),

  clear: () =>
    set({
      groundTexture: null,
      paintedStyleId: null,
      skyTexture: null,
      paintedSkyStyleId: null,
      derivedBuildingPalette: null,
      buildingsPaintedViews: [],
      perBuildingViews: {},
      perBuildingStyleId: null,
      paintingInProgress: false,
      paintingMessage: null,
    }),
}));
