import { describe, expect, test } from "vitest";
import { SCHEMA_VERSION, type Sidecar, serializeSidecar } from "./sidecar";

const NOTE_ID = "note_0000000000000000000000000a";
const BLOCK_ID = "blok_0000000000000000000000000b";
const LINK_ID = "link_0000000000000000000000000c";

// A realistic sidecar exercising all three record kinds, built with defaulted
// fields already omitted (the caller's responsibility, per SPEC 13.13).
const sidecar: Sidecar = {
  schemaVersion: SCHEMA_VERSION,
  normVersion: "1",
  resolverVersion: "1",
  root: NOTE_ID,
  baseline: { hash: "1a2b3c4d", size: 128 },
  nodes: {
    [NOTE_ID]: { kind: "note", parent: null },
    [BLOCK_ID]: {
      kind: "block",
      kindTag: "paragraph",
      normHash: "0123456789abcdef0123456789abcdef",
      simhash: "73043362938b9824",
      simhashTokens: 14,
      neighbors: { next1: "aabbccddeeff0011" },
    },
    [LINK_ID]: {
      kind: "link",
      parent: NOTE_ID,
      href: "[[Design#Resolution]]",
      kindTag: "paragraph",
      normHash: "fedcba9876543210fedcba9876543210",
      neighbors: {},
      target: { note: NOTE_ID, block: BLOCK_ID },
    },
  },
};

describe("sidecar schema (SPEC 13.13)", () => {
  test("SCHEMA_VERSION is the ratified 1", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  test("serializes to canonical JSON ending in a single trailing newline", () => {
    const out = serializeSidecar(sidecar);
    expect(out.endsWith("}\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });

  test("top-level keys are code-point sorted", () => {
    const out = serializeSidecar(sidecar);
    const keys = [...out.matchAll(/^ {2}"([a-zA-Z]+)":/gm)].map((m) => m[1]);
    expect(keys).toEqual([
      "baseline",
      "nodes",
      "normVersion",
      "resolverVersion",
      "root",
      "schemaVersion",
    ]);
  });

  test("node id-keys are sorted within nodes", () => {
    const out = serializeSidecar(sidecar);
    const ids = [...out.matchAll(/^ {4}"((?:note|blok|link)_[0-9a-z]+)":/gm)].map((m) => m[1]);
    expect(ids).toEqual([...ids].sort());
  });

  test("re-serializing parsed output is byte-identical (frozen writer)", () => {
    const once = serializeSidecar(sidecar);
    const twice = serializeSidecar(JSON.parse(once) as Sidecar);
    expect(twice).toBe(once);
  });
});
