// src/main/fileService.ts
import { readFile, realpath } from "node:fs/promises";
import { basename } from "node:path";
import writeFileAtomic from "write-file-atomic";
import { decode, encode } from "../kernel/io/codec";
import type { DocMeta } from "../kernel/io/types";
import type { OpenResult, SaveResult } from "../kernel/ipc/contract";

interface OpenDoc {
  path: string;
  pristine: Uint8Array;
  meta: DocMeta;
  text: string;
}

/**
 * Owns open files in main. The renderer only sees an opaque id + decoded text;
 * the real path and pristine bytes stay here — the boundary future encryption
 * reuses (design §3, §5, §7).
 */
export class FileService {
  #docs = new Map<string, OpenDoc>();
  #seq = 0;

  async openPath(path: string | null): Promise<OpenResult> {
    if (path === null) return { canceled: true };
    const raw = await readFile(path);
    const bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    const displayName = basename(path);
    const decoded = decode(bytes);
    if (decoded.kind === "binary") {
      return { canceled: false, binary: true, displayName };
    }
    this.#seq += 1;
    const id = `doc-${this.#seq}`;
    this.#docs.set(id, { path, pristine: bytes, meta: decoded.meta, text: decoded.text });
    return { canceled: false, doc: { id, text: decoded.text, meta: decoded.meta, displayName } };
  }

  async save(id: string, text: string): Promise<SaveResult> {
    const doc = this.#docs.get(id);
    if (!doc) return { ok: false, error: `unknown doc: ${id}` };
    try {
      // Unedited content re-writes pristine bytes verbatim (byte-exact even for
      // mixed-EOL files); changed content is re-encoded from meta (design §7).
      const bytes = text === doc.text ? doc.pristine : encode(text, doc.meta);
      const target = await realpathOrSelf(doc.path);
      await writeFileAtomic(target, Buffer.from(bytes));
      this.#docs.set(id, { ...doc, pristine: bytes, text });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  has(id: string): boolean {
    return this.#docs.has(id);
  }
}

async function realpathOrSelf(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}
