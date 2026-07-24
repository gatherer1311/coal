# Kernel — the walking skeleton

The irreducible **kernel**: a real, keyboard-first editor that opens, edits, and saves a
single file **byte-for-byte**, driven from the keyboard, usable with zero plugins. It is the
first slice of the minimal-core architecture (`SPEC.md` §8), and it **dogfoods its own public
command API** — the editor's own open/save/quit are registered through the same registry a
plugin would use, never a private back door.

Grounded in [`../superpowers/specs/2026-07-22-kernel-walking-skeleton-design.md`](../superpowers/specs/2026-07-22-kernel-walking-skeleton-design.md)
(design) and [`../superpowers/plans/2026-07-22-kernel-walking-skeleton.md`](../superpowers/plans/2026-07-22-kernel-walking-skeleton.md)
(the implementation plan). This page maps what exists today.

## Process model & trust boundary

Three processes, hexagonal (ports-and-adapters):

- **main** (Node, privileged) — owns **all filesystem** and, later, key custody. The renderer
  never imports `fs` and never holds a real path; it holds an opaque doc `id` + decoded text.
  This is the exact boundary the future encryption `storage-codec`/`key-custody` seams reuse
  (design §11).
- **preload** — one bundled **CJS** file that does only `contextBridge.exposeInMainWorld("coal", api)`,
  a small typed object of narrow methods. It never exposes `ipcRenderer` or a generic `invoke`.
- **renderer** (sandboxed) — CodeMirror 6 + the command spine + the composition root.

`src/kernel/` is **pure**: no Electron, Node, or DOM imports (the byte-exact codec uses only
`TextEncoder`/`TextDecoder`/`Uint8Array`). `main`/`preload`/`renderer` are thin adapters over it,
so ~80–90% of the logic is unit-tested in plain Node.

## Module map

### `src/kernel/` — pure, framework-free core

| File | What it provides |
|---|---|
| `command/disposable.ts` | `Disposable` + `DisposableStore` — the auto-disposal ledger (reverse-order, idempotent). |
| `command/types.ts` | `EditorFacade`, `CommandContext`, `Command`, `Keybinding`. |
| `command/commandRegistry.ts` | `CommandRegistry` — `registerCommand` → `Disposable` (throws on dup id); the single `executeCommand(id, ctx)` choke point (throws on unknown id, no-ops when `isEnabled` is false). |
| `command/keybindingRegistry.ts` | `KeybindingRegistry` — keys reference commands by string id; resolution/fall-through is the consumer's job. |
| `io/types.ts` | `Encoding`, `Eol`, `DocMeta`, `DecodeResult`. |
| `io/detect.ts` | `detectEncoding` (BOM + NUL-parity heuristic), `detectEol` (LF/CRLF; lone-CR → `mixedEol`), `hasFinalNewline`. |
| `io/codec.ts` | `decode(bytes)` → LF-normalized text + metadata; `encode(text, meta)` → bytes. For a non-mixed file, `encode(decode(b).text, decode(b).meta)` byte-equals `b`. |
| `ipc/contract.ts` | The `IPC` channel-name map + request/response types + the `CoalApi` interface exposed on `window.coal`. Shared by main + preload. |
| `command/keys.ts` · `command/context.ts` · `command/when.ts` | Canonical chord/sequence helpers; the `ContextRegistry` (boolean `when` contexts); the `when` expression parser + evaluator. Pure. |
| `command/keybindingRegistry.ts` · `command/composeKeymap.ts` · `command/keySequenceResolver.ts` · `command/defaultKeymap.ts` | The effective-keymap store (reverse lookup + candidate query), the default+user compose (precedence, unbind, conflict diagnostics), the pure prefix-key resolver, and the curated default keymap (data). |
| `config/schema.ts` · `config/validate.ts` · `config/types.ts` · `config/defaultTemplate.ts` | The global-scope kernel settings: schema + non-destructive `validate(raw)` → `{ settings, diagnostics }` + the default `settings.toml` template. Pure. (The `keymap` slot was removed with the keybinding pivot.) |
| `config/keybindings/*` | The keybindings.toml layer: `KeybindingEntry` (bind/unbind), structural `validateKeybindings`, and the default template. Pure. |

### `src/main/` — Electron main-process adapters

| File | What it provides |
|---|---|
| `fileService.ts` | Owns open files: decode on open (opaque `doc-N` id), encode + **atomic** save (`write-file-atomic` + directory fsync, symlink-through, mode-preserving), and a pristine-buffer no-op so an unedited save is byte-exact even for mixed-EOL files. |
| `tomlConfigCodec.ts` | Pure TOML round-trip over `@decimalturn/toml-patch`: `parse(text)` and comment-preserving `applyEdit(text, obj)`. The only place TOML text is handled. |
| `configService.ts` | Owns the global `settings.toml` (`app.getPath('userData')`): materialize on first run, comment-preserving `set`, `reload`, atomic write, and a change broadcast. |
| `keybindingsService.ts` · `keybindingsToml.ts` | Owns the global `keybindings.toml` (materialize, load, reload, atomic write, change broadcast); the append-only `[[keybinding]]` writer the bind/unbind flows use. |
| `guards.ts` | Pure IPC validators: `isSaveRequest`, `isConfigSetRequest`, `isTrustedUrl`. |
| `ipc.ts` | `registerIpc(deps)` — wires `ipcMain.handle`/`on` for every channel; **validates `senderFrame` and the payload before acting**. |
| `window.ts` | `createWindow` — hardened, explicitly-pinned `webPreferences`. |
| `protocol.ts` | Serves the built renderer from a custom `app://` scheme with a strict CSP header and path-containment. |
| `menu.ts` | Native menu whose items IPC a `menu-command` into the renderer's `executeCommand` (`registerAccelerator:false` — never two sources of truth). |
| `index.ts` | App lifecycle: single-instance lock, navigation lockdown, CLI/second-instance file open, and the unsaved-changes **Save-then-quit** guard. |

