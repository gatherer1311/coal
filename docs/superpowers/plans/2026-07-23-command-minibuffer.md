# Command Minibuffer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship build-sequence step 2 — a bottom-docked command minibuffer with a pure `quickPick` primitive over the command registry, plus one consumer (a command palette) that fuzzy-finds a registered command by title and runs it through the existing `executeCommand` choke point.

**Architecture:** The same hexagonal split as the walking skeleton. A pure, framework-free `src/kernel/minibuffer/` core (fuzzy matcher + selection model + types) is unit-tested in Node. A thin `src/renderer/minibuffer.ts` DOM adapter renders that model as a native bottom overlay and exposes `quickPick()`. The palette is registered in the renderer composition root through the **public** command API — no back door. No new IPC, no preload surface; the only main-process change is one native-menu item on the existing `menu-command` channel.

**Tech Stack:** TypeScript (strict, ESM), CodeMirror 6 (only via the existing editor keymap), Vitest (node + browser projects), Playwright `_electron` (one smoke). **No new dependency** — the fuzzy matcher is hand-rolled and pure.

**Design source:** [`docs/superpowers/specs/2026-07-23-command-minibuffer-design.md`](../specs/2026-07-23-command-minibuffer-design.md). Every task implements part of it; section references below (e.g. "design §6") point there. Keymap-parity model: `SPEC.md` §6 / §6.1.

## Global Constraints

Every task's requirements implicitly include this section.

- **Runtime:** Node `>=22`; `package.json` is ESM (`"type": "module"`).
- **TypeScript strict flags (already set in `tsconfig.json`):** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `verbatimModuleSyntax`, `isolatedModules`. Consequences you WILL hit:
  - `verbatimModuleSyntax` → type-only imports must use `import type { … }`.
  - `noUncheckedIndexedAccess` → `arr[i]` and `str[i]` are `T | undefined`; guard or assert (`str[i]!`) only where an in-bounds invariant holds.
  - `exactOptionalPropertyTypes` → you may **not** assign `undefined` to an optional property. To set an optional `description` only when present, use a conditional spread: `{ id, label, ...(x !== undefined ? { description: x } : {}) }` — never `{ description: x }` when `x` is `string | undefined`.
- **Kernel purity (design §3/§4):** files under `src/kernel/` import **no** DOM, Electron, or Node (`fs`, `path`, …) APIs — only standard JS (`Map`, `Set`, `Array`, `RegExp`, …). All DOM lives in `src/renderer/minibuffer.ts`.
- **Prettier (enforced by the pre-commit hook):** `printWidth: 100`, double quotes, semicolons, `trailingComma: "all"`. Run `npm run format` before committing if unsure.
- **Tests:** Vitest. Node-tier files are `*.test.ts`; browser-tier files are `*.browser.test.ts`; e2e files are `e2e/*.spec.ts` (Playwright). Import `{ describe, expect, test }` from `"vitest"`; browser tests import `{ userEvent }` from `"@vitest/browser/context"`.
- **Commit hygiene (commit-msg hook):** meaningful imperative subject, ≤72 chars (bare `wip`/`fix`/`test`/`update` are rejected). Each task ends with a real commit. Work on a feature branch — never commit to `main` (`CLAUDE.md`).
- **No new dependency:** the fuzzy matcher is hand-rolled (design §6; `SPEC.md` §11). Do not add a fuzzy-search package.
- **Pinned command + key (dogfooded via the registry, design §7/§8):** `core.command.execute` — title `"Run Command…"`, opened by the interim binding `Ctrl-Shift-p` and a native menu item. Idiom-neutral until the step-4 keymaps replace it.
- **Pinned DOM contract (load-bearing — the e2e asserts on these):** the overlay root is `.coal-minibuffer`, open state adds `.open`; the text field is `.coal-mb-input`; list rows are `.coal-mb-item` (selected row also `.selected`); matched characters are `.coal-mb-match`. Do not rename these.
- **Scope boundary (design §1):** `readLine` and its Vim `:`/`/` consumers, the plugin provider-registration API, `when`-evaluation, and any Emacs/Vim personality are **out of scope** — do not build them. This slice ships `quickPick` + the command palette only.

