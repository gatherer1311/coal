# Coal — Config loader + the kernel config layer (kernel build-sequence step 3) — design

Date: 2026-07-23
Status: accepted (design session). Third implementation design for the **kernel**, thickening the
[walking skeleton](2026-07-22-kernel-walking-skeleton-design.md) with **step 3** of its build sequence
(§1.1): the **config loader** and the kernel-owned config surface (`settings.toml`, TOML round-trip).
Grounded in `SPEC.md` §9 (configuration model), §8.3 (config surface), and §6 (keymap choice is a
declarative setting), the [plugin-system design](2026-07-22-plugin-system-design.md) §12 (config tree),
and a July 2026 substrate-research pass on comment-preserving TOML libraries (citations at the end).

## Problem

Step 2 shipped the command minibuffer over the registry the skeleton stood up. Step 3 is the **config
substrate**: a loader that reads and writes the kernel's own settings as plain, human-editable TOML,
with the byte-faithful round-trip `SPEC.md` §9 promises (the GUI and a human edit the *same* file, no
shadow store). It is also the **prerequisite for step 4** (both keymaps + the first-run Emacs/Vim
prompt): first-run needs somewhere durable to persist the choice, and nothing today can store it.

**The central tension — surfaced and resolved in this session.** `SPEC.md` describes config *only* as
the per-vault `<vault>/.coal/config/` tree (§8.3), and §9 wants config version-controlled and
transferable *with the repo*. But the kernel has **no vault concept yet** — PR #1 was deliberately a
single-file editor, and the vault/workspace root is a later slice. So "where does kernel config live?"
has no answer under the current spec. This is the first surfacing of a deeper split: Coal is **both** a
general-purpose editor (open any file anywhere, no required root — the kernel) **and** a PKM (one vault
it indexes/links/syncs/encrypts — the plugins, §8). Those two identities pull config in opposite
directions. §2 resolves it.

## 1. Scope — the global (user) config layer + the keymap slot

**Decision: build the user/global config layer now; the per-vault tree arrives with the workspace +
PKM slices (steps 5/7).** The walking-skeleton pattern again — the smallest end-to-end slice that is
independently useful and testable, dogfooding the command spine, and exactly what step 4 needs next.

**In scope (the done-line):**

- A pure, Vitest-tested **`kernel/config`**: the kernel-settings **schema** (types, defaults,
  validators), non-destructive **validation** (raw object → typed settings + diagnostics), the typed
  settings shape, and the curated **default-file template**.
- A **`main/configService`** owning the global `settings.toml`: load (materialize the default template
  if absent), `set` (comment-preserving write), `reload`, atomic durable write, and a change broadcast.
  The TOML round-trip is a pure `main/tomlConfigCodec` over **`@decimalturn/toml-patch`** (§7).
- The **`keymap` setting slot** — enum `'emacs' | 'vim'`, **no default** (unset = not yet chosen, per
  §6). Its first *behavioral* consumer is step 4's keymaps + first-run prompt; step 3 only persists it.
- A minimal **reactive read path** to the renderer (a settings replica + change events), and two
  commands over the step-2 palette: **`core.config.open`** (open `settings.toml` in the editor) and
  **`core.config.reload`**.
- Tests across the three tiers, including one Playwright smoke asserting the file materializes and a
  reload reflects an external edit.

**Explicitly out of scope** (each a later slice):

- **The per-vault config tree** (`<vault>/.coal/config/`) and multi-scope override/merge — there is no
  vault concept until the workspace shell (step 7) / PKM plugins (step 5). Only the global layer exists
  now, so there is nothing to override yet (§2).
- **`plugins.toml` (enablement roster) and `plugins/<id>.toml`** — plugin enablement is vault-scoped
  (encryption is enabled *per vault*, §10.2) and there is no plugin loader until **step 5**.
- **The Settings GUI** — the schema is built to render one later, but the GUI front-end is **step 9**.
- **Live file-watching** — external hand-edits take effect via `core.config.reload` / relaunch for now.
  Live-watch is a **committed follow-up** (deferred only for simplicity), and the change-event
  abstraction (§6) is designed so a watcher slots in later as just another trigger of the same
  broadcast — **no API change**.
- **The first-run prompt and the keymaps themselves** — **step 4**. Step 3 provides only what they
  write to and read from.
- **Any *honored* editor setting** beyond the keymap slot — the slice is the substrate, not editor
  features; no CM6 reconfiguration is pulled in.

