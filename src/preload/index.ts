// src/preload/index.ts
import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../kernel/ipc/contract";
import type {
  CoalApi,
  OpenDocResult,
  OpenResult,
  SaveRequest,
  SaveResult,
} from "../kernel/ipc/contract";

const api: CoalApi = {
  file: {
    open: (): Promise<OpenResult> => ipcRenderer.invoke(IPC.fileOpen),
    save: (req: SaveRequest): Promise<SaveResult> => ipcRenderer.invoke(IPC.fileSave, req),
  },
  doc: {
    setDirty: (dirty: boolean): void => ipcRenderer.send(IPC.docSetDirty, dirty),
  },
  app: {
    quit: (): void => ipcRenderer.send(IPC.appQuit),
  },
  onMenuCommand: (handler: (commandId: string) => void): (() => void) => {
    const listener = (_event: unknown, commandId: string): void => handler(commandId);
    ipcRenderer.on(IPC.menuCommand, listener);
    return () => ipcRenderer.removeListener(IPC.menuCommand, listener);
  },
  onDocOpened: (handler: (doc: OpenDocResult) => void): (() => void) => {
    const listener = (_event: unknown, doc: OpenDocResult): void => handler(doc);
    ipcRenderer.on(IPC.docOpened, listener);
    return () => ipcRenderer.removeListener(IPC.docOpened, listener);
  },
  onSaveAndQuit: (handler: () => void): (() => void) => {
    const listener = (): void => handler();
    ipcRenderer.on(IPC.saveAndQuit, listener);
    return () => ipcRenderer.removeListener(IPC.saveAndQuit, listener);
  },
};

contextBridge.exposeInMainWorld("coal", api);
