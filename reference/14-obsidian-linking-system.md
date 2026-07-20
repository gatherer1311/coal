# Obsidian — the linking system (syntax, block refs, resolution, index)

**What this is.** A single, decision-grade dossier on Obsidian's *link mechanics and data model* — the byte-level syntax of every internal-link and embed form, the exact block-reference (`^blockid`) mechanism, the two-stage resolution algorithm, and the derived `MetadataCache` index that turns a flat folder of `.md` files into a navigable link graph. It is written for the author of **Coal**, whose links are today UUID-based (`[[uuid]]` inline, `^id:<uuid>` on every block, note `id:` in YAML frontmatter) and who is about to **redesign the link system**. So it closes (§15) by mapping each of the owner's four pain points onto how Obsidian solves them and the concrete design lever for Coal.

**What it deliberately does *not* re-cover.** `reference/13-obsidian-how-ui-ux.md §6` already documents the backlinks / outgoing-links / outline / properties / graph *panels* and the `MetadataCache` change-events at the UI level, plus the `EditorSuggest` machinery (§4 there); `reference/02-obsidian.md §5` gives the high-level linking overview. Cross-reference both — this file goes one layer *lower*, on the grammar and the cache shapes underneath, and only restates a panel-level fact when it is load-bearing for resolution. Obsidian core is closed-source, so a handful of specifics (block-ID generation, duplicate-basename tie-break, the internal resolver ordering) are community-reverse-engineered and flagged as such rather than asserted.

---

## 1. Overview — two link families, and the settings that pick between them

- **Obsidian accepts two interchangeable grammars for the same internal link.** The **Wikilink** `[[Three laws of motion]]` (double square brackets) and the standard **Markdown link** `[Three laws of motion](Three%20laws%20of%20motion)`. The help states they "are equivalent, and they appear the same way in the editor and links to the same note." They resolve through the *same* engine (§5); the only differences are the surface bytes and portability (§14).
- **The link target is a *linkpath*, not a filesystem path.** In a wikilink you write the note's name (`[[My note]]`), optionally with the extension (`[[My note.md]]` — the `.md` is optional for markdown targets, **required** for non-markdown ones like `[[Figure 1.png]]`), or a vault-root-relative path with forward slashes (`[[Projects/My note]]`, "even on Windows"). Obsidian resolves that linkpath to a concrete `TFile` at render time (§5).
- **A full reference decomposes as `linkpath` + optional `#subpath` + optional `|display`.** The subpath addresses a location *inside* the target (`#Heading`, chained `#H1#H2`, or `#^blockid`); the pipe carries per-instance display text. Everything after the first `#` is stripped before file resolution and resolved separately against the target's cache (§4/§5).
- **Which grammar Obsidian *writes* is a setting: Settings → Files and links → `Use [[Wikilinks]]`** (a toggle, **on by default**). ON → new internal links are emitted as `[[wikilinks]]`. OFF → they are emitted as Markdown `[display](path)` with a URL-encoded destination (spaces → `%20`). Crucially, the `[[` autocomplete trigger keeps working either way — with wikilinks off, selecting a suggestion inserts a *Markdown* link instead. The trigger is grammar-agnostic; only the emitted text changes.
- **A second setting governs the *path* written: Settings → Files and links → `New link format`** (a three-option dropdown, default **"Shortest path when possible"**). It changes only how much path Obsidian bakes into a newly created link (§5). It is entirely a symptom of *path-based identity* — a knob Coal's UUID model deletes outright.
- **Filename/link-destination characters to avoid (from the help):** a string containing `#`, `|`, `^`, `:`, `%%`, `[[`, or `]]` "may not work as a link." `#` = heading subpath, `^` = block subpath, `|` = display separator, `%%` = Obsidian comment fence, `[[`/`]]` = link delimiters, `:` reserved on some filesystems.

## 2. Every link form, with exact syntax

Everything in the wikilink column has a Markdown twin (URL-encoded destination; the `#` fragment separator itself is *not* encoded). Both go through one resolver.

- **Note:** `[[My note]]` · Markdown `[My note](My%20note)`. Subfolder: `[[Projects/My note]]`.
- **Heading in another note:** `[[My note#Heading name]]` — the heading text is matched literally (see §4 for case behavior), not slugified.
- **Nested subheading (chained `#`):** `[[Help and support#Questions and advice#Report bugs and request features]]` — one `#`-segment per outline level, walked in order to disambiguate a subheading whose title repeats elsewhere.
- **Heading in the *same* note:** `[[#Heading name]]` (empty linkpath). Typing `[[#` scopes heading-completion to the current note.
- **Block in another note:** `[[My note#^blockid]]` (e.g. `[[2023-01-01#^37066d]]`). The `^` immediately after `#` is what distinguishes a block reference from a heading link. Same-note block: `[[#^blockid]]`.
- **Alias display (per-instance):** pipe then display text — `[[My note|Custom name]]`, combinable with any subpath: `[[Example#Details|Section name]]`. Changes only *this* link's rendered label, never the target.
- **Embed / transclude:** prefix *any* of the above with `!` to inline-render instead of link — `![[My note]]`, `![[My note#Heading]]`, `![[My note#^blockid]]` (see §12). The `!` is the only lexical difference; embeds are cached in a separate array from links.
- **Suggester-only search forms (not stored syntax):** `[[## keyword` searches headings across the whole vault; `[[^^ keyword` searches blocks vault-wide. These are autocomplete affordances to *find* a target; the committed link is still one of the forms above (§8).

## 3. Block references & the `^blockid` mechanism, in depth

This is the mechanic Coal most needs to understand, because Coal already stamps a *superset* of it (`^id:<uuid>` on every block) but has no linking path to it yet.

