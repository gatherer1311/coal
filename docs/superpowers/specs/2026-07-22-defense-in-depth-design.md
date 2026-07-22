# Defense-in-depth: Claude + CI as a two-layer quality system — design

Date: 2026-07-22
Status: accepted (design). Implementation is phased — each check activates when the code it guards
lands (see "Phasing"). No calendar dates; activation is triggered by code surfaces.

## Problem

Coal is built by Claude acting as the owner, with GitHub Actions behind it. Those are our two lines
of defense, and today only their skeleton is in place: a working agreement plus local git hooks
(Claude side) and `ci.yml` / `pr-title.yml` / `codeql.yml` / Dependabot gated by the locked-`main`
ruleset (CI side). The goal is to **fully utilize both** — make each layer pull its full weight
across the failure modes that matter for Coal specifically — without wasteful duplication and
without standing up gates for code that does not exist yet.

Four risk areas are all in scope (the owner selected all of them):

1. **Correctness & regressions** — logic bugs in editing / parsing / overlay / data code never reach
   `main`; a safety net strong enough to move fast without breaking things.
2. **Data integrity & crypto** — never corrupt or lose a user's notes; encryption and recovery-key
   correctness.
3. **Security & supply chain** — a public app with plugins and third-party dependencies.
4. **Spec & design conformance** — code provably tracks ratified SPEC decisions; docs stay honest.

## Key context

- Coal is a public, keyboard-first, plain-text, git-backed Markdown/Org editor with **encryption**,
  a **plugin** system, and **Emacs/Vim** keymaps. Its sharp risks are therefore specific: data loss
  / corruption of notes, crypto mistakes, a plugin attack surface, and drift from a design-first
  spec.
- Most of the app is still pre-build. Real code exists only in the `overlay` identity core
  (`src/overlay/`), which already ships property tests (`fast-check`) and conformance tests.
- The repo already establishes a **"pre-stage, wake up when code lands"** pattern: `codeql.yml` is
  dormant behind path filters and starts scanning the first time source arrives. This design
  generalizes that pattern to every expensive check.
- The git-guardrails design (`2026-07-21-git-guardrails-design.md`) already established the governing
  philosophy for the two layers: **local machinery is fast, convenient, and bypassable; the server
  is authoritative.** This document extends it, rather than restating it.

## The model: tiered by cost and determinism (defense-in-depth)

Every check is placed in the layer where it is most effective, along two axes — *fast vs. expensive*
and *objective vs. judgment*:

| | Claude (first line) | CI (second line) |
|---|---|---|
| **Fast + objective** | runs locally for instant feedback (format, typecheck, unit tests, lint) | re-runs the same as the unbypassable source of truth (trusts nothing local) |
| **Expensive / broad** | — (too slow to run on every push) | owns it: coverage gates, mutation / fuzz long-runs, CodeQL, dependency audit, secret scan, cross-env matrix |
| **Judgment** | owns it: does this match the ratified SPEC? clean abstractions? silent failures? behavior actually verified? | — (a machine cannot judge design intent) |

Rejected alternatives:

- **Mirror everything in both layers (belt-and-suspenders).** Simple, but underuses CI: expensive
  checks cannot sensibly run on every local push, so a strict "everything mirrors" rule either slows
  the local loop or drops those checks entirely.
- **Claude-maximal, CI-thin (push it all left).** Tightest catch-before-push loop, but a slow local
  loop and it underuses CI — CodeQL, history-wide secret scanning, and scheduled dependency audits
  are inherently server-side.

The tiered model is the only one that maxes out *both*: Claude does what only Claude can (judgment)
plus fast feedback; CI does what only CI should (expensive, broad, authoritative).

## The contract (the interface between the two layers)

**Claude (first line) guarantees, before opening or updating a PR:**

1. **Green locally** — the fast objective gates pass on the working machine: format, typecheck, unit
   tests, lint.
