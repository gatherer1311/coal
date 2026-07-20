# Graph rendering — options analysis (decision-support, item stays DEFERRED)

> **Status:** research brief, **not a ratified decision.** The `TODO.md` item *"Graph /
> visual rendering library"* remains **deferred**. This file de-risks the eventual choice by
> pinning everything about a graph renderer that Coal's already-ratified sections *do* decide,
> and by quarantining the one axis — render substrate vs scale — that genuinely waits on the
> blocked graph-view scope. Nothing here is promoted to `SPEC.md`.
>
> **On `reference/`:** per `SPEC.md` §0 this directory is priors/analysis only, and **no
> decision may be justified by "the reference says so."** Where Obsidian's stack (PixiJS +
> rbush) is mentioned it is a prior to be re-derived or diverged from on Coal's own merits,
> never a justification. This brief also flags, in §2, its own inherited assumptions so they
> are not smuggled in as fact.

---

## 1. Why the item is deferred — a dependency chain, not technical doubt

The deferral is not "we're unsure any library can do it." Every library question below is
answerable. The block is **upstream**:

- The graph **library** is deferred because the graph **view** is unscoped, and
- the graph **view** is unscoped because its two primitives are themselves deferred:
  - **nodes** are defined by the **data model** (`SPEC.md` §13.2 — document- vs block-granularity,
    "no decisions recorded"), which fixes node identity and count; and
  - **edges** are defined by the **linking/index system** (`SPEC.md` §13.1 — which of
    wiki-links / backlinks / block-references count as an edge, and how the index derives them,
    "no decisions recorded"), which fixes edge semantics and density.

Both §13.1 and §13.2 carry an explicit *"do not implement or design around a presumed
outcome."* So the renderer cannot be **ratified against a concrete view it must serve** — even
though its entire technical envelope is already pinned. This splits cleanly into two questions:

- **Question A — the rendering technology.** *Substantially decidable now.* Every axis that
  ranks a renderer (integration, Wayland-correctness, theming bridge, interaction floor, license,
  no-lock-in, off-thread scaling) is already fixed by ratified sections plus one engineering
  constraint (§2). A direction can be pre-qualified today.
- **Question B — the graph-view scope.** *Blocked.* Node granularity, edge semantics, realistic
  node/edge counts, and the required interactions are all unknown until §13.1/§13.2 land, and §0
  forbids designing around a presumed answer.

**Only the final commit of a render substrate waits on B.** The architecture in §3 is built so
that when B lands, the choice collapses to a single, isolated, swappable layer.

---

## 2. What actually ranks a renderer — and how firmly each axis is grounded

Honesty about grounding matters here, because these axes carry different authority. Three tiers:

**Tier 1 — genuinely ratified `SPEC.md` clauses.**