## 2. The two-scope-by-ownership config model (foundational; amends `SPEC.md` §8.3/§9)

**Decision: config is scoped by *who owns the setting*, not by where a tree happens to sit.** This
dissolves the editor-vs-PKM tension without walking back either identity — it is the kernel/plugin
split (§8) applied to configuration:

| Scope | Lives in | Holds | Travels with |
| --- | --- | --- | --- |
| **User / global** | per-user (`$XDG_CONFIG_HOME/coal` on Linux) | user-preference kernel settings — keymap choice, editor-engine basics, theme | **the user** |
| **Vault / project** | `<vault>/.coal/config/` | vault-scoped config — plugin enablement, encryption, per-vault overrides | **the repo** (§9) |

The **kernel** is the editor identity: it opens any file byte-exact and **needs no vault** (PR #1 proves
it). The **vault** is a PKM-plugin concept (linking, Git, encryption all require a bounded root, §8/§13).
So kernel-user config naturally lives per-user (the "I am a Vim person, dark theme" layer — available
with zero vaults, editing a lone file), while vault config lives with the notes. This is precisely how
the two reference points solve their own halves — VS Code's *User* vs *Workspace* settings, Obsidian's
app appearance vs per-vault `.obsidian/`. Coal, being both, honestly has both scopes.

**The SPEC amendment** (folded into this design PR) re-homes `SPEC.md` §8.3: the kernel-user settings it
currently places inside the vault `settings.toml` move to the **global** layer; the vault tree keeps
vault-scoped config. §9's principles survive intact — config stays plain-text and version-controllable;
vault config travels with the repo; user prefs travel with the user (syncable via dotfiles / a future
Settings-Sync, exactly like VS Code). "Transfer machine-to-machine" (§9) simply applies **per scope**.

**Keymap choice is user-scoped** (decided this session): deep muscle memory belongs to the user, not the
repo — you are a Vim person on *every* project, and a cloned vault must not force you into Emacs. So the
keymap slot lives in the global `settings.toml`, chosen once at first run (step 4).

## 3. Architecture — pure `kernel/config` + a thin `main/configService`

**Decision: mirror the established `io/codec` (pure kernel) + `fileService` (main adapter) hexagonal
split** — the pure domain logic is the dogfooded core; the process-bound IO is a thin adapter.

- **`kernel/config`** is pure and framework-free: the schema, validation, typed settings, and the
  default-file template. It operates only on already-parsed JS objects and typed values.
- **`main/configService`** owns the file: fs, materialize, atomic write, reload, and the change
  broadcast. It is the only place TOML *text* is handled — via a pure **`main/tomlConfigCodec`** that
  wraps `@decimalturn/toml-patch`.

**The kernel stays dependency-free (decided this session).** `kernel/**` today has **zero** third-party
imports (`io/` uses only `TextEncoder`/`TextDecoder`/`Uint8Array`). The comment-preserving TOML library
lives in **`main`** — like `write-file-atomic` does — while the *pure* schema/validation/template stay
in `kernel/config`. This keeps the dogfooded core's supply-chain surface at zero (a real security-posture
property for an editor built around a capability model, §8.2) and preserves the `io∥config` parallel:
the byte-codec needs no library → kernel; the TOML-codec needs one → main. The fs-free round-trip is
still unit-tested directly against `tomlConfigCodec` in the node tier, so nothing is lost by placing it
in `main`. *(The alternative — letting `kernel/config` import `toml-patch`, which is pure JS — was
rejected: it buys only conceptual tidiness while erasing the zero-dependency-kernel invariant and
setting a precedent the next PR would widen.)*

**Data flow** (the exact `docs`-boundary the skeleton established — all IO in main, the renderer holds
decoded state only):

- **Boot / load.** Renderer `config.load()` → main reads `settings.toml` (materializes the default
  template if absent) → `tomlConfigCodec.parse` → `kernel/config` `validate` → a `ConfigSnapshot`
  `{ settings, diagnostics }` returned to the renderer's config client.
- **Write.** Renderer `config.set({ keymap: 'vim' })` → main merges into the current object →
  `tomlConfigCodec.applyEdit` (comment-preserving) → atomic write → re-parse/validate → broadcast
  `config:changed`.
- **Reload.** Main re-reads → validate → broadcast. External hand-edits reflect here (until live-watch).

## 4. Module layout

