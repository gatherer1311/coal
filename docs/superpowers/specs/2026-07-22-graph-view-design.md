# Coal — Graph view — design

Date: 2026-07-22
Status: accepted (design session). Designs the **graph view** v1 surface
([`SPEC.md`](../../../SPEC.md) §14.2, "own session") and, as a consequence, **ratifies the renderer
substrate** — the long-deferred [`TODO.md`](../../../TODO.md) *"Graph / visual rendering library"*
item — as **cosmos.gl**. Supersedes the "direction, not a commit" posture of
[`reference/17`](../../../reference/17-graph-rendering-options.md).

## Problem

The graph view is a confirmed v1 surface (§14.2) but its deep design was spun out to its own session,
and the renderer was **deferred** — not for technical doubt, but because `reference/17` §1 identified
an upstream dependency: the renderer could not be ratified against a concrete view until the graph's
two primitives (node model §13.2, edge model §13.1) were settled.

**That block has cleared.** §13 now ratifies both:

- **Nodes are notes.** §13.3/§13.4/§13.10 fix a note as a *document with addressable sub-blocks*, and
  are explicit that **nothing structural — notably the graph — depends on blocks** (§13.4). The graph
  is document-granularity: one node per note. Node count therefore tracks note count (hundreds to low
  thousands for a real vault), not a block-multiplied figure.
- **Edges are links.** §13.5 fixes link forms and resolution; §13.14 fixes the relationship set
  (outgoing "Links to", incoming "Linked", heuristic "Unlinked mentions"); §13.3/§13.6 fix per-link
  **status** (`resolved | dangling | ambiguous`).

With node identity, edge semantics, and a bounded scale all pinned, `reference/17` §8's unblock
condition is met and the substrate can be committed. This session designs the view and makes that
commit.

## Relationship to `SPEC.md`, `reference/17`, and `TODO.md`

- **Consumes verbatim (unchanged):** all of §13 (the Overlay, three-tier model, the node registry,
  link resolution, the diff-ratchet status model, the §13.14 relationship set + peek engine), §3
  (native Wayland + fractional scaling), §6 (mouse-first where it wins, not mouse-only), §8.1
  (CSS-variable theming), §11 (permissive-OSS gate), §14.1 (the workspace shell — right dock, windows).
- **Ratifies (new):** the renderer substrate = **cosmos.gl** (`@cosmos.gl/graph`, MIT). This closes
  the deferred `TODO.md` item and **supersedes `reference/17`'s** pre-qualified `d3-force` + Canvas 2D
  *primary direction*; that stack is retained on paper only as an unbuilt contingency behind the
  `GraphSource` port (see §8), not as a shipped phase.
- **Diverges from `reference/17` deliberately:** the brief's three-layer split (`GraphSource` → a
  worker `d3-force` layout → a swappable renderer) **collapses at the layout+render layers**, because
  cosmos.gl fuses layout and rendering on the GPU. The **`GraphSource` data-port survives** (§2); the
  worker-layout layer does not.
- **Placement:** the graph view is an **official (first-party) plugin** built on a **core-provided
  `GraphSource` API** — consistent with the kernel/plugin pivot
  ([`docs/.../plugin-system-design.md`](2026-07-22-plugin-system-design.md)). Registered in
  [`PLUGINS.md`](../../../PLUGINS.md); the core-vs-plugin split item in `TODO.md` is thereby settled
  for this surface.

## 1. Ratified decisions (this session)

