# Coal — Kernel walking-skeleton (PR #1) — design

Date: 2026-07-22
Status: accepted (design session). First implementation design for the **kernel**. Turns the
[plugin/kernel pivot](2026-07-22-plugin-system-design.md) and [`SPEC.md`](../../../SPEC.md) §8/§14 from
design into code, starting with the thinnest end-to-end slice. Grounded in a current (July 2026)
substrate-research pass (Electron / CodeMirror 6 / TypeScript best practice); the load-bearing citations
are collected at the end.

## Problem

The kernel is designed (its *boundary* — [plugin-system design](2026-07-22-plugin-system-design.md) §1)
but not built. The repo today is pure TypeScript + Vitest with **no Electron and no CodeMirror**; only
`src/overlay/` exists (pure logic, the future linking-plugin seed). "Start writing the kernel" therefore
means standing up the entire Electron + CM6 native substrate for the first time — the single riskiest,
least-familiar piece — *and* the pure command/IO spine the kernel dogfoods.

The kernel is ~10 subsystems (editor engine, byte-exact IO, filetype/present-as-text, syntax-highlight
engine, command/minibuffer/input-mode substrate, both keymaps, workspace shell, config loader + Settings,
the extension substrate, the privileged seams — plugin-system design §1). `main` is locked to small,
scoped, squash-merged PRs (`CLAUDE.md`), so the kernel is delivered as a **sequence of PRs**, not one
drop. This doc settles the **build strategy**, the **first slice (PR #1)**, and PR #1's concrete
**implementation architecture**.

## 1. Build strategy — a walking skeleton, then thicken

**Decision: build the kernel as a walking skeleton first, then thicken each layer.** PR #1 is a real
Electron window that mounts CodeMirror 6, opens and saves **one file byte-for-byte**, with open/save/quit
routed through a real (if minimal) **command registry** — proving the whole stack end-to-end and
dogfooding the public command API from line one, rather than retrofitting a registry onto a
substrate-first prototype later.

Two alternatives were considered and rejected for PR #1:

- **Native substrate first** (Electron + CM6 + IO only, no registry): smallest first PR, but the
  editor's own commands wouldn't go through the registry until a later refactor — breaking the
  dogfood principle early and creating rework.
- **Extension spine first** (registry + host API + loader + broker as pure TS, no Electron): follows the
  design's "host API + broker come first" literally and is fully unit-testable, but designs the API with
  **no live consumer** to validate it, and defers all the risky native infra.

The walking skeleton captures the best of both: it de-risks the native substrate *and* validates the API
against real consumers immediately, at the cost of a slightly larger first PR.

### 1.1 The kernel build sequence (roadmap, indicative)

PR #1 is the first of a sequence. Later PRs thicken the skeleton; each is its own scoped change and its
order may shift as we learn. This roadmap is context, not a commitment:

1. **PR #1 — walking skeleton** (this doc): Electron + CM6 + byte-exact open/save/quit through a minimal
   command registry.
2. Command **minibuffer** (unified `M-x` / `:` / `/` surface) + `quickPick` primitive over the registry.
3. **Config loader** + the kernel-owned `.coal/config/` tree (`settings.toml`, TOML round-trip).
4. **Both keymaps** (Emacs + Vim) bound through the public keybinding API + the first-run keymap prompt.
5. **Extension substrate** — plugin loader + capability broker + the typed host API + manifest
   (`plugin.toml`) parsing + the auto-disposal ledger.
6. **Syntax-highlighting engine** (`@codemirror/language` infra) + the passive-provider grammar seam.
7. **Workspace shell** — file-tree sidebar, quick switcher, windows-as-split, per-window tabs (§14.1).
8. **Privileged seams** — `storage-codec`, `startup-gate`/`unlock`, `key-custody` + the `onBoot` phase.
9. **Settings UI** front-end over the schema-declared config.

The existing `src/overlay/` is **not** part of the kernel; it becomes the linking plugin's core once the
extension substrate (step 5) exists. We do not build kernel on top of it (plugin-system design §14).

## 2. PR #1 scope — the lean skeleton

**In scope (the done-line):**

- An Electron app launches a **single window** mounting a CodeMirror 6 editor that fills the frame.
- **Open** one file via the native GTK file dialog (also accept a path argument on launch); **edit**;
  **save** it back **byte-for-byte**; **quit** (guarding unsaved changes).
- `core.file.open` / `core.file.save` / `core.app.quit` are registered in a minimal **command registry**
  and fired by a few **hardcoded keys** (and native menu items), all through one `executeCommand` choke
  point.
- Byte-exact IO is a **pure, Vitest-tested** kernel module.
- **One** Playwright `_electron` smoke drives the real app end-to-end (open → edit → save → assert bytes
  identical → quit).

**Explicitly out of PR #1** (each a later PR, §1.1): the minibuffer; Emacs/Vim keymaps and the first-run
prompt; the config tree/Settings; the plugin loader / capability broker / host API proper; the
syntax-highlighting engine; filetype presenters; the workspace shell (file-tree, tabs, quick switcher,
splits); the privileged seams; RPM/electron-builder packaging; `.md`/`.org` MIME association; `safeStorage`
key scaffolding. PR #1 operates on a **single file**, not a vault.

## 3. Process & security model — where IO lives

Three processes: **main** (Node, privileged), **preload** (a tiny bridge), **renderer** (sandboxed UI +
editor).

- **Closed-by-default, pinned.** Every `BrowserWindow` sets `webPreferences` explicitly even though these
  are Electron defaults — so a refactor can't silently regress them: `contextIsolation: true`,
  `sandbox: true`, `nodeIntegration: false`, `nodeIntegrationInWorker: false`,
  `nodeIntegrationInSubFrames: false`, `webSecurity: true`, `allowRunningInsecureContent: false`,
  `webviewTag: false`, plus the bundled `preload`. Call `app.enableSandbox()` before `whenReady()`. Do
  **not** install `@electron/remote`.
- **All filesystem (and future crypto) live in main.** The renderer never imports `fs` and never holds a
  real path — it holds an **opaque doc `id`** plus decoded text. This is the exact boundary the future
  encryption `storage-codec` / `key-custody` seams reuse: the vault key stays main-only and never crosses
  IPC (plugin-system design §11; `SPEC.md` §10.3).
- **Preload = one bundled CJS file** doing only `contextBridge.exposeInMainWorld('coal', api)`, where
  `api` is a small, hand-written, fully-typed object of narrow methods — `coal.file.open()`,
  `coal.file.save({ id, text })`, `coal.app.quit()`, `coal.onMenuCommand(cb)` — each wrapping exactly one
  namespaced channel (`coal:file.open`, …). It never exposes `ipcRenderer` or a generic
  `invoke(channel, …)`. Two-way calls use `invoke` ↔ `handle`; main→renderer pushes use `ipcRenderer.on`
  wrapped as a callback. *(A CJS preload is required to keep `sandbox: true`; an ESM/`.mjs` preload would
  force sandbox off. Accepted: all real work is in main, so the preload stays trivial.)*
- **One shared IPC contract module** (`kernel/ipc`) declares each channel's `{ request, response }` types
  and is imported by both main and preload. Because TypeScript vanishes at runtime and the renderer is
  untrusted, main **runtime-validates every inbound payload** (hand-written guards; no dependency needed
  at this size) and **validates `event.senderFrame`** in every handler (the CVE-2024-54147 class).
- **Renderer origin & navigation.** Serve the renderer from a custom `app://` protocol via
  `protocol.handle()` in production (the Vite dev server in dev). Lock down navigation on
  `web-contents-created`: `will-navigate` → `preventDefault` foreign origins; `setWindowOpenHandler` →
  `deny` (external links go through an allowlisted `shell.openExternal`); deny `will-attach-webview`.
- **CSP:** `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'
  data:`. The `'unsafe-inline'` is **style-src only** — CM6 injects styles via `style-mod`; `script-src`
  stays strict. *(Accepted for PR #1; a nonced/adopted-stylesheet approach is a later hardening, not a
  blocker.)*

## 4. Build & dev tooling

- **electron-vite (alex8088)** owns the main/preload/renderer build, HMR, and first-class ESM;
  **electron-builder** owns packaging in a *later* PR. Electron Forge's Vite plugin is rejected (its
  ESM-main support is still experimental/broken in 2026 — hard-codes CJS, top-level await fails); raw
  Vite + electron-builder is rejected (hand-rolls the orchestration electron-vite provides).
