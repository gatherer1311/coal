import { describe, expect, test } from "vitest";
import { appendEntry, formatBindingEntry } from "./keybindingsToml";
import { parse } from "./tomlConfigCodec";

describe("keybindingsToml (design §7 append-only writer)", () => {
  test("formatBindingEntry emits a [[keybinding]] block", () => {
    expect(formatBindingEntry({ keys: "Ctrl-c s", command: "core.file.save" })).toBe(
      '[[keybinding]]\nkeys = "Ctrl-c s"\ncommand = "core.file.save"\n',
    );
  });

  test("an unbind block sets unbind = true and no command", () => {
    expect(formatBindingEntry({ keys: "Ctrl-x Ctrl-c", unbind: true })).toBe(
      '[[keybinding]]\nkeys = "Ctrl-x Ctrl-c"\nunbind = true\n',
    );
  });

  test("a when scope is emitted", () => {
    expect(
      formatBindingEntry({
        keys: "Ctrl-n",
        command: "core.minibuffer.next",
        when: "minibufferOpen",
      }),
    ).toBe(
      '[[keybinding]]\nkeys = "Ctrl-n"\ncommand = "core.minibuffer.next"\nwhen = "minibufferOpen"\n',
    );
  });

  test("appendEntry separates blocks with a blank line and round-trips through parse", () => {
    const base = "# my keys\n";
    const once = appendEntry(base, { keys: "Ctrl-c s", command: "core.file.save" });
    const twice = appendEntry(once, { keys: "Ctrl-c o", command: "core.file.open" });
    expect(twice).toContain("# my keys");
    expect(parse(twice)).toEqual({
      keybinding: [
        { keys: "Ctrl-c s", command: "core.file.save" },
        { keys: "Ctrl-c o", command: "core.file.open" },
      ],
    });
  });
});
