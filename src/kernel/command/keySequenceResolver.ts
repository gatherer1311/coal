// src/kernel/command/keySequenceResolver.ts
import type { Context } from "./context";
import type { Keybinding } from "./types";
import { joinSequence } from "./keys";

/** What the keymap must answer for the resolver (design §4.3). */
export interface KeymapView {
  getCandidates(pending: string, context: Context): Keybinding[];
}

export type ResolveResult =
  | { readonly kind: "dispatch"; readonly command: string; readonly sequence: string }
  | {
      readonly kind: "pending";
      readonly sequence: string;
      readonly continuations: readonly Keybinding[];
    }
  | { readonly kind: "unbound"; readonly sequence: string }
  | { readonly kind: "fallthrough"; readonly chord: string };

/** Specificity rank: a scoped binding (has `when`) beats an unscoped one. */
const specificity = (binding: Keybinding): number => (binding.when ? 1 : 0);

/**
 * The pure prefix-key state machine (design §4.3). Holds a pending chord
 * sequence and, on each app-level chord: dispatches a complete binding, stays
 * pending on a live prefix, aborts a mid-sequence dead-end, or falls a lone
 * unmatched chord through to the editor. No DOM, no timers - which-key's display
 * delay is a renderer concern, not resolver state.
 */
export class KeySequenceResolver {
  #pending: string[] = [];
  readonly #keymap: KeymapView;
  readonly #context: Context;

  constructor(keymap: KeymapView, context: Context) {
    this.#keymap = keymap;
    this.#context = context;
  }

  get pending(): string {
    return joinSequence(this.#pending);
  }

  /** True while a prefix sequence is in progress (which-key reads this). */
  get isPending(): boolean {
    return this.#pending.length > 0;
  }

  press(chord: string): ResolveResult {
    const wasEmpty = this.#pending.length === 0;
    const next = [...this.#pending, chord];
    const sequence = joinSequence(next);
    const candidates = this.#keymap.getCandidates(sequence, this.#context);

    const complete = candidates
      .filter((binding) => binding.keys === sequence)
      .sort((a, b) => specificity(b) - specificity(a)); // scoped beats unscoped

    if (complete.length > 0) {
      this.#pending = [];
      return { kind: "dispatch", command: complete[0]!.command, sequence };
    }
    if (candidates.length > 0) {
      this.#pending = next;
      return { kind: "pending", sequence, continuations: candidates };
    }
    this.#pending = [];
    return wasEmpty ? { kind: "fallthrough", chord } : { kind: "unbound", sequence };
  }

  reset(): void {
    this.#pending = [];
  }
}