2. **Judgment-reviewed** — the checks a machine cannot do: does this trace to a ratified SPEC
   decision (or is it a *new* decision to surface first)? clean types and abstractions? no silent
   failures? comments and docs accurate?
3. **Behavior-verified** — anything with a runtime surface is exercised end-to-end and observed, not
   inferred from "tests pass."
4. **Scoped** — one logical change; the PR title is written as the durable commit subject.

**CI (second line) guarantees, before merge — trusting nothing local:**

1. **Re-runs every fast objective gate** on a clean machine — the authoritative truth.
2. **Runs the expensive / broad gates** that do not belong on every push: coverage, mutation / fuzz
   long-runs, CodeQL, dependency audit, secret scanning, cross-env matrix.
3. **PR-title hygiene** (already live).

All required checks are unbypassable via the locked-`main` ruleset — for the owner too.

**The seam:** Claude never merges on its own say-so; CI never judges design intent. Each covers the
other's blind spot.

## The check catalog

Gate legend: **enforced** blocks merge · **advisory** reports only · **process** = Claude discipline,
not a program. Phase legend: **0** = now · **1**+ = activates when that code lands (see "Phasing").

### 1. Correctness & regressions

| Check | Layer | Gate | Phase |
|---|---|---|---|
| format / typecheck (strict) / unit tests | Claude local + CI | enforced | 0 (live) |
| ESLint + typescript-eslint (no-floating-promises, controlled no-explicit-any, ...) | Claude local + CI | enforced | 0 |
| coverage thresholds (vitest) | CI | advisory, then enforced (ratchet up) | 0 |
| mutation testing (Stryker — catches tests that assert nothing) | CI | advisory, scheduled | 1 |
| code review — design / silent-failure / abstraction | Claude | process | every PR |

### 2. Data integrity & crypto

| Check | Layer | Gate | Phase |
|---|---|---|---|
| property tests (`fast-check`: round-trip, idempotence, canonical stability) | Claude + CI | enforced | 0 (overlay), then per data path |
| conformance / golden-vector tests | Claude + CI | enforced | per mechanism |
| fuzzing on parse/serialize and crypto paths | CI | advisory, long-run | 2 |
| crypto known-answer vectors (KATs) — never hand-roll; test to spec | Claude + CI | enforced | 3 |
| "never lose a note" round-trip integrity tests | Claude + CI | enforced | 2 |
| crypto changes reviewed with extra scrutiny; design surfaced to owner | Claude | process | 3 |

### 3. Security & supply chain

| Check | Layer | Gate | Phase |
|---|---|---|---|
| CodeQL (already configured, dormant) | CI | advisory (revisit enforcing later) | 1 |
| dependency audit (`npm audit`, fail on high/critical) | CI | enforced | 0 |
| secret scanning + push protection (GitHub, server-side) | CI / server | enforced | 0 |
| pinned deps (`npm ci` + lockfile) and GitHub Actions pinned by SHA | both | enforced | 0 (partly live) |
| plugin sandbox / capability tests | Claude + CI | enforced | 4 (own design first) |
| new-dependency necessity + trust check | Claude | process | every dependency |

### 4. Spec & design conformance

| Check | Layer | Gate | Phase |
|---|---|---|---|
| never decide design autonomously; trace change to ratified SPEC or surface it | Claude | process | always |
| markdown link-check on docs (dead links / broken refs) | CI | advisory | 0 (useful now) |
| spec-to-code traceability (PR references SPEC section; decision IDs resolve) | Claude (+ light CI lint) | process, then advisory | per impl |
| conformance suite per ratified mechanism (`overlay` already does this) | Claude + CI | enforced | per mechanism |
| keep SPEC/TODO honest — ratify conversation-decisions into SPEC | Claude | process | always |

## Phasing (activation is triggered by code, not dates)

Each check wakes when the code surface it guards lands. Claude owns proposing each flip proactively,
the same commitment made for the merge queue — nothing waits to be asked for.

