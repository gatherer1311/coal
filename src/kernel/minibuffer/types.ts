/** A selectable row in the minibuffer's quick-pick list. */
export interface QuickPickItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  /** A right-aligned key-hint (the command's current binding; design §8 where-is). */
  readonly keyHint?: string;
}

/** Options for a quick-pick session. */
export interface QuickPickOptions {
  readonly prompt?: string;
  readonly placeholder?: string;
}

/** Options for a raw key-sequence capture (design §7). */
export interface ReadKeySequenceOptions {
  readonly prompt?: string;
  readonly placeholder?: string;
  /** Keep capturing while the accumulated sequence is a live prefix; default: stop after one chord. */
  continueWhile?(sequence: string): boolean;
}

/** A successful fuzzy match: a score (higher is better) + matched indices in the text. */
export interface MatchResult {
  readonly score: number;
  readonly positions: readonly number[];
}

/** An item paired with its current highlight positions, in ranked order. */
export interface RankedItem {
  readonly item: QuickPickItem;
  readonly positions: readonly number[];
}
