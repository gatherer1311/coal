import { describe, expect, test } from "vitest";
import {
  DANGLING_FLOOR,
  MARGIN,
  RESOLVER_VERSION,
  type Candidate,
  type ContentMatch,
  composite,
  contentClass,
  resolvePath1,
  resolvePath2,
  sContent,
  sNeighbor,
  sPosition,
  scoreCandidate,
} from "./resolve";

const exact: ContentMatch = { normHashExact: true, simhashDistance: null };
const d = (distance: number): ContentMatch => ({ normHashExact: false, simhashDistance: distance });
const absent: ContentMatch = { normHashExact: false, simhashDistance: null };

describe("constants (SPEC 13.12)", () => {
  test("margin, dangling floor, and resolverVersion are stamped", () => {
    expect(MARGIN).toBe(0.15);
    expect(DANGLING_FLOOR).toBe(0.45);
    expect(RESOLVER_VERSION).toBe("1");
  });
});

describe("sPosition — {near, moderate, far} -> {1.0, 0.5, 0.1}", () => {
  test("maps each tier", () => {
    expect(sPosition("near")).toBe(1.0);
    expect(sPosition("moderate")).toBe(0.5);
    expect(sPosition("far")).toBe(0.1);
  });
});

describe("sNeighbor — nAgree / K_present", () => {
  test("no present neighbors gives 0 (never a 0.5 fudge)", () => {
    expect(sNeighbor(0, 0)).toBe(0);
  });
  test("ratio of agreeing neighbors", () => {
    expect(sNeighbor(2, 4)).toBe(0.5);
    expect(sNeighbor(3, 3)).toBe(1);
    expect(sNeighbor(1, 4)).toBe(0.25);
  });
});

describe("contentClass", () => {
  test("classifies by normHash exactness then simhash distance", () => {
    expect(contentClass(exact)).toBe("EXACT");
    expect(contentClass(d(3))).toBe("NEAR");
    expect(contentClass(d(4))).toBe("EDITED");
    expect(contentClass(d(12))).toBe("EDITED");
    expect(contentClass(d(13))).toBe("DRIFTED");
    expect(contentClass(d(20))).toBe("DRIFTED");
    expect(contentClass(d(21))).toBe("FOREIGN");
    expect(contentClass(absent)).toBe("ABSENT");
  });
});

describe("sContent — the frozen content curve (SPEC 13.12)", () => {
  test("EXACT is 1.00; NEAR is 0.90", () => {
    expect(sContent(exact)).toBe(1.0);
    expect(sContent(d(3))).toBeCloseTo(0.9, 10);
  });
  test("EDITED band 0.85..0.45 for d in 4..12", () => {
    expect(sContent(d(4))).toBeCloseTo(0.85, 10);
    expect(sContent(d(8))).toBeCloseTo(0.65, 10);
    expect(sContent(d(12))).toBeCloseTo(0.45, 10);
  });
  test("DRIFTED band 0.40..0.05 for d in 13..20", () => {
    expect(sContent(d(13))).toBeCloseTo(0.4, 10);
    expect(sContent(d(20))).toBeCloseTo(0.05, 10);
  });
  test("FOREIGN (d >= 21) is 0.00", () => {
    expect(sContent(d(21))).toBe(0);
    expect(sContent(d(64))).toBe(0);
  });
  test("simhash absent with differing normHash is 0.50", () => {
    expect(sContent(absent)).toBe(0.5);
  });
});

describe("composite — 0.60 content + 0.25 neighbor + 0.15 position", () => {
  test("weights each component", () => {
    expect(composite(1, 0, 0)).toBeCloseTo(0.6, 10);
    expect(composite(0, 1, 0)).toBeCloseTo(0.25, 10);
    expect(composite(0, 0, 1)).toBeCloseTo(0.15, 10);
    expect(composite(1, 1, 1)).toBeCloseTo(1.0, 10);
  });
});

describe("resolvePath1 — diff-clean location (SPEC 13.12)", () => {
  test("normHash-exact resolves silently", () => {
    expect(resolvePath1(exact)).toBe("resolved");
  });
  test("simhash d <= 12 resolves silently (content tolerance up to EDITED)", () => {
    expect(resolvePath1(d(0))).toBe("resolved");
    expect(resolvePath1(d(12))).toBe("resolved");
  });
  test("d >= 13 confirms (rewritten past recognition)", () => {
    expect(resolvePath1(d(13))).toBe("confirm");
  });
  test("simhash absent with differing normHash confirms", () => {
    expect(resolvePath1(absent)).toBe("confirm");
  });
});

describe("resolvePath2 — inferred location, the hard AND-gate (SPEC 13.12)", () => {
  const cand = (
    content: ContentMatch,
    position: Candidate["position"],
    nAgree = 0,
    kPresent = 0,
  ): Candidate => ({ content, position, nAgree, kPresent });

  test("empty candidate set is dangling", () => {
    expect(resolvePath2([]).status).toBe("dangling");
  });

  test("EXACT + near + a wide margin resolves silently", () => {
    const result = resolvePath2([cand(exact, "near", 2, 2), cand(d(25), "far")]);
    expect(result.status).toBe("resolved");
  });

  test("G3 margin failure (two near-identical candidates) confirms, never resolves", () => {
    const result = resolvePath2([cand(exact, "near", 2, 2), cand(exact, "near", 2, 2)]);
    expect(result.status).toBe("ambiguous");
  });

  test("G2 failure (content matches but no positional/neighbor support) confirms", () => {
    // Single NEAR candidate, far position, no neighbors: passes G1, fails G2.
    const result = resolvePath2([cand(d(3), "far", 0, 0)]);
    expect(result.status).toBe("ambiguous");
  });

  test("content gone (FOREIGN, no support) is dangling", () => {
    const result = resolvePath2([cand(d(30), "far", 0, 0)]);
    expect(result.status).toBe("dangling");
  });

  test("load-bearing invariant: a G1-passing candidate can never dangle (C1 >= 0.54)", () => {
    // Worst case for a NEAR match: far position, zero neighbors.
    const result = resolvePath2([cand(d(3), "far", 0, 0)]);
    expect(result.best?.C ?? 0).toBeGreaterThan(DANGLING_FLOOR);
    expect(result.status).not.toBe("dangling");
  });

  test("neighbor corroboration (>= 0.5) can satisfy G2 without a near position", () => {
    const result = resolvePath2([cand(exact, "moderate", 2, 2), cand(d(25), "far")]);
    expect(result.status).toBe("resolved");
  });

  test("a version-mismatch style absent-content candidate cannot silent-resolve", () => {
    // ABSENT content fails G1 -> confirm or dangle, never resolved.
    const strong = resolvePath2([cand(absent, "near", 2, 2), cand(d(30), "far")]);
    expect(strong.status).not.toBe("resolved");
  });
});

describe("scoreCandidate", () => {
  test("exposes the components, the composite, and the G1 flag", () => {
    const scored = scoreCandidate({
      content: exact,
      position: "near",
      nAgree: 2,
      kPresent: 4,
    });
    expect(scored.sContent).toBe(1.0);
    expect(scored.sNeighbor).toBe(0.5);
    expect(scored.sPosition).toBe(1.0);
    expect(scored.C).toBeCloseTo(0.6 + 0.125 + 0.15, 10);
    expect(scored.passesG1).toBe(true);
    expect(scored.contentClass).toBe("EXACT");
  });
});
