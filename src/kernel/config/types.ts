// src/kernel/config/types.ts

/**
 * The kernel's own (global-scope) settings. The `keymap` choice was removed with
 * the command+keybinding pivot (design §11); no scalar settings remain yet, so
 * this is an empty forward-compatible record. Keybindings live in their own file
 * (config/keybindings), not here.
 */
export type KernelSettings = Record<string, never>;

/** A non-fatal problem found while validating raw config (design §5). */
export interface ConfigDiagnostic {
  readonly key: string; // dotted path / array index, "" for whole-document problems
  readonly kind:
    | "unknown-key"
    | "invalid-type"
    | "invalid-value"
    | "parse-error"
    | "binding-conflict" // design §5.3: same-sequence clash or prefix-invariant violation
    | "unresolvable-command"; // design §11: a binding points at an unregistered command id
  readonly message: string;
}

/** Validated settings + the diagnostics gathered producing them. */
export interface ConfigSnapshot {
  readonly settings: KernelSettings;
  readonly diagnostics: readonly ConfigDiagnostic[];
}
