import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  ID_PATTERN,
  canonicalJson,
  canonicalize,
  encodeCrockford,
  hammingDistance,
  mintId,
  normHash,
  simhash64,
  simhashHex,
} from "./index";

const cp = (n: number): string => String.fromCodePoint(n);
const kind = fc.constantFrom("paragraph", "list-item", "blockquote", "code-fence", "table");

/** Characters that Stage B must fold away entirely. */
const FOLDED_AWAY = [0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2026].map(cp);

/** A controlled pool including the folds, a decomposed sequence, and a ligature. */
const messyString = fc
  .array(
    fc.constantFrom(
      "a",
      "B",
      "c",
      "Z",
      "1",
      "7",
      " ",
      "\t",
      "\n",
      "*",
      "#",
      "e",
      cp(0x2018),
      cp(0x2019),
      cp(0x201c),
      cp(0x201d),
      cp(0x2013),
      cp(0x2014),
      cp(0x2026),
      cp(0x00a0),
      cp(0x2003),
      cp(0x0301),
      cp(0xfb01),
    ),
    { maxLength: 40 },
  )
  .map((chars) => chars.join(""));

describe("normalizer properties (SPEC 13.11)", () => {
  test("canonicalize output is lowercase, trimmed, and single-spaced (any Unicode input)", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const c = canonicalize(s);
        expect(c).toBe(c.toLowerCase());
        expect(c).toBe(c.trim());
        expect(/ {2}/.test(c)).toBe(false);
        expect(/[\t\n\r]/.test(c)).toBe(false);
      }),
    );
  });

  test("canonicalize folds away curly quotes, dashes, ellipsis, and non-space Unicode spaces", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const c = canonicalize(s);
        for (const ch of FOLDED_AWAY) expect(c.includes(ch)).toBe(false);
        expect([...c].some((ch) => ch !== " " && /\p{Zs}/u.test(ch))).toBe(false);
      }),
    );
  });

  test("canonicalize is idempotent over the controlled character pool", () => {
    fc.assert(
      fc.property(messyString, (s) => {
        const once = canonicalize(s);
        expect(canonicalize(once)).toBe(once);
      }),
    );
  });

  test("normHash is always 32 lowercase hex chars", () => {
    fc.assert(
      fc.property(fc.string(), kind, (s, k) => {
        expect(normHash(s, k)).toMatch(/^[0-9a-f]{32}$/);
      }),
    );
  });
});

describe("id properties (SPEC 13.13)", () => {
  test("encodeCrockford maps any 16 bytes to 26 valid Crockford chars", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 16, maxLength: 16 }), (bytes) => {
        expect(encodeCrockford(bytes)).toMatch(/^[0-9a-hjkmnp-tv-z]{26}$/);
      }),
    );
  });

  test("mintId always matches the frozen id pattern", () => {
    fc.assert(
      fc.property(fc.constantFrom("note", "heading", "block", "link"), (k) => {
        expect(mintId(k)).toMatch(ID_PATTERN);
      }),
    );
  });
});

describe("canonicalJson properties (SPEC 13.13)", () => {
  test("re-serializing parsed output is byte-identical, and output ends in one newline", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const once = canonicalJson(value);
        expect(once.endsWith("\n")).toBe(true);
        expect(canonicalJson(JSON.parse(once))).toBe(once);
      }),
    );
  });
});

describe("simhash properties (SPEC 13.12)", () => {
  test("simhashHex is 16 hex chars and simhash64 is deterministic", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(simhashHex(s)).toMatch(/^[0-9a-f]{16}$/);
        expect(simhash64(s)).toBe(simhash64(s));
      }),
    );
  });

  test("hammingDistance is symmetric and within [0, 64]", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const ha = simhash64(a);
        const hb = simhash64(b);
        const d = hammingDistance(ha, hb);
        expect(d).toBe(hammingDistance(hb, ha));
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(64);
      }),
    );
  });
});
