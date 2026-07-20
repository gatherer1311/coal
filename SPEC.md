# Coal — Design Specification

> **Status:** Living document. This is the authoritative source the builder pulls from.
> **Last updated:** 2026-07-20
>
> Coal is a Linux-native text editor with the *hands of Emacs* (central minibuffer,
> Emacs keybindings, deep hackability) and the *head of Obsidian* (plain-text notes,
> links, backlinks, live preview), speaking both **Org** and **Markdown**.

---

## 0. How to read this document

Every substantive item carries a status tag:

- **[DECIDED]** — ratified. The builder may implement it.
- **[OPEN]** — under active discussion. **Do not implement** until it becomes DECIDED.
- **[DEFERRED]** — deliberately postponed. **Do not implement**, and do not pre-empt the
  decision by building around a presumed outcome.

**On the `reference/` directory.** Those files are *research and priors only* — a record of
how Emacs tooling, Org, and other PKM apps solved problems, plus design notes from a prior,
abandoned implementation of Coal. **Coal is not derived from them.** If the design converges
on something that resembles prior art or the old Coal, that is only because we arrived there
from first principles. **Convergent, not derived.** No decision in this document may be
justified by "the reference says so."

---

## 1. Vision

Coal is a keyboard-first, Linux-native editor for people who live in plain-text notes and want
the extensibility and muscle-memory of Emacs without leaving a modern, GNOME-at-home GUI. It
edits Markdown and Org as first-class document formats, treats the user's files (and the
editor's own configuration) as the single source of truth, version-controls and syncs them via
Git, keeps private notes encrypted at rest, and is extended through one coherent
command/plugin/theme substrate.

---

## 2. Founding principles

These are the non-negotiables. Every downstream decision must be consistent with them.

1. **Linux-first, GNOME at home.** Linux is the primary platform, not a port. Coal must feel
   like a deliberate, native-feeling citizen of the Linux desktop — especially GNOME — not a
   cross-platform app with a Linux build bolted on as an afterthought.
2. **Plain text is the source of truth — for notes *and* configuration.** Everything the user
   creates or configures lives in human-readable, version-controllable text files. The GUI is a
   front-end onto those files, never a hidden database that the files merely shadow.
3. **Git-native, and private by default.** Git version control is first-class — it gives free
   off-site sync and full history (deliberately avoiding a paid-sync model). Because syncing
   means notes live on remotes, notes are **encrypted at rest** so that syncing to a remote — or
   losing the device — never exposes them.
4. **Keyboard-first.** The editor, the minibuffer, and constantly-used quick-access features are
   driven from the keyboard using Emacs keybindings. Mouse interaction is first-class where it
   genuinely wins (e.g. the visual graph) and available-in-addition where useful — but the core
   editing loop never *requires* the mouse.
5. **One extension substrate.** There is a single command/extension system. The native Emacs
   layer, the plugin system, and the theme system are all first-class citizens built on it — not
   separate worlds.
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
- **Boundary of "GNOME integration":** the UI is web technology themed to *look and feel* at
  home in GNOME. It is **not** built from native GTK/libadwaita widgets. "Full GNOME
  integration" means the desktop-integration layer above, not a native toolkit.

---

## 4. Technology stack **[DECIDED, with open sub-items]**

- **Shell:** Electron. **[DECIDED]**
- **Editor core:** CodeMirror 6. **[DECIDED]**
- **Language:** TypeScript (assumed; ratify in a later pass). **[OPEN]**
- **Graph / heavier visual rendering library** (candidate: a WebGL lib such as PixiJS): **[OPEN]**

---

## 5. Document formats **[DECIDED]**

- Coal supports **Markdown** and **Org** as **first-class document formats**, side by side.
- **Org depth = document format, not the Org application.** In scope: full Org *syntax* —
  headings, TODO keywords, links, tables, inline markup, properties/drawers — with live-preview
  authoring parity alongside Markdown.
- **Out of scope (for now):** the Org *application suite* — agenda, Babel code execution, table
  spreadsheet formulas, and export backends. (Whether a lightweight agenda-style view is wanted
  later is an open question — see §13.)

---

## 6. Interaction model **[DECIDED]**

