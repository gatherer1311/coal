# Coal — Design Specification

> **Status:** Living document. This is the authoritative source the builder pulls from.
> **Last updated:** 2026-07-21
>
> Coal is a Linux-native text editor with the *hands of Emacs* (central minibuffer,
> Emacs keybindings, deep hackability) and the *head of Obsidian* (plain-text notes,
> links, backlinks, live preview), speaking both **Org** and **Markdown**.

---

## 0. How to read this document

**`SPEC.md` records only ratified decisions** — final design decisions and deliberate scope
boundaries, each tagged **[DECIDED]**. Anything still open, pending, or in-progress lives in
[`TODO.md`](TODO.md), not here.

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
- **Embeds / transclusions** (`![[…]]`) — stay literal; the linking & index system they depend on is
  decided (§13), but whether embeds ever render inline is an open v1-surface item (`TODO.md`).
- **Fenced code blocks** — shown as literal source with syntax highlighting only; never executed or
  rendered (no Babel execution §5, no render mode §7). Highlighting is styling over literal text.
- Other render-only artifacts (PDF, slides, raw HTML block rendering) — out of near-term scope (§7).

> **Note on wikilinks.** The reveal/hide *mechanism* above is ready for link-like constructs; the
> concrete rendering of `[[wikilinks]]` — including the Live-Preview decoration that surfaces a
> block link's precision (§13.5) — is specified with the linking system in §13.

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

### 8.2 Plugin API & sandboxing **[DECIDED]**

- **Language.** Plugins are authored in **TypeScript / JavaScript** against the **same typed API
  the core is written against** (§4, §8). There is no separate embedded plugin language;
  "core-as-plugins" means one API surface and one language, not a privileged native core with a
  lesser scripting layer bolted on.
- **Isolation model: in-process, but without ambient authority.** Plugins execute **in-process** —
  fast, and powerful enough to build the core itself through the same API. But **ambient Node.js /
  Electron authority is withheld**: plugin code does *not* receive `require('fs')`, raw
  `child_process`, the network stack, or Electron internals by default. **The typed Coal API is the
  sole channel to any host capability.** This is the load-bearing commitment — without it, an
  in-process plugin could simply reach around any permission model via raw Node, and the manifest
  below would be documentation rather than a gate.
- **Capabilities are declared and broker-enforced.** Every plugin ships a **manifest** (TOML, per
  §9) declaring the capabilities it needs — e.g. filesystem scope, network hosts, note-content
  access, shell / child-process, clipboard. The API **broker enforces the manifest**: an operation
  the manifest never declared is not reachable. A plugin that never declared `note-content` or
  `network` therefore cannot read decrypted notes or phone home — which is what gives the
  "encrypted at rest / private by default" posture (§10) a handle a plugin cannot silently route
  around.
- **Trust tiers.** **First-party / core** plugins are trusted and may be granted capabilities by
  default — this is how core-as-plugins builds the whole editor through the public API.
  **Third-party** plugins have their **declared capabilities surfaced to the user at install for
  consent**; grants are **revocable** and **auditable** afterward.
- **Honest boundary.** A *granted* capability is genuine access: a plugin the user grants
  `note-content = "read"` really does see decrypted note text in memory. The controls are therefore
  **least-privilege declaration + explicit consent + revocation + an auditable grant record** — not
  a claim that arbitrary plugin code is fully contained. The value of the model is that the
  *default* is **no ambient authority** and every sensitive reach is **declared and consented** — a
  real improvement over all-or-nothing in-process trust, without the ecosystem friction and the
  core-as-plugins conflict of a hard RPC/interpreter sandbox.
- **Reconciliation with §8 ("identical public API").** The API surface core and third-party plugins
  call is **identical**; what differs across trust tiers is **which capabilities are granted**, not
  the API itself. Core-as-plugins holds at the API level; the capability broker is orthogonal to it.

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

## 13. Linking, identity & the Overlay **[DECIDED]**

