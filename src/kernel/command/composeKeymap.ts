// src/kernel/command/composeKeymap.ts
import type { ConfigDiagnostic } from "../config/types";
import type { KeybindingEntry, KeybindingUnbind } from "../config/keybindings/types";
import type { Keybinding } from "./types";
import { sequenceStartsWith } from "./keys";

export interface ComposedKeymap {
  readonly bindings: readonly Keybinding[];
  readonly diagnostics: readonly ConfigDiagnostic[];
}

/** A missing `when` is the "global" scope; normalize so undefined compares equal. */
const scope = (when: string | undefined): string => when ?? "";

// Assert the actual union member (not a structural literal) so TypeScript narrows
// the NEGATIVE branch to KeybindingBind - i.e. entry.command is available after
// the unbind check (a structural predicate leaves entry as KeybindingEntry).
const isUnbind = (e: KeybindingEntry): e is KeybindingUnbind => "unbind" in e;

/**
 * Layer the user keybindings over the kernel defaults into one effective table
 * (design §5). Rules, applied in order:
 *  - Entries apply top to bottom; a user entry for the same (keys, when) as an
 *    earlier binding (default or user) replaces it; an `unbind` removes it. So
 *    user beats default, and later beats earlier ("last wins").
 *  - A user rebinding the same (keys, when) to a DIFFERENT command than an
 *    earlier user entry is a `binding-conflict` diagnostic (last still wins).
 *  - The prefix-key invariant (design §4.2): a sequence may be a prefix OR a
 *    complete binding, never both. A binding that extends another with the same
 *    `when` is dropped with a `binding-conflict` diagnostic - the prefix wins.
 */
export function composeKeymap(
  defaults: readonly Keybinding[],
  entries: readonly KeybindingEntry[],
): ComposedKeymap {
  const diagnostics: ConfigDiagnostic[] = [];
  const result: Keybinding[] = [...defaults];
  const userTargets = new Map<string, string>(); // (keys,when) -> command, user layer only

  for (const entry of entries) {
    const slot = JSON.stringify([entry.keys, scope(entry.when)]);
    const existing = result.findIndex(
      (b) => b.keys === entry.keys && scope(b.when) === scope(entry.when),
    );
    if (existing !== -1) result.splice(existing, 1);

    if (isUnbind(entry)) {
      userTargets.delete(slot);
      continue;
    }

    const prior = userTargets.get(slot);
    if (prior !== undefined && prior !== entry.command) {
      diagnostics.push({
        key: entry.keys,
        kind: "binding-conflict",
        message: `"${entry.keys}" is bound to both ${prior} and ${entry.command}; the last one wins`,
      });
    }
    userTargets.set(slot, entry.command);
    result.push({
      keys: entry.keys,
      command: entry.command,
      ...(entry.when !== undefined ? { when: entry.when } : {}),
    });
  }

  // Prefix-key invariant: drop any binding that extends another with the same
  // scope (the prefix wins), reporting each as a conflict (design §4.2).
  const kept: Keybinding[] = [];
  for (const b of result) {
    const prefix = result.find(
      (a) =>
        a !== b &&
        scope(a.when) === scope(b.when) &&
        b.keys !== a.keys &&
        sequenceStartsWith(b.keys, a.keys),
    );
    if (prefix) {
      diagnostics.push({
        key: b.keys,
        kind: "binding-conflict",
        message: `"${b.keys}" conflicts with prefix binding "${prefix.keys}"; the prefix wins`,
      });
      continue;
    }
    kept.push(b);
  }

  return { bindings: kept, diagnostics };
}

/**
 * Find bindings that point at a command id absent from `knownCommands`
 * (design §11/§14). Pure - the command registry lives in the renderer, but the
 * check itself does not need it, so it is node-testable and reused in recompose.
 */
export function findUnresolvedBindings(
  bindings: readonly Keybinding[],
  knownCommands: ReadonlySet<string>,
): ConfigDiagnostic[] {
  const diagnostics: ConfigDiagnostic[] = [];
  for (const binding of bindings) {
    if (!knownCommands.has(binding.command)) {
      diagnostics.push({
        key: binding.keys,
        kind: "unresolvable-command",
        message: `keybinding "${binding.keys}" -> unregistered command "${binding.command}"`,
      });
    }
  }
  return diagnostics;
}
