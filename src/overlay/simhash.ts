import { createHash } from "node:crypto";

/**
 * 64-bit simhash over the frozen canonical string (SPEC 13.12).
 *
 * Features = word unigrams + adjacent bigrams (tokenized on U+0020). Each feature
 * is hashed with the low 64 bits of SHA-256(feature) and sign-summed per bit
 * (standard simhash). It is a durability *fingerprint* used only for the
 * fuzzy/ambiguous band, minted at a block's lazy registration only for blocks with
 * >= 12 word tokens (fewer make a 64-bit simhash noise). The unrelated-pair
 * distance is ~32 (a coin-flip per bit), so signal must vanish well before that.
 *
 * NOTE — flagged for design ratification: SPEC 13.12 says "the low 64 bits of
 * SHA-256(feature)" without pinning byte order. This reads the last 8 bytes of the
 * digest as a big-endian uint64 (the natural "low 64 bits" of the 256-bit value).
 * If the intended convention differs, this is the frozen detail to confirm.
 */

export const SIMHASH_BITS = 64;

/** Blocks with fewer word tokens than this are not minted a simhash (SPEC 13.12). */
export const MIN_SIMHASH_TOKENS = 12;

const MASK64 = (1n << 64n) - 1n;

/** Space-separated word tokens of a canonical string. */
export function wordTokens(canonical: string): string[] {
  if (canonical.length === 0) return [];
  return canonical.split(" ").filter((t) => t.length > 0);
}

/** Number of word tokens (drives the >= 12 mint gate). */
export function wordTokenCount(canonical: string): number {
  return wordTokens(canonical).length;
}

/** Features = word unigrams + adjacent bigrams. */
function features(canonical: string): string[] {
  const tokens = wordTokens(canonical);
  const out: string[] = [...tokens];
  for (let i = 0; i + 1 < tokens.length; i++) {
    out.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return out;
}

/** Low 64 bits (last 8 bytes, big-endian) of SHA-256(feature). */
function featureHash(feature: string): bigint {
  const digest = createHash("sha256").update(feature, "utf8").digest();
  let h = 0n;
  for (let i = digest.length - 8; i < digest.length; i++) {
    h = (h << 8n) | BigInt(digest[i]!);
  }
  return h;
}

/** Compute the 64-bit simhash of a canonical string. */
export function simhash64(canonical: string): bigint {
  const sums = new Array<number>(SIMHASH_BITS).fill(0);
  for (const feature of features(canonical)) {
    const h = featureHash(feature);
    for (let b = 0; b < SIMHASH_BITS; b++) {
      sums[b]! += ((h >> BigInt(b)) & 1n) === 1n ? 1 : -1;
    }
  }
  let result = 0n;
  for (let b = 0; b < SIMHASH_BITS; b++) {
    if (sums[b]! > 0) result |= 1n << BigInt(b);
  }
  return result & MASK64;
}

/** The 64-bit simhash as 16 lowercase hex chars (zero-padded), per SPEC 13.13. */
export function simhashHex(canonical: string): string {
  return simhash64(canonical).toString(16).padStart(16, "0");
}

/** Hamming distance between two 64-bit simhashes (popcount of the XOR). */
export function hammingDistance(a: bigint, b: bigint): number {
  let x = (a ^ b) & MASK64;
  let count = 0;
  while (x !== 0n) {
    x &= x - 1n;
    count++;
  }
  return count;
}