### `src/preload/` & `src/renderer/`

| File | What it provides |
|---|---|
| `preload/index.ts` | The `coal` bridge implementing `CoalApi`. |
| `renderer/coal.d.ts` | `window.coal: CoalApi` typing. |
| `renderer/config.ts` | `ConfigClient` — the reactive settings replica: `init` loads + subscribes, `onChange` notifies, `set`/`reload` proxy to main. |
| `renderer/editor.ts` | `createEditor` — mounts CM6, exposes the `EditorFacade`, and **generates the CM keymap from the keybinding registry** (a Compartment); tracks dirty. |
| `renderer/keyInput.ts` | `chordFromEvent` — KeyboardEvent → canonical chord (`.code` for letters/digits, `.key` for named keys; Shift explicit). |
| `renderer/keybindings.ts` | `KeybindingsClient` — the reactive keybindings.toml replica: `init` loads + subscribes, `onChange` notifies, `bind`/`unbind`/`reload` proxy to main. |
| `renderer/whichKey.ts` · `renderer/echoArea.ts` | The which-key continuation panel and the transient echo area (Describe-Key/Command + "not bound" messages). |
| `renderer/main.ts` | The composition root: registers the core commands, composes the default + user keymap, and runs the resolver-fed capture-phase input path (which-key + echo + contexts); menu + `onDocOpened` + `onSaveAndQuit`. |
| `renderer/index.html` | Root + the fill-the-frame style; CSP is applied by the `app://` handler, not a meta tag. |

## Key flows

- **Open.** `Ctrl-o` / menu / CLI arg → `core.file.open` → `coal.file.open()` → main shows the GTK
  dialog, `fileService.openPath` reads + decodes, returns `{ id, text, meta }`. The renderer sets
  the editor text and remembers `currentDocId`. A CLI/second-instance path is pushed via `docOpened`.
- **Byte-exact save.** `Ctrl-s` → `core.file.save` → `coal.file.save({ id, text })` → main. If the
  text is unchanged, the **pristine bytes** are written back verbatim; otherwise `encode(text, meta)`
  re-applies the recorded encoding/BOM/EOL. Both codecs (future storage-codec, then text) live in
  main; the renderer only ever sees decoded text.
- **Command dispatch.** One choke point: a capture-phase input path turns each app-level chord into a
  canonical sequence, feeds the `KeySequenceResolver` (which walks prefixes against the composed
  default+user keymap filtered by `when` contexts), and dispatches the resolved command id through
  `executeCommand`; the native menu dispatches ids directly. Ordinary typing falls through to CM6.
- **Quit guard.** On close with unsaved changes, main shows Save / Don't-Save / Cancel (Save is
  omitted when no file backs the buffer). "Save" asks the renderer to save then quit; a failed save
  leaves the window open.
- **Config.** On boot the renderer's `ConfigClient.init()` calls `coal.config.load()` → main reads
  `settings.toml` (materializing the curated default when absent) → `tomlConfigCodec.parse` →
  `kernel/config` `validate` → a `ConfigSnapshot` back to the renderer. `config.set({ keymap })` merges
  the change into the full parsed object and `applyEdit`s it (comments + foreign keys preserved), atomic-
  writes, and broadcasts `config:changed`; `core.config.reload` re-reads external hand-edits. Config is
  the **user/global** scope (`SPEC.md` §9); the per-vault tree arrives with the workspace/PKM slices.
- **Keybindings.** On boot `KeybindingsClient.init()` loads `keybindings.toml` (materialized when
  absent) and the renderer composes it over the curated default keymap into the registry; edits (hand
  or via `core.keys.bind`/`unbind`, which append a `[[keybinding]]` block) broadcast `keybindings:changed`
  and recompose live. Conflicts and unresolvable command ids surface in the echo area.

## Security posture (design §3)

- Hardened, explicitly-pinned `webPreferences` (`sandbox`, `contextIsolation`, `nodeIntegration:false`,
  no webview, no `@electron/remote`) + `app.enableSandbox()`.
- The preload exposes only the typed `CoalApi`; the renderer has zero ambient authority.
- Every IPC handler validates the sender frame and the payload before acting.
- Renderer served from `app://` (not `file://`) with a strict CSP; navigation is locked down
  (`will-navigate`/`setWindowOpenHandler`/`will-attach-webview`).

## Testing

Three tiers, all green in CI on every code PR:

- **Node (Vitest `node`)** — the pure kernel + `fileService`/`guards`, TDD. The bulk.
- **Browser (Vitest `browser`, real Chromium)** — CM6 keymap/state and the editor façade.
- **e2e (Playwright `_electron`, under `xvfb`)** — the built app: open → edit → save → assert
  the file's bytes → quit, and a CLI-arg-open smoke.

Run: `npm test` (node), `npm run test:browser`, `npm run test:e2e`; `npm run typecheck`,
`npm run format:check`. Build: `npm run build`; dev: `npm run dev`.

## Not yet built

Per the design's build sequence (§1.1), the kernel still thickens: the **per-vault** config tree +
Settings UI, the plugin loader / capability broker / host API, the syntax-highlighting engine, the
workspace shell, and the privileged startup/storage seams. `src/overlay/` stays untouched — it becomes
the linking plugin's core once the extension substrate exists.
