# Marginalia

**What it is.** Marginalia (`marginalia.el`) is an Emacs package by Omar Antolín Camarena and Daniel Mendler (minad) that adds *marginalia* — colorful, informative annotations shown in the margin — to minibuffer completion candidates. The name is the book-printing term for marks and notes written at the margin of a page; here they are the extra text shown to the right of each candidate: docstrings next to `M-x` commands, key bindings, file sizes/permissions/modification dates, buffer major-modes and sizes, variable values, package descriptions, face samples, and more. It is a small, focused, **UI-only decoration layer**: it never changes which candidates appear, never reorders or filters them, and never touches the candidate text itself — it only *appends* an annotation string. It is one of the four pillars of minad's modular minibuffer stack (Vertico + Marginalia + Consult + Orderless, often with Antolín's Embark) and works with any completion UI — Vertico, Mct, Icomplete, or the default `*Completions*` buffer — because it hooks Emacs' generic completion metadata rather than a specific front-end.

---

## 1. Core functionality

Marginalia's single job is to enrich the minibuffer with per-candidate annotations for **any** `completing-read` call, without the calling command having to opt in. When `marginalia-mode` (a **global** minor mode) is on, it advises Emacs' completion-metadata lookup so that whenever a completion table is presented, Marginalia supplies an `annotation-function`/`affixation-function` that decorates each candidate. The result: `M-x` shows command docstrings and their key bindings; `find-file` shows permissions, size, and relative age; `switch-to-buffer` shows major mode, size, and file path; `describe-variable` shows the live value; `describe-face` shows a sample rendered in that face; `package-install` shows the one-line package summary. Crucially, Marginalia states its own limit plainly: *"Marginalia can only add annotations to the completion candidates. It cannot modify the appearance of the candidates themselves, which are shown unaltered as supplied by the original command."*

## 2. Notable / distinctive features

- **Category-driven annotators.** Annotations are chosen by the *completion category* of the candidates — `command`, `file`, `variable`, `face`, `buffer`, `package`, `symbol`, `color`, `bookmark`, etc. `find-file` reports the `file` category and `M-x` reports the `command` category; Marginalia maps each category to an annotator function.
- **Rich by default, with light/builtin/none fallbacks.** Marginalia enables its *rich* annotators by default. Every category in the registry also carries the `builtin` annotator (whatever Emacs itself would show) and `none` (annotations off), so verbosity can be dialed down globally or per category.
- **`marginalia-cycle` — per-category verbosity switch.** Bound in the minibuffer (the README binds `M-A`), `marginalia-cycle` rotates through the annotators defined for the *current* candidate category live, without leaving the prompt — e.g. cycle a symbol between full/light/builtin/off.
- **Sensitive-value censoring.** `marginalia-censor-variables` hides the values of variables whose names match regexps (passwords, API keys, auth-source nonces) so `describe-variable` annotations never leak secrets.
- **Alignment control.** `marginalia-align` (`left`/`center`/`right`) plus `marginalia-align-offset`, `marginalia-field-width`, and `marginalia-separator` govern column layout; fields are truncated to fit the window.
- **Symbol class glyphs.** For Elisp symbols the annotation includes a one-letter class — `v` variable, `f` function, `c` command, etc. (see `marginalia--symbol-class`).
- **Relative file ages.** The file annotator shows a human "2d ago"-style age up to `marginalia-max-relative-age` (default 14 days), then an absolute date.
- **Composability.** It is purely additive decoration, so it stacks cleanly with Vertico (vertical UI), Orderless (matching), Consult (commands), and Embark (actions) — see §5.

## 3. How it works

The mechanism is Emacs' own completion-metadata protocol, hooked from the outside:

1. A command calls `completing-read` with a completion table whose metadata may declare a **category** (e.g. `command`, `file`).
2. Many builtin commands *fail* to declare a category. To compensate, `marginalia-mode` runs the functions in `marginalia-classifiers` to infer one:
   - `marginalia-classify-by-command-name` consults the `marginalia-command-categories` alist (keyed on `this-command`).
   - `marginalia-classify-by-prompt` matches the minibuffer prompt against the `marginalia-prompt-categories` regexp alist (e.g. `"\\<face\\>" → face`).
   - plus `marginalia-classify-original-category` and `marginalia-classify-symbol`.
