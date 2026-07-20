# Coal — Design Specification

> **Status:** Living document. This is the authoritative source the builder pulls from.
> **Last updated:** 2026-07-20
>
> Coal is a Linux-native text editor with the *hands of Emacs* (central minibuffer,
> Emacs keybindings, deep hackability) and the *head of Obsidian* (plain-text notes,
> links, backlinks, live preview), speaking both **Org** and **Markdown**.

---

## 0. How to read this document

**`SPEC.md` records only decided items** — ratified design decisions and deliberate scope
boundaries. Anything still open, pending, or in-progress lives in [`TODO.md`](TODO.md), not here.

Status tags used below:

- **[DECIDED]** — ratified. The builder may implement it.
- **[DEFERRED]** — a deliberate decision to postpone. **Do not implement**, and do not pre-empt
  the outcome by building around a presumed answer. Open sub-questions are tracked in `TODO.md`.

**On the `reference/` directory.** Those files are *research and priors only* — a record of how
Emacs tooling, Org, and other PKM apps solved problems, plus notes from a prior, abandoned
implementation of Coal. **Coal is not derived from them.** If the design converges on something
that resembles prior art or the old Coal, that is only because we arrived there from first
principles. **Convergent, not derived.** No decision here may be justified by "the reference says
so."

---

## 1. Vision

Coal is a keyboard-first, Linux-native editor for people who live in plain-text notes and want
the extensibility and muscle-memory of Emacs without leaving a modern, GNOME-at-home GUI. It
edits Markdown and Org as first-class document formats, treats the user's files (and the editor's
own configuration) as the single source of truth, version-controls and syncs them via Git, keeps
private notes encrypted at rest, and is extended through one coherent command/plugin/theme
substrate.

---

## 2. Founding principles

Non-negotiables. Every downstream decision must be consistent with them.

1. **Linux-first, GNOME at home.** Linux is the primary platform, not a port. Coal must feel like
   a deliberate, native-feeling citizen of the Linux desktop — especially GNOME — not a
   cross-platform app with a Linux build bolted on as an afterthought.
2. **Plain text is the source of truth — for notes *and* configuration.** Everything the user
   creates or configures lives in human-readable, version-controllable text files. The GUI is a
   front-end onto those files, never a hidden database the files merely shadow.
3. **Git-native, and private by default.** Git version control is first-class — free off-site
   sync and full history (deliberately avoiding a paid-sync model). Because syncing means notes
   live on remotes, notes are **encrypted at rest** so that syncing — or losing the device —
   never exposes them.
4. **Keyboard-first.** The editor, the minibuffer, and constantly-used quick-access features are
   driven from the keyboard using Emacs keybindings. Mouse interaction is first-class where it
   genuinely wins (e.g. the visual graph) and available-in-addition where useful — but the core
   editing loop never *requires* the mouse.
5. **One extension substrate.** A single command/extension system. The native Emacs layer, the
   plugin system, and the theme system are all first-class citizens built on it — not separate
   worlds.
6. **Convergent, not derived.** See §0.

---

## 3. Platform & packaging **[DECIDED]**

- **Primary platform:** Linux, first-class. GNOME is the reference desktop.
- **Packaging:** RPM (primary target).
- **Native desktop integration is a feature, not a coat of paint.** Coal deliberately uses
  Electron's Linux/OS-specific customization surface so it feels at home. In scope:
  - XDG Desktop Portals (native GTK file choosers, etc.)
  - MIME association for `.md` / `.org` and file-manager "Open with"
  - Desktop notifications (libnotify / portal)
  - Follows the system light/dark preference
  - Native Wayland with correct fractional scaling (not XWayland-only)
  - Single-instance behavior via D-Bus activation
  - A polished `.desktop` entry, icons, and RPM packaging metadata
- **Boundary of "GNOME integration":** the UI is web technology themed to *look and feel* at home
  in GNOME. It is **not** built from native GTK/libadwaita widgets. "Full GNOME integration" means
  the desktop-integration layer above, not a native toolkit.

---

## 4. Technology stack **[DECIDED]**

