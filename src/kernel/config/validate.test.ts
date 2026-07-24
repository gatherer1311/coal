import { describe, expect, test } from "vitest";
import { validate } from "./validate";

describe("validate (design §5 non-destructive kernel-settings validation)", () => {
  test("an empty object yields empty settings, no diagnostics", () => {
    expect(validate({})).toEqual({ settings: {}, diagnostics: [] });
  });

  test("every key is reported as unknown but left for the file to keep (no settings yet)", () => {
    const { settings, diagnostics } = validate({ foo: 1, bar: "x" });
    expect(settings).toEqual({});
    expect(diagnostics).toEqual([
      { key: "foo", kind: "unknown-key", message: 'unknown setting "foo" (left untouched)' },
      { key: "bar", kind: "unknown-key", message: 'unknown setting "bar" (left untouched)' },
    ]);
  });
});
