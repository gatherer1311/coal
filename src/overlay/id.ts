import { randomBytes } from "node:crypto";

/**
 * Opaque stable ids for Overlay nodes (SPEC 13.13 / 13.3).
 *
 * Format: `<tag>_<id>` — 31 chars, `^(note|hdng|blok|link)_[0-9a-hjkmnp-tv-z]{26}$`.
 * `id` is 128 bits of CSPRNG randomness in lowercase Crockford base32 (no i/l/o/u),
 * giving path/URL/shell-safe, confusable-free, greppable ids. No wall-clock, counter,
 * or host id: coordination-free uniqueness is the only property concurrent multi-device
 * minting needs, and a clock would only skew and leak creation time. Ids are opaque —
 * code parses only the leading tag; the node's `kind` field is the sole authority.
 */

/** The four node kinds (SPEC 13.3). `heading` mints the reserved `hdng` tag. */
export type NodeKind = "note" | "heading" | "block" | "link";

const TAG: Record<NodeKind, string> = {
  note: "note",
  heading: "hdng",
  block: "blok",
  link: "link",
};

/** Lowercase Crockford base32 alphabet — digits + a-z minus i, l, o, u. */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** The frozen opaque-id pattern (SPEC 13.13). */
export const ID_PATTERN = /^(note|hdng|blok|link)_[0-9a-hjkmnp-tv-z]{26}$/;

/**
 * Encode exactly 16 bytes (128 bits) as 26 lowercase Crockford base32 chars,
 * most-significant-bit first, padding the final char's low 2 bits with zero.
 */
export function encodeCrockford(bytes: Uint8Array): string {
  if (bytes.length !== 16) {
    throw new Error(`encodeCrockford: expected 16 bytes (128 bits), got ${bytes.length}`);
  }
  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);
  value <<= 2n; // 128 -> 130 bits so it divides evenly into 26 groups of 5
  let out = "";
  for (let group = 0; group < 26; group++) {
    const shift = BigInt((25 - group) * 5);
    out += ALPHABET[Number((value >> shift) & 31n)];
  }
  return out;
}

/** Mint a fresh opaque id for a node of the given kind. */
export function mintId(kind: NodeKind): string {
  return `${TAG[kind]}_${encodeCrockford(randomBytes(16))}`;
}
