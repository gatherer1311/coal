# Coal — Design Specification

> **Status:** Living document. This is the authoritative source the builder pulls from.
> **Last updated:** 2026-07-23

---

## 0. How to read this document

**`SPEC.md` records only ratified decisions** — final design decisions and deliberate scope
boundaries; everything here is decided by definition. Anything still open, pending, or in-progress
lives in [`TODO.md`](TODO.md), not here.

**On the `reference/` directory.** Those files are *research and priors only* — a record of how
Emacs tooling, Org, and other PKM apps solved problems, plus notes from a prior, abandoned
implementation of Coal. **Coal is not derived from them.** If the design converges on something
that resembles prior art or the old Coal, that is only because we arrived there from first
principles. **Convergent, not derived.** No decision here may be justified by "the reference says
so."

---

## 1. Vision

Coal is a keyboard-first, Linux-native editor whose defining value is its **plugin API**. At its
heart is a **minimal, general-purpose, plain-text kernel** — it opens, presents, and navigates nearly
any filetype, is driven from the keyboard, and is fully usable with **zero plugins** — engineered to
be a genuinely strong and safe extension substrate. Coal's entire feature set then ships **on that API
as bundled first-party plugins**: Markdown and Org as first-class document formats with Live Preview,
the linking / backlinks / PKM stack, Git sync, opt-in encryption at rest, search, tags, templates, and
the rest. So Coal serves two audiences from one core — anyone who wants a fast, hackable editor, and
people who live in plain-text notes and want the extensibility and muscle-memory of Emacs or Vim
without leaving a modern, GNOME-at-home GUI. It treats the user's files (and the editor's own
configuration) as the single source of truth, version-controls and syncs them via Git, and extends
**everything — the kernel included** — through one coherent command / plugin / theme substrate. The
product thesis is **"the editor is its plugin API"**: generality is a substrate property, and the
first-party plugin suite exists to prove the API is complete — not a promise to out-IDE a heavyweight
IDE.

---

## 2. Founding principles

Non-negotiables. Every downstream decision must be consistent with them.

1. **Linux-first, GNOME at home.** Linux is the primary platform, not a port. Coal must feel like
   a deliberate, native-feeling citizen of the Linux desktop — especially GNOME — not a
   cross-platform app with a Linux build bolted on as an afterthought.
2. **Plain text is the source of truth — for notes *and* configuration.** Everything the user
   creates or configures lives in human-readable, version-controllable text files. The GUI is a
   front-end onto those files, never a hidden database the files merely shadow.
3. **Git-native, with privacy built in.** Git version control is first-class — free off-site
   sync and full history (deliberately avoiding a paid-sync model). Because syncing puts notes on
   remotes, Coal ships **first-class, built-in encryption at rest** the user enables per vault, so
   syncing — or losing the device — need never expose them. It is **opt-in** (off by default, §10.2):
   privacy is one toggle away, and plaintext workflows — a shared or company repo — are equally
   first-class.
4. **Keyboard-first.** The editor, the minibuffer, and constantly-used quick-access features are
   driven from the keyboard, with **first-class Emacs *and* Vim keymaps** (chosen at first run and
   fully switchable, §6). Mouse interaction is first-class where it genuinely wins (e.g. the visual
   graph) and available-in-addition where useful — but the core editing loop never *requires* the
   mouse.
5. **A minimal kernel; everything else is a plugin.** A single command / extension system. The
   irreducible **kernel** is a real, usable editor with zero plugins; Coal's whole feature set —
   Markdown/Org rich editing, linking/PKM, Git, encryption, search, and the rest — is retained but
   **re-homed as bundled first-party plugins** on the public API, and the kernel registers its own
   behavior through that **same public API** (core-as-plugins made literal, §8). The plugin system and
   the theme system are first-class citizens of that one substrate, not separate worlds.
6. **Convergent, not derived.** See §0.

---

## 3. Platform & packaging
- **Primary platform:** Linux, first-class. GNOME is the reference desktop.
- **Packaging & supported systems:** RPM is the **launch** target; the full supported-system matrix
  (Linux DEB / Flatpak, macOS, Android) is fixed in §3.1.
- **Native desktop integration is a feature, not a coat of paint.** Coal deliberately uses
  Electron's Linux/OS-specific customization surface so it feels at home. In scope:
  - XDG Desktop Portals (native GTK file choosers, etc.)
  - MIME association for `.md` / `.org` and file-manager "Open with"
  - Desktop notifications (libnotify / portal)
  - Follows the system light/dark preference
  - Native Wayland with correct fractional scaling (not XWayland-only)
  - Single-instance behavior via D-Bus activation
  - A polished `.desktop` entry, icons, and RPM packaging metadata
- **Boundary of "GNOME integration":** the UI is web technology themed to *look and feel* at home
  in GNOME. It is **not** built from native GTK/libadwaita widgets. "Full GNOME integration" means
  the desktop-integration layer above, not a native toolkit.

### 3.1 Supported systems

Linux is **primary and first-class** (§2); the other targets are **additional** and must never
compromise the Linux-first experience — Coal is not "a cross-platform app with a Linux build bolted
on" (§2). The supported set:

| System | Packaging | Timing |
|---|---|---|
| **Linux** (primary) | **RPM** | **at launch** |
| Linux | **DEB** | post-launch |
| Linux | **Flatpak** | post-launch |
| **macOS** | native app bundle | post-launch |
| **Android** | **APK only** (sideloaded; no app-store channel) | post-launch |

- **RPM ships at launch** (§3); DEB, Flatpak, macOS, and Android follow. Only RPM is a launch
  *commitment* — the rest are committed *targets* without a fixed launch order.
- **Android is APK-only** — distributed as a sideloadable APK, not through an app store.
- This section fixes *which* systems are supported; per-platform packaging and porting are build
  tasks in `TODO.md`. It does **not** dilute §2: Linux stays the platform Coal is designed *for*,
  and macOS/Android are ports held to the same native-feel bar rather than the reason for the design.

---

## 4. Technology stack
- **Shell:** Electron.
- **Editor core:** CodeMirror 6.
- **Implementation language:** TypeScript. Both decided stack components — Electron and
  CodeMirror 6 — are authored in and ship first-class type definitions for TypeScript, so it is
  the language that carries type-checking end-to-end across the shell, the editor kernel, and the
  extension API without an interop seam. Given "core-as-plugins" (§8), the same typed API surface
  the kernel is written against is the one plugin and theme authors consume.

_(Graph/visual-rendering library and similar specifics are tracked in `TODO.md` until ratified.)_

---

## 5. Document formats
- Coal supports **Markdown** and **Org** as **first-class document formats**, side by side.
- **Org depth = document format, not the Org application.** In scope: full Org *syntax* —
  headings, TODO keywords, links, tables, inline markup, properties/drawers — with live-preview
  authoring parity alongside Markdown.
- **Out of scope:** the Org *application suite* — agenda, Babel code execution, table spreadsheet
  formulas, and export backends. This is a firm scope boundary: Coal brings over `.org` **files,
  syntax, and writing style**, not Org's application features. A lightweight agenda/TODO view is
  **not planned** (it was previously an open "maybe later"; now settled as out of scope).
- **Markdown ⇄ Org feature parity (within Coal).** Every Coal feature that touches document content
  works **symmetrically for Markdown and Org** — live preview (§7.1), linking and block addressing
  (§13), backlinks (§13.14), and any future content feature treat the two syntaxes at parity. The
  parity is scoped to *Coal's own feature set*: it is **not** a promise to re-implement Org-application
  features (agenda, Babel, export — out of scope above) in Markdown, only that whatever Coal does, it
  does equally for both formats.

---

## 6. Interaction model
- **Keyboard-first**, for the editor, the minibuffer, and constantly-used quick-access features.
- **Two first-class keymaps out of the box: Emacs *and* Vim.** Both ship, both are fully supported,
  and the user **chooses at first run** (there is no baked-in default); the choice is a declarative
  editor setting (§9) that can be switched at any time.
  - **Delivery — both keymaps live in the kernel.** The **command substrate** (§8), the
    **minibuffer**, the **input-mode seam**, **and both full keymaps (Emacs and Vim)** are part of
    the **kernel** — not opt-in plugins. The input layer is fundamental to a keyboard-first editor, so
    keeping both suites in the kernel resolves the "must be operable out of the box" + "must pick a
    keymap" tension: the zero-plugin kernel is already fully drivable, and there is **no baked-in
    default** — first launch prompts Emacs-or-Vim and writes the choice to config (if config already
    declares one, no prompt). The keymaps still **bind through the public command / keybinding API**
    (so that seam is dogfooded like everything else), and binding keys is a **baseline** plugin
    ability requiring no capability (§8.2) — so later **community keymaps remain a natural, safe
    extension** as ordinary plugins, touching no files, keys, or network.
  - **Full feature parity.** Every Coal command is reachable in **both** keymaps; each binding is
    modeled on the **closest counterpart in its respective editor** (e.g. save is Emacs `C-x C-s`
    and Vim `:w`, both resolving to the one registry command). Where a concept is native to only one
    paradigm (Vim text objects; Emacs marks/registers), each keymap expresses the shared underlying
    command in its own idiom. Parity is a maintained invariant, mirroring the §5 "both formats
    first-class" rule applied to input. **Parity means coverage + idiom, not a behavioral
    reimplementation of either editor** — see §6.1 for exactly what the keymaps are and are not.
  - **Vim modes are fully supported**, via the same command substrate: normal / insert / visual (and
    the rest), operators, and text objects.
  - **The minibuffer is unified — one element, two personalities.** In Emacs mode it is `M-x` /
    `M-:`; in Vim mode the *same* surface renders the **`:` ex command line**, **`/` search**, and
    the **mode indicator** (`-- NORMAL --`, `-- INSERT --`, `-- VISUAL --`). Ex commands (`:w`,
    `:q`, `:wq`) resolve to the same registry commands as their Emacs counterparts.
- **Not keyboard-*only*.** Where an interaction is genuinely better with a mouse (the visual graph
  is the canonical example), that is a first-class mouse experience.
- **Both, where useful.** Features may expose both keyboard and mouse paths; the constraint is only
  that the core editing environment is fully operable from the keyboard.

### 6.1 Keymaps as convention templates — Coal's commands, borrowed idioms

The Emacs and Vim keymaps are **default keybinding templates Coal populates with its own commands —
not reimplementations of Emacs or Vim.** This is stated explicitly here so it is never re-litigated:

- **The command set is entirely Coal's.** Coal defines its own commands; it does not reproduce
  Emacs's or Vim's command inventory. Each keymap is a curated set of key → `commandId` bindings
  over *that* command set — a template we plug our commands into, kept relatively true to each
  platform's keybinding philosophy.
- **Derivation runs Coal-outward.** For each Coal command we choose an Emacs-idiom key **and** a
  Vim-idiom key, guided by how each editor *would* bind an action of that nature — staying true to
  each platform's philosophy (Emacs: chorded modifiers, `C-x` / `C-c` prefixes, non-modal; Vim:
  modal normal / insert / visual, operator + motion, leader, the `:` ex-line). We do **not** start
  from either editor's keymap and replicate it inward.
- **A binding is not inherited just because the source editor has it.** Where Emacs or Vim binds a
  key to a command Coal has no analog for — e.g. Emacs `M-$` → `ispell-word`, which Coal does not
  have — that key is simply **unbound**: free to be assigned to a fitting Coal command later, or
  left unused. Nothing is ever mapped to a command that does not exist.
- **Coal-original commands get invented idiomatic bindings.** A command with no Emacs or Vim
  ancestor (e.g. a PKM/linking action) is still bound in **both** templates, using a key **in the
  spirit of** each platform (an Emacs `C-c`-style user binding; a Vim `<leader>` / `g`-prefix
  binding), rather than borrowed from prior art.
- **Parity is coverage + idiom, not behavior.** "First-class in both keymaps" means every Coal
  command is **reachable and idiomatic in both** — *not* that Coal replicates either editor's
  editing model, modal engine, or minibuffer internals. Both keymaps bind through the one public
  command / keybinding API (§8) to the same registry commands, so neither has a path the other
  lacks, and "every command is bound in both" is a **maintained, testable** invariant.

The upshot: we implement Coal's own functions and commands, plug them into the two templates under
each platform's conventions, and adjust a template only where Coal's command set genuinely diverges
from what that editor's keys assume — no 1:1 cloning of either program's commands, functions, or
keybindings.

---

## 7. View modes
- Coal has exactly two views: **Live Preview** and **Source**.
- **There is no separate Reading / render-only mode** (for now).
- Consequence: render-only features that would belong to a reading mode — e.g. Mermaid diagrams,
  MathJax typesetting, PDF viewing, slide/presentation rendering — are **out of near-term scope**.
  Which specific rich elements render *inline within Live Preview* versus stay literal is settled in
  §7.2.
- **Source mode is a decoration toggle, not a second renderer.** Live Preview and Source are the
  same CodeMirror 6 instance; Source is Live Preview with all hide/replace decorations suppressed,
  so switching is instant and preserves scroll and selection.
- **Layer (per the §8 kernel/plugin split).** The **kernel** owns the raw substrate — the CodeMirror 6
  editor engine, byte-exact IO, the generic "present as text" path (which *is* Source), the decoration
  primitives, and the syntax-highlighting engine. **Live Preview itself — prettifying markup and the
  inline-render scope of §7.2 — is delivered by the first-party Markdown/Org plugin** over that
  substrate, not by the kernel. The reveal/hide rules (§7.1) and inline-render decisions (§7.2) are
  unchanged; only the layer that implements them is now named.

### 7.1 Live Preview — reveal/hide behavior
Live Preview prettifies inline markup (hiding the syntax markers and styling the rendered form) and
reveals the raw source again near the caret so it stays directly editable. The specifics:

- **Reveal granularity is configurable, default whole-line.** Two modes, selected via editor
  configuration (§9):
  - `line` (**default**) — the entire line the caret is on shows its raw markup; every other line
    stays prettified. Stable, no per-keystroke flicker, and every marker on the line being edited is
    visible at once.
  - `element` — only the single construct the caret sits inside reveals (the org-appear model).
    Hides more noise and reads cleaner, at the cost of markers popping in and out during
    character-by-character motion.
- **Selection always reveals raw markup**, in both granularity modes: any selection spanning a
  construct forces that construct's markers to show, so cut/copy yields true source. This is a
  correctness requirement of byte-for-byte round-tripping (§9), not a preference.
- **Instant by default, with an optional reveal delay.** Reveal is immediate; an optional idle-delay
  setting (default `0`, i.e. off) can debounce the reveal to reduce flicker while scanning through
  markup. This is a UX safety valve, not a behavioral default.
- **Reveal/hide is pure display and never mutates file bytes.** It is implemented entirely as
  CodeMirror 6 view decorations (`Decoration.mark`/`Decoration.replace`/widgets); the stored text is
  untouched. The sole Live-Preview affordance that *writes* is an explicit user edit — toggling a
  rendered task checkbox (§7.2) flips `[ ]`↔`[x]`, exactly the byte change the user would type.
- **Rendered constructs are atomic for caret navigation.** Arrow keys and Backspace treat a rendered
  unit (a link, an image, a checkbox) as a single glyph, so the caret cannot get stranded inside
  hidden URL/target text and a single delete removes the whole construct.
- **Markdown and Org get the same treatment.** Per §5 (live-preview authoring parity), the reveal/
  hide model applies symmetrically to both syntaxes — Org emphasis (`*bold*`, `/italic/`,
  `=verbatim=`, `~code~`, `+strike+`, `_underline_`), Org heading stars, Org link syntax
  `[[target][desc]]`, TODO keywords, and property/drawer lines are prettified and revealed on the
  same rules as their Markdown counterparts.

### 7.2 Live Preview — inline rendering scope
With no Reading mode (§7), what renders inline in Live Preview is decided per element. The governing
rule: **an element renders inline only when its authoring source stays inline and editable** — the
markup is a thin wrapper you still edit as text (typographic markup, tables, task text) or a passive
display whose *source markup* you edit (images). Anything that would need a typesetting/diagram
render engine, or is entangled with a deferred system, **stays literal** — shown as its source text
in Live Preview, consistent with "no render mode."

