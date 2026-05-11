// generatedObjectStore.ts
//
// Tracks AI-generated 3D props placed in the Scout3D scene. The mesh
// binary lives on disk at
//   ~/.scout3d/projects/<projectId>/objects/<objectId>.glb
// and is loaded by the renderer via the scout3d-asset:// custom protocol.
//
// `pendingGlbUrl` mirrors the existing `pendingPinType` flow in
// annotationStore: once set, the next click in `Space.tsx` consumes it
// and calls `addObject` with a world-space hit point.

import { create } from "zustand";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GeneratedObject {
  id: string;
  name: string;
  /** scout3d-asset:// URL pointing at the on-disk GLB. */
  glbUrl: string;
  position: Vec3;
  rotation: Vec3;
  /** Uniform scale. AI meshes come out unit-cube-ish; world is metres. */
  scale: number;
  /** Tiny base64-PNG thumbnail of the input image. Used in lists. */
  sourceThumb?: string;
  createdAt: string;
}

type Store = {
  objects: GeneratedObject[];
  selectedId: string | null;
  /** Mode for the gizmo when an object is selected. */
  transformMode: "translate" | "rotate" | "scale";
  /** When non-null, the next scene click drops a new object at that URL. */
  pendingGlbUrl: string | null;
  /** Small payload stored alongside pending so addObject can record it. */
  pendingMeta: {
    sourceThumb?: string;
    suggestedName?: string;
  } | null;

  addObject: (
    obj: Omit<GeneratedObject, "id" | "createdAt">
  ) => string;
  updateObject: (id: string, patch: Partial<GeneratedObject>) => void;
  removeObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  setTransformMode: (mode: "translate" | "rotate" | "scale") => void;
  setPending: (
    glbUrl: string | null,
    meta?: { sourceThumb?: string; suggestedName?: string } | null
  ) => void;
  clearObjects: () => void;
  setObjects: (objs: GeneratedObject[]) => void;
};

function newId(): string {
  return `obj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useGeneratedObjectStore = create<Store>((set) => ({
  objects: [],
  selectedId: null,
  transformMode: "translate",
  pendingGlbUrl: null,
  pendingMeta: null,

  addObject: (obj) => {
    const id = newId();
    const full: GeneratedObject = {
      ...obj,
      id,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({ objects: [...s.objects, full] }));
    return id;
  },

  updateObject: (id, patch) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    })),

  removeObject: (id) =>
    set((s) => ({
      objects: s.objects.filter((o) => o.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  selectObject: (id) => set({ selectedId: id }),

  setTransformMode: (mode) => set({ transformMode: mode }),

  setPending: (glbUrl, meta) =>
    set({
      pendingGlbUrl: glbUrl,
      pendingMeta: glbUrl ? meta ?? null : null,
    }),

  clearObjects: () =>
    set({
      objects: [],
      selectedId: null,
      pendingGlbUrl: null,
      pendingMeta: null,
    }),

  setObjects: (objs) =>
    set({
      objects: objs,
      selectedId: null,
      pendingGlbUrl: null,
      pendingMeta: null,
    }),
}));
