// src/main/guards.ts
import { KERNEL_SETTING_KEYS } from "../kernel/config/schema";
import type {
  ConfigSetRequest,
  KeybindingBindRequest,
  KeybindingUnbindRequest,
  SaveRequest,
} from "../kernel/ipc/contract";

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
  // No settable keys remain; a valid patch is empty. Any key is unknown -> reject.
  for (const key of Object.keys(patch)) {
    if (!(KERNEL_SETTING_KEYS as readonly string[]).includes(key)) return false;
  }
  return true;
}

export function isKeybindingBindRequest(value: unknown): value is KeybindingBindRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v["keys"] !== "string" || v["keys"].length === 0) return false;
  if (typeof v["command"] !== "string" || v["command"].length === 0) return false;
  if (v["when"] !== undefined && typeof v["when"] !== "string") return false;
  return true;
}

export function isKeybindingUnbindRequest(value: unknown): value is KeybindingUnbindRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v["keys"] !== "string" || v["keys"].length === 0) return false;
  if (v["when"] !== undefined && typeof v["when"] !== "string") return false;
  return true;
}

/** True when a sender-frame URL belongs to one of the app's own origins (design §3). */
export function isTrustedUrl(url: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!url) return false;
  return allowedOrigins.some((origin) => url.startsWith(origin));
}