**Renders inline** (prettified; raw source reveals near the caret per §7.1):

- **Typographic markup** — emphasis (bold/italic/strikethrough/underline), inline code/verbatim,
  headings, lists, blockquotes, and plain inline links (`[text](url)` — display the text, hide the
  URL). This *is* Live Preview and is not itself an open question.
- **Images** (`![alt](path)`) — the image renders inline; editing targets the markup, not pixels.
- **Tables** — Markdown/Org tables render as a formatted grid. This decision covers *display only*;
  a dedicated table-editing feature is separate and not implied here, so editing falls back to the
  raw row source on the active line/element.
- **Task checkboxes** (`- [ ]` / `- [x]`) — render as toggleable checkboxes with the label text
  still editable; toggling writes the `[ ]`↔`[x]` byte change (also reachable as a keyboard
  command).

**Stays literal** (shown as source text; no inline render):

- **Math** (`$…$`, `$$…$$`, Org `\(…\)` / LaTeX fragments) — render-only typesetting, out of
  near-term scope (§7).
- **Mermaid / diagrams** — render-only, out of near-term scope (§7).
- **Embeds / transclusions** (`![[…]]`) — **literal for now.** Inline rendering is a **committed v1
  surface** (§14 roster) — the linking & index system they depend on is decided (§13); what remains is
  the *design* (recursion / depth-cap handling, the reveal model, when it supersedes the literal
  display), tracked as its own session (`TODO.md`).
- **Fenced code blocks** — shown as literal source with syntax highlighting only; never executed or
  rendered (no Babel execution §5, no render mode §7). Highlighting is styling over literal text.
- Other render-only artifacts (PDF, slides, raw HTML block rendering) — out of near-term scope (§7).

> **Note on wikilinks.** The reveal/hide *mechanism* above is ready for link-like constructs; the
> concrete rendering of `[[wikilinks]]` — including the Live-Preview decoration that surfaces a
> block link's precision (§13.5) — is specified with the linking system in §13.

---

## 8. Extensibility architecture

**A minimal kernel; everything else is a plugin.** Coal re-founds the core/plugin split around an
irreducible **kernel** — a real, usable, keyboard-first editor with **zero plugins enabled** — and
re-homes the entire feature set as bundled first-party plugins on the public API. The concrete system
(kernel boundary, capability model, extension-point taxonomy, manifest, versioning, lifecycle,
distribution) is designed in
[`docs/superpowers/specs/2026-07-22-plugin-system-design.md`](docs/superpowers/specs/2026-07-22-plugin-system-design.md);
this section records the load-bearing ratified decisions.

**The kernel boundary.** One principle draws the line: **the kernel does raw presentation +
navigation; plugins do interpretation + enrichment.** The kernel holds the CodeMirror 6 editor engine
and buffer model; byte-exact IO for any filetype (the §9 byte-for-byte guarantee, for *all* files);
filetype identification + a generic "present as text" path; the **syntax-highlighting engine** (the
per-language *grammars* are plugins); the **command registry + unified minibuffer + input-mode seam +
both full keymaps** (§6); the **workspace shell** (file-tree, quick switcher, windows-as-split,
per-window tabs, §14.1); the config loader + Settings UI + the kernel-owned config tree (§8.3, §9); the
extension substrate itself (plugin loader + capability broker + typed host API); and the **privileged
seams** (§8.2), declared but empty by default. Everything interpretive — Markdown/Org rich support and
Live Preview (§7), the linking / PKM stack (§13), Git (§10.1), encryption (§10.2), search, tags,
templates, spell-check, the full code-editor mode — is a **plugin**.

- **Central command registry.** Everything Coal can do is a *command* registered in one place;
  keybindings and the minibuffer (`M-x`) are front-ends onto it, not parallel implementations.
- **Core-as-plugins, made literal.** The kernel registers its *own* behavior through the **same public
  registry / API** third-party plugins use, under the same broker (with first-party grants). It is not
  split into separately-installable packages, but at runtime it goes through the identical seam — which
  proves the API is complete by construction: since Git, encryption, and the whole PKM stack must be
  built on the public API like everyone else, the API cannot quietly have gaps its own flagship
  features fall through.
- **First-class plugin *and* theme systems**, from the start — neither deferred. Themes install
  through the same path as plugins (§8.1).
- **Official (first-party) plugins, bundled but off by default.** Every official plugin ships *inside*
  the app package (offline-safe; no fetch) but is **dormant until enabled** — enabling one activates
  and wires it up. The **default** experience is the minimal editor; **fully-outfitted Coal** = kernel
  + the official plugin suite enabled. No feature is lost relative to the prior design — what changes is
  the *layer* that implements it, the *delivery* (opt-in), and the *trust anchor* for dangerous powers
  (core-membership → first-party bundling). The registry of official plugins is
  [`PLUGINS.md`](PLUGINS.md); the earlier "which features are core vs official plugin" split is
  **largely resolved** by this pivot — almost everything is a plugin over the minimal kernel.
- **Passive providers auto-activate.** "Off by default" governs *feature* plugins the user opts into.
  First-party, side-effect-free **passive providers** — notably syntax **grammars** — auto-load on
  demand by filetype (you never "enable Rust highlighting"; it just works when you open Rust).
  Third-party grammars never auto-activate.

### 8.1 Theming mechanism
- **Themes are expressed as CSS custom properties (CSS variables).** The shell is web technology
  (§3–4), so the styling substrate is CSS; a theme is a set of variable definitions the whole UI
  reads from, not a fork of component styles. This is what lets the kernel and third-party themes
  share one styling surface, consistent with "core-as-plugins."
- **Theme-package format:** a theme is a directory (installable through the plugin path) containing
  a **manifest** (name, author, version, and whether it targets light, dark, or both) plus one or
  more **stylesheets that set the theme variables**. No executable code is required to define a
  theme.
- **Light/dark:** because Coal follows the system light/dark preference (§3), the variable set is
  defined for both schemes; a theme may supply values for one or both.
- **Default theme — "Sublime".** Coal ships with a bundled default theme named **Sublime**: a dark
  scheme built on near-black ("dark black") backgrounds with **sublime-green** accents. It is a
  normal theme delivered through the theme path above — no privileged status beyond being the
  shipped default. Its concrete variable values are produced with the pre-build visual design
  (`TODO.md`).
- _(The concrete variable catalogue — the exact names and what each controls — is a build-time
  detail that lands with the first themable surfaces, not a spec-level decision.)_

### 8.2 Plugin API, capabilities & trust
- **Language.** Plugins are authored in **TypeScript / JavaScript** against the **same typed API the
  kernel is written against** (§4, §8). There is no separate embedded plugin language; core-as-plugins
  means one API surface and one language, not a privileged native core with a lesser scripting layer
  bolted on.
- **Baseline vs capability.** Being a plugin freely grants **baseline** abilities — register commands,
  keybindings, views, status-bar items, settings, hook subscriptions — none of which touch user data or
  the system. A **capability** is only a *reach* into user data, the system, or another plugin's
  domain. Contribution = baseline; the data/system reach behind it = capability. This keeps the consent
  bill short and meaningful.
**Normal capabilities** — declarable, scoped least-privilege, broker-enforced, and (for third-party)
granted by informed per-plugin consent; broadening a scope is a separate, visible declaration:

| Capability | Gates | Default scope |
| --- | --- | --- |
| `document` | Read/write buffer content, selection | `read`; active-doc only (vault-wide = explicit) |
| `vault` | Read/write files in the vault | vault root (broader FS = explicit `fs-external`) |
| `network` | Outbound connections | declared host allowlist |
| `process` | Spawn subprocesses | declared executable allowlist |
| `clipboard` | Read/write clipboard | — |

**Privileged class — first-party only, never third-party even with consent.** These seams are
*systemically* dangerous (they subvert guarantees for *all* data and *other* plugins, so consent cannot
make them safe), so they are reserved to first-party-audited code and simply not offered to third-party:

| Seam | Why it is systemic |
| --- | --- |
| `storage-codec` | Governs how *every* file is physically written; can defeat encryption |
| `startup-gate` / `unlock` | Decides whether the app opens at all |
| `key-custody` | Holds the keys protecting everything |

There is deliberately **no** `ambient` / raw-Node capability: concrete brokered caps cover every real
need, so nothing bypasses the broker. The anchoring distinction — a *normal* cap harms only the
consenting user (their data, their informed choice), a *privileged* cap subverts guarantees for
everyone — is what splits "consent is meaningful" from "reserved to first-party." Encryption fills
exactly this class, which is why it is a **first-party plugin** and never third-party (§10.2; the
privileged startup/storage seam is detailed in the design doc §11).

- **Two tiers, one gate.** **First-party (bundled) is fully trusted** — all capabilities including the
  privileged class, granted by default, no per-plugin consent, passive providers auto-activate; it is
  the *only* tier eligible for the privileged class (this is what makes the encryption plugin
  tractable). **Third-party is blocked by default** (Obsidian-style Restricted Mode): enabling
  third-party at all is one explicit, well-warned global gate, and there is **no first-party registry**
  — third-party plugins live in open-source git repos (§8.3).
- **Isolation — a curated realm.** Even with third-party enabled, untrusted code runs in a realm with
  **zero ambient authority**: it cannot reach `fs`, `process`, `network`, or Node/Electron internals
  except through the brokered API, and only for a capability it **declared** and was **granted**. A
  plugin that declares nothing dangerous genuinely *cannot* do anything dangerous. Trusted first-party
  code is not realm-boxed (it is audited instead). This preserves "the typed API is the sole channel"
  as a structural property while staying in-process — an honest boundary, not a containment claim.
- **Consent (third-party normal caps).** With the global gate on, installing a specific plugin shows
  its declared, scoped caps and asks a single informed yes/no for *that* plugin (no per-cap toggles).
  Grants drop when a plugin is disabled; the manifest is inspectable in Settings anytime.
