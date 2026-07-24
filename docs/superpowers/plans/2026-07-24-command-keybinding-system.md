# Command + Keybinding System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Coal's single, Emacs-modeled command-and-keybinding system on top of steps 1-3: a pure, timer-free multi-stroke key-sequence resolver; explicit `when`-context precedence; a curated default keymap; a plain-text `keybindings.toml` override surface with an unbind form + interactive bind flow; and the discoverability layer (palette key-hints, which-key, Describe-Key/Command in a new echo area) — while subtracting the retired dual-keymap/`keymap`-choice apparatus.

**Architecture:** Four pure kernel layers (`command`, `context`, resolver, `keybindings` config) hold all logic and are node-tested exhaustively; a `main`-owned `KeybindingsService` owns `keybindings.toml` with the exact `settings.toml` lifecycle (materialize / validate / comment-preserving write / atomic / broadcast); a renderer adapter turns `KeyboardEvent`s into canonical chords, feeds the resolver, maintains context booleans, and draws which-key + the echo area. Keys bind to command **ids**, never to code; everything routes through the one `executeCommand` choke point.

**Tech Stack:** TypeScript (strict), Electron 43 main process, `@decimalturn/toml-patch` (comment-preserving TOML, main-only), `write-file-atomic`, CodeMirror 6 (editor engine, owns text input), Vitest (node + browser), Playwright `_electron`.

**Design:** [`docs/superpowers/specs/2026-07-24-command-keybinding-system-design.md`](../specs/2026-07-24-command-keybinding-system-design.md).

## Suggested delivery (reviewer's choice)

This slice is larger than steps 1-3. It is written as **one plan** to match the design→plan→implement rhythm, but the tasks fall cleanly into two independently-shippable halves — surfaced here so the reviewer can choose one large PR or two:

- **PR 1 — the pure kernel core (Tasks 1-8):** the subtraction, canonical keys, the `when` context model, the extended keybinding registry, `composeKeymap`, the resolver, the `keybindings.toml` config layer, and the default keymap. All node-tested; ships as self-contained, fully-tested logic with no UI change (the renderer still runs the step-3 input path until PR 2 rewires it). Task 1's subtraction is the only user-visible change (the retired `keymap` slot) and stands on its own.
- **PR 2 — integration + discoverability + docs (Tasks 9-17):** the `main` keybindings service + IPC, the renderer input path, which-key, the echo area, the interactive bind flow, the e2e smokes, and the doc reconciliation.

Whichever is chosen, follow the same "per-task commits + reviews between tasks" cadence steps 1-3 used, and keep each task's deliverable independently green.

## Global Constraints

- **Kernel purity:** `src/kernel/**` imports only standard JS — **no DOM, Electron, Node, third-party, or timer** imports. The TOML library and all filesystem IO live **only** in `src/main/`. The resolver, contexts, `when` evaluator, compose, and validation are pure functions of their inputs (design §10).
- **Strict TS:** `verbatimModuleSyntax` (use `import type` for type-only imports); `noUncheckedIndexedAccess` (indexed access is `T | undefined` — narrow before use); `exactOptionalPropertyTypes` (assign an optional property **only** when a value exists — never `{ when: undefined }`; spread `...(x !== undefined ? { x } : {})`).
- **Keys bind to ids, never code (Law 2).** A binding's `command` is a registry id string. **Every user-triggerable behavior is a registered command (Law 1)**, addressable by a non-empty `title` in the minibuffer; `registerCommand` enforces the non-empty title.
- **One canonical key representation (design §4.1):** modifiers in fixed order `Ctrl-`, `Alt-`, `Shift-`, `Meta-`, then a base token; a **sequence** is space-joined chords (`"Ctrl-x Ctrl-s"`). The base token derives from `KeyboardEvent.code` for letters/digits (layout-independent), `KeyboardEvent.key` for named keys; **Shift is an explicit modifier** (`Ctrl-Shift-p`, never `Ctrl-P`).
- **Prefix-key invariant (design §4.2):** a sequence is a prefix **or** a complete binding, never both. Configurations that violate it are rejected at compose with a `binding-conflict` diagnostic and the prefix wins. This keeps the resolver **timer-free**.
- **All filesystem IO in main.** The renderer never imports `fs`, never holds a config path, and reaches main only through the typed `window.coal` bridge. Every IPC handler validates `event.senderFrame` (via `deps.isTrustedSender`) **and** the payload before acting.
- **Config location:** `app.getPath('userData')` — on Linux `$XDG_CONFIG_HOME/coal` (`~/.config/coal`). `keybindings.toml` sits beside `settings.toml` in the same scope. Dev isolates to `coal-dev`; the e2e isolates via `--user-data-dir=<temp>`.
- **Runtime:** Node >= 22; ESM (`"type": "module"`).
- **Test tiers:** node `npm test`; browser `npm run test:browser`; e2e `npm run build` then `npm run test:e2e`; `npm run typecheck` and `npm run format` mirror CI. Green before push.
- **No emojis** in any file (repo rule). Plain text only.

## File Structure

New and changed files, by responsibility (design §10):

```
src/kernel/command/
  types.ts                 # MODIFY  + Command.description; Keybinding.keys is now a canonical sequence
  commandRegistry.ts       # MODIFY  registerCommand enforces a non-empty title (Law 1)
  keys.ts                  # NEW     canonical chord assembly + sequence helpers (pure)
  context.ts               # NEW     ContextRegistry (boolean contexts)
  when.ts                  # NEW     `when` expression parser + evaluator (pure)
  keybindingRegistry.ts    # MODIFY  effective-table sink (setBindings) + reverse lookup + candidate query
  composeKeymap.ts         # NEW     layer defaults + user entries; conflict + prefix-invariant diagnostics
  keySequenceResolver.ts   # NEW     the pure prefix-key state machine
  defaultKeymap.ts         # NEW     the curated Emacs-flavored starter table (Appendix A), as data
src/kernel/config/
  types.ts                 # MODIFY  drop KeymapChoice/keymap; add "binding-conflict"/"unresolvable-command" diagnostic kinds
  schema.ts                # MODIFY  drop KEYMAP_VALUES; KERNEL_SETTING_KEYS becomes empty
  validate.ts              # MODIFY  drop the keymap branch
  defaultTemplate.ts       # MODIFY  drop the commented keymap line
  keybindings/
    types.ts               # NEW     KeybindingEntry (bind | unbind) + KeybindingsSnapshot
    schema.ts              # NEW     the "keybinding" table + entry field names
    validate.ts            # NEW     structural, non-destructive keybindings validation
    defaultTemplate.ts     # NEW     the commented keybindings.toml template
src/kernel/minibuffer/
  types.ts                 # MODIFY  + QuickPickItem.keyHint; + ReadKeySequenceOptions
src/kernel/ipc/
  contract.ts              # MODIFY  keybindings IPC channels + CoalApi.keybindings + request types
src/main/
  guards.ts                # MODIFY  drop keymap validation; add keybindings request guards
  keybindingsToml.ts       # NEW     pure text formatter/append for [[keybinding]] entries
  keybindingsService.ts    # NEW     owns keybindings.toml (mirror of ConfigService)
  ipc.ts                   # MODIFY  keybindings handlers
  index.ts                 # MODIFY  instantiate + wire KeybindingsService
src/preload/
  index.ts                 # MODIFY  expose coal.keybindings
src/renderer/
  keyInput.ts              # NEW     KeyboardEvent -> canonical chord (pure-ish; browser-tested)
  keybindings.ts           # NEW     KeybindingsClient (reactive replica of keybindings.toml)
  whichKey.ts              # NEW     the continuation panel (DOM)
  echoArea.ts              # NEW     transient message/help surface (DOM)
  minibuffer.ts            # MODIFY  readKeySequence; palette key-hint rendering; accept/cancel/next/prev methods
  main.ts                  # MODIFY  the resolver-fed input path replaces the two step-3 dispatch paths
  config.ts                # MODIFY  drop the keymap reflection helper's consumers (Task 1)
docs/
  SPEC.md, PLUGINS.md, docs/dev/kernel.md, README.md,
  docs/superpowers/specs/2026-07-22-kernel-walking-skeleton-design.md   # MODIFY  reconciliation (Task 17)
e2e/
  keybindings.spec.ts      # NEW     multi-stroke save, which-key, describe-key, bind round-trip
  config.spec.ts           # MODIFY  drop the data-coal-keymap assertions (Task 1)
```

---

## Phase A — the pure kernel core (Tasks 1-8, node-tested)

### Task 1: Subtract the `keymap` slot; widen the diagnostic union

The pivot's first move is subtraction (design §11/§12): delete `KeymapChoice`, `KernelSettings.keymap`, `KEYMAP_VALUES`, the `keymap` validation branch and template line, the `guards.ts` keymap check, and the renderer's `data-coal-keymap` reflection. The settings-config machinery **stays** (it is the generic global-config lifecycle later settings reuse) — only the single `keymap` setting leaves, so `KernelSettings` becomes an empty (forward-compatible) record. This task also widens `ConfigDiagnostic.kind` with the two keybinding diagnostic kinds the later tasks emit, so the union is defined once.

**Files:**
- Modify: `src/kernel/config/types.ts`
- Modify: `src/kernel/config/schema.ts`
- Modify: `src/kernel/config/validate.ts`
- Modify: `src/kernel/config/defaultTemplate.ts`
- Modify: `src/main/guards.ts`
- Modify: `src/renderer/main.ts` (remove the keymap reflection block, lines 24-34)
- Modify: `src/kernel/config/validate.test.ts`
- Modify: `src/main/guards.test.ts`
- Modify: `src/main/configService.test.ts`
- Modify: `src/main/tomlConfigCodec.test.ts`
- Modify: `src/renderer/config.test.ts`
- Modify: `e2e/config.spec.ts`

**Interfaces:**
- Produces (changed):
  - `type KernelSettings = Record<string, never>` — no known settings yet.
  - `interface ConfigDiagnostic { key; kind: "unknown-key" | "invalid-type" | "invalid-value" | "parse-error" | "binding-conflict" | "unresolvable-command"; message }`
  - `const KERNEL_SETTING_KEYS = [] as const`
  - `validate(raw)` — every key is now `unknown-key`; empty object → `{ settings: {}, diagnostics: [] }`.
  - `isConfigSetRequest` — accepts `{ patch: {} }`; rejects any non-empty patch key (no settable keys remain).
- Removed: `KeymapChoice`, `KEYMAP_VALUES`, `document.body.dataset.coalKeymap`.

- [ ] **Step 1: Rewrite the failing validate test**

Replace `src/kernel/config/validate.test.ts` entirely:

```ts
import { describe, expect, test } from "vitest";
import { validate } from "./validate";

describe("validate (design §5 non-destructive kernel-settings validation)", () => {
  test("an empty object yields empty settings, no diagnostics", () => {
    expect(validate({})).toEqual({ settings: {}, diagnostics: [] });
  });

  test("every key is reported as unknown but left for the file to keep (no settings yet)", () => {
    const { settings, diagnostics } = validate({ foo: 1, bar: "x" });
    expect(settings).toEqual({});
    expect(diagnostics).toEqual([
      { key: "foo", kind: "unknown-key", message: 'unknown setting "foo" (left untouched)' },
      { key: "bar", kind: "unknown-key", message: 'unknown setting "bar" (left untouched)' },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project=node src/kernel/config/validate.test.ts`
Expected: FAIL — the old `keymap` cases and imports no longer compile / assert.

- [ ] **Step 3: Shrink the types**

Replace `src/kernel/config/types.ts`:

```ts
// src/kernel/config/types.ts

/**
 * The kernel's own (global-scope) settings. The `keymap` choice was removed with
 * the command+keybinding pivot (design §11); no scalar settings remain yet, so
 * this is an empty forward-compatible record. Keybindings live in their own file
 * (config/keybindings), not here.
 */
export type KernelSettings = Record<string, never>;

/** A non-fatal problem found while validating raw config (design §5). */
export interface ConfigDiagnostic {
  readonly key: string; // dotted path / array index, "" for whole-document problems
  readonly kind:
    | "unknown-key"
    | "invalid-type"
    | "invalid-value"
    | "parse-error"
    | "binding-conflict" // design §5.3: same-sequence clash or prefix-invariant violation
    | "unresolvable-command"; // design §11: a binding points at an unregistered command id
  readonly message: string;
}

/** Validated settings + the diagnostics gathered producing them. */
export interface ConfigSnapshot {
  readonly settings: KernelSettings;
  readonly diagnostics: readonly ConfigDiagnostic[];
}
```

- [ ] **Step 4: Shrink schema + validate**

Replace `src/kernel/config/schema.ts`:

```ts
// src/kernel/config/schema.ts

/** The keys the kernel recognizes in settings.toml. Empty until a setting is added. */
export const KERNEL_SETTING_KEYS = [] as const;
```

Replace `src/kernel/config/validate.ts`:

```ts
// src/kernel/config/validate.ts
import type { ConfigDiagnostic, ConfigSnapshot } from "./types";
import { KERNEL_SETTING_KEYS } from "./schema";

/**
 * Turn a raw parsed object into typed settings + diagnostics. Non-destructive:
 * unknown keys are reported but never removed (the caller keeps them in the
 * file) (design §5). No scalar settings are recognized yet, so every present key
 * is reported unknown and settings is always empty.
 */
export function validate(raw: Record<string, unknown>): ConfigSnapshot {
  const diagnostics: ConfigDiagnostic[] = [];
  for (const key of Object.keys(raw)) {
    if (!(KERNEL_SETTING_KEYS as readonly string[]).includes(key)) {
      diagnostics.push({
        key,
        kind: "unknown-key",
        message: `unknown setting "${key}" (left untouched)`,
      });
    }
  }
  return { settings: {}, diagnostics };
}
```

- [ ] **Step 5: Drop the keymap line from the settings template**

In `src/kernel/config/defaultTemplate.ts`, replace the body so no `keymap` line remains:

```ts
// src/kernel/config/defaultTemplate.ts

/**
 * The curated settings.toml written when none exists (design §5). It documents
 * the file; no scalar settings exist yet (the keymap choice was removed with the
 * keybinding pivot, and keybindings live in keybindings.toml), so a fresh load
 * reports empty settings with no diagnostics.
 */
export const DEFAULT_SETTINGS_TOML = `# Coal - user settings (global scope)
#
# Your personal, machine-level Coal preferences. This file travels with you
# (your dotfiles), not with any vault. Edit it by hand or from Settings; Coal
# preserves your comments and formatting when it writes here.
#
# No settings are defined yet. Keybindings live in keybindings.toml, alongside
# this file.
`;
```

- [ ] **Step 6: Drop the keymap check from the guard**

Replace `src/main/guards.ts`'s config import + `isConfigSetRequest` (keep `isSaveRequest`, `isTrustedUrl`, and the keybinding guards added in Task 10):

```ts
// src/main/guards.ts
import { KERNEL_SETTING_KEYS } from "../kernel/config/schema";
import type { ConfigSetRequest, SaveRequest } from "../kernel/ipc/contract";

export function isSaveRequest(value: unknown): value is SaveRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { text?: unknown }).text === "string"
  );
}

export function isConfigSetRequest(value: unknown): value is ConfigSetRequest {
  if (typeof value !== "object" || value === null) return false;
  const patch = (value as { patch?: unknown }).patch;
  if (typeof patch !== "object" || patch === null) return false;
  // No settable keys remain; a valid patch is empty. Any key is unknown -> reject.
  for (const key of Object.keys(patch)) {
    if (!(KERNEL_SETTING_KEYS as readonly string[]).includes(key)) return false;
  }
  return true;
}

/** True when a sender-frame URL belongs to one of the app's own origins (design §3). */
export function isTrustedUrl(url: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!url) return false;
  return allowedOrigins.some((origin) => url.startsWith(origin));
}
```

- [ ] **Step 7: Remove the renderer keymap reflection**

In `src/renderer/main.ts`, delete the reflection block (current lines 24-34):

```ts
const config = new ConfigClient(window.coal);
// Reflect the loaded keymap into the DOM — the reactive seam step 4's keymap
// layer consumes (unset shows as ""). Also the e2e's observable.
const reflectKeymap = (): void => {
  document.body.dataset["coalKeymap"] = config.settings.keymap ?? "";
};
config.onChange(reflectKeymap);
void config
  .init()
  .then(reflectKeymap)
  .catch((err) => console.error("config init failed:", err));
```

Replace it with the reflection-free init (the resolver-fed rewrite in Task 15 supersedes this composition, but Task 1 must leave `main.ts` compiling and green on its own):

```ts
const config = new ConfigClient(window.coal);
void config.init().catch((err) => console.error("config init failed:", err));
```

- [ ] **Step 8: Update the tests that referenced keymap**

In `src/main/guards.test.ts`, replace the `isConfigSetRequest` block with:

```ts
describe("isConfigSetRequest", () => {
  test("accepts an empty patch", () => {
    expect(isConfigSetRequest({ patch: {} })).toBe(true);
  });
  test("rejects a non-object, a missing patch, and any unknown key", () => {
    expect(isConfigSetRequest(null)).toBe(false);
    expect(isConfigSetRequest({})).toBe(false);
    expect(isConfigSetRequest({ patch: { anything: 1 } })).toBe(false);
  });
});
```

In `src/main/tomlConfigCodec.test.ts`, swap the `keymap = "emacs"/"vim"` example data for a neutral foreign key (the codec is setting-agnostic):

```ts
import { describe, expect, test } from "vitest";
import { applyEdit, parse } from "./tomlConfigCodec";

describe("tomlConfigCodec (design §7 comment-preserving round-trip)", () => {
  test("parse turns TOML text into a plain object", () => {
    expect(parse('# a comment\ntitle = "coal"\n')).toEqual({ title: "coal" });
  });

  test("applyEdit changes only the target value, preserving comments and foreign keys", () => {
    const original = "# Coal settings\ntitle = \"coal\"\nfoo = 1\n";
    const raw = parse(original);
    const edited = applyEdit(original, { ...raw, title: "coal-dev" });
    expect(parse(edited)).toEqual({ title: "coal-dev", foo: 1 });
    expect(edited).toContain("# Coal settings");
    expect(edited).toContain("foo = 1");
    expect(edited).toContain('title = "coal-dev"');
  });

  test("parse throws on malformed TOML", () => {
    expect(() => parse("not = = valid ][")).toThrow();
  });
});
```

In `src/main/configService.test.ts`, replace the keymap-specific tests with mechanics that need no known setting (materialize, foreign-key preservation, parse-error, emit-on-reload):

```ts
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigService } from "./configService";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "coal-cfg-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("ConfigService (design §3/§6/§9 global config layer)", () => {
  test("load materializes settings.toml when absent; empty settings, no diagnostics", async () => {
    const svc = new ConfigService(dir);
    const snap = await svc.load();
    expect(existsSync(svc.path)).toBe(true);
    expect(snap).toEqual({ settings: {}, diagnostics: [] });
    expect(await readFile(svc.path, "utf-8")).toContain("# Coal");
  });

  test("a hand-added foreign key is reported unknown but preserved on disk", async () => {
    const svc = new ConfigService(dir);
    await writeFile(svc.path, '# mine\nfoo = 1\n', "utf-8");
    const snap = await svc.load();
    expect(snap.settings).toEqual({});
    expect(snap.diagnostics[0]).toMatchObject({ key: "foo", kind: "unknown-key" });
    expect(await readFile(svc.path, "utf-8")).toContain("foo = 1"); // never clobbered
  });

  test("reload re-reads an external edit and emits", async () => {
    const svc = new ConfigService(dir);
    await svc.load();
    let emitted = 0;
    svc.onDidChangeConfig(() => {
      emitted += 1;
    });
    await writeFile(svc.path, "bar = 2\n", "utf-8");
    const snap = await svc.reload();
    expect(snap.diagnostics.some((d) => d.key === "bar")).toBe(true);
    expect(emitted).toBe(1);
  });

  test("a malformed file loads to defaults + a parse-error diagnostic, file untouched", async () => {
    const svc = new ConfigService(dir);
    const bad = "not = = valid ][\n";
    await writeFile(svc.path, bad, "utf-8");
    const snap = await svc.load();
    expect(snap.settings).toEqual({});
    expect(snap.diagnostics[0]).toMatchObject({ kind: "parse-error" });
    expect(await readFile(svc.path, "utf-8")).toBe(bad);
  });
});
```

