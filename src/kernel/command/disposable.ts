/** Something that can be torn down. The kernel's universal cleanup unit. */
export interface Disposable {
  dispose(): void;
}

/**
 * Tracks disposables and tears them all down together (design §6). Disposal is
 * idempotent and runs in reverse order of addition; anything added after the
 * store is disposed is disposed immediately, so registrations never leak.
 */
export class DisposableStore implements Disposable {
  #items = new Set<Disposable>();
  #disposed = false;

  add<T extends Disposable>(item: T): T {
    if (this.#disposed) {
      item.dispose();
      return item;
    }
    this.#items.add(item);
    return item;
  }

  get size(): number {
    return this.#items.size;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const items = [...this.#items].reverse();
    this.#items.clear();
    for (const item of items) item.dispose();
  }
}