- **Keyboard-first, Emacs keybindings** for the editor, the minibuffer, and constantly-used
  quick-access features.
- **Not keyboard-*only*.** Where an interaction is genuinely better with a mouse (the visual
  graph is the canonical example), that is a first-class mouse experience.
- **Both, where useful.** Features may expose both keyboard and mouse paths; the constraint is
  only that the core editing environment is fully operable from the keyboard.

---

## 7. Extensibility architecture **[DECIDED]**

One substrate, several front-ends.

- **Central command registry.** Everything Coal can do is a *command* registered in one place.
- **Keybindings and the minibuffer (`M-x`) are front-ends onto that registry** — two ways to
  reach the same commands, not parallel implementations.
- **Core is built on the same API plugins use** (the "core as plugins" discipline). A plugin can
  do what the core does because it registers commands / views / themes through the identical
  public API.
- **First-class plugin system** and **first-class theme system**, from the start — neither is
  deferred.
- **Themes are packages.** A theme installs through the same path as a plugin. (Working
  assumption: CSS-variable-based theming; ratify later.) **[OPEN sub-item: theming mechanism.]**

---

## 8. Configuration model **[DECIDED]**

- **Everything is operated from plain-text, version-controllable files.** This includes editor
  configuration, keybindings, and theme definitions — not just notes.
- **The GUI is a front-end, not a store.** Settings panes and menus **read and write text files
  only**. There is no separate authoritative settings database that the text merely mirrors.
- **Goals this serves:** declarative configuration, reproducibility, and hassle-free transfer of
  a full editor setup from machine to machine (drop the files in, done).
- **Config file format(s):** **[OPEN]** — see §13.

---

## 9. Sync, version control & privacy

### 9.1 Git version control **[DECIDED]**

- Git is a **first-class** part of Coal, not an optional integration.
- It provides **free off-site sync** (a deliberate advantage over paid-sync models) and complete,
  browsable **history/versioning** of the user's notes.

### 9.2 Encryption at rest **[DECIDED — as a requirement]**

- **Notes / user content are encrypted at rest.** Because notes are synced to remotes and people
  keep extremely private material in them, a private repo is not enough: the stored bytes must be
  ciphertext so that neither the remote host nor a lost/stolen device exposes the content.
- **Transparent to the user.** The authoring format stays plain `.md` / `.org`; inside Coal
  (unlocked) the user sees and edits plain text. Coal decrypts for use and **re-locks when the
  app is closed**.
- **Scope:** this requirement covers user notes/content. Configuration (§8) is intentionally
  plaintext-versioned so it stays shareable and declarative. (Whether any config also needs
  encryption is a detail for §9.3.)

### 9.3 Encryption mechanism **[DEFERRED]**

The exact scheme is **undecided** and must not be implemented until ratified. It is as
consequential as the linking system and is entangled with both the Git diff/merge strategy and
the (deferred) data model, so it gets its own design session.

Recorded context so the deferral is informed (these are considerations to resolve, **not**
decisions):

- **SOPS + age was the owner's initial reference point, not a ratified choice.** SOPS targets
  *structured config*, not prose; `age` encrypts *whole files* non-deterministically. The
  requirement stands; the mechanism will likely take a different form.
- **Two threat models to choose between (they drive the mechanism):** (a) *host confidentiality*
  — the remote can't read the notes; (b) *local at-rest* — a stolen device with Coal closed
  can't read them either. The "re-lock on close" intent points at (b).
- **The unavoidable tradeoff:** once stored bytes are ciphertext, Git diffs/merges operate on
  ciphertext. Readable diffs are recoverable *locally* for the key-holder (e.g. a decrypt
  filter), but line-level 3-way merge across devices is limited — acceptable for single-user
  multi-device sync, and the real cost to weigh.
- **Open sub-questions:** key management and unlock UX at start; exactly what "re-lock on close"
  guarantees; whether encryption is app-managed (decrypt-to-memory) vs a Git-filter approach vs
  encrypted-remote-only.

---

## 10. Documentation model **[DECIDED]**

- Documentation is **first-class and written as-we-go**: a feature is not "done" without its
  docs.
