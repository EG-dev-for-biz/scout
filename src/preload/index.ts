import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

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
