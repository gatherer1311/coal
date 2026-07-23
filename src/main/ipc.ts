// src/main/ipc.ts
import { dialog, ipcMain } from "electron";
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { IPC } from "../kernel/ipc/contract";
import type { ConfigSnapshot, OpenResult, SaveResult } from "../kernel/ipc/contract";
import type { ConfigService } from "./configService";
import type { FileService } from "./fileService";
import { isConfigSetRequest, isSaveRequest } from "./guards";

export interface IpcDeps {
  fileService: FileService;
  configService: ConfigService;
  getWindow(): BrowserWindow | null;
  isTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): boolean;
  onSetDirty(dirty: boolean): void;
  onQuit(): void;
  onDocPresent(): void;
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.fileOpen, async (event): Promise<OpenResult> => {
    if (!deps.isTrustedSender(event)) return { canceled: true };
    const win = deps.getWindow();
    if (!win) return { canceled: true };
    const picked = await dialog.showOpenDialog(win, { properties: ["openFile"] });
    const path = picked.canceled || picked.filePaths.length === 0 ? null : picked.filePaths[0]!;
    const result = await deps.fileService.openPath(path);
    if (!result.canceled && !("binary" in result)) deps.onDocPresent();
    return result;
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

  const emptySnapshot: ConfigSnapshot = { settings: {}, diagnostics: [] };

  ipcMain.handle(IPC.configLoad, async (event): Promise<ConfigSnapshot> => {
    if (!deps.isTrustedSender(event)) return emptySnapshot;
    return deps.configService.load();
  });

  ipcMain.handle(IPC.configSet, async (event, payload: unknown) => {
    if (!deps.isTrustedSender(event)) return { ok: false, error: "untrusted sender" };
    if (!isConfigSetRequest(payload)) return { ok: false, error: "invalid config set request" };
    return deps.configService.set(payload.patch);
  });

  ipcMain.handle(IPC.configReload, async (event): Promise<ConfigSnapshot> => {
    if (!deps.isTrustedSender(event)) return emptySnapshot;
    return deps.configService.reload();
  });

  ipcMain.handle(IPC.configOpen, async (event): Promise<OpenResult> => {
    if (!deps.isTrustedSender(event)) return { canceled: true };
    const result = await deps.fileService.openPath(deps.configService.path);
    if (!result.canceled && !("binary" in result)) deps.onDocPresent();
    return result;
  });
}
