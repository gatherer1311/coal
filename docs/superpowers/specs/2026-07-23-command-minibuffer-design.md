# Coal — Command minibuffer (kernel build-sequence step 2) — design

Date: 2026-07-23
Status: accepted (design session). Second implementation design for the **kernel**, thickening the
[walking skeleton](2026-07-22-kernel-walking-skeleton-design.md) with **step 2** of its build sequence
(§1.1): the command **minibuffer** and a `quickPick` primitive over the command registry the skeleton
already stood up. Grounded in `SPEC.md` §6 + §6.1 (interaction model; keymaps as convention templates)
and the [plugin-system design](2026-07-22-plugin-system-design.md) §6 (command-substrate primitives).

## Problem

PR #1 (the walking skeleton) shipped a real Electron + CodeMirror 6 editor that opens, edits, and saves
a single file byte-for-byte, with `core.file.open` / `core.file.save` / `core.app.quit` registered
through a minimal **command registry** and fired by a few hardcoded keys and native menu items — all
routed through one `executeCommand` choke point. The next slice makes those commands **reachable by
name**: a keyboard-driven minibuffer that fuzzy-finds a registered command and runs it.

**The central tension.** `SPEC.md` §6 defines the minibuffer as *"one element, two personalities"* —
Emacs `M-x` / `M-:` and Vim `:` / `/` + mode indicator. But the personalities are defined by the
**keymaps**, which are build-sequence **step 4** — not yet built. So step 2 cannot realize both
personalities; it must build the **substrate** (the minibuffer element, the `quickPick` primitive, and
one neutral consumer) such that the personalities plug in cleanly later, with neither keymap privileged.

## 1. Scope — substrate + command palette, personality-neutral

**Decision: build the neutral substrate now; both keymaps arrive co-equal at step 4.** This is the
walking-skeleton pattern applied again — the smallest end-to-end slice that is independently useful and
testable, dogfooding the existing command spine.

**In scope (the done-line):**

- A bottom-docked **minibuffer overlay** element in the renderer.
- A pure, Vitest-tested **`quickPick`** primitive: a fuzzy-filterable, keyboard-navigable candidate
  list that resolves to the chosen item (or `undefined` on cancel), plus the pure **fuzzy matcher** and
  **selection model** it is built from.
- One consumer — the **command palette** (`core.command.execute`): feed the registry into `quickPick`,
  run the pick through the existing `executeCommand`.
- An **interim open binding** (`Ctrl-Shift-P`) + a native menu item, plus **minibuffer-local**
  interaction keys (accept / cancel / move) handled while it is open.
- **One** Playwright `_electron` smoke driving it end-to-end (open palette → run "Save" → assert bytes).

**Explicitly out of scope** (each a later slice):

- **`readLine`'s implementation** and its Vim `:` / `/` consumers. `readLine`'s *shape* is designed here
  (§5) so the substrate is parity-complete, but it has no consumer until step 4, so implementing it now
  would be untested dead code.
- The **plugin-facing provider-registration API** ("minibuffer/quick-input providers", plugin-system
  design §6). There is no plugin loader until **step 5**; the palette reads the registry directly.
  `quickPick` / `readLine` are the primitives those future providers will call.
- **`when`-expression evaluation** (the enablement/context language) — deferred without an API break, as
  in the skeleton.
- Any **Emacs/Vim personality**: the `M-x` / `M-:` / `:` / `/` prompts, the mode indicator, and the
  real open bindings all land with the keymaps at **step 4**.

## 2. The parity invariant (load-bearing — `SPEC.md` §6 / §6.1)

Neither keymap may become a second-class citizen. This is enforced structurally, not promised:

1. **One registry, one choke point.** Both keymaps are equal front-ends: `C-x C-s` (Emacs) and `:w`
   (Vim) resolve to the *same* command through the *same* `executeCommand`. Neither has a path the
   other lacks. Already true in the skeleton; unchanged here.