Coal's linking and index system. The design is
**stand-off identity**: the note file is inviolable plain text, and all the identity that powers
links, backlinks, and block addressing lives in a Coal-maintained layer *above* the notes, pointing
in — never injected into them.

### 13.1 Founding stance

- **Notes are 100% the user's bytes.** Every note is pure, standard Markdown or Org. Coal writes
  **zero identity** into note files — no injected block markers, no frontmatter `id:`, no per-block
  `^id:<uuid>`. This abolishes both Obsidian's `^blockid` mechanism and Coal's prior UUID-injection
  model.
- **Links belong in the note; identity anchors never do.** The one Coal-related thing that lives in
  a note is a *link the user authored* — a wikilink, Markdown link, or Org link. Those are portable
  content. The line is exact: **references (source-side) live in the file; identity anchors
  (target-side) live in the Overlay.**
- **Files are portable; the deep graph is Coal-only, by design.** A note folder can be picked up and
  opened in any editor — it is clean Markdown/Org that renders everywhere, and human-readable links
  resolve however that editor chooses. Coal's *block-precise* graph is an enrichment layer only Coal
  sees. Portability of the files and of link *meaning* is total; portability of block-precise
  *navigation* is deliberately Coal-only.

### 13.2 The three-tier model

Stand-off identity upgrades Coal's data model from two tiers (notes + a disposable index) to
**three**:

- **Tier 0 — Notes.** Authoritative *content*. Pure Markdown/Org, never altered by Coal, fully
  portable.
- **Tier 1 — The Overlay.** Authoritative *identity & intent* — stable node ids, block anchors, and
  which block a given link means. Plain-text, human-readable, and **committed to Git alongside the
  notes.** It is **not disposable.**
- **Tier 2 — The derived index.** Backlinks, search structures, the resolved graph. Disposable,
  Git-ignored, and fully **regenerable from Tiers 0 + 1**.

Consequence, stated plainly: the "delete the index and rebuild from the notes alone" litmus
**weakens by design** to "delete Tier 2 and rebuild from Tier 0 + Tier 1." The Overlay carries
*intent* that raw prose cannot regenerate, so it is a first-class, versioned artifact — not a cache.

**Committed-everything principle.** Notes, the Overlay, and configuration (§9) are **all**
version-controlled and portable, always. A user's notes, the identity that links them, and the
editor setup they invested in all travel together.

### 13.3 Uniform addressing — the node registry

The Overlay's spine is a registry in which **every addressable thing is a node of one uniform
shape**: a **note**, a **heading**, a **block**, or a **link**. A note, a heading, and a block are
simply nodes at three granularities (whole file / section / single block); a link is a node too, so
its position is maintained like any other. One resolver, no special-casing — this is the "refer to
notes, headings, and blocks within one system" requirement.

Each node record carries three groups of fields:

- **Identity** — an opaque **stable id** (minted once), a **kind** (`note | heading | block |
  link`), and a **parent** id (building the note ▸ heading ▸ block tree).
- **Anchor** (locate in *current* bytes) — a character **range** and a **structural path** (e.g.
  `note ▸ heading[2] ▸ block[3]`).
- **Durability** (survive edits) — a **normHash** (hash of the normalized text), an optional
  **simhash** (for the fuzzy/ambiguous cases), bounded **neighbor** fingerprints, a **kindTag**
  (paragraph / list-item / table / code), and a **status** (`resolved | dangling | ambiguous`).

**Opaque ids are acceptable here** precisely because they live in the Overlay and never in a note.
The property that made `[[uuid]]` intolerable — an opaque token *in the file* — does not apply to a
token no other editor ever sees.

**Sidecar ownership rule.** A sidecar owns exactly the nodes **physically written in its own note.**
Note B's blocks live in B's sidecar; note A's links live in A's sidecar. A cross-note reference is a
pointer from A's sidecar to a node id in B's sidecar. The rule follows from the diff-ratchet
(§13.6): a node must be tracked against the bytes it lives in, because those are the edits it has to
survive.

