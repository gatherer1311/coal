# Obsidian — How it works (UI/UX & interaction mechanics)

> The **HOW** companion to `reference/02-obsidian.md` (the *what*). Sourced from the official **Obsidian Help** (obsidian.md/help, where `help.obsidian.md` redirects) and the **Obsidian Developer Docs** (docs.obsidian.md). Coal's UI/UX is heavily modeled on Obsidian but is currently underdeveloped; this file documents the *mechanisms* — the exact editor extensions, workspace model, CSS-variable design system, component classes, commands, and interaction flows — so Coal can close the gap deliberately rather than by guesswork.

**What it is.** A mechanism-level teardown of Obsidian's interface and interaction design: not *what* Obsidian is (that is `02-obsidian.md`), but *how* each part of its UI/UX is actually built and why it feels the way it does. It is organized by UI subsystem (§1–§9); each section has three movements — **How Obsidian does it** (the concrete constructs: CodeMirror 6 editor extensions, the `Workspace`/`WorkspaceLeaf` split tree, the `--*` CSS-variable design tokens, the `Setting`/`Modal`/`SuggestModal`/`EditorSuggest` classes, command IDs, default hotkeys), **Details that make it feel polished** (the micro-UX a naive clone misses), and **For Coal** (what to borrow or avoid, mapped to Coal's real surfaces). A concluding chapter (§10) turns all nine "For Coal" readings into a single prioritized UI/UX roadmap against Coal's current state. The throughline: Coal shares Obsidian's two foundations — **CodeMirror 6** for the editor surface and **vanilla DOM** for chrome — so most of these constructs can be mirrored almost directly, adapted to Coal's non-negotiables (keyboard-first, Emacs `M-x` not slash commands, markdown-as-truth, edit-only, Linux/macOS only).

---

## Contents

1. **Workspace, panes, tabs & window chrome** — the split-tree layout skeleton
2. **Command palette, commands & hotkeys** — the command-centric model behind `M-x`
3. **Quick Switcher & Search** — fast open + query, and the search-operator grammar
4. **The Markdown editor — Live Preview, Source & Reading views** — the CM6 decoration model Coal copied, plus `EditorSuggest` autocomplete
5. **File explorer & vault navigation** — the folder tree, drag-drop, context menus
6. **Backlinks, outgoing links, outline, properties & graph panels** — the knowledge-graph surfaces
7. **Appearance — themes, CSS variables & the design-token system** — the `--*` token contract Coal's `--coal-*` mirrors
8. **Settings, modals, notices & UI components** — the dialog/component layer
9. **Interaction & micro-UX polish** — hover preview, context menus, callouts, and the overall "feel"
10. **Coal — UI/UX gap analysis & prioritized roadmap** — the synthesis for closing the gap

---

## 1. Workspace, panes, tabs & window chrome

The **workspace** is the skeleton every other Obsidian surface hangs off of: a live, serializable **tree of split containers whose leaves each host one view**. Almost everything that makes Obsidian feel like a "real" desktop app — tabs you can tear off, panes you can split and resize, sidebars that collapse to nothing, a ribbon, a status bar, pop-out windows, and saved workspace layouts — is emergent behavior of that one tree plus a small set of `Workspace` methods. Coal today has none of this structure (a fixed `#body`, one file list, one editor), so this is the highest-leverage subsystem to understand mechanistically.

### How Obsidian does it

**The workspace tree (`Workspace` + `WorkspaceItem` hierarchy).** The `Workspace` object (reached as `app.workspace`) owns a tree of `WorkspaceItem` nodes. The docs put it plainly: "Parent items can contain _child_ items, including other parent items, whereas leaf items can't contain any workspace items at all." Interior nodes are `WorkspaceParent` subclasses; terminal nodes are `WorkspaceLeaf`.
- `WorkspaceSplit` — a parent that "lays out its child items one after another along a vertical or horizontal direction," i.e. a split-pane container.
- `WorkspaceTabs` — a parent that "only displays one child item at a time and hides the others" (a *tab group*); the rest are collapsed to tab headers.
- `WorkspaceLeaf` — a terminal node that displays content through a single `View`. `leaf.view` is the view; `leaf.parent` is typed `WorkspaceTabs | WorkspaceMobileDrawer` ("On desktop, a leaf is always a child of a `WorkspaceTabs` component. On mobile, a leaf might be a child of a `WorkspaceMobileDrawer`").
- Special roots hang directly off `Workspace`: `rootSplit: WorkspaceRoot` (the central editing area; `WorkspaceRoot` is the root `WorkspaceSplit`), `leftSplit`/`rightSplit: WorkspaceSidedock | WorkspaceMobileDrawer` (the two sidebars), and `leftRibbon`/`rightRibbon: WorkspaceRibbon`. `activeLeaf: WorkspaceLeaf | null` tracks focus. (All six property types are verbatim from the `Workspace` API reference.)

**Creating and placing leaves.** All new panes/tabs come from a tiny vocabulary:
- `workspace.getLeaf(newLeaf?: PaneType | boolean)` — the everyday entry point. `PaneType` is exactly `'tab' | 'split' | 'window'`: `'tab'` "creates a new leaf in the preferred location within the root split," `'split'` "creates a new leaf adjacent to the currently active leaf," `'window'` "creates a popout window." The boolean form matters: `false`/`undefined` **reuses the active leaf** (navigate *in place*), `true` is equivalent to `'tab'`. This one method backs almost every "open note" path.
- `workspace.getLeaf(newLeaf, direction: SplitDirection)` — the split overload. `SplitDirection` is exactly `'vertical' | 'horizontal'`; `'vertical'` places the new leaf to the **right**, `'horizontal'` **below** (that is how "Split right"/"Split down" are implemented — a `'vertical'` split draws a vertical divider, so panes sit side-by-side).
- `workspace.getLeftLeaf(split)` / `workspace.getRightLeaf(split)` — mint a leaf inside the left/right sidebar; the boolean `split` chooses whether to force a new split vs. reuse an existing sidebar tab (the canonical view-activation pattern passes `false`).
- `createLeafInParent(parent, index)` (since v0.9.11), `createLeafBySplit(leaf, direction, before)` (v0.9.7), `splitActiveLeaf(direction)`, `duplicateLeaf(leaf, direction)` / `duplicateLeaf(leaf, leafType, direction)` (v1.1.0) — lower-level placement.
- `revealLeaf(leaf)` "brings a given leaf to the foreground"; `setActiveLeaf(leaf, params)` / `setActiveLeaf(leaf, pushHistory, focus)` focuses it; `leaf.detach()` removes it. Bulk ops: `getLeavesOfType(viewType)`, `detachLeavesOfType(viewType)`, `iterateAllLeaves(cb)` (covers main-area, sidebar, **and** floating/pop-out leaves), `getMostRecentLeaf(root?)`, `getActiveViewOfType(type)` (v0.9.16).

**Views (`View` / `ItemView`).** Every leaf's content is a `View`. Plugins subclass `ItemView` and implement `getViewType()` (a unique string id) and `getDisplayText()` (tab title), plus the `onOpen()`/`onClose()` async lifecycle that builds and tears down DOM in `this.contentEl`. `getIcon()` (tab/ribbon icon id) is an **optional** override — `ItemView` supplies a default (`'document'`), and the official example does not override it. A view type is registered once in `onload()` with `this.registerView(VIEW_TYPE, (leaf) => new MyView(leaf))`, then activated with the canonical pattern from the docs:
```ts
async activateView() {
  const { workspace } = this.app;
  let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0]
    ?? workspace.getRightLeaf(false);
  await leaf.setViewState({ type: VIEW_TYPE, active: true });
  workspace.revealLeaf(leaf);
}
```
Leaf state travels through `getViewState()`/`setViewState(state, eState)` and `setEphemeralState()`/`getEphemeralState()` (transient things like scroll position and text selection, not persisted the same way). `openFile(file, openState)` is the shortcut that loads a `TFile` into the leaf. Restored leaves are lazily materialized: `leaf.isDeferred` (readonly) is `true` until first shown, and `leaf.loadIfDeferred()` forces full construction — "If this view is currently deferred, load it and await that it has fully loaded."

**Workspace events (the reaction surface).** The tree is not just queried, it is *subscribed* to. `workspace.on(name, cb)` (with the returned `EventRef` unregistered via `offref`, or auto-managed by `Component.registerEvent`) exposes the vocabulary that makes linked/live surfaces work: `active-leaf-change` (focus moved to another leaf), `file-open` (the active leaf loaded a file), `layout-change` (splits/tabs added/removed/resized), `resize`, `window-open`/`window-close` (pop-out lifecycle), and `quit`. `workspace.onLayoutReady(cb)` (v0.11.0) fires **once** after the initial layout is deserialized and is the correct place for plugins to reveal their views — calling `getLeaf` before it can corrupt restore.

