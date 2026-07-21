import { describe, expect, test } from "vitest";
import { type Sidecar, serializeSidecar } from "./sidecar";

/**
 * Conformance vector for schemaVersion 1 (SPEC 13.13). Locks the exact frozen
 * bytes the canonical writer must produce for a representative sidecar, so any
 * unintended change to the writer or schema shape is caught as a deliberate,
 * schemaVersion-gated migration rather than silent churn.
 */

const NOTE_ID = "note_0000000000000000000000000a";
const BLOCK_ID = "blok_0000000000000000000000000b";

const VECTOR: Sidecar = {
  schemaVersion: 1,
  normVersion: "1",
  resolverVersion: "1",
  root: NOTE_ID,
  baseline: { hash: "1a2b3c4d5e6f7a8b", size: 256 },
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
  },
};

const EXPECTED = `{
  "baseline": {
    "hash": "1a2b3c4d5e6f7a8b",
    "size": 256
  },
  "nodes": {
    "blok_0000000000000000000000000b": {
      "kind": "block",
      "kindTag": "paragraph",
      "neighbors": {
        "next1": "aabbccddeeff0011"
      },
      "normHash": "0123456789abcdef0123456789abcdef",
      "simhash": "73043362938b9824",
      "simhashTokens": 14
    },
    "note_0000000000000000000000000a": {
      "kind": "note",
      "parent": null
    }
  },
  "normVersion": "1",
  "resolverVersion": "1",
  "root": "note_0000000000000000000000000a",
  "schemaVersion": 1
}
`;

describe("schemaVersion 1 conformance vector (SPEC 13.13)", () => {
  test("serializes to the exact frozen bytes", () => {
    expect(serializeSidecar(VECTOR)).toBe(EXPECTED);
  });
});