- **Shell:** Electron.
- **Editor core:** CodeMirror 6.
- **Implementation language:** TypeScript. Both decided stack components — Electron and
  CodeMirror 6 — are authored in and ship first-class type definitions for TypeScript, so it is
  the language that carries type-checking end-to-end across the shell, the editor core, and the
  extension API without an interop seam. Given "core-as-plugins" (§8), the same typed API surface
  the core is written against is the one plugin and theme authors consume.

_(Graph/visual-rendering library and similar specifics are tracked in `TODO.md` until ratified.)_

---

## 5. Document formats **[DECIDED]**

- Coal supports **Markdown** and **Org** as **first-class document formats**, side by side.
- **Org depth = document format, not the Org application.** In scope: full Org *syntax* —
  headings, TODO keywords, links, tables, inline markup, properties/drawers — with live-preview
  authoring parity alongside Markdown.
- **Out of scope:** the Org *application suite* — agenda, Babel code execution, table spreadsheet
  formulas, and export backends. This is a firm scope boundary: Coal brings over `.org` **files,
  syntax, and writing style**, not Org's application features. A lightweight agenda/TODO view is
  **not planned** (it was previously an open "maybe later"; now settled as out of scope).

---

## 6. Interaction model **[DECIDED]**

- **Keyboard-first, Emacs keybindings** for the editor, the minibuffer, and constantly-used
  quick-access features.
- **Not keyboard-*only*.** Where an interaction is genuinely better with a mouse (the visual graph
  is the canonical example), that is a first-class mouse experience.
- **Both, where useful.** Features may expose both keyboard and mouse paths; the constraint is only
  that the core editing environment is fully operable from the keyboard.

---

## 7. View modes **[DECIDED]**

- Coal has exactly two views: **Live Preview** and **Source**.
- **There is no separate Reading / render-only mode** (for now).
- Consequence: render-only features that would belong to a reading mode — e.g. Mermaid diagrams,
  MathJax typesetting, PDF viewing, slide/presentation rendering — are **out of near-term scope**.
  Which specific rich elements render *inline within Live Preview* versus stay literal is settled in
  §7.2.
- **Source mode is a decoration toggle, not a second renderer.** Live Preview and Source are the
  same CodeMirror 6 instance; Source is Live Preview with all hide/replace decorations suppressed,
  so switching is instant and preserves scroll and selection.

### 7.1 Live Preview — reveal/hide behavior **[DECIDED]**

Live Preview prettifies inline markup (hiding the syntax markers and styling the rendered form) and
reveals the raw source again near the caret so it stays directly editable. The specifics:

- **Reveal granularity is configurable, default whole-line.** Two modes, selected via editor
  configuration (§9):
  - `line` (**default**) — the entire line the caret is on shows its raw markup; every other line
    stays prettified. Stable, no per-keystroke flicker, and every marker on the line being edited is
    visible at once.
  - `element` — only the single construct the caret sits inside reveals (the org-appear model).
    Hides more noise and reads cleaner, at the cost of markers popping in and out during
    character-by-character motion.
- **Selection always reveals raw markup**, in both granularity modes: any selection spanning a
  construct forces that construct's markers to show, so cut/copy yields true source. This is a
  correctness requirement of byte-for-byte round-tripping (§9), not a preference.
- **Instant by default, with an optional reveal delay.** Reveal is immediate; an optional idle-delay
  setting (default `0`, i.e. off) can debounce the reveal to reduce flicker while scanning through
  markup. This is a UX safety valve, not a behavioral default.
- **Reveal/hide is pure display and never mutates file bytes.** It is implemented entirely as
  CodeMirror 6 view decorations (`Decoration.mark`/`Decoration.replace`/widgets); the stored text is
  untouched. The sole Live-Preview affordance that *writes* is an explicit user edit — toggling a
  rendered task checkbox (§7.2) flips `[ ]`↔`[x]`, exactly the byte change the user would type.
- **Rendered constructs are atomic for caret navigation.** Arrow keys and Backspace treat a rendered
  unit (a link, an image, a checkbox) as a single glyph, so the caret cannot get stranded inside
  hidden URL/target text and a single delete removes the whole construct.