In `src/renderer/config.test.ts`, drop the keymap assertions; assert the replica plumbing with empty settings:

```ts
import { describe, expect, test, vi } from "vitest";
import { ConfigClient } from "./config";
import type { CoalApi } from "../kernel/ipc/contract";
import type { ConfigSnapshot } from "../kernel/config/types";

function fakeApi(initial: ConfigSnapshot): { api: CoalApi; fireChange(s: ConfigSnapshot): void } {
  let changeHandler: (s: ConfigSnapshot) => void = () => {};
  const api = {
    config: {
      load: vi.fn(async () => initial),
      set: vi.fn(async () => ({ ok: true }) as const),
      reload: vi.fn(async () => initial),
      openInEditor: vi.fn(async () => ({ canceled: true }) as const),
    },
    onConfigChanged: (handler: (s: ConfigSnapshot) => void) => {
      changeHandler = handler;
      return () => {};
    },
  } as unknown as CoalApi;
  return { api, fireChange: (s) => changeHandler(s) };
}

describe("ConfigClient (design §6 reactive replica)", () => {
  test("init loads the snapshot into settings", async () => {
    const { api } = fakeApi({ settings: {}, diagnostics: [] });
    const client = new ConfigClient(api);
    await client.init();
    expect(client.settings).toEqual({});
  });

  test("a config:changed push notifies subscribers", async () => {
    const { api, fireChange } = fakeApi({ settings: {}, diagnostics: [] });
    const client = new ConfigClient(api);
    await client.init();
    const seen: ConfigSnapshot[] = [];
    client.onChange((s) => seen.push(s));
    fireChange({ settings: {}, diagnostics: [{ key: "foo", kind: "unknown-key", message: "x" }] });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.diagnostics).toHaveLength(1);
  });
});
```

In `e2e/config.spec.ts`, remove the two `data-coal-keymap` assertions and the keymap external edit; keep the materialize + Open Settings + reload smokes. Replace the first test's body assertions:

```ts
    // Materialized on first run.
    await expect.poll(() => existsSync(settings)).toBe(true);
    expect(await readFile(settings, "utf-8")).toContain("# Coal");

    // Externally edit the file, then reload via the palette (no observable setting,
    // so this proves the reload path runs without error).
    await writeFile(settings, "# hand edit\n", "utf-8");
    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+Shift+P");
    await expect(window.locator(".coal-minibuffer.open")).toBeVisible();
    await window.locator(".coal-mb-input").fill("Reload Settings");
    await window.keyboard.press("Enter");
    await expect(window.locator(".coal-minibuffer.open")).toHaveCount(0);
```

(Leave the "Open Settings opens settings.toml" test as-is.)

- [ ] **Step 9: Run node tests + typecheck + build**

Run: `npx vitest run --project=node`
Expected: PASS (config, guards, codec, configService, renderer/config all green).
Run: `npm run typecheck`
Expected: no errors — no dangling `KeymapChoice` / `KEYMAP_VALUES` references.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/kernel/config src/main/guards.ts src/renderer/main.ts src/renderer/config.test.ts \
  src/main/guards.test.ts src/main/configService.test.ts src/main/tomlConfigCodec.test.ts e2e/config.spec.ts
git commit -m "Remove the keymap config slot and widen the diagnostic union for keybindings"
```

---

### Task 2: Canonical keys + command/keybinding type changes

The pure key vocabulary every later layer speaks: chord assembly in canonical modifier order, sequence split/join, and the prefix predicate. Plus the two `types.ts` additions — `Command.description` (for Describe-Command) and the doc change marking `Keybinding.keys` a **sequence**.

**Files:**
- Create: `src/kernel/command/keys.ts`
- Create: `src/kernel/command/keys.test.ts`
- Modify: `src/kernel/command/types.ts`

**Interfaces:**
- Produces:
  - `type Modifier = "Ctrl" | "Alt" | "Shift" | "Meta"`
  - `function canonicalChord(mods: Iterable<Modifier>, base: string): string`
  - `function splitSequence(sequence: string): string[]`
  - `function joinSequence(chords: readonly string[]): string`
  - `function sequenceStartsWith(candidate: string, prefix: string): boolean`
  - `Command.description?: string` (new optional field)

- [ ] **Step 1: Write the failing test**

Create `src/kernel/command/keys.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { canonicalChord, joinSequence, sequenceStartsWith, splitSequence } from "./keys";

describe("canonicalChord (design §4.1)", () => {
  test("orders modifiers Ctrl-Alt-Shift-Meta regardless of input order", () => {
    expect(canonicalChord(["Shift", "Ctrl"], "p")).toBe("Ctrl-Shift-p");
    expect(canonicalChord(["Meta", "Alt", "Ctrl"], "x")).toBe("Ctrl-Alt-Meta-x");
  });
  test("a bare base has no modifiers", () => {
    expect(canonicalChord([], "Enter")).toBe("Enter");
  });
  test("duplicate modifiers collapse", () => {
    expect(canonicalChord(["Ctrl", "Ctrl"], "s")).toBe("Ctrl-s");
  });
});

describe("sequences (design §4.2/§4.3)", () => {
  test("split and join round-trip; empty string is the empty sequence", () => {
    expect(splitSequence("Ctrl-x Ctrl-s")).toEqual(["Ctrl-x", "Ctrl-s"]);
    expect(splitSequence("")).toEqual([]);
    expect(joinSequence(["Ctrl-x", "Ctrl-s"])).toBe("Ctrl-x Ctrl-s");
  });
  test("sequenceStartsWith matches on chord boundaries only", () => {
    expect(sequenceStartsWith("Ctrl-x Ctrl-s", "Ctrl-x")).toBe(true);
    expect(sequenceStartsWith("Ctrl-x Ctrl-s", "Ctrl-x Ctrl-s")).toBe(true);
    expect(sequenceStartsWith("Ctrl-x Ctrl-s", "")).toBe(true);
    expect(sequenceStartsWith("Ctrl-x2", "Ctrl-x")).toBe(false); // not a chord boundary
    expect(sequenceStartsWith("Ctrl-x", "Ctrl-x Ctrl-s")).toBe(false); // shorter than prefix
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project=node src/kernel/command/keys.test.ts`
Expected: FAIL — cannot resolve `./keys`.

- [ ] **Step 3: Write the key vocabulary**

Create `src/kernel/command/keys.ts`:

```ts
// src/kernel/command/keys.ts

/** The modifiers, in canonical emission order (design §4.1). */
const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Meta"] as const;
export type Modifier = (typeof MODIFIER_ORDER)[number];

/**
 * Assemble a canonical chord: held modifiers in fixed Ctrl-Alt-Shift-Meta order,
 * then the base-key token, joined by "-" (design §4.1). The base token is
 * caller-supplied (the renderer derives it from KeyboardEvent.code/.key); this
 * only orders and joins, so it is pure and layout-agnostic.
 */
export function canonicalChord(mods: Iterable<Modifier>, base: string): string {
  const held = new Set(mods);
  const parts = MODIFIER_ORDER.filter((m) => held.has(m));
  return [...parts, base].join("-");
}

/** Split a canonical sequence into its chords; "" is the empty sequence. */
export function splitSequence(sequence: string): string[] {
  return sequence.length === 0 ? [] : sequence.split(" ");
}

/** Join chords into a canonical space-separated sequence. */
export function joinSequence(chords: readonly string[]): string {
  return chords.join(" ");
}

/**
 * True when `candidate` equals `prefix` or extends it on a chord boundary
 * (design §4.2/§4.3): "Ctrl-x Ctrl-s" starts with "Ctrl-x", but "Ctrl-x2" does
 * not. The empty prefix starts everything.
 */
export function sequenceStartsWith(candidate: string, prefix: string): boolean {
  if (prefix.length === 0) return true;
  if (candidate === prefix) return true;
  return candidate.startsWith(prefix + " ");
}
```

- [ ] **Step 4: Add `description` and re-document `Keybinding`**

In `src/kernel/command/types.ts`, add `description` to `Command` and update the `Keybinding` doc comment (the `keys` type stays `string`, now holding a canonical **sequence**):

```ts
export interface Command {
  readonly id: string;
  readonly title: string;
  readonly category?: string;
  /** Longer doc string, shown by Describe Command (design §3/§8). */
  readonly description?: string;
  run(ctx: CommandContext): void | Promise<void>;
  isEnabled?(ctx: CommandContext): boolean;
}

/**
 * A key-sequence -> command-id association (design §4). `keys` is a canonical
 * space-joined chord sequence ("Ctrl-x Ctrl-s"); `when` is a boolean context
 * expression, evaluated at resolve time (design §5).
 */
export interface Keybinding {
  readonly keys: string;
  readonly command: string;
  readonly when?: string;
}
```

- [ ] **Step 5: Run the test + typecheck**

Run: `npx vitest run --project=node src/kernel/command/keys.test.ts`
Expected: PASS (6 tests).
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/kernel/command/keys.ts src/kernel/command/keys.test.ts src/kernel/command/types.ts
git commit -m "Add canonical key vocabulary and Command.description"
```

---

### Task 3: The `when` context model

Named boolean contexts the resolver reads, and the tiny `when` expression grammar over them: a bare name, `!name`, `a && b`, `a || b`, parenthesization (design §5). Parser and evaluator are pure and node-tested.

**Files:**
- Create: `src/kernel/command/context.ts`
- Create: `src/kernel/command/when.ts`
- Create: `src/kernel/command/context.test.ts`
- Create: `src/kernel/command/when.test.ts`

**Interfaces:**
- Produces:
  - `interface Context { isActive(name: string): boolean }`
  - `class ContextRegistry implements Context` — `set(name, value)`, `isActive(name)`, `onDidChange(cb): () => void`
  - `type WhenExpr` (name | not | and | or)
  - `function parseWhen(input: string): WhenExpr` — throws on syntax error
  - `function evaluateWhen(expr: WhenExpr, ctx: Context): boolean`
  - `function matchesWhen(when: string | undefined, ctx: Context): boolean` — undefined/blank → always true

- [ ] **Step 1: Write the failing tests**

Create `src/kernel/command/when.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { matchesWhen, parseWhen } from "./when";
import type { Context } from "./context";

const ctx = (active: Record<string, boolean>): Context => ({
  isActive: (name) => active[name] === true,
});

describe("when grammar (design §5)", () => {
  test("undefined and blank always match", () => {
    expect(matchesWhen(undefined, ctx({}))).toBe(true);
    expect(matchesWhen("  ", ctx({}))).toBe(true);
  });

  test("a bare name reads the context", () => {
    expect(matchesWhen("minibufferOpen", ctx({ minibufferOpen: true }))).toBe(true);
    expect(matchesWhen("minibufferOpen", ctx({}))).toBe(false);
  });

  test("negation, conjunction, disjunction, and parens", () => {
    const c = ctx({ editorFocused: true, minibufferOpen: false });
    expect(matchesWhen("!minibufferOpen", c)).toBe(true);
    expect(matchesWhen("editorFocused && !minibufferOpen", c)).toBe(true);
    expect(matchesWhen("minibufferOpen || editorFocused", c)).toBe(true);
    expect(matchesWhen("(minibufferOpen || editorFocused) && !minibufferOpen", c)).toBe(true);
  });

  test("&& binds tighter than ||", () => {
    // false && true || true  ===  (false && true) || true  === true
    const c = ctx({ b: true, c: true });
    expect(matchesWhen("a && b || c", c)).toBe(true);
  });

  test("a malformed expression throws", () => {
    expect(() => parseWhen("a &&")).toThrow();
    expect(() => parseWhen("(a || b")).toThrow();
    expect(() => parseWhen("a b")).toThrow();
    expect(() => parseWhen("")).toThrow(); // parseWhen requires a term; matchesWhen guards blank
  });
});
```

Create `src/kernel/command/context.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { ContextRegistry } from "./context";

describe("ContextRegistry (design §5)", () => {
  test("unset contexts are inactive; set flips them", () => {
    const r = new ContextRegistry();
    expect(r.isActive("minibufferOpen")).toBe(false);
    r.set("minibufferOpen", true);
    expect(r.isActive("minibufferOpen")).toBe(true);
  });

  test("onDidChange fires only on an actual change", () => {
    const r = new ContextRegistry();
    let fires = 0;
    r.onDidChange(() => {
      fires += 1;
    });
    r.set("editorFocused", true);
    r.set("editorFocused", true); // no-op, same value
    r.set("editorFocused", false);
    expect(fires).toBe(2);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project=node src/kernel/command/when.test.ts src/kernel/command/context.test.ts`
Expected: FAIL — cannot resolve `./when` / `./context`.

- [ ] **Step 3: Write the context registry**

Create `src/kernel/command/context.ts`:

```ts
// src/kernel/command/context.ts

/** A read-only view of the active boolean contexts, for `when` evaluation. */
export interface Context {
  isActive(name: string): boolean;
}

/**
 * Holds the current boolean context values (editorFocused, minibufferOpen, ...).
 * The renderer adapter flips them on focus/open/close (design §5). Pure - no DOM.
 */
export class ContextRegistry implements Context {
  #values = new Map<string, boolean>();
  #listeners = new Set<() => void>();

  set(name: string, value: boolean): void {
    if (this.#values.get(name) === value) return;
    this.#values.set(name, value);
    for (const listener of this.#listeners) listener();
  }

  isActive(name: string): boolean {
    return this.#values.get(name) === true;
  }

  onDidChange(cb: () => void): () => void {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  }
}
```

- [ ] **Step 4: Write the `when` parser + evaluator**

Create `src/kernel/command/when.ts`:

```ts
// src/kernel/command/when.ts
import type { Context } from "./context";

/** A parsed `when` expression over context names (design §5). */
export type WhenExpr =
  | { readonly kind: "name"; readonly name: string }
  | { readonly kind: "not"; readonly expr: WhenExpr }
  | { readonly kind: "and"; readonly left: WhenExpr; readonly right: WhenExpr }
  | { readonly kind: "or"; readonly left: WhenExpr; readonly right: WhenExpr };

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (c === " " || c === "\t") {
      i += 1;
      continue;
    }
    if (c === "(" || c === ")" || c === "!") {
      tokens.push(c);
      i += 1;
      continue;
    }
    if (c === "&" && input[i + 1] === "&") {
      tokens.push("&&");
      i += 2;
      continue;
    }
    if (c === "|" && input[i + 1] === "|") {
      tokens.push("||");
      i += 2;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9]/.test(input[j]!)) j += 1;
      tokens.push(input.slice(i, j));
      i = j;
      continue;
    }
    throw new Error(`invalid character in when expression: ${c}`);
  }
  return tokens;
}

/** Parse a `when` string to an AST. Throws on any syntax error (design §5). */
export function parseWhen(input: string): WhenExpr {
  const tokens = tokenize(input);
  let pos = 0;
  const peek = (): string | undefined => tokens[pos];
  const take = (): string | undefined => tokens[pos++];

  const parseOr = (): WhenExpr => {
    let left = parseAnd();
    while (peek() === "||") {
      take();
      left = { kind: "or", left, right: parseAnd() };
    }
    return left;
  };
  const parseAnd = (): WhenExpr => {
    let left = parseUnary();
    while (peek() === "&&") {
      take();
      left = { kind: "and", left, right: parseUnary() };
    }
    return left;
  };
  const parseUnary = (): WhenExpr => {
    if (peek() === "!") {
      take();
      return { kind: "not", expr: parseUnary() };
    }
    return parsePrimary();
  };
  const parsePrimary = (): WhenExpr => {
    const t = take();
    if (t === "(") {
      const inner = parseOr();
      if (take() !== ")") throw new Error("expected )");
      return inner;
    }
    if (t === undefined || t === ")" || t === "&&" || t === "||" || t === "!") {
      throw new Error(`unexpected token in when: ${t ?? "end of input"}`);
    }
    return { kind: "name", name: t };
  };

  const expr = parseOr();
  if (pos !== tokens.length) throw new Error("trailing tokens in when expression");
  return expr;
}

/** Evaluate a parsed expression against the current contexts. */
export function evaluateWhen(expr: WhenExpr, ctx: Context): boolean {
  switch (expr.kind) {
    case "name":
      return ctx.isActive(expr.name);
    case "not":
      return !evaluateWhen(expr.expr, ctx);
    case "and":
      return evaluateWhen(expr.left, ctx) && evaluateWhen(expr.right, ctx);
    case "or":
      return evaluateWhen(expr.left, ctx) || evaluateWhen(expr.right, ctx);
  }
}

/** Convenience: an undefined or blank `when` is always satisfied (design §4.3). */
export function matchesWhen(when: string | undefined, ctx: Context): boolean {
  if (when === undefined || when.trim() === "") return true;
  return evaluateWhen(parseWhen(when), ctx);
}
```

- [ ] **Step 5: Run the tests + typecheck**

Run: `npx vitest run --project=node src/kernel/command/when.test.ts src/kernel/command/context.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/kernel/command/context.ts src/kernel/command/when.ts \
  src/kernel/command/context.test.ts src/kernel/command/when.test.ts
git commit -m "Add the when context model (registry + expression parser/evaluator)"
```

---

### Task 4: The `keybindings.toml` config layer (schema, types, validation, template)

The kernel-pure half of the override surface (design §7/§11): the `KeybindingEntry` shape (bind | unbind), a structural non-destructive validator, and the commented default template. Command-id resolvability is **not** checked here (the kernel/config layer has no command registry); that semantic check runs in the renderer at compose time (Task 15). This is the exact mirror of Task 1's `settings` schema/validate/template, one directory down.

**Files:**
- Create: `src/kernel/config/keybindings/types.ts`
- Create: `src/kernel/config/keybindings/schema.ts`
- Create: `src/kernel/config/keybindings/validate.ts`
- Create: `src/kernel/config/keybindings/defaultTemplate.ts`
- Create: `src/kernel/config/keybindings/validate.test.ts`

**Interfaces:**
- Consumes: `ConfigDiagnostic` (Task 1).
- Produces:
  - `interface KeybindingBind { keys: string; command: string; when?: string }`
  - `interface KeybindingUnbind { keys: string; unbind: true; when?: string }`
  - `type KeybindingEntry = KeybindingBind | KeybindingUnbind`
  - `interface KeybindingsSnapshot { entries: readonly KeybindingEntry[]; diagnostics: readonly ConfigDiagnostic[] }`
  - `const KEYBINDING_TABLE = "keybinding"`
  - `const KEYBINDING_ENTRY_KEYS = ["keys", "command", "when", "unbind"] as const`
  - `function validateKeybindings(raw: Record<string, unknown>): KeybindingsSnapshot`
  - `const DEFAULT_KEYBINDINGS_TOML: string`

- [ ] **Step 1: Write the failing test**

Create `src/kernel/config/keybindings/validate.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { validateKeybindings } from "./validate";

describe("validateKeybindings (design §7 structural, non-destructive)", () => {
  test("an absent keybinding table yields no entries, no diagnostics", () => {
    expect(validateKeybindings({})).toEqual({ entries: [], diagnostics: [] });
  });

  test("a well-formed bind entry parses", () => {
    expect(validateKeybindings({ keybinding: [{ keys: "Ctrl-c s", command: "core.file.save" }] })).toEqual({
      entries: [{ keys: "Ctrl-c s", command: "core.file.save" }],
      diagnostics: [],
    });
  });

  test("a when-scoped entry keeps its when; an unbind entry parses", () => {
    const { entries } = validateKeybindings({
      keybinding: [
        { keys: "Ctrl-n", command: "core.minibuffer.next", when: "minibufferOpen" },
        { keys: "Ctrl-x Ctrl-c", unbind: true },
      ],
    });
    expect(entries).toEqual([
      { keys: "Ctrl-n", command: "core.minibuffer.next", when: "minibufferOpen" },
      { keys: "Ctrl-x Ctrl-c", unbind: true },
    ]);
  });

  test("a missing command (and not an unbind) is diagnosed and the entry dropped", () => {
    const { entries, diagnostics } = validateKeybindings({ keybinding: [{ keys: "Ctrl-z" }] });
    expect(entries).toEqual([]);
    expect(diagnostics[0]).toMatchObject({ key: "keybinding[0].command", kind: "invalid-type" });
  });

  test("a missing keys field is diagnosed and the entry dropped", () => {
    const { entries, diagnostics } = validateKeybindings({ keybinding: [{ command: "core.file.save" }] });
    expect(entries).toEqual([]);
    expect(diagnostics[0]).toMatchObject({ key: "keybinding[0].keys", kind: "invalid-type" });
  });

  test("an unknown field is diagnosed but the entry kept", () => {
    const { entries, diagnostics } = validateKeybindings({
      keybinding: [{ keys: "Ctrl-c s", command: "core.file.save", colour: "red" }],
    });
    expect(entries).toEqual([{ keys: "Ctrl-c s", command: "core.file.save" }]);
    expect(diagnostics[0]).toMatchObject({ key: "keybinding[0].colour", kind: "unknown-key" });
  });

  test("a non-array keybinding value is diagnosed", () => {
    const { entries, diagnostics } = validateKeybindings({ keybinding: "nope" });
    expect(entries).toEqual([]);
    expect(diagnostics[0]).toMatchObject({ key: "keybinding", kind: "invalid-type" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project=node src/kernel/config/keybindings/validate.test.ts`
Expected: FAIL — cannot resolve `./validate`.

- [ ] **Step 3: Write the types + schema**

Create `src/kernel/config/keybindings/types.ts`:

```ts
// src/kernel/config/keybindings/types.ts
import type { ConfigDiagnostic } from "../types";

/** A user binding: a key sequence -> a command id, optionally context-scoped. */
export interface KeybindingBind {
  readonly keys: string;
  readonly command: string;
  readonly when?: string;
}

/** A user unbind: remove the matching (keys, when) binding (design §7; Emacs: bind to nil). */
export interface KeybindingUnbind {
  readonly keys: string;
  readonly unbind: true;
  readonly when?: string;
}

export type KeybindingEntry = KeybindingBind | KeybindingUnbind;

/** Validated keybinding entries + the diagnostics gathered producing them. */
export interface KeybindingsSnapshot {
  readonly entries: readonly KeybindingEntry[];
  readonly diagnostics: readonly ConfigDiagnostic[];
}
```

Create `src/kernel/config/keybindings/schema.ts`:

```ts
// src/kernel/config/keybindings/schema.ts

/** The array-of-tables key in keybindings.toml: `[[keybinding]]`. */
export const KEYBINDING_TABLE = "keybinding";

/** The fields a `[[keybinding]]` entry may set. Others are reported unknown. */
export const KEYBINDING_ENTRY_KEYS = ["keys", "command", "when", "unbind"] as const;
```

- [ ] **Step 4: Write the validator**

Create `src/kernel/config/keybindings/validate.ts`:

```ts
// src/kernel/config/keybindings/validate.ts
import type { ConfigDiagnostic } from "../types";
import type { KeybindingEntry, KeybindingsSnapshot } from "./types";
import { KEYBINDING_ENTRY_KEYS, KEYBINDING_TABLE } from "./schema";

/**
 * Structurally validate the parsed keybindings.toml into typed entries +
 * diagnostics (design §7). Non-destructive: unknown fields are reported but the
 * entry is kept; a malformed entry is dropped with a diagnostic, the rest of the
 * file untouched. Command-id resolvability is NOT checked here (no registry in
 * the kernel/config layer) - the renderer checks it at compose time (design §11).
 */
export function validateKeybindings(raw: Record<string, unknown>): KeybindingsSnapshot {
  const diagnostics: ConfigDiagnostic[] = [];
  const entries: KeybindingEntry[] = [];

  const table = raw[KEYBINDING_TABLE];
  if (table === undefined) return { entries, diagnostics };
  if (!Array.isArray(table)) {
    diagnostics.push({
      key: KEYBINDING_TABLE,
      kind: "invalid-type",
      message: `"${KEYBINDING_TABLE}" must be an array of tables`,
    });
    return { entries, diagnostics };
  }

  table.forEach((rawEntry, index) => {
    const at = `${KEYBINDING_TABLE}[${index}]`;
    if (typeof rawEntry !== "object" || rawEntry === null || Array.isArray(rawEntry)) {
      diagnostics.push({ key: at, kind: "invalid-type", message: `${at} must be a table` });
      return;
    }
    const entry = rawEntry as Record<string, unknown>;

    for (const field of Object.keys(entry)) {
      if (!(KEYBINDING_ENTRY_KEYS as readonly string[]).includes(field)) {
        diagnostics.push({
          key: `${at}.${field}`,
          kind: "unknown-key",
          message: `unknown keybinding field "${field}" (left untouched)`,
        });
      }
    }

    const keys = entry["keys"];
    if (typeof keys !== "string" || keys.length === 0) {
      diagnostics.push({ key: `${at}.keys`, kind: "invalid-type", message: `${at}.keys must be a non-empty string` });
      return;
    }

    const rawWhen = entry["when"];
    if (rawWhen !== undefined && typeof rawWhen !== "string") {
      diagnostics.push({ key: `${at}.when`, kind: "invalid-type", message: `${at}.when must be a string` });
      return;
    }
    const when = typeof rawWhen === "string" ? rawWhen : undefined;

    if (entry["unbind"] === true) {
      entries.push({ keys, unbind: true, ...(when !== undefined ? { when } : {}) });
      return;
    }

    const command = entry["command"];
    if (typeof command !== "string" || command.length === 0) {
      diagnostics.push({
        key: `${at}.command`,
        kind: "invalid-type",
        message: `${at} must set a string "command" or "unbind = true"`,
      });
      return;
    }
    entries.push({ keys, command, ...(when !== undefined ? { when } : {}) });
  });

  return { entries, diagnostics };
}
```

- [ ] **Step 5: Write the default template**

Create `src/kernel/config/keybindings/defaultTemplate.ts`:

```ts
// src/kernel/config/keybindings/defaultTemplate.ts

/**
 * The curated keybindings.toml written when none exists (design §7). It documents
 * the override surface and leaves every example commented out, so a fresh load
 * reports no entries and no diagnostics; Coal's built-in keymap is in force.
 */
export const DEFAULT_KEYBINDINGS_TOML = `# Coal - keybindings (global scope)
#
# Your personal key -> command overrides, layered over Coal's built-in keymap.
# The file is the source of truth; Set Key (core.keys.bind) writes here too, and
# your comments and formatting are preserved. Keys bind to command ids, never to
# code. A sequence is space-separated chords, e.g. "Ctrl-x Ctrl-s". Modifiers are
# canonical: Ctrl-, Alt-, Shift-, Meta- (Shift is explicit: "Ctrl-Shift-p").

# Rebind save to a Ctrl-c prefix (overrides the default Ctrl-x Ctrl-s):
# [[keybinding]]
# keys = "Ctrl-c s"
# command = "core.file.save"

# Scope a binding to a context with when:
# [[keybinding]]
# keys = "Ctrl-n"
# command = "core.minibuffer.next"
# when = "minibufferOpen"

# Remove a default outright, without replacing it:
# [[keybinding]]
# keys = "Ctrl-x Ctrl-c"
# unbind = true
`;
```

- [ ] **Step 6: Run the test + typecheck**

Run: `npx vitest run --project=node src/kernel/config/keybindings/validate.test.ts`
Expected: PASS (7 tests).
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/kernel/config/keybindings
git commit -m "Add the keybindings.toml config layer (types, schema, validation, template)"
```

---

### Task 5: `composeKeymap` — layering, unbind, and conflict diagnostics

The precedence engine (design §5): fold the validated user entries over the kernel defaults into one effective table, applying user-over-default and later-over-earlier ("last wins"), honoring unbind, and surfacing genuine clashes — same-sequence rebinds to a different command, and prefix-invariant violations (design §4.2) — as `binding-conflict` diagnostics. Pure; the heart of the system; node-tested hard.

**Files:**
- Create: `src/kernel/command/composeKeymap.ts`
- Create: `src/kernel/command/composeKeymap.test.ts`

**Interfaces:**
- Consumes: `Keybinding` (Task 2), `KeybindingEntry` (Task 4), `ConfigDiagnostic` (Task 1), `sequenceStartsWith` (Task 2).
- Produces:
  - `interface ComposedKeymap { bindings: readonly Keybinding[]; diagnostics: readonly ConfigDiagnostic[] }`
  - `function composeKeymap(defaults: readonly Keybinding[], entries: readonly KeybindingEntry[]): ComposedKeymap`
  - `function findUnresolvedBindings(bindings: readonly Keybinding[], knownCommands: ReadonlySet<string>): ConfigDiagnostic[]` — the `unresolvable-command` check (design §11), reused by the renderer's recompose (Task 15).

- [ ] **Step 1: Write the failing test**

Create `src/kernel/command/composeKeymap.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { composeKeymap, findUnresolvedBindings } from "./composeKeymap";
import type { Keybinding } from "./types";

const defaults: Keybinding[] = [
  { keys: "Ctrl-x Ctrl-s", command: "core.file.save" },
  { keys: "Ctrl-x Ctrl-c", command: "core.app.quit" },
  { keys: "Ctrl-n", command: "core.minibuffer.next", when: "minibufferOpen" },
];

describe("composeKeymap (design §5 precedence)", () => {
  test("no user entries returns the defaults unchanged, no diagnostics", () => {
    expect(composeKeymap(defaults, [])).toEqual({ bindings: defaults, diagnostics: [] });
  });

  test("a user bind for the same (keys, when) replaces the default silently", () => {
    const { bindings, diagnostics } = composeKeymap(defaults, [
      { keys: "Ctrl-x Ctrl-s", command: "core.config.reload" },
    ]);
    expect(diagnostics).toEqual([]);
    expect(bindings.find((b) => b.keys === "Ctrl-x Ctrl-s")?.command).toBe("core.config.reload");
    expect(bindings.filter((b) => b.keys === "Ctrl-x Ctrl-s")).toHaveLength(1);
  });

  test("an unbind removes the matching default", () => {
    const { bindings } = composeKeymap(defaults, [{ keys: "Ctrl-x Ctrl-c", unbind: true }]);
    expect(bindings.find((b) => b.keys === "Ctrl-x Ctrl-c")).toBeUndefined();
  });

  test("a same-(keys, when) binding scoped differently coexists", () => {
    const { bindings } = composeKeymap(defaults, [{ keys: "Ctrl-n", command: "core.file.open" }]);
    // one unscoped (new) + one minibufferOpen-scoped (default) both present
    expect(bindings.filter((b) => b.keys === "Ctrl-n")).toHaveLength(2);
  });

  test("two user binds for the same (keys, when), different command, are a conflict (last wins)", () => {
    const { bindings, diagnostics } = composeKeymap(defaults, [
      { keys: "Ctrl-c a", command: "core.file.open" },
      { keys: "Ctrl-c a", command: "core.file.save" },
    ]);
    expect(bindings.find((b) => b.keys === "Ctrl-c a")?.command).toBe("core.file.save");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ key: "Ctrl-c a", kind: "binding-conflict" });
  });

  test("binding both a prefix and its extension is a conflict; the prefix wins", () => {
    const { bindings, diagnostics } = composeKeymap([], [
      { keys: "Ctrl-x Ctrl-s", command: "core.file.save" },
      { keys: "Ctrl-x Ctrl-s Ctrl-x", command: "core.app.quit" },
    ]);
    expect(bindings.map((b) => b.keys)).toEqual(["Ctrl-x Ctrl-s"]); // extension dropped
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ key: "Ctrl-x Ctrl-s Ctrl-x", kind: "binding-conflict" });
  });
});