### 13.4 Registration policy — lazy

- **Notes** are registered with durable identity (the graph, backlinks, and rename-stability need
  it).
- **Headings** resolve by their own heading text, portably; they need no persistent anchor.
- **Blocks are registered lazily** — a block gains a persistent anchor and diff-ratchet tracking
  **only when it first becomes a link target.** Coal can always *live-parse* any file to see all of
  its blocks on demand (full knowledge is always available); what is deferred is durable *tracking*,
  which is only worth paying for a block something actually points at. Nothing structural (notably
  the graph) depends on blocks.
- A block has **one canonical node**; its id is **reused** across every referrer. A housekeeping pass
  may garbage-collect a block node once nothing references it.

### 13.5 Link forms & resolution

- **Notes and headings** are addressed by ordinary, portable links that resolve from text already in
  the target file — `[[Design Notes]]`, `[[Design Notes#Resolution]]`, or their Markdown/Org
  equivalents. Nothing is stored in the target.
- **Blocks (the "Option 1" rule).** The link *written in the note* is the portable heading-level link
  (`[[Note#Heading]]`); the **block precision is an Overlay refinement recorded in the *source*
  note's sidecar**, pointing at the target block's stable id. In another editor the link drops the
  reader at the heading; in Coal it resolves to the exact block. Coal decorates the link in Live
  Preview to surface the block precision the bytes don't encode.
- **References store stable ids** (target note id + block id), never a path or a raw position — so a
  reference is immune to *both* renaming the target note *and* relocating the block within it.
- **Same block, many referrers.** A block has one canonical node in its home sidecar; each referring
  note carries its *own* reference record (in its own sidecar) pointing at that one id. Same target,
  distinct references — adding a referrer touches only the referrer's sidecar, never the target's.

### 13.6 Durability — the diff-ratchet

Identity is **maintained, not guessed.** Coal always retains a last-known-good baseline of each
tracked file (the Overlay's `lastKnownBlob`, deepened by Git history). Re-anchoring is therefore
always a **diff** (last-known → current), never a search from nothing.

- **Edits made inside Coal** — anchors are updated transactionally as the user types. O(1)-certain;
  distance to cover is zero.
- **Edits made outside Coal** — when a changed file returns, Coal walks its anchors forward from the
  last-known baseline. Because the baseline is continuously refreshed, each step is a small delta;
  the anchor follows the block one short hop at a time (the "ratchet"), never one impossible leap
  across the whole history. This also means fingerprint **drift never accumulates**, dissolving the
  "ship-of-Theseus" decay problem of static fingerprints.
- **Outcomes:** a **relocated** block is followed silently; an **altered** block is followed with its
  fingerprint refreshed; a **removed** block goes **dangling**.

**Honesty guarantee.** The only cases the ratchet cannot resolve to a certainty — a deleted block, a
verbatim duplicate in the same scope, or a single foreign leap so large that "same block, edited"
vs. "replaced block" is a genuine judgment call — are exactly the cases a *human* could not resolve
either. These are **surfaced** (amber, one-keystroke confirm), never silently mis-pointed. This is a
stronger correctness contract than any injected-marker scheme, which breaks silently.

### 13.7 The Reconciliation Engine

The executor that keeps the Overlay true to the bytes. It is **first-class core infrastructure**,
specified from the start — the Overlay's maintenance plan is inert without it.

**Triggers:**

| Trigger | Fires when | Why |
|---|---|---|
| Open | a note is opened | it may have changed since last seen |
| In-Coal edit | the user types | transactional anchor maintenance |
| Save | the buffer flushes | refresh that file's baseline |
| Import | a path is brought under management | register notes, parse structure, set baselines |
| Filesystem watcher | a managed file changes while Coal runs | catch out-of-Coal edits promptly (debounced) |
| Startup reconcile | a vault is opened | catch changes made while Coal was not running |
| Post-Git | after pull / merge / checkout | targeted rescan of the files Git reports changed |

**Mechanism.** A cheap **dirty-check** first (mtime + size pre-filter, then a content hash compared
to `lastKnownBlob`; **unchanged files are skipped entirely**, which keeps even a full startup pass
cheap), then, for changed files only, the **diff-ratchet running off the main thread** — it must
never resolve synchronously in the edit loop (the synchronous path is the suspected cause of the
prior freeze/data-loss failure mode). Work is always **incremental and per-file.**

**Foreign renames.** Since a note carries no id, a rename outside Coal appears as *"an unknown file
appeared and a known note vanished."* Coal pairs the orphaned sidecar to the unknown file **by
content**: an exact match against the sidecar's `lastKnownBlob` is a confident re-pair (update the
path, move the sidecar to mirror it); a renamed-and-edited file is reconciled by the ratchet +
fingerprint; genuine ambiguity is surfaced for confirmation. When the rename was committed, Git's
own rename detection (`-M`) is used as the high-confidence signal. **Coal-initiated renames** move
the note and its sidecar atomically and never hit this path.