- **Markdown and Org get the same treatment.** Per §5 (live-preview authoring parity), the reveal/
  hide model applies symmetrically to both syntaxes — Org emphasis (`*bold*`, `/italic/`,
  `=verbatim=`, `~code~`, `+strike+`, `_underline_`), Org heading stars, Org link syntax
  `[[target][desc]]`, TODO keywords, and property/drawer lines are prettified and revealed on the
  same rules as their Markdown counterparts.

### 7.2 Live Preview — inline rendering scope **[DECIDED]**

With no Reading mode (§7), what renders inline in Live Preview is decided per element. The governing
rule: **an element renders inline only when its authoring source stays inline and editable** — the
markup is a thin wrapper you still edit as text (typographic markup, tables, task text) or a passive
display whose *source markup* you edit (images). Anything that would need a typesetting/diagram
render engine, or is entangled with a deferred system, **stays literal** — shown as its source text
in Live Preview, consistent with "no render mode."

**Renders inline** (prettified; raw source reveals near the caret per §7.1):

- **Typographic markup** — emphasis (bold/italic/strikethrough/underline), inline code/verbatim,
  headings, lists, blockquotes, and plain inline links (`[text](url)` — display the text, hide the
  URL). This *is* Live Preview and is not itself an open question.
- **Images** (`![alt](path)`) — the image renders inline; editing targets the markup, not pixels.
- **Tables** — Markdown/Org tables render as a formatted grid. This decision covers *display only*;
  a dedicated table-editing feature is separate and not implied here, so editing falls back to the
  raw row source on the active line/element.
- **Task checkboxes** (`- [ ]` / `- [x]`) — render as toggleable checkboxes with the label text
  still editable; toggling writes the `[ ]`↔`[x]` byte change (also reachable as a keyboard
  command).

**Stays literal** (shown as source text; no inline render):

- **Math** (`$…$`, `$$…$$`, Org `\(…\)` / LaTeX fragments) — render-only typesetting, out of
  near-term scope (§7).
- **Mermaid / diagrams** — render-only, out of near-term scope (§7).
- **Embeds / transclusions** (`![[…]]`) — blocked on the deferred linking & index system (§13.1) and
  data model (§13.2); not decided here.
- **Fenced code blocks** — shown as literal source with syntax highlighting only; never executed or
  rendered (no Babel execution §5, no render mode §7). Highlighting is styling over literal text.
- Other render-only artifacts (PDF, slides, raw HTML block rendering) — out of near-term scope (§7).

> **Note on wikilinks.** The reveal/hide *mechanism* above is ready for link-like constructs, but the
> concrete rendering of `[[wikilinks]]` (and their atomic widget/UUID handling) is part of the
> deferred linking system (§13.1) and lands with that design, not here.

---

## 8. Extensibility architecture **[DECIDED]**

One substrate, several front-ends.

- **Central command registry.** Everything Coal can do is a *command* registered in one place.
- **Keybindings and the minibuffer (`M-x`) are front-ends onto that registry** — two ways to reach
  the same commands, not parallel implementations.
- **Core is built on the same API plugins use** (the "core as plugins" discipline). A plugin can do
  what the core does because it registers commands / views / themes through the identical public
  API.
- **First-class plugin system** and **first-class theme system**, from the start — neither is
  deferred. Themes install through the same path as plugins.

### 8.1 Theming mechanism **[DECIDED]**

- **Themes are expressed as CSS custom properties (CSS variables).** The shell is web technology
  (§3–4), so the styling substrate is CSS; a theme is a set of variable definitions the whole UI
  reads from, not a fork of component styles. This is what lets the core and third-party themes
  share one styling surface, consistent with "core-as-plugins."
- **Theme-package format:** a theme is a directory (installable through the plugin path) containing
  a **manifest** (name, author, version, and whether it targets light, dark, or both) plus one or
  more **stylesheets that set the theme variables**. No executable code is required to define a
  theme.
- **Light/dark:** because Coal follows the system light/dark preference (§3), the variable set is
  defined for both schemes; a theme may supply values for one or both.
- _(The concrete variable catalogue — the exact names and what each controls — is a build-time
  detail that lands with the first themable surfaces, not a spec-level decision.)_

---

## 9. Configuration model **[DECIDED]**

- **Everything is operated from plain-text, version-controllable files** — editor configuration,
  keybindings, and theme definitions included, not just notes.
