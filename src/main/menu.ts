// src/main/menu.ts
import { Menu } from "electron";
import type { BrowserWindow } from "electron";
import { IPC } from "../kernel/ipc/contract";

/**
 * Native menu whose items send menu-command into the renderer's executeCommand.
 * The keymap (not the menu) is the source of truth for keys; multi-stroke default
 * bindings (e.g. Ctrl-x Ctrl-s) cannot be shown as native accelerators, so those
 * items carry no accelerator label (design §6).
 */
export function buildMenu(win: BrowserWindow): Menu {
  const send = (commandId: string) => (): void => win.webContents.send(IPC.menuCommand, commandId);
  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        { label: "Open File…", click: send("core.file.open") },
        { label: "Save", click: send("core.file.save") },
        { type: "separator" },
        { label: "Quit", click: send("core.app.quit") },
      ],
    },
    {
      label: "Commands",
      submenu: [
        {
          label: "Run Command…",
          accelerator: "CmdOrCtrl+Shift+P",
          registerAccelerator: false,
          click: send("core.command.execute"),
        },
      ],
    },
  ]);
}