**Deletions** with no content match anywhere mark the note's tracked nodes **dangling**; inbound
links surface in the panels (§13.9).

### 13.8 Storage layout

- **Mirrored, per-file sidecars.** Each note has a sidecar under `.coal/` mirroring the note tree —
  `notes/design.md` → `.coal/overlay/notes/design.md.json` — in **JSON** (machine-maintained data;
  §9 explicitly permits the best-suited format per job).
- **Lazy sidecar creation.** A note gets a sidecar only once it carries durable Overlay state, so
  file-count tracks real usage rather than doubling outright.
- **Why per-file.** It is the only layout that gets **churn locality** (a save rewrites one small
  sidecar), **merge locality** (editing different notes on two devices never conflicts — the
  multi-device sync case of §10), **and** note-folder purity (all Coal data quarantined under
  `.coal/`). Rejected alternatives: a **monolithic** store (whole-file rewrites and merge conflicts
  on nearly every concurrent edit), **sharded** buckets (cross-note conflicts within a shard), and
  **co-located** sidecars (pollute the note folders, breaking portability).
- **Costs & mitigations.** File-count growth is bounded by lazy creation and tolerated by Git;
  foreign-rename sidecar pairing is handled by content/id matching and Git `-M` (§13.7).

### 13.9 UI surfaces

- **Dangling-links panel** (right side panel). **Current-note scope**, so it stays quiet and
  relevant; **conditional** (present only when the current note has unresolved links); **two
  groups** — *Broken* (dangling) and *Needs attention* (ambiguous). Each entry shows the source, the
  link text, the **last-known target** (the baseline lets Coal show what the link *was*), and a
  jump-to. It is a pure reactive subscriber to Overlay `status`.
- **Vault-wide housekeeping.** Corpus-wide unresolved-link management lives in a deliberate
  settings/housekeeping surface — entered on purpose when the user is tidying, rather than cluttering
  the working view — with **keyboard-first `M-x` command twins** (e.g. list / jump-to-next dangling)
  per §6.
