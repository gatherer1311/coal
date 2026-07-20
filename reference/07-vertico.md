# Vertico

**What it is.** Vertico (VERTical Interactive COmpletion) is a minibuffer completion UI for Emacs by Daniel Mendler (`minad`), the same author as Consult, Marginalia, Corfu, and Embark's sibling tooling. It displays the candidates of any `completing-read` prompt as a scrollable **vertical list** under the minibuffer prompt, with the current candidate highlighted and navigable by `C-n`/`C-p`. Its defining stance is *minimalism through reuse*: rather than reimplementing completion the way Helm and Ivy do, Vertico is a thin UI layer (~600 lines of code, excluding whitespace and comments) built strictly on Emacs' built-in `completing-read`, completion tables, and `completion-styles` machinery. That gives it full compatibility with every existing Emacs completion command and table for free, and makes it one composable piece of a larger "modern completion" stack (Vertico + Orderless + Marginalia + Consult + Embark) where each package owns exactly one concern. It is distributed on GNU ELPA (current version 2.10, 2026-06-05) under GPL-3.0-or-later.

---

## 1. Core functionality

Vertico replaces the default single-line `*Completions*` buffer / `icomplete` interaction with an always-visible vertical candidate list. Enable it globally with `(vertico-mode)`; from then on **every** command that calls `completing-read` — `M-x`, `find-file`, `switch-to-buffer`, `describe-function`, package menus, third-party commands — renders through Vertico with no per-command configuration. As you type in the minibuffer, the list filters live according to the active `completion-styles`; you move the selection with the arrow keys or `C-n`/`C-p`, and commit. The prompt line shows the current candidate index and the total count (e.g. `3/128`), and the number of visible rows is bounded by `vertico-count` (default 10). Because Vertico only draws candidates that Emacs' own completion API produces, "what can I complete here" is always identical to vanilla Emacs — Vertico changes presentation and navigation, not semantics.

## 2. Notable / distinctive features

