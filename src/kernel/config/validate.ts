// src/kernel/config/validate.ts
import type { ConfigDiagnostic, ConfigSnapshot, KeymapChoice } from "./types";
import { KERNEL_SETTING_KEYS, KEYMAP_VALUES } from "./schema";

/**
 * Turn a raw parsed object into typed settings + diagnostics. Non-destructive:
 * unknown keys are reported but never removed (the caller keeps them in the
 * file); an invalid value is dropped from settings with a diagnostic, not
 * coerced (design §5).
 */
export function validate(raw: Record<string, unknown>): ConfigSnapshot {
  const diagnostics: ConfigDiagnostic[] = [];
  const settings: { keymap?: KeymapChoice } = {};

  for (const key of Object.keys(raw)) {
    if (!(KERNEL_SETTING_KEYS as readonly string[]).includes(key)) {
      diagnostics.push({
        key,
        kind: "unknown-key",
        message: `unknown setting "${key}" (left untouched)`,
      });
    }
  }

  if ("keymap" in raw) {
    const value = raw["keymap"];
    if (typeof value !== "string") {
      diagnostics.push({
        key: "keymap",
        kind: "invalid-type",
        message: `keymap must be a string, got ${typeof value}`,
      });
    } else if (!(KEYMAP_VALUES as readonly string[]).includes(value)) {
      diagnostics.push({
        key: "keymap",
        kind: "invalid-value",
        message: `keymap must be one of ${KEYMAP_VALUES.join(", ")}, got "${value}"`,
      });
    } else {
      settings.keymap = value as KeymapChoice;
    }
  }

  return { settings, diagnostics };
}