- **First-party trust is structural — no per-plugin crypto in v1.** First-party = the set baked into
  the app bundle (covered by the app's own RPM/Flatpak signature); third-party = anything installed
  from a git URL (by construction not in the bundle). First-party updates ride app releases, so the
  privileged plugins need no out-of-band channel. Per-plugin cryptographic signing is a **reserved
  future extension point**, designed only if first-party ever distributes out-of-band or a community
  registry appears.
- **Honest boundary.** A *granted* capability is genuine access: a plugin granted `document` really does
  see decrypted note text in memory. The controls are **least-privilege declaration + the realm +
  informed consent + drop-on-disable** — not a claim that granted code is fully contained. The value of
  the model is that the *default* is **no ambient authority** and every sensitive reach is **declared
  and consented**, without the ecosystem friction of a hard RPC/interpreter sandbox. The API surface is
  **identical** across tiers; what differs is **which capabilities are granted**, not the API itself.

### 8.3 Plugin management, enablement & config surface
The whole `<vault>/.coal/config/` tree is **kernel-owned; no plugin can write it** — structural
privilege separation, so a plugin cannot enable itself or edit the config layer. It sits alongside the
Overlay / index / cache trees under `.coal/` (§13.8). This tree is the **vault/project** config scope;
**user-preference** kernel settings (keymap choice, editor-engine basics, theme) live in the separate
**user/global** scope (`$XDG_CONFIG_HOME/coal`, §9), so the kernel is fully configurable with no vault
open. Both scopes are kernel-owned.

```
<vault>/.coal/
  config/                      # kernel-owned; no plugin can write here
    settings.toml              # vault-scoped kernel options + per-vault overrides (user prefs live in the global scope, §9)
    plugins.toml               # enablement roster — bundled + third-party
    plugins/
      coal.git.toml            # first-party plugin settings
      me.alice.fancylinks.toml # third-party plugin settings — same rule
  plugins/                     # plugin-owned data
    me.alice.fancylinks/       # third-party installed code + its index/cache
```

- **`settings.toml`** (vault scope) holds **vault-scoped kernel options and per-vault overrides** — a
  small set. **User-preference kernel settings** — keymap choice, editor-engine basics, theme — live in
  the **user/global** `settings.toml` (`$XDG_CONFIG_HOME/coal`, §9) and travel with the user, not the
  repo, so the editor is fully configurable with no vault open. (Most "settings" are really plugin
  settings anyway; Live Preview itself is a plugin.)
- **`plugins.toml`** is the **enablement roster** for all plugins, kernel-owned so a plugin can't
  enable itself or a peer. First-party entries carry `enabled` (absent = default off); third-party
  entries also carry `source` (git URL), a pinned `version`, and `consented` (the §8.2 per-plugin
  consent record). This supersedes the earlier single `.coal/config/PLUGINS.<ext>` file.
- **`plugins/<id>.toml`** holds **per-plugin settings, uniform for first-party and third-party** —
  isolated per plugin (no shared-file muddying), but inside the kernel-owned tree.
- **Plugin data** (index/cache; third-party installed code) lives under `plugins/<id>/`, separated
  from config by owner.
- **Two front-ends onto text, no shadow store (§9).** Settings are **manifest-schema-declared and
  kernel-round-tripped**: the Settings GUI renders from the schema and reads/writes the text file with
  no separate authoritative store; plugins read reactively and writes go through the settings API.
  Per-plugin *location*, not author-freeform *format*. Enablement is explicit state, not presence — a
  plugin can be installed-but-disabled — and enabling a third-party plugin still routes through the
  §8.2 consent flow.
- **Third-party distribution is git-based.** With the global gate on, install clones a user-given git
  URL, reads `plugin.toml`, shows the declared scoped caps, takes per-plugin consent, pins a concrete
  ref, and records it — so a fresh machine reconstructs the setup by re-cloning each pin. Plugins ship
  **pre-built JS** (Coal never runs a build step); updates are **manual, never automatic**. The full
  install / update / uninstall flow is in the design doc §13.

---

## 9. Configuration model
- **Everything is operated from plain-text, version-controllable files** — editor configuration,
  keybindings, and theme definitions included, not just notes.
- **The GUI is a front-end, not a store.** Settings panes and menus **read and write text files
  only**. There is no separate authoritative settings database the text merely mirrors.
- **Goals:** declarative configuration, reproducibility, and hassle-free transfer of a full editor
  setup from machine to machine (drop the files in, done).
- **Two config scopes, by ownership (§8.3).** Configuration is scoped by *who owns a setting*, not by
  where a tree sits. **User/global scope** — user-preference kernel settings (keymap choice,
  editor-engine basics, theme) — lives per-user (`$XDG_CONFIG_HOME/coal` on Linux) and travels with the
  **user**; it is available with no vault open (the kernel is a usable editor with zero plugins, §8).
  **Vault/project scope** — vault-scoped config (plugin enablement, encryption, per-vault overrides) —
  lives in `<vault>/.coal/config/` and travels with the **repo**. Both stay plain-text and
  version-controllable; the "transfer machine-to-machine" goal above applies **per scope** (user prefs
  travel with the user's config, e.g. dotfiles; vault config travels with the vault). The vault is a
  PKM concept the plugins introduce; the kernel needs none. Design:
  [`config-loader`](docs/superpowers/specs/2026-07-23-config-loader-design.md) §2.
- **Standard config format: TOML — but not mandatory.** TOML is the default, human-authored format
  for editor configuration, keybindings, and theme manifests. It is chosen because it round-trips
  cleanly through a GUI settings pane (the §9 rule that the GUI reads/writes text with no shadow
  store rules out an *evaluated* config language), it is low-ambiguity and declarative, and it
  avoids YAML's whitespace and implicit-typing sharp edges. **A single format is a default, not a
  requirement:** where another format is genuinely better suited for the job (e.g. JSON for
  machine-generated or interchange data), Coal uses it deliberately rather than forcing everything
  into TOML. The invariant is §9 itself — whatever the format, it stays plain-text and
  version-controllable — not any one file type.

---

## 10. Sync, version control & privacy

### 10.1 Git version control
- Git is a **first-class** part of Coal, not an optional integration. It provides **free off-site
  sync** (a deliberate advantage over paid-sync models) and complete, browsable **history**.
- **Delivered as a bundled first-party plugin** (§8) over the kernel, using **normal** capabilities
  (`process = ["git"]`, `vault = "readwrite"`) — no privileged seam. First-party and enabled in
  fully-outfitted Coal; the value and behavior above are unchanged, only the layer is named.

### 10.2 Encryption at rest
- **A first-class, built-in, *opt-in* feature — off by default.** When a vault has encryption
  enabled, notes / user content are stored as ciphertext, so neither the remote host nor a
  lost/stolen device exposes the content; a private repo alone is not relied on. It is **not** a
  universal requirement: **plaintext vaults are equally first-class**, so a developer can push
  readable files to a shared or company repo, and users who don't want the overhead simply leave it
  off. *(This is a deliberate softening of the earlier "encrypted-at-rest as a hard requirement";
  see the §2 principle-#3 amendment.)*
- **Enabled per vault**, chosen at vault creation and toggleable afterward; the choice is
  declarative, living with the rest of the vault's configuration (§8.3 / §9).
- **A first-party plugin filling the privileged seams — the kernel never learns crypto.** Encryption
  needs the most privileged powers in the app — control of the on-disk representation, key custody, and
  startup gating — which are exactly the **privileged class** reserved to first-party code (§8.2). It is
  therefore a **bundled first-party plugin** that registers the `storage-codec`, `startup-gate`, and
  `key-custody` seams: every kernel file read/write flows through the codec's `decode()`/`encode()` (no
  codec = plaintext passthrough = the default editor), and the startup-gate blocks boot until the vault
  is unlocked. The **kernel has no native "locked" concept** and knows nothing of `age` or keys — it
  supplies a boot barrier and an IO indirection point; the encryption plugin supplies the crypto. This
  is the acid test of core-as-plugins (the boot sequence is in the design doc §11), and it *supersedes*
  the prior "encryption stays **core**, not a plugin" decision: encryption is now a plugin, delivered
  over a seam that exists precisely because building it forced the seam into being.
- **Transparent when on.** The authoring format stays plain `.md` / `.org`; inside Coal (unlocked)
  the user sees and edits plain text. Coal decrypts for use and **re-locks when the app is closed**.
- **Scope:** user notes/content. Configuration (§9) stays plaintext-versioned so it remains
  shareable and declarative, whether or not a vault is encrypted.
- **Mechanism (when enabled):** specified in §10.3 — `age`/`typage`, app-managed decrypt-to-memory
  (ciphertext at rest *and* on the remote from one scheme), single passphrase-wrapped vault key; the
  forgotten-passphrase backstop is §10.4.

### 10.3 Encryption mechanism
The concrete scheme realizing §10.2 **for a vault that has encryption enabled** (an opt-in, per-vault
choice, §10.2). **One mechanism covers both surfaces** — the off-site/remote
copy and the local disk are ciphertext by the same means — so "encrypted before it leaves the
machine" and "encrypted at rest on the device" are one system, not two. Grounded (priors only, §0) by
the primary-source survey in [`reference/19`](reference/19-encryption-in-git.md).

**Primitive & format — `age`, in-process.** Encryption uses the **`age` format** (ChaCha20-Poly1305
AEAD; X25519 recipients; scrypt passphrase stanza) via **`typage`** (the `age-encryption` npm package,
a pure-TypeScript implementation on vetted primitives), so Coal encrypts and decrypts **in-process**
with no external binary or per-platform native dependency, consistent with the §4 stack. Because every
file is a standard `age` file, it is decryptable by any `age` client (CLI included), never only by
Coal — the portability floor below.

**Approach — app-managed decrypt-to-memory.** A note's on-disk representation is a **ciphertext `age`
file at all times** (logical `note.md` ⇄ on-disk `note.md.age`, or equivalent). Coal decrypts a note
**into memory** when it is opened, holds the plaintext only in the editor buffer, and **re-encrypts on
save**; no plaintext note bytes are ever written to disk. Git therefore versions **opaque ciphertext
files directly** — there is **no clean/smudge filter and no encrypt-on-commit step**, because the
files are already ciphertext at rest; encryption is a *storage-format* concern, not a git-integration
one. Re-encryption happens **only on an actual content change** (Coal drives saves and already holds
the §13.15 `baseline.hash` as the change signal), so an unchanged note yields no new ciphertext and no
git churn. Encryption is **randomized** (fresh `age` file key per encryption) — **no equality leak**
between files.

**Key model — a single vault key, password-manager hierarchy.** A vault owns one **X25519 identity**.
Every note's random per-file key (age-native) is wrapped to that vault recipient; the vault's
**private key is itself wrapped by a passphrase-derived KEK** (an `age` scrypt-passphrase stanza with
a clamped minimum work factor, keeping the wrapped identity a standard, CLI-recoverable `age` file)
and stored in the repo. This reproduces the Bitwarden-style hierarchy
`passphrase → KDF → KEK → vault identity → per-note keys → note`, and the passphrase and KEK are
**never stored**. Consequences: **onboarding a second device = clone + enter passphrase** (unwrap the
identity, decrypt everything) with no cross-device approval step; **passphrase rotation re-wraps one
small key**, not every note. Per-device revocation is **out of scope** (deliberately — §10.2 is about
confidentiality, not a device-management fabric).

**Unlock, caching & the lock lifecycle — modeled on password managers.** *Unlock* = enter the
passphrase → derive the KEK → unwrap the vault identity, held **in the main process only** (never the
renderer, so the §8.2 capability broker stays the sole path to decrypted content). Decrypted note
buffers and the plaintext-derived Tier-2 index (§13.15) live in memory (or an encrypted, purge-on-lock
cache) — never plaintext on disk. **Lock ≠ logout:** *lock* drops the in-memory key and decrypted
state (the wrapped identity stays, so re-unlock is offline); *logout* additionally forgets the
identity. A **vault timeout** auto-locks on inactivity, and **re-locking on close returns the disk to
all-ciphertext** — the strong form of §10.2's "re-locks when the app is closed," now protecting real
local data. For passwordless re-unlock, Coal may cache a second wrapped copy of the identity in the
**GNOME Secret Service** (libsecret), gated by a *require-passphrase-on-restart* option — the
OS-secure-storage pattern password managers use for biometric/PIN unlock.

**Git diff & merge over ciphertext.** Because Git sees ciphertext, Coal supplies: a **`textconv`**
filter that decrypts for the key-holder so `git diff` shows readable plaintext (its transient
plaintext is an ephemeral, purge-on-lock surface), and a **merge driver** that decrypts
BASE/LOCAL/REMOTE, runs the ordinary 3-way text merge, and re-encrypts the result (the transcrypt
driver is the reference *design*, not a dependency), falling back to in-app conflict resolution. The
target is **single-user multi-device sync**, where Coal drives commit/push/pull and true conflicts are
rare.

**Scope — what is and isn't encrypted.** Encrypted at rest and on the remote: **note content** *and*
the committed **Overlay** (`.coal/overlay/**`) — its `href`, `normHash`, `simhash`, and `neighbors`
are content-derived and would otherwise leak structure, so bringing it inside the boundary **closes**
the residual leak §13.15 had named. **Not encrypted:** configuration (§9), which stays
plaintext-versioned and shareable; and, inherently, **metadata** — filenames, folder structure, file
sizes, and commit history/timestamps are visible to the remote (`age` encrypts contents, not names).
That metadata exposure is **accepted, not solved** (§10.2 protects content; a privacy-maximalist
further reduces it with a private or self-hosted remote), and stated plainly per the honest-boundary
posture below. The Tier-2 index/cache is plaintext-derived and therefore memory-resident or encrypted,
**purged on lock** (§13.15).

**Portability — never trapped (amends §13.1).** Ciphertext at rest means the working folder is no
longer plain Markdown any editor opens; portability is instead an explicit, first-class guarantee with
three independent exits: (1) the files are **standard `age`** — `age -d` + your key yields Markdown
with no Coal at all; (2) **Export → plaintext** dumps the whole vault as clean `.md`/`.org` for another
editor (a deliberate, *warned* action to a chosen destination, since it writes plaintext to disk); (3)
**Export → Coal bundle** produces an encrypted, lossless copy (including the Overlay). The mirror
**Import ← plaintext** (encrypt-on-ingest, e.g. an existing Markdown/Obsidian vault) and
**Import ← Coal bundle** complete the set. Editing *inside* Coal stays plain text (in memory). A
plaintext export carries notes and portable links but not the Coal-only block-precise Overlay — already
§13.1's stance.

**Honest boundary.** Borrowing reference/18 §7's discipline: Coal publishes its exact parameters and an
explicit "what is *not* protected" list (the metadata above), and is candid that while unlocked the
vault key and decrypted note text are in process memory — so **"lock" is a purge, not a defense against
a live-memory or root-level attacker**, and the Secret-Service cache trades some of that protection
(the key's safety becomes the login session's safety) for convenience. Encryption is Coal's default
operating mode, not an ideological, un-disableable fortress.

_(The **recovery-key backstop** is settled in §10.4. Remaining detail-level items — exact wrap-KDF
parameters, the caching default posture, the on-disk naming scheme's interaction with §13.13 sidecar
mirroring, the concrete merge-driver/textconv spec, and fully reconciling §13.15's Overlay-merge
defenses with an encrypted Overlay — are tracked in `TODO.md`.)_

### 10.4 Recovery key
The §10.3 key model makes the passphrase the **sole** gate on the vault identity, and §10.2 puts real
local data behind it — so a forgotten passphrase is otherwise **permanent, total loss of every note.**
Coal's backstop is a **recovery key**, generated **by default when a vault enables encryption** (at
creation, or when turning it on later) but a **default, not a requirement** (the §9 house rule) — the
opt-out is real and mandatory (below). No escrow, no server; the §10.3 zero-knowledge posture is
preserved.

**Mechanism — a second `age` stanza.** `age` is natively multi-recipient, so the wrapped
vault-identity file carries a **second unwrapping stanza** beside the scrypt-passphrase one: a random
**X25519 recovery recipient** wrapping the *same* vault key. **Either** the passphrase **or** the
recovery identity unwraps the vault. Coal stores only the recovery **public recipient** (already inside
that committed file); it **never stores the recovery secret** — not in the repo, and **deliberately not
in the GNOME Secret Service** (§10.3), since caching it would bind recovery to one device and defeat
its purpose: recovery must work from a **fresh clone with only the repo plus the user's kit**. The
recovery key is a **standard `age` identity**, so `age -d -i recovery.txt <wrapped-identity>.age`
recovers the vault with Coal entirely absent — the same portability floor as §10.3. No bespoke crypto.

**Emergency Kit & creation.** On generation Coal presents a **one-time Emergency Kit**: the recovery
key (`AGE-SECRET-KEY-1…`), the vault name/id, the exact CLI recovery command, and a plain warning that
*anyone holding this key can decrypt the vault without the passphrase — store it offline.* Flow: mint →
**Print / Download / Copy** → confirm *"I've saved it"* → continue. The gate is **soft** (an informed
confirmation, not an un-skippable wall), consistent with the opt-out.

**Recovery, rotation, removal.** *Recover:* the unlock screen offers *"Forgot passphrase? Use recovery
key"* → paste the identity → Coal unwraps the vault and **forces a new passphrase** (re-wrapping the
scrypt stanza with a fresh KEK), then **offers** (does not force) minting a fresh recovery key, since
the old one may be the reason for recovery. *Rotate / remove:* each is one small re-wrap of the
identity file (per §10.3's "rotation re-wraps one small key") — rotate swaps the recovery stanza,
remove drops it entirely.

**Opt-out — real and reversible.** The opt-out lives in **two** places: at creation, a clear
*"Skip — no recovery key"* path (behind one informed "no way back from a forgotten passphrase"
confirmation); and **forever after**, full removability in Settings → Security — a user who dislikes
recovery keys returns to single-secret, and a user who skipped can add one later. Nobody is stuck with
one; nobody who wants one is locked out of adding it.

**Honest boundary.** A recovery key is a **second full-power credential**: it trades the
catastrophic-loss risk for a wider key-exposure surface (two secrets can each unlock everything). That
trade is exactly why it is **default-on-but-removable** rather than mandatory, and it is stated plainly
per §10.3's honest-boundary posture.

**v1 scope.** Exactly **one** age-identity recovery key. `age`'s native **N-recipients** (multiple
kits — printed, password-manager, a trusted third party) and typage's **FIDO2/WebAuthn** recipient
(recover by touching a hardware key) are supported **extension points**, not v1.

---

## 11. License
- **Coal is open source under the Apache License 2.0.**
- **Why Apache-2.0:** it is permissive — which keeps the plugin/theme ecosystem and contribution
  frictionless — and fully compatible with the entire intended dependency stack (all MIT / ISC /
  Apache-2.0 / MPL-2.0, no copyleft; see `reference/16`). Over a bare MIT license it adds an
  explicit patent grant and defensive-termination clause, the more compliance-robust permissive
  default for an application taking outside contributions.
- **Files:** `LICENSE` (verbatim Apache-2.0 text) and `NOTICE` (project copyright). Per-dependency
  attribution becomes a build-time task once real dependencies exist (tracked in `TODO.md`).

---

## 12. Documentation model
- Documentation is **first-class and written as-we-go**: a feature is not "done" without its docs.
- Documentation is **split by audience** so neither reader wades through the other's material:
  - `docs/user/` — how to *use* Coal to edit files. Assumes no interest in internals.
  - `docs/dev/` — architecture, internals, and how to *extend* Coal (plugins, themes,
    contributing).
- Each feature ships a user-facing doc, a developer-facing doc, or both, as appropriate.

---

## 13. Linking, identity & the Overlay
Coal's linking and index system. The design is
**stand-off identity**: the note file is inviolable plain text, and all the identity that powers
links, backlinks, and block addressing lives in a Coal-maintained layer *above* the notes, pointing
in — never injected into them.

