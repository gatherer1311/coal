import type { Disposable } from "./disposable";
import type { Keybinding } from "./types";

/**
 * Stores key -> command-id bindings. Resolution (find the first binding for a
 * key whose command exists and is enabled, else fall through) is the consumer's
 * job — the renderer keymap in this skeleton (design §6).
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

  getBindings(): Keybinding[] {
    return [...this.#bindings];
  }

  getBindingsForKeys(keys: string): Keybinding[] {
    return this.#bindings.filter((binding) => binding.keys === keys);
  }
}