| # | Decision | Choice |
|---|---|---|
| 1 | **Scope** | **Both** a local (neighborhood) graph and a global (whole-vault) graph. |
| 2 | **Edges** | Authored **resolved** links; **ghost nodes** for dangling targets; **ambiguous = amber**; **unlinked mentions** as a dimmed, toggleable class (default off). |
| 3 | **Keyboard floor** | **Mouse-first, minimal keyboard** — open/close, Tab-cycle nodes, Enter opens the selected node. No arrow-adjacency; no screen-reader tree. |
| 4 | **Visual language** | **Mirror Obsidian**, adapted to WebGL and the Sublime theme; tweak later. |
| 5 | **Renderer substrate** | **cosmos.gl**, committed fully (no Canvas-2D fallback built). Wayland validation is a hard build gate, not an escape hatch. |
| 6 | **Placement** | **Official plugin** on a core `GraphSource` API. |

## 2. Architecture — the `GraphSource` port + the cosmos.gl engine

Two layers, plus a thin UI shell.

**2.1 `GraphSource` (core API — the surviving abstraction).** An ephemeral, rebuildable projection of
the note-index into the flat, index-addressed buffers cosmos.gl consumes. It is a pure lens over
Tiers 0+1 (honors `reference/15`'s "wipe index → rescan → identical graph" litmus); it is never
storage. Responsibilities:

- Enumerate **points** — one per note (§13.4), plus one **ghost point** per distinct unresolved link
  target (so a `[[Not Yet Written]]` link is visible and clickable-to-create, Obsidian-style).
- Enumerate **links** — resolved forward `link` nodes (§13.13) as `(sourceNoteIdx → targetIdx)`
  pairs; optionally the §13.14 unlinked-mention pairs when that layer is enabled.
- Own the **node-id → contiguous-index** mapping (cosmos.gl is index-based: `setLinks` takes integer
  indices). The renderer touches **ids only through this map** — the deferred data-model internals and
  the opaque Overlay ids never leak into the engine.
- Emit per-point metadata the theming/interaction layers need: `kind` (note | ghost), degree
  (incoming-link count, drives size), `status`, folder/group tag, ctime (drives Animate).
- Provide **incremental updates** — the reconciliation engine (§13.7) already computes per-file
  deltas; `GraphSource` translates a changed-file event into point/link buffer patches so the local
  graph can follow the active note and the global graph can live-update without a full rebuild.

Keeping this port renderer-agnostic is the *only* thing that preserves an unbuilt Canvas-2D +
`d3-force` contingency (§8). It costs a little discipline and buys nothing operationally under the
"commit fully" decision — it is retained purely because the data model is still evolving and the port
is the seam that keeps the engine choice from leaking into it.

**2.2 The cosmos.gl engine (layout + render, fused, GPU).** `@cosmos.gl/graph` v3 (WebGL 2 via
luma.gl). The plugin mounts `new Graph(container, config)` into its leaf's DOM node, feeds it
`setPointPositions` / `setLinks` (+ the parallel per-point/per-link color, size, and width buffers),
and drives it by event callbacks. Because physics runs in GPU shaders, **there is no `d3-force`
worker**; the freeze-avoidance constraint `reference/17` raised (Tier-3) is satisfied by **GPU
offload** instead. **Settle-to-static:** the simulation is paused after cooldown so an idle graph
costs zero frames; interaction (drag, filter change) re-heats it briefly.

**2.3 The UI shell.** The leaf/buffer chrome: the control panel (§5), the HTML **label overlay**
(§4.3), the keyboard focus/selection layer (§6), and the theming bridge (§7). This is plain
first-party TS/DOM over the engine.

## 3. The two surfaces — one engine, two data slices

Both surfaces are the *same* plugin and the *same* cosmos.gl instance type, differing only in which
`GraphSource` slice feeds them and where they dock.

- **Local graph** — a **right-dock leaf** (`coal.graph-local`) that **follows the active note** like
  Obsidian's linked view (re-queries on the shell's active-leaf/file-open change, §14.1). A **Depth**
  slider (default **1**) sets the neighborhood radius: depth 1 = the note plus its direct
  neighbors; each further level adds nodes connected to the previously included set. It shares the
  right dock with Links (§13.14) and Dangling (§13.9); it is *conditional-on-invocation* (opened with
  `graph-local-show`, then persistent per workspace), never auto-surfaced.
