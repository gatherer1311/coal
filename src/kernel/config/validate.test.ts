import { describe, expect, test } from "vitest";
import { validate } from "./validate";

describe("validate (design §5 non-destructive kernel-settings validation)", () => {
  test("a valid keymap is coerced into typed settings, no diagnostics", () => {
    expect(validate({ keymap: "vim" })).toEqual({ settings: { keymap: "vim" }, diagnostics: [] });
  });

  test("an empty object yields empty settings, no diagnostics (keymap is unset)", () => {
    expect(validate({})).toEqual({ settings: {}, diagnostics: [] });
  });

  test("a wrong-type keymap is dropped with an invalid-type diagnostic", () => {
    const { settings, diagnostics } = validate({ keymap: 3 });
    expect(settings).toEqual({});
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ key: "keymap", kind: "invalid-type" });
  });

  test("an out-of-range keymap value is dropped with an invalid-value diagnostic", () => {
    const { settings, diagnostics } = validate({ keymap: "kakoune" });
    expect(settings).toEqual({});
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ key: "keymap", kind: "invalid-value" });
  });

  test("unknown keys are reported but not surfaced in settings (left for the file to keep)", () => {
    const { settings, diagnostics } = validate({ foo: 1, keymap: "emacs" });
    expect(settings).toEqual({ keymap: "emacs" });
    expect(diagnostics).toEqual([
      { key: "foo", kind: "unknown-key", message: 'unknown setting "foo" (left untouched)' },
    ]);
  });
});
