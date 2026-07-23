// src/kernel/config/schema.ts

/** Allowed values for the `keymap` setting (SPEC §6). */
export const KEYMAP_VALUES = ["emacs", "vim"] as const;

/** The keys the kernel recognizes in settings.toml. Extended in later slices. */
export const KERNEL_SETTING_KEYS = ["keymap"] as const;