**Tabs & tab groups.** A `WorkspaceTabs` group renders a header strip; the "+" button and `Ctrl/Cmd+T` create a new tab. Default navigation hotkeys (verified against the tabs help page): `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle next/previous (**same on macOS** — cycling stays on `Ctrl`), `Ctrl+1`…`Ctrl+8` jump to tab 1–8, `Ctrl+9` jumps to the **last** tab, `Ctrl+Shift+T` reopens the last closed tab — on macOS the *numbers* use `⌘` (`Cmd+1`…`Cmd+9`, `Cmd+Shift+T`), but tab cycling stays `Ctrl+Tab`. **Modifier-click on a link** decides placement: plain click = navigate in place, `Ctrl/Cmd` = new tab (add `Shift` in Source mode), `Ctrl/Cmd+Alt` = new tab group (split), `Ctrl/Cmd+Alt+Shift` = new window. A tab's right-click menu offers **Split right**, **Split down**, **Pin** (toggles to **Unpin**), **Open in new window**, **Move to new window**, and **Open linked view** (Graph view (local), Backlinks, Outline). Tabs are rearranged by dragging along the strip; **dragging a tab to the bottom/edge of another tab group creates a split**.

**Stacked tabs.** The tab group's down-arrow (upper-right corner) menu has **Stack notes** ("Stack tabs to slide them over other tabs in the same tab group"): instead of hiding inactive tabs, the group fans them out as overlapping vertical spines you scroll through — governed by `--tab-stacked-pane-width`, `--tab-stacked-header-width`, `--tab-stacked-shadow`, `--tab-stacked-text-writing-mode`, `--tab-stacked-text-align`, etc.

**Linked panes / linked views.** "Open linked view" attaches a Graph/Backlinks/Outline leaf that follows the active note. Under the hood this is leaf **grouping**: `leaf.setGroup(groupId)` / `leaf.setGroupMember(otherLeaf)` — leaves in the same group share navigation, so a "linked" outline updates (via `active-leaf-change`/`file-open`) when its partner editor changes note.

**Splitting & resizing.** Splits come from the `direction` argument above; resizing is done by dragging the **divider** between two children of a `WorkspaceSplit` (the edge highlights on hover when draggable). Divider look is themable via `--divider-color`, `--divider-color-hover`, `--divider-width`, `--divider-width-hover`, `--divider-vertical-height` (the complete Divider variable set).

**Sidebars (`WorkspaceSidedock`).** Two sidedocks (`leftSplit`, `rightSplit`), each itself a splittable stack of `WorkspaceTabs` holding plugin views — the docs name Backlinks, Outgoing links, and File explorer, plus Search, Tag pane, Outline. Each pane shows one tab at a time via its icon strip; tabs rearrange by drag and can be dragged above/below to form new tab groups within the dock. "Some actions automatically bring a tab into view. For example, when you select a tag, its tab opens." Collapse/expand is the **expand icons** at the outer edges, or the commands **Toggle left sidebar** / **Toggle right sidebar** (command ids `app:toggle-left-sidebar` / `app:toggle-right-sidebar`; these only toggle — there is no native set-state command). "On desktop and larger tablets, the left sidebar includes the Ribbon."

**Ribbon (`WorkspaceRibbon`).** A vertical icon rail "located in the left Sidebar and [it] remains visible even when the left Sidebar is closed." Default actions: **Open vault switcher**, **Open help**, **Open settings**. Plugins add icons with `this.addRibbonIcon(iconId, tooltip, callback)`. Users drag to reorder, right-click to hide individual actions or **Hide ribbon**, and toggle it under **Settings → Appearance → Advanced → Show ribbon**. Themable via `--ribbon-background`, `--ribbon-background-collapsed`, `--ribbon-width`, `--ribbon-padding`.

**Status bar.** A strip in the **bottom-right** of the window showing small bits of state (word/character count, backlink count, current editor view, sync status, clock). Some items are interactive (Sync icon opens the log), some purely informational (word count). Plugins add items via `this.addStatusBarItem()` (returns an `HTMLElement` to fill). Themable: `--status-bar-background`, `--status-bar-border-color`, `--status-bar-border-width`, `--status-bar-font-size`, `--status-bar-text-color`, `--status-bar-position`, `--status-bar-radius`, `--status-bar-scroll-padding` (the complete Status bar set).

**Pop-out windows (desktop only).** "This feature is only available on Desktop." `workspace.getLeaf('window')` opens a separate OS window whose `rootSplit` is a `WorkspaceRoot` of its own; its leaves still appear in `iterateAllLeaves`, and open/close fire `window-open`/`window-close`. Created via **Open in new window** (file-explorer/tab context menu, or right-click a link) / **Open current tab in new window** (command palette); moved via **Move current tab to new window** / **Move to new window** (tab menu) or by dragging a tab into another window's tab strip. Each pop-out is bound to its parent **vault window** — "If you close a vault window, all of its pop-out windows will close as well" — and "Files can only be moved between windows associated with the same vault."

**Layout serialization.** The entire tree is JSON-serializable. `workspace.getLayout()` snapshots it and `workspace.changeLayout(layout)` restores it; `workspace.requestSaveLayout` is a `Debouncer<[], Promise<void>>` that persists on change. The saved state (open leaves, split geometry, sidebar widths/visibility, active tab) lives in `.obsidian/workspace.json`. `workspace.onLayoutReady(cb)` fires once the initial layout is deserialized — the correct hook for plugins to reveal their views.

**Saved workspaces (core plugin).** The **Workspaces** core plugin "lets you manage and switch between different application layouts depending on your task, for example journaling, reading, or writing." "A workspace contains information about open files and tabs, and the width and visibility of each sidebar." The command **Manage workspace layouts** (also a ribbon action) opens a modal to **Save workspace layout**, **Load workspace layout**, and **Delete layout**. These *named* layouts are separate from the always-current `workspace.json`. (Known limitation: no built-in reordering, and saving requires retyping the name.)

### Details that make it feel polished

- **Focus & active-leaf semantics.** There is always exactly one `activeLeaf`; opening a link "in place" (`getLeaf(false)`) targets the *most recently active* main-area leaf, never a sidebar leaf — sidebars are excluded from the navigable set. Tab text has a whole cascade of focus-aware colors (`--tab-text-color`, `--tab-text-color-active`, `--tab-text-color-focused`, `--tab-text-color-focused-active`, `--tab-text-color-focused-highlighted`, `--tab-text-color-focused-active-current`) so the eye can instantly find the *active tab of the focused group*.
- **Deferred views.** `leaf.isDeferred` — restored tabs are not fully constructed until first shown (or `loadIfDeferred()`), so a 40-tab layout opens instantly; a view must tolerate being materialized late.
- **Resize affordance.** The divider only highlights (`--divider-color-hover`, thicker `--divider-width-hover`) when the cursor is actually over a draggable edge, so dead space doesn't lie about being resizable.
- **Drag-to-split targeting.** During a tab drag, drop zones light up on each tab group's edges (top/bottom/left/right → split in that direction) vs. its header (reorder/move into group) — the direction is inferred from *where* in the target you release.
- **Ribbon survives collapse.** Collapsing the left sidebar keeps the ribbon visible with a distinct background (`--ribbon-background-collapsed`), so global actions never disappear.
- **Empty & restore states.** A tab group with no leaves shows the "empty state" (new-tab / recent-files homepage, itself an `'empty'` view type) rather than blank; closing the last tab in a split collapses the split and rebalances siblings. Pop-out lifecycle is parent-bound so you never orphan a window.
- **Pinning nuance.** A pinned tab refuses to be navigated away — following a link from it *spawns* a new tab instead of replacing content, protecting a reference note.
- **Linked-view liveness.** A linked Outline/Backlinks/Graph re-queries on the partner's `active-leaf-change`/`file-open`, so it feels attached rather than manually refreshed.

### For Coal

- **Adopt the tree, not the widgets.** Model a minimal `WorkspaceSplit`/`WorkspaceTabs`/`WorkspaceLeaf` in vanilla TS (SPEC §13). Even a first cut of *one* `rootSplit` + a collapsible right sidedock unblocks the roadmap item that moves `backlinks.ts` out from under the editor. Keep leaves hosting a `View` interface with `getViewType()`/`onOpen()`/`onClose()` (and an optional `getIcon()`) so the editor, backlinks, and future outline/graph are interchangeable leaf contents — mirror Obsidian's `ItemView` contract directly, including a `registerView(type, factory)` registry keyed by view type.
- **Each editor leaf is its own CM6 `EditorView`.** Splitting/tabs means N independent CM6 instances sharing extensions; don't try to reparent one editor. A tab group shows one; `revealLeaf`-style focus routing decides which `EditorView.focus()` fires. Coal's live-preview decorations, `[[` autocomplete, and monochrome highlighting are per-instance extensions — reuse the same extension-array factory for every leaf so they stay identical.
- **A tiny event bus, like `workspace.on`.** Backlinks/outline "linked" behavior needs an `active-leaf-change`/`file-open` signal. Add a minimal emitter on the workspace so a sidedock view re-queries when the focused editor leaf changes note — this is the mechanism that makes a right-dock backlinks pane feel live instead of manually refreshed.
- **Keyboard-first, M-x-native placement (SPEC §1/§3).** Expose splits/tabs/sidebars as **M-x commands** in `commands.ts`, not modifier-clicks: e.g. `split-right` (`'vertical'`), `split-down` (`'horizontal'`), `other-window` (Emacs `C-x o`), `delete-window` (`C-x 0`), `delete-other-windows` (`C-x 1`), `close-tab`, `next-tab`/`previous-tab`, `toggle-right-sidebar`, `toggle-left-sidebar`. Bind the Emacs `C-x`-prefix set through the existing `@replit/codemirror-emacs` prefix table (as v0.13.0 did for `C-x C-s`). Mouse split/drag is allowed later but never required.
- **Sidebars as sidedocks, ribbon optional.** Build a right `WorkspaceSidedock` first (backlinks, later outline/tags) with a tab-icon strip and a collapse toggle; announce collapse/expand through the minibuffer echo area for feedback. A ribbon is low priority for a keyboard-first app — if added, keep it a thin left rail whose every action also has an M-x command; do not make it the only path to anything.
- **Token contract.** Extend `docs/theming.md` / `theme.ts` with Coal analogues of the exact Obsidian vars so themes port cleanly: `--coal-divider-color`/`-hover`, `--coal-divider-width`/`-hover`, `--coal-tab-background-active`, `--coal-tab-text-color`(+`-active`/`-focused` states), `--coal-tab-container-background`, `--coal-status-bar-background`/`-text-color`/`-border-color`, and (if a ribbon lands) `--coal-ribbon-background`/`-width`. Reuse `light-dark()` as already done.
- **Serialize the layout as a git-ignored cache (SPEC §10).** Persist the split tree + active leaf + sidebar widths to `<vault>/.coal/workspace.json`, restored after an `onLayoutReady`-style hook — but treat it as rebuildable UI state, **never** committed and never a source of truth (markdown stays canonical). Later, named "workspaces" can be a small M-x `save-workspace`/`load-workspace` layer on top, matching the core-plugin model (a named snapshot = open tabs + sidebar widths/visibility).
- **Status bar.** Coal already has the persistent bottom minibuffer/echo area (v0.17.0); fold Obsidian's status-bar role (word count, backlink count, git/push status) into a right-aligned segment of that strip rather than adding a second bar — one bottom strip, echo-area left, status-items right.
- **Skip for now (respect scope).** No reading-mode linked views, no pop-out windows initially (Electron multi-`BrowserWindow` is a large lift and Coal is edit-only) — but keep `getViewType`-based leaves so a `getLeaf('window')` equivalent stays a future option without redesign.

**Sources:** https://docs.obsidian.md/Reference/TypeScript+API/Workspace · https://docs.obsidian.md/Reference/TypeScript+API/Workspace/getLeaf_1 · https://docs.obsidian.md/Reference/TypeScript+API/WorkspaceLeaf · https://docs.obsidian.md/Reference/TypeScript+API/SplitDirection · https://docs.obsidian.md/Plugins/User+interface/Workspace · https://docs.obsidian.md/Plugins/User+interface/Views · https://docs.obsidian.md/Reference/CSS+variables/Components/Tabs · https://docs.obsidian.md/Reference/CSS+variables/Window/Ribbon · https://docs.obsidian.md/Reference/CSS+variables/Window/Divider · https://docs.obsidian.md/Reference/CSS+variables/Window/Status+bar · https://obsidian.md/help/tabs · https://obsidian.md/help/sidebar · https://obsidian.md/help/ribbon · https://obsidian.md/help/pop-out-windows · https://obsidian.md/help/plugins/workspaces

---

## 2. Command palette, commands & hotkeys

Obsidian is a *command-centric* application: nearly every action a user can take — core or plugin — is a named, ID-addressed **command** in a single global registry, and three surfaces consume that registry: the **Command palette** (fuzzy launcher, `Ctrl/Cmd+P`), the **Hotkeys** settings tab (bind any command to keys), and **ribbon icons** (mouse affordances). This uniformity is *why* Obsidian feels keyboard-driveable end-to-end — it is the direct architectural analog of Coal's `M-x` model, and the piece Coal should mirror most closely. Because a command is just data (`{id, name, callback}`) plus a check function, the same object powers discovery, invocation, and rebinding without any per-feature UI plumbing.

### How Obsidian does it

- **The command registry & `addCommand`.** Plugins register commands in `onload()` via `this.addCommand(command: Command): Command`. The registry is global and flat; the palette and Hotkeys tab both enumerate it. Minimal form:
  ```ts
  this.addCommand({
    id: 'print-greeting-to-console',
    name: 'Print greeting to console',
    callback: () => { console.log('Hey, you!'); },
  });
  ```
- **Command IDs are namespaced `pluginId:commandId`.** The `id` you pass is *local* to your plugin; Obsidian prefixes it with the plugin's manifest `id`, so `addCommand({id: 'toggle-foo'})` inside plugin `my-plugin` is globally addressable as `my-plugin:toggle-foo`. Core commands use core namespaces (e.g. `editor:save-file`, `app:go-back`, `workspace:split-vertical`, `command-palette:open`). The `name` shown in the palette is likewise prefixed in the UI with the plugin/source name (e.g. "Daily notes: Open today's daily note").
- **The `Command` interface (full property list, verbatim types):**
  - `id: string` — "Globally unique ID to identify this command."
  - `name: string` — "Human friendly name for searching." (This is the string the palette fuzzy-matches.)
  - `icon?: IconName` — "Icon ID to be used in the toolbar" (Lucide icon id; used for ribbon/toolbar surfacing).
  - `mobileOnly?: boolean` — optional flag (documented without a description); when set, restricts the command to mobile.
  - `repeatable?: boolean` — "Whether holding the hotkey should repeatedly trigger this command."
  - `callback?: () => any` — "Simple callback, triggered globally."
  - `checkCallback?: (checking: boolean) => boolean | void` — "Complex callback, overrides the simple callback. Used to 'check' whether your command can be performed in the current circumstances."
  - `editorCallback?: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => any` — "A command callback that is only triggered when the user is in an editor." (Supersedes `callback`/`checkCallback` when both are present — see precedence below.)
  - `editorCheckCallback?: (checking: boolean, editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => boolean | void` — "A command callback that is only triggered when the user is in an editor." The `checking`-boolean form of `editorCallback`: gate visibility on `checking:true`, run on `checking:false`.
  - `hotkeys?: Hotkey[]` — "Sets the default hotkey."
- **Conditional commands via `checkCallback` (the availability gate).** The palette calls the check function with `checking: true` first; if it returns `false`, the command is *hidden/omitted from the palette entirely* (and its hotkey is inert). If it returns truthy, the command is listed; on invocation it is called again with `checking: false` to actually run. This is the mechanism behind "commands only appear when relevant."
  ```ts
  checkCallback: (checking: boolean) => {
    const value = getRequiredValue();
    if (value) {
      if (!checking) { doCommand(value); }
      return true;   // shown / runnable
    }
    return false;    // hidden / disabled
  }
  ```
- **Editor commands.** `editorCallback: (editor, view) => ...` receives the active CM `Editor` and `MarkdownView`; it *only* fires when an editor is focused (so the command auto-hides when no editor is active). `editorCheckCallback` combines both behaviors. Precedence, highest-to-lowest: `editorCheckCallback` → `editorCallback` → `checkCallback` → `callback`.
- **Default hotkeys on the command.** `hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'a' }]`. The `Hotkey` interface is `{ modifiers: Modifier[]; key: string }`. `Modifier` values are `'Mod' | 'Ctrl' | 'Meta' | 'Shift' | 'Alt'`. **`Mod` is the cross-platform key** — resolves to `Ctrl` on Windows/Linux and `Cmd` on macOS. `key` is an uppercase-agnostic key name (`'a'`, `'Enter'`, `'ArrowUp'`, `'F5'`). These are *defaults*; the user's Hotkeys tab overrides them and persists to `hotkeys.json`.
- **The Command palette (core plugin, `command-palette`).** Opened with `Ctrl+P` / `Cmd+P` (command id `command-palette:open`) or its ribbon icon. It renders a modal with a search input at top and a scrollable, fuzzy-filtered list. **Fuzzy matching**: typing `scf` finds "Save current file"; matched characters are highlighted. **Recently used** commands surface at the top on empty query (as of Obsidian **1.8.3**) but are still subject to the fuzzy algorithm once you type — shorter command names get prioritized over recency when filtering. **Hotkey display**: each row shows that command's assigned hotkey on the right, so the palette doubles as a hotkey cheat-sheet. **Keyboard nav**: arrow keys move the selection, `Enter` runs the highlighted command, `Esc` closes.
- **Pinned commands.** Configured in Settings → Command palette. Per the docs: next to "New pinned command", click "Select a command", choose the command, and press Enter — that adds a pin. Pinned commands always render at the top of the palette (above/independent of recency), marked with a pin/thumbtack glyph. **Unpin** via the **cross icon** next to the entry under "Pinned commands" (docs-confirmed); the pinned list is reorderable. The docs explicitly frame pinning as an alternative to setting a hotkey — valuable on mobile where there is no keyboard.
- **The Hotkeys settings tab.** Settings → Hotkeys lists every registered command with its current binding(s). Flow to bind: find the command (there is a **search/filter box**), click the **plus (+) icon**, press the key combo, click **Save**. **Multiple bindings per command**: press **+ again** after the first to add another combo (a command can have N hotkeys). **Remove** a binding via the **X icon** next to it. A **filter icon** (docs: "select the filter icon in Settings → Hotkeys") toggles showing only commands that already have assigned hotkeys. **Conflicts** (observed UI behavior, not spelled out in the current help page): assigning a combo already bound elsewhere surfaces a conflict indicator but is still allowed. **Non-US layouts** (docs-confirmed): "Hotkeys are displayed as they would appear on a US keyboard layout" — they are shown in US terms but fire on the physical keys actually pressed.
- **`addRibbonIcon` (mouse affordance for a command).** `addRibbonIcon(icon: IconName, title: string, callback: (evt: MouseEvent) => any): HTMLElement` — adds an icon to the left ribbon; `title` is the tooltip. Returns the created element so you can add classes. This is the spatial/mouse entry point that complements the keyboard command.
- **`Scope` / `Keymap` / `KeymapEventHandler` (the low-level keybinding layer under commands).** A `Scope` "receives keyboard events and binds callbacks to given hotkeys. Only one scope is active at a time, but scopes may define parent scopes (in the constructor) and inherit their hotkeys." API:
  - `new Scope(parent?: Scope)`
  - `scope.register(modifiers: Modifier[] | null, key: string | null, func: KeymapEventListener): KeymapEventHandler` — "Add a keymap event handler to this scope."
  - `scope.unregister(handler: KeymapEventHandler)` — "Remove an existing keymap event handler."
  - The global keymap stack is `app.keymap` with `pushScope(scope)` ("Push a scope onto the scope stack, setting it as the active scope to handle all key events") / `popScope(scope)` ("Remove a scope from the scope stack. If the given scope is active, the next scope in the stack will be made active"); **`Modal` and the palette own their own `Scope`** (`modal.scope`), which is pushed while open and popped on close — this is how modal-local keys (arrows/Enter/Esc) work without leaking to the editor. `Keymap` also exposes static helpers `Keymap.isModifier(evt, modifier)` ("Checks whether the modifier key is pressed during this event") and `Keymap.isModEvent(evt)` (maps a mouse/keyboard event to `'tab' | 'split' | 'window'` pane behavior).
- **Programmatic invocation (internal registry).** Beyond the palette/hotkey/ribbon surfaces, the flat registry is reachable via the *undocumented* `app.commands` object — `app.commands.executeCommandById('editor:save-file')` runs a command by id, and `app.commands.commands` / `listCommands()` enumerate them. It is not in the public TypeScript API, but it is the same registry `addCommand` feeds and is the canonical "one action, many entry points" hub.

### Details that make it feel polished

- **Availability-aware listing.** Because `checkCallback`/`editorCallback` gate visibility, the palette never shows dead commands — e.g. "Fold all" only appears with an editor focused. A naive clone lists everything and then no-ops; Obsidian omits, so the list is always *actionable*.
- **The palette is a live hotkey reference.** Right-aligned hotkey hints on every row mean users learn bindings passively while launching by name — discovery and muscle-memory training in one surface.
- **Recency + pins + fuzzy compose predictably.** Empty query → pins then recents; first keystroke → fuzzy takeover with short-name bias. The ordering rules are stable, so the top item is usually the right one after 2–3 chars.
- **Modal focus discipline.** Opening the palette pushes a Scope and moves focus to the search field; arrow/Enter/Esc are captured by the modal scope, not the editor; closing pops the scope and returns focus to the prior editor position. No focus is stolen permanently and no editor selection is lost.
- **Match highlighting.** Fuzzy-matched characters in each command name are visually emphasized, so users see *why* a result matched (helps disambiguate similarly named commands).
- **Conflict transparency without nannying.** The Hotkeys tab warns on a clash but still lets you bind — power users routinely reuse combos across contexts. It also gracefully handles multiple bindings and blank/unbound commands.
- **Cross-platform key rendering.** `Mod` renders as `Ctrl` or `⌘` per-OS; symbol glyphs (`⌘⇧⌥⌃`) are used on macOS. Bindings survive layout differences because they key off physical keys.
- **Command names are namespaced for scanability.** "Source: Action" naming (e.g. "Templates: Insert template") groups commands by origin in an otherwise flat fuzzy list.

### For Coal

- **Treat every action as a first-class command object** — Coal already has `src/renderer/commands.ts` (the `M-x` registry) and the bottom `minibuffer.ts` prompt; formalize the command shape as `{ id: string; name: string; run(): void; isAvailable?(): boolean; hotkey?: string }`. Namespace ids like Obsidian's `pluginId:commandId` even without plugins (e.g. `editor:save-file`, `vault:open-last`, `backlinks:next`) so the ID space stays stable and greppable. Coal's "M-x, no slash commands" rule (SPEC §3) *is* this model — lean into it.
- **Add an availability gate (`checkCallback` analog).** Give commands an optional `isAvailable()` predicate; the minibuffer candidate list should *omit* unavailable commands (e.g. block/backlink commands when no note is open) rather than showing then failing. Mirror the editor-vs-global split: an `editorCommand` variant that receives the live CM6 `EditorView` and only surfaces when the editor is focused.
- **Upgrade minibuffer matching from substring to fuzzy + highlight.** Today matching is basic substring (per the state summary). Implement subsequence fuzzy scoring with short-name bias and render matched-char highlighting in the vertico-style vertical list — this is the single biggest felt-quality gap vs. Obsidian. Keep it dependency-light (SPEC §12): a small scorer in vanilla TS, no library.
- **Show the bound hotkey per candidate.** Right-align each command's Emacs keybinding (e.g. `C-x C-s`) in the minibuffer row so `M-x` doubles as a discoverable keymap reference — mirrors Obsidian's palette hotkey hints. Coal already resolves bindings via `@replit/codemirror-emacs`; surface that mapping into the registry so the label is authoritative.
- **Add recency + pinning to the minibuffer.** On empty `M-x` query, show pinned commands then a recently-used list (Obsidian 1.8.3 behavior); once the user types, hand off to fuzzy. Persist pins/recents in `userData` prefs (same store as `autoOpenLastVault`). This is pure vanilla-DOM list ordering — no new surface needed.
- **Build a Hotkeys settings pane.** Coal's `settingsPanes.ts` already has Appearance/Git-remote/About/Auto-open; add a **Hotkeys** pane that lists commands with their current Emacs binding, supports rebinding (capture a chord like `C-c C-n`), multiple bindings per command, removal, and a conflict warning. Because Coal is Emacs-lineage, model bindings as key *sequences/chords* (prefix keys like `C-x`), which maps naturally onto CM6 + the `@replit/codemirror-emacs` prefix table rather than Obsidian's single-chord `{modifiers, key}`.
- **Mirror `Scope`/`Keymap` with CM6 keymaps + a modal scope.** For the minibuffer prompt, use a transient key-capture layer (arrows/Enter/Esc) that intercepts navigation *without stealing editor focus* — Coal's minibuffer already avoids focus theft; formalize it as a push/pop "scope" so prompt keys never leak into the editor and editor point is restored on close. CM6 `keymap.of([...])` compartments are the direct equivalent of Obsidian's scoped keymaps.
- **Keep `Mod`-style cross-platform binding for the macOS target.** Coal is Linux + macOS (never Windows): normalize a `Mod`-like abstraction so `C-`/`M-` render as `⌘`/`⌥` on macOS where appropriate (Coal already keeps macOS `Cmd-S` alongside emacs `C-x C-s`). Store bindings symbolically; render per-OS glyphs.
- **Optional mouse affordance parity.** An `addRibbonIcon` analog is low-priority given keyboard-first design and the trimmed top-bar chrome (v0.16.0), but if/when a sidebar returns, reuse the command registry as the single source so any icon just invokes a command id — never a parallel code path.

**Sources:** https://docs.obsidian.md/Plugins/User+interface/Commands · https://docs.obsidian.md/Reference/TypeScript+API/Command · https://docs.obsidian.md/Reference/TypeScript+API/Hotkey · https://docs.obsidian.md/Reference/TypeScript+API/Modifier · https://docs.obsidian.md/Reference/TypeScript+API/Scope · https://docs.obsidian.md/Reference/TypeScript+API/Scope/register · https://docs.obsidian.md/Reference/TypeScript+API/Keymap · https://docs.obsidian.md/Reference/TypeScript+API/Plugin/addRibbonIcon · https://obsidian.md/help/plugins/command-palette · https://obsidian.md/help/hotkeys

---

## 3. Quick Switcher & Search

Obsidian's fast-navigation story is two overlapping subsystems: the **Quick Switcher** — a modal fuzzy note-opener bound to `Ctrl/Cmd+O` — and the **Search** core plugin — a full-text query engine with an operator grammar, a dedicated left-sidebar pane, an in-file variant, and an embeddable `query` code block. Both are what make Obsidian feel like it has "no filesystem": you never browse folders, you *summon* the note by fragmentary name or find it by content, and everything is keyboard-drivable. Under the hood the switcher is built on the same public `SuggestModal`/`FuzzySuggestModal` machinery plugins use, and the fuzzy scorer (`prepareFuzzySearch`) is exposed as an API primitive — which matters because Coal, being CM6 + vanilla DOM, can mirror these constructs almost 1:1.

### How Obsidian does it

**Quick Switcher (core plugin `switcher`).**
- **Command / hotkey:** command id `switcher:open`, "Open quick switcher", default `Ctrl+O` (macOS `Cmd+O`). Also reachable via a ribbon icon and (mobile) the plus button.
- **Matching:** fuzzy match over note **basename** *and* frontmatter **aliases** (an alias hit renders the alias as the title with the real filename subdued). Non-contiguous subsequence matching, so `dcln` matches `Daily Cleaning`. For vaults over **10,000 items** it silently downgrades to a cheaper/simplified algorithm for responsiveness.
- **Empty query = recents:** with the input empty it lists recently opened notes (most-recent first), so `Ctrl+O` → `Down` → `Enter` is the "toggle to previous note" gesture.
- **Enter semantics (the important part):**
  - `Enter` — open the highlighted result in the active tab.
  - `Ctrl/Cmd+Enter` — open in a **new tab**.
  - If the query matches nothing, `Enter` **creates a new note** named by the query text.
  - `Shift+Enter` — **force-create** a new note with exactly the typed name even when similar notes exist (bypasses selecting a fuzzy match).
- **Navigation flow:** `↑/↓` move the roving highlight; typing re-filters live; `Esc` dismisses. Files matching the "Excluded files" setting (Settings → Files & links) are **deprioritized** (pushed to the bottom), not hidden.
- **Aliases & headings:** aliases are first-class match targets. Jumping to a specific heading/block is not in the *core* switcher — that's the domain of the popular **Omnisearch**/**Switcher++**/**Another Quick Switcher** community plugins — but the underlying capability (heading/block indexing) exists via `MetadataCache` and Search's `section:`/`block:` operators.

**The modal machinery (developer API — what the switcher is literally built on).**
- **`SuggestModal<T>`** (`extends Modal implements ISuggestOwner<T>`): the abstract base. You implement three methods:
  - `getSuggestions(query: string): T[] | Promise<T[]>` — filter/produce candidates.
  - `renderSuggestion(value: T, el: HTMLElement): void` — paint one row.
  - `onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void` — commit; note the event is passed so you can read modifier keys (this is exactly how new-tab-on-`Cmd+Enter` is implemented).
  - Config/props: `setPlaceholder(text)`, `setInstructions(instructions: Instruction[])` (renders the greyed hint row at the bottom, e.g. "↵ to open · ⌘↵ to open in new tab · esc to dismiss"), `inputEl: HTMLInputElement`, `resultContainerEl: HTMLElement`, `limit: number` (max rows), `emptyStateText: string`, and the overridable `onNoSuggestion()`. Keyboard handling is wired through the inherited `scope: Scope` (from `Modal`): the modal registers `↑/↓`/`Enter` on its own `Scope`, and you can `scope.register([mods], key, cb)` extra chords (this is how `Mod+Enter`-style bindings live *inside* the modal without leaking to the global keymap). Committing routes through `selectSuggestion(value, evt)` / `selectActiveSuggestion(evt)`, so mouse-click and keyboard-choose share one code path.
- **`FuzzySuggestModal<T> extends SuggestModal<FuzzyMatch<T>>`**: the ergonomic subclass the switcher-style UIs use. You implement `getItems(): T[]`, `getItemText(item: T): string`, `onChooseItem(item, evt)`. It internally calls the fuzzy scorer over `getItemText`, wraps each hit in `FuzzyMatch<T>` (`{ item: T; match: SearchResult }`), sorts by score, and its default `renderSuggestion(match, el)` highlights the matched characters for you.
- **Scoring primitives (public):**
  - `prepareFuzzySearch(query: string): (text: string) => SearchResult | null` — returns a reusable matcher closure; call it per candidate. (Docs warn it's costly beyond a few thousand calls.)
  - `prepareSimpleSearch(query: string): (text: string) => SearchResult | null` — cheaper substring-oriented variant (the "big vault" fallback path). Both return `null` on no match, so you can filter and sort by `.score` in one pass.
  - (A lower-level `fuzzySearch(q: PreparedQuery, text)` and a `prepareQuery(query)` are exported in the bundled `obsidian.d.ts` type definitions but have **no docs-site page** — they're undocumented internals; the two documented, public scoring primitives are `prepareFuzzySearch`/`prepareSimpleSearch`.)
  - `SearchResult` (`interface`) `= { score: number; matches: SearchMatches }`, where `SearchMatches = SearchMatchPart[]` (a `type` alias) and `SearchMatchPart = [number, number]` — a `[fromOffset, toOffset]` char range of each matched run.
  - `renderResults(el: HTMLElement, text: string, result: SearchResult, offset?: number)` — the helper that renders `text` into `el` wrapping matched ranges in `<span class="suggestion-highlight">` so highlights line up with the score.
- **DOM / CSS surface:** the modal root is `.modal.prompt`; the input is `.prompt-input` (inside `.prompt-input-container`); results live in `.prompt-results`; each row is `.suggestion-item` (`.suggestion-item.is-selected` for the active one), with matched substrings in `.suggestion-highlight` and secondary text in `.suggestion-note`/`.suggestion-aux`. The instruction footer is `.prompt-instructions`. (These prompt/suggestion class names are the observed runtime DOM — Obsidian's public docs expose the CSS *variables* but not the class list.) Sizing/color come from the documented Modal CSS variables: `--modal-background`, `--modal-width`, `--modal-height`, `--modal-max-width`, `--modal-max-height`, `--modal-max-width-narrow`, `--modal-radius`, `--modal-border-width`, `--modal-border-color`, and `--modal-community-sidebar-width` (the docs list the tokens but not their default values); the selected-row highlight and hover states additionally draw on the general `--background-modifier-*` / `--interactive-*` theme tokens.

**Search core plugin (`global-search`).**
- **Command / hotkey:** command id `global-search:open`, "Search: Search in all files", default `Ctrl+Shift+F` (macOS `Cmd+Shift+F`). Opens/focuses the **Search** view — an `ItemView` docked as a left-sidebar `WorkspaceLeaf`.
- **In-file search:** command id `editor:open-search`, "Search current file", default `Ctrl/Cmd+F` (CM6's own search panel over the active editor — distinct from the vault-wide pane).
- **Operator grammar (verified):**
  - `file:` — match filename. `path:` — match full path (`path:"Daily notes/2022-07"`). `content:` — restrict to body content.
  - `tag:#work` — match a tag (ignored inside code blocks).
  - `line:(mix flour)` — all terms on the **same line**. `block:(dog cat)` — same **block**. `section:(dog cat)` — same **section** (text between two headings).
  - `task:call` — any task line; `task-todo:call` — unchecked tasks; `task-done:call` — checked tasks.
  - `[property]` — property exists; `[aliases:Name]` — property value; `[aliases:null]` — empty property; `[status:Draft OR Published]` — sub-query; comparisons `[duration:<5]` / `[duration:>5]`.
  - `match-case:HappyCat` / `ignore-case:ikea` — per-query case override.
  - Regex `/\d{4}-\d{2}-\d{2}/` — JavaScript-flavored, and composable with operators, e.g. `path:/\d{4}-\d{2}-\d{2}/`.
  - Quoted phrase `"star wars"`; escaped quotes inside via `\"`.
  - Boolean: implicit **AND** (`meeting work`), explicit `OR`, `-` negation (`meeting -work`, `-(work meetup)`), parentheses for grouping (`meeting (work OR meetup) personal`).
- **Results UI:** matches grouped **by file**, each file collapsible/expandable, showing surrounding-context snippets with the hit highlighted. A toolbar offers a **Match case** toggle, a **Sort** dropdown (file name A–Z/Z–A, modified time, created time — newest/oldest), an **explain search term** toggle, and a three-dots menu with **Copy search results**.
- **Embedding search as a query (the "search then embed" pattern):** a fenced code block with language `query`:
  ```query
  tag:#project -tag:#archived
  ```
  Obsidian renders live, read-mode-only results inline (uses the same operator grammar; not supported on Obsidian Publish).

### Details that make it feel polished

- **Modifier-aware commit:** because `onChooseSuggestion`/`onChooseItem` receive the raw `evt`, the same highlighted row does different things by held modifier (`Enter` vs `Cmd+Enter` vs `Shift+Enter`) with zero extra UI — a naive clone that only wires a click handler loses this.
- **Empty-state intelligence:** an empty switcher shows *recents* (not "type to search"), which is what turns it into a two-note flip-flop. Search's empty state shows syntax hints; `emptyStateText`/`onNoSuggestion()` back the "no results — press Enter to create" affordance.
- **Highlight fidelity:** highlights are driven by the scorer's `matches` offsets (`renderResults`), so the emphasized characters are *exactly* the ones that earned the score — not a naive re-`indexOf`. Contiguous runs score higher, so word-start and consecutive matches float up.
- **Instruction footer:** `setInstructions([...])` renders the persistent `.prompt-instructions` legend of key hints — cheap discoverability without a manual.
- **Focus & dismissal:** opening steals focus into `.prompt-input`; `Esc` closes and returns focus to the prior leaf; selection is a roving highlight (`.is-selected`) kept in view on `↑/↓` (auto-scroll). Clicking a row and keyboard-choosing route through the same `selectSuggestion` path.
- **Scale guardrails:** the 10k-item switcher downgrade and the `prepareSimpleSearch` vs `prepareFuzzySearch` split are deliberate — fuzzy scoring every candidate on every keystroke is O(n·m) and gets throttled in huge vaults.
- **Deprioritize, don't hide:** excluded files sink to the bottom rather than vanishing, so an explicit query can still reach them.
- **Search context snippets:** each result shows a trimmed line with the match centered and highlighted, and per-file grouping is collapsible so a 200-hit result stays scannable.

### For Coal

- **Reframe the minibuffer quick-open as Coal's `SuggestModal` analog.** Coal already has the right shape — `src/renderer/ui/minibuffer.ts` renders a vertico-style vertical candidate list without stealing editor focus. Formalize an internal `SuggestSession` abstraction mirroring `getSuggestions`/`renderRow`/`onChoose(item, evt)` so quick-open, M-x, and future pickers share one keyboard/rendering core. Keep it in the bottom minibuffer (do **not** adopt Obsidian's centered `.modal.prompt`) — that's Coal's Emacs-echo-area identity.
- **Replace basic substring with a real fuzzy scorer.** Today matching is substring-only. Port the `prepareFuzzySearch` idea: a scorer returning `{ score, matches: [start,end][] }` over each candidate, then sort by score. Use the `matches` ranges to wrap hit characters in a `.coal-suggest-highlight` span (Coal's `renderResults` equivalent) so emphasis matches the score. Add a `prepareSimpleSearch`-style cheap path and a candidate-count threshold (Obsidian's 10k) to stay responsive on large vaults.
- **Fuzzy-match title *and* alias, insert UUIDs.** Coal's quick-open already shows note titles and inserts UUIDs — extend the candidate text to include frontmatter aliases (Coal has a typed-object/frontmatter layer as of v0.18.0), rendering the matched alias as the row title with the filename subdued, exactly like Obsidian.
- **Empty-query recents + create-on-enter.** Make an empty quick-open list most-recently-visited notes (enables the `M-x`-open → `Down` → `Enter` flip). When the query matches nothing, `Enter` should mint a new note titled by the query (byte-for-byte save, SPEC §14; §10 markdown-as-truth); reserve a modifier (e.g. `Shift+Enter`) for force-create-exact-name. Coal has no tabs/splits yet, so skip `Cmd+Enter`-new-tab until the split-pane roadmap lands — but thread the key event through `onChoose(item, evt)` now so the modifier hook exists.
- **Add candidate annotations + an instruction legend.** Coal's candidates currently have no annotations. Add a secondary/aux column (folder path, or match kind) and a `setInstructions`-style hint row in the minibuffer (`↵ open · ↵ create · esc cancel`) for discoverability — vanilla DOM, no framework (SPEC §13).
- **Build a Search command, not a slash grammar.** Introduce `M-x` commands "Search in all files" and "Search current file" (SPEC §3 forbids slash). Current-file search should drive CM6's `@codemirror/search` panel (already wired for `C-s`/`C-r`); vault-wide search should populate the roadmap's collapsible right sidebar (where backlinks is headed) with **grouped-by-note, collapsible, context-snippet** results and roving keyboard selection like the backlinks navigator.
- **Adopt the operator grammar incrementally, markdown-native.** Start with the cheap, high-value operators that map to Coal's index: `path:`, `file:`, `tag:`, quoted phrases, `-` negation, `OR`, and `/regex/`. Layer `line:`/`section:`/`block:` (Coal already has per-block `^id:` structure to anchor `block:`) and `[property]` (Coal's EAV tables from v0.18.0 make `[key:value]` and `[key:null]` nearly free) as the metadata layer matures.
- **Ship the "search-as-query" embed later, edit-only-safe.** Obsidian's `query` code block is read-mode-only; Coal is edit-only (SPEC §13), so a live-rendering embed conflicts with the marker-hiding live-preview model. Defer it, or realize it as a keyboard action ("Insert search results at point") that materializes a `[[uuid]]` list into the buffer — keeping markdown as the single source of truth.

