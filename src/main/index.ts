import { app, BrowserWindow, net, protocol, shell } from "electron";
import { homedir } from "node:os";
import { join } from "path";
import { pathToFileURL } from "node:url";
import { is } from "@electron-toolkit/utils";
import { registerIpcHandlers } from "./ipc";
import { meshGenerator } from "./imageToMesh";

// Custom scheme for loading user-generated GLB assets out of
// ~/.scout3d/projects/<projectId>/objects/<file>.glb without leaking
// arbitrary file:// access to the renderer.
//
// Privileges must be declared before app.ready, hence the top-level call.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "scout3d-asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
]);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0f0f11",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on("ready-to-show", () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  // Resolve scout3d-asset://<projectId>/<rest-of-path> against the user's
  // project folder. The host part is the project id; the path part is the
  // file under projects/<id>/. Anything that resolves outside the project
  // root is rejected with 403 so a malicious project file can't escape.
  const PROJECTS_ROOT = join(homedir(), ".scout3d", "projects");
  protocol.handle("scout3d-asset", (req) => {
    try {
      const url = new URL(req.url);
      const projectId = url.host;
      // Normalise: strip leading slash, decode percent-encoding, reject "..".
      const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      if (!projectId || rel.split(/[\\/]/).includes("..")) {
        return new Response("Forbidden", { status: 403 });
      }
      const filePath = join(PROJECTS_ROOT, projectId, rel);
      const safeRoot = join(PROJECTS_ROOT, projectId);
      if (!filePath.startsWith(safeRoot)) {
        return new Response("Forbidden", { status: 403 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      return new Response(`Bad URL: ${(err as Error).message}`, { status: 400 });
    }
  });

  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", async () => {
  await meshGenerator.shutdown();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
