# Coal — The command + keybinding system (kernel build-sequence step 4, pivoted) — design

Date: 2026-07-24
Status: accepted (design session). Fourth implementation design for the **kernel**, and a **design
pivot**: it *replaces* the former step 4 ("both keymaps — Emacs + Vim — bound through the public
keybinding API + the first-run keymap prompt") with a single, Emacs-modeled command-and-keybinding
system. Thickens the [walking skeleton](2026-07-22-kernel-walking-skeleton-design.md) (§1.1) on top of
step 2 (the [command minibuffer](2026-07-23-command-minibuffer-design.md)) and step 3 (the
[config loader](2026-07-23-config-loader-design.md)). It rewrites `SPEC.md` §6 / §6.1.

## The pivot, in one sentence

Coal drops the "two first-class keymaps (Emacs *and* Vim), chosen at first run" model and the whole
modal / dual-personality apparatus, and adopts **Emacs's command architecture directly**: every action
in the app is a named **command**, every command is addressable **by name in the minibuffer**, and any
command **may** carry one or more user-definable **keybindings** — with a curated default keymap shipped
out of the box. This is modeled on Emacs, not a 1:1 copy of it; §9 records where we deliberately diverge.

## Problem

The keymap story had grown into three tangled commitments that this pivot cuts:

1. **Two full keymaps to build and maintain** (Emacs + Vim), with a **parity invariant** ("every command
   bound in both") as a permanent maintenance tax.
2. **A modal engine** (Vim normal / insert / visual, operators, text objects) riding the command
   substrate, plus a minibuffer with **two personalities** (`M-x` / `M-:` vs the `:` ex-line, `/` search,
   and a `-- NORMAL --` indicator).
3. **A first-run Emacs-or-Vim prompt** and a `keymap: 'emacs' | 'vim'` config choice gating all of it.

The insight driving the pivot: **the substrate already built is the model we actually want.** Step 1
stood up a single `CommandRegistry` where every command is a first-class object routed through one
`executeCommand` choke point; step 2 made every command reachable by name in the minibuffer; the
`KeybindingRegistry` already binds *keys → command id* (never key → code). That *is* Emacs's core
indirection. What remained unbuilt — a real multi-stroke key-sequence resolver, context-scoped
precedence, a curated default keymap, a user override surface, and the discoverability layer — is exactly
what makes the Emacs model usable. This slice builds that, and **subtracts** the dual-keymap/modal
apparatus rather than adding to it.

## 1. Scope

**In scope (the done-line):**

- **The key-sequence resolver** — a pure, Vitest-tested state machine that reads multi-stroke sequences
  (`Ctrl-x Ctrl-s`), walks prefix keys, and resolves to a command id in the active context. Replaces the
  exact-match `getBindingsForKeys` lookup.
- **The context model** — named boolean contexts (`minibufferOpen`, `editorFocused`, …) and a tiny `when`
  expression evaluator, activating the dormant `Keybinding.when` field.
- **Explicit precedence** — config-over-default, scoped-over-unscoped, with genuine collisions surfaced as
  config diagnostics.
- **A curated default keymap** — an Emacs-flavored, fully-overridable starter table the kernel registers
  at boot (Appendix A).
- **The override surface** — a plain-text `keybindings.toml` in the user/global config scope, layered over
  the defaults, with an **unbind** form; live-reloaded through the step-3 config machinery.
- **The interactive bind flow** — `core.keys.bind` ("Set Key…") and `core.keys.unbind`, which capture a
  key sequence and write/remove a `keybindings.toml` entry via the step-3 comment-preserving TOML codec.
- **`readKeySequence`** — a new minibuffer primitive (capture a raw chord sequence), the counterpart to
  `quickPick` that the bind flow and Describe-Key need.
- **Discoverability (the three selected):** keybinding **hints in the palette** (reverse lookup),
  the **which-key continuation panel**, and **Describe Key / Describe Command** rendered in a new
  lightweight **echo area**.
- **The removals** — delete the `keymap` config enum, the first-run prompt hook, and rewrite `SPEC.md`
  §6 / §6.1 and the affected passages of `PLUGINS.md`, the build-sequence roadmap, and `docs/dev/kernel.md`.
- **Tests** across the three tiers, including an e2e for a multi-stroke binding, which-key, describe-key,
  and a bind-command round-trip into `keybindings.toml`.

**Explicitly out of scope** (each a later slice, all forward-compatible with this model):

- **Prefix / numeric arguments** (Emacs `C-u`, `M-<digit>`) and **keyboard macros**.
- **List All Bindings** (`describe-bindings` / `C-h b`) — the full active-keymap dump.
- **Per-vault (project-scoped) keybindings** — there is no vault concept until steps 5/7 (config-loader
  design §2); bindings are user/global-scoped for now.
- **The plugin-facing registration API** — there is no plugin loader until step 5; the kernel registers
  its own commands, keybindings, and contexts through the same public APIs a plugin later will.
- **Modal editing of any kind** — no input modes, no mode indicator, no dedicated seam (§9.1).

## 2. The core model — four layers, two laws

Coal expresses Emacs's indirection in four layers. Three exist in code today; only the fourth is new.

```
CODE                COMMAND                       KEYMAP                       KEY SEQUENCE
────                ───────                       ──────                       ────────────
run(ctx)      ──►   { id, title, run, ... }  ──►  keys → command-id      ──►   "Ctrl-x Ctrl-s"
the handler         CommandRegistry               KeybindingRegistry           KeySequenceResolver
                    (step 1)                       (step 1, extended)           + contexts  (NEW)
                        ▲                                                              │
                        └──────── the minibuffer runs ANY command by id ◄─────────────┘
                                  core.command.execute  =  M-x   (step 2)
```

- A **Command** is Emacs's "interactive function symbol", but with first-class metadata (`id`, `title`,
  `category`, `description`) instead of a flag buried inside a function body — an explicit registry, not
  an obarray scan.
- A **keybinding** points at a command **id**, never at code. So a command may have **zero, one, or many**
  bindings, and an unbound command is still fully runnable by name in the minibuffer (Emacs: "most
  commands have no key binding").

**Law 1 — every user-triggerable behavior is a registered command.** Menus, buttons, the palette, and
every keybinding are *front-ends that dispatch a command id* through the one `executeCommand` choke point.
Nothing in the app is reachable except through the registry. (Coal already routes menu + palette + keys
through a single `dispatch()`; this promotes the pattern from convention to enforced invariant — the
concrete meaning of "every function of the app should have an associated command.")

**Law 2 — keys bind to command ids, never to code.** Rebinding is repointing a key at a different id;
it never touches a handler. Already true in the `KeybindingRegistry`; formalized and protected here.

## 3. Commands

The `Command` shape (`src/kernel/command/types.ts`) is unchanged except for one addition — an optional
**`description`** (a doc string), so Describe-Command has something to show beyond the one-line `title`:

```ts
export interface Command {
  readonly id: string;            // "namespace.verb-noun"; "core." reserved for the kernel
  readonly title: string;         // minibuffer label
  readonly category?: string;
  readonly description?: string;  // NEW — longer doc, shown by Describe Command
  run(ctx: CommandContext): void | Promise<void>;
  isEnabled?(ctx: CommandContext): boolean;
}
```

The `CommandRegistry` (single registry, `executeCommand` choke point, `core.*` reserved, duplicate-id
throw) is unchanged. Law 1 adds one enforced guarantee (§14): **every registered command has a non-empty
`title` and is therefore addressable in the minibuffer** — replacing the deleted "bound in both keymaps"
parity test.

## 4. Key sequences and the resolver

### 4.1 Canonical keys

Every physical chord normalizes to a canonical string: modifiers in a fixed order (`Ctrl-`, `Alt-`,
`Shift-`, `Meta-`) followed by a base-key token; a **sequence** is space-joined chords:

```
"Ctrl-x Ctrl-s"      "Alt-x"      "Ctrl-c Ctrl-c"      "Ctrl-Shift-p"
```

- The base-key token derives from **`KeyboardEvent.code`** (physical position) for letters/digits, so
  bindings are keyboard-layout-independent — the walking-skeleton design already recommended `.code`, and
  today's `main.ts` uses `event.key`, which this slice corrects. Named keys use canonical names
  (`Enter`, `Tab`, `Escape`, `ArrowDown`, `F1`, …).
- **Shift is an explicit modifier**, never folded into the character (`Ctrl-Shift-p`, not `Ctrl-P`) —
  matching Emacs's explicit-modifier model and the string convention already in the code.

### 4.2 The prefix-key invariant (Emacs's rule, kept)

**A key sequence is either a prefix or a complete binding — never both.** `Ctrl-x` is a prefix (it has
continuations); `Ctrl-x Ctrl-s` is a complete binding (it resolves to a command). A configuration that
tries to bind *both* a sequence and something that extends it (e.g. `Ctrl-x Ctrl-s` **and**
`Ctrl-x Ctrl-s Ctrl-x`) is a **conflict**: it is rejected at load with a config diagnostic, and the
prefix wins. This invariant is what keeps the resolver **deterministic and timer-free** — there is no
"wait to see if a longer sequence is coming" ambiguity, because a complete binding can never also be a
prefix. (This is a refinement over the design-conversation sketch, which floated a disambiguation
timeout; grounding the design in Emacs's actual rule removed the need for one, and keeps the kernel pure
with no timing dependency.)

### 4.3 The resolver state machine (pure kernel)

`KeySequenceResolver` holds a **pending sequence** (empty when idle) and, on each app-level chord:

1. Append the chord to the pending sequence.
2. Query the keymap for bindings whose `keys` **start with** the pending sequence **and** whose `when`
   is satisfied in the current context (§5).
3. Branch:
   - **Complete match** (a satisfied binding whose `keys` equal the pending sequence — and, by §4.2, it
     has no live continuations): **dispatch** the winning command id via `executeCommand`; reset pending.
   - **Live prefix** (satisfied bindings exist but all are longer than pending): **stay pending**;
     expose the pending sequence + its continuations (which-key reads this); wait for the next chord.
   - **No match**: if the pending sequence was a **single** chord, it was never ours — **fall through to
     the editor** (§9.1); if we were **mid-sequence**, abort with "`<sequence>` is not bound" in the echo
     area and reset.
4. `core.abort` (Emacs `keyboard-quit`, `Ctrl-g`) resets pending from any state and closes the minibuffer.

The resolver takes the current context as data at resolve time and holds **no DOM and no timers** — it is
a pure function of (keymap, pending sequence, chord, context). which-key's *display delay* is a renderer
concern, not resolver state.

*Alternative rejected:* modeling explicit stacked keymap objects (global / view / minibuffer maps)
resolved top-down — the "faithful layered keymaps" option. A single flat binding list filtered by `when`
+ specificity is more transparent: you can always enumerate *why* a key won, which is precisely what the
discoverability layer (§8) exists to show. The layered-map approach re-imports Emacs's own "which map
wins" opacity (the reason Emacs users reach for `C-h b`).

## 5. Contexts and precedence

**Contexts** are named booleans the resolver reads: `editorFocused`, `minibufferOpen`, and later
per-view contexts (`graphView`, `fileTree`, …). A small `ContextRegistry` (pure) holds the current
values; the renderer adapter flips them on focus/open/close. **`when`** is a tiny boolean expression over
context names — the minimal grammar: a bare name, `!name`, `a && b`, `a || b`, parenthesization. Parser
and evaluator are pure and Vitest-tested.

**Which surface owns a key** follows from focus: the focused surface determines the eligible context set,
and any chord it does **not** claim goes to that surface's native handling — editor text to CodeMirror,
minibuffer text to the `<input>`. This is how the minibuffer-local keys (accept / cancel / move) become
ordinary registry bindings scoped `when: "minibufferOpen"` (formalizing step 2's interim imperative
handling), and how a future view scopes its own bindings without a modal engine.

**Precedence** (most-specific satisfied binding wins), explicit rather than Emacs's implicit map stack:

1. **Layer:** a `keybindings.toml` (user) binding beats a kernel-default binding for the same sequence.
2. **Specificity:** within a layer, a satisfied `when`-scoped binding beats an unscoped (global) one.
3. **Collision:** a genuine same-sequence, same-specificity clash is **not** resolved silently — it is
   reported through the `ConfigDiagnostic` channel under a new `kind: "binding-conflict"` (added to the
   step-3 diagnostic union), so the user sees it. The unbind form (§7) is the escape hatch.

## 6. The default keymap

The kernel registers a curated, **Emacs-flavored** default table at boot (as it already registers its
interim keys, but as a real, prefix-based table). These are ordinary bindings — **fully overridable** by
`keybindings.toml`, and each may be removed with the unbind form. The starter table is Appendix A; its
exact contents are tunable during implementation without reopening this design. Commands with no natural
key (e.g. `core.config.open`) ship **unbound**, deliberately demonstrating Law-2's "a command needs no
binding — it is still reachable by name."

## 7. Overrides: `keybindings.toml` + the bind command

**The override file** lives in the user/global config scope alongside `settings.toml` (config-loader
design §8: Electron `userData`, e.g. `~/.config/coal/`), materialized from a commented default template
when absent, validated non-destructively, and **live-reloaded** through the exact step-3 machinery
(load / validate / diagnostics / comment-preserving `set` / change broadcast). It is a **separate file**,
not a section of `settings.toml`, because it is a homogeneous list (mirroring the settings.json /
keybindings.json split) and keeps `settings.toml` scalar-clean.

Shape — an array of tables, layered over the defaults:

```toml
# Rebind save to a Ctrl-c prefix (overrides the default Ctrl-x Ctrl-s)
[[keybinding]]
keys = "Ctrl-c s"
command = "core.file.save"

# Scope a binding to a context
[[keybinding]]
keys = "Ctrl-n"
command = "core.minibuffer.next"
when = "minibufferOpen"

# Remove a default outright, without replacing it (Emacs: bind to nil)
[[keybinding]]
keys = "Ctrl-x Ctrl-c"
unbind = true
```

**The interactive bind flow** — `core.keys.bind` ("Set Key…"):

1. `readKeySequence()` — the minibuffer captures a raw chord sequence (reusing the resolver's chord
   normalization; the sequence terminates when it resolves to a non-prefix or the user commits).
2. `quickPick` over the registry — choose the target command.
3. Write a `[[keybinding]]` entry into `keybindings.toml` via the step-3 comment-preserving codec.

The **file stays the source of truth**; the command is only a writer over it (config-loader design's
"the GUI and a human edit the same file, no shadow store"). Its inverse is `core.keys.unbind` (capture a
sequence → write an `unbind = true` entry, or drop the user entry if one exists).

## 8. Discoverability — the relation made visible

- **Keybinding hints in the palette.** The command palette annotates each row with the command's current
  binding, resolved by a new **reverse lookup** `getBindingsForCommand(id)` on the registry (the inverse
  of `getBindingsForKeys`), picking the highest-precedence binding in the current context — Emacs's
  `where-is`, surfaced where users already look. `QuickPickItem` gains an optional right-aligned
  **key-hint** field (the step-2 primitive already anticipated this: "description … later a keybinding").
- **which-key continuation panel.** While the resolver sits in a live-prefix state past a short renderer
  display delay, a panel lists the available continuations — each candidate's next chord + the command's
  `title`. The kernel answers "given this pending sequence + context, list the continuations"; the
  renderer draws it.
- **Describe Key / Describe Command.** `core.help.describe-key` (capture a sequence → show the command it
  resolves to in the current context, plus its `description`) and `core.help.describe-command`
  (`quickPick` a command → show its bindings via the reverse lookup, plus its `description`). Both print
  into a new lightweight, transient **echo area** — a bottom-of-window text surface (Emacs's echo area /
  `*Help*` buffer, minimized), also used for the "`<sequence>` is not bound" messages from §4.3.

Deferred (not selected for this slice): **List All Bindings** (`describe-bindings`).

## 9. Deliberate divergences from Emacs

This is modeled on Emacs, not a clone. The intentional differences:

### 9.1 Ordinary typing is not a command

CodeMirror 6 owns the text buffer and all insertion/editing. Coal's command/keybinding layer sits
**above** CM6 and claims only app-level chords/sequences; any chord that is not a live binding or prefix
in the current context **falls through to CodeMirror**. Emacs routes every keystroke — even
`self-insert-command` — through its command loop; Coal deliberately does not, because the editor engine
is a separate, trusted subsystem we are not reimplementing. Coal's "command loop" is a thin
**pre-dispatch** layer, not the universal input path. (Users *may* bind a bare printable key to a
command; contexts keep that sane. It is allowed but unusual.)

### 9.2 The rest

- **First-class command objects** (id / title / category / description / isEnabled) instead of an
  `interactive` flag + obarray scan.
- **Explicit `when`-contexts** instead of the implicit active-map precedence stack — chosen for
  "why did this key win" transparency (§4.3).
- **Declarative TOML as source of truth** instead of init-file *code*. Bindings are data; the bind
  command writes data; there is no arbitrary-code init.
- **Mechanically-reserved namespace** (`core.*` for the kernel, enforced by the registry) plus
  user-config-always-wins layering — replacing Emacs's *socially* enforced "`C-c` is yours" convention
  with a real rule.
- **One canonical key representation** instead of Emacs's string-vs-vector duality and Meta-bit baggage.

### 9.3 Modal editing is fully out of scope

No input modes, no normal/insert/visual states, no mode indicator, no dedicated input-mode seam. Coal is
single-mode ("always insert"), and the minibuffer has **one** personality (command/`M-x` + reading
input). If modal editing is ever wanted, it is an ordinary future plugin built on the same commands +
keybindings + contexts as everything else — with **no privileged kernel hook**.

## 10. Module layout

```
src/kernel/command/
  types.ts                 # + Command.description; Keybinding.keys now a sequence
  commandRegistry.ts       # unchanged (choke point, core.* reserved)
  keybindingRegistry.ts    # extended: sequence storage, getBindingsForCommand (reverse),
                           #   continuation query, unbind entries
  keySequenceResolver.ts   # NEW — the pure prefix-key state machine
  context.ts               # NEW — ContextRegistry + `when` parser/evaluator
src/kernel/config/
  keybindings/             # NEW — schema, validate, defaultTemplate for keybindings.toml
  (schema.ts/types.ts)     # remove the `keymap` enum + KernelSettings.keymap
src/kernel/minibuffer/
  types.ts                 # + QuickPickItem key-hint field; ReadKeySequenceOptions
  (readKeySequence)        # new primitive shape (impl in the renderer adapter)
src/main/
  configService.ts         # own keybindings.toml alongside settings.toml (same lifecycle)
  guards.ts / menu.ts      # drop keymap; menu items still dispatch command ids
src/renderer/
  main.ts                  # replace the two dispatch paths with the resolver-fed input path
  minibuffer.ts            # readKeySequence; palette key-hint rendering
  whichKey.ts              # NEW — the continuation panel (DOM)
  echoArea.ts              # NEW — transient message/help surface (DOM)
  keyInput.ts              # NEW — KeyboardEvent → chord; feeds the resolver; CM6 fall-through
```

**Kernel (pure, no DOM/Electron/timers):** key normalization, the extended binding store, the resolver,
the context model + `when` evaluator, the keybindings config schema/validation. **Renderer adapter:**
`KeyboardEvent` → chord, feeding the resolver, maintaining context booleans, which-key, echo area, and
CM6 fall-through. This preserves the hexagonal split the kernel already holds.

## 11. Config changes

- **Remove** `KeymapChoice`, `KernelSettings.keymap`, `KEYMAP_VALUES`, the `keymap` entry in
  `KERNEL_SETTING_KEYS`, the `guards.ts` keymap validation, and the `document.body.dataset.coalKeymap`
  reflection. `settings.toml`'s commented `# keymap = "vim"` line is dropped from the default template.
- **Add** `keybindings.toml` as a second kernel-owned config artifact in the **same** global scope, with
  its own schema (an array of `{ keys, command, when? }` / `{ keys, unbind }` tables), non-destructive
  validation (unknown keys and unresolvable command ids → diagnostics, entries left in the file), a
  commented default template, and the same load / reload / comment-preserving `set` / change-broadcast
  lifecycle `settings.toml` already has. `core.config.open` gains a sibling to open this file (or opens
  whichever the user asks for).

## 12. Doc reconciliation

- **`SPEC.md` §6 / §6.1** — rewritten from "two first-class keymaps (Emacs + Vim), first-run choice,
  parity invariant, modal Vim, two-personality minibuffer" to this single command-and-keybinding model:
  one curated default keymap, every command minibuffer-addressable, any command user-bindable, single
  editing mode, one-personality minibuffer. The "keymaps as convention templates" framing (§6.1) is
  removed.
- **`PLUGINS.md`** — the "both keymaps (Emacs and Vim) … are kernel" line is replaced by "the command
  substrate + keybinding system + minibuffer are kernel." Community keymaps **remain** ordinary plugins
  (binding keys is a baseline, capability-free plugin ability) — that statement stands and is now the
  *only* keymap-authoring story.
- **The build-sequence roadmap** (walking-skeleton design §1.1 item 4) and **`docs/dev/kernel.md`** —
  updated to describe step 4 as this system, and the minibuffer's "unified `M-x` / `:` / `/`" note
  narrowed to `M-x` + input.

## 13. Security posture

Unchanged trust boundary. Everything a key or the minibuffer triggers still routes through the one
`executeCommand` choke point — the future capability/audit enforcement point. `keybindings.toml` is
parsed by the same `main`-owned, comment-preserving TOML codec as `settings.toml` (kernel stays
zero-dependency); the bind command writes only that file, atomically. No new IPC privilege beyond a
second config file on the existing config channels.

## 14. Testing

- **Vitest node (the bulk):** the resolver (single chord, multi-stroke prefix walk, complete-vs-prefix
  invariant, mid-sequence dead-end abort, single-chord fall-through, `core.abort` reset); the `when`
  parser/evaluator; precedence (layer, specificity, collision → diagnostic); `getBindingsForCommand`
  reverse lookup and continuation queries; keybindings-config validation (unknown keys, unresolvable
  command ids, unbind entries).
- **Vitest browser:** the `keyInput` adapter (`KeyboardEvent` → chord, CM6 fall-through), which-key panel
  render, echo area, and `readKeySequence`.
- **Playwright `_electron` (smokes):** a **multi-stroke** binding drives byte-exact save
  (`Ctrl-x Ctrl-s`); which-key appears after `Ctrl-x`; Describe-Key reports a command; the bind command
  round-trips a new binding into `keybindings.toml` and the new key then works.
- **Invariant test (replacing the deleted parity test):** every registered command has a non-empty
  `title` (Law 1 — minibuffer-addressable), and the default keymap has no unresolved collisions.

## 15. Decision summary

1. **Pivot:** drop dual keymaps (Emacs + Vim), the parity invariant, modal editing, the two-personality
   minibuffer, and the first-run keymap prompt. Adopt Emacs's command architecture directly.
2. **Model:** code → command → keymap → key-sequence; two laws (every behavior is a command; keys bind to
   ids, not code).
3. **Resolver:** a pure, timer-free prefix-key state machine; a sequence is either a prefix or a complete
   binding, never both.
4. **Contexts:** explicit named-boolean `when` model with explicit precedence (config > default;
   scoped > unscoped; collisions → diagnostics) — chosen over faithful layered keymaps for transparency.
5. **Defaults:** a curated, Emacs-flavored, fully-overridable default keymap (Appendix A).
6. **Overrides:** a plain-text `keybindings.toml` (source of truth) + unbind form + an interactive
   `core.keys.bind` / `core.keys.unbind` that write it.
7. **Discoverability:** palette key-hints (`where-is`), a which-key continuation panel, and
   Describe-Key / Describe-Command in a new echo area. (List-All-Bindings deferred.)
8. **Divergences from Emacs:** typing is CM6's, not a command; first-class command objects; explicit
   contexts; declarative-TOML config; reserved namespaces; one key representation. (§9)
9. **Non-goals:** prefix/numeric args, keyboard macros, per-vault bindings, List-All-Bindings, all modal
   editing.

## Appendix A — starter default keymap (tunable)

Emacs-flavored, prefix-based, fully overridable. Illustrative, not frozen.

| Sequence            | Command                    | Emacs analog                    | `when`          |
|---------------------|----------------------------|---------------------------------|-----------------|
| `Alt-x`             | `core.command.execute`     | `M-x` execute-extended-command  | —               |
| `Ctrl-x Ctrl-f`     | `core.file.open`           | `find-file`                     | —               |
| `Ctrl-x Ctrl-s`     | `core.file.save`           | `save-buffer`                   | —               |
| `Ctrl-x Ctrl-c`     | `core.app.quit`            | `save-buffers-kill-terminal`    | —               |
| `Ctrl-g`            | `core.abort`               | `keyboard-quit`                 | —               |
| `Ctrl-h k`          | `core.help.describe-key`   | `C-h k` describe-key            | —               |
| `Ctrl-h x`          | `core.help.describe-command` | `C-h x` describe-command      | —               |
| `Enter`             | `core.minibuffer.accept`   | minibuffer `RET`                | `minibufferOpen`|
| `Escape` / `Ctrl-g` | `core.minibuffer.cancel`   | minibuffer `C-g`                | `minibufferOpen`|
| `Ctrl-n` / `ArrowDown` | `core.minibuffer.next`  | `next-line`                     | `minibufferOpen`|
| `Ctrl-p` / `ArrowUp`   | `core.minibuffer.prev`  | `previous-line`                 | `minibufferOpen`|
| (unbound)           | `core.config.open`         | —                               | palette-only    |
| (unbound)           | `core.config.reload`       | —                               | palette-only    |
| (unbound)           | `core.keys.bind`           | `keymap-global-set` (M-x only)  | palette-only    |

Note: `Ctrl-h` as the help prefix inherits Emacs's known `C-h`-vs-backspace tension; it is fully
remappable, and `F1` may be offered as an alias during implementation.

## Load-bearing references

- `SPEC.md` §6 / §6.1 (the interaction model this pivot rewrites), §8.2 (baseline plugin abilities —
  binding keys needs no capability), §9 (plain-text config model).
- [Command minibuffer design](2026-07-23-command-minibuffer-design.md) — `quickPick` / `readLine`
  primitives, the native-overlay minibuffer, and §8's note that the interim minibuffer keys formalize
  into `when: "minibufferOpen"` registry bindings (done here).
- [Config loader design](2026-07-23-config-loader-design.md) §1–§3, §6, §8 — the config lifecycle and
  global-scope location `keybindings.toml` reuses; the `keymap` slot this pivot removes.
- [Kernel walking-skeleton design](2026-07-22-kernel-walking-skeleton-design.md) §1.1 (build sequence;
  this is the rewritten step 4), §6 (command registry + choke point), and `.code`-vs-`.key` resolution.
- GNU Emacs Lisp Reference Manual — *Defining Commands*, *Interactive Call*, *Keymap Basics*,
  *Active Keymaps*, *Prefix Keys*, *Remapping Commands*, *Key Sequences*; GNU Emacs Manual — *Commands*,
  *M-x*, *Key Help*, *Rebinding*. (The command → symbol → keymap → key-sequence indirection Coal adopts,
  and the prefix-key invariant in §4.2.)
