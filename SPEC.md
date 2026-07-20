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
editor's own configuration) as the single source of truth, and is extended through one coherent
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
3. **Keyboard-first.** The editor, the minibuffer, and constantly-used quick-access features are
   driven from the keyboard using Emacs keybindings. Mouse interaction is first-class where it
   genuinely wins (e.g. the visual graph) and available-in-addition where useful — but the core
   editing loop never *requires* the mouse.
4. **One extension substrate.** There is a single command/extension system. The native Emacs
   layer, the plugin system, and the theme system are all first-class citizens built on it — not
   separate worlds.
5. **Convergent, not derived.** See §0.

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
  later is an open question — see §11.)

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
- **Config file format(s):** **[OPEN]** — see §11.

---

## 9. Documentation model **[DECIDED]**

- Documentation is **first-class and written as-we-go**: a feature is not "done" without its
  docs.
- Documentation is **split by audience** so neither reader wades through the other's material:
  - `docs/user/` — how to *use* Coal to edit files. Assumes no interest in internals.
  - `docs/dev/` — architecture, internals, and how to *extend* Coal (plugins, themes,
    contributing).
- Each feature ships a user-facing doc, a developer-facing doc, or both, as appropriate.

---

## 10. Linking & index system **[DEFERRED]**

The linking model (wiki-style links, backlinks, block references) and the index/derivation
system that powers them are **deliberately undecided**. They will be settled in a dedicated
design session.

**No decisions on linking or indexing are recorded here, and none are to be implemented or
designed-around until this section is ratified.**

---

## 11. Open questions (tracked)

Resolve these before the affected areas are built.

1. **Audience & the daily-driver bar.** Who is the primary user, and what is the smallest
   version that earns full-time daily use? (Defines milestone 1.)
2. **Data model.** Files-on-disk only, or is there any outliner / block-database ambition?
   (Principle §2 strongly implies files-on-disk; confirm and record.)
3. **License & openness posture.** FOSS (which license), source-available, or proprietary?
   A first-class plugin/theme ecosystem interacts with this choice.
4. **Configuration file format(s).** e.g. TOML / YAML / JSON / Org / a custom DSL — for config,
   keybindings, and themes.
5. **v1 feature surface.** Which Obsidian-like surfaces are in the first release (graph,
   backlinks panel, tags, search, daily notes, canvas, …)?
6. **Live-preview specifics.** Rendering model for inline markup (hide-off-cursor, split view,
   both).
7. **Plugin API shape & sandboxing.** Language, capabilities, and isolation model for plugins.
8. **Lightweight Org agenda/TODO view?** Out of the Org *application* scope, but possibly wanted
   as a native or plugin feature later.
9. **Linking & index system** — see §10 (deferred, tracked here for visibility).

---

## 12. Decision log

| Date       | Decision | Rationale |
|------------|----------|-----------|
| 2026-07-20 | Fresh rewrite; `reference/` is research/priors only, not a blueprint | Owner dissatisfied with prior implementation; wants a design reached from first principles. Convergent, not derived. |
| 2026-07-20 | Platform: Linux-first, GNOME-at-home, RPM; deep desktop integration in scope | Linux must feel native and deliberate, not an afterthought. |
| 2026-07-20 | Stack: Electron + CodeMirror 6 | Closest to the intended Obsidian-like stack; largest ecosystem; fastest path to parity. |
| 2026-07-20 | Formats: Markdown + Org, both first-class; Org = document-format depth only | Full Org authoring without re-implementing the Org application suite. |
| 2026-07-20 | Interaction: keyboard-first core (Emacs keys); mouse-first where it wins; not keyboard-only | Emacs muscle memory for the editing loop; pragmatic mouse use for things like the graph. |
| 2026-07-20 | Extensibility: one command substrate; keys + `M-x` are front-ends; core-as-plugins; first-class plugin *and* theme systems | Native Emacs feel and a real plugin/theme ecosystem are the same system, not two. |
| 2026-07-20 | Configuration: everything in plain-text, version-controlled files; GUI reads/writes text only | Declarative, reproducible, portable machine-to-machine. |
| 2026-07-20 | Documentation: first-class, as-we-go, split `docs/user` / `docs/dev` | Each audience gets only what it needs; docs land with features. |
| 2026-07-20 | Linking & index system: deferred, no decisions recorded | Too consequential for a snap decision; own session later. |
