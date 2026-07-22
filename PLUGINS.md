# Coal — official plugins registry

**What this file is.** The registry of Coal's **official (first-party) plugins** — features the
project itself ships, bundled and trusted, built on the same public API as everything else
("core-as-plugins" made literal, [`SPEC.md`](SPEC.md) §8). It complements [`SPEC.md`](SPEC.md)
(ratified decisions) and [`TODO.md`](TODO.md) (open work): a plugin is **Committed** once its
existence-as-an-official-plugin is decided in `SPEC.md`, and **Proposed** while it is only a candidate
from the feature backlog.

Since the **kernel/plugin pivot** (`SPEC.md` §8 + [the plugin-system
design](docs/superpowers/specs/2026-07-22-plugin-system-design.md)), the earlier "which features are
core vs official plugin" split is **largely resolved**: Coal is a **minimal, general-purpose kernel**
and **the entire feature set is re-homed as bundled first-party plugins** over it. So the formerly-core
features — Markdown/Org rich support, the linking/PKM stack, Git, and **encryption** — now live here.

Being an official plugin means: **bundled with Coal** (shipped in the app package, offline-safe),
**first-party trust tier** (§8.2 — fully trusted, eligible for the privileged class), and **off by
default** — enabling one activates and wires it up; "fully-outfitted Coal" is the kernel + the official
suite enabled. (Passive providers such as syntax **grammars** are the exception: first-party and
side-effect-free, they auto-activate by filetype and are not itemized here.)

**Kernel, not plugins.** Some things the prior draft treated as candidate plugins are now part of the
**kernel** and are therefore **not** listed here: **both keymaps (Emacs and Vim)**, the **command
substrate + unified minibuffer + input-mode seam** (§6), the **syntax-highlighting engine** (§8), and
the **workspace shell** (file-tree, quick switcher, windows-as-split, tabs; §14.1).

Legend: `[x]` committed (decided in `SPEC.md`) · `[ ]` proposed (candidate in `TODO.md`).

---

## Committed official plugins

- [x] **Markdown / Org rich support** — Live Preview (prettify + reveal, §7.1) and the inline-render
  scope (§7.2), plus the language grammars, over the kernel's editor engine and decoration primitives.
  The kernel provides raw "present as text" (Source); this plugin provides the interpretation.
- [x] **Linking / Overlay / PKM** — the stand-off-identity linking system (§13): the Overlay node
  registry, the diff-ratchet, the Reconciliation Engine, backlinks, the **Links** and **Dangling**
  panels (§13.14 / §13.9), and internal-link hover preview. Seeded by the existing `src/overlay/`,
  which becomes this plugin's core (not more kernel). Its sidecars ride the kernel storage-codec seam,
  so an encrypted vault encrypts the Overlay too.
- [x] **Git** — version-control the vault: history and free off-site sync (§10.1). A **normal**-caps
  plugin (`process = ["git"]`, `vault = "readwrite"`), no privileged seam.
- [x] **Encryption** — opt-in encryption at rest (§10.2 / §10.3 / §10.4). The one plugin in the
  **privileged class**: it fills the first-party-only `storage-codec`, `startup-gate`, and
  `key-custody` seams (§8.2), so every file read/write flows through its `age` codec and boot waits on
  unlock — while the kernel itself never learns crypto. Off by default (plaintext vaults are equally
  first-class); enabled per vault.
- [x] **Outliner** — a fuller outliner / block-manipulation experience layered over the plain-text
  document, never altering the data model or on-disk format (§13.10 / §13.1). Its own design is still
  open (`TODO.md`).

## Confirmed-v1 official plugins — design open

Each is a **confirmed v1 surface** (`SPEC.md` §14 roster), plugin-delivered per the pivot, with its own
deep-design session tracked in [`TODO.md`](TODO.md):

- [~] **Full-text search** — engine, query syntax, indexing, and the minibuffer + panel results
  surface (§14; keyboard-first per §6).
- [~] **Tags** — inline `#tag` + frontmatter `tags:` indexing, the tag index/pane, autocomplete, and
  click-to-search (§14; distinct from the Overlay-internal `kindTag`).
- [~] **Embeds / transclusion** (`![[…]]`) — inline-render design over the decided linking system
  (§13); recursion/depth-cap, reveal model (§7.2).
- [~] **Graph view** — the visual graph over the Overlay; renderer choice deferred (`reference/17`).
- [~] **Daily notes** — the dated-note command and open-on-launch behavior; depends on **Templates**.

## Proposed official plugins (from the `TODO.md` feature backlog — not yet designed)

- [ ] **Templates** — insert plain-text template files from the vault into new/opened notes, with basic
  variable substitution (date / title / cursor). A confirmed v1 surface (§14) and official plugin; its
  design is open (`TODO.md`). Daily notes and Zettelkasten both depend on it.
- [ ] **Full code-editor mode** — a general-purpose code editor for arbitrary file types alongside the
  PKM surfaces, leveraging the CodeMirror 6 kernel engine (§4). Scope open.
- [ ] **Zettelkasten** — timestamped note naming, plus an option to open directly to that note on
  launch within the same 24-hour window. Naming scheme and window rule open.
- [ ] **Spell check** (and *maybe* grammar) — editor spell-checking; engine and dictionaries open.
- [ ] **File recovery**, **Undo**, **Auto-save / commit / push**, **Change app icons** — owner-requested
  surfaces on the v1 roadmap, each undesigned (`TODO.md`).

---

## Notes

- **Themes are a sibling system, not plugins.** A theme installs through the plugin *path* but is
  declarative CSS-variable data with no executable code (§8.1); the bundled default theme **Sublime**
  is delivered that way and is not listed here.
- **Community keymaps** are a natural, safe extension: with both first-party keymaps now in the kernel,
  a third-party keymap is an **ordinary plugin** — binding keys is a **baseline** ability requiring no
  capability (§8.2), and it touches no files, keys, or network. (This replaces the earlier "input-mode
  seam is community-open, unlike the first-party-only privileged seams" framing — the seam itself is
  kernel now, §6.)