2. **Keymap-neutral primitives.** The minibuffer exposes `quickPick` (filterable list) + `readLine`
   (single-line input) + a **mode-indicator slot** — *not* "a command palette." `M-x` = `quickPick`
   over the registry; Vim `:` = `readLine` + an ex-parser; Vim `/` = `readLine` + search; the
   `-- NORMAL --` indicator uses the slot. These are co-equal siblings on shared primitives. This slice
   designs the primitive shapes against **both** keymaps' needs even though it only wires the palette.
3. **"Every command bound in both" is a tested invariant.** Lands with the keymaps (step 4), in the
   spirit of the repo's other tested invariants (byte-exact IO). Recorded here as a committed guarantee.

Per §6.1, this is **coverage + idiom, not behavioral replication**: the minibuffer does not reproduce
Emacs's or Vim's editing model — which is exactly what lets §3 pick the simpler architecture.

## 3. Architecture — a native DOM overlay (not a nested CodeMirror)

**Decision: the minibuffer input is a native DOM element, bottom-docked, window-level chrome.**

Three homes for the input were considered:

- **Native DOM overlay** *(chosen)* — a positioned element with a native single-line `<input>` and a
  results list. Basic text editing (typing, cursor, clipboard, IME) comes free from the browser.
- **A CodeMirror 6 Panel** — really just *docking*; the input inside is still native or nested, and a
  panel is *editor*-scoped whereas the minibuffer is *window*-level chrome. Wrong ownership.
- **A nested one-line CodeMirror `EditorView`** — the Emacs "the minibuffer is a buffer" model. Its
  only real advantage is letting the *full keymap* drive the minibuffer's own editing — but §6.1
  establishes we are **not** reproducing either editor's editing model, so that advantage is a
  non-goal. It buys a second `EditorView`, focus handoff, and single-line wrangling for nothing.

Because parity is coverage + idiom (§2, §6.1), the native overlay is sufficient and simpler. The
minibuffer's *own* interaction keys (accept / cancel / move / history) are just more Coal commands that
will each get an Emacs-idiom and a Vim-idiom binding in the step-4 templates.

- **Bottom-docked**, Emacs/Vim-idiomatic; for `quickPick` the candidate list renders **above** the
  input and grows upward (capped height, scrollable). This is the natural home for the future `:` / `/`
  ex-line, `/` search, and `-- NORMAL --` indicator — a centered floating palette would feel wrong for
  `:w` to a Vim user. (The Obsidian-style *centered* quick switcher is a **separate** step-7
  workspace-shell surface, not this command minibuffer; not precluded.)
- **Window-level, not an editor child**, so it survives the future workspace shell's splits/tabs (§14.1)
  without re-parenting.
- **Hexagonal split** (matches `io/` + `fileService`): the logic is pure kernel; the DOM is a thin
  renderer adapter.

## 4. Module layout

```
src/kernel/minibuffer/        # pure, framework-free, Node-unit-tested
  types.ts                    # QuickPickItem, QuickPickOptions, ReadLineOptions, MatchResult
  match.ts                    # fuzzyMatch(query, text) -> { score, positions } | null
  quickPick.ts                # QuickPickModel: query/results/selection state machine (pure)
src/renderer/
  minibuffer.ts               # Minibuffer service: overlay DOM, focus, key handling; quickPick()/readLine()
```

`kernel/minibuffer` imports no DOM or Electron APIs; `renderer/minibuffer.ts` is the adapter that renders
the model and wires keys. `main.ts` (composition root) instantiates the service and registers the palette
command. There is **no new IPC channel** and no `preload` surface; the only main-process change is one
added native-menu item (§8) reusing the existing `menu-command` channel. The minibuffer's logic is
renderer-only.

## 5. The primitives

```ts
interface QuickPickItem {
  readonly id: string;          // stable identifier (e.g. a command id)
  readonly label: string;       // primary text (e.g. a command title)
  readonly description?: string; // secondary text, dimmed/right-aligned (e.g. category, later a keybinding)
}

interface QuickPickOptions {
  readonly prompt?: string;      // leading prompt label (">", later "M-x" / ":")
  readonly placeholder?: string; // empty-input hint
}

// Renderer service methods:
quickPick(items: QuickPickItem[], opts?: QuickPickOptions): Promise<QuickPickItem | undefined>;
readLine(opts?: ReadLineOptions): Promise<string | undefined>; // shape designed; impl deferred (§1)
```

