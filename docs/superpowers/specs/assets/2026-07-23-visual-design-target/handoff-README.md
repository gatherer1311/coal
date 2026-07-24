# Handoff: Coal — Main Window UI (two versions)

## Overview
Coal is a Linux-only, keyboard-driven application whose command model is built around an **Emacs-style minibuffer**. This bundle contains **two versions of the main window**, sharing one shell and theme:

1. **PKM version** (`coal-pkm-mockup.html`) — the knowledge-base mode: Obsidian-style markdown vault with explorer sidebar, tabbed editor, per-pane modeline, right context panel (graph / properties / outline / linked mentions), and the minibuffer.
2. **Base editor version** (`coal-base-mockup.html`) — the bare-bones Emacs/Vim-like text-editor mode: no sidebars, full-width tab strip, code buffer, minimal modeline, and the same minibuffer.

Both are states of the same application — implement the shared shell once, then the two layouts on top of it.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these designs in the target codebase's environment** using its established patterns and libraries — or, if no environment exists yet, choose the most appropriate stack for a Linux desktop app (e.g. GTK, Qt, Tauri/Electron + web UI) and implement the designs there.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and copy are final for the default theme. Recreate pixel-perfectly, with one architectural requirement: **every color/font below must be driven by user-overridable CSS (or equivalent theming layer)**. The default theme is called **"sublime"** — pure black with sublime-green accents. Users will restyle the app with their own CSS later, so no color may be hard-wired into logic.

---

# Shared shell (both versions)

Root: fills viewport, `background: #000000`, base text `#c9d3ba` at 14px, **JetBrains Mono everywhere**.

## Top bar (34px, full width)
- Left: app dot (10px circle, accent). *PKM version only:* preceded by a sidebar-toggle icon button (26×24px, 5px radius; 15px outlined rect with vertical divider at left third; `#5c6850`, hover `#c9d3ba` on `#10150a`).
- Center: full path of the open file, 12px, `#49543c` (PKM: `~/vault/03 projects/coal/minibuffer design.md`; Base: `~/dev/watcher/main.py`).
- Right: *PKM only:* right-panel toggle (same button style, divider at right third). Then the **GNOME-style close button**: 26px filled circle `#1b2213` (hover `#28331b`) with an 11px bold × (stroke ~3.6, round caps) in `#dce8c6`. No minimize/maximize — Linux/GNOME convention, close only.
- Bottom border `1px #1a2013`.

## Tab strip (34px, VSCode-style, one group)
Active tab: bg `#0d1207`, text `#dce8c6`, 2px accent line inset at top, ✕ close glyph `#5c6850`. Inactive: text `#6d7a5e`, hover `#9aa886`. 12.5px, 1px separators `#141910`/`#1a2013`, trailing `+`. Tabs never wrap (`white-space: nowrap`); strip clips overflow. In the **PKM version** the strip sits inside the editor column (between the sidebars); in the **Base version** it spans the entire window width.

## Editor chrome (both)
- Padding 18px vertical, line-height 24px, font 14px.
- **Gutter:** 60px right-aligned, 12px, `#3f4a33`. **Relative line numbers** (vim `relativenumber`); the cursor line shows its absolute number in accent.
- **Current line:** background = accent at ~7% (`color-mix(in srgb, var(--accent) 7%, transparent)`).
- **Block cursor (vim normal mode):** character cell filled with accent, glyph in black, blinking `step-end` ~1.1s.

## Per-pane modeline (bottom of each pane)
Bg `#14180d`, top border `1px #232a1a`, 12px, 2px 12px padding, no wrap. Contents differ per version (below).

## Minibuffer (30px, full width, bottom of frame — Emacs-style)
Top border `1px #232a1a`, 13px, 14px side padding. Two states:
- **Idle (echo line, default):** last message left in `#6d7a5e` (e.g. `Wrote 03 projects/coal/minibuffer design.md` / `Wrote ~/dev/watcher/main.py`); right-side hint `M-x commands · C-h help` in `#3f4a33` at 11.5px.
- **Active (M-x):** the line shows match counter (accent, e.g. `47/312`) + bold `M-x` prompt + typed query + blinking accent block cursor (8×17px). A **completion panel grows upward** from the minibuffer (absolutely positioned above it, overlaying the modeline; bg `#050705`, top border `#232a1a`, shadow, line-height 2). Rows: command name column 300px (18px pad, `#cfe39a`) + description (`#5c6850`). Selected row: bg = accent at 16%, name accent bold, description `#9aa886`.
- Sample commands, PKM flavor: `graph-local` (selected), `graph-global`, `note-new`, `note-daily`, `link-insert`, `buffer-switch`, `search-vault`, `theme-reload`. Base-editor flavor: `buffer-switch` (selected), `buffer-kill`, `file-find`, `search-project`, `replace-string`, `comment-region`, `theme-reload`.

