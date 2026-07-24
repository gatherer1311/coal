import { describe, expect, test } from "vitest";
import { validateKeybindings } from "./validate";

describe("validateKeybindings (design §7 structural, non-destructive)", () => {
  test("an absent keybinding table yields no entries, no diagnostics", () => {
    expect(validateKeybindings({})).toEqual({ entries: [], diagnostics: [] });
  });

  test("a well-formed bind entry parses", () => {
    expect(
      validateKeybindings({ keybinding: [{ keys: "Ctrl-c s", command: "core.file.save" }] }),
    ).toEqual({
      entries: [{ keys: "Ctrl-c s", command: "core.file.save" }],
      diagnostics: [],
    });
  });

  test("a when-scoped entry keeps its when; an unbind entry parses", () => {
    const { entries } = validateKeybindings({
      keybinding: [
        { keys: "Ctrl-n", command: "core.minibuffer.next", when: "minibufferOpen" },
        { keys: "Ctrl-x Ctrl-c", unbind: true },
      ],
    });
    expect(entries).toEqual([
      { keys: "Ctrl-n", command: "core.minibuffer.next", when: "minibufferOpen" },
      { keys: "Ctrl-x Ctrl-c", unbind: true },
    ]);
  });

  test("a missing command (and not an unbind) is diagnosed and the entry dropped", () => {
    const { entries, diagnostics } = validateKeybindings({ keybinding: [{ keys: "Ctrl-z" }] });
    expect(entries).toEqual([]);
    expect(diagnostics[0]).toMatchObject({ key: "keybinding[0].command", kind: "invalid-type" });
  });

  test("a missing keys field is diagnosed and the entry dropped", () => {
    const { entries, diagnostics } = validateKeybindings({
      keybinding: [{ command: "core.file.save" }],
    });
    expect(entries).toEqual([]);
    expect(diagnostics[0]).toMatchObject({ key: "keybinding[0].keys", kind: "invalid-type" });
  });

  test("an unknown field is diagnosed but the entry kept", () => {
    const { entries, diagnostics } = validateKeybindings({
      keybinding: [{ keys: "Ctrl-c s", command: "core.file.save", colour: "red" }],
    });
    expect(entries).toEqual([{ keys: "Ctrl-c s", command: "core.file.save" }]);
    expect(diagnostics[0]).toMatchObject({ key: "keybinding[0].colour", kind: "unknown-key" });
  });

  test("a non-array keybinding value is diagnosed", () => {
    const { entries, diagnostics } = validateKeybindings({ keybinding: "nope" });
    expect(entries).toEqual([]);
    expect(diagnostics[0]).toMatchObject({ key: "keybinding", kind: "invalid-type" });
  });
});
