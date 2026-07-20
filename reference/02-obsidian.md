# Obsidian

**What it is.** Obsidian is a private, offline-first note-taking and personal-knowledge-management (PKM) application that works directly on top of a local folder of plain-text Markdown files (a "vault"). It is built around bidirectional linking, a graph of connected notes, and a large community-plugin ecosystem. Its guiding principle is *"file over app"*: your notes are durable local files that outlive the app, not rows in a proprietary database. Developed by Dynalist Inc. (Shida Li and Erica Xu), first released in 2020; free for personal use, with paid Sync and Publish services.

## 1. Core functionality

Obsidian presents a folder of Markdown documents as a searchable, interlinked knowledge base — "a second brain, for you, forever." Each note is a file; you write in Markdown, link notes with `[[wikilinks]]`, and the app maintains backlinks, a metadata cache, full-text search, tags, and an interactive graph. It runs on Windows, macOS, Linux, iOS, and Android. The app is intentionally local and offline — no account or network is required — and the developers cannot read your notes.

## 2. Distinctive features (vs. peers in this list)

- **Local plain-text vault** as the primary substrate (unlike Roam/Capacities, which are cloud/DB-first).
- **Document-centric, not block-centric.** The atomic unit is the *file/note*, not the block (contrast Logseq/Roam, which are outliner/block-first). Blocks exist but are secondary.
- **Graph view** — global and local force-directed visualizations of notes-as-nodes and links-as-edges.
- **Canvas** — an infinite 2D whiteboard (core plugin) storing to an open `.canvas` / JSON Canvas format.
- **Bases** — a newer core plugin (v1.9, 2025) giving no-code database/table/card views over notes' YAML properties.
- **Massive plugin/theme ecosystem** — thousands of community plugins and themes; heavy customization.
- **Open file formats throughout** — Markdown for notes, JSON Canvas for canvases, YAML frontmatter for metadata.

## 3. Data model & storage format

**Local-first, file-over-app.** A vault is just a folder on disk (with subfolders); each note is a `.md` Markdown plain-text file editable in any editor. There is no central database of record — the files *are* the data. Obsidian maintains a derived **metadata cache** (backed by IndexedDB) to power graph/search/outline, but that cache is disposable and rebuildable from the files.

- **Config** lives in a hidden `.obsidian/` folder at the vault root (hotkeys, enabled plugins, themes, `workspace.json` layout). App-global settings live under `~/.config` (Linux), `%APPDATA%`, or `Library/Application Support`.
- **Metadata** is stored as **YAML frontmatter** ("Properties") delimited by `---`. Six typed values: text, list, number, checkbox, date (`YYYY-MM-DD`), datetime. Three built-ins: `tags`, `aliases`, `cssclasses`.
- **Canvas** files are `.canvas` JSON (open **JSON Canvas** spec, MIT, v1.0) — two arrays `nodes` and `edges`; unknown fields are ignored, so it is forward-extensible.
- **Bases** add a `.base` config file — but it stores only the *view* (filters, columns, sort); the underlying data stays in each note's frontmatter, so deleting a base loses nothing.
- **Sync** is optional (paid Obsidian Sync, or Git/Dropbox/iCloud). No lock-in: notes remain portable plain text.

Example frontmatter:
```yaml
---
title: A New Hope
tags: [film, scifi]
aliases: [Episode IV]
year: 1977
link: "[[Star Wars]]"
---
```

## 4. Editing & UX paradigm

**Document editor, not an outliner.** Three view states:
- **Reading view** — rendered output, no syntax shown.
- **Live Preview** (default editing mode) — renders formatting inline *as you type*, WYSIWYG-like, while keeping you in the source.
- **Source mode** — raw Markdown with all syntax visible.

Toggle edit/read with `Ctrl/Cmd+E`; Live Preview↔Source is a separate command. The app is keyboard-friendly (command palette, hotkeys, optional Vim mode) but not strictly keyboard-driven like Emacs. Supports panes/splits, tabs, folding, an outline pane, and callouts. Because the unit is the file, there is no forced bullet/indent structure — you write free-form Markdown prose, which is a key philosophical difference from Logseq/Roam's mandatory outline.

## 5. Linking & knowledge-management model

