# Coal — Plugin & Kernel extensibility system — design

Date: 2026-07-22
Status: accepted (design session). Converts the [`SPEC.md`](../../../SPEC.md) §8 principles into a
concrete, implementable system, and re-founds the core/plugin split around a minimal general-purpose
kernel. Theming is a separate, queued design session.

## Problem

[`SPEC.md`](../../../SPEC.md) §8 ratified the _shape_ of Coal's extensibility — "core-as-plugins", a
capability-brokered plugin API, CSS-variable theming, and declarative plugin management — but left
the concrete system undesigned. It also baked PKM, encryption, and git in as privileged **core**, so
"core-as-plugins" was aspirational rather than load-bearing.

This session re-founds the architecture, then designs the plugin system against it:

- **The kernel becomes a minimal, general-purpose, keyboard-first plain-text editor** — open, parse,
  and present nearly all filetypes; usable with zero plugins.
- **The entire existing feature set is retained but re-homed as official opt-in plugins** built on
  the public API: encryption, git, the Overlay/linking/PKM stack, Live Preview, the full Emacs/Vim
  keymaps' _feature surface_, search, tags, templates, and the rest.
- The product thesis shifts from "an Obsidian-like PKM editor" to **"the editor is its plugin
  API"**: a small, fast, hackable core whose value is a genuinely strong and safe extension
  substrate, with first-party plugin suites that prove the API is complete. Generality is a
  substrate property, not a promise to out-IDE VS Code.

This is a re-homing, not a feature cull. What changes is **the layer** that implements a feature,
**the delivery** model (opt-in), and **the trust anchor** for dangerous capabilities (core
membership → first-party bundling).

## Relationship to `SPEC.md`

- **Survives verbatim (behavior unchanged):** §9 config model, §10.3/§10.4 encryption mechanism +
  recovery key, all of §13 (three-tier linking, frozen normalizer, reconciliation, sidecar schema),
  §7.1/§7.2 Live-Preview reveal rules, §6 keyboard-first + Emacs/Vim parity + minibuffer.
- **Same decision, re-expressed as "which layer":** §7 (Live Preview delivered by the Markdown
  plugin, not the kernel), §10.1/§10.2 (git + encryption become first-party plugins filling
  privileged kernel seams), §13 (the Overlay is the linking plugin, seeded by `src/overlay/`), §14
  (the roster is the target feature set, delivered over the kernel shell).
- **Strengthened:** §8 — "core-as-plugins" becomes literally true, and the trust model sharpens.
- **Broadens in framing only:** §1 Vision, §2 Founding principles.

Terminology: **kernel** = the irreducible core.

## 1. The kernel boundary

The kernel is a real, usable editor with zero plugins enabled — "dumb but usable". The line is drawn
by a single principle: **the kernel does raw presentation + navigation; plugins do interpretation +
enrichment.**

**Kernel:**

- CodeMirror 6 editor engine: buffer/document model, selection, editing, large-file viewport.
- Byte-exact IO for any filetype: open/save byte-for-byte, encoding detection (UTF-8/16, BOM),
  line-ending handling, binary/large-file strategy. (§9's byte-for-byte guarantee lives here, for
  _all_ files.)
- Filetype identification + a generic "present as text" path, with a pluggable presenter slot.
- **Syntax-highlighting engine** (`@codemirror/language` infrastructure: highlight tags, the
  theme/`HighlightStyle` binding, and the language-registration seam). The _engine_ is kernel; the
  per-language _grammars_ are plugins (see §3, passive providers).
- Command registry + unified minibuffer (`M-x` / `M-:` / `:` / `/`) + input-mode seam.
- **Both full keymaps (Emacs and Vim) live in the kernel.** The input layer is fundamental to a
  keyboard-first editor, and keeping both in the kernel resolves the "must be operable" + "must pick
  a keymap" tension. Keymaps bind through the public command/keybinding API (so that seam is
  dogfooded). There is **no baked-in default keymap**: first launch prompts Emacs-or-Vim and writes
  the choice to config; if config already declares one, no prompt (§6).
