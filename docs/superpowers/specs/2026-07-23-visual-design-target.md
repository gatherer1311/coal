# Coal — Visual design target ("Sublime" main window) — reference

Date: 2026-07-23
Status: **reference / filed** — the concrete visual target for the [`TODO.md`](../../../TODO.md)
*"Visual design target"* pre-build gate. This is **not** a design session and it ratifies no new
decision; it files the Claude-Design mockup as the of-record visual reference and **anchors the
concrete "Sublime" palette** that [`SPEC.md`](../../../SPEC.md) §8.1 defers to "the pre-build visual
design." One item is left **open, not resolved**: the PROPERTIES panel vs. the §14 "no GUI properties
editor" boundary (see [§4](#4-open-reconciliation)). Grounded in `SPEC.md` §8.1 (theming), §14 / §14.1
(v1 surface roster + workspace shell), and the [kernel walking-skeleton build
sequence](2026-07-22-kernel-walking-skeleton-design.md) §1.1.

## What this is

A **high-fidelity** visual design of Coal's main window, delivered as self-contained HTML mockups plus
this record. It is the concrete target the `TODO.md` pre-build gate asks for — "produce a visual design
so there is a concrete visual target to build toward, rather than designing UI ad hoc during the
build." It does **not** reprioritize the build sequence (step 4 — both keymaps + first-run prompt —
remains next); it is the picture the later UI-bearing steps build toward.

Two renderings of **one shared shell + theme** — implement the shell once, then the two layouts on top:

- **PKM version** (`coal-pkm-mockup.html`) — the knowledge-base layout: explorer sidebar, tabbed
  markdown editor, per-pane modeline, right context panel (local graph / properties / outline / linked
  mentions), and the minibuffer.
- **Base editor version** (`coal-base-mockup.html`) — the de-PKM'd Emacs/Vim text-editor layout: no
  sidebars, full-width tab strip, syntax-highlighted code buffer, minimal modeline, same minibuffer.

The default theme is **"Sublime"**: pure black with sublime-green accents, JetBrains Mono throughout.
The hard architectural requirement carried by the mockup: **every color and font must be driven by
user-overridable CSS** (the §8.1 CSS-variable theming layer) — no color may be hard-wired into logic.

## Files (`assets/2026-07-23-visual-design-target/`)

The handoff bundle **as delivered**, plus reviewer conveniences:

| File | What it is |
| --- | --- |
| [`handoff-README.md`](assets/2026-07-23-visual-design-target/handoff-README.md) | The designer's handoff spec — the authoritative prose (shared shell, both versions, tokens, interactions, state). Read this for full detail. |
| [`coal-pkm-mockup.html`](assets/2026-07-23-visual-design-target/coal-pkm-mockup.html) | PKM version — self-contained, opens in any browser (React/fonts/runtime embedded). |
| [`coal-base-mockup.html`](assets/2026-07-23-visual-design-target/coal-base-mockup.html) | Base editor version — self-contained. |
| [`coal-pkm.template.html`](assets/2026-07-23-visual-design-target/coal-pkm.template.html) · [`coal-base.template.html`](assets/2026-07-23-visual-design-target/coal-base.template.html) | Readable, diff-friendly extractions of the `<x-dc>` template (the "source of truth" per the handoff) — the inline-styled DOM without the embedded font blobs. |
| [`coal-pkm.render.png`](assets/2026-07-23-visual-design-target/coal-pkm.render.png) · [`coal-base.render.png`](assets/2026-07-23-visual-design-target/coal-base.render.png) | Rendered reference screenshots (1360×820 @2×) — quick view without a browser. |
| [`support.js`](assets/2026-07-23-visual-design-target/support.js) | The mockup's generic HTML→React rendering runtime. **Not Coal code** — kept only for bundle provenance; the HTML files render without it. |

This whole `assets/` tree is **vendored, non-source reference material** — never built, imported, or
shipped — so it is excluded from CodeQL scanning (`.github/codeql/codeql-config.yml`); the mockup
runtime's `eval` / `Function` / `innerHTML` patterns are the renderer's, not Coal's. Coal's actual
source is unaffected and still fully scanned.

## 1. The "Sublime" design tokens (the §8.1 anchor)

`SPEC.md` §8.1 leaves the concrete variable *values* to "the pre-build visual design." These are those
values. They are the **default-theme palette**, to be expressed as the CSS custom properties the whole
UI reads from; the exact variable *names* remain the build-time catalogue §8.1 says lands with the
first themable surfaces. (Verbatim from the handoff.)

- **Background:** pure black `#000000` everywhere.
- **Accent** (sublime green): `#b8e62d` — exposed as `--accent`; drives app dot, active-tab line,
  active file, headings, wikilinks, block cursor, current-line tint, checkboxes, status dot, graph
  center node, match counter, selected completion row, git dirty count.
- **Text ramp:** bright `#dce8c6` · base `#c9d3ba` · soft-accent `#cfe39a` · mid `#9aa886` ·
  files/dim-links `#7c8a6c` · dim `#6d7a5e` · dimmer `#5c6850` · faint `#49543c` · gutter `#3f4a33`.
- **Semantic greens:** tag/string `#8aa25c` · mention-highlight/number `#9db56a` · wikilink underline
  `#4d5c22`.
