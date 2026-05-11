// Singleton ref to the active 3d-tiles-renderer TilesRenderer instance.
//
// Set by <TilesRendererRefBridge /> (mounted inside Canvas as a child of
// <TilesRenderer>) and read by autoPaintBuildings.ts (which runs OUTSIDE
// the Canvas and needs to listen for tile-load events on the same instance).
//
// We use a module-level ref instead of Zustand because (a) the TilesRenderer
// instance is not reactive — it doesn't trigger re-renders — and (b) we only
// ever need synchronous read access at orchestration time.

import type { TilesRenderer } from "3d-tiles-renderer/three";

export const tilesRendererRef: { current: TilesRenderer | null } = {
  current: null,
};
