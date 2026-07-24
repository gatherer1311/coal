import { describe, expect, test } from "vitest";
import { matchesWhen, parseWhen } from "./when";
import type { Context } from "./context";

const ctx = (active: Record<string, boolean>): Context => ({
  isActive: (name) => active[name] === true,
});

describe("when grammar (design §5)", () => {
  test("undefined and blank always match", () => {
    expect(matchesWhen(undefined, ctx({}))).toBe(true);
    expect(matchesWhen("  ", ctx({}))).toBe(true);
  });

  test("a bare name reads the context", () => {
    expect(matchesWhen("minibufferOpen", ctx({ minibufferOpen: true }))).toBe(true);
    expect(matchesWhen("minibufferOpen", ctx({}))).toBe(false);
  });

  test("negation, conjunction, disjunction, and parens", () => {
    const c = ctx({ editorFocused: true, minibufferOpen: false });
    expect(matchesWhen("!minibufferOpen", c)).toBe(true);
    expect(matchesWhen("editorFocused && !minibufferOpen", c)).toBe(true);
    expect(matchesWhen("minibufferOpen || editorFocused", c)).toBe(true);
    expect(matchesWhen("(minibufferOpen || editorFocused) && !minibufferOpen", c)).toBe(true);
  });

  test("&& binds tighter than ||", () => {
    // false && true || true  ===  (false && true) || true  === true
    const c = ctx({ b: true, c: true });
    expect(matchesWhen("a && b || c", c)).toBe(true);
  });

  test("a malformed expression throws", () => {
    expect(() => parseWhen("a &&")).toThrow();
    expect(() => parseWhen("(a || b")).toThrow();
    expect(() => parseWhen("a b")).toThrow();
    expect(() => parseWhen("")).toThrow(); // parseWhen requires a term; matchesWhen guards blank
  });
});