**Layer (per the §8 kernel/plugin split).** This entire system — the Overlay, the node registry, the
diff-ratchet, the Reconciliation Engine, backlinks, and the linking UI — is delivered by the
first-party **linking plugin** (seeded by the existing `src/overlay/`, which becomes the plugin's core,
not more kernel), built on the public API over the kernel's substrate: the document/buffer model,
byte-exact IO, and the storage-codec seam its sidecars ride (so an encrypted vault encrypts the Overlay
too, §10.3). The stand-off-identity design in §13.1–§13.15 is **unchanged** — it survives the pivot
verbatim; only the layer that owns it is now named. (Where the committed Overlay tree §13.8 sits
relative to the kernel-owned `.coal/config/` and plugin-data `.coal/plugins/<id>/` trees of §8.3 is a
detail for the linking plugin's own build; `.coal/overlay/**` stays its committed path here.)

### 13.1 Founding stance

- **Notes are 100% the user's bytes.** Every note is pure, standard Markdown or Org. Coal writes
  **zero identity** into note files — no injected block markers, no frontmatter `id:`, no per-block
  `^id:<uuid>`. This abolishes both Obsidian's `^blockid` mechanism and Coal's prior UUID-injection
  model.
- **Links belong in the note; identity anchors never do.** The one Coal-related thing that lives in
  a note is a *link the user authored* — a wikilink, Markdown link, or Org link. Those are portable
  content. The line is exact: **references (source-side) live in the file; identity anchors
  (target-side) live in the Overlay.**
- **Files are portable; the deep graph is Coal-only, by design.** In an **unencrypted** vault (the
  default, §10.2) the on-disk folder is plain `.md`/`.org` any editor opens directly. When a vault
  has **encryption enabled**, the on-disk folder is instead ciphertext — **not** plain Markdown any
  editor opens — so portability is an explicit guarantee: the files are standard **`age`**
  (decryptable by any `age` client + your key), and Coal offers one-command **Export → plaintext**
  `.md`/`.org` plus a lossless encrypted **Coal bundle** (with mirror imports). Decrypted, the content
  is clean Markdown/Org whose human-readable links resolve however another editor chooses. Coal's
  *block-precise* graph is an enrichment layer only Coal sees. Portability of the content and of link
  *meaning* is total (via decrypt/export); portability of block-precise *navigation* is deliberately
  Coal-only.

### 13.2 The three-tier model

Stand-off identity upgrades Coal's data model from two tiers (notes + a disposable index) to
**three**:

- **Tier 0 — Notes.** Authoritative *content*. Pure Markdown/Org, never altered by Coal, fully
  portable.
- **Tier 1 — The Overlay.** Authoritative *identity & intent* — stable node ids, block anchors, and
  which block a given link means. Plain-text, human-readable, and **committed to Git alongside the
  notes.** It is **not disposable.**
- **Tier 2 — The derived index.** Backlinks, search structures, the resolved graph. Disposable,
  Git-ignored, and fully **regenerable from Tiers 0 + 1**.

Consequence, stated plainly: the "delete the index and rebuild from the notes alone" litmus
**weakens by design** to "delete Tier 2 and rebuild from Tier 0 + Tier 1." The Overlay carries
*intent* that raw prose cannot regenerate, so it is a first-class, versioned artifact — not a cache.

**Committed-everything principle.** Notes, the Overlay, and configuration (§9) are **all**
version-controlled and portable, always. A user's notes, the identity that links them, and the
editor setup they invested in all travel together.

### 13.3 Uniform addressing — the node registry

The Overlay's spine is a registry in which **every addressable thing is a node of one uniform
shape**: a **note**, a **heading**, a **block**, or a **link**. A note, a heading, and a block are
simply nodes at three granularities (whole file / section / single block); a link is a node too, so
its position is maintained like any other. One resolver, no special-casing — this is the "refer to
notes, headings, and blocks within one system" requirement.

Each node record carries three groups of fields:

- **Identity** — an opaque **stable id** (minted once), a **kind** (`note | heading | block |
  link`), and a **parent** id (building the note ▸ heading ▸ block tree).
- **Anchor** (locate in *current* bytes) — a character **range** and a **structural path** (e.g.
  `note ▸ heading[2] ▸ block[3]`).
- **Durability** (survive edits) — a **normHash** (hash of the normalized text), an optional
  **simhash** (for the fuzzy/ambiguous cases), bounded **neighbor** fingerprints, a **kindTag**
  (paragraph / list-item / table / code), and a **status** (`resolved | dangling | ambiguous`).

**Tier boundary within a node record (fixed in §13.13).** Identity (id / kind / parent), the reference
*intent* (a link's target), and the durability *fingerprints* (normHash / simhash / neighbors /
kindTag) are committed Tier-1; the character **range**, the structural **path**, and the resolved
**status** are Tier-2 derived — recomputed from bytes each session — so volatile positions never churn
the committed Overlay.

**Opaque ids are acceptable here** precisely because they live in the Overlay and never in a note.
The property that made `[[uuid]]` intolerable — an opaque token *in the file* — does not apply to a
token no other editor ever sees.

**Sidecar ownership rule.** A sidecar owns exactly the nodes **physically written in its own note.**
Note B's blocks live in B's sidecar; note A's links live in A's sidecar. A cross-note reference is a
pointer from A's sidecar to a node id in B's sidecar. The rule follows from the diff-ratchet
(§13.6): a node must be tracked against the bytes it lives in, because those are the edits it has to
survive.

### 13.4 Registration policy — lazy

- **Notes** are registered with durable identity (the graph, backlinks, and rename-stability need
  it).
- **Headings** resolve by their own heading text, portably; they need no persistent anchor.
- **Blocks are registered lazily** — a block gains a persistent anchor and diff-ratchet tracking
  **only when it first becomes a link target.** Coal can always *live-parse* any file to see all of
  its blocks on demand (full knowledge is always available); what is deferred is durable *tracking*,
  which is only worth paying for a block something actually points at. Nothing structural (notably
  the graph) depends on blocks.
- A block has **one canonical node**; its id is **reused** across every referrer. A housekeeping pass
  may garbage-collect a block node once nothing references it.

### 13.5 Link forms & resolution

- **Notes and headings** are addressed by ordinary, portable links that resolve from text already in
  the target file — `[[Design Notes]]`, `[[Design Notes#Resolution]]`, or their Markdown/Org
  equivalents. Nothing is stored in the target.
- **Blocks (the "Option 1" rule).** The link *written in the note* is the portable heading-level link
  (`[[Note#Heading]]`); the **block precision is an Overlay refinement recorded in the *source*
  note's sidecar**, pointing at the target block's stable id. In another editor the link drops the
  reader at the heading; in Coal it resolves to the exact block. Coal decorates the link in Live
  Preview to surface the block precision the bytes don't encode.
- **References store stable ids** (target note id + block id), never a path or a raw position — so a
  reference is immune to *both* renaming the target note *and* relocating the block within it.
- **Same block, many referrers.** A block has one canonical node in its home sidecar; each referring
  note carries its *own* reference record (in its own sidecar) pointing at that one id. Same target,
  distinct references — adding a referrer touches only the referrer's sidecar, never the target's.

### 13.6 Durability — the diff-ratchet

Identity is **maintained, not guessed.** Coal always retains a last-known-good baseline of each
tracked file (its whole-file hash committed in the Overlay, its bytes kept in a git-ignored cache and,
when cold, recovered from Git or re-derived — "commit the hash, cache the bytes," §13.15). Re-anchoring
is therefore always a **diff** (last-known → current), never a search from nothing.

- **Edits made inside Coal** — anchors are updated transactionally as the user types. O(1)-certain;
  distance to cover is zero.
- **Edits made outside Coal** — when a changed file returns, Coal walks its anchors forward from the
  last-known baseline. Because the baseline is continuously refreshed, each step is a small delta;
  the anchor follows the block one short hop at a time (the "ratchet"), never one impossible leap
  across the whole history. This also means fingerprint **drift never accumulates**, dissolving the
  "ship-of-Theseus" decay problem of static fingerprints.
- **Outcomes:** a **relocated** block is followed silently; an **altered** block is followed with its
  fingerprint refreshed; a **removed** block goes **dangling**.

**Honesty guarantee.** The only cases the ratchet cannot resolve to a certainty — a deleted block, a
verbatim duplicate in the same scope, or a single foreign leap so large that "same block, edited"
vs. "replaced block" is a genuine judgment call — are exactly the cases a *human* could not resolve
either. These are **surfaced** (amber, one-keystroke confirm), never silently mis-pointed. This is a
stronger correctness contract than any injected-marker scheme, which breaks silently.

### 13.7 The Reconciliation Engine

The executor that keeps the Overlay true to the bytes. It is **first-class core infrastructure**,
specified from the start — the Overlay's maintenance plan is inert without it.

**Triggers:**

| Trigger | Fires when | Why |
|---|---|---|
| Open | a note is opened | it may have changed since last seen |
| In-Coal edit | the user types | transactional anchor maintenance |
| Save | the buffer flushes | refresh that file's baseline |
| Import | a path is brought under management | register notes, parse structure, set baselines |
| Filesystem watcher | a managed file changes while Coal runs | catch out-of-Coal edits promptly (debounced) |
| Startup reconcile | a vault is opened | catch changes made while Coal was not running |
| Post-Git | after pull / merge / checkout | targeted rescan of the files Git reports changed |

**Mechanism.** A cheap **dirty-check** first (mtime + size pre-filter, then a content hash compared
to `lastKnownBlob`; **unchanged files are skipped entirely**, which keeps even a full startup pass
cheap), then, for changed files only, the **diff-ratchet running off the main thread** — it must
never resolve synchronously in the edit loop (the synchronous path is the suspected cause of the
prior freeze/data-loss failure mode). Work is always **incremental and per-file.**

**Foreign renames.** Since a note carries no id, a rename outside Coal appears as *"an unknown file
appeared and a known note vanished."* Coal pairs the orphaned sidecar to the unknown file **by
content**: an exact match against the sidecar's `lastKnownBlob` is a confident re-pair (update the
path, move the sidecar to mirror it); a renamed-and-edited file is reconciled by the ratchet +
fingerprint; genuine ambiguity is surfaced for confirmation. When the rename was committed, Git's
own rename detection (`-M`) is used as the high-confidence signal. **Coal-initiated renames** move
the note and its sidecar atomically and never hit this path.

**Deletions** with no content match anywhere mark the note's tracked nodes **dangling**; inbound
links surface in the panels (§13.9).

### 13.8 Storage layout

- **Mirrored, per-file sidecars.** Each note has a sidecar under `.coal/` mirroring the note tree —
  `notes/design.md` → `.coal/overlay/notes/design.md.json` — in **JSON** (machine-maintained data;
  §9 explicitly permits the best-suited format per job).
- **Lazy sidecar creation.** A note gets a sidecar only once it carries durable Overlay state, so
  file-count tracks real usage rather than doubling outright.
- **Why per-file.** It is the only layout that gets **churn locality** (a save rewrites one small
  sidecar), **merge locality** (editing different notes on two devices never conflicts — the
  multi-device sync case of §10), **and** note-folder purity (all Coal data quarantined under
  `.coal/`). Rejected alternatives: a **monolithic** store (whole-file rewrites and merge conflicts
  on nearly every concurrent edit), **sharded** buckets (cross-note conflicts within a shard), and
  **co-located** sidecars (pollute the note folders, breaking portability).
- **Costs & mitigations.** File-count growth is bounded by lazy creation and tolerated by Git;
  foreign-rename sidecar pairing is handled by content/id matching and Git `-M` (§13.7).

### 13.9 UI surfaces

- **Dangling-links panel** (right side panel). **Current-note scope**, so it stays quiet and
  relevant; **conditional** (present only when the current note has unresolved links); **two
  groups** — *Broken* (dangling) and *Needs attention* (ambiguous). Each entry shows the source, the
  link text, the **last-known target** (the baseline lets Coal show what the link *was*), and a
  jump-to. It is a pure reactive subscriber to Overlay `status`.
- **Vault-wide housekeeping.** Corpus-wide unresolved-link management lives in a deliberate
  settings/housekeeping surface — entered on purpose when the user is tidying, rather than cluttering
  the working view — with **keyboard-first `M-x` command twins** (e.g. list / jump-to-next dangling)
  per §6.
- **The Links panel** shows the current note's connections in both directions: **outgoing** ("Links
  to" — a read of the note's own sidecar forward references) and **incoming** ("Linked from" — the
  backlinks projection: invert every sidecar's forward references, split into **Linked** and **Unlinked
  mentions**, the latter matched on note title/alias text since ids are never user-visible). Panel
  detail — including the internal-link **hover preview** — is specified in §13.14.

### 13.10 Relationship to the data model
The data model is settled: a note is a **document with addressable sub-blocks**, **not an outliner**.
Blocks are addressable units *within* document notes, one canonical node per block, and nothing
structural depends on the block layer.

- **No outliner data model in the kernel.** Neither the kernel nor the linking plugin carries an
  outliner/block *manipulation* model; the document-with-sub-blocks model above is the whole of it.
- **Outliner is a separate official plugin.** A fuller outliner / block-manipulation experience ships
  as its own **bundled first-party plugin** (§8) layered *over* the plain-text document — never as a
  change to the data model or the on-disk format (§13.1 — notes stay pure Markdown/Org). The plugin's
  own design (interaction model, any structure persistence, Markdown/Org parity §5) is tracked in
  `TODO.md`.

### 13.11 The frozen normalizer
The single, byte-identical text-normalization function shared by the suggester's **minter** (which
records a block's fingerprint at link-creation) and the resolver's **matcher** (which re-anchors). If
the two ever normalized one byte differently, links would silently miss — so this is frozen as a
spec, versioned, and changed only by deliberate migration.

**Role — an identity key, not the durability mechanism.** Durability is the diff-ratchet's job
(§13.6); the ratchet follows a block through real edits by diff, needing no hash equality. The
normalizer only produces a clean key for three narrower jobs: exact-match in the silent-resolve band,
duplicate detection, and cheap "did this block change?" checks. It is therefore deliberately
**conservative** — it absorbs only *rendering-invisible* noise and preserves everything visible. Both
failure directions degrade to a *confirm*, never a mis-point: over-normalizing collides two blocks
(→ disqualified from the silent band → confirm); under-normalizing lets noise change the hash (→ the
ratchet still follows the block by position).

**Coal is a noise-free producer.** Coal's editor emits **only literal keyboard text** — no
smart-quote / dash / ellipsis autoformat — and displays everything **monospaced, ligatures off**.
This governs what Coal *produces and shows*; it **never** rewrites imported or foreign-edited bytes
(§13.1 is inviolable — a genuine `—` or `"…"` in an imported note stays exactly those bytes). The
consequence: typographic / Unicode drift can enter only via **import or foreign editors**, which is
the sole scope the folds below still serve.

The function is two stages.

**Stage A — payload extraction (kind-aware).** Using the block's `kindTag`, strip structural markers
that are not content, so marker churn does not change identity:

- *paragraph* — text as-is;
- *list item* — strip the leading bullet / number marker (`- `, `* `, `1. `);
- *blockquote* — strip the leading `> ` on each line;
- *code fence* — drop the fence delimiters and info-string, keep the body.

**Stage B — canonicalization** (applied to the extracted string), frozen as:

| Step | Rule |
|---|---|
| Unicode form | **NFC** (never NFKC — no ligature / compatibility folding) |
| Line endings | CRLF / CR → **LF** |
| Whitespace | trim ends; collapse every interior run (incl. inside code blocks) → a single `U+0020` |
| Typographic fold | a **fixed, closed table** only: `‘’` → `'`, `“”` → `"`, `–` / `—` → `-`, `…` → `...`, nbsp & other Unicode spaces → space |
| Case | **locale-invariant case-fold** (lowercase) |
| Markup | **preserved** — emphasis, link, and other inline markup are *not* stripped (keeps the normalizer lexical and parser-free) |

**Output & versioning.** `normHash` = SHA-256 over the UTF-8 of the canonical string (stored
truncated); the same canonical string is the input to `simhash` tokenization (§13.3). A
**`normVersion`** is stamped in the Overlay: "frozen" means frozen *within a version*, and any future
change to a rule above is a deliberate, re-hashing migration — never a silent shift.

This choice serves the project's aim directly — **maximum portability, compatibility, and
efficiency**: it never touches the portable bytes, it tolerates the messiness of other editors and
imports (compatibility), and an O(1) hash key over a lexical, parser-free transform keeps resolution
cheap (efficiency).

### 13.12 Confidence thresholds for the ambiguous band
The concrete cut-points that decide, when the diff-ratchet (§13.6) re-anchors a block it cannot map
to a certainty, whether the outcome is **silent-resolve** (`status = resolved`), **surfaced-confirm**
(`status = ambiguous`, amber, one-keystroke), or **dangling** (`status = dangling`). These govern
*only the residual cases* the ratchet leaves — a deleted block, a verbatim duplicate in scope, or one
foreign leap large enough that "same block, edited" vs. "replaced block" is a genuine judgment call
(§13.6 honesty guarantee). The common case never reaches the scorer. All scoring runs **off the main
thread** (§13.7), consumes only fields ratified in §13.3 plus the frozen normalizer's canonical string
(§13.11), and writes nothing into notes (§13.1).

**Governing axis — location certainty (two paths).** Re-anchoring an out-of-Coal edit splits on
whether the diff `lastKnownBlob → current` maps the anchor's old byte range to **exactly one** new
range:

- **Path 1 — diff-clean** (the common case): location is *certain*. No candidate scoring; the only
  question is content **magnitude**. `normHash`-exact or simhash Hamming `d ≤ 12` → **resolve
  silently** (refresh fingerprints, advance the baseline); `d ≥ 13`, or simhash absent and `normHash`
  differs → **confirm** — a cleanly-located block rewritten past recognition in one foreign hop is
  still §13.6's "edited vs. replaced" judgment call, so this closes the hole where a clean modify-hunk
  silently re-points a link at wholly-replaced content.
