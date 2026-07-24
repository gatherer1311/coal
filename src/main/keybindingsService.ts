// src/main/keybindingsService.ts
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import writeFileAtomic from "write-file-atomic";
import { DEFAULT_KEYBINDINGS_TOML } from "../kernel/config/keybindings/defaultTemplate";
import type { KeybindingsSnapshot } from "../kernel/config/keybindings/types";
import { validateKeybindings } from "../kernel/config/keybindings/validate";
import { parse } from "./tomlConfigCodec";
import { appendEntry, type RawBindingEntry } from "./keybindingsToml";

const EMPTY: KeybindingsSnapshot = { entries: [], diagnostics: [] };
type WriteResult = { ok: true } | { ok: false; error: string };

/**
 * Owns the global keybindings.toml (design §7/§13). The file text is the source
 * of truth; the typed snapshot is derived from it. bind/unbind append a
 * formatted block (comments preserved by construction). All IO is here, in main.
 */
export class KeybindingsService {
  readonly path: string;
  #text: string | null = null;
  #snapshot: KeybindingsSnapshot = EMPTY;
  #loaded = false;
  #listeners = new Set<(s: KeybindingsSnapshot) => void>();

  constructor(dir: string) {
    this.path = join(dir, "keybindings.toml");
  }

  async load(): Promise<KeybindingsSnapshot> {
    if (this.#loaded) return this.#snapshot;
    await this.#read();
    this.#loaded = true;
    return this.#snapshot;
  }

  async reload(): Promise<KeybindingsSnapshot> {
    await this.#read();
    this.#loaded = true;
    this.#emit();
    return this.#snapshot;
  }

  bind(keys: string, command: string, when?: string): Promise<WriteResult> {
    return this.#append({ keys, command, ...(when !== undefined ? { when } : {}) });
  }

  unbind(keys: string, when?: string): Promise<WriteResult> {
    return this.#append({ keys, unbind: true, ...(when !== undefined ? { when } : {}) });
  }

  onDidChange(cb: (s: KeybindingsSnapshot) => void): () => void {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  }

  async #append(entry: RawBindingEntry): Promise<WriteResult> {
    try {
      if (!this.#loaded) await this.load();
      const current = this.#text ?? DEFAULT_KEYBINDINGS_TOML;
      // Append is deliberately parse-free (comment-preserving), so validate the
      // current file parses BEFORE appending: a hand-corrupted file fails cleanly
      // ({ ok: false }) and is never clobbered, matching ConfigService.set.
      parse(current);
      const nextText = appendEntry(current, entry);
      await this.#write(nextText);
      this.#text = nextText;
      this.#snapshot = this.#derive(nextText);
      this.#emit();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async #read(): Promise<void> {
    if (existsSync(this.path)) {
      this.#text = await readFile(this.path, "utf-8");
    } else {
      this.#text = DEFAULT_KEYBINDINGS_TOML;
      await this.#write(DEFAULT_KEYBINDINGS_TOML);
    }
    this.#snapshot = this.#derive(this.#text);
  }

  #derive(text: string): KeybindingsSnapshot {
    try {
      return validateKeybindings(parse(text));
    } catch (err) {
      return {
        entries: [],
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
    for (const listener of this.#listeners) {
      try {
        listener(this.#snapshot);
      } catch (err) {
        console.error("keybindings change listener threw:", err);
      }
    }
  }
}
