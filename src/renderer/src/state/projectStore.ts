import { create } from "zustand";

type ProjectStore = {
  projectPath: string | null;
  projectName: string;
  isDirty: boolean;
  lastSaved: string | null;

  setProjectPath: (path: string | null) => void;
  setProjectName: (name: string) => void;
  markDirty: () => void;
  markSaved: (path: string) => void;
  resetProject: () => void;
};

export const useProjectStore = create<ProjectStore>((set) => ({
  projectPath: null,
  projectName: "Untitled Project",
  isDirty: false,
  lastSaved: null,

  setProjectPath: (projectPath) => set({ projectPath }),
  setProjectName: (projectName) => set({ projectName }),
  markDirty: () => set({ isDirty: true }),
  markSaved: (path) =>
    set({
      projectPath: path,
      isDirty: false,
      lastSaved: new Date().toISOString(),
    }),
  resetProject: () =>
    set({
      projectPath: null,
      projectName: "Untitled Project",
      isDirty: false,
      lastSaved: null,
    }),
}));