**Sources:** https://help.obsidian.md/plugins/quick-switcher (→ https://obsidian.md/help/plugins/quick-switcher) · https://help.obsidian.md/plugins/search (→ https://obsidian.md/help/plugins/search) · https://docs.obsidian.md/Reference/TypeScript+API/SuggestModal · https://docs.obsidian.md/Reference/TypeScript+API/FuzzySuggestModal · https://docs.obsidian.md/Reference/TypeScript+API/FuzzyMatch · https://docs.obsidian.md/Reference/TypeScript+API/prepareFuzzySearch · https://docs.obsidian.md/Reference/TypeScript+API/prepareSimpleSearch · https://docs.obsidian.md/Reference/TypeScript+API/SearchResult · https://docs.obsidian.md/Reference/TypeScript+API/SearchMatches · https://docs.obsidian.md/Reference/TypeScript+API/SearchMatchPart · https://docs.obsidian.md/Reference/TypeScript+API/renderResults · https://docs.obsidian.md/Plugins/User+interface/Modals · https://docs.obsidian.md/Reference/CSS+variables/Components/Modal

---

## 4. The Markdown editor — Live Preview, Source & Reading views (and inline autocomplete)

The editor is Obsidian's centerpiece: a single CodeMirror 6 (CM6) surface that can render Markdown *inline while you type* (Live Preview), show it verbatim (Source mode), or fully render it read-only (Reading view). What makes Obsidian *feel* fast and "WYSIWYG-but-still-text" is that Live Preview is not a separate renderer — it is a set of CM6 **view decorations** that hide syntax markers and swap in rendered widgets everywhere *except* the cursor/selection line, so editing and reading collapse onto one surface with zero mode-switch latency. Coal already copied this exact model (marker-hiding decorations that reveal on the cursor line); this section names the underlying constructs precisely so Coal can extend them toward parity.

### How Obsidian does it

**Three surfaces, one document.**
- **Editing view** has two sub-modes: **Live Preview** (default) and **Source mode**. **Reading view** is a third, fully-rendered read-only surface. The document text is identical across all three — only the presentation layer differs.
- **Default mode** is set at **Settings → Editor → Default editing mode** (Live Preview by default). The distinction: Live Preview "shows formatted text inline while hiding most Markdown syntax; when your cursor enters formatted content the underlying syntax becomes visible." Source mode "displays all Markdown syntax exactly as written."
- **Switching commands / hotkeys:**
  - `Ctrl+E` (macOS `Cmd+E`) is the default hotkey bound to the command **"Toggle Reading view"** — it flips between Editing view and Reading view.
  - A separate command **"Toggle Live Preview/Source mode"** flips the two editing sub-modes; it has *no default hotkey* (users assign one in **Settings → Hotkeys**).
  - The **view switcher** icon (book icon = go to Reading; pencil icon = go to Editing) sits in the tab title bar's top-right; a **status-bar** toggle also exists. These require **Settings → Appearance → Show tab title bar** and/or **Settings → Editor → Show editing mode in status bar** to be visible.
  - **`Ctrl/Cmd`-click the view switcher** opens Editing and Reading *side by side* in a split (two linked leaves on the same file).

