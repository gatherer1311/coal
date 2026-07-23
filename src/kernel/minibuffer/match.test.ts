import { describe, expect, test } from "vitest";
import { fuzzyMatch } from "./match";

describe("fuzzyMatch (design §6 subsequence + scoring)", () => {
  test("matches a subsequence and reports matched positions", () => {
    const m = fuzzyMatch("sq", "Save Quit");
    expect(m).not.toBeNull();
    expect(m!.positions).toEqual([0, 5]); // S@0, Q@5
  });

  test("returns null when the query is not a subsequence", () => {
    expect(fuzzyMatch("zx", "Save")).toBeNull();
  });

  test("empty query matches everything at score 0", () => {
    expect(fuzzyMatch("", "Anything")).toEqual({ score: 0, positions: [] });
  });

  test("a contiguous run outscores a scattered match", () => {
    const contiguous = fuzzyMatch("sav", "Save")!;
    const scattered = fuzzyMatch("sve", "Save")!; // s@0, v@2, e@3 — a gap after s
    expect(contiguous.score).toBeGreaterThan(scattered.score);
  });

  test("an exact-case match outscores a case-insensitive one", () => {
    expect(fuzzyMatch("Sa", "Save")!.score).toBeGreaterThan(fuzzyMatch("sa", "Save")!.score);
  });

  test("a word-boundary match outscores a mid-word match of equal length", () => {
    const boundary = fuzzyMatch("q", "Save Quit")!; // Q after a space
    const midword = fuzzyMatch("u", "Save Quit")!; // u mid-word
    expect(boundary.score).toBeGreaterThan(midword.score);
  });
});