- **The GUI is a front-end, not a store.** Settings panes and menus **read and write text files
  only**. There is no separate authoritative settings database the text merely mirrors.
- **Goals:** declarative configuration, reproducibility, and hassle-free transfer of a full editor
  setup from machine to machine (drop the files in, done).
- **Standard config format: TOML — but not mandatory.** TOML is the default, human-authored format
  for editor configuration, keybindings, and theme manifests. It is chosen because it round-trips
  cleanly through a GUI settings pane (the §9 rule that the GUI reads/writes text with no shadow
  store rules out an *evaluated* config language), it is low-ambiguity and declarative, and it
  avoids YAML's whitespace and implicit-typing sharp edges. **A single format is a default, not a
  requirement:** where another format is genuinely better suited for the job (e.g. JSON for
  machine-generated or interchange data), Coal uses it deliberately rather than forcing everything
  into TOML. The invariant is §9 itself — whatever the format, it stays plain-text and
  version-controllable — not any one file type.

---

## 10. Sync, version control & privacy

### 10.1 Git version control **[DECIDED]**

- Git is a **first-class** part of Coal, not an optional integration. It provides **free off-site
  sync** (a deliberate advantage over paid-sync models) and complete, browsable **history**.

### 10.2 Encryption at rest **[DECIDED — as a requirement]**

- **Notes / user content are encrypted at rest.** A private repo is not enough: the stored bytes
  must be ciphertext so neither the remote host nor a lost/stolen device exposes the content.
- **Transparent to the user.** The authoring format stays plain `.md` / `.org`; inside Coal
  (unlocked) the user sees and edits plain text. Coal decrypts for use and **re-locks when the app
  is closed**.
- **Scope:** user notes/content. Configuration (§9) stays plaintext-versioned so it remains
  shareable and declarative.

### 10.3 Encryption mechanism **[DEFERRED]**

The exact scheme is **undecided and must not be implemented until ratified**. It is as
consequential as the linking system and is entangled with the Git diff/merge strategy and the
(deferred) data model. Open sub-questions — threat model, key derivation, approach, key
management, diff/merge over ciphertext — are tracked in `TODO.md`.

---

## 11. License **[DECIDED]**

- **Coal is open source under the Apache License 2.0.**
- **Why Apache-2.0:** it is permissive — which keeps the plugin/theme ecosystem and contribution
  frictionless — and fully compatible with the entire intended dependency stack (all MIT / ISC /
  Apache-2.0 / MPL-2.0, no copyleft; see `reference/16`). Over a bare MIT license it adds an
  explicit patent grant and defensive-termination clause, the more compliance-robust permissive
  default for an application taking outside contributions.
- **Files:** `LICENSE` (verbatim Apache-2.0 text) and `NOTICE` (project copyright). Per-dependency
  attribution becomes a build-time task once real dependencies exist (tracked in `TODO.md`).

---

## 12. Documentation model **[DECIDED]**

- Documentation is **first-class and written as-we-go**: a feature is not "done" without its docs.
- Documentation is **split by audience** so neither reader wades through the other's material:
  - `docs/user/` — how to *use* Coal to edit files. Assumes no interest in internals.
  - `docs/dev/` — architecture, internals, and how to *extend* Coal (plugins, themes,
    contributing).
- Each feature ships a user-facing doc, a developer-facing doc, or both, as appropriate.

---

## 13. Deferred by decision **[DEFERRED]**

These are deliberately postponed. **Do not implement, and do not design around a presumed
outcome.** Open sub-questions live in `TODO.md`.

- **13.1 Linking & index system** — wiki-style links, backlinks, block references, and the
  index/derivation that powers them. No decisions recorded.
- **13.2 Data model (document vs block)** — whether notes are documents or carry an outliner/block
  model, and the on-disk representation beyond "plain-text files." Entangled with §13.1.
- **13.3 Encryption mechanism** — see §10.3.

---

## 14. Decision log