- `package.json` gains `"type": "module"`; Electron `main` → `out/main/index.js`; one
  `electron.vite.config.ts` with `{ main, preload, renderer }` targets (CM6 in the renderer target). tsc
  (`--noEmit`, typecheck-only), Vitest, and Prettier drop in unchanged, orthogonal to the bundler.
- Dev: `electron-vite dev` (branch on `app.isPackaged` — dev server URL vs `app://`/`loadFile`).
- **Mandatory Vite dedup** (nothing boots without it — a known electron-vite pre-bundler trigger):
  `resolve.dedupe: ['@codemirror/state', '@codemirror/view', '@lezer/common', 'style-mod']`, add the CM
  packages to `optimizeDeps.include`, and clear `node_modules/.vite` on the "multiple instances of
  @codemirror/state" crash.
- **Version pins (July 2026):** Electron 43.x; electron-vite 5.x; Vite 5+; `@codemirror/state@6.7.1`,
  `@codemirror/view@6.43.6`, `@codemirror/commands@6.10.4`. (electron-builder 26.x is pinned when the
  packaging PR lands.)

## 5. Module & repo layout

```
src/
  kernel/          # pure, framework-free, Node-unit-tested — the dogfooded core
    command/       # command registry + keybinding registry + DisposableStore
    io/            # byte-exact codec: decode(bytes)->DocModel, encode(model)->bytes
    ipc/           # shared IPC contract types (channel -> {request, response})
  main/            # Electron main: app lifecycle, window, app:// protocol,
                   #   fs/dialog adapters, IPC handlers (call kernel/io)
  preload/         # single bundled preload -> contextBridge 'coal'
  renderer/        # CM6 mount, editor facade, keymap-from-registry, bootstrap
  overlay/         # UNTOUCHED — future linking-plugin seed (not more kernel)
```

