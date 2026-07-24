// src/preload/index.ts
import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../kernel/ipc/contract";
import type {
  CoalApi,
  ConfigSetRequest,
  ConfigSetResult,
  ConfigSnapshot,
  KeybindingBindRequest,
  KeybindingUnbindRequest,
  KeybindingWriteResult,
  KeybindingsSnapshot,
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
  config: {
    load: (): Promise<ConfigSnapshot> => ipcRenderer.invoke(IPC.configLoad),
    set: (req: ConfigSetRequest): Promise<ConfigSetResult> =>
      ipcRenderer.invoke(IPC.configSet, req),
    reload: (): Promise<ConfigSnapshot> => ipcRenderer.invoke(IPC.configReload),
    openInEditor: (): Promise<OpenResult> => ipcRenderer.invoke(IPC.configOpen),
  },
  keybindings: {
    load: (): Promise<KeybindingsSnapshot> => ipcRenderer.invoke(IPC.keybindingsLoad),
    reload: (): Promise<KeybindingsSnapshot> => ipcRenderer.invoke(IPC.keybindingsReload),
    bind: (req: KeybindingBindRequest): Promise<KeybindingWriteResult> =>
      ipcRenderer.invoke(IPC.keybindingsBind, req),
    unbind: (req: KeybindingUnbindRequest): Promise<KeybindingWriteResult> =>
      ipcRenderer.invoke(IPC.keybindingsUnbind, req),
    openInEditor: (): Promise<OpenResult> => ipcRenderer.invoke(IPC.keybindingsOpen),
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
  onConfigChanged: (handler: (snapshot: ConfigSnapshot) => void): (() => void) => {
    const listener = (_event: unknown, snapshot: ConfigSnapshot): void => handler(snapshot);
    ipcRenderer.on(IPC.configChanged, listener);
    return () => ipcRenderer.removeListener(IPC.configChanged, listener);
  },
  onKeybindingsChanged: (handler: (snapshot: KeybindingsSnapshot) => void): (() => void) => {
    const listener = (_event: unknown, snapshot: KeybindingsSnapshot): void => handler(snapshot);
    ipcRenderer.on(IPC.keybindingsChanged, listener);
    return () => ipcRenderer.removeListener(IPC.keybindingsChanged, listener);
  },
};

contextBridge.exposeInMainWorld("coal", api);
