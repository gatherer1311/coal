import { createHash } from "node:crypto";

/**
 * The frozen normalizer (SPEC 13.11).
 *
 * A single, byte-identical text-normalization function shared by the minter
 * (records a block's fingerprint at link-creation) and the matcher (re-anchors).
 * It is an *identity key*, not the durability mechanism (that is the diff-ratchet,
 * 13.6), so it is deliberately conservative: it absorbs only rendering-invisible
 * noise and preserves everything visible. It is lexical and parser-free.
 */

/**
 * Version stamp for the frozen normalizer. "Frozen" means frozen *within a
 * version*; any change to a rule below is a deliberate, re-hashing migration
 * (SPEC 13.11 / 13.13), never a silent shift.
 */
export const NORM_VERSION = "1";

/**
 * Block kinds whose structural markers Stage A strips (SPEC 13.11).
 *
 * The set follows SPEC 13.13 (`paragraph | list-item | blockquote | code-fence |
 * table`); `table` extraction defaults to the as-is payload pending a dedicated
 * rule (13.13). NOTE — flagged for design reconciliation: SPEC 13.3 names the set
 * `paragraph | list-item | table | code` (omitting blockquote, and "code" vs
 * "code-fence"); the 13.3 naming should be aligned to 13.13.
 */
export type KindTag = "paragraph" | "list-item" | "blockquote" | "code-fence" | "table";

/** A leading list marker: `- `, `* `, `+ `, `1. `, `1) ` (with optional indent). */
const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/;

/** A code-fence delimiter line: ``` or ~~~ (optionally indented, optional info string). */
const FENCE = /^\s*(?:```|~~~)/;

function isFence(line: string): boolean {
  return FENCE.test(line);
}

/** Stage A — kind-aware payload extraction: strip non-content structural markers. */
export function extractPayload(raw: string, kind: KindTag): string {
  switch (kind) {
    case "paragraph":
    case "table": // as-is payload pending a dedicated rule (SPEC 13.13)
      return raw;
    case "list-item":
      return raw.replace(LIST_MARKER, "");
    case "blockquote":
      return raw
        .split("\n")
        .map((line) => line.replace(/^>\s?/, ""))
        .join("\n");
    case "code-fence": {
      const lines = raw.split("\n");
      if (lines.length >= 2 && isFence(lines[0]!) && isFence(lines[lines.length - 1]!)) {
        return lines.slice(1, -1).join("\n");
      }
      return raw;
    }
  }
}

/**
 * Stage B — frozen canonicalization (SPEC 13.11), applied in order:
 *   1. NFC (never NFKC — no ligature/compatibility folding)
 *   2. CRLF / CR line endings -> LF
 *   3. fixed typographic fold table (curly quotes, en/em dash, ellipsis, Unicode spaces)
 *   4. collapse every interior whitespace run -> a single U+0020, and trim the ends
 *   5. locale-invariant case-fold (lowercase)
 * Inline markup is preserved throughout (not stripped).
 */
export function canonicalize(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\p{Zs}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The frozen normalizer: Stage A payload extraction, then Stage B canonicalization. */
export function normalize(raw: string, kind: KindTag): string {
  return canonicalize(extractPayload(raw, kind));
}

/**
 * normHash — SHA-256 over the canonical string's UTF-8, stored truncated to
 * 128 bits (32 hex chars), per SPEC 13.13 (`normHash`-128).
 */
export function normHash(raw: string, kind: KindTag): string {
  return createHash("sha256").update(normalize(raw, kind), "utf8").digest("hex").slice(0, 32);
}
