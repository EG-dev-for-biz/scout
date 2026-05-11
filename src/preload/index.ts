import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

/**
 * Subscribe to a channel and return an unsubscribe fn. Using a wrapper
 * here means callers don't need ipcRenderer access in the renderer
 * (we keep contextIsolation strict).
 */
function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_: Electron.IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  dialog: {
    openFile: (): Promise<{
      canceled: boolean;
      filePath?: string;
      content?: string;
      error?: string;
    }> => ipcRenderer.invoke("dialog:openFile"),

    saveFile: (
      filePath: string,
      content: string
    ): Promise<{ success: boolean; filePath?: string; error?: string }> =>
      ipcRenderer.invoke("dialog:saveFile", filePath, content),

    saveFileAs: (
      content: string
    ): Promise<{
      canceled?: boolean;
      success?: boolean;
      filePath?: string;
      error?: string;
    }> => ipcRenderer.invoke("dialog:saveFileAs", content),

    exportFile: (
      defaultName: string,
      content: ArrayBuffer | string
    ): Promise<{
      canceled?: boolean;
      success?: boolean;
      filePath?: string;
      error?: string;
    }> => ipcRenderer.invoke("dialog:exportFile", defaultName, content),
  },

  mesh: {
    checkInstall: (): Promise<{
      installed: boolean;
      pythonExists: boolean;
      cliExists: boolean;
      sf3dHome: string;
    }> => ipcRenderer.invoke("mesh:checkInstall"),

    generate: (args: {
      imageDataUrl: string;
      projectId: string;
      jobId: string;
      removeBg?: boolean;
      textureResolution?: number;
    }): Promise<
      | { success: true; jobId: string; glbPath: string; elapsedMs: number }
      | { success: false; error: string }
    > => ipcRenderer.invoke("mesh:generate", args),

    cancel: (): Promise<{ success: true }> => ipcRenderer.invoke("mesh:cancel"),

    onProgress: (cb: (p: { jobId: string; pct: number; step: string }) => void) =>
      on("mesh:progress", cb),

    onLog: (cb: (msg: string) => void) => on("mesh:log", cb),

    onExit: (cb: (info: { code: number | null; signal: string | null; wasRunning: boolean }) => void) =>
      on("mesh:exit", cb),
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  (window as any).electron = electronAPI;
  (window as any).api = api;
}