- **Surfaces:** active tab `#0d1207` · active file `#141b0b` · modeline `#14180d` · inline code/chips
  `#10150a` · hover `#0b0f06` / `#10150a` · close button `#1b2213` (hover `#28331b`) · completion panel
  `#050705`.
- **Borders:** primary `#1a2013` · subtle `#141910` · strong `#232a1a` · badge `#2b3520`.
- **Graph:** node `#3f4a33` · edge `#232a1a`.
- **Blends:** selection = accent @25% · current line = accent @7% · selected completion row = accent
  @16% (via `color-mix(in srgb, var(--accent) N%, transparent)`).
- **Type:** JetBrains Mono (400/500/700) only. Sizes — base 14 / tabs 12.5 / modeline & top bar 12 /
  gutter 12 / minibuffer 13 / properties & snippets 12 / section headers 10 (tracking .12em) / hint
  11.5. Editor line-height 24px.
- **Radii:** 3px (badges, chips, code) · 5–6px (icon buttons) · 50% (dots, close).
- **Bar heights:** top 34 / tabs 34 / modeline ~24 / minibuffer 30. Panels — explorer 240 · context
  300 · gutter 60.

Token colors for markdown/code syntax and the per-version modeline contents are in the handoff-README
(§Editor, §Version 1/2).

## 2. How it maps to the build sequence

The mockup is a **whole-window picture**; the code reaches it over several build-sequence steps. It
does **not** move anything forward — it is the target those steps aim at.

| Mockup surface | Where it lands | Build-sequence step |
| --- | --- | --- |
| Editor pane (gutter, relative numbers, current-line, block cursor) | kernel (CM6) — **partly built** | 1 (done) + 6 (syntax) |
| Minibuffer (idle echo + `M-x` completion panel) | kernel — **rendered today** (`src/renderer/minibuffer.ts`) | 2 (done) |
| Top bar, tab strip, explorer sidebar, per-pane modeline / status bar, splits | kernel **workspace shell** (§14.1) — **not built** | 7 |
| Right context panel — local graph, properties, outline, **linked mentions/backlinks** | **plugin-delivered** surfaces docked into the shell (Linking/PKM + Graph plugins) | 5 (substrate) + 7 (docks); graph renderer = [cosmos.gl](2026-07-22-graph-view-design.md) |
| The "Sublime" look itself | the CSS-variable **theming layer** (§8.1) | queued theming design session (`TODO.md`) — this doc supplies its values |

So realizing the full PKM window depends on the plugin substrate (step 5) and the workspace shell
(step 7); the base-editor window is closer — mostly shell chrome (step 7) over the kernel editor that
exists. The base version is the natural **first shell milestone** (it is the shell with the PKM docks
subtracted).

## 3. Coverage vs. the §14 gate

The `TODO.md` gate scopes the visual target to "the §14 roster — editor, workspace shell §14.1,
minibuffer, Links/Dangling panels §13.9/§13.14, outline & status-bar, settings." This mockup covers
**most**, not all:

- **Covered:** shared shell (top bar, tabs, splits-implied), editor, minibuffer (idle + active `M-x`),
  explorer/file-tree, per-pane modeline / status bar, outline panel, linked-mentions (a backlinks
  surface), local graph, and the full "Sublime" palette + type scale.
- **Not yet shown:** the bidirectional **Links panel** (*Links to* / *Linked from*, §13.14) and the
  **Dangling** panel (§13.9) as distinct surfaces, the **quick switcher**, the **Settings UI** (§14 /
  step 9), hover preview, and the Vim command-line/search minibuffer state (only Emacs `M-x` is drawn).

The gate therefore stays **open**: this artifact is a large down-payment on it (and the concrete-theme
half is effectively complete), with the surfaces above still to be drawn or specified before "building
starts against an agreed visual target."

## 4. Open reconciliation

**PROPERTIES panel vs. §14 "no GUI properties editor."** The PKM version's right panel includes a
Capacities-style **PROPERTIES** section (`type` chip, `status` dot, `created` / `updated`, `tags`).
`SPEC.md` §14 carries a ratified boundary: *"no GUI properties editor — frontmatter is edited as text
(§7.1 / §2)."* As drawn the panel is **read-only** (it reflects frontmatter; nothing shows an edit
affordance), which may be compatible with the decision — a *display* of properties is not a properties
*editor*. But the surface reads as the kind of GUI the boundary was drawn against, so it needs an
explicit call before it is built:

- **Option A — read-only reflection.** Keep it as a non-editable projection of frontmatter; editing
  stays in the text buffer. Compatible with §14; the panel is a viewer, not an editor.
- **Option B — revisit §14.** If an editable properties GUI is wanted, that is a change to a ratified
  decision and needs its own decision-log entry.

This doc does not choose. Flagged for an interactive design call.

## Status / next

Filed as the of-record visual reference. It does not change the build order — **step 4 (both keymaps +
first-run prompt) remains next**. When theming and the workspace shell come up (their own sessions /
steps), they build toward this picture: the theming session turns §1's palette into the concrete
CSS-variable catalogue, and the shell/plugin steps assemble the chrome. The §4 reconciliation should be
settled before the PKM right-panel is built.
