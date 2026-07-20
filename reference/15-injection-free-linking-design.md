# Injection-free linking — design brief ("Cairn/Ensemble")

**What this is.** The output of a red-teamed design exploration for a new **founding principle**: *the note file is 100% the user's bytes — plain standard Markdown any editor parses cleanly — and Coal writes NOTHING into it (no frontmatter `id:`, no inline `^id:<uuid>`, no reformatting, no rename-rewrites). All identity, links, and backlinks are a pure, rebuildable function of the notes themselves.* This **abolishes** the current identity core (SPEC §7/§8, and rewrites §9/§14) and **strengthens** §10 (the index is now the *only* place derivation may live).

**Status: a proposal with unresolved owner decisions, not a ratified spec.** Six independent architectures were generated, each adversarially red-teamed against the full hard-case matrix (edit-minor/major, move-block within/across notes, reorder, duplicate-identical blocks, file-rename/move, retitle, delete, merge/split, rebuild-from-notes-alone, portability, same-title notes), scored, and synthesized. The recommendation is below; the **11 decision forks (§7)** and the **honest residual costs (§6)** are what the owner must weigh — including, squarely, whether the cost of zero-injection is worth it versus adopting Obsidian (whose notes are *already* nearly injection-free).

**One-line honest summary.** Injection-free linking is achievable and mostly durable, but it trades a guarantee for a probability: an injected UUID was O(1)-*certain*; a content-derived anchor is a *confidence-scored re-resolution*. The design's job is to make that trade **honest** — never silently point at the wrong thing — at the cost of some recall and some new failure modes that UUIDs didn't have.

---

## 1. The core reframing

Identity stops being a **token you store** and becomes a **pure function of the corpus**: a link carries a human-readable *pointer expression*; the index computes `resolve(expression, notes[, git]) → {target, confidence, status}`. Durability = the robustness of that function. Two realizations shrink the problem:

- **Heading links already obey the principle.** `[[Note#Heading]]` injects nothing and re-resolves by matching heading text. So the *entire* hard problem is **naming a non-heading block (paragraph, list item) without marking it.**
- **The reference lives in the SOURCE note** (a link the user authors). So the anchor's disambiguating data can live in the *source* bytes — but rendered cleanly by Coal's live-preview and kept human-readable, never an opaque token.

## 2. Recommended design — "Cairn/Ensemble"

Backbone = the **ensemble-confidence** architecture (red-team score **71**, highest), with five grafts that fix its two fatal flaws.

**Backbone — two load-bearing mechanisms:**
1. **Joint (note, block)-pair ranking** with an epsilon-floor kept on *every* note. Instead of resolving the note first and the block second, the resolver scores `(note, block)` *pairs* across the whole vault — so a strong content match on the quoted block can **rescue a note whose frontmatter title, H1, AND filename all changed at once.** This is the one genuinely hard part of injection-free linking (decoupling durability from any single stable name), and no name-first/path-first design can do it.
2. **The top1-vs-top2 margin test** (`S1 − S2 ≥ threshold`) is the honest-degradation engine: any near-tie is *structurally forced* into a surfaced picker, never a silent coin-flip.

