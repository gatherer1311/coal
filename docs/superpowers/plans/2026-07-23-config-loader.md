# Config Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the kernel's global (user) config layer — a plain-TOML `settings.toml` the kernel reads, writes with comments preserved, and reacts to — persisting the `keymap` choice for step 4's first-run prompt.

**Architecture:** A pure `kernel/config` (schema, validation, default template) plus a thin `main/configService` that owns the file (materialize, atomic write, reload, change broadcast) over a pure `main/tomlConfigCodec` wrapping `@decimalturn/toml-patch`. The renderer holds a reactive `ConfigClient` replica fed over typed IPC — the same all-IO-in-main boundary the skeleton established (`io/codec` + `fileService`).

**Tech Stack:** TypeScript (strict), Electron 43 main process, `@decimalturn/toml-patch` (comment-preserving TOML), `write-file-atomic`, Vitest (node + browser), Playwright `_electron`.

**Design:** [`docs/superpowers/specs/2026-07-23-config-loader-design.md`](../specs/2026-07-23-config-loader-design.md).

## Global Constraints

- **Kernel purity:** `src/kernel/**` imports only standard JS — **no DOM, Electron, Node, or third-party imports**. The TOML library lives **only** in `src/main/`.
- **Strict TS:** `verbatimModuleSyntax` (use `import type` for type-only imports); `noUncheckedIndexedAccess` (indexed access is `T | undefined`); `exactOptionalPropertyTypes` (assign an optional property **only** when a value exists — never `{ keymap: undefined }`).
- **All filesystem IO in main.** The renderer never imports `fs`, never holds the config path, and reaches main only through the typed `window.coal` bridge. Every IPC handler validates `event.senderFrame` (via `deps.isTrustedSender`) **and** the payload before acting.
- **Config location:** `app.getPath('userData')/settings.toml` — on Linux this is `$XDG_CONFIG_HOME/coal` (`~/.config/coal`). Dev already isolates to `coal-dev`; the e2e isolates via `--user-data-dir=<temp>`.
- **Runtime:** Node >= 22; ESM (`"type": "module"`).
- **Test tiers:** node `npm test`; browser `npm run test:browser`; e2e `npm run build` then `npm run test:e2e`; `npm run typecheck` and `npm run format` mirror CI. Green before push.
- **Delivery:** one implementation branch → **one PR** (per-task commits + reviews between tasks). PR title becomes `main`'s history entry.
- **No emojis** in any file (repo rule). Plain text only.

---

### Task 1: `kernel/config` — schema, types, validation

Pure, framework-free settings schema + non-destructive validation. The dogfooded core, node-tested.

**Files:**
- Create: `src/kernel/config/types.ts`
- Create: `src/kernel/config/schema.ts`
- Create: `src/kernel/config/validate.ts`
- Test: `src/kernel/config/validate.test.ts`

**Interfaces:**
- Produces:
  - `type KeymapChoice = "emacs" | "vim"`
  - `interface KernelSettings { readonly keymap?: KeymapChoice }`
  - `interface ConfigDiagnostic { readonly key: string; readonly kind: "unknown-key" | "invalid-type" | "invalid-value" | "parse-error"; readonly message: string }`
  - `interface ConfigSnapshot { readonly settings: KernelSettings; readonly diagnostics: readonly ConfigDiagnostic[] }`
  - `const KEYMAP_VALUES = ["emacs", "vim"] as const`
  - `const KERNEL_SETTING_KEYS = ["keymap"] as const`
  - `function validate(raw: Record<string, unknown>): ConfigSnapshot`

- [ ] **Step 1: Write the failing test**

Create `src/kernel/config/validate.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { validate } from "./validate";

describe("validate (design §5 non-destructive kernel-settings validation)", () => {
  test("a valid keymap is coerced into typed settings, no diagnostics", () => {
    expect(validate({ keymap: "vim" })).toEqual({ settings: { keymap: "vim" }, diagnostics: [] });
  });

  test("an empty object yields empty settings, no diagnostics (keymap is unset)", () => {
    expect(validate({})).toEqual({ settings: {}, diagnostics: [] });
  });

  test("a wrong-type keymap is dropped with an invalid-type diagnostic", () => {
    const { settings, diagnostics } = validate({ keymap: 3 });
    expect(settings).toEqual({});
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ key: "keymap", kind: "invalid-type" });
  });

  test("an out-of-range keymap value is dropped with an invalid-value diagnostic", () => {
    const { settings, diagnostics } = validate({ keymap: "kakoune" });
    expect(settings).toEqual({});
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ key: "keymap", kind: "invalid-value" });
  });

  test("unknown keys are reported but not surfaced in settings (left for the file to keep)", () => {
    const { settings, diagnostics } = validate({ foo: 1, keymap: "emacs" });
    expect(settings).toEqual({ keymap: "emacs" });
    expect(diagnostics).toEqual([
      { key: "foo", kind: "unknown-key", message: 'unknown setting "foo" (left untouched)' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project=node src/kernel/config/validate.test.ts`
Expected: FAIL — cannot resolve `./validate`.

- [ ] **Step 3: Write the types**

Create `src/kernel/config/types.ts`:

```ts
// src/kernel/config/types.ts

/** Which keybinding template drives the editor (SPEC §6). No baked-in default. */
export type KeymapChoice = "emacs" | "vim";

/** The kernel's own (global-scope) settings. Each key is optional until set. */
export interface KernelSettings {
  readonly keymap?: KeymapChoice;
}

/** A non-fatal problem found while validating raw config (design §5). */
export interface ConfigDiagnostic {
  readonly key: string; // dotted path, "" for whole-document problems
  readonly kind: "unknown-key" | "invalid-type" | "invalid-value" | "parse-error";
  readonly message: string;
}

/** Validated settings + the diagnostics gathered producing them. */
export interface ConfigSnapshot {
  readonly settings: KernelSettings;
  readonly diagnostics: readonly ConfigDiagnostic[];
}
```

- [ ] **Step 4: Write the schema**

Create `src/kernel/config/schema.ts`:

```ts
// src/kernel/config/schema.ts

/** Allowed values for the `keymap` setting (SPEC §6). */
export const KEYMAP_VALUES = ["emacs", "vim"] as const;

/** The keys the kernel recognizes in settings.toml. Extended in later slices. */
export const KERNEL_SETTING_KEYS = ["keymap"] as const;
```

- [ ] **Step 5: Write the validator**

Create `src/kernel/config/validate.ts`:

```ts
// src/kernel/config/validate.ts
import type { ConfigDiagnostic, ConfigSnapshot, KeymapChoice } from "./types";
import { KERNEL_SETTING_KEYS, KEYMAP_VALUES } from "./schema";

/**
 * Turn a raw parsed object into typed settings + diagnostics. Non-destructive:
 * unknown keys are reported but never removed (the caller keeps them in the
 * file); an invalid value is dropped from settings with a diagnostic, not
 * coerced (design §5).
 */
export function validate(raw: Record<string, unknown>): ConfigSnapshot {
  const diagnostics: ConfigDiagnostic[] = [];
  const settings: { keymap?: KeymapChoice } = {};

  for (const key of Object.keys(raw)) {
    if (!(KERNEL_SETTING_KEYS as readonly string[]).includes(key)) {
      diagnostics.push({
        key,
        kind: "unknown-key",
        message: `unknown setting "${key}" (left untouched)`,
      });
    }
  }

  if ("keymap" in raw) {
    const value = raw["keymap"];
    if (typeof value !== "string") {
      diagnostics.push({
        key: "keymap",
        kind: "invalid-type",
        message: `keymap must be a string, got ${typeof value}`,
      });
    } else if (!(KEYMAP_VALUES as readonly string[]).includes(value)) {
      diagnostics.push({
        key: "keymap",
        kind: "invalid-value",
        message: `keymap must be one of ${KEYMAP_VALUES.join(", ")}, got "${value}"`,
      });
    } else {
      settings.keymap = value as KeymapChoice;
    }
  }

  return { settings, diagnostics };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run --project=node src/kernel/config/validate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add src/kernel/config/
git commit -m "Add kernel/config schema, types, and non-destructive validation"
```

---

### Task 2: `main/tomlConfigCodec` — the comment-preserving TOML round-trip

The only place TOML *text* is handled. Pure and fs-free, so it is unit-tested directly. Adds the `@decimalturn/toml-patch` dependency.

**Files:**
- Modify: `package.json` (add the dependency)
- Create: `src/main/tomlConfigCodec.ts`
- Test: `src/main/tomlConfigCodec.test.ts`

**Interfaces:**
- Consumes: `@decimalturn/toml-patch` — `parse(text: string): any`, `patch(existing: string, updated: any): string`.
- Produces:
  - `function parse(text: string): Record<string, unknown>` — throws on malformed TOML.
  - `function applyEdit(existing: string, updated: Record<string, unknown>): string` — comment/format-preserving.

- [ ] **Step 1: Install the dependency**

Run: `npm install @decimalturn/toml-patch@^2.1.0`
Expected: it lands under `"dependencies"` in `package.json` (like `write-file-atomic`), so electron-vite resolves it in the main build.

- [ ] **Step 2: Write the failing test**

Create `src/main/tomlConfigCodec.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { applyEdit, parse } from "./tomlConfigCodec";

describe("tomlConfigCodec (design §7 comment-preserving round-trip)", () => {
  test("parse turns TOML text into a plain object", () => {
    expect(parse('# a comment\nkeymap = "emacs"\n')).toEqual({ keymap: "emacs" });
  });

  test("applyEdit changes only the target value, preserving comments and foreign keys", () => {
    const original = '# Coal settings\nkeymap = "emacs"\nfoo = 1\n';
    const raw = parse(original);
    const edited = applyEdit(original, { ...raw, keymap: "vim" });
    expect(parse(edited)).toEqual({ keymap: "vim", foo: 1 });
    expect(edited).toContain("# Coal settings");
    expect(edited).toContain("foo = 1");
    expect(edited).toContain('keymap = "vim"');
  });

  test("parse throws on malformed TOML", () => {
    expect(() => parse("not = = valid ][")).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run --project=node src/main/tomlConfigCodec.test.ts`
