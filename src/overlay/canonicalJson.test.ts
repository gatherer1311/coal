import { describe, expect, test } from "vitest";
import { canonicalJson } from "./canonicalJson";

describe("canonicalJson — frozen canonical writer (SPEC 13.13)", () => {
  test("sorts top-level keys ascending, 2-space indent, one key per line", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{\n  "a": 2,\n  "b": 1\n}\n');
  });

  test("sorts keys at every nesting level", () => {
    expect(canonicalJson({ z: { b: 1, a: 2 } })).toBe(
      '{\n  "z": {\n    "a": 2,\n    "b": 1\n  }\n}\n',
    );
  });

  test("puts one array element per line", () => {
    expect(canonicalJson([1, 2, 3])).toBe("[\n  1,\n  2,\n  3\n]\n");
  });

  test("ends with exactly one trailing newline", () => {
    const out = canonicalJson({ a: 1 });
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });

  test("empty object and empty array stay inline", () => {
    expect(canonicalJson({})).toBe("{}\n");
    expect(canonicalJson([])).toBe("[]\n");
  });

  test("sorts by code point, not numerically (a10 before a2)", () => {
    expect(canonicalJson({ a2: 1, a10: 2 })).toBe('{\n  "a10": 2,\n  "a2": 1\n}\n');
  });

  test("serializes integers in shortest round-trip form (no exponent)", () => {
    expect(canonicalJson({ n: 1000000 })).toBe('{\n  "n": 1000000\n}\n');
  });

  test("preserves strings, booleans, and null", () => {
    expect(canonicalJson({ s: "x", t: true, f: false, z: null })).toBe(
      '{\n  "f": false,\n  "s": "x",\n  "t": true,\n  "z": null\n}\n',
    );
  });

  test("re-serializing parsed output is byte-identical (stable round-trip)", () => {
    const value = {
      nodes: { blok_9: { kind: "block" }, blok_1: { kind: "block" }, note_0: { kind: "note" } },
      schemaVersion: 1,
      list: [{ b: 2, a: 1 }],
    };
    const once = canonicalJson(value);
    const twice = canonicalJson(JSON.parse(once));
    expect(twice).toBe(once);
  });

  test("sorts the nodes id-keys (a plain code-point key sort)", () => {
    const out = canonicalJson({ nodes: { blok_z: 1, blok_a: 2, note_0: 3 } });
    const order = [...out.matchAll(/"(blok_z|blok_a|note_0)"/g)].map((m) => m[1]);
    expect(order).toEqual(["blok_a", "blok_z", "note_0"]);
  });
});