| Date       | Decision | Rationale |
|------------|----------|-----------|
| 2026-07-20 | Fresh rewrite; `reference/` is research/priors only, not a blueprint | Owner dissatisfied with prior implementation; wants a design reached from first principles. Convergent, not derived. |
| 2026-07-20 | Platform: Linux-first, GNOME-at-home, RPM; deep desktop integration in scope | Linux must feel native and deliberate, not an afterthought. |
| 2026-07-20 | Stack: Electron + CodeMirror 6 | Closest to the intended Obsidian-like stack; largest ecosystem; fastest path to parity. |
| 2026-07-20 | Implementation language: TypeScript | Both decided stack components are TS-native; end-to-end type-checking across shell, editor core, and the plugin API with no interop seam. |
| 2026-07-20 | Theming: CSS custom properties; theme = manifest + variable-setting stylesheets, installed via the plugin path; no executable code required | Web-tech shell means CSS is the styling substrate; one variable surface shared by core and third-party themes (core-as-plugins). |
| 2026-07-20 | Config format: TOML is the standard/default (config, keybindings, theme manifests); a single format is a default, not a requirement — best-suited format per job (e.g. JSON) is allowed | TOML round-trips through a GUI pane (§9), is declarative and low-ambiguity, avoids YAML footguns; the real invariant is §9 (plain-text, version-controllable), not one file type. |
| 2026-07-20 | Org: bring over `.org` files, syntax, and writing style only; lightweight agenda/TODO view is not planned | Org depth is document-format, not the Org application; owner is not interested in Org application features beyond files and syntax. |
| 2026-07-20 | Formats: Markdown + Org, both first-class; Org = document-format depth only | Full Org authoring without re-implementing the Org application suite. |
| 2026-07-20 | Interaction: keyboard-first core (Emacs keys); mouse-first where it wins; not keyboard-only | Emacs muscle memory for the editing loop; pragmatic mouse use for things like the graph. |
| 2026-07-20 | View modes: Live Preview + Source only; no Reading/render mode (for now) | Keeps scope tight; render-only features (math, diagrams, PDF, slides) fall out of near-term scope. |
| 2026-07-20 | Live Preview reveal/hide: configurable granularity (whole-line default, per-element optional); selection always reveals raw markup; instant with optional delay; pure display, byte-safe; atomic rendered constructs; symmetric Markdown/Org | Whole-line matches Obsidian and avoids caret-motion flicker; per-element (org-appear model) reads cleaner for those who want it; selection-reveal and byte-safety protect round-trip fidelity (§9). |
| 2026-07-20 | Live Preview inline rendering: images, tables, and task checkboxes render inline; math, Mermaid, embeds, fenced-code, PDF/slides stay literal | Render inline only what stays inline-editable as source (typographic, images, tables, task text); anything needing a render engine (math/Mermaid) or entangled with deferred linking (embeds) stays literal — consistent with "no Reading mode" (§7). |
| 2026-07-20 | Extensibility: one command substrate; keys + `M-x` are front-ends; core-as-plugins; first-class plugin *and* theme systems | Native Emacs feel and a real plugin/theme ecosystem are the same system, not two. |
| 2026-07-20 | Configuration: everything in plain-text, version-controlled files; GUI reads/writes text only | Declarative, reproducible, portable machine-to-machine. |
| 2026-07-20 | Git version control is first-class | Free off-site sync (vs paid-sync models) and full history. |
| 2026-07-20 | Notes encrypted at rest (transparent unlock/re-lock); mechanism deferred | Private notes must not be exposed by syncing or a lost device; the scheme is too consequential for a snap decision. |
| 2026-07-20 | License: Apache-2.0 (open source) | Permissive (frictionless ecosystem), fully compatible with the non-copyleft dependency stack, and adds a patent grant over bare MIT. |
| 2026-07-20 | Audience: owner-first, dogfooded from day one; public release later; adoption gated on feature maturity + data security | Design and validate against real daily use; security is a prerequisite for the owner's own switch-over. |
| 2026-07-20 | Data model (document vs block): deferred, no decisions recorded | Foundational and entangled with linking; own session later. |
| 2026-07-20 | Linking & index system: deferred, no decisions recorded | Too consequential for a snap decision; own session later. |
| 2026-07-20 | Process: `SPEC.md` holds decided items only; open/pending work tracked in `TODO.md` | Keep the builder's source-of-truth clean; the open list will grow fast during build. |
