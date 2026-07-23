// src/main/configService.ts
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import writeFileAtomic from "write-file-atomic";
import { DEFAULT_SETTINGS_TOML } from "../kernel/config/defaultTemplate";
import type { ConfigSnapshot, KernelSettings } from "../kernel/config/types";
import { validate } from "../kernel/config/validate";
import { applyEdit, parse } from "./tomlConfigCodec";

const EMPTY: ConfigSnapshot = { settings: {}, diagnostics: [] };

/**
 * Owns the global settings.toml. The file text is the source of truth; the
 * typed snapshot is derived from it (design §6). All IO is here, in main.
 */
export class ConfigService {
  readonly path: string;
  #text: string | null = null;
  #snapshot: ConfigSnapshot = EMPTY;
  #loaded = false;
  #listeners = new Set<(s: ConfigSnapshot) => void>();

  constructor(dir: string) {
    this.path = join(dir, "settings.toml");
  }

  /** Read (or materialize) the file and derive the snapshot. Idempotent; no emit. */
  async load(): Promise<ConfigSnapshot> {
    if (this.#loaded) return this.#snapshot;
    await this.#read();
    this.#loaded = true;
    return this.#snapshot;
  }

  /** Re-read from disk (external edits) and emit. */
  async reload(): Promise<ConfigSnapshot> {
    await this.#read();
    this.#loaded = true;
    this.#emit();
    return this.#snapshot;
  }

  /** Merge a change into the file, preserving comments and foreign keys; emit. */
  async set(patch: Partial<KernelSettings>): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      if (!this.#loaded) await this.load();
      const current = this.#text ?? DEFAULT_SETTINGS_TOML;
      const merged = { ...parse(current), ...patch };
      const nextText = applyEdit(current, merged);
      await this.#write(nextText);
      this.#text = nextText;
      this.#snapshot = this.#derive(nextText);
      this.#emit();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  onDidChangeConfig(cb: (s: ConfigSnapshot) => void): () => void {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  }

  async #read(): Promise<void> {
    if (existsSync(this.path)) {
      this.#text = await readFile(this.path, "utf-8");
    } else {
      this.#text = DEFAULT_SETTINGS_TOML;
      await this.#write(DEFAULT_SETTINGS_TOML);
    }
    this.#snapshot = this.#derive(this.#text);
  }

  /** Parse + validate; a parse failure keeps defaults + a diagnostic (never clobbers). */
  #derive(text: string): ConfigSnapshot {
    try {
      return validate(parse(text));
    } catch (err) {
      return {
        settings: {},
        diagnostics: [
          {
            key: "",
            kind: "parse-error",
            message: err instanceof Error ? err.message : String(err),
          },
        ],
      };
    }
  }

  async #write(text: string): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFileAtomic(this.path, text);
  }

  #emit(): void {
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}
