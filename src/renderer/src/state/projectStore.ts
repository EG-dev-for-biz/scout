import { create } from "zustand";

/**
 * Stable UUID for this project, used as the on-disk folder name for
 * generated assets (`~/.scout3d/projects/<projectId>/objects/*.glb`).
 * Lives in the project file so asset references survive reload.
 */
function newProjectId(): string {
  // Avoid importing uuid here — crypto.randomUUID is in every modern
  // Electron renderer and main process.
  return crypto.randomUUID();
}

type ProjectStore = {
  projectId: string;
  projectPath: string | null;
  projectName: string;
  isDirty: boolean;
  lastSaved: string | null;

  setProjectId: (id: string) => void;
  setProjectPath: (path: string | null) => void;
  setProjectName: (name: string) => void;
  markDirty: () => void;
  markSaved: (path: string) => void;
  resetProject: () => void;
};

export const useProjectStore = create<ProjectStore>((set) => ({
  projectId: newProjectId(),
  projectPath: null,
  projectName: "Untitled Project",
  isDirty: false,
  lastSaved: null,

  setProjectId: (projectId) => set({ projectId }),
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
      projectId: newProjectId(),
      projectPath: null,
      projectName: "Untitled Project",
      isDirty: false,
      lastSaved: null,
    }),
}));