3. With a category in hand, Marginalia looks it up in `marginalia-annotators` and selects the current annotator (the first symbol in that category's list).
4. Marginalia advises the completion-metadata getter so that it returns its own `affixation-function`/`annotation-function`, which invokes the chosen annotator per candidate. An **annotator** is just a function taking a candidate string and returning an annotation string (`affixation-function` can also add a prefix, which is how icon packages hang off it).

Because it operates entirely through this standard metadata layer, it is UI-agnostic — the annotation string is rendered by whatever completion front-end is active. Annotator functions run in the original window/buffer (so buffer-local values annotate correctly). A small results cache (`marginalia--cache-size`) keeps heavy annotators responsive.

## 4. Configuration & usage

Available from **GNU ELPA** and **MELPA** via `package-install`. Minimal recommended setup, straight from the README:

```emacs-lisp
;; Enable rich annotations using the Marginalia package
(use-package marginalia
  ;; Bind `marginalia-cycle' locally in the minibuffer.  To make the binding
  ;; available in the *Completions* buffer, add it to the
  ;; `completion-list-mode-map'.
  :bind (:map minibuffer-local-map
         ("M-A" . marginalia-cycle))
  :init
  (marginalia-mode))
```

Key surfaces:

- **Command:** `marginalia-mode` — global toggle. `marginalia-cycle` — cycle annotators for the current category (its `M-A` binding is a user choice, not a default global key).
- **Registry:** `marginalia-annotators` — the alist mapping each category to its ordered list of annotator functions (rich → … → `builtin` → `none`).
- **Classification:** `marginalia-classifiers`, `marginalia-prompt-categories`, `marginalia-command-categories`.
- **Layout:** `marginalia-align`, `marginalia-align-offset`, `marginalia-field-width`, `marginalia-separator`.
- **Behavior:** `marginalia-max-relative-age`, `marginalia-remote-file-regexps`, `marginalia-censor-variables`.

To make the *builtin* annotators the default everywhere, rotate each registry entry so `builtin` is first (replace with `none` to default to no annotations):

```emacs-lisp
(mapc (lambda (x)
        (setcdr x (cons 'builtin (remq 'builtin (cdr x)))))
      marginalia-annotators)
```

## 5. Ecosystem & integration

Marginalia is deliberately one clean slice of minad's à-la-carte minibuffer stack, and it is *only* the annotation slice:

- **Vertico** (see `07-vertico.md`) — the vertical completion UI. Vertico renders candidates; Marginalia supplies the annotations Vertico shows on each row. Neither reimplements Emacs completion; both hook the standard metadata.
- **Orderless** (see `10-orderless.md`) — a *completion style* (matching only). It decides which candidates match; Marginalia decorates whatever survives. Orthogonal concerns, zero coupling.
- **Consult** — provides the rich command catalog (`consult-buffer`, `consult-line`, …) with live preview and narrowing. Consult commands attach categories, which Marginalia then annotates. Consult authors can pass `:annotate` to `consult--read` for command-specific annotations.
- **Embark** — action dispatch. Embark keys actions off the *completion category*, the same categories Marginalia classifies; Marginalia's classifiers therefore directly improve Embark. Marginalia even ships an `embark-keybinding` annotator.
- **Alternatives it coexists with:** Mct, Icomplete, and the default `*Completions*` buffer — Marginalia works with all of them.
- **Icons:** Marginalia is text-only by design; `nerd-icons-completion` composes with it to add glyphs *in front of* candidates via the `affixation-function` prefix.

Contrast with the sibling Org packages in this reference set (`toc-org`, `org-appear`): those manipulate buffer text/overlays in a file, whereas Marginalia never writes anything and never touches the file — it decorates a transient minibuffer only.

## 6. Extensibility / customization

- **Custom annotators.** Write a function `(cand) → annotation-string` and register it at the head of a category's list, keeping the shipped rich/`builtin`/`none` fallbacks:

  ```emacs-lisp
  (defun my-face-annotator (cand)
    (when-let* ((sym (intern-soft cand)))
      (concat (propertize " " 'display '(space :align-to center))
              (propertize "The quick brown fox jumps over the lazy dog" 'face sym))))

  (add-to-list 'marginalia-annotators
               '(face my-face-annotator marginalia-annotate-face builtin none))
  ```

- **Custom classifiers.** Add prompt regexps or command→category mappings so more commands get annotated:

  ```emacs-lisp
  (add-to-list 'marginalia-prompt-categories '("\\<face\\>" . face))
  ```

- **Disable per category.** `(setq marginalia-annotators (assq-delete-all 'file marginalia-annotators))`.
- **Persist cycling.** Advise `marginalia-cycle` to call `customize-save-variable` so a chosen annotator sticks across sessions.
- **Author guidance (important).** The maintainers state Marginalia is a **user-facing package, not a library** — it exposes no public API. Package authors should instead give their own `completing-read` calls an `annotation-function`/`affixation-function` (documented in the Elisp manual) rather than depend on Marginalia. Writing a `marginalia-foo.el` is only endorsed to retrofit annotations onto some *other* package that cannot add its own.

## 7. Relevance to designing Coal (borrow / avoid)

**Worth borrowing:**

- **Annotations on completion candidates are Coal's single biggest missing affordance.** Coal's minibuffer (`src/renderer/ui/minibuffer.ts`) renders M-x and quick-open candidates as a Vertico-style vertical list with *no* annotations today. Borrow Marginalia's core idea: for each M-x command (from the `src/renderer/commands.ts` registry) show a short description in a dimmed right/second column; for quick-open note-title candidates show metadata (last-modified relative age à la `marginalia-max-relative-age`, backlink count, or note type). This is purely additive and web-native — an extra `<span class="coal-annotation">` per row.
- **Category-driven annotators as a clean abstraction.** Coal's candidate sources already differ (commands vs. note titles vs. `[[uuid]]` wikilink targets). Model an "annotator by candidate kind" map so each surface decorates its own rows, mirroring `marginalia-annotators` keyed by category — one dispatch point instead of ad-hoc per-list code.
- **Annotate wikilink autocomplete.** The `[[uuid]]` autocomplete via `@codemirror/autocomplete` already shows note titles while inserting the UUID; `Completion` objects carry a native `detail`/`info` field. Use it to append the same margin metadata (type, age, backlink count) to each suggestion — the CM6-native equivalent of a Marginalia file/buffer annotator.
- **Verbosity cycling (`marginalia-cycle`).** A single keybinding in the minibuffer to toggle "show descriptions on/off" (or terse/rich) is a cheap, high-value control; wire it to the same annotator-map so it flips a verbosity flag per candidate kind.
- **Sensitive-value censoring** — if Coal ever annotates config/frontmatter values, copy the `marginalia-censor-variables` regexp-deny idea so tokens/keys never render in the picker.
- **UI-only, non-destructive discipline.** Marginalia never mutates the underlying data — exactly the invariant Coal must keep: annotations are transient chrome, never written to the markdown (SPEC §10/§14 byte-for-byte).

**Worth avoiding / reacting to:**

- **Don't route annotations through Emacs' completion-metadata indirection.** Marginalia's advice-on-`completion-metadata-get` + classifiers exist only to retrofit annotations onto commands that *forgot* to declare a category. Coal owns every candidate source directly, so attach annotations at the source (in the command/quick-open/CAP producer). Prompt-regexp classification (`marginalia-prompt-categories`) is a fragile workaround Coal has no reason to replicate.
- **Keep annotators cheap and non-blocking.** Marginalia needs a cache and light/heavy variants because some annotators are expensive. In Coal's single-threaded renderer, an annotator that stats files or counts backlinks per keystroke will jank the minibuffer — precompute metadata into the in-memory index and read it synchronously, or defer heavy fields.
- **Don't over-columnize.** Marginalia's `marginalia-align`/`field-width` machinery fights a terminal-ish fixed-width layout. Coal is DOM/CSS (SPEC §13): lean on flexbox/grid for alignment and ellipsis rather than porting character-width truncation logic.
- **Resist annotating the live-preview editor surface.** Marginalia is minibuffer-only; the temptation to show margin metadata inline in the CM6 editor (`src/renderer/editor/`) is a different, heavier problem (decorations/widgets, cursor-line reveal) — keep candidate annotations to the minibuffer and picker, and treat in-editor metadata as a separate typed-object feature.
- **It is decoration, not matching or navigation.** Marginalia does *not* fuzzy-match, rank, or filter — that is Orderless/Vertico's job. Coal should not conflate adding annotations with the still-open work of upgrading M-x/quick-open from substring to fuzzy/orderless-style matching, nor with the backlinks navigator (`src/renderer/ui/backlinks.ts`); annotations enrich rows, they don't decide which rows appear.

---

## Sources

- Marginalia README (official GitHub, minad/marginalia) — https://github.com/minad/marginalia
- Marginalia source (`marginalia.el`, registry/defcustoms/`marginalia-cycle`) — https://raw.githubusercontent.com/minad/marginalia/main/marginalia.el
- GNU ELPA — Marginalia package page — https://elpa.gnu.org/packages/marginalia.html
- MELPA — Marginalia — https://melpa.org/#/marginalia
- Emacs Lisp manual — Programmed Completion (`annotation-function` / `affixation-function`) — https://www.gnu.org/software/emacs/manual/html_node/elisp/Programmed-Completion.html
- Vertico (companion completion UI) — https://github.com/minad/vertico
- Consult (companion command set) — https://github.com/minad/consult
- Embark (action dispatch, shares completion categories) — https://github.com/oantolin/embark
