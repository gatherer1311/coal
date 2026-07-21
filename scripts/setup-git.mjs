#!/usr/bin/env node
// Configures this clone for Coal's git workflow. Runs automatically via the
// package.json "prepare" script on `npm install`. Idempotent and safe to re-run.
//
// It only touches *local* git config for this repo — nothing global, nothing
// on the remote.
import { execFileSync } from "node:child_process";

// Nothing to configure in CI: no commits or pushes happen there.
if (process.env.CI) process.exit(0);

// No shell: args are passed directly to git, so nothing is interpolated.
const cfg = (key, value) => {
  try {
    execFileSync("git", ["config", key, value], { stdio: "ignore" });
  } catch {
    // Not a git repo, or git unavailable — skip quietly.
  }
};

// Activate the committed hooks in .githooks/ (git runs hooks from the work-tree
// root, so this relative path resolves correctly for every worktree).
cfg("core.hooksPath", ".githooks");

// Never create a surprise merge commit when updating a branch: fast-forward or
// fail (then you rebase). Kills the "this branch created a merge bubble" class.
cfg("pull.ff", "only");

// Drop remote-tracking refs whose upstream branch was deleted — e.g. right
// after a squash-merge auto-deletes the branch on GitHub. Keeps `git branch`
// honest so `npm run git:cleanup` can prune the local leftovers.
cfg("fetch.prune", "true");

// Remember conflict resolutions and replay them if the same conflict recurs.
cfg("rerere.enabled", "true");

console.log(
  "coal: git workflow configured (hooks + pull.ff=only + fetch.prune + rerere).",
);