- Workspace shell: file-tree sidebar, quick switcher, windows-as-split, per-window tabs
  (navigating/presenting files is the core job; matches VS Code's workbench).
- Config loader + Settings UI front-end + the config tree (§12).
- The extension substrate itself: plugin loader + capability broker + the typed host API.
- **Privileged seams**, declared but empty by default, fillable only by first-party plugins:
  storage-codec / IO-wrapper, startup/unlock gate, key custody (see §11).

**Plugins (the entire current feature set):** Markdown/Org rich support (Live Preview, inline
renderers, grammars); the Overlay/linking/PKM stack (linking, reconciliation, backlinks, Links &
Dangling panels, hover preview, graph view, embeds, tags, search, templates, daily notes,
Zettelkasten, outliner, outline/TOC, word-count); git + auto-commit/push + file recovery;
encryption; spell/grammar; full code-editor mode; change app icons.

The **default** experience is the minimal editor; **fully-outfitted Coal** = kernel + the official
plugin suite enabled. No features lost — just opt-in.

## 2. Core-as-plugins: the kernel dogfoods the API

The kernel registers its own behavior through the **same public registry/API** third-party plugins
use, under the same broker (with first-party grants). It is not split into separately-installable
plugin packages, but at runtime it goes through the identical seam. This proves the API is complete
by construction and catches privileged shortcuts early: since git, encryption, and the whole PKM
stack must be built on the public API like everyone else, the API cannot quietly have gaps its own
flagship features fall through.

## 3. Distribution & enablement

- **All official plugins are bundled** in the app package but **off by default** (dormant-but-
  shipped): enabling one activates and wires it up — no fetch. Offline-safe; signature-trivial.
- **No "recommended plugins" step.** First-run is the keymap prompt only.
- **Passive providers.** "Off by default" governs _feature_ plugins the user opts into. _Passive
  providers_ — first-party, side-effect-free things like a syntax grammar (and later e.g. an image
  presenter) — **auto-load on demand** by filetype. You never "enable Rust highlighting"; it just
  works when you open Rust (CodeMirror's `LanguageDescription` lazy-load is built for this).
  Third-party grammars never auto-activate.

## 4. Trust & security model

Two tiers, one gate.

- **First-party (bundled): fully trusted.** All capabilities including the privileged class, granted
  by default; the only tier eligible for the privileged class; passive providers auto-activate. No
  per-plugin consent. This is what makes the encryption plugin tractable.
- **Third-party: blocked by default** (Obsidian-style Restricted Mode). Enabling third-party at all
  is one explicit, well-warned global gate. There is **no first-party registry** (community-
  maintained at most); third-party plugins live in **open-source git repos** (see §13).

**Isolation.** Even with third-party enabled, untrusted code runs in a **curated realm** with zero
ambient authority: it cannot reach `fs`, `process`, `network`, or Node/Electron internals except
through the brokered API, and only for a capability it **declared** and was **granted**. A plugin
that declares nothing dangerous genuinely _cannot_ do anything dangerous. Trusted first-party code is
not realm-boxed (it is audited instead). This preserves §8.2's "the typed API is the sole channel"
as a structural property while staying in-process; it is an honest boundary, not a containment claim
(a _granted_ capability is genuine access).

**Consent (third-party normal caps).** Informed per-plugin consent at install: the global gate must
be on, then installing a specific plugin shows its declared, scoped caps and asks a single informed
yes/no for _that_ plugin (no per-cap toggles). Grants drop when a plugin is disabled; the manifest is
inspectable in Settings anytime.

**First-party trust is structural — no crypto in v1.** First-party = the set baked into the app
bundle (covered by the app's own RPM/Flatpak distribution signature). Third-party = anything
installed from a git URL (by construction not in the bundle). First-party plugin updates ride app
releases — no out-of-band channel, which is desirable for the privileged plugins. Per-plugin
cryptographic signing is a **reserved future extension point**, designed only if first-party ever
distributes out-of-band or a community registry appears.

## 5. Capability model

**Baseline vs capability.** Being a plugin freely grants baseline abilities — register commands,
keybindings, views, status-bar items, settings, hook subscriptions — none of which touch user data or
the system. A **capability** is only a _reach_ into user data, the system, or another plugin's
domain. Contribution = baseline; the data/system reach behind it = capability. This keeps the consent
bill short and meaningful.

**Normal capabilities** (declarable, scoped, third-party via per-plugin consent). Scope is
broker-enforced least-privilege; broadening a scope is a separate, visible declaration:

| Capability | Gates                                  | Default scope                                   |
| ---------- | -------------------------------------- | ----------------------------------------------- |
| `document` | Read/write buffer content, selection   | `read`; active-doc only (vault-wide = explicit) |
| `vault`    | Read/write files in the vault          | vault root (broader FS = explicit `fs-external`) |
| `network`  | Outbound connections                   | declared host allowlist                         |
| `process`  | Spawn subprocesses                     | declared executable allowlist                   |
| `clipboard`| Read/write clipboard                   | —                                               |

**Privileged class** (first-party only, never third-party, even with consent) — the seams whose
danger is _systemic_, not personal, so consent cannot make them safe for _other_ data/plugins:

| Seam                     | Why it is systemic                                                    |
| ------------------------ | -------------------------------------------------------------------- |
| `storage-codec`          | Governs how _every_ file is physically written; can defeat encryption |
| `startup-gate` / `unlock`| Decides whether the app opens at all                                 |
| `key-custody`            | Holds the keys protecting everything                                 |

There is deliberately **no** `ambient`/raw-Node capability; concrete brokered caps cover every real
need, so nothing bypasses the broker.

The distinction that anchors the split: a **normal** cap harms only the consenting user (their data,
their informed choice), so consent is meaningful; a **privileged** cap subverts guarantees for _all_
data and _other_ plugins, so it is reserved to first-party-audited code, not offered.

## 6. Extension-point taxonomy

Two organizing splits:

1. **Declarative contributions vs runtime API.** Static contributions live in the manifest so the
   kernel can reason about a plugin _without running its code_ (lazy activation, Settings rendering,
   capability display). Behavior is registered in code at activation.
2. **Kernel primitives vs plugin-declared points.** The kernel ships a small set of primitives;
   plugins declare their _own_ higher-level points on top. Rich in primitives, thin in features —
   the same lever that keeps the kernel small.

The primitives, grouped by family (each justified by an official plugin that needs it):

- **A. Command substrate:** commands (the spine; the universal override point) · keybindings ·
  input modes/states · minibuffer/quick-input providers.
- **B. Editor & document:** editor extensions (raw CodeMirror 6 extensions, capability-gated) ·
  filetype/language providers · filetype presenters (custom views) · completion providers ·
  diagnostics/annotation providers · hover providers · context-action providers.
- **C. Workspace & UI chrome:** views/dock panels (plugin-owned DOM container + provided theme
  tokens) · status-bar items · menus/palette grouping.
- **D. Data, services & config:** services (inter-plugin API exports) · plugin-declared extension
  points · settings/config schema · scoped persistent storage.
- **E. Lifecycle & events:** activation events · hooks/events · background tasks/workers.
- **F. Privileged seams (first-party only):** storage-codec provider · startup/unlock gate ·
  key custody (see §11).

Three resolved design forks:

1. **Editor seam depth = raw CM6 extensions, capability-gated** (`editor` cap; realm-bounded for
   third-party). CM6 is the chosen stack and full customization is a stated value; a curated wrapper
   would bottleneck the very features we want. The coupling to CodeMirror is accepted.
2. **View render surface = plugin-owned DOM container + provided theme tokens** (Obsidian model).
3. **Completion / diagnostics / hover / context-actions = dedicated thin provider APIs**, not
   hand-rolled over editor extensions — these are common enough that making every plugin hand-roll
   decorations for a hover would be the "repeat yourself to change one line" problem.

## 7. Composition & code reuse

The `~60%` shared-code rule is a **diagnostic, not a destination.** It separates two triggers so
shared code never bloats the kernel:

- **DRY trigger** ("plugins share code") → **extract to a shared layer**, almost never the kernel.
- **"Bare editor needs it" / privileged trigger** → **kernel** (this, not DRY, is why keymaps are
  kernel).

**Half 1 — where extracted code goes, by reuse scope:**

1. **Kernel std-lib/SDK** — universal, stable, public primitives; inert; for everyone including
   third-party. High bar.
2. **First-party internal packages** — pure code shared across the first-party monorepo, imported
   directly; no runtime machinery; where the extraction lands most often. Only runs when an
   importing plugin activates, so idle cost is zero.
3. **Runtime services** — a live cross-plugin API a provider registers and others consume;
   tier-aware; capability-mediated (a service runs with its provider's caps, the consumer gets the
   API not the caps); enabling a consumer transitively activates its provider.
4. **Kernel seam** — privileged / needed-with-zero-plugins; rare.

Third-party never imports first-party internals; third-party reuse is only via the public std-lib +
stable published services, so first-party can refactor internals freely.

**Half 2 — tweak behavior without reimplementing** (the "change one line" answer):

- **Command advice.** Attach `before` / `after` / `around` advice to any command id (Emacs-style).
  `around` receives the original as a continuation it may call, skip, or wrap. Multiple advisers form
  an ordered, inspectable chain. Advice is a disposable (auto-torn-down on deactivate) and runs with
  the advising plugin's own grants.
- **Hooks / events.** Two kinds: _notify-only_ (`document-opened`, `after-save`, `document-changed`,
  `selection-changed`, `active-editor-changed`, `view-opened/closed`, `layout-changed`,
  `plugin-activated/deactivated`, `config-changed`, `file-created/renamed/deleted`) and
  _mutating/awaited_ (`before-save`, `before-quit`, `onBoot`, `workspace-opened`). The kernel awaits
  the mutating kind (so format-on-save can finish) with a timeout. **Fail-safe rule:** if a
  `before-save` transform throws or times out, the kernel discards that hook's changes and proceeds
  with the prior content — a buggy plugin can never lose bytes or block a save. Reading content in a
  hook requires the `document` cap; the event hands over a broker-gated handle. The catalogue is a v1
  set and additive.
- **Plugin-declared extension points.** A plugin declares a point (id) — in its manifest so others
  can find it, backed by a runtime contract it owns (e.g. the Markdown plugin's `inline-syntax`).
  Others contribute declaratively and/or through the provider's service; the provider enumerates and
  invokes contributions; the kernel supplies only the registry plumbing + dependency wiring.
  Contributions run with the contributor's grants; the provider mediates.
- **Config** as the first resort when the tweak is really a preference.

**Enforcement:** review-time discipline now (a human routes to the right destination); an _advisory_
duplication metric (jscpd-style, consistent with Coal's advisory CI) may be added later once a plugin
corpus exists — never a hard gate.

## 8. The manifest (`plugin.toml`)

The manifest declares **metadata**; code implements **behavior**. The manifest states the existence +
metadata of everything the kernel must know _before load_; behavior is registered at activation. A
command appears in both (metadata in manifest, handler in code) — that duplication is load-bearing:
it lets `M-x` show and lazy-activate a command before its code loads. Declarative depth is
medium/VS-Code-style.

```toml
[plugin]
id          = "coal.git"          # coal.* reserved for the bundled first-party set
name        = "Git"
version     = "1.0.0"
description = "Version-control your vault with Git."
authors     = ["Coal"]
license     = "Apache-2.0"
repository  = "https://github.com/coal/coal"   # required for third-party (the install source)
entry       = "./dist/main.js"                 # runtime entry module (pre-built JS)

[plugin.compat]
coal = "^1.0"                     # host-API range (§9)

[capabilities]                    # declared + scoped (§5)
process = ["git"]
vault   = "readwrite"

[activation]
events = ["onStartup"]            # or onCommand:*, onView:*, onLanguage:*, onConfig:*

[[commands]]
id = "coal.git.commit"
title = "Git: Commit"
category = "Git"

[[views]]
id   = "coal.git.history"
title = "Git History"
dock = "right"

[[statusbar]]
id       = "coal.git.branch"
priority = 100

[settings.autoCommit]
type = "boolean"
default = false
title = "Auto-commit on save"

[dependencies]
# "coal.templates" = "^1.0"       # declaring a dep -> transitive activation (§7)
```

- **Manifest-declared** (metadata): identity, compat, capabilities, activation events, commands,
  keybindings, views, status-bar items, settings schema, filetype associations, menus,
  plugin-declared extension points, dependencies.
- **Runtime-registered** (behavior): command handlers, editor extensions, providers, view render
  logic, hook subscriptions, service exports.
- **Keybindings are optional, keymap-agnostic hints;** commands are first-class and always reachable
  via the minibuffer. A plugin does not hard-bind Emacs- or Vim-specific keys; the active keymap/user
  resolves any suggested binding.
- **Id namespace:** `coal.*` reserved for the bundled first-party set; third-party uses its own
  reverse-DNS-ish id (e.g. `me.alice.fancylinks`).

## 9. Host API versioning & stability

The versioning machinery is really for third-party (first-party ships in lockstep with the app, so it
never drifts).

- The public plugin API is **SemVer'd**. The versioned surface = the public typed API +
  extension-point contracts + capability names + manifest schema; kernel internals are excluded.
- **Additive-only within a major.** Breaking changes require a major bump, treated as a last resort,
  preceded by deprecation (mark in a minor, keep working through the major, remove at the next major;
  warn the author + a soft Settings notice).
- **Pre-1.0 = no stability promise** (the API stabilizes at 1.0; first-party lockstep is unaffected).
- **N-1 compatibility window.** The host supports the current _and_ previous major, so a `^1.x`
  plugin keeps working through all of `2.x` (run against the retained previous-major surface); the
  real cliff is at `3.0`. A major auto-update therefore breaks nothing; authors get a full major
  cycle to migrate. N-1 is a knob we can widen later, not narrow.
- **At the true cliff (N-2): graceful degradation, never a crash.** On launch after an update the app
  reconciles enabled plugins against the current API; an out-of-window plugin is _paused_ with a
  clear message, everything else keeps running (the kernel + all first-party features are lockstep,
  so the editor is never broken — only opt-in third-party pauses), and the user gets a **force-enable
  at your own risk** escape hatch.

Load decision: same major → load; N-1 → load; two+ behind → refuse (graceful degrade); ahead of host
→ refuse ("update Coal").

## 10. Lifecycle

- **Discovery** from two roots: the bundled first-party set (in the app package) and the third-party
  install dir under `.coal/`. Enablement comes from `plugins.toml` (§12).
- **Lazy activation by default** via activation events (`onStartup` / `onCommand` / `onView` /
  `onLanguage` / `onConfig`); the privileged `onBoot` phase runs earlier still (§11); passive
  providers auto-activate by filetype; enabling transitively activates dependencies/services.
  `onStartup` is opt-in for the rare plugin that must run at boot.
- **Hot enable/disable** — enabling activates (+ deps); disabling deactivates and drops capability
  grants. Boot-level privileged plugins (`storage-codec` / `startup-gate`) require a restart.
- **Kernel-owned auto-disposal ledger.** The kernel auto-tracks everything a plugin registers
  (commands, views, decorations, hooks, status items, services, advice) and tears it all down on
  deactivate. A plugin cannot leak contributions; hot enable/disable is reliable.
- **Error isolation.** Every plugin entry point (activation, handlers, hooks, providers, render) runs
  inside a try/catch boundary; a throw pauses that plugin with a report, never crashing the kernel or
  other plugins. The realm further contains third-party.
- **Third-party ships pre-built JS** (`entry` → built output). Coal never runs an arbitrary build
  toolchain — simpler, and it removes the build-script code-execution surface.

## 11. The privileged startup/storage seam (encryption-as-a-plugin)

The acid test of the pivot: encryption — the most privileged feature — is a plugin, and the kernel
never learns what "crypto" is. The kernel exposes three generic, first-party-only pieces; encryption
is merely the first thing to fill them.

Boot sequence:

1. Kernel starts → loads the config tree including `plugins.toml`.
2. Kernel brings up the loader + capability broker + host API.
3. **Boot phase** — a new earliest activation event `onBoot` (before `onStartup`): enabled plugins
   filling a privileged boot seam activate now, before any file is touched.
4. The encryption plugin **registers its storage-codec** → every kernel file read/write flows through
   `decode()` / `encode()` (plus logical↔physical name mapping, `note.md` ↔ `note.md.age`). No codec
   registered = identity passthrough = the plaintext default editor. Exactly one codec may be active.
5. The encryption plugin's **startup-gate** blocks boot: the kernel awaits it. The gate shows the
   unlock UI, derives/unwraps the key via **key-custody**, and resolves only once unlocked.
6. Gate resolves + codec in place → kernel opens the workspace; files read back as plaintext
   transparently (the Overlay's sidecars ride the same codec, so the index is encrypted too).
7. Normal lazy activation resumes.

The kernel stays minimal: a boot barrier + an IO indirection point, with **no native "locked"
concept**. Runtime re-lock (vault timeout, §10.3/§10.4) is supported by the seam — the gate can
re-engage and the plugin can drop its key — but the lock-screen UX and timeout policy are the
encryption plugin's own design, not kernel surface. Toggling these seams requires a restart.

## 12. Config surface

The whole `<vault>/.coal/config/` tree is **kernel-owned; no plugin can write it** — structural
privilege separation, so a plugin cannot enable itself or edit the config layer.

```
<vault>/.coal/
  config/                      # kernel-owned; no plugin can write here
    settings.toml              # kernel options only (keymap choice, editor-engine basics)
    plugins.toml               # enablement roster — bundled + third-party
    plugins/
      coal.git.toml            # first-party plugin settings
      me.alice.fancylinks.toml # third-party plugin settings — same rule
  plugins/                     # plugin-owned data
    me.alice.fancylinks/       # third-party installed code + its index/cache
```

- `settings.toml` holds **kernel options only** — a small set, because most "settings" are really
  plugin settings (Live Preview itself is a plugin). *(Refined 2026-07-23: config is two-scope — this
  vault `settings.toml` holds **vault-scoped** kernel options + overrides; **user-preference** kernel
  settings, keymap/editor-basics/theme, live in the **user/global** scope `$XDG_CONFIG_HOME/coal`. See
  `SPEC.md` §9/§8.3 and [`config-loader design`](2026-07-23-config-loader-design.md) §2.)*
- `plugins.toml` is the **enablement roster** for all plugins, kernel-owned so a plugin can't enable
  itself or a peer. First-party entries carry `enabled`; third-party entries also carry `source` (git
  URL), a pinned `version`, and `consented` (the per-plugin consent record). Absent first-party =
  default off.
- `plugins/<id>.toml` holds **per-plugin settings, uniform for first-party and third-party** —
  isolated per plugin (no shared-file muddying) but inside the kernel-owned tree.
- Plugin **data** (index/cache; third-party installed code) lives under `plugins/<id>/`, separated
  from config by owner.

Settings stay **manifest-schema-declared and kernel-round-tripped** (§8, §9): the Settings GUI renders
from the schema, reads/writes the text file with no shadow store; plugins read reactively and writes
go through the settings API. Per-plugin _location_, not author-freeform _format_.

## 13. Third-party distribution (git-based)

- **Install** (precondition: `allow-third-party = true`): the user provides a git URL (+ optional
  ref). Coal clones to a temp dir → reads `plugin.toml` → gets the id → shows the declared, scoped
  caps → per-plugin consent → moves the clone to `.coal/plugins/<id>/`, writes the `plugins.toml`
  entry (source + pinned version + consented), and activates. An id collision is treated as an
  update/replace, not a silent overwrite.
- **Pre-built, no build step.** Coal loads the manifest's `entry` (committed built JS); it never runs
  `npm install` or a plugin's build scripts.
- **Pin & reproducibility (§9).** Install resolves a concrete ref (default: latest release tag, else
  default-branch HEAD) and records it. A fresh machine reconstructs the setup by re-cloning each
  third-party `source` at its pin. First-party just flip on; only third-party re-clone needs network.
- **Offline.** Installed plugins load locally; only install/update touch the network.
- **Updates are manual, never automatic** — no background polling, no auto-pull of untrusted code.
  The user triggers an update; Coal fetches the new ref, re-reads the manifest, and re-prompts consent
  only if the declared caps changed or a scope broadened.
- **Third-party → third-party dependencies are not auto-fetched** (auto-installing more untrusted
  code is exactly what we avoid). A missing dep makes the plugin fail to activate with a clear message;
  the user installs deps explicitly. Dependencies on first-party services/std-lib are always present.
- **Uninstall** = remove the entry + delete the dir; grants drop.

## 14. Implications for `SPEC.md`

This design re-founds §8 and touches the framing of §1/§2 and the layer of §7/§10/§13/§14. The
follow-up work (its own PR) is to reconcile `SPEC.md`:

- Rewrite §1/§2 to the "general-purpose editor whose value is its plugin API" framing (principles
  unchanged, audience broadened).
- Re-express §7 (Live Preview), §10 (git, encryption), §13 (Overlay), and the §14 roster as
  plugin-delivered over the kernel, per the layer tally above.
- Replace §8's core-vs-plugin trust language with the first-party-bundled / third-party-realm model,
  and record the capability catalogue + privileged class.
- Update [`PLUGINS.md`](../../../PLUGINS.md): keymaps move to the kernel; everything else in the
  roster is an official opt-in plugin. Update [`TODO.md`](../../../TODO.md): the "core vs
  official-plugin split" is largely resolved (almost everything is a plugin over a minimal kernel);
  the remaining per-surface designs (search, tags, templates, outliner, embeds, graph) proceed as
  before, now as plugin designs.

Build-order consequence: the kernel + host API + broker come first; the existing `src/overlay/`
becomes the seed of the linking plugin (consuming the API), not more kernel — so we do not build more
kernel on top of it.

## 15. Deferred / out of scope

- **Theming** — its own design session (rides the plugin install path but is declarative CSS-variable
  data with no code, §8.1). Queued next.
- **`SPEC.md`/`PLUGINS.md`/`TODO.md` reconciliation** — the follow-up PR in §14.
- **Per-surface plugin designs** — search, tags, templates, daily notes, outliner, embeds,
  graph-view renderer — unchanged in scope; each its own session, now as plugin designs.
- **Cryptographic plugin signing**, a **community registry**, and **cross-major (N-2) compatibility
  shims** — reserved extension points, designed only against a real future need.

## Decision summary

1. Pivot to a minimal general-purpose kernel; retain the full feature set as official opt-in plugins.
2. The kernel dogfoods the public API (core-as-plugins made literal).
3. All official plugins bundled, off by default; passive providers (grammars) auto-activate.
4. Keymaps (both full suites) and the syntax-highlighting engine live in the kernel.
5. No default keymap; first-run prompt or config-declared.
6. Shared-code: extract-by-scope (std-lib / internal package / service / kernel) + compose-by-seams
   (advice / hooks / extension points / config); the `~60%` rule is a review-time diagnostic.
7. Two-tier trust: first-party trusted; third-party blocked-by-default, realm-bounded to declared
   caps when enabled; privileged class first-party only.
8. Informed per-plugin consent for third-party normal caps; capabilities are scoped least-privilege.
9. First-party trust is structural (bundled), no per-plugin crypto in v1.
10. Manifest = `plugin.toml`: metadata declared, behavior in code; medium declarative depth.
11. Host API SemVer, additive-within-major, N-1 compatibility window, graceful degrade + force-enable.
12. Lifecycle: lazy activation, hot enable/disable, kernel auto-disposal ledger, error isolation,
    pre-built-JS only.
13. Privileged startup/storage seam (`onBoot`, storage-codec, startup-gate, key-custody); encryption
    is the first filler; the kernel has no crypto awareness.
14. Config surface: kernel-owned `.coal/config/` tree; roster in `plugins.toml`; uniform per-plugin
    settings; schema-driven round-trip.
15. Third-party distribution: git repos, Restricted Mode, pre-built JS, pinned + reproducible, manual
    updates, no auto-fetched deps.
