# Consult

**What it is.** Consult (`consult.el`) is a suite of practical navigation and search commands built on the standard Emacs `completing-read` API, written and maintained by Daniel Mendler (minad). Its defining trait is *live preview*: as you move through the candidate list, Consult scrolls the buffer, jumps to the line, or loads the file behind the currently-selected candidate, so you see the result before you commit. It solves the problem that vanilla Emacs commands like `switch-to-buffer`, `goto-line`, `imenu`, and `yank-pop` present flat, preview-less pickers; Consult replaces each with an enhanced, narrowable, preview-enabled equivalent (`consult-buffer`, `consult-goto-line`, `consult-imenu`, `consult-yank-pop`, and dozens more). Crucially it is **UI-agnostic**: it plugs into whatever `completing-read` front-end is active — Vertico, the built-in `*Completions*` buffer, Icomplete, or Mct — rather than shipping its own interface, and it pairs with Marginalia (annotations), Orderless (matching), and Embark (actions) to form the modern minad/oantolin minibuffer stack. It is the spiritual successor to Oleh Krehel's Counsel/Swiper (the Ivy ecosystem), rebuilt on native completion instead of a bespoke framework.

---

## 1. Core functionality

Consult provides *commands*, not a mode or a UI. Each command is a thin, interactive wrapper around the internal `consult--read` (itself a wrapper over `completing-read`) that adds three cross-cutting capabilities on top of ordinary completion:

- **Live preview** of the candidate under point (jump to a line, switch to a buffer, load a file, apply a theme) that is reverted if you abort.
- **Narrowing** to a candidate *group/source* by typing a single narrowing key plus space (e.g. `b SPC` for buffers inside `consult-buffer`).
- **Asynchronous candidate generation** for external-process commands (`consult-grep`, `consult-ripgrep`, `consult-find`), where candidates stream in as a background process runs and the input changes.

The package adds **no keybindings and no minor mode** on load — it is deliberately non-intrusive; you bind only the commands you want. Many commands implement Emacs "future history": press `M-n` at the prompt to insert the symbol/thing at point.

## 2. Notable / distinctive features

The command catalog is the heart of the package. Commands follow the `consult-<thing>` naming scheme.

**Virtual buffers**
- `consult-buffer` — enhanced `switch-to-buffer` unifying open buffers, `recentf` files, bookmarks, and project buffers/files into one narrowable menu with preview. Narrow keys: `b` buffers, `SPC` hidden buffers, `*` modified, `f` files (needs `recentf-mode`), `m` bookmarks, `p` project, `B`/`F`/`R` project buffers/files/roots.
- `consult-buffer-other-window` / `-other-frame` / `-other-tab`, `consult-project-buffer`, `consult-bookmark`, `consult-recent-file` — variants.

**Search (in-buffer)**
- `consult-line` — search lines in the current buffer and jump, with live preview; the counterpart to Swiper. Integrates with Isearch (picks up the current Isearch string via the future history / `M-n`).
- `consult-line-multi` — same, across multiple (project) buffers, candidates computed on demand.
- `consult-keep-lines` / `consult-focus-lines` — live buffer filtering using the active completion style; `keep` edits the buffer, `focus` only hides lines (`C-u` to reveal). `! SPC` negates.

**Grep and find (asynchronous, external process)**
- `consult-grep`, `consult-ripgrep`, `consult-git-grep` — regexp search across files; the process runs in the background and restarts as you type. Two-level filtering: the input before a split character goes to grep, the rest is filtered by the Emacs completion style (e.g. Orderless).
- `consult-find`, `consult-fd`, `consult-locate` — find files by path regexp, same async model.

**Navigation**
- `consult-goto-line` (drop-in `goto-line`, accepts `line:column`), `consult-mark` / `consult-global-mark` (jump through the mark rings), `consult-outline` (jump to an outline heading, narrow by level), `consult-imenu` / `consult-imenu-multi` (flat imenu with grouping/narrowing).

**Editing**
- `consult-yank-pop` / `consult-yank-from-kill-ring` / `consult-yank-replace` — pick from the `kill-ring` with the pending yank previewed as an overlay; `consult-kmacro` picks a keyboard macro.