`kernel/` imports **no** Electron or DOM APIs, so ~80–90% of the logic is Node-unit-testable in
isolation; `main/` and `renderer/` are thin adapters over it (a hexagonal / ports-and-adapters split).
`overlay/` is untouched.

## 6. Command registry + host-API seam (the dogfood spine)

The **command registry** and **keybinding registry** are pure `kernel/command` modules, instantiated **in
the renderer** (where the editor and user input live). Command handlers reach main-only powers through the
`coal` bridge.

- `registerCommand({ id, title, category?, run(ctx), isEnabled?(ctx) }): Disposable` — stores `id →
  command`, **throws on duplicate id**, returns a `Disposable` that removes the entry. A `DisposableStore`
  groups a registrant's disposables so the kernel bootstrap (and, later, a plugin on deactivate/HMR)
  tears them all down at once — the seed of the auto-disposal ledger (plugin-system design §10).
- `registerKeybinding({ keys, command, when? }): Disposable` — a **separate** registry; bindings
  reference a command by **string id only**, resolved lazily. A binding whose command is missing/disabled
  is **inert and falls through**. (The `when` string is stored now but not yet evaluated — the enablement
  expression language is deferred without an API break.)
- **Single choke point `executeCommand(id, ...args)`** — hardcoded keys, the native menu, and later the
  minibuffer all route through it (also the future capability/audit enforcement point). The kernel
  bootstrap registers `core.file.open` / `core.file.save` / `core.app.quit` through this **exact public
  API** — no privileged back door (the dogfood proof). Command IDs are stable API (`namespace.verb-noun`;
  `core.` reserved for the kernel); titles are mutable UI.