| Axis | Source | Implication for a renderer |
|---|---|---|
| Native **Wayland** with correct fractional scaling (not XWayland-only) | §3 | GPU/WebGL behaviour under Chromium+Wayland is load-bearing, not incidental. A WebGL candidate must be validated for no blank-canvas / context-loss / scaling artifacts on the GNOME/Wayland target. SVG and Canvas 2D ride Chromium's normal compositor and sidestep the whole class. |
| **Mouse-first where it wins, but not mouse-*only*** | §6 (the graph is §6's *named* canonical mouse case) | Rich pan/zoom/drag/hit-testing **and** a keyboard focus/navigation layer on top. A display-only widget, or one whose interaction is irreducibly mouse-bound, is a partial fail. |
| Theming = **CSS custom properties** (`--coal-*`), follows system light/dark | §8.1 | SVG/DOM inherit tokens for free. **Canvas/WebGL inherit nothing** — they need a bridge that reads computed `--coal-*` values and re-applies on light/dark switch. That bridge is a real, scored cost. |
| **Apache-2.0**, permissive-OSS dependency posture | §11 | Non-copyleft only (MIT/ISC/BSD/Apache-2.0/MPL-2.0). GPL/AGPL/SSPL/**source-available**/commercial = **hard fail**, applied as a gate *before* scoring. |
| **Electron + CodeMirror 6 + TypeScript** stack | §4 | A JS/TS-consumable library (first-class `.d.ts` preferred, per §4's "no interop seam") mounting into its own DOM container. |

**Tier 2 — reference-derived working assumptions (NOT ratified; held loosely).** Two framings
this analysis inherits from the Obsidian reference (`reference/13` §6) are *not* in the SPEC and
must not be leaned on as decided:

- *"The graph is a separate leaf/panel."* §4 ratifies only the stack; §7 ratifies exactly **two
  views** (Live Preview + Source) with no third graph view. Whether the graph is a docked leaf, a
  modal, or something else is unscoped (part of question B / the v1 surface).
- *"Nodes = notes, edges = links; the graph is a pure lens over the index."* This is
  `reference/13` §6's Obsidian model, not a Coal decision. The §3 architecture exists precisely
  so this borrowed framing stays behind a port and can be revised without a redesign.

**Tier 3 — a self-imposed engineering constraint (NOT a SPEC clause, but weighted heavily).**

- **Layout + render must not freeze the editor main thread; off-main-thread (worker) or GPU
  layout is strongly preferred.** No SPEC section ratifies this. It is *inferred* from the prior
  implementation's data-loss/freeze bug (`reference/15` §6 item 5; repo `TODO.md`) — an
  engineering lesson, not a mandate. It earns its heavy weight on the merits (a frozen editor is
  the worst failure mode, and the old code demonstrably hit it), but it is labeled here so it is
  not mistaken for a co-equal-ratified requirement. It is the single most decisive ranking axis
  below, so its grounding is stated plainly.

**Tier-3-derived corollary:** because vault size drives node/edge counts (hundreds to tens of
thousands), a synchronous main-thread force layout that stalls typing at large vaults is
effectively disqualifying for the *primary* choice.

---

## 3. The layered architecture — decouple along the fault line of the deferral

The three concerns separate cleanly, and the separation *is* the de-risking: the blocked
question touches exactly one layer.

**3.1 Data model — a `GraphSource` port (abstract, blocked).** The renderer consumes, but does
not define, an ephemeral, rebuildable view-model `{ nodes:[{id, …opaque}], edges:[{sourceId,
targetId, …opaque}] }` projected from Coal's future note-index. The renderer touches **ids
only**. Node granularity (§13.2) and edge semantics (§13.1) live entirely behind the port; the
Tier-2 "nodes=notes/edges=links" assumption sits here and nowhere below. This layer is a thin
adapter, never storage — it honors `reference/15`'s litmus (wipe index → rescan → identical
graph). Because it is a port, **no renderer choice below it can smuggle in a fixed schema.**

**3.2 Layout — off-main-thread, a swappable sub-layer, `d3-force` as the phase-1 default.** A Web
Worker owns a CPU force simulation driven from the `GraphSource` arrays; it ticks physics and
posts back an interleaved `Float32Array` of x/y. The editor main thread never runs layout math.
Transport is a **transferable** `Float32Array` by default; `SharedArrayBuffer` is a possible
zero-copy upgrade but is **not free even in Electron** — it needs the document cross-origin
isolated (COOP `same-origin` + COEP `require-corp`), a real renderer-config constraint to
validate, not assume. Settle-after-cooldown (`alphaMin`) freezes the sim so a static graph costs
zero frames. `d3-quadtree` (already a transitive dep of `d3-force`) doubles as the spatial index
for pointer hit-testing — **so no `rbush` dependency is needed.**

- *Default, not committed:* the one materially different layout **model** is **WebCola / cola.js**
  (MIT, *constraint*-based: alignment, non-overlap, directed-flow), held as the swap-in if
  §13.1's eventual edge semantics turn out directional/typed (backlink vs block-ref lanes) or
  scale forces clustering. Graphology's standalone ForceAtlas2 and `ngraph.forcelayout` are
  same-family force engines that also run in a worker. So `d3-force` is the reasonable phase-1
  default, not a claim the layout question is fully closed.

**3.3 Rendering — the decidable-now part, ratification-deferred.** A `GraphRenderer` interface —
`mount(container)`, `setPositions(Float32Array)`, `setTheme(tokenMap)`, `onPick(x,y)→nodeId`,
`focus(nodeId)` — consuming the worker's position buffer. **Phase-1 substrate: hand-rolled Canvas
2D** immediate-mode draw (`arc()` nodes, `moveTo/lineTo` edges, style-bucketed, quadtree viewport
culling + level-of-detail + settle-to-static). It rides Chromium's normal Skia/compositor path
(no WebGL context), so it is native-Wayland-safe with only `devicePixelRatio` backing-store
handling for fractional scaling. **Upgrade slot:** the *same interface* is re-implementable on
PixiJS/WebGL (or a batteries-included WebGL lib) if question B reveals tens-of-thousands of live
nodes — swapping **only this layer**, leaving data-model and layout untouched.

> This is the layered analogue of `reference/15`'s "the index is the only place derivation
> lives": here **the render substrate is the only place scale assumptions live.**

---

## 4. Candidate evaluation

All ten known candidates were scored against §2 and adversarially verified (license, TS support,
scale honesty, 2026 maintenance, Wayland/WebGL reality, theming-bridge cost). Verification
corrected three claims, folded in below: **`ngraph.graph` is BSD-3-Clause** (not MIT);
**Cytoscape.js ships first-party TS types** since 3.31.0 (not DefinitelyTyped); **`react-force-graph`'s
`forceEngine('ngraph')` exists only in the 3D variant.** All versions are as of 2026-07.

| Candidate | Category | Substrate | Off-thread layout | Live-layout 60fps ceiling | License (gate) | TS | Theming bridge | Verdict |
|---|---|---|---|---|---|---|---|---|
| **d3-force (worker) + hand-rolled Canvas 2D** | layout-only + own renderer | Canvas 2D | **Yes** (d3-force is pure JS in a worker) | ~2–3k live; ~10k with cull/LOD/settle | ISC + ISC (own renderer code) ✓ | @types | tens of lines (own) | **Primary direction** |
| **PixiJS (WebGL) + d3-force (worker)** | general renderer | WebGL | **Yes** (BYO worker) | 1–3k live layout; **10k–30k** render w/ frozen layout + spatial picking | MIT + ISC ✓ | first-class | moderate (own) | **Runner-up / scale-up swap** |
| **Sigma.js + graphology + FA2** | purpose-built | WebGL | **Yes** (first-party FA2 worker driver) | few-k comfortable, into ~10k | MIT ✓ | first-class | moderate (reducer API) | Strong — best batteries-included, but WebGL-only + graphology coupling |
| **@cosmos.gl/graph** (cosmos.gl) | purpose-built | WebGL2/luma.gl | **Yes** (GPU-shader sim) | 10k–50k live; 100k+ sparse | MIT ✓ **(avoid CC-BY-NC Cosmograph product)** | first-class | moderate | Strong but **over-scaled** for a vault + WebGL-Wayland + zero a11y + naming/license footgun |
| **ngraph + BYO Pixi** | layout-only + renderer | WebGL | **Yes** (DIY worker) | 2–5k live; 20–50k frozen | `ngraph.graph` **BSD-3** / `ngraph.forcelayout` BSD-3 / Pixi MIT ✓ | first-class | best-own | Viable — bus-factor-1, dormant layout kernel; no edge over d3-force+Pixi |
| **G6 (AntV)** | purpose-built | Canvas/WebGL | **Yes** (`enableWorker`, WASM/GPU layout) | 2–5k Canvas; tens-k WebGL (30fps goal) | MIT ✓ | first-class | **DSL bridge** | Viable — own styling DSL + own graph model (§8.1/§13 lock-in) + AntV supply-chain note |
| **Cytoscape.js** | purpose-built | Canvas 2D | **No** (main-thread layout; 14s on 2.6k nodes) | ~1–2k | MIT ✓ | **first-party** | **DSL bridge** | Viable — no worker layout + styling DSL |
| **force-graph / react-force-graph** | purpose-built | Canvas / three.js | **Weak/DIY** (main-thread sim) | ~1–2k | MIT ✓ | first-class | moderate | Viable — bus-factor-1; React+three surface |
| **d3-force + SVG** | layout-only | SVG | **Yes** (layout; DOM render stays on main) | **~500 live, ~1k hard** | ISC ✓ | @types | **zero** (free CSS inheritance) | Viable — theming/a11y champion, but ~1k ceiling; only a local/filtered-subgraph variant |
| **vis-network** | purpose-built | Canvas 2D | **None** (maintainer-confirmed sync architecture) | jank at ~200 live | MIT/Apache-2.0 ✓ | first-class | DSL | **Weak — eliminated** (violates the off-thread constraint; DataSet + options-DSL) |

**License-gate eliminations (before scoring), stated explicitly per §11.** The engines rated
best on the *deferred* scale/layout-quality axis are precisely the ones the permissive-OSS
posture rules out: **KeyLines/ReGraph, yFiles, Ogma, GoJS, Graphistry** (commercial), and
**Neo4j NVL** (`@neo4j-nvl/*` — Canvas+WebGL with worker force layout and a React wrapper, the
closest existing library to §3's own hand-built ideal, but **source-available, not permissive**
→ hard fail). Named rather than silently omitted, because they are the most relevant to a future
10⁴-live global view and the exclusion is a *policy* call, not a merit one.

**OSS candidates that pass the gate but lose as *primary*:** **Reagraph** (`reaviz/reagraph`,
Apache-2.0, React + three.js/react-three-fiber, actively maintained) — a legitimate
batteries-included **runner-up-class** option; loses only on being WebGL-only (full §3
Wayland-validation cost, no Canvas fallback) and coupling to React+three while §13 is open.
**`@deck.gl-community/graph-layers`** (MIT, GPU, pluggable d3-force adaptor) — passes, but pulls
the heavyweight deck.gl/luma.gl stack for a personal-vault view. **Graphin** (`@antv/graphin`) —
React DX over G6, inherits G6's DSL + model + supply-chain note.

---

## 5. Recommendation — a direction, not a commit

**Primary direction (phase-1, pre-qualified):** **`d3-force` in a Web Worker + a hand-rolled
Canvas 2D renderer**, behind the §3 layering.

Why it maximally satisfies what Coal can pin *today* while pre-committing to nothing question B
could invalidate:

- **Wayland (Tier-1 §3):** no WebGL context, so the entire SwiftShader-fallback / XWayland-blur /
  GL-context-loss risk class simply *does not apply*; the only residual is generic
  `devicePixelRatio` backing-store handling under fractional scaling.
- **Off-thread (Tier-3 engineering constraint):** `d3-force` is pure JS with zero DOM coupling —
  the whole simulation runs in a worker feeding a `Float32Array` to a main thread that only
  paints. This is exactly the failure mode the old code hit, structurally avoided.
- **No lock-in (§13.1/§13.2 deferred):** `d3-force` imposes no schema (it stamps `x/y/vx/vy` on
  your own objects) and a hand-rolled renderer has no styling DSL — the deferred data model and
  the `--coal-*` token model stay 100% open.
- **License (§11):** ISC across `d3-force` + `d3-quadtree/d3-dispatch/d3-timer`; the renderer is
  Coal's own code. Clean permissive pass (~17KB min / ~6KB gzip).
- **Theming (§8.1):** a `getComputedStyle → cache → redraw` bridge, order of tens of lines —
  but the exact cost is **not tightly assertable**, because §8.1 *defers the concrete `--coal-*`
  catalogue* ("lands with the first themable surfaces"); the bridge scales with however many
  tokens that catalogue defines. Treat it as small-but-unbounded-until-the-catalogue-lands.

Its only genuine costs are the glue you own (renderer, keyboard layer; hit-testing is free via
the already-present `d3-quadtree`) and a Canvas-2D **live-layout ceiling of ~2–3k nodes** (≈10k
with culling/LOD/settle). Acceptable *precisely because the view is unscoped* — this is choosing a
direction, not shipping a 10⁴-node view today.

**Runner-up / scale-up swap:** **PixiJS (WebGL 2D) + the same worker-side `d3-force`.** If
question B fixes scale at tens-of-thousands of *live* nodes, WebGL instanced rendering is the one
substrate whose render path reaches 10⁴ live — and it is a **single-layer swap** (only §3.3
changes; data and layout are shared). If the team prefers less first-party glue at that point,
**Sigma.js + graphology** (first-party worker FA2) or **Reagraph** (Apache-2.0) are the
batteries-included WebGL alternatives, each trading Canvas-2D Wayland-safety for a GPU context
that must be validated on the GNOME/Wayland target first.

**Layout-engine swap:** **WebCola** (MIT, constraint-based) if §13.1's edges turn out
directional/typed enough to want constraint/flow layout rather than pure force.

---

## 6. Convergent, not derived (§0 audit)

Obsidian's prior is **PixiJS (WebGL 2D) + rbush (R-tree hit-testing)**. This recommendation
**diverges** from it for phase-1 and re-derives the overlaps from Coal's own constraints:

1. **Substrate divergence:** the primary is **Canvas 2D, not WebGL** — chosen because Coal's §3
   native-Wayland-with-fractional-scaling mandate makes the GL-context risk class a load-bearing
   cost Obsidian (not Linux-first, not Wayland-bound) never had to price, and because the view is
   unscoped so the tens-of-thousands-*live* regime that would force WebGL is unproven. A
   Coal-specific downgrade of Obsidian's substrate, not an echo.
2. **rbush is explicitly not adopted:** `d3-quadtree` is already a transitive dep of the chosen
   layout and serves as the spatial index for free. `reference/16` itself calls rbush "a
   metaphor, not a dependency" — the "index for cheap candidate-generation" lesson is honored
   without taking Obsidian's library.
3. **Where the runner-up lands on PixiJS**, it is re-justified on Coal's own envelope (off-thread
   layout + a firm 10⁴-live ceiling), as a bounded single-layer swap — never "because Obsidian
   does it." Any convergence at ratification will be a *re-derived endpoint* of the
   Wayland/perf/scale analysis; the analysis is the load-bearing justification, not the prior.

