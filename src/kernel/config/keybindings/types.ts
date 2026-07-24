// src/kernel/config/keybindings/types.ts
import type { ConfigDiagnostic } from "../types";

/** A user binding: a key sequence -> a command id, optionally context-scoped. */
export interface KeybindingBind {
  readonly keys: string;
  readonly command: string;
  readonly when?: string;
}

/** A user unbind: remove the matching (keys, when) binding (design §7; Emacs: bind to nil). */
export interface KeybindingUnbind {
  readonly keys: string;
  readonly unbind: true;
  readonly when?: string;
}

export type KeybindingEntry = KeybindingBind | KeybindingUnbind;

/** Validated keybinding entries + the diagnostics gathered producing them. */
export interface KeybindingsSnapshot {
  readonly entries: readonly KeybindingEntry[];
  readonly diagnostics: readonly ConfigDiagnostic[];
}