Both resolve to `undefined` on cancel. `quickPick` is what ships; `readLine` (input only — what Vim
`:` / `/` and a future "rename / save-as" need) is designed for parity-completeness but implemented
when its first consumer exists.

**The pure selection model** (`QuickPickModel`) is where the testable logic lives, holding no DOM:

- constructed with the full item list;
- `setQuery(q)` recomputes the **filtered + ranked** results (via `match.ts`) and resets the selection
  to the top;
- `moveDown()` / `moveUp()` move the selection with **wrap-around**;
- `results` exposes the current ranked matches (with highlight positions); `selected()` returns the
  current `QuickPickItem` or `undefined` (empty results).

The renderer adapter owns only DOM + focus + key events, delegating every state decision to the model.

## 6. Fuzzy matching — hand-rolled, pure

**Decision: a hand-rolled subsequence matcher with scoring, in `kernel/minibuffer/match.ts`.** Not a
dependency — it is small, pure, fully TDD-able, and consistent with how the repo handles this size (the
IPC guards were hand-written rather than pulling a validator; `SPEC.md` §11 permissive-OSS posture; the
kernel stays lean). A command palette needs subsequence ranking, not substring: typing `saq` should rank
**Sa**ve **A**nd **Q**uit.

- `fuzzyMatch(query, text): { score, positions } | null` — case-insensitive; `null` when `query` is not
  a subsequence of `text`; `positions` are the matched character indices (so the DOM can bold them).
- Scoring rewards **contiguous runs**, matches at a **word boundary** (start, or after space `-` `_`
  `/` `.` or a camelCase transition), and **exact-case** hits; it penalizes gaps and leading distance;
  ties break toward the **shorter** label. An empty query matches everything at score 0, preserving the
  input order (a stable sort).
- Convergent-not-derived: this is standard command-palette behavior (fzf / VS Code quick pick as priors,
  per `SPEC.md` §0), arrived at from the requirement, not copied.

## 7. The command palette consumer

Registered through the **exact public API** the skeleton uses — the dogfood proof:

```ts
store.add(commands.registerCommand({
  id: "core.command.execute",
  title: "Run Command…",
  run: async (c) => {
    const items = commands.getCommands()
      .filter((cmd) => !cmd.isEnabled || cmd.isEnabled(c))     // only runnable commands
      .map((cmd) => ({ id: cmd.id, label: cmd.title, description: cmd.category }));
    const pick = await minibuffer.quickPick(items, { prompt: ">", placeholder: "Run a command" });
    if (pick) await commands.executeCommand(pick.id, c);       // same choke point as keys + menu
  },
}));
```

`description` shows the command's `category` today; once keymaps exist it can show the bound key. The
palette command appears in its own list (harmless — picking it just reopens the palette); no special
de-duplication. A query that matches nothing shows a "No matching commands" row and `accept` no-ops.

## 8. Opening it, and its keys

- **Interim open binding:** `Ctrl-Shift-P` (deliberately idiom-*neutral* — not `M-x`, not a Vim leader —
  so the interim binding signals no Emacs-first bias) + a native menu item ("Run Command…") that reuses
  the existing menu → `menu-command` → `executeCommand` seam. Both are replaced/augmented by the real
  `M-x` / `<leader>` bindings when the templates land at step 4.
- **Minibuffer-local keys while open:** `Enter` accept, `Esc` cancel, `ArrowDown`/`ArrowUp` and
  `Ctrl-n`/`Ctrl-p` move. Handled in the overlay's own keydown listener, which calls the model and
  `preventDefault()` + `stopPropagation()` so keys do not leak to the editor or the window-global
  handler. (History keys are stubbed inert this slice.)
- **Focus:** on open, focus the input; on close (accept or cancel), restore focus to the editor.
- **Modality:** while the minibuffer is open it owns input — the CM6 editor is not focused, and
  `main.ts`'s window-level keydown handler early-returns on `minibuffer.isOpen()` so app-global keys
  (`Ctrl-o`/`Ctrl-s`/`Ctrl-q`) don't fire underneath the palette.
