import { describe, expect, test } from "vitest";
import * as overlay from "./index";

describe("overlay barrel — public surface", () => {
  test("re-exports the identity / Overlay primitives", () => {
    for (const name of [
      "normalize",
      "normHash",
      "canonicalize",
      "extractPayload",
      "mintId",
      "encodeCrockford",
      "canonicalJson",
      "simhash64",
      "simhashHex",
      "hammingDistance",
      "wordTokenCount",
      "scoreCandidate",
      "resolvePath1",
      "resolvePath2",
    ] as const) {
      expect(typeof overlay[name]).toBe("function");
    }
  });

  test("re-exports the frozen version stamps", () => {
    expect(overlay.NORM_VERSION).toBe("1");
    expect(overlay.RESOLVER_VERSION).toBe("1");
    expect(overlay.SIMHASH_BITS).toBe(64);
  });
});