**Live Preview is CM6 decorations, not a renderer.**
- An **Obsidian editor extension *is* a CM6 extension.** Plugins add them with **`registerEditorExtension(extension[])`** (called in `onload`), which accepts an array of CM6 `Extension` objects (view plugins, state fields, facets, etc.).
- The two building blocks are **view plugins** (`ViewPlugin.fromClass`, tied to the visible viewport) and **state fields** (`StateField`, part of `EditorState`). Guidance from the docs, quoted precisely: a **view plugin** *"runs after the viewport has been recomputed"* — so it can **read** the viewport but **"can't make any changes that would impact the viewport."** When your decorations *"impact the vertical layout of the editor, by for example inserting blocks and line breaks, you need to use a state field."* In short: view-plugin decorations are the fast default (only the visible ranges are decorated, rebuilt as you scroll); reach for a state field when decorations must survive outside the visible slice or restructure the document's vertical layout.
- Decorations come in four kinds (`@codemirror/view`):
  - **`Decoration.mark({class})`** — style an existing text range (e.g. add `.cm-strong` to `**bold**`'s inner text).
  - **`Decoration.replace({widget})`** — *hide or replace* a range with a widget; this is how syntax markers (`**`, `#`, `[[...]]`) are made to disappear and how inline widgets (rendered links, embeds) are injected.
  - **`Decoration.widget({widget, side})`** — insert a widget at a point without removing text.
  - **`Decoration.line({class})`** — style a whole line (e.g. `.cm-line` list/heading classes).
- Custom rendered elements extend **`WidgetType`** and implement **`toDOM(view): HTMLElement`**:
  ```ts
  import { EditorView, WidgetType } from '@codemirror/view';
  export class EmojiWidget extends WidgetType {
    toDOM(view: EditorView): HTMLElement {
      const span = document.createElement('span');
      span.innerText = '👉';
      return span;
    }
  }
  // Decoration.replace({ widget: new EmojiWidget() })
  ```
- Decorations are assembled with **`RangeSetBuilder<Decoration>`** — `builder.add(from, to, decoration)` in ascending order, then `builder.finish()` returns a **`DecorationSet`**. A state field exposes it via `provide: f => EditorView.decorations.from(f)`; a view plugin exposes it via its `PluginSpec` `{ decorations: v => v.decorations }`.
- **The cursor-reveal mechanism** (the heart of Live Preview): the extension reads the current **selection ranges** from the transaction/state and *skips emitting the hide/replace decorations for the line(s) the cursor or selection touches*, so raw Markdown re-appears around the caret. Widgets that must not be "entered" by the caret mark their ranges **atomic** (`EditorView.atomicRanges`) so arrow keys jump over them as a unit rather than landing inside hidden syntax.
- **Viewport awareness:** CM6 only renders "what's visible (and a little bit more)"; the viewport is a moving window recomputed on scroll or doc change. View-plugin decorations are rebuilt against that window, which is why huge notes stay smooth.

**The Editor API — a CM5/CM6-agnostic wrapper.**
- Obsidian exposes an **`Editor`** abstraction (over the raw CM6 `EditorView`) so plugins don't touch CM internals for common ops. Key methods:
  - **`getCursor()`** → `EditorPosition` (`{line, ch}`); `setCursor()`.
  - **`getSelection()`** / **`replaceSelection(text)`** — read/replace the current selection.
  - **`replaceRange(text, from, to?)`** — replace between two positions; with one position it inserts.
  - `getLine(n)`, `getValue()`/`setValue()`, `offsetToPos()`/`posToOffset()`, `getRange()`, plus `transaction()` for batched edits.
  - **`editor.cm`** is the (undocumented) escape hatch to the underlying CM6 `EditorView` (`state`, `dispatch`, transactions) for anything the wrapper doesn't cover. It is *not* part of the public typed `Editor` API — the docs explicitly steer plugins to the `Editor` abstraction (it *"serves as an abstraction to bridge features between CM6 and CM5"*), so treat `editor.cm` as unsupported and version-fragile.
- The `MarkdownView` hosts the editor; `view.editor` is how commands reach it. Example (insert date):
  ```ts
  const cursor = editor.getCursor();
  editor.replaceRange(moment().format('YYYY-MM-DD'), cursor);
  ```

**Reading view — a separate HTML render pipeline.**
- Reading view converts Markdown → HTML, then runs registered **Markdown post-processors** over the DOM. **`registerMarkdownPostProcessor((el, ctx) => …)`** gets the rendered `HTMLElement` and a `MarkdownPostProcessorContext`; it can add/remove/replace nodes (e.g. scan `<code>` and swap emoji shortcodes).
- **`registerMarkdownCodeBlockProcessor('lang', (source, el, ctx) => …)`** renders a fenced block of a given language into custom DOM (the mechanism Mermaid/Dataview use).
- To render Markdown yourself, **`MarkdownRenderer.render(app, markdown, el, sourcePath, component)`** (older alias `renderMarkdown(markdown, el, sourcePath, component)`) writes rendered HTML into `el`. Lifecycle for child renders is managed by extending **`MarkdownRenderChild`** (register it via `ctx.addChild()`), which ties DOM cleanup to `onunload`.
- **Embeds / transclusions** (`![[note]]`, `![[note#heading]]`, `![[image.png]]`) render as widgets in Live Preview and as embedded containers in Reading view — recursively invoking the render pipeline for the embedded file.

**Inline autocomplete — `EditorSuggest`.**
- The `[[wikilink]]`, `#tag`, and front-matter completion popovers are all instances of the abstract **`EditorSuggest<T>`**, registered with **`registerEditorSuggest(new MySuggest(app))`**. Signature surface:
  ```ts
  abstract onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null)
    : EditorSuggestTriggerInfo | null;
  abstract getSuggestions(context: EditorSuggestContext): T[] | Promise<T[]>;
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void;
  ```
  (`onTrigger` and `getSuggestions` are the abstract members declared on `EditorSuggest` itself; `renderSuggestion` and `selectSuggestion` are the abstract members it inherits from the `PopoverSuggest` base.)
- **`onTrigger`** runs *on every keypress* — it inspects the line text before the cursor (typically a regex), and returns `null` fast if it shouldn't fire. When it should, it returns **`EditorSuggestTriggerInfo { start: EditorPosition; end: EditorPosition; query: string }`** — `start`/`end` bound the text to be *replaced* on accept and are used to **position the popover**; `query` is the filter string.
- **`getSuggestions(context)`** receives **`EditorSuggestContext`** (which *extends* `EditorSuggestTriggerInfo` and adds `editor: Editor` and `file: TFile`), filters candidates by `context.query`, returns up to **`limit`** items (a settable property on the suggest).
- **`renderSuggestion(value, el)`** paints each row's DOM (title + secondary/annotation text); **`selectSuggestion(value, evt)`** performs the insert — usually `editor.replaceRange(finalText, context.start, context.end)`, replacing the whole trigger region.
- The popover is a floating list anchored to `start`; ↑/↓ move the active row, `Enter`/`Tab` accept, `Esc` dismisses. `setInstructions(Instruction[])` (inherited from `PopoverSuggest`) prints the footer hint row. `EditorSuggest` and its `EditorSuggestContext` / `EditorSuggestTriggerInfo` interfaces are part of the public plugin API; the whole suggester is torn down automatically because `registerEditorSuggest` ties it to the plugin's `Component` lifecycle (unregistered on `onunload`).

**Ergonomics baked into the editor.**
- **Vim mode:** **Settings → Editor → Vim key bindings** turns on CM6's Vim keymap (normal/insert/visual, `:` ex-commands). Native fold verbs (`za`/`zo`/`zc`/`zR`/`zM`) are *not* built in; users bridge them to Obsidian commands (`editor:toggle-fold`, `editor:fold-all`, `editor:unfold-all`) via the community *vimrc-support* plugin.
- **Folding:** **Settings → Editor → Fold heading** and **Fold indent** enable gutter fold arrows; command **`editor:toggle-fold`** ("Toggle fold") folds the section/list at the cursor; **`editor:fold-all`** / **`editor:unfold-all`** operate document-wide.
- **Readable line length:** **Settings → Editor → Readable line length** centers content and caps width via **`--file-line-width`** (default `700px`; the variable was renamed from the older `--line-width`, so pre-1.0 snippets break, and current builds may need `!important` to override it — e.g. `body { --file-line-width: 750px !important; }`, or use `rem` to size by character count). Related editor vars: **`--file-margins`**, **`--file-folding-offset`**, and header vars **`--file-header-font-size` / `--file-header-font-weight` / `--file-header-border` / `--file-header-justify`**.

### Details that make it feel polished

- **Zero-flicker mode switching:** because Live Preview and Source are the *same* CM6 instance with decorations on/off, toggling is instant and preserves scroll + selection. Reading view is a distinct DOM tree, so Obsidian keeps scroll position synced when you flip with `Ctrl+E`.
- **Caret-line reveal is per-*line*, not per-token:** the entire line under the cursor shows raw syntax (so you can edit any marker on it), while every other line stays rendered — this is what stops the "syntax flickering as I move the mouse" feeling.
- **Atomic widgets:** rendered links/embeds are atomic ranges, so Left/Right arrow and `Backspace` treat a `[[Long Note Title]]` as one glyph — the caret never gets "stuck" inside hidden UUID/URL text. Deleting once removes the whole construct.
- **Selection expands syntax too:** selecting across a bold span reveals its `**` markers, so copy/cut grabs the true Markdown, preserving byte-fidelity.
- **Suggest popover niceties:** it auto-flips above the caret near the viewport bottom, scrolls the active row into view, debounces async `getSuggestions`, shows an empty-state / "no matches", and highlights the matched substring in each row. `onTrigger` returning `null` early keeps typing latency invisible even though it fires per keystroke.
- **Embeds render lazily** within the viewport and show a placeholder while loading; broken embeds render an "unresolved" affordance rather than throwing.
- **Reading view post-processing is incremental** — processors run per rendered section as you scroll, not once over the whole doc, keeping long notes responsive.
- **Line-length + typography** respond live to font-size/zoom because widths are `ch`/`rem`-relative variables, so changing `--font-text-size` reflows without a reload.

### For Coal

- **Keep the one-surface model; name the constructs.** Coal's Live Preview already *is* CM6 decorations revealing on the cursor line — formalize it around **`Decoration.replace`** (marker/URL/`^id:` hiding + wikilink widgets), **`Decoration.mark`** (monochrome `--coal-*` syntax classes), and a **`WidgetType`** per rendered construct, built with **`RangeSetBuilder`**. Decide view-plugin (viewport, fast) vs state-field (persistent) per decoration exactly as the docs prescribe.
- **Add Source mode as a decoration *toggle*, not a new view.** A single boolean facet that suppresses all hide/replace decorations gives Coal "Source mode" for free, on the same CM6 instance — expose it as an **M-x command** ("Toggle Live Preview/Source mode"), no slash. This respects edit-only (SPEC §13): it's still editing, just un-decorated. **Do NOT build Reading view** — it's an HTML render pipeline (`MarkdownRenderer`/post-processors) that contradicts Coal's edit-only scope; note it here only as the deliberate boundary.
- **Make wikilink/`^id:` widgets atomic.** Wire `EditorView.atomicRanges` so arrow keys and Backspace treat a rendered `[[uuid|alias]]` as one unit — this is the single biggest "feel" upgrade over the current reveal-only decorations, and it protects the hidden-UUID invariant (§9) from accidental mid-token edits.
- **Upgrade `[[` autocomplete toward `EditorSuggest` semantics.** Coal uses `@codemirror/autocomplete` today; keep that engine but adopt Obsidian's *contract*: an `onTrigger`-style detector that returns a `{start, end, query}` region, filter to the note index, **insert UUID via `replaceRange`-equivalent** over the whole region, and **render titles + a secondary annotation** (path/type) per row — closing Coal's "no candidate annotations" gap. Extend the same pattern to a future `#tag` and front-matter-prop suggester feeding the typed-object index (§11).
- **Cursor-line reveal + selection reveal:** ensure selecting across a construct expands its markers so cut/copy stays byte-faithful (§14) — a correctness requirement, not just polish.
- **Fold + readable width as M-x + tokens.** Add `@codemirror/fold` bound to M-x "Toggle fold"/"Fold all"/"Unfold all" (mirror IDs `editor:toggle-fold` etc.), and expose a **`--coal-file-line-width`** token (Obsidian's `--file-line-width` analog, default ~`700px`/`70rem`) in `docs/theming.md`, wired to a Settings → Appearance control. Keep body monospace so `rem`/`ch` width ≈ character count (matches Coal's `--coal-font-mono` decision).
- **Vim mode (post-v1, optional):** CM6 ships `@codemirror/vim`; since Coal is Emacs-lineage this is low priority, but if added, bridge fold verbs to the same M-x commands rather than native `za`/`zo`.
- **Editor API shim:** wrap raw `EditorView` transactions in a tiny Coal `editor` helper mirroring `getCursor`/`replaceRange`/`replaceSelection`/`getLine` so M-x command implementations (src/renderer/commands.ts) stay off CM internals and edits remain byte-for-byte (§14).

**Sources:** https://obsidian.md/help/edit-and-read · https://docs.obsidian.md/Plugins/Editor/Editor+extensions · https://docs.obsidian.md/Plugins/Editor/Decorations · https://docs.obsidian.md/Plugins/Editor/Viewport · https://docs.obsidian.md/Plugins/Editor/View+plugins · https://docs.obsidian.md/Plugins/Editor/State+fields · https://docs.obsidian.md/Plugins/Editor/Editor · https://docs.obsidian.md/Reference/TypeScript+API/Editor · https://docs.obsidian.md/Plugins/Editor/Markdown+post+processing · https://docs.obsidian.md/Reference/TypeScript+API/MarkdownRenderer · https://docs.obsidian.md/Reference/TypeScript+API/EditorSuggest · https://docs.obsidian.md/Reference/TypeScript+API/EditorSuggestContext · https://docs.obsidian.md/Reference/TypeScript+API/EditorSuggestTriggerInfo · https://docs.obsidian.md/Reference/CSS+variables/Editor/File · https://forum.obsidian.md/t/what-are-the-fold-unfold-keybinds-in-vim-mode/31333

---

## 5. File explorer & vault navigation

The **File explorer** is Obsidian's primary spatial-navigation surface: a core plugin that renders the vault's folder hierarchy as a collapsible tree in the left sidebar, and the anchor for almost every file operation (create, rename, move, delete, bookmark, reveal). Alongside it live two sibling navigation views — **Bookmarks** and **Tags** — that offer non-hierarchical entry points into the same vault. Because Coal today ships only a *flat* file-name list with no folders, no context menu, and no create/rename/move affordances, this is the single largest UX gap between Coal and Obsidian, and the one users notice first. What makes it *feel* right in Obsidian is not the tree itself but the density of micro-interactions layered on it: indent guides, collapse arrows, inline rename editing, drag-and-drop with folder auto-expand, auto-reveal, and a right-click menu that is the discoverable home for everything.

### How Obsidian does it

**The view, class model, and data source.**
- The File explorer is a **core plugin** whose view registers under the view type string `file-explorer` (Bookmarks = `bookmarks`, Tags/Tag pane = `tag`, Search = `search`, Backlinks = `backlink`, Outline = `outline`). Custom plugin views are registered the same way via `Plugin.registerView(type, (leaf) => new MyView(leaf))`, where the view extends **`ItemView`** and implements `getViewType()`, `getDisplayText()`, and `getIcon()`; it lives inside a **`WorkspaceLeaf`** and is shown with `workspace.getLeftLeaf(false)` → `leaf.setViewState({type, active})` → `workspace.revealLeaf(leaf)`, and located again with `workspace.getLeavesOfType('file-explorer')`.
- The tree is a projection of the **`Vault`** abstract file tree. Every node is a **`TAbstractFile`**, subclassed as **`TFile`** (leaf) or **`TFolder`** (branch). Key shape: `TAbstractFile` has `path`, `name`, `parent: TFolder | null`, `vault`; `TFile` adds `basename`, `extension`, and `stat: FileStats` (`stat.ctime`, `stat.mtime`, `stat.size`); `TFolder` adds `children: TAbstractFile[]` and `isRoot()`. Enumerate with `vault.getFiles()`, `vault.getMarkdownFiles()`, `vault.getAllLoadedFiles()`, and look up by path with `vault.getAbstractFileByPath(path)`, `vault.getFileByPath(path)` (null if missing), `vault.getFolderByPath(path)`.
- The explorer stays live by subscribing to vault events: `vault.on('create' | 'modify' | 'delete' | 'rename', cb)` (unsubscribe with `off`, or auto-clean via `registerEvent`). Rename/move both surface as the `'rename'` event carrying the old path.

**Creating, renaming, moving, deleting.**
- **New note** — the "New note" button at the top of the pane, or right-click a folder → **New note**, creates the file *inside* that folder; the global "Create new note" command (command id **`file-explorer:new-file`**, **bound to Ctrl/Cmd-N by default**) creates in the configured default location (Settings → Files & Links → "Default location for new notes": vault root / same folder as current / a specified folder). The destination folder for programmatic creation is resolved by **`FileManager.getNewFileParent(sourcePath)`**, then written with **`Vault.create(path, data)`** / **`Vault.createFolder(path)`**. (`Vault.createBinary(path, data)` is the attachment/binary counterpart, and `FileManager.getAvailablePathForAttachment(name)` resolves a collision-free attachment path.)
- **New folder** — the "New folder" button makes a root folder; right-click folder → **New folder** makes a subfolder.
- **Rename** — right-click → **Rename**, or click the selected item, edits the name *inline* (the label becomes an editable field); Enter commits. Renames route through **`FileManager.renameFile(file, newPath)`**, which is the safe path: it moves the file *and rewrites every inbound `[[wikilink]]`/markdown link* across the vault per the user's "Automatically update internal links" setting. (`Vault.rename` is the low-level move that does **not** fix links — plugins are told to prefer `FileManager.renameFile`.)
- **Move** — either drag the file onto a folder, or right-click → **Move file to...** which opens a fuzzy folder-search modal. Moving is just a rename to a new parent path, so it also goes through `FileManager.renameFile` and updates links.
- **Delete** — right-click → **Delete** (with optional confirmation dialog; `FileManager.promptForDeletion(file)` is the API that raises that confirm prompt). Deletion honors the "Deleted files" setting: **`Vault.trash(file, system)`** (the `system` boolean chooses OS/system trash vs. the vault-local `.trash/` folder) or the higher-level, preference-honoring **`FileManager.trashFile(file)`**; `Vault.delete(file, force)` is permanent (irrecoverable). `Vault.copy(file, newPath)` duplicates a file or folder.
- **Frontmatter-safe edits** — plugins that must touch YAML do so atomically with **`FileManager.processFrontMatter(file, (fm) => { ... })`** (read-modify-write of the frontmatter object) rather than string-splicing — directly relevant to Coal's markdown-as-truth rule.

**Drag-and-drop.**
- Files/folders drag onto folders to move; a folder hovered during a drag **auto-expands** after a short dwell so you can drop into collapsed subtrees. Multi-select drag is supported. Dragging a file *into the editor* inserts a link (via `FileManager.generateMarkdownLink(file, sourcePath, subpath?, alias?)`), and dragging into the Bookmarks pane reorders bookmarks.
- **Multi-select** in the tree: **Alt/Opt-Click** toggles individual items into the selection; **Shift-Click** selects a contiguous range. The whole selection is then draggable / right-clickable as a unit.

**Context menu (the discoverability hub).**
- Right-click builds a **`Menu`**: `new Menu()`, `.addItem(item => item.setTitle(..).setIcon(..).onClick(..))`, `.addSeparator()`, shown with `.showAtMouseEvent(evt)` or `.showAtPosition({x, y})`. Plugins inject items by subscribing to the workspace **`'file-menu'`** event: `this.registerEvent(this.app.workspace.on('file-menu', (menu, file, source) => menu.addItem(...)))` (the editor equivalent is **`'editor-menu'`** with `(menu, editor, view)`). Standard file items: Open in new tab / split / new window, **New note**, **New folder**, **Rename**, **Delete**, **Move file to...**, **Bookmark**, **Copy Obsidian URL**, **Reveal in system explorer**.

**Sort, collapse, reveal — the top-bar affordances.**
- **Change sort order** button: by **File name (A→Z / Z→A)**, **Modified time (new→old / old→new)**, **Created time (new→old / old→new)**. Folders sort above files.
- **Expand all** / **Collapse all** buttons act on the entire tree at once. (Notably these are *buttons, not bindable core commands* — a long-standing gap the community "Collapse All" plugin fills with hotkeyable commands.)
- **Auto-reveal active file** toggle (top of pane, shipped in **desktop v1.8.2, 22 Jan 2025** — changelog: "Added a new File Explorer option to auto-reveal the active file"): opening any note scrolls the tree to it and highlights it. The manual counterpart is the command **`file-explorer:reveal-active-file`** ("File explorer: Reveal active file in navigation") — *unbound by default*; it also **moves focus into the tree** (a known footgun: a subsequent Delete can hit the file, not the editor — and on large vaults it sometimes needs a second invocation to land on the correct row). Contrast this with the New-note command **`file-explorer:new-file`**, which *is* bound (Ctrl/Cmd-N) out of the box.

**Bookmarks pane (view type `bookmarks`).**
- Bookmarkable item types: **files, folders, searches, graphs (not local graph), headings, blocks, and web links** (with Web viewer). Create via right-click → **Bookmark** in the explorer; "Bookmark the active tab" button in the pane; or command palette. Heading/block bookmarks use **"Bookmark heading under cursor"** / **"Bookmark block under cursor"** commands. The "Add bookmark" dialog lets you set an optional **custom title** and target **group**.
- **Bookmark groups** are collapsible/expandable folders inside the pane ("New bookmark group" button); bookmarks and groups are **reorderable by drag-and-drop**; right-click → **Remove**. Multi-bookmark via Alt/Shift-select then right-click → Bookmark. Open the pane with **"Bookmarks: Show bookmarks"**. Persistence: stored in **`.obsidian/bookmarks.json`** (a vault config file, not the notes).

**Tags pane (view type `tag`).**
- The **Tags view** (core plugin id `tag`, view type `tag`) lists every tag in the vault with per-tag note counts, opened via **"Tags view: Show tags"**. Tags come from two sources: **inline `#tag`** in body text and the frontmatter **`tags`** property (YAML list). **Nested tags** use `/` (`#inbox/to-read`) and render as a collapsible hierarchy; a parent query (`tag:#inbox`, or the `#`-less `tag:inbox`) matches all descendants such as `#inbox/to-read`. The pane's own controls: **Change sort order** (by tag name or by frequency), **Show nested tags** (tree vs. flat list), and **Expand all** / **Collapse all** for the hierarchy. Tag rules: case-insensitive (display uses the first-seen casing — create `#Tag` first and `#tag`/`#TAG` all render as `#Tag`); no spaces (use camelCase/snake_case/kebab-case); must contain at least one non-numeric character (`#1984` is invalid, `#y1984` is valid); slashes, underscores, hyphens, and Unicode/emoji are allowed. Clicking a tag runs a `tag:` search in the Search pane.

**Recent files & vault-level navigation.**
- "Recent files" is *not* core (community plugin territory) — the core recency surface is the **Quick switcher** (command `switcher:open`, **Ctrl/Cmd-O**), which fuzzy-searches file names and can **create a note if none matches** (Enter on a non-existent name).
- **Manage vaults / vault switcher**: each vault is an independent folder; the vault switcher (bottom-left "Open another vault") lists known vaults and opens a new window per vault. There is no cross-vault tree.

### Details that make it feel polished

- **Indent guides & collapse chevrons.** Nesting is drawn with `--nav-indentation-guide-width` / `--nav-indentation-guide-color` vertical rules, and each folder has a rotating collapse chevron colored by `--nav-collapse-icon-color` (and `--nav-collapse-icon-color-collapsed`). Child rows indent via `--nav-item-children-padding-start` / `--nav-item-children-margin-start` (parent rows via `--nav-item-parent-padding`). The whole look is tunable through the **Navigation** CSS-variable family (documented under *CSS variables → Components → Navigation*): `--nav-item-size`, `--nav-item-color` / `-hover` / `-active` / `-selected` / `-highlighted`, `--nav-item-background-hover` / `-active` / `-selected`, `--nav-item-padding`, `--nav-item-weight` / `-hover` / `-active`, `--nav-item-white-space`, and the heading vars `--nav-heading-color` / `-hover` / `-collapsed` / `-colapsed-hover` (note Obsidian's own misspelling of the last) and `--nav-heading-weight` / `-hover`. The separate *CSS variables → Plugins → File explorer* page is thin — it only exposes the **vault-profile** footer (`--vault-profile-display`, `--vault-profile-color` / `-hover`, `--vault-profile-font-size` / `-weight`, `--vault-profile-actions-display`), so the tree itself is themed almost entirely through the shared `--nav-*` tokens.
- **Selection vs. active vs. hover are three distinct states.** The open note gets the "active" style; a keyboard/click-selected row gets "selected"; pointer hover gets "hover" — each is a separate variable pair so themes can distinguish "what's open" from "what's focused."
- **Inline rename, not a modal.** Renaming happens *in place* — the label morphs into a text input with the basename pre-selected (extension preserved), so the eye never leaves the row. Escape cancels; Enter commits; a name collision is rejected in place.
- **Drag folder auto-expand & drop targets.** Hovering a collapsed folder mid-drag expands it after a dwell; valid drop targets highlight; dropping onto the current parent is a no-op.
- **Auto-reveal scroll + highlight** smoothly scrolls the tree and flashes/holds the highlight on the active file, and gracefully no-ops for files not in the tree (e.g., outside the vault).
- **Empty & first-run states.** A brand-new vault shows an explorer that is not blank-and-confusing: the New note / New folder buttons are the obvious call to action; the Bookmarks and Tags panes show short "nothing here yet" copy rather than an empty box.
- **Folders sort above files; stable within-group ordering** so the tree doesn't visually churn when mtime changes on save.
- **Link-safety is invisible but load-bearing.** Because rename/move route through `FileManager.renameFile`, moving a note never silently breaks `[[links]]` — the polish is the *absence* of broken links after reorganizing.
- **Focus discipline.** Reveal-active-file intentionally moves focus into the tree for keyboard users, but this is exactly the interaction Coal must design carefully (see the delete-race footgun above) so keyboard focus is predictable.

### For Coal

- **Replace `renderFileList`'s flat list with a real folder tree.** Build a recursive vanilla-DOM tree in `src/renderer/index.ts` (a new `src/renderer/ui/fileTree.ts`) mirroring Obsidian's node model: fold the vault's file paths into a `TFolder`/`TFile`-shaped in-memory structure (`{name, path, children, isFolder}`), render `<div class="coal-nav-folder">` / `coal-nav-file` rows with a collapse chevron per folder and children in a nested container. Adopt Obsidian's class/variable *names* so `docs/theming.md` can expose them: define `--coal-nav-item-*`, `--coal-nav-indentation-guide-width/-color`, and `--coal-nav-collapse-icon-color` tokens paralleling `--nav-*`, so themes (light-mode/dark-mode/lemon-lime) style the tree for free.
- **Keep it keyboard-first (SPEC §1).** Implement a single **roving-tabindex** selection over tree rows (reuse the pattern already in `backlinks.ts`): Up/Down move selection, Right expands / Left collapses (Left on a leaf jumps to its parent, Emacs/`nav`-tree convention), Enter opens the file, Space toggles fold. Persist expand/collapse state so the tree doesn't reset. Provide M-x commands — **not** slash and **not** a right-click-only path — for every affordance: `coal-new-note`, `coal-new-folder`, `coal-rename`, `coal-move-file`, `coal-delete`, `coal-reveal-active-file`, `coal-collapse-all`, `coal-expand-all`, `coal-cycle-sort-order`. Route them through the existing minibuffer so users get quick-open-style prompts (e.g. Move → fuzzy folder picker in the minibuffer, matching Obsidian's "Move file to..." modal). This is where Coal can *beat* Obsidian: make Collapse-all/Expand-all/Reveal real bindable commands from day one (Obsidian only ships them as buttons).
- **Inline rename in the tree**, not a modal: swap the selected row's label for an `<input>` with the basename pre-selected, Enter commits, Escape cancels — driven from `coal-rename`.
- **All mutations must preserve markdown-as-truth (SPEC §10, §14) and the index-is-derived rule.** New note = write a `.md` byte-for-byte (LF, one trailing newline) then let the chokidar watcher + index rebuild pick it up; rename/move must **rewrite inbound `[[uuid]]` links** — but Coal links are UUID-based, so a *path* rename does **not** require link rewriting (a major simplification over Obsidian's path-based links): update the file path in the index, leave link bodies untouched. Deletion should use Electron `shell.trashItem` (system trash) rather than hard-unlink, mirroring `Vault.trash`. Any frontmatter touch (e.g. minting `id:`) must be atomic and frontmatter-safe like `processFrontMatter`, reusing Coal's existing frontmatter-safe writer, never a naive string splice.
- **Context menu as an optional accelerator, not the only path.** A right-click `Menu` is fine for mouse users (build a small vanilla-DOM menu component; Obsidian's `Menu`/`showAtPosition` is the model), but every item must have an M-x twin so the keyboard remains first-class. Wire folder-scoped items (New note *here*, New folder *here*, Rename, Move, Delete, Bookmark).
- **Sort order + auto-reveal.** Add a sort-order toggle (name / mtime / ctime, asc/desc) persisted in the app-global prefs alongside `autoOpenLastVault`; folders sort above files; keep within-group order stable so saves don't reshuffle the tree. Add an **auto-reveal** pref (Settings › Appearance) plus the `coal-reveal-active-file` command — but, per Coal's keyboard focus discipline, default reveal to *scroll+highlight without stealing editor focus* (avoid Obsidian's delete-race footgun); make focus-transfer a separate explicit command.
- **Bookmarks & Tags panes as future sidebar views.** When Coal grows a collapsible right sidebar (already on the roadmap for the backlinks navigator), model Bookmarks and Tags as sibling keyboard-first panes reusing the same roving-selection tree component. Store bookmarks in `<vault>/.coal/` config (analogous to `.obsidian/bookmarks.json`) — **git-ignored derived/config data, never mixed into note bodies**. A Tags pane can be derived from the existing in-memory index (extend the EAV/`objectTypes` tables to index `#tags` + frontmatter `tags`), rendering nested `a/b/c` tags as a collapsible hierarchy; clicking/Enter runs a tag query through the minibuffer. Recent-files is cheaply a minibuffer quick-open sorted by mtime — lean on the existing quick-open rather than a new pane.
- **Naming parity for themability:** expose the tree's tokens in `docs/theming.md` and bind highlight/selection to the existing `--coal-accent`/`--coal-caret` family so the file tree participates in the named-theme system automatically.

**Sources:**
- https://obsidian.md/help/plugins/file-explorer (File explorer help; multi-select, sort orders, auto-reveal toggle)
- https://obsidian.md/help/plugins/bookmarks (Bookmarks item types, commands, groups)
- https://obsidian.md/help/tags (Tags: sources, nested tags, tag rules)
- https://docs.obsidian.md/Reference/TypeScript+API/Vault (Vault query/mutation/event methods)
- https://docs.obsidian.md/Reference/TypeScript+API/FileManager (renameFile/getNewFileParent/processFrontMatter/generateMarkdownLink/trashFile/promptForDeletion)
- https://docs.obsidian.md/Reference/TypeScript+API/TFile (TFile / TAbstractFile properties)
- https://docs.obsidian.md/Reference/TypeScript+API/TFolder (TFolder children / isRoot)
- https://docs.obsidian.md/Reference/CSS+variables/Components/Navigation (full --nav-* variable list)
- https://docs.obsidian.md/Reference/CSS+variables/Plugins/File+explorer (--vault-profile-* only)
- https://docs.obsidian.md/Plugins/User+interface/Views (ItemView, registerView, setViewState/revealLeaf/getLeavesOfType)
- https://docs.obsidian.md/Plugins/User+interface/Context+menus (Menu API, file-menu/editor-menu events)
- https://obsidian.md/changelog/2025-01-22-desktop-v1.8.2/ (auto-reveal shipped v1.8.2, 22 Jan 2025)
- https://help.obsidian.md/configuration-folder (bookmarks.json lives in the .obsidian config folder)

---

## 6. Backlinks, outgoing links, outline, properties & graph panels

These are Obsidian's "knowledge-graph surfaces": the family of derived, side-docked views that turn a flat pile of markdown files into a navigable network — Backlinks (linked + unlinked mentions), Outgoing links, Outline (heading tree), Properties (typed frontmatter), and the two Graph views (global + local). They all read from a single derived index — the `MetadataCache` — and render as dockable `ItemView` panels, so the *same* parsed data drives five different lenses onto one note. This is precisely the layer where Coal is thinnest (it has only a below-editor backlinks navigator), and it is the layer that makes Obsidian *feel* like a graph tool rather than a text editor.

### How Obsidian does it

**Shared substrate — `MetadataCache` + `CachedMetadata`.** Every panel here is a view over the same parsed cache, exposed on the dev API as `app.metadataCache`:
- `getFileCache(file: TFile): CachedMetadata | null` (confirmed exact signature) and `getCache(path: string): CachedMetadata | null` return the parsed metadata for one note. `CachedMetadata` is the whole feed — every field optional: `links?: LinkCache[]`, `embeds?: EmbedCache[]`, `tags?: TagCache[]`, `headings?: HeadingCache[]`, `frontmatter?: FrontMatterCache`, `frontmatterLinks?: FrontmatterLinkCache[]`, `frontmatterPosition?: Pos`, `sections?: SectionCache[]` ("root-level markdown blocks, used to divide the document up"), `listItems?: ListItemCache[]`, `blocks?: Record<string, BlockCache>`, `footnotes?: FootnoteCache[]`, `footnoteRefs?: FootnoteRefCache[]`, `referenceLinks?: ReferenceLinkCache[]`.
- `HeadingCache` = `{ heading: string; level: number /* documented "Number between 1 and 6" */; position: Pos }` — this single array *is* the Outline. `LinkCache` = `{ link, original, displayText?, position }` — this array *is* Outgoing links.
- Vault-wide graph edges live in two dense maps: `resolvedLinks: Record<string, Record<string, number>>` ("maps each source file's path to an object of destination file paths with the link count") and `unresolvedLinks: Record<string, Record<string, number>>` ("maps each source file to an object of unknown destinations with count"). The graph view and outgoing-links "unresolved" section read these directly. Individual linkpaths are resolved to a `TFile` via `getFirstLinkpathDest(linkpath, sourcePath)` ("get the best match for a linkpath") — the same shortest-path/same-folder resolution that decides whether a link lands in `resolvedLinks` vs. `unresolvedLinks`.
- Backlinks use `app.metadataCache.getBacklinksForFile(file)` — an **undocumented/internal** method (not in the public typings) that returns an `ArrayLikeArrayMap` of source-path → array of `Reference` objects (each with `link`, `original`, `position`). Internally it iterates every cached file's links to find references to the target; "fast enough" for the pane but O(N) per call.
- Cache freshness is event-driven: `metadataCache.on('changed', file => …)` fires after a file is re-indexed; `'resolve'` fires when `resolvedLinks`/`unresolvedLinks` update for a file; `'resolved'` fires once the *whole* vault is resolved (after initial load and after batches of edits). Panels subscribe and re-render.

**Backlinks pane.** A core plugin. Two mention classes: **Linked mentions** ("backlinks to notes that contain an internal link to the active note") and **Unlinked mentions** ("any unlinked occurrence of the name of the active note"). Controls in the pane header (icon buttons): **Collapse results** (expand/collapse each note to show its mentions), **Show more context** (truncate vs. show the full paragraph around each mention), **Change sort order**, and **Show search filter** (reveals a text field using the same query grammar as global Search). Commands:
- `Backlinks: Show backlinks` — reveals the backlinks tab in the right sidebar (tracks the active note).
- `Backlinks: Open backlinks for the current note` — opens a *pinned* separate backlinks tab for one specific note (does not follow focus).
- `Backlinks: Toggle backlinks in document` — renders the backlinks block **at the foot of the note itself**, inside the editor pane, rather than in the sidebar. There is also a global setting ("Backlink in document") to always show it.

**Outgoing links pane.** Core plugin, right-sidebar tab with a "links-going-out" icon. Two sections: **Links** ("click a link to open the linked note" — every resolved outgoing link from the active note) and **Unlinked mentions** ("text in the active note that matches the name or alias of another note"), which lets you *promote* text to a link by clicking the note-name button. Hovering a name button shows the full path when names collide; excluded-file patterns are filtered out; links inside code blocks are not listed. Shares the same header controls as Backlinks (collapse / more context / sort / filter).

**Outline pane.** Core plugin: "lists the headings in the active note." Click a heading to jump/scroll to that section; **drag a heading within the outline to rearrange** the underlying sections in the document. It is a direct render of `CachedMetadata.headings` (indented by `level`).

**Properties.** Core plugin adding **two sidebar views**: **File properties** (properties of the active note) and **All properties** (every property key in the vault + its type). In the All-properties view you can **sort by name or by frequency**, **click a property to open Search pre-filled** with property-search syntax, and **right-click to rename a property globally** (vault-wide rename across all notes). Editing happens in the in-editor properties widget at the top of a note. Add a property via the **`Add file property`** command, hotkey **`Cmd/Ctrl+;`**, the note's "more actions" (⋯) menu, or by typing `---` at file top. Six types plus one special: **Text**, **List**, **Number**, **Checkbox** (`true`/`false`), **Date** (`2020-08-21`), **Date & time** (`2020-08-21T10:30:00`), and **Tags** (only for the `tags` key). Click the type icon beside a key to change its type. Display mode is **Settings → Editor → Properties in document**: **Visible** (default, rendered widget at top), **Hidden** (widget suppressed; edit via sidebar), or **Source** (raw YAML frontmatter). Internal links inside text/list properties must be quoted: `"[[Note]]"`; those links surface in `CachedMetadata.frontmatterLinks`.

**Graph view (global) & Local graph.** Core plugin, opened from the ribbon ("Open graph view") or the command `Graph view: Open graph view`; Local via `Graph view: Open local graph`. Nodes = notes, edges = internal links; node radius grows with incoming reference count. A collapsible controls panel (cog) holds four groups:
- **Filters:** Search files (query box), Tags (toggle tag nodes), Attachments, **Existing files only** (hide unresolved link targets), **Orphans** (hide nodes with no links).
- **Groups:** **New group** button — each group is a search query + a color, layered to colorize node categories.
- **Display:** **Arrows** (link direction), **Text fade threshold** (zoom level at which labels appear), **Node size**, **Link thickness**, **Animate** (time-lapse of note creation order).
- **Forces:** **Center force**, **Repel force**, **Link force**, **Link distance** — a live force-directed simulation. **Local graph** adds a **Depth** slider (how many link-hops out from the active note) and otherwise inherits every global setting; it is scoped to the neighborhood of the current note and updates as you switch notes.
- Interaction is explicitly **mouse-first / spatial**: hover to highlight a node's connections, click to open, right-click for a context menu, scroll or `+`/`-` to zoom, drag or arrow-keys to pan (Shift to accelerate). Rendered on canvas/WebGL, themed via CSS vars: `--graph-line`, `--graph-node`, `--graph-node-focused`, `--graph-node-tag`, `--graph-node-attachment`, `--graph-node-unresolved`, `--graph-text`, `--graph-controls-width`.

**Housing — `ItemView` + workspace leaves.** Every panel above is an `ItemView` registered with `this.registerView(VIEW_TYPE, leaf => new MyView(leaf))`. A view implements `getViewType()` (unique id, e.g. `backlink`, `outgoing-link`, `outline`, `file-properties`, `all-properties`, `graph`, `localgraph`), `getDisplayText()`, `getIcon()`, `onOpen()` (build DOM), `onClose()` (teardown). To dock into the right sidebar: `const leaf = workspace.getRightLeaf(false); await leaf.setViewState({ type: VIEW_TYPE, active: true }); workspace.revealLeaf(leaf)`. Existing instances are found with `workspace.getLeavesOfType(VIEW_TYPE)` (you re-query rather than caching references). Views update on `metadataCache` events and on `workspace.on('active-leaf-change' | 'file-open')`.

### Details that make it feel polished

- **Empty & self states.** Every pane has a distinct empty string ("No backlinks found", "No outgoing links", "No headings", "No properties"), not a blank box. The Outline of a heading-less note and the Backlinks of an orphan both degrade gracefully.
- **Active-note follow vs. pinned.** The sidebar Backlinks/Outgoing/Outline tabs *retrack* on every `file-open`; the "Open backlinks for the current note" variant deliberately pins to one note so you can park it while browsing elsewhere. That "follow vs. pin" duality is a subtle affordance.
- **Context snippets.** Backlinks don't just list the linking note — they show the *sentence/paragraph* around each mention (togglable via "Show more context"), with the matched term highlighted, so you can judge relevance without opening the note.
- **Unlinked → linked promotion.** Both Backlinks (unlinked mentions) and Outgoing links let you click a single button to convert a bare text occurrence into a real `[[wikilink]]`, mutating the source file. This is the "discover links you aren't aware of yet" loop.
- **Collapse memory & counts.** Group headers show mention counts; collapse state per source-note persists across re-renders. Sort order (by name / by modified time / by count) is remembered.
- **Graph micro-physics.** Nodes settle via a live force sim; hovering dims everything except a node's immediate neighborhood; labels fade in/out at the "text fade threshold" zoom so a dense graph isn't a wall of text; the "Animate" toggle replays vault growth chronologically. Local graph re-simulates smoothly when you change depth or switch notes.
- **Properties niceties.** Type inference on entry (typing a date-shaped value offers the Date type); a global rename that rewrites frontmatter across the whole vault; click-through from All-properties into a pre-filled Search; the widget renders inline in Live Preview but collapses to raw YAML in Source mode.
- **Drag-reorder outline.** The outline isn't read-only navigation — dragging a heading physically moves that whole section (and its subsections) in the source file, an editing action disguised as a nav panel.
- **Hover preview integration.** Hovering any link in these panes (with the Page Preview core plugin) pops the target note, so you rarely have to actually navigate.

### For Coal

- **Promote the backlinks navigator to a real `ItemView`-style dockable panel.** Coal's `src/renderer/ui/backlinks.ts` is docked *below* the editor with a single roving selection; the roadmap already wants it in a collapsible right sidebar. Model each panel as a vanilla-DOM component with a stable `viewType` string, an `onOpen`/`onClose` lifecycle, and a shared "panel host" that can dock left/right/below — Coal's own lightweight analog of `ItemView` + `WorkspaceLeaf`. Keyboard-first: `M-x` commands `coal: show backlinks`, `coal: show outline`, `coal: show outgoing links`, plus roving `C-n`/`C-p` selection and `RET` to follow (never require the mouse for any of these).
- **Backlinks: add linked + unlinked mentions with context.** Coal already has an in-memory note index driving `[[uuid]]` links; extend it to a backlinks map keyed by target note (the analog of `getBacklinksForFile` over `resolvedLinks`). Because Coal links are *UUID-based*, "unlinked mentions" must match on **note title/alias text**, not the raw UUID — surface them as a separate group with a keyboard "promote to `[[uuid]]`" action that inserts the UUID byte-for-byte (respecting §14). Show a one-line context snippet per mention with the matched span highlighted; add header toggles for collapse, more-context, and a filter field driven by the same minibuffer matching.
- **Outline pane is the cheapest, highest-value win.** Coal already parses markdown in CM6; derive a heading list (level + text + line) either from the note index or from a CM6 `syntaxTree` walk of `ATXHeading`/`SetextHeading` nodes. Render an indented, roving-focus list; `RET` calls `EditorView.dispatch` with a `selection`/`scrollIntoView` to jump to that heading line. Consider (post-v1) drag-to-reorder as a section move, but keyboard reorder (`M-<up>`/`M-<down>`) fits Coal's Emacs lineage better than drag.
- **Outgoing links pane.** Trivial from Coal's link parse: list every `[[uuid]]` in the active note as its resolved title (Coal already renders titles), plus an "unresolved" group for links whose UUID isn't in the index (dangling), mirroring `unresolvedLinks`. Keyboard follow via `RET`; reuse the existing external-link-open path for bare URLs.
- **Properties view — align with the typed-object layer (v0.18.0, §11).** Coal already has `parseFrontmatterProps` + EAV tables (`objectTypes`/`notesOfType`/`notesWhere`) read-only. Build a **File properties** panel (typed frontmatter of the active note) and an **All properties** view (every key + inferred type + frequency, sortable by name/frequency, `RET` runs the existing `M-x` query commands — Coal's analog of "click to open Search pre-filled"). Keep it **read-only first** to honor the current phase; the CM6 property *widget* and writes are the tracked next phases. Mirror Obsidian's type vocabulary (Text/List/Number/Checkbox/Date/Date-&-time) so the eventual editor UI is familiar, but everything must round-trip byte-for-byte into YAML frontmatter (§14) — no reflow of untouched keys.
- **Graph view is the one deliberately mouse-first surface — and that's spec-legal.** SPEC §1 permits the mouse for spatial surfaces like the graph. A local graph (depth slider, force sim over the note index's `resolvedLinks`-equivalent) is the natural first cut; a global graph later. Theme it with Coal's `--coal-*` tokens (define `--coal-graph-node`, `--coal-graph-line`, `--coal-graph-node-unresolved`, etc., paralleling `--graph-*`). Keep it *derived from markdown* (§10): nodes/edges rebuild from the git-ignored index, never persisted. Provide `M-x` entry points (`coal: open local graph`) so the keyboard user can at least summon and depth-adjust it, even if pan/zoom is pointer-driven.
- **One cache, many lenses.** The big architectural lesson: Obsidian feeds all five panels from *one* `MetadataCache` updated by `changed`/`resolve`/`resolved` events. Coal should likewise centralize a single reactive note-index (links, headings, frontmatter props, backlinks) and have every panel subscribe to its change events, so "delete the index, rebuild from `.md`" (§10 litmus) still holds and no panel maintains its own parse.

**Sources:** https://obsidian.md/help/plugins/backlinks · https://obsidian.md/help/plugins/outgoing-links · https://obsidian.md/help/plugins/outline · https://obsidian.md/help/properties · https://obsidian.md/help/plugins/graph · https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache · https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getFileCache · https://docs.obsidian.md/Reference/TypeScript+API/CachedMetadata · https://docs.obsidian.md/Reference/TypeScript+API/HeadingCache · https://docs.obsidian.md/Plugins/User+interface/Views · https://docs.obsidian.md/Reference/CSS+variables/Plugins/Graph · https://github.com/mnaoumov/obsidian-backlink-cache · https://github.com/Fevol/obsidian-typings

---

## 7. Appearance — themes, CSS variables & the design-token system

Obsidian's entire look — every theme, every user snippet, every per-note tweak — is expressed as **CSS custom properties (variables)** layered in a strict cascade. There is no styling API, no JS theming engine, no compiled design tokens: a theme is literally a `theme.css` file that reassigns variables, and the app's own stylesheets consume those variables everywhere. This is the single most directly transferable subsystem for Coal, which already ships a `--coal-*` token contract modeled on exactly this idea. The reason it *feels* coherent is the three-tier structure — **Foundations → Components → Editor/Views** — where semantic tokens are derived from a small primitive palette, so changing one accent hue ripples correctly through buttons, links, carets, and selections without a theme author touching any of them.

### How Obsidian does it

**The variable tree (six documented sections).** The dev docs' "Reference > CSS variables" splits every token into six categories (verbatim from the index): **Foundations** — "Abstracted variables for colors, spacing, typography and more" (sub-pages: Borders, Colors, Cursor, Icons, Layers, Radiuses, Spacing, Typography); **Components** — "Interactive components used throughout the app" (Button, Checkbox, Color input, Dialog, Dragging, Indentation guides, Modal, Multi-select, Navigation, Popover, Slider, Tabs, Text input, Toggle); **Editor** — content-type styling (blocks, blockquotes, callouts, code, embeds, headings, links, lists, tables, tags); **Plugins** — core-plugin interface vars (Canvas, File explorer, Graph, Search); **Window** — app-window chrome (dividers, ribbons, scrollbars, workspace); and **Obsidian Publish**. Foundations are the primitives; everything above is *derived from* them.

**Foundations — the color palette.**
- **Grayscale ramp:** `--color-base-00` … `--color-base-100`. Light mode runs `--color-base-00: #ffffff` (lightest) → `--color-base-100: #222222` (darkest); dark mode *inverts the meaning of the numbers* — `--color-base-00: #1e1e1e` (darkest surface) → `--color-base-100: #dadada` (lightest text). So `base-00` is always "primary background" and `base-100` is always "strongest text" regardless of scheme — that inversion is what lets one semantic mapping serve both modes.
- **Named color families:** `--color-red`, `--color-orange`, `--color-yellow`, `--color-green`, `--color-cyan`, `--color-blue`, `--color-purple`, `--color-pink` (eight — distinct from the *accent*, which is its own HSL system below), each with an `-rgb` companion (e.g. `--color-red-rgb: 233, 49, 71`) for use inside `rgba()`. Values differ per scheme — red `#e93147` (light) → `#fb464c` (dark), blue `#086ddd` (light) → `#027aff` (dark) — brightened in dark mode for contrast.
- **Monochrome helpers:** `--mono-rgb-0` and `--mono-rgb-100` (white/black flipped by scheme), used for shadows/overlays.

**The accent (`--accent-h/s/l`) system — the clever bit.** The user's accent color is stored as three separate HSL channel variables — documented defaults `--accent-h: 254`, `--accent-s: 80%`, `--accent-l: 68%` (default violet) — *not* as a hex string. The docs expose those three channels plus the semantic accent tokens `--interactive-accent`, `--interactive-accent-hover`, and `--interactive-accent-hsl` (the raw `h, s, l` triple, for dropping into your own `hsl()`/`hsla()`), and explicitly note: *"You can use CSS calculations to create a variety of shades."* Obsidian's own `app.css` puts that to work — the semantic accent is built from the channels and its hover variant is a `calc()` shift on the lightness channel, conceptually:
```css
--interactive-accent-hsl: var(--accent-h), var(--accent-s), var(--accent-l);
--interactive-accent: hsl(var(--accent-h), var(--accent-s), var(--accent-l));
/* hover = same hue/sat, lightness nudged via calc() — exact delta lives in app.css, not the public docs */
--interactive-accent-hover: hsl(var(--accent-h), var(--accent-s), calc(var(--accent-l) - <delta>));
```
Because hover/active states are derived with `calc()` on the `l` channel, a single accent picker in Settings recolors links, the active tab, focused inputs, toggles, and the text caret — all consistently — with zero extra theme code. (The precise hover offset is an implementation detail of `app.css`; the *public* contract is the three `--accent-*` channels + the `--interactive-accent*` tokens.)

**Foundations — semantic surface & text tokens (derived from base ramp).**
- Backgrounds: `--background-primary`, `--background-primary-alt`, `--background-secondary`, `--background-secondary-alt`, plus modifiers `--background-modifier-hover`, `--background-modifier-active-hover` (note: the documented token is `-active-hover`, *not* a bare `-active`), `--background-modifier-border`, `--background-modifier-error`, `--background-modifier-success`, `--background-modifier-form-field`.
- Interactive: `--interactive-normal`, `--interactive-hover`, `--interactive-accent`, `--interactive-accent-hover`, `--interactive-accent-hsl`.
- Text: `--text-normal`, `--text-muted`, `--text-faint` (the three-tier de-emphasis ladder), `--text-on-accent`, `--text-on-accent-inverted`, `--text-accent`, `--text-accent-hover`, `--text-success`, `--text-warning`, `--text-error`, plus `--text-selection` and `--text-highlight-bg` (the `==highlight==` background). Caret: `--caret-color`.

**Foundations — spacing (4px grid).** `--size-4-1: 4px`, `--size-4-2: 8px`, `--size-4-3: 12px`, `--size-4-4: 16px`, `--size-4-5: 20px`, `--size-4-6: 24px`, `--size-4-8: 32px`, `--size-4-9: 36px`, `--size-4-12: 48px`, `--size-4-16: 64px`, `--size-4-18: 72px`. A finer 2px grid supplies `--size-2-1: 2px`, `--size-2-2: 4px`, `--size-2-3: 6px`. Naming is literally `--size-{grid}-{multiplier}` → value = grid × multiplier.

**Foundations — radiuses & typography.** Radiuses: `--radius-s: 4px`, `--radius-m: 8px`, `--radius-l: 12px`, `--radius-xl: 16px`. Fonts: `--font-interface-theme` (UI), `--font-text-theme` (editor prose), `--font-monospace-theme` (code) — the `-theme` suffix is the slot a theme overrides while the user's font setting fills the non-suffixed source. Sizes: `--font-text-size: 16px` (base, relative), relative steps `--font-smallest: 0.8em`, `--font-smaller: 0.875em`, `--font-small: 0.933em`; fixed UI steps `--font-ui-smaller: 12px`, `--font-ui-small: 13px`, `--font-ui-medium: 15px`, `--font-ui-large: 20px`. Weight scale `--font-thin: 100` … `--font-normal: 400` … `--font-bold: 700` … `--font-black: 900`, plus `--font-weight`, `--bold-weight`, `--bold-modifier` (extra weight for `**bold**`), `--bold-color`, `--italic-color`. Line heights `--line-height-normal: 1.5`, `--line-height-tight: 1.3`; block rhythm `--p-spacing`, `--heading-spacing`.

**Theme scoping — `body`, `.theme-light`, `.theme-dark`, `:root`.** This is the whole mechanism of light/dark support. Obsidian toggles the classes `theme-light` / `theme-dark` on `<body>`. A theme's `theme.css` therefore partitions its variables:
```css
body { --font-text-theme: Georgia, serif; --ribbon-background: magenta; } /* both modes */
.theme-light { --background-primary: #ECE4FF; --background-secondary: #D9C9FF; }
.theme-dark  { --background-primary: #18004F; --background-secondary: #220070; }
:root { --input-focus-border-color: Highlight; } /* mode-independent, incl. plugin vars */
```
Rule of thumb from the docs: **use `.theme-light`/`.theme-dark` only for values that must change with scheme; use `body`/`:root` for everything constant.** A theme is two files — `manifest.json` (`name`, `version`, `minAppVersion`, `author`, `authorUrl`; the theme *directory name must exactly match* `manifest.json`'s `name`) and `theme.css`. Community themes are nothing more than large `theme.css` files overriding these documented variables — no code, no build step.

**Component variables (all derived from Foundations).** Buttons: `--button-radius`; button *colors* come straight from the Interactive tokens. Text inputs: `--input-height`, `--input-radius`, `--input-font-weight`, `--input-border-width`. Modals/dialogs: `--modal-background`, `--modal-width`, `--modal-height`, `--modal-max-width`, `--modal-max-height`, `--modal-max-width-narrow`, `--modal-border-width`, `--modal-border-color`, `--modal-radius`. Checkboxes: `--checkbox-size`, `--checkbox-radius`, `--checkbox-color`, `--checkbox-color-hover`, `--checkbox-border-color`, `--checkbox-border-color-hover`, `--checkbox-marker-color`, plus task-list `--checklist-done-color`, `--checklist-done-decoration`. Tabs: `--tab-background-active`, `--tab-text-color`, `--tab-text-color-focused`, `--tab-text-color-focused-active`, `--tab-font-size`, `--tab-font-weight`, `--tab-radius`, `--tab-radius-active`, `--tab-curve`, `--tab-divider-color`, `--tab-outline-color`, `--tab-container-background`. Code: `--code-background`, `--code-size`, `--code-white-space`, and per-token syntax colors `--code-normal`, `--code-comment`, `--code-keyword`, `--code-string`, `--code-function`, `--code-operator`, `--code-property`, `--code-punctuation`, `--code-tag`, `--code-value`, `--code-important`. Window chrome: dividers `--divider-color`, `--divider-color-hover`, `--divider-width`, `--divider-width-hover`, `--divider-vertical-height`; scrollbars `--scrollbar-bg`, `--scrollbar-thumb-bg`, `--scrollbar-active-thumb-bg` (custom scrollbars are Windows/Linux only — macOS uses native).

**Appearance settings tab (Settings → Appearance).** The user-facing surface over all of the above:
- **Base color scheme:** Light / Dark / **Adapt to system** (the default) — flips the `theme-light`/`theme-dark` body class.
- **Themes / Manage:** browse + install community themes in-app; "Current theme" selector.
- **Accent color:** a color picker that writes `--accent-h/s/l`.
- **Fonts:** separate **Interface font**, **Text font**, **Monospace font** pickers (map to the `-theme` font slots).
- **Font size** / quick zoom, and **Readable line length** (a toggle that constrains editor content to a comfortable measure rather than full width).
- **Translucent window** (macOS only; removed on Windows in 1.15.11), **Custom app icon** (`.icns`/`.ico`/`.png`/`.svg`), plus interface toggles (show ribbon, inline title, tab title bar).
- **CSS snippets** section: **Open snippets folder** + **Reload snippets** + per-file toggles.

**CSS snippets & `cssclasses`.** Snippets live in `<vault>/.obsidian/snippets/*.css`. Enable via Settings → Appearance → CSS snippets → toggle each file on; Obsidian **auto-detects saves and hot-reloads** (Reload snippets only needed to pick up newly-added files). Per-note styling uses the **`cssclasses`** frontmatter property — a documented core property of type **List** whose stated purpose is "style individual notes using CSS snippets." Obsidian applies each list entry as a class on that note's view container, so a snippet like `.red-border img { border-color: #f00; }` scopes to only the notes declaring `cssclasses: [red-border]`. (The **singular `cssclass`** is the legacy name — deprecated in Obsidian 1.4 and dropped in 1.9; new work must use the plural `cssclasses`.)

### Details that make it feel polished

- **Number-inversion trick for dark mode:** because `--color-base-00` means "primary background" in *both* schemes (white in light, near-black in dark), the semantic layer (`--background-primary: var(--color-base-00)`) needs *no* `.theme-dark` override — only the primitive ramp flips. A naive clone hard-codes two full palettes and drifts; Obsidian keeps one semantic map.
- **HSL-channel accent, not hex:** storing accent as `--accent-h/s/l` (plus the `--interactive-accent-hsl` triple) lets hover/active/muted variants be `calc()`-derived on the lightness channel — the docs literally invite this ("You can use CSS calculations to create a variety of shades"). So the accent picker instantly recolors every downstream interactive surface with correct, arithmetic contrast deltas; a hex accent can't do arithmetic hover states at all.
- **`-theme` font suffix indirection:** the user's font choice and a theme's font choice occupy different variable slots, so a theme can suggest a font *without* clobbering the user's explicit setting — a subtle precedence design.
- **Three-level text de-emphasis** (`--text-normal`/`--text-muted`/`--text-faint`) gives metadata, timestamps, and inactive UI a consistent visual hierarchy everywhere at once.
- **Hot-reload without restart:** snippet edits apply on file-save via a watcher; themes reload live. Restart is required only for `manifest.json` changes.
- **`:root` vs `body` guidance** exists precisely because some plugin/portal-rendered nodes (menus, popovers) attach outside the `body.theme-*` subtree — putting mode-independent and plugin vars on `:root` avoids them going unstyled.
- **Readable line length** is a single toggle but interacts with per-note width overrides and embeds; it's the polish that keeps prose comfortable on ultrawide monitors.
- **Scheme-aware color families:** the eight named colors aren't fixed — dark-mode reds/blues are brightened for contrast, so callouts/tags stay legible in both modes automatically.

### For Coal

- **Keep the three-tier token cascade.** Coal's `--coal-*` contract (documented in `docs/theming.md`) should mirror Foundations → Components → Editor: a small primitive ramp (`--coal-base-00..100`), semantic tokens (`--coal-bg`, `--coal-bg-alt`, `--coal-text`, `--coal-text-muted`, `--coal-text-faint`, `--coal-accent`, already present), then component/editor tokens *derived* from them. Coal's CM6 monochrome highlight already binds to `--coal-*` vars — extend that into a named per-token code palette (`--coal-code-keyword`, `--coal-code-string`, …) so themes can recolor syntax without touching the extension.
- **Adopt the HSL-channel accent.** Coal already has `--coal-accent` and a themeable `--coal-caret` (defaulting to `--coal-accent`). Split accent into `--coal-accent-h/s/l` and compute `--coal-accent-hover` with `calc()` on lightness, so the future Appearance accent picker recolors wikilinks (`.coal-wikilink`), the CM6 caret, selection, and the minibuffer's active candidate from one control. Coal's existing `light-dark()` tokens are the modern equivalent of Obsidian's ramp-inversion — lean on them so most semantic tokens need no per-scheme override.
- **Scope light/dark the Obsidian way.** Coal's named themes in `src/renderer/ui/theme.ts` (`light-mode`/`dark-mode`/`lemon-lime`) map cleanly onto Obsidian's `body.theme-light`/`body.theme-dark` pattern — set a `theme-*` class (or `data-coal-theme`) on the root and let themes partition variables into shared-vs-scheme-specific blocks. Document the "only scope what changes with scheme" rule in `docs/theming.md`.
- **Snippets are already Obsidian-shaped.** Coal loads `<vault>/.coal/snippets/*.css` — add the two missing affordances from Obsidian's Appearance › CSS snippets pane inside `settingsPanes.ts`: per-file **enable toggles** and a **Reload snippets** action (plus a chokidar-style hot-reload on save, which Coal's watcher can already power). Keep it keyboard-first: expose `M-x "Reload snippets"` and `M-x "Open snippets folder"` (never a slash menu, SPEC §3).
- **Build the Appearance pane to match.** Coal's Settings modal already has an Appearance pane; add **Base color scheme** (Light/Dark/Adapt-to-system), **Accent color**, and **font** controls that write CSS vars, mirroring Obsidian's tab. A **Readable line length** toggle maps directly to a CM6 content-width cap on the editor `.cm-content` (a max-width tied to a `--coal-line-width` token) — a natural, edit-only-safe borrow.
- **`cssclasses` per-note styling — respect markdown-as-truth.** Obsidian's `cssclasses` frontmatter is a perfect fit for Coal's typed-object/frontmatter layer (§11): read a `cssclasses` list from a note's frontmatter and apply each as a class on the editor root, giving per-note theming *with zero non-markdown state* (SPEC §10). This composes with Coal's existing `parseFrontmatterProps`.
- **Token stability is a contract.** As Obsidian treats its CSS-variable names as a public API for theme authors, Coal should freeze `--coal-*` names in `docs/theming.md` and version them — snippets and future community themes depend on them not drifting.

**Sources:** https://docs.obsidian.md/Reference/CSS+variables/CSS+variables · https://docs.obsidian.md/Reference/CSS+variables/Foundations/Colors · https://docs.obsidian.md/Reference/CSS+variables/Foundations/Typography · https://docs.obsidian.md/Reference/CSS+variables/Foundations/Spacing · https://docs.obsidian.md/Reference/CSS+variables/Foundations/Radiuses · https://docs.obsidian.md/Themes/App+themes/Build+a+theme · https://docs.obsidian.md/Reference/CSS+variables/Components/Button · https://docs.obsidian.md/Reference/CSS+variables/Components/Text+input · https://docs.obsidian.md/Reference/CSS+variables/Components/Modal · https://docs.obsidian.md/Reference/CSS+variables/Components/Checkbox · https://docs.obsidian.md/Reference/CSS+variables/Editor/Code · https://docs.obsidian.md/Reference/CSS+variables/Window/Divider · https://docs.obsidian.md/Reference/CSS+variables/Window/Scrollbar · https://obsidian.md/help/appearance · https://obsidian.md/help/snippets · https://obsidian.md/help/Editing+and+formatting/Properties

---

## 8. Settings, modals, notices & UI components

Obsidian's dialog/component layer is a small, ruthlessly consistent design system: one `Setting` "row" primitive composes every configuration surface, one `Modal` primitive backs every dialog, one `Notice` primitive backs every transient message, and a fixed roster of typed input components (`ToggleComponent`, `DropdownComponent`, `TextComponent`, `SliderComponent`, `ButtonComponent`, `SearchComponent`, etc.) plug into that row. Because the same builder API and the same `.setting-item` markup are used by the core app *and* every third-party plugin, the entire settings window feels like one coherent thing rather than a patchwork — and every control inherits theming, focus, and keyboard behavior for free. For Coal, this is the single most directly borrowable subsystem: it is all CM6-independent vanilla DOM + CSS variables, exactly Coal's chrome stack.

### How Obsidian does it

**The Settings window (the shell).** Opened with `Ctrl`/`Cmd`+`,` — the default binding of the **"Open settings"** command (verified as Obsidian's default hotkey; also reachable via the gear icon at the bottom of the left sidebar, or the command palette). It is itself a `Modal` subclass. Structure is a two-column split: a left **tab list** (`.vertical-tab-header` / `.vertical-tab-nav-item`) and a right **content pane** (`.vertical-tab-content`). The tab list is grouped under headers: **Options** (core app tabs), **Core plugins**, and **Community plugins**. The Options group holds, in order, *General, Editor, Files and links, Appearance, Hotkeys, About*; **Core plugins** and **Community plugins** are the toggle/manager tabs for built-in and third-party plugins respectively, and each enabled plugin can add its own tab below (e.g. Backlinks, Outgoing links, Daily notes). Clicking a nav item swaps which tab's `display()` renders into the shared content container; the previous tab's `hide()` runs for teardown.

- **`PluginSettingTab`** is the class every plugin extends to add its own tab (it extends the internal `SettingTab`). Constructor takes `(app, plugin)`. Key members: `this.containerEl` is the DOM node the tab renders into, and an inherited `icon` sets the tab's sidebar glyph. Two lifecycle methods:
  - `display()` — abstract; you implement it to build the UI. Convention: **`containerEl.empty()` first**, then append `Setting` rows. It re-runs every time the tab is shown, so it is a full rebuild, not an incremental patch.
  - `hide()` — cleanup/teardown when the tab is navigated away from (unloads registered child components).
  - Registered via `plugin.addSettingTab(new MySettingTab(this.app, this))` inside `onload()`.
- **Search within settings**: the Hotkeys tab has a dedicated filter box; the top-level settings search is a newer addition. Community/Core plugin tabs each expose a search field over the plugin list. These are `SearchComponent`s (see below).

**The `Setting` row primitive.** `new Setting(containerEl)` appends one `.setting-item` row and returns a chainable builder. This is *the* atom of the whole settings UX. The row's DOM is fixed:

```
.setting-item
  .setting-item-info
    .setting-item-name         ← setName()
    .setting-item-description   ← setDesc()
  .setting-item-control         ← where add*() components mount
```

Builder methods (all chainable, returning `this` unless noted):
- Text/label: `setName(name)`, `setDesc(desc)` (both accept string or `DocumentFragment` for rich markup), `setTooltip(tooltip, options?)`, `setClass(cls)`, `setDisabled(disabled)`.
- `setHeading()` — converts the row into a **section heading** (`.setting-item-heading`, bold, no control), the idiom for grouping a settings tab into sub-sections without a separate widget.
- Component adders, each taking a callback that receives the freshly-created component instance so you configure it in place:
  - `addToggle(cb: (t: ToggleComponent) => void)`
  - `addText(cb: (t: TextComponent) => void)`
  - `addTextArea(cb: (t: TextAreaComponent) => void)`
  - `addDropdown(cb: (d: DropdownComponent) => void)`
  - `addSlider(cb: (s: SliderComponent) => void)`
  - `addButton(cb: (b: ButtonComponent) => void)`
  - `addExtraButton(cb: (b: ExtraButtonComponent) => void)` — the small borderless icon button (e.g. a reset/settings gear at row end)
  - `addSearch(cb: (s: SearchComponent) => void)`
  - `addColorPicker(cb: (c: ColorComponent) => void)`
  - `addMomentFormat(...)`, `addProgressBar(...)`, `addComponent(...)` (lower-traffic).
- `then(cb)` — run arbitrary code in the chain (escape hatch for touching `settingEl` directly); `clear()` removes all added components and empties `controlEl` (for rebuilding a row in place).
- Exposed element handles: `settingEl`, `infoEl`, `nameEl`, `descEl`, `controlEl`, and `components[]` (the `BaseComponent[]` added to the row). Canonical usage:

```ts
new Setting(containerEl)
  .setName('Auto-open last vault')
  .setDesc('Reopen the vault you had open when Coal starts.')
  .addToggle(toggle => toggle
    .setValue(this.settings.autoOpenLastVault)
    .onChange(async (v) => { this.settings.autoOpenLastVault = v; await this.save(); }));
```

**The input components** (all extend `BaseComponent`; value-bearing ones extend `ValueComponent`):
- `ToggleComponent` — `setValue(on)`, `getValue()`, `onChange(cb)`, `setDisabled(d)`, `setTooltip(...)`; DOM handle `toggleEl` (a `.checkbox-container`).
- `DropdownComponent` — `addOption(value, display)`, `addOptions(record)`, `setValue(v)`, `getValue()`, `onChange(cb)`; handle `selectEl` (a native `<select>`).
- `TextComponent` (extends `AbstractTextComponent<HTMLInputElement>`) — `setValue`, `getValue`, `setPlaceholder(text)`, `onChange(cb)`, `setDisabled`; handle `inputEl` (`<input>`). `TextAreaComponent` is the same over `<textarea>`.
- `SearchComponent` (also an `AbstractTextComponent`) — same text API plus `onChanged()` and a built-in `clearButtonEl` (the "×" that appears when non-empty); handle `inputEl`.
- `SliderComponent` (extends `ValueComponent<number>`) — `setLimits(min, max, step)`, `setValue`, `getValue`, `getValuePretty()` (formatted display string), `onChange(cb)`, `setDynamicTooltip()` (show live value bubble while dragging), `showTooltip()`, `setInstant(instant)`; handle `sliderEl` (`<input type="range">`).
- `ButtonComponent` — `setButtonText(s)`, `setIcon(iconId)`, `setCta()` (accent/call-to-action styling), `removeCta()`, `setWarning()` (destructive/red styling), `setClass(cls)`, `setTooltip(...)`, `onClick(cb)`, `setDisabled(d)`; handle `buttonEl` (`<button>`).
- `ExtraButtonComponent` — `setIcon(iconId)`, `setTooltip(...)`, `onClick(cb)`, `setDisabled`; handle `extraSettingsEl`.
- `ColorComponent` — `setValue(hex)`/`getValue()` plus RGB/HSL variants; underlying native color input.

**The `Modal` primitive.** `class MyModal extends Modal`; `super(app)` in the constructor. Lifecycle:
- `onOpen()` — build UI into `this.contentEl` (usually with `Setting` rows or `contentEl.createEl(...)`).
- `onClose()` — teardown, conventionally `this.contentEl.empty()`.
- `open()` / `close()` drive it; `Modal` implements `CloseableComponent`.
- `setTitle(text)` sets `titleEl`; `setContent(x)` fills `contentEl` for the simplest case; `setCloseCallback(cb)` (v1.10.0+) registers a hook run on close.
- Element handles: `containerEl` (outermost, holds the dimmed backdrop), `modalEl` (the dialog box, `.modal`), `titleEl` (`.modal-title`), `contentEl` (`.modal-content`), plus a `scope` (a `Scope` for modal-local keymaps). `shouldRestoreSelection` (added v0.9.16) restores the editor text selection after closing.
- A **dialog** (per Obsidian's CSS-variables docs) is not a separate exported class but a *styling variant* of the same `Modal` — "a specific type of modal primarily used for confirmation," same machinery with narrower CSS driven by the `--dialog-*` vars. A pair of real subclasses, `SuggestModal` / `FuzzySuggestModal`, layer a filtered list on top (the mechanism behind the Quick Switcher and command palette).

Modal CSS variables (override for theming): `--modal-background`, `--modal-width`, `--modal-height`, `--modal-max-width`, `--modal-max-height`, `--modal-max-width-narrow`, `--modal-border-width`, `--modal-border-color`, `--modal-radius`, `--modal-community-sidebar-width`. Dialog vars: `--dialog-width`, `--dialog-max-width`, `--dialog-max-height`. Backdrop element is `.modal-bg`; a `.modal-close-button` "×" sits top-right of the modal.

**`Notice` (toasts).** `new Notice(message, duration?)` — the API names the second argument **`duration`** (colloquially "timeout"); `message` is a string or `DocumentFragment` and `duration` is milliseconds. Setting **`0` makes the notice persistent** (it stays until the user clicks it or code calls `hide()`); omitting it uses the app's notification-display-time default (a few seconds, user-adjustable). Methods `setMessage(message)` (mutate a live notice — used for progress like "Downloading… 3/10") and `hide()`. Element handles `noticeEl`, plus `containerEl` and `messageEl` (both added in v1.8.7). Notices stack in a fixed container at the top-right of the window (`.notice-container` / `.notice`), auto-dismiss on timeout, and dismiss on click. They are transient and non-modal — they never steal focus.

**DOM helper layer.** Obsidian augments `HTMLElement.prototype` with `createEl(tag, opts?, callback?)`, `createDiv(opts?)`, `createSpan(opts?)`, `createFragment(...)`, and `empty()`. The `opts` object: `{ cls?: string | string[], text?: string, attr?: Record<string,string>, type?, href?, value?, placeholder?, title? }`. `createEl` *appends and returns* the child, enabling terse tree-building without a framework:

```ts
const row = containerEl.createDiv({ cls: 'book' });
row.createEl('div', { text: 'How to Take Smart Notes', cls: 'book__title' });
```

`empty()` clears a node's children — the standard "rebuild on every `display()`" reset.

### Details that make it feel polished

- **Full rebuild, not diffing.** `display()`/`onOpen()` do `containerEl.empty()` then re-append. Simple, bug-resistant, and instant because the trees are tiny. State lives in the plugin/settings object, not the DOM — the DOM is a pure projection.
- **The callback-receives-component pattern** means configuration reads top-to-bottom in one expression; there is no separate "create then wire up" step, so a whole row is one fluent statement.
- **Heading rows via `setHeading()`** give visual grouping without a distinct component type — one primitive, two rendering modes.
- **CTA vs warning affordance.** `setCta()` (accent) and `setWarning()` (red) encode intent in the component, so destructive actions look destructive everywhere consistently, no ad-hoc classes.
- **Focus trap + Escape + backdrop dismiss.** A `Modal` traps Tab focus inside `modalEl`, closes on `Esc` (via its `scope`), and closes on backdrop (`.modal-bg`) click. Opening a modal moves focus to the first focusable control; closing restores prior focus (and, with `shouldRestoreSelection`, the editor selection).
- **Notices never grab focus** and stack/auto-expire, so background progress never interrupts typing; `setMessage()` lets one notice animate through states instead of spamming new toasts.
- **Slider live tooltip** (`setDynamicTooltip`) and search **clear button** (`clearButtonEl`, appears only when non-empty) are the tiny affordances a naive clone omits.
- **Empty/disabled states**: `setDisabled(true)` greys a control and blocks interaction uniformly; the Community-plugins tab shows a distinct empty/"Restricted mode" state rather than a blank pane.
- **Search-driven tabs**: Hotkeys and plugin lists filter live as you type in a `SearchComponent`, with the result list re-rendering on `onChange` — no submit step.
- **Keyboard reachability**: every control is a real focusable native element (`<input>`, `<select>`, `<button>`), so tab order and screen-reader semantics come from the platform, not custom widgets.

### For Coal

Coal's `src/renderer/ui/settings.ts` + `settingsPanes.ts` already mirror the *shape* (nav + panes: Appearance / Git-remote / About / Auto-open). The gap is the missing **reusable primitives**. Borrow, in Coal's vanilla-DOM idiom:

- **Build a `Setting` row helper** (e.g. `src/renderer/ui/setting.ts`): a `createSetting(parent)` returning a chainable builder with `setName`/`setDesc`/`setHeading`/`addToggle`/`addDropdown`/`addText`/`addTextArea`/`addSlider`/`addButton`/`addExtraButton`/`addSearch`/`addColorPicker`. Emit the exact `.setting-item` / `.setting-item-info` / `.setting-item-name` / `.setting-item-description` / `.setting-item-control` / `.setting-item-heading` class names so Coal snippets and any future theming target the same selectors Obsidian users already know. Rebuild each pane with `containerEl.replaceChildren()` (the `empty()` analog) on show — cheap and correct.
- **Adopt the callback-receives-component pattern** so each Appearance/Git-remote row is a single fluent statement; back every `onChange` straight into the existing prefs (`autoOpenLastVault` in `userData`, theme selection in `theme.ts`) — keep DOM as pure projection of settings state (respects markdown-as-truth: settings are app-prefs, not vault content).
- **Add a tiny DOM helper** (`createEl`/`createDiv` equivalents) rather than pulling a framework (SPEC §13 forbids one). A ~30-line `el(tag, {cls, text, attr})` covers the whole builder.
- **A real `Modal` primitive** to replace ad-hoc panels: a `Modal` base class with `open()`/`close()`/`onOpen()`/`onClose()`, `contentEl`/`titleEl`, an `Esc`-to-close handler, a focus trap (cycle Tab within `modalEl`, focus first control on open, restore prior focus on close), and a `.modal-bg` backdrop click-to-close. Wire `Esc` and focus through Coal's keyboard-first stance — but note the current **settings.ts** is a good candidate to re-base on this shared primitive. Expose `--coal-*` analogs of `--modal-background`, `--modal-radius`, `--modal-border-color`, `--modal-width`, `--modal-max-height` in `docs/theming.md`.
- **Keyboard-first divergence, deliberately.** Coal must be Tab-navigable *and* Emacs-navigable: give modals/settings roving `C-n`/`C-p` (or arrow) movement across rows plus native Tab, and reach settings via **`M-x` "Settings"** (no slash commands, SPEC §3) — never a mouse-only path. The settings search field should reuse Coal's minibuffer substring matcher (or upgrade both to shared fuzzy matching) for consistency with quick-open.
- **Notices/toasts — decide deliberately.** Coal today routes status through the persistent minibuffer **echo area** (Emacs-faithful, and good for idle status). Keep that as the default, but consider a lightweight transient `Notice(message, timeout)` (ms; `0` = sticky; top-right `.notice`/`.notice-container`) for *background* events (commit pushed, snippet reloaded) that shouldn't overwrite the echo area's current line — mirroring Obsidian's non-focus-stealing, auto-expiring, stackable toasts. `setMessage()`-style in-place update is the right call for git push progress.
- **CTA/warning affordances**: give Coal's button helper `setCta()`/`setWarning()` bound to `--coal-accent` and a red token, so destructive Git-remote actions read as destructive uniformly.
- **Don't overbuild**: Coal is edit-only with no community-plugin ecosystem, so skip the Options/Core/Community tab-grouping and the plugin browser — Coal's flat pane list (Appearance / Git-remote / About / Auto-open) is the right scope. The value is the *row + component + modal + notice* primitives, not the plugin-store shell.

**Sources:**
- https://docs.obsidian.md/Reference/TypeScript+API/Setting
- https://docs.obsidian.md/Reference/TypeScript+API/PluginSettingTab
- https://docs.obsidian.md/Reference/TypeScript+API/Modal
- https://docs.obsidian.md/Reference/TypeScript+API/Notice
- https://docs.obsidian.md/Reference/TypeScript+API/ToggleComponent
- https://docs.obsidian.md/Reference/TypeScript+API/DropdownComponent
- https://docs.obsidian.md/Reference/TypeScript+API/TextComponent
- https://docs.obsidian.md/Reference/TypeScript+API/SliderComponent
- https://docs.obsidian.md/Reference/TypeScript+API/ButtonComponent
- https://docs.obsidian.md/Reference/TypeScript+API/ExtraButtonComponent
- https://docs.obsidian.md/Reference/TypeScript+API/SearchComponent
- https://docs.obsidian.md/Plugins/User+interface/Modals
- https://docs.obsidian.md/Plugins/User+interface/HTML+elements
- https://docs.obsidian.md/Reference/CSS+variables/Components/Modal
- https://docs.obsidian.md/Reference/CSS+variables/Components/Dialog
- https://obsidian.md/help/settings
- https://obsidian.md/help/hotkeys

---

## 9. Interaction & micro-UX polish

Obsidian feels "finished" not because of any single headline feature but because of a dense mesh of small, consistent interaction affordances: Ctrl-hover a link and a live rendered preview floats up; right-click anything and a contextual `Menu` appears with the same visual grammar everywhere; every action is reachable by keyboard *and* mouse, has a hotkey, and shows up in the command palette; feedback arrives as a transient `Notice` or a quiet status-bar item, never a blocking dialog. These are the finishing touches Coal most conspicuously lacks — Coal today has no hover preview, no general context menus, no drag-and-drop, no callouts, no ribbon/status-bar affordances, and only basic substring matching in its minibuffer. This section documents the *mechanisms* behind that polish so Coal can reproduce the **feel** (progressive disclosure, keyboard-first-but-mouse-welcome, ruthless consistency), not merely the features.

### How Obsidian does it

**Hover / Page preview (the popover).**
- Delivered by the **"Page preview" core plugin** (Settings → Core plugins → Page preview), on by default. It "shows a preview of a linked note when hovering over an internal link" across the editor, File explorer, Search, Backlinks, outgoing links, and more.
- **Trigger model is mode-dependent:** in Reading view, hovering a link previews immediately; in **editing (Live Preview / Source) mode you must hold `Ctrl` (`Cmd` on macOS) while hovering** — the "Mod" key. A setting ("Require `Ctrl`/`Cmd` to trigger") lets you force the modifier everywhere.
- **API surface:** a view registers itself as a preview *emitter* via `Plugin.registerHoverLinkSource(id: string, info: HoverLinkSource): void`. The `HoverLinkSource` interface has two fields: `display` (the human name shown in Page-preview settings) and `defaultMod: boolean` (whether the Mod key is required by default). Example: `this.app.workspace.registerHoverLinkSource('recent-files', { display: 'Recent Files', defaultMod: true })`.
- Under the hood the emitter fires the workspace **`hover-link`** event; the Page-preview plugin listens and renders a `.hover-popover` / `.popover` element (a mini `MarkdownRenderer` view). Popover geometry is themed by CSS vars **`--popover-width`, `--popover-height`, `--popover-max-height`, `--popover-font-size`** (and `--popover-pdf-width`/`--popover-pdf-height` for PDF previews).
- The community **Hover Editor** plugin upgrades the read-only popover into a fully interactive, draggable, resizable `WorkspaceLeaf`-in-a-popover (you can *edit* in the hover), showing the ceiling of the interaction.

**Context menus (the `Menu` class, everywhere).**
- One class, `Menu`, backs every contextual menu. Construction pattern: `const menu = new Menu(); menu.addItem(cb); menu.showAtMouseEvent(evt)` or `menu.showAtPosition({ x, y }, doc?)`.
- `Menu` methods: `addItem((item: MenuItem) => void)`, `addSeparator()`, `showAtMouseEvent(evt: MouseEvent)` (v0.12.6), `showAtPosition(position: {x, y}, doc?)` (v1.1.0), `setNoIcon()`, `setUseNativeMenu(useNativeMenu: boolean)` (v0.16.0 — desktop can fall back to the OS-native menu), `close()`, `hide()`, `onHide(cb)`, plus the static `Menu.forEvent(evt)` (v1.6.0) convenience constructor. `addItem`/`addSeparator` "only work when the menu is not shown yet" (they mutate the DOM the menu builds at show time).
- `MenuItem` builder methods (chainable): `setTitle(title)`, `setIcon(icon)` (a Lucide icon id), `onClick(cb)`, `setSection(section: string)`, `setChecked(checked)`, `setDisabled(disabled)`, `setIsLabel(isLabel)` (renders a non-interactive header, v0.15.0+), `setWarning(isWarning)` (destructive/red styling). **`setSection`** is the key to consistency: items declaring the same section string are visually grouped and auto-separated, so plugins slot their items into predictable clusters ("action", "danger", "system", "clipboard", …) rather than appending randomly.
- **Extension events** let any plugin decorate the built-in menus without owning them:
  - **`file-menu`** — `(menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf) => any`; fired when a file's context menu opens (source e.g. `'file-explorer'`, `'link-context-menu'`, `'more-options'`).
  - **`editor-menu`** — `(menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo) => any`; right-click inside the editor. (The third arg is the *info* object — a `MarkdownView` for a live editor, or a bare `MarkdownFileInfo` for headless/deferred editors — not always a full view.)
  - **`files-menu`** — multi-file selection variant: `(menu: Menu, files: TAbstractFile[], source: string, leaf?: WorkspaceLeaf) => any`.
  - **`url-menu`** — right-click on an external URL: `(menu: Menu, url: string) => any`.
- Registered as `this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => { menu.addItem(i => i.setTitle('…').setIcon('…').onClick(…)); }))`. DOM markup is `.menu` → `.menu-item` (`.menu-item-icon`, `.menu-item-title`) and `.menu-separator`; disabled items get `.is-disabled`, warning items `.is-warning`.

**Drag-and-drop.**
- File explorer supports drag to move files between folders; dragging a note **into the editor** inserts a `[[wikilink]]` (or an `![[embed]]` for attachments), and dragging with modifiers pastes a path/link. Dragging a **tab** re-docks it into a split or pops it out into a new window.
- Implemented over native HTML5 DnD; plugins hook drop targets with `registerDomEvent(el, 'drop', cb)` / `'dragover'`, and Obsidian resolves the dropped `TFile` to a link via its link-generation settings (relative/absolute/shortest path).

**Ribbon actions & status bar (persistent affordances).**
- **Ribbon:** the left vertical icon strip. `this.addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => any): HTMLElement`. Docs stress the ribbon is *optional* redundancy — users can remove icons or hide the ribbon — so **every ribbon action must also be a command** (a hotkey-able entry). Ribbon icon = discoverability; command = the real contract.
- **Status bar:** `this.addStatusBarItem(): HTMLElement` returns a block you fill with `item.createEl('span', { text: '…' })`. Items auto-space; group elements in one item for tight spacing. Classes: `.status-bar`, `.status-bar-item`. Used for ambient, non-modal state (word count, sync status, backlink count) — *never* for things requiring acknowledgement.

**Callouts (admonitions).**
- Syntax is a blockquote whose first line is `> [!type] Optional title`. Types: `note, abstract` (aliases `summary`/`tldr`), `info, todo, tip` (aliases `hint`/`important`), `success` (`check`/`done`), `question` (`help`/`faq`), `warning` (`caution`/`attention`), `failure` (`fail`/`missing`), `danger` (`error`), `bug, example, quote` (`cite`).
- **Foldable:** append `+` (expanded) or `-` (collapsed) to the type — `> [!warning]- Collapsed`. **Nesting** via stacked `>`.
- Rendered markup: `.callout` with `data-callout="<type>"` (and `data-callout-fold` for fold state) → `.callout-title` (`.callout-icon`, `.callout-title-inner`, `.callout-fold` chevron) → `.callout-content`.
- Theming vars (all from the CSS-variables reference under **Editor › Callout**): `--callout-border-width`, `--callout-border-opacity`, `--callout-padding`, `--callout-radius`, `--callout-blend-mode` ("allows color mixing for nested callouts"), `--callout-title-color`, `--callout-title-padding`, `--callout-title-size`, `--callout-title-weight`, `--callout-content-padding`, `--callout-content-background`. Each built-in type also has a per-type accent var (`--callout-note`/`--callout-info`/`--callout-warning`/`--callout-error`/`--callout-success`/`--callout-question`/`--callout-bug`/`--callout-example`/`--callout-quote`/`--callout-default`/…). Custom callouts are pure CSS: `.callout[data-callout="custom"] { --callout-color: 0, 0, 0; --callout-icon: lucide-alert-circle; }` (`--callout-color` is an *unwrapped* RGB triple — `r, g, b`, 0–255, so it can be wrapped in `rgb()`/`rgba()` at various opacities; `--callout-icon` is a Lucide icon id or an inline `<svg>`).

**Autocomplete popovers as an interaction pattern.**
- Typing `[[` (wikilink), `#` (tag), or a frontmatter key opens the **suggestion popover** — the same visual/keyboard grammar as the Quick Switcher (`Ctrl-O`) and Command palette (`Ctrl-P`). ArrowUp/Down or `Ctrl-N`/`Ctrl-P` move; `Enter`/`Tab` accept; `Esc` dismisses; typing filters live. Consistency across `[[`-complete, quick-switcher, palette, and settings search is a deliberate design choice — one muscle memory for all list-narrowing.

**Feedback: Notice vs status bar.**
- `new Notice(message: string | DocumentFragment, duration?: number)` shows a transient toast in the top-right; `duration` in ms (0 = sticky until clicked/dismissed; omitted uses a default of ~5 s). Methods `setMessage(msg: string | DocumentFragment)` (update in place — good for progress) and `hide()`; elements `noticeEl` (and, since v1.8.7, `messageEl`/`containerEl` for finer DOM control). Use `Notice` for *events* ("Copied", "Sync failed"); use the status bar for *state*. Neither blocks; Obsidian avoids modal alerts for routine feedback.

**Tooltips & the "everything is discoverable" ethos.**
- `setTooltip(el: HTMLElement, tooltip: string, options?: TooltipOptions): void`. `TooltipOptions`: `placement` (a `TooltipPlacement`: `'top' | 'bottom' | 'left' | 'right'`), `delay: number` (ms before show), `classes: string[]`, `gap: number`. Obsidian's own controls set tooltips that *include the current hotkey* ("Open command palette (Ctrl+P)"), so the hover teaches the keyboard path.
- **`registerDomEvent(el, type, cb, options?)`** — the component-scoped `addEventListener` that auto-detaches on unload, preventing leaked listeners; the backbone of every custom hover/drag/click affordance.

### Details that make it feel polished

- **Progressive disclosure via the modifier key:** hover shows nothing; hover+`Mod` reveals the preview. The chrome stays quiet until you signal intent, so the editor never feels busy — yet power is one keypress away. The mode-asymmetry (auto in Reading, Mod-gated in editing) matches user intent: while writing you don't want popovers flickering under the cursor.
- **Menu sectioning & ordering:** because items declare `setSection`, third-party additions land in stable groups with automatic separators; the menu never looks like a random append log. Destructive items use `setWarning(true)` (red) and are pushed to a `danger` section, so "Delete" is visually and spatially distinct from "Rename".
- **Every popover/menu is keyboard-navigable:** context menus accept Arrow keys + `Enter`; suggestion popovers share the switcher's keymap; `Esc` universally closes the topmost transient surface and returns focus to where you were. Focus is *restored*, not dropped to `<body>`.
- **Empty & loading states are designed, not blank:** the Quick Switcher shows recent files before you type; Backlinks/Search show "No backlinks found" copy; the hover popover renders a spinner/placeholder while the note parses. Callouts render an icon even with no title.
- **Fold affordances animate:** callout fold chevrons rotate; the `data-callout-fold` toggles with a height transition rather than a snap, and the fold state is *persisted in the markdown* (`+`/`-`) so it round-trips.
- **Tooltips are delayed and placement-aware** (they flip to stay on-screen) and teach hotkeys, turning every hover into a discoverability moment. Ribbon icons do the same via their `title`.
- **Redundant paths, single source of truth:** ribbon icon, command palette entry, and hotkey all invoke the *same command id*. Nothing is mouse-only; nothing is keyboard-only. Removing the ribbon or hiding the status bar loses zero capability.
- **Non-blocking feedback:** long operations report via a sticky `Notice` you can dismiss, or a live-updating status-bar item, so the UI never freezes behind a modal.
- **Drag targets give visual feedback:** drop zones highlight (`.is-dragging`/drag-over classes), and dragging a tab shows split-preview overlays before you release.

### For Coal

- **Hover preview popover** — Borrow the mode-gated, `Mod`-hover trigger. Since Coal is edit-only (no Reading mode), adopt Obsidian's *editing-mode* rule directly: **hold `Ctrl`/`Cmd` and hover a rendered `[[uuid]]` wikilink → floating preview**. Build it as a CM6 view plugin: register a `mouseover`/`mousemove` DOM handler (Coal's own equivalent of `registerDomEvent`; remember to detach on plugin destroy), gate on `event.ctrlKey || event.metaKey`, hit-test the `.coal-wikilink` decoration under the pointer, resolve the note via the in-memory index, and render the first N lines of its markdown through Coal's existing Live-Preview CM6 pipeline into a detached `EditorView` inside an absolutely-positioned `.coal-hover-popover`. **Keyboard path is mandatory (SPEC §1):** add an M-x command **"Preview note at point"** that opens the same popover anchored at the cursor's wikilink — never require the mouse. Theme it with new `--coal-popover-*` tokens mirroring `--popover-width/-max-height/-font-size`.
- **A real `Menu` primitive** — Coal has *no* context menus. Build a tiny vanilla-DOM `Menu` class (`src/renderer/ui/menu.ts`) mirroring Obsidian's API: `addItem(cb)`, `addSeparator()`, `showAtPosition({x,y})`, `showAtMouseEvent(evt)`, plus `MenuItem` with `setTitle/setIcon/onClick/setSection/setChecked/setDisabled/setWarning`. Reuse the minibuffer's roving-selection keyboard model so the menu is **fully arrow-key navigable** (`Ctrl-N`/`Ctrl-P` + `Enter`/`Esc`, focus restored on close) — mouse-welcome but keyboard-first. Class names `.coal-menu`, `.coal-menu-item`, `.coal-menu-separator`. Emit Coal-internal `file-menu`/`editor-menu` hook points so future features (backlinks, typed-objects) can decorate menus without owning them. Wire right-click on `#file-list` entries (rename/reveal/copy-link) and in the editor (copy block link, follow link). **Keep the command-palette parity rule:** every menu item must also be an M-x command — the menu is discoverability sugar, not a new capability silo (respects SPEC §3, "M-x, no slash commands").
- **Callouts** — High-value, markdown-native, byte-for-byte-safe (they're plain blockquotes, so untouched files stay untouched — SPEC §14 clean). Add a CM6 Live-Preview decoration that detects `> [!type] title` at a blockquote head and renders `.coal-callout[data-callout="type"]` with `.coal-callout-title`/`.coal-callout-icon`/`.coal-callout-content`, honoring the `+`/`-` fold suffix (fold state lives in the text, round-trips for free). Ship the standard type vocabulary and `--coal-callout-*` tokens (`-color`, `-icon`, `-radius`, `-border-opacity`, `-title-color`) so user snippets in `<vault>/.coal/snippets/*.css` can define custom callouts exactly like Obsidian. Add M-x "Insert callout" and "Toggle callout fold".
- **Status bar & ambient affordances** — Coal dropped its top-bar version span; reintroduce ambient state as a **status strip** (or fold into the persistent minibuffer's idle/echo area, which already exists in `src/renderer/ui/minibuffer.ts`). Surface backlink count, git commit/push status, and word count as `.coal-status-item`s. This is the natural home for the git "commit-on-save / pushed" signal Coal already produces.
- **Notices vs echo area** — Coal currently routes all feedback through the minibuffer echo area, which is good (non-blocking, Emacs-faithful). Formalize the split Obsidian codifies: **echo area = state/transient status** (Emacs message line), and add an optional transient **`Notice`-style toast** only for out-of-band events (background git-push failure) that occur while the user's attention is elsewhere. Never introduce a blocking modal for routine feedback.
- **Tooltips that teach hotkeys** — Add a `setTooltip(el, text, {placement, delay})` helper and, per Obsidian, **embed the bound hotkey in the tooltip** ("Open backlinks (C-c C-b)"). This is the cheapest possible discoverability win and reinforces the keyboard-first ethos on the close button, settings gear, and file-list rows.
- **Fuzzy/annotated suggestions** — Coal's minibuffer is substring-only. Obsidian's switcher/palette use fuzzy matching with match-highlighting and right-aligned annotations (file path, hotkey). Upgrade the minibuffer's candidate model to fuzzy/orderless with highlighted match spans and an annotation column (note path for quick-open, bound key for M-x) — one narrowing grammar reused by M-x, quick-open, and `[[` autocomplete, exactly as Obsidian reuses one suggestion widget everywhere.
- **Drag-and-drop (mouse-welcome, optional)** — Lower priority given keyboard-first, but consistent with "mouse OK for spatial surfaces." Support dropping a file from `#file-list` or the OS into the editor to insert a `[[uuid]]` link (resolve via the index and mint/reuse the target id). Use Coal's DOM-event registration with cleanup; highlight the drop zone. Purely additive to the keyboard flow.
- **Discoverability contract** — Adopt the invariant wholesale: **every action has (a) an M-x command, (b) a hotkey where sensible, and (c) optionally a menu item / affordance that invokes the same command id.** This single rule is what makes Obsidian feel coherent, and it aligns perfectly with Coal's SPEC §1/§3 keyboard-first, M-x-centric design.

**Sources:** https://docs.obsidian.md/Reference/TypeScript+API/Menu · https://docs.obsidian.md/Reference/TypeScript+API/MenuItem · https://obsidian.md/help/plugins/page-preview · https://docs.obsidian.md/Reference/TypeScript+API/Plugin/registerHoverLinkSource · https://docs.obsidian.md/Reference/TypeScript+API/HoverLinkSource · https://obsidian.md/help/callouts · https://docs.obsidian.md/Reference/CSS+variables/Editor/Callout · https://docs.obsidian.md/Reference/CSS+variables/Components/Popover · https://docs.obsidian.md/Reference/TypeScript+API/Workspace/on('file-menu') · https://docs.obsidian.md/Reference/TypeScript+API/Workspace/on('editor-menu') · https://docs.obsidian.md/Reference/TypeScript+API/Workspace/on('files-menu') · https://docs.obsidian.md/Reference/TypeScript+API/Workspace/on('url-menu') · https://docs.obsidian.md/Reference/TypeScript+API/Notice · https://docs.obsidian.md/Plugins/User+interface/Status+bar · https://docs.obsidian.md/Plugins/User+interface/Ribbon+actions · https://docs.obsidian.md/Reference/TypeScript+API/setTooltip · https://docs.obsidian.md/Reference/TypeScript+API/TooltipOptions · https://docs.obsidian.md/Reference/TypeScript+API/TooltipPlacement · https://docs.obsidian.md/Reference/TypeScript+API/Component/registerDomEvent · https://obsidian.md/help/plugins/command-palette · https://obsidian.md/help/plugins/quick-switcher

---

## 10. Coal — UI/UX gap analysis & prioritized roadmap

Coal (v0.18.0) already shares Obsidian's two load-bearing foundations — a **CodeMirror 6** editor and **vanilla-DOM chrome** — and it has copied Obsidian's single most important idea (the Live-Preview cursor-line reveal). But almost everything *around* the editor is either absent or a first-draft stub, which is why the app "feels lacking." This chapter maps each subsystem above onto Coal's real surfaces and orders the work by leverage-per-effort, respecting the non-negotiables (keyboard-first §1; `M-x`, no slash commands §3; vanilla-DOM chrome + CM6 §13; markdown-as-truth §10; byte-for-byte §14; edit-only; Linux/macOS only).

### Subsystem-by-subsystem gap

| § | Obsidian subsystem | What Coal has today | The gap |
|---|---|---|---|
| 1 | Workspace: split tree, tabs, sidebars, pop-outs | Fixed `#body` = left file-list + one editor. No tabs, splits, right sidebar, or collapsible panels. | **No layout model at all.** This blocks docking any panel (backlinks/outline/graph) properly — the biggest structural gap. |
| 2 | Command palette + commands + hotkeys | `M-x` over a `CommandRegistry` (`commands.ts`), rendered in the minibuffer. | No hotkey hints on palette rows, no recent/pinned ordering, substring-only filter. |
| 3 | Quick Switcher + search + operators | Quick-open over note titles in the minibuffer; substring match. | No fuzzy ranking, no create-on-no-match affordance, **no in-vault search UI at all**. |
| 4 | Editor: Live Preview / Source / Reading + `EditorSuggest` | Live-Preview decorations w/ cursor-line reveal; `[[` autocomplete via `@codemirror/autocomplete`; `^id`/URL hiding. | Widgets aren't **atomic** (caret can land inside hidden UUIDs); no Source-mode toggle; autocomplete rows show titles but no annotation; no fold. |
| 5 | File explorer: folder tree, drag-drop, context menu | `renderFileList` = **flat** list of filename buttons (`index.ts`). | No folders/tree, no expand-collapse, no keyboard tree-nav, no context menu, no reveal-active-file. |
| 6 | Backlinks / outgoing / outline / properties / graph | Keyboard backlinks navigator **docked below** the editor (`backlinks.ts`). | Wrong location (should be a right dock); no outline pane, no properties widget, no graph. |
| 7 | Appearance: `--*` foundation→semantic→component tokens | `--coal-*` token contract (`docs/theming.md`), 3 named themes, user snippets. | Token set is flat/small vs Obsidian's layered system; no accent-HSL derivation; themes need redesign. |
| 8 | Settings + modals + notices + component library | Vanilla-DOM settings modal w/ 4 panes (`settings.ts`). | No reusable `Setting`-row builder, few panes, no transient notices/toasts (only the echo area), no generic modal primitive. |
| 9 | Micro-UX: hover preview, context menus, callouts, tooltips | Persistent Emacs minibuffer echo area; external-link click. | No hover preview, no context menus anywhere, no callouts, no tooltips — the "unfinished" feeling lives here. |

### Prioritized roadmap (highest leverage first)

**Tier 1 — the structural + "feel" wins that unblock everything else**

1. **A minimal workspace/leaf model + collapsible sidebars** *(new; enables the TODO "collapsible right-hand panel" and "tree file picker" items).* Introduce a tiny vanilla-TS `WorkspaceSplit`/`WorkspaceLeaf` with a `View` contract (`getViewType`/`onOpen`/`onClose`) and a `registerView(type, factory)` registry, plus a left+right collapsible sidedock and an `active-leaf-change`/`file-open` event bus. First cut: one root editor leaf + a collapsible right dock. This is the precondition for docking backlinks/outline/graph and is the single biggest cause of the "empty, flat" feel. Files: new `src/renderer/workspace/*`, refactor `index.ts` `#body`.
2. **Atomic editor widgets + Source-mode toggle** *(new; cheap, high feel, protects §9/§14).* Wire `EditorView.atomicRanges` so arrows/Backspace treat a rendered `[[uuid|alias]]` and `^id:` marker as one glyph (stops the caret getting "stuck" in hidden UUID text); add a boolean facet that suppresses all hide/replace decorations, exposed as `M-x` "Toggle Live Preview/Source mode". Files: `src/renderer/editor/wikilink.ts`, `idDecoration.ts`, `setup.ts`.
3. **Minibuffer upgrade: fuzzy match + candidate annotations + hotkey hints** *(new; leverages the just-written `reference/07-vertico.md` / `08-marginalia.md` / `09-consult.md` / `10-orderless.md`).* Replace substring matching with an **orderless-style** space-separated matcher + highlight; add a **marginalia-style** secondary/annotation column (command→its keybinding; note→path/type) to each candidate row; show the bound hotkey on `M-x` rows. This is the highest daily-value non-structural change. Files: `src/renderer/ui/minibuffer.ts`, `commands.ts`.

**Tier 2 — the panels and navigation users touch constantly**

4. **File-explorer tree** *(TODO: "Better file picker — a `tree`-command-like file tree").* Nested folders, expand/collapse, indent guides, keyboard tree-nav (arrows / RET open / collapse), and a right-click **context menu** (first use of a shared `Menu` primitive). Requires the vault scan to carry directory structure. Files: `index.ts` `renderFileList`, vault scan.
5. **Right-dock backlinks + a new outline pane** *(TODO: "Move the textual graph to a collapsible right-hand panel").* Re-home `backlinks.ts` as a leaf in the Tier-1 right dock; add an **Outline** leaf (heading tree from the note index → click/RET to jump). Both re-query on the `active-leaf-change` event.
6. **`EditorSuggest`-contract autocomplete** *(new; extends existing `[[` completion).* Keep `@codemirror/autocomplete` but adopt Obsidian's contract: an `onTrigger`-style `{start,end,query}` detector, insert the UUID by replacing the whole region, and render **title + annotation** per row. Extend the same pattern to future `#tag` / frontmatter-property suggesters feeding the typed-object index (§11). Files: `src/renderer/editor/wikilinkComplete.ts`.

**Tier 3 — the design-system and polish layer that makes it look finished**

7. **Layer the `--coal-*` token system + redesign themes** *(TODO: "Redesign ALL themes").* Restructure tokens into Obsidian's three tiers — **foundation** (color ramp, an `--coal-accent-h/s/l` HSL accent, a `--size-*` spacing scale, `--radius-*`), **semantic** (`--coal-bg-primary/secondary`, `--coal-text-normal/muted/faint`), **component** (buttons, inputs, the minibuffer, tabs) — then rebuild the three themes on it. Add a `--coal-file-line-width` (Obsidian's `--file-line-width` analog) + a Settings → Appearance control. Files: `docs/theming.md`, `style.css`, `theme.ts`.
8. **A `Setting`-row builder + expanded panes** *(TODO: "Expand the settings panel").* A reusable `Setting(name, desc).addToggle/addText/addDropdown/addSlider/addButton` builder (mirroring Obsidian's), then Editor/Appearance-icons/Graph panes. Add transient **notices/toasts** as a complement to the persistent echo area. Files: `settings.ts`, `settingsPanes.ts`, `minibuffer.ts`.
9. **Hover preview, context menus everywhere, callouts, tooltips** *(new).* A `Ctrl`/keyboard-triggered page-preview popover over `[[uuid]]` links; a shared `Menu` used by the file tree, editor, and tabs; `> [!note]`-style foldable callout rendering as a CM6 widget; `setTooltip`-style hover hints. These are individually small but collectively are what reads as "polished."

### The single biggest "feel" wins

- **The workspace/sidebar skeleton (Tier 1.1)** — until panels can dock in a collapsible right sidebar, everything else looks like a toy. This one change makes Coal read as a real editor.
- **A fuzzy, annotated minibuffer (Tier 1.3)** — the surface the keyboard-first user hits dozens of times an hour; the Emacs-stack research (vertico/marginalia/consult/orderless) is a ready-made blueprint.
- **Atomic editor widgets (Tier 1.2)** — removes the most jarring daily papercut (caret stuck in hidden UUIDs) for almost no code.

### Explicit non-goals (Obsidian UI Coal deliberately won't copy)

- **Reading view / the HTML render pipeline** (`MarkdownRenderer`, markdown post-processors) — contradicts Coal's edit-only scope (§13). "Source mode" is a decoration toggle, not a second renderer.
- **An exporter** — the plain-text files *are* the export story (§13).
- **Slash-command menus** — Coal is `M-x` only (§3); Obsidian's command palette is the model, not its `/` block-insert menu.
- **Mandatory-cloud sync / mobile-first responsive chrome / any Windows affordance** — out of scope by owner decision.
- **Canvas / JSON Canvas** — Obsidian's infinite-canvas board is a spatial, non-Markdown surface; like the visual graph it falls outside Coal's edit-only, markdown-as-truth core (§10/§13). Not a UI/UX target.
- **The *visual* graph is optional and mouse-first** — per §1 it's a legitimately spatial surface; the *textual* graph (backlinks/outline navigator) carries the keyboard-first daily value and comes first.

---

## Sources

Each section above ends with its own `**Sources:**` line citing the exact pages used (≈100 unique URLs across Obsidian Help + Developer Docs). The primary roots and principal hubs:

**Obsidian Help** (obsidian.md/help — the `help.obsidian.md` links below redirect there)
- Edit and read (Live Preview / Source / Reading) — https://help.obsidian.md/edit-and-read
- Command palette — https://help.obsidian.md/plugins/command-palette
- Hotkeys — https://help.obsidian.md/hotkeys
- Quick switcher — https://help.obsidian.md/plugins/quick-switcher
- Search — https://help.obsidian.md/plugins/search
- Tabs — https://help.obsidian.md/tabs · Sidebar — https://help.obsidian.md/sidebar · Ribbon — https://help.obsidian.md/ribbon · Workspaces — https://help.obsidian.md/plugins/workspaces · Pop-out windows — https://help.obsidian.md/pop-out-windows
- Backlinks — https://help.obsidian.md/plugins/backlinks · Outgoing links — https://help.obsidian.md/plugins/outgoing-links · Outline — https://help.obsidian.md/plugins/outline · Graph — https://help.obsidian.md/plugins/graph · Properties — https://help.obsidian.md/properties
- Appearance — https://help.obsidian.md/appearance · CSS snippets — https://help.obsidian.md/snippets · Callouts — https://help.obsidian.md/callouts · Page preview — https://help.obsidian.md/plugins/page-preview

**Obsidian Developer Docs** (docs.obsidian.md)
- Editor extensions — https://docs.obsidian.md/Plugins/Editor/Editor+extensions · Decorations — https://docs.obsidian.md/Plugins/Editor/Decorations · View plugins — https://docs.obsidian.md/Plugins/Editor/View+plugins · State fields — https://docs.obsidian.md/Plugins/Editor/State+fields · Viewport — https://docs.obsidian.md/Plugins/Editor/Viewport · Markdown post processing — https://docs.obsidian.md/Plugins/Editor/Markdown+post+processing
- Editor (API) — https://docs.obsidian.md/Reference/TypeScript+API/Editor · EditorSuggest — https://docs.obsidian.md/Reference/TypeScript+API/EditorSuggest · SuggestModal — https://docs.obsidian.md/Reference/TypeScript+API/SuggestModal · FuzzySuggestModal — https://docs.obsidian.md/Reference/TypeScript+API/FuzzySuggestModal · prepareFuzzySearch — https://docs.obsidian.md/Reference/TypeScript+API/prepareFuzzySearch
- Workspace — https://docs.obsidian.md/Plugins/User+interface/Workspace · Views — https://docs.obsidian.md/Plugins/User+interface/Views · Commands — https://docs.obsidian.md/Plugins/User+interface/Commands · Modals — https://docs.obsidian.md/Plugins/User+interface/Modals · Ribbon actions — https://docs.obsidian.md/Plugins/User+interface/Ribbon+actions · Status bar — https://docs.obsidian.md/Plugins/User+interface/Status+bar
- CSS variables (index) — https://docs.obsidian.md/Reference/CSS+variables/CSS+variables · Foundations: Colors — https://docs.obsidian.md/Reference/CSS+variables/Foundations/Colors · Typography — https://docs.obsidian.md/Reference/CSS+variables/Foundations/Typography · Spacing — https://docs.obsidian.md/Reference/CSS+variables/Foundations/Spacing · Editor/File — https://docs.obsidian.md/Reference/CSS+variables/Editor/File · Build a theme — https://docs.obsidian.md/Themes/App+themes/Build+a+theme
- MetadataCache — https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache · CachedMetadata — https://docs.obsidian.md/Reference/TypeScript+API/CachedMetadata · Menu — https://docs.obsidian.md/Reference/TypeScript+API/Menu · Notice — https://docs.obsidian.md/Reference/TypeScript+API/Notice · Scope/Keymap — https://docs.obsidian.md/Reference/TypeScript+API/Scope · registerHoverLinkSource — https://docs.obsidian.md/Reference/TypeScript+API/Plugin/registerHoverLinkSource