## File Structure

```
src/
  kernel/
    minibuffer/
      types.ts        # QuickPickItem, QuickPickOptions, MatchResult, RankedItem (Task 1)
      match.ts        # fuzzyMatch(query, text) -> MatchResult | null (Task 1)
      quickPick.ts    # QuickPickModel — pure selection state machine (Task 2)
  renderer/
    minibuffer.ts     # Minibuffer service: native overlay DOM + quickPick()/isOpen() (Task 3)
    main.ts           # MODIFY: instantiate Minibuffer, register core.command.execute,
                      #         bind Ctrl-Shift-p, guard the window keydown handler (Task 4)
  main/
    menu.ts           # MODIFY: add "Run Command…" menu item (Task 4)
e2e/
  minibuffer.spec.ts  # open -> edit -> palette-run "Save" -> assert bytes (Task 4)
```

Test files: `src/kernel/minibuffer/match.test.ts`, `src/kernel/minibuffer/quickPick.test.ts`, `src/renderer/minibuffer.browser.test.ts`.

---

### Task 1: Fuzzy matcher + shared types

The pure, subsequence-with-scoring matcher the whole minibuffer ranks on (design §6). Case-insensitive; returns `null` for a non-subsequence; returns the matched character indices for highlighting.

**Files:**
- Create: `src/kernel/minibuffer/types.ts`
- Create: `src/kernel/minibuffer/match.ts`
- Test: `src/kernel/minibuffer/match.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `types.ts`: `interface QuickPickItem { readonly id: string; readonly label: string; readonly description?: string }`, `interface QuickPickOptions { readonly prompt?: string; readonly placeholder?: string }`, `interface MatchResult { readonly score: number; readonly positions: readonly number[] }`, `interface RankedItem { readonly item: QuickPickItem; readonly positions: readonly number[] }`.
  - `match.ts`: `fuzzyMatch(query: string, text: string): MatchResult | null` — higher score is better; empty query returns `{ score: 0, positions: [] }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/kernel/minibuffer/match.test.ts
import { describe, expect, test } from "vitest";
import { fuzzyMatch } from "./match";

