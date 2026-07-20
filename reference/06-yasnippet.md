# YASnippet

**What it is.** YASnippet ("Yet Another Snippet extension") is a template/abbreviation-expansion system for Emacs: you type a short *key* (e.g. `if`), press `TAB`, and it expands into a multi-line template with tab-through *fields*, *mirrors*, *transformations*, and embedded Emacs-Lisp. Its snippet grammar is modelled on TextMate's, so `$1`/`$2`/`$0` tab stops, `${1:default}` placeholders, and `${1:$(...)}` transforms will look familiar to anyone coming from TextMate/VS Code snippets. The package was created by pluskid (Chuo Xu), long maintained by João Távora (whose GitHub repo `joaotavora/yasnippet` and docs site are the canonical sources), with GNU ELPA releases now maintained by Noam Postavsky; it is GPL-3-licensed. It solves the "boilerplate typing" problem — control structures, function skeletons, license headers, LaTeX environments — and is one of the oldest, most widely bundled Emacs packages (a default in Doom and Spacemacs). It is a *text-insertion* engine, not a completion UI: it deliberately delegates candidate selection and popup behaviour to other frameworks.

---

## 1. Core functionality

The essential loop: with `yas-minor-mode` active, YASnippet watches the text before point. When you press the trigger key (`TAB` by default, running the command `yas-expand`) and the word before point matches a snippet *key* registered for the current major mode, the key is deleted and replaced by the snippet's expanded template. Point lands on the first field; `TAB`/`S-TAB` move forward/back through the remaining fields; typing at a field overwrites its default; finishing at the last field jumps to the exit point `$0`. If no key matches, `yas-expand` falls back to whatever `TAB` would normally do (indentation, etc.), via the wrapper `yas-maybe-expand`. Snippets are per-major-mode, so `for` expands differently in `c-mode` vs `python-mode`. The engine also supports *nested* snippets (expand inside a field) and running arbitrary Elisp during expansion.

## 2. Notable / distinctive features

The template grammar. Inside a template only three characters are special — `$`, `` ` `` (backtick), and `\` (escape). Everything else is literal.

- **Tab stops / fields:** `$1`, `$2`, … are stops you cycle through with `TAB`. `$0` is the special **exit point** (final cursor position).
- **Placeholders (fields with defaults):** `${1:default text}` — the default is pre-selected and replaced as you type. The number may be omitted (`${:...}`) if you need no mirror/transform.
- **Mirrors:** repeating a field number echoes its live text elsewhere, e.g. `\begin{${1:enumerate}}\n$0\n\end{$1}` — typing at field 1 updates every `$1`.
- **Mirror transformations:** `${1:$(elisp)}` — a mirror whose text is computed by Elisp, evaluated with the variable `yas-text` bound to the field's current string (e.g. `${1:$(capitalize yas-text)}`). Transforms may read *other* fields via `(yas-field-value N)`.
- **Field transformations:** transforms placed *inside* the primary field, run on entry, on every edit, and on exit; disambiguated from a mirror by extra text before the `$` (`${1:text$(upcase yas-text)}`) or by doubling the dollar (`${1:$$(upcase yas-text)}`). Useful bound variables: `yas-modified-p`, `yas-moving-away-p`.
- **Embedded Elisp:** backtick expressions `` `(current-time-string)` `` are evaluated at *expansion time* and replaced by the returned string. Backtick code must only *return* a string, not mutate the buffer.
- **Indentation marker `$>`:** forces `indent-according-to-mode` on that line (relevant when `yas-indent-line` is not `'auto`).
- **`yas-selected-text`:** if a region was active at expansion, its text is available to the template (wrap-the-selection snippets).

## 3. How it works

**Snippet files & directories.** Each snippet is a plain file, named by its key, living under a directory tree keyed by major mode: `~/.emacs.d/snippets/<major-mode>/<key>`. The search roots are the list `yas-snippet-dirs` (default `'("~/.emacs.d/snippets")`, prependable with the bundled `yasnippet-snippets` dir). A `.yas-parents` file inside a mode directory names parent modes to inherit snippets from (e.g. `cc-mode` for `c++-mode`). `yas-reload-all` (re)compiles every directory into in-memory per-mode *snippet tables*; `yas-describe-tables` renders the loaded tables for the current buffer.

**File format.** A file is an optional metadata header, a `# --` separator line, then the template body. If there is no `# --`, the whole file is the template. New-snippet buffers start with an Emacs local-variables line:

```
# -*- mode: snippet -*-
# name: describe-the-snippet
# key: trigger
# --
snippet body with $1 fields and $0 exit
```