- **The CM6 keymap is generated *from* the keybinding registry** (wrapped in `Prec.high` + its own
  Compartment), never hardcoded in the editor config. App-global keys (open/save/quit) also need a
  **window-level `keydown` handler** so they fire when focus is outside the editor. Native application
  **Menu** items IPC a `menu-command` into the same `executeCommand` — menu and keys are two front-ends
  over one implementation (set `registerAccelerator: false` or drive accelerators from the registry —
  never two sources of truth). Resolve keys by `KeyboardEvent.code`/layout, not `.key`; skip dispatch
  while `event.isComposing` (IME/dead keys); do **not** use Electron `globalShortcut` (OS-global,
  unreliable on Wayland).
- **Editor façade.** CM6 is the uncontrolled source of truth; commands see it only through a thin façade
  `{ getText, setText, isDirty, focus }`. Every swappable concern (theme, keymap, later language) gets its
  own **Compartment** so future plugins reconfigure without a rebuild. Dirty tracking via
  `EditorView.updateListener`.
- **CM core setup.** Hand-roll a `coreSetup: Extension[]` from scoped packages
  (`@codemirror/state`, `view`, `commands`); do **not** ship the umbrella `codemirror`/`basicSetup`
  (its ~18 extensions are plugin surface, not kernel). `EditorState.create` → `new EditorView({ state,
  parent })`; call `view.destroy()` on teardown.

## 7. Byte-exact IO — a tested invariant, in main

Each open document is modeled as
`{ pristineBuffer, encoding, hasBOM, eol, mixedEol, finalNewline }`. Byte-exactness is an explicit,
**tested invariant**, computed in the **main process** on raw `Uint8Array`. Both codecs live in main —
the (future) storage-codec, then the text codec — so the renderer only ever sees decoded text.

- **Detector** (~40-line VS Code `encoding.ts`-style port): read the first ~512 bytes; check BOM
  (`EF BB BF` UTF-8, `FF FE` UTF-16LE, `FE FF` UTF-16BE); with no BOM, use the null-byte-position
  heuristic (a 0-byte at an odd index → UTF-16LE, even → BE, neither → treat as UTF-8 / binary). Decode
  with `new TextDecoder(label, { fatal: true })` so invalid sequences **throw** (detect lossiness) rather
  than silently producing `U+FFFD`. **Kernel scope = UTF-8 (±BOM) + UTF-16 LE/BE (±BOM), with LF or CRLF
  line endings**; statistical / legacy 8-bit detection (and any `iconv-lite`/`chardet` dependency) is
  deferred to a later plugin.
- **EOL as metadata.** CM6 normalizes `\n`/`\r\n`/`\r` to `\n` internally, so the buffer never
  round-trips CRLF on its own. Detect the dominant EOL and `finalNewline` on open; on a **dirty** save,
  re-apply them (`\n` → `\r\n` for CRLF files) and re-encode. Do **not** set `EditorState.lineSeparator`
  to CRLF (it corrupts mixed files).
- **Pristine-buffer escape hatch.** If the doc is **not dirty**, save writes the original `pristineBuffer`
  back verbatim — a guaranteed byte-for-byte no-op. Only the dirty path exercises encode.
- **Mixed-EOL policy.** A file with mixed line endings **cannot** be byte-exact after an edit. Coal
  **surfaces `mixedEol`** (and, later, offers explicit normalization) — it never silently flattens.
- **Atomic, durable save.** Write a temp file in the target's own (realpath-resolved) directory → fsync
  the temp fd → rename over the target → fsync the containing directory → restore the original file's
  mode; follow symlinks (write through to the link target). (`write-file-atomic` covers most of this;
  verify it fsyncs the directory, else do it explicitly.)