describe("fuzzyMatch (design §6 subsequence + scoring)", () => {
  test("matches a subsequence and reports matched positions", () => {
    const m = fuzzyMatch("sq", "Save Quit");
    expect(m).not.toBeNull();
    expect(m!.positions).toEqual([0, 5]); // S@0, Q@5
  });

  test("returns null when the query is not a subsequence", () => {
    expect(fuzzyMatch("zx", "Save")).toBeNull();
  });

  test("empty query matches everything at score 0", () => {
    expect(fuzzyMatch("", "Anything")).toEqual({ score: 0, positions: [] });
  });

  test("a contiguous run outscores a scattered match", () => {
    const contiguous = fuzzyMatch("sav", "Save")!;
    const scattered = fuzzyMatch("sve", "Save")!; // s@0, v@2, e@3 — a gap after s
    expect(contiguous.score).toBeGreaterThan(scattered.score);
  });

  test("an exact-case match outscores a case-insensitive one", () => {
    expect(fuzzyMatch("Sa", "Save")!.score).toBeGreaterThan(fuzzyMatch("sa", "Save")!.score);
  });

  test("a word-boundary match outscores a mid-word match of equal length", () => {
    const boundary = fuzzyMatch("q", "Save Quit")!; // Q after a space
    const midword = fuzzyMatch("u", "Save Quit")!; // u mid-word
    expect(boundary.score).toBeGreaterThan(midword.score);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/kernel/minibuffer/match.test.ts`
Expected: FAIL — cannot resolve `./match` / `fuzzyMatch is not a function`.

- [ ] **Step 3: Create the shared types**

```ts
// src/kernel/minibuffer/types.ts

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
```

- [ ] **Step 4: Implement the matcher**

```ts
// src/kernel/minibuffer/match.ts
import type { MatchResult } from "./types";

const SEPARATOR = /[\s\-_/.]/;

/**
 * Case-insensitive subsequence match with scoring (design §6). Returns null when
 * `query` is not a subsequence of `text`. `positions` are the matched indices in
 * `text` (for highlighting). Higher score = better; an empty query matches at 0.
 */
export function fuzzyMatch(query: string, text: string): MatchResult | null {
  if (query.length === 0) return { score: 0, positions: [] };

  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let qi = 0;
  let prevMatch = -2; // index in text of the previously matched char

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;

    let charScore = 1;
    if (ti === prevMatch + 1) charScore += 5; // contiguous run
    const prev = ti > 0 ? text[ti - 1] : undefined;
    if (ti === 0 || (prev !== undefined && SEPARATOR.test(prev))) charScore += 3; // word start
    if (prev !== undefined && /[a-z0-9]/.test(prev) && /[A-Z]/.test(text[ti]!)) charScore += 3; // camelCase
    if (text[ti] === query[qi]) charScore += 1; // exact case

    score += charScore;
    positions.push(ti);
    prevMatch = ti;
    qi++;
  }

  if (qi < q.length) return null; // not all query chars consumed

  score -= text.length * 0.01; // tiebreak: prefer shorter text
  score -= positions[0]! * 0.1; // penalize a leading gap (positions is non-empty here)
  return { score, positions };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/kernel/minibuffer/match.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Typecheck, format, commit**

Run: `npm run typecheck && npm run format`
Then:

```bash
git add src/kernel/minibuffer/types.ts src/kernel/minibuffer/match.ts src/kernel/minibuffer/match.test.ts
git commit -m "Add subsequence fuzzy matcher and shared types for the minibuffer"
```

---

### Task 2: QuickPickModel (pure selection state machine)

The DOM-free model that filters items by a fuzzy query, ranks them, and moves a wrapping selection cursor (design §5). All selection logic lives here so the renderer adapter stays thin.

**Files:**
- Create: `src/kernel/minibuffer/quickPick.ts`
- Test: `src/kernel/minibuffer/quickPick.test.ts`

**Interfaces:**
- Consumes: `QuickPickItem`, `RankedItem`, `MatchResult` from `./types`; `fuzzyMatch` from `./match`.
- Produces: `class QuickPickModel` with `constructor(items: readonly QuickPickItem[])`, `setQuery(query: string): void`, `get results(): readonly RankedItem[]`, `get selectedIndex(): number`, `selected(): QuickPickItem | undefined`, `moveDown(): void`, `moveUp(): void`. Ranking is stable (equal scores keep input order); `setQuery` resets the selection to 0; `moveUp`/`moveDown` wrap and no-op on an empty result set.

- [ ] **Step 1: Write the failing test**

```ts
// src/kernel/minibuffer/quickPick.test.ts
import { describe, expect, test } from "vitest";
import { QuickPickModel } from "./quickPick";
import type { QuickPickItem } from "./types";

const items: QuickPickItem[] = [
  { id: "core.file.open", label: "Open File…" },
  { id: "core.file.save", label: "Save" },
  { id: "core.app.quit", label: "Quit" },
];

describe("QuickPickModel (design §5 pure selection model)", () => {
  test("empty query keeps all items in input order, selection at 0", () => {
    const m = new QuickPickModel(items);
    expect(m.results.map((r) => r.item.id)).toEqual([
      "core.file.open",
      "core.file.save",
      "core.app.quit",
    ]);
    expect(m.selectedIndex).toBe(0);
    expect(m.selected()?.id).toBe("core.file.open");
  });

  test("setQuery filters to matches and resets selection to 0", () => {
    const m = new QuickPickModel(items);
    m.moveDown();
    m.setQuery("quit");
    expect(m.results.map((r) => r.item.id)).toEqual(["core.app.quit"]);
    expect(m.selectedIndex).toBe(0);
  });

  test("results carry highlight positions", () => {
    const m = new QuickPickModel(items);
    m.setQuery("sa");
    const save = m.results.find((r) => r.item.id === "core.file.save");
    expect(save?.positions).toEqual([0, 1]);
  });

  test("moveDown / moveUp wrap around", () => {
    const m = new QuickPickModel(items); // 3 results
    m.moveUp();
    expect(m.selectedIndex).toBe(2); // wraps to last
    m.moveDown();
    expect(m.selectedIndex).toBe(0); // wraps to first
  });

  test("movement and selected() are safe on an empty result set", () => {
    const m = new QuickPickModel(items);
    m.setQuery("zzzz");
    expect(m.results).toHaveLength(0);
    m.moveDown();
    expect(m.selectedIndex).toBe(0);
    expect(m.selected()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/kernel/minibuffer/quickPick.test.ts`
Expected: FAIL — cannot resolve `./quickPick`.

- [ ] **Step 3: Implement the model**

```ts
// src/kernel/minibuffer/quickPick.ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/kernel/minibuffer/quickPick.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the whole node tier + typecheck**

Run: `npm test && npm run typecheck`
Expected: all node tests pass (the prior suite plus the two new files), no type errors.

- [ ] **Step 6: Format and commit**

Run: `npm run format`
Then:

```bash
git add src/kernel/minibuffer/quickPick.ts src/kernel/minibuffer/quickPick.test.ts
git commit -m "Add QuickPickModel selection state machine for the minibuffer"
```

---

### Task 3: Minibuffer overlay service (renderer DOM adapter)

The native bottom-docked overlay that renders `QuickPickModel` and exposes the `quickPick()` primitive (design §3/§8). Keyboard-driven: type to filter, arrows / `Ctrl-n` / `Ctrl-p` to move, `Enter` accept, `Esc` cancel. Browser-tested in real Chromium.

**Files:**
- Create: `src/renderer/minibuffer.ts`
- Test: `src/renderer/minibuffer.browser.test.ts`

**Interfaces:**
- Consumes: `QuickPickModel` from `../kernel/minibuffer/quickPick`; `QuickPickItem`, `QuickPickOptions`, `RankedItem` from `../kernel/minibuffer/types`.
- Produces: `class Minibuffer` with `constructor(host: HTMLElement)`, `quickPick(items: QuickPickItem[], opts?: QuickPickOptions): Promise<QuickPickItem | undefined>` (resolves to the chosen item, or `undefined` on cancel), `isOpen(): boolean`. While open it captures its own keys (`stopPropagation`) and restores focus to the previously-focused element on close. `readLine` is intentionally **not** implemented this slice (design §1/§5).

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/minibuffer.browser.test.ts
import { describe, expect, test } from "vitest";
import { userEvent } from "@vitest/browser/context";
import { Minibuffer } from "./minibuffer";
import type { QuickPickItem } from "../kernel/minibuffer/types";

const items: QuickPickItem[] = [
  { id: "core.file.open", label: "Open File…" },
  { id: "core.file.save", label: "Save" },
  { id: "core.app.quit", label: "Quit" },
];

describe("Minibuffer (design §3 native overlay + quickPick)", () => {
  test("type to filter, Enter resolves the selected item", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const mb = new Minibuffer(host);

    const pick = mb.quickPick(items, { prompt: ">", placeholder: "Run a command" });
    expect(mb.isOpen()).toBe(true);

    await userEvent.keyboard("save");
    await userEvent.keyboard("{Enter}");

    expect((await pick)?.id).toBe("core.file.save");
    expect(mb.isOpen()).toBe(false);
    host.remove();
  });

  test("Escape resolves undefined and closes", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const mb = new Minibuffer(host);

    const pick = mb.quickPick(items);
    await userEvent.keyboard("{Escape}");

    expect(await pick).toBeUndefined();
    expect(mb.isOpen()).toBe(false);
    host.remove();
  });

  test("ArrowDown moves the selection before accepting", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const mb = new Minibuffer(host);

    const pick = mb.quickPick(items); // no query -> [Open File…, Save, Quit], selected 0
    await userEvent.keyboard("{ArrowDown}{Enter}"); // move to Save

    expect((await pick)?.id).toBe("core.file.save");
    host.remove();
  });

  test("a non-matching query shows the empty row and Enter is a no-op", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const mb = new Minibuffer(host);

    const pick = mb.quickPick(items);
    await userEvent.keyboard("zzzz");
    expect(host.querySelector(".coal-mb-item")).toBeNull();
    expect(host.querySelector(".coal-mb-empty")).not.toBeNull();

    await userEvent.keyboard("{Enter}"); // selected() is undefined -> resolves undefined
    expect(await pick).toBeUndefined();
    host.remove();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:browser`
Expected: FAIL — cannot resolve `./minibuffer`.

- [ ] **Step 3: Implement the overlay service**

```ts
// src/renderer/minibuffer.ts
import { QuickPickModel } from "../kernel/minibuffer/quickPick";
import type { QuickPickItem, QuickPickOptions, RankedItem } from "../kernel/minibuffer/types";

const STYLE_ID = "coal-minibuffer-style";
const CSS = `
.coal-minibuffer {
  position: fixed; left: 0; right: 0; bottom: 0;
  display: none; flex-direction: column;
  font: 13px/1.5 monospace; background: #1b1b1b; color: #e8e8e8;
  border-top: 1px solid #333;
}
.coal-minibuffer.open { display: flex; }
.coal-mb-list { list-style: none; margin: 0; padding: 0; max-height: 40vh; overflow-y: auto; }
.coal-mb-item { display: flex; justify-content: space-between; padding: 2px 8px; }
.coal-mb-item.selected { background: #2f5d3a; }
.coal-mb-match { font-weight: bold; color: #9be29b; }
.coal-mb-desc { opacity: 0.6; margin-left: 1em; }
.coal-mb-empty { padding: 2px 8px; opacity: 0.6; }
.coal-mb-input-row { display: flex; align-items: center; padding: 2px 8px; border-top: 1px solid #333; }
.coal-mb-prompt { margin-right: 6px; opacity: 0.8; }
.coal-mb-input { flex: 1; background: transparent; border: none; color: inherit; font: inherit; outline: none; }
`;

/**
 * The bottom-docked command minibuffer (design §3). Renders a QuickPickModel as a
 * native overlay; keyboard-driven; captures its own keys while open so they do not
 * leak to the editor or the window-global handler.
 */
export class Minibuffer {
  readonly #root: HTMLDivElement;
  readonly #list: HTMLUListElement;
  readonly #promptEl: HTMLSpanElement;
  readonly #input: HTMLInputElement;
  #open = false;
  #model: QuickPickModel | null = null;
  #resolve: ((item: QuickPickItem | undefined) => void) | null = null;
  #prevFocus: Element | null = null;

  constructor(host: HTMLElement) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    this.#root = document.createElement("div");
    this.#root.className = "coal-minibuffer";
    this.#list = document.createElement("ul");
    this.#list.className = "coal-mb-list";

    const row = document.createElement("div");
    row.className = "coal-mb-input-row";
    this.#promptEl = document.createElement("span");
    this.#promptEl.className = "coal-mb-prompt";
    this.#input = document.createElement("input");
    this.#input.className = "coal-mb-input";
    this.#input.type = "text";
    row.append(this.#promptEl, this.#input);

    this.#root.append(this.#list, row);
    host.appendChild(this.#root);

    this.#input.addEventListener("input", () => {
      this.#model?.setQuery(this.#input.value);
      this.#render();
    });
    this.#input.addEventListener("keydown", (e) => this.#onKeydown(e));
  }

  isOpen(): boolean {
    return this.#open;
  }

  quickPick(
    items: QuickPickItem[],
    opts: QuickPickOptions = {},
  ): Promise<QuickPickItem | undefined> {
    this.#model = new QuickPickModel(items);
    this.#prevFocus = document.activeElement;
    this.#promptEl.textContent = opts.prompt ?? ">";
    this.#input.value = "";
    this.#input.placeholder = opts.placeholder ?? "";
    this.#render();
    this.#root.classList.add("open");
    this.#open = true;
    this.#input.focus();
    return new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  #onKeydown(e: KeyboardEvent): void {
    if (!this.#open || e.isComposing) return;
    const down = e.key === "ArrowDown" || (e.ctrlKey && e.key === "n");
    const up = e.key === "ArrowUp" || (e.ctrlKey && e.key === "p");

    if (e.key === "Enter") {
      this.#finish(this.#model?.selected());
    } else if (e.key === "Escape") {
      this.#finish(undefined);
    } else if (down) {
      this.#model?.moveDown();
      this.#render();
    } else if (up) {
      this.#model?.moveUp();
      this.#render();
    } else {
      return; // ordinary typing flows into the input (fires the 'input' listener)
    }
    e.preventDefault();
    e.stopPropagation();
  }

  #finish(item: QuickPickItem | undefined): void {
    this.#root.classList.remove("open");
    this.#open = false;
    const resolve = this.#resolve;
    this.#resolve = null;
    this.#model = null;
    if (this.#prevFocus instanceof HTMLElement) this.#prevFocus.focus();
    resolve?.(item);
  }

  #render(): void {
    const results = this.#model?.results ?? [];
    const selected = this.#model?.selectedIndex ?? 0;
    this.#list.textContent = "";

    if (results.length === 0) {
      const empty = document.createElement("li");
      empty.className = "coal-mb-empty";
      empty.textContent = "No matching commands";
      this.#list.appendChild(empty);
      return;
    }

    results.forEach((r, i) => this.#list.appendChild(this.#renderItem(r, i === selected)));
  }

  #renderItem(r: RankedItem, isSelected: boolean): HTMLLIElement {
    const li = document.createElement("li");
    li.className = isSelected ? "coal-mb-item selected" : "coal-mb-item";

    const label = document.createElement("span");
    const positions = new Set(r.positions);
    for (let i = 0; i < r.item.label.length; i++) {
      const span = document.createElement("span");
      span.textContent = r.item.label[i]!;
      if (positions.has(i)) span.className = "coal-mb-match";
      label.appendChild(span);
    }
    li.appendChild(label);

    if (r.item.description) {
      const desc = document.createElement("span");
      desc.className = "coal-mb-desc";
      desc.textContent = r.item.description;
      li.appendChild(desc);
    }
    return li;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:browser`
Expected: PASS — the new `minibuffer.browser.test.ts` (4 tests) plus the existing `editor.browser.test.ts`.

- [ ] **Step 5: Typecheck, format, commit**

Run: `npm run typecheck && npm run format`
Then:

```bash
git add src/renderer/minibuffer.ts src/renderer/minibuffer.browser.test.ts
git commit -m "Add the bottom-docked minibuffer overlay with quickPick"
```

---

### Task 4: Wire the command palette + interim binding + menu, prove it end-to-end

Register the palette through the public command API in the composition root, bind the interim `Ctrl-Shift-p`, add the native menu item, guard the window-global keydown handler while the minibuffer owns input, and prove the whole path with a Playwright smoke (design §7/§8/§9/§10). This is an integration task: its test is the e2e.

**Files:**
- Modify: `src/renderer/main.ts`
- Modify: `src/main/menu.ts`
- Test (create): `e2e/minibuffer.spec.ts`

**Interfaces:**
- Consumes: `Minibuffer` from `./minibuffer`; the existing `commands` (`CommandRegistry`), `keys` (`KeybindingRegistry`), `store` (`DisposableStore`), and window-global keydown handler in `main.ts`; the existing `send`/`menu-command` seam in `menu.ts`.
- Produces: the `core.command.execute` command (title `"Run Command…"`), reachable via `Ctrl-Shift-p` and the menu; when it runs, the minibuffer lists all enabled commands and runs the pick through `executeCommand`.

- [ ] **Step 1: Write the failing e2e (drives the palette, not `Ctrl-S`)**

```ts
// e2e/minibuffer.spec.ts
import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("the command palette runs Save, writing byte-exact changes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "coal-e2e-"));
  const fixture = join(dir, "note.md");
  await writeFile(fixture, "hello\n", "utf-8");

  const args = ["out/main/index.js"];
  if (process.env["CI"]) args.push("--no-sandbox");
  const app = await electron.launch({ args });

  try {
    const window = await app.firstWindow();
    await window.locator(".cm-content").waitFor();

    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      dialog.showMessageBoxSync = () => 1; // "Don't Save"
    }, fixture);

    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+O");
    await expect(window.locator(".cm-content")).toContainText("hello");

    // Edit, then save via the palette instead of Ctrl+S.
    await window.keyboard.press("End");
    await window.keyboard.type(" world");

    await window.keyboard.press("Control+Shift+P");
    await expect(window.locator(".coal-minibuffer.open")).toBeVisible();
    await window.locator(".coal-mb-input").fill("Save");
    await window.keyboard.press("Enter");

    await expect.poll(async () => readFile(fixture, "utf-8")).toBe("hello world\n");
    await expect(window.locator(".coal-minibuffer.open")).toHaveCount(0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Build and run the e2e to verify it fails**

Run: `npm run build && npm run test:e2e -- minibuffer.spec.ts`
Expected: FAIL — `.coal-minibuffer.open` never appears (the palette isn't wired yet).
(If no display is available, this step is verified in CI under `xvfb`; still run `npm run build` to confirm it compiles.)

- [ ] **Step 3: Instantiate the minibuffer and register the palette in `main.ts`**

Add the import at the top of `src/renderer/main.ts` (beside the existing `createEditor` import):

```ts
import { Minibuffer } from "./minibuffer";
```

Immediately after the existing `const editor = createEditor(...)` line, add:

```ts
const minibuffer = new Minibuffer(document.body);
```

After the existing `core.app.quit` registration block (and before the `keys.registerKeybinding` calls), add:

```ts
store.add(
  commands.registerCommand({
    id: "core.command.execute",
    title: "Run Command…",
    run: async (c) => {
      const items = commands
        .getCommands()
        .filter((cmd) => !cmd.isEnabled || cmd.isEnabled(c)) // only runnable commands (design §7)
        .map((cmd) => ({
          id: cmd.id,
          label: cmd.title,
          // exactOptionalPropertyTypes: only set description when present.
          ...(cmd.category !== undefined ? { description: cmd.category } : {}),
        }));
      const pick = await minibuffer.quickPick(items, {
        prompt: ">",
        placeholder: "Run a command",
      });
      if (pick) await commands.executeCommand(pick.id, c);
    },
  }),
);
```

- [ ] **Step 4: Bind the interim key and guard the window handler in `main.ts`**

Beside the existing `keys.registerKeybinding` calls, add:

```ts
store.add(keys.registerKeybinding({ keys: "Ctrl-Shift-p", command: "core.command.execute" }));
```

Add a guard as the first line inside the existing `window.addEventListener("keydown", (event) => { … })` handler, so app-global keys don't fire while the palette owns input:

```ts
window.addEventListener("keydown", (event) => {
  if (minibuffer.isOpen()) return; // the minibuffer captures its own keys while open
  if (event.defaultPrevented || event.isComposing) return;
  // …existing body unchanged…
});
```

- [ ] **Step 5: Add the native menu item in `menu.ts`**

In `src/main/menu.ts`, add a new top-level submenu to the `Menu.buildFromTemplate([...])` array (after the `File` submenu object):

```ts
{
  label: "Commands",
  submenu: [
    {
      label: "Run Command…",
      accelerator: "CmdOrCtrl+Shift+P",
      registerAccelerator: false,
      click: send("core.command.execute"),
    },
  ],
},
```

- [ ] **Step 6: Rebuild and run the e2e to verify it passes**

Run: `npm run build && npm run test:e2e -- minibuffer.spec.ts`
Expected: PASS — the palette opens, "Save" runs, and the file becomes `hello world\n`.
(If no display is available: confirm `npm run build` succeeds; the e2e is verified in CI under `xvfb`.)

- [ ] **Step 7: Full green sweep**

Run: `npm run typecheck && npm test && npm run test:browser && npm run format:check`
Expected: types clean; all node tests pass; both browser suites pass; formatting clean.
(Run `npm run format` first if `format:check` reports diffs.)

- [ ] **Step 8: Commit**

```bash
git add src/renderer/main.ts src/main/menu.ts e2e/minibuffer.spec.ts
git commit -m "Wire the command palette: Ctrl-Shift-p, menu item, and e2e smoke"
```

---

## Self-Review

**1. Spec coverage** (design doc → task):
- §1 scope (substrate + palette; `readLine`/providers/`when`/personalities out) → Tasks 1–4 build exactly `quickPick` + palette; Global Constraints pin the out-of-scope list; Task 3 states `readLine` is not implemented.
- §2 parity invariant → structural: palette runs through the one `commands`/`executeCommand` (Task 4); primitives are keymap-neutral (Tasks 1–3). The "bound in both" test is explicitly a step-4 item, not this slice.
- §3 native overlay, bottom-docked, window-level → Task 3 (`position: fixed; bottom: 0`, appended to `document.body` in Task 4).
- §4 module layout → File Structure + Tasks 1–3 paths.
- §5 primitives + `QuickPickModel` → Tasks 1–2 (types + model); `readLine` deferred (noted).
- §6 hand-rolled fuzzy matcher → Task 1; "no new dependency" in Global Constraints.
- §7 palette consumer via public API → Task 4 Step 3.
- §8 interim `Ctrl-Shift-p` + menu + local keys + modality guard → Task 3 (keys) + Task 4 (binding, menu, `isOpen()` guard).
- §9 composition-root wiring → Task 4 Steps 3–5.
- §10 three test tiers → Task 1/2 (node), Task 3 (browser), Task 4 (e2e).
- §11 security (renderer-only, no new IPC) → no IPC/preload changes in any task; only a menu item on the existing channel.

**2. Placeholder scan:** none — every code step contains complete, runnable code; every run step has an exact command and expected result.

**3. Type consistency:** `QuickPickItem`/`QuickPickOptions`/`MatchResult`/`RankedItem` defined in Task 1 and consumed unchanged in Tasks 2–3; `QuickPickModel` method names (`setQuery`, `results`, `selectedIndex`, `selected`, `moveUp`, `moveDown`) match between Task 2's definition and Task 3's usage; `fuzzyMatch` signature matches between Task 1 and Task 2; `Minibuffer.quickPick`/`isOpen` match between Task 3 and Task 4; the DOM class contract (`.coal-minibuffer.open`, `.coal-mb-input`, `.coal-mb-item`, `.coal-mb-match`, `.coal-mb-empty`) is consistent between Task 3's CSS/render and Task 3/4's test selectors. The `exactOptionalPropertyTypes` `description` handling is consistent (conditional spread in Task 4; `description?` optional everywhere).
