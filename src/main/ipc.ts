import { ipcMain, dialog, BrowserWindow } from "electron";
import { readFileSync, writeFileSync } from "fs";

export function registerIpcHandlers(): void {
  // Open project file
  ipcMain.handle("dialog:openFile", async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { canceled: true };

    const result = await dialog.showOpenDialog(win, {
      title: "Open Scout3D Project",
      filters: [
        { name: "Scout3D Project", extensions: ["scout.json"] },
        { name: "JSON Files", extensions: ["json"] },
      ],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    try {
      const content = readFileSync(filePath, "utf-8");
      return { canceled: false, filePath, content };
    } catch (error) {
      return { canceled: false, error: String(error) };
    }
  });

  // Save project file at existing path
  ipcMain.handle("dialog:saveFile", async (_event, filePath: string, content: string) => {
    try {
      writeFileSync(filePath, content, "utf-8");
      return { success: true, filePath };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Save project file with dialog (Save As)
  ipcMain.handle("dialog:saveFileAs", async (_event, content: string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { canceled: true };

    const result = await dialog.showSaveDialog(win, {
      title: "Save Scout3D Project",
      defaultPath: "untitled.scout.json",
      filters: [
        { name: "Scout3D Project", extensions: ["scout.json"] },
        { name: "JSON Files", extensions: ["json"] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    try {
      writeFileSync(result.filePath, content, "utf-8");
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Export file (GLB / JSON / Markdown / arbitrary)
  ipcMain.handle("dialog:exportFile", async (_event, defaultName: string, content: Buffer | string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { canceled: true };

    let filters: Electron.FileFilter[];
    if (defaultName.endsWith(".glb")) {
      filters = [{ name: "GLB Model", extensions: ["glb"] }];
    } else if (defaultName.endsWith(".md")) {
      filters = [{ name: "Markdown", extensions: ["md"] }];
    } else if (defaultName.endsWith(".json")) {
      filters = [{ name: "JSON", extensions: ["json"] }];
    } else {
      filters = [{ name: "All Files", extensions: ["*"] }];
    }

    const result = await dialog.showSaveDialog(win, {
      title: "Export File",
      defaultPath: defaultName,
      filters,
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    try {
      const buf = typeof content === "string" ? Buffer.from(content, "utf-8") : Buffer.from(content);
      writeFileSync(result.filePath, buf);
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