Expected: FAIL — cannot resolve `./tomlConfigCodec`.

- [ ] **Step 4: Write the codec**

Create `src/main/tomlConfigCodec.ts`:

```ts
// src/main/tomlConfigCodec.ts
import { parse as tomlParse, patch as tomlPatch } from "@decimalturn/toml-patch";

/** Parse TOML text to a plain object. Throws on malformed input (design §9). */
export function parse(text: string): Record<string, unknown> {
  return tomlParse(text) as Record<string, unknown>;
}

/**
 * Re-emit `existing` with `updated`'s values, preserving comments, whitespace,
 * and any keys not present in `updated`. Callers pass the FULL parsed object
 * with their change overlaid, so foreign keys survive (design §6/§7).
 */
export function applyEdit(existing: string, updated: Record<string, unknown>): string {
  return tomlPatch(existing, updated);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run --project=node src/main/tomlConfigCodec.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add package.json package-lock.json src/main/tomlConfigCodec.ts src/main/tomlConfigCodec.test.ts
git commit -m "Add main/tomlConfigCodec over @decimalturn/toml-patch (preserving round-trip)"
```

---

### Task 3: `main/configService` + the default template

The service that owns `settings.toml`: materialize on first run, comment-preserving `set`, `reload`, atomic write, and a change broadcast. Node-tested against a temp dir like `fileService`.

**Files:**
- Create: `src/kernel/config/defaultTemplate.ts`
- Create: `src/main/configService.ts`
- Test: `src/main/configService.test.ts`

**Interfaces:**
- Consumes: `parse`, `applyEdit` (Task 2); `validate` (Task 1); `KernelSettings`, `ConfigSnapshot` (Task 1); `write-file-atomic`.
- Produces:
  - `const DEFAULT_SETTINGS_TOML: string`
  - `class ConfigService`:
    - `constructor(dir: string)`
    - `readonly path: string` — `<dir>/settings.toml`
    - `load(): Promise<ConfigSnapshot>` — read or materialize, parse+validate, cache; idempotent; does **not** emit.
    - `set(patch: Partial<KernelSettings>): Promise<{ ok: true } | { ok: false; error: string }>` — merge, preserving write, revalidate, emit.
    - `reload(): Promise<ConfigSnapshot>` — re-read, revalidate, emit.
    - `onDidChangeConfig(cb: (s: ConfigSnapshot) => void): () => void`

- [ ] **Step 1: Write the failing test**

