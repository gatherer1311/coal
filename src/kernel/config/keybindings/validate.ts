// src/kernel/config/keybindings/validate.ts
import type { ConfigDiagnostic } from "../types";
import type { KeybindingEntry, KeybindingsSnapshot } from "./types";
import { KEYBINDING_ENTRY_KEYS, KEYBINDING_TABLE } from "./schema";

/**
 * Structurally validate the parsed keybindings.toml into typed entries +
 * diagnostics (design §7). Non-destructive: unknown fields are reported but the
 * entry is kept; a malformed entry is dropped with a diagnostic, the rest of the
 * file untouched. Command-id resolvability is NOT checked here (no registry in
 * the kernel/config layer) - the renderer checks it at compose time (design §11).
 */
export function validateKeybindings(raw: Record<string, unknown>): KeybindingsSnapshot {
  const diagnostics: ConfigDiagnostic[] = [];
  const entries: KeybindingEntry[] = [];

  const table = raw[KEYBINDING_TABLE];
  if (table === undefined) return { entries, diagnostics };
  if (!Array.isArray(table)) {
    diagnostics.push({
      key: KEYBINDING_TABLE,
      kind: "invalid-type",
      message: `"${KEYBINDING_TABLE}" must be an array of tables`,
    });
    return { entries, diagnostics };
  }

  table.forEach((rawEntry, index) => {
    const at = `${KEYBINDING_TABLE}[${index}]`;
    if (typeof rawEntry !== "object" || rawEntry === null || Array.isArray(rawEntry)) {
      diagnostics.push({ key: at, kind: "invalid-type", message: `${at} must be a table` });
      return;
    }
    const entry = rawEntry as Record<string, unknown>;

    for (const field of Object.keys(entry)) {
      if (!(KEYBINDING_ENTRY_KEYS as readonly string[]).includes(field)) {
        diagnostics.push({
          key: `${at}.${field}`,
          kind: "unknown-key",
          message: `unknown keybinding field "${field}" (left untouched)`,
        });
      }
    }

    const keys = entry["keys"];
    if (typeof keys !== "string" || keys.length === 0) {
      diagnostics.push({
        key: `${at}.keys`,
        kind: "invalid-type",
        message: `${at}.keys must be a non-empty string`,
      });
      return;
    }

    const rawWhen = entry["when"];
    if (rawWhen !== undefined && typeof rawWhen !== "string") {
      diagnostics.push({
        key: `${at}.when`,
        kind: "invalid-type",
        message: `${at}.when must be a string`,
      });
      return;
    }
    const when = typeof rawWhen === "string" ? rawWhen : undefined;

    if (entry["unbind"] === true) {
      entries.push({ keys, unbind: true, ...(when !== undefined ? { when } : {}) });
      return;
    }

    const command = entry["command"];
    if (typeof command !== "string" || command.length === 0) {
      diagnostics.push({
        key: `${at}.command`,
        kind: "invalid-type",
        message: `${at} must set a string "command" or "unbind = true"`,
      });
      return;
    }
    entries.push({ keys, command, ...(when !== undefined ? { when } : {}) });
  });

  return { entries, diagnostics };
}
