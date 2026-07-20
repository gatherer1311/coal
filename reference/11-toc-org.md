# toc-org

**What it is.** toc-org is a small, single-purpose Emacs minor mode by Sergei Nosov (`snosov1`) that keeps an up-to-date **table of contents** inside an Org file (and, with the same code path, a Markdown file) *without exporting* — its stated primary use case is README files rendered on GitHub. You mark one headline with a `:TOC:` tag; from then on, every time you save the buffer, toc-org rewrites the body under that heading with a freshly generated, correctly-anchored list of links to the document's headings. It is deliberately narrow: not a completion package, not part of the minibuffer stack — just a `before-save-hook` that regenerates plain-text TOC content in place. It was formerly named `org-toc` (renamed to avoid a clash with an Org contrib module), is distributed on MELPA and NonGNU ELPA, and is conceptually the Org-file analog of the Markdown `markdown-toc` utility.

---

## 1. Core functionality

- **Tag-driven, self-updating TOC.** You add the tag `:TOC:` to a single headline (any title, conventionally "Table of Contents"). The *first* headline carrying a `:TOC:` tag becomes the anchor. On each save, toc-org replaces the list beneath that headline with the current TOC derived from the rest of the document's outline.
- **No export step, no sidecar.** The TOC is written **back into the source file as ordinary Org (or Markdown) list text** — it is committed and rendered like any other content. There is no separate database, cache, or generated artifact; the file remains the single source of truth.
- **GitHub-faithful anchors.** By default it emits GitHub-style slug anchors (`gh` style), so the generated `[[#installation][Installation]]` links resolve correctly when the README is viewed on GitHub. This is the whole reason the package exists: keeping a clickable, always-correct TOC in a repo README.
- **Zero-friction lifecycle.** Once the minor mode is on for the buffer, maintenance is automatic — edit headings freely, save, and the TOC re-derives itself. Nothing to invoke by hand in the normal flow.

## 2. Notable / distinctive features

- **Tag encodes depth and href style.** The `:TOC:` tag is overloaded to carry options in its name:
  - `:TOC:` — default TOC (max depth 2, `gh` hrefs).
  - `:TOC_2:` — set max heading depth to `2` (the default). `:TOC_3:`, `:TOC_4:`, etc. for deeper trees.
  - `:TOC_2_gh:` — depth 2 **plus** GitHub-style hrefs (the default style).
  - `:TOC_2_org:` / `:TOC_1_org:` — the other built-in href style, `org` (native Org heading links).
  - `@` is accepted as an alternative separator to `_`, e.g. `:TOC@2@gh:` — useful because Org treats `_` specially in some contexts.
- **`:QUOTE:` wrapping.** Add `:QUOTE:` to the TOC heading (e.g. `Table of Contents  :TOC:QUOTE:`) and the generated list is wrapped in a `#+BEGIN_QUOTE` / `#+END_QUOTE` block.
- **`:noexport:` awareness.** Headings tagged `:noexport:` are excluded from the generated TOC. `:noexport_1:` (and `:noexport_N:`) keep the heading itself but strip its children — mirroring Org's own export-exclusion semantics.
- **Pluggable href styles.** Only two styles ship (`gh`, `org`), but a tag `:TOC_2_STYLE:` makes toc-org call a function named `toc-org-hrefify-STYLE`, so a custom slug scheme is just one defun.
- **Markdown mode too.** The same engine runs in `markdown-mode`: `#` markers instead of `*`, the tag written as an HTML comment `<!-- :TOC: -->`, and `[text](#anchor)` links / Markdown quote blocks instead of Org syntax.
- **Clickable generated links.** Because `gh` anchors don't match Org's own link resolver, toc-org installs an `org-link-translation-function` (`toc-org-unhrefify`) so following a TOC link inside Emacs jumps to the real heading; Markdown gets `toc-org-markdown-follow-thing-at-point`.

## 3. How it works

