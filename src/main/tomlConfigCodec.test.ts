import { describe, expect, test } from "vitest";
import { applyEdit, parse } from "./tomlConfigCodec";

describe("tomlConfigCodec (design §7 comment-preserving round-trip)", () => {
  test("parse turns TOML text into a plain object", () => {
    expect(parse('# a comment\nkeymap = "emacs"\n')).toEqual({ keymap: "emacs" });
  });

  test("applyEdit changes only the target value, preserving comments and foreign keys", () => {
    const original = '# Coal settings\nkeymap = "emacs"\nfoo = 1\n';
    const raw = parse(original);
    const edited = applyEdit(original, { ...raw, keymap: "vim" });
    expect(parse(edited)).toEqual({ keymap: "vim", foo: 1 });
    expect(edited).toContain("# Coal settings");
    expect(edited).toContain("foo = 1");
    expect(edited).toContain('keymap = "vim"');
  });

  test("parse throws on malformed TOML", () => {
    expect(() => parse("not = = valid ][")).toThrow();
  });
});
