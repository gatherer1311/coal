// src/kernel/command/keys.ts

/** The modifiers, in canonical emission order (design §4.1). */
const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Meta"] as const;
export type Modifier = (typeof MODIFIER_ORDER)[number];

/**
 * Assemble a canonical chord: held modifiers in fixed Ctrl-Alt-Shift-Meta order,
 * then the base-key token, joined by "-" (design §4.1). The base token is
 * caller-supplied (the renderer derives it from KeyboardEvent.code/.key); this
 * only orders and joins, so it is pure and layout-agnostic.
 */
export function canonicalChord(mods: Iterable<Modifier>, base: string): string {
  const held = new Set(mods);
  const parts = MODIFIER_ORDER.filter((m) => held.has(m));
  return [...parts, base].join("-");
}

/** Split a canonical sequence into its chords; "" is the empty sequence. */
export function splitSequence(sequence: string): string[] {
  return sequence.length === 0 ? [] : sequence.split(" ");
}

/** Join chords into a canonical space-separated sequence. */
export function joinSequence(chords: readonly string[]): string {
  return chords.join(" ");
}

/**
 * True when `candidate` equals `prefix` or extends it on a chord boundary
 * (design §4.2/§4.3): "Ctrl-x Ctrl-s" starts with "Ctrl-x", but "Ctrl-x2" does
 * not. The empty prefix starts everything.
 */
export function sequenceStartsWith(candidate: string, prefix: string): boolean {
  if (prefix.length === 0) return true;
  if (candidate === prefix) return true;
  return candidate.startsWith(prefix + " ");
}
