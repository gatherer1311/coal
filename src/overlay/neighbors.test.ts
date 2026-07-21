import { describe, expect, test } from "vitest";
import { normHash } from "./normalize";
import { buildNeighbors, neighborFingerprint } from "./neighbors";

describe("neighborFingerprint — 64-bit-truncated normHash (SPEC 13.12/13.13)", () => {
  test("is the first 16 hex chars (64 bits) of the block's 128-bit normHash", () => {
    expect(neighborFingerprint("Buy milk", "paragraph")).toBe(
      normHash("Buy milk", "paragraph").slice(0, 16),
    );
  });

  test("is 16 lowercase hex chars", () => {
    expect(neighborFingerprint("some sibling block", "paragraph")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("buildNeighbors — {prev2,prev1,next1,next2}, K = 4 (SPEC 13.12/13.13)", () => {
  const fps = ["fp0", "fp1", "fp2", "fp3", "fp4"];

  test("a middle block records all four same-level siblings", () => {
    expect(buildNeighbors(fps, 2)).toEqual({
      prev2: "fp0",
      prev1: "fp1",
      next1: "fp3",
      next2: "fp4",
    });
  });

  test("the first block omits both preceding neighbors", () => {
    expect(buildNeighbors(fps, 0)).toEqual({ next1: "fp1", next2: "fp2" });
  });

  test("the second block has one preceding neighbor", () => {
    expect(buildNeighbors(fps, 1)).toEqual({ prev1: "fp0", next1: "fp2", next2: "fp3" });
  });

  test("the last block omits both following neighbors", () => {
    expect(buildNeighbors(fps, 4)).toEqual({ prev2: "fp2", prev1: "fp3" });
  });

  test("a lone block has no neighbors", () => {
    expect(buildNeighbors(["only"], 0)).toEqual({});
  });
});
