// src/kernel/io/codec.ts
import { detectEncoding, detectEol, hasFinalNewline } from "./detect";
import type { DecodeResult, DocMeta, Encoding } from "./types";

function bomBytes(encoding: Encoding): number[] {
  if (encoding === "utf-8") return [0xef, 0xbb, 0xbf];
  if (encoding === "utf-16le") return [0xff, 0xfe];
  return [0xfe, 0xff];
}

function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const hi = (code >> 8) & 0xff;
    const lo = code & 0xff;
    out[i * 2] = littleEndian ? lo : hi;
    out[i * 2 + 1] = littleEndian ? hi : lo;
  }
  return out;
}

/**
 * Decode bytes into LF-normalized text plus the metadata needed to reproduce the
 * original bytes. Undecodable input (bad sequences / binary NUL pattern) returns
 * `{ kind: "binary" }`. TextDecoder is fatal so lossy decodes are caught, not
 * silently mojibaked (design §7).
 */
export function decode(bytes: Uint8Array): DecodeResult {
  const sniff = detectEncoding(bytes);
  if (sniff === null) return { kind: "binary" };
  let raw: string;
  try {
    // ignoreBOM:false makes TextDecoder strip a leading BOM; we re-add it on encode.
    raw = new TextDecoder(sniff.encoding, { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return { kind: "binary" };
  }
  const { eol, mixedEol } = detectEol(raw);
  const finalNewline = hasFinalNewline(raw);
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const meta: DocMeta = {
    encoding: sniff.encoding,
    hasBom: sniff.hasBom,
    eol,
    mixedEol,
    finalNewline,
  };
  return { kind: "text", text, meta };
}

/**
 * Re-serialize LF-normalized text to bytes using the recorded metadata: apply the
 * EOL, encode per the encoding, and prepend a BOM if the original had one. For a
 * non-mixed file this is the exact inverse of decode (design §7).
 */
export function encode(text: string, meta: DocMeta): Uint8Array {
  const withEol = meta.eol === "crlf" ? text.replace(/\n/g, "\r\n") : text;
  const body =
    meta.encoding === "utf-8"
      ? new TextEncoder().encode(withEol)
      : encodeUtf16(withEol, meta.encoding === "utf-16le");
  if (!meta.hasBom) return body;
  const bom = bomBytes(meta.encoding);
  const out = new Uint8Array(bom.length + body.length);
  out.set(bom, 0);
  out.set(body, bom.length);
  return out;
}
