# Coal — working agreement for Claude

Coal is **design-first** and consequential decisions are made **interactively**, together.
Do not make design/product calls autonomously. When a task implies one, surface it and decide
with the user first.

## Git workflow (this is enforced — follow it so nothing gets blocked)

`main` is **locked**: PR-only, CI-gated, no direct pushes, no force-push, no deletion — for
everyone, including us. Every change reaches `main` through a squash-merged PR. Work with the
grain of that, not against it:

1. **Never commit or push to `main`.** Always branch first (or use a worktree). The local
   `pre-push` hook and the GitHub ruleset both reject a direct push to `main`.
2. **One PR = one scoped change.** Keep PRs small — a single feature or fix. Scoped PRs are what
   make squash-merge lossless: the PR is the logical unit, so collapsing it to one commit on
   `main` loses nothing.
3. **The PR title is the commit message.** Squash-merge puts the PR **title** on `main` (and the
   PR **body** in the commit body). Write the title as the durable one-line history entry you'd
   want. A required check rejects empty/junk/over-long titles.
4. **Update by rebase, never back-merge.** To refresh a branch, `git pull` (fast-forward-only is
   configured) or `git rebase origin/main` — do **not** merge `main` into your branch. Force-push
   to your **feature** branch after a rebase is fine (only `main` forbids it).
5. **Let branches auto-delete; clean up locally after.** Merged branches are deleted on GitHub
   automatically. Run `npm run git:cleanup` to prune the local `[gone]` leftovers and dead
   worktrees. Don't leave worktrees dangling — remove them with `git worktree remove` when done.
6. **Green before you push.** `pre-commit` (format) and `pre-push` (typecheck + test + format)
   mirror CI locally so PRs land clean. `--no-verify` bypasses them, but the server re-checks —
   don't rely on the bypass.

New clone? `npm install` runs `scripts/setup-git.mjs`, which wires up the hooks and the git
config (`pull.ff=only`, `fetch.prune=true`, `rerere.enabled=true`). Nothing global is touched.

The rationale for all of the above lives in
[`docs/superpowers/specs/2026-07-21-git-guardrails-design.md`](docs/superpowers/specs/2026-07-21-git-guardrails-design.md).
