# Emacs & Org mode

**What it is.** GNU Emacs is an extensible, self-documenting text editor whose central abstraction is the *buffer* — a general-purpose container for text, program output, help, email, or a web page ("everything is a buffer," analogous to Unix's "everything is a file"). Org mode is a major mode built on top of Emacs that turns a single plain-text `.org` file into an outliner, task manager, agenda, spreadsheet, literate-programming notebook, and multi-format publishing source. Org is the part most relevant to a markdown editor: it is a mature lightweight-markup format with two decades of design decisions about structure, links, and metadata baked in.

---

## 1. Core functionality

- **Emacs proper:** a Lisp machine wrapped in a text editor. A small C core plus a very large body of Emacs Lisp (Elisp). Text lives in buffers; *point* is the cursor position; every buffer has a *major mode* (one, defines primary behavior/keybindings, e.g. `org-mode`, `python-mode`) and any number of *minor modes* (layered toggles). Interactive processes, shells, dired file listings, and mail all render into buffers, so one editing paradigm covers everything.
- **Org mode** does, per its author, "outlining, note-taking, hyperlinks, spreadsheets, TODO lists, project planning, GTD, HTML and LaTeX authoring — all with plain text files." It stays a simple outliner on first use and scales up to a project-management and authoring suite. Current manual documents Org 9.8.

## 2. Notable / distinctive features (vs. Obsidian/Logseq/Roam/Capacities)

- **One file = a whole outline tree.** Org is document-and-outline-first, not one-note-per-file. A single file can hold an entire project or knowledge base as a folding tree.
- **TODO state machine in prose.** Any headline becomes a task by prefixing a keyword (`TODO`, `DONE`, custom states like `NEXT`/`WAITING`/`HOLD`), cycled with `S-<left>/<right>`. Adds priorities `[#A]`, `SCHEDULED:`/`DEADLINE:` planning lines, repeaters, and time-clocking.
- **Agenda.** A query engine that aggregates tasks/timestamps across many files (`org-agenda-files`) into daily/weekly views, stuck-project reports, and custom filtered views — a calendar built from plain text.
- **Tables that compute.** ASCII pipe tables with a `TAB`-to-navigate editor and a real spreadsheet layer (formulas, cell/row references, `#+TBLFM:`), plus CSV/TSV import-export.
- **Babel / literate programming.** Embedded source blocks in 70+ languages execute in place, capture output back into the file, and pass results between blocks — reproducible-research notebooks in plain text.
- **Export/publish.** Single-source export to HTML, LaTeX/PDF, OpenDocument, Markdown, plain text; a publishing system can build whole static sites.
- **Capture.** Friction-free inbox: templated quick-entry from anywhere (including browsers via org-protocol), later *refiled* to a permanent home.

## 3. Data model & storage format

- **Local-first, plain-text, one format.** Everything is a human-readable UTF-8 `.org` file on the local disk — no database, no cloud, no lock-in. Portability and grep-ability are core values. (Org-roam adds a *derived* SQLite cache for link queries, but the files remain the source of truth and can be rebuilt.)
- **Markup (the borrowable part):**
  - Headlines: `* H1`, `** H2`, `*** H3` (stars = depth).
  - Emphasis: `*bold*`, `/italic/`, `=verbatim=`, `~code~`, `+strike+`, `_underline_`.
  - Lists: `- item` / `+ item` / `1.` / `1)`; checkboxes `- [ ]` / `- [X]`.
  - Links: `[[target][description]]` (double-bracket, target-first).
  - Timestamps: active `<2024-01-15 Mon 09:39>` (shows in agenda) vs. inactive `[2024-01-15 Mon]` (does not).
  - **Drawers** hide metadata under a headline: a `:PROPERTIES:` … `:END:` drawer holds key/value `:PROP: value` pairs (including a unique `:ID:`); a `:LOGBOOK:` drawer holds state-change and clock notes.
  - Tags: `:work:urgent:` appended to a headline (colon-delimited, inherited by children); `#+FILETAGS:` for whole files.
  - Blocks/directives: `#+BEGIN_SRC python … #+END_SRC`, `#+TITLE:`, `#+BEGIN_QUOTE`, etc.

## 4. Editing & UX paradigm

- **Source-visible, not WYSIWYG.** You edit the marked-up plain text directly; Org "prettifies" in place (hides link brackets, renders inline images/LaTeX optionally) but never hides the underlying text — a middle ground between raw Markdown source and Obsidian's live preview.
- **Outliner, keyboard-driven.** The defining interaction is *visibility cycling*: `TAB` folds/unfolds the subtree under a headline; `S-TAB` cycles the whole document between overview / contents / all. Structure editing promotes/demotes and moves subtrees with `M-<arrows>` / `M-S-<arrows>`. In tables, `TAB` moves cell-to-cell and `RET` row-to-row.
- **Everything through commands + keybindings.** Actions are Elisp *commands* invokable by name (`M-x`) or bound to keys; bindings are global or mode-local. This command-first model predates and inspired the modern "command palette."

## 5. Linking & knowledge-management model

- **Rich links, one syntax.** `[[https://…][web]]`, `[[file:notes.org::*Heading][…]]`, `[[id:711a7cac-…][stable link]]`, and *custom link types* (e.g. `[[issue:1234]]`) with user-defined resolvers. Internal targets can be headlines, custom IDs, or line/search anchors.
- **Vanilla Org is one-directional** — it follows links forward but has no built-in backlink index. This gap is filled by ecosystem packages:
  - **org-roam** — a Roam/Zettelkasten replica. Every note or promoted headline is a *node* with a UUID `:ID:`; links use `id:` (stable across renames/moves). A background SQLite DB indexes all links so the **org-roam buffer** shows **backlinks**, reference links, and unlinked references for the node at point. This is the closest Org analog to Obsidian/Roam.
  - **org-transclusion** — inline **embeds**: a `#+transclude: [[id:…]]` directive live-includes another note's content; you can edit in place or jump to source. This is Org's block/note transclusion answer to Roam block-refs.
- **Tags + property queries** provide non-hierarchical cross-cutting organization; the agenda and org-ql act as the query layer over tags, properties, and TODO state.

## 6. Extensibility

- **Elisp all the way down.** Emacs *is* its extension language; nearly every behavior is a redefinable Elisp function operating on buffers at point. Config is code (`init.el`), typically via `use-package`, with thousands of community packages (MELPA). Major/minor modes, keymaps, hooks, and buffer-local variables are the extension primitives.
- Org itself is highly configurable through variables (TODO keyword sets, capture templates, agenda custom commands, export backends — new backends can be derived from existing ones) without leaving plain text.

## 7. Relevance to designing a markdown editor

**Ideas worth borrowing**
- **Folding/visibility cycling as the primary navigation gesture** — one key (`TAB`) to collapse a heading, one (`S-TAB`) to cycle the whole document's detail level. Powerful for long notes.
- **Structure editing on the tree** — promote/demote/move a heading *and its whole subtree* with a keystroke, instead of hand-editing markers.
- **Metadata in foldable drawers** — keep a note's ID, created-date, tags, and log out of the reading flow but in the same plain-text file (vs. Obsidian's separate YAML frontmatter block).
- **Stable ID-based links + a link/backlink index** — decouple links from filenames/paths so renames don't break them; keep the DB as a *rebuildable cache* over authoritative text files (the org-roam pattern).
- **Timestamps as first-class, agenda-queryable data**, and a capture→refile inbox flow to reduce entry friction.
- **Custom link types with resolvers** — a small, general extension point (`scheme:target`) that scales to many integrations.

**Things to weigh / react to**
- Org's `*bold*` / `[[target][desc]]` / `<timestamps>` syntax is **incompatible with Markdown**; a Markdown editor should keep CommonMark link/emphasis syntax while borrowing the *ideas*.
- Org's power comes bundled with Emacs's steep learning curve and keybinding density — a mimicking editor can adopt the outliner model with a gentler, discoverable UI.
- One-file-is-a-tree vs. one-note-per-file is a genuine design fork: Org leans document/outline; Obsidian/Roam/Logseq lean file/block. Decide deliberately.

---

## Sources

- Org mode — Features: https://orgmode.org/features.html
- The Org Manual (v9.8): https://orgmode.org/manual/ and https://orgmode.org/org.html
- Org Compact Guide: https://orgmode.org/orgguide.html
- Capture templates: https://orgmode.org/manual/Capture-templates.html
- Org-mode — Wikipedia: https://en.wikipedia.org/wiki/Org-mode
- Org-roam manual: https://www.orgroam.com/manual.html and repo https://github.com/org-roam/org-roam
- Org-roam v2 / Zettelkasten write-up: https://zettelkasten.de/posts/org-roam-version-2/
- GNU Emacs (official): https://www.gnu.org/software/emacs/
