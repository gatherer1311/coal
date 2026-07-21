# Git guardrails & robust squash workflow — design

Date: 2026-07-21
Status: accepted (implemented in the PR that adds this file)

## Problem

Working on this repo, git state kept getting messy: merged branches piled up, worktrees dangled,
and squash-merges made local branches look "unmerged." The root causes were missing guardrails,
not any single mistake. Goals:

- **Block bad moves** on `main` structurally, regardless of who (or what) is driving.
- **Clean commits and PRs** by default.
- **Efficient, robust squashing** with as few "this branch conflicts / is out of sync" errors as
  possible.

## Key context

- The repo is **public**, owned by a personal (User) account.
- Claude Code acts using the **owner's** GitHub identity. GitHub cannot distinguish "the owner
  being careful" from "an assistant being rash." Therefore guardrails must apply to **everyone with
  no bypass** — they gate the *move* (e.g. a direct push to `main`), not the identity.
- Before this change, `main` was effectively **unprotected**: a `protect-main` ruleset existed but
  its `ref_name.include` was empty, so it matched no branches (`gh api .../rules/branches/main`
  returned `[]`).

## Decisions

1. **`main` is locked** — PR-only, CI-gated, no force-push, no deletion, **no bypass** (applies to
   the owner too).
2. **History model: squash + machinery.** Every PR lands as exactly one commit on `main`. Chosen
   because PRs here are already scoped to a single feature or a tight cluster, so "one commit per
   PR" loses almost nothing, while keeping `main` tidy and forgiving of messy work-in-progress. The
   SHA-drift that made squash confusing before is eliminated by auto-deleting + pruning merged
   branches (see below), not by avoiding squash.
3. **The enforcement machinery replaces the "human machinery."** A large project (e.g. the Linux
   kernel) keeps merge history clean through maintainer discipline. Here the committer (Claude) is
   automatable, so that discipline is encoded as hooks + CI checks + a working contract instead.

## Design

### A. Repo merge settings

- Enable **squash only**; disable merge-commit and rebase merges → exactly one merge button.
- `delete_branch_on_merge = true` → merged branches vanish automatically (kills the pile-up).
- `allow_auto_merge = true` → a PR merges the instant checks are green (shrinks the window in which
  `main` can move underneath it — the main defense against "out of sync").
- Squash commit message = **PR title + PR body** (`squash_merge_commit_title = PR_TITLE`,
  `squash_merge_commit_message = PR_BODY`) → every line on `main` reads as `PR title (#N)`.

### B. Ruleset on `main` (the unbypassable gate)

Replace the inert `protect-main` ruleset with one that targets the default branch and enforces:

- **Require a pull request** before merging (0 required approvals — a solo owner can't approve their
  own PR, but the PR flow itself is still mandatory, so direct pushes are blocked).
- **Require status checks**: `typecheck, test, format` (CI) and `PR title`. **Not** strict
  "up-to-date before merge" — that setting is the main source of "out of sync, please update"
  churn, and at this repo's low parallelism the staleness risk is negligible. Auto-merge + short,
  sequential PRs cover it instead.
- **Block force-push** (`non_fast_forward`) and **block deletion** of `main`.
- **No bypass actors.**

CodeQL stays **advisory** (runs, doesn't block) — it's slower and pre-staged to wake up when code
lands.

### C. The required "commit hygiene" check

Because squash uses the PR **title** as the commit subject, the automated "maintainer" mostly
guards the title. `.github/workflows/pr-title.yml` is a light gate (not Conventional Commits): it
rejects empty, junk, or over-long titles. Paired with the CI check, this is what keeps `main`'s log
clean.

### D. Driving conflicts and "out of sync" toward zero

No setting makes a textual conflict *impossible* (two branches editing the same lines must be
reconciled). The strategy is to make them **rare by construction** and **painless when they occur**:

- **Short-lived, scoped, sequential PRs** — the biggest lever. Merge one before opening the next and
  branches rarely overlap in time. This is encoded in the working contract.
- **Auto-merge** — land green PRs immediately; minimal window for `main` to move.
- **`pull.ff = only`** — updating a branch never silently creates a merge bubble.
- **`fetch.prune = true`** — deleted remotes disappear locally; `git branch` stays honest.
- **`rerere.enabled = true`** — replays previously-recorded conflict resolutions.
- **`.gitattributes` (`* text=auto eol=lf`)** — kills CRLF/LF spurious conflicts.
- **Claude owns the rebase** — when a conflict does happen, the assistant rebases and resolves; the
  user doesn't hand-fix.
- **Merge queue is deliberately deferred.** It's available (public repo) and is the gold-standard
  answer to staleness, but it adds latency and is YAGNI at solo/sequential scale. Documented as the
  upgrade path if parallel work grows.

### E. Local machinery (fast feedback; the server is authoritative)

Local hooks are convenience — they're bypassable (`--no-verify`), so GitHub re-checks everything.
Committed in `.githooks/`, activated by `scripts/setup-git.mjs` via the `prepare` script (no husky,
no new dependency):

- `commit-msg` — reject junk subjects.
- `pre-commit` — format check.
- `pre-push` — refuse direct pushes to `main`; run typecheck + test + format (mirror CI).

`scripts/setup-git.mjs` also sets `pull.ff=only`, `fetch.prune=true`, `rerere.enabled=true` (local,
never global; skipped in CI).

### F. The working contract

`CLAUDE.md` records the workflow Claude must follow: never touch `main` directly, one scoped PR at a
time, PR title is the commit message, rebase (never back-merge), let branches auto-delete and run
`npm run git:cleanup` after.

### G. CI footgun fixed

`ci.yml` previously ran only on changes under `src/**` etc. A *required* check with a path filter
gets **stuck forever** on a PR that doesn't touch those paths (the check never reports). The
`pull_request` path filter is removed so CI always runs on PRs.

### H. One-time cleanup

Clear the existing backlog once: delete the merged local + remote branches and the dangling
worktree. After this, `delete_branch_on_merge` + `git:cleanup` keep it clean automatically.

## Non-goals (YAGNI)

- Merge queue (deferred; documented upgrade path).
- Conventional Commits, signed commits/DCO, per-commit CI (bisectability) — overkill at this scale.
- Requiring PR approvals (impossible solo; the PR gate itself is what matters).

## Verification

- `gh api .../rules/branches/main` lists the pull-request, status-check, non-fast-forward, and
  deletion rules.
- A direct `git push origin main` is rejected locally (hook) and server-side (ruleset).
- Opening this PR runs both required checks; it can only merge via squash once green.
- After merge, the branch auto-deletes; `npm run git:cleanup` prunes the local leftover.
