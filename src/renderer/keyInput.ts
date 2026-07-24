// src/renderer/keyInput.ts
import { canonicalChord } from "../kernel/command/keys";
import type { Modifier } from "../kernel/command/keys";

/**
 * Map a KeyboardEvent to a canonical chord, or null for a modifier-only press
 * (design §4.1). The base token uses KeyboardEvent.code for letters/digits
 * (layout-independent) and .key for named keys; Shift is an explicit modifier.
 */
export function chordFromEvent(event: KeyboardEvent): string | null {
  const base = baseToken(event);
  if (base === null) return null;
  const mods: Modifier[] = [];
  if (event.ctrlKey) mods.push("Ctrl");
  if (event.altKey) mods.push("Alt");
  if (event.shiftKey) mods.push("Shift");
  if (event.metaKey) mods.push("Meta");
  return canonicalChord(mods, base);
}

function baseToken(event: KeyboardEvent): string | null {
  const code = event.code;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase(); // KeyS -> s
  if (/^Digit[0-9]$/.test(code)) return code.slice(5); // Digit1 -> 1
  const key = event.key;
  if (key === "Control" || key === "Alt" || key === "Shift" || key === "Meta") return null;
  return key; // Enter, Escape, Tab, ArrowDown, F1, ...
}