- **Path 2 — diff-ambiguous**: the diff broke for this anchor (its old range was deleted with no
  aligned replacement, aligned to two-or-more regions, or aligned only as an unthreaded delete+insert).
  Location is *inferred*, so the scorer runs over a bounded candidate set and the AND-gate below decides.

The asymmetry is the principle: diff-certain location buys content tolerance up to the EDITED band;
inferred location demands near-exact content. A Path-2 fuzzy match means the ratchet *lost* the block,
so it can never silent-resolve on fuzz.

**The candidate set (Path 2 only).** Candidates are current-bytes blocks in the anchor's **home note
file** (a cross-file move is a deletion here + a fresh registration there, handled by §13.7 — not by
this scorer), assembled cheapest-first and capped at **16**: (1) the diff's insert region(s) replacing
the anchor's deleted range; (2) every block in the same heading section as the anchor's structural
path; (3) simhash-LSH near-neighbors within the note at Hamming `d ≤ 20`. Dedupe; keep the 16 of
smallest content distance. **Empty set → dangling.**

**Per-candidate score.** Three components, each in `[0,1]`:

- **`S_content`** — `1.00` on `normHash`-exact (same `normVersion`); else from the 64-bit simhash
  Hamming distance `d`:

  | distance | class | `S_content` |
  |---|---|---|
  | `normHash`-exact | EXACT | 1.00 |
  | `d ≤ 3` | NEAR | 0.90 |
  | `4 ≤ d ≤ 12` | EDITED | `0.85 − (d−4)·0.05` (0.85…0.45) |
  | `13 ≤ d ≤ 20` | DRIFTED | `0.40 − (d−13)·0.05` (0.40…0.05) |
  | `d ≥ 21` | FOREIGN | 0.00 |
  | simhash absent ∧ `normHash` differs | — | 0.50 |

  The curve dies by `d ≈ 20` because the expected distance between two *unrelated* 64-bit simhashes is
  ≈ 32 (a coin-flip per bit); signal must vanish well before that.

- **`S_neighbor`** — `nAgree / K_present`, where the anchor stores up to **4** neighbor fingerprints
  (the truncated `normHash` of the 2 preceding + 2 following same-level sibling blocks) and `nAgree`
  counts those matching a block adjacent to the candidate in the same order. `K_present = 0 → 0`
  (absent neighbors give no corroboration — never a `0.5` fudge; the AND-gate lets position carry an
  edge block instead).

- **`S_position` ∈ {1.0, 0.5, 0.1}** — against the **diff-projected range** (the gap between the
  current positions of the anchor's nearest cleanly-remapped siblings, so position stays defined even
  when the anchor's own map broke): `near = 1.0` (overlaps the projected range, or same structural path
  and offset delta ≤ 800 chars ≈ one median block); `moderate = 0.5` (same heading ancestry, preserved
  sibling order, beyond the near window); `far = 0.1` (different heading ancestry, or the diff could
  not bridge the move).

The composite `C = 0.60·S_content + 0.25·S_neighbor + 0.15·S_position` is used **only** to rank,
enforce the margin, and split confirm-vs-dangling — **never as the silent gate.** The weights are an
ordinal encoding of *content ≫ neighbors > position*.

**The band decision (Path 2), in order.** Let `C1`, `C2` be the best and second-best candidate
(`C2 = 0` if only one). `kindTag` is *not* a filter — it only selects the §13.11 Stage-A extraction, so
a paragraph turned into a list item keeps its `normHash`.

1. Empty candidate set → **dangling.**
2. **Silent-resolve** (`resolved`) iff **all three hard gates** pass:
   - **G1 (content):** `normHash`-exact **or** `d ≤ 3` (EXACT or NEAR).
   - **G2 (corroboration):** `S_position = near` **or** `S_neighbor ≥ 0.5`.
   - **G3 (margin):** `C1 − C2 ≥ 0.15`.
3. Else `C1 < 0.45` → **dangling** (content gone, no positional or neighbor support).
4. Else → **surfaced-confirm** (`ambiguous`, amber, one-keystroke).

**Load-bearing invariant.** Any candidate passing G1 has `S_content ≥ 0.90`, hence `C1 ≥ 0.54 > 0.45`:
a content-identical candidate **can never dangle** — at worst it confirms. Dangling requires the
*content itself* to be gone. Position or neighbor strength can never buy a silent accept for a block
whose content does not match — that would reintroduce the silent mis-point stand-off identity exists to
forbid (§13.6). Both normalizer failure directions and every `normVersion` gap fail closed the same
way: a version mismatch makes G1 unsatisfiable (cross-version hashes are incomparable), so the anchor
can only confirm or dangle, never silent-resolve.

**Cross-anchor assignment.** When a file reconciles, Path-1 clean maps consume their target blocks
first; remaining Path-2 anchors resolve in **descending `C1`** (ties broken by ascending node id,
§13.13), and a block silently *claimed* is removed from every other anchor's candidate set, which
re-scores their margins. Pending confirms and danglings do not remove a block — the user adjudicates
them. Two links can therefore never silently resolve to the same block.

**Confirm handling.** On confirm the reconciler records `status = ambiguous` and a pending candidate
(`nodeId`, `C1`, content class), surfacing it in the *Needs attention* group (§13.9) with the
last-known target text and the class ("content drifted, simhash d = 16/64 — same block, rewritten?").
One keystroke: **accept →** `resolved`, re-mint fingerprints from the accepted block and advance the
baseline; **reject →** `dangling`. Status and the pending candidate are Tier-2 (recomputed each
session, §13.13), so a confirm is re-surfaced on open by re-running the scorer — nothing is lost.
Note-level foreign-rename pairing (§13.7) applies the same three-band philosophy at file granularity.

**Fixed constants & versioning.** `SIMHASH_BITS = 64`; simhash is computed over the §13.11 canonical
string, tokenized on `U+0020` into word unigrams + adjacent bigrams, each feature hashed with the low
64 bits of `SHA-256(feature)` and sign-summed per bit (standard simhash), minted at a block's lazy
registration (§13.4) only for blocks with **≥ 12 word tokens** (fewer make a 64-bit simhash noise);
`d`-class breakpoints `3 / 12 / 20`; composite weights `0.60 / 0.25 / 0.15`; `K_NEIGH = 4`;
`NEAR_WINDOW = 800` chars; `S_position` tiers `1.0 / 0.5 / 0.1`; `CANDIDATE_CAP = 16`;
`LSH_RADIUS = 20`; `MARGIN = 0.15`; `DANGLING_FLOOR = 0.45`; the Path-1 silent ceiling `d ≤ 12`. All
are stamped as a **`resolverVersion`** in the Overlay, independent of `normVersion` (§13.11): a
`resolverVersion` bump is a deliberate re-scoring migration. The silent band leans on `normHash`-exact
having ≈ 0 collision probability, so `normHash` is truncated to **≥ 128 bits** and neighbor
fingerprints — corroboration, not the silent key — to **≥ 64 bits** (§13.13 fixes the encodings). The
constants are reasoned, not corpus-fit; they fail toward *confirm* (friction), never mis-point, and
`resolverVersion` makes a post-dogfooding recalibration a first-class migration. The concrete differ
feeding the Path-1/Path-2 split and `S_position` is a Reconciliation-Engine detail, likewise stamped
under `resolverVersion` for cross-device determinism.

### 13.13 Sidecar JSON schema & id format
The concrete on-disk shape of a node record and a sidecar, and the opaque stable-id format (§13.3).
One rule governs every choice: **the committed Overlay carries identity, intent, and content
*fingerprints* — never verbatim note bytes** (§13.1, §10.2), and **everything derivable from Tier 0 +
Tier 1 stays Tier-2 and git-ignored** (§13.2).

**Id format.** `<tag>_<id>` — 31 chars, `^(note|hdng|blok|link)_[0-9a-hjkmnp-tv-z]{26}$`. `tag` is one
fixed 4-char token per §13.3 kind (`note` `hdng` `blok` `link`); `id` is **128 bits of CSPRNG
randomness** in lowercase Crockford base32 (alphabet `0123456789abcdefghjkmnpqrstvwxyz`, no `i l o u`)
→ 26 chars, every char `[0-9a-z]` so ids are path/URL/shell-safe, confusable-free, and greppable in the
Overlay. **No wall-clock, counter, or host id** — coordination-free uniqueness is the only property
concurrent multi-device minting (§10) needs, and a clock is pure liability (it skews across synced
devices and would leak node-creation time into a committed artifact). Random beats time-sortable
(UUIDv7/ULID) because the registry is an *unordered* id-keyed map (§13.3), so sortability buys nothing
while 128 full-random bits give a stronger collision bound (≈ 1.5×10⁻²¹ at 10⁹ live nodes) than ULID's
80. **Opacity contract:** code parses only the leading tag; the node's `kind` field is the sole
authority and never changes; the tag is a debug/merge-readability aid derived from `kind` at mint. Ids
are minted once (`note` at registration, `blok` lazily on first becoming a target §13.4, `link` when
authored), immutable, and reused across every referrer. `hdng` is **reserved** — headings resolve by
their own text (§13.5) and are not persisted.

**Storage tree** (under `.coal/`, mirroring the note tree §13.8):

| Path | Tier | Committed | Holds |
|---|---|---|---|
| `.coal/overlay/notes/<note>.json` | 1 | **yes** | schema/norm/resolver versions, root id, baseline scalars, the node registry |
| `.coal/index/notes/<note>.anchors.json` | 2 | no (git-ignored) | derived per-node `range` + structural `path` + a staleness guard |
| `.coal/index/**` | 2 | no | backlinks projection, title/alias table, resolved graph, search |
| `.coal/cache/notes/<note>.blob` | 2 | no | last-reconciled bytes (the baseline), DEFLATE-compressed, purged on lock (§13.15) |

A `.coal/.gitignore` lists `index/` and `cache/` (so `overlay/` — and only it — is committed). The
note's vault-relative path *is* the mirror location and is stored in no file, so a rename moves the
sidecars and rewrites zero bytes.