### 7.1 Round-trip test strategy (Tier 1)

Three layers, all asserting on bytes (SHA-256 / `Buffer.equals`), never string equality:

1. **Golden corpus** — a binary fixture matrix `encoding{utf8, utf8-bom, utf16le, utf16be} × EOL{lf, crlf,
   mixed} × finalNewline{yes, no} × content{empty, ascii, multibyte, emoji}`; assert both `read → no-op
   save → write` and `read → decode → re-encode(meta)` reproduce the original bytes.
2. **Property-based (fast-check)** — random buffers land in exactly one of {byte-exact, classified
   binary/refused, lossless}; random `(text, meta)` pairs serialize → read back → recover the text and all
   metadata.
3. **Adversarial singletons** — 0-byte, 1-byte, BOM-only, lone `\r`, `\r` at EOF, truncated multibyte,
   unpaired surrogate, BOM-less UTF-16 ASCII, and "pure-ASCII must stay UTF-8"; plus save-path checks
   (temp cleanup on failure, mode/symlink preserved).

## 8. Testing & verification (TDD layering)

- **Tier 1 — Vitest `node` project (the TDD default, the bulk):** the byte-exact codec and the
  command/keybinding registries, pure and fs-free — matching today's `src/overlay/` pattern.
- **Tier 2 — Vitest `browser` project (`provider: 'playwright'`, real Chromium):** CM6 keymap/state and
  the editor façade — assert on `EditorState` transactions and real `EditorView` mounts; **never** jsdom /
  happy-dom (no contenteditable/selection/layout).