- **Global graph** — its **own buffer** (`coal.graph`) opened into a **window** via `M-x graph-open`
  and the quick switcher, and therefore splittable / tabbable under the §14.1 window model. It is
  **not** a third *view mode* (§7 ratifies exactly Live Preview + Source) and **not** a modal — it is
  a leaf type, like the file tree or the Links panel, that a window can host.

## 4. Data → visual mapping (Obsidian-mirrored, WebGL-adapted)

**4.1 Nodes.**

- One circle per note; **size ∝ incoming-link degree** (Obsidian's model), clamped to a min/max.
- **Ghost/unresolved** targets render faded and smaller; clicking one offers **create-the-note**.
- The **active note** is highlighted in **sublime-green** (Sublime is the default theme, §8.1).
- **Hover** highlights the node and its neighbors and dims the rest; **click opens** the note in the
  appropriate window (modifier-click placement follows the shell's conventions); **right-click** opens
  a context menu (open, open-in-split, create-if-ghost, pin/focus).
- Node hover may reuse the **§13.14 peek engine** to show a read-only preview of the note.

**4.2 Edges.**

- One line per **resolved** forward link. **Arrows** (direction) are a Display toggle — the data is
  directional (source→target), so arrowheads are honest when enabled.
- **Ambiguous** links (§13.6 status) draw in **amber**, matching the honesty-surfacing convention used
  by the Dangling panel and the §13.5 Live-Preview decorations.
- **Unlinked-mention** edges (§13.14) are a distinct **dimmed / desaturated, thinner** class behind a
  Filters toggle (**default off**, mirroring §13.14's conservative `fuzzy_mentions = false` posture and
  keeping the global view from hairballing). *WebGL adaptation:* they are encoded by color + opacity +
  width rather than as **dashed** lines — cosmos.gl has no native dashed-stroke primitive, so "dashed"
  from the Obsidian mental model becomes "dimmed" here.

**4.3 Labels — an HTML overlay, not WebGL text.** Node labels render as a **DOM overlay** layer
positioned from cosmos.gl's viewport transform, shown for the **hovered node** and for nodes above a
zoom/label-density threshold (Obsidian's "text fade threshold"). *WebGL adaptation and its upside:*
crisp text under **fractional scaling** (§3) without a WebGL text-atlas, and the fade threshold falls
out of the overlay's show/hide rule for free.

## 5. Control panel — Obsidian's four groups, adapted

Rendered as a collapsible overlay on the graph surface (both local and global), plus `M-x` command
twins per §6 so every toggle is keyboard-reachable.

- **Filters** — **Search** (filter nodes by the §13.14 name set: filename stem / first H1 / aliases,
  through the frozen normalizer §13.11); **Orphans** (show/hide notes with no links); **Existing files
  only** (hide ghost/unresolved nodes); **Unlinked mentions** (Coal-specific, default off). *Deferred:*
  **Tags** as nodes lands with the Tags surface (§14, own session); **Attachments** is n/a until Coal
  has an attachment object model.
- **Groups** — color-code nodes by a saved **search / folder / (later) tag** query, mirroring
  Obsidian's color groups. **Phase-2** within this surface (the first cut ships status/kind coloring
  only).
- **Display** — **Arrows**, **Text fade threshold**, **Node size**, **Link thickness**, **Animate**
  (chronological time-lapse by note ctime).
- **Forces** — **Center**, **Repel**, **Link force**, **Link distance**, mapped onto cosmos.gl config
  (`simulationRepulsion`, `simulationFriction`, link-spring, gravity/center, `spaceSize`). Values
  persist per surface in the plain-text config (§9).

## 6. Interaction model (mouse-first, minimal keyboard)

- **Mouse (primary):** pan (drag), zoom (wheel / `+` / `-`), drag-to-reposition a node
  (`enableDrag`), hover-highlight, click-to-open, right-click context menu — the §6 canonical
  mouse-first case.
- **Keyboard (floor):** a command to **open/close** each surface; **Tab / Shift-Tab** cycles a
  **selection ring** through nodes (visited-order or degree-order); **Enter** opens the selected node;
  **Esc** closes the panel / clears selection. Deliberately **no** arrow-key adjacency traversal and
  **no** screen-reader tree (both out of scope per decision 3; recorded as the honest a11y ceiling).
- cosmos.gl callbacks used: `onClick`, `onPointMouseOver`, `onMouseMove`, `onContextMenu` /
  `onPointContextMenu`; viewport via `fitViewOnInit` / `fitViewPadding` /
  `setZoomTransformByPointPositions` (e.g. "focus this note" recenters on it).

## 7. Theming bridge

WebGL inherits no CSS. A bridge reads the computed `--coal-*` custom properties (node color, ghost
color, active/sublime-green, amber, edge color, background), maps them to cosmos.gl's per-point and
per-link **color/size/width buffers** and background config, and **re-applies on light/dark switch**
(and on theme change). Sublime (dark black + sublime-green accent, §8.1) is the default target. The
exact `--coal-*` catalogue for the graph lands with the first themable surfaces (§8.1 defers the
catalogue), so the bridge is small-but-token-count-bounded, exactly as `reference/17` §5 predicted.

## 8. cosmos.gl adoption — gates, caveats, accepted trade-offs

Ratifying a specific WebGL engine carries obligations, recorded here as **build gates** and honest
costs. The owner chose to **commit fully** (no Canvas-2D fallback built); the trade-offs below were
surfaced and accepted.

- **Wayland/Electron validation (hard gate, blocking).** WebGL 2 / luma.gl under Chromium+Wayland on
  the GNOME target must be validated for **no blank-canvas, no context-loss, correct fractional
  scaling** before the graph view ships. This is `reference/17`'s Tier-1 §3 concern; cosmos.gl's docs
  do **not** address it. Under "commit fully," a failure here **slips the graph view until fixed** —
  there is no designed escape. (The `GraphSource` port keeps a Canvas-2D + `d3-force` rebuild
  *technically possible*, but that is a layout+render swap, not a one-layer swap, and is explicitly
  **not** a planned deliverable.)
- **License gate (§11).** Depend on **`@cosmos.gl/graph` (MIT)** only. The separate **Cosmograph**
  product (cosmograph.app) is not this package and must not be pulled in. MIT clears the §11
  permissive-OSS gate cleanly.
- **Async readiness.** The `Graph` constructor returns before the GPU device is ready; all data/config
  calls must queue behind `graph.ready` / poll `graph.isReady`. The plugin's mount path handles this
  (buffer the first `GraphSource` push until ready).
- **No accessibility layer.** cosmos.gl exposes no a11y tree; combined with decision 3 this fixes the
  graph's a11y ceiling at the minimal keyboard floor. Recorded, not hidden.
- **Scale headroom (the upside of the choice).** cosmos.gl comfortably renders 10⁴–10⁵+ live nodes;
  a document-granularity vault will never approach that. The engine is *over-provisioned* for the
  scale — an accepted cost (WebGL-on-Wayland risk, fused layers, zero a11y) bought in exchange for
  never revisiting the substrate on scale grounds.

## 9. Placement — official plugin on a core `GraphSource` API

- **Core** owns the note-index and exposes the **`GraphSource` projection API** (§2.1) as part of the
  public plugin API — the same index that powers Links/Dangling/search, surfaced as a graph lens.
- **The graph view plugin** (first-party, bundled, `PLUGINS.md`) owns the cosmos.gl engine, the two
  leaf types, the control panel, the label overlay, the interaction layer, and the theming bridge.
- This dogfoods the plugin API for a major visual surface and keeps the kernel minimal, per the
  kernel/plugin pivot. It settles the core-vs-plugin split **for this surface** (the broader `TODO.md`
  split item continues for the rest).

## 10. Performance & the inherited index dependency

The graph is a pure lens over the note-index; **no renderer fixes a slow index** (`reference/17` §7
item 4). The reconciliation engine (§13.7) already runs off the main thread and incrementally, and
`GraphSource` consumes its per-file deltas rather than re-deriving — so the graph inherits the index's
performance posture, good or bad. Settle-to-static (§2.2) bounds idle cost; incremental buffer patches
(§2.1) bound update cost; GPU layout bounds simulation cost. No synchronous per-reparse work touches
the edit loop.

## 11. Testing

- **`GraphSource` projection (unit).** Given a fixture index (notes + resolved/ambiguous/dangling
  links + unlinked mentions), assert the emitted points (incl. ghosts), links, id→index map, degrees,
  and statuses; assert the wipe-and-rebuild litmus (identical projection from Tiers 0+1).
- **Incremental delta.** A per-file change event yields the correct point/link buffer patch (add
  note, add/remove link, link goes dangling → ghost appears, note renamed).
- **Depth slicing.** The local-graph neighborhood at depth 0/1/2 matches expected node sets.
- **Interaction (integration).** Click opens the right note; Tab-cycle + Enter opens the selection;
  filter/force toggles round-trip through config (§9).
- **Theming.** A light/dark switch re-applies `--coal-*` to the engine buffers.
- **Wayland smoke (manual/CI-on-target).** The blocking gate of §8 — a rendered-frame check on the
  GNOME/Wayland target.

## 12. Deferred within the graph view (own follow-ups)

- **Groups** color-by-query beyond status/kind (§5) — phase-2.
- **Tags-as-nodes / tag coloring** — lands with the Tags surface.
- **Attachments-as-nodes** — awaits an attachment model.
- Exact **Depth**, **Node size**, **fade-threshold** defaults and the `--coal-*` graph token names —
  tuned against a real vault during build (owner delegated visual fine-tuning: "mirror Obsidian, tweak
  later").

## 13. Cross-references

- `SPEC.md` §3, §6, §7, §8.1, §11, §13 (esp. §13.3 registry, §13.4 lazy/notes-not-blocks, §13.5 link
  resolution, §13.6 status, §13.9 Dangling, §13.14 relationship set + peek), §14.1/§14.2.
- `reference/17` — the substrate analysis this session supersedes (direction → commit); its
  `GraphSource` port and Wayland/theming/index-cliff cautions are carried forward.
- `reference/13` §6 / `reference/02` — Obsidian graph priors (global/local, control panel, node/edge
  drawing), mirrored here on Coal's own merits, not as justification.
- `docs/.../2026-07-22-plugin-system-design.md` — the kernel/plugin split this plugin sits in.
- cosmos.gl: `@cosmos.gl/graph` (MIT, OpenJS-incubating), WebGL 2 / luma.gl.

## Decision-log delta (to fold into `SPEC.md` / `TODO.md` / `PLUGINS.md`)

- **`SPEC.md`** — add a graph-view section (a §13/§14 subsection) recording decisions 1-6, and a
  decision-log row: *"Graph view: global + local, notes-as-nodes over the §13 index via a core
  `GraphSource` API; renderer = cosmos.gl (WebGL2, MIT), committed fully; mouse-first + minimal
  keyboard floor; official plugin. Supersedes reference/17's deferred/Canvas direction."*
- **`TODO.md`** — **close** the *"Graph / visual rendering library"* deferred item (substrate now
  ratified: cosmos.gl) and the *graph-view* v1-surface deep-design item; note the Wayland-validation
  build gate migrates to a GitHub Issue under `v1.0` when building begins.
- **`PLUGINS.md`** — add **Graph view** to the committed official-plugins list (built on the core
  `GraphSource` API).
