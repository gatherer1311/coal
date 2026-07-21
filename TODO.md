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
  Wayland-safe phase-1 substrate and **PixiJS/WebGL** (or a batteries-included WebGL lib —
  Sigma.js, Reagraph) reserved as an isolated scale-up swap; commercial/source-available engines
  (KeyLines/ReGraph, yFiles, Ogma, GoJS, Graphistry, Neo4j NVL) excluded by the §11 permissive-OSS
  posture. Only the substrate **commit** waits on scale from the graph-view scope (→ *v1 feature
  surface*, above; node-granularity §13.2 + edge-definition §13.1).
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
  - [ ] **Confidence thresholds** for the ambiguous band (silent-resolve vs. surfaced-confirm cut-points).
  - [ ] **Sidecar JSON schema & id format** — the concrete on-disk shape of a node record and a sidecar.
  - [ ] **Backlinks panel UX** — Linked / Unlinked-mentions grouping and interactions.
  - [ ] **Embeds / transclusion** (`![[…]]`) inline-rendering scope — linking is decided (`SPEC.md` §13);
    whether/when embeds render inline (with recursion / depth-cap handling) is an open v1-surface item.
  - [ ] **Git posture detail** — Overlay-only is authoritative; Git strengthens re-anchoring / rename
    detection but is never required for correctness (micro-history behaviors to detail).

### Data model (document vs block)
- [~] **Partially constrained by `SPEC.md` §13.10:** a note is a *document with addressable
  sub-blocks* (not an outliner); one canonical node per block; nothing structural depends on blocks.
- [ ] Still open: whether notes additionally carry a full **outliner / block** model, and the on-disk
  representation beyond "plain-text files."

### Encryption mechanism (requirement is decided in SPEC §10; the scheme is not)
- [ ] **Threat model** — host-confidentiality only vs also local-at-rest (the "unlock at start / re-lock on close" intent).
- [ ] **Key derivation** — candidates: `age` (X25519 + ChaCha20-Poly1305), **`scrypt`** (Obsidian uses scrypt for its encryption paths — `reference/16`), Argon2. Pick during design.
- [ ] **Approach** — app-managed decrypt-to-memory vs a Git clean/smudge filter vs encrypted-remote-only.
- [ ] **Key management + unlock UX** at start, and exactly what "re-lock on close" guarantees.
- [ ] **Git diff/merge strategy over ciphertext** — a local decrypt filter (textconv) can restore readable diffs for the key-holder; line-level 3-way merge stays limited (acceptable for single-user multi-device sync).

## Documentation & repo

- [ ] **Fill out the repository `README.md`** once the program is fully designed — written **for end users** to understand what Coal is and how to get started (not a developer/internals doc).
- [ ] Populate `docs/user/` and `docs/dev/` as features land (as-we-go; see `SPEC.md` §12).

## Compliance / housekeeping

- [ ] **Third-party attribution file** — once real dependencies are added, generate and maintain a `THIRD-PARTY-NOTICES` (or equivalent) covering bundled MIT / ISC / Apache-2.0 / MPL-2.0 dependencies, and propagate any upstream `NOTICE` content. (Outbound license is Apache-2.0; the dependency stack is non-copyleft, so this is attribution hygiene, not a licensing conflict.)

## Build tasks

- _(populated once building begins)_