---

# Version 1 — PKM (`coal-pkm-mockup.html`)

Root grid rows `34px / 1fr / 30px`, `min-width: 1280px`. Middle row is a flex of: explorer (240px, collapsible) | editor column (flex 1) | context panel (300px, collapsible).

## Explorer sidebar (240px, collapsible via left top-bar toggle)
- Header: `EXPLORER` (10px, letter-spacing .12em, `#6d7a5e`) + new-note (plus) and sort icons (`#5c6850`).
- File tree, 13px, line-height 1.9, folders `#9aa886` prefixed `▸`/`▾`, files `#7c8a6c`. Indents: folders 12px, nested 20px, files 28–36px.
- Active file row: bg `#141b0b`, accent text. Hover: bg `#0b0f06`.
- Contents: `00 inbox`, `01 daily` (open: `2026-07-22.md`, `2026-07-23.md`), `02 zettel`, `03 projects` → `coal` (open: `keybindings.md`, **`minibuffer design.md`** active, `roadmap.md`), `04 areas`, `templates`.
- Right border `1px #1a2013`.

## Editor (markdown, source view only)
Markdown token colors: frontmatter `---` `#49543c`, keys `#6d7a5e`, values `#9aa886`; heading markers `#5c6850`; H1 text accent bold ~1.15em; H2 text `#dce8c6` bold; body `#c9d3ba`; wikilinks `[[…]]` accent + 1px dotted underline `#4d5c22`; tags `#8aa25c`; list dashes & checkbox brackets `#5c6850`; checked `x` accent; unchecked-task text `#9aa886`; inline code bg `#10150a`, text `#cfe39a`, 3px radius, 5px side padding.

## PKM modeline
- Left cluster (gap 12): `src` view-mode badge (1px border `#2b3520`, 3px radius, `#cfe39a`) · git `⎇ main` (`#9aa886`) with dirty count `+1` in accent.
- Right cluster (gap 12, `#5c6850`): `26 lines · 148 words · 1,022 chars · 2 outgoing · 4 backlinks` + cursor `(13,26)` in `#9aa886`.
- `src` = current viewing mode (source/raw markdown; the slot where other view modes would surface).

## Context panel (300px, collapsible via right top-bar toggle, scrollable)
Section headers 10px, tracking .12em, `#6d7a5e`, 12px 16px padding; separators `1px #141910`.
1. **GRAPH — pinned** (`position: sticky; top: 0` over black; stays while sections scroll). Local graph: center node 8px accent circle, neighbors 5px `#3f4a33`, edges 1px `#232a1a`, labels 9px mono `#6d7a5e` (center `#cfe39a`). Neighbors: Coal, Emacs, keybindings, cmd palette.
2. **PROPERTIES** (Capacities-style, 12px, key column 84px `#5c6850`): `type` = chip `design-doc` (bg `#10150a`, border `#232a1a`, text `#cfe39a`); `status` = accent 7px dot + `in-progress`; `created` `2026-07-21`; `updated` `today 02:31`; `tags` `#coal #ux #minibuffer` in `#8aa25c`.
3. **OUTLINE:** H1 `#dce8c6`, active section accent, others `#9aa886` (hover `#dce8c6`), 16px indent per level.
4. **LINKED MENTIONS (3):** source note name `#cfe39a`, snippet `#5c6850` with `[[minibuffer design]]` match highlighted `#9db56a`.

---

# Version 2 — Base editor (`coal-base-mockup.html`)

The de-PKM'd, Emacs/Vim-like mode. Root grid rows `34px / 34px / 1fr / 30px`, `min-width: 1080px`. **No sidebars and no sidebar toggle buttons** — top bar holds only app dot, file path, close button.