- **Backlinks** are a Tier-2 derived projection (invert every sidecar's forward references), split
  into **Linked** and **Unlinked mentions** (the latter matched on note title/alias text, since ids
  are never user-visible). Panel detail is a downstream item (§13.11).

### 13.10 Relationship to the data model

This design treats a note as a **document with addressable sub-blocks**, not an outliner: blocks are
addressable units *within* document notes, one canonical node per block, and nothing structural
depends on the block layer. (Whether notes additionally carry a fuller outliner/block model is
tracked in `TODO.md`.)

### 13.11 The frozen normalizer **[DECIDED]**

The single, byte-identical text-normalization function shared by the suggester's **minter** (which
records a block's fingerprint at link-creation) and the resolver's **matcher** (which re-anchors). If
the two ever normalized one byte differently, links would silently miss — so this is frozen as a
spec, versioned, and changed only by deliberate migration.

**Role — an identity key, not the durability mechanism.** Durability is the diff-ratchet's job
(§13.6); the ratchet follows a block through real edits by diff, needing no hash equality. The
normalizer only produces a clean key for three narrower jobs: exact-match in the silent-resolve band,
duplicate detection, and cheap "did this block change?" checks. It is therefore deliberately
**conservative** — it absorbs only *rendering-invisible* noise and preserves everything visible. Both
failure directions degrade to a *confirm*, never a mis-point: over-normalizing collides two blocks
(→ disqualified from the silent band → confirm); under-normalizing lets noise change the hash (→ the
ratchet still follows the block by position).

**Coal is a noise-free producer.** Coal's editor emits **only literal keyboard text** — no
smart-quote / dash / ellipsis autoformat — and displays everything **monospaced, ligatures off**.
This governs what Coal *produces and shows*; it **never** rewrites imported or foreign-edited bytes
(§13.1 is inviolable — a genuine `—` or `"…"` in an imported note stays exactly those bytes). The
consequence: typographic / Unicode drift can enter only via **import or foreign editors**, which is
the sole scope the folds below still serve.

The function is two stages.

**Stage A — payload extraction (kind-aware).** Using the block's `kindTag`, strip structural markers
that are not content, so marker churn does not change identity:

- *paragraph* — text as-is;
- *list item* — strip the leading bullet / number marker (`- `, `* `, `1. `);
- *blockquote* — strip the leading `> ` on each line;
- *code fence* — drop the fence delimiters and info-string, keep the body.

**Stage B — canonicalization** (applied to the extracted string), frozen as:

| Step | Rule |
|---|---|
| Unicode form | **NFC** (never NFKC — no ligature / compatibility folding) |
| Line endings | CRLF / CR → **LF** |
| Whitespace | trim ends; collapse every interior run (incl. inside code blocks) → a single `U+0020` |
| Typographic fold | a **fixed, closed table** only: `‘’` → `'`, `“”` → `"`, `–` / `—` → `-`, `…` → `...`, nbsp & other Unicode spaces → space |
| Case | **locale-invariant case-fold** (lowercase) |
| Markup | **preserved** — emphasis, link, and other inline markup are *not* stripped (keeps the normalizer lexical and parser-free) |

**Output & versioning.** `normHash` = SHA-256 over the UTF-8 of the canonical string (stored
truncated); the same canonical string is the input to `simhash` tokenization (§13.3). A
**`normVersion`** is stamped in the Overlay: "frozen" means frozen *within a version*, and any future
change to a rule above is a deliberate, re-hashing migration — never a silent shift.

This choice serves the project's aim directly — **maximum portability, compatibility, and
efficiency**: it never touches the portable bytes, it tolerates the messiness of other editors and
imports (compatibility), and an O(1) hash key over a lexical, parser-free transform keeps resolution
cheap (efficiency).

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
| 2026-07-20 | Plugin API & sandboxing: TS/JS on the core's own typed API; in-process but ambient Node/Electron authority withheld (typed API is the sole capability channel); capabilities declared in a manifest and enforced by the broker; first-party trusted, third-party consented + revocable | Keeps core-as-plugins and a low-friction ecosystem while giving encryption-at-rest / private-by-default a real gate; avoids both all-or-nothing in-process trust and a heavy RPC sandbox. |
| 2026-07-20 | Configuration: everything in plain-text, version-controlled files; GUI reads/writes text only | Declarative, reproducible, portable machine-to-machine. |
| 2026-07-20 | Git version control is first-class | Free off-site sync (vs paid-sync models) and full history. |
| 2026-07-20 | Notes encrypted at rest (transparent unlock/re-lock); mechanism deferred | Private notes must not be exposed by syncing or a lost device; the scheme is too consequential for a snap decision. |
| 2026-07-20 | License: Apache-2.0 (open source) | Permissive (frictionless ecosystem), fully compatible with the non-copyleft dependency stack, and adds a patent grant over bare MIT. |
| 2026-07-20 | Audience: owner-first, dogfooded from day one; public release later; adoption gated on feature maturity + data security | Design and validate against real daily use; security is a prerequisite for the owner's own switch-over. |
| 2026-07-20 | Process: `SPEC.md` holds decided items only; open/pending work tracked in `TODO.md` | Keep the builder's source-of-truth clean; the open list will grow fast during build. |
| 2026-07-20 | Linking & index: **stand-off identity** — notes are inviolable plain text; all identity lives in a committed, plain-text **Overlay** above them; links live in notes, identity anchors never do | Satisfies "plain text is the source of truth" and total portability while giving durable, honest referential integrity; abolishes both the prior UUID-injection model and Obsidian-style `^blockid` markers. |
| 2026-07-20 | Three-tier model: Tier 0 notes (content) · Tier 1 Overlay (identity/intent, committed, not disposable) · Tier 2 index (derived, Git-ignored); "rebuild from notes alone" weakens to "rebuild Tier 2 from Tiers 0+1" | The Overlay holds intent prose can't regenerate, so it is versioned, not a cache; notes, Overlay, and config are all committed and portable. |
| 2026-07-20 | Uniform node registry (note/heading/block/link); opaque stable ids (safe because Overlay-only); each sidecar owns the nodes physically in its own note; references store cross-note stable ids | One resolver for all granularities; ids immune to rename + relocation; opaque tokens carry no portability cost when they never touch a note. |
| 2026-07-20 | Lazy block registration — a block is tracked only when first referenced; full knowledge is always available via live-parse; the graph never depends on blocks | Avoids a Logseq-style over-committed foundation; defers cost to where it actually buys something. |
| 2026-07-20 | Block links: portable heading-level link in the note + block-precision refinement in the source sidecar (Option 1) | Other editors drop the reader at the heading; Coal resolves to the exact block; the note stays clean and portable. |
| 2026-07-20 | Durability via a Git-backed **diff-ratchet** (re-anchoring is a diff, not a guess); honest degradation — only genuinely ambiguous cases surface for confirm, never a silent mis-point | Continuous baseline refresh keeps each re-anchor a small hop and dissolves fingerprint drift; a stronger contract than silently-rotting markers. |
| 2026-07-20 | First-class **Reconciliation Engine** (watcher + dirty-check + off-thread ratchet + startup pass + Git hooks); foreign renames paired by content/id/Git `-M`; runs off the main thread | The maintenance plan needs a guaranteed, robust, non-blocking executor baked in from the start; off-thread avoids the synchronous-resolution freeze/data-loss failure mode. |
| 2026-07-20 | Overlay storage: **mirrored, lazy, per-file JSON sidecars** under `.coal/` | Churn + merge locality (multi-device sync) and note-folder purity; monolithic / sharded / co-located layouts all rejected. |
| 2026-07-20 | Dangling links: **current-note** side panel (two groups: Broken / Needs attention) + vault-wide management via a housekeeping settings surface, with `M-x` twins | Low ambient noise in the working view; deliberate full-corpus management on demand; keyboard-first. |
| 2026-07-21 | Frozen normalizer (§13.11): a versioned, lexical, parser-free function shared by minter + matcher — kind-aware payload extraction, then NFC · LF · whitespace-collapse · a fixed typographic-fold table · locale-invariant case-fold · **markup preserved**; `normHash` = truncated SHA-256, `normVersion` stamped | The normalizer is an identity key, not the durability mechanism (the ratchet is), so it stays conservative — both over- and under-normalizing degrade to a confirm, never a mis-point. Coal emits only literal keyboard text (monospace, no ligatures) so drift enters only via import/foreign editors; the small folds serve exactly that. Serves portability (bytes untouched), compatibility (tolerates other editors), and efficiency (O(1) hash key). |
