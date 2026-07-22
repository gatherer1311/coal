// src/main/guards.ts
import type { SaveRequest } from "../kernel/ipc/contract";

export function isSaveRequest(value: unknown): value is SaveRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { text?: unknown }).text === "string"
  );
}

/** True when a sender-frame URL belongs to one of the app's own origins (design §3). */
export function isTrustedUrl(url: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!url) return false;
  return allowedOrigins.some((origin) => url.startsWith(origin));
}
