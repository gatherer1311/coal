# Coal — TODO & open items

**What this file is.** The running list of everything **not yet decided** or **not yet built**.
[`SPEC.md`](SPEC.md) holds only *ratified* decisions and deliberate scope boundaries; anything
open, pending, or in-progress lives here. This list is expected to grow quickly once building
begins.

Legend: `[ ]` open · `[~]` in progress · `[x]` done (move the decided outcome into `SPEC.md`).

---

## Open decisions (settle before the affected area is built)

- [x] **Implementation language** — **TypeScript.** → `SPEC.md` §4.
- [x] **Config file format(s)** — **TOML as the standard/default**, but a single format is a
  default, not a requirement; best-suited format per job (e.g. JSON) is allowed. → `SPEC.md` §9.
- [x] **Theming mechanism specifics** — **CSS custom properties**; theme = manifest +
  variable-setting stylesheets, installed via the plugin path. → `SPEC.md` §8.1. (Concrete variable
  catalogue lands with the first themable surfaces.)
- [x] **Plugin API shape & sandboxing** — **TypeScript/JS on the core's own typed API; in-process
  but with ambient Node/Electron authority withheld (the typed API is the sole capability channel);
  a declared, broker-enforced capability manifest; first-party trusted, third-party consented &
  revocable.** → `SPEC.md` §8.2.
