// src/renderer/keybindings.ts
import type { KeybindingEntry, KeybindingsSnapshot } from "../kernel/config/keybindings/types";
import type {
  CoalApi,
  KeybindingBindRequest,
  KeybindingUnbindRequest,
  KeybindingWriteResult,
} from "../kernel/ipc/contract";

/**
 * Renderer-side reactive replica of keybindings.toml (design §7). Holds the
 * latest snapshot from main and re-broadcasts changes to subscribers (the
 * composition root recomposes the keymap on each). DOM-free; the coal API is
 * injected so it is unit-testable.
 */
export class KeybindingsClient {
  #api: CoalApi;
  #snapshot: KeybindingsSnapshot = { entries: [], diagnostics: [] };
  #listeners = new Set<(s: KeybindingsSnapshot) => void>();

  constructor(api: CoalApi) {
    this.#api = api;
  }

  async init(): Promise<KeybindingsSnapshot> {
    this.#snapshot = await this.#api.keybindings.load();
    this.#api.onKeybindingsChanged((snapshot) => {
      this.#snapshot = snapshot;
      for (const listener of this.#listeners) listener(snapshot);
    });
    return this.#snapshot;
  }

  get entries(): readonly KeybindingEntry[] {
    return this.#snapshot.entries;
  }

  get snapshot(): KeybindingsSnapshot {
    return this.#snapshot;
  }

  onChange(cb: (s: KeybindingsSnapshot) => void): () => void {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  }

  bind(req: KeybindingBindRequest): Promise<KeybindingWriteResult> {
    return this.#api.keybindings.bind(req);
  }

  unbind(req: KeybindingUnbindRequest): Promise<KeybindingWriteResult> {
    return this.#api.keybindings.unbind(req);
  }

  reload(): Promise<KeybindingsSnapshot> {
    return this.#api.keybindings.reload();
  }
}
