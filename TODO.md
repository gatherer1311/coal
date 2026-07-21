# Coal — TODO & open items

**What this file is.** The running list of everything **not yet decided** or **not yet built**.
[`SPEC.md`](SPEC.md) holds only *ratified* decisions and deliberate scope boundaries. The flow is
**owner + Claude → `TODO.md` → `SPEC.md`**: once an item is decided and its outcome lands in
`SPEC.md`, it is **removed from here** — the two files never overlap. This list is expected to grow
quickly once building begins.

Legend: `[ ]` open · `[~]` in progress. (Decided items don't get a checkbox here — they move to
`SPEC.md` and leave this file.)

**Where things live (one item, one home).** *Design and planning* items live here and flow into
`SPEC.md`. *Build tasks and bugs* — concrete implementation work with a clear done-state — are tracked
as **GitHub Issues under the `v1.0` milestone**, not mirrored here; PRs close them with `closes #N`.
Issues start once implementation begins. The planning backlog is deliberately **not** duplicated into
issues (design decisions close by ratification into `SPEC.md`, not by a PR).

---

## Open decisions (settle before the affected area is built)

- [ ] **v1 feature surface** — which Obsidian-like surfaces ship first (backlinks panel, tags, search, daily notes, graph, …).
- [~] **Core vs official-plugin split** — decide which of the remaining features are *core Coal* and
  which ship as **official (first-party) plugins** (§8). The **registry** of decided official plugins
  is [`PLUGINS.md`](PLUGINS.md). Still to classify: the full code-editor mode, the Zettelkasten
  plugin, and spell/grammar check (all in *Feature backlog*, below).
- [ ] **Graph / visual rendering library** — **still deferred**; the block is the graph *view*
  scope, not the rendering tech (view depends on the deferred linking system and data model). The
  rendering *direction* is now pre-qualified in [`reference/17`](reference/17-graph-rendering-options.md):
  a layered `GraphSource` data-port (abstract) → worker-side layout (`d3-force` default, WebCola
  held as the constraint-layout swap) → swappable renderer, with **hand-rolled Canvas 2D** as the
  Wayland-safe phase-1 substrate and a **WebGL engine** reserved as an isolated scale-up swap.
  **Owner's proposed scale-up engine:** [`cosmos.gl`](https://github.com/cosmosgl/graph) (MIT — fits
  §11; OpenJS-incubating; GPU force-*layout + rendering* on luma.gl/WebGL 2, ~1M+ nodes), which
  supersedes the earlier PixiJS / Sigma.js / Reagraph placeholders for this slot. **Two things to
  settle before ratifying it:** (a) cosmos.gl *fuses* layout and rendering on the GPU, so it does
  **not** sit behind the `worker-side d3-force → swappable renderer` split — adopting it makes the
  WebGL phase a whole engine, not just a renderer (the `GraphSource` data-port still abstracts it, and
  `d3-force` + Canvas 2D stays the Wayland-safe phase-1); (b) WebGL-under-Wayland (Electron) needs
  verifying for it. Commercial/source-available engines (KeyLines/ReGraph, yFiles, Ogma, GoJS,
  Graphistry, Neo4j NVL) stay excluded by the §11 permissive-OSS posture. Only the substrate
  **commit** waits on scale from the graph-view scope (→ *v1 feature surface*, above;
  node-granularity §13.2 + edge-definition §13.1).
- [ ] **Embeds / transclusion** (`![[…]]`) inline-rendering scope — linking is decided (§13); whether/when
  embeds render inline (with recursion / depth-cap handling) is an open v1-surface item (§7.2 keeps them
  literal for now).

## Deferred design work (intentionally postponed — each gets its own design session)

### Outliner (official plugin) — design
- [ ] The official outliner plugin's own design: its interaction model, how (or whether) it persists
  any structure beyond the note's plain-text bytes, and its Markdown/Org parity. Notes stay plain-text
  files regardless (§13.1); the core carries no outliner model (§13.10).

### Encryption — remaining detail items (mechanism in §10.3/§10.4)
- [ ] **Wrap-KDF parameters** — clamped scrypt work factor (leaning age-standard, CLI-recoverable) vs Argon2id; pin the minimum.
- [ ] **Caching default posture** — seamless (Secret-Service, auto-unlock at login) vs conservative
  (passphrase-per-launch); plus vault-timeout defaults.
