# org-appear

**What it is.** `org-appear` is a small, single-purpose Emacs minor mode by **Alice Istleyeva (awth13)** that makes the *invisible* parts of Org elements temporarily reappear when the cursor is on them. Org mode can prettify a buffer by hiding markup — `org-hide-emphasis-markers` drops the `*`/`/`/`=`/`~`/`+`/`_` emphasis delimiters, `org-link-descriptive` collapses `[[target][desc]]` to just its description, and `org-pretty-entities` renders `\alpha`/`x^2` as glyphs — but that hiding makes the underlying text *hard to edit*: you can no longer see the delimiters you need to place your cursor between. org-appear closes that gap: it watches point, and when the cursor enters a hidden element it reveals that element's raw markers, then re-hides them the moment you leave. It is the canonical Emacs implementation of the "cursor-line reveal" idea that Obsidian's Live Preview popularised, and it is the closest existing analog to Coal's own live-preview decorations. It requires Emacs 29.1+ and Org 9.3+, is MIT-licensed, and is distributed via MELPA (and GNU Guix).

---

## 1. Core functionality

- **Reveal-on-cursor, re-hide-on-leave.** The whole package is one behavior: for element types whose markup Org is currently hiding, show the raw markup of the single element the cursor sits inside, and restore the hidden state as soon as point moves out. Nothing is written to the file — it is a pure display toggle.
- **Opt-in per element type, and dependent on Org's own hiding.** org-appear only acts on element classes that Org is *already* hiding. If `org-hide-emphasis-markers` is `nil`, `org-appear-autoemphasis` has nothing to do; if `org-link-descriptive` is off, links are never collapsed so there is nothing to reveal. org-appear is a companion to Org's prettification, not a replacement for it.
- **Enabled as a buffer-local minor mode**, conventionally hooked onto `org-mode-hook` so every Org buffer gets it. By default it toggles only emphasis/verbatim markers; the other element classes are opt-in.

## 2. Notable / distinctive features

- **Five independent element toggles**, each a `defcustom`:
  - `org-appear-autoemphasis` (default `t`) — emphasis + verbatim markers (`*bold*`, `/italic/`, `=verbatim=`, `~code~`, `+strike+`, `_underline_`); pairs with `org-hide-emphasis-markers`.
  - `org-appear-autolinks` (default `nil`) — link brackets/target; pairs with `org-link-descriptive`. A **three-valued** option: `nil`, `t` (reveal full `[[target][desc]]`), or the symbol `just-brackets` (reveal the brackets but not the target URL).
  - `org-appear-autosubmarkers` (default `nil`) — subscript/superscript markers (`_` / `^`); pairs with `org-pretty-entities`.
  - `org-appear-autoentities` (default `nil`) — Org entities like `\alpha`; pairs with `org-pretty-entities`.
  - `org-appear-autokeywords` (default `nil`) — keywords hidden via `org-hidden-keywords`.
- **`org-appear-inside-latex`** (default `nil`) — extends entity/sub-superscript toggling into LaTeX fragments and environments.
- **Configurable delay.** `org-appear-delay` (default `0.0`, i.e. instantaneous) sets seconds to wait before revealing, implemented with an idle timer — useful to avoid flicker while scrolling through markup.
- **Three trigger modes.** `org-appear-trigger` (default `always`) chooses *when* revealing happens:
  - `always` — toggle every time an element is under the cursor.
  - `on-change` — only reveal after a buffer edit (and disables the delay); keeps the buffer clean during pure navigation.
  - `manual` — org-appear does nothing until you call `org-appear-manual-start`, and stops on `org-appear-manual-stop`. Designed for modal setups (e.g. reveal only in Evil *insert* state). `org-appear-manual-linger` (default `nil`) controls whether a revealed element stays visible when you navigate away after a manual stop.
- **Known limitation:** it cannot correctly handle *overlapping/nested* emphasis, because it relies on Org's `org-element-context`, which does not disambiguate such cases.

## 3. How it works

