import { describe, expect, test } from "vitest";
import { ID_PATTERN, encodeCrockford, mintId } from "./id";

describe("encodeCrockford — 128 bits -> 26 lowercase Crockford base32 chars (SPEC 13.13)", () => {
  test("all-zero bytes encode to 26 zeros", () => {
    expect(encodeCrockford(new Uint8Array(16))).toBe("0".repeat(26));
  });

  test("all-ones bytes encode MSB-first with 2-bit low padding on the last char", () => {
    // 128 ones, padded to 130 bits: 25 groups of 11111 (=z) + a final 11100 (=w).
    expect(encodeCrockford(new Uint8Array(16).fill(0xff))).toBe("z".repeat(25) + "w");
  });

  test("output is always 26 chars from the Crockford alphabet (no i/l/o/u)", () => {
    const out = encodeCrockford(Uint8Array.from({ length: 16 }, (_, i) => i * 17));
    expect(out).toHaveLength(26);
    expect(out).toMatch(/^[0-9a-hjkmnp-tv-z]{26}$/);
  });

  test("rejects inputs that are not exactly 16 bytes", () => {
    expect(() => encodeCrockford(new Uint8Array(15))).toThrow();
    expect(() => encodeCrockford(new Uint8Array(17))).toThrow();
  });
});

describe("mintId — opaque stable ids (SPEC 13.13)", () => {
  test("each kind maps to its fixed 4-char tag", () => {
    expect(mintId("note")).toMatch(/^note_/);
    expect(mintId("heading")).toMatch(/^hdng_/);
    expect(mintId("block")).toMatch(/^blok_/);
    expect(mintId("link")).toMatch(/^link_/);
  });

  test("ids are 31 chars and match the frozen pattern", () => {
    const id = mintId("note");
    expect(id).toHaveLength(31);
    expect(id).toMatch(ID_PATTERN);
    expect(ID_PATTERN.test(id)).toBe(true);
  });

  test("the random part never uses i, l, o, or u", () => {
    for (let i = 0; i < 200; i++) {
      const random = mintId("block").slice(5);
      expect(random).not.toMatch(/[ilou]/);
    }
  });

  test("minting is coordination-free unique (no collisions across many mints)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5000; i++) ids.add(mintId("link"));
    expect(ids.size).toBe(5000);
  });
});