Header directives (each a `# field: value` line):

- `# key:` — the abbreviation typed before `TAB`.
- `# name:` — human-readable label shown in menus/pickers.
- `# condition:` — Elisp; the snippet is eligible only when it returns non-nil (e.g. suppress expansion inside comments/strings).
- `# group:` — menu grouping; dotted for nesting (`control structure.loops`).
- `# binding:` — a direct key sequence that expands this snippet regardless of the key/TAB path.
- `# expand-env:` — a `let`-style varlist applied during expansion, e.g. `((yas-indent-line 'fixed))`.
- `# type:` — `snippet` (default) or `command` (body is Elisp run as a command).
- `# uuid:` — stable identifier; loading a snippet whose UUID matches an existing one *replaces* it.
- `# contributor:` — optional attribution.

**Expansion mechanics.** `yas-expand` is placed on `TAB` in `yas-minor-mode-map`; during an active expansion the transient `yas-keymap` (also `TAB`/`S-TAB`) drives field navigation. `# binding:` snippets and `yas-insert-snippet` bypass the key-matching path entirely. `yas-buffer-local-condition` gates whether expansion is allowed at point (e.g. never in comments).

## 4. Configuration & usage

Turn it on globally with `yas-global-mode`, or per-buffer with `yas-minor-mode`:

```elisp
(use-package yasnippet
  :ensure t
  :config
  (yas-global-mode 1))

(use-package yasnippet-snippets   ; community snippet library, 50+ modes
  :ensure t
  :after yasnippet)
```

Key commands & default bindings:

- `yas-expand` — expand key before point (`TAB`).
- `yas-insert-snippet` — pick a snippet for this mode by name (`C-c & C-s`); `C-u` shows all, ignoring conditions.
- `yas-new-snippet` — open a scratch buffer to author a snippet (`C-c & C-n`); `C-c C-c` saves/loads it.
- `yas-visit-snippet-file` — jump to the file backing a snippet (`C-c & C-v`).
- `yas-reload-all` — recompile all snippet tables after edits.
- `yas-describe-tables` — list active snippets/keys for the buffer.

Useful variables: `yas-snippet-dirs` (search roots), `yas-indent-line` (`'auto`/`'fixed`/nil), `yas-triggers-in-field` (allow nested expansion inside a field), `yas-wrap-around-region` (auto-use the region as `yas-selected-text`), `yas-prompt-functions` (ordered UI backends for multi-candidate choice), `yas-buffer-local-condition`.

## 5. Ecosystem & integration

YASnippet is engine-only by design and plugs into whatever selection/completion UI you already run:

- **Snippet library:** `yasnippet-snippets` (Andrea Crotti) is the de-facto community collection, unbundled from core since it grew large.
- **`hippie-expand`:** add `yas-hippie-try-expand` to `hippie-expand-try-functions-list` so `M-/` cycles snippet keys alongside dabbrev.
- **Completion popups:** classic integrations exist for `auto-complete` and `company` (`company-yasnippet` as a backend); in modern setups a `completion-at-point` / `corfu` stack surfaces snippet keys, and **`consult-yasnippet`** provides `consult`-style live-preview insertion through the minibuffer.
- **Candidate picker:** when several snippets share a key, `yas-prompt-functions` chooses the UI — `yas-completing-prompt` (minibuffer, hence vertico/consult-friendly), `yas-ido-prompt`, `yas-dropdown-prompt`, `yas-x-prompt`.
- **Distros:** Doom Emacs ships it behind the `snippets` module; Spacemacs enables it via `auto-completion`. It is orthogonal to the minad minibuffer stack (see `01-emacs-org-mode.md` for the Org context; the vertico/consult/orderless siblings only affect *how* a snippet is chosen, never the expansion itself).

## 6. Extensibility / customization

- **Arbitrary Elisp everywhere:** backtick expansions at load/expand time, plus field/mirror transformations with `yas-text`, `(yas-field-value N)`, `yas-modified-p`, `yas-moving-away-p` — a snippet is effectively a small program.
- **`# type: command` snippets** turn the body into an Elisp command for fully computed insertions.
- **Mode inheritance** via `.yas-parents`, and multiple roots via `yas-snippet-dirs`.
- **Conditions** (`# condition:` per snippet, `yas-buffer-local-condition` per buffer) for context-sensitive availability.
- **Hooks:** `yas-before-expand-snippet-hook`, `yas-after-exit-snippet-hook`, and `yas-minor-mode-hook` for wiring behaviour around expansion.
- **`expand-env`** to locally rebind variables (indentation, etc.) only while a snippet is live.
- **Pluggable prompt backends** via `yas-prompt-functions`, and programmatic expansion via `yas-expand-snippet` / `yas-lookup-snippet` for building snippet-driven commands.