This brief also audits its *own* inherited framing (§2 Tier 2): "separate leaf" and "pure lens"
are reference-derived assumptions held behind the `GraphSource` port, not decisions.

---

## 7. Residual risks — the honest costs

1. **The primary buys Wayland-safety and zero-lock-in with more first-party code** (renderer +
   keyboard layer). A batteries-included lib (Sigma/Reagraph) writes less glue but pays the WebGL-
   Wayland validation cost and (Sigma) a graphology-model coupling.
2. **Canvas-2D live ceiling (~2–3k / ~10k culled).** If B lands on *block*-granularity nodes
   (§13.2) over a large vault, node/edge counts multiply and force the WebGL swap. This is *why*
   the substrate is isolated to one layer — but the swap is still real work, not free.
3. **The theming-bridge cost is unbounded until §8.1's `--coal-*` catalogue exists.** Any
   Canvas/WebGL candidate shares this; only the SVG variant escapes it.
4. **The graph inherits the index's performance cliff.** `reference/15` §6 item 5 flags the link
   index as a synchronous-per-reparse data-loss/freeze suspect (repo `TODO.md`). A graph is a pure
   lens over that index — *no rendering library fixes a slow index.* If the graph view is scoped
   before that cliff is resolved, it inherits it regardless of which library draws pixels.