- **A buffer-local minor mode.** `toc-org-mode` is a `define-minor-mode`. Enabling it calls `toc-org-enable`, which does two things: `(add-hook 'before-save-hook 'toc-org-insert-toc nil t)` — registering the regenerator **buffer-locally** — and, when link-opening is enabled, sets `org-link-translation-function` to `toc-org-unhrefify` and seeds a hash table for anchor round-tripping. Disabling the mode removes the hook and unsets the translation function.
- **`toc-org-insert-toc` is the workhorse.** Its docstring: *"Update table of contents in heading tagged :TOC:."* On every save it scans the outline, finds the first `:TOC:`-tagged headline, builds the list (honoring depth, style, `:noexport:`, `:QUOTE:`), and splices it in as plain text, replacing whatever list was there before. If no `:TOC:` tag exists, it does nothing — the hook is inert.
- **Slug/anchor generation.** The `gh` hrefifier lowercases the heading text, strips punctuation, replaces spaces with `-`, and disambiguates duplicate slugs by appending a counter — matching GitHub's own anchor algorithm — using a per-buffer hash table (`toc-org-hrefify-hash`, a `defvar-local`) to track collisions. The `org` hrefifier produces native `[[*Heading]]`-resolvable links instead.
- **In-file, byte-level edit.** There is no model layer: the TOC lives in the file, is diffed by git like prose, and is regenerated by an idempotent text substitution at save time.

## 4. Configuration & usage

Key user options (all `defcustom` unless noted):

| Variable | Default | Meaning |
| --- | --- | --- |
| `toc-org-max-depth` | `2` | Default max heading depth when the tag doesn't specify one. |
| `toc-org-hrefify-default` | `"gh"` | Default href style (`"gh"` or `"org"`). |
| `toc-org-enable-links-opening` | `t` | Install the translation function so TOC links are followable in-buffer. |
| `toc-org-hrefify-hash` | `nil` (`defvar-local`) | Internal per-buffer slug-collision table. |

Commands: `toc-org-mode` (toggle), `toc-org-insert-toc` (manual regenerate), `toc-org-enable` (legacy enable entry point), `toc-org-markdown-follow-thing-at-point` (Markdown link follow). The `:TOC:` tag is normally added with Org's own `org-set-tags-command` (`C-c C-q`).

Minimal setup (verbatim shape from the README):

```elisp
(if (require 'toc-org nil t)
    (progn
      (add-hook 'org-mode-hook 'toc-org-mode)
      ;; optional Markdown support
      (add-hook 'markdown-mode-hook 'toc-org-mode)
      (define-key markdown-mode-map (kbd "\C-c\C-o")
        'toc-org-markdown-follow-thing-at-point))
  (warn "toc-org not found"))
```

Example source and generated output:

```org
* Table of Contents                                           :TOC:
- [[#about][About]]
- [[#installation][Installation]]
  - [[#via-packageel][via package.el]]
  - [[#manual][Manual]]
- [[#use][Use]]
```

## 5. Ecosystem & integration

- **Not part of the completion stack.** toc-org shares nothing with the minad minibuffer packages — Vertico, Marginalia, Consult, Orderless, Embark (see the sibling reference files for each). It is an editing utility that hangs off `before-save-hook`, orthogonal to `completion-at-point` and the minibuffer.
- **Pairs with Org / Markdown modes.** It layers on top of `org-mode` and `markdown-mode` and cooperates with Org's export machinery only through the `:noexport:` tag it reuses. See `01-emacs-org-mode.md` for the Org substrate it builds on.
- **Sibling to org-appear.** Within the "Org editing niceties" grouping (alongside the org-appear reference), toc-org is the write-back automation; org-appear is a display-only reveal toggle. Both are small, focused, single-hook add-ons rather than frameworks.
- **Relatives.** It is "like `markdown-toc`, but for Org files," and inspired `alphapapa/org-make-toc` (a more configurable, per-file-directive alternative). Forks (`syohex`, `zaypen`) exist but the canonical repo is `snosov1/toc-org`.

## 6. Extensibility / customization