## 7. Relevance to designing Coal (borrow / avoid)

**Worth borrowing:**
- **A snippet/template layer is Coal's clearest gap.** CM6's `@codemirror/autocomplete` already ships a *native* snippet primitive: `snippetCompletion("console.log(${})", {...})` and `snippet()` support `${}` / `${name}` fields with `Tab`/`Shift-Tab` traversal and `Escape` to exit — the same tab-through-fields UX as YASnippet, web-native, no Elisp. Borrow the *grammar shape* (`$1`, `${1:default}`, `$0`) but implement it on CM6's snippet field machinery rather than reinventing an overlay engine.
- **Expose snippets through the M-x registry, not a slash menu.** Mirror `yas-insert-snippet` as an `M-x` command (id/title/run in `src/renderer/commands.ts`) that lists templates in the **minibuffer** as a vertico-style candidate list — this respects Coal's "M-x, no slash commands" rule while giving the by-name picker YASnippet offers.
- **Key-plus-trigger expansion inside the editor** maps cleanly to a CM6 completion source in `src/renderer/editor/`: register snippet keys as completions so a short abbreviation offers/expands a template, exactly as `yas-expand` does off `TAB`.
- **Snippets as plain files under the vault** fits Coal's "markdown files are the source of truth" ethos: a `.coal/snippets/` tree (paralleling the existing `.coal/snippets/*.css` theming dir) keyed by context, each a plain file — rebuildable, git-tracked, no hidden DB.
- **Computed defaults via safe callbacks:** YASnippet's backtick/transform idea (dates, titles, IDs) is valuable for Coal — e.g. a snippet that mints a fresh block `^id:` UUID or inserts today's date — but implement it as *whitelisted TypeScript field functions*, not arbitrary eval.

**Worth avoiding / reacting to:**
- **Do not port embedded-Elisp / `# type: command` execution.** Arbitrary code in a template is a security and portability non-starter in an Electron renderer; keep computed fields to a fixed, audited set of helpers.
- **Avoid YASnippet's metadata-header file format** (`# -*- mode: snippet -*-`, `# key:`, `# --`). It is Emacs-buffer-centric and clashes with Coal's byte-for-byte markdown discipline (§14); prefer a small structured manifest or frontmatter-style fields the editor already understands.
- **Don't overload one key for expand-or-fallback the way `yas-expand`/`yas-maybe-expand` overload `TAB`.** Coal's Emacs keymap and CM6 already contend for `TAB`; route snippet insertion through the explicit `M-x` command and the completion source's own accept flow to avoid ambiguous bindings.
- **Keep field-reveal consistent with live-preview.** YASnippet paints fields with overlays; Coal already has a CM6 cursor-line reveal model (§6/§13) that hides `^id:`/URL markers off the active line. Snippet field markers must not leak literal `${1:...}` into the rendered text — reuse the same view-only decoration discipline so an in-progress template reads cleanly and only shows field chrome where the cursor is.
- **Selection/preview belongs to Coal's own minibuffer,** not YASnippet's grab-bag of `yas-prompt-functions` (ido/dropdown/x-popup). Coal has one canonical picker surface; wire snippet choice through it (like `consult-yasnippet` does for consult) instead of importing multiple competing UIs.

---

## Sources

- YASnippet — GitHub repository & README (joaotavora/yasnippet) — https://github.com/joaotavora/yasnippet
- YASnippet README (raw) — https://raw.githubusercontent.com/joaotavora/yasnippet/master/README.mdown
- Official docs — Writing snippets (template syntax: fields/mirrors/transforms/backticks) — http://joaotavora.github.io/yasnippet/snippet-development.html
- Official docs — Expanding snippets (yas-expand/yas-maybe-expand/insert/prompt-functions) — http://joaotavora.github.io/yasnippet/snippet-expansion.html
- Official docs site (home) — http://joaotavora.github.io/yasnippet/
- GNU ELPA — yasnippet package page (v0.14.3, maintainer Noam Postavsky) — https://elpa.gnu.org/packages/yasnippet.html
- yasnippet-snippets (community collection, Andrea Crotti) — https://github.com/AndreaCrotti/yasnippet-snippets
- DeepWiki — Snippet Template Syntax — https://deepwiki.com/joaotavora/yasnippet/4.2-snippet-template-syntax
- CodeMirror 6 autocomplete (snippet/snippetCompletion primitives) — https://codemirror.net/docs/ref/#autocomplete.snippet
