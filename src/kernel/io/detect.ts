// src/kernel/io/detect.ts
import type { Encoding, Eol } from "./types";

const BOM_UTF8 = [0xef, 0xbb, 0xbf];
const BOM_UTF16LE = [0xff, 0xfe];
const BOM_UTF16BE = [0xfe, 0xff];

export interface EncodingSniff {
  encoding: Encoding;
  hasBom: boolean;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
}

/**
 * Sniff encoding from a byte prefix. A BOM wins; otherwise a NUL-position
 * heuristic over the first 512 bytes distinguishes UTF-16 LE/BE (ASCII text is
 * ~every-other-byte NUL). Returns null when the bytes look binary (design §7).
 */
export function detectEncoding(bytes: Uint8Array): EncodingSniff | null {
  if (startsWith(bytes, BOM_UTF8)) return { encoding: "utf-8", hasBom: true };
  if (startsWith(bytes, BOM_UTF16LE)) return { encoding: "utf-16le", hasBom: true };
  if (startsWith(bytes, BOM_UTF16BE)) return { encoding: "utf-16be", hasBom: true };

  const sample = bytes.subarray(0, 512);
  let oddNul = 0;
  let evenNul = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0x00) {
      if (i % 2 === 0) evenNul++;
      else oddNul++;
    }
  }
  if (oddNul === 0 && evenNul === 0) return { encoding: "utf-8", hasBom: false };

  // Require the NULs to be pervasive on one parity (real UTF-16 ASCII), so a
  // stray NUL in an otherwise-UTF-8 stream classifies as binary instead.
  const threshold = Math.max(1, Math.floor(sample.length / 4));
  if (oddNul >= threshold && evenNul === 0) return { encoding: "utf-16le", hasBom: false };
  if (evenNul >= threshold && oddNul === 0) return { encoding: "utf-16be", hasBom: false };
  return null;
}

/** Classify line endings from the raw (pre-normalization) decoded string. */
export function detectEol(raw: string): { eol: Eol; mixedEol: boolean } {
  let crlf = 0;
  let loneLf = 0;
  let loneCr = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\n") {
      if (i > 0 && raw[i - 1] === "\r") crlf++;
      else loneLf++;
    } else if (ch === "\r" && raw[i + 1] !== "\n") {
      loneCr++;
    }
  }
  // Tie (equal CRLF and lone-LF counts) resolves to CRLF; newline-free text stays LF.
  const eol: Eol = crlf > 0 && crlf >= loneLf ? "crlf" : "lf";
  // Any lone-CR (classic-Mac, out of the LF/CRLF scope) or a CRLF+LF mix is
  // flagged so the save path surfaces it instead of silently normalizing (#44).
  const mixedEol = loneCr > 0 || (crlf > 0 && loneLf > 0);
  return { eol, mixedEol };
}

export function hasFinalNewline(raw: string): boolean {
  return raw.length > 0 && (raw.endsWith("\n") || raw.endsWith("\r"));
}