**Committed `.json` — top level** (keys sorted, per the writer below): `schemaVersion` (int, ratified
**1**), `normVersion` (string, **"1"**, §13.11), `resolverVersion` (string, **"1"**, §13.12), `root`
(this note's `note`-node id — the value cross-note references target), `baseline`
(`{ hash, size, commit? }`, see §13.15), `nodes` (id → record), optional `tombstones`
(`{oldId: newId}` for deterministic id-coalescing after a concurrent-registration merge — keep the
lexicographically-smaller id).

**Node records**, discriminated by `kind`; any field at its documented default is **omitted**
(steady-state sidecars stay minimal). Common: `kind`, `parent` (id, or `null` for a note).

- **`note`** — `kind` + `parent: null` only. Title and aliases are Tier-2 (derived from bytes).
- **`block`** (target-side, lazily persisted §13.4) — `kindTag`
  (`paragraph|list-item|blockquote|code-fence|table`, drives §13.11 Stage A), `normHash` (128-bit,
  32 hex), `simhash` (64-bit, 16 hex — present for every ≥ 12-token block per §13.12), `simhashTokens`
  (int — records *omitted* vs. *failed* for short blocks), `neighbors`
  (`{prev2?,prev1?,next1?,next2?}`, each a 64-bit-truncated `normHash` of the same-section sibling;
  §13.12's K = 4).
- **`link`** (source-side, the Option-1 reference §13.5) — `href` (the exact authored link text incl.
  delimiters, e.g. `[[Design#Resolution]]` — drives the §13.5 precision decoration), the
  `kindTag`/`normHash`/`neighbors` of its **containing block** (the link re-anchors as a position
  inside that block; `normHash` disambiguates *which* occurrence when a note repeats a link text), and
  `target` (`{ note: <id>, block: <id> | null }` — **ids only, never paths or offsets**, so a
  reference is immune to renaming the target *and* relocating the block). Precision is **implicit and
  derived** (block if `target.block` is set, else heading if `href` contains `#`, else note) — the
  same derivation drives the §13.5 decoration and the §13.14 backlinks sigil; it is never a stored
  field.

No verbatim note text is committed — there is no `label` or inline content field; last-known target
text for the panels comes from the Tier-2 baseline cache (§13.14/§13.15). Headings are not persisted (a
`heading[2]→heading[3]` shift would churn every heading node for zero durable information; the §13.3
tree is recovered by live-parse and cached in Tier-2).

**This refines §13.3.** Of the node record's three field groups, **Identity** (id/kind/parent), the
reference **intent** (`target`), and the **durability fingerprints**
(`normHash`/`simhash`/`neighbors`/`kindTag`) are committed Tier-1; the character **range** and the
structural **path** (the Anchor group) and the resolved **`status`** are **Tier-2 derived** —
recomputed from bytes each session — so volatile positions and statuses never churn the committed
Overlay. `status` (`resolved` default | `dangling` | `ambiguous`) is the resolver's *output*, computed
on the §13.7 Open/reconcile pass and held in the in-memory Overlay the §13.9/§13.14 panels subscribe
to; it is never committed. The derived anchors file
(`.coal/index/notes/<note>.anchors.json`) carries, per node, `range` = half-open `[start, end)` UTF-8
byte offsets into current bytes (converted to CodeMirror UTF-16 at the load boundary), `path` =
`/`-joined 0-based structural path (`note/heading[i]/block[j]`), and a `forBaseline` guard (=
`baseline.hash`; mismatch → recompute). Exact enumeration of setext/frontmatter/HTML-comment blocks
rides on the parser ratification; `table`-kind extraction defaults to as-is payload (§13.11 Stage A)
pending a dedicated rule.

**Frozen canonical JSON writer.** Re-serializing unchanged data must be **byte-identical**, or every
save churns everything (as consequential as the frozen normalizer §13.11): UTF-8, LF, single trailing
newline; 2-space indent, one key/element per line (line-oriented diff + 3-way merge); **all object keys
sorted ascending by code point at every level, including the `nodes` id-keys**; shortest round-trip
integers; defaulted fields omitted. A conformance vector ships with the schema, gated by
`schemaVersion`. Consequence: a one-block text edit rewrites only that node's fingerprint lines in
place (id unchanged → position unchanged); a new reference inserts a `link_…` node at its sorted
position (random ids scatter, so concurrent adds on two devices rarely land adjacent → 3-way-mergeable,
§13.15); volatile ranges never appear here at all.

### 13.14 Links panel UX — bidirectional (outgoing + backlinks)
The right-dock **Links panel** shows the current note's connections in **both directions**: an
**Outgoing — "Links to"** section (what this note references) above the **Incoming — "Linked from"**
groups (who references this note — the backlinks projection detailed below). Both directions are
current-note-scoped, rebuild from Tiers 0+1, and each offers **two keyboard front-ends** (§8) — a panel
and a minibuffer command over one reactive source, so they can never disagree. The leaf id
`coal.backlinks` and the `backlinks-*` command family are retained for continuity; the outgoing
direction adds a section and a narrow, not a separate surface.

**Placement.** `coal.backlinks` is a right-dock leaf, **separate from** the `coal.dangling` leaf
(§13.9); the default layout stacks the Links panel above Dangling (co-visible), but they are independent.
Their conditionality differs by design: Dangling is *conditional-on-content* — an alarm that
auto-surfaces only when the current note has unresolved outbound links; the Links panel is
*conditional-on-invocation* (`auto_show = false`) — outgoing and inbound references are things you reach
for, revealed with `backlinks-show` and thereafter persistent per workspace. The three surfaces are
mutually disjoint — **Links to** = outbound-*resolved*, **Linked from** = inbound, **Dangling** =
outbound-*broken* — so nothing is double-counted. The one seam: an inbound **block-precise** reference
whose target block was deleted from *my* note shows in *my* **Linked from** as an amber-degraded entry,
and separately as a *Broken* entry in the **source** note's own Dangling panel — because that defect
lives in the source's sidecar (§13.3 ownership). The default instance follows the active note;
`backlinks-pin` mints a title-locked instance.

**Two groups, fixed order.**

- **Linked — stable-id inversion** (exact, cheap): invert every sidecar's forward `link` nodes and
  collect those whose `target.note` is the current note; a pure id join, ready on open. Each entry
  carries the source note, the link's anchor range, the derived precision, and — when the target block
  is not `resolved` — the block status and its **last-known target text**, read from the **target**
  note's Tier-2 baseline cache keyed by the target block node (never the source's bytes, §13.3; absent
  on a cold cache → the sigil shows without a quote).
- **Unlinked mentions — frozen-normalizer name scan** (heuristic, promotable): the expensive half,
  computed off-thread (§13.7) and cached in Tier-2. A note's **name set** is `{ filename stem, first
  H1 text, each frontmatter alias }` — all user bytes, never Coal-written (§13.1) — each reduced to its
  §13.11 canonical form. An Aho-Corasick automaton over all notes' normalized name sets is run over
  each note's **normalized text stream** (same §13.11 function → minter/matcher symmetry), retaining a
  monotonic normalized-index → raw-byte-offset map (mandatory, since Stage B collapses whitespace and
  folds typography) so every hit resolves back to a **raw** byte range. A hit counts only with token
  boundaries on both sides in normalized space (never `Notes` inside `Notebook`), outside
  code/inline-code/frontmatter/existing-link spans, non-self, of normalized length ≥
  `min_mention_length` (3) and not on `mention_stopnames`. Matching is **exact-after-normalization
  only** (the `normHash` exact band); `normVersion` is stamped, and a normalizer migration invalidates
  the automaton and rescans. Fuzzy (simhash) mentions are **off by default** (`fuzzy_mentions =
  false`); enabling them adds a clearly-marked "Similar mentions" group, sorted last, still
  manual-promote-only. Invalidation is bounded: a note's *text* change rescans only that note against
  the full automaton; a note's *name-set* change rescans the corpus for that note's patterns alone —
  never a full re-derive.

**Outgoing — "Links to."** Above the two incoming groups sits the outgoing direction: the current
note's own **resolved** forward `link` nodes (§13.13), grouped by target note and ordered by document
offset. It is the cheap mirror of *Linked* — a read of the note's **own** sidecar, no inversion, ready
on open — with **no Unlinked analogue** (outgoing links are authored, never inferred). Each entry carries
the same §13.5 block-precision sigil, last-known target text, and `RET` jump / `SPC` peek behavior as an
incoming entry. **Broken or ambiguous outgoing links are absent here by construction** — those are the
Dangling panel's alarm (§13.9) — so "Links to" is a clean list of live connections. The sole mutating
action, **promote** (below), stays *incoming*-only.

**Layout.** Group headers carry live totals (`Links to · 5`, `Linked · 7 (2 broken)`, `Unlinked mentions · 4`); within
a group, entries are grouped by source note (collapsible, count-badged) and ordered by document offset;
source groups sort by `recency` (default), `count`, or `title` (cycled with `s`). Each entry shows the
source name, a **raw** context snippet (never normalized; single line, `snippet_max_chars = 120`,
hit-highlighted; `c` cycles to full paragraph), and a leading **block-precision sigil** shared with the
§13.5 Live-Preview decoration — `·` note, `§` heading, `◆` block resolved, `◇` block degraded (amber,
trailing `⟨block removed: "…"⟩` or `⟨block ambiguous⟩`). Designed empty states throughout.

**Interactions.** `RET` **jump-to** (reuse the active leaf; `C-RET` splits) — caret to the anchor,
brief flash. `SPC` **peek** — a strictly read-only, throwaway CodeMirror preview around the anchor that
never touches the byte-for-byte save path, debounced, reverted on `Esc`. **This peek is also the editor
hover-preview engine:** hovering an **internal** link (`[[wikilink]]` or an in-vault `[…](path)`) in Live
Preview or Source pops the identical read-only throwaway preview of its target, debounced; **external**
schemes (`http(s)`, `mailto`, …) never preview. `p` **promote unlinked
mention → link** — the **only** note-mutating action in either panel, obeying §13.1 exactly: it writes
a **portable, zero-identity** wikilink into the **source** note (never the target), replacing the
mention span with the bytes the user would type — `[[Target]]` when the text equals the target's
canonical name, else `[[Target|shown text]]` (Markdown) / `[[Target][shown text]]` (Org), in the
source's syntax; it is **note-level by construction** (never a block refinement), goes through the
normal edit/save path (so §13.7 registers the new `link` node in the source's sidecar and the entry
migrates to Linked on the next projection, and ordinary undo reverts it), is confirm-gated, and on an
**ambiguous** target name offers a still-portable path-qualified `[[folder/Target]]` rather than
guessing (§13.6 honesty). Bulk `backlinks-promote-source` is count-confirmed; vault-wide promote-all
lives only in the §13.9 housekeeping surface.

**Commands & keys** (§6/§8/§9). Every affordance is a namespaced `backlinks-*` command in the central
registry — `M-x`-visible, rebindable, `isAvailable()`-gated — with the panel keymap and the minibuffer
`backlinks-jump` (the same entry list rendered with live read-only preview and narrowing to
linked/unlinked/broken) as front-ends onto it; the mouse is additive. Default links prefix `C-c l`:
`b` show · `d` dangling-show · `j` jump · `u` jump-unlinked · `o` jump-outgoing · `p` promote-at-point.
Panel-local: `C-n`/`C-p` entry, `M-n`/`M-p` group, `RET`/`C-RET` visit, `SPC` peek, `TAB`/`S-TAB` fold,
`p`/`P` promote, `/` filter, `s` sort, `c` context density, `u` toggle-unlinked, `L`/`U`/`O` narrow
(linked / unlinked / outgoing), `g` refresh,
`q` quit. A `[backlinks]` TOML block (§9) carries the knobs (`auto_show`, `unlinked_mentions`,
`fuzzy_mentions`, `min_mention_length`, `mention_stopnames`, `sort`, `snippet_max_chars`,
`peek_debounce_ms`, `promote_confirm`); sidecars stay JSON (§13.8).

### 13.15 Git posture — the additive layer
Detailing §13.6/§13.7's promise that Git *strengthens* re-anchoring and rename detection but is
**never required for correctness.** One invariant carries the section: **Git is never in the
correctness path.**

**The correctness invariant.** For every note, resolution of every reference into it and re-anchoring
of every node its sidecar owns are a **total function of Tier 0 (current bytes) + Tier 1 (committed
sidecar)**, computed without reading Git. The presence or absence of a `.git` directory, of any
history, or of a network **never changes a verdict and never changes the `range` of a `resolved`
one** — Git changes only *performance* and the *confidence of a bounded, enumerated set of hard cases*,
always by promotion up the lattice `dangling < ambiguous < resolved`, never demotion, never a different
target. A plain directory that was never a repo, and a repo whose notes were never committed, are
therefore **fully correct** configurations, not degraded ones.

**Where the baseline lives — commit the hash, cache the bytes.** The diff-ratchet (§13.6) needs a
`last-known → current` diff, hence both texts. The realization: **at any consistent committed/saved
state the note's own current bytes *are* the last-reconciled bytes** (Tier 0 and Tier 1 were written
together). So the baseline is not committed as a second copy of the note — which would also drag
verbatim user content into the committed tree against §10.2. Instead:

- **Committed** in the sidecar (Tier-1, plaintext): `baseline = { hash, size, commit? }` — `hash` is
  the **full, untruncated** SHA-256 of the last-known bytes (the whole-file dirty-check key, the exact
  foreign-rename pairing key of §13.7, and the consistent-vs-divergent gate; deliberately distinct from
  §13.11's *truncated* per-node `normHash`), `size` the byte length (the mtime+size pre-filter §13.7),
  and `commit` an optional last-known Git commit id (or absent). mtime is **never committed** (it
  differs across synced devices and would churn); it is queried live as an advisory pre-filter only.
- **Cached** as raw bytes (Tier-2, git-ignored) at `.coal/cache/notes/<note>.blob`, DEFLATE-compressed,
  **purged on lock and regenerated on unlock** (honoring §10.2's "re-lock on close").

**Baseline bootstrap** (this closes the invariant on a fresh clone / cold cache / post-lock). Compare
the note's current whole-file hash to the committed `baseline.hash`:

- **Consistent** (equal): current bytes *are* the baseline, the committed anchors are valid as written,
  the cache is re-seeded from current bytes — **no search, no Git.** The overwhelming common case.
- **Divergent** (unequal): a foreign change landed while Coal was not maintaining the cache, so the
  *pre-change* bytes are needed. In order: (1) cache blob present → use it (Overlay-only); (2) else
  repo present and `baseline.commit` set → `git cat-file blob <commit>:<path>` (Git strengthens: exact
  ratchet → silent); (3) else bounded per-anchor fingerprint re-location against current bytes,
  degrading to an **amber confirm** on any ambiguity — never a mis-point. Because step 3 is always
  available and correct-modulo-a-confirm, step 2 is itself a confidence upgrade, not a dependency.

A committed per-note baseline blob is therefore **rejected**: with no repo there is no committed blob
either (identical fingerprint+confirm fallback); with a repo it merely duplicates `git cat-file`; and
it would double working-tree bytes and commit verbatim user content (§10.2).

**Encryption split** (updated by §10.3, and conditional on §10.2's opt-in). **When a vault has
encryption enabled**, the committed Overlay is **inside** the encryption boundary: because its `href`
(authored link text), `normHash`, `simhash`, and `neighbors` are all content-derived, §10.3 encrypts
the Overlay sidecars at rest and on the remote alongside notes, which **closes** the residual
coarse-similarity leak this section had flagged for the §10.3 threat model. Consequence for the merge
model above: with the Overlay stored as ciphertext, Git's default line merge of the plaintext JSON no
longer applies, so **for an encrypted vault** the `coal-overlay` structural driver becomes **required**
(gaining a decrypt → 3-way merge → re-encrypt wrapper, shared with §10.3's note merge driver), with
**recompute-from-bytes-on-open** as the always-correct floor; the id-sorted frozen serialization
(§13.13) still governs the *plaintext* the driver merges. In an **unencrypted** vault the Overlay
sidecars are plaintext JSON and merge as before (the structural driver still preferred, but Git's line
merge is a valid floor). The Tier-2 baseline cache stays git-ignored and purged on lock. (Reconciling
every §13.15 merge defense with the encrypted Overlay in full detail is tracked in `TODO.md`.)
Configuration (§9) stays plaintext.

**Every §13.6/§13.7 mechanism runs Overlay-only.** Dirty-check, in-Coal transactional anchoring, the
diff-ratchet across a foreign edit, the relocated/altered/removed outcomes, foreign-rename pairing by
content, dangling detection, duplicate/ambiguous surfacing, and reference **resolution** proper all
take inputs from Tier 0 + Tier 1 alone. **Resolution never shells out to Git even when a repo is
present** — Git participates only in *reconciliation* (maintenance), never in *resolve*.

**The additive layer** — each place Git strengthens, under a **monotonicity rule** (Git may only move a
verdict *up* the lattice, in the enumerated cases; if Git and the Overlay disagree on the *identity* of
a match rather than merely its confidence, the case is forced to *ambiguous* — never silently taken
from Git):

- **G0 — Divergent-state baseline recovery.** `git cat-file blob <commit>:<path>` restores the exact
  diff basis when the cache is gone (above). *Fallback:* fingerprint re-location → confirm.
- **G1 — Deepened history for a large foreign leap.** When one hop is a genuine "edited vs. replaced"
  judgment call, `git rev-list --reverse <commit>..HEAD -- <path>` (with `--follow` across a rename) +
  per-revision `git cat-file blob` decomposes it into small certain hops, replaying the ratchet
  commit-by-commit. *Fallback:* the single hop is attempted; clears the margin → silent, else one amber
  confirm.
- **G2 — Committed-rename detection.** `git diff --name-status --find-renames=50%` yields the `R<score>`
  pairs Git already computed; an `R ≥ 50%` re-pairs an orphaned sidecar even when content also changed.
  The 50% floor is Git's default and is deliberately **not lowered** — a sub-50% "rename" is exactly a
  case a human should confirm. *Fallback:* content pairing against the bootstrapped baseline.
- **G3 — Post-Git reconcile scoping.** After pull/merge/checkout/rebase,
  `git diff --name-status -z --find-renames=50% <old>..<new>` gives the exact changed set, so Coal
  rescans only those files instead of stat-walking the vault. *Wiring:* per-clone
  `post-merge`/`post-checkout`/`post-rewrite`/`post-commit` hooks append the precise old→new ref pair
  (from the hook's own arguments, avoiding reflog dependence) to a `.coal/cache/` queue drained by the
  running app; the filesystem watcher also watches `.git/HEAD` and `.git/refs/**`. *Fallback:* the
  startup reconcile + watcher dirty-check catches every changed file regardless (a `git pull`'s writes
  fire the watcher). Post-Git changes *which* files are scanned and *how fast*, never *what is found*.

**Multi-device sidecar merges** (§10). Per-file sidecars (§13.8) give merge locality: disjoint notes
edited on two devices are distinct files → Git unions them with zero conflict. For the same note edited
on both, three layered defenses, none ever *required* for correctness:

1. **Markerless serialization** (the zero-config floor): the frozen writer's one-record-per-line,
   id-sorted form (§13.13) lets Git's default line merge union concurrent *additions* and disjoint
   edits with no markers and no driver — the dominant case, correct even on a fresh clone before Coal
   is installed.
2. **The `coal-overlay` merge driver** (the strengthener): registered on repo-open via committed
   `.gitattributes` (`.coal/overlay/**/*.json merge=coal-overlay`), it does a structural 3-way JSON
   merge — **union the node ids** (minted-once + random → collision-impossible, *no id ever dropped*,
   so no cross-note reference breaks; a delete is represented as Tier-2 `status`, never id removal, so a
   delete-vs-edit race resolves to "keep the id, recompute status"); take either side's fingerprints
   provisionally and flag them for revalidation; and **only when the two sides set a different
   `target.block` for the same `link` node** mark it `ambiguous`, keep the portable heading-level
   fallback active, and surface it in the §13.9 amber "Needs attention" group. That link-intent
   divergence is the **only** sidecar case that ever reaches the user.
3. **Recompute-on-open** (the always-correct floor): if the driver was not configured and Git left raw
   markers or invalid JSON, Coal discards both conflicted sides for the affected records, unions the
   ids, and re-derives every fingerprint by re-running §13.7 reconciliation over the Git-merged note
   bytes; the cache and baseline scalars are re-seeded from the merged bytes.

An Overlay merge conflict thus always reduces to "re-run §13.7 over the merged Tier 0" — validated
against bytes, never a blind trust of merged Tier-1 text; a union-of-ids orphan from a
delete-and-recreate is reaped by the §13.4 GC pass.

**Tier 2 is git-ignored and regenerated**, so it can never conflict. `.coal/.gitignore` lists `index/`
and `cache/` and never `overlay/`. Because `Tier 2 = f(Tier 0, Tier 1)` and is never transmitted, the
entire multi-device sync surface is exactly Tier 0 (Git's text merge) + Tier 1 (the union-recompute
merge above); there is no "index merge" problem, and the baseline blob (which rewrites on nearly every
edit) never becomes a conflict.

**Restated for ratification.** A vault with no Git history resolves every link exactly as correctly as
a fully-committed one; the only differences are that a few hard cases Git could auto-resolve (a large
leap G1, a heavily-edited committed rename G2, a divergent-state baseline G0) surface as one amber
**confirm** instead, and bulk external changes are caught by a **slower stat-walk** (G3) rather than
Git's changed-file list. In every case the outcome is a surfaced confirm or a slower scan — never a
wrong resolve, never a silent mis-point, never data loss.

---

## 14. The workspace shell & v1 surface roster

This section fixes the **complete set of user-facing surfaces that constitute Coal v1** and settles the
**workspace shell** they live in. Under the owner-first, dogfooded-from-day-one audience (§15), "v1" is
the bar at which the owner can switch to Coal for daily notes — so everything named in `SPEC.md` and
`TODO.md` is on the v1 roadmap; there is **no deferred feature tier**. This is the roster of record;
each heavy surface's deep design proceeds in its own session and lands as its own section, exactly as
§13 did for linking.

### 14.1 The workspace shell

**Hybrid — a keyboard-first spine with first-class GUI chrome.** The keyboard spine (minibuffer open,
window/buffer commands) is the source of truth; the tree and tabs are GUI front-ends onto it, visible by
default. This honors §2 principle #4 (keyboard-first; mouse first-class where it wins) and §6 (one
command substrate + minibuffer), while giving Obsidian switchers the chrome they expect.

- **File-tree sidebar** — a **left**-dock leaf showing the vault's folder/file tree; **default-on**,
  toggle-able by key and mouse; create / rename / move / delete files and folders. The **right** dock
  stays reserved for the §13 contextual panels (Links §13.14, Dangling §13.9), so the two docks never
  compete.
- **Quick switcher** — the spine's file-open: fuzzy open-by-name/alias through the minibuffer
  (`find-file`-style), an `M-x`-registered command with the standard minibuffer front-ends (§6/§8). The
  tree is the mouse path; the quick switcher is the keyboard path. It matches over the same
  `{ filename stem, first H1, aliases }` name set the backlinks scan uses (§13.14), each reduced through
  the frozen normalizer (§13.11), so "find" and "link" agree on what a note is called.
- **Windows as the split primitive** — frame layout is the Emacs **window** model: split (`C-x 2` /
  `C-x 3`; Vim `:sp` / `:vsp`), move focus, balance, and close, each window showing one note. Mouse
  drag-to-split is additive. Coal **does not** adopt a separate Obsidian-style "tab-group" abstraction —
  a window already is the unit of layout, and a second one would double-model it.
- **Tabs** — a **per-window** buffer strip (a tab-line) listing that window's open notes; **default-on**,
  toggle-able; mouse-clickable and keyboard-cyclable. Tabs *belong to* a window; they are not an
  independent layout primitive.

**Deferred to the shell's own design session (`TODO.md`):** the exact split/tab keybindings and drag
behavior, and **workspace/session persistence** — which windows, notes, and panels reopen on launch,
stored as plain text per §9.

### 14.2 The v1 surface roster

The surfaces below **are** v1. Legend: *specced* = already ratified elsewhere in this document; *new* =
ratified in this section; *own session* = on the v1 roadmap with its deep design tracked in `TODO.md`.

**Layer (per §8).** The **kernel** owns the editor engine, the command / minibuffer core, both
keymaps, the workspace shell, and Settings; every *interpretive* surface below — Live Preview, the
linking / knowledge cluster, the PKM surfaces, and the roadmap items — is **plugin-delivered** (bundled
first-party, enabled in fully-outfitted Coal). "v1 surface" names *what* ships, not which layer owns it.

- **Editor & command core** *(specced)* — the **kernel** editor engine with Live Preview + Source
  (Live Preview delivered by the Markdown/Org plugin, §7); command palette + unified minibuffer,
  `M-x` / `M-:` / Vim `:` + `/` (§6, §8); both **Emacs & Vim keymaps** (kernel, §6).
- **Workspace shell** *(new, §14.1; kernel)* — file-tree sidebar; windows-as-split; per-window tabs;
  quick switcher.
- **Linking & knowledge** — wikilink navigation & resolution (§13.5, *specced*); the **Links panel**,
  bidirectional (§13.14, *extended here*) — *Links to* (outgoing) + *Linked from* (Linked + Unlinked
  mentions); the **Dangling / ambiguous-links** panel + vault housekeeping (§13.9, *specced*);
  internal-link **hover preview** (§13.14, *new*); **graph view** (*own session*; renderer deferred,
  `reference/17`); **embeds / transclusion** inline render (*own session*).
- **PKM surfaces** — **full-text search** (*own session* — engine, query syntax, indexing); **tags** —
  inline `#tag` + frontmatter `tags:`, tag index/pane, autocomplete, click-to-search (*own session*);
  **daily notes** (*own session*; depends on templates); **templates** — plain-text template files in
  the vault, basic variable substitution (date / title / cursor), likely an official plugin (*own
  session*; `PLUGINS.md`); **outline / TOC panel** — a heading-tree of the current note, keyboard-
  navigable (*new*); **word-count / stats** — a status-bar element (*new*).