- **Point-driven, via the command loop.** The mode registers `org-appear--post-cmd` on `post-command-hook`: after every command it asks `org-element-context` which Org element point is inside, compares it to the previously-toggled element (tracked in the buffer-local `org-appear--prev-elem`), and if point has crossed into a new hideable element it reveals it and re-hides the old one.
- **Reveal = removing Org's own invisibility.** Org hides markup with `font-lock`/text properties and the `invisible` property (e.g. the `org-link` invisibility spec). org-appear reveals an element by clearing that invisible state over the element's markers, then reasserting it when point leaves — it does not paint its own overlays over the text so much as *undo Org's hiding* for one element at a time.
- **Pre-command safety.** `org-appear--pre-cmd` on `pre-command-hook` re-hides the current element before commands like `org-fill-paragraph` and `org-ctrl-c-ctrl-c` run, so those operations see the normal prettified buffer.
- **On-change / delay plumbing.** With `on-change` it also hooks `after-change-functions` (and `mouse-leave-buffer-hook`); with a non-zero `org-appear-delay` it schedules the reveal through `run-with-idle-timer`, storing the handle in the buffer-local `org-appear--timer`.
- **Small, single-file package** (`org-appear.el`, currently v0.3.1) with a handful of buffer-local state vars (`org-appear--do-buffer`, `org-appear--elem-toggled`, etc.) and a `defvar` list `org-appear-elements` mapping element types to their toggle logic.

## 4. Configuration & usage

Minimal setup — enable the mode in every Org buffer:

```emacs-lisp
(add-hook 'org-mode-hook 'org-appear-mode)
```

Idiomatic `use-package`, turning on the opt-in element classes:

```emacs-lisp
(use-package org-appear
  :hook (org-mode . org-appear-mode)
  :config
  (setq org-appear-autolinks t          ; also reveal link brackets/target
        org-appear-autosubmarkers t     ; and sub/superscript markers
        org-appear-autoentities t
        org-appear-autokeywords t
        org-appear-delay 0.0            ; instantaneous (the default)
        org-appear-trigger 'always))    ; the default
```

For a modal (Evil) workflow — reveal markup only while editing in Insert state:

```emacs-lisp
(setq org-appear-trigger 'manual)
(add-hook 'org-mode-hook
          (lambda ()
            (add-hook 'evil-insert-state-entry-hook #'org-appear-manual-start nil t)
            (add-hook 'evil-insert-state-exit-hook  #'org-appear-manual-stop  nil t)))
```

Key variables at a glance: `org-appear-autoemphasis` (`t`), `org-appear-autolinks` (`nil`/`t`/`just-brackets`), `org-appear-autosubmarkers` (`nil`), `org-appear-autoentities` (`nil`), `org-appear-autokeywords` (`nil`), `org-appear-inside-latex` (`nil`), `org-appear-delay` (`0.0`), `org-appear-trigger` (`always`/`on-change`/`manual`), `org-appear-manual-linger` (`nil`). Commands: `org-appear-mode` (the minor mode toggle), `org-appear-manual-start`, `org-appear-manual-stop`. Remember the litmus: if the corresponding Org hiding variable (`org-hide-emphasis-markers`, `org-link-descriptive`, `org-pretty-entities`, `org-hidden-keywords`) is off, the matching org-appear toggle has no effect.

## 5. Ecosystem & integration

- **Companion to Org's prettification, not a standalone feature.** org-appear is meaningless without Org's own hiding variables; it is the "editability" half of a two-part setup where Org supplies the clean rendered view and org-appear supplies on-demand access to the raw markup. It composes with `org-modern`/`org-superstar` (which restyle headings/bullets) since those touch different element parts.
- **Sibling to `toc-org`** in the "Org quality-of-life" cluster (see `reference/11-toc-org.md`): both are focused, single-file Org add-ons, but they are complementary opposites — toc-org *writes* a generated table of contents back into the file under a `:TOC:` heading (a file-mutating feature), whereas org-appear only changes *display* and never edits the buffer.
- **Orthogonal to the minad minibuffer stack** — Vertico, Marginalia, Consult, Orderless, Embark (see the `reference/` files for each). org-appear operates entirely in the *editor buffer* on point-motion, not in the minibuffer or the completion pipeline, so it shares no machinery with them; it is grouped with them here only because it is part of the same "modern Emacs writing setup" a knowledge-worker assembles.
- **Modal-editor integration** is a first-class use case via `org-appear-trigger 'manual` + `org-appear-manual-start/stop`, most commonly wired to Evil's insert-state hooks (shown above).

## 6. Extensibility / customization

- **Extension surface is deliberately narrow.** The public knobs are the nine `defcustom`s plus the two manual commands; there is no plugin/source/dispatcher API. The `org-appear-elements` `defvar` internally enumerates which Org element types are handled and how they are shown/hidden, so adding a new element class means teaching org-appear (or its upstream) about another `org-element` type.
- **Trigger + delay are the main tuning axes.** Combining `org-appear-trigger` (`always`/`on-change`/`manual`), `org-appear-delay`, and `org-appear-manual-linger` lets you tune the reveal from "instant on hover" to "only after edits" to "fully under program control."
- **Hooks as integration points.** Because start/stop are ordinary interactive functions, any mode or state machine (Evil, meow, a custom minor mode) can drive revealing by calling `org-appear-manual-start`/`org-appear-manual-stop` from its own hooks.

