// src/kernel/config/keybindings/schema.ts

/** The array-of-tables key in keybindings.toml: `[[keybinding]]`. */
export const KEYBINDING_TABLE = "keybinding";

/** The fields a `[[keybinding]]` entry may set. Others are reported unknown. */
export const KEYBINDING_ENTRY_KEYS = ["keys", "command", "when", "unbind"] as const;