- [ ] **v1 feature surface** — which Obsidian-like surfaces ship first (backlinks panel, tags, search, daily notes, graph, …).
- [ ] **Core vs official-plugin split** — decide which features are *core Coal* and which ship as
  **official (first-party) plugins** (Obsidian's "core plugins" model, introduced in `SPEC.md` §8).
  The owner wants to lean hard into the plugin/extensible substrate (the Emacs origin, §8): as much
  as is reasonable lives as an official plugin over a minimal core. Early inputs already leaning
  *plugin* — the outliner (§13.10), the full code-editor mode, the Zettelkasten plugin, and
  spell/grammar check (all in *Feature backlog*, below). The concrete split is decided here.
- [x] **Live-preview specifics** — **reveal/hide behavior** settled (configurable granularity,
  whole-line default; selection always reveals; instant with optional delay; byte-safe display;
  atomic constructs; symmetric Markdown/Org) → `SPEC.md` §7.1. **Inline rendering scope** settled:
  images, tables, and task checkboxes render inline; math, Mermaid, embeds (deferred-linking-blocked),
  fenced code, and PDF/slides stay literal → `SPEC.md` §7.2.
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
- [x] **Lightweight Org agenda / TODO view** — **not planned** (settled out of scope; Coal brings
  `.org` files, syntax, and writing style only, not Org application features). → `SPEC.md` §5.

## Deferred design work (intentionally postponed — each gets its own design session)

### Linking & index system — **DECIDED → `SPEC.md` §13**
- [x] Stand-off identity + a committed **Overlay**, the three-tier model, the uniform node registry,
  lazy block registration, Option-1 block links, the Git-backed diff-ratchet, the Reconciliation
  Engine, mirrored per-file sidecars, and the dangling-links surfaces are all ratified in `SPEC.md` §13.
- Remaining **downstream ratifications** (decided in principle; each needs a concrete spec before code):
  - [x] **Frozen normalizer** — **DECIDED → `SPEC.md` §13.11.** Kind-aware payload extraction, then
    NFC · LF · whitespace-collapse · a fixed typographic-fold table · locale-invariant case-fold ·
    markup preserved; `normHash` = truncated SHA-256; `normVersion` stamped for versioned freezing.
  - [x] **Confidence thresholds** — **DECIDED → `SPEC.md` §13.12.** Silent-resolve is a hard AND-gate
    (content G1 ∧ corroboration G2 ∧ margin G3) over a content-dominant score; a `0.45` floor is
    dangling and everything plausible-but-ungated confirms (amber); Path-1/Path-2 split on
    diff-certainty; all constants stamped as `resolverVersion`.
  - [x] **Sidecar JSON schema & id format** — **DECIDED → `SPEC.md` §13.13.** Opaque
    `<tag>_<128-bit CSPRNG Crockford-base32>` ids; per-note committed `.json` registry of ids +
    durability fingerprints + link intent (**no verbatim note text**); volatile range/path/status and
    the title/alias/backlink projections are Tier-2 git-ignored; frozen canonical JSON writer.
  - [x] **Backlinks panel UX** — **DECIDED → `SPEC.md` §13.14.** `coal.backlinks` right-dock leaf +
    `backlinks-jump` minibuffer twin over one Tier-2 projection; **Linked** (stable-id inversion) /
    **Unlinked** (frozen-normalizer name scan) groups; promote-to-link is the sole (source-note,
    zero-identity) mutation.
  - [ ] **Embeds / transclusion** (`![[…]]`) inline-rendering scope — linking is decided (`SPEC.md` §13);
    whether/when embeds render inline (with recursion / depth-cap handling) is an open v1-surface item.
  - [x] **Git posture detail** — **DECIDED → `SPEC.md` §13.15.** "Commit the hash, cache the bytes":
    Overlay-only (Tier 0 + Tier 1) is the total correctness function; Git is a strictly-additive,
    monotonic strengthener (baseline recovery, deepened history, `-M` rename, Post-Git scoping), never
    in the correctness path; sidecar merges resolve by id-sorted serialization + a `coal-overlay`
    structural driver + recompute-on-open.

### Data model (document with addressable sub-blocks — **DECIDED → `SPEC.md` §13.10**)
- [x] **Settled:** a note is a *document with addressable sub-blocks* (not an outliner); one canonical
  node per block; nothing structural depends on blocks. → `SPEC.md` §13.10.
- [x] **Core outliner question resolved — no.** The core carries no outliner/block model; a fuller
  outliner ships as an **official (first-party) plugin** layered over the plain-text document, not a
  core data model → `SPEC.md` §13.10 (feeds the *core vs official-plugin split*, above).
- [ ] **Open — official outliner plugin design:** its interaction model, how (or whether) it persists
  any structure beyond the note's plain-text bytes, and its Markdown/Org parity. Notes stay plain-text
  files regardless (§13.1).

### Encryption mechanism — **core scheme DECIDED → `SPEC.md` §10.3** (grounded by [`reference/18`](reference/18-obsidian-encryption.md) + [`reference/19`](reference/19-encryption-in-git.md))
- [x] **Threat model** — content encrypted before it leaves the machine **and** local at-rest, both from
  **one** mechanism; metadata (names/structure/sizes/history) leak accepted (mitigable via a private/self-hosted remote). → §10.3.
- [x] **Primitive / KDF** — `age` (ChaCha20-Poly1305 / X25519) via **`typage`** (in-process TS); vault key
  passphrase-wrapped via an `age` scrypt-passphrase stanza. → §10.3.
- [x] **Approach** — **app-managed decrypt-to-memory**: ciphertext `age` files at rest, Git versions opaque
  blobs (no clean/smudge filter), re-encrypt only on change. → §10.3.
- [x] **Key management + unlock UX** — single passphrase-wrapped vault X25519 identity (Bitwarden hierarchy);
  onboarding = clone + passphrase; unlock holds the key in-process, **lock = purge**; optional GNOME
  Secret-Service cache. → §10.3.
- [x] **Git diff/merge over ciphertext** — `textconv` for readable diffs + a decrypt→3-way→re-encrypt merge
  driver (transcrypt as blueprint); single-user multi-device target. → §10.3.
- Remaining **detail items** (design decided; each needs a concrete spec before code):
  - [ ] **Recovery-key backstop** — with local at-rest back in, a forgotten passphrase = total loss; decide
    whether/how to mint a random recovery key (age-keygen-style) as an escape hatch. **(Important.)**
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
