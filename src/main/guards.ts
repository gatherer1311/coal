// src/main/guards.ts
import { KEYMAP_VALUES } from "../kernel/config/schema";
import type { SaveRequest } from "../kernel/ipc/contract";
import type { ConfigSetRequest } from "../kernel/ipc/contract";

export function isSaveRequest(value: unknown): value is SaveRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { text?: unknown }).text === "string"
  );
}

export function isConfigSetRequest(value: unknown): value is ConfigSetRequest {
  if (typeof value !== "object" || value === null) return false;
  const patch = (value as { patch?: unknown }).patch;
  if (typeof patch !== "object" || patch === null) return false;
  const keymap = (patch as { keymap?: unknown }).keymap;
  if (keymap !== undefined && !(KEYMAP_VALUES as readonly string[]).includes(keymap as string)) {
    return false;
  }
  return true;
}

/** True when a sender-frame URL belongs to one of the app's own origins (design §3). */
export function isTrustedUrl(url: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!url) return false;
  return allowedOrigins.some((origin) => url.startsWith(origin));
}
