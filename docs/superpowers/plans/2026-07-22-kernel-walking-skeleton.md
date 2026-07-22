# Kernel Walking-Skeleton (PR #1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the kernel's walking skeleton — a real Electron window that mounts CodeMirror 6, opens and saves one file byte-for-byte, with open/save/quit routed through a minimal command registry the kernel dogfoods.

**Architecture:** A hexagonal split. A pure, framework-free `src/kernel/` core (command registry, keybinding registry, byte-exact IO codec, IPC contract types) is unit-tested in Node. Thin `src/main/` (all filesystem lives here), `src/preload/` (one typed `contextBridge` bridge), and `src/renderer/` (CodeMirror 6 + composition root) adapters wrap it. The renderer holds an opaque doc `id` and decoded text only — the exact trust boundary future encryption reuses.

**Tech Stack:** TypeScript (strict, ESM), Electron 43.x, electron-vite 5.x + Vite, CodeMirror 6 (scoped packages), Vitest (node + browser projects), Playwright `_electron` (one smoke), `write-file-atomic`.

**Design source:** [`docs/superpowers/specs/2026-07-22-kernel-walking-skeleton-design.md`](../specs/2026-07-22-kernel-walking-skeleton-design.md). Every task implements part of it; section references below (e.g. "design §7") point there.

## Global Constraints

Every task's requirements implicitly include this section.

- **Runtime:** Node `>=22`; `package.json` is ESM (`"type": "module"`).
- **TypeScript strict flags (already set in `tsconfig.json`):** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`. Because of `verbatimModuleSyntax`, **type-only imports must use `import type`**. Because of `noUncheckedIndexedAccess`, indexed access (`arr[i]`) is `T | undefined` — handle it.
- **Prettier (enforced by the pre-commit hook):** `printWidth: 100`, double quotes, semicolons, `trailingComma: "all"`. Run `npm run format` before committing if unsure.
- **Tests:** Vitest. Node-tier files are `*.test.ts`; browser-tier files are `*.browser.test.ts`. Use `import { describe, expect, test } from "vitest";`; property tests use `import fc from "fast-check";`. Prefer byte comparison via `Buffer.from(a).equals(Buffer.from(b))` — never string equality for byte assertions (design §7.1).
- **Kernel purity:** files under `src/kernel/` import **no** Electron, Node (`fs`, `path`, …), or DOM APIs — only standard JS (`TextEncoder`/`TextDecoder`/`Uint8Array`/`Map`/`Set`). All filesystem work lives in `src/main/` (design §3, §5).
- **Byte-exact IO scope (design §7):** UTF-8 (±BOM) and UTF-16 LE/BE (±BOM), with LF or CRLF line endings. **No external encoding dependency** — `TextDecoder`/`TextEncoder` plus a hand-rolled UTF-16 encoder cover the whole scope.
- **Security posture (design §3):** hardened + explicitly-pinned `webPreferences` (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`); a **CJS** preload; typed IPC with runtime payload validation and `senderFrame` checks; no `@electron/remote`.
- **Version pins (design §4):** Electron `43.x`; electron-vite `5.x`; `@codemirror/state@6.7.1`, `@codemirror/view@6.43.6`, `@codemirror/commands@6.10.4`.
- **Commit hygiene (commit-msg hook):** subject 3–72 chars, meaningful (bare `wip`/`fix`/`test`/`update` are rejected). Each task ends with a real commit.
- **Command IDs / keys (pinned, dogfooded via the registry):** `core.file.open` (`Ctrl-o`, "Open File…"), `core.file.save` (`Ctrl-s`, "Save"), `core.app.quit` (`Ctrl-q`, "Quit").

## File Structure

```
src/
  kernel/
    command/
      disposable.ts          # Disposable, DisposableStore (Task 1)
      types.ts               # EditorFacade, CommandContext, Command, Keybinding (Task 2)
      commandRegistry.ts     # CommandRegistry (Task 2)
      keybindingRegistry.ts  # KeybindingRegistry (Task 3)
    io/
      types.ts               # Encoding, Eol, DocMeta, DecodeResult (Task 4)
      detect.ts              # detectEncoding, detectEol, hasFinalNewline (Task 4)
      codec.ts               # decode, encode (Task 5)
    ipc/
      contract.ts            # IPC channel names, request/response types, CoalApi (Task 6)
  main/
    fileService.ts           # open-doc registry, decode-on-open, encode+atomic-save (Task 8)
    ipc.ts                   # ipcMain handlers + validation guards (Task 9)
    window.ts                # hardened BrowserWindow + app:// load (Task 10)
    protocol.ts              # app:// protocol handler (Task 10)
    menu.ts                  # native menu -> menu-command (Task 10)
    index.ts                 # app lifecycle, single-instance, close-guard (Task 10)
  preload/
    index.ts                 # contextBridge 'coal' bridge (Task 9)
  renderer/
    index.html               # CSP + root + module script (Task 7)
    coal.d.ts                # window.coal typing (Task 11)
    editor.ts                # CM6 mount, EditorFacade, keymap-from-registry (Task 11)
    main.ts                  # composition root (Task 12)
  overlay/                   # UNTOUCHED
electron.vite.config.ts      # main/preload/renderer build (Task 7)
playwright.config.ts         # electron e2e config (Task 13)
e2e/
  skeleton.spec.ts           # open -> edit -> save -> assert bytes -> quit (Task 13)
```

---

### Task 1: DisposableStore (teardown ledger)

Implements the auto-disposal primitive (design §6): everything a registrant contributes is tracked and torn down together.

**Files:**
- Create: `src/kernel/command/disposable.ts`
- Test: `src/kernel/command/disposable.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Disposable { dispose(): void }`
  - `class DisposableStore implements Disposable` with `add<T extends Disposable>(item: T): T`, `get size(): number`, `dispose(): void` (idempotent; disposes in reverse add order; items added after disposal are disposed immediately).

- [ ] **Step 1: Write the failing test**

```ts
// src/kernel/command/disposable.test.ts
import { describe, expect, test } from "vitest";
import { DisposableStore } from "./disposable";

describe("DisposableStore (design §6 auto-disposal ledger)", () => {
  test("disposes tracked items in reverse order of addition", () => {
    const order: number[] = [];
    const store = new DisposableStore();
    store.add({ dispose: () => order.push(1) });
    store.add({ dispose: () => order.push(2) });
    store.dispose();
    expect(order).toEqual([2, 1]);
  });

  test("add returns the item and tracks its size", () => {
    const store = new DisposableStore();
    const d = store.add({ dispose: () => {} });
    expect(typeof d.dispose).toBe("function");
    expect(store.size).toBe(1);
  });

  test("dispose is idempotent — items are disposed exactly once", () => {
    let count = 0;
    const store = new DisposableStore();
    store.add({ dispose: () => count++ });
    store.dispose();
    store.dispose();
    expect(count).toBe(1);
  });

  test("items added after disposal are disposed immediately", () => {
    let disposed = false;
    const store = new DisposableStore();
    store.dispose();
    store.add({ dispose: () => (disposed = true) });
    expect(disposed).toBe(true);
    expect(store.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/kernel/command/disposable.test.ts`
Expected: FAIL — `Cannot find module "./disposable"` / `DisposableStore is not defined`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/kernel/command/disposable.ts

/** Something that can be torn down. The kernel's universal cleanup unit. */
export interface Disposable {
  dispose(): void;
}

/**
 * Tracks disposables and tears them all down together (design §6). Disposal is
 * idempotent and runs in reverse order of addition; anything added after the
 * store is disposed is disposed immediately, so registrations never leak.
 */
export class DisposableStore implements Disposable {
  #items = new Set<Disposable>();
  #disposed = false;

  add<T extends Disposable>(item: T): T {
    if (this.#disposed) {
      item.dispose();
      return item;
    }
    this.#items.add(item);
    return item;
  }