- **Tier 3 — Playwright `_electron.launch` (one smoke in PR #1):** open a fixture → edit via
  `keyboard.press` (through the CM6 keymap) → save → **read the file back with Node `fs` and assert bytes
  identical** → quit. **Stub the native dialogs in main via `electronApp.evaluate()`** (Playwright can't
  see GTK dialogs and will hang otherwise). Run under `xvfb-run --auto-servernum` in CI. Keep the
  `EnableNodeCliInspectArguments` fuse **on in test builds** (else `_electron.launch` times out).
- `vitest.config.ts` uses `projects` (node + browser); electron-vite's config is not `mergeConfig`'d into
  it. Green-before-push mirrors CI (`CLAUDE.md`); the `/verify` and `/run` skills drive the real app.

## 9. Native integration (minimal for PR #1)

Electron 43.x / Chromium 150 makes **native Wayland the default** (since Electron 38.2 / Chromium 140),
so PR #1 needs almost no Wayland configuration — crisp fractional scaling comes for free under a Wayland
session. Do **not** set the deprecated `ELECTRON_OZONE_PLATFORM_HINT` or bake
`--ozone-platform=wayland` into launch. In scope for PR #1:

- `dialog.showOpenDialog` / `showSaveDialog` route through `GtkFileChooserNative` → the XDG portal →
  GNOME's native picker automatically — no extra work.
- `app.requestSingleInstanceLock()` + a `second-instance` handler (focus the window, open a file from
  argv). Give **dev and release distinct app names / userData dirs** (the lock is keyed on userData).
- `app.setName('coal')` before `ready`. *(The formal reverse-DNS app-id, `.desktop` entry, icons, MIME
  association, and `StartupWMClass` land with the packaging PR.)*

## 10. Decisions folded in (defaults chosen; reversible)

- **CJS preload + `sandbox: true`** (not ESM preload) — all real work is in main.
- **CSP** allows inline **styles** (CM6/`style-mod`), keeps **`script-src` strict**.
- **Mixed-EOL** is surfaced, never silently flattened.
- **Electron 43.x** pin; native Wayland by default (no Ozone flags baked in).
- **Deferred to later PRs:** RPM/electron-builder packaging; `.md`/`.org` MIME wiring; `safeStorage` key
  scaffolding; the formal reverse-DNS app-id.
- **One Tier-3 Electron smoke** ships in PR #1 (front-loading the harness), per the design session.

## 11. Deferred / out of scope

Everything in §1.1 steps 2–9 (minibuffer, config tree, keymaps, extension substrate, syntax highlighting,
workspace shell, privileged seams, Settings UI); packaging and MIME (§9/§10); the `src/overlay/` →
linking-plugin migration (waits on the extension substrate). PR #1 is a single-file editor, not a vault.

## Decision summary

1. Build the kernel as a **walking skeleton first, then thicken** — PR #1 proves the whole stack
   end-to-end and dogfoods the command API from line one.
2. **PR #1 = lean skeleton:** Electron window + CM6 + byte-exact open/save/quit through a minimal command
   registry, fired by hardcoded keys + native menu; single file, no vault.
3. **Stack:** Electron 43.x + electron-vite (dev/build) + CodeMirror 6 (scoped packages, no `basicSetup`)
   + TypeScript, over today's Vitest/tsc/Prettier.
4. **Security:** three processes; hardened+pinned `webPreferences`; `sandbox: true` + CJS preload; all
   FS/crypto in main; opaque doc ids; typed IPC with runtime validation + `senderFrame` checks; this is
   the boundary future encryption reuses.
5. **Layout:** pure `kernel/` (command, io, ipc) + thin `main/`, `preload/`, `renderer/` adapters;
   `overlay/` untouched.
6. **Command spine:** `registerCommand`→`Disposable`, separate keybinding registry, one `executeCommand`
   choke point; the CM6 keymap is generated from the registry; the kernel registers its own open/save/quit
   through the public API.
7. **Byte-exact IO:** a tested invariant in main (encoding/BOM/EOL/final-newline model, pristine-buffer
   no-op, atomic durable save); three-layer round-trip tests (golden corpus, property-based, adversarial).
8. **Testing:** Vitest node (bulk, TDD) + Vitest browser (CM6) + one Playwright `_electron` smoke.
9. **Native:** native Wayland by default; native GTK dialogs; single-instance lock; packaging/MIME
   deferred.

## Load-bearing citations

- Electron security / sandbox / IPC / ESM: <https://www.electronjs.org/docs/latest/tutorial/security>,
  `/sandbox`, `/ipc`, `/esm`; CVE-2024-54147 <https://nvd.nist.gov/vuln/detail/CVE-2024-54147>
- electron-vite: <https://electron-vite.org/guide/> and `/guide/troubleshooting`
- electron-builder (Linux/RPM, later PR): <https://www.electron.build/linux.html>; Forge ESM-main issue
  <https://github.com/electron/forge/issues/3439>
- CodeMirror 6: <https://codemirror.net/docs/guide/>, `/examples/config/`; multiple-instances crash
  <https://discuss.codemirror.net/t/error-multiple-instances-of-codemirror-state/5174>; CRLF handling
  <https://discuss.codemirror.net/t/does-codemirror-normalize-crlf-endings/3449>
- Byte-exact IO: VS Code `encoding.ts`
  <https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/textfile/common/encoding.ts>;
  `write-file-atomic` <https://github.com/npm/write-file-atomic>
- Wayland: <https://www.electronjs.org/blog/tech-talk-wayland>; Chromium 140 auto-detection
  <https://www.omgubuntu.co.uk/2025/08/chrome-140-wayland-auto-detection-linux>
- Testing: Playwright Electron <https://playwright.dev/docs/api/class-electron>; Vitest projects
  <https://vitest.dev/guide/projects>; electron-playwright-helpers
  <https://github.com/spaceagetv/electron-playwright-helpers>
- Command/keybinding priors: VS Code command guide
  <https://code.visualstudio.com/api/extension-guides/command>; Theia
  <https://theia-ide.org/docs/commands_keybindings/>
