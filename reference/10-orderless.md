# Orderless

**What it is.** Orderless is an Emacs *completion style* by Omar Antolín Camarena (`oantolin`), distributed on GNU ELPA and part of the GNU Emacs project. A completion style is the pluggable back-end that decides **which candidates match** a given input and **how the matching portions are highlighted** — it is not a UI. Orderless splits the input into space-separated **components** and keeps every candidate that matches **all** components **in any order**, where each component may match literally, as a regexp, as an initialism, in flex style, or as word prefixes. It plugs into Emacs' stock `completion-styles` machinery, so it works uniformly under the default minibuffer TAB completion, Icomplete/`icomplete-vertical`, Mct, Vertico, and (for completion-at-point) Corfu/Company/`consult-completion-in-region`. It is the "matching brain" of the minad/oantolin minibuffer stack, orthogonal to the UI (Vertico) and to the command source (Consult).

---

## 1. Core functionality

The classic problem orderless solves: with `basic`, `substring`, or `flex` you must type the pieces of a candidate in the order they appear. Orderless removes the ordering constraint. Input `"foo bar"` matches any candidate containing **both** `foo` and `bar`, regardless of which comes first — so `M-x` `"buf list"` finds `list-buffers`, and `"win del"` finds `delete-window`. Each whitespace-separated chunk is an independent predicate; a candidate survives only if it satisfies every chunk. Because it is a genuine `completion-styles` entry, it returns the standard "completion boundaries + match data" that Emacs UIs expect, so the *same* configuration governs `M-x`, `find-file`, `switch-to-buffer`, `describe-variable`, and in-buffer symbol completion. Orderless decides matching and highlighting only; scrolling, candidate display, and annotations belong to the UI layer.

## 2. Notable / distinctive features (matching styles & dispatchers)

**Component matching styles** (each a function of one component string returning a regexp/predicate):

- `orderless-literal` — the component must occur as a literal substring.
- `orderless-literal-prefix` — the component must occur as a literal **prefix** of the candidate.
- `orderless-regexp` — the component is an arbitrary regexp matched anywhere.
- `orderless-initialism` — each character must begin a successive word in the candidate, in order (`"ct"` → `create-table`).
- `orderless-prefixes` — split the component at word boundaries; each piece must match at a word boundary (`"re-re"` → `query-replace-regexp`, PCM-style).
- `orderless-flex` — the component's characters appear in order but not necessarily consecutively (`"cnsb"` → `consult-buffer`).
- `orderless-without-literal` — negation: candidate must **not** contain the literal (used by dispatchers).
- `orderless-annotation` — matches against the candidate's *annotation* (e.g. a Marginalia suffix) rather than the candidate itself.
- `orderless-not` — wraps another matcher to invert it.

**Style dispatchers** let a single query mix styles per-component by reading a leading/trailing sigil. The default dispatcher `orderless-affix-dispatch` consults `orderless-affix-dispatch-alist`, whose out-of-the-box mapping is:

| Sigil | Style |
|-------|-------|
| `%` | `char-fold-to-regexp` (diacritic/accent-insensitive) |
| `!` | `orderless-not` (negate — exclude candidates containing it) |
| `&` | `orderless-annotation` (match the annotation) |
| `,` | `orderless-initialism` |
| `=` | `orderless-literal` |
| `^` | `orderless-literal-prefix` |
| `~` | `orderless-flex` |

A sigil may be a **prefix or a suffix** of the component; e.g. `~cnsb`, `def=`, `!test`. This gives fine-grained, per-token control (`"conf ~cb !old =.el"`) inside one query without leaving the minibuffer.

**Case behavior:** `orderless-smart-case` (default `t`) makes matching case-sensitive iff any component contains an uppercase letter (smart-case, like `M-x` search).

## 3. How it works

Orderless registers itself in `completion-styles-alist`. When the UI calls the style, orderless:

