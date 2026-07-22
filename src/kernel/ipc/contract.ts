// src/kernel/ipc/contract.ts
import type { DocMeta } from "../io/types";

/** IPC channel names. Every method on CoalApi wraps exactly one of these (design §3). */
export const IPC = {
  fileOpen: "coal:file.open",
  fileSave: "coal:file.save",
  docSetDirty: "coal:doc.setDirty",
  docOpened: "coal:doc.opened",
  appQuit: "coal:app.quit",
  menuCommand: "coal:menu.command",
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
  onMenuCommand(handler: (commandId: string) => void): () => void;
  /** Files opened from the CLI / a second instance are pushed from main. */
  onDocOpened(handler: (doc: OpenDocResult) => void): () => void;
}