- **Tab strip spans the entire window.** Tabs: **`main.py`** (active), `lib.rs`, `app.ts`, `+` — one buffer each of Python, Rust, TypeScript.
- **Editor:** code buffer (the mockup shows a ~23-line Python file). Same gutter/relative-numbers/current-line/block-cursor rules. Code token colors: comments/shebang `#49543c`; strings & docstrings `#8aa25c`; numbers `#9db56a`; keywords (`import`, `from`, `def`, `return`, `while`, `if`, `for`, `in`) `#cfe39a`; function names at definition `#dce8c6` bold; builtins/types (`dict`, `None`, `True`, `print`) `#9aa886`; punctuation/identifiers `#c9d3ba`. Indentation preserved (`white-space: pre`).
- **Minimal modeline:** cursor position `(14,29)` far left (`#9aa886`); file stats far right (`#5c6850`, gap 12): `23 lines · 68 words · 512 chars`. **Nothing else** — no view-mode badge, no git status, no link counts.
- **Minibuffer:** identical to shared spec; idle echo `Wrote ~/dev/watcher/main.py`; active state uses the editor-flavored command list.

---

# Interactions & Behavior
- **PKM sidebar toggles** (top bar): collapse/expand explorer and context panel; editor absorbs the space. Both open by default. (Base version has none.)
- **Minibuffer:** `M-x` opens command completion (grows upward, never covers the minibuffer line itself); fuzzy match on name + description; selection highlight; idle shows last echo message. Planned (not in mockups): inline argument prompts (`find-note:`), history ring `M-p`/`M-n`.
- **Vim editing model:** block cursor (normal mode), relative line numbers, current-line highlight, blink ~1.1s step-end.
- **Hovers:** tree rows/inactive tabs brighten; icon buttons get `#10150a` bg; close button lightens to `#28331b`.
- **Window chrome:** single GNOME-style close button; Linux-only, no minimize/maximize.

# State Management
- `mode: pkm | editor` — which main-window layout is active (the two versions in this bundle).
- `leftOpen`, `rightOpen: boolean` (PKM, default true).
- `minibufferState: idle | active`; `query`, `matchIndex/matchCount`, `selectedCommand`.
- `accent: color` (default `#b8e62d`) — exposed as CSS var `--accent`; used by: app dot, active tab line, active file, headings, wikilinks, cursor, current-line tint, checkboxes, status dot, graph center node, match counter, selected completion row, git dirty count.
- Per-pane derived data: line/word/char counts, cursor `(line,col)`; PKM adds outgoing links, backlinks, git branch + dirty count, view mode.

# Design Tokens (default theme: "sublime")
All colors must come from the theming layer (user-overridable CSS).
- Background: pure black `#000000` everywhere.
- Accent (sublime green): `#b8e62d` (`--accent`).
- Text: bright `#dce8c6` · base `#c9d3ba` · soft-accent `#cfe39a` · mid `#9aa886` · files/dim-links `#7c8a6c` · dim `#6d7a5e` · dimmer `#5c6850` · faint `#49543c` · gutter `#3f4a33`.
- Greens (semantic): tag/string `#8aa25c`, mention-highlight/number `#9db56a`, wikilink underline `#4d5c22`.
- Surfaces: active tab `#0d1207` · active file `#141b0b` · modeline `#14180d` · inline code/chips `#10150a` · hover `#0b0f06`/`#10150a` · close button `#1b2213` (hover `#28331b`) · completion panel `#050705`.
- Borders: primary `#1a2013` · subtle `#141910` · strong `#232a1a` · badge `#2b3520`.
- Graph: node `#3f4a33`, edge `#232a1a`.
- Selection: accent @25%. Current line: accent @7%. Selected completion row: accent @16%.
- Type: JetBrains Mono (400/700) only. Sizes: base 14 / tabs 12.5 / modeline & top bar 12 / gutter 12 / minibuffer 13 / properties & snippets 12 / section headers 10 (tracking .12em) / hint 11.5. Editor line-height 24px.
- Radii: 3px (badges, chips, code), 5–6px (icon buttons), 50% (dots, close).
- Bars: top 34 / tabs 34 / modeline ~24 / minibuffer 30. Panels (PKM): explorer 240, context 300. Gutter 60.

# Assets
None. All icons are simple inline SVG strokes (panel toggles, plus, sort, ×); the graph is rendered (real app: force-directed canvas/SVG). No emoji, no icon fonts, no images.

# Files
- `coal-pkm-mockup.html` — PKM version; self-contained, open in any browser.
- `coal-base-mockup.html` — base editor version; self-contained, open in any browser.
- `README.md` — this document.

In both files the readable `<x-dc>` template inside is the source of truth (inline styles = the spec). Both render the **idle** minibuffer by default; the active M-x state is specified above (§Minibuffer).
