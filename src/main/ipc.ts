// src/main/ipc.ts
import { dialog, ipcMain } from "electron";
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { IPC } from "../kernel/ipc/contract";
import type { OpenResult, SaveResult } from "../kernel/ipc/contract";
import type { FileService } from "./fileService";
import { isSaveRequest } from "./guards";

export interface IpcDeps {
  fileService: FileService;
  getWindow(): BrowserWindow | null;
  isTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): boolean;
  onSetDirty(dirty: boolean): void;
  onQuit(): void;
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.fileOpen, async (event): Promise<OpenResult> => {
    if (!deps.isTrustedSender(event)) return { canceled: true };
    const win = deps.getWindow();
    if (!win) return { canceled: true };
    const picked = await dialog.showOpenDialog(win, { properties: ["openFile"] });
    const path = picked.canceled || picked.filePaths.length === 0 ? null : picked.filePaths[0]!;
    return deps.fileService.openPath(path);
  });

  ipcMain.handle(IPC.fileSave, async (event, payload: unknown): Promise<SaveResult> => {
    if (!deps.isTrustedSender(event)) return { ok: false, error: "untrusted sender" };
    if (!isSaveRequest(payload)) return { ok: false, error: "invalid save request" };
    return deps.fileService.save(payload.id, payload.text);
  });

  ipcMain.on(IPC.docSetDirty, (event, dirty: unknown) => {
    if (!deps.isTrustedSender(event)) return;
    if (typeof dirty === "boolean") deps.onSetDirty(dirty);
  });

  ipcMain.on(IPC.appQuit, (event) => {
    if (!deps.isTrustedSender(event)) return;
    deps.onQuit();
  });
}