- **Built on native infrastructure, not a reimplementation.** Vertico consumes the standard completion table + `completion-styles` pipeline. Helm/Ivy maintain their own matching/sorting/action layers; Vertico deliberately does not, which is why it is tiny and why it interoperates with arbitrary completion tables and predicates.
- **`TAB` inserts, `RET` exits.** A key behavioral distinction: in Vertico `TAB` (`vertico-insert`) inserts the *currently selected candidate* into the minibuffer, whereas vanilla Emacs `TAB` performs prefix expansion. `RET` (`vertico-exit`) exits with the selection; `M-RET` (`vertico-exit-input`) exits with the raw typed input even if it is not a candidate (essential for creating new files/notes). Users who want classic prefix completion can rebind `TAB` to `minibuffer-complete`.
- **Sorting by history, then length/alphabetical.** Candidates default to history-position-first ordering, so pairing with `savehist-mode` (persist `minibuffer-history`) materially improves ranking. The `vertico-sort` extension exposes the tuned sort functions.
- **Candidate grouping** via `vertico-group-format`, with `forward-paragraph`/`backward-paragraph` bound to `vertico-next-group`/`vertico-previous-group` to jump between groups (e.g. Consult's grouped sources).
- **A rich set of optional, orthogonal extensions** shipped in the same repo (`extensions/`) but inactive by default — see §6. This is the "small core, opt-in surface" model.

## 3. How it works

Vertico installs itself as a global minor mode that hooks minibuffer setup. On each command it reads the completion **collection/table**, applies the user's `completion-styles` (e.g. `basic`, `partial-completion`, or `orderless`) to produce the filtered, highlighted candidate set, sorts it, and overlays the top `vertico-count` candidates as an after-string in the minibuffer. Keystrokes update the input; Vertico recomputes the filtered set and repaints. Crucially the *matching* is delegated: the completion style decides which candidates match and how match components are highlighted — Vertico just renders. Options tune the drawing: `vertico-resize` (let the minibuffer grow/shrink to fit), `vertico-cycle` (wrap `vertico-next`/`vertico-previous` at the ends), `vertico-scroll-margin`, `vertico-count-format` (the `n/total` indicator), `vertico-group-format`, and `vertico-preselect` (which entry starts selected — e.g. `'prompt` to preselect the typed input, useful for commands like `org-refile`). Because everything routes through `completing-read`, deleting the derived state and starting a fresh Emacs session reproduces identical behavior — there is no hidden index or parallel model.

## 4. Configuration & usage

Default keybindings (active inside a Vertico minibuffer):

| Key | Command | Effect |
| --- | --- | --- |
| `C-n` / `↓` | `vertico-next` | next candidate |
| `C-p` / `↑` | `vertico-previous` | previous candidate |
| `TAB` | `vertico-insert` | insert selected candidate into input |
| `RET` | `vertico-exit` | exit with selected candidate |
| `M-RET` | `vertico-exit-input` | exit with raw typed input |
| `M-<` / `M->` | `vertico-first` / `vertico-last` | jump to first/last |
| `C-v` / `M-v` | `vertico-scroll-up` / `vertico-scroll-down` | page the list |
| `M-w` | `vertico-save` | copy current candidate to kill-ring |

Key user options: `vertico-count` (visible rows, default 10), `vertico-resize`, `vertico-cycle`, `vertico-scroll-margin`, `vertico-count-format`, `vertico-preselect`.

Minimal `use-package` setup (history persistence matters because Vertico sorts by history):

```elisp
(use-package vertico
  :ensure t
  :custom
  (vertico-count 15)
  (vertico-resize t)
  (vertico-cycle t)
  :init
  (vertico-mode))

(use-package savehist          ; built-in; needed for good history-based ordering
  :init (savehist-mode))

(use-package orderless         ; matching style, NOT part of vertico
  :custom
  (completion-styles '(orderless basic))
  (completion-category-overrides '((file (styles partial-completion)))))
```

## 5. Ecosystem & integration

Vertico is deliberately one layer of the **minad minibuffer stack**, where each package owns a single concern and they compose through native Emacs facilities rather than a private API:

- **Orderless** (see the sibling completion-styles notes) — a `completion-style`, not a UI. It provides space-separated, out-of-order, multi-component matching with pluggable "style dispatchers." Vertico renders whatever Orderless matches; you could swap in `flex` or `basic` and Vertico is unchanged.
- **Marginalia** — an *annotator* that decorates each candidate with rich right-aligned metadata (docstrings for commands, file sizes/permissions, buffer major-modes). It registers via `marginalia-mode` and Vertico simply displays the annotated strings.
- **Consult** — a catalogue of enhanced `completing-read` *commands* (`consult-buffer`, `consult-line`, `consult-ripgrep`, `consult-imenu`) featuring live preview and narrowing keys. Consult supplies candidate *sources*; Vertico supplies the list UI.
- **Embark** — turns the selected candidate (or the whole list) into an *action* target (`embark-act`, `embark-dwim`, `embark-collect`), like a context menu / right-click for the minibuffer.

The division of labor: **Vertico = presentation, Orderless = matching, Marginalia = annotation, Consult = command sources, Embark = actions.** None of them reimplements `completing-read`; that is the whole point and the contrast with monolithic Helm/Ivy. Alternatives Vertico positions itself against: the built-in `icomplete`/`icomplete-vertical-mode` (more bare-bones), `mct` (Minibuffer and Completions in Tandem, uses the real `*Completions*` buffer), `ido`, and **Selectrum**, Vertico's own deprecated predecessor (a migration guide is provided).

## 6. Extensibility / customization

The core is fixed and small; nearly all UI variation lives in opt-in extensions shipped in `extensions/` (loaded but inactive until enabled):

- **vertico-directory** — Ido-like path editing for `find-file`: `RET` = `vertico-directory-enter` (descend into a directory instead of exiting), `DEL` = `vertico-directory-delete-char`, `M-DEL` = `vertico-directory-delete-word` (delete a whole path segment); `vertico-directory-tidy` on `rfn-eshadow-update-overlay-hook` cleans shadowed `//`/`~` prefixes.
- **vertico-multiform** — `vertico-multiform-mode` lets you set the display mode *per command or per completion category* via `vertico-multiform-commands` and `vertico-multiform-categories` (e.g. grid for `yank-pop`, buffer for `consult-imenu`), plus buffer-local overrides like `vertico-sort-function`.
- **vertico-buffer** — render the candidate list in a normal buffer/window instead of the minibuffer.
- **vertico-grid** — multi-column grid layout. **vertico-flat** — single-line horizontal (Ido-style) display. **vertico-reverse** — reverse row order. **vertico-unobtrusive** — show only the top candidate.
- **vertico-quick** — Avy-style quick-key selection: `vertico-quick-jump`, `vertico-quick-exit`, `vertico-quick-insert`.
- **vertico-indexed** — prefix-number selection of candidates. **vertico-mouse** — mouse scroll/click selection.
- **vertico-repeat** — resume a past session: `vertico-repeat`, `vertico-repeat-previous`, `vertico-repeat-next`, `vertico-repeat-select` (pick from history); requires registering `vertico-repeat-save` on `minibuffer-setup-hook`. **vertico-suspend** — suspend and later restore an in-progress session. **vertico-sort** — the tuned history/length/lexical sort functions.

Because matching and annotation are external, deeper customization happens in the *other* packages (Orderless dispatchers, Marginalia annotators, Consult sources, Embark actions) rather than inside Vertico.

## 7. Relevance to designing Coal (borrow / avoid)

**Worth borrowing:**
- **The vertical candidate list model directly validates Coal's minibuffer (`src/renderer/ui/minibuffer.ts`).** Coal already renders M-x / quick-open candidates as a "vertico-style vertical list" without stealing editor focus — that is exactly Vertico's UX. Borrow the concrete details: a bounded visible window (`vertico-count`), a `n/total` count indicator, wrap-around cycling (`vertico-cycle`), and `C-n`/`C-p` + `C-v`/`M-v` navigation as the keyboard contract for the list.
- **The `TAB` inserts / `RET` exits / `M-RET` exits-with-raw-input split is the right primitive for quick-open and `[[uuid]]` wikilink autocomplete.** Coal's wikilink completion (via `@codemirror/autocomplete`) shows titles but inserts UUIDs; a Vertico-like separation — commit the selected candidate vs. commit the literal typed text — gives a clean path to "link to an existing note" vs. "create a new note with this title," matching `vertico-exit` vs. `vertico-exit-input`.
- **Sort-by-history.** Vertico's reliance on `savehist` for ranking is a cheap, high-value idea: order Coal's M-x registry and quick-open results by recency of use, persisted in the vault-local cache (never committed, per SPEC §10). No fuzzy engine required to feel smart.
- **Multiform / opt-in extensions as a design ethos.** Keep Coal's minibuffer core minimal and push variants (grid, buffer view, quick-keys) behind opt-in flags rather than baking them in — this mirrors Vertico's "~600-line core + extensions" discipline and fits SPEC §13's vanilla-DOM, no-framework chrome.
- **The composable-stack separation of concerns** is a template for Coal's own surfaces: the minibuffer (presentation) should stay independent of matching, of candidate *sources* (M-x registry in `src/renderer/commands.ts`, note titles for quick-open, `src/renderer/ui/backlinks.ts` for navigation), and of any future annotation layer — so each can evolve alone.

**Worth avoiding / reacting to:**
- **Vertico's matching is delegated to `completion-styles`, so out of the box it is prefix/`basic` matching — Coal today is likewise plain substring.** The lesson: Vertico stays great *only because* Orderless is a separate, swappable style. Coal should treat fuzzy/orderless-style matching as an isolated module it can add later behind the same candidate interface, not weld a matcher into the minibuffer.
- **Don't confuse the layers.** Vertico deliberately has *no* annotations (that is Marginalia) and *no* actions (that is Embark). Coal has no annotations on candidates today; if/when it adds them, keep them a separate concern the minibuffer merely renders, rather than growing the list widget into a mini-Helm.
- **Emacs-specific affordances that don't map to a CM6/Electron world:** `minibuffer-setup-hook` registration (vertico-repeat), overlay/after-string drawing, and `rfn-eshadow` path shadowing are Emacs-internal. Coal's equivalents are vanilla DOM for the minibuffer chrome and `@codemirror/autocomplete` for in-editor completion — borrow the *behaviors* (path-segment delete like vertico-directory; session-repeat like vertico-repeat) but implement them web-natively, not by porting elisp mechanisms.
- **Scope creep via extensions.** Vertico ships ~13 extensions; a from-scratch editor should resist shipping grid/flat/reverse/mouse variants prematurely. Coal's keyboard-first mandate (SPEC §1/§3) means vertico-mouse-style interactions are explicitly low priority.

---

## Sources

- Vertico — GitHub README (minad/vertico) — https://github.com/minad/vertico
- Vertico README.org (rendered) — https://github.com/minad/vertico/blob/main/README.org
- GNU ELPA — vertico package page (version, maintainer, license) — https://elpa.gnu.org/packages/vertico.html
- GNU ELPA — vertico.el rendered manual — https://elpa.gnu.org/packages/doc/vertico.html
- vertico-repeat.el source (commands + GPL header) — https://raw.githubusercontent.com/minad/vertico/main/extensions/vertico-repeat.el
- vertico-quick.el source (commands) — https://raw.githubusercontent.com/minad/vertico/main/extensions/vertico-quick.el
- vertico-directory.el source — https://github.com/minad/vertico/blob/main/extensions/vertico-directory.el
- Guide to Modern Emacs Completion: vertico, corfu & friends — https://jneidel.com/guide/emacs-completion/
- Streamline Your Emacs Completions with Vertico — System Crafters — https://systemcrafters.net/emacs-tips/streamline-completions-with-vertico/
