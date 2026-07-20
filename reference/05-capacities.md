# Capacities

**What it is.** Capacities is a cloud-based, object-oriented note-taking and personal knowledge management (PKM) app that markets itself as "a studio for your mind." Instead of organizing information as files in folders, it treats every piece of content as a typed *object* (a Person, Book, Project, Meeting, Page, etc.) with a structured schema of properties, and it weaves those objects into a linked graph. Built by Capacities Labs GmbH (founded 2020, Sankt Wendel, Germany; founder-owned, no outside investors), it runs on Mac, Windows, Linux, iOS, Android, and in the browser.

---

## 1. Core functionality

Capacities is a networked notes app whose fundamental unit is the **object**, not the file or the block. Notes, images, PDFs, tweets, weblinks, and tags are *all* objects. Every object has a **type**, a **title**, a set of **properties**, and a body made of **blocks**. You create entities rather than documents: not a note *about* a book, but "the book itself" as an object you can link everywhere, with author/rating/status fields attached. Day-to-day use centers on: capturing into **daily notes**, creating and linking typed objects, and building **queries/collections** that surface the right subset of objects on demand. It is explicitly single-user PKM ("for individuals who think for a living"), not a team/collaboration or project-management tool.

## 2. Distinctive features (vs. Obsidian / Logseq / Roam / Org)

- **Typed objects with structured properties** — the defining idea. Where Obsidian/Logseq/Roam treat every page as an untyped bag of text/blocks, Capacities gives each object type its own schema (fields, layout, card view, dashboard). It sits between a pure notes app and a lightweight Notion-style database.
- **Global tags and cross-type pickers.** Tags work across the *entire* space, not siloed per-database as in Notion. Object-select properties can draw from any type in the workspace.
- **Multiple views over the same data** — list, gallery, table, cards — chosen per type or per query.
- **Frictionless multi-channel capture** into daily notes via WhatsApp, Telegram, email, and a web clipper.
- **Contextual backlinks** with customizable, filterable, sortable backlink views; unlinked mentions (Pro).
- **AI assistant** (Pro) integrated for chat/summarization over content.
- **Trade-offs to react to:** no formulas/rollups or cross-database relations like Notion; limited offline (see below); learning curve; not local-first.

## 3. Data model & storage format

**The model:** the storage foundation is single nodes of a graph, which Capacities calls **objects**. Each object belongs to a **type**, and each type gathers its instances into a tabular database with a **type-specific schema of properties**. Two categories of type:

- **Basic (built-in) types** — Page, Tag, Image, Weblink, Audio, PDF, File, Tweet, AI Chat, Query, Table — with tailored, fixed behavior.
- **Custom types** — user-defined, e.g. Book, Person, Project, Meeting, with configurable properties, page layout, dashboards, and card views.

The object body (its blocks) is itself modeled as a **property** of the object. The **title** is a plain-text property, important for search. Properties are managed centrally per type: editing a type's properties changes *every* object of that type. Objects link to each other via **object-select properties**, which can be **two-way linked** so the reverse relation stays in sync (e.g. a Book's "Author" ↔ a Person's "Books written"; not available when the target is a basic type).

**Storage & sync — NOT local-first (important):** Capacities stores data in its **own proprietary database format**, not as markdown files in folders. On desktop the data lives in the app's own data store on the device (in browser storage when used via the web), and it **always syncs to Capacities' cloud** — sync **cannot be disabled** and that is "not planned." It is *offline-capable* (notes download to the device; changes queue and sync when online) but their own help framing is explicit that "offline-first is about a seamless offline experience... not about having your notes stored locally as files." Some features (full-text/extended search, saved queries, AI) do **not** work offline; only title search does. **Markdown is an export target, not the native format:** a "Full Export" produces a ZIP of clean, human-readable markdown + CSV + media, with internal links rewritten as local links so the graph is portable to Obsidian/Logseq/etc.; exports can be scheduled/automated. Contrast this sharply with Obsidian/Org (plain files on disk) and Logseq (local markdown/org).

## 4. Editing & UX paradigm

- **Block-based WYSIWYG editor**, distraction-free. Blocks (headings, lists, toggles, quotes, math, code, tables) are the body content; each is a property of the object.
- **Markdown shortcuts while typing** (not markdown-as-storage): `#` + space for headings, `>` for toggles, combinable at the start of a block; pasting standard markdown tables converts to native tables. Slash `/command` and `+` insert blocks/objects.
- **Keyboard-driven via a Command Palette** (`Ctrl/Cmd+K`) for navigate/create/search and quick capture; **Extended Search** (`Ctrl/Cmd+Shift+P`) filters by type, tags, objects-vs-blocks, grouping.
- **Daily notes** are a first-class ritual: one note per day as a timeline/inbox, with day/week/3-day-rolling/month views and single-key navigation (`d/w/r/m/t`, arrows).
- Objects render as rich pages (title + property panel + blocks), and can also appear as cards/table rows/gallery tiles depending on the view.