5. **`SharedArrayBuffer` zero-copy transport needs cross-origin isolation** (COOP/COEP) — a
   renderer-config constraint to validate, not assume; the transferable-`Float32Array` fallback is
   the safe default.
6. **Keyboard-nav floor is unset (§6).** Arrow-key adjacency + Enter-to-open + a focus ring is
   cheap on any substrate; a full screen-reader-navigable tree is real work and only SVG gives it
   near-free. Where the "not mouse-only" floor sits is a question-B decision.

---

## 8. What stays blocked, and what unblocks it

- **Blocked:** ratifying a specific **library** / committing the **render substrate** (Canvas 2D
  vs WebGL), and — a notch below — committing the **layout engine** (`d3-force` vs WebCola). The
  layered architecture and the pre-qualified shortlist here can be recorded now; the final commits
  cannot.
- **Dependency:** the graph-**view** scope (question B), downstream of §13.2 (node granularity)
  and §13.1 (edge definition + index derivation).
- **What unblocks ratification:** put a graph **view** on the near-term roadmap (the open *v1
  feature surface* item) and settle only the graph-relevant **slice** of the two deferred areas —
  (1) node granularity → node identity + rough count; (2) edge definition → edge semantics +
  density (and whether directional/typed edges want constraint layout); (3) from those, target
  scale + required interactions. With node model + edge model + scale + interaction pinned, the
  substrate flips Canvas→WebGL **iff** scale demands live 10⁴ (an isolated single-layer swap), and
  the layout flips `d3-force`→WebCola **iff** edge semantics demand constraints. The **encryption
  mechanism (§10.3/§13.3) is not on this path** and does not gate the library.

