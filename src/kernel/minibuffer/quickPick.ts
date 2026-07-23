import type { MatchResult, QuickPickItem, RankedItem } from "./types";
import { fuzzyMatch } from "./match";

/**
 * Pure selection state for a quick-pick session (design §5): filter items by a
 * fuzzy query, rank them (stable — equal scores keep input order), and move a
 * wrapping selection cursor. Holds no DOM.
 */
export class QuickPickModel {
  readonly #items: readonly QuickPickItem[];
  #results: RankedItem[];
  #selected = 0;

  constructor(items: readonly QuickPickItem[]) {
    this.#items = items;
    this.#results = this.#rank("");
  }

  setQuery(query: string): void {
    this.#results = this.#rank(query);
    this.#selected = 0;
  }

  get results(): readonly RankedItem[] {
    return this.#results;
  }

  get selectedIndex(): number {
    return this.#selected;
  }

  selected(): QuickPickItem | undefined {
    return this.#results[this.#selected]?.item;
  }

  moveDown(): void {
    if (this.#results.length === 0) return;
    this.#selected = (this.#selected + 1) % this.#results.length;
  }

  moveUp(): void {
    if (this.#results.length === 0) return;
    this.#selected = (this.#selected - 1 + this.#results.length) % this.#results.length;
  }

  #rank(query: string): RankedItem[] {
    const scored: { item: QuickPickItem; match: MatchResult }[] = [];
    for (const item of this.#items) {
      const match = fuzzyMatch(query, item.label);
      if (match) scored.push({ item, match });
    }
    scored.sort((a, b) => b.match.score - a.match.score); // stable in modern JS engines
    return scored.map((s) => ({ item: s.item, positions: s.match.positions }));
  }
}
