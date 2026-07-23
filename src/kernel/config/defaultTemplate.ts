// src/kernel/config/defaultTemplate.ts

/**
 * The curated settings.toml written when none exists (design §5). It documents
 * the file and leaves `keymap` commented out (unset), so a fresh load reports
 * empty settings with no diagnostics.
 */
export const DEFAULT_SETTINGS_TOML = `# Coal - user settings (global scope)
#
# Your personal, machine-level Coal preferences. This file travels with you
# (your dotfiles), not with any vault. Edit it by hand or from Settings; Coal
# preserves your comments and formatting when it writes here.

# keymap: which keybinding template drives the editor - "emacs" or "vim".
# Chosen on first run; uncomment to set it explicitly.
# keymap = "vim"
`;