## 5. Linking & knowledge-management model

- **Inline object links:** type `@Name` or `[[Name]]` and pick the object; links are automatically **two-way** (creating a backlink on the target). `[[Name]]` links only to an existing object — no accidental creation.
- **Create-and-link in one step, with type:** `@/person/Ada Lovelace`, `+person/Ada Lovelace`, or (integrations) `[[person/Steve Jobs]]` create a new typed object and link it. Multi-word types use upper camel case: `[[BookSummary/Sapiens]]`.
- **Block references:** type `((` and search block content to link/transclude a specific block; block links can be inline or as a block embed (cards, embeds, link blocks).
- **Backlinks** appear at the bottom of each object as "Mentions in text," with configurable default open/closed state and per-object override; queries can filter/sort by number of backlinks.
- **Tags vs. Labels vs. Collections vs. Queries** (four distinct organizing structures):
  - **Tags** — thematic, cross-type connective tissue ("big picture").
  - **Labels** — single-/multi-select dropdown *within one type* for filtering.
  - **Collections** — manually curated subgroups within a *single* type (folder-like but an object can belong to many).
  - **Queries** — rule-based, auto-updating views (object-type, search, tag, and **variable/context-aware** queries that read the embedding object's properties). Think "dynamic collections." Up to 10 types, with filters on tags/properties/collections/backlinks, plus sort/group/limit.
- **Graph view** visualizes the object network for exploration.

## 6. Extensibility

- **Public HTTP API (API 2.0)** with a Developer Portal (`developers.capacities.io`); early "Create new object" callback lets external tools push content in. Roadmap: file endpoints, richer querying, collections, an official **Python SDK**, a **CLI**, and no-code integrations (n8n, Zapier, Make).
- **Integrations** for capture: Telegram, WhatsApp, email, web extension.
- **Templates** per object type shape new objects and their default backlink/link views.
- No third-party plugin ecosystem or user scripting comparable to Obsidian community plugins or Emacs/Org's Elisp; customization is via types, properties, templates, queries, and the API rather than code.

## 7. Relevance to a markdown editor (borrow / avoid)

**Worth borrowing:**
- **Typed notes with a per-type property schema.** Even a file-based markdown editor could layer an optional "type" (via frontmatter) that drives a property panel, default template, and specialized views — a middle path between Obsidian's untyped files and a full database.
- **Create-and-link-with-type inline syntax** (`@/person/Name`) — encoding *type* into the link gesture is more expressive than bare `[[wikilinks]]` and could map to frontmatter-typed target files.
- **Queries as dynamic collections** (rules → live view) distinct from **manual collections**, with clear conceptual separation from **tags** (cross-cutting) and **labels** (intra-type). This four-way taxonomy is a clean mental model.
- **Two-way property links** kept in sync — powerful for structured relations if you can maintain the invariant.
- **Multiple views over the same set** (list/table/gallery/cards) and configurable backlink views.
- **Daily-notes-as-inbox with fast multi-channel capture** and a keyboard command palette.

**Worth deliberately avoiding / reacting to:**
- **Proprietary, mandatory-cloud storage.** For a markdown editor whose whole value is plain-file ownership, do the opposite: store native markdown/org on disk, local-first, sync optional. Capacities' own users repeatedly ask for local files; treat markdown as the *native* format, not an export.
- **Search/queries/AI failing offline** because they depend on the server — keep core retrieval fully local.
- **Property-type conversions risking data loss** and the general rigidity of a schema — a text-first editor should keep structure optional and non-destructive.

---

## Sources

- Capacities home / "studio for your mind" — https://capacities.io/
- Product page — https://capacities.io/product
- Docs: Object types — https://docs.capacities.io/reference/content-types
- Docs: Properties / Object properties — https://docs.capacities.io/reference/properties , https://docs.capacities.io/reference/object-properties
- Docs: Organizational structures (tags/labels/collections/queries) — https://docs.capacities.io/reference/organizational-structures
- Docs: Queries — https://docs.capacities.io/reference/queries
- Docs: Blocks — https://docs.capacities.io/reference/blocks
- Docs: Networked note-taking (link syntax) — https://docs.capacities.io/tutorials/networked-note-taking
- Docs: Block-based linking — https://docs.capacities.io/reference/block-based-linking
- Docs: Offline support — https://docs.capacities.io/misc/offline-support
- Docs: Export — https://docs.capacities.io/reference/export
- Two-way linking of properties (release 50) — https://capacities.io/whats-new/release-50/
- Variable queries (release 51) — https://capacities.io/whats-new/release-51/
- API 2.0 & Developer Portal (release 67) — https://capacities.io/whats-new/release-67 , https://developers.capacities.io
- Independent analysis: object-oriented note-taking — https://wisery.substack.com/p/capacitiesio-object-oriented-note
