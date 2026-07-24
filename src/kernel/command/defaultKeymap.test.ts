import { describe, expect, test } from "vitest";
import { DEFAULT_KEYMAP } from "./defaultKeymap";
import { composeKeymap } from "./composeKeymap";

// The command ids the default keymap is allowed to reference (design Appendix A).
const KNOWN = new Set([
  "core.command.execute",
  "core.file.open",
  "core.file.save",
  "core.app.quit",
  "core.abort",
  "core.help.describe-key",
  "core.help.describe-command",
  "core.minibuffer.accept",
  "core.minibuffer.cancel",
  "core.minibuffer.next",
  "core.minibuffer.prev",
]);

describe("DEFAULT_KEYMAP (design §6, Appendix A)", () => {
  test("every default binding points at a known core command id", () => {
    for (const binding of DEFAULT_KEYMAP) expect(KNOWN.has(binding.command)).toBe(true);
  });

  test("the shipped keymap composes with no conflict diagnostics (Law-1 invariant)", () => {
    expect(composeKeymap(DEFAULT_KEYMAP, []).diagnostics).toEqual([]);
  });
});
