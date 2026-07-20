# Roam Research

**What it is.** Roam Research is a cloud-hosted, block-based *outliner* for "networked thought" — a
note-taking tool where every bullet is an addressable block and every note is a node in a personal
knowledge graph. Launched publicly in 2019–2020 by Conor White-Sullivan, it popularized
bidirectional `[[wiki links]]`, block references `((...))`, backlinks, and the daily-notes workflow,
and effectively created the modern "tools for thought" category that Obsidian, Logseq, Tana, and
Capacities all react to. Its design bet: don't organize notes into folders top-down; let structure
*emerge bottom-up* from links you make while writing.

## 1. Core functionality

- A single **graph** (Roam's word for a workspace/database) of interlinked pages and blocks.
- Everything is an **outline**: you type bullets, `Tab`/`Shift-Tab` to indent/outdent, `Enter` for a
  sibling block, `Shift-Enter` for a soft line break within a block.
- **Daily Notes** is the home screen — an infinite, reverse-chronological stream of date-titled pages
  (today's is auto-created), used as a frictionless capture inbox.
- Links are **bidirectional by default**: referencing a page anywhere automatically surfaces that
  mention on the target page's **Linked References** section. No manual back-linking.
- A **right sidebar** lets you shift-click pages/blocks open beside your main pane for side-by-side work.

## 2. Distinctive features (vs. the others in the list)

- **Blocks are first-class, addressable objects** — not just lines in a file. Any single bullet can be
  referenced, embedded, aliased, and queried from anywhere. This is stronger than Obsidian (file-first,
  blocks bolted on) and closer to Logseq (which cloned this model).
- **Unlinked References**: below Linked References, Roam shows plain-text mentions of a page's title that
  are *not* yet links, letting you retroactively connect them — a signature "discover latent structure"
  feature.
- **Live queries as content** — `{{query}}` blocks embed saved, self-updating searches inside notes.
- **Attributes** (`Key:: value`) turn free-form outlines into a lightweight database.
- **Datalog under the hood**, exposed to power users (see §3, §5), enabling near-arbitrary structured
  retrieval — far beyond tag search.

## 3. Data model & storage format

- **Cloud-first, not local-first.** Roam is a hosted web app (with wrapper desktop/mobile apps); there
  is no plain-file-on-disk source of truth like Obsidian's Markdown vault. This is a key contrast for a
  local-first design.
- Under the hood the graph is a **Datomic-style database** (Roam also open-sourced a Datalog engine,
  Datalevin). The atomic unit is a **datom**: a 4-tuple `[entity, attribute, value, transaction-id]`.
  A block is just the set of datoms sharing an entity id; the transaction id powers sync and undo.
- Real schema attributes include: `:block/uid` (the 9-char public block id used in `(( ))` refs),
  `:block/string` (raw text), `:block/order` (sibling position), `:block/children` (immediate kids),
  `:block/parents` (full ancestor chain incl. the page), `:block/page`, `:block/refs` (outgoing links),
  and `:node/title` (present only on pages). The structure is "a forest of trees": each page is a tree,
  blocks are nodes, a link is an edge.
- **Text is Markdown-ish but proprietary.** It uses `**bold**`, `[[links]]`, etc., but page/block links,
  attributes, embeds, and queries are Roam-specific syntax, not portable Markdown.
- **Export** formats: Markdown, JSON (re-importable), and **EDN** (Clojure's data notation, a near-raw
  dump of the datoms — the only export that preserves the full graph for local Datalog querying).

## 4. Editing & UX paradigm

- **Outliner, not document.** The core unit is a nested bullet, not a page of prose. (Blocks can render
  in "document" view to hide bullets, but the tree is always underneath.)
- **Single-mode WYSIWYG-ish editing** — you edit the raw block text in place; formatting renders live in
  the same view (no separate source/preview modes like Obsidian's older split).
- **Keyboard-driven**: `/` opens a slash-command menu (dates, TODO, queries, embeds); `[[` and `((`
  trigger autocomplete for pages and blocks; `Cmd/Ctrl-K` is quick-open; `Cmd/Ctrl-U` opens the sidebar.
- **Folding** is inherent to outlining — collapse/expand any block's subtree; zoom into any block to make
  it the page root (breadcrumb trail shows the path back up).

## 5. Linking & knowledge-management model (the heart of it)

- **Page links:** `[[Page Name]]` or `#tag` / `#[[Multi word tag]]`. Typing it auto-creates the page.
  Dates are ordinary pages (e.g. `[[July 17th, 2026]]`), so a daily note links itself into every page it
  mentions.
- **Block references:** `((block-uid))` embeds a *reference* to one specific bullet. Variants: a plain
  **reference** (a live copy that links back), an **embed** `{{embed: ((uid))}}` (transclusion — edits
  propagate both ways, and the block's children come along), an **alias** `[label](((uid)))`, or copied
  text.
- **Backlinks:** every page automatically lists **Linked References** (blocks that link to it) plus
  **Unlinked References** (unlinked textual mentions). This is the mechanism by which structure "emerges."
- **Attributes:** `Status:: Doing` / `Author:: [[Ada Lovelace]]` create queryable key/value pairs; each
  attribute name is itself a page.
- **Queries:** a user-facing `{{query}}` with nestable logic, e.g.
  `{{[[query]]: {and: [[TODO]] {not: [[done]]} {between: [[last week]] [[today]]}}}}`, plus a
  power-user **Datalog** interface (`:q [:find ?t :where [_ :node/title ?t]]`, and
  `window.roamAlphaAPI.q(...)` for scripts).
- **Graph view:** renders pages as a force-directed network of nodes and link-edges — evocative but, per
  most users, more a novelty than a daily driver; the real "graph" is the queryable database, not the
  picture.

## 6. Extensibility

- **`roam/js` and `roam/css`:** create a page by that name and drop JavaScript/CSS in code blocks to
  metaprogram the app from *inside* the app (no build step). Powerful and unsandboxed — a security caveat.
- **Roam Alpha API** (`window.roamAlphaAPI`) exposes read (`.q`, `.pull`) and write (create/update/delete
  block) operations on the live Datomic graph.
- **Ecosystem:** RoamJS extensions, **SmartBlocks** (templating/automation à la TextExpander, using
  `#SmartBlock` and `<%COMMAND%>`-style directives), and **Query Builder** (visual queries with
  table/kanban result views). Integrations exist for Google Calendar/Drive, Slack, Hypothes.is, etc.
- Notably **no first-party plugin marketplace** and slow core development (few major updates since ~2023),
  a frequently cited weakness relative to Obsidian's plugin economy.

## 7. Relevance to designing a Markdown editor

**Borrow:**
- **Backlinks + Unlinked References** are the single highest-value idea — cheap to compute, they make
  structure emergent instead of imposed. Bolt them onto a file/heading/block model.
- **Daily-notes-as-home** as a zero-friction capture surface and a temporal spine for the graph.
- **Block-level addressing + transclusion** (`((id))` / embeds): let users reference and reuse a single
  paragraph, with a clear distinction between *reference*, *live embed*, and *alias*.
- **Live embedded queries** that update as content changes — treat a saved search as a first-class,
  renderable block.
- **Attributes** (`Key:: value`) as a lightweight, in-line structured-data layer over prose.
- **Outliner affordances**: fold/zoom, `Tab`-driven hierarchy, slash-command palette.

**React against / avoid:**
- **Cloud-only, proprietary store.** For a local-first Markdown editor, keep plain files as the source of
  truth; Roam's non-Markdown syntax and DB lock-in are a cautionary tale for portability.
- **Everything-is-a-bullet** rigidity — great for capture, awkward for long-form prose; consider a hybrid
  where blocks/headings are addressable but documents aren't forced into an outline.
- **Datalog's power/complexity cliff** — expose an easy query layer first; make the advanced one optional.

## Sources

- Official site — https://roamresearch.com/
- Deep dive on Roam's data structure & Datalog (Zsolt Viczián) — https://www.zsolt.blog/2021/01/Roam-Data-Structure-Query.html
- Intro to Datalog for Roam — https://matt.roam.garden/intro-to-datalog-for-roam-research/
- Beginner's guide (SitePoint) — https://www.sitepoint.com/roam-research-beginners-guide/
- A Thorough Beginner's Guide (The Sweet Setup) — https://thesweetsetup.com/a-thorough-beginners-guide-to-roam-research/
- Founder interview, Conor White-Sullivan (Forte Labs) — https://fortelabs.com/blog/interview-with-conor-white-sullivan-founder-of-roam/
- JavaScript plugins for Roam / `roam/js` (Ness Labs) — https://nesslabs.com/roam-research-javascript-plugins
- RoamJS SmartBlocks & Query Builder — https://github.com/RoamJS/smartblocks , https://github.com/RoamJS/query-builder
- Roam-Research/datalevin (Datalog engine) — https://github.com/Roam-Research/datalevin
