import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  MIN_SIMHASH_TOKENS,
  SIMHASH_BITS,
  hammingDistance,
  simhash64,
  simhashHex,
  wordTokenCount,
} from "./simhash";

describe("constants (SPEC 13.12)", () => {
  test("SIMHASH_BITS is 64 and the mint floor is 12 word tokens", () => {
    expect(SIMHASH_BITS).toBe(64);
    expect(MIN_SIMHASH_TOKENS).toBe(12);
  });
});

describe("wordTokenCount", () => {
  test("counts space-separated word tokens of the canonical string", () => {
    expect(wordTokenCount("the quick brown fox")).toBe(4);
  });

  test("an empty canonical string has zero tokens", () => {
    expect(wordTokenCount("")).toBe(0);
  });
});

describe("simhash64 / simhashHex (SPEC 13.12)", () => {
  test("a single-feature input's simhash equals the low 64 bits of SHA-256(feature)", () => {
    // "hello" tokenizes to one unigram and no bigram, so there is exactly one
    // feature; with one feature the sign-sum makes the simhash == that feature's
    // 64-bit hash. SHA-256("hello") ends in 73043362938b9824.
    const digest = createHash("sha256").update("hello", "utf8").digest("hex");
    expect(simhashHex("hello")).toBe(digest.slice(-16));
    expect(simhashHex("hello")).toBe("73043362938b9824");
  });

  test("simhashHex is 16 lowercase hex chars, zero-padded", () => {
    expect(simhashHex("the quick brown fox jumps over the lazy dog")).toMatch(/^[0-9a-f]{16}$/);
  });

  test("is deterministic for the same canonical string", () => {
    const a = simhash64("alpha beta gamma delta epsilon");
    const b = simhash64("alpha beta gamma delta epsilon");
    expect(a).toBe(b);
  });

  test("identical text has Hamming distance 0", () => {
    const s = simhash64("one two three four five six seven eight nine ten eleven twelve");
    expect(hammingDistance(s, s)).toBe(0);
  });

  test("is locality-sensitive: a one-word change is nearer than an unrelated block", () => {
    const a = "the quick brown fox jumps over the lazy dog near the river bank at dawn";
    const oneWordChanged =
      "the quick brown fox jumps over the lazy cat near the river bank at dawn";
    const unrelated =
      "financial markets fell sharply today amid concerns over rising interest rates worldwide";
    const near = hammingDistance(simhash64(a), simhash64(oneWordChanged));
    const far = hammingDistance(simhash64(a), simhash64(unrelated));
    expect(near).toBeLessThan(far);
    expect(far).toBeGreaterThanOrEqual(12);
  });
});

describe("hammingDistance", () => {
  test("counts differing bits", () => {
    expect(hammingDistance(0n, 0n)).toBe(0);
    expect(hammingDistance(0n, 0xffn)).toBe(8);
    expect(hammingDistance(0b1010n, 0b0110n)).toBe(2);
  });

  test("is symmetric", () => {
    expect(hammingDistance(0x1234n, 0xabcdn)).toBe(hammingDistance(0xabcdn, 0x1234n));
  });
});