```
src/kernel/config/            # pure, framework-free, Node-unit-tested — the dogfooded core
  types.ts                    # KeymapChoice, KernelSettings, ConfigSnapshot, ConfigDiagnostic
  schema.ts                   # declarative kernel-settings schema (per-key type, default, validator)
  validate.ts                 # rawObject -> { settings, diagnostics } (coerce; unknown-key; type-mismatch)
  defaultTemplate.ts          # the curated, commented default settings.toml (a string constant)
src/main/
  tomlConfigCodec.ts          # pure (fs-free): parse(text)->object, applyEdit(text, obj)->text; imports toml-patch
  configService.ts            # owns settings.toml: load/materialize, set, reload, atomic write, broadcast
src/kernel/ipc/contract.ts    # + config channels; + CoalApi.config surface + onConfigChanged
src/preload/index.ts          # + the config bridge methods
src/renderer/
  config.ts                   # reactive client: holds the snapshot, get()/onChange, from IPC
  main.ts                     # composition root: boot-load config; register core.config.open / .reload
```

`kernel/config` imports no Electron/DOM/Node and no third-party code; `main/*` and `renderer/config.ts`
are thin adapters over it. This is the same shape as `io/` + `fileService` + `renderer/editor.ts`.

## 5. The settings model

```ts
type KeymapChoice = "emacs" | "vim";

interface KernelSettings {
  readonly keymap?: KeymapChoice;   // no default — unset until step 4's first-run prompt (§6)
}

interface ConfigDiagnostic {
  readonly key: string;                          // dotted path, e.g. "keymap"
  readonly kind: "unknown-key" | "invalid-type" | "invalid-value" | "parse-error";
  readonly message: string;
}

interface ConfigSnapshot {
  readonly settings: KernelSettings;             // typed, validated, defaults applied
  readonly diagnostics: readonly ConfigDiagnostic[];
}
```

- **The schema (`schema.ts`)** declares each kernel setting's type, default, and validator, as a record
  keyed by dotted path. Step 3 defines exactly one entry — `keymap` (enum, **no default**). The schema
  is the structure step 4+ extends and (step 5) plugin-contributed schemas plug into — the seed of §8.3's
  "manifest-schema-declared, kernel-round-tripped" settings.
- **Validation is non-destructive (`validate.ts`).** Known keys are coerced to typed values; a value of
  the wrong type → an `invalid-type` diagnostic and that key falls back to unset/default; an **unknown
  key → an `unknown-key` diagnostic but is left in the file untouched** (Coal never deletes a user's
  keys) and simply absent from `settings`; a missing key → its default (or unset). Diagnostics are
  advisory data, surfaced later by the Settings UI; step 3 logs them.
- **The default template (`defaultTemplate.ts`)** is a curated, commented `settings.toml` string — it
  documents the file and the keymap option and leaves `keymap` commented-out/absent (unset). It is
  materialized verbatim when the file is missing (a *generate*, so no preservation concern), and reads
  better than any machine-serialized output.

## 6. Reads, writes, reactivity, commands

**Writes preserve comments *and* foreign keys.** The correctness detail: `set` does **not** serialize
the typed `KernelSettings` (that would drop unknown keys). It parses the current file text to the **full
raw object**, overlays the one change, and calls `applyEdit(currentText, fullObjWithChange)` so
`toml-patch` re-emits the document with comments, formatting, *and* any keys Coal does not model all
intact. `configService` therefore treats the **file text as the source of truth** and derives the typed
snapshot from it — never the reverse.

```ts
// CoalApi additions (typed IPC surface on window.coal):
config: {
  load(): Promise<ConfigSnapshot>;
  set(patch: Partial<KernelSettings>): Promise<{ ok: true } | { ok: false; error: string }>;
  reload(): Promise<ConfigSnapshot>;
  openInEditor(): Promise<OpenResult>;   // main opens settings.toml via fileService; renderer never sees the path
};
onConfigChanged(handler: (snapshot: ConfigSnapshot) => void): () => void;
```

- **Reactivity — events + manual reload (decided this session).** `set` and `reload` fire a
  `config:changed` broadcast (main → renderer); the renderer `config.ts` client updates its replica and
  notifies subscribers. Step 4's keymap layer subscribes here so an in-app keymap switch reconfigures
  reactively. The broadcast abstracts the *source* of a change, so the deferred live-watcher (a
  committed follow-up) will just be one more thing that triggers it — no API change.
- **Commands (both via the step-2 palette).** `core.config.open` → `coal.config.openInEditor()` → main
  opens `settings.toml` through the existing `fileService` and returns the doc; the renderer displays it,
  never holding the real path (the opaque-id boundary is preserved). `core.config.reload` →
  `coal.config.reload()` → main re-reads and broadcasts.
