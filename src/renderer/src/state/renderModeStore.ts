import { create } from "zustand";

export type RenderMode = "osm" | "photoreal" | "hybrid";

export const RENDER_MODE_OPTIONS: {
  id: RenderMode;
  label: string;
  description: string;
  requiresGoogle: boolean;
}[] = [
  {
    id: "osm",
    label: "OSM Buildings",
    description: "Extruded OpenStreetMap footprints with satellite ground.",
    requiresGoogle: false,
  },
  {
    id: "photoreal",
    label: "Photoreal 3D",
    description: "Google Photorealistic 3D Tiles — actual photogrammetry.",
    requiresGoogle: true,
  },
  {
    id: "hybrid",
    label: "Hybrid",
    description: "Photoreal scene + clickable OSM hit-testing for pin placement.",
    requiresGoogle: true,
  },
];

type RenderModeStore = {
  mode: RenderMode;
  setMode: (mode: RenderMode) => void;
};

export const useRenderModeStore = create<RenderModeStore>((set) => ({
  mode: "osm",
  setMode: (mode) => set({ mode }),
}));