**The five grafts (each fixes a red-teamed hole):**
- **A — Redundancy lives in the LINK, corroboration is mandatory** *(from content-chunking).* Always store bounded W3C **prefix + exact + suffix** context in the reference bytes (not "only when needed at author time" — that can't survive duplicates that appear *later*; not "only in the disposable index" — that describes today's blocks, not the author's target). And make block/heading resolution a **mandatory bidirectional corroborator** of the note match: a confident note-name hit whose block-check fails is *downgraded*, and a strong block match validates *which* same-title note was meant. This single mechanism kills the two "silent mis-resolve" holes (title/path reuse; delete-with-same-title).
- **B — Re-gate the silent band** *(the disqualifying-flaw fix).* Auto-resolve (silent navigation) fires **only** when the block matches by **exact quote** that is **vault-wide unique** (IDF-rare, not merely note-unique), with margin ≥ threshold and no delete-veto; **or** the note is path-resolved and the block is an exact, note-unique match whose stored prefix/suffix agree. **Any exact-miss that falls to fuzzy (simhash/Bitap) NEVER auto-follows** — it is always surfaced as "drifted → confirm." This costs recall (a heavily-edited block won't silently self-heal) — the honest price of zero injection.
- **C — The Landmark** *(from blue-sky).* Generalize the injection-free heading link *down one level*: when a block leads with a natural human label — a bold lead-in (`**Ownership.**`), a definition term, an emphasized first clause — **that prose IS the anchor.** Autocomplete mints the shortest *distinctive* landmark (seeded on the block's rarest trigram, grown to be unique within its heading-section → note → vault), and **warns at author time** when no unique landmark exists (single words, `TODO`, `- [ ]` cannot anchor) rather than handing back a born-fragile link.
- **D — The honesty budget** *(from structural-path).* Confidence is a first-class, always-visible property with an **evidence breadcrumb** ("note ✓ · heading ✓ · block ✗→quote"). **Coal never auto-rewrites a source note to self-heal a link (that would be injection).** Repair is human and explicit: `M-x links-audit` (vault linter: Resolved / Needs-attention / Broken), `M-x resolve-report` (evidence for the link at point), `M-x re-anchor-link-at-point` (recompute a fresh minimal-unique selector from the *current* target and rewrite *this* link — a user keystroke), `M-x list-broken-links`. The heading breadcrumb doubles as a search-narrowing scope (correctness + the primary perf mitigation).
- **E — Git is demoted to an optional, non-authoritative corroborator** *(the lesson from git-genealogy's failure).* The authoritative answer is the deterministic **notes-alone** result. Git can only *upgrade* a surfaced "moved?" suggestion to "moved (git-corroborated)"; it never flips a dangling into a silent auto-resolve. Grounded corrections: use `git log -G` **not** `-S` for the move signal (a single debounced-save cut-paste is net-zero occurrence change, invisible to `-S`); `-M`/`-C` have 20/40 alnum-char floors (short anchors are invisible to git); git-only answers are marked **non-reproducible** (two clones can differ).

**Note identity** = the pair `{vault-relative path, human title}` used *redundantly*, plus the joint-pair block rescue. Title = existing `resolveTitle()` order (user-typed `title:` → first `# H1` → filename stem), never injected. **Drop the UUID filename suffix → human slugs** (paths must be portable too).

**Block identity** = *emergent*: the argmax of the scored search over the target's **current bytes**, anchored by the landmark quote + carried context + section scope + block type. Never a marker; nothing is ever written into the target.

**Three resolution bands:**
- **RESOLVED** (silent) — exact + vault-unique + margin + no delete-veto → navigate + centre caret.
- **CONFIRM** (amber) — *any* fuzzy match / margin-fail / same-title tie / git-only "moved?" → keyboard-first vertico picker with ranked candidates, confidence %, evidence breadcrumb. **Never auto-follows.**
- **DANGLING/DELETED** (red) — no exact match, fuzzy below the high bar → detected-broken, shows last-known quote (and, with git, "deleted in commit …"). **Never re-points.**

**§10 litmus holds by construction:** the index is a pure function of `{path, content}(+optional git)`. Wipe `.coal/index/` → rescan → identical graph. Wipe `.git` too → still correct, losing only cross-file-move corroboration and history tiebreaks (reduced, never wrong).

## 3. The link grammar

Keep the keyboard-first `[[ ]]` shell (reuse the existing parser + decoration). The `>` connector and quotes are literal, readable prose:

```
wikilink    = "[[" target ("#" headingpath)? blockanchor? ("|" alias)? "]]"
target      = title | vault-relative-path            ; "Design Notes"  or  "notes/design.md"
headingpath = heading ("#" heading)*                 ; nested ATX text:  #Resolution#Block layer
blockanchor = WS ">" WS '"' exact '"' context?       ; the landmark quote (authoritative)
context     = ('after:' '"' prefix '"')? ('before:' '"' suffix '"')?   ; bounded W3C context, dup-only
```

Concrete forms a vim reader understands at a glance:
1. `[[Design Notes]]` — whole note (by title)
2. `[[notes/design.md]]` — whole note (by path)
3. `[[Design Notes#Resolution]]` — heading (injection-free, Obsidian-native)
4. `[[Design Notes#Resolution#Block layer]]` — nested heading path
5. `[[Design Notes#Resolution > "walks git history forward"]]` — block by landmark, section-scoped (default)
6. `[[Design Notes > "walks git history forward"]]` — block by landmark, note-scoped
7. `[[Tasks#Today > "done" after:"shipped the beta" before:"on Tuesday"]]` — duplicate disambiguated by carried context
8. `[[Design Notes#Resolution > "walks git history forward" | the resolver]]` — alias display
9. Export/interop (`M-x export-portable-link`), CommonMark Text-Fragment: `[the resolver](notes/design.md#:~:text=walks%20git%20history%20forward)`

**Rendering:** the raw bytes always carry the bounded context (Graft A), but Coal's live-preview renders only the resolved title + clean landmark and **hides the context off the cursor line** (exactly as it already hides `[text](url)` URLs and the old `^id:`). So readability inside Coal is pristine; in vim/GitHub the link is verbose-but-plain prose, never an opaque token. **No UUID ever appears.**

**Honest portability (do not oversell):** forms 1–3 render as readable text everywhere and open the right note in Obsidian *only when filename == title* (Obsidian resolves by filename, not H1/frontmatter title). The quote form is inert-but-readable outside Coal. Form 9's `#:~:text=` navigates only *rendered HTML* in Chromium/Safari (never raw `.md`, GitHub blob, or Obsidian). **Portability of meaning and of the files is total; portability of block-precise navigation is Coal-only.**

## 4. How each owner pain is solved

- **Block refs (name a non-heading block without marking it):** a landmark quote + carried W3C context, written into the source link, resolved at read-time as the argmax of the joint `(note, block)` ensemble score; the heading breadcrumb scopes the search. Un-anchorable blocks are *warned at author time* and *surfaced as ambiguous at resolve time* — never silently picked.
- **Backlinks:** a derived reverse projection of the *resolved* forward edges (same derive-once discipline as today's `store.ts`), each edge carrying `{targetPath, blockRange, confidence, status}`, grouped Resolved / Needs-attention / Broken. Keyed by per-note content-hash so a save invalidates only touched notes.
- **Index:** one disposable, git-ignored artifact under `.coal/index/` — a pure function of `{path, content}(+optional git)`: pathIndex, titleIndex (collisions detected, not hidden), per-block fingerprints (normText, landmark, exact/prefix/suffix, 64-bit simhash, structural path, shingles), a shingle→block inverted map, a simhash-LSH table for bounded fuzzy candidate-gen, and the resolved graph.
- **No-frontmatter (the whole point):** frontmatter `id:`, `x-coal.version`, and inline `^id:` are abolished; the target file is byte-identical to what any plain editor produces. The durability-redundancy lives in the *source link's own bytes*, never in the target and never in the disposable index alone.

## 5. The six approaches explored (scoreboard)

| Score | Seed | Verdict |
|---|---|---|
| **71** | **ensemble-confidence** | **BACKBONE** — joint (note,block)-pair ranking + margin test are the only mechanisms that decouple durability from a single name and force honest choices; both fatal flaws cleanly fixable by grafts. |
| 63 | quote-anchor ("Seam") | Cleanest "selector-in-referrer" framing + confidence-as-UI; but oversells Text-Fragment nav portability and silently narrates "MOVED" on delete. Graft the framing + explicit re-anchor command. |
| 60 | content-chunking | Supplies the two key SAFETY grafts (always-store full W3C context; mandatory bidirectional corroboration). CDC/rolling-hash itself is a self-admitted red herring for short prose. |
| 58 | blue-sky ("Cairn/landmark") | Best anchor-QUALITY idea (the **landmark** — generalize the heading link into a content phrase) + honest-degradation UX; its redundancy wrongly sat in the disposable index and it leaned on flaky git. |
| 57 | structural-path | The **discipline** is the gem (visible confidence, evidence breadcrumb, never auto-rewrite, links-audit linter); the structure-only `::p2` mode is confidently-wrong on reorder/move and regresses on retitle. |
| 57 | git-genealogy ("Ariadne") | The literal human prose quote is the keeper; the git engine is technically non-functional on Coal's dense-commit model (unrecoverable authoring commit, `-S` blind to net-zero moves, `-M`/`-C` char floors). Graft the quote, drop the engine. |

The recurring fatal flaw across the field (and why the backbone's grafts matter): **every seed risked silently mis-resolving a *deleted* block whose text coincidentally appears elsewhere** — the exact thing the founding principle forbids. Grafts A + B convert that into surfaced honest degradation.

## 6. Residual risks — the honest costs of zero injection

These are the real price. Weigh them directly against "just use Obsidian."

1. **Duplicate-identical blocks in identical context, no git, are irreducibly unresolvable** to a single target — the hard floor of zero-injection. Surfaced as ambiguous (forced picker), never a coin-flip, but *permanently annoying* in templated/boilerplate/daily-note vaults. A UUID was O(1)-exact here; we cannot match that.
2. **Ship-of-Theseus / anchor decay:** a paragraph edited across many small sessions over years cumulatively diverges from its author-time landmark and drifts toward "drifted/broken" even though it is continuously the *same* block. Auto-refreshing the quote is (correctly) forbidden as injection, and most users never run `re-anchor`, so the live-target graph slowly rots. Mitigated only by the visible linter, not eliminated.
3. **Whole-note links to a note that is retitled AND file-renamed with `.git` deleted** have no block content to trigger the joint-pair rescue and no surviving name → they dangle (surfaced, correct-but-lost). The abolished `[[uuid]]` handled this for free. **This is the genuine regression the owner buys portability with.**
4. **Confidence calibration is research-grade and is the *whole* safety mechanism.** Too loose → a rare exact quote coincidentally in a second same-title note can, in the silent band, be wrong. Too tight → everything reads "drifted" and users learn to click through the warning (alert fatigue → de-facto silent-wrong). The vault-wide IDF gate + margin + delete-veto bound this but don't prove it away.
5. **Performance:** every visible link is a scored search per reparse, versus the old O(1) UUID hashmap. Short/generic quotes hit the documented Hypothes.is/Bitap pathology. Requires a warm LSH index, section-scoped windows, per-note-hash incremental invalidation, and off-thread async resolution; a large drifted vault still has a perf cliff. *(Note: this class of synchronous cost is a live suspect for the current data-loss/freeze bug — see repo `TODO.md`.)*
6. **Git is weak, non-deterministic, sometimes-stale:** char-count floors, `-S` blindness to net-zero moves, commit-on-save micro-history noise, rebase/gc/shallow-clone breakage; two clones can corroborate differently. Kept strictly non-authoritative, so the "enhanced" answer isn't reproducible across machines.
7. **Portability is readability-only for the block layer** (see §3). Meaning + files fully portable; block-precise *navigation* is Coal-only.
8. **Grammar escaping:** titles/headings/quotes containing `#`, `>`, `|`, `"` need backslash escaping, which leaks into the "human-readable" source; carrying context always (Graft A) makes the raw link verbose.
9. **Migration is a one-way, vault-wide, SPEC-amending event** (see §8).

## 7. Decision forks the owner must settle (with recommendations)

1. **Absolute-no-write vs link self-heal** → **(c)** no automatic write, but user-invoked `re-anchor-link-at-point` / `relink` explicitly rewrite the *source* link on a keystroke. **Also ratify:** autocomplete inserting a *target-derived* landmark into the source at the cursor counts as *authoring* (the user's keystroke) — this is the exact objection that abolished `^id:`, so adjudicate it explicitly.
2. **Anchor readability level** → **(b)** always carry bounded prefix+exact+suffix in the raw bytes, with live-preview hiding context off the cursor line. Accept the verbosity cost in foreign editors as the price of surviving later-appearing duplicates.
3. **Git: dependency or enhancement** → **(b)** optional, non-authoritative corroborator (`-G` for moves); notes-alone is authoritative; git-only answers marked non-reproducible.
4. **Heavy-edit / delete failure UX** → **(b), hard:** never auto-follow a fuzzy match; the silent band requires exact + vault-unique + margin + delete-veto; every exact-miss surfaces. Trades recall for never-silently-wrong. Owner sets the two cut-points per-vault.
5. **Same-title tie-breaking** → **(b)** block-content joint-pair disambiguation first, then a surfaced picker; **never** a silent heuristic pick. Accept **non-monotonicity:** a previously-unique `[[Meeting]]` becomes ambiguous the instant a second "Meeting" is created (surfaced by the linter).
6. **NEW — Note identity primary key** (rename↔retitle tension) → **(c)** name by title + optional path fallback + joint-pair block rescue. Accept that whole-note links to a retitled+renamed+no-git note still dangle.
7. **NEW — A silent auto-resolve band at all?** → **(a)** allow the narrow silent band (exact + vault-unique + margin + delete-veto) to avoid confirm-fatigue on the common case; **(b)** force confirm on everything is the fallback if honesty is weighted over flow. *The knob that most directly trades trust vs friction.*
8. **NEW — Link-syntax family** → **(c)** `[[ ]]` primary (keyboard-first authoring) + `export-portable-link` for the Text-Fragment form, honestly labelled.
9. **NEW — Filename policy** → **(b)** human slugs, numeric-suffix collisions (mandatory for portable paths); offer **(c)** optional "filename == title" Obsidian-interop mode (at the cost of retitle-stability).
10. **NEW — Frozen normalization spec** → ratify one **byte-identical normalizer** shared by the autocomplete minter and the resolver matcher (case / whitespace / Unicode NFC-NFD / smart quotes / markdown-stripping) as a SPEC amendment **before any code**. Over-normalize → duplicates collide; under-normalize → edit-minor breaks. Freeze the point on that dial.
11. **NEW — Migration & SPEC-amendment authorization** → owner must explicitly authorize abolishing §7/§8/§9 + rewriting every `[[uuid]]` + dropping the UUID filename suffix, via a backed-up, dry-run, git-reversible migration. A decision-log event, not a refactor.

## 8. Migration reality

This is not a refactor. It abolishes the frozen SPEC §7/§8/§9 and rewrites §14's naming: strip every `^id:` and frontmatter `id:`, rewrite every `[[uuid]]` link into a landmark/heading form, drop the UUID filename suffix, delete `blocks.ts` minting + `idDecoration.ts` + the note-`id:` writer, freeze the normalizer, bump `x-coal.version`. One-way, vault-wide, `x-coal.version`-bumping. Must be a deliberate SPEC amendment with a dry-run + git-backed reversible pass, not done casually.

## 9. Prior art

W3C Web Annotation Data Model — TextQuoteSelector (prefix/exact/suffix), TextPositionSelector, RangeSelector · Hypothes.is fuzzy anchoring & "orphan" measurement · WICG Text Fragments (`#:~:text=prefix-,exact,-suffix`) · org-mode `[[*Heading]]` / `org-link-search` · Bitap / edit-distance fuzzy matching (32-char pattern ceiling) · simhash / MinHash-LSH near-dup detection · content-defined chunking (FastCDC, rolling hash) — *evaluated and rejected for short prose* · `git log -G`/`-S`, `git log --follow`, `-M`/`-C` rename detection (char floors) · GitHub heading-anchor slugs.

## 10. Where the next session starts

1. **Do not implement yet.** Settle forks §7 (especially #1 authoring-vs-injection, #4 failure UX, #7 silent-band, #10 normalizer) with the owner.
2. **Weigh §6 honestly against Obsidian** — Obsidian notes are already nearly injection-free; the block layer is where Coal would win *and* where the residual costs bite.
3. If green-lit: write the **SPEC amendment** first (revise §7/§8/§9/§14 + migration path + `x-coal.version` bump), then the frozen normalizer, then the resolver + index, then the migration pass — each gated + adversarially-reviewed per the project rhythm.
4. **Cross-reference:** `reference/14-obsidian-linking-system.md` (Obsidian's mechanics — the baseline this departs from), `reference/13 §6` (the panel/index UI layer), and the repo `TODO.md` "UUID/ID-system redesign" reservation this supersedes.
