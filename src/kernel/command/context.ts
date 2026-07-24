// src/kernel/command/context.ts

/** A read-only view of the active boolean contexts, for `when` evaluation. */
export interface Context {
  isActive(name: string): boolean;
}

/**
 * Holds the current boolean context values (editorFocused, minibufferOpen, ...).
 * The renderer adapter flips them on focus/open/close (design §5). Pure - no DOM.
 */
export class ContextRegistry implements Context {
  #values = new Map<string, boolean>();
  #listeners = new Set<() => void>();

  set(name: string, value: boolean): void {
    if (this.isActive(name) === value) return;
    this.#values.set(name, value);
    for (const listener of this.#listeners) listener();
  }

  isActive(name: string): boolean {
    return this.#values.get(name) === true;
  }

  onDidChange(cb: () => void): () => void {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  }
}
