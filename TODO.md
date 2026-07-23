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
  **commit** waits on scale from the graph-view scope (a confirmed v1 surface, SPEC §14 roster, whose
  own design is still open; node-granularity §13.2 + edge-definition §13.1).
- [ ] **Embeds / transclusion** (`![[…]]`) inline-render design — a **confirmed v1 surface** (§14 roster);
  linking is decided (§13). Open: the inline-render design itself — recursion / depth-cap handling, the
  reveal model, and when it supersedes the literal-for-now display (§7.2). Its own design session.

## Deferred design work (intentionally postponed — each gets its own design session)

### v1 surface deep-design (roster settled in SPEC §14 — each surface its own session)
- [ ] **Workspace-shell detail** — split/tab keybindings, drag behavior, and workspace/session
  persistence (which windows/notes/panels reopen on launch, stored per §9). The shell *shape* is decided
  (§14.1); this is the interaction + persistence design.
- [ ] **Full-text search** — engine (ripgrep-backed vs in-process index), query syntax (plain / regex /
  operators), scope (content + names + tags), indexing/perf, and the results surface (minibuffer-driven +
  panel). Keyboard-first per §6.
- [ ] **Tags** — inline `#tag` + frontmatter `tags:` indexing (Tier-2, from user bytes only §13.1), the
  tag index/pane, autocomplete, and click-to-search. Distinct from the Overlay-internal `kindTag`.
- [ ] **Daily notes** — the dated-note command, folder + date-format + template config, and
  open-on-launch behavior. Depends on **Templates**.
- [ ] **Templates** — plain-text template files in the vault, variable substitution (date / title /
  cursor, and what else). An official plugin (`PLUGINS.md`); design open.

_(The two small roster additions — **outline / TOC panel** and **word-count / stats** — need no design
session; they become build tasks once building begins.)_

### Theming (queued next — its own design session)
- [ ] **Theming system design** — the concrete CSS-variable theming system (§8.1): the variable
  catalogue, the theme manifest, light/dark handling, and the install path. Rides the plugin install
  path but is declarative CSS-variable data with no executable code (plugin-system design doc §15).
  Explicitly the next design session queued after the kernel/plugin pivot.

### Plugin system — reconciliation detail (post-pivot)
- [ ] **Linking-plugin data placement** — where the committed Overlay tree (§13.8, `.coal/overlay/**`)
  and the Tier-2 index/cache sit relative to the kernel-owned `.coal/config/` tree and the plugin-data
  `.coal/plugins/<id>/` tree (§8.3 / design doc §12). The spec keeps `.coal/overlay/**` as the committed
  path; the final placement under the new tree is a detail for the linking plugin's own build.

### Outliner (official plugin) — design
- [ ] The official outliner plugin's own design: its interaction model, how (or whether) it persists
  any structure beyond the note's plain-text bytes, and its Markdown/Org parity. Notes stay plain-text
  files regardless (§13.1); the kernel carries no outliner model (§13.10).

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

Owner-requested surfaces captured for design. Each needs its own design pass before building. Per the
kernel/plugin pivot (`SPEC.md` §8), each ships as an **official (first-party) plugin** over the minimal
kernel — the earlier *core vs official-plugin split* is resolved; what remains is each surface's own
design.

- [ ] **Spell check** (and *maybe* grammar check) — editor spell-checking; grammar is a stretch/maybe.
  Open: engine (system/hunspell dictionaries vs bundled), per-language dictionaries, and Markdown/Org
  awareness (skip code, links, math). An official plugin (`PLUGINS.md`).
- [ ] **Full code-editor mode** — a VSCode/Emacs-style general-purpose code editor for arbitrary file
  types, alongside the PKM surfaces (leverages the CodeMirror 6 kernel engine, §4). An official plugin
  (`PLUGINS.md`). Scope, language support, and coexistence with the Markdown/Org surfaces are open.
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

- [~] **Visual design target** — a concrete visual design to build toward, rather than designing UI ad
  hoc during the build. **Down-payment filed** (Claude Design):
  [`docs/superpowers/specs/2026-07-23-visual-design-target.md`](docs/superpowers/specs/2026-07-23-visual-design-target.md)
  — high-fidelity mockups of the shared shell in both the PKM and base-editor layouts, plus the concrete
  **"Sublime"** palette (dark black + sublime-green `#b8e62d`, `SPEC.md` §8.1), which is effectively
  complete. **Still to close before the gate is met:** draw/spec the §14 roster surfaces the mockup
  omits — the bidirectional **Links panel** and **Dangling** panel (§13.14 / §13.9) as distinct
  surfaces, the **quick switcher**, the **Settings UI**, hover preview, and the Vim command-line/search
  minibuffer state — and settle the **§14 properties reconciliation** (the PROPERTIES panel vs. "no GUI
  properties editor"; see the doc §4). Gate: building starts against an agreed visual target.

## Build tasks

- _(populated once building begins)_
- [ ] **Per-platform packaging & ports** (§3.1) — DEB, Flatpak, macOS app bundle, Android APK. RPM
  is the launch target; the rest are committed post-launch build work.