- **Also on the v1 roadmap, each tracked as its own `TODO.md` item** — spell check; full code-editor
  mode; Zettelkasten; file recovery; undo; auto-save / commit / push; change app icons; the outliner
  plugin (§13.10); and the encryption detail cluster (§10.3 / §10.4).

**Deliberate boundary — note properties are edited as text.** Live Preview prettifies and reveals
property/drawer lines (§7.1), so Coal ships **no separate GUI properties/frontmatter editor**: a form
that writes the file for you is exactly the "hidden front-end that shadows the file" §2 forbids. Editing
frontmatter is editing text, like any other line.

---

## 15. Decision log

| Date       | Decision | Rationale |
|------------|----------|-----------|
| 2026-07-20 | Fresh rewrite; `reference/` is research/priors only, not a blueprint | Owner dissatisfied with prior implementation; wants a design reached from first principles. Convergent, not derived. |
| 2026-07-20 | Platform: Linux-first, GNOME-at-home, RPM; deep desktop integration in scope | Linux must feel native and deliberate, not an afterthought. |
| 2026-07-20 | Stack: Electron + CodeMirror 6 | Closest to the intended Obsidian-like stack; largest ecosystem; fastest path to parity. |
| 2026-07-20 | Implementation language: TypeScript | Both decided stack components are TS-native; end-to-end type-checking across shell, editor core, and the plugin API with no interop seam. |
| 2026-07-20 | Theming: CSS custom properties; theme = manifest + variable-setting stylesheets, installed via the plugin path; no executable code required | Web-tech shell means CSS is the styling substrate; one variable surface shared by core and third-party themes (core-as-plugins). |
| 2026-07-20 | Config format: TOML is the standard/default (config, keybindings, theme manifests); a single format is a default, not a requirement — best-suited format per job (e.g. JSON) is allowed | TOML round-trips through a GUI pane (§9), is declarative and low-ambiguity, avoids YAML footguns; the real invariant is §9 (plain-text, version-controllable), not one file type. |
| 2026-07-20 | Org: bring over `.org` files, syntax, and writing style only; lightweight agenda/TODO view is not planned | Org depth is document-format, not the Org application; owner is not interested in Org application features beyond files and syntax. |
| 2026-07-20 | Formats: Markdown + Org, both first-class; Org = document-format depth only | Full Org authoring without re-implementing the Org application suite. |
| 2026-07-20 | Interaction: keyboard-first core (Emacs keys); mouse-first where it wins; not keyboard-only | Emacs muscle memory for the editing loop; pragmatic mouse use for things like the graph. |
| 2026-07-20 | View modes: Live Preview + Source only; no Reading/render mode (for now) | Keeps scope tight; render-only features (math, diagrams, PDF, slides) fall out of near-term scope. |
| 2026-07-20 | Live Preview reveal/hide: configurable granularity (whole-line default, per-element optional); selection always reveals raw markup; instant with optional delay; pure display, byte-safe; atomic rendered constructs; symmetric Markdown/Org | Whole-line matches Obsidian and avoids caret-motion flicker; per-element (org-appear model) reads cleaner for those who want it; selection-reveal and byte-safety protect round-trip fidelity (§9). |
| 2026-07-20 | Live Preview inline rendering: images, tables, and task checkboxes render inline; math, Mermaid, embeds, fenced-code, PDF/slides stay literal | Render inline only what stays inline-editable as source (typographic, images, tables, task text); anything needing a render engine (math/Mermaid) or entangled with deferred linking (embeds) stays literal — consistent with "no Reading mode" (§7). |
| 2026-07-20 | Extensibility: one command substrate; keys + `M-x` are front-ends; core-as-plugins; first-class plugin *and* theme systems | Native Emacs feel and a real plugin/theme ecosystem are the same system, not two. |
| 2026-07-20 | Plugin API & sandboxing: TS/JS on the core's own typed API; in-process but ambient Node/Electron authority withheld (typed API is the sole capability channel); capabilities declared in a manifest and enforced by the broker; first-party trusted, third-party consented + revocable | Keeps core-as-plugins and a low-friction ecosystem while giving encryption-at-rest / private-by-default a real gate; avoids both all-or-nothing in-process trust and a heavy RPC sandbox. |
| 2026-07-20 | Configuration: everything in plain-text, version-controlled files; GUI reads/writes text only | Declarative, reproducible, portable machine-to-machine. |
| 2026-07-20 | Git version control is first-class | Free off-site sync (vs paid-sync models) and full history. |
| 2026-07-20 | Notes encrypted at rest (transparent unlock/re-lock); mechanism deferred | Private notes must not be exposed by syncing or a lost device; the scheme is too consequential for a snap decision. |
| 2026-07-20 | License: Apache-2.0 (open source) | Permissive (frictionless ecosystem), fully compatible with the non-copyleft dependency stack, and adds a patent grant over bare MIT. |
| 2026-07-20 | Audience: owner-first, dogfooded from day one; public release later; adoption gated on feature maturity + data security | Design and validate against real daily use; security is a prerequisite for the owner's own switch-over. |
| 2026-07-20 | Process: `SPEC.md` holds decided items only; open/pending work tracked in `TODO.md` | Keep the builder's source-of-truth clean; the open list will grow fast during build. |
| 2026-07-20 | Linking & index: **stand-off identity** — notes are inviolable plain text; all identity lives in a committed, plain-text **Overlay** above them; links live in notes, identity anchors never do | Satisfies "plain text is the source of truth" and total portability while giving durable, honest referential integrity; abolishes both the prior UUID-injection model and Obsidian-style `^blockid` markers. |
| 2026-07-20 | Three-tier model: Tier 0 notes (content) · Tier 1 Overlay (identity/intent, committed, not disposable) · Tier 2 index (derived, Git-ignored); "rebuild from notes alone" weakens to "rebuild Tier 2 from Tiers 0+1" | The Overlay holds intent prose can't regenerate, so it is versioned, not a cache; notes, Overlay, and config are all committed and portable. |
| 2026-07-20 | Uniform node registry (note/heading/block/link); opaque stable ids (safe because Overlay-only); each sidecar owns the nodes physically in its own note; references store cross-note stable ids | One resolver for all granularities; ids immune to rename + relocation; opaque tokens carry no portability cost when they never touch a note. |
| 2026-07-20 | Lazy block registration — a block is tracked only when first referenced; full knowledge is always available via live-parse; the graph never depends on blocks | Avoids a Logseq-style over-committed foundation; defers cost to where it actually buys something. |
| 2026-07-20 | Block links: portable heading-level link in the note + block-precision refinement in the source sidecar (Option 1) | Other editors drop the reader at the heading; Coal resolves to the exact block; the note stays clean and portable. |
| 2026-07-20 | Durability via a Git-backed **diff-ratchet** (re-anchoring is a diff, not a guess); honest degradation — only genuinely ambiguous cases surface for confirm, never a silent mis-point | Continuous baseline refresh keeps each re-anchor a small hop and dissolves fingerprint drift; a stronger contract than silently-rotting markers. |
| 2026-07-20 | First-class **Reconciliation Engine** (watcher + dirty-check + off-thread ratchet + startup pass + Git hooks); foreign renames paired by content/id/Git `-M`; runs off the main thread | The maintenance plan needs a guaranteed, robust, non-blocking executor baked in from the start; off-thread avoids the synchronous-resolution freeze/data-loss failure mode. |
| 2026-07-20 | Overlay storage: **mirrored, lazy, per-file JSON sidecars** under `.coal/` | Churn + merge locality (multi-device sync) and note-folder purity; monolithic / sharded / co-located layouts all rejected. |
| 2026-07-20 | Dangling links: **current-note** side panel (two groups: Broken / Needs attention) + vault-wide management via a housekeeping settings surface, with `M-x` twins | Low ambient noise in the working view; deliberate full-corpus management on demand; keyboard-first. |
| 2026-07-21 | Frozen normalizer (§13.11): a versioned, lexical, parser-free function shared by minter + matcher — kind-aware payload extraction, then NFC · LF · whitespace-collapse · a fixed typographic-fold table · locale-invariant case-fold · **markup preserved**; `normHash` = truncated SHA-256, `normVersion` stamped | The normalizer is an identity key, not the durability mechanism (the ratchet is), so it stays conservative — both over- and under-normalizing degrade to a confirm, never a mis-point. Coal emits only literal keyboard text (monospace, no ligatures) so drift enters only via import/foreign editors; the small folds serve exactly that. Serves portability (bytes untouched), compatibility (tolerates other editors), and efficiency (O(1) hash key). |
| 2026-07-21 | Confidence thresholds (§13.12): silent-resolve is a hard AND-gate — G1 content (`normHash`-exact **or** simhash-64 `d≤3`) ∧ G2 corroboration (position=near **or** neighbor≥0.5) ∧ G3 margin (`C1−C2≥0.15`) — over a content-dominant score `C = 0.60·content + 0.25·neighbor + 0.15·position`; below a `0.45` floor is dangling, everything plausible-but-ungated confirms (amber). Diff-certain location (Path 1) resolves silently up to `d≤12`, confirms drifted (`d≥13`); inferred location (Path 2) demands near-exact content. Candidate set = home note, cap 16, LSH `d≤20`; simhash minted for ≥12-token blocks; constants stamped as `resolverVersion` | The one failure stand-off identity forbids is the silent mis-point (§13.6), so content is a gate position/neighbors can only corroborate — never substitute for; the `0.45` floor sits below the `0.54` any content-identical candidate scores, making "content still exists → never dangle" a structural invariant. Both normalizer failure directions and every `normVersion` gap fail closed to a confirm. |
| 2026-07-21 | Sidecar schema & id format (§13.13): opaque id = `<tag>_<26-char lowercase-Crockford-base32 of 128 CSPRNG bits>` (tags note/hdng/blok/link; no wall-clock; `hdng` reserved, headings not persisted); per-note committed `.json` registry = ids + kind/kindTag + durability fingerprints (`normHash`-128 / `simhash`-64 / neighbors-64) + link intent (`href`, `target` ids); volatile range/structural-path/status and all title/alias/backlink projections are Tier-2 git-ignored; **no verbatim note text committed**; frozen canonical JSON writer (UTF-8/LF, 2-space, one-key-per-line, all keys sorted, defaults omitted, byte-identical re-serialization); `schemaVersion=1`, `normVersion="1"`, `resolverVersion="1"` | Random beats time-sortable because the registry is an unordered id-keyed map, so a clock is pure liability (skew + creation-time leak) while 128 random bits give coordination-free multi-device uniqueness (§10). Committing fingerprints not bytes keeps the Overlay portable and merge-friendly (§13.8) without mirroring plaintext content into the repo (§10.2); a frozen writer prevents silent churn the way the frozen normalizer prevents silent misses (§13.11). |
| 2026-07-21 | Backlinks panel UX (§13.14): a `coal.backlinks` right-dock leaf (sibling to `coal.dangling`, default-stacked, `auto_show=false`, follow/pin); one Tier-2 projection, two front-ends (panel + `backlinks-jump` minibuffer preview). **Linked** = stable-id sidecar inversion; **Unlinked** = Aho-Corasick scan of the §13.11-normalized {stem, H1, aliases} name set over each note's normalized text (offset-mapped to raw bytes, token-boundary, exact-after-normalization, `normVersion`-stamped). Shared §13.5 block-precision sigils (`· § ◆ ◇` + last-known); the sole mutating action **promote** writes a portable zero-identity wikilink into the *source* note (note-level, confirm-gated, ambiguity → path-qualified); all affordances `backlinks-*` commands with `M-x` twins; `[backlinks]` TOML config | Stand-off identity (§13.1) forces the Linked/Unlinked split — one group Coal knows by id, one it guesses by user-visible name — and dictates the only legal write is an authored reference into the source note; computing at reconcile and reading at panel time keeps it a regenerable Tier-2 projection (§13.2/§13.7); two front-ends onto one registry is §8 applied to a data surface. |
| 2026-07-21 | Git posture (§13.15): **commit the hash, cache the bytes** — the diff-ratchet baseline is bootstrapped from current bytes at any consistent state (full-file `baseline.hash` committed as the consistent-vs-divergent gate), with the baseline bytes kept as a git-ignored Tier-2 cache (purged on lock, regenerated); re-anchoring, reconciliation, foreign-rename pairing and dangling detection are a total function of Tier 0 + Tier 1, provably Git-free. Git is a strictly-additive layer admitted only under a monotonicity rule (divergent-baseline recovery via `baseline.commit`, large-leap re-anchor via deepened history, committed-rename via `--find-renames=50%`, Post-Git changed-set scoping) raising a verdict only up `dangling<ambiguous<resolved`. Sidecar merges resolve by markerless id-sorted serialization + a `coal-overlay` structural driver + recompute-from-bytes-on-open; only differing link `target.block` intent ever reaches the user; Tier 2 stays git-ignored and regenerated | Honors "plain text is the source of truth" and "Git-native but never required for correctness": a never-committed, repo-less vault resolves identically to a committed one, and verbatim user content stays out of the committed tree (§10.2); Git only ever saves a keystroke or a stat-walk. |
| 2026-07-21 | Encryption mechanism (§10.3): one scheme for **both** remote and local at-rest — **app-managed decrypt-to-memory** with **`age`/`typage`** (ChaCha20-Poly1305 / X25519, in-process TS, no external binary). Notes are ciphertext `age` files at rest, so Git versions opaque blobs (no clean/smudge filter), re-encrypted only on real change (randomized → no equality leak). **Single vault X25519 identity, passphrase-wrapped** (`age` scrypt-passphrase, clamped) in a Bitwarden-style hierarchy (passphrase→KEK→identity→per-note keys), so device onboarding = clone + passphrase and rotation re-wraps one key. Unlock holds the key in the main process only, **lock = purge** (optional GNOME Secret-Service cache); `textconv` + a decrypt→3-way→re-encrypt merge driver give diffs/merges. **Overlay encrypted too** (closes the §13.15 leak); **config stays plaintext**; portability via standard-`age` + import/export (amends §13.1). Metadata (names/sizes/history) deliberately not hidden. | Delivers §10.2 (content ciphertext on the remote **and** at rest) from one in-process mechanism on vetted primitives — no git-filter, no external tool. The decrypt-to-memory + single passphrase-wrapped vault key mirrors password-manager practice (Bitwarden) and keeps multi-device onboarding to 'clone + passphrase'; `age` keeps the format open (CLI-decryptable) so import/export preserve portability. Metadata leak is accepted (mitigable by a private/self-hosted remote), not solved. Grounded by the reference/19 survey. |
| 2026-07-21 | Supported systems (§3.1): Linux primary — **RPM at launch**, DEB + Flatpak post-launch; **macOS** post-launch; **Android APK-only** (sideloaded, no store) post-launch; Linux stays first-class, others additive | Broadens reach without diluting Linux-first (§2): only RPM is a launch commitment, macOS/Android are committed targets held to the same native-feel bar; per-platform build work is tracked in `TODO.md`. |
| 2026-07-21 | Markdown ⇄ Org feature parity within Coal (§5): every Coal content feature works symmetrically for both syntaxes; parity is scoped to Coal's own features, not to re-implementing Org-application features in Markdown | Makes explicit an invariant already implied by §5/§7.1/§13 — both formats are first-class, so Coal's own features never favor one; it is not a promise about the out-of-scope Org-application suite. |
| 2026-07-21 | Official (first-party) plugins (§8) + default theme **"Sublime"** (§8.1): Coal ships trusted first-party "official plugins" over a minimal core (Obsidian's "core plugins" model), leaning into the extensible substrate; the bundled default theme is **Sublime** — dark-black background with sublime-green accents, delivered through the normal theme path. **[Superseded in part 2026-07-22 (kernel/plugin pivot): the "core vs official-plugin split stays open" is now largely resolved — almost everything is a plugin over a minimal kernel; the Sublime default is unaffected. See the 2026-07-22 entry.]** | Embraces Coal's Emacs-derived extensibility (§8) — as much as reasonable lives as official plugins over a small core; the default theme is a concrete visual anchor (values produced with the pre-build visual design). The concrete core-vs-plugin split stays open in `TODO.md`. |
| 2026-07-21 | Plugin management & enablement (§8.3): installed plugins + enabled/disabled state live in a declarative `.coal/config/PLUGINS.<ext>` file (TOML per §9), managed both by editing the file and from the Settings UI (which reads/writes the file, no shadow store §9); explicit `enabled`/`disabled` values; fixes `.coal/config/` as the config home. **[Superseded 2026-07-22 (kernel/plugin pivot): the single `.coal/config/PLUGINS.<ext>` file is replaced by the kernel-owned `.coal/config/` tree — `settings.toml` + `plugins.toml` roster + `plugins/<id>.toml`. See the 2026-07-22 entry and §8.3.]** | Applies §9 (plain-text source of truth, GUI-as-front-end) to plugins; explicit enablement lets a plugin be installed-but-disabled; third-party enable still routes through §8.2 consent. |
| 2026-07-21 | Data model settled (§13.10): a note is a **document with addressable sub-blocks, not an outliner**; core carries no outliner model; a fuller outliner ships as an **official plugin** layered over the plain-text document (never altering the core model or on-disk format §13.1) | Resolves the open data-model question in `TODO.md`: keep the core minimal and portable (§13.1), and deliver outlining as opt-in first-party extensibility (§8) rather than a core commitment; the plugin's own design remains open. |
| 2026-07-21 | Recovery-key backstop (§10.4): a **recovery key generated by default** at vault creation — a default, not a requirement, with a **real, reversible opt-out** (skip at creation + full removability in Settings). Mechanism = a **second `age` stanza** (random X25519 recovery recipient) on the wrapped vault identity, so either the passphrase or the recovery key unwraps it; Coal stores only the public recipient and **never the recovery secret** (not the repo, not the GNOME Secret Service). One-time **Emergency Kit** (standard `AGE-SECRET-KEY-…`, CLI-recoverable); recovery **forces a new passphrase** and offers a fresh key; rotate/remove are one small re-wrap. v1 = one key; N-recipients + FIDO2/WebAuthn are extension points | §10.3 makes the passphrase the sole gate and §10.2 puts real local data behind it, so a forgotten passphrase is otherwise permanent total loss — too sharp an edge to leave as the silent default for a notes app. `age`'s native multi-recipient support delivers the escape hatch with no bespoke crypto and no escrow, keeping zero-knowledge intact; default-on protects the common case while removability honors the §9 "default, not requirement" rule and contains the second-full-power-credential trade-off. |
| 2026-07-21 | Encryption posture (§10.2 / §2 principle #3): encryption at rest walked back from a hard **requirement** to a **first-class, built-in, opt-in core feature — off by default**, enabled per vault; **plaintext vaults are equally first-class** (a developer pushes readable files to a company repo; hassle-averse users skip it). Founding principle #3 softened from "private by default" → "privacy built in, opt-in"; §1 vision updated. The §10.3/§10.4 **mechanism is unchanged**, and encryption **stays core** (not a plugin). Adopts a standing guardrail (§8.2): the most dangerous capabilities — storage-codec / physical-representation, key custody, startup gating, ambient host authority — are **first-party-only, never third-party-consentable**; a pluggable storage seam is deferred until a genuine second consumer exists. **[Superseded in part 2026-07-22 (kernel/plugin pivot): the opt-in / off-by-default posture and the first-party-only privileged guardrail stand, but encryption is now a **first-party plugin** — not core — that fills the storage-codec / startup-gate / key-custody seams, which are built now rather than deferred. See the 2026-07-22 entry and §10.2.]** | Optionality (not plugin-ness) was the real goal, and it is met without exposing the app's most dangerous seams to community plugins or building a general storage seam speculatively for one consumer; keeping encryption core changes the just-ratified mechanism the least. The guardrail keeps Coal's private-when-enabled posture from ever hinging on users judging un-judgeable "control all your files / hold your keys" consent dialogs. |
| 2026-07-21 | Interaction model (§6 / §2 principle #4): **Emacs *and* Vim keymaps both ship out of the box**, chosen at **first run** (no baked-in default), declaratively switchable (§9), with **full feature parity** (every command bound in both, each modeled on the closest counterpart in its editor) and **fully-supported Vim modes**. Delivered as **bundled official plugins** over a core command-substrate + minibuffer + **input-mode seam**; the **minibuffer is unified** — Emacs `M-x`/`M-:`, Vim `:` ex line + `/` search + mode indicator. Founding principle #4 widened from "Emacs keybindings" → "Emacs and Vim keymaps"; §1 vision widened to "Emacs or Vim." Registered in `PLUGINS.md`. **[Superseded in part 2026-07-22 (kernel/plugin pivot): both keymaps now live in the **kernel**, not as bundled official plugins — the input layer is fundamental to a keyboard-first editor. They still bind through the public command/keybinding API, and community keymaps remain a safe extension. Removed from `PLUGINS.md`. See the 2026-07-22 entry and §6.]** | Serves the widest editor audience (the "VSCode/Obsidian/Emacs/Vim in one" aim) on Coal's extensible substrate. The input-mode seam is *safe* (touches no files, keys, or network) and has **two real consumers from day one**, so — unlike the storage seam — it sits on the community-open side of the §8.2 guardrail and is justified now, not speculatively. |
| 2026-07-21 | v1 surface roster + workspace shell (§14): everything in `SPEC.md` + `TODO.md` is v1 (no deferred tier). The **workspace shell** is **hybrid** — a keyboard-first spine (minibuffer open; Emacs **windows** as the sole split primitive; per-window **tabs**) with a **left** file-tree sidebar and a **quick switcher**, all default-on; the **right** dock stays the §13 panels. The roster **adds**: the bidirectional **Links panel** (§13.14 extended — *Links to* outgoing = own-sidecar read, above *Linked from*; Dangling stays the outbound-broken alarm, so Links-to / Linked-from / Dangling are three disjoint surfaces), an internal-only **hover preview** (reuses the §13.14 peek engine), an **outline/TOC panel**, a **word-count** status element, the **quick switcher**, and **templates** (proposed official plugin, `PLUGINS.md`). Deep design of graph, embeds, search, tags, daily notes, templates, and the shell's keybindings/session-persistence each spin out as their own `TODO.md` sessions. Deliberate boundary: **no GUI properties editor** — frontmatter is edited as text (§7.1 / §2). Obsidian's separate tab-group abstraction is rejected (a window already models layout). | Owner-first dogfooding makes "v1" = "the owner can live in it," so the surface set is enumerated once as a build target rather than discovered ad hoc; the hybrid shell honors keyboard-first (§2 #4) without denying Obsidian switchers the tree/tabs. Surfacing connections **both** directions is the point of a PKM tool — the app should show the graph, not make you reconstruct it by scrolling — while the disjoint Links-to / Linked-from / Dangling split preserves §13.14's no-double-count invariant. Hover-preview and quick-switcher reuse existing mechanisms (peek §13.14; the §13.11 name set) rather than new machinery. |
| 2026-07-23 | **Keymaps as convention templates (§6.1).** The Emacs and Vim keymaps are **default keybinding templates populated with Coal's own commands, not reimplementations** of either editor. Derivation runs **Coal-outward** — each Coal command gets an Emacs-idiom and a Vim-idiom binding chosen in the spirit of each platform's philosophy; a key the source editor binds to a command Coal lacks (e.g. Emacs `M-$` → `ispell-word`) stays **unbound**, not inherited; Coal-original commands get **invented** idiomatic bindings in both. **Parity = coverage + idiom, not behavioral replication**: every command reachable and idiomatic in both keymaps, bound through the one command / keybinding API (§8) to the same registry commands — a maintained, testable invariant. Refines (does not supersede) the §6 "full feature parity" bullet. | The keymap model had been a recurring source of ambiguity — borrow Emacs/Vim *conventions* vs. reimplement their *commands*. Pinning it down stops scope creep toward cloning either editor, keeps the command set unambiguously Coal's, and anchors the parity invariant the upcoming minibuffer + keymap work depends on. |
| 2026-07-22 | **Kernel/plugin pivot (§1/§2/§8; touches §4/§6/§7/§10/§13/§14).** Re-found the core/plugin split around a **minimal, general-purpose, keyboard-first kernel** (raw presentation + navigation; usable with zero plugins) and **re-home the entire feature set as bundled first-party plugins** on the public API (Markdown/Org + Live Preview, linking/PKM, **Git**, **encryption**, search, tags, templates, …). The kernel dogfoods the **same public API** (core-as-plugins made *literal*). **Both keymaps, the syntax-highlighting engine, and the workspace shell move into the kernel**; grammars are auto-activating passive-provider plugins; official feature plugins are bundled **off by default**. **Two-tier trust:** first-party bundled = fully trusted (only tier eligible for the privileged class); third-party = blocked-by-default (one global gate) + realm-bounded to declared, scoped, least-privilege caps under informed per-plugin consent. **Capability catalogue** (`document`/`vault`/`network`/`process`/`clipboard`) + **privileged class** (`storage-codec`/`startup-gate`/`key-custody`, first-party only; no `ambient`/raw-Node cap). Config surface = kernel-owned `.coal/config/` tree (`settings.toml` + `plugins.toml` roster + `plugins/<id>.toml`), replacing `.coal/config/PLUGINS.<ext>`. Manifest = `plugin.toml`; host API SemVer with an N-1 compatibility window + graceful degrade; lifecycle = lazy activation + hot enable/disable + kernel auto-disposal ledger + error isolation; third-party = pre-built-JS-only over open-source git repos, manual updates. **Supersedes in part** the 2026-07-21 "encryption stays core / storage seam deferred," "keymaps as bundled official plugins," "core-vs-plugin split stays open," and "`PLUGINS.<ext>`" decisions (marked above). Theming is a separate, queued design session. Full design: [`docs/superpowers/specs/2026-07-22-plugin-system-design.md`](docs/superpowers/specs/2026-07-22-plugin-system-design.md). | The prior spec baked PKM / encryption / git in as privileged **core**, so "core-as-plugins" was aspirational, not load-bearing. Re-homing them as first-party plugins makes it structural — a feature the flagship suite can't reach is an API gap **by construction** — and yields a small, fast, hackable substrate whose value *is* the extension API. It is a re-homing, **not a feature cull**: what changes is the layer, the delivery (opt-in), and the trust anchor (core-membership → first-party bundling). Encryption stays tractable because the privileged class it needs is reserved to first-party-audited code, and the kernel never learns crypto. Keymaps go to the kernel because a keyboard-first editor must be operable with zero plugins. |
| 2026-07-23 | **Config is two-scope-by-ownership (§9 / §8.3).** Configuration is scoped by *who owns a setting*, not by tree location. **User/global scope** — user-preference kernel settings (keymap choice, editor-engine basics, theme) — lives per-user (`$XDG_CONFIG_HOME/coal`) and travels with the **user**, available with no vault open. **Vault/project scope** — plugin enablement, encryption, per-vault overrides — stays in `<vault>/.coal/config/` and travels with the **repo** (§9). Re-homes §8.3's kernel-user `settings.toml` keys to the global layer; the vault tree keeps vault-scoped config. **Kernel build-sequence step 3 builds only the global layer** — the config loader + schema + comment-preserving TOML round-trip (via `@decimalturn/toml-patch`, kept in `main` so `kernel/` stays dependency-free) + the `keymap` slot (unset, persisted for step 4's first-run prompt); the vault layer arrives with the workspace/PKM slices. Full design: [`docs/superpowers/specs/2026-07-23-config-loader-design.md`](docs/superpowers/specs/2026-07-23-config-loader-design.md). | The kernel is a usable editor that needs no vault (the editor identity), while the vault is a PKM-plugin concept (linking/Git/encryption need a bounded root) — so kernel-user config naturally travels with the user and vault config with the repo, the VS Code User-vs-Workspace / Obsidian app-vs-vault split. Resolves the "config has no home when no vault is open" gap the kernel build exposed, without walking back either identity; §9's plain-text / version-control invariants hold per scope. |
