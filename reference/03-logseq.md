# Logseq

**What it is.** Logseq is a free, open-source (AGPL-3.0), local-first personal knowledge base built as a
**block-based outliner**. Every line is a bullet/block that can be linked, tagged, referenced, embedded, and
queried; notes live as plain **Markdown or Org-mode** files on your own disk. Created by Tienson Qin (Logseq Inc.,
first released Oct 2020; written in Clojure + TypeScript on Electron), it pairs a Roam-style networked-thought
model with the plain-text portability and privacy stance of Org.

---

## 1. Core functionality

- A **journal-first outliner**: the app opens each day to a **daily journal** page. You capture thoughts, notes,
  and tasks as bullets there, then link them to topic pages — structure emerges from links rather than folders.
- **Bidirectional linking** across pages *and* individual blocks, with automatic backlinks (a "Linked
  References" panel on every page) and "Unlinked References" (mentions not yet linked).
- **Block references, embeds, and transclusion** — reuse any bullet or page anywhere without copying.
- Built-in **task management** (TODO/DOING/DONE or LATER/NOW, priorities, scheduled/deadline dates, recurring).
- **Queries** (simple filters and full Datalog) that turn the graph into a live database.
- **Spaced-repetition flashcards** (SM-style algorithm), **PDF annotation**, an interactive **graph view**, and
  **whiteboards** (spatial canvas linking blocks/pages).

## 2. Notable / distinctive features

- **Everything is a block.** Unlike Obsidian's file-centric model, Logseq's atomic unit is the bullet. This makes
  block-level referencing, embedding, and querying first-class rather than bolt-on.
- **Journal as the default inbox** — a low-friction "just start typing" capture loop; pages are formed lazily.
- **Properties as structured metadata** on any page or block (`key:: value`), which feed the query engine.
- **Datalog query engine** over an in-memory Datascript database derived from your files — arguably the most
  powerful query system among these tools.
- **Plain-text ownership** with Org-mode support (rare among modern PKM apps).
- Flashcards, PDF highlights, and whiteboards ship in-core, not as plugins.

## 3. Data model & storage format

- **Local-first, plain text.** You pick a local folder; that becomes a **graph**. The classic ("file version")
  layout stores files as Markdown (`.md`) or Org (`.org`):
  - `journals/` — one file per day (e.g. `2026_07_17.md`).
  - `pages/` — one flat file per named page (no nested subfolders; page hierarchy is virtual, via `parent/child`
    naming and namespaces).
  - `logseq/config.edn` — per-graph configuration (EDN); global config at `~/.logseq/config/config.edn`.
- **Page vs block.** A *page* is a file/named node; a *block* is a bullet within it, each with a stable
  **UUID**. Blocks nest to form the outline; the page is the root.
- **Internal database.** Files are the source of truth, but Logseq parses them into a Datascript DB (via the
  `mldoc` parser) that powers linking, search, and queries. Markup can be Markdown *or* Org per graph, and mixed
  graphs can cross-link; switching default format does **not** convert existing files.
- **DB version (2025–2026).** A major architectural pivot ships a **SQLite-backed "DB graph"** to fix
  performance on large graphs (the file version degraded past ~a few thousand pages) and to support richer
  properties/collaboration. Trade-off: it moves away from one-plain-file-per-page portability. Both file and DB
  graphs coexist; import/export bridges them. (Version-sensitive — verify current default before relying on it.)
- **Sync:** optional end-to-end-encrypted **Logseq Sync** (paid, beta); many users instead sync the folder via
  Git/iCloud/Dropbox/Syncthing. Core app is free with no feature gates.

## 4. Editing & UX paradigm

- **Outliner, not document.** Editing is bullet-centric: `Tab`/`Shift-Tab` indent/outdent, drag to reorder,
  collapse/expand any subtree, and **zoom into** a block so it fills the screen (breadcrumb context on top).
- **Hybrid inline WYSIWYG on Markdown source.** You type raw Markdown; rendered styling shows live, and the raw
  syntax reappears when you click into a block to edit — no separate preview/source toggle.
- **Keyboard-driven** with a `/` slash-command menu (insert TODO, queries, templates, dates, embeds, etc.) and
  `[[`, `((`, `{{` auto-completion popups.
- Blocks fold individually; a page is effectively an infinitely foldable tree, which changes navigation
  ergonomics versus a scrolling long-form document.

## 5. Linking & knowledge-management model

Core syntax to borrow-or-react-to:

```
[[Page Name]]                     link to (and auto-create) a page
#tag  /  #[[multi word tag]]      tag == a page link; tags and links are the same thing
((0f2c...-uuid))                  block reference (link to one specific bullet)
[label](((0f2c...-uuid)))         block ref with custom display text
{{embed [[Page Name]]}}           transclude an entire page inline
{{embed ((uuid))}}                transclude a single block (live, editable in place)
key:: value                       page/block property (queryable metadata)
TODO / DOING / DONE               task states;  [#A] priority;  SCHEDULED/DEADLINE dates
{{query (and [[project]] (task TODO))}}   simple query
```

- **Tags are pages.** `#linux` and `[[linux]]` resolve to the same page — no separate tag namespace.
- **Backlinks are automatic and block-granular**: a page shows every block that references it, with context.
- **Embeds are true transclusion** — the embedded block/page stays live and editable at its source.
- **Queries** come in two tiers: **simple** (`{{query ...}}` with `and/or/not`, page refs, `(task TODO)`,
  `(between ...)`, `(property k v)`) and **advanced** Datalog blocks:

```clojure
#+BEGIN_QUERY
{:title "Open tasks tagged project"
 :query [:find (pull ?b [*])
         :where [?b :block/marker "TODO"] [?b :block/refs ?p] [?p :block/name "project"]]}
#+END_QUERY
```

- **Namespaces** (`Parent/Child` page names) give lightweight hierarchy; **aliases** let one page answer to
  multiple names.

## 6. Extensibility

- **Plugin API** (desktop only): JS/TS plugins run sandboxed (iframe/shadow DOM), talking to a namespaced
  `@logseq/libs` API via message passing — they register slash commands, UI, renderers, models, and read/write
  the graph. Distributed through an in-app **Marketplace** (~500 plugins + themes; themes *are* plugins).
- **`config.edn`** for per-graph/global settings, custom CSS (`:custom-css-url`), CodeMirror options, custom
  query views/transforms, keybindings.
- Custom `:view`/`:result-transform` functions render query output; Hiccup (`[:p "Hello" [:em "!"]]`) allows
  inline HTML-ish structures.

## 7. Relevance to designing a markdown editor

**Ideas worth borrowing**
- **Block-as-atom with stable UUIDs** enables block references, transclusion, and block-level backlinks — the
  single most differentiating capability here. Decide early whether your unit is the *file* (Obsidian) or the
  *block* (Logseq); it shapes the whole data model.
- **Journal-first capture** lowers the "where do I put this?" friction; structure via links, not folders.
- **Tags == page links** collapses two concepts into one and keeps the model small.
- **Live inline rendering on raw Markdown** (no source/preview mode-switch) is a good middle path.
- **A queryable property layer** (`key:: value`) plus an embedded query language turns notes into a database —
  even a simple filter query (tag/property/date) adds enormous leverage.
- **Plain-text, one-file-per-note, local-first** preserves ownership and Git-friendliness.

**Things to weigh / avoid**
- **Block-ref UUIDs pollute Markdown** (`((63a...))`, `id:: ...` properties) and hurt plain-text readability and
  cross-tool portability — Logseq's own DB-version pivot is partly an admission that the file model doesn't scale.
- **Everything-is-a-bullet** is polarizing: great for outlining, awkward for long-form prose. Consider supporting
  both document and outline modes.
- **Datalog is powerful but steep**; offer a simple query tier before exposing the full engine.
- File-per-page **flat directories with virtual hierarchy** simplify storage but can surprise users expecting a
  filesystem tree.

---

## Sources

- Official site: https://logseq.com/
- Official docs: https://docs.logseq.com/
- Markdown syntax reference: https://github.com/logseq/docs/blob/master/pages/Markdown.md
- Advanced Queries doc: https://github.com/logseq/docs/blob/master/pages/Advanced%20Queries.md
- Plugin API docs: https://plugins-doc.logseq.com/ and https://logseq.github.io/marketplace/
- Wikipedia (facts, history, license, DB version): https://en.wikipedia.org/wiki/Logseq
- Logseq from an Org-mode point of view (Karl Voit): https://karl-voit.at/2024/01/28/logseq-from-org-pov/
- It's FOSS — Pages, Links, Tags, Blocks: https://itsfoss.com/logseq-pages-links-tags-blocks/
- Bellingcat toolkit (file vs DB graphs): https://bellingcat.gitbook.io/toolkit/more/all-tools/logseq
