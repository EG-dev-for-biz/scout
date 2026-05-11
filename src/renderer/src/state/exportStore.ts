import { create } from "zustand";

export type ExportType = "glb" | "fleet" | "annotations" | "shotlist";

type ActionStore = {
  action: boolean;
  fleetSpaceId: string;
  exportType: ExportType;

  setAction: (action: boolean) => void;
  setFleet: (fleetSpaceId: string, exportType: ExportType) => void;
  triggerGlbExport: () => void;
  triggerAnnotationsExport: () => void;
  triggerShotListExport: () => void;
};

export const useActionStore = create<ActionStore>((set) => ({
  action: false,
  fleetSpaceId: "",
  exportType: "glb",
  setAction: (action) => set({ action }),
  setFleet: (fleetSpaceId, exportType) => set({ fleetSpaceId, exportType }),
  triggerGlbExport: () => set({ action: true, exportType: "glb" }),
  triggerAnnotationsExport: () => set({ action: true, exportType: "annotations" }),
  triggerShotListExport: () => set({ action: true, exportType: "shotlist" }),
}));