- **Custom href styles.** Define `toc-org-hrefify-STYLE` (a function taking the heading string and the collision hash) and reference it via a `:TOC_N_STYLE:` tag — the primary extension point.
- **Depth & default style** are user-tunable globally (`toc-org-max-depth`, `toc-org-hrefify-default`) and per-heading via the tag.
- **Hook-based composition.** Because everything is a buffer-local `before-save-hook` entry, you can enable/disable per buffer, or call `toc-org-insert-toc` manually from your own commands.
- **Link-follow behavior** is toggled with `toc-org-enable-links-opening`; the Markdown follow command is separately bindable.

## 7. Relevance to designing Coal (borrow / avoid)

**Worth borrowing**
- **A "TOC heading" as an in-file, auto-regenerated block is a clean model for Coal.** Coal has no table-of-contents feature; a toc-org-style approach — a marker (Coal would use a fenced directive or a typed-object property, never an Org tag) whose body a **save-time pass rewrites** — fits Coal's "markdown files are the single source of truth, index is a rebuildable cache" ethos. The TOC would be committed prose, not a sidecar, exactly as toc-org does it.
- **Slug/anchor generation matching a well-known algorithm.** toc-org's GitHub-slug logic (lowercase, strip punctuation, dedupe with a counter) is a good reference if Coal ever emits heading anchors; a deterministic, collision-numbered slugger is the right shape. But Coal's canonical link target is a `[[uuid#blockid]]`, so any generated TOC should prefer stable UUID/block-id links over text slugs to survive heading renames.
- **CM6-native regeneration, not a save hook.** The web-native equivalent of `before-save-hook` + text splice is a CM6 transaction: a `M-x` command (registered in `src/renderer/commands.ts`) like "Update table of contents" that computes headings from the syntax tree and dispatches a single ranged change. Offer it as an explicit command surfaced through the minibuffer echo area on completion, rather than silently mutating on save — Coal's byte-for-byte round-trip rule (§14) makes an implicit save-time reflow risky.
- **Live-preview affordance for the TOC block.** Coal's CM6 live-preview cursor-line reveal is the natural place to render generated TOC entries as clickable titles (like the wikilink decoration) while hiding the raw slug/URL off the cursor line — the same treatment already applied to inline link/image URLs and `^id:` markers.

**Worth avoiding / reacting to**
- **Silent mutation on every save.** toc-org rewrites the file on *each* save with no confirmation. In Coal that collides with commit-on-save and the byte-for-byte contract — an auto-edit that fires on the same event as the git commit would produce noisy, surprising diffs. Prefer an explicit, undoable command over a `before-save-hook` analog.
- **Overloading a tag name to carry parameters** (`:TOC_2_gh:`, `:TOC@2@gh:`). This terse, positional encoding is unreadable and easy to mistype. Coal already has a typed-object property layer (`parseFrontmatterProps`, EAV tables); depth/style belong in explicit named properties, not smuggled into a marker's identifier.
- **Text-slug links as the anchor scheme.** GitHub slugs break when a heading is renamed. Coal's whole linking model exists to avoid that — generated TOC links should resolve through the note index to `[[uuid#blockid]]` and render via the same autocomplete/decoration path that shows titles while storing UUIDs, not through fragile `#heading-text` anchors.
- **Scope creep is not the lesson here — restraint is.** toc-org does exactly one thing; don't grow a Coal TOC feature into a competing outline/navigation surface. Heading navigation already has a home in quick-open and the backlinks navigator; a TOC is just an in-document, generated cross-reference block.

---

## Sources

- toc-org — GitHub repository (Sergei Nosov): https://github.com/snosov1/toc-org
- toc-org — README.org (raw): https://raw.githubusercontent.com/snosov1/toc-org/master/README.org
- toc-org.el — source (defcustoms, `toc-org-enable`, `toc-org-insert-toc`, `toc-org-mode`): https://raw.githubusercontent.com/snosov1/toc-org/master/toc-org.el
- toc-org — MELPA: https://melpa.org/#/toc-org
- toc-org — NonGNU ELPA: https://elpa.nongnu.org/nongnu/toc-org.html
- org-make-toc (inspired-by alternative, alphapapa): https://github.com/alphapapa/org-make-toc