- **Wikilinks:** `[[Note Title]]`, with alias display via pipe: `[[Atomic Habits|James Clear]]`. Note: wikilinks are *not* standard CommonMark; standard `[text](file.md)` links also work and are more portable.
- **Backlinks:** every link auto-creates a backlink in the target, shown in a Backlinks pane, split into **Linked Mentions** (explicit `[[ ]]`) and **Unlinked Mentions** (bare text matches of the title/alias).
- **Headings & blocks:** link to a heading `[[Note#Heading]]` or a block `[[Note#^blockid]]` (block IDs are `^`-suffixed anchors).
- **Embeds / transclusion:** prefix any link with `!` to inline-render it — `![[Note]]`, `![[Note#Heading]]`, `![[Note#^blockid]]`, and for images/PDFs.
- **Tags:** `#tag` inline or via the `tags` property; nested tags (`#area/work`) supported. Tags and folders can be combined.
- **Graph view:** hubs, bridges, and clusters emerge from link structure; local graph focuses on one note's neighborhood.
- **Queries:** native search plus (via plugins like **Dataview**) SQL-like DQL / JS queries over frontmatter and inline `key:: value` fields; **Bases** offers a no-code GUI equivalent.
- Links **self-heal**: renaming/moving a note updates all references automatically.

## 6. Extensibility

- **Core plugins** (shipped, toggleable): graph, backlinks, outgoing links, canvas, bases, bookmarks, outline, tag pane, daily notes, templates, web viewer, etc.
- **Community plugins:** thousands of open-source plugins installable in-app. The plugin **API is TypeScript/JavaScript**; plugins run with full app privileges (file R/W, network) — powerful but a trust/security consideration. Flagship examples: Dataview, Templater, Excalidraw, Calendar, Kanban.
- **Themes & CSS snippets:** full restyling via `cssclasses` and snippet files.
- **Config as files:** hotkeys, plugin lists, and appearance are JSON in `.obsidian/`, so setups are portable/version-controllable.

## 7. Relevance to designing a Markdown editor

**Ideas worth borrowing:**
- **File-over-app / plain-text vault** — treat the filesystem as the source of truth; keep a disposable, rebuildable index for speed. This is the cleanest local-first model and maps well to an Emacs/Org sensibility.
- **Live Preview as a middle path** between raw source and full render — reduces mode-switching while keeping Markdown honest.
- **YAML frontmatter as typed properties** — a simple, portable metadata layer that both humans and queries can read.
- **Bidirectional links with linked *and* unlinked mentions** — cheap to compute, high knowledge-management value.
- **Separating "view config" from "data"** (the Bases pattern: `.base` stores the view, notes store the data) — keeps data future-proof.
- **Open sidecar formats** (JSON Canvas) with "ignore unknown fields" extensibility, instead of proprietary blobs.

**Trade-offs / things to weigh:**
- **Wikilinks and plugin-specific syntax are non-standard Markdown** — great UX, but they erode portability (the "archival vs. application" tension). Decide deliberately how much non-CommonMark syntax to bake in.
- **File-centric vs. block-centric:** Obsidian is weaker at block-level addressing/transclusion than Logseq/Roam; if fine-grained block refs matter, design that in from the start rather than bolting on `^blockid`.
- **Full-privilege plugins** are flexible but a security surface — consider sandboxing tiers (cf. Dataview's sandboxed DQL vs. unsandboxed JS).

## Sources

- Obsidian official site — https://obsidian.md/
- How Obsidian stores data (Help) — https://obsidian.md/help/data-storage
- Properties (Help) — https://obsidian.md/help/properties
- Canvas (Help) & JSON Canvas — https://obsidian.md/help/plugins/canvas , https://obsidian.md/blog/json-canvas/ , https://github.com/obsidianmd/jsoncanvas
- Introduction to Bases (Help) — https://obsidian.md/help/bases
- Link to blocks / embeds (Help) — https://help.obsidian.md/How+to/Link+to+blocks
- Developer docs (Vault, TypeScript API) — https://docs.obsidian.md/Plugins/Vault
- File Over App essay (Steph Ango) — https://stephango.com/file-over-app , https://stephango.com/vault
- Obsidian (software) — Wikipedia — https://en.wikipedia.org/wiki/Obsidian_(software)
- Dataview plugin — https://github.com/blacksmithgu/obsidian-dataview
