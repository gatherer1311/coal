// src/main/index.ts
import { app, dialog, Menu, shell } from "electron";
import type { BrowserWindow, WebContents } from "electron";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { IPC } from "../kernel/ipc/contract";
import { FileService } from "./fileService";
import { isTrustedUrl } from "./guards";
import { registerIpc } from "./ipc";
import { buildMenu } from "./menu";
import { handleAppProtocol, registerSchemes } from "./protocol";
import { createWindow } from "./window";

const devUrl = process.env["ELECTRON_RENDERER_URL"];

app.setName("coal");
app.enableSandbox();
registerSchemes();

// Keep dev/e2e off the release single-instance lock and profile (design §9).
if (devUrl) app.setPath("userData", join(app.getPath("appData"), "coal-dev"));

/** The first existing file path in an argv list, resolved against cwd (design §2, §9). */
function firstFileArg(argv: string[], cwd: string): string | null {
  const start = app.isPackaged ? 1 : 2;
  for (const arg of argv.slice(start)) {
    if (arg.startsWith("-")) continue;
    try {
      const resolved = resolve(cwd, arg);
      if (existsSync(resolved) && statSync(resolved).isFile()) return resolved;
    } catch {
      // ignore unreadable args
    }
  }
  return null;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;
  let dirty = false;
  let forceQuit = false;
  let hasDoc = false;
  const fileService = new FileService();
  // Trailing slash makes the prefix an origin boundary, so a look-alike host
  // (e.g. localhost:5173.evil) can't satisfy the startsWith trust check (design §3).
  const allowedOrigins = devUrl ? [devUrl.endsWith("/") ? devUrl : `${devUrl}/`] : ["app://coal/"];

  const openInWindow = async (win: BrowserWindow, path: string): Promise<void> => {
    try {
      const res = await fileService.openPath(path);
      if (!res.canceled && !("binary" in res)) {
        win.webContents.send(IPC.docOpened, res.doc);
        hasDoc = true;
      }
    } catch (err) {
      console.error("failed to open file:", err);
    }
  };

  // Zero ambient authority for any web contents (design §3).
  app.on("web-contents-created", (_event, contents: WebContents) => {
    contents.on("will-navigate", (event, url) => {
      if (!isTrustedUrl(url, allowedOrigins)) event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("https://")) void shell.openExternal(url);
      return { action: "deny" };
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });

  app.on("second-instance", (_event, argv, workingDirectory) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const path = firstFileArg(argv, workingDirectory);
    if (path) void openInWindow(mainWindow, path);
  });

  app.whenReady().then(() => {
    if (!devUrl) handleAppProtocol();
    const win = createWindow();
    mainWindow = win;
    Menu.setApplicationMenu(buildMenu(win));

    registerIpc({
      fileService,
      getWindow: () => mainWindow,
      isTrustedSender: (event) => isTrustedUrl(event.senderFrame?.url, allowedOrigins),
      onSetDirty: (value) => {
        dirty = value;
      },
      onQuit: () => mainWindow?.close(),
      onDocPresent: () => {
        hasDoc = true;
      },
    });

    const launchPath = firstFileArg(process.argv, process.cwd());
    if (launchPath) {
      win.webContents.once("did-finish-load", () => void openInWindow(win, launchPath));
    }

    win.on("close", (event) => {
      if (forceQuit || !dirty) return;
      event.preventDefault();
      if (hasDoc) {
        const choice = dialog.showMessageBoxSync(win, {
          type: "warning",
          buttons: ["Save", "Don't Save", "Cancel"],
          defaultId: 0,
          cancelId: 2,
          message: "You have unsaved changes.",
        });
        if (choice === 0) {
          // Renderer saves, then calls app.quit(); by then dirty is false, so the
          // re-entered close guard falls through and the window closes.
          win.webContents.send(IPC.saveAndQuit);
        } else if (choice === 1) {
          forceQuit = true;
          win.close();
        }
      } else {
        // No file backs the buffer (typed into the empty editor); Save is impossible.
        const choice = dialog.showMessageBoxSync(win, {
          type: "warning",
          buttons: ["Don't Save", "Cancel"],
          defaultId: 1,
          cancelId: 1,
          message: "You have unsaved changes.",
        });
        if (choice === 0) {
          forceQuit = true;
          win.close();
        }
      }
    });

    win.on("closed", () => {
      mainWindow = null;
    });
  });

  app.on("window-all-closed", () => app.quit());
}
