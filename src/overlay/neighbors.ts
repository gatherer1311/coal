import { normHash } from "./normalize";
import type { KindTag } from "./normalize";

/**
 * Neighbor fingerprints (SPEC 13.12 / 13.13).
 *
 * Positional corroboration for the ambiguous band: an anchor stores up to K = 4
 * fingerprints — the 64-bit-truncated normHash of its 2 preceding and 2 following
 * same-level sibling blocks. They corroborate a match; they are never the silent
 * key (that is the 128-bit normHash), so 64 bits is enough.
 */

/** The up-to-4 same-level sibling fingerprints of a block. */
export interface Neighbors {
  prev2?: string;
  prev1?: string;
  next1?: string;
  next2?: string;
}

/** A neighbor fingerprint: the first 64 bits (16 hex) of a sibling's 128-bit normHash. */
export function neighborFingerprint(raw: string, kind: KindTag): string {
  return normHash(raw, kind).slice(0, 16);
}

/**
 * Build a block's neighbor set from the ordered fingerprints of its same-level
 * siblings and its own index among them. Missing neighbors (edge blocks) are omitted.
 */
export function buildNeighbors(siblingFingerprints: string[], index: number): Neighbors {
  const prev2 = siblingFingerprints[index - 2];
  const prev1 = siblingFingerprints[index - 1];
  const next1 = siblingFingerprints[index + 1];
  const next2 = siblingFingerprints[index + 2];
  return {
    ...(prev2 !== undefined ? { prev2 } : {}),
    ...(prev1 !== undefined ? { prev1 } : {}),
    ...(next1 !== undefined ? { next1 } : {}),
    ...(next2 !== undefined ? { next2 } : {}),
  };
}