- **Step-4 formalization:** these interaction keys become **state-scoped registry bindings**
  (`when: "minibufferFocused"`) once the input-state primitive + `when`-evaluation land — the local
  handling here is the interim, not a parallel command system.

## 9. Composition-root wiring (`renderer/main.ts`)

Instantiate the service, register the palette command, bind the interim key, add the menu item, and guard
the global handler:

```ts
const minibuffer = new Minibuffer(document.body);
// ...registerCommand("core.command.execute", …) as in §7…
store.add(keys.registerKeybinding({ keys: "Ctrl-Shift-p", command: "core.command.execute" }));
// window-global keydown handler gains:  if (minibuffer.isOpen()) return;
```

The native menu (`main/menu.ts`) gains a "Run Command…" item that IPCs `core.command.execute` — menu and
key are two front-ends over the one command, exactly as `open`/`save`/`quit` already are.

## 10. Testing (the three tiers, TDD)

- **Tier 1 — Vitest `node` (the bulk):** `match.ts` (subsequence hits/misses, ranking order, boundary and
  case bonuses, positions, empty-query stability) and `QuickPickModel` (filter on query, ranked results,
  wrap-around selection, `selected()` on empty). Pure, fs-free.
- **Tier 2 — Vitest `browser` (real Chromium):** the `Minibuffer` DOM adapter — type into the input, the
  list updates and highlights, arrow/`Ctrl-n`/`Ctrl-p` move the selection, `Enter` resolves the chosen
  item, `Esc` resolves `undefined`, focus is captured and restored.
- **Tier 3 — Playwright `_electron` (one smoke):** launch the built app, open a fixture, open the palette
  (`Ctrl-Shift-P`), type "Save", `Enter`, and assert the file's bytes — extending the existing e2e and its
  dialog-stub harness. Run under `xvfb`.

## 11. Security posture

The minibuffer is **renderer-only** in substance: no new IPC channel, no `preload` surface, no new
privilege; the only main-process touch is one native-menu item on the existing `menu-command` channel.
`quickPick` / `readLine` touch no main-only powers; anything they run goes through the same
`executeCommand` choke point that keys and the menu use — the future capability/audit enforcement point.
The trust boundary from the skeleton is unchanged.

## 12. Decision summary

1. **Scope = neutral substrate + command palette** (step 2); both keymaps arrive co-equal at step 4;
   nothing keymap-specific is built first.
2. **Parity is structural** — one registry + one choke point, keymap-neutral primitives designed against
   both personalities, and a tested "bound in both" invariant to come (§6/§6.1).
3. **Architecture = native DOM overlay**, bottom-docked, window-level chrome; the nested-CodeMirror
   option is rejected because §6.1 makes "the minibuffer runs the full keymap" a non-goal.
4. **Primitives:** `quickPick` (ships) + `readLine` (designed, deferred) + a mode-indicator slot; a pure
   `QuickPickModel` holds all selection state.
5. **Fuzzy matching is hand-rolled and pure** — subsequence + scoring with highlight positions; no
   dependency, fully TDD-able.
6. **The palette dogfoods the public API** — `core.command.execute` registered like any command, run
   through `executeCommand`.
7. **Interim `Ctrl-Shift-P` + menu item** to open; local accept/cancel/move keys; both formalize into
   state-scoped registry bindings at step 4.
8. **Testing:** Vitest node (matcher + model) + Vitest browser (DOM adapter) + one Playwright smoke.

## Load-bearing references

- `SPEC.md` §6 (interaction model) and §6.1 (keymaps as convention templates; parity = coverage + idiom).
- [Plugin-system design](2026-07-22-plugin-system-design.md) §6 — command-substrate primitives
  (commands · keybindings · input modes/states · minibuffer/quick-input providers).
- [Kernel walking-skeleton design](2026-07-22-kernel-walking-skeleton-design.md) §1.1 (build sequence),
  §6 (command registry + choke point), and [`docs/dev/kernel.md`](../../dev/kernel.md) (what exists today).
- CodeMirror 6 view/panel docs <https://codemirror.net/docs/> (why a Panel is the wrong ownership);
  fuzzy-finder priors (fzf, VS Code quick pick) as convergent behavior, not a derivation (`SPEC.md` §0).