**Diagnostics / compilation**
- `consult-flymake` (jump to a Flymake diagnostic; narrow errors/warnings/notes with `e SPC` / `w SPC` / `n SPC`), `consult-compile-error`, `consult-xref` (set as `xref-show-xrefs-function`).

**Org / help / misc**
- `consult-org-heading` (Org variant of imenu/outline; ancestors joined by slashes; narrow by level/priority/TODO), `consult-org-agenda`, `consult-man`, `consult-info` (full-text search of Info manuals; define your own with `consult-info-define`), `consult-theme` (preview themes while scrolling), `consult-register` / `-store` / `-load`, `consult-history`, `consult-isearch-history`, `consult-complex-command`, `consult-minor-mode-menu`, `consult-mode-command`, `consult-completion-in-region`.

## 3. How it works

- **`consult--read`** is a thin wrapper around `completing-read`. Because the actual selection UI is still `completing-read`, Consult inherits whatever front-end the user has enabled — it does *not* reimplement completion, matching, or display. This is the architectural inverse of Ivy/Helm, which own their entire UI stack.
- **Live preview** is implemented via a `:state` function passed to `consult--with-preview`. The state function is a closure receiving an `ACTION` symbol (`'preview`, `'return`, …) and the current `CANDIDATE`; on `'preview` it performs the reversible side effect (scroll, switch, load) and undoes it if the session is aborted. Files opened purely for preview are closed again at session end; during preview many hooks/variables are suppressed for speed (`consult-preview-variables`, only hooks in `consult-preview-allowed-hooks` run), and large files are previewed partially (`consult-preview-partial-size`).
- **Narrowing** relies on candidate *grouping*: sources carry a `:narrow` character; typing that char + `SPC` (or `consult-narrow-key`) restricts to the group, `DEL`/`consult-widen-key` widens. If the front-end supports grouping (Vertico does), group titles render as separators.
- **Async** commands split the input string (styles in `consult-async-split-styles-alist`: `nil`, `comma`, `semicolon`, `perl`; default via `consult-async-split-style`). With the default `perl`/`#` style, `#regexps#filter` sends `regexps` to grep and uses `filter` for fast Emacs-side filtering. A background process is spawned after `consult-async-min-input` chars, debounced/throttled by `consult-async-input-debounce` / `-throttle`; a prompt indicator (`:` idle, `*` running, `!` failed, `;` interrupted) shows process status; errors log to a ` *consult-async*` buffer.
- **Multiple sources** are combined by the internal `consult--multi`. A source is a plist: `:name`, `:narrow`, `:category`, `:items` (or `:async`), `:action`, `:state`, `:annotate`, `:history`, `:hidden`, `:enabled`, `:face`, etc. `consult-buffer-sources` is just a list of such plists, and you can append your own.

## 4. Configuration & usage

Consult ships zero bindings; you add them. The maintainer's canonical setup binds commands under the mnemonic `M-g` (goto) and `M-s` (search) maps:

```emacs-lisp
(use-package consult
  :bind (("C-x b"   . consult-buffer)      ;; orig. switch-to-buffer
         ("C-x p b" . consult-project-buffer)
         ("M-y"     . consult-yank-pop)    ;; orig. yank-pop
         ("M-g g"   . consult-goto-line)   ;; orig. goto-line
         ("M-g o"   . consult-outline)
         ("M-g i"   . consult-imenu)
         ("M-g f"   . consult-flymake)
         ("M-s l"   . consult-line)
         ("M-s r"   . consult-ripgrep)
         ("M-s g"   . consult-grep)
         ("M-s d"   . consult-find))
  :init
  (setq xref-show-xrefs-function       #'consult-xref
        xref-show-definitions-function #'consult-xref)
  :config
  ;; Delay/soften preview for expensive commands
  (consult-customize
   consult-theme :preview-key '(:debounce 0.2 any)
   consult-ripgrep consult-grep consult-git-grep consult-recent-file
   :preview-key '(:debounce 0.4 any))
  (setq consult-narrow-key "<"))
```