1. **Splits** the input using `orderless-component-separator` — default `#'orderless-escapable-split`, a function that splits on a non-empty run of spaces while honoring backslash-escaping so a literal space can be typed as `\ `. It may also be a plain regexp string (e.g. `" +"` for spaces or `" +\\|[-/]"` for spaces/hyphen/slash) or the shell-style `split-string-and-unquote`.
2. For each component, runs the **dispatchers** in `orderless-style-dispatchers` (default `(list #'orderless-affix-dispatch)`). A dispatcher is a function `(component index total)` returning `nil` (decline), a style symbol/list of styles to use for that component, or a cons `(STYLES . NEW-COMPONENT)` to also rewrite the component (this is how sigils are stripped before matching).
3. If no dispatcher claims the component, it is matched under **all** of `orderless-matching-styles` (default `(list #'orderless-literal #'orderless-regexp)`) — a candidate matches the component if it matches under any enabled style.
4. **Conjoins** components: a candidate is kept only if every component matches; matches are then **highlighted**, cycling through the four faces in `orderless-match-faces` (`orderless-match-face-0`…`-3`), so distinct components get distinct colors.

`orderless-expand-substring` (default `'prefix`) tunes what TAB expansion does via `orderless-try-completion`. Custom styles are minted with the `orderless-define-completion-style` macro, which snapshots any orderless variables (e.g. `orderless-matching-styles`) into a named style usable in `completion-styles`.

## 4. Configuration & usage

Minimal `use-package` setup:

```emacs-lisp
(use-package orderless
  :ensure t
  :custom
  (completion-styles '(orderless basic))
  (completion-category-overrides '((file (styles partial-completion))))
  (completion-pcm-leading-wildcard t)) ;; Emacs 31: partial-completion ≈ substring
```

Notes:
- `basic` is kept as a fallback so dynamic tables (e.g. TRAMP hostnames) still complete; some categories (files) prefer `partial-completion` first, hence the override.
- To use orderless *exclusively*, set `completion-styles` to `'(orderless)` and clear `completion-category-defaults`/`-overrides` (aware that packages mutate `completion-category-defaults` at load time).
- Key user options: `orderless-matching-styles`, `orderless-style-dispatchers`, `orderless-affix-dispatch-alist`, `orderless-component-separator`, `orderless-smart-case`, `orderless-expand-substring`, `orderless-match-faces`.

Define a per-use custom style (e.g. add initialism only where wanted):

```emacs-lisp
(orderless-define-completion-style orderless+initialism
  (orderless-matching-styles '(orderless-initialism
                               orderless-literal
                               orderless-regexp)))
(setq completion-category-overrides
      '((command (styles orderless+initialism))
        (symbol  (styles orderless+initialism))))
```

Orderless defines no keybindings and no commands — it is pure back-end.

## 5. Ecosystem & integration

Orderless is the **matcher** in the modern Emacs minibuffer stack and is deliberately orthogonal to its siblings:

- **Vertico** (see the Vertico reference) — the vertical UI that *displays and cycles* candidates; it does not reimplement matching, it defers to whatever `completion-styles` is active. Vertico + orderless is the canonical pairing.
- **Marginalia** — adds annotations (docstrings, file sizes, key bindings) in the margin; orderless can match against those annotations via `&` / `orderless-annotation`.
- **Consult** — provides the *command catalog and candidate sources* (`consult-buffer`, `consult-line`, live preview, narrowing). Orderless filters Consult's candidates; note Consult's async commands (e.g. `consult-grep`) split the query into a grep pattern + an orderless filter, so dispatchers apply to the filter half.
- **Embark** — acts on the selected candidate; unrelated to matching but part of the same "minad-adjacent" toolkit.
- **Corfu / Company** — completion-at-point UIs that reuse the same style for in-buffer completion.

Contrast with alternatives: the built-in `flex` style is single-component subsequence matching (ordered, one token); `substring`/`basic`/`partial-completion` are ordered and single-token; `flx`/`flx-ido`/`fuzzy` add scored fuzzy ranking but are Ivy/Ido-era and not `completion-styles` back-ends. Orderless is distinctive in being **multi-component + order-independent + per-component pluggable**, while intentionally *not* doing candidate ranking/scoring (ordering is the UI's or `completion`'s job; see `vertico-sort`).

## 6. Extensibility / customization