## 7. Relevance to designing Coal (borrow / avoid)

**Worth borrowing**

- **org-appear is the direct Emacs precedent for Coal's live-preview cursor-line reveal** (`src/renderer/editor/`, SPEC §6/§13). Coal already hides markdown syntax markers, inline link/image URLs, and the inline `^id:<uuid>` / UUID markers via CM6 view-only decorations and reveals raw markers only on the cursor line. org-appear validates that exact model and supplies a vocabulary for it: think in terms of independent, per-element-class toggles (emphasis vs. link vs. id-marker vs. keyword), each of which can be revealed independently — mirroring Coal's separate decoration passes.
- **Per-element-class opt-in flags.** org-appear's `autoemphasis`/`autolinks`/`autosubmarkers`/`autoentities`/`autokeywords` map cleanly onto Coal settings (surfaced via `M-x` "Settings"): e.g. distinct toggles for "reveal emphasis markers on the cursor line," "reveal inline link URLs," "reveal `^id:` block ids." The `autolinks` three-valued design (`nil`/`t`/`just-brackets`) is a concrete idea for Coal's inline-link reveal: reveal the full `[text](url)` vs. only the syntax scaffolding.
- **`org-appear-trigger` and `org-appear-delay` as UX safety valves.** The `on-change` mode (reveal only after an edit, not during pure navigation) and a small idle delay are worth stealing to prevent decoration flicker as the caret scans through markup in the CM6 editor — a debounce on the reveal, keyed off CM6's `updateListener`/selection changes rather than `post-command-hook`.
- **Cursor-granularity, not line-granularity, is the Emacs default.** org-appear reveals the *single element under point*, which is tighter than Coal's current whole-cursor-*line* reveal. Worth evaluating: revealing only the element/token the caret is inside would hide less and read cleaner, and CM6's syntax tree (`syntaxTree`/`nodeAt`) makes "the element at cursor" as cheap to compute as org-appear's `org-element-context`.

**Worth avoiding / reacting to**

- **Don't inherit the `org-element-context` overlap limitation.** org-appear cannot handle nested/overlapping emphasis because Org's element parser won't disambiguate it. Coal's reveal is decoration-driven off CM6's own incremental Lezer parse tree, so it should handle nested markdown emphasis natively — treat this as a bug class to test against, not to replicate.
- **`post-command-hook` polling is an Emacs idiom, not a CM6 one.** org-appear recomputes on every command; in CM6 the equivalent is a `ViewPlugin` that recomputes decorations only from `ViewUpdate`s where the selection or doc changed. Don't port the polling model — use CM6's update-driven decoration recompute (Coal already does this).
- **org-appear is display-only by construction — keep it that way.** Unlike its sibling `toc-org`, org-appear never mutates the buffer. That discipline aligns exactly with Coal's non-negotiables (byte-for-byte round-trip §14; the index is derived; view-only decorations). Any reveal feature Coal borrows must stay a pure display concern and never touch file bytes.
- **This is an *editor-surface* idea, not a minibuffer one.** org-appear has no bearing on Coal's persistent minibuffer (`src/renderer/ui/minibuffer.ts`), the `M-x` command registry (`src/renderer/commands.ts`), quick-open, the `[[uuid]]` wikilink autocomplete (`@codemirror/autocomplete`, showing titles while inserting UUIDs), or the backlinks navigator (`src/renderer/ui/backlinks.ts`). Don't over-generalize its reveal mechanism into those surfaces; its lesson is confined to the CM6 decoration layer.

---

## Sources

- org-appear — GitHub repository (awth13): https://github.com/awth13/org-appear
- org-appear — README.org: https://github.com/awth13/org-appear/blob/master/README.org
- org-appear.el — source (defcustoms, hooks, version 0.3.1): https://github.com/awth13/org-appear/blob/master/org-appear.el
- "My Emacs package of the week: org-appear" — Marcel Kapfer: https://mmk2410.org/2022/02/05/my-emacs-package-of-the-week-org-appear
- org-appear — MELPA: https://melpa.org/#/org-appear
- org-appear — cadr.xyz package search: https://pkgs.cadr.xyz/package/org-appear