Key user options: `consult-preview-key` (global preview trigger; default `'any` = preview immediately on any candidate change; can be `nil`, `"M-."`, or `(:debounce 0.4 any)`), `consult-narrow-key` / `consult-widen-key`, `consult-async-min-input`, `consult-async-split-style`, `consult-project-function` (project-root discovery, defaults to built-in `project.el`), `consult-buffer-sources` / `consult-project-buffer-sources`, `consult-line-start-from-top`, `consult-goto-line-numbers`. Per-command overrides go through the **`consult-customize`** macro, which can set `:preview-key`, `:prompt`, `:initial`, `:sort`, `:group`, `:add-history`, etc. on a per-command basis — its values are evaluated at session start, so `(thing-at-point 'symbol)` works as an initial input.

## 5. Ecosystem & integration

Consult is one component of the modular minad/oantolin completion stack, each piece independent and swappable (no hard dependencies):

- **Vertico** (minad) — the recommended vertical minibuffer UI. Consult supplies the *commands and preview*; Vertico supplies the *display*. Consult works equally with the built-in `*Completions*` buffer, Icomplete, or Mct.
- **Marginalia** (minad) — adds annotations (docstrings, file sizes, buffer modes) to Consult candidates in the margin. Consult itself renders no annotations; it exposes completion *categories* that Marginalia annotates.
- **Orderless** (oantolin) — a completion *style*, not a UI: space-separated, out-of-order matching. It is what makes the Emacs-side filter half of `consult-grep`'s two-level search powerful.
- **Embark** (oantolin) — context actions on the current candidate (a "right-click menu" for the minibuffer). Install `embark-consult` for Consult-specific actions and, notably, **export**: `consult-line` → `embark-export` → an `occur` buffer editable via `occur-edit-mode`; `consult-grep` → a `grep-mode` buffer editable via `grep-edit-mode` (Emacs 31) or `wgrep`; `consult-find` → a `dired` buffer editable via `wdired`.

See the sibling reference files for Vertico, Marginalia, Orderless, and Embark. Consult descends from **Counsel/Swiper** (Ivy ecosystem, Oleh Krehel) and the Selectrum wiki — `consult-line` ≈ `swiper`, `consult-ripgrep` ≈ `counsel-rg` — but rebuilt on native `completing-read` rather than a bespoke framework, which is the whole philosophical difference from Ivy and Helm.

## 6. Extensibility / customization

- **Custom `consult-buffer` sources** — add a plist to `consult-buffer-sources` (e.g. an "Org Buffers" source with `:items`, `:narrow ?o`, `:new` to create on miss). The `:state`/`:action` distinction lets a source define reversible preview vs. commit-time behavior.
- **New multi-source commands** — build directly on `consult--multi`.
- **Async collections** for `consult--read`: `consult--process-collection` (external process) and `consult--dynamic-collection` (Lisp, optionally callback-driven for streaming), reusable as the `:async` field of a source.
- **Custom preview** — supply a `:state` closure matching the `consult--with-preview` action lifecycle.
- **`consult-info-define`** to spin up manual-specific full-text search commands; `consult-customize` to fine-tune or wrap any command; advice for deeper behavior changes.

## 7. Relevance to designing Coal (borrow / avoid)