Create `src/main/configService.test.ts`:

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
  test("load materializes settings.toml when absent; keymap is unset, no diagnostics", async () => {
    const svc = new ConfigService(dir);
    const snap = await svc.load();
    expect(existsSync(svc.path)).toBe(true);
    expect(snap).toEqual({ settings: {}, diagnostics: [] });
  });

  test("set writes the keymap, preserving the template's comments", async () => {
    const svc = new ConfigService(dir);
    await svc.load();
    expect(await svc.set({ keymap: "vim" })).toEqual({ ok: true });
    const onDisk = await readFile(svc.path, "utf-8");
    expect(onDisk).toContain('keymap = "vim"');
    expect(onDisk).toContain("# Coal"); // a comment from the default template survives
  });

  test("set changes an existing value while preserving a hand comment and foreign keys", async () => {
    const svc = new ConfigService(dir);
    await writeFile(svc.path, '# mine\nkeymap = "emacs"\nfoo = 1\n', "utf-8");
    await svc.load();
    await svc.set({ keymap: "vim" });
    const onDisk = await readFile(svc.path, "utf-8");
    expect(onDisk).toContain("# mine");
    expect(onDisk).toContain("foo = 1");
    expect(onDisk).toContain('keymap = "vim"');
  });

  test("reload reflects an external edit and emits", async () => {
    const svc = new ConfigService(dir);
    await svc.load();
    let emitted = 0;
    svc.onDidChangeConfig(() => {
      emitted += 1;
    });
    await writeFile(svc.path, 'keymap = "vim"\n', "utf-8");
    const snap = await svc.reload();
    expect(snap.settings.keymap).toBe("vim");
    expect(emitted).toBe(1);
  });

  test("a malformed file loads to defaults + a parse-error diagnostic, file untouched", async () => {
    const svc = new ConfigService(dir);
    const bad = "not = = valid ][\n";
    await writeFile(svc.path, bad, "utf-8");
    const snap = await svc.load();
    expect(snap.settings).toEqual({});
    expect(snap.diagnostics[0]).toMatchObject({ kind: "parse-error" });
    expect(await readFile(svc.path, "utf-8")).toBe(bad); // never clobbered
  });

  test("set emits on success; load does not emit", async () => {
    const svc = new ConfigService(dir);
    let emitted = 0;
    svc.onDidChangeConfig(() => {
      emitted += 1;
    });
    await svc.load();
    expect(emitted).toBe(0);
    await svc.set({ keymap: "emacs" });
    expect(emitted).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project=node src/main/configService.test.ts`
Expected: FAIL — cannot resolve `./configService`.

- [ ] **Step 3: Write the default template**

Create `src/kernel/config/defaultTemplate.ts`:

```ts
// src/kernel/config/defaultTemplate.ts

/**
 * The curated settings.toml written when none exists (design §5). It documents
 * the file and leaves `keymap` commented out (unset), so a fresh load reports
 * empty settings with no diagnostics.
 */
export const DEFAULT_SETTINGS_TOML = `# Coal - user settings (global scope)
#
# Your personal, machine-level Coal preferences. This file travels with you
# (your dotfiles), not with any vault. Edit it by hand or from Settings; Coal
# preserves your comments and formatting when it writes here.

# keymap: which keybinding template drives the editor - "emacs" or "vim".
# Chosen on first run; uncomment to set it explicitly.
# keymap = "vim"
`;
```

- [ ] **Step 4: Write the service**

Create `src/main/configService.ts`:

```ts
// src/main/configService.ts
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import writeFileAtomic from "write-file-atomic";
import { DEFAULT_SETTINGS_TOML } from "../kernel/config/defaultTemplate";
import type { ConfigSnapshot, KernelSettings } from "../kernel/config/types";
import { validate } from "../kernel/config/validate";
import { applyEdit, parse } from "./tomlConfigCodec";

const EMPTY: ConfigSnapshot = { settings: {}, diagnostics: [] };

/**
 * Owns the global settings.toml. The file text is the source of truth; the
 * typed snapshot is derived from it (design §6). All IO is here, in main.
 */
export class ConfigService {
  readonly path: string;
  #text: string | null = null;
  #snapshot: ConfigSnapshot = EMPTY;
  #loaded = false;
  #listeners = new Set<(s: ConfigSnapshot) => void>();

  constructor(dir: string) {
    this.path = join(dir, "settings.toml");
  }

  /** Read (or materialize) the file and derive the snapshot. Idempotent; no emit. */
  async load(): Promise<ConfigSnapshot> {
    if (this.#loaded) return this.#snapshot;
    await this.#read();
    this.#loaded = true;
    return this.#snapshot;
  }

  /** Re-read from disk (external edits) and emit. */
  async reload(): Promise<ConfigSnapshot> {
    await this.#read();
    this.#loaded = true;
    this.#emit();
    return this.#snapshot;
  }

  /** Merge a change into the file, preserving comments and foreign keys; emit. */
  async set(patch: Partial<KernelSettings>): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      if (!this.#loaded) await this.load();
      const current = this.#text ?? DEFAULT_SETTINGS_TOML;
      const merged = { ...parse(current), ...patch };
      const nextText = applyEdit(current, merged);
      await this.#write(nextText);
      this.#text = nextText;
      this.#snapshot = this.#derive(nextText);
      this.#emit();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  onDidChangeConfig(cb: (s: ConfigSnapshot) => void): () => void {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  }

  async #read(): Promise<void> {
    if (existsSync(this.path)) {
      this.#text = await readFile(this.path, "utf-8");
    } else {
      this.#text = DEFAULT_SETTINGS_TOML;
      await this.#write(DEFAULT_SETTINGS_TOML);
    }
    this.#snapshot = this.#derive(this.#text);
  }

  /** Parse + validate; a parse failure keeps defaults + a diagnostic (never clobbers). */
  #derive(text: string): ConfigSnapshot {
    try {
      return validate(parse(text));
    } catch (err) {
      return {
        settings: {},
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
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run --project=node src/main/configService.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/kernel/config/defaultTemplate.ts src/main/configService.ts src/main/configService.test.ts
git commit -m "Add main/configService + the default settings template (materialize, preserving set, reload)"
```

---

### Task 4: IPC contract + the config-set guard

The typed IPC surface (channels, request/response types, `CoalApi.config`) and a payload guard. Pure surface — behavior is wired in Task 5.

**Files:**
- Modify: `src/kernel/ipc/contract.ts`
- Modify: `src/main/guards.ts`
- Test: `src/main/guards.test.ts` (extend)

**Interfaces:**
- Consumes: `ConfigSnapshot`, `KernelSettings` (Task 1).
- Produces:
  - `IPC.configLoad/configSet/configReload/configChanged/configOpen`
  - `interface ConfigSetRequest { readonly patch: Partial<KernelSettings> }`
  - `type ConfigSetResult = { ok: true } | { ok: false; error: string }`
  - `CoalApi.config.{ load, set, reload, openInEditor }` + `CoalApi.onConfigChanged`
  - `function isConfigSetRequest(value: unknown): value is ConfigSetRequest`

- [ ] **Step 1: Write the failing guard test**

Add to `src/main/guards.test.ts` (create the file if it does not exist; otherwise append these tests inside it). If creating it fresh:

```ts
import { describe, expect, test } from "vitest";
import { isConfigSetRequest } from "./guards";

describe("isConfigSetRequest", () => {
  test("accepts a valid keymap patch", () => {
    expect(isConfigSetRequest({ patch: { keymap: "vim" } })).toBe(true);
  });

  test("accepts an empty patch", () => {
    expect(isConfigSetRequest({ patch: {} })).toBe(true);
  });

  test("rejects a non-object, a missing patch, and an out-of-range keymap", () => {
    expect(isConfigSetRequest(null)).toBe(false);
    expect(isConfigSetRequest({})).toBe(false);
    expect(isConfigSetRequest({ patch: { keymap: "kakoune" } })).toBe(false);
    expect(isConfigSetRequest({ patch: { keymap: 3 } })).toBe(false);
  });
});
```

If `src/main/guards.test.ts` already exists, add only the `describe("isConfigSetRequest", ...)` block and the `isConfigSetRequest` import.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project=node src/main/guards.test.ts`
Expected: FAIL — `isConfigSetRequest` is not exported.

- [ ] **Step 3: Extend the IPC contract**

In `src/kernel/ipc/contract.ts`, add the config-type import at the top (after the existing `DocMeta` import):

```ts
import type { ConfigSnapshot, KernelSettings } from "../config/types";
```

Add these entries to the `IPC` object (before the closing `} as const;`):

```ts
  configLoad: "coal:config.load",
  configSet: "coal:config.set",
  configReload: "coal:config.reload",
  configChanged: "coal:config.changed",
  configOpen: "coal:config.open",
```

Add these types after the existing `SaveResult` type:

```ts
export interface ConfigSetRequest {
  readonly patch: Partial<KernelSettings>;
}

export type ConfigSetResult = { ok: true } | { ok: false; error: string };
```

Inside the `CoalApi` interface, add a `config` member (alongside `file`, `doc`, `app`) and an `onConfigChanged` method (alongside `onMenuCommand`):

```ts
  config: {
    load(): Promise<ConfigSnapshot>;
    set(req: ConfigSetRequest): Promise<ConfigSetResult>;
    reload(): Promise<ConfigSnapshot>;
    /** Main opens settings.toml via fileService; the renderer never sees the path. */
    openInEditor(): Promise<OpenResult>;
  };
```

```ts
  /** The kernel config changed (set / reload); main pushes the new snapshot. */
  onConfigChanged(handler: (snapshot: ConfigSnapshot) => void): () => void;
```

- [ ] **Step 4: Add the guard**

In `src/main/guards.ts`, add the import at the top:

```ts
import { KEYMAP_VALUES } from "../kernel/config/schema";
import type { ConfigSetRequest } from "../kernel/ipc/contract";
```

(Keep the existing `import type { SaveRequest }` line.) Add the guard function:

```ts
export function isConfigSetRequest(value: unknown): value is ConfigSetRequest {
  if (typeof value !== "object" || value === null) return false;
  const patch = (value as { patch?: unknown }).patch;
  if (typeof patch !== "object" || patch === null) return false;
  const keymap = (patch as { keymap?: unknown }).keymap;
  if (keymap !== undefined && !(KEYMAP_VALUES as readonly string[]).includes(keymap as string)) {
    return false;
  }
  return true;
}
```

- [ ] **Step 5: Run tests + typecheck to verify green**

Run: `npx vitest run --project=node src/main/guards.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors (the contract compiles).

- [ ] **Step 6: Commit**

```bash
git add src/kernel/ipc/contract.ts src/main/guards.ts src/main/guards.test.ts
git commit -m "Add config IPC contract surface and the config-set payload guard"
```

---

### Task 5: Wire config through main and the preload bridge

The plumbing: the preload exposes `coal.config`, main registers the handlers, and `index.ts` instantiates the service, eager-loads, and broadcasts changes. No new logic — gated by typecheck + a successful build; behavior is proven by the e2e in Task 7.

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `ConfigService` (Task 3); `isConfigSetRequest`, the `IPC.*` config channels, `CoalApi` (Task 4).
- Produces: `IpcDeps` gains `configService: ConfigService`; `window.coal.config` + `window.coal.onConfigChanged` are live.

- [ ] **Step 1: Extend the preload bridge**

In `src/preload/index.ts`, add to the imported types:

```ts
import type {
  CoalApi,
  ConfigSetRequest,
  ConfigSetResult,
  ConfigSnapshot,
  OpenDocResult,
  OpenResult,
  SaveRequest,
  SaveResult,
} from "../kernel/ipc/contract";
```

Add a `config` object to `api` (after the `app` block) and an `onConfigChanged` method (after `onMenuCommand`):

```ts
  config: {
    load: (): Promise<ConfigSnapshot> => ipcRenderer.invoke(IPC.configLoad),
    set: (req: ConfigSetRequest): Promise<ConfigSetResult> => ipcRenderer.invoke(IPC.configSet, req),
    reload: (): Promise<ConfigSnapshot> => ipcRenderer.invoke(IPC.configReload),
    openInEditor: (): Promise<OpenResult> => ipcRenderer.invoke(IPC.configOpen),
  },
```

```ts
  onConfigChanged: (handler: (snapshot: ConfigSnapshot) => void): (() => void) => {
    const listener = (_event: unknown, snapshot: ConfigSnapshot): void => handler(snapshot);
    ipcRenderer.on(IPC.configChanged, listener);
    return () => ipcRenderer.removeListener(IPC.configChanged, listener);
  },
```

- [ ] **Step 2: Register the main-process handlers**

In `src/main/ipc.ts`, extend the imports:

```ts
import type { ConfigSnapshot, OpenResult, SaveResult } from "../kernel/ipc/contract";
import type { ConfigService } from "./configService";
import type { FileService } from "./fileService";
import { isConfigSetRequest, isSaveRequest } from "./guards";
```

Add `configService` to `IpcDeps`:

```ts
export interface IpcDeps {
  fileService: FileService;
  configService: ConfigService;
  getWindow(): BrowserWindow | null;
  isTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): boolean;
  onSetDirty(dirty: boolean): void;
  onQuit(): void;
  onDocPresent(): void;
}
```

Inside `registerIpc`, after the existing handlers, add:

```ts
  const emptySnapshot: ConfigSnapshot = { settings: {}, diagnostics: [] };

  ipcMain.handle(IPC.configLoad, async (event): Promise<ConfigSnapshot> => {
    if (!deps.isTrustedSender(event)) return emptySnapshot;
    return deps.configService.load();
  });

  ipcMain.handle(IPC.configSet, async (event, payload: unknown) => {
    if (!deps.isTrustedSender(event)) return { ok: false, error: "untrusted sender" };
    if (!isConfigSetRequest(payload)) return { ok: false, error: "invalid config set request" };
    return deps.configService.set(payload.patch);
  });

  ipcMain.handle(IPC.configReload, async (event): Promise<ConfigSnapshot> => {
    if (!deps.isTrustedSender(event)) return emptySnapshot;
    return deps.configService.reload();
  });

  ipcMain.handle(IPC.configOpen, async (event): Promise<OpenResult> => {
    if (!deps.isTrustedSender(event)) return { canceled: true };
    const result = await deps.fileService.openPath(deps.configService.path);
    if (!result.canceled && !("binary" in result)) deps.onDocPresent();
    return result;
  });
```

- [ ] **Step 3: Instantiate and wire the service in `index.ts`**

In `src/main/index.ts`, add the import (next to `FileService`):

```ts
import { ConfigService } from "./configService";
```

After `const fileService = new FileService();`, add:

```ts
  const configService = new ConfigService(app.getPath("userData"));
```

Inside `app.whenReady().then(() => { ... })`, after `mainWindow = win;`, add the eager load + broadcast wiring:

```ts
    void configService.load(); // materialize on first run, before the renderer asks
    configService.onDidChangeConfig((snapshot) => {
      mainWindow?.webContents.send(IPC.configChanged, snapshot);
    });
```

Add `configService` to the `registerIpc({ ... })` call (next to `fileService`):

```ts
      fileService,
      configService,
```

- [ ] **Step 4: Typecheck and build to verify wiring compiles and bundles**

Run: `npm run typecheck`
Expected: no errors.
Run: `npm run build`
Expected: build succeeds — `@decimalturn/toml-patch` resolves in the main bundle, `out/main/index.js` is produced.

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/main/ipc.ts src/main/index.ts
git commit -m "Wire config through main IPC handlers and the preload bridge"
```

---

### Task 6: `renderer/config.ts` — the reactive ConfigClient

A thin, DOM-free client holding the settings replica and change subscribers. It takes the `coal` API by constructor injection, so it is pure and node-testable (a refinement of the design's "browser tier" note — the client turned out to need no DOM).

**Files:**
- Create: `src/renderer/config.ts`
- Test: `src/renderer/config.test.ts`

**Interfaces:**
- Consumes: `CoalApi` (Task 4); `ConfigSnapshot`, `KernelSettings` (Task 1).
- Produces:
  - `class ConfigClient`:
    - `constructor(api: CoalApi)`
    - `init(): Promise<ConfigSnapshot>` — load + subscribe to `onConfigChanged`.
    - `get settings(): KernelSettings`
    - `onChange(cb: (s: ConfigSnapshot) => void): () => void`
    - `set(patch: Partial<KernelSettings>): Promise<ConfigSetResult>`
    - `reload(): Promise<ConfigSnapshot>`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/config.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { ConfigClient } from "./config";
import type { CoalApi } from "../kernel/ipc/contract";
import type { ConfigSnapshot } from "../kernel/config/types";

function fakeApi(initial: ConfigSnapshot): {
  api: CoalApi;
  fireChange(s: ConfigSnapshot): void;
} {
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
    const { api } = fakeApi({ settings: { keymap: "vim" }, diagnostics: [] });
    const client = new ConfigClient(api);
    await client.init();
    expect(client.settings).toEqual({ keymap: "vim" });
  });

  test("a config:changed push updates settings and notifies subscribers", async () => {
    const { api, fireChange } = fakeApi({ settings: {}, diagnostics: [] });
    const client = new ConfigClient(api);
    await client.init();

    const seen: ConfigSnapshot[] = [];
    client.onChange((s) => seen.push(s));

    fireChange({ settings: { keymap: "emacs" }, diagnostics: [] });
    expect(client.settings).toEqual({ keymap: "emacs" });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.settings.keymap).toBe("emacs");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project=node src/renderer/config.test.ts`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 3: Write the client**

Create `src/renderer/config.ts`:

```ts
// src/renderer/config.ts
import type { ConfigSnapshot, KernelSettings } from "../kernel/config/types";
import type { CoalApi, ConfigSetResult } from "../kernel/ipc/contract";

/**
 * Renderer-side reactive replica of the kernel config. Holds the latest
 * snapshot from main and re-broadcasts changes to subscribers (design §6).
 * DOM-free; the coal API is injected so it is unit-testable.
 */
export class ConfigClient {
  #api: CoalApi;
  #snapshot: ConfigSnapshot = { settings: {}, diagnostics: [] };
  #listeners = new Set<(s: ConfigSnapshot) => void>();

  constructor(api: CoalApi) {
    this.#api = api;
  }

  async init(): Promise<ConfigSnapshot> {
    this.#snapshot = await this.#api.config.load();
    this.#api.onConfigChanged((snapshot) => {
      this.#snapshot = snapshot;
      for (const listener of this.#listeners) listener(snapshot);
    });
    return this.#snapshot;
  }

  get settings(): KernelSettings {
    return this.#snapshot.settings;
  }

  onChange(cb: (s: ConfigSnapshot) => void): () => void {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  }

  set(patch: Partial<KernelSettings>): Promise<ConfigSetResult> {
    return this.#api.config.set({ patch });
  }

  reload(): Promise<ConfigSnapshot> {
    return this.#api.config.reload();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project=node src/renderer/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/renderer/config.ts src/renderer/config.test.ts
git commit -m "Add renderer ConfigClient (reactive settings replica)"
```

---

### Task 7: Wire the renderer + the config e2e smoke

Boot-load config in the composition root, reflect the loaded keymap into a DOM attribute (the reactive seam step 4 replaces), register the `core.config.open` / `core.config.reload` commands, and prove the whole chain end-to-end.

**Files:**
- Modify: `src/renderer/main.ts`
- Create: `e2e/config.spec.ts`

**Interfaces:**
- Consumes: `ConfigClient` (Task 6); `window.coal.config` (Task 5); the command registry + palette (existing).
- Produces: commands `core.config.open`, `core.config.reload`; `document.body.dataset.coalKeymap` reflects the loaded keymap.

- [ ] **Step 1: Wire the composition root**

In `src/renderer/main.ts`, add the import (next to `Minibuffer`):

```ts
import { ConfigClient } from "./config";
```

After `const minibuffer = new Minibuffer(document.body);`, add:

```ts
const config = new ConfigClient(window.coal);
// Reflect the loaded keymap into the DOM — the reactive seam step 4's keymap
// layer consumes (unset shows as ""). Also the e2e's observable.
const reflectKeymap = (): void => {
  document.body.dataset["coalKeymap"] = config.settings.keymap ?? "";
};
config.onChange(reflectKeymap);
void config.init().then(reflectKeymap);
```

Register the two commands via the existing `store.add(commands.registerCommand({ ... }))` pattern (add after the `core.command.execute` registration, before the keybinding registrations):

```ts
store.add(
  commands.registerCommand({
    id: "core.config.open",
    title: "Open Settings (settings.toml)",
    run: async () => {
      const result = await window.coal.config.openInEditor();
      if (result.canceled) return;
      if ("binary" in result) return;
      editor.facade.setText(result.doc.text);
      currentDocId = result.doc.id;
    },
  }),
);

store.add(
  commands.registerCommand({
    id: "core.config.reload",
    title: "Reload Settings",
    run: async () => {
      await config.reload();
    },
  }),
);
```

- [ ] **Step 2: Rebuild the app for the e2e**

Run: `npm run build`
Expected: build succeeds; `out/main/index.js` is refreshed.

- [ ] **Step 3: Write the e2e smoke**

Create `e2e/config.spec.ts`:

```ts
import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("settings.toml materializes on launch and reload reflects an external edit", async () => {
  const userData = await mkdtemp(join(tmpdir(), "coal-cfg-e2e-"));
  const settings = join(userData, "settings.toml");

  const args = ["out/main/index.js", `--user-data-dir=${userData}`];
  if (process.env["CI"]) args.push("--no-sandbox");
  const app = await electron.launch({ args });

  try {
    const window = await app.firstWindow();
    await window.locator(".cm-content").waitFor();
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1; // never block on the unsaved dialog
    });

    // Materialized on first run, with no keymap set (reflected as "").
    await expect.poll(() => existsSync(settings)).toBe(true);
    await expect(window.locator("body")).toHaveAttribute("data-coal-keymap", "");
    expect(await readFile(settings, "utf-8")).toContain("# Coal");

    // Externally edit the file, then reload via the palette.
    await writeFile(settings, 'keymap = "vim"\n', "utf-8");
    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+Shift+P");
    await expect(window.locator(".coal-minibuffer.open")).toBeVisible();
    await window.locator(".coal-mb-input").fill("Reload Settings");
    await window.keyboard.press("Enter");

    // The renderer's snapshot updated reactively.
    await expect(window.locator("body")).toHaveAttribute("data-coal-keymap", "vim");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test("Open Settings opens settings.toml in the editor", async () => {
  const userData = await mkdtemp(join(tmpdir(), "coal-cfg-e2e-"));
  const args = ["out/main/index.js", `--user-data-dir=${userData}`];
  if (process.env["CI"]) args.push("--no-sandbox");
  const app = await electron.launch({ args });

  try {
    const window = await app.firstWindow();
    await window.locator(".cm-content").waitFor();
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1;
    });

    await window.locator(".cm-content").click();
    await window.keyboard.press("Control+Shift+P");
    await expect(window.locator(".coal-minibuffer.open")).toBeVisible();
    await window.locator(".coal-mb-input").fill("Open Settings");
    await window.keyboard.press("Enter");

    await expect(window.locator(".cm-content")).toContainText("Coal - user settings");
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});
```

- [ ] **Step 4: Run the e2e to verify it passes**

Run: `npm run test:e2e`
Expected: PASS — the existing smokes plus the two new config tests. (Under CI, runs beneath `xvfb`.)

- [ ] **Step 5: Typecheck, format, commit**

```bash
npm run typecheck
npm run format
git add src/renderer/main.ts e2e/config.spec.ts
git commit -m "Boot-load config in the renderer, add config commands, and an e2e smoke"
```

---

### Task 8: Document the config layer in `docs/dev/kernel.md`

Bring the kernel dev guide up to date: the new modules, a config flow, and remove config from "not yet built."

**Files:**
- Modify: `docs/dev/kernel.md`

- [ ] **Step 1: Add the modules to the map**

In the `src/kernel/` table, add a row:

```md
| `config/schema.ts` · `config/validate.ts` · `config/types.ts` · `config/defaultTemplate.ts` | The global-scope kernel settings: schema + non-destructive `validate(raw)` → `{ settings, diagnostics }` + the curated default `settings.toml` template. Pure, dependency-free. |
```

In the `src/main/` table, add rows:

```md
| `tomlConfigCodec.ts` | Pure TOML round-trip over `@decimalturn/toml-patch`: `parse(text)` and comment-preserving `applyEdit(text, obj)`. The only place TOML text is handled. |
| `configService.ts` | Owns the global `settings.toml` (`app.getPath('userData')`): materialize on first run, comment-preserving `set`, `reload`, atomic write, and a change broadcast. |
```

In the `src/renderer/` table, add a row:

```md
| `config.ts` | `ConfigClient` — the reactive settings replica: `init` loads + subscribes, `onChange` notifies, `set`/`reload` proxy to main. |
```

- [ ] **Step 2: Add a config flow**

Under "Key flows", add:

```md
- **Config.** On boot the renderer's `ConfigClient.init()` calls `coal.config.load()` → main reads
  `settings.toml` (materializing the curated default when absent) → `tomlConfigCodec.parse` →
  `kernel/config` `validate` → a `ConfigSnapshot` back to the renderer. `config.set({ keymap })` merges
  the change into the full parsed object and `applyEdit`s it (comments + foreign keys preserved), atomic-
  writes, and broadcasts `config:changed`; `core.config.reload` re-reads external hand-edits. Config is
  the **user/global** scope (`SPEC.md` §9); the per-vault tree arrives with the workspace/PKM slices.
```

- [ ] **Step 3: Update "Not yet built"**

In the "Not yet built" paragraph, remove "the config tree + Settings" from the list (the global config layer now exists; the per-vault tree and the Settings UI remain deferred). Rewrite that clause to: "both Emacs/Vim keymaps + the first-run prompt, the **per-vault** config tree + Settings UI, the plugin loader ...".

- [ ] **Step 4: Verify formatting and commit**

Run: `npm run format:check`
Expected: passes (or run `npm run format` first).

```bash
git add docs/dev/kernel.md
git commit -m "Document the config layer in the kernel dev guide"
```

---

## Self-Review

**Spec coverage** (design doc → task):
- §1 global layer + keymap slot → Tasks 1, 3, 7. §2 two-scope model → ratified in the design PR; step-3 code builds only the global layer (Task 3 location, Task 5 wiring). §3 pure kernel/config + main service, kernel dependency-free → Tasks 1-3 (lib in `main` only). §5 schema/validate/template → Tasks 1, 3. §6 preserving write (full-object patch), events + reload, commands → Tasks 2, 3, 7. §7 `@decimalturn/toml-patch` single lib → Task 2. §8 location (userData) → Task 5. §9 never-crash/never-clobber → Task 3 (malformed test) + guard Task 4. §10 three tiers → node (1,2,3,6), guard (4), e2e (7). §11 security (main-only, senderFrame + payload validation) → Tasks 4, 5.
- Deferred items (vault tree, plugins.toml, Settings GUI, live-watch) are correctly absent.

**Placeholder scan:** none — every step has complete code or exact edits.

**Type consistency:** `KernelSettings`, `ConfigSnapshot`, `ConfigDiagnostic`, `KeymapChoice` defined in Task 1 and used verbatim in Tasks 2-7; `parse`/`applyEdit` signatures match between Task 2 and Task 3; `ConfigService` API (`load`/`set`/`reload`/`onDidChangeConfig`/`path`) matches between Task 3 and Task 5; `CoalApi.config` shape matches across Tasks 4 (contract), 5 (preload/handlers), 6 (client). `isConfigSetRequest` defined in Task 4, used in Task 5.
</content>
