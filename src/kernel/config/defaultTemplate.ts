// src/kernel/config/defaultTemplate.ts

/**
 * The curated settings.toml written when none exists (design §5). It documents
 * the file; no scalar settings exist yet (the keymap choice was removed with the
 * keybinding pivot, and keybindings live in keybindings.toml), so a fresh load
 * reports empty settings with no diagnostics.
 */
export const DEFAULT_SETTINGS_TOML = `# Coal - user settings (global scope)
#
# Your personal, machine-level Coal preferences. This file travels with you
# (your dotfiles), not with any vault. Edit it by hand or from Settings; Coal
# preserves your comments and formatting when it writes here.
#
# No settings are defined yet. Keybindings live in keybindings.toml, alongside
# this file.
`;