**Worth borrowing**
- **Live preview as you move through candidates** is the single most transferable idea. Coal's quick-open and `M-x` (rendered as a Vertico-style vertical list in the persistent bottom minibuffer, `src/renderer/ui/minibuffer.ts`) currently *select then jump*. Adopt Consult's model: as the highlighted candidate changes, scroll the live-preview CM6 editor (`src/renderer/editor/`) to the target note/heading and revert on cancel. CM6's `EditorView.dispatch` + `EditorView.scrollIntoView` (and a transient selection/`Decoration` highlight) is the web-native equivalent of `consult--with-preview`'s reversible `:state` — no file gets committed until the user confirms, mirroring "preview files are closed on abort."
- **Narrowing by source with a prefix key** maps directly onto unifying Coal's separate surfaces. A single `consult-buffer`-style command could merge note titles, backlinks (`src/renderer/ui/backlinks.ts`), and recent notes into one minibuffer list where a narrow key (`b SPC`, `l SPC`) restricts the group — cheaper for the keyboard-first user than remembering distinct `M-x` command names.
- **A `consult-line`/`consult-outline`/`consult-imenu` trio** is the missing table-of-contents/in-note-search feature the Coal context flags as absent. Parse the note's markdown headings (Coal already tracks heading structure for live-preview decorations) into candidates, preview by scrolling the CM6 view — a keyboard-first TOC built from surfaces Coal already has.
- **The two-level async filter** (`#regexps#filter`) is a good pattern if Coal ever adds ripgrep-backed vault search: stream external-process hits into the minibuffer while a second, substring/fuzzy pass narrows them client-side. This is also the concrete argument for upgrading Coal's basic substring matching toward an Orderless-style scorer that the filter half can lean on.
- **`consult-customize`'s per-command `:preview-key` / debounce** is the right ergonomic for Coal: preview instantly for cheap jumps (in-note lines) but debounce expensive ones (opening a different note file into the editor), so preview never janks typing in the minibuffer.
- **Non-intrusive, command-only packaging** — Consult adds no bindings and no UI of its own — validates Coal's "M-x named-command registry, no slash commands" rule (`src/renderer/commands.ts`, SPEC §3): ship commands with `id`/`title`/`run` and let the user bind them.

**Worth avoiding / reacting to**
- **Do not clone the flat, densely-mnemonic keymap** (`M-g o`, `M-s L`, `#foo#bar` split syntax). That density is Emacs-muscle-memory, not discoverability; Coal's `M-x` registry with human titles plus the minibuffer's future-history is the more teachable path. Borrow the *mechanisms*, not the terse binding surface.
- **Consult is UI-agnostic by necessity** because it must serve Vertico, Icomplete, and `*Completions*` alike. Coal has exactly one surface (the persistent minibuffer, vanilla DOM per SPEC §13) — do **not** build a `completing-read`-style abstraction layer to stay front-end-neutral; wire preview and narrowing straight into `minibuffer.ts`.
- **Consult does not annotate** (that is Marginalia's job) and **does not match** (that is the completion style's job). Coal has neither annotations nor fuzzy matching yet; resist folding those into a "consult-like" module. Keep them as separate concerns — a candidate-annotation hook and a matching/scoring function — so each can evolve independently, exactly as the minad stack keeps them apart.
- **Reversible preview is subtle.** Consult goes to length suppressing hooks and closing preview-opened files; a naive Coal port that eagerly loads a different note into the shared CM6 view on every arrow-key risks disk churn, watcher/commit noise (Coal auto-commits on save), and lost editor state. Preview must be strictly read-only and never touch the byte-for-byte save path (SPEC §14): render into a throwaway view or a decoration overlay, never into the authoritative document buffer.
- **Wikilink autocomplete is a different surface.** Consult's async/preview model is for *minibuffer* selection; Coal's `[[uuid]]` completion lives in-editor via `@codemirror/autocomplete` (`completion` source showing titles, inserting UUIDs). Don't try to route in-buffer completion through a Consult-style minibuffer picker — CM6's native `completion-at-point` equivalent already fits there; reserve the Consult pattern for the minibuffer command/quick-open path.

---

## Sources

- consult — GitHub README (README.org, master) — https://github.com/minad/consult
- Consult — GNU ELPA package page (v3.6, 2026-06-05; maintainer Daniel Mendler) — https://elpa.gnu.org/packages/consult.html
- Consult — MELPA — https://melpa.org/#/consult
- Consult wiki (custom sources, auxiliary packages) — https://github.com/minad/consult/wiki
- Vertico — GitHub (recommended completion UI) — https://github.com/minad/vertico
- Marginalia — GitHub (annotations) — https://github.com/minad/marginalia
- Embark — GitHub (actions, embark-consult export) — https://github.com/oantolin/embark
- Orderless — GitHub (completion style) — https://github.com/oantolin/orderless
- Counsel/Swiper (Ivy ecosystem, prior art) — https://github.com/abo-abo/swiper
