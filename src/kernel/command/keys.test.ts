import { describe, expect, test } from "vitest";
import { canonicalChord, joinSequence, sequenceStartsWith, splitSequence } from "./keys";

describe("canonicalChord (design §4.1)", () => {
  test("orders modifiers Ctrl-Alt-Shift-Meta regardless of input order", () => {
    expect(canonicalChord(["Shift", "Ctrl"], "p")).toBe("Ctrl-Shift-p");
    expect(canonicalChord(["Meta", "Alt", "Ctrl"], "x")).toBe("Ctrl-Alt-Meta-x");
  });
  test("a bare base has no modifiers", () => {
    expect(canonicalChord([], "Enter")).toBe("Enter");
  });
  test("duplicate modifiers collapse", () => {
    expect(canonicalChord(["Ctrl", "Ctrl"], "s")).toBe("Ctrl-s");
  });
});

describe("sequences (design §4.2/§4.3)", () => {
  test("split and join round-trip; empty string is the empty sequence", () => {
    expect(splitSequence("Ctrl-x Ctrl-s")).toEqual(["Ctrl-x", "Ctrl-s"]);
    expect(splitSequence("")).toEqual([]);
    expect(joinSequence(["Ctrl-x", "Ctrl-s"])).toBe("Ctrl-x Ctrl-s");
  });
  test("sequenceStartsWith matches on chord boundaries only", () => {
    expect(sequenceStartsWith("Ctrl-x Ctrl-s", "Ctrl-x")).toBe(true);
    expect(sequenceStartsWith("Ctrl-x Ctrl-s", "Ctrl-x Ctrl-s")).toBe(true);
    expect(sequenceStartsWith("Ctrl-x Ctrl-s", "")).toBe(true);
    expect(sequenceStartsWith("Ctrl-x2", "Ctrl-x")).toBe(false); // not a chord boundary
    expect(sequenceStartsWith("Ctrl-x", "Ctrl-x Ctrl-s")).toBe(false); // shorter than prefix
  });
});
