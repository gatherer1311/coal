// src/kernel/config/types.ts

/** Which keybinding template drives the editor (SPEC §6). No baked-in default. */
export type KeymapChoice = "emacs" | "vim";

/** The kernel's own (global-scope) settings. Each key is optional until set. */
export interface KernelSettings {
  readonly keymap?: KeymapChoice;
}

/** A non-fatal problem found while validating raw config (design §5). */
export interface ConfigDiagnostic {
  readonly key: string; // dotted path, "" for whole-document problems
  readonly kind: "unknown-key" | "invalid-type" | "invalid-value" | "parse-error";
  readonly message: string;
}

/** Validated settings + the diagnostics gathered producing them. */
export interface ConfigSnapshot {
  readonly settings: KernelSettings;
  readonly diagnostics: readonly ConfigDiagnostic[];
}
