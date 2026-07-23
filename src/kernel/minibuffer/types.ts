/** A selectable row in the minibuffer's quick-pick list. */
export interface QuickPickItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

/** Options for a quick-pick session. */
export interface QuickPickOptions {
  readonly prompt?: string;
  readonly placeholder?: string;
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