- **Two write paths, one file (documented, intentional).** The config file can be changed by
  `config.set` (comment-preserving patch) *or* by opening it via `core.config.open` and saving it
  byte-exact through `fileService`. Both are legitimate; external/editor changes reflect on
  `core.config.reload` (until live-watch lands). No new write path corrupts the other — writes are atomic.

## 7. TOML round-trip — one library, `@decimalturn/toml-patch`

**Decision: a single dependency, `@decimalturn/toml-patch`**, used for both `parse` (reads) and
`patch` (comment-preserving writes); the default file is our own curated template (§5), so no
`stringify` is needed. Rationale:

- **Comment-preserving TOML editing is the "hard, easy-to-get-subtly-wrong" class** where the repo
  already reaches for a vetted library (`write-file-atomic`) rather than hand-rolling — unlike the
  ~40-line encoding detector or the trivial IPC guards it wrote by hand. A surgical hand-rolled writer
  would reinvent quoting/escaping/table handling and own its edge-case bugs.
- **`@decimalturn/toml-patch` fits every constraint:** MIT (`SPEC.md` §11 permissive-OSS), **zero
  runtime dependencies**, **dependency-free / browser-usable** (so it imports clean; it lives in `main`
  by the §3 decision, not for purity reasons), TOML 1.1.0, purpose-built to "preserve comments,
  whitespace and formatting," and **actively maintained** (v2.1.0 published 2026-07-21; the maintained
  successor to `timhall/toml-patch`). One library = **one source of parse-truth** across read and write
  (no risk of two parsers disagreeing on an edge case).
- Alternatives rejected: **`smol-toml` for reads + `toml-patch` for writes** (ships two TOML
  implementations for belt-and-suspenders read correctness we do not need on our own small config file);
  **`smol-toml` + a hand-rolled surgical writer** (maximal dependency conservatism, but owns the fiddly
  editing edge cases — against YAGNI when a maintained, purpose-built library exists).

*(Verification at implementation: import `toml-patch` in `main`, confirm the typecheck/tests pass and it
pulls in nothing Node-hostile; the fs-free `tomlConfigCodec` tests exercise the preserving round-trip
directly.)*

## 8. Config location

The global config directory is Electron's **`app.getPath('userData')`** — on Linux this *is* XDG
(`$XDG_CONFIG_HOME/coal`, i.e. `~/.config/coal`), the GNOME-native home for user config (§2 Linux-first).
Dev and release already run under **distinct `userData` dirs** (walking-skeleton §9, keyed on the app
name), so config auto-isolates across dev/release with no extra work. The file is
**`<userData>/settings.toml`**.

`configService` is constructed with a **directory**, not a hard-coded path, so the identical service
serves the vault scope's `<vault>/.coal/config/` later — the reusable store the two-scope model (§2)
needs. Tests point `userData` at a temp dir so materialization never touches the real `~/.config/coal`.

## 9. Error handling — never crash, never clobber

- **Missing file** → materialize the default template (creating the directory recursively), then load it.
- **Malformed TOML** (parse throws) → keep the last-good snapshot (defaults on boot) + a `parse-error`
  diagnostic, and **leave the user's file untouched** — never overwrite an unparseable file the user is
  mid-edit on.
- **Invalid/unknown values** → diagnostics (§5), file intact.
- **fs write failure** → an error result (like `SaveResult`); the atomic write guarantees no partial
  file is left behind.
- **IPC hardening** — `config:set` payloads get the same `senderFrame` + hand-written payload validation
  (`main/guards.ts`) every existing channel uses; the renderer holds no path and no fs.

## 10. Testing (three tiers, TDD)

- **Tier 1 — Vitest `node` (the bulk):**
  - `kernel/config`: `schema` + `validate` (valid coercion; wrong-type → diagnostic + unset; unknown-key
    → diagnostic + preserved; missing → default/unset); the default template parses to the expected
    settings.
  - `main/tomlConfigCodec` (fs-free): a commented file parses to the right object; `applyEdit` changes
    only the target value while **preserving comments and foreign keys**; round-trip stability.
  - `main/configService` (fs, like `fileService.test`): materialize-on-missing; atomic write;
    `set` → comment-preserving patch on disk; `reload`; malformed → keep-last-good + diagnostic;
    external-edit-then-`reload` reflects.