describe("findUnresolvedBindings (design §11/§14)", () => {
  test("flags a binding whose command is not registered", () => {
    const diagnostics = findUnresolvedBindings(
      [
        { keys: "Ctrl-x Ctrl-s", command: "core.file.save" },
        { keys: "Ctrl-z", command: "core.does.not.exist" },
      ],
      new Set(["core.file.save"]),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ key: "Ctrl-z", kind: "unresolvable-command" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project=node src/kernel/command/composeKeymap.test.ts`
Expected: FAIL — cannot resolve `./composeKeymap`.

- [ ] **Step 3: Write the compose engine**

Create `src/kernel/command/composeKeymap.ts`:

```ts
// src/kernel/command/composeKeymap.ts
import type { ConfigDiagnostic } from "../config/types";
import type { KeybindingEntry, KeybindingUnbind } from "../config/keybindings/types";
import type { Keybinding } from "./types";
import { sequenceStartsWith } from "./keys";

export interface ComposedKeymap {
  readonly bindings: readonly Keybinding[];
  readonly diagnostics: readonly ConfigDiagnostic[];
}

/** A missing `when` is the "global" scope; normalize so undefined compares equal. */
const scope = (when: string | undefined): string => when ?? "";

// Assert the actual union member (not a structural literal) so TypeScript narrows
// the NEGATIVE branch to KeybindingBind - i.e. entry.command is available after
// the unbind check (a structural predicate leaves entry as KeybindingEntry).
const isUnbind = (e: KeybindingEntry): e is KeybindingUnbind => "unbind" in e;

/**
 * Layer the user keybindings over the kernel defaults into one effective table
 * (design §5). Rules, applied in order:
 *  - Entries apply top to bottom; a user entry for the same (keys, when) as an
 *    earlier binding (default or user) replaces it; an `unbind` removes it. So
 *    user beats default, and later beats earlier ("last wins").
 *  - A user rebinding the same (keys, when) to a DIFFERENT command than an
 *    earlier user entry is a `binding-conflict` diagnostic (last still wins).
 *  - The prefix-key invariant (design §4.2): a sequence may be a prefix OR a
 *    complete binding, never both. A binding that extends another with the same
 *    `when` is dropped with a `binding-conflict` diagnostic - the prefix wins.
 */
export function composeKeymap(
  defaults: readonly Keybinding[],
  entries: readonly KeybindingEntry[],
): ComposedKeymap {
  const diagnostics: ConfigDiagnostic[] = [];
  const result: Keybinding[] = [...defaults];
  const userTargets = new Map<string, string>(); // (keys,when) -> command, user layer only

  for (const entry of entries) {
    const slot = JSON.stringify([entry.keys, scope(entry.when)]);
    const existing = result.findIndex(
      (b) => b.keys === entry.keys && scope(b.when) === scope(entry.when),
    );
    if (existing !== -1) result.splice(existing, 1);

    if (isUnbind(entry)) {
      userTargets.delete(slot);
      continue;
    }

    const prior = userTargets.get(slot);
    if (prior !== undefined && prior !== entry.command) {
      diagnostics.push({
        key: entry.keys,
        kind: "binding-conflict",
        message: `"${entry.keys}" is bound to both ${prior} and ${entry.command}; the last one wins`,
      });
    }
    userTargets.set(slot, entry.command);
    result.push({
      keys: entry.keys,
      command: entry.command,
      ...(entry.when !== undefined ? { when: entry.when } : {}),
    });
  }

  // Prefix-key invariant: drop any binding that extends another with the same
  // scope (the prefix wins), reporting each as a conflict (design §4.2).
  const kept: Keybinding[] = [];
  for (const b of result) {
    const prefix = result.find(
      (a) =>
        a !== b &&
        scope(a.when) === scope(b.when) &&
        b.keys !== a.keys &&
        sequenceStartsWith(b.keys, a.keys),
    );
    if (prefix) {
      diagnostics.push({
        key: b.keys,
        kind: "binding-conflict",
        message: `"${b.keys}" conflicts with prefix binding "${prefix.keys}"; the prefix wins`,
      });
      continue;
    }
    kept.push(b);
  }

  return { bindings: kept, diagnostics };
}

/**
 * Find bindings that point at a command id absent from `knownCommands`
 * (design §11/§14). Pure - the command registry lives in the renderer, but the
 * check itself does not need it, so it is node-testable and reused in recompose.
 */
export function findUnresolvedBindings(
  bindings: readonly Keybinding[],
  knownCommands: ReadonlySet<string>,
): ConfigDiagnostic[] {
  const diagnostics: ConfigDiagnostic[] = [];
  for (const binding of bindings) {
    if (!knownCommands.has(binding.command)) {
      diagnostics.push({
        key: binding.keys,
        kind: "unresolvable-command",
        message: `keybinding "${binding.keys}" -> unregistered command "${binding.command}"`,
      });
    }
  }
  return diagnostics;
}
```

- [ ] **Step 4: Run the test + typecheck**

Run: `npx vitest run --project=node src/kernel/command/composeKeymap.test.ts`
Expected: PASS (7 tests).
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/kernel/command/composeKeymap.ts src/kernel/command/composeKeymap.test.ts
git commit -m "Add composeKeymap: layering, unbind, and conflict diagnostics"
```

---

### Task 6: Extend `KeybindingRegistry` — effective-table sink, reverse lookup, candidate query

Grow the registry (design §10) from an exact-match store into the effective-keymap sink the resolver and discoverability layer read: `setBindings` (the compose output), `getBindingsForCommand` (the `where-is` reverse lookup, design §8), and `getCandidates(pending, context)` (the prefix + `when`-satisfied filter the resolver and which-key consume). `registerKeybinding`/`getBindings`/`getBindingsForKeys` keep their step-1 shape.

**Files:**
- Modify: `src/kernel/command/keybindingRegistry.ts`
- Modify: `src/kernel/command/keybindingRegistry.test.ts`

**Interfaces:**
- Consumes: `Context` (Task 3), `matchesWhen` (Task 3), `sequenceStartsWith` (Task 2), `Keybinding` (Task 2).
- Produces (added to `KeybindingRegistry`):
  - `setBindings(bindings: readonly Keybinding[]): void` — replace the whole effective table.
  - `getBindingsForCommand(command: string): Keybinding[]`
  - `getCandidates(pending: string, context: Context): Keybinding[]`

- [ ] **Step 1: Add the failing tests**

Append to `src/kernel/command/keybindingRegistry.test.ts` (add the `Context` import at the top: `import type { Context } from "./context";`), inside the existing `describe`:

```ts
  test("setBindings replaces the whole table", () => {
    const registry = new KeybindingRegistry();
    registry.registerKeybinding({ keys: "Ctrl-s", command: "core.file.save" });
    registry.setBindings([{ keys: "Ctrl-x Ctrl-s", command: "core.file.save" }]);
    expect(registry.getBindings()).toEqual([{ keys: "Ctrl-x Ctrl-s", command: "core.file.save" }]);
  });

  test("getBindingsForCommand is the reverse lookup (design §8)", () => {
    const registry = new KeybindingRegistry();
    registry.setBindings([
      { keys: "Ctrl-x Ctrl-s", command: "core.file.save" },
      { keys: "Ctrl-c s", command: "core.file.save" },
      { keys: "Ctrl-x Ctrl-f", command: "core.file.open" },
    ]);
    expect(registry.getBindingsForCommand("core.file.save").map((b) => b.keys)).toEqual([
      "Ctrl-x Ctrl-s",
      "Ctrl-c s",
    ]);
  });

  test("getCandidates filters by prefix and satisfied when (design §4.3)", () => {
    const registry = new KeybindingRegistry();
    registry.setBindings([
      { keys: "Ctrl-x Ctrl-s", command: "core.file.save" },
      { keys: "Ctrl-x Ctrl-f", command: "core.file.open" },
      { keys: "Ctrl-n", command: "core.minibuffer.next", when: "minibufferOpen" },
    ]);
    const editor: Context = { isActive: () => false };
    const mb: Context = { isActive: (n) => n === "minibufferOpen" };
    expect(registry.getCandidates("Ctrl-x", editor).map((b) => b.keys)).toEqual([
      "Ctrl-x Ctrl-s",
      "Ctrl-x Ctrl-f",
    ]);
    expect(registry.getCandidates("Ctrl-n", editor)).toEqual([]); // when unsatisfied
    expect(registry.getCandidates("Ctrl-n", mb).map((b) => b.command)).toEqual(["core.minibuffer.next"]);
  });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run --project=node src/kernel/command/keybindingRegistry.test.ts`
Expected: FAIL — `setBindings` / `getBindingsForCommand` / `getCandidates` are not methods.

- [ ] **Step 3: Extend the registry**

Replace `src/kernel/command/keybindingRegistry.ts`:

```ts
import type { Disposable } from "./disposable";
import type { Context } from "./context";
import type { Keybinding } from "./types";
import { matchesWhen } from "./when";
import { sequenceStartsWith } from "./keys";

/**
 * Stores the effective key-sequence -> command-id bindings (design §6). The
 * renderer sets the composed default+user table via setBindings; the resolver
 * and discoverability layer read it. registerKeybinding remains the incremental
 * public API a plugin will use (kept for the pre-plugin path and tests).
 */
export class KeybindingRegistry {
  #bindings: Keybinding[] = [];

  registerKeybinding(binding: Keybinding): Disposable {
    this.#bindings.push(binding);
    return {
      dispose: () => {
        const index = this.#bindings.indexOf(binding);
        if (index !== -1) this.#bindings.splice(index, 1);
      },
    };
  }

  /** Replace the whole effective table (design §6/§7 - the compose output sink). */
  setBindings(bindings: readonly Keybinding[]): void {
    this.#bindings = [...bindings];
  }

  getBindings(): Keybinding[] {
    return [...this.#bindings];
  }

  /** Exact-sequence bindings (any context). */
  getBindingsForKeys(keys: string): Keybinding[] {
    return this.#bindings.filter((binding) => binding.keys === keys);
  }

  /** Reverse lookup: every binding pointing at a command id (design §8, where-is). */
  getBindingsForCommand(command: string): Keybinding[] {
    return this.#bindings.filter((binding) => binding.command === command);
  }

  /**
   * Bindings live in `context` whose sequence starts with `pending` (design
   * §4.3): the resolver's complete-match (keys === pending) and live-prefix
   * (keys longer than pending) branches both read this; which-key reads it too.
   */
  getCandidates(pending: string, context: Context): Keybinding[] {
    return this.#bindings.filter(
      (binding) => sequenceStartsWith(binding.keys, pending) && matchesWhen(binding.when, context),
    );
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run --project=node src/kernel/command/keybindingRegistry.test.ts`
Expected: PASS (all step-1 tests + the 3 new ones).
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/kernel/command/keybindingRegistry.ts src/kernel/command/keybindingRegistry.test.ts
git commit -m "Extend KeybindingRegistry: setBindings sink, reverse lookup, candidate query"
```

---

### Task 7: `KeySequenceResolver` — the pure prefix-key state machine

The timer-free heart (design §4.3): holds a pending chord sequence and, on each app-level chord, dispatches a complete binding, stays on a live prefix, aborts a mid-sequence dead-end, or falls a lone unmatched chord through to the editor. A pure function of (keymap, pending, chord, context); no DOM, no timers.

**Files:**
- Create: `src/kernel/command/keySequenceResolver.ts`
- Create: `src/kernel/command/keySequenceResolver.test.ts`

**Interfaces:**
- Consumes: `Context` (Task 3), `Keybinding` (Task 2), `joinSequence` (Task 2), and a `KeymapView` (satisfied by `KeybindingRegistry.getCandidates`).
- Produces:
  - `interface KeymapView { getCandidates(pending: string, context: Context): Keybinding[] }`
  - `type ResolveResult` (dispatch | pending | unbound | fallthrough)
  - `class KeySequenceResolver` — `press(chord): ResolveResult`, `reset()`, `get pending`, `get isPending`

- [ ] **Step 1: Write the failing test**

Create `src/kernel/command/keySequenceResolver.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { KeySequenceResolver } from "./keySequenceResolver";
import { KeybindingRegistry } from "./keybindingRegistry";
import { ContextRegistry } from "./context";

function make(bindings: { keys: string; command: string; when?: string }[]) {
  const keys = new KeybindingRegistry();
  keys.setBindings(bindings);
  const contexts = new ContextRegistry();
  return { resolver: new KeySequenceResolver(keys, contexts), contexts };
}

describe("KeySequenceResolver (design §4.3)", () => {
  test("a single complete chord dispatches immediately", () => {
    const { resolver } = make([{ keys: "Ctrl-Shift-p", command: "core.command.execute" }]);
    expect(resolver.press("Ctrl-Shift-p")).toEqual({
      kind: "dispatch",
      command: "core.command.execute",
      sequence: "Ctrl-Shift-p",
    });
  });

  test("a multi-stroke prefix stays pending, then dispatches", () => {
    const { resolver } = make([{ keys: "Ctrl-x Ctrl-s", command: "core.file.save" }]);
    const first = resolver.press("Ctrl-x");
    expect(first.kind).toBe("pending");
    expect(resolver.isPending).toBe(true);
    expect(resolver.press("Ctrl-s")).toMatchObject({ kind: "dispatch", command: "core.file.save" });
    expect(resolver.isPending).toBe(false);
  });

  test("a lone unmatched chord falls through to the editor", () => {
    const { resolver } = make([{ keys: "Ctrl-x Ctrl-s", command: "core.file.save" }]);
    expect(resolver.press("a")).toEqual({ kind: "fallthrough", chord: "a" });
  });

  test("a mid-sequence dead-end aborts as unbound and resets", () => {
    const { resolver } = make([{ keys: "Ctrl-x Ctrl-s", command: "core.file.save" }]);
    resolver.press("Ctrl-x");
    expect(resolver.press("z")).toEqual({ kind: "unbound", sequence: "Ctrl-x z" });
    expect(resolver.isPending).toBe(false);
  });

  test("a scoped binding beats an unscoped one for the same sequence", () => {
    const { resolver, contexts } = make([
      { keys: "Ctrl-n", command: "global.next" },
      { keys: "Ctrl-n", command: "core.minibuffer.next", when: "minibufferOpen" },
    ]);
    contexts.set("minibufferOpen", true);
    expect(resolver.press("Ctrl-n")).toMatchObject({ command: "core.minibuffer.next" });
  });

  test("reset clears a pending sequence", () => {
    const { resolver } = make([{ keys: "Ctrl-x Ctrl-s", command: "core.file.save" }]);
    resolver.press("Ctrl-x");
    resolver.reset();
    expect(resolver.isPending).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project=node src/kernel/command/keySequenceResolver.test.ts`
Expected: FAIL — cannot resolve `./keySequenceResolver`.

- [ ] **Step 3: Write the resolver**

Create `src/kernel/command/keySequenceResolver.ts`:

```ts
// src/kernel/command/keySequenceResolver.ts
import type { Context } from "./context";
import type { Keybinding } from "./types";
import { joinSequence } from "./keys";

/** What the keymap must answer for the resolver (design §4.3). */
export interface KeymapView {
  getCandidates(pending: string, context: Context): Keybinding[];
}

export type ResolveResult =
  | { readonly kind: "dispatch"; readonly command: string; readonly sequence: string }
  | { readonly kind: "pending"; readonly sequence: string; readonly continuations: readonly Keybinding[] }
  | { readonly kind: "unbound"; readonly sequence: string }
  | { readonly kind: "fallthrough"; readonly chord: string };

/** Specificity rank: a scoped binding (has `when`) beats an unscoped one. */
const specificity = (binding: Keybinding): number => (binding.when ? 1 : 0);

/**
 * The pure prefix-key state machine (design §4.3). Holds a pending chord
 * sequence and, on each app-level chord: dispatches a complete binding, stays
 * pending on a live prefix, aborts a mid-sequence dead-end, or falls a lone
 * unmatched chord through to the editor. No DOM, no timers - which-key's display
 * delay is a renderer concern, not resolver state.
 */
export class KeySequenceResolver {
  #pending: string[] = [];
  readonly #keymap: KeymapView;
  readonly #context: Context;

  constructor(keymap: KeymapView, context: Context) {
    this.#keymap = keymap;
    this.#context = context;
  }

  get pending(): string {
    return joinSequence(this.#pending);
  }

  /** True while a prefix sequence is in progress (which-key reads this). */
  get isPending(): boolean {
    return this.#pending.length > 0;
  }

  press(chord: string): ResolveResult {
    const wasEmpty = this.#pending.length === 0;
    const next = [...this.#pending, chord];
    const sequence = joinSequence(next);
    const candidates = this.#keymap.getCandidates(sequence, this.#context);

    const complete = candidates
      .filter((binding) => binding.keys === sequence)
      .sort((a, b) => specificity(b) - specificity(a)); // scoped beats unscoped

    if (complete.length > 0) {
      this.#pending = [];
      return { kind: "dispatch", command: complete[0]!.command, sequence };
    }
    if (candidates.length > 0) {
      this.#pending = next;
      return { kind: "pending", sequence, continuations: candidates };
    }
    this.#pending = [];
    return wasEmpty ? { kind: "fallthrough", chord } : { kind: "unbound", sequence };
  }

  reset(): void {
    this.#pending = [];
  }
}
```

- [ ] **Step 4: Run the test + typecheck**

Run: `npx vitest run --project=node src/kernel/command/keySequenceResolver.test.ts`
Expected: PASS (6 tests).
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/kernel/command/keySequenceResolver.ts src/kernel/command/keySequenceResolver.test.ts
git commit -m "Add the pure prefix-key KeySequenceResolver state machine"
```

---

### Task 8: The default keymap + the Law-1 invariant

The curated starter table as data (design §6, Appendix A), plus the enforced Law-1 guarantee that replaces the deleted parity test (design §3/§14): `registerCommand` rejects an empty `title`, so every command is minibuffer-addressable; and `composeKeymap(DEFAULT_KEYMAP, [])` yields **no** conflict diagnostics, so the shipped keymap is collision-free.

**Files:**
- Create: `src/kernel/command/defaultKeymap.ts`
- Create: `src/kernel/command/defaultKeymap.test.ts`
- Modify: `src/kernel/command/commandRegistry.ts`
- Modify: `src/kernel/command/commandRegistry.test.ts`

**Interfaces:**
- Consumes: `Keybinding` (Task 2), `composeKeymap` (Task 5).
- Produces:
  - `const DEFAULT_KEYMAP: readonly Keybinding[]`
  - `registerCommand` now throws `command title must be non-empty` on a blank title.

- [ ] **Step 1: Add the failing tests**

Create `src/kernel/command/defaultKeymap.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { DEFAULT_KEYMAP } from "./defaultKeymap";
import { composeKeymap } from "./composeKeymap";

// The command ids the default keymap is allowed to reference (design Appendix A).
const KNOWN = new Set([
  "core.command.execute",
  "core.file.open",
  "core.file.save",
  "core.app.quit",
  "core.abort",
  "core.help.describe-key",
  "core.help.describe-command",
  "core.minibuffer.accept",
  "core.minibuffer.cancel",
  "core.minibuffer.next",
  "core.minibuffer.prev",
]);

describe("DEFAULT_KEYMAP (design §6, Appendix A)", () => {
  test("every default binding points at a known core command id", () => {
    for (const binding of DEFAULT_KEYMAP) expect(KNOWN.has(binding.command)).toBe(true);
  });

  test("the shipped keymap composes with no conflict diagnostics (Law-1 invariant)", () => {
    expect(composeKeymap(DEFAULT_KEYMAP, []).diagnostics).toEqual([]);
  });
});
```

Append to `src/kernel/command/commandRegistry.test.ts` (inside the existing `describe`):

```ts
  test("registerCommand rejects an empty title (Law 1: minibuffer-addressable)", () => {
    const registry = new CommandRegistry();
    expect(() =>
      registry.registerCommand({ id: "core.x", title: "", run: () => {} }),
    ).toThrow(/title must be non-empty/);
  });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run --project=node src/kernel/command/defaultKeymap.test.ts src/kernel/command/commandRegistry.test.ts`
Expected: FAIL — cannot resolve `./defaultKeymap`; `registerCommand` does not throw on empty title.

- [ ] **Step 3: Enforce the non-empty title**

In `src/kernel/command/commandRegistry.ts`, add the guard at the top of `registerCommand` (before the duplicate-id check):

```ts
  registerCommand(command: Command): Disposable {
    if (command.title.trim() === "") {
      throw new Error(`command title must be non-empty: ${command.id}`);
    }
    if (this.#commands.has(command.id)) {
      throw new Error(`command already registered: ${command.id}`);
    }
    this.#commands.set(command.id, command);
    return {
      dispose: () => {
        if (this.#commands.get(command.id) === command) {
          this.#commands.delete(command.id);
        }
      },
    };
  }
```

- [ ] **Step 4: Write the default keymap**

Create `src/kernel/command/defaultKeymap.ts`:

```ts
// src/kernel/command/defaultKeymap.ts
import type { Keybinding } from "./types";

/**
 * The curated, Emacs-flavored default keymap the kernel installs at boot
 * (design §6, Appendix A). These are ordinary bindings - fully overridable by
 * keybindings.toml and removable with an unbind. Commands with no natural key
 * (core.config.open/reload, core.keys.bind/unbind) ship UNBOUND, deliberately
 * demonstrating Law 2: a command needs no binding - it is reachable by name.
 *
 * Note (a tuning of Appendix A): core.command.execute is bound to BOTH the Emacs
 * "M-x" idiom (Alt-x) and Ctrl-Shift-p. Electron's native menu can shadow a bare
 * Alt on Linux/Windows, so Ctrl-Shift-p is the reliable palette opener; Alt-x is
 * the Emacs alias. Both resolve to the same id.
 */
export const DEFAULT_KEYMAP: readonly Keybinding[] = [
  { keys: "Alt-x", command: "core.command.execute" },
  { keys: "Ctrl-Shift-p", command: "core.command.execute" },
  { keys: "Ctrl-x Ctrl-f", command: "core.file.open" },
  { keys: "Ctrl-x Ctrl-s", command: "core.file.save" },
  { keys: "Ctrl-x Ctrl-c", command: "core.app.quit" },
  { keys: "Ctrl-g", command: "core.abort" },
  { keys: "Ctrl-h k", command: "core.help.describe-key" },
  { keys: "Ctrl-h x", command: "core.help.describe-command" },
  { keys: "Enter", command: "core.minibuffer.accept", when: "minibufferOpen" },
  { keys: "Escape", command: "core.minibuffer.cancel", when: "minibufferOpen" },
  { keys: "Ctrl-n", command: "core.minibuffer.next", when: "minibufferOpen" },
  { keys: "ArrowDown", command: "core.minibuffer.next", when: "minibufferOpen" },
  { keys: "Ctrl-p", command: "core.minibuffer.prev", when: "minibufferOpen" },
  { keys: "ArrowUp", command: "core.minibuffer.prev", when: "minibufferOpen" },
];
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run --project=node src/kernel/command/defaultKeymap.test.ts src/kernel/command/commandRegistry.test.ts`
Expected: PASS.
Run: `npx vitest run --project=node`
Expected: the whole node suite is green.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/kernel/command/defaultKeymap.ts src/kernel/command/defaultKeymap.test.ts \
  src/kernel/command/commandRegistry.ts src/kernel/command/commandRegistry.test.ts
git commit -m "Add the default keymap and enforce the Law-1 non-empty-title invariant"
```

---

## Phase B — main-process integration (Tasks 9-10)

### Task 9: `KeybindingsService` + the pure `[[keybinding]]` writer

The `main`-owned owner of `keybindings.toml` (design §7/§13), mirroring `ConfigService`'s lifecycle: materialize on first run, load/validate/derive, reload, atomic write, change broadcast. The interactive bind/unbind flows write by **appending** a formatted `[[keybinding]]` block (comment-preserving by construction - append only), so no array-of-tables patching is needed and existing comments are never disturbed. The formatter is a separate pure module, node-tested directly.

**Files:**
- Create: `src/main/keybindingsToml.ts`
- Create: `src/main/keybindingsToml.test.ts`
- Create: `src/main/keybindingsService.ts`
- Create: `src/main/keybindingsService.test.ts`

**Interfaces:**
- Consumes: `validateKeybindings`, `DEFAULT_KEYBINDINGS_TOML`, `KeybindingsSnapshot` (Task 4); `parse` (`tomlConfigCodec`, step 3); `write-file-atomic`.
- Produces:
  - `interface RawBindingEntry { keys: string; command?: string; when?: string; unbind?: true }`
  - `function formatBindingEntry(entry: RawBindingEntry): string`
  - `function appendEntry(text: string, entry: RawBindingEntry): string`
  - `class KeybindingsService` — `constructor(dir)`, `readonly path`, `load()`, `reload()`, `bind(keys, command, when?)`, `unbind(keys, when?)`, `onDidChange(cb)`.

- [ ] **Step 1: Write the failing writer test**

Create `src/main/keybindingsToml.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { appendEntry, formatBindingEntry } from "./keybindingsToml";
import { parse } from "./tomlConfigCodec";

describe("keybindingsToml (design §7 append-only writer)", () => {
  test("formatBindingEntry emits a [[keybinding]] block", () => {
    expect(formatBindingEntry({ keys: "Ctrl-c s", command: "core.file.save" })).toBe(
      '[[keybinding]]\nkeys = "Ctrl-c s"\ncommand = "core.file.save"\n',
    );
  });

  test("an unbind block sets unbind = true and no command", () => {
    expect(formatBindingEntry({ keys: "Ctrl-x Ctrl-c", unbind: true })).toBe(
      '[[keybinding]]\nkeys = "Ctrl-x Ctrl-c"\nunbind = true\n',
    );
  });

  test("a when scope is emitted", () => {
    expect(formatBindingEntry({ keys: "Ctrl-n", command: "core.minibuffer.next", when: "minibufferOpen" })).toBe(
      '[[keybinding]]\nkeys = "Ctrl-n"\ncommand = "core.minibuffer.next"\nwhen = "minibufferOpen"\n',
    );
  });

  test("appendEntry separates blocks with a blank line and round-trips through parse", () => {
    const base = "# my keys\n";
    const once = appendEntry(base, { keys: "Ctrl-c s", command: "core.file.save" });
    const twice = appendEntry(once, { keys: "Ctrl-c o", command: "core.file.open" });
    expect(twice).toContain("# my keys");
    expect(parse(twice)).toEqual({
      keybinding: [
        { keys: "Ctrl-c s", command: "core.file.save" },
        { keys: "Ctrl-c o", command: "core.file.open" },
      ],
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project=node src/main/keybindingsToml.test.ts`
Expected: FAIL — cannot resolve `./keybindingsToml`.

- [ ] **Step 3: Write the writer**

Create `src/main/keybindingsToml.ts`:

```ts
// src/main/keybindingsToml.ts

/** A binding to append: a bind (keys+command) or an unbind (keys+unbind). */
export interface RawBindingEntry {
  readonly keys: string;
  readonly command?: string;
  readonly when?: string;
  readonly unbind?: true;
}

/** A TOML basic string. For Coal's ASCII keys/command ids, JSON quoting is valid TOML. */
const toTomlString = (value: string): string => JSON.stringify(value);

/** Format one `[[keybinding]]` block (design §7). */
export function formatBindingEntry(entry: RawBindingEntry): string {
  const lines = ["[[keybinding]]", `keys = ${toTomlString(entry.keys)}`];
  if (entry.unbind) lines.push("unbind = true");
  else if (entry.command !== undefined) lines.push(`command = ${toTomlString(entry.command)}`);
  if (entry.when !== undefined) lines.push(`when = ${toTomlString(entry.when)}`);
  return lines.join("\n") + "\n";
}

/**
 * Append a formatted block to the existing file text, separated by a blank line
 * (design §7). Append-only, so every existing comment and entry is preserved
 * verbatim - no TOML patching of the array-of-tables is needed.
 */
export function appendEntry(text: string, entry: RawBindingEntry): string {
  const block = formatBindingEntry(entry);
  if (text.length === 0) return block;
  const separator = text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
  return text + separator + block;
}
```

- [ ] **Step 4: Write the failing service test**

Create `src/main/keybindingsService.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KeybindingsService } from "./keybindingsService";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "coal-keys-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("KeybindingsService (design §7 keybindings.toml owner)", () => {
  test("load materializes keybindings.toml when absent; no entries, no diagnostics", async () => {
    const svc = new KeybindingsService(dir);
    const snap = await svc.load();
    expect(existsSync(svc.path)).toBe(true);
    expect(snap).toEqual({ entries: [], diagnostics: [] });
    expect(await readFile(svc.path, "utf-8")).toContain("# Coal - keybindings");
  });

  test("bind appends an entry that reloads into the snapshot, and emits", async () => {
    const svc = new KeybindingsService(dir);
    await svc.load();
    let emitted = 0;
    svc.onDidChange(() => {
      emitted += 1;
    });
    expect(await svc.bind("Ctrl-c s", "core.file.save")).toEqual({ ok: true });
    expect(emitted).toBe(1);
    expect(await readFile(svc.path, "utf-8")).toContain('keys = "Ctrl-c s"');
    const reloaded = await svc.reload();
    expect(reloaded.entries).toContainEqual({ keys: "Ctrl-c s", command: "core.file.save" });
  });

  test("unbind appends an unbind entry", async () => {
    const svc = new KeybindingsService(dir);
    await svc.load();
    await svc.unbind("Ctrl-x Ctrl-c");
    const snap = await svc.reload();
    expect(snap.entries).toContainEqual({ keys: "Ctrl-x Ctrl-c", unbind: true });
  });

  test("a malformed file loads to empty + a parse-error diagnostic, file untouched", async () => {
    const svc = new KeybindingsService(dir);
    const bad = "not = = valid ][\n";
    await writeFile(svc.path, bad, "utf-8");
    const snap = await svc.load();
    expect(snap.entries).toEqual([]);
    expect(snap.diagnostics[0]).toMatchObject({ kind: "parse-error" });
    expect(await readFile(svc.path, "utf-8")).toBe(bad);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run --project=node src/main/keybindingsService.test.ts`
Expected: FAIL — cannot resolve `./keybindingsService`.

- [ ] **Step 6: Write the service**

Create `src/main/keybindingsService.ts`:

```ts
// src/main/keybindingsService.ts
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import writeFileAtomic from "write-file-atomic";
import { DEFAULT_KEYBINDINGS_TOML } from "../kernel/config/keybindings/defaultTemplate";
import type { KeybindingsSnapshot } from "../kernel/config/keybindings/types";
import { validateKeybindings } from "../kernel/config/keybindings/validate";
import { parse } from "./tomlConfigCodec";
import { appendEntry, type RawBindingEntry } from "./keybindingsToml";

const EMPTY: KeybindingsSnapshot = { entries: [], diagnostics: [] };
type WriteResult = { ok: true } | { ok: false; error: string };

/**
 * Owns the global keybindings.toml (design §7/§13). The file text is the source
 * of truth; the typed snapshot is derived from it. bind/unbind append a
 * formatted block (comments preserved by construction). All IO is here, in main.
 */
export class KeybindingsService {
  readonly path: string;
  #text: string | null = null;
  #snapshot: KeybindingsSnapshot = EMPTY;
  #loaded = false;
  #listeners = new Set<(s: KeybindingsSnapshot) => void>();

  constructor(dir: string) {
    this.path = join(dir, "keybindings.toml");
  }

  async load(): Promise<KeybindingsSnapshot> {
    if (this.#loaded) return this.#snapshot;
    await this.#read();
    this.#loaded = true;
    return this.#snapshot;
  }

  async reload(): Promise<KeybindingsSnapshot> {
    await this.#read();
    this.#loaded = true;
    this.#emit();
    return this.#snapshot;
  }

  bind(keys: string, command: string, when?: string): Promise<WriteResult> {
    return this.#append({ keys, command, ...(when !== undefined ? { when } : {}) });
  }

  unbind(keys: string, when?: string): Promise<WriteResult> {
    return this.#append({ keys, unbind: true, ...(when !== undefined ? { when } : {}) });
  }

  onDidChange(cb: (s: KeybindingsSnapshot) => void): () => void {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  }

  async #append(entry: RawBindingEntry): Promise<WriteResult> {
    try {
      if (!this.#loaded) await this.load();
      const current = this.#text ?? DEFAULT_KEYBINDINGS_TOML;
      const nextText = appendEntry(current, entry);
      await this.#write(nextText);
      this.#text = nextText;
      this.#snapshot = this.#derive(nextText);
      this.#emit();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async #read(): Promise<void> {
    if (existsSync(this.path)) {
      this.#text = await readFile(this.path, "utf-8");
    } else {
      this.#text = DEFAULT_KEYBINDINGS_TOML;
      await this.#write(DEFAULT_KEYBINDINGS_TOML);
    }
    this.#snapshot = this.#derive(this.#text);
  }

  #derive(text: string): KeybindingsSnapshot {
    try {
      return validateKeybindings(parse(text));
    } catch (err) {
      return {
        entries: [],
        diagnostics: [
          { key: "", kind: "parse-error", message: err instanceof Error ? err.message : String(err) },
        ],
      };
    }
  }

  async #write(text: string): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFileAtomic(this.path, text);
  }

  #emit(): void {
    for (const listener of this.#listeners) {
      try {
        listener(this.#snapshot);
      } catch (err) {
        console.error("keybindings change listener threw:", err);
      }
    }
  }
}
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run --project=node src/main/keybindingsToml.test.ts src/main/keybindingsService.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/main/keybindingsToml.ts src/main/keybindingsToml.test.ts \
  src/main/keybindingsService.ts src/main/keybindingsService.test.ts
git commit -m "Add main KeybindingsService + the append-only [[keybinding]] writer"
```

---

### Task 10: Wire keybindings through the IPC contract, guards, preload, and main

The plumbing that exposes `window.coal.keybindings` and pushes `keybindings:changed`, mirroring the step-3 config wiring: contract channels + request types + `CoalApi.keybindings`, two payload guards, the preload bridge, the main handlers, and the `index.ts` instantiation + broadcast. No new logic - gated by typecheck + build; behavior is proven by the e2e in Task 16.

**Files:**
- Modify: `src/kernel/ipc/contract.ts`
- Modify: `src/main/guards.ts`
- Modify: `src/main/guards.test.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `KeybindingsService` (Task 9); `KeybindingsSnapshot` (Task 4).
- Produces:
  - `IPC.keybindingsLoad/keybindingsReload/keybindingsBind/keybindingsUnbind/keybindingsChanged/keybindingsOpen`
  - `interface KeybindingBindRequest { keys: string; command: string; when?: string }`
  - `interface KeybindingUnbindRequest { keys: string; when?: string }`
  - `type KeybindingWriteResult = { ok: true } | { ok: false; error: string }`
  - `CoalApi.keybindings.{ load, reload, bind, unbind, openInEditor }` + `CoalApi.onKeybindingsChanged`
  - `isKeybindingBindRequest`, `isKeybindingUnbindRequest`
  - `IpcDeps.keybindingsService: KeybindingsService`

- [ ] **Step 1: Write the failing guard tests**

Append to `src/main/guards.test.ts` (add `isKeybindingBindRequest, isKeybindingUnbindRequest` to the import):

```ts
describe("isKeybindingBindRequest", () => {
  test("accepts keys + command, with optional when", () => {
    expect(isKeybindingBindRequest({ keys: "Ctrl-c s", command: "core.file.save" })).toBe(true);
    expect(
      isKeybindingBindRequest({ keys: "Ctrl-n", command: "core.minibuffer.next", when: "minibufferOpen" }),
    ).toBe(true);
  });
  test("rejects a missing/empty field or a non-string when", () => {
    expect(isKeybindingBindRequest({ keys: "Ctrl-c s" })).toBe(false);
    expect(isKeybindingBindRequest({ keys: "", command: "core.file.save" })).toBe(false);
    expect(isKeybindingBindRequest({ keys: "Ctrl-c s", command: "core.file.save", when: 1 })).toBe(false);
    expect(isKeybindingBindRequest(null)).toBe(false);
  });
});

describe("isKeybindingUnbindRequest", () => {
  test("accepts keys, with optional when", () => {
    expect(isKeybindingUnbindRequest({ keys: "Ctrl-x Ctrl-c" })).toBe(true);
    expect(isKeybindingUnbindRequest({ keys: "Ctrl-n", when: "minibufferOpen" })).toBe(true);
  });
  test("rejects a missing keys or a non-string when", () => {
    expect(isKeybindingUnbindRequest({})).toBe(false);
    expect(isKeybindingUnbindRequest({ keys: "Ctrl-x", when: 2 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify the guard tests fail**

Run: `npx vitest run --project=node src/main/guards.test.ts`
Expected: FAIL — the guards are not exported.

- [ ] **Step 3: Extend the IPC contract**

In `src/kernel/ipc/contract.ts`, add the keybindings-type import + re-export near the top (after the existing config import):

```ts
import type { KeybindingsSnapshot } from "../config/keybindings/types";
export type { KeybindingsSnapshot, KeybindingEntry } from "../config/keybindings/types";
```

Add these channels to the `IPC` object (before the closing `} as const;`):

```ts
  keybindingsLoad: "coal:keybindings.load",
  keybindingsReload: "coal:keybindings.reload",
  keybindingsBind: "coal:keybindings.bind",
  keybindingsUnbind: "coal:keybindings.unbind",
  keybindingsChanged: "coal:keybindings.changed",
  keybindingsOpen: "coal:keybindings.open",
```

Add these types (after `ConfigSetResult`):

```ts
export interface KeybindingBindRequest {
  readonly keys: string;
  readonly command: string;
  readonly when?: string;
}

export interface KeybindingUnbindRequest {
  readonly keys: string;
  readonly when?: string;
}

export type KeybindingWriteResult = { ok: true } | { ok: false; error: string };
```

Inside `CoalApi`, add a `keybindings` member (alongside `config`) and an `onKeybindingsChanged` method (alongside `onConfigChanged`):

```ts
  keybindings: {
    load(): Promise<KeybindingsSnapshot>;
    reload(): Promise<KeybindingsSnapshot>;
    bind(req: KeybindingBindRequest): Promise<KeybindingWriteResult>;
    unbind(req: KeybindingUnbindRequest): Promise<KeybindingWriteResult>;
    /** Main opens keybindings.toml via fileService; the renderer never sees the path. */
    openInEditor(): Promise<OpenResult>;
  };
```

```ts
  /** keybindings.toml changed (bind / unbind / reload); main pushes the new snapshot. */
  onKeybindingsChanged(handler: (snapshot: KeybindingsSnapshot) => void): () => void;
```

- [ ] **Step 4: Add the guards**

In `src/main/guards.ts`, extend the contract import with the two request types, and add the guards (keep the existing exports):

```ts
import type {
  ConfigSetRequest,
  KeybindingBindRequest,
  KeybindingUnbindRequest,
  SaveRequest,
} from "../kernel/ipc/contract";
```

```ts
export function isKeybindingBindRequest(value: unknown): value is KeybindingBindRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v["keys"] !== "string" || v["keys"].length === 0) return false;
  if (typeof v["command"] !== "string" || v["command"].length === 0) return false;
  if (v["when"] !== undefined && typeof v["when"] !== "string") return false;
  return true;
}

export function isKeybindingUnbindRequest(value: unknown): value is KeybindingUnbindRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v["keys"] !== "string" || v["keys"].length === 0) return false;
  if (v["when"] !== undefined && typeof v["when"] !== "string") return false;
  return true;
}
```

- [ ] **Step 5: Extend the preload bridge**

In `src/preload/index.ts`, add to the imported types `KeybindingBindRequest, KeybindingUnbindRequest, KeybindingWriteResult, KeybindingsSnapshot`, then add a `keybindings` object to `api` (after the `config` block) and an `onKeybindingsChanged` method (after `onConfigChanged`):

```ts
  keybindings: {
    load: (): Promise<KeybindingsSnapshot> => ipcRenderer.invoke(IPC.keybindingsLoad),
    reload: (): Promise<KeybindingsSnapshot> => ipcRenderer.invoke(IPC.keybindingsReload),
    bind: (req: KeybindingBindRequest): Promise<KeybindingWriteResult> =>
      ipcRenderer.invoke(IPC.keybindingsBind, req),
    unbind: (req: KeybindingUnbindRequest): Promise<KeybindingWriteResult> =>
      ipcRenderer.invoke(IPC.keybindingsUnbind, req),
    openInEditor: (): Promise<OpenResult> => ipcRenderer.invoke(IPC.keybindingsOpen),
  },
```

```ts
  onKeybindingsChanged: (handler: (snapshot: KeybindingsSnapshot) => void): (() => void) => {
    const listener = (_event: unknown, snapshot: KeybindingsSnapshot): void => handler(snapshot);
    ipcRenderer.on(IPC.keybindingsChanged, listener);
    return () => ipcRenderer.removeListener(IPC.keybindingsChanged, listener);
  },
```

- [ ] **Step 6: Register the main handlers**

In `src/main/ipc.ts`, extend the imports:

```ts
import type { ConfigSnapshot, KeybindingsSnapshot, OpenResult, SaveResult } from "../kernel/ipc/contract";
import type { ConfigService } from "./configService";
import type { KeybindingsService } from "./keybindingsService";
import type { FileService } from "./fileService";
import {
  isConfigSetRequest,
  isKeybindingBindRequest,
  isKeybindingUnbindRequest,
  isSaveRequest,
} from "./guards";
```

Add `keybindingsService` to `IpcDeps`:

```ts
  keybindingsService: KeybindingsService;
```

Inside `registerIpc`, after the config handlers, add:

```ts
  const emptyKeybindings: KeybindingsSnapshot = { entries: [], diagnostics: [] };

  ipcMain.handle(IPC.keybindingsLoad, async (event): Promise<KeybindingsSnapshot> => {
    if (!deps.isTrustedSender(event)) return emptyKeybindings;
    return deps.keybindingsService.load();
  });

  ipcMain.handle(IPC.keybindingsReload, async (event): Promise<KeybindingsSnapshot> => {
    if (!deps.isTrustedSender(event)) return emptyKeybindings;
    return deps.keybindingsService.reload();
  });

  ipcMain.handle(IPC.keybindingsBind, async (event, payload: unknown) => {
    if (!deps.isTrustedSender(event)) return { ok: false, error: "untrusted sender" };
    if (!isKeybindingBindRequest(payload)) return { ok: false, error: "invalid bind request" };
    return deps.keybindingsService.bind(payload.keys, payload.command, payload.when);
  });

  ipcMain.handle(IPC.keybindingsUnbind, async (event, payload: unknown) => {
    if (!deps.isTrustedSender(event)) return { ok: false, error: "untrusted sender" };
    if (!isKeybindingUnbindRequest(payload)) return { ok: false, error: "invalid unbind request" };
    return deps.keybindingsService.unbind(payload.keys, payload.when);
  });

  ipcMain.handle(IPC.keybindingsOpen, async (event): Promise<OpenResult> => {
    if (!deps.isTrustedSender(event)) return { canceled: true };
    const result = await deps.fileService.openPath(deps.keybindingsService.path);
    if (!result.canceled && !("binary" in result)) deps.onDocPresent();
    return result;
  });
```

- [ ] **Step 7: Instantiate and broadcast in `index.ts`**

In `src/main/index.ts`, add the import (next to `ConfigService`):

```ts
import { KeybindingsService } from "./keybindingsService";
```

After `const configService = new ConfigService(app.getPath("userData"));`, add:

```ts
  const keybindingsService = new KeybindingsService(app.getPath("userData"));
```

Inside `app.whenReady().then(() => { ... })`, after the config eager-load + broadcast wiring, add:

```ts
    void keybindingsService
      .load() // materialize on first run, before the renderer asks
      .catch((err) => console.error("initial keybindings load failed:", err));
    keybindingsService.onDidChange((snapshot) => {
      mainWindow?.webContents.send(IPC.keybindingsChanged, snapshot);
    });
```

Add `keybindingsService` to the `registerIpc({ ... })` call (next to `configService`):

```ts
      configService,
      keybindingsService,
```

- [ ] **Step 8: Run guard tests + typecheck + build**

Run: `npx vitest run --project=node src/main/guards.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors (the contract, preload, handlers, and index all compile).
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/kernel/ipc/contract.ts src/main/guards.ts src/main/guards.test.ts \
  src/preload/index.ts src/main/ipc.ts src/main/index.ts
git commit -m "Wire keybindings.toml through IPC, guards, preload, and main"
```

---

## Phase C — the renderer input path + discoverability (Tasks 11-15)

### Task 11: `keyInput` — KeyboardEvent to canonical chord

The renderer adapter's smallest piece (design §4.1/§10): turn a `KeyboardEvent` into a canonical chord string (or `null` for a lone modifier), using `.code` for letters/digits (layout-independent) and `.key` for named keys, with Shift as an explicit modifier. Browser-tested against synthetic events.

**Files:**
- Create: `src/renderer/keyInput.ts`
- Create: `src/renderer/keyInput.browser.test.ts`

**Interfaces:**
- Consumes: `canonicalChord`, `Modifier` (Task 2).
- Produces: `function chordFromEvent(event: KeyboardEvent): string | null`

- [ ] **Step 1: Write the failing browser test**

Create `src/renderer/keyInput.browser.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { chordFromEvent } from "./keyInput";

const ev = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent("keydown", init);

describe("chordFromEvent (design §4.1)", () => {
  test("a letter uses .code, lowercased, layout-independent", () => {
    expect(chordFromEvent(ev({ code: "KeyS", key: "s", ctrlKey: true }))).toBe("Ctrl-s");
  });
  test("Shift is an explicit modifier, not folded into the character", () => {
    expect(chordFromEvent(ev({ code: "KeyP", key: "P", ctrlKey: true, shiftKey: true }))).toBe("Ctrl-Shift-p");
  });
  test("named keys use .key", () => {
    expect(chordFromEvent(ev({ code: "Enter", key: "Enter" }))).toBe("Enter");
    expect(chordFromEvent(ev({ code: "ArrowDown", key: "ArrowDown" }))).toBe("ArrowDown");
  });
  test("a digit uses .code", () => {
    expect(chordFromEvent(ev({ code: "Digit1", key: "1", altKey: true }))).toBe("Alt-1");
  });
  test("a lone modifier press yields null", () => {
    expect(chordFromEvent(ev({ code: "ControlLeft", key: "Control", ctrlKey: true }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project=browser src/renderer/keyInput.browser.test.ts`
Expected: FAIL — cannot resolve `./keyInput`.

- [ ] **Step 3: Write the adapter**

Create `src/renderer/keyInput.ts`:

```ts
// src/renderer/keyInput.ts
import { canonicalChord } from "../kernel/command/keys";
import type { Modifier } from "../kernel/command/keys";

/**
 * Map a KeyboardEvent to a canonical chord, or null for a modifier-only press
 * (design §4.1). The base token uses KeyboardEvent.code for letters/digits
 * (layout-independent) and .key for named keys; Shift is an explicit modifier.
 */
export function chordFromEvent(event: KeyboardEvent): string | null {
  const base = baseToken(event);
  if (base === null) return null;
  const mods: Modifier[] = [];
  if (event.ctrlKey) mods.push("Ctrl");
  if (event.altKey) mods.push("Alt");
  if (event.shiftKey) mods.push("Shift");
  if (event.metaKey) mods.push("Meta");
  return canonicalChord(mods, base);
}

function baseToken(event: KeyboardEvent): string | null {
  const code = event.code;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase(); // KeyS -> s
  if (/^Digit[0-9]$/.test(code)) return code.slice(5); // Digit1 -> 1
  const key = event.key;
  if (key === "Control" || key === "Alt" || key === "Shift" || key === "Meta") return null;
  return key; // Enter, Escape, Tab, ArrowDown, F1, ...
}
```

- [ ] **Step 4: Run the test + typecheck**

Run: `npx vitest run --project=browser src/renderer/keyInput.browser.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/keyInput.ts src/renderer/keyInput.browser.test.ts
git commit -m "Add the keyInput adapter (KeyboardEvent -> canonical chord)"
```

---

### Task 12: Minibuffer — `readKeySequence`, key-hints, and imperative controls

Three additions to the minibuffer (design §7/§8): the `readKeySequence` primitive (capture a raw chord sequence, the counterpart to `quickPick` the bind flow + Describe-Key need); the `QuickPickItem.keyHint` field + its right-aligned rendering (`where-is` in the palette); and `accept`/`cancel`/`next`/`prev` methods + an `onDidChangeOpen` signal, so the resolver-dispatched `core.minibuffer.*` commands drive navigation (the interim internal keydown handling is removed - the resolver now owns nav keys via `minibufferOpen`-scoped bindings, design §5).

**Files:**
- Modify: `src/kernel/minibuffer/types.ts`
- Modify: `src/renderer/minibuffer.ts`
- Modify: `src/renderer/minibuffer.browser.test.ts`

**Interfaces:**
- Consumes: `chordFromEvent` (Task 11); `joinSequence` (Task 2).
- Produces:
  - `QuickPickItem.keyHint?: string`
  - `interface ReadKeySequenceOptions { prompt?: string; placeholder?: string; continueWhile?(sequence: string): boolean }`
  - `Minibuffer`: `readKeySequence(opts?): Promise<string | undefined>`, `accept()`, `cancel()`, `next()`, `prev()`, `isCapturingKeys()`, `onDidChangeOpen(cb: (open: boolean) => void): () => void`.

- [ ] **Step 1: Extend the minibuffer types**

In `src/kernel/minibuffer/types.ts`, add `keyHint` to `QuickPickItem` and the new options interface:

```ts
/** A selectable row in the minibuffer's quick-pick list. */
export interface QuickPickItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  /** A right-aligned key-hint (the command's current binding; design §8 where-is). */
  readonly keyHint?: string;
}
```

```ts
/** Options for a raw key-sequence capture (design §7). */
export interface ReadKeySequenceOptions {
  readonly prompt?: string;
  readonly placeholder?: string;
  /** Keep capturing while the accumulated sequence is a live prefix; default: stop after one chord. */
  continueWhile?(sequence: string): boolean;
}
```

- [ ] **Step 2: Rewrite the minibuffer browser test to the new control surface**

Replace `src/renderer/minibuffer.browser.test.ts` (typing still filters via the input's `input` event; navigation/accept/cancel now go through the imperative methods the resolver will call; plus key-hint rendering and `readKeySequence`):

```ts
// src/renderer/minibuffer.browser.test.ts
import { describe, expect, test } from "vitest";
import { userEvent } from "@vitest/browser/context";
import { Minibuffer } from "./minibuffer";
import type { QuickPickItem } from "../kernel/minibuffer/types";

const items: QuickPickItem[] = [
  { id: "core.file.open", label: "Open File…" },
  { id: "core.file.save", label: "Save", keyHint: "Ctrl-x Ctrl-s" },
  { id: "core.app.quit", label: "Quit" },
];

function mount(): { host: HTMLElement; mb: Minibuffer } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return { host, mb: new Minibuffer(host) };
}

describe("Minibuffer (design §3/§7/§8)", () => {
  test("type to filter, accept() resolves the selected item", async () => {
    const { host, mb } = mount();
    const pick = mb.quickPick(items, { prompt: ">", placeholder: "Run a command" });
    expect(mb.isOpen()).toBe(true);
    await userEvent.keyboard("save");
    mb.accept();
    expect((await pick)?.id).toBe("core.file.save");
    expect(mb.isOpen()).toBe(false);
    host.remove();
  });

  test("cancel() resolves undefined and closes", async () => {
    const { host, mb } = mount();
    const pick = mb.quickPick(items);
    mb.cancel();
    expect(await pick).toBeUndefined();
    host.remove();
  });

  test("next() moves the selection before accepting", async () => {
    const { host, mb } = mount();
    const pick = mb.quickPick(items); // [Open File…, Save, Quit], selected 0
    mb.next(); // -> Save
    mb.accept();
    expect((await pick)?.id).toBe("core.file.save");
    host.remove();
  });

  test("a row renders its keyHint", async () => {
    const { host, mb } = mount();
    void mb.quickPick(items);
    expect(host.querySelector(".coal-mb-keyhint")?.textContent).toBe("Ctrl-x Ctrl-s");
    host.remove();
  });

  test("onDidChangeOpen reports open then close", async () => {
    const { host, mb } = mount();
    const seen: boolean[] = [];
    mb.onDidChangeOpen((open) => seen.push(open));
    const pick = mb.quickPick(items);
    mb.cancel();
    await pick;
    expect(seen).toEqual([true, false]);
    host.remove();
  });

  test("readKeySequence captures a single chord and resolves it", async () => {
    const { host, mb } = mount();
    const seq = mb.readKeySequence();
    await userEvent.keyboard("{Control>}s{/Control}"); // Ctrl-s
    expect(await seq).toBe("Ctrl-s");
    host.remove();
  });

  test("readKeySequence continues while continueWhile is true", async () => {
    const { host, mb } = mount();
    const seq = mb.readKeySequence({ continueWhile: (s) => s === "Ctrl-x" });
    await userEvent.keyboard("{Control>}x{/Control}"); // Ctrl-x -> continue
    await userEvent.keyboard("{Control>}s{/Control}"); // Ctrl-s -> stop
    expect(await seq).toBe("Ctrl-x Ctrl-s");
    host.remove();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run --project=browser src/renderer/minibuffer.browser.test.ts`
Expected: FAIL — `accept`/`next`/`onDidChangeOpen`/`readKeySequence`/`.coal-mb-keyhint` do not exist yet.

- [ ] **Step 4: Rework the minibuffer**

Edit `src/renderer/minibuffer.ts`:

(a) Add the two imports at the top:

```ts
import { chordFromEvent } from "./keyInput";
import { joinSequence } from "../kernel/command/keys";
import type {
  QuickPickItem,
  QuickPickOptions,
  RankedItem,
  ReadKeySequenceOptions,
} from "../kernel/minibuffer/types";
```

(b) Add a key-hint CSS rule to the `CSS` string (after `.coal-mb-desc`):

```ts
.coal-mb-keyhint { margin-left: auto; padding-left: 1em; opacity: 0.7; }
```

(c) Add the two fields next to the existing ones:

```ts
  #capturingKeys = false;
  #openListeners = new Set<(open: boolean) => void>();
```

(d) Remove the internal keydown handler: delete `this.#input.addEventListener("keydown", (e) => this.#onKeydown(e));` from the constructor and delete the whole `#onKeydown` method. Ordinary typing still flows through the existing `input` listener.

(e) In `quickPick`, after `this.#open = true;`, emit the open signal:

```ts
    this.#open = true;
    this.#emitOpen(true);
```

(f) Replace `#finish` with a `#closeOverlay` helper + the new imperative controls:

```ts
  /** Accept the highlighted item (design §5: core.minibuffer.accept). */
  accept(): void {
    this.#finish(this.#model?.selected());
  }

  /** Cancel with no selection (core.minibuffer.cancel / core.abort). */
  cancel(): void {
    this.#finish(undefined);
  }

  next(): void {
    this.#model?.moveDown();
    this.#render();
  }

  prev(): void {
    this.#model?.moveUp();
    this.#render();
  }

  isCapturingKeys(): boolean {
    return this.#capturingKeys;
  }

  onDidChangeOpen(cb: (open: boolean) => void): () => void {
    this.#openListeners.add(cb);
    return () => {
      this.#openListeners.delete(cb);
    };
  }

  #finish(item: QuickPickItem | undefined): void {
    const resolve = this.#resolve;
    this.#resolve = null;
    this.#model = null;
    this.#closeOverlay();
    resolve?.(item);
  }

  #closeOverlay(): void {
    this.#root.classList.remove("open");
    this.#open = false;
    this.#emitOpen(false);
    if (this.#prevFocus instanceof HTMLElement) this.#prevFocus.focus();
  }

  #emitOpen(open: boolean): void {
    for (const listener of this.#openListeners) listener(open);
  }
```

(g) Add `readKeySequence` (its own capture-phase keydown, so it is not routed through the app resolver while active):

```ts
  /**
   * Capture a raw chord sequence (design §7). Resolves the canonical sequence,
   * or undefined if the user aborts (Escape on an empty sequence). While active,
   * isCapturingKeys() is true so the app input path defers to this capture.
   */
  readKeySequence(opts: ReadKeySequenceOptions = {}): Promise<string | undefined> {
    this.#prevFocus = document.activeElement;
    this.#promptEl.textContent = opts.prompt ?? "Key:";
    this.#input.value = "";
    this.#input.placeholder = opts.placeholder ?? "Type a key sequence";
    this.#list.textContent = "";
    this.#root.classList.add("open");
    this.#open = true;
    this.#capturingKeys = true;
    this.#emitOpen(true);
    this.#input.focus();

    const chords: string[] = [];
    const continueWhile = opts.continueWhile ?? ((): boolean => false);

    return new Promise((resolve) => {
      const finish = (value: string | undefined): void => {
        window.removeEventListener("keydown", onKey, true);
        this.#capturingKeys = false;
        this.#closeOverlay();
        resolve(value);
      };
      const onKey = (e: KeyboardEvent): void => {
        if (e.isComposing) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const chord = chordFromEvent(e);
        if (chord === null) return; // a lone modifier
        if (chord === "Escape" && chords.length === 0) {
          finish(undefined);
          return;
        }
        chords.push(chord);
        const sequence = joinSequence(chords);
        this.#input.value = sequence;
        if (!continueWhile(sequence)) finish(sequence);
      };
      window.addEventListener("keydown", onKey, true);
    });
  }
```

(h) In `#renderItem`, render the key-hint after the description block:

```ts
    if (r.item.keyHint) {
      const hint = document.createElement("span");
      hint.className = "coal-mb-keyhint";
      hint.textContent = r.item.keyHint;
      li.appendChild(hint);
    }
    return li;
```

- [ ] **Step 5: Run the browser test + typecheck**

Run: `npx vitest run --project=browser src/renderer/minibuffer.browser.test.ts`
Expected: PASS (7 tests).
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/kernel/minibuffer/types.ts src/renderer/minibuffer.ts src/renderer/minibuffer.browser.test.ts
git commit -m "Add minibuffer readKeySequence, key-hints, and imperative controls"
```

---

### Task 13: The which-key continuation panel

The DOM panel the resolver's live-prefix state feeds (design §8): given a pending sequence and its continuations (each a next-chord + command title), list them; hide on dispatch/abort. Pure DOM; browser-tested with data (the display delay + wiring live in Task 15).

**Files:**
- Create: `src/renderer/whichKey.ts`
- Create: `src/renderer/whichKey.browser.test.ts`

**Interfaces:**
- Produces:
  - `interface WhichKeyEntry { chord: string; title: string }`
  - `class WhichKey` — `constructor(host)`, `show(pending: string, entries: readonly WhichKeyEntry[])`, `hide()`, `isOpen()`

- [ ] **Step 1: Write the failing browser test**

Create `src/renderer/whichKey.browser.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { WhichKey } from "./whichKey";

describe("WhichKey (design §8 continuation panel)", () => {
  test("show renders the pending sequence and each continuation; hide closes", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const wk = new WhichKey(host);

    wk.show("Ctrl-x", [
      { chord: "Ctrl-s", title: "Save" },
      { chord: "Ctrl-f", title: "Open File…" },
    ]);
    expect(wk.isOpen()).toBe(true);
    expect(host.querySelectorAll(".coal-whichkey-row")).toHaveLength(2);
    expect(host.querySelector(".coal-whichkey-chord")?.textContent).toBe("Ctrl-s");

    wk.hide();
    expect(wk.isOpen()).toBe(false);
    host.remove();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project=browser src/renderer/whichKey.browser.test.ts`
Expected: FAIL — cannot resolve `./whichKey`.

- [ ] **Step 3: Write the panel**

Create `src/renderer/whichKey.ts`:

```ts
// src/renderer/whichKey.ts

const STYLE_ID = "coal-whichkey-style";
const CSS = `
.coal-whichkey {
  position: fixed; left: 0; right: 0; bottom: 0; display: none; flex-direction: column;
  font: 12px/1.5 monospace; background: #141414; color: #ddd; border-top: 1px solid #333;
  padding: 4px 8px; max-height: 40vh; overflow-y: auto; z-index: 20;
}
.coal-whichkey.open { display: flex; }
.coal-whichkey-pending { opacity: 0.7; margin-bottom: 2px; }
.coal-whichkey-row { display: flex; gap: 8px; }
.coal-whichkey-chord { color: #9be29b; min-width: 8em; }
`;

/** One continuation: the next chord + the command it (eventually) runs. */
export interface WhichKeyEntry {
  readonly chord: string;
  readonly title: string;
}

/** The bottom continuation panel shown while a prefix sequence is pending (design §8). */
export class WhichKey {
  readonly #root: HTMLDivElement;
  readonly #pending: HTMLDivElement;
  readonly #list: HTMLDivElement;

  constructor(host: HTMLElement) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.#root = document.createElement("div");
    this.#root.className = "coal-whichkey";
    this.#pending = document.createElement("div");
    this.#pending.className = "coal-whichkey-pending";
    this.#list = document.createElement("div");
    this.#root.append(this.#pending, this.#list);
    host.appendChild(this.#root);
  }

  show(pending: string, entries: readonly WhichKeyEntry[]): void {
    this.#pending.textContent = `${pending} -`;
    this.#list.textContent = "";
    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "coal-whichkey-row";
      const chord = document.createElement("span");
      chord.className = "coal-whichkey-chord";
      chord.textContent = entry.chord;
      const title = document.createElement("span");
      title.textContent = entry.title;
      row.append(chord, title);
      this.#list.appendChild(row);
    }
    this.#root.classList.add("open");
  }

  hide(): void {
    this.#root.classList.remove("open");
  }

  isOpen(): boolean {
    return this.#root.classList.contains("open");
  }
}
```

- [ ] **Step 4: Run the test + typecheck**

Run: `npx vitest run --project=browser src/renderer/whichKey.browser.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/whichKey.ts src/renderer/whichKey.browser.test.ts
git commit -m "Add the which-key continuation panel"
```

---

### Task 14: The echo area

The lightweight transient bottom surface (design §8) that renders Describe-Key/Command output and the "`<sequence>` is not bound" messages. Pure DOM; browser-tested.

**Files:**
- Create: `src/renderer/echoArea.ts`
- Create: `src/renderer/echoArea.browser.test.ts`

**Interfaces:**
- Produces: `class EchoArea` — `constructor(host)`, `message(text: string)`, `clear()`, `get text(): string`

- [ ] **Step 1: Write the failing browser test**

Create `src/renderer/echoArea.browser.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { EchoArea } from "./echoArea";

describe("EchoArea (design §8 transient message surface)", () => {
  test("message shows text; clear hides it", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const echo = new EchoArea(host);

    echo.message("Ctrl-x z is not bound");
    expect(host.querySelector(".coal-echo.open")?.textContent).toBe("Ctrl-x z is not bound");
    expect(echo.text).toBe("Ctrl-x z is not bound");

    echo.clear();
    expect(host.querySelector(".coal-echo.open")).toBeNull();
    host.remove();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project=browser src/renderer/echoArea.browser.test.ts`
Expected: FAIL — cannot resolve `./echoArea`.

- [ ] **Step 3: Write the echo area**

Create `src/renderer/echoArea.ts`:

```ts
// src/renderer/echoArea.ts

const STYLE_ID = "coal-echo-style";
const CSS = `
.coal-echo {
  position: fixed; left: 0; right: 0; bottom: 0; display: none;
  font: 12px/1.6 monospace; background: #101010; color: #cfe3ff;
  border-top: 1px solid #333; padding: 2px 8px; white-space: pre-wrap; z-index: 30;
}
.coal-echo.open { display: block; }
`;

/**
 * A minimized echo area (design §8, Emacs's echo area / *Help* buffer): a
 * transient bottom text surface for Describe-Key/Command output and the
 * "<sequence> is not bound" messages.
 */
export class EchoArea {
  readonly #root: HTMLDivElement;

  constructor(host: HTMLElement) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.#root = document.createElement("div");
    this.#root.className = "coal-echo";
    host.appendChild(this.#root);
  }

  message(text: string): void {
    this.#root.textContent = text;
    this.#root.classList.add("open");
  }

  clear(): void {
    this.#root.textContent = "";
    this.#root.classList.remove("open");
  }

  get text(): string {
    return this.#root.textContent ?? "";
  }
}
```

- [ ] **Step 4: Run the test + typecheck**

Run: `npx vitest run --project=browser src/renderer/echoArea.browser.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/echoArea.ts src/renderer/echoArea.browser.test.ts
git commit -m "Add the echo area (transient message/help surface)"
```

---

### Task 15: Rewire the composition root — the resolver-fed input path

The keystone (design §10): replace step 3's two dispatch paths (the CM6 app-keymap via `editor.setBindings`, and the window-global keydown exact-match loop) with a single capture-phase input path that feeds every app-level chord to the `KeySequenceResolver`. Add the `KeybindingsClient` (reactive `keybindings.toml` replica), compose the default + user keymap into the registry, register the new commands (`core.abort`, `core.minibuffer.*`, `core.help.describe-*`, `core.keys.bind/unbind`, `core.keybindings.*`), wire which-key + the echo area + contexts, and correct the now-stale native-menu accelerators. Gated by typecheck + build; behavior is proven by the Task 16 e2e.

**Files:**
- Create: `src/renderer/keybindings.ts`
- Create: `src/renderer/keybindings.test.ts`
- Modify: `src/renderer/main.ts` (full rewrite)
- Modify: `src/main/menu.ts` (drop stale multi-stroke accelerators)

**Interfaces:**
- Consumes: everything from Tasks 2-14; `window.coal.keybindings` (Task 10).
- Produces:
  - `class KeybindingsClient` — `init()`, `get entries`, `onChange(cb)`, `bind(req)`, `unbind(req)`, `reload()`.
  - Commands: `core.abort`, `core.minibuffer.accept/cancel/next/prev`, `core.help.describe-key`, `core.help.describe-command`, `core.keys.bind`, `core.keys.unbind`, `core.keybindings.open`, `core.keybindings.reload` (plus the carried-over file/config commands).

- [ ] **Step 1: Write the failing KeybindingsClient test**

Create `src/renderer/keybindings.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { KeybindingsClient } from "./keybindings";
import type { CoalApi } from "../kernel/ipc/contract";
import type { KeybindingsSnapshot } from "../kernel/config/keybindings/types";

function fakeApi(initial: KeybindingsSnapshot): { api: CoalApi; fire(s: KeybindingsSnapshot): void } {
  let handler: (s: KeybindingsSnapshot) => void = () => {};
  const api = {
    keybindings: {
      load: vi.fn(async () => initial),
      reload: vi.fn(async () => initial),
      bind: vi.fn(async () => ({ ok: true }) as const),
      unbind: vi.fn(async () => ({ ok: true }) as const),
      openInEditor: vi.fn(async () => ({ canceled: true }) as const),
    },
    onKeybindingsChanged: (h: (s: KeybindingsSnapshot) => void) => {
      handler = h;
      return () => {};
    },
  } as unknown as CoalApi;
  return { api, fire: (s) => handler(s) };
}

describe("KeybindingsClient (design §7 reactive replica)", () => {
  test("init loads entries", async () => {
    const { api } = fakeApi({ entries: [{ keys: "Ctrl-c s", command: "core.file.save" }], diagnostics: [] });
    const client = new KeybindingsClient(api);
    await client.init();
    expect(client.entries).toEqual([{ keys: "Ctrl-c s", command: "core.file.save" }]);
  });

  test("a keybindings:changed push updates entries and notifies", async () => {
    const { api, fire } = fakeApi({ entries: [], diagnostics: [] });
    const client = new KeybindingsClient(api);
    await client.init();
    let fired = 0;
    client.onChange(() => {
      fired += 1;
    });
    fire({ entries: [{ keys: "Ctrl-x Ctrl-c", unbind: true }], diagnostics: [] });
    expect(client.entries).toEqual([{ keys: "Ctrl-x Ctrl-c", unbind: true }]);
    expect(fired).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --project=node src/renderer/keybindings.test.ts`
Expected: FAIL — cannot resolve `./keybindings`.

- [ ] **Step 3: Write the KeybindingsClient**

Create `src/renderer/keybindings.ts`:

```ts
// src/renderer/keybindings.ts
import type { KeybindingEntry, KeybindingsSnapshot } from "../kernel/config/keybindings/types";
import type {
  CoalApi,
  KeybindingBindRequest,
  KeybindingUnbindRequest,
  KeybindingWriteResult,
} from "../kernel/ipc/contract";

/**
 * Renderer-side reactive replica of keybindings.toml (design §7). Holds the
 * latest snapshot from main and re-broadcasts changes to subscribers (the
 * composition root recomposes the keymap on each). DOM-free; the coal API is
 * injected so it is unit-testable.
 */
export class KeybindingsClient {
  #api: CoalApi;
  #snapshot: KeybindingsSnapshot = { entries: [], diagnostics: [] };
  #listeners = new Set<(s: KeybindingsSnapshot) => void>();

  constructor(api: CoalApi) {
    this.#api = api;
  }

  async init(): Promise<KeybindingsSnapshot> {
    this.#snapshot = await this.#api.keybindings.load();
    this.#api.onKeybindingsChanged((snapshot) => {
      this.#snapshot = snapshot;
      for (const listener of this.#listeners) listener(snapshot);
    });
    return this.#snapshot;
  }

  get entries(): readonly KeybindingEntry[] {
    return this.#snapshot.entries;
  }

  get snapshot(): KeybindingsSnapshot {
    return this.#snapshot;
  }

  onChange(cb: (s: KeybindingsSnapshot) => void): () => void {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  }

  bind(req: KeybindingBindRequest): Promise<KeybindingWriteResult> {
    return this.#api.keybindings.bind(req);
  }

  unbind(req: KeybindingUnbindRequest): Promise<KeybindingWriteResult> {
    return this.#api.keybindings.unbind(req);
  }

  reload(): Promise<KeybindingsSnapshot> {
    return this.#api.keybindings.reload();
  }
}
```

- [ ] **Step 4: Run the client test to verify it passes**

Run: `npx vitest run --project=node src/renderer/keybindings.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Rewrite `main.ts` as the resolver-fed composition root**

Replace `src/renderer/main.ts` entirely:

```ts
// src/renderer/main.ts
import { CommandRegistry } from "../kernel/command/commandRegistry";
import { KeybindingRegistry } from "../kernel/command/keybindingRegistry";
import { DisposableStore } from "../kernel/command/disposable";
import { ContextRegistry } from "../kernel/command/context";
import { KeySequenceResolver } from "../kernel/command/keySequenceResolver";
import { composeKeymap, findUnresolvedBindings } from "../kernel/command/composeKeymap";
import { DEFAULT_KEYMAP } from "../kernel/command/defaultKeymap";
import { matchesWhen } from "../kernel/command/when";
import { splitSequence } from "../kernel/command/keys";
import type { CommandContext, Keybinding } from "../kernel/command/types";
import { chordFromEvent } from "./keyInput";
import { createEditor } from "./editor";
import { ConfigClient } from "./config";
import { KeybindingsClient } from "./keybindings";
import { Minibuffer } from "./minibuffer";
import { WhichKey } from "./whichKey";
import { EchoArea } from "./echoArea";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

let currentDocId: string | null = null;

const store = new DisposableStore();
const commands = new CommandRegistry();
const keys = new KeybindingRegistry();
const contexts = new ContextRegistry();
const editor = createEditor(root, (isDirty) => window.coal.doc.setDirty(isDirty));
const minibuffer = new Minibuffer(document.body);
const whichKey = new WhichKey(document.body);
const echo = new EchoArea(document.body);
const ctx: CommandContext = { editor: editor.facade };

const config = new ConfigClient(window.coal);
const keybindings = new KeybindingsClient(window.coal);
const resolver = new KeySequenceResolver(keys, contexts);

const WHICHKEY_DELAY_MS = 400;
let whichKeyTimer: ReturnType<typeof setTimeout> | null = null;

/** Run a command if it exists and is enabled; report whether it consumed the key. */
const dispatch = (commandId: string): boolean => {
  const command = commands.getCommand(commandId);
  if (!command) return false;
  if (command.isEnabled && !command.isEnabled(ctx)) return false;
  void commands.executeCommand(commandId, ctx).catch((err) => console.error(err));
  return true;
};

const hideWhichKey = (): void => {
  if (whichKeyTimer !== null) {
    clearTimeout(whichKeyTimer);
    whichKeyTimer = null;
  }
  whichKey.hide();
};

const showWhichKey = (sequence: string, continuations: readonly Keybinding[]): void => {
  hideWhichKey();
  const consumed = splitSequence(sequence).length;
  whichKeyTimer = setTimeout(() => {
    const entries = continuations.map((binding) => {
      const command = commands.getCommand(binding.command);
      return {
        chord: splitSequence(binding.keys).slice(consumed).join(" "),
        title: command?.title ?? binding.command,
      };
    });
    whichKey.show(sequence, entries);
  }, WHICHKEY_DELAY_MS);
};

/** The current highest-precedence binding for a command in-context (design §8 where-is): among
 * the satisfied bindings, a scoped (`when`) binding outranks an unscoped one. */
const currentHint = (commandId: string): string | undefined =>
  keys
    .getBindingsForCommand(commandId)
    .filter((b) => matchesWhen(b.when, contexts))
    .sort((a, b) => (b.when ? 1 : 0) - (a.when ? 1 : 0))[0]?.keys;

/** Keep capturing a sequence while it is a live prefix of some binding. */
const continueWhilePrefix = (sequence: string): boolean =>
  keys.getCandidates(sequence, contexts).some((b) => b.keys !== sequence);

/** Compose the default + user keymap into the registry; surface problems (design §5/§11). */
const recompose = (): void => {
  const { bindings, diagnostics } = composeKeymap(DEFAULT_KEYMAP, keybindings.entries);
  keys.setBindings(bindings);
  const known = new Set(commands.getCommands().map((c) => c.id));
  const problems = [...diagnostics, ...findUnresolvedBindings(bindings, known)];
  for (const problem of problems) console.warn(`keybinding problem: ${problem.message}`);
  if (problems.length > 0) echo.message(`${problems.length} keybinding problem(s) - see keybindings.toml`);
};
keybindings.onChange(recompose);

// --- contexts (design §5) -------------------------------------------------
contexts.set("editorFocused", true);
minibuffer.onDidChangeOpen((open) => contexts.set("minibufferOpen", open));
editor.view.contentDOM.addEventListener("focus", () => contexts.set("editorFocused", true));
editor.view.contentDOM.addEventListener("blur", () => contexts.set("editorFocused", false));

// --- commands -------------------------------------------------------------
store.add(
  commands.registerCommand({
    id: "core.file.open",
    title: "Open File…",
    run: async () => {
      const result = await window.coal.file.open();
      if (result.canceled || "binary" in result) return;
      editor.facade.setText(result.doc.text);
      currentDocId = result.doc.id;
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.file.save",
    title: "Save",
    run: async (c) => {
      if (currentDocId === null || !c.editor) return;
      const res = await window.coal.file.save({ id: currentDocId, text: c.editor.getText() });
      if (res.ok) c.editor.markClean();
    },
  }),
);

store.add(
  commands.registerCommand({ id: "core.app.quit", title: "Quit", run: () => window.coal.app.quit() }),
);

store.add(
  commands.registerCommand({
    id: "core.command.execute",
    title: "Run Command…",
    run: async (c) => {
      const items = commands
        .getCommands()
        .filter((cmd) => !cmd.isEnabled || cmd.isEnabled(c))
        .map((cmd) => {
          const hint = currentHint(cmd.id);
          return {
            id: cmd.id,
            label: cmd.title,
            ...(cmd.category !== undefined ? { description: cmd.category } : {}),
            ...(hint !== undefined ? { keyHint: hint } : {}),
          };
        });
      const pick = await minibuffer.quickPick(items, { prompt: ">", placeholder: "Run a command" });
      if (pick) await commands.executeCommand(pick.id, c);
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.abort",
    title: "Abort",
    description: "Cancel the pending key sequence, close the minibuffer, and clear messages (Emacs C-g).",
    run: () => {
      resolver.reset();
      hideWhichKey();
      echo.clear();
      if (minibuffer.isOpen()) minibuffer.cancel();
    },
  }),
);

store.add(commands.registerCommand({ id: "core.minibuffer.accept", title: "Minibuffer: Accept", run: () => minibuffer.accept() }));
store.add(commands.registerCommand({ id: "core.minibuffer.cancel", title: "Minibuffer: Cancel", run: () => minibuffer.cancel() }));
store.add(commands.registerCommand({ id: "core.minibuffer.next", title: "Minibuffer: Next", run: () => minibuffer.next() }));
store.add(commands.registerCommand({ id: "core.minibuffer.prev", title: "Minibuffer: Previous", run: () => minibuffer.prev() }));

store.add(
  commands.registerCommand({
    id: "core.help.describe-key",
    title: "Describe Key…",
    description: "Capture a key sequence and report the command it resolves to in this context.",
    run: async () => {
      const sequence = await minibuffer.readKeySequence({ prompt: "Describe key:", continueWhile: continueWhilePrefix });
      if (!sequence) return;
      const match = keys
        .getCandidates(sequence, contexts)
        .filter((b) => b.keys === sequence)
        .sort((a, b) => (b.when ? 1 : 0) - (a.when ? 1 : 0))[0];
      if (!match) {
        echo.message(`${sequence} is not bound`);
        return;
      }
      const command = commands.getCommand(match.command);
      const detail = command?.description ?? command?.title ?? "";
      echo.message(`${sequence} runs ${match.command}${detail ? ` - ${detail}` : ""}`);
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.help.describe-command",
    title: "Describe Command…",
    run: async () => {
      const items = commands.getCommands().map((cmd) => ({ id: cmd.id, label: cmd.title }));
      const pick = await minibuffer.quickPick(items, { prompt: "Describe command:" });
      if (!pick) return;
      const command = commands.getCommand(pick.id);
      const binds = keys.getBindingsForCommand(pick.id).map((b) => b.keys);
      const where = binds.length > 0 ? binds.join(", ") : "(unbound)";
      echo.message(`${pick.id} [${where}]${command?.description ? ` - ${command.description}` : ""}`);
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.keys.bind",
    title: "Set Key…",
    description: "Capture a key sequence, choose the command it runs, and write keybindings.toml.",
    run: async () => {
      const sequence = await minibuffer.readKeySequence({
        prompt: "Set key:",
        placeholder: "Type the key sequence to bind",
        continueWhile: continueWhilePrefix,
      });
      if (!sequence) return;
      const items = commands.getCommands().map((cmd) => ({
        id: cmd.id,
        label: cmd.title,
        ...(cmd.category !== undefined ? { description: cmd.category } : {}),
      }));
      const pick = await minibuffer.quickPick(items, { prompt: "Bind to:", placeholder: "Choose a command" });
      if (!pick) return;
      const res = await keybindings.bind({ keys: sequence, command: pick.id });
      echo.message(res.ok ? `Bound ${sequence} -> ${pick.id}` : `Bind failed: ${res.error}`);
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.keys.unbind",
    title: "Unset Key…",
    run: async () => {
      const sequence = await minibuffer.readKeySequence({ prompt: "Unset key:", continueWhile: continueWhilePrefix });
      if (!sequence) return;
      const res = await keybindings.unbind({ keys: sequence });
      echo.message(res.ok ? `Unbound ${sequence}` : `Unbind failed: ${res.error}`);
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.config.open",
    title: "Open Settings (settings.toml)",
    run: async () => {
      const result = await window.coal.config.openInEditor();
      if (result.canceled || "binary" in result) return;
      editor.facade.setText(result.doc.text);
      currentDocId = result.doc.id;
    },
  }),
);

store.add(
  commands.registerCommand({ id: "core.config.reload", title: "Reload Settings", run: async () => { await config.reload(); } }),
);

store.add(
  commands.registerCommand({
    id: "core.keybindings.open",
    title: "Open Keybindings (keybindings.toml)",
    run: async () => {
      const result = await window.coal.keybindings.openInEditor();
      if (result.canceled || "binary" in result) return;
      editor.facade.setText(result.doc.text);
      currentDocId = result.doc.id;
    },
  }),
);

store.add(
  commands.registerCommand({ id: "core.keybindings.reload", title: "Reload Keybindings", run: async () => { await keybindings.reload(); } }),
);

// --- the resolver-fed input path (design §4.3/§10) ------------------------
// A capture-phase listener intercepts app-level chords BEFORE CM6 and the
// minibuffer input; a fallthrough (ordinary typing) is left for them to handle.
window.addEventListener(
  "keydown",
  (event) => {
    if (minibuffer.isCapturingKeys()) return; // readKeySequence owns input while capturing
    if (event.defaultPrevented || event.isComposing) return;
    const chord = chordFromEvent(event);
    if (chord === null) return; // a lone modifier

    // core.abort resets a pending sequence from any state (design §4.3 step 4).
    const abort = keys.getBindingsForCommand("core.abort")[0];
    if (resolver.isPending && abort && chord === abort.keys) {
      event.preventDefault();
      event.stopImmediatePropagation();
      resolver.reset();
      dispatch("core.abort");
      return;
    }

    const result = resolver.press(chord);
    switch (result.kind) {
      case "dispatch":
        event.preventDefault();
        event.stopImmediatePropagation();
        hideWhichKey();
        dispatch(result.command);
        break;
      case "pending":
        event.preventDefault();
        event.stopImmediatePropagation();
        showWhichKey(result.sequence, result.continuations);
        break;
      case "unbound":
        event.preventDefault();
        event.stopImmediatePropagation();
        hideWhichKey();
        echo.message(`${result.sequence} is not bound`);
        break;
      case "fallthrough":
        hideWhichKey();
        break; // let CM6 / the minibuffer input handle ordinary typing
    }
  },
  true, // capture phase
);

// Native menu items dispatch command ids directly (design §6), ignored while the
// minibuffer owns input.
window.coal.onMenuCommand((id) => {
  if (minibuffer.isOpen()) return;
  dispatch(id);
});

// Files opened from the CLI / a second instance are pushed from main.
window.coal.onDocOpened((doc) => {
  editor.facade.setText(doc.text);
  currentDocId = doc.id;
});

// The quit dialog's "Save" asks us to save then quit.
window.coal.onSaveAndQuit(() => {
  void (async () => {
    try {
      if (currentDocId !== null && editor.facade.isDirty()) {
        const res = await window.coal.file.save({ id: currentDocId, text: editor.facade.getText() });
        if (!res.ok) return; // save failed - leave the window open
        editor.facade.markClean();
      }
      window.coal.app.quit();
    } catch (err) {
      console.error("save-and-quit failed:", err);
    }
  })();
});

// Boot: install the default keymap immediately, then layer user keybindings.
recompose();
void config.init().catch((err) => console.error("config init failed:", err));
void keybindings
  .init()
  .then(recompose)
  .catch((err) => console.error("keybindings init failed:", err));
editor.facade.focus();
```

- [ ] **Step 6: Correct the stale native-menu accelerators**

In `src/main/menu.ts`, the default keymap now binds Open/Save/Quit to multi-stroke sequences Electron accelerators cannot express, so their `accelerator` labels became inaccurate. Remove the `accelerator` + `registerAccelerator` lines from the Open File, Save, and Quit items (leaving `label` + `click`), and keep the "Run Command…" item's `CmdOrCtrl+Shift+P` (still a real default binding). Update the header comment:

```ts
/**
 * Native menu whose items send menu-command into the renderer's executeCommand.
 * The keymap (not the menu) is the source of truth for keys; multi-stroke default
 * bindings (e.g. Ctrl-x Ctrl-s) cannot be shown as native accelerators, so those
 * items carry no accelerator label (design §6).
 */
```

So, for example, the Open File item becomes:

```ts
        { label: "Open File…", click: send("core.file.open") },
```

(and likewise Save and Quit).

- [ ] **Step 7: Typecheck + build**

Run: `npm run typecheck`
Expected: no errors (the full composition compiles).
Run: `npm run build`
Expected: build succeeds; `out/main/index.js` and the renderer bundle refresh.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/keybindings.ts src/renderer/keybindings.test.ts src/renderer/main.ts src/main/menu.ts
git commit -m "Rewire the renderer to the resolver-fed input path + interactive keybinding commands"
```

---

## Phase D — end-to-end proof + doc reconciliation (Tasks 16-17)

### Task 16: The keybindings e2e smokes

Prove the whole chain in a real Electron window (design §14): a **multi-stroke** binding drives byte-exact save; which-key appears after a prefix; Describe-Key reports a command; and Set Key round-trips a new binding into `keybindings.toml` and the new key then works. Isolated via `--user-data-dir` per test.

**Files:**
- Create: `e2e/keybindings.spec.ts`

**Interfaces:**
- Consumes: the built app (`out/main/index.js`); the default keymap + commands (Task 15).

- [ ] **Step 1: Rebuild the app**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 2: Write the e2e smokes**

Create `e2e/keybindings.spec.ts`:

```ts
import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function launch(userData: string) {
  const args = ["out/main/index.js", `--user-data-dir=${userData}`];
  if (process.env["CI"]) args.push("--no-sandbox");
  const app = await electron.launch({ args });
  const window = await app.firstWindow();
  await window.locator(".cm-content").waitFor();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1; // never block on the unsaved dialog
  });
  return { app, window };
}

test("a multi-stroke binding (Ctrl-x Ctrl-s) opens and saves byte-exact", async () => {
  const userData = await mkdtemp(join(tmpdir(), "coal-kb-e2e-"));
  const dir = await mkdtemp(join(tmpdir(), "coal-kb-fix-"));
  const fixture = join(dir, "note.md");
  await writeFile(fixture, "hello\n", "utf-8");

  const { app, window } = await launch(userData);
  try {
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, fixture);

    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+X"); // prefix
    await window.keyboard.press("Control+F"); // Ctrl-x Ctrl-f -> Open File
    await expect(window.locator(".cm-content")).toContainText("hello");

    await window.keyboard.press("End");
    await window.keyboard.type(" world");
    await window.keyboard.press("Control+X"); // prefix
    await window.keyboard.press("Control+S"); // Ctrl-x Ctrl-s -> Save

    await expect.poll(async () => readFile(fixture, "utf-8")).toBe("hello world\n");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});

test("which-key lists continuations after a prefix; Ctrl-g aborts", async () => {
  const userData = await mkdtemp(join(tmpdir(), "coal-kb-e2e-"));
  const { app, window } = await launch(userData);
  try {
    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+X");
    await expect(window.locator(".coal-whichkey.open")).toBeVisible({ timeout: 3000 });
    await expect(window.locator(".coal-whichkey-row").first()).toBeVisible();
    await window.keyboard.press("Control+G"); // abort
    await expect(window.locator(".coal-whichkey.open")).toHaveCount(0);
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test("Describe Key reports the command a sequence resolves to", async () => {
  const userData = await mkdtemp(join(tmpdir(), "coal-kb-e2e-"));
  const { app, window } = await launch(userData);
  try {
    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+H"); // help prefix
    await window.keyboard.press("k"); // Ctrl-h k -> Describe Key (starts key capture)
    await window.keyboard.press("Control+X");
    await window.keyboard.press("Control+S"); // captured sequence Ctrl-x Ctrl-s
    await expect(window.locator(".coal-echo.open")).toContainText("core.file.save");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test("Set Key writes a new binding into keybindings.toml and the key then works", async () => {
  const userData = await mkdtemp(join(tmpdir(), "coal-kb-e2e-"));
  const dir = await mkdtemp(join(tmpdir(), "coal-kb-fix-"));
  const fixture = join(dir, "note.md");
  await writeFile(fixture, "hello\n", "utf-8");
  const keybindingsPath = join(userData, "keybindings.toml");

  const { app, window } = await launch(userData);
  try {
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, fixture);

    // Open the fixture first (Ctrl-x Ctrl-f).
    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+X");
    await window.keyboard.press("Control+F");
    await expect(window.locator(".cm-content")).toContainText("hello");

    // Set Key: capture Ctrl-b (not a default prefix, so it commits after one chord),
    // then bind it to Save.
    await window.keyboard.press("Control+Shift+P");
    await expect(window.locator(".coal-minibuffer.open")).toBeVisible();
    await window.locator(".coal-mb-input").fill("Set Key");
    await window.keyboard.press("Enter");
    await window.keyboard.press("Control+B"); // captured sequence
    await expect(window.locator(".coal-minibuffer.open")).toBeVisible();
    await window.locator(".coal-mb-input").fill("Save");
    await window.keyboard.press("Enter");

    await expect.poll(async () => readFile(keybindingsPath, "utf-8")).toContain('keys = "Ctrl-b"');

    // The new binding is live: edit, then save via Ctrl-b.
    await window.locator(".cm-content").click();
    await window.keyboard.press("End");
    await window.keyboard.type("!");
    await window.keyboard.press("Control+B");
    await expect.poll(async () => readFile(fixture, "utf-8")).toBe("hello!\n");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run the e2e**

Run: `npm run test:e2e`
Expected: PASS — the existing skeleton/minibuffer/config smokes plus these four. (Under CI, runs beneath `xvfb`.) If a which-key/describe timing flake appears, widen the `toBeVisible`/`expect.poll` timeouts; do not add sleeps.

- [ ] **Step 4: Typecheck, format, commit**

```bash
npm run typecheck
npm run format
git add e2e/keybindings.spec.ts
git commit -m "Add e2e smokes: multi-stroke save, which-key, describe-key, bind round-trip"
```

---

### Task 17: Reconcile the docs to the pivot

Rewrite the prose the pivot invalidates (design §12): `SPEC.md` §6/§6.1 and the scattered keymap-choice phrases, `PLUGINS.md`'s "both keymaps are kernel" line, the build-sequence roadmap's step 4, `docs/dev/kernel.md`, and `README.md`. Historical design specs under `docs/superpowers/specs/` are **dated records** and are left as-is - the 2026-07-24 design supersedes them by reference; only the living docs are reconciled.

**Files:**
- Modify: `SPEC.md`
- Modify: `PLUGINS.md`
- Modify: `docs/dev/kernel.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-22-kernel-walking-skeleton-design.md` (the build-sequence roadmap §1.1 - the one exception, since it is the canonical roadmap the build follows)

- [ ] **Step 1: Rewrite `SPEC.md` §6**

Replace the entire §6 body (current lines 144-175) with:

```md
## 6. Interaction model
- **Keyboard-first**, for the editor, the minibuffer, and constantly-used quick-access features.
- **One command-and-keybinding system, modeled on Emacs.** Every action in the app is a named
  **command**; every command is addressable **by name in the minibuffer**; and any command **may**
  carry one or more user-definable **keybindings** over a curated default keymap that ships out of the
  box. Keys bind to command **ids**, never to code, so rebinding never touches a handler.
  - **Delivery - the command substrate + keybinding system + minibuffer are the kernel.** The command
    registry, the multi-stroke key-sequence resolver, the `when`-context model, the curated default
    keymap, and the minibuffer are part of the **kernel**, not opt-in plugins - the input layer is
    fundamental to a keyboard-first editor. Bindings are **data**: a curated default table plus a
    plain-text `keybindings.toml` override (§9), dogfooded through the same public command / keybinding
    API a plugin uses. Binding keys is a **baseline** plugin ability requiring no capability (§8.2), so
    **community keymaps remain a natural, safe extension** as ordinary plugins.
  - **Discoverability is first-class.** The palette annotates each command with its current binding
    (Emacs `where-is`); a **which-key** panel lists the continuations of a pending prefix; and
    **Describe Key / Describe Command** report the command <-> key relation in a lightweight echo area.
  - **Single editing mode.** Coal is single-mode ("always insert"): CodeMirror owns the text buffer and
    all editing, and the command layer sits above it, claiming only app-level chords/sequences - any
    chord it does not bind falls through to the editor. There is no modal engine and no input-mode seam.
  - **The minibuffer has one personality:** run a command by name (`M-x`) and read input (a line, a
    quick-pick, or a raw key sequence). There is no `:` ex-line, `/` search line, or mode indicator.
- **Not keyboard-*only*.** Where an interaction is genuinely better with a mouse (the visual graph is
  the canonical example), that is a first-class mouse experience.
- **Both, where useful.** Features may expose both keyboard and mouse paths; the constraint is only
  that the core editing environment is fully operable from the keyboard.
```

- [ ] **Step 2: Replace `SPEC.md` §6.1**

Replace the entire §6.1 body (current lines 177-208, the "Keymaps as convention templates" section) with a short subsection that keeps the section number stable:

```md
### 6.1 Commands, keybindings, and contexts

The system is modeled on Emacs, not a clone (see the design doc for the deliberate divergences). The
load-bearing rules:

- **Every user-triggerable behavior is a registered command** with a non-empty title, routed through
  one `executeCommand` choke point - menus, buttons, the palette, and every keybinding are front-ends
  that dispatch a command id. **Keys bind to command ids, never to code.**
- **The curated default keymap is Emacs-flavored and fully overridable.** `keybindings.toml` (§9) is the
  source of truth for overrides: layer a binding over a default, scope it to a `when` context, or remove
  it with an unbind. Precedence is explicit - config over default, scoped over unscoped, with genuine
  clashes surfaced as config diagnostics.
- **Typing is CodeMirror's, not a command.** The command layer is a thin pre-dispatch above the editor
  engine; only app-level chords/sequences are claimed. Modal editing is out of scope for the kernel - if
  ever wanted, it is an ordinary future plugin on the same commands + keybindings + contexts, with no
  privileged hook.
```

- [ ] **Step 2b: Fix the scattered keymap-choice phrases in `SPEC.md`**

These now-false phrases (the pivot removed the keymap choice and the first-run prompt) must be corrected. For each, replace the quoted phrase with the given text:

- **§2 founding principle #4** (line ~59): the clause "with **first-class Emacs *and* Vim keymaps** (chosen at first run ...)" -> "with a single, Emacs-modeled **command + keybinding system** (a curated default keymap, every command rebindable via plain-text config)".
- **§8 intro** (line ~315): "both full keymaps** (§6)" -> "the command substrate + keybinding system** (§6)".
- **§8.3** (lines ~436, ~453): replace "keymap choice" in the user-preference examples with "keybindings" (the user-scoped keybindings.toml).
- **§9** (lines ~487-488): replace "keymap choice" in the user/global-scope example with "keybindings".
- **§14.2 roster** (lines ~1461, ~1467): replace "`M-x` / `M-:` / Vim `:` + `/`" with "`M-x` (run command by name)"; replace "both **Emacs & Vim keymaps** (kernel, §6)" with "the command + keybinding system (kernel, §6)".
- **§14.1 workspace shell** (lines ~1443-1444): the "`C-x 2` / `C-x 3`; Vim `:sp` / `:vsp`" window-split examples - drop the "Vim `:sp` / `:vsp`" half, keep the Emacs-style `C-x 2` / `C-x 3` (these are illustrative future bindings, consistent with the single system).

- [ ] **Step 2c: Append a `SPEC.md` §15 decision-log entry**

Do **not** edit the historical rows. Append a new row to the §15 decision log recording the supersession (use the repo's existing row format), for example:

```md
- **2026-07-24 - Command + keybinding system (supersedes the dual-keymap decisions above).** Dropped the
  two first-class keymaps (Emacs + Vim), the parity invariant, modal editing, the two-personality
  minibuffer, and the first-run keymap prompt. Adopted Emacs's command architecture directly: one
  curated default keymap, every command minibuffer-addressable, any command user-bindable via
  `keybindings.toml`. See docs/superpowers/specs/2026-07-24-command-keybinding-system-design.md.
```

- [ ] **Step 3: Reconcile `PLUGINS.md`**

Replace the "Kernel, not plugins" passage (current lines 22-25):

```md
**Kernel, not plugins.** Some things the prior draft treated as candidate plugins are now part of the
**kernel** and are therefore **not** listed here: the **command substrate + keybinding system +
minibuffer** (§6), the **syntax-highlighting engine** (§8), and the **workspace shell** (file-tree,
quick switcher, windows-as-split, tabs; §14.1).
```

Replace the "Community keymaps" note (current lines 86-90):

```md
- **Community keymaps** are a natural, safe extension: with the command + keybinding system in the
  kernel, a third-party keymap is an **ordinary plugin** - binding keys is a **baseline** ability
  requiring no capability (§8.2), touching no files, keys, or network. It is now the only
  keymap-authoring story (there is no first-party dual-keymap suite to match).
```

- [ ] **Step 4: Update `docs/dev/kernel.md`**

(a) In the `src/kernel/` table, replace the config row (line 43) and add the command-layer rows:

```md
| `command/keys.ts` · `command/context.ts` · `command/when.ts` | Canonical chord/sequence helpers; the `ContextRegistry` (boolean `when` contexts); the `when` expression parser + evaluator. Pure. |
| `command/keybindingRegistry.ts` · `command/composeKeymap.ts` · `command/keySequenceResolver.ts` · `command/defaultKeymap.ts` | The effective-keymap store (reverse lookup + candidate query), the default+user compose (precedence, unbind, conflict diagnostics), the pure prefix-key resolver, and the curated default keymap (data). |
| `config/schema.ts` · `config/validate.ts` · `config/types.ts` · `config/defaultTemplate.ts` | The global-scope kernel settings: schema + non-destructive `validate(raw)` -> `{ settings, diagnostics }` + the default `settings.toml` template. Pure. (The `keymap` slot was removed with the keybinding pivot.) |
| `config/keybindings/*` | The keybindings.toml layer: `KeybindingEntry` (bind/unbind), structural `validateKeybindings`, and the default template. Pure. |
```

(b) In the `src/main/` table, add:

```md
| `keybindingsService.ts` · `keybindingsToml.ts` | Owns the global `keybindings.toml` (materialize, load, reload, atomic write, change broadcast); the append-only `[[keybinding]]` writer the bind/unbind flows use. |
```

(c) In the `src/renderer/` table, add and update:

```md
| `keyInput.ts` | `chordFromEvent` - KeyboardEvent -> canonical chord (`.code` for letters/digits, `.key` for named keys; Shift explicit). |
| `keybindings.ts` | `KeybindingsClient` - the reactive keybindings.toml replica: `init` loads + subscribes, `onChange` notifies, `bind`/`unbind`/`reload` proxy to main. |
| `whichKey.ts` · `echoArea.ts` | The which-key continuation panel and the transient echo area (Describe-Key/Command + "not bound" messages). |
| `main.ts` | The composition root: registers the core commands, composes the default + user keymap, and runs the resolver-fed capture-phase input path (which-key + echo + contexts); menu + `onDocOpened` + `onSaveAndQuit`. |
```

(d) Rewrite the "Command dispatch" key-flow (lines 79-81):

```md
- **Command dispatch.** One choke point: a capture-phase input path turns each app-level chord into a
  canonical sequence, feeds the `KeySequenceResolver` (which walks prefixes against the composed
  default+user keymap filtered by `when` contexts), and dispatches the resolved command id through
  `executeCommand`; the native menu dispatches ids directly. Ordinary typing falls through to CM6.
```

(e) Add a keybindings key-flow after the config flow:

```md
- **Keybindings.** On boot `KeybindingsClient.init()` loads `keybindings.toml` (materialized when
  absent) and the renderer composes it over the curated default keymap into the registry; edits (hand
  or via `core.keys.bind`/`unbind`, which append a `[[keybinding]]` block) broadcast `keybindings:changed`
  and recompose live. Conflicts and unresolvable command ids surface in the echo area.
```

(f) In "Not yet built" (lines 115-118), remove "both Emacs/Vim keymaps + the first-run prompt," (that slice is now built as the command + keybinding system). Rewrite the clause to begin: "the **per-vault** config tree + Settings UI, the plugin loader / capability broker / host API, ...".

- [ ] **Step 5: Update `README.md`**

In the pitch (lines 4-6), replace "your choice of **Emacs or Vim** keymaps" with "an Emacs-modeled **command + keybinding system** (a curated default keymap, every command rebindable)". Leave the "like Emacs, Vim, or VSCode" comparison clause (it refers to opening any file format, not to keymaps).

- [ ] **Step 6: Update the build-sequence roadmap**

In `docs/superpowers/specs/2026-07-22-kernel-walking-skeleton-design.md` §1.1 (line 54), replace step 4:

```md
4. **Command + keybinding system** - a multi-stroke key-sequence resolver, `when`-context precedence, a
   curated default keymap, a plain-text `keybindings.toml` override + interactive bind flow, and the
   discoverability layer (palette key-hints, which-key, Describe-Key/Command). Modeled on Emacs; no dual
   keymaps, no modal editing. (Supersedes the former "both keymaps + first-run prompt" step 4.)
```

- [ ] **Step 7: Format check + commit**

Run: `npm run format`
Expected: passes.
Run: `npm run typecheck && npx vitest run --project=node && npm run test:browser`
Expected: all green (docs-only changes should not affect them, but confirm nothing regressed).

```bash
git add SPEC.md PLUGINS.md docs/dev/kernel.md README.md \
  docs/superpowers/specs/2026-07-22-kernel-walking-skeleton-design.md
git commit -m "Reconcile SPEC, PLUGINS, kernel guide, README, and the roadmap to the keybinding pivot"
```

---

## Self-Review

**Spec coverage** (design §-> task):
- §1 scope: resolver -> T7; context model -> T3; explicit precedence -> T5; default keymap -> T8; override surface (`keybindings.toml` + unbind) -> T4/T9; interactive bind flow -> T10/T15; `readKeySequence` -> T12; discoverability (palette hints, which-key, describe-key/command, echo area) -> T12/T13/T14/T15; removals (`keymap` enum, no first-run prompt in code) -> T1; tests across three tiers + e2e -> every task + T16.
- §2 four layers/two laws: Law 1 (every behavior a titled command) enforced in T8; Law 2 (keys->ids) is the registry/compose model (T5/T6). §3 `Command.description` -> T2; title invariant -> T8. §4.1 canonical keys -> T2/T11. §4.2 prefix invariant -> T5 (compose) + T7 (resolver). §4.3 resolver branches -> T7. §5 contexts/precedence/collision-diagnostic -> T3/T5. §6 default keymap -> T8. §7 `keybindings.toml` + bind flow -> T4/T9/T10/T15. §8 discoverability -> T12/T13/T14/T15. §9 divergences (typing is CM6's; single mode; no modal) -> T15 (fallthrough) + T17 (docs). §10 module layout -> the File Structure + all tasks. §11 config changes (remove keymap; add keybindings.toml; unknown-key + unresolvable-command diagnostics via `findUnresolvedBindings`) -> T1/T4/T5/T9/T10/T15. §12 doc reconciliation -> T17. §13 security (main-only IO, senderFrame + payload guards, atomic write) -> T9/T10. §14 testing (node/browser/e2e + the replacing invariant test) -> all tasks + T8 + T16. **CM6 fall-through is covered across tiers, not solely at e2e:** the resolver's `fallthrough` branch is node-tested (T7), the `KeyboardEvent -> chord` conversion is browser-tested (T11), and "ordinary typing reaches the editor" is e2e-proven (T16, typing " world" after open); the composition-root wiring that leaves a fall-through undefaulted is the only e2e-only seam.
- **Deferred, correctly absent** (design §1 out-of-scope): prefix/numeric args, keyboard macros, List-All-Bindings, per-vault bindings, the plugin registration API, modal editing.

**Known, deliberate deferrals (flag for the reviewer):**
- `renderer/editor.ts` keeps its `setBindings`/app-keymap CM6 compartment, now **unfed** (the resolver path supersedes it). Its `editor.browser.test.ts` still passes, so removing it is a trivial follow-up kept out of this slice to avoid touching that test.
- The bottom-docked surfaces (minibuffer, which-key, echo area) all `position: fixed; bottom: 0` with ascending `z-index`; full stacking/layout polish is a visual-design follow-up (the echo area is deliberately "minimized" per design §8).
- `keybindings.toml` writes are **append-only** (no user-entry rewrite/removal in place); compose applies entries last-wins so an appended unbind cancels an earlier bind. "Drop the existing user entry" (design §7) is achievable later without changing the file's meaning.

**Placeholder scan:** none - every code step carries complete code or an exact, located edit; every test step has real assertions; every run step has an expected result.

**Type consistency (checked across tasks):**
- `Keybinding` (`keys`,`command`,`when?`) is used identically in T2/T5/T6/T7/T8/T15.
- `KeybindingEntry` (bind|unbind) defined T4, consumed by `composeKeymap` (T5), `KeybindingsService` write path (via `RawBindingEntry`, T9), and `KeybindingsClient.entries` (T15).
- `ConfigDiagnostic.kind` union widened once (T1) and every emitter uses a member of it (`binding-conflict` in T5's `composeKeymap`; `unresolvable-command` via `findUnresolvedBindings` - defined + node-tested in T5, called in T15's `recompose`; `parse-error`/`invalid-type`/`unknown-key` in T4/T9). No union member is dead.
- `ContextRegistry`/`Context` (T3) is the `Context` the registry `getCandidates` (T6), the resolver (T7), and `matchesWhen` (T3/T15) all take.
- `KeymapView.getCandidates(pending, context)` (T7) matches `KeybindingRegistry.getCandidates` (T6) exactly.
- `CoalApi.keybindings.{load,reload,bind,unbind,openInEditor}` + `onKeybindingsChanged` are identical across the contract (T10), preload (T10), handlers (T10), and `KeybindingsClient` (T15).
- Command ids referenced by `DEFAULT_KEYMAP` (T8) are all registered in `main.ts` (T15) and enumerated by the T8 `KNOWN` set - `core.command.execute`, `core.file.open/save`, `core.app.quit`, `core.abort`, `core.help.describe-key/command`, `core.minibuffer.accept/cancel/next/prev`.
- `QuickPickItem.keyHint` (T12) is set by the palette (T15) and rendered by the minibuffer (T12).

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-24-command-keybinding-system.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration. Consider stopping for review at the Phase A/B boundary (Task 8) if you want to land the pure kernel core as its own PR before the integration half (see "Suggested delivery").

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**
