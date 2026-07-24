// src/kernel/command/defaultKeymap.ts
import type { Keybinding } from "./types";

/**
 * The curated, Emacs-flavored default keymap the kernel installs at boot
 * (design §6, Appendix A). These are ordinary bindings - fully overridable by
 * keybindings.toml and removable with an unbind. Commands with no natural key
 * (core.config.open/reload, core.keys.bind/unbind) ship UNBOUND, deliberately
 * demonstrating Law 2: a command needs no binding - it is reachable by name.
 *
 * Note (a tuning of Appendix A): core.command.execute is bound to BOTH the Emacs
 * "M-x" idiom (Alt-x) and Ctrl-Shift-p. Electron's native menu can shadow a bare
 * Alt on Linux/Windows, so Ctrl-Shift-p is the reliable palette opener; Alt-x is
 * the Emacs alias. Both resolve to the same id.
 */
export const DEFAULT_KEYMAP: readonly Keybinding[] = [
  { keys: "Alt-x", command: "core.command.execute" },
  { keys: "Ctrl-Shift-p", command: "core.command.execute" },
  { keys: "Ctrl-x Ctrl-f", command: "core.file.open" },
  { keys: "Ctrl-x Ctrl-s", command: "core.file.save" },
  { keys: "Ctrl-x Ctrl-c", command: "core.app.quit" },
  { keys: "Ctrl-g", command: "core.abort" },
  { keys: "Ctrl-h k", command: "core.help.describe-key" },
  { keys: "Ctrl-h x", command: "core.help.describe-command" },
  { keys: "Enter", command: "core.minibuffer.accept", when: "minibufferOpen" },
  { keys: "Escape", command: "core.minibuffer.cancel", when: "minibufferOpen" },
  { keys: "Ctrl-n", command: "core.minibuffer.next", when: "minibufferOpen" },
  { keys: "ArrowDown", command: "core.minibuffer.next", when: "minibufferOpen" },
  { keys: "Ctrl-p", command: "core.minibuffer.prev", when: "minibufferOpen" },
  { keys: "ArrowUp", command: "core.minibuffer.prev", when: "minibufferOpen" },
];