- **Tier 2 — Vitest `browser` (real Chromium):** the `renderer/config.ts` client applies a
  `config:changed` snapshot and notifies subscribers (light; the client is thin).
- **Tier 3 — Playwright `_electron` (one smoke):** launch with a **temp `userData`** → assert
  `settings.toml` materializes with the default content → change it on disk → run `core.config.reload`
  (via the palette) → assert the renderer's snapshot updated. Run under `xvfb`, extending the existing
  e2e harness.

## 11. Security posture

Config IO is **main-only**, the exact boundary the skeleton established: the renderer never imports
`fs`, never holds the config path, and receives only settings *objects* + change events over typed,
runtime-validated IPC. The `.coal/config/` tree is **kernel-owned** by design (§8.3) — no plugin writes
it; step 3 has no plugin loader, so this is trivially upheld and set up for step 5. The one new
main-side dependency (`toml-patch`) is MIT, zero-dependency, and confined to `main`, keeping the
dogfooded `kernel/` supply-chain surface at zero (§3). The trust boundary from the skeleton is otherwise
unchanged.

## 12. Deferred / out of scope

The per-vault config tree + scope override/merge (workspace/PKM slices, steps 5/7); `plugins.toml` +
`plugins/<id>.toml` (step 5); the Settings GUI (step 9); live file-watching (committed follow-up); the
first-run prompt + both keymaps (step 4); any honored editor setting beyond the keymap slot. Only the
global layer, and only the `keymap` setting, ship now.

## 13. Decision summary

1. **Scope = the global (user) config layer + the `keymap` slot** (step 3); the per-vault tree arrives
   with the workspace/PKM slices; first behavioral consumer is step 4.
2. **Config is two-scope-by-ownership** (§2, amends §8.3/§9): user-preference kernel settings live
   per-user (`$XDG_CONFIG_HOME/coal`) and travel with the user; vault config lives in `<vault>/.coal/
   config/` and travels with the repo. The vault is a PKM-plugin concept; the kernel needs none.
3. **Architecture = pure `kernel/config` + thin `main/configService`**, mirroring `io/codec` +
   `fileService`; the **kernel stays dependency-free** — the TOML library lives in `main` (like
   `write-file-atomic`), the pure schema/validation/template in `kernel`.
4. **Preserve comments *and* foreign keys** on write by patching the full parsed object with the change
   overlaid; the file text is the source of truth.
5. **Reactivity = change events + manual reload** (`core.config.reload`); live-watch is a committed
   follow-up designed to slot in behind the same broadcast with no API change.
6. **One TOML dependency, `@decimalturn/toml-patch`** (MIT, zero-dep, kernel-pure, maintained), for
   `parse` + comment-preserving `patch`; the default file is a curated template.
7. **Location = `app.getPath('userData')/settings.toml`** (XDG on Linux); the service takes a directory
   so it is reused for the vault scope later.
8. **Never crash, never clobber:** materialize on missing, keep-last-good + diagnostics on malformed,
   atomic writes, main-only IO with senderFrame + payload validation.
9. **Testing:** Vitest node (schema/validate + codec + service) + a light browser test + one Playwright
   smoke (materialize + reload).

## Load-bearing references

- `SPEC.md` §9 (configuration model — plain text, GUI-as-front-end, TOML), §8.3 (config surface /
  kernel-owned tree — **amended by §2 here**), §6 (keymap choice is a declarative setting).
- [Plugin-system design](2026-07-22-plugin-system-design.md) §12 (config tree layout) and §8.3's
  manifest-schema-declared settings.
- [Kernel walking-skeleton design](2026-07-22-kernel-walking-skeleton-design.md) §1.1 (build sequence —
  step 3), §5 (module layout), §3 (process/trust boundary — all IO in main); and
  [`docs/dev/kernel.md`](../../dev/kernel.md) (what exists today: `io/` + `fileService` as the pattern).
- TOML substrate research (July 2026): `@decimalturn/toml-patch`
  <https://github.com/DecimalTurn/toml-patch> (MIT; comment/format-preserving `patch`; v2.1.0
  2026-07-21) and its npm registry metadata; `smol-toml`
  <https://github.com/squirrelchat/smol-toml> (BSD-3-Clause; the reference reader, canonical
  `stringify`, no comment preservation) as the rejected alternative; `toml-eslint-parser`
  <https://github.com/ota-meshi/toml-eslint-parser> (comment/token AST) noted as the hand-rolled path
  not taken. `@iarna/toml` (stale) and `@ltd/j-toml` (no preservation) excluded.
</content>
</invoke>