---

## 9. Open questions for the owner

1. **Scale realism:** is the graph a **local/filtered neighborhood** (hundreds of nodes — Canvas
   2D or even SVG is trivially enough) or a **global whole-vault** view (which, under
   block-granularity, could push into tens-of-thousands and force the WebGL swap)? *This one
   answer flips the render substrate.*
2. **Node granularity (§13.2 slice):** document-per-node or block-per-node? Block-granularity
   multiplies counts by ~average blocks-per-note and is the main driver of whether the Canvas-2D
   ceiling holds.
3. **Edge definition (§13.1 slice):** edges = resolved forward links only, or also derived
   backlinks and block-refs? Two consequences: (a) under `reference/15`'s injection-free model an
   edge is a *confidence-scored re-resolution*, not an O(1) pointer — should the renderer visually
   encode edge confidence/status (Resolved / Needs-attention / Broken) as a first-class channel,
   changing the per-edge styling budget? and (b) if edges are directional/typed, does that pull
   the layout from `d3-force` toward a constraint/flow engine (WebCola)?
4. **Interaction floor (§6):** beyond mouse pan/zoom/hover/click-to-open, how much keyboard nav is
   in scope (cheap: arrow-adjacency + Enter + focus ring; expensive: full screen-reader tree,
   near-free only on SVG)?
