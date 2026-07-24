import { describe, expect, test } from "vitest";
import { applyEdit, parse } from "./tomlConfigCodec";

describe("tomlConfigCodec (design §7 comment-preserving round-trip)", () => {
  test("parse turns TOML text into a plain object", () => {
    expect(parse('# a comment\ntitle = "coal"\n')).toEqual({ title: "coal" });
  });

  test("applyEdit changes only the target value, preserving comments and foreign keys", () => {
    const original = '# Coal settings\ntitle = "coal"\nfoo = 1\n';
    const raw = parse(original);
    const edited = applyEdit(original, { ...raw, title: "coal-dev" });
    expect(parse(edited)).toEqual({ title: "coal-dev", foo: 1 });
    expect(edited).toContain("# Coal settings");
    expect(edited).toContain("foo = 1");
    expect(edited).toContain('title = "coal-dev"');
  });

  test("parse throws on malformed TOML", () => {
    expect(() => parse("not = = valid ][")).toThrow();
  });
});
