// src/kernel/config/validate.ts
import type { ConfigDiagnostic, ConfigSnapshot } from "./types";
import { KERNEL_SETTING_KEYS } from "./schema";

/**
 * Turn a raw parsed object into typed settings + diagnostics. Non-destructive:
 * unknown keys are reported but never removed (the caller keeps them in the
 * file) (design §5). No scalar settings are recognized yet, so every present key
 * is reported unknown and settings is always empty.
 */
export function validate(raw: Record<string, unknown>): ConfigSnapshot {
  const diagnostics: ConfigDiagnostic[] = [];
  for (const key of Object.keys(raw)) {
    if (!(KERNEL_SETTING_KEYS as readonly string[]).includes(key)) {
      diagnostics.push({
        key,
        kind: "unknown-key",
        message: `unknown setting "${key}" (left untouched)`,
      });
    }
  }
  return { settings: {}, diagnostics };
}