5. **Batteries-vs-glue & OSS posture:** accept more first-party code for zero lock-in + Wayland
   safety (primary), or a batteries-included OSS WebGL stack (Sigma / Reagraph) at the cost of
   WebGL-Wayland validation? And to confirm the boundary: §11's permissive-OSS posture rules out
   the best-performing engines outright (KeyLines/ReGraph, yFiles, Ogma, GoJS, Graphistry, and
   source-available Neo4j NVL) — is that categorical exclusion the intended reading, or is a
   source-available/commercial engine ever on the table for a 10⁴-live global view?
6. **Sequencing vs the index cliff:** should scoping the graph view be explicitly gated behind
   resolving the `reference/15` §6-item-5 index-freeze suspect, since a graph over a
   synchronous-per-reparse index inherits its cliff no matter which library draws it?

---

## 10. Cross-references

- `SPEC.md` §3 (Wayland/fractional scaling), §6 (mouse-first-not-only), §8.1 (CSS-variable
  theming), §11 (Apache-2.0 / permissive-OSS gate), §13.1 (linking — deferred), §13.2 (data model
  — deferred); and `TODO.md` (the deferred graph-library item + the open v1-feature-surface item).
- `reference/16` — Obsidian's PixiJS + rbush entries (priors; "rbush is a metaphor, not a
  dependency").
- `reference/15` §6 item 5 — the index perf-cliff / freeze suspect the graph would inherit.
- `reference/13` §6 — the workspace-leaf/roadmap framing this brief flags as a Tier-2 assumption.
