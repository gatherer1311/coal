/**
 * The frozen canonical JSON writer (SPEC 13.13).
 *
 * Re-serializing unchanged data must be byte-identical, or every save churns the
 * whole Overlay (as consequential as the frozen normalizer, 13.11). The frozen rules:
 * UTF-8, LF, a single trailing newline; 2-space indent, one key/element per line
 * (line-oriented diff + 3-way merge); all object keys sorted ascending by code point
 * at every level (including the `nodes` id-keys); shortest round-trip integers.
 *
 * Omitting defaulted fields is the caller's responsibility — this writer serializes
 * exactly the value it is given.
 */

/** Compare two strings by Unicode code point (locale-independent, stable). */
function codePointCompare(a: string, b: string): number {
  const ca = [...a];
  const cb = [...b];
  const n = Math.min(ca.length, cb.length);
  for (let i = 0; i < n; i++) {
    const diff = ca[i]!.codePointAt(0)! - cb[i]!.codePointAt(0)!;
    if (diff !== 0) return diff;
  }
  return ca.length - cb.length;
}

/** Recursively rebuild the value with every object's keys inserted in code-point order. */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort(codePointCompare)) {
      out[key] = sortDeep(source[key]);
    }
    return out;
  }
  return value;
}

/** Serialize a value to the frozen canonical JSON form (SPEC 13.13). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value), null, 2) + "\n";
}
