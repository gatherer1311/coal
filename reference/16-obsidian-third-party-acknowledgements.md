# Obsidian's third-party acknowledgements — a build-vs-adopt map for Coal

**What this is.** A researched pass over every library Obsidian credits on its
[Credits → *Third party acknowledgements*](https://help.obsidian.md/credits) page,
read *as a dependency menu for Coal*. Coal's own reference material establishes that
Coal is a **TypeScript, CodeMirror 6 (CM6) Markdown editor** — edit-only (SPEC §13),
live-preview via CM6 decorations, Emacs-flavoured command palette / keybindings, and
the injection-free linking design of `reference/15`. That architecture is *the same
architecture Obsidian is built on*, so Obsidian's acknowledgement list is unusually
pertinent: it is, almost line for line, the set of building blocks a Coal-shaped app
either already uses, should adopt, should study, or can safely skip.

**Source captured.** `https://obsidian.md/help/credits/#Third+party+acknowledgements`
(mirror: `https://help.obsidian.md/credits`; canonical source-of-truth:
[`obsidianmd/obsidian-help` → `en/Obsidian/Credits.md`](https://github.com/obsidianmd/obsidian-help/blob/master/en/Obsidian/Credits.md)).
Accessed 2026-07-20. The obsidian.md host 403s automated fetchers; the list below is
the credits page's *Third party acknowledgements* section, verbatim (versions and
licences preserved as published).

**One-line takeaway.** Obsidian's list *validates Coal's core bet* (CM6 + Lezer as the
editor/parser spine) and cleanly sorts the rest into four buckets: **adopt now**
(Turndown, DOMPurify, `yaml`, Lucide), **study / defer** (remark, Electron, PixiJS,
i18next, Moment→modern), **rendering features an edit-only tool defers** (Mermaid,
MathJax, pdf.js, reveal.js, Prism), and **out of scope** (Capacitor, scrypt, Webpack,
rbush). None of it is GPL — every entry is MIT / ISC / Apache-2.0 / MPL-2.0, so all are
licence-compatible with either a proprietary or an open Coal.

---

## 1. The acknowledgements, verbatim

> Obsidian uses the open source libraries below (in alphabetical order):

| Library | Version | Licence | Copyright (as credited) |
|---|---|---|---|
| **Capacitor** | 5.x | MIT | © 2017–present Drifty Co. |
| **CodeMirror** (Vim) | 6.0.0 | MIT | © 2018 Marijn Haverbeke, Adrian Heine, and others |
| **DOMPurify** | — | MPL 2.0 | cure53 (github.com/cure53/DOMPurify) |
| **Electron** | 37.3.0 | MIT | © Electron contributors; © 2013–2020 GitHub Inc. |
| **i18next** | — | MIT | © 2022 i18next |
| **Lezer** | — | MIT | © 2018–2021 Marijn Haverbeke and others |
| **Lucide** | 0.446.0 | ISC | © 2020 Lucide Contributors |
| **MathJax** | — | Apache 2.0 | — |
| **Mermaid** | 11.4.1 | MIT | © 2014–2022 Knut Sveidqvist |
| **Moment.js** | 2.29.4 | MIT | © JS Foundation and contributors |
| **pdf.js** | — | Apache 2.0 | — |
| **PixiJS** | — | MIT | © 2013–2017 Mathew Groves, Chad Engler |
| **Prism** | 1.29.0 | MIT | © 2012 Lea Verou |
| **rbush** | — | MIT | © 2016 Vladimir Agafonkin |
| **remark** | — | MIT | © 2014–2020 Titus Wormer; © 2011–2014 Christopher Jeffrey |
| **reveal.js** | 4.3.1 | MIT | © 2011–2022 Hakim El Hattab and contributors |
| **scrypt** | — | Apache 2.0 | — |
| **Turndown** | — | MIT | © 2017 Dom Christie |
| **Webpack** | — | MIT | © JS Foundation and contributors |
| **YAML** | 2.7.0 | ISC | © Eemeli Aro |

*(The same page also credits the Obsidian core team, contributors, moderators, plugin
inspirations, translators and doc maintainers — people, not libraries, and out of scope
for a technical reference.)*

---

## 2. Per-library analysis — what it is, what Obsidian uses it for, how it pertains to Coal

Relevance tags: **CORE** (Coal already stands on this / must), **ADOPT** (concrete
near-term win), **STUDY** (worth understanding, likely later), **DEFER** (a reading-mode
render feature an edit-only Coal postpones), **SKIP** (out of Coal's scope).

### CodeMirror 6 — **CORE**
The editor Coal *is built on*. Obsidian credits it as "CodeMirror (Vim) 6.0.0" because it
ships the `@codemirror/vim` keymap; the analogous line in Coal is Emacs mode via
`@replit/codemirror-emacs` (see `reference/13`). Everything Coal does — live-preview
`Decoration.replace`/`mark`/`widget`, the `[[` autocomplete (`EditorSuggest`-equivalent),
`@codemirror/search` for `C-s`/`C-r`, per-leaf extension arrays — is CM6. This
acknowledgement is not a "could adopt"; it is the spine. *Cross-ref: `reference/13` §"Live
Preview is CM6 decorations, not a renderer"; `reference/15` §3 "reuse the existing parser +
decoration."*

### Lezer — **CORE**
Lezer is the LR/GLR **incremental parser system** behind CM6 (Marijn Haverbeke, inspired
by Tree-sitter). It re-parses cheaply after a local edit by reusing subtrees of the prior
parse. `@lezer/markdown` is almost certainly the "existing parser" `reference/15` §3 tells
the next session to *reuse*. This matters doubly for the injection-free resolver: the
live-preview and the block/landmark anchor resolution both need a cheap, incremental,
error-tolerant syntax tree of the *current* bytes on every keystroke — exactly Lezer's
job. Understand Lezer's tree format (compact 16-bit node arrays; `SyntaxNode` cursors)
before touching Coal's block-fingerprint pass. *Cross-ref: `reference/15` §4 "per-block
fingerprints … structural path."*

### DOMPurify — **ADOPT (security-critical)**
An XSS sanitiser (cure53) that strips dangerous HTML. Obsidian runs it over rendered
Markdown in reading mode. Coal is edit-only with *no* reading-mode renderer (SPEC §13) —
but the moment Coal injects *any* HTML into a `Decoration.widget`/`replace` (a rendered
link chip, a backlink preview, an embed, a confidence breadcrumb populated from note
text), that HTML is derived from **untrusted note content** and must be sanitised.
Coal's ethos is literally injection-*free*; letting note bytes inject script into the
editor DOM would be the ugliest possible violation of that principle. Adopt DOMPurify (or
strictly build widgets with `createEl`/`textContent`, never `innerHTML`) as a standing
rule for every widget factory. Note: MPL-2.0 is file-level copyleft — fine to consume as a
dependency, no obligation to open Coal.

### Turndown — **ADOPT (direct ethos fit)**
HTML→Markdown converter (Dom Christie). Obsidian uses it for **paste-as-Markdown**:
pasting rich text from the web/Word/email yields clean Markdown instead of a wall of HTML.
This is a near-perfect fit for Coal's founding principle — *"the note file is 100% the
user's bytes, plain standard Markdown"* (`reference/15` §1). A paste that injected raw
HTML would violate that on the very first paste. Wiring Turndown into Coal's CM6 paste
handler (read `text/html` from the clipboard, convert, insert clean CommonMark) is a
small, high-value, ethos-aligned feature. *Cross-ref: `reference/15` §1 founding
principle.*

### YAML (`yaml`, Eemeli Aro) — **ADOPT (read-only, nuanced)**
The modern, spec-compliant YAML parser Obsidian uses for frontmatter. Nuance for Coal:
the injection-free design **abolishes writing** frontmatter `id:` and inline `^id:`
(`reference/15` §4 "No-frontmatter", §8 migration). But it does **not** abolish *reading*
user-authored frontmatter — `resolveTitle()` still honours a user-typed `title:` as the
first identity source (`reference/15` §33), and users keep their own `tags:`/`aliases:`.
So Coal needs read-only YAML parsing while never emitting a byte of its own. `eemeli/yaml`
is the right, permissive (ISC) choice. Guardrail: the parser is *read-only* — no
round-trip writer, or it re-opens the injection door.

### Lucide — **ADOPT (UI)**
The icon set (ISC, a Feather fork) Obsidian renders throughout its UI. Coal's roadmap UI —
backlinks navigator, links-audit linter panel, Resolved/Needs-attention/Broken confidence
badges (`reference/15` §2, §7 D) — needs a consistent icon vocabulary. Lucide is the
obvious pick: permissive licence, tree-shakeable SVGs, and visual parity with the Obsidian
idiom Coal already borrows. Low effort, immediate polish.

### remark (unified / mdast) — **STUDY**
A plugin-driven Markdown-AST processor (`remark-parse` → `mdast` → `remark-stringify`,
part of the unified collective). This is a *different* parser from Lezer and Coal should
understand why it might want **both**: Lezer is the in-editor, incremental, per-keystroke
tree; remark/mdast is a batch, whole-document AST better suited to **offline/index work** —
scanning every note to extract headings, blocks and `[[ ]]` links when building
`.coal/index/`, and to power `export-portable-link` (`reference/15` §3 form 9,
CommonMark Text-Fragment output). Caution: a dual-parser reality means **two
normalizers**, and `reference/15` §7 fork #10 demands a single *frozen, byte-identical*
normalizer shared by minter and matcher — if remark and Lezer disagree on
whitespace/Unicode/markdown-stripping, anchors mismatch. Study before adopting; keep one
normalizer authoritative.

### Electron — **STUDY (likely the shell)**
Chromium + Node desktop runtime; Obsidian's desktop app. Coal running CM6 in a
browser-grade DOM with filesystem access implies an Electron-class shell (`reference/13`
line 98 already reasons about Electron multi-`BrowserWindow` and explicitly scopes
pop-out windows *out* for now). Relevant mainly for: filesystem watch (feeding the
"rebuild-from-notes-alone" litmus), process model, and *not* over-reaching into
multi-window until the core linking model is settled.

### PixiJS — **STUDY (only if a graph view happens)**
WebGL 2D renderer; Obsidian uses it to draw the **Graph View** at scale. Coal *has* a
link graph conceptually — resolved forward edges + derived backlinks (`reference/15` §4) —
but is keyboard-first and edit-only, so a visual force-graph is not on the near roadmap.
File this as "if Coal ever visualises the graph, this is how Obsidian made it fast," not a
current need.

### rbush — **SKIP (note the conceptual parallel)**
A 2D **R-tree spatial index** (Vladimir Agafonkin) for "everything in this bounding box"
queries — used for maps, canvases, hit-testing (in Obsidian, graph/canvas geometry).
Coal's index is *textual*, not spatial, so rbush itself is out of scope. The parallel
worth stealing is *conceptual*: rbush exists because you never brute-force-scan all
candidates: you index for cheap candidate-generation. Coal's resolver needs the textual
analog — a **simhash-LSH table + shingle inverted map** for bounded fuzzy candidate-gen
(`reference/15` §4). Same idea, different metric space.

### i18next — **STUDY (later)**
Internationalisation framework; Obsidian's UI translations. Legitimate eventually, orthogonal
to the linking core. Defer until Coal's command/label surface stabilises, then externalise
strings once.

### Moment.js — **STUDY, but pick a modern replacement**
Date/time library; Obsidian uses it for daily notes and date formatting. Note that
Moment.js is in **maintenance mode** and its own maintainers steer new projects elsewhere.
If Coal grows daily-notes/date features, prefer a modern library (Luxon, date-fns, or the
`Temporal` API) rather than inheriting Moment. Listed here for completeness, not adoption.

### Prism — **DEFER / mostly N/A**
Static syntax highlighter (Lea Verou) for rendered code blocks. In an edit-only CM6 app,
code-block highlighting inside the editor comes from **CM6's own nested Lezer language
packages** (`@codemirror/lang-*`), not Prism. Prism only becomes relevant if Coal later
adds a static HTML *reading/export* renderer. Skip for the editor; revisit only for export.

### MathJax — **DEFER (render feature)**
LaTeX math typesetting. A reading-mode render feature; Coal is edit-only, so math *display*
is deferred. (Editing `$...$` as plain text needs nothing.)

### Mermaid — **DEFER (render feature)**
Text-to-diagram rendering of ` ```mermaid ` blocks. Same reasoning as MathJax: a
render-mode feature an edit-only tool postpones. The source stays plain fenced text, which
is on-ethos.

### pdf.js — **SKIP (attachment viewing)**
Mozilla's PDF renderer; Obsidian views PDF attachments inline. Out of scope for Coal's
note-linking core.

### reveal.js — **SKIP (presentations)**
HTML presentation framework behind Obsidian's Slides. Out of scope.

### scrypt — **SKIP (note for future encryption)**
Password-based key-derivation function; Obsidian uses it for encryption paths (e.g. Sync).
Only relevant if Coal ever ships encrypted sync/at-rest. Note and move on.

### Webpack — **SKIP (build tooling)**
Module bundler for Obsidian's build. A toolchain choice, not a runtime dependency; Coal is
free to use esbuild/Vite/`tsc`. No bearing on the linking design.

### Capacitor — **SKIP (mobile)**
Ionic's native runtime that wraps a web app as an iOS/Android (and desktop) native app;
Obsidian Mobile is built on it. Coal is a desktop, keyboard-first, Emacs-flavoured editor;
mobile is not in scope. Note it only as the path Obsidian took to mobile, should Coal ever
want one.

---

## 3. Synthesis — what this tells Coal

**a. The core bet is validated.** The two most load-bearing entries — **CodeMirror 6** and
**Lezer** — are exactly the spine Coal already chose. Obsidian, the most successful app in
this category, stands on the same two. That is strong external corroboration that Coal's
"reuse the existing parser + decoration" instruction (`reference/15` §3) is the right
foundation, and that the injection-free resolver should be built *on top of* the Lezer tree,
not beside a second bespoke parser.

**b. Four libraries are near-term, ethos-aligned adoptions:**
- **Turndown** — paste-as-clean-Markdown; directly serves the "100% user bytes" principle.
- **DOMPurify** (or a strict no-`innerHTML` widget discipline) — mandatory the instant any
  decoration widget renders note-derived HTML; an injection-free project must not inject.
- **`yaml`** (eemeli) — *read-only* frontmatter parsing for `resolveTitle()`; never a writer.
- **Lucide** — the icon vocabulary for the linter / backlinks / confidence-badge UI.

**c. One library reframes a design tension.** **remark/mdast** offers a batch AST for the
index and portable-export paths — but adopting it collides head-on with fork #10's
*single frozen normalizer* requirement. The lesson is not "adopt remark," it's "if a second
parser enters, its normalizer must be provably byte-identical to Lezer's, or anchors drift."

**d. The "defer" bucket confirms Coal's scope discipline.** Mermaid, MathJax, pdf.js,
reveal.js, and Prism are all **render-mode** features. Coal being edit-only (SPEC §13) is
precisely why it gets to postpone the largest, heaviest five dependencies on Obsidian's
list — a real architectural saving, not a gap.

**e. Licensing is clean.** MIT / ISC / Apache-2.0 / MPL-2.0 across the board; no GPL, no
LGPL. Every adopt/study candidate is compatible with a proprietary or an open Coal.
DOMPurify's MPL-2.0 is file-level copyleft only (safe as a library dependency).

**f. rbush is a metaphor, not a dependency.** Its presence is a reminder that Coal's
resolver must index for cheap candidate-generation (simhash-LSH + shingle inverted map,
`reference/15` §4) rather than brute-force-scan the vault per link — the textual analog of
a spatial index, and a live suspect area for the performance/freeze concern flagged in
`reference/15` §6.5.

---

## 4. Cross-references
- `reference/13-obsidian-how-ui-ux.md` — the CM6 decoration model, `EditorSuggest`
  autocomplete, command palette; the concrete home for Lucide, DOMPurify-guarded widgets,
  and CM6/Electron notes.
- `reference/14-obsidian-linking-system.md` — Obsidian's link mechanics, the baseline
  Coal's injection-free design departs from.
- `reference/15-injection-free-linking-design.md` — the design brief; §1 (100%-user-bytes
  founding principle → Turndown/DOMPurify/yaml constraints), §3 (reuse parser + export
  form → Lezer/remark), §4 (index, LSH → rbush parallel), §7 fork #10 (frozen normalizer →
  the remark caveat), §6.5 (perf/freeze suspect → candidate-gen indexing).

---

## 5. Sources
- [Obsidian — Credits (Third party acknowledgements)](https://help.obsidian.md/credits) ·
  [source markdown](https://github.com/obsidianmd/obsidian-help/blob/master/en/Obsidian/Credits.md)
- [Lezer — Marijn Haverbeke](https://lezer.codemirror.net/) ·
  [design essay](https://marijnhaverbeke.nl/blog/lezer.html) ·
  [`@lezer/markdown`](https://code.haverbeke.berlin/lezer/markdown)
- [remark / unified](https://github.com/remarkjs/remark) · [remark.js.org](https://remark.js.org/)
- [Turndown (mixmark-io)](https://github.com/mixmark-io/turndown)
- [RBush (mourner)](https://github.com/mourner/rbush)
- [DOMPurify (cure53)](https://github.com/cure53/DOMPurify)
- [`yaml` (eemeli)](https://www.npmjs.com/package/yaml) · [Lucide](https://lucide.dev/)
