# Coal — official plugins registry

**What this file is.** The registry of Coal's **official (first-party) plugins** — features the
project itself ships, bundled and trusted, built on the same public API as everything else
("core-as-plugins", [`SPEC.md`](SPEC.md) §8). It complements [`SPEC.md`](SPEC.md) (ratified
decisions) and [`TODO.md`](TODO.md) (open work): a plugin is **Committed** once its
existence-as-an-official-plugin is decided in `SPEC.md`, and **Proposed** while it is only a candidate
from the feature backlog.

Being an official plugin means: bundled with Coal, first-party trust tier (§8.2), and — where enabled
— active out of the box. *Which* remaining features are core vs official plugin is the open split
tracked in `TODO.md`. **Encryption is deliberately not here** — it needs the most privileged,
first-party-only capabilities (§8.2), so it lives in the **core** (§10.2), not the plugin surface.

Legend: `[x]` committed (decided in `SPEC.md`) · `[ ]` proposed (candidate in `TODO.md`).

---

## Committed official plugins

- [x] **Emacs keymap** — the Emacs keybinding set over the core command substrate + input-mode seam
  (§6). One of the two keymaps shipped out of the box; selected at first run, declaratively
  switchable (§9).
- [x] **Vim keymap** — full modal Vim (normal / insert / visual, operators, text objects) over the
  same input-mode seam, with the unified minibuffer serving the `:` ex line, `/` search, and the mode
  indicator (§6). Full feature parity with the Emacs keymap, each binding modeled on its closest Vim
  counterpart.
- [x] **Outliner** — a fuller outliner / block-manipulation experience layered over the plain-text
  document, never altering the core data model or on-disk format (§13.10 / §13.1). Its own design is
  still open (`TODO.md`).

## Proposed official plugins (from the `TODO.md` feature backlog — not yet designed)

- [ ] **Full code-editor mode** — a general-purpose code editor for arbitrary file types alongside
  the PKM surface, leveraging the CodeMirror 6 core (§4). *Probably* an official plugin; scope open.
- [ ] **Zettelkasten** — timestamped note naming, plus an option to open directly to that note on
  launch within the same 24-hour window. Official plugin; naming scheme and window rule open.
- [ ] **Spell check** (and *maybe* grammar) — editor spell-checking; its core-vs-plugin placement is
  still open.

---

## Notes

- **Themes are a sibling system, not plugins.** A theme installs through the plugin *path* but is
  declarative CSS-variable data with no executable code (§8.1); the bundled default theme **Sublime**
  is delivered that way and is not listed here.
- **Community keymaps** are a natural, safe future extension — the input-mode seam is community-open
  (§6 / §8.2), unlike the first-party-only privileged seams reserved to the core.
