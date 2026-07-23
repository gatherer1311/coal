// src/renderer/config.ts
import type { ConfigSnapshot, KernelSettings } from "../kernel/config/types";
import type { CoalApi, ConfigSetResult } from "../kernel/ipc/contract";

/**
 * Renderer-side reactive replica of the kernel config. Holds the latest
 * snapshot from main and re-broadcasts changes to subscribers (design §6).
 * DOM-free; the coal API is injected so it is unit-testable.
 */
export class ConfigClient {
  #api: CoalApi;
  #snapshot: ConfigSnapshot = { settings: {}, diagnostics: [] };
  #listeners = new Set<(s: ConfigSnapshot) => void>();

  constructor(api: CoalApi) {
    this.#api = api;
  }

  async init(): Promise<ConfigSnapshot> {
    this.#snapshot = await this.#api.config.load();
    this.#api.onConfigChanged((snapshot) => {
      this.#notify(snapshot);
    });
    return this.#snapshot;
  }

  get settings(): KernelSettings {
    return this.#snapshot.settings;
  }

  onChange(cb: (s: ConfigSnapshot) => void): () => void {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  }

  set(patch: Partial<KernelSettings>): Promise<ConfigSetResult> {
    return this.#api.config.set({ patch });
  }

  reload(): Promise<ConfigSnapshot> {
    return this.#api.config.reload();
  }

  /** Store the new snapshot and fan it out. Isolate each listener so a
   *  throwing subscriber can't stop the others (mirrors configService#emit). */
  #notify(snapshot: ConfigSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error("config change listener threw:", err);
      }
    }
  }
}