- **What a block is.** "A block is a unit of text in your note, such as a paragraph, block quote, or list item." A block link points at one block, not a heading and not a sub-part of a block.
- **The authoring flow is `[[`, note name, then `#^`.** After selecting a note, typing `^` opens a block picker that lists the note's blocks by their leading text (you pick visually, not by id). On `Enter`, Obsidian does a **two-sided write**: (a) it appends a freshly-minted `^id` marker to the *target block in the target file* if that block lacks one, and (b) inserts the matching `#^id` into the link you're typing. This *lazy mint-on-first-reference* — a cross-file mutation triggered by an autocomplete accept — is the key contrast with Coal, which mints eagerly on every block (§15a). Reusing an already-referenced block reuses its existing id.
- **Manual authoring is fully supported** — you can hand-type a `^id` at the end of a block and then `[[Note#^id]]` yourself; the suggester is a convenience, not a requirement.
- **The auto-generated ID format.** Every documented and observed example is **6 characters of lowercase alphanumeric** `[a-z0-9]` (the docs show `^37066d`, `^37066f`, `^b15695`; the forum shows `^dcf64c`). Both the 6-character length and the charset are **empirically consistent but *not* formally specified** on the help site — the only documented rule constrains *manual* ids (below). Treat "always exactly 6 chars" as observed behavior, not a contract. Whether the auto-id is random or content-derived is **undocumented and unverified** (one forum user claims same-text→same-id; Obsidian's help calls it random; the generator is not public) — do **not** rely on determinism.
- **Manual/custom IDs have a restricted charset.** "Block identifiers can only consist of Latin letters, numbers, and dashes" — so `^summary`, `^quote-of-the-day`, `^intro-2` are valid; underscores, spaces, slashes, and accented/non-Latin characters (č, š, ž, ć, đ) are **not** and will fail to register a block id.
- **Placement depends on the block type** (the marker must attach to the right line):
  - **Paragraph:** a space then `^id` at the **end of the last line** — `Lorem ipsum dolor sit amet. ^37066d`.
  - **List item:** `^id` directly on that **bullet's line** — `- First item ^37006f`. It captures only that one item, not the sub-tree or the list as a whole.
  - **Structured block (blockquote, callout, table, code fence):** `^id` on **its own line**, with a **blank line before and after**, immediately following the block.
  - **Headings are *not* marked with `^id`** — a heading is addressed by its text via `#Heading` (§4). (You may still put a `^id` on the paragraph under a heading to reference that paragraph.)
- **Referenceable vs. not.** Referenceable as a whole block: paragraphs, individual list items, blockquotes, callouts, tables, code blocks, and other root-level blocks (the parser's `SectionCache.type`, §6). **Explicitly not supported: "links to specific parts of quotations, callouts, and tables"** — you can id the *whole* table/quote/callout, never a single row. There are **no ranges** and no native "this heading section is one block" via a caret; to pull in a whole section you use the heading *embed* `![[Note#Heading]]` (§12), not a block id. Frontmatter is not block-referenceable (it is YAML, surfaced separately, §6/§11).
- **Edit/delete behavior — fragile, no back-pointer.** The `^id` marker and the `#^id` link are coupled only by string equality. Removing or retyping *either* side silently breaks the reference — it does not even show as broken, it simply stops resolving. A file *rename* self-heals the linkpath portion (`[[Old#^id]]` → `[[New#^id]]`) but nothing heals a deleted/edited `^id`. Cut-and-pasting a whole block carries its id along; reflowing or splitting a paragraph can orphan it. Duplicate ids in one note are allowed with no warning and resolve to "the one you first chose."

## 4. Heading links

- **Matched on literal heading text, not a slug.** `[[Note#Heading]]` compares the subpath against `CachedMetadata.headings[].heading` (the raw heading string minus the `#` markers) — there is no anchor id or slugification.
- **Case:** filename/linkpath resolution is case-insensitive; heading-anchor matching is *in practice* treated case-insensitively too, but this specific is **not confirmed from primary documentation** (the docs describe filename case-folding, not heading case-folding), so treat it as likely-but-unverified rather than guaranteed.
- **Duplicate headings → first occurrence wins, regardless of level.** If a note has two headings with the same text, `[[Note#H]]` always targets the *first* in document order; heading *level* does not disambiguate (a later H1 with the same text as an earlier H3 is unreachable by text alone). Documented workarounds: a `^blockid`, or the nested `#Parent#Child` chain.
- **Nested chains narrow within the section.** `[[Note#Parent#Child]]` finds `Child` under `Parent`; each `#`-segment resolves relative to the previous heading's span.
- **The section a heading link bounds** runs from that heading down to the next heading of equal-or-higher level — this is what a heading *embed* transcludes and what `resolveSubpath` returns as `{ current, next }` (§5/§6).
- **Heading renames do NOT self-heal automatically.** Editing a heading's text inline silently breaks every `#Heading` link pointing at it (they aren't flagged broken — they just stop working). This is *consistent* behavior, not version-dependent. Obsidian's automatic "update internal links" covers **file** renames only. Obsidian does ship an explicit **"Rename this heading…"** context-menu command that propagates a heading-text change to `#Heading` links across the vault (with limitations — nested/subheading links may not update), but that is an opt-in action, not automatic healing, and it is documented on the forum rather than the help site.

## 5. The resolution algorithm

Resolution is **two-stage**: linkpath → file, then subpath → in-file location.

- **Stage 1 — linkpath → file: `getFirstLinkpathDest`.** The single public entry point:
  ```typescript
  getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null   // "Get the best match for a linkpath." (since v0.12.5)
  ```
  `sourcePath` is the path of the note the link lives in, supplying context for tie-breaking. It returns the resolved `TFile` or `null`. This one call decides, for every link, whether it lands in `resolvedLinks` or `unresolvedLinks` (§6).
- **The internal ordering is NOT officially documented — only "best match" is.** The community reverse-engineering (an *approximation*, not a contract; call the real method for byte-exact parity) is roughly: (1) strip the subpath and a trailing `.md`; (2) exact case-insensitive path match wins immediately; (3) if the linkpath contains a `/`, match files whose path *ends with* that suffix; (4) otherwise gather every file whose **basename** equals the linkpath's, sort by path length shortest-first, and return the first. A "same folder as `sourcePath` is preferred" rule is *sometimes* claimed but is **not** part of the reverse-engineered algorithm (which uses shortest global path) and is unverified — the only safe statement is: `sourcePath` disambiguates duplicate basenames; the exact precedence is version-dependent and unspecified. **Ambiguity is silent** — there is no error; the resolver deterministically returns one "first/best" file.
- **Stage 2 — subpath → location: `resolveSubpath`.** A free function:
  ```typescript
  resolveSubpath(cache: CachedMetadata, subpath: string):
    HeadingSubpathResult | BlockSubpathResult | FootnoteSubpathResult | null   // "Resolve the given subpath to a reference in the MetadataCache."
  ```
  It takes the *target file's* already-parsed cache and the `#…` string, branching on the caret: `#^id` → block, `#text` → heading, footnote form → footnote.
  - `HeadingSubpathResult` = `{ type: 'heading'; current: HeadingCache; next: HeadingCache; start: Loc; end: Loc | null }` — `current`/`next` bound the section (an embed renders `current.position` → just before `next`).
  - `BlockSubpathResult` = `{ type: 'block'; block: BlockCache; list?: ListItemCache; start: Loc; end: Loc | null }`.
  - Base `SubpathResult` supplies `{ start: Loc; end: Loc | null }` — the text range the subpath selects.
- **The full pipeline:** `getFirstLinkpathDest(linkpath, sourcePath)` → `TFile`, then `getFileCache(file)` → `CachedMetadata`, then `resolveSubpath(cache, '#…')` → a `{start,end}` range. That range is what "scroll to heading/block" and `![[…]]` transclusion consume.
- **The write-side inverse — `fileToLinktext` and "New link format."** Insertion mirrors resolution:
  ```typescript
  fileToLinktext(file: TFile, sourcePath: string, omitMdExtension?: boolean): string
  // "Generates a linktext for a file. If file name is unique, use the filename. If not unique, use full path."
  ```
  It emits the *shortest string that still resolves back* to `file` from `sourcePath`. The **`New link format`** dropdown governs this:
  - **"Shortest path when possible"** (default): a unique basename is written bare (`[[My note]]`); when the basename **collides anywhere in the vault**, Obsidian falls back to the **full vault-root path** (`[[folder/subfolder/My note]]`). Note it does *not* compute a minimal disambiguating prefix — the full absolute path is a known limitation (a standing feature request asks for minimal paths).
  - **"Relative path to file"**: a path relative to the linking note (`[[../folder/My note]]`) — recommended for interop with external Markdown tools / static-site generators.
  - **"Absolute path in vault"**: the full vault-root path (no leading slash), e.g. `[[folder/subfolder/My note]]`.
  - **This setting affects only newly created links** — changing it never rewrites existing ones. (`FileManager.generateMarkdownLink(file, sourcePath, subpath?, alias?)` is the higher-level primitive plugins use, honoring `Use [[Wikilinks]]` + `New link format` + subpath/alias.)

## 6. The metadata cache / index data model (the "index" Coal lacks)

Obsidian maintains one derived, disposable, rebuildable index — the **`MetadataCache`** — and every panel and the suggester read from it. This is the shape Coal has no equivalent of yet.

**Per-note parse — `CachedMetadata`.** Obtained via `app.metadataCache.getFileCache(file: TFile)` or `getCache(path: string)`; every field is optional:

```typescript
export interface CachedMetadata {
  links?: LinkCache[];                        // inline [[ ]] / [](  ) body links
  embeds?: EmbedCache[];                       // inline ![[ ]] embeds
  tags?: TagCache[];                           // INLINE #tags only (not frontmatter tags)
  headings?: HeadingCache[];                   // the outline
  sections?: SectionCache[];                   // "root level markdown blocks" + block type
  listItems?: ListItemCache[];
  blocks?: Record<string, BlockCache>;         // block-id (no caret) -> block
  frontmatter?: FrontMatterCache;              // parsed YAML object, untyped
  frontmatterLinks?: FrontmatterLinkCache[];   // links inside YAML property values (v1.4.0)
  frontmatterPosition?: Pos;                    // the ---…--- block span (v1.4.0)
  footnotes?: FootnoteCache[];                 // (v1.6.6)
  footnoteRefs?: FootnoteRefCache[];           // (v1.8.7)
  referenceLinks?: ReferenceLinkCache[];       // (v1.8.7)
}
```

**The reference type hierarchy (mirror this so every link/heading/block/tag carries a uniform position):**
- `Reference` = `{ link: string; original: string; displayText?: string }`.
  - **`link`** — "Link destination": the resolved linkpath **plus** the subpath, *not* the `[[ ]]` fences (e.g. `"Meeting Notes#^abc123"`). The subpath is **embedded in this string**, not split into separate fields — you parse it yourself or hand it to `resolveSubpath`.
  - **`original`** — "the text as it's written in the document": the raw source substring (`"[[Meeting Notes#^abc123|the meeting]]"`). Load-bearing for byte-exact in-place rewrite.
  - **`displayText?`** — "Available if title is different from link text; in the case of `[[page name|display name]]` this will return `display name`."
- `CacheItem` = `{ position: Pos }` — the one thing every positioned item has.
- `ReferenceCache extends Reference, CacheItem` — a `Reference` with a position. **`LinkCache` and `EmbedCache` both extend `ReferenceCache`** (identical shape; the `!` is the only difference on disk).
- `HeadingCache` = `{ heading: string; level: number /* "Number between 1 and 6" */; position: Pos }` — this array *is* the outline.
- `BlockCache extends CacheItem { id: string }` — `position: Pos` is **inherited from `CacheItem`**, not declared in the body. `CachedMetadata.blocks` is `Record<string, BlockCache>` **keyed by the bare id** (no caret): `text ^my-block` → `cache.blocks["my-block"]`. (The keying convention is behavioral, not in the type defs.)
- `SectionCache extends CacheItem { id?: string; type: 'blockquote' | 'callout' | 'code' | 'element' | 'footnoteDefinition' | 'heading' | 'html' | 'list' | 'paragraph' | 'table' | 'text' | 'thematicBreak' | 'yaml' | string /* "Typing is non-exhaustive" */ }`. This is the **only place the parser records a block's *type*** — the map from a block id to *what kind* of block it is, which drives §3's referenceability rules and correct embed rendering.
- `ListItemCache extends CacheItem { id?: string; task?: string; parent: number }`. `task` is a single char (`' '` = incomplete task, any other char = done, `undefined` = not a task). `parent` is the parent item's line number; **if the item has no parent, `parent` is the *negative* of the first list item's line** — a sign trick that encodes list roots.
- `TagCache extends CacheItem { tag: string }` — `tag` **includes the leading `#`** (`"#meeting"`); holds *inline* tags only (§13).
- `FrontmatterLinkCache extends Reference { key: string }` — note it extends **`Reference`, not `ReferenceCache`**, so it has a **`key` and no `position`** (frontmatter links are keyed by the YAML property path rather than a text offset). The docs give no prose for `key`; that it identifies the source property is an accurate but *undocumented inference*, and the exact key format for list-item links is unspecified.

**Positions — `Pos` / `Loc`.** `Pos = { start: Loc; end: Loc }`; `Loc = { line: number /* 0-based */; col: number; offset: number /* chars from start of file */ }`. Every item carries both a 0-based line/col **and** an absolute character offset — exactly what a CM6 editor wants (`offset` maps straight to an `EditorState` document position for jump/scroll and byte-exact rewrite).

**Vault-wide edge maps.** Two dense adjacency objects, both `Record<string, Record<string, number>>`:
- `resolvedLinks` — "maps each source file's path to an object of destination file paths with the link count": `resolvedLinks["A.md"] = { "B.md": 2 }` = A links to B twice. Destinations keyed by **resolved file path**.
- `unresolvedLinks` — same shape, but keyed by the **unresolved linkpath string** (phantom targets). Powers create-on-missing and the grey graph nodes.
- **The invariant:** `resolvedLinks[src][dst]` exists iff some link in `src` resolved (via §5) to `dst`; otherwise the linkpath sits in `unresolvedLinks[src]`. Renames flip entries between the two. **Tags contribute nothing to either map** (§13). **Backlinks are computed, not stored** — there is no `backlinks` map; the internal, undocumented `getBacklinksForFile(file)` reverse-scans every file's forward links, O(N) per call (see `reference/13 §6`).

**Lifecycle — persistence, rebuild, events.** The cache is persisted in the app's **IndexedDB** (survives restart), **not** in the vault's `.obsidian/` folder — it is derived and disposable, regenerable via **Settings → Files and links → Rebuild cache**. This is the same "delete the index, rebuild from `.md`" litmus Coal's SPEC §10 mandates. Four events drive freshness (`metadataCache.on(...)`): `'changed'(file, data, cache)` after a file is indexed — **not fired on rename, for performance**; `'deleted'(file, prevCache)`; `'resolve'(file)` after that file's links are resolved into the edge maps (resolution lags parsing); `'resolved'()` once the *whole vault* is consistent (debounced after batches). Every panel is a pure subscriber to these four events over one shared cache. (Full event coverage: `reference/13 §6`.)

## 7. Aliases

- **A note-level property, always a YAML list.** Under the built-in `aliases` key (one of Obsidian's three reserved properties with `tags` and `cssclasses`):
  ```yaml
  ---
  aliases:
    - Episode IV
    - A New Hope
  ---
  ```
  Intended for acronyms, nicknames, alternate-language names.
- **Aliases feed resolution and completion, not storage.** Each alias makes the note matchable/autocompletable under that name, appearing in the `[[` suggester with a **curved-arrow icon**. Selecting an alias does **not** write `[[Alias]]` — Obsidian writes `[[Real note name|Alias]]` (real filename as the durable linkpath, alias as the pipe display text) "to ensure interoperability with other applications using the Wikilink format." There is no link that resolves *through* an alias string; resolution is always by filename/path.
- **Alias vs. one-off display text.** An **alias** is a permanent, vault-wide alternate name registered in frontmatter — it surfaces in the suggester for *all* future links and in **unlinked-mention** text matching. **Display text** (the `|` in one link) customizes just *one* link in *one* place. Both end up as `[[Target|text]]` on disk; the difference is registration. Promoting an unlinked mention of an alias writes `[[Real note|Alias]]`.
- **Case sensitivity of alias matching is undocumented** — in practice case-insensitive, but treat as unconfirmed.

## 8. Autocomplete / the suggester (`[[`, `#`, `#^`, create-new)

The link popover is an `EditorSuggest` (mechanics — `onTrigger`/`getSuggestions`/`renderSuggestion`/`selectSuggestion`, atomic replace of the `{start,end}` trigger region — are in `reference/13 §4`). What it completes at each stage:

- **Stage 1 — `[[` → file/alias picker.** A fuzzy list over **note basenames + aliases** (alias rows tagged with the curved-arrow icon), plus other linkable files. `Enter`/`Tab` accept and write `[[Basename]]` (or `[[Basename|Alias]]`); `New link format` decides any path prefix.
- **Stage 2a — `[[Note#` → heading picker** within the resolved target (`CachedMetadata.headings`). Accept → `[[Note#Heading text]]`. Nested chains add more `#`.
- **Stage 2b — `[[#` → headings in the *current* note.**
- **Stage 2c — `[[##` → vault-wide heading search** (`[[## team]]` finds every heading containing "team"), to jump to a heading in any note without first naming the file. `[[^^` is the block equivalent.
- **Stage 3 — `[[Note#^` → block picker** within the target: "when typing the caret, suggestions appear automatically." Picking a block with no id yet **mints a 6-char id, appends it to that block in the target file, and inserts `[[Note#^blockid]]`** — the cross-file side effect of §3. (One caveat: the block popup is capped and may not list every block in a large note.)
- **Create-on-missing row (in the suggester).** When the query matches no existing file, the suggester offers a **"create a new note with that name"** row; accepting the no-match creates the file and links it — the same create pathway as the Quick switcher (`switcher:open`, Ctrl/Cmd-O). Popover ergonomics (matched-substring highlight, auto-flip above the caret near the viewport bottom, debounced async) are in `reference/13 §4`.

## 9. Create-on-missing — unresolved links, click-to-create, new-note location

- **Unresolved links are styled distinctly and recorded.** A `[[Nonexistent]]` renders in a broken-link style and lands in `unresolvedLinks` (§6). It is themable via Editor→Link CSS variables: `--link-unresolved-color`, `--link-unresolved-opacity`, `--link-unresolved-filter` (e.g. `hue-rotate`), `--link-unresolved-decoration-style`, `--link-unresolved-decoration-color` (resolved links use `--link-color`/`--link-color-hover`/`--link-decoration`/`--link-weight`; external links `--link-external-color`).
- **Following an unresolved link creates the note on the spot** and opens it. The suggester create-row (§8) is the same operation reached before clicking.
- **Where the new file lands — the linkpath overrides the default.** The general setting is **Settings → Files and links → Default location for new notes**, with three shapes: **"Vault folder"** (root), **"Same folder as current file"**, or **"In the folder specified below"** (+ a folder path field). But for a *link-created* note the link's own path wins: "If the link points to a note that doesn't exist yet, Obsidian creates the note at that folder path instead of using your default location for new notes." So `[[Projects/Ideas]]` creates `Projects/Ideas.md`; a bare `[[Ideas]]` uses the default location.

## 10. Rename / move self-healing (and its gaps)

- **The safe API vs. the raw one.** `FileManager.renameFile(file, newPath)` — "Rename or move a file safely, and update all links to it depending on the user's preferences" — is what the file-explorer rename and "Move file to…" use. `Vault.rename(file, newPath)` is the low-level move that does **not** fix links; plugins are steered to `FileManager.renameFile`.
- **The setting: Settings → Files and links → `Automatically update internal links`.** ON → renaming/moving a file silently rewrites every inbound reference across the vault; OFF → Obsidian prompts first. (Its shipped default is **not authoritatively documented** in the sources found — in practice on — so do not assume.) The `'changed'` metadata event is deliberately *not* fired on rename for performance; link updates run through a separate path.
- **What self-heals: inbound links to the moved/renamed file** — every `[[…]]`, Markdown link, and quoted frontmatter link *pointing at* it is rewritten to the new name/path (respecting `New link format`). This is why "moving a note never silently breaks inbound links."
- **Gap 1 — a moved file's own *outbound* relative links.** Under "Relative path" mode, moving a note updates links *to* it but does **not** reliably re-relativize the relative-Markdown links *inside* it pointing at other notes ("only the links to this file will be automatically updated; the links to other files in this file will not"). Wikilinks resolve by name so they survive; relative Markdown links break. A community "Update Relative Links" plugin patches this.
- **Gap 2 — heading renames don't self-heal** (§4): inline heading edits silently break `#Heading` links; only the explicit "Rename this heading…" command propagates.
- **Gap 3 — same-note section links get mutated.** On a rename/move, a same-note `[[#Section]]` can be rewritten to the fully-qualified `[[filename#Section]]` (and a Markdown TOC link `[Tasks](#tasks)` → `[Tasks](note-name#tasks)`).
- **Gap 4 — block-id stability.** `[[Note#^id]]` survives a *file* rename, but deleting/retyping the `^id` marker dangles the link with no heal (§3).
- **Delete uses trash.** `FileManager.trashFile` / `Vault.trash` route deletions to the system/vault trash rather than a hard unlink.

## 11. Frontmatter shown as Properties (the answer to "I hate seeing raw frontmatter")

Obsidian's entire answer to the owner's complaint is **Properties**: the same YAML is *parsed and re-rendered* as a typed, keyboard-navigable card at the top of the note, so you edit widgets — never raw YAML — while the bytes on disk stay ordinary frontmatter. (The *sidebar* File-properties / All-properties panels are in `reference/13 §6`; this is the *in-document widget + data model* underneath.)

- **One frontmatter block, three renderings.** The bytes are always a single leading YAML block delimited by `---`…`---` at the very top (a `---` further down is a horizontal rule). Only that leading block is Properties, and nothing about the widget changes the on-disk format. In **Live Preview** and **Reading view** it renders as a compact card of `[type-icon] [key] : [typed value editor]` rows with an "Add property" affordance and a fold toggle; the `---`, `key:` syntax, list hyphens, and quoting all vanish. Only **Source mode** reveals the literal YAML — which is exactly what Coal shows today.
- **The one setting: Settings → Editor → `Properties in document`**, three-way: **Visible** (default — render the widget), **Hidden** (suppress the in-document widget; edit only via the sidebar), **Source** (show raw `---` YAML inline). This is a global editor pref, distinct from the note-level Live-Preview↔Source mode toggle. **Reading view** renders the same card read-only (chips/links/checkbox state).
- **Six value types + one special.** The type controls the *widget*, not the stored value: **Text** (single line, **no markdown rendering** inside), **List** (removable chips), **Number** (a literal number, not an expression), **Checkbox** (YAML `true`/`false`), **Date** (`YYYY-MM-DD`, date-picker), **Date & time** (ISO-8601 `YYYY-MM-DDTHH:MM:SS`, date+time picker), and **Tags** (special, `tags` key only — clickable chips feeding the tag index). Change a property's type by clicking the small **type-icon left of the key**. Explicit non-support: markdown inside values isn't rendered; **nested/dotted properties are "view in source mode only"**; there is no built-in bulk edit.
- **CRITICAL — the type is NOT stored in the note's YAML.** Explicit type assignments live in a hidden **vault-wide `<vault>/.obsidian/types.json`** mapping each **property key → exactly one type**, e.g. `{ "types": { "pages": "number", "date": "date" } }`. There is **no notion of "note types"** — one global namespace, at most one type per key vault-wide (so `pages`-as-number and `pages`-as-list collide and one is flagged). Unassigned keys have their type **inferred** from the value at read time. Type ≠ value: a mismatch is *warned*, never auto-corrected, and changing a type rewrites no files.
- **Built-in list properties: `tags`, `aliases`, `cssclasses`** (singular `tag`/`alias`/`cssclass` were replaced in 1.4, dropped in 1.9). `tags` written **without** the leading `#`, merging with inline tags (§13); `aliases` are first-class match targets in the switcher/`[[` autocomplete (§7); `cssclasses` apply CSS classes to the note's view container.
- **Keys are case-sensitive under the hood** — `Status` and `status` are two distinct properties, each its own `types.json` entry; Obsidian does **not** auto-lowercase or merge them (well-supported by forum reports, not spelled out in official docs). Spaces are allowed but discouraged; a duplicate key within one note is invalid YAML and flagged.
- **Adding/editing keyboard model** (relevant to a keyboard-first editor): add via the "Add file property" command, `Cmd/Ctrl+;`, the ⋯ menu, or typing `---` at file top. Inside the widget: Down/Tab next, Up/Shift+Tab previous, **Alt+Down jump into the editor body**, Left edit key, Right edit value, Escape re-focus the row, `Cmd/Ctrl+Backspace` delete the row — plus a full Vim grammar (`j`/`k`/`h`/`l`/`A`/`i`/`o`). Obsidian treats the card as a first-class focusable region with its own keymap.
- **Write-back — and the byte-for-byte trap.** Editing a field mutates the in-memory frontmatter object and Obsidian **re-serializes the whole leading YAML block**. The plugin primitive is:
  ```typescript
  processFrontMatter(file: TFile, fn: (frontmatter: any) => void, options?: DataWriteOptions): Promise<void>
  // "Atomically read, modify, and save the frontmatter of a note." (app.fileManager)
  ```
  Because it round-trips through a YAML object, the write is **NOT byte-preserving** — it can rewrite an inline flow list `[a, b]` into block style, add/remove quotes, reorder, and **strip YAML comments**. When you type an internal link into a text/list property Obsidian auto-adds the surrounding quotes (`"[[Note]]"`). **This is the one place Coal must *diverge* from Obsidian** (§14 forbids reflow of untouched bytes): a Coal Properties widget must edit only the touched key's bytes (or use a frontmatter-aware writer that preserves untouched lines/order/whitespace), not re-emit the block. `FrontMatterCache` is just `{ [key: string]: any }` — an untyped bag; the type lives in `types.json`, and a `"[[…]]"` value surfaces as a `FrontmatterLinkCache` (§6), resolving through the *same* linkpath machinery as body links.

## 12. Embeds / transclusion (`![[ ]]`)

- **An embed is a link with a `!` prefix** — every link target form has an embed twin, cached in a **separate** `embeds: EmbedCache[]` array (same `ReferenceCache` shape as `LinkCache`), sharing one linkpath parser and the same resolver (`getFirstLinkpathDest` + `resolveSubpath`).
- **Forms:** whole note `![[Internal links]]`; heading section `![[Note#Heading]]` (renders that heading down to the next equal-or-higher heading) or nested `![[Note#H1#H2]]`; single block `![[Note#^b15695]]`; list-item block (add `^id` to the item, then `![[Note#^my-list-id]]`).
- **Image sizing — the pipe carries *dimensions*, not an alias.** `![[Engelbart.jpg]]` native size; `![[Engelbart.jpg|100]]` = width 100px, height proportional; `![[Engelbart.jpg|100x145]]` = width×height. External images reuse the alt-text slot: `![250](https://…/image.jpg)` or `![alt|100x145](url)`.
- **PDF subpath params:** `![[Document.pdf]]`, page `![[Document.pdf#page=3]]` (1-based), viewport height `![[Document.pdf#height=400]]` (px) — distinct from heading/block subpaths.
- **Audio/video/canvas:** `![[Excerpt.ogg]]` (player), `![[clip.mp4]]` (player, codec-dependent), `![[My canvas.canvas]]` (shapes only). Accepted embeddable formats: `.md`, `.base`, `.canvas`; images `.avif .bmp .gif .jpeg .jpg .png .svg .webp`; audio `.flac .m4a .mp3 .ogg .wav .webm .3gp`; video `.mkv .mov .mp4 .ogv .webm`; `.pdf`. (Embedded *search results* are a fenced code block with the language `query`, **not** an `![[ ]]` embed — a different mechanism entirely.)
- **Recursion / self-embed loops — the sharp edge.** A note embedding itself, or a mutual A↔B cycle, is a transclusion loop. Live Preview / Reading view bound this with a **shallow embed-depth cap** (users request deeper nesting, confirming the cap is real; the exact depth is undocumented). The historical failure was *export* code paths (PDF export could freeze) that re-expanded without the editor's guard. The **community-standard fix**, which Coal should adopt if it ships transclusion: when a note would be embedded inside itself at any depth, **degrade the embed to a plain link** to break the cycle.

## 13. Tags as a separate index

The conceptual core, and the thing most easily gotten wrong: **in Obsidian a tag is not a link, and it lives in a different part of the cache with different semantics.**

- **Syntax.** Inline: `#` immediately followed by a keyword, no space (`#meeting`) — a space makes it a Markdown heading, which is why inline tags are *not* CommonMark. Nested via forward slashes (`#inbox/to-read`); searching a parent matches descendants. Frontmatter: the `tags` property as a YAML list written **without** the `#`.
- **Rules.** Allowed chars: letters, numbers, `_`, `-`, `/`, plus commonly-accepted Unicode/emoji. **Must contain at least one non-numeric char** (`#1984` invalid, `#y1984` valid). **Case-insensitive** for matching (`#tag` ≡ `#TAG`); the Tags view preserves first-seen casing for display.
- **Separate cache arrays.** Inline tags → `CachedMetadata.tags: TagCache[]` where `tag` **includes the leading `#`**. Frontmatter tags are **not** in `tags` at all — they live in `frontmatter` (which, unlike other cache items, does not extend `CacheItem`). The merge helper `getAllTags(cache): string[] | null` combines both (with `#`); `parseFrontMatterTags(cache.frontmatter)` returns only the frontmatter set.
- **Tags are absent from the link graph.** `resolvedLinks`/`unresolvedLinks` contain **only** note→note link edges; a tag contributes nothing. **Links are directed 1:1 note→note edges; tags are many-notes→one-label groupings** — two orthogonal relation systems sharing the `#`/`[[` sigil space. In the graph view a tag can *optionally* become its own node class (Filters → Tags, `--graph-node-tag`), but that is synthesized at render time, never stored in `resolvedLinks`.
- **Consequence:** renaming a note updates links but never touches tags; adding a tag never creates a backlink. Keep them separate indexes.

## 14. The portability tension

- **Obsidian Flavored Markdown is a layered superset, not a fork:** CommonMark (baseline) + GFM (tables, task lists, strikethrough, autolinks, footnotes) + LaTeX via MathJax — all portable — with wiki-markup layered on top. The **non-portable extensions**: `[[Link]]`, `![[Link]]`, `![[Link#^id]]`, `^id` block markers, `%%comment%%`, `==highlight==`, `> [!callout]`, and space-less `#tag`.
- **What another tool sees.** Files stay byte-intact UTF-8 (no data loss, only *rendering* loss). `[[Note]]` renders as literal double brackets everywhere else; `![[Note]]` as a literal `!` plus brackets. **`^blockid` markers are the least portable feature of all** — any `[[Note#^id]]` is meaningless elsewhere, and the trailing `^id` shows as **visible literal caret-text at the end of the line**. `%%comment%%` is a *hazard*: Obsidian hides it, other tools render it, so "hidden" notes-to-self leak.
- **Obsidian's mitigation** is that its wikilinks are **human-readable** — `[[Atomic Habits]]` still tells a human (and a heuristic converter) what it targets even as literal brackets — and it can turn wikilinks off to emit `[text](file.md)`. Block refs/embeds have no portable equivalent (a "Link Converter" plugin batch-rewrites wikilinks).
- **The Coal-specific twist — UUID targets are *doubly* opaque.** Coal's `[[uuid]]` and per-block `^id:<uuid>` throw away Obsidian's one saving grace. In any other tool a Coal note is a wall of `[[9f8c1e2a-…]]` and `^id:3b7f…` that is (a) non-CommonMark *and* (b) semantically opaque — no reader or converter can recover the title without Coal's index. And where Obsidian's `^blockid` is optional and 6 chars, Coal stamps a **36-char UUID on every block**, so the "visible literal caret-text at end of line" failure mode is present on *every block of every note*. This is the central cost the redesign must weigh: the UUID scheme maximizes rename-stability and referential integrity *inside* Coal at the price of near-total human-readability *outside* it. The design mitigation is to always carry a human alias alongside the UUID (`[[uuid|Title]]`) and to reconsider whether *block* ids must be mandatory 36-char UUIDs at all.

## 15. Relevance to Coal's link redesign

Coal already owns the *heavier* half of this system (SPEC §8/§9/§14): a note `id:` in frontmatter, an `^id:<uuid>` on **every** block (minted eagerly on first edit, hidden by a CM6 decoration, paste-re-minted), and a grammar `[[uuid]]` / `[[uuid#blockid]]` / `[[uuid|alias]]`. The redesign is not about inventing identity — it is about building the *addressing, resolution, index, and rendering* layers Obsidian has and Coal lacks. Mapping the owner's four pain points:

**(a) Block IDs exist but can't be linked to/from.**
- *Obsidian's solution:* a caret-discriminated subpath grammar (`#^id` = block, `#text` = heading), a `resolveSubpath` that returns a concrete `{start,end}` range, and a block picker in the `[[` suggester that mints-and-inserts.
- *Design lever for Coal:* **adopt the `#^` caret discriminator** — `[[uuid#^blockid]]` for blocks, `[[uuid#Heading]]` for heading text — so Coal's current ambiguous `[[uuid#blockid]]` (no signal for "block id" vs "heading text") is disambiguated for free, in a format users already know. Build a two-stage resolver mirroring `getFirstLinkpathDest` + `resolveSubpath`: **uuid → note is a single `Map<uuid, notePath>` lookup** (no shortest-path/case/ambiguity heuristics — Coal's UUIDs delete all of §5's guessing), then `#^blockid` → the block's `^id:<uuid>` position, `#Heading` → a heading offset (reuse `outline.ts` `parseHeadings`). Return a `{start,end}` (via `Loc.offset`) that a `EditorView.dispatch({selection, scrollIntoView})` consumes. Extend the suggester with `#`/`#^` stages that re-query the target note's heading/block lists — and note the **strict advantage**: because every block/heading already carries an `^id:`, Stage 3 needs **no cross-file mint-on-link write** (Obsidian's surprise side effect). Coal can also offer *real* referential integrity Obsidian can't: because the index is rebuildable, surface a dangling `[[uuid#^blockid]]` when its marker is deleted instead of letting it rot silently.

**(b) Backlinks panel non-functional.**
- *Obsidian's solution:* backlinks are *computed*, not stored — `getBacklinksForFile` reverse-scans every file's forward links (O(N)) against `resolvedLinks`, split into **Linked** and **Unlinked mentions** with context snippets.
- *Design lever for Coal:* build the `resolvedLinks`/`unresolvedLinks` pair (keyed by target **uuid**), then **invert `resolvedLinks` *once* into a reverse index** keyed by target uuid — don't repeat Obsidian's O(N) per-call scan. Each backlink entry carries the source note plus the reference's `original` + `Pos` for a highlighted one-line context snippet. Because Coal links are UUID-based, **"unlinked mentions" must match on the note's title/alias text** (users never see the uuid), surfaced as a *separate* group with a keyboard "promote to `[[uuid|alias]]`" action that inserts the uuid byte-for-byte (§14). The linked side is a pure uuid join. (Panel housing/UX: `reference/13 §6`.)

**(c) No note/block index.**
- *Obsidian's solution:* one derived, rebuildable `MetadataCache` (§6) feeding every surface through four events, persisted out-of-vault in IndexedDB, regenerable via "Rebuild cache."
- *Design lever for Coal:* build a **single reactive note-index module** modeled on `CachedMetadata` — per note: `links`, `embeds` (if adopted), `headings`, `blocks` (block-uuid → position), `sections`/`listItems` (carrying block **type**, which Obsidian keeps separately and Coal will want to enforce referenceability and render embeds), `frontmatter`, `frontmatterLinks`; plus the vault-wide `resolvedLinks`/`unresolvedLinks` edge maps and the inverted backlinks index. Every item carries a `Pos`/`Loc`-style **absolute offset** (byte-exact, §14-compatible) and the `Reference` split (`original` raw bytes / `link` uuid / `displayText?` alias) so a rename/promote/insert rewrites the exact `original` span without reflow. Emit Coal-local `changed`/`resolve`/`resolved` events so the file tree, backlinks, outline, and any future graph *subscribe* rather than re-parse — preserving the SPEC §10 "delete the index, rebuild from `.md`" litmus. Persist it **git-ignored** (a file under `.coal/` or app `userData`), never committed. Note there is **no `fileToLinktext` analog by design**: Obsidian must compute link *text* because its link *is* a path; Coal stores the uuid and renders the title via decoration — keep that separation (it is Coal's core advantage, and why none of §5's `New link format` / duplicate-basename / rename-rewrite machinery needs porting).

**(d) Hates seeing raw frontmatter.**
- *Obsidian's solution:* the in-document **Properties widget** (§11) — the leading YAML rendered as a typed card, gated by the Visible/Hidden/Source pref, with types held out-of-band in `types.json`.
- *Design lever for Coal:* this is a pure decoration/widget problem on the substrate Coal *already* has — a real `@lezer/markdown` `Frontmatter` node (v0.35.0), a `sourceMode` StateField whose decoration builders early-return (v0.26.0), and `parseFrontmatterProps` + EAV tables (v0.18.0). Add a **`Frontmatter`-node → widget decoration** in Live Preview (using `frontmatterPosition`'s analog — the node's `{start,end}` — to know the range to replace), gated by an app-global `Properties in document` pref with the same three values, and — given this is the owner's headline complaint — **make Visible the default** (unlike Coal's current always-raw rendering). Keep **type metadata in a derived, git-ignored registry** (a `types.json` analog, or the existing `objectTypes` EAV tables) — never smuggled into note YAML, so SPEC §10 holds. **Diverge from Obsidian on writes:** do *not* re-serialize the whole block (Obsidian's `processFrontMatter` normalizes flow-lists/quotes and strips comments) — edit only the touched key's bytes to honor §14. And **hide or lock Coal's reserved keys** (`id`, `x-coal.*`) from the editable widget, or the owner trades "ugly YAML" for "an editable UUID field," which is worse. Mirror Obsidian's type vocabulary (Text/List/Number/Checkbox/Date/Date-&-time) and the widget keymap (but Emacs-native: roving focus, `C-n`/`C-p`, a jump-to-body binding) so the muscle memory transfers. Also index `[[uuid]]` values *inside* properties as a `FrontmatterLinkCache` analog (keyed by property key, no position) — SPEC §9 already mandates "links & typed-object relations share one grammar," and without this, property relations silently vanish from backlinks.

**One cross-cutting caution.** Don't reintroduce what the UUID model deletes: the `New link format` matrix, duplicate-basename tie-breaks, "settings only apply to new links," file-rename link rewriting, and the URL-encoding/angle-bracket ambiguity all exist *only* because Obsidian's target is a path. Their absence is the payoff of Coal's design — and Coal can *close* Obsidian's gaps (heading-rename breakage, block-ref rot, non-functional backlinks) precisely because identity is a stable uuid and the index is rebuildable. Keep the *display grammar* (`[[uuid|alias]]`, `#`/`#^` subpaths, `!` embeds, alias rows) so users speak Obsidian's vocabulary; keep the *storage* uuid-based.

---

## Sources

**Developer API (docs.obsidian.md / obsidian.d.ts):**
- MetadataCache — https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache
- getFirstLinkpathDest — https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getFirstLinkpathDest
- fileToLinktext — https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/fileToLinktext
- CachedMetadata — https://docs.obsidian.md/Reference/TypeScript+API/CachedMetadata
- Reference / ReferenceCache / CacheItem — https://docs.obsidian.md/Reference/TypeScript+API/Reference · https://docs.obsidian.md/Reference/TypeScript+API/ReferenceCache · https://docs.obsidian.md/Reference/TypeScript+API/CacheItem
- LinkCache / EmbedCache — https://docs.obsidian.md/Reference/TypeScript+API/LinkCache · https://docs.obsidian.md/Reference/TypeScript+API/EmbedCache
- TagCache — https://docs.obsidian.md/Reference/TypeScript+API/TagCache
- HeadingCache / BlockCache / SectionCache / ListItemCache — https://docs.obsidian.md/Reference/TypeScript+API/HeadingCache · https://docs.obsidian.md/Reference/TypeScript+API/BlockCache · https://docs.obsidian.md/Reference/TypeScript+API/SectionCache · https://docs.obsidian.md/Reference/TypeScript+API/ListItemCache
- FrontMatterCache / FrontmatterLinkCache — https://docs.obsidian.md/Reference/TypeScript+API/FrontMatterCache · https://docs.obsidian.md/Reference/TypeScript+API/FrontmatterLinkCache
- Pos / Loc — https://docs.obsidian.md/Reference/TypeScript+API/Pos · https://docs.obsidian.md/Reference/TypeScript+API/Loc
- resolveSubpath / BlockSubpathResult / HeadingSubpathResult — https://docs.obsidian.md/Reference/TypeScript+API/resolveSubpath · https://docs.obsidian.md/Reference/TypeScript+API/BlockSubpathResult · https://docs.obsidian.md/Reference/TypeScript+API/HeadingSubpathResult
- FileManager (renameFile / generateMarkdownLink / processFrontMatter / trashFile) — https://docs.obsidian.md/Reference/TypeScript+API/FileManager · https://docs.obsidian.md/Reference/TypeScript+API/FileManager/generateMarkdownLink · https://docs.obsidian.md/Reference/TypeScript+API/FileManager/processFrontMatter
- CSS variables → Editor → Link (unresolved-link tokens) — https://docs.obsidian.md/Reference/CSS+variables/Editor/Link
- Canonical type declarations (obsidian.d.ts) — https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts

**User help (help.obsidian.md / obsidian.md/help):**
- Internal links — https://help.obsidian.md/links (repo source: https://github.com/obsidianmd/obsidian-help/blob/master/en/Linking%20notes%20and%20files/Internal%20links.md)
- Aliases — https://help.obsidian.md/aliases
- Embed files — https://help.obsidian.md/embeds
- Tags — https://help.obsidian.md/tags
- Properties — https://help.obsidian.md/properties
- Accepted file formats — https://help.obsidian.md/file-formats
- Basic formatting syntax (angle-bracket / %20 destinations) — https://obsidian.md/help/syntax
- Obsidian Flavored Markdown — https://help.obsidian.md/obsidian-flavored-markdown
- How Obsidian stores data (metadata cache / IndexedDB / Rebuild cache) — https://obsidian.md/help/data-storage

**Forum (forum.obsidian.md) — exact behaviors:**
- New link format / "Shortest path when possible" — https://forum.obsidian.md/t/settings-new-link-format-what-is-shortest-path-when-possible/6748 · https://forum.obsidian.md/t/start-absolute-path-path-from-vault-folder-with-a-leading-slash/32501 · https://forum.obsidian.md/t/scalable-alternative-for-shortest-path-when-possible/31958
- Setting only affects new links — https://forum.obsidian.md/t/convert-all-obsidian-links-to-a-common-link-format/5709
- Block-ID generation / undocumented / non-Latin unsupported — https://forum.obsidian.md/t/block-reference-id-generation-question/7669 · https://forum.obsidian.md/t/theres-nothing-on-help-obsidian-md-describing-block-ids-and-references/54396 · https://forum.obsidian.md/t/support-for-special-characters-on-block-id/7320
- Duplicate same-name headings resolve to first — https://forum.obsidian.md/t/with-2-headings-of-same-name-in-file-can-only-link-to-first-one/74574
- Block-selection popup lists only a subset — https://forum.obsidian.md/t/is-there-a-limit-to-the-number-of-blocks-you-can-see-via-name-caret-popup/32925
- Angle-bracket Markdown destinations — https://forum.obsidian.md/t/what-is-the-status-of-meaning-of-angle-brackets-in-link-targets/109497
- Automatically-update-internal-links behavior / same-note rewrite — https://forum.obsidian.md/t/internal-link-not-updated-automatically-when-moving-note-to-a-different-directory/13939 · https://forum.obsidian.md/t/keep-links-to-headers-in-the-same-file-when-automatically-update-internal-links-is-set-to-on/12716
- Heading rename does not auto-update links — https://forum.obsidian.md/t/automatically-update-links-to-headers-when-these-are-renamed/61942 · https://forum.obsidian.md/t/mini-plugin-update-internal-links-when-renaming-a-heading/86850
- Relative-mode outbound-link gap on move — https://forum.obsidian.md/t/broken-links-in-relative-path-mode-on-move-rename/4386
- Recursive self-embed loop / PDF-export freeze — https://forum.obsidian.md/t/export-pdf-causes-infinite-loop-if-there-are-recursive-note-embeds/16307 · https://forum.obsidian.md/t/transclude-embed-to-2-levels/2047
- Wikilinks vs CommonMark portability — https://forum.obsidian.md/t/how-can-i-make-obsidian-to-use-commonmark-links-specification-by-default-rather-than-wikilink/67565
- Property key case-sensitivity — https://forum.obsidian.md/t/bases-does-not-recognise-duplicate-properties-case-sensitivity/105413

**Third-party (behavior / plugins / guides):**
- Better Markdown Links plugin (angle-bracket destinations) — https://github.com/mnaoumov/obsidian-better-markdown-links
- Update Relative Links plugin (outbound-link gap) — https://github.com/val3344/obsidian-update-relative-links
- obsidian-export (degrade self-embed to link) — https://github.com/zoni/obsidian-export
- The Complete Guide to Obsidian Properties (`types.json`) — https://www.dsebastien.net/the-complete-guide-to-obsidian-properties/
- Obsidian portability (Karl Voit) — https://karl-voit.at/2026/04/08/obsidian-md-portability/

**Cross-references (do not duplicate):** `reference/13-obsidian-how-ui-ux.md §6` (backlinks/outline/properties/graph panels + `MetadataCache` events at the UI level, `EditorSuggest` in §4) · `reference/02-obsidian.md §5` (high-level linking overview).
