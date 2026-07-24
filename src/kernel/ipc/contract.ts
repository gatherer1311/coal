// src/kernel/ipc/contract.ts
import type { DocMeta } from "../io/types";
import type { ConfigSnapshot, KernelSettings } from "../config/types";
export type { ConfigSnapshot, KernelSettings } from "../config/types";
import type { KeybindingsSnapshot } from "../config/keybindings/types";
export type { KeybindingsSnapshot, KeybindingEntry } from "../config/keybindings/types";

/** IPC channel names. Every method on CoalApi wraps exactly one of these (design §3). */
export const IPC = {
  fileOpen: "coal:file.open",
  fileSave: "coal:file.save",
  docSetDirty: "coal:doc.setDirty",
  docOpened: "coal:doc.opened",
  saveAndQuit: "coal:app.saveAndQuit",
  appQuit: "coal:app.quit",
  menuCommand: "coal:menu.command",
  configLoad: "coal:config.load",
  configSet: "coal:config.set",
  configReload: "coal:config.reload",
  configChanged: "coal:config.changed",
  configOpen: "coal:config.open",
  keybindingsLoad: "coal:keybindings.load",
  keybindingsReload: "coal:keybindings.reload",
  keybindingsBind: "coal:keybindings.bind",
  keybindingsUnbind: "coal:keybindings.unbind",
  keybindingsChanged: "coal:keybindings.changed",
  keybindingsOpen: "coal:keybindings.open",
} as const;

export interface OpenDocResult {
  id: string;
  text: string;
  meta: DocMeta;
  displayName: string;
}

export type OpenResult =
  | { canceled: true }
  | { canceled: false; doc: OpenDocResult }
  | { canceled: false; binary: true; displayName: string };

export interface SaveRequest {
  id: string;
  text: string;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export interface ConfigSetRequest {
  readonly patch: Partial<KernelSettings>;
}

export type ConfigSetResult = { ok: true } | { ok: false; error: string };

export interface KeybindingBindRequest {
  readonly keys: string;
  readonly command: string;
  readonly when?: string;
}

export interface KeybindingUnbindRequest {
  readonly keys: string;
  readonly when?: string;
}

export type KeybindingWriteResult = { ok: true } | { ok: false; error: string };

/** The typed surface the preload bridge exposes on window.coal. */
export interface CoalApi {
  file: {
    open(): Promise<OpenResult>;
    save(req: SaveRequest): Promise<SaveResult>;
  };
  doc: {
    setDirty(dirty: boolean): void;
  };
  app: {
    quit(): void;
  };
  config: {
    load(): Promise<ConfigSnapshot>;
    set(req: ConfigSetRequest): Promise<ConfigSetResult>;
    reload(): Promise<ConfigSnapshot>;
    /** Main opens settings.toml via fileService; the renderer never sees the path. */
    openInEditor(): Promise<OpenResult>;
  };
  keybindings: {
    load(): Promise<KeybindingsSnapshot>;
    reload(): Promise<KeybindingsSnapshot>;
    bind(req: KeybindingBindRequest): Promise<KeybindingWriteResult>;
    unbind(req: KeybindingUnbindRequest): Promise<KeybindingWriteResult>;
    /** Main opens keybindings.toml via fileService; the renderer never sees the path. */
    openInEditor(): Promise<OpenResult>;
  };
  onMenuCommand(handler: (commandId: string) => void): () => void;
  /** Files opened from the CLI / a second instance are pushed from main. */
  onDocOpened(handler: (doc: OpenDocResult) => void): () => void;
  /** Main asks the renderer to save (if possible) then quit (the unsaved-changes dialog's Save). */
  onSaveAndQuit(handler: () => void): () => void;
  /** The kernel config changed (set / reload); main pushes the new snapshot. */
  onConfigChanged(handler: (snapshot: ConfigSnapshot) => void): () => void;
  /** keybindings.toml changed (bind / unbind / reload); main pushes the new snapshot. */
  onKeybindingsChanged(handler: (snapshot: KeybindingsSnapshot) => void): () => void;
}
