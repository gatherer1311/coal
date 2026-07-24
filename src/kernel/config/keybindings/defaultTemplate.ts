// src/kernel/config/keybindings/defaultTemplate.ts

/**
 * The curated keybindings.toml written when none exists (design §7). It documents
 * the override surface and leaves every example commented out, so a fresh load
 * reports no entries and no diagnostics; Coal's built-in keymap is in force.
 */
export const DEFAULT_KEYBINDINGS_TOML = `# Coal - keybindings (global scope)
#
# Your personal key -> command overrides, layered over Coal's built-in keymap.
# The file is the source of truth; Set Key (core.keys.bind) writes here too, and
# your comments and formatting are preserved. Keys bind to command ids, never to
# code. A sequence is space-separated chords, e.g. "Ctrl-x Ctrl-s". Modifiers are
# canonical: Ctrl-, Alt-, Shift-, Meta- (Shift is explicit: "Ctrl-Shift-p").

# Rebind save to a Ctrl-c prefix (overrides the default Ctrl-x Ctrl-s):
# [[keybinding]]
# keys = "Ctrl-c s"
# command = "core.file.save"

# Scope a binding to a context with when:
# [[keybinding]]
# keys = "Ctrl-n"
# command = "core.minibuffer.next"
# when = "minibufferOpen"

# Remove a default outright, without replacing it:
# [[keybinding]]
# keys = "Ctrl-x Ctrl-c"
# unbind = true
`;
