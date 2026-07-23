// src/main/tomlConfigCodec.ts
import { parse as tomlParse, patch as tomlPatch } from "@decimalturn/toml-patch";

/** Parse TOML text to a plain object. Throws on malformed input (design §9). */
export function parse(text: string): Record<string, unknown> {
  return tomlParse(text) as Record<string, unknown>;
}

/**
 * Re-emit `existing` with `updated`'s values, preserving comments, whitespace,
 * and any keys not present in `updated`. Callers pass the FULL parsed object
 * with their change overlaid, so foreign keys survive (design §6/§7).
 */
export function applyEdit(existing: string, updated: Record<string, unknown>): string {
  return tomlPatch(existing, updated);
}
