// src/main/keybindingsToml.ts

/** A binding to append: a bind (keys+command) or an unbind (keys+unbind). */
export interface RawBindingEntry {
  readonly keys: string;
  readonly command?: string;
  readonly when?: string;
  readonly unbind?: true;
}

/** A TOML basic string. For Coal's ASCII keys/command ids, JSON quoting is valid TOML. */
const toTomlString = (value: string): string => JSON.stringify(value);

/** Format one `[[keybinding]]` block (design §7). */
export function formatBindingEntry(entry: RawBindingEntry): string {
  const lines = ["[[keybinding]]", `keys = ${toTomlString(entry.keys)}`];
  if (entry.unbind) lines.push("unbind = true");
  else if (entry.command !== undefined) lines.push(`command = ${toTomlString(entry.command)}`);
  if (entry.when !== undefined) lines.push(`when = ${toTomlString(entry.when)}`);
  return lines.join("\n") + "\n";
}

/**
 * Append a formatted block to the existing file text, separated by a blank line
 * (design §7). Append-only, so every existing comment and entry is preserved
 * verbatim - no TOML patching of the array-of-tables is needed.
 */
export function appendEntry(text: string, entry: RawBindingEntry): string {
  const block = formatBindingEntry(entry);
  if (text.length === 0) return block;
  const separator = text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
  return text + separator + block;
}
