import { describe, expect, test } from "vitest";
import { chordFromEvent } from "./keyInput";

const ev = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent("keydown", init);

describe("chordFromEvent (design §4.1)", () => {
  test("a letter uses .code, lowercased, layout-independent", () => {
    expect(chordFromEvent(ev({ code: "KeyS", key: "s", ctrlKey: true }))).toBe("Ctrl-s");
  });
  test("Shift is an explicit modifier, not folded into the character", () => {
    expect(chordFromEvent(ev({ code: "KeyP", key: "P", ctrlKey: true, shiftKey: true }))).toBe(
      "Ctrl-Shift-p",
    );
  });
  test("named keys use .key", () => {
    expect(chordFromEvent(ev({ code: "Enter", key: "Enter" }))).toBe("Enter");
    expect(chordFromEvent(ev({ code: "ArrowDown", key: "ArrowDown" }))).toBe("ArrowDown");
  });
  test("a digit uses .code", () => {
    expect(chordFromEvent(ev({ code: "Digit1", key: "1", altKey: true }))).toBe("Alt-1");
  });
  test("a lone modifier press yields null", () => {
    expect(chordFromEvent(ev({ code: "ControlLeft", key: "Control", ctrlKey: true }))).toBeNull();
  });
});