- **Dispatchers** are the primary extension point: any `(component index total)` function added to `orderless-style-dispatchers` can pick styles based on position (first component, last component), content, or arbitrary sigils, and can rewrite the component. Extend `orderless-affix-dispatch-alist` to add new sigil→style bindings without writing a dispatcher.
- **Matching styles** are just functions returning a regexp (or predicate); you can write your own and list it in `orderless-matching-styles`.
- **Named styles** via `orderless-define-completion-style` let different completion *categories* (`command`, `file`, `buffer`, `symbol`) use different orderless configs through `completion-category-overrides`.
- **Separator** swap (`orderless-component-separator`) changes tokenization (spaces vs. shell-quoting vs. custom regexp).
- **Faces** (`orderless-match-faces` vector) are themeable for the multi-color highlight.
- Non-minibuffer back-ends are supported through adapters, e.g. `orderless-ivy-re-builder` for Ivy's `ivy-re-builders-alist`.

## 7. Relevance to designing Coal (borrow / avoid)

**Worth borrowing:**
- **Order-independent, space-separated component matching** is the single highest-value idea for Coal's `M-x` registry (`src/renderer/commands.ts`) and **quick-open**, which today do plain substring matching. Replacing that with an orderless-style matcher — split the query on spaces, require every token to hit `title`/`id`, order-free — makes `"del win"`, `"win del"`, and `"open note"` all work. This is pure client-side string logic with no new dependency.
- **Per-component highlighting with cycling faces** maps cleanly onto the **Vertico-style vertical candidate list** rendered in the persistent minibuffer (`src/renderer/ui/minibuffer.ts`): highlight each matched token span in the candidate title with a small set of `--coal-*` accent classes, mirroring `orderless-match-faces`.
- **The matcher-is-separate-from-UI split** is the right architecture: keep a small pure `match(query, candidate) -> {ok, ranges}` module reused by the M-x prompt, quick-open, and the `[[uuid]]` **wikilink autocomplete** (`@codemirror/autocomplete`), and by the **backlinks navigator** (`src/renderer/ui/backlinks.ts`) filter. `@codemirror/autocomplete` already accepts a custom `filter`/scoring hook, so an orderless-style matcher slots directly into its completion source while it keeps inserting the UUID and showing the title.
- **Optional per-token styles** (a literal `=` for exact, `!` for exclude) are a cheap, discoverable power-user affordance for quick-open — but gate them behind a small, documented sigil set, not the full seven-sigil table.

**Worth avoiding / reacting to:**
- **Do not import the sigil zoo wholesale.** Orderless's `~ ! & , = ^ %` dispatch alphabet is powerful for Emacs veterans but is opaque, undiscoverable, and clashes with characters that appear in note titles and UUIDs. Coal targets keyboard-*first*, not Emacs-arcana-first; ship substring+order-free matching by default and treat sigils as opt-in.
- **Orderless does no ranking/scoring** — it only filters and highlights. Coal's quick-open needs *ordering* (recency, title-prefix, exact-hit bonus) that orderless deliberately punts to the UI. Don't assume adopting orderless-style matching gives you good candidate ordering; build ranking separately (the job Vertico's sort / `flx` scores do).
- **Regexp-as-default (`orderless-regexp`) is a footgun** for a note editor: a stray `[` or `*` in a query would either error or match surprisingly. Prefer literal + flex tokens and never expose raw-regexp matching in Coal's title search.
- **Emacs `completion-styles` category plumbing has no CM6 analogue** — don't try to port the `completion-category-overrides` indirection. In Coal the "category" is just which surface is calling (M-x vs. quick-open vs. wikilink), so pass matcher options explicitly per call site rather than through a global registry.

---

## Sources

- Orderless — GitHub repository (README.org) — https://github.com/oantolin/orderless
- Orderless README.org (raw) — https://raw.githubusercontent.com/oantolin/orderless/master/README.org
- Orderless source (`orderless.el`, defcustom/defun defaults) — https://raw.githubusercontent.com/oantolin/orderless/master/orderless.el
- GNU ELPA — orderless package page — https://elpa.gnu.org/packages/orderless.html
- GNU ELPA — orderless manual (rendered) — https://elpa.gnu.org/packages/doc/orderless/orderless.html
- emacs-straight/orderless (GNU ELPA mirror) — https://github.com/emacs-straight/orderless