- [ ] **On-disk naming** — the `note.md.age` scheme and how logical `.md`/`.org` names map to ciphertext
  files, incl. interaction with §13.13 sidecar-path mirroring.
- [ ] **Merge-driver / `textconv` concrete spec** and the conflict-resolution UX.
- [ ] **§13.15 reconciliation** — fully reconcile the Overlay-merge defenses now that the Overlay is
  encrypted (driver required + decrypt/re-encrypt; plaintext line-merge floor removed).
- [ ] **Import/export design** — the four functions (Coal-bundle / plaintext, each direction) + the
  standard-`age` floor; plaintext-export destination + warning.

## Feature backlog (proposed — not yet designed or scheduled)

Owner-requested surfaces captured for design. Each needs its own design pass before building; the
*core vs official-plugin split* (above) decides which are core and which are official plugins.

- [ ] **Spell check** (and *maybe* grammar check) — editor spell-checking; grammar is a stretch/maybe.
  Open: engine (system/hunspell dictionaries vs bundled), per-language dictionaries, Markdown/Org
  awareness (skip code, links, math), and core-vs-plugin placement.
- [ ] **Full code-editor mode** — a VSCode/Emacs-style general-purpose code editor for arbitrary file
  types, alongside the PKM experience (leverages the CodeMirror 6 core, §4). **Probably an official
  plugin.** Scope, language support, and coexistence with the Markdown/Org PKM surface are open.
- [ ] **Zettelkasten plugin** — Zettelkasten-style timestamped note naming, plus an option to open
  directly to *that* note on app launch when launched within the same 24-hour period. **Official
  plugin.** Naming scheme, the 24h-window rule, and config are open.
- [ ] **File recovery** — recover prior/lost file states (distinct from editor Undo, below). Likely
  draws on Git history (§10) and the Tier-2 baseline cache (§13.15), but the user-facing feature
  (trash/versions UX, scope, granularity) is undesigned.
- [ ] **Undo** — in-editor undo/redo (distinct from *File recovery*). Granularity, persistence across
  sessions, and interaction with the byte-for-byte save path (§9) and Live-Preview atomic constructs
  (§7.1) are open.
- [ ] **Auto-save / auto-commit / auto-push** — automatic buffer save, Git commit, and push. Open:
  triggers/debounce, commit message + granularity, conflict & offline handling, push cadence, and the
  interaction with encryption-at-rest (§10.2 — pushes ciphertext) and Overlay reconcile (§13.7).
- [ ] **Change app icons** — let the user swap the application icon. Sits alongside desktop
  integration (§3); mechanism (per-platform `.desktop`/bundle icon override, in-app picker) is open.

## Documentation & repo

- [ ] **Fill out the repository `README.md`** once the program is fully designed — written **for end users** to understand what Coal is and how to get started (not a developer/internals doc).
- [ ] Populate `docs/user/` and `docs/dev/` as features land (as-we-go; see `SPEC.md` §12).

## Compliance / housekeeping

- [ ] **Third-party attribution file** — once real dependencies are added, generate and maintain a `THIRD-PARTY-NOTICES` (or equivalent) covering bundled MIT / ISC / Apache-2.0 / MPL-2.0 dependencies, and propagate any upstream `NOTICE` content. (Outbound license is Apache-2.0; the dependency stack is non-copyleft, so this is attribution hygiene, not a licensing conflict.)

## Pre-build gates

- [ ] **Visual design target** — before implementation begins, produce a visual design (by **Claude
  Design**) so there is a concrete visual target to build toward, rather than designing UI ad hoc
  during the build. Covers the default **"Sublime"** theme (dark black + sublime-green accents,
  `SPEC.md` §8.1) and the core surfaces (editor, minibuffer, panels §13.9/§13.14, settings). Gate:
  building starts against an agreed visual target.

## Build tasks

- _(populated once building begins)_
- [ ] **Per-platform packaging & ports** (§3.1) — DEB, Flatpak, macOS app bundle, Android APK. RPM
  is the launch target; the rest are committed post-launch build work.