  get size(): number {
    return this.#items.size;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const items = [...this.#items].reverse();
    this.#items.clear();
    for (const item of items) item.dispose();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/kernel/command/disposable.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/kernel/command/disposable.ts src/kernel/command/disposable.test.ts
git commit -m "feat(kernel): add DisposableStore teardown ledger"
```

---

### Task 2: Command types + CommandRegistry

The registry and the single `executeCommand` choke point (design §6). The kernel registers its own commands through this exact public API.

**Files:**
- Create: `src/kernel/command/types.ts`
- Create: `src/kernel/command/commandRegistry.ts`
- Test: `src/kernel/command/commandRegistry.test.ts`

**Interfaces:**
- Consumes: `Disposable` (Task 1).
- Produces:
  - `interface EditorFacade { getText(): string; setText(text: string): void; isDirty(): boolean; markClean(): void; focus(): void }`
  - `interface CommandContext { readonly editor: EditorFacade | null }`
  - `interface Command { readonly id: string; readonly title: string; readonly category?: string; run(ctx: CommandContext): void | Promise<void>; isEnabled?(ctx: CommandContext): boolean }`
  - `interface Keybinding { readonly keys: string; readonly command: string; readonly when?: string }`
  - `class CommandRegistry` with `registerCommand(command: Command): Disposable` (throws on duplicate id), `hasCommand(id): boolean`, `getCommand(id): Command | undefined`, `getCommands(): Command[]`, `executeCommand(id: string, ctx: CommandContext): Promise<void>` (throws on unknown id; no-op when `isEnabled` returns false; awaits `run`).

- [ ] **Step 1: Write the failing test**

```ts
// src/kernel/command/commandRegistry.test.ts
import { describe, expect, test, vi } from "vitest";
import { CommandRegistry } from "./commandRegistry";
import type { CommandContext } from "./types";

const ctx: CommandContext = { editor: null };

describe("CommandRegistry (design §6 command spine)", () => {
  test("registers and executes a command through the choke point", async () => {
    const registry = new CommandRegistry();
    const run = vi.fn();
    registry.registerCommand({ id: "core.demo", title: "Demo", run });
    await registry.executeCommand("core.demo", ctx);
    expect(run).toHaveBeenCalledWith(ctx);
  });

  test("throws when registering a duplicate id", () => {
    const registry = new CommandRegistry();
    registry.registerCommand({ id: "core.demo", title: "Demo", run: () => {} });
    expect(() =>
      registry.registerCommand({ id: "core.demo", title: "Dup", run: () => {} }),
    ).toThrow(/already registered: core\.demo/);
  });

  test("disposing a registration removes the command", () => {
    const registry = new CommandRegistry();
    const d = registry.registerCommand({ id: "core.demo", title: "Demo", run: () => {} });
    expect(registry.hasCommand("core.demo")).toBe(true);
    d.dispose();
    expect(registry.hasCommand("core.demo")).toBe(false);
  });

  test("executing an unknown command throws", async () => {
    const registry = new CommandRegistry();
    await expect(registry.executeCommand("core.missing", ctx)).rejects.toThrow(
      /unknown command: core\.missing/,
    );
  });

  test("a disabled command does not run", async () => {
    const registry = new CommandRegistry();
    const run = vi.fn();
    registry.registerCommand({ id: "core.demo", title: "Demo", run, isEnabled: () => false });
    await registry.executeCommand("core.demo", ctx);
    expect(run).not.toHaveBeenCalled();
  });

  test("getCommands returns a snapshot that does not mutate the registry", () => {
    const registry = new CommandRegistry();
    registry.registerCommand({ id: "core.demo", title: "Demo", run: () => {} });
    const snapshot = registry.getCommands();
    snapshot.pop();
    expect(registry.getCommands()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/kernel/command/commandRegistry.test.ts`
Expected: FAIL — `Cannot find module "./commandRegistry"`.

- [ ] **Step 3: Write the types**

```ts
// src/kernel/command/types.ts

/** The narrow view commands get of the active editor (design §6). */
export interface EditorFacade {
  getText(): string;
  setText(text: string): void;
  isDirty(): boolean;
  /** Reset the dirty flag after a successful save. */
  markClean(): void;
  focus(): void;
}

/** Passed to every command run/enablement check. `editor` is null when none is active. */
export interface CommandContext {
  readonly editor: EditorFacade | null;
}

export interface Command {
  readonly id: string;
  readonly title: string;
  readonly category?: string;
  run(ctx: CommandContext): void | Promise<void>;
  isEnabled?(ctx: CommandContext): boolean;
}

/** A key -> command-id association. `when` is stored now, evaluated later (design §6). */
export interface Keybinding {
  readonly keys: string;
  readonly command: string;
  readonly when?: string;
}
```

- [ ] **Step 4: Write the registry**

```ts
// src/kernel/command/commandRegistry.ts
import type { Disposable } from "./disposable";
import type { Command, CommandContext } from "./types";

/**
 * The single place every kernel action lives, and the one `executeCommand`
 * choke point keys / menu / (later) minibuffer all route through (design §6).
 */
export class CommandRegistry {
  #commands = new Map<string, Command>();

  registerCommand(command: Command): Disposable {
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

  hasCommand(id: string): boolean {
    return this.#commands.has(id);
  }

  getCommand(id: string): Command | undefined {
    return this.#commands.get(id);
  }

  getCommands(): Command[] {
    return [...this.#commands.values()];
  }

  async executeCommand(id: string, ctx: CommandContext): Promise<void> {
    const command = this.#commands.get(id);
    if (!command) {
      throw new Error(`unknown command: ${id}`);
    }
    if (command.isEnabled && !command.isEnabled(ctx)) {
      return;
    }
    await command.run(ctx);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/kernel/command/commandRegistry.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
npm run format
git add src/kernel/command/types.ts src/kernel/command/commandRegistry.ts src/kernel/command/commandRegistry.test.ts
git commit -m "feat(kernel): add CommandRegistry with executeCommand choke point"
```

---

### Task 3: KeybindingRegistry

Keys reference commands by string id and resolve lazily; a binding whose command is missing is inert and falls through (design §6). The registry stays dumb — the renderer's keymap does the resolution.

**Files:**
- Create: `src/kernel/command/keybindingRegistry.ts`
- Test: `src/kernel/command/keybindingRegistry.test.ts`

**Interfaces:**
- Consumes: `Disposable` (Task 1), `Keybinding` (Task 2).
- Produces: `class KeybindingRegistry` with `registerKeybinding(binding: Keybinding): Disposable`, `getBindings(): Keybinding[]` (snapshot, registration order), `getBindingsForKeys(keys: string): Keybinding[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/kernel/command/keybindingRegistry.test.ts
import { describe, expect, test } from "vitest";
import { KeybindingRegistry } from "./keybindingRegistry";

describe("KeybindingRegistry (design §6 keys decoupled from commands)", () => {
  test("registers bindings and returns them in registration order", () => {
    const registry = new KeybindingRegistry();
    registry.registerKeybinding({ keys: "Ctrl-s", command: "core.file.save" });
    registry.registerKeybinding({ keys: "Ctrl-o", command: "core.file.open" });
    expect(registry.getBindings().map((b) => b.command)).toEqual([
      "core.file.save",
      "core.file.open",
    ]);
  });

  test("getBindingsForKeys filters by exact key string", () => {
    const registry = new KeybindingRegistry();
    registry.registerKeybinding({ keys: "Ctrl-s", command: "core.file.save" });
    registry.registerKeybinding({ keys: "Ctrl-o", command: "core.file.open" });
    expect(registry.getBindingsForKeys("Ctrl-s")).toEqual([
      { keys: "Ctrl-s", command: "core.file.save" },
    ]);
  });

  test("disposing a binding removes it", () => {
    const registry = new KeybindingRegistry();
    const d = registry.registerKeybinding({ keys: "Ctrl-q", command: "core.app.quit" });
    d.dispose();
    expect(registry.getBindings()).toEqual([]);
  });

  test("getBindings returns a snapshot that does not mutate the registry", () => {
    const registry = new KeybindingRegistry();
    registry.registerKeybinding({ keys: "Ctrl-s", command: "core.file.save" });
    registry.getBindings().pop();
    expect(registry.getBindings()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/kernel/command/keybindingRegistry.test.ts`
Expected: FAIL — `Cannot find module "./keybindingRegistry"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/kernel/command/keybindingRegistry.ts
import type { Disposable } from "./disposable";
import type { Keybinding } from "./types";

/**
 * Stores key -> command-id bindings. Resolution (find the first binding for a
 * key whose command exists and is enabled, else fall through) is the consumer's
 * job — the renderer keymap in this skeleton (design §6).
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

  getBindings(): Keybinding[] {
    return [...this.#bindings];
  }

  getBindingsForKeys(keys: string): Keybinding[] {
    return this.#bindings.filter((binding) => binding.keys === keys);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/kernel/command/keybindingRegistry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/kernel/command/keybindingRegistry.ts src/kernel/command/keybindingRegistry.test.ts
git commit -m "feat(kernel): add KeybindingRegistry decoupled from commands"
```

---

### Task 4: IO types + encoding/EOL detection

The detection half of byte-exact IO (design §7): sniff encoding + BOM, classify EOL, and detect a final newline — all pure, on `Uint8Array`/`string`.

**Files:**
- Create: `src/kernel/io/types.ts`
- Create: `src/kernel/io/detect.ts`
- Test: `src/kernel/io/detect.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Encoding = "utf-8" | "utf-16le" | "utf-16be"`, `type Eol = "lf" | "crlf"`
  - `interface DocMeta { readonly encoding: Encoding; readonly hasBom: boolean; readonly eol: Eol; readonly mixedEol: boolean; readonly finalNewline: boolean }`
  - `type DecodeResult = { readonly kind: "text"; readonly text: string; readonly meta: DocMeta } | { readonly kind: "binary" }`
  - `interface EncodingSniff { encoding: Encoding; hasBom: boolean }`
  - `detectEncoding(bytes: Uint8Array): EncodingSniff | null` (null = binary)
  - `detectEol(raw: string): { eol: Eol; mixedEol: boolean }`
  - `hasFinalNewline(raw: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/kernel/io/detect.test.ts
import { describe, expect, test } from "vitest";
import { detectEncoding, detectEol, hasFinalNewline } from "./detect";

const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b);

describe("detectEncoding (design §7 BOM sniff + NUL heuristic)", () => {
  test("detects a UTF-8 BOM", () => {
    expect(detectEncoding(bytes(0xef, 0xbb, 0xbf, 0x41))).toEqual({
      encoding: "utf-8",
      hasBom: true,
    });
  });

  test("detects UTF-16 LE and BE BOMs", () => {
    expect(detectEncoding(bytes(0xff, 0xfe, 0x41, 0x00))).toEqual({
      encoding: "utf-16le",
      hasBom: true,
    });
    expect(detectEncoding(bytes(0xfe, 0xff, 0x00, 0x41))).toEqual({
      encoding: "utf-16be",
      hasBom: true,
    });
  });

  test("plain ASCII with no NULs is UTF-8 without a BOM", () => {
    expect(detectEncoding(bytes(0x41, 0x42, 0x43))).toEqual({ encoding: "utf-8", hasBom: false });
  });

  test("BOM-less UTF-16 ASCII is detected by NUL parity", () => {
    // "AB" in utf-16le: 41 00 42 00 (NULs at odd indices)
    expect(detectEncoding(bytes(0x41, 0x00, 0x42, 0x00))).toEqual({
      encoding: "utf-16le",
      hasBom: false,
    });
    // "AB" in utf-16be: 00 41 00 42 (NULs at even indices)
    expect(detectEncoding(bytes(0x00, 0x41, 0x00, 0x42))).toEqual({
      encoding: "utf-16be",
      hasBom: false,
    });
  });

  test("a sparse NUL among many non-NUL bytes is binary, not UTF-16", () => {
    // "hello\x00world" — one NUL, below the every-other-byte threshold.
    const b = bytes(0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x77, 0x6f, 0x72, 0x6c, 0x64);
    expect(detectEncoding(b)).toBeNull();
  });

  test("empty input is UTF-8 without a BOM", () => {
    expect(detectEncoding(bytes())).toEqual({ encoding: "utf-8", hasBom: false });
  });
});

describe("detectEol / hasFinalNewline (design §7)", () => {
  test("classifies LF, CRLF, and mixed", () => {
    expect(detectEol("a\nb\nc")).toEqual({ eol: "lf", mixedEol: false });
    expect(detectEol("a\r\nb\r\nc")).toEqual({ eol: "crlf", mixedEol: false });
    expect(detectEol("a\r\nb\nc")).toEqual({ eol: "crlf", mixedEol: true });
  });

  test("no newlines defaults to LF, not mixed", () => {
    expect(detectEol("abc")).toEqual({ eol: "lf", mixedEol: false });
  });

  test("detects a trailing newline", () => {
    expect(hasFinalNewline("a\n")).toBe(true);
    expect(hasFinalNewline("a")).toBe(false);
    expect(hasFinalNewline("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/kernel/io/detect.test.ts`
Expected: FAIL — `Cannot find module "./detect"`.

- [ ] **Step 3: Write the types**

```ts
// src/kernel/io/types.ts

export type Encoding = "utf-8" | "utf-16le" | "utf-16be";
export type Eol = "lf" | "crlf";

/** Everything needed to reproduce a file's exact bytes after an edit (design §7). */
export interface DocMeta {
  readonly encoding: Encoding;
  readonly hasBom: boolean;
  readonly eol: Eol;
  readonly mixedEol: boolean;
  readonly finalNewline: boolean;
}

export type DecodeResult =
  | { readonly kind: "text"; readonly text: string; readonly meta: DocMeta }
  | { readonly kind: "binary" };
```

- [ ] **Step 4: Write the detector**

```ts
// src/kernel/io/detect.ts
import type { Encoding, Eol } from "./types";

const BOM_UTF8 = [0xef, 0xbb, 0xbf];
const BOM_UTF16LE = [0xff, 0xfe];
const BOM_UTF16BE = [0xfe, 0xff];

export interface EncodingSniff {
  encoding: Encoding;
  hasBom: boolean;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
}

/**
 * Sniff encoding from a byte prefix. A BOM wins; otherwise a NUL-position
 * heuristic over the first 512 bytes distinguishes UTF-16 LE/BE (ASCII text is
 * ~every-other-byte NUL). Returns null when the bytes look binary (design §7).
 */
export function detectEncoding(bytes: Uint8Array): EncodingSniff | null {
  if (startsWith(bytes, BOM_UTF8)) return { encoding: "utf-8", hasBom: true };
  if (startsWith(bytes, BOM_UTF16LE)) return { encoding: "utf-16le", hasBom: true };
  if (startsWith(bytes, BOM_UTF16BE)) return { encoding: "utf-16be", hasBom: true };

  const sample = bytes.subarray(0, 512);
  let oddNul = 0;
  let evenNul = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0x00) {
      if (i % 2 === 0) evenNul++;
      else oddNul++;
    }
  }
  if (oddNul === 0 && evenNul === 0) return { encoding: "utf-8", hasBom: false };

  // Require the NULs to be pervasive on one parity (real UTF-16 ASCII), so a
  // stray NUL in an otherwise-UTF-8 stream classifies as binary instead.
  const threshold = Math.max(1, Math.floor(sample.length / 4));
  if (oddNul >= threshold && evenNul === 0) return { encoding: "utf-16le", hasBom: false };
  if (evenNul >= threshold && oddNul === 0) return { encoding: "utf-16be", hasBom: false };
  return null;
}

/** Classify line endings from the raw (pre-normalization) decoded string. */
export function detectEol(raw: string): { eol: Eol; mixedEol: boolean } {
  let crlf = 0;
  let loneLf = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "\n") {
      if (i > 0 && raw[i - 1] === "\r") crlf++;
      else loneLf++;
    }
  }
  // Tie (equal CRLF and lone-LF counts) resolves to CRLF; newline-free text stays LF.
  const eol: Eol = crlf > 0 && crlf >= loneLf ? "crlf" : "lf";
  return { eol, mixedEol: crlf > 0 && loneLf > 0 };
}

export function hasFinalNewline(raw: string): boolean {
  return raw.length > 0 && (raw.endsWith("\n") || raw.endsWith("\r"));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/kernel/io/detect.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run format
git add src/kernel/io/types.ts src/kernel/io/detect.ts src/kernel/io/detect.test.ts
git commit -m "feat(kernel): add encoding and EOL detection for byte-exact IO"
```

---

### Task 5: IO codec (decode/encode) + round-trip invariant

The heart of byte-exactness (design §7, §7.1): `decode(bytes)` produces LF-normalized text + metadata; `encode(text, meta)` reproduces the original bytes. Tested with a golden corpus, property-based round-trips, and adversarial singletons.

**Files:**
- Create: `src/kernel/io/codec.ts`
- Test: `src/kernel/io/codec.test.ts`

**Interfaces:**
- Consumes: `detectEncoding`, `detectEol`, `hasFinalNewline` (Task 4), `DecodeResult`, `DocMeta`, `Encoding` (Task 4).
- Produces:
  - `decode(bytes: Uint8Array): DecodeResult` — normalizes text to `\n`; records original EOL/BOM/final-newline in `meta`; returns `{ kind: "binary" }` for undecodable bytes.
  - `encode(text: string, meta: DocMeta): Uint8Array` — re-applies `meta.eol`, `meta.encoding`, and `meta.hasBom`. For a **non-mixed** file, `encode(decode(bytes).text, decode(bytes).meta)` byte-equals the original.

- [ ] **Step 1: Write the failing test**

```ts
// src/kernel/io/codec.test.ts
import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { decode, encode } from "./codec";
import type { DocMeta } from "./types";

const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b);
const eq = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b));

// Build a byte fixture from parts (design §7 golden corpus).
function fixture(opts: {
  encoding: "utf-8" | "utf-16le" | "utf-16be";
  bom: boolean;
  eol: "lf" | "crlf";
  text: string; // logical content using \n
  finalNewline: boolean;
}): Uint8Array {
  const meta: DocMeta = {
    encoding: opts.encoding,
    hasBom: opts.bom,
    eol: opts.eol,
    mixedEol: false,
    finalNewline: opts.finalNewline,
  };
  const body = opts.finalNewline ? opts.text + "\n" : opts.text;
  return encode(body, meta);
}

describe("codec decode/encode (design §7 byte-exact invariant)", () => {
  const encodings = ["utf-8", "utf-16le", "utf-16be"] as const;
  const eols = ["lf", "crlf"] as const;
  const asciiContents = ["", "hello", "a\nb\nc"];
  const richContents = [...asciiContents, "héllo — café ☕", "🎉x🎉"];

  for (const encoding of encodings) {
    for (const bom of [false, true]) {
      for (const eol of eols) {
        for (const finalNewline of [false, true]) {
          // BOM-less UTF-16 is only detectable from pervasive NULs (ASCII text);
          // exclude non-ASCII BOM-less UTF-16, which is out of scope (design §7).
          const contents = encoding !== "utf-8" && !bom ? asciiContents : richContents;
          for (const text of contents) {
            test(`round-trips ${encoding} bom=${bom} ${eol} nl=${finalNewline} ${JSON.stringify(text)}`, () => {
              const original = fixture({ encoding, bom, eol, text, finalNewline });
              const decoded = decode(original);
              expect(decoded.kind).toBe("text");
              if (decoded.kind !== "text") return;
              expect(eq(encode(decoded.text, decoded.meta), original)).toBe(true);
            });
          }
        }
      }
    }
  }

  test("decode normalizes CRLF to LF but records eol in meta", () => {
    const original = fixture({
      encoding: "utf-8",
      bom: false,
      eol: "crlf",
      text: "a\nb",
      finalNewline: false,
    });
    const decoded = decode(original);
    expect(decoded.kind).toBe("text");
    if (decoded.kind !== "text") return;
    expect(decoded.text).toBe("a\nb");
    expect(decoded.meta.eol).toBe("crlf");
  });

  test("classifies bytes with pervasive NULs on both parities as binary", () => {
    expect(decode(bytes(0x00, 0x00, 0x00, 0x00, 0x00, 0x00)).kind).toBe("binary");
  });

  test("pure ASCII stays UTF-8 (does not drift to UTF-16)", () => {
    const decoded = decode(bytes(0x41, 0x42, 0x43));
    expect(decoded.kind).toBe("text");
    if (decoded.kind !== "text") return;
    expect(decoded.meta.encoding).toBe("utf-8");
  });

  test("empty input decodes to empty UTF-8 text and re-encodes to zero bytes", () => {
    const decoded = decode(bytes());
    expect(decoded.kind).toBe("text");
    if (decoded.kind !== "text") return;
    expect(decoded.text).toBe("");
    expect(encode(decoded.text, decoded.meta).length).toBe(0);
  });

  test("decodes known literal bytes and re-encodes them identically (ground truth)", () => {
    const literals: Uint8Array[] = [
      bytes(0x61, 0x0a, 0x62), // "a\nb" utf-8 LF
      bytes(0xef, 0xbb, 0xbf, 0x61, 0x0d, 0x0a, 0x62), // utf-8 BOM, CRLF
      bytes(0xff, 0xfe, 0x41, 0x00), // utf-16le BOM "A"
      bytes(0xfe, 0xff, 0x00, 0x41), // utf-16be BOM "A"
      bytes(0x41, 0x00, 0x42, 0x00), // utf-16le no BOM "AB"
    ];
    for (const original of literals) {
      const decoded = decode(original);
      expect(decoded.kind).toBe("text");
      if (decoded.kind !== "text") continue;
      expect(eq(encode(decoded.text, decoded.meta), original)).toBe(true);
    }
  });

  test("adversarial singletons decode as text or are classified binary", () => {
    expect(decode(bytes(0x41)).kind).toBe("text"); // 1 byte "A"
    expect(decode(bytes(0xef, 0xbb, 0xbf)).kind).toBe("text"); // BOM only
    expect(decode(bytes(0x61, 0x0d)).kind).toBe("text"); // lone CR at EOF
    expect(decode(bytes(0xff)).kind).toBe("binary"); // invalid utf-8 lead byte
    expect(decode(bytes(0xe4, 0xb8)).kind).toBe("binary"); // truncated multibyte
  });

  test("property: decode recovers text and re-encodes to the exact input bytes", () => {
    // A safe alphabet: valid code points only, no NUL, no lone CR — the codec's
    // in-scope domain (design §7). UTF-16 pins a BOM (BOM-less UTF-16 needs NULs).
    const textArb = fc
      .array(fc.constantFrom("a", "Z", "1", " ", "\n", "é", "☕", "中", "🎉"))
      .map((cs) => cs.join(""));
    fc.assert(
      fc.property(
        textArb,
        fc.constantFrom<DocMeta["encoding"]>("utf-8", "utf-16le", "utf-16be"),
        fc.boolean(),
        fc.constantFrom<DocMeta["eol"]>("lf", "crlf"),
        (text, encoding, bomChoice, eol) => {
          const hasBom = encoding === "utf-8" ? bomChoice : true;
          const meta: DocMeta = {
            encoding,
            hasBom,
            eol,
            mixedEol: false,
            finalNewline: text.endsWith("\n"),
          };
          const original = encode(text, meta);
          const decoded = decode(original);
          expect(decoded.kind).toBe("text");
          if (decoded.kind !== "text") return;
          expect(decoded.text).toBe(text);
          expect(eq(encode(decoded.text, decoded.meta), original)).toBe(true);
        },
      ),
    );
  });

  test("property: decode is total over arbitrary bytes (never throws; classifies)", () => {
    fc.assert(
      fc.property(fc.uint8Array(), (arr) => {
        const decoded = decode(Uint8Array.from(arr));
        expect(decoded.kind === "text" || decoded.kind === "binary").toBe(true);
        if (decoded.kind === "text" && !decoded.meta.mixedEol) {
          expect(() => encode(decoded.text, decoded.meta)).not.toThrow();
        }
      }),
    );
  });
});
```

Note: the golden corpus builds fixtures via `encode`, so the literal-bytes test supplies independent ground truth. The round-trip property uses a safe alphabet (the codec's in-scope domain), and a separate property checks `decode` is total over arbitrary bytes (design §7.1, §8). Mixed-EOL byte-exactness is covered by the pristine no-op path in Task 8, not here.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/kernel/io/codec.test.ts`
Expected: FAIL — `Cannot find module "./codec"`.

- [ ] **Step 3: Write the codec**

```ts
// src/kernel/io/codec.ts
import { detectEncoding, detectEol, hasFinalNewline } from "./detect";
import type { DecodeResult, DocMeta, Encoding } from "./types";

function bomBytes(encoding: Encoding): number[] {
  if (encoding === "utf-8") return [0xef, 0xbb, 0xbf];
  if (encoding === "utf-16le") return [0xff, 0xfe];
  return [0xfe, 0xff];
}

function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const hi = (code >> 8) & 0xff;
    const lo = code & 0xff;
    out[i * 2] = littleEndian ? lo : hi;
    out[i * 2 + 1] = littleEndian ? hi : lo;
  }
  return out;
}

/**
 * Decode bytes into LF-normalized text plus the metadata needed to reproduce the
 * original bytes. Undecodable input (bad sequences / binary NUL pattern) returns
 * `{ kind: "binary" }`. TextDecoder is fatal so lossy decodes are caught, not
 * silently mojibaked (design §7).
 */
export function decode(bytes: Uint8Array): DecodeResult {
  const sniff = detectEncoding(bytes);
  if (sniff === null) return { kind: "binary" };
  let raw: string;
  try {
    // ignoreBOM:false makes TextDecoder strip a leading BOM; we re-add it on encode.
    raw = new TextDecoder(sniff.encoding, { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return { kind: "binary" };
  }
  const { eol, mixedEol } = detectEol(raw);
  const finalNewline = hasFinalNewline(raw);
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const meta: DocMeta = { encoding: sniff.encoding, hasBom: sniff.hasBom, eol, mixedEol, finalNewline };
  return { kind: "text", text, meta };
}

/**
 * Re-serialize LF-normalized text to bytes using the recorded metadata: apply the
 * EOL, encode per the encoding, and prepend a BOM if the original had one. For a
 * non-mixed file this is the exact inverse of decode (design §7).
 */
export function encode(text: string, meta: DocMeta): Uint8Array {
  const withEol = meta.eol === "crlf" ? text.replace(/\n/g, "\r\n") : text;
  const body =
    meta.encoding === "utf-8"
      ? new TextEncoder().encode(withEol)
      : encodeUtf16(withEol, meta.encoding === "utf-16le");
  if (!meta.hasBom) return body;
  const bom = bomBytes(meta.encoding);
  const out = new Uint8Array(bom.length + body.length);
  out.set(bom, 0);
  out.set(body, bom.length);
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/kernel/io/codec.test.ts`
Expected: PASS (all golden-corpus + property + edge tests).

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/kernel/io/codec.ts src/kernel/io/codec.test.ts
git commit -m "feat(kernel): add byte-exact IO codec with round-trip tests"
```

---

### Task 6: IPC contract (channel names + typed surface)

The single shared module main and preload both import: channel names, request/response shapes, and the `CoalApi` exposed on `window.coal` (design §3, §5).

**Files:**
- Create: `src/kernel/ipc/contract.ts`
- Test: `src/kernel/ipc/contract.test.ts`

**Interfaces:**
- Consumes: `DocMeta` (Task 4).
- Produces:
  - `const IPC` — frozen map of channel names: `fileOpen`, `fileSave`, `docSetDirty`, `appQuit` (renderer→main), `docOpened`, `menuCommand` (main→renderer). Values are namespaced strings (`"coal:file.open"`, …).
  - `interface OpenDocResult { id: string; text: string; meta: DocMeta; displayName: string }`
  - `type OpenResult = { canceled: true } | { canceled: false; doc: OpenDocResult } | { canceled: false; binary: true; displayName: string }`
  - `interface SaveRequest { id: string; text: string }`, `type SaveResult = { ok: true } | { ok: false; error: string }`
  - `interface CoalApi { file: { open(): Promise<OpenResult>; save(req: SaveRequest): Promise<SaveResult> }; doc: { setDirty(dirty: boolean): void }; app: { quit(): void }; onMenuCommand(handler: (commandId: string) => void): () => void; onDocOpened(handler: (doc: OpenDocResult) => void): () => void }`

- [ ] **Step 1: Write the failing test**

```ts
// src/kernel/ipc/contract.test.ts
import { describe, expect, test } from "vitest";
import { IPC } from "./contract";

describe("IPC contract (design §3 typed channels)", () => {
  test("channel names are namespaced under coal: and unique", () => {
    const values = Object.values(IPC);
    expect(values.every((c) => c.startsWith("coal:"))).toBe(true);
    expect(new Set(values).size).toBe(values.length);
  });

  test("exposes the expected channel set", () => {
    expect(IPC).toEqual({
      fileOpen: "coal:file.open",
      fileSave: "coal:file.save",
      docSetDirty: "coal:doc.setDirty",
      docOpened: "coal:doc.opened",
      appQuit: "coal:app.quit",
      menuCommand: "coal:menu.command",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/kernel/ipc/contract.test.ts`
Expected: FAIL — `Cannot find module "./contract"`.

- [ ] **Step 3: Write the contract**

```ts
// src/kernel/ipc/contract.ts
import type { DocMeta } from "../io/types";

/** IPC channel names. Every method on CoalApi wraps exactly one of these (design §3). */
export const IPC = {
  fileOpen: "coal:file.open",
  fileSave: "coal:file.save",
  docSetDirty: "coal:doc.setDirty",
  docOpened: "coal:doc.opened",
  appQuit: "coal:app.quit",
  menuCommand: "coal:menu.command",
} as const;

export interface OpenDocResult {
  id: string;
  text: string;
  meta: DocMeta;
  displayName: string;
}

export type OpenResult =
  | { canceled: true }
  | { canceled: false; doc: OpenDocResult }
  | { canceled: false; binary: true; displayName: string };

export interface SaveRequest {
  id: string;
  text: string;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

/** The typed surface the preload bridge exposes on window.coal. */
export interface CoalApi {
  file: {
    open(): Promise<OpenResult>;
    save(req: SaveRequest): Promise<SaveResult>;
  };
  doc: {
    setDirty(dirty: boolean): void;
  };
  app: {
    quit(): void;
  };
  onMenuCommand(handler: (commandId: string) => void): () => void;
  /** Files opened from the CLI / a second instance are pushed from main. */
  onDocOpened(handler: (doc: OpenDocResult) => void): () => void;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/kernel/ipc/contract.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/kernel/ipc/contract.ts src/kernel/ipc/contract.test.ts
git commit -m "feat(kernel): add typed IPC contract for the coal bridge"
```

---
### Task 7: Electron + electron-vite scaffold

Stand up the native substrate: dependencies, `electron-vite` build for main/preload/renderer, Vitest node+browser projects, a minimal hardened window that loads the renderer. Deliverable is green typecheck + a successful build + a window that opens (verified, not unit-tested).

**Files:**
- Modify: `package.json` (deps, scripts, `main` entry)
- Modify: `tsconfig.json` (DOM lib, include config files)
- Modify: `vitest.config.ts` (node + browser projects)
- Create: `electron.vite.config.ts`
- Create: `src/renderer/index.html`
- Create: `src/main/index.ts` (minimal; expanded in Task 10)
- Create: `src/preload/index.ts` (stub; the real bridge is Task 9)

**Interfaces:**
- Consumes: nothing (tooling).
- Produces: `npm run dev` / `npm run build`; the Vitest `node` and `browser` projects; `process.env.ELECTRON_RENDERER_URL` (dev) vs `app://coal/index.html` (prod) loading convention.

- [ ] **Step 1: Add dependencies**

Run:
```bash
npm install --save electron@^43.0.0 @codemirror/state@6.7.1 @codemirror/view@6.43.6 @codemirror/commands@6.10.4 write-file-atomic@^6.0.0
npm install --save-dev electron-vite@^5.0.0 vite@^5.4.0 @vitest/browser@^4.1.10 playwright@^1.50.0 @playwright/test@^1.50.0 @types/write-file-atomic@^4.0.3
```
Note: `electron` is a devDependency in many setups, but electron-vite treats it as the runtime; keeping it in `dependencies` is fine and simplifies later packaging. If `npm audit --audit-level=high` (CI) flags a new transitive advisory, see "Risks" at the end of this plan before proceeding.

- [ ] **Step 2: Update `package.json` scripts + entry**

Set `"main": "./out/main/index.js"` and replace the `scripts` block's test/build entries so it reads:
```json
{
  "main": "./out/main/index.js",
  "scripts": {
    "prepare": "node scripts/setup-git.mjs",
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run --project=node",
    "test:coverage": "vitest run --project=node --coverage",
    "test:watch": "vitest --project=node",
    "test:browser": "vitest run --project=browser",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write \"src/**/*.ts\" \"e2e/**/*.ts\" \"*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\" \"e2e/**/*.ts\" \"*.ts\"",
    "git:cleanup": "node scripts/git-cleanup.mjs"
  }
}
```
Rationale: default `npm test` stays fast and dependency-light (node project only) so the pre-push hook doesn't need browsers; the browser + e2e tiers run explicitly (and in CI, Task 14). Coverage stays node-only so the advisory coverage job needs no browser install.

- [ ] **Step 3: Update `tsconfig.json`**

Add `"DOM"` and `"DOM.Iterable"` to `lib` (the renderer + browser tests need them), and extend `include` to the new config/e2e files:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "e2e", "vitest.config.ts", "electron.vite.config.ts", "playwright.config.ts"]
}
```
Note: a single permissive tsconfig (DOM + node libs together) means kernel/main purity is enforced by review + the Global Constraints, not the type system, for PR #1. A stricter project-reference split is a later hardening (design §5).

- [ ] **Step 4: Create `electron.vite.config.ts`**

```ts
import { defineConfig } from "electron-vite";
import { resolve } from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: resolve(root, "src/main/index.ts") },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve(root, "src/preload/index.ts"),
        // A CJS preload keeps sandbox:true working; pin the emitted name so the
        // main process can reference it deterministically (design §3).
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
  renderer: {
    root: resolve(root, "src/renderer"),
    build: {
      rollupOptions: { input: resolve(root, "src/renderer/index.html") },
    },
    resolve: {
      // Mandatory: electron-vite's pre-bundler can otherwise load two copies of
      // @codemirror/state and crash the editor (design §4).
      dedupe: ["@codemirror/state", "@codemirror/view", "@lezer/common", "style-mod"],
    },
    optimizeDeps: {
      include: ["@codemirror/state", "@codemirror/view", "@codemirror/commands"],
    },
  },
});
```

- [ ] **Step 5: Rewrite `vitest.config.ts` as node + browser projects**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    watch: false,
    projects: [
      {
        test: {
          name: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            provider: "playwright",
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.browser.test.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
```
Note: confirm the `test.projects` shape against the installed Vitest 4.1 docs (use context7 `/vitest-dev/vitest`); if `projects` is unavailable, use the documented equivalent for that version.

- [ ] **Step 6: Create `src/renderer/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Coal</title>
    <style>
      html,
      body,
      #root {
        height: 100%;
        margin: 0;
      }
      .cm-editor {
        height: 100%;
      }
      .cm-scroller {
        overflow: auto;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```
Note: CSP is applied via the `app://` protocol response headers in production (Task 10), not a meta tag, so it does not break the Vite dev server's HMR client. The inline `<style>` (allowed by `style-src 'unsafe-inline'`) makes the CM6 editor fill the frame (design §2). `index.html` is not covered by `prettier` (which formats `*.ts` only), so it needs no reformatting.

- [ ] **Step 7: Create the minimal main + preload stub**

```ts
// src/main/index.ts  (minimal; Task 10 replaces this with the full lifecycle)
import { app, BrowserWindow } from "electron";
import { join } from "node:path";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => createWindow());
app.on("window-all-closed", () => app.quit());
```
```ts
// src/preload/index.ts  (stub; Task 9 replaces with the real bridge)
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("coal", {});
```
```ts
// src/renderer/main.ts  (stub; Task 12 replaces this with the composition root)
export {};
```
Note: `index.html` references `./main.ts`, so this stub must exist for `electron-vite build` to resolve the renderer entry (Task 12 replaces it).

- [ ] **Step 8: Verify typecheck + build**

Run: `npm run typecheck`
Expected: PASS (no errors).

Run: `npx electron-vite build`
Expected: succeeds; `out/main/index.js`, `out/preload/index.cjs`, and `out/renderer/index.html` exist. Confirm the preload emitted as `index.cjs` (Task 10 references that exact path).

- [ ] **Step 9: Verify the window opens (manual/verify)**

Run: `npm run dev`
Expected: an Electron window opens showing an empty renderer (blank `#root`), no console errors about sandbox/preload. Close it. Use the `/verify` skill to confirm.

- [ ] **Step 10: Commit**

```bash
npm run format
git add package.json package-lock.json tsconfig.json vitest.config.ts electron.vite.config.ts src/renderer/index.html src/renderer/main.ts src/main/index.ts src/preload/index.ts
git commit -m "chore(kernel): scaffold Electron + electron-vite substrate"
```

---

### Task 8: FileService (byte-exact open/save in main)

The main-process owner of open files: decode on open, encode + atomic write on save, opaque ids, pristine-buffer no-op for unedited saves, symlink-following (design §3, §5, §7).

**Files:**
- Create: `src/main/fileService.ts`
- Test: `src/main/fileService.test.ts`

**Interfaces:**
- Consumes: `decode`, `encode` (Task 5), `DocMeta` (Task 4), `OpenResult`, `SaveResult` (Task 6).
- Produces: `class FileService` with `openPath(path: string | null): Promise<OpenResult>`, `save(id: string, text: string): Promise<SaveResult>`, `has(id: string): boolean`. Ids are opaque `doc-<n>`; the real path/pristine bytes never leave main.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/fileService.test.ts
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { chmod, lstat, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileService } from "./fileService";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "coal-fs-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("FileService (design §7 byte-exact save in main)", () => {
  test("open decodes a file and an unedited save writes identical bytes", async () => {
    const file = join(dir, "note.md");
    const original = Buffer.from("# Title\nbody\n", "utf-8");
    await writeFile(file, original);
    const svc = new FileService();
    const res = await svc.openPath(file);
    if (res.canceled || "binary" in res) throw new Error("expected text doc");
    expect(await svc.save(res.doc.id, res.doc.text)).toEqual({ ok: true });
    expect(Buffer.from(await readFile(file)).equals(original)).toBe(true);
  });

  test("saving edited text re-encodes and writes the new bytes", async () => {
    const file = join(dir, "note.md");
    await writeFile(file, Buffer.from("a\n", "utf-8"));
    const svc = new FileService();
    const res = await svc.openPath(file);
    if (res.canceled || "binary" in res) throw new Error("expected text doc");
    await svc.save(res.doc.id, "a\nb\n");
    expect(await readFile(file, "utf-8")).toBe("a\nb\n");
  });

  test("a CRLF file keeps CRLF after an edit (editor text is LF)", async () => {
    const file = join(dir, "crlf.md");
    await writeFile(file, Buffer.from("a\r\nb\r\n", "utf-8"));
    const svc = new FileService();
    const res = await svc.openPath(file);
    if (res.canceled || "binary" in res) throw new Error("expected text doc");
    await svc.save(res.doc.id, "a\nb\nc\n");
    expect(Buffer.from(await readFile(file)).equals(Buffer.from("a\r\nb\r\nc\r\n", "utf-8"))).toBe(
      true,
    );
  });

  test("openPath(null) cancels; binary files report binary", async () => {
    const svc = new FileService();
    expect(await svc.openPath(null)).toEqual({ canceled: true });
    const bin = join(dir, "b.bin");
    await writeFile(bin, Buffer.from([0, 0, 0, 0, 0, 0]));
    expect(await svc.openPath(bin)).toMatchObject({ canceled: false, binary: true });
  });

  test("saving an unknown doc id returns an error", async () => {
    const svc = new FileService();
    expect(await svc.save("doc-999", "x")).toEqual({ ok: false, error: "unknown doc: doc-999" });
  });

  test("an unedited save of a mixed-EOL file is byte-exact (pristine no-op, design §7)", async () => {
    const file = join(dir, "mixed.md");
    const original = Buffer.from("a\r\nb\nc\r\n", "utf-8"); // mixed CRLF + LF
    await writeFile(file, original);
    const svc = new FileService();
    const res = await svc.openPath(file);
    if (res.canceled || "binary" in res) throw new Error("expected text doc");
    expect(res.doc.meta.mixedEol).toBe(true);
    await svc.save(res.doc.id, res.doc.text); // unchanged text -> pristine bytes
    expect(Buffer.from(await readFile(file)).equals(original)).toBe(true);
  });

  test("preserves the file mode across an edited save", async () => {
    const file = join(dir, "mode.md");
    await writeFile(file, Buffer.from("x\n", "utf-8"));
    await chmod(file, 0o640);
    const svc = new FileService();
    const res = await svc.openPath(file);
    if (res.canceled || "binary" in res) throw new Error("expected text doc");
    await svc.save(res.doc.id, "y\n");
    expect((await stat(file)).mode & 0o777).toBe(0o640);
  });

  test("writes through a symlink to its target, preserving the link", async () => {
    const target = join(dir, "target.md");
    const link = join(dir, "link.md");
    await writeFile(target, Buffer.from("x\n", "utf-8"));
    await symlink(target, link);
    const svc = new FileService();
    const res = await svc.openPath(link);
    if (res.canceled || "binary" in res) throw new Error("expected text doc");
    await svc.save(res.doc.id, "y\n");
    expect(await readFile(target, "utf-8")).toBe("y\n");
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/fileService.test.ts`
Expected: FAIL — `Cannot find module "./fileService"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/main/fileService.ts
import { readFile, realpath } from "node:fs/promises";
import { basename } from "node:path";
import writeFileAtomic from "write-file-atomic";
import { decode, encode } from "../kernel/io/codec";
import type { DocMeta } from "../kernel/io/types";
import type { OpenResult, SaveResult } from "../kernel/ipc/contract";

interface OpenDoc {
  path: string;
  pristine: Uint8Array;
  meta: DocMeta;
  text: string;
}

/**
 * Owns open files in main. The renderer only sees an opaque id + decoded text;
 * the real path and pristine bytes stay here — the boundary future encryption
 * reuses (design §3, §5, §7).
 */
export class FileService {
  #docs = new Map<string, OpenDoc>();
  #seq = 0;

  async openPath(path: string | null): Promise<OpenResult> {
    if (path === null) return { canceled: true };
    const raw = await readFile(path);
    const bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    const displayName = basename(path);
    const decoded = decode(bytes);
    if (decoded.kind === "binary") {
      return { canceled: false, binary: true, displayName };
    }
    this.#seq += 1;
    const id = `doc-${this.#seq}`;
    this.#docs.set(id, { path, pristine: bytes, meta: decoded.meta, text: decoded.text });
    return { canceled: false, doc: { id, text: decoded.text, meta: decoded.meta, displayName } };
  }

  async save(id: string, text: string): Promise<SaveResult> {
    const doc = this.#docs.get(id);
    if (!doc) return { ok: false, error: `unknown doc: ${id}` };
    try {
      // Unedited content re-writes pristine bytes verbatim (byte-exact even for
      // mixed-EOL files); changed content is re-encoded from meta (design §7).
      const bytes = text === doc.text ? doc.pristine : encode(text, doc.meta);
      const target = await realpathOrSelf(doc.path);
      await writeFileAtomic(target, Buffer.from(bytes));
      this.#docs.set(id, { ...doc, pristine: bytes, text });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  has(id: string): boolean {
    return this.#docs.has(id);
  }
}

async function realpathOrSelf(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/fileService.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/main/fileService.ts src/main/fileService.test.ts
git commit -m "feat(kernel): add main-process FileService with byte-exact save"
```

---

### Task 9: IPC handlers + preload bridge

Wire the typed channels in main (with runtime validation + `senderFrame` checks) and expose the `coal` bridge in the preload. The pure validation guards are unit-tested; the wiring is covered by the e2e smoke (Task 13).

**Files:**
- Create: `src/main/guards.ts`
- Test: `src/main/guards.test.ts`
- Create: `src/main/ipc.ts`
- Modify: `src/preload/index.ts` (replace the Task 7 stub)

**Interfaces:**
- Consumes: `IPC`, `SaveRequest`, `OpenResult`, `SaveResult`, `CoalApi` (Task 6), `FileService` (Task 8).
- Produces:
  - `isSaveRequest(value: unknown): value is SaveRequest`, `isTrustedUrl(url: string | undefined, allowedOrigins: readonly string[]): boolean`
  - `interface IpcDeps { fileService: FileService; getWindow(): BrowserWindow | null; isTrustedSender(event): boolean; onSetDirty(dirty: boolean): void; onQuit(): void }`
  - `registerIpc(deps: IpcDeps): void`
  - `window.coal` implementing `CoalApi`.

- [ ] **Step 1: Write the failing test (pure guards)**

```ts
// src/main/guards.test.ts
import { describe, expect, test } from "vitest";
import { isSaveRequest, isTrustedUrl } from "./guards";

describe("IPC guards (design §3 runtime validation)", () => {
  test("isSaveRequest accepts well-formed payloads only", () => {
    expect(isSaveRequest({ id: "doc-1", text: "x" })).toBe(true);
    expect(isSaveRequest({ id: "doc-1" })).toBe(false);
    expect(isSaveRequest({ id: 1, text: "x" })).toBe(false);
    expect(isSaveRequest(null)).toBe(false);
    expect(isSaveRequest("nope")).toBe(false);
  });

  test("isTrustedUrl matches only allowed origins", () => {
    const allowed = ["app://coal/", "http://localhost:5173/"];
    expect(isTrustedUrl("app://coal/index.html", allowed)).toBe(true);
    expect(isTrustedUrl("http://localhost:5173/index.html", allowed)).toBe(true);
    expect(isTrustedUrl("https://evil.example/", allowed)).toBe(false);
    expect(isTrustedUrl(undefined, allowed)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/guards.test.ts`
Expected: FAIL — `Cannot find module "./guards"`.

- [ ] **Step 3: Write the guards (pure — no electron import)**

```ts
// src/main/guards.ts
import type { SaveRequest } from "../kernel/ipc/contract";

export function isSaveRequest(value: unknown): value is SaveRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { text?: unknown }).text === "string"
  );
}

/** True when a sender-frame URL belongs to one of the app's own origins (design §3). */
export function isTrustedUrl(url: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!url) return false;
  return allowedOrigins.some((origin) => url.startsWith(origin));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/guards.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the IPC handlers**

```ts
// src/main/ipc.ts
import { dialog, ipcMain } from "electron";
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { IPC } from "../kernel/ipc/contract";
import type { OpenResult, SaveResult } from "../kernel/ipc/contract";
import type { FileService } from "./fileService";
import { isSaveRequest } from "./guards";

export interface IpcDeps {
  fileService: FileService;
  getWindow(): BrowserWindow | null;
  isTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): boolean;
  onSetDirty(dirty: boolean): void;
  onQuit(): void;
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.fileOpen, async (event): Promise<OpenResult> => {
    if (!deps.isTrustedSender(event)) return { canceled: true };
    const win = deps.getWindow();
    if (!win) return { canceled: true };
    const picked = await dialog.showOpenDialog(win, { properties: ["openFile"] });
    const path = picked.canceled || picked.filePaths.length === 0 ? null : picked.filePaths[0]!;
    return deps.fileService.openPath(path);
  });

  ipcMain.handle(IPC.fileSave, async (event, payload: unknown): Promise<SaveResult> => {
    if (!deps.isTrustedSender(event)) return { ok: false, error: "untrusted sender" };
    if (!isSaveRequest(payload)) return { ok: false, error: "invalid save request" };
    return deps.fileService.save(payload.id, payload.text);
  });

  ipcMain.on(IPC.docSetDirty, (event, dirty: unknown) => {
    if (!deps.isTrustedSender(event)) return;
    if (typeof dirty === "boolean") deps.onSetDirty(dirty);
  });

  ipcMain.on(IPC.appQuit, (event) => {
    if (!deps.isTrustedSender(event)) return;
    deps.onQuit();
  });
}
```

- [ ] **Step 6: Write the real preload bridge**

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../kernel/ipc/contract";
import type {
  CoalApi,
  OpenDocResult,
  OpenResult,
  SaveRequest,
  SaveResult,
} from "../kernel/ipc/contract";

const api: CoalApi = {
  file: {
    open: (): Promise<OpenResult> => ipcRenderer.invoke(IPC.fileOpen),
    save: (req: SaveRequest): Promise<SaveResult> => ipcRenderer.invoke(IPC.fileSave, req),
  },
  doc: {
    setDirty: (dirty: boolean): void => ipcRenderer.send(IPC.docSetDirty, dirty),
  },
  app: {
    quit: (): void => ipcRenderer.send(IPC.appQuit),
  },
  onMenuCommand: (handler: (commandId: string) => void): (() => void) => {
    const listener = (_event: unknown, commandId: string): void => handler(commandId);
    ipcRenderer.on(IPC.menuCommand, listener);
    return () => ipcRenderer.removeListener(IPC.menuCommand, listener);
  },
  onDocOpened: (handler: (doc: OpenDocResult) => void): (() => void) => {
    const listener = (_event: unknown, doc: OpenDocResult): void => handler(doc);
    ipcRenderer.on(IPC.docOpened, listener);
    return () => ipcRenderer.removeListener(IPC.docOpened, listener);
  },
};

contextBridge.exposeInMainWorld("coal", api);
```

- [ ] **Step 7: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS. (`ipc.ts` and the preload are only type-checked here; their runtime wiring is exercised by the Task 13 smoke.)

- [ ] **Step 8: Commit**

```bash
npm run format
git add src/main/guards.ts src/main/guards.test.ts src/main/ipc.ts src/preload/index.ts
git commit -m "feat(kernel): add typed IPC handlers and the coal preload bridge"
```

---

### Task 10: Window hardening, app:// protocol, menu, lifecycle + dirty-guard

Turn the minimal main into the real shell: `app.setName` + a dev profile, pinned `webPreferences`, the `app://` protocol with a strict CSP, `web-contents-created` navigation lockdown, a native menu that routes to the registry, single-instance lock, opening a file passed on the CLI or from a second instance, and a close-guard for unsaved changes (design §2, §3, §6, §9). Verified by `/verify` and the Task 13 smoke.

**Files:**
- Create: `src/main/window.ts`
- Create: `src/main/protocol.ts`
- Create: `src/main/menu.ts`
- Modify: `src/main/index.ts` (replace the Task 7 minimal version)

**Interfaces:**
- Consumes: `FileService` (Task 8), `registerIpc`/`IpcDeps` (Task 9), `isTrustedUrl` (Task 9), `IPC` (Task 6).
- Produces: `createWindow(): BrowserWindow`, `registerSchemes(): void`, `handleAppProtocol(): void`, `buildMenu(win: BrowserWindow): Menu`; the wired app entry.

- [ ] **Step 1: Write `window.ts`**

```ts
// src/main/window.ts
import { BrowserWindow } from "electron";
import { join } from "node:path";

/** The one hardened window. webPreferences are pinned explicitly (design §3). */
export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
    },
  });
  win.once("ready-to-show", () => win.show());

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadURL("app://coal/index.html");
  }
  return win;
}
```

- [ ] **Step 2: Write `protocol.ts`**

```ts
// src/main/protocol.ts
import { net, protocol } from "electron";
import { join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

const RENDERER_DIR = join(import.meta.dirname, "../renderer");
const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:";

/** Register app:// as a privileged scheme. Must run before app is ready (design §3). */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** Serve the built renderer from app:// with a strict CSP header. */
export function handleAppProtocol(): void {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = normalize(join(RENDERER_DIR, rel));
    if (!filePath.startsWith(RENDERER_DIR)) {
      return new Response("forbidden", { status: 403 });
    }
    const res = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(res.headers);
    headers.set("Content-Security-Policy", CSP);
    return new Response(res.body, { status: res.status, headers });
  });
}
```

- [ ] **Step 3: Write `menu.ts`**

```ts
// src/main/menu.ts
import { Menu } from "electron";
import type { BrowserWindow } from "electron";
import { IPC } from "../kernel/ipc/contract";

/**
 * Native menu whose items send menu-command into the renderer's executeCommand.
 * registerAccelerator:false so the key is handled once, by the renderer keymap —
 * never two sources of truth (design §6).
 */
export function buildMenu(win: BrowserWindow): Menu {
  const send =
    (commandId: string) =>
    (): void =>
      win.webContents.send(IPC.menuCommand, commandId);
  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "Open File…",
          accelerator: "CmdOrCtrl+O",
          registerAccelerator: false,
          click: send("core.file.open"),
        },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          registerAccelerator: false,
          click: send("core.file.save"),
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "CmdOrCtrl+Q",
          registerAccelerator: false,
          click: send("core.app.quit"),
        },
      ],
    },
  ]);
}
```

- [ ] **Step 4: Rewrite `src/main/index.ts`**

```ts
// src/main/index.ts
import { app, dialog, Menu, shell } from "electron";
import type { BrowserWindow, WebContents } from "electron";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { IPC } from "../kernel/ipc/contract";
import { FileService } from "./fileService";
import { isTrustedUrl } from "./guards";
import { registerIpc } from "./ipc";
import { buildMenu } from "./menu";
import { handleAppProtocol, registerSchemes } from "./protocol";
import { createWindow } from "./window";

const devUrl = process.env["ELECTRON_RENDERER_URL"];

app.setName("coal");
app.enableSandbox();
registerSchemes();

// Keep dev/e2e off the release single-instance lock and profile (design §9).
if (devUrl) app.setPath("userData", join(app.getPath("appData"), "coal-dev"));

/** The first existing file path in an argv list, if any (design §2, §9). */
function firstFileArg(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (arg.startsWith("-")) continue;
    try {
      if (existsSync(arg) && statSync(arg).isFile()) return arg;
    } catch {
      // ignore unreadable args
    }
  }
  return null;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;
  let dirty = false;
  let forceQuit = false;
  const fileService = new FileService();
  const allowedOrigins = devUrl ? [devUrl] : ["app://coal/"];

  const openInWindow = async (win: BrowserWindow, path: string): Promise<void> => {
    const res = await fileService.openPath(path);
    if (!res.canceled && !("binary" in res)) win.webContents.send(IPC.docOpened, res.doc);
  };

  // Zero ambient authority for any web contents (design §3).
  app.on("web-contents-created", (_event, contents: WebContents) => {
    contents.on("will-navigate", (event, url) => {
      if (!isTrustedUrl(url, allowedOrigins)) event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("https://")) void shell.openExternal(url);
      return { action: "deny" };
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });

  app.on("second-instance", (_event, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const path = firstFileArg(argv);
    if (path) void openInWindow(mainWindow, path);
  });

  app.whenReady().then(() => {
    if (!devUrl) handleAppProtocol();
    const win = createWindow();
    mainWindow = win;
    Menu.setApplicationMenu(buildMenu(win));

    registerIpc({
      fileService,
      getWindow: () => mainWindow,
      isTrustedSender: (event) => isTrustedUrl(event.senderFrame?.url, allowedOrigins),
      onSetDirty: (value) => {
        dirty = value;
      },
      onQuit: () => mainWindow?.close(),
    });

    const launchPath = firstFileArg(process.argv);
    if (launchPath) {
      win.webContents.once("did-finish-load", () => void openInWindow(win, launchPath));
    }

    win.on("close", (event) => {
      if (forceQuit || !dirty) return;
      event.preventDefault();
      const choice = dialog.showMessageBoxSync(win, {
        type: "warning",
        buttons: ["Save", "Don't Save", "Cancel"],
        defaultId: 0,
        cancelId: 2,
        message: "You have unsaved changes.",
      });
      if (choice === 1) {
        forceQuit = true;
        win.close();
      } else if (choice === 0) {
        win.webContents.send(IPC.menuCommand, "core.file.save");
      }
    });

    win.on("closed", () => {
      mainWindow = null;
    });
  });

  app.on("window-all-closed", () => app.quit());
}
```
Note: the "Save" branch of the close-guard triggers a save; the user then quits again (dirty clears on save success). A one-shot save-then-close is a later refinement, not PR #1.

- [ ] **Step 5: Verify build + typecheck**

Run: `npm run typecheck && npx electron-vite build`
Expected: PASS + build succeeds.

- [ ] **Step 6: Verify the shell (manual/verify)**

Run: `npm run dev`
Expected: window opens; the File menu shows Open/Save/Quit; no CSP or sandbox errors in the console. Use `/verify`. (Full open→save→quit is exercised in Task 13.)

- [ ] **Step 7: Commit**

```bash
npm run format
git add src/main/window.ts src/main/protocol.ts src/main/menu.ts src/main/index.ts
git commit -m "feat(kernel): harden window, add app:// protocol, menu, and quit guard"
```

---
### Task 11: Renderer editor (CM6 mount, façade, keymap-from-registry)

Mount CodeMirror 6, expose the `EditorFacade` commands use, generate the app keymap **from** the keybinding registry (design §6), and track dirty state. Browser-tier tested.

**Files:**
- Create: `src/renderer/coal.d.ts`
- Create: `src/renderer/editor.ts`
- Test: `src/renderer/editor.browser.test.ts`

**Interfaces:**
- Consumes: `EditorFacade`, `Keybinding` (Task 2), `CoalApi` (Task 6), CodeMirror 6 packages.
- Produces:
  - `window.coal: CoalApi` global typing.
  - `createEditor(parent: HTMLElement, onDirtyChange: (dirty: boolean) => void): EditorHandle`
  - `interface EditorHandle { facade: EditorFacade; view: EditorView; setBindings(bindings: Keybinding[], dispatch: (commandId: string) => boolean): void; destroy(): void }` (dispatch returns whether it consumed the key, so an unbound/disabled key falls through — design §6)

- [ ] **Step 1: Write the window typing**

```ts
// src/renderer/coal.d.ts
import type { CoalApi } from "../kernel/ipc/contract";

declare global {
  interface Window {
    coal: CoalApi;
  }
}

export {};
```

- [ ] **Step 2: Write the failing browser test**

```ts
// src/renderer/editor.browser.test.ts
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "@vitest/browser/context";
import { createEditor } from "./editor";

describe("createEditor (design §6 keymap generated from the registry)", () => {
  test("façade get/set text and clean/dirty lifecycle", () => {
    const onDirty = vi.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = createEditor(host, onDirty);

    editor.facade.setText("hello");
    expect(editor.facade.getText()).toBe("hello");
    expect(editor.facade.isDirty()).toBe(false);

    editor.view.dispatch({ changes: { from: 5, insert: "!" } });
    expect(editor.facade.getText()).toBe("hello!");
    expect(editor.facade.isDirty()).toBe(true);
    expect(onDirty).toHaveBeenLastCalledWith(true);

    editor.facade.markClean();
    expect(editor.facade.isDirty()).toBe(false);
    expect(onDirty).toHaveBeenLastCalledWith(false);

    editor.destroy();
    host.remove();
  });

  test("a registered binding dispatches its command id on keypress", async () => {
    const dispatch = vi.fn(() => true);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = createEditor(host, () => {});
    editor.setBindings([{ keys: "Ctrl-s", command: "core.file.save" }], dispatch);
    editor.view.focus();

    await userEvent.keyboard("{Control>}s{/Control}");
    expect(dispatch).toHaveBeenCalledWith("core.file.save");

    editor.destroy();
    host.remove();
  });
});
```
Note: `userEvent` import path is `@vitest/browser/context`; confirm against the installed `@vitest/browser` version.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run --project=browser src/renderer/editor.browser.test.ts`
Expected: FAIL — `Cannot find module "./editor"`.

- [ ] **Step 4: Write the editor**

```ts
// src/renderer/editor.ts
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import type { EditorFacade, Keybinding } from "../kernel/command/types";

export interface EditorHandle {
  facade: EditorFacade;
  view: EditorView;
  setBindings(bindings: Keybinding[], dispatch: (commandId: string) => boolean): void;
  destroy(): void;
}

export function createEditor(
  parent: HTMLElement,
  onDirtyChange: (dirty: boolean) => void,
): EditorHandle {
  const keymapCompartment = new Compartment();
  let dirty = false;
  let programmatic = false;

  const setDirty = (value: boolean): void => {
    if (dirty === value) return;
    dirty = value;
    onDirtyChange(value);
  };

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: "",
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        keymapCompartment.of([]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !programmatic) setDirty(true);
        }),
      ],
    }),
  });

  const facade: EditorFacade = {
    getText: () => view.state.doc.toString(),
    setText: (text: string) => {
      programmatic = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      programmatic = false;
      setDirty(false);
    },
    isDirty: () => dirty,
    markClean: () => setDirty(false),
    focus: () => view.focus(),
  };

  return {
    facade,
    view,
    setBindings: (bindings, dispatch) => {
      const appKeymap = Prec.high(
        keymap.of(
          bindings.map((binding) => ({
            key: binding.keys,
            preventDefault: true,
            // Consume the key only if dispatch ran a command; otherwise fall through.
            run: () => dispatch(binding.command),
          })),
        ),
      );
      view.dispatch({ effects: keymapCompartment.reconfigure(appKeymap) });
    },
    destroy: () => view.destroy(),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --project=browser src/renderer/editor.browser.test.ts`
Expected: PASS (2 tests). (First run downloads the Playwright Chromium if needed: `npx playwright install chromium`.)

- [ ] **Step 6: Commit**

```bash
npm run format
git add src/renderer/coal.d.ts src/renderer/editor.ts src/renderer/editor.browser.test.ts
git commit -m "feat(kernel): mount CodeMirror 6 with a registry-driven keymap"
```

---

### Task 12: Renderer composition root

Wire it together: instantiate the registries, register `core.file.open`/`save`/`quit` through the public API, bind keys, route the native menu, and mount the editor (design §6). Verified end-to-end in Task 13.

**Files:**
- Modify: `src/renderer/index.html` (already points to `./main.ts` — no change needed if Task 7 used that; otherwise ensure the script tag is `./main.ts`)
- Modify: `src/renderer/main.ts` (replace the Task 7 stub)

**Interfaces:**
- Consumes: `CommandRegistry` (Task 2), `KeybindingRegistry` (Task 3), `DisposableStore` (Task 1), `CommandContext`/`Command` (Task 2), `createEditor` (Task 11), `window.coal` (Task 9/11).
- Produces: the running renderer entry (no exports).

- [ ] **Step 1: Write the composition root**

```ts
// src/renderer/main.ts
import { CommandRegistry } from "../kernel/command/commandRegistry";
import { KeybindingRegistry } from "../kernel/command/keybindingRegistry";
import { DisposableStore } from "../kernel/command/disposable";
import type { CommandContext } from "../kernel/command/types";
import { createEditor } from "./editor";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

let currentDocId: string | null = null;

// The bootstrap groups its registrations in a DisposableStore — the auto-disposal
// ledger dogfood (design §6). PR #1's renderer never tears down, so it is not disposed.
const store = new DisposableStore();
const commands = new CommandRegistry();
const keys = new KeybindingRegistry();
const editor = createEditor(root, (isDirty) => window.coal.doc.setDirty(isDirty));
const ctx: CommandContext = { editor: editor.facade };

store.add(
  commands.registerCommand({
    id: "core.file.open",
    title: "Open File…",
    run: async () => {
      const result = await window.coal.file.open();
      if (result.canceled) return;
      if ("binary" in result) return; // skeleton: no binary presenter yet
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
  commands.registerCommand({
    id: "core.app.quit",
    title: "Quit",
    run: () => window.coal.app.quit(),
  }),
);

store.add(keys.registerKeybinding({ keys: "Ctrl-o", command: "core.file.open" }));
store.add(keys.registerKeybinding({ keys: "Ctrl-s", command: "core.file.save" }));
store.add(keys.registerKeybinding({ keys: "Ctrl-q", command: "core.app.quit" }));

/** Run a command if it exists and is enabled; report whether it consumed the key. */
const dispatch = (commandId: string): boolean => {
  const command = commands.getCommand(commandId);
  if (!command) return false;
  if (command.isEnabled && !command.isEnabled(ctx)) return false;
  void commands.executeCommand(commandId, ctx).catch((err) => console.error(err));
  return true;
};

// In-editor keys: the CM6 keymap is generated from the registry.
editor.setBindings(keys.getBindings(), dispatch);

// App-global keys, so open/save/quit still fire when focus is outside the editor
// (design §6). CM6 calls preventDefault when it handles a key, so skip those.
window.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.isComposing) return;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  if (event.key.length === 1) parts.push(event.key.toLowerCase());
  for (const binding of keys.getBindingsForKeys(parts.join("-"))) {
    if (dispatch(binding.command)) {
      event.preventDefault();
      break;
    }
  }
});

// Files opened from the CLI / a second instance are pushed from main.
window.coal.onDocOpened((doc) => {
  editor.facade.setText(doc.text);
  currentDocId = doc.id;
});

window.coal.onMenuCommand(dispatch);
editor.facade.focus();
```

- [ ] **Step 2: Verify build + typecheck**

Run: `npm run typecheck && npx electron-vite build`
Expected: PASS + build succeeds.

- [ ] **Step 3: Verify the full loop (manual/verify)**

Run: `npm run dev`
Expected: `Ctrl-o` (or File → Open) opens a file; its text appears; typing marks it dirty; `Ctrl-s` (or File → Save) writes it; `Ctrl-q` quits (prompting if dirty). Use `/verify` on a scratch `.md` file. Confirm the saved file is byte-identical when saved without edits.

- [ ] **Step 4: Commit**

```bash
npm run format
git add src/renderer/main.ts src/renderer/index.html
git commit -m "feat(kernel): wire the renderer composition root over the registry"
```

---

### Task 13: End-to-end Electron smoke

One Playwright `_electron` smoke that drives the real app: open a fixture, edit it, save, and assert the file's bytes changed as expected, then quit (design §8). This is the walking skeleton's proof.

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/skeleton.spec.ts`

**Interfaces:**
- Consumes: the built app (`out/main/index.js`), `@playwright/test`.
- Produces: `npm run test:e2e`.

- [ ] **Step 1: Write the Playwright config**

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
});
```

- [ ] **Step 2: Write the smoke test**

```ts
// e2e/skeleton.spec.ts
import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("open -> edit -> save writes byte-exact changes -> quit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "coal-e2e-"));
  const fixture = join(dir, "note.md");
  await writeFile(fixture, "hello\n", "utf-8");

  const args = ["out/main/index.js"];
  if (process.env["CI"]) args.push("--no-sandbox");
  const app = await electron.launch({ args });

  // Playwright can't drive native GTK dialogs, so stub the open dialog in main.
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    // Never block on the unsaved-changes modal if a race leaves the doc dirty at close.
    dialog.showMessageBoxSync = () => 1; // "Don't Save"
  }, fixture);

  const window = await app.firstWindow();
  await window.locator(".cm-content").waitFor();
  await window.locator(".cm-content").click();

  await window.keyboard.press("Control+O");
  await expect(window.locator(".cm-content")).toContainText("hello");

  await window.keyboard.press("End");
  await window.keyboard.type(" world");
  await window.keyboard.press("Control+S");

  await expect.poll(async () => readFile(fixture, "utf-8")).toBe("hello world\n");

  await app.close();
  await rm(dir, { recursive: true, force: true });
});
```

- [ ] **Step 3: Build, then run the smoke locally**

Run:
```bash
npm run build
npm run test:e2e
```
Expected: the test passes (a window opens, the fixture loads, the edit saves byte-exactly, the app closes). If the app fails to launch locally, ensure `npx playwright install chromium` has run and see "Risks".

- [ ] **Step 4: Commit**

```bash
npm run format
git add playwright.config.ts e2e/skeleton.spec.ts
git commit -m "test(kernel): add electron e2e smoke for byte-exact open/save"
```

---

### Task 14: CI — browser + e2e job

Add a CI job that builds the app, runs the browser-tier tests, and runs the electron smoke under `xvfb`. Actions stay SHA-pinned (repo policy).

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run build`, `npm run test:browser`, `npm run test:e2e`.
- Produces: a second CI job `browser + electron e2e`.

- [ ] **Step 1: Add the `e2e` job**

Append this job under `jobs:` in `.github/workflows/ci.yml` (reuse the exact SHA pins the `build` job uses for `actions/checkout` and `actions/setup-node`):

```yaml
  e2e:
    name: browser + electron e2e
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7

      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: "22"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright Chromium + OS deps
        run: npx playwright install --with-deps chromium

      - name: Build
        run: npm run build

      - name: Browser tests
        run: npm run test:browser

      - name: Electron e2e (xvfb)
        run: xvfb-run -a npm run test:e2e
```

- [ ] **Step 2: Also let the workflow trigger on the new paths**

In `.github/workflows/ci.yml`, add `e2e/**`, `playwright.config.ts`, and `electron.vite.config.ts` to the `on.push.paths` list (the `pull_request` trigger already has no path filter, so PRs always run both jobs).

- [ ] **Step 3: Verify locally what CI will run**

Run:
```bash
npm run build && npm run test:browser && npm run test:e2e
```
Expected: all pass. (The `xvfb-run` wrapper is CI-only; locally you have a display.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(kernel): add browser + electron e2e job under xvfb"
```

---

## Risks & version-sensitive spots

These are the places where live-tool behavior may differ from the plan; verify against the installed versions (use context7 for library docs) and adjust:

1. **`npm audit --audit-level=high` (existing CI gate).** Adding Electron + Vite + Playwright pulls a large tree. If a **high/critical** advisory appears, evaluate it: a build/dev-only advisory may be acceptable to allowlist, otherwise bump the offending dep. Do not weaken the audit gate silently (design + defense-in-depth policy).
2. **Preload output name.** Task 7 pins the preload to `out/preload/index.cjs`; confirm `electron-vite build` actually emits that name and that Task 10's `preload:` path matches. A sandboxed preload must be CJS.
3. **Vitest 4.1 `test.projects`.** Confirm the projects shape against the installed Vitest; substitute the documented equivalent if the API differs.
4. **Electron under CI/xvfb.** If the smoke fails to launch in CI, `--with-deps` may miss an Electron-only lib (e.g. `libgbm1`, `libasound2`); add the apt install. `--no-sandbox` is applied only under `CI` (SUID chrome-sandbox is unavailable on hosted runners); production keeps `sandbox: true`.
5. **CM6 key events in the browser test.** If `userEvent.keyboard` doesn't reach the CM keymap, focus `.cm-content` first or dispatch a real `KeyboardEvent`; the assertion (a binding dispatches its command id) is what must hold.
6. **`app://` + `net.fetch` serving.** Verify the protocol handler against the Electron 43 `protocol.handle` API; the fallback is `win.loadFile` (file://), accepted only if app:// proves troublesome (design §3 prefers app://).
7. **Single-instance lock in dev.** Task 10 sets a `coal-dev` `userData` dir when `ELECTRON_RENDERER_URL` is set, so dev/e2e don't collide with a release instance's lock (design §9). `app.getPath("appData")` resolves before `whenReady`, so this is safe to call at module top.
8. **CLI argv parsing.** `firstFileArg` picks the first existing non-flag path from `argv.slice(1)`; Electron's argv layout differs between dev (`electron . file.md`) and a packaged binary (`coal file.md`). Verify the picked index is correct in both and adjust the slice offset if a launch path is missed.
9. **Directory-fsync durability.** `write-file-atomic` fsyncs the temp file and renames, but may not fsync the containing directory (the design §7 durability ask). Verify on the pinned version; if absent, add an explicit dir fsync after the write. Low-risk for PR #1 (crash-durability, not correctness).

## What this plan deliberately defers

Per the design doc §11 (out of scope for PR #1): the minibuffer; Emacs/Vim keymaps + the first-run prompt; the config tree/Settings; the plugin loader / capability broker / host-API proper; the syntax-highlighting engine; the workspace shell; the privileged seams; RPM/electron-builder packaging; `.md`/`.org` MIME association; `safeStorage` key scaffolding. PR #1 is a single-file editor, not a vault.

