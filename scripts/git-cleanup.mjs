#!/usr/bin/env node
// One-command cleanup of the local cruft left behind after squash-merges.
//
//   - prunes worktrees whose directory is gone
//   - `git fetch --prune` (drops remote-tracking refs for deleted branches)
//   - deletes local branches whose upstream is gone ([gone]), except main and
//     the branch you're currently on
//
// This only removes branches GitHub has *already* deleted — i.e. ones whose PR
// was merged and auto-deleted. It never touches unmerged work. Run it whenever
// `git branch` starts to feel cluttered:  npm run git:cleanup
import { execFileSync } from "node:child_process";

// No shell: every argument is passed to git directly.
const git = (args, opts = {}) =>
  execFileSync("git", args, { encoding: "utf8", ...opts });
const gitRun = (args) => {
  console.log(`$ git ${args.join(" ")}`);
  execFileSync("git", args, { stdio: "inherit" });
};

gitRun(["worktree", "prune"]);
gitRun(["fetch", "--prune"]);

const current = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();

const gone = git([
  "for-each-ref",
  "--format=%(refname:short) %(upstream:track)",
  "refs/heads",
])
  .split("\n")
  .filter(Boolean)
  .filter((line) => line.includes("[gone]"))
  .map((line) => line.split(" ")[0])
  .filter((branch) => branch !== "main" && branch !== current);

if (gone.length === 0) {
  console.log("coal: no merged/gone local branches to delete — clean.");
} else {
  console.log(
    `coal: deleting ${gone.length} local branch(es) whose upstream is gone:`,
  );
  for (const branch of gone) gitRun(["branch", "-D", branch]);
}
