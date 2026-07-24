import type { Disposable } from "./disposable";
import type { Context } from "./context";
import type { Keybinding } from "./types";
import { matchesWhen } from "./when";
import { sequenceStartsWith } from "./keys";

/**
 * Stores the effective key-sequence -> command-id bindings (design §6). The
 * renderer sets the composed default+user table via setBindings; the resolver
 * and discoverability layer read it. registerKeybinding remains the incremental
 * public API a plugin will use (kept for the pre-plugin path and tests).
 */
export class KeybindingRegistry {
  #bindings: Keybinding[] = [];

  registerKeybinding(binding: Keybinding): Disposable {
    this.#bindings.push(binding);
    return {
      dispose: () => {
        const index = this.#bindings.indexOf(binding);
        if (index !== -1) this.#bindings.splice(index, 1);
      },
    };
  }

  /** Replace the whole effective table (design §6/§7 - the compose output sink). */
  setBindings(bindings: readonly Keybinding[]): void {
    this.#bindings = [...bindings];
  }

  /** Reverse lookup: every binding pointing at a command id (design §8, where-is). */
  getBindingsForCommand(command: string): Keybinding[] {
    return this.#bindings.filter((binding) => binding.command === command);
  }

  /**
   * Bindings live in `context` whose sequence starts with `pending` (design
   * §4.3): the resolver's complete-match (keys === pending) and live-prefix
   * (keys longer than pending) branches both read this; which-key reads it too.
   */
  getCandidates(pending: string, context: Context): Keybinding[] {
    return this.#bindings.filter(
      (binding) => sequenceStartsWith(binding.keys, pending) && matchesWhen(binding.when, context),
    );
  }
}
