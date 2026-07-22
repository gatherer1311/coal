// src/main/index.ts  (minimal; Task 10 replaces this with the full lifecycle)
import { app, BrowserWindow } from "electron";
import { join } from "node:path";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => createWindow());
app.on("window-all-closed", () => app.quit());