- **Phase 0 — now (docs + `overlay` core):** ESLint + typescript-eslint; coverage (advisory) on
  `overlay`; `npm audit` enforced; GitHub secret scanning + push protection; Actions pinned by SHA;
  markdown link-check on docs (advisory — the check that pays off today, mid docs-phase); expand
  property / conformance tests on `overlay`.
- **Phase 1 — first editor/app code:** coverage ratchets toward enforced; CodeQL wakes
  (path-triggered) but stays advisory; mutation testing (advisory) once core logic settles;
  cross-env matrix if we target multiple Node/OS.
- **Phase 2 — persistence / data model / parser:** fuzzing on parse-to-serialize; "never lose a
  note" round-trip integrity invariants.
- **Phase 3 — encryption / recovery-key:** crypto known-answer vectors (enforced); extra-scrutiny
  crypto review; crypto design decisions surfaced to the owner.
- **Phase 4 — plugins:** sandbox / capability tests (enforced); plugin supply-chain review; and
  revisit the **merge queue** (deferred in the git-guardrails design) if parallel work has grown by
  then.

## Claude-side machinery (judgment made repeatable, not vibes)

Governing principle, from the git-guardrails design: **enforcement machinery replaces human
machinery.** Anything that *can* be encoded as a deterministic gate should be, so it becomes "the
system enforces it," not "Claude remembered to." What genuinely cannot be mechanized (design
judgment) stays with Claude as an explicit, documented protocol:

- **Fixed per-PR self-review pass** before opening any PR: `code-review` (effort scaled to the
  change), then targeted subagents where warranted (silent-failure, type-design, comment-analyzer,
  pr-test-analyzer), then `verify` to drive runtime behavior and observe it, then
  verification-before-completion (evidence before any "done" claim).
- **Design-decision surfacing:** anything implying a design or product call stops and is decided with
  the owner. Never autonomous.
- **The judgment layer shrinks over time:** whenever a recurring judgment check *can* be mechanized,
  it graduates into a gate — a lint rule, a pre-PR checklist script, a "PR references a SPEC section"
  nudge. The lasting value of the first line is not just careful review; it is continuously
  converting its own judgment into permanent, unbypassable machinery so the same class of mistake
  cannot recur.

## Decisions locked in this design

- **Model B (tiered by cost and determinism).** Not mirror-everything, not push-it-all-left.
- **No local secret scanner.** Secret detection is GitHub's server-side scanning + push protection
  only — no extra local dev dependency.
- **CodeQL reports, does not block (for now).** It stays advisory; enforcing it is a later,
  revisitable call, not part of this design.
- **Design full, phase in.** The complete target system is specified now; each check activates when
  the code it guards lands.

## Deferred decisions (surface when the phase arrives)

- Coverage threshold percentages and the advisory-to-enforced ratchet schedule.
- Plugin **security model** (sandboxing, capabilities) — a design decision in its own right, not to
  be settled inside this spec.
- Whether and when to enforce CodeQL rather than leave it advisory.
- Mutation-testing scope and whether it ever gates rather than reports.

## Non-goals (YAGNI)

- Standing up gates ahead of the code they guard (that is what phasing avoids).
- Conventional Commits, signed commits/DCO, per-commit CI — overkill at this scale (consistent with
  the git-guardrails non-goals).
- A merge queue now — deferred until parallel work grows (documented upgrade path).

## Verification (how we know each layer is working)

- **Layer placement holds:** every catalog row lives in exactly the layer(s) the model prescribes; no
  expensive check runs on every local push, no judgment check is delegated to a program.
- **CI trusts nothing:** required checks re-run objectively on a clean machine and are unbypassable
  in the `main` ruleset (verified via `gh api .../rules/branches/main`).
- **Phasing is honored:** when a guarding code surface lands, its phase's checks are proposed and
  turned on before that code merges — not retrofitted later.
- **The judgment layer shrinks:** over time, checks migrate from "process" to "enforced" as they are
  mechanized; the count of purely-manual judgment checks trends down.
</content>
</invoke>
