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
- [ ] **Graph / visual rendering library** (e.g. PixiJS) — blocked on scoping a graph view; the
  library choice is deferred until a graph view is actually on the near-term roadmap.
- [x] **Lightweight Org agenda / TODO view** — **not planned** (settled out of scope; Coal brings
  `.org` files, syntax, and writing style only, not Org application features). → `SPEC.md` §5.

## Deferred design work (intentionally postponed — each gets its own design session)

### Linking & index system
- [ ] Entire model deferred: wiki-style links, backlinks, block references, and the index/derivation that powers them. **No decisions yet; do not implement or design around a presumed outcome.**

### Data model (document vs block)
- [ ] Whether notes are **documents** or carry an **outliner / block** model, and the on-disk representation beyond "plain-text files." Entangled with linking. **No decisions yet.**

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
