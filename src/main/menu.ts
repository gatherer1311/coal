// src/main/menu.ts
import { Menu } from "electron";
import type { BrowserWindow } from "electron";
import { IPC } from "../kernel/ipc/contract";

/**
 * Native menu whose items send menu-command into the renderer's executeCommand.
 * registerAccelerator:false so the key is handled once, by the renderer keymap —
 * never two sources of truth (design §6).
 */
export function buildMenu(win: BrowserWindow): Menu {
  const send = (commandId: string) => (): void => win.webContents.send(IPC.menuCommand, commandId);
  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "Open File…",
          accelerator: "CmdOrCtrl+O",
          registerAccelerator: false,
          click: send("core.file.open"),
        },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          registerAccelerator: false,
          click: send("core.file.save"),
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "CmdOrCtrl+Q",
          registerAccelerator: false,
          click: send("core.app.quit"),
        },
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