- Documentation is **split by audience** so neither reader wades through the other's material:
  - `docs/user/` — how to *use* Coal to edit files. Assumes no interest in internals.
  - `docs/dev/` — architecture, internals, and how to *extend* Coal (plugins, themes,
    contributing).
- Each feature ships a user-facing doc, a developer-facing doc, or both, as appropriate.

---

## 11. Linking & index system **[DEFERRED]**

The linking model (wiki-style links, backlinks, block references) and the index/derivation
system that powers them are **deliberately undecided**. They will be settled in a dedicated
design session.

**No decisions on linking or indexing are recorded here, and none are to be implemented or
designed-around until this section is ratified.**

---

## 12. Data model **[DEFERRED]**

Whether notes behave as **documents** or carry an **outliner / block** model (the Logseq/Roam
shape), and the on-disk representation beyond "plain-text files," are **deliberately undecided**.
Deferred alongside §11, with which it is entangled.

**No data-model decisions are recorded here, and none are to be implemented or designed-around
until this section is ratified.**

---

## 13. Open questions (tracked)

Resolve these before the affected areas are built.

1. **License & openness posture.** FOSS (which license), source-available, or proprietary?
   A first-class plugin/theme ecosystem interacts with this choice.
2. **Configuration file format(s).** e.g. TOML / YAML / JSON / Org / a custom DSL — for config,
   keybindings, and themes.
3. **v1 feature surface.** Which Obsidian-like surfaces are in the first release (graph,
   backlinks panel, tags, search, daily notes, canvas, …)?
4. **Live-preview specifics.** Rendering model for inline markup (hide-off-cursor, split view,
   both).
5. **Plugin API shape & sandboxing.** Language, capabilities, and isolation model for plugins.
6. **Lightweight Org agenda/TODO view?** Out of the Org *application* scope, but possibly wanted
   as a native or plugin feature later.
7. **Encryption mechanism** — see §9.3 (deferred; tracked here for visibility).
8. **Linking & index system** — see §11 (deferred; tracked here for visibility).
9. **Data model (document vs block)** — see §12 (deferred; tracked here for visibility).

---

## 14. Decision log

| Date       | Decision | Rationale |
|------------|----------|-----------|
| 2026-07-20 | Fresh rewrite; `reference/` is research/priors only, not a blueprint | Owner dissatisfied with prior implementation; wants a design reached from first principles. Convergent, not derived. |
| 2026-07-20 | Platform: Linux-first, GNOME-at-home, RPM; deep desktop integration in scope | Linux must feel native and deliberate, not an afterthought. |
| 2026-07-20 | Stack: Electron + CodeMirror 6 | Closest to the intended Obsidian-like stack; largest ecosystem; fastest path to parity. |
| 2026-07-20 | Formats: Markdown + Org, both first-class; Org = document-format depth only | Full Org authoring without re-implementing the Org application suite. |
| 2026-07-20 | Interaction: keyboard-first core (Emacs keys); mouse-first where it wins; not keyboard-only | Emacs muscle memory for the editing loop; pragmatic mouse use for things like the graph. |
| 2026-07-20 | Extensibility: one command substrate; keys + `M-x` are front-ends; core-as-plugins; first-class plugin *and* theme systems | Native Emacs feel and a real plugin/theme ecosystem are the same system, not two. |
| 2026-07-20 | Configuration: everything in plain-text, version-controlled files; GUI reads/writes text only | Declarative, reproducible, portable machine-to-machine. |
| 2026-07-20 | Git version control is first-class | Free off-site sync (vs paid-sync models) and full history. |
| 2026-07-20 | Notes encrypted at rest (transparent unlock/re-lock); mechanism deferred | Private notes must not be exposed by syncing to a remote or losing a device; the exact scheme is too consequential for a snap decision. |
| 2026-07-20 | Audience: owner-first, dogfooded from day one; public release later; adoption gated on feature maturity + data security | Design and validate against real daily use; security is a prerequisite for the owner's own switch-over. |
| 2026-07-20 | Data model (document vs block): deferred, no decisions recorded | Foundational and entangled with linking; own session later. |
| 2026-07-20 | Linking & index system: deferred, no decisions recorded | Too consequential for a snap decision; own session later. |
