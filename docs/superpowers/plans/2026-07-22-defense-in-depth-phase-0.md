# Defense-in-Depth Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Phase 0 defense-in-depth checks — the quality and security machinery that already pays off, on the docs corpus and the existing `overlay` module.

**Architecture:** Each check is one scoped PR through the locked-`main` flow. **Enforced** checks (lint, dependency audit) are added as steps inside the *existing* required CI job (`typecheck, test, format`), so they block merge with **zero ruleset changes** — no risk of a never-reporting required check. **Advisory** checks (coverage, markdown link-check) are separate workflows that are deliberately *not* in the ruleset's required list. Secret scanning is a GitHub settings toggle, not code. Local hooks mirror the enforced checks for fast feedback.

**Tech Stack:** Node >=22, TypeScript 7, Vitest 4, ESLint 9 (flat config) + typescript-eslint, GitHub Actions, `gh` CLI.

## Execution status (2026-07-22)

Executed end-to-end in one session, each check a scoped PR through the locked-`main` flow:

- **Task 3 — enforced `npm audit`** — shipped (#32). Rides the required CI job; tree at 0 vulnerabilities.
- **Task 2 — advisory coverage** — shipped (#33). Separate non-required workflow.
- **Task 4 — advisory Markdown link-check** — shipped (#34); verified green on the full docs corpus via `workflow_dispatch` (lychee `--offline`).
- **Task 5 — pin Actions by SHA** — shipped (#35). All `uses:` pinned; the required job re-ran green on the pins.
- **Task 6 — secret scanning + push protection** — enabled (repo settings; not a PR).
- **Task 7 — coverage-gap backfill** — **not needed**: `overlay` is already at 100% (160/160 stmts, 76/76 branches, 31/31 funcs, 142/142 lines). No gaps to fill.
- **Task 1 — ESLint** — **deferred**: typescript-eslint hard-blocks TypeScript 7 (this repo's compiler) with a runtime guard; no published version supports it. Tracked in **#36**. `tsc --noEmit` (strict) remains the type-level gate meanwhile.

Side effect observed: CodeQL woke up as pre-staged (a `.ts` change tripped its path filter) and now runs advisory on PRs.

## Global Constraints

- Node `>=22`; `"type": "module"`; install with `npm ci` only.
- `main` is locked: PR-only, squash-merge, no direct/force push, no deletion. **One scoped change per PR.** The PR **title** is the commit subject (8–72 chars, meaningful).
- **Enforced** = blocks merge. In Phase 0 this is achieved by adding a step to the existing required CI job, NOT by editing the `main` ruleset. **Advisory** = runs in CI but is not a required check. **Process** = Claude discipline, not a program.
- No local secret scanner. CodeQL is untouched in Phase 0 (stays advisory). No new *runtime* dependencies — dev-dependencies only, each justified.
- Prettier owns formatting (`printWidth: 100`, double quotes, semicolons, `trailingComma: all`). `tsconfig.json` is already strict — do not weaken it.
- Local hooks live in `.githooks/`, activated by `scripts/setup-git.mjs` via `core.hooksPath`. Hooks must degrade gracefully when `node_modules` is absent (match the existing `pre-commit`/`pre-push` style).
- Each enforced check is introduced and merged *before* anyone relies on it blocking — the introducing PR proves it runs green on a clean machine.

---

### Task 1: ESLint + typescript-eslint (enforced) — DEFERRED (#36)

> Deferred: typescript-eslint refuses to run on TypeScript 7 (this repo's compiler) via a hard
> runtime guard, and no published version supports it (upstream
> [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)).
> The steps below stand for when TS 7 is supported (or if the side-by-side TS 6 approach is adopted).
> Tracked in #36.

**Files:**
- Create: `eslint.config.js` (ESLint 9 flat config, ESM)
- Modify: `package.json` (devDeps + `lint` scripts)
- Modify: `.github/workflows/ci.yml` (add a `Lint` step to the existing `build` job)
- Modify: `.githooks/pre-commit` (add lint after the format check)
- Modify: `.githooks/pre-push` (add lint alongside typecheck/test/format)

**Interfaces:**
- Produces: `npm run lint` (check) and `npm run lint:fix` (autofix). The enforced check rides the existing required CI context `typecheck, test, format` — no new required-check name is registered.

- [ ] **Step 1: Install the tooling**

Run:
```bash
npm install -D eslint@^9 typescript-eslint@^8 @eslint/js@^9 globals@^15
```
Expected: packages added to `devDependencies`; `package-lock.json` updated; `npm ci` still clean.

- [ ] **Step 2: Verify typescript-eslint supports the installed TypeScript**

TypeScript is v7 here; type-aware linting depends on the TS API. Confirm the peer range is satisfied:
```bash
npm ls typescript typescript-eslint
```
Expected: no `ERESOLVE`/peer-dependency errors, and `typescript@7.x` resolves under `typescript-eslint`.
If (and only if) typescript-eslint does **not** yet support TS 7, fall back in Step 3 to `tseslint.configs.recommended` (syntactic, non-type-checked) and omit `projectService`; leave a `// TODO(phase-1): promote to type-checked once typescript-eslint supports TS7` comment. Record which path was taken in the PR body.

- [ ] **Step 3: Write the flat config**

Create `eslint.config.js`:
```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["node_modules/**", "coverage/**", "**/*.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
```

- [ ] **Step 4: Add scripts**

In `package.json` `scripts`, add:
```json
"lint": "eslint .",
"lint:fix": "eslint . --fix"
```

- [ ] **Step 5: Run lint and resolve real findings**

Run: `npm run lint`
Expected: either clean, or a list of violations in `src/overlay/**`. Fix each violation properly (do NOT blanket-disable). Re-run until clean. If a rule is genuinely wrong for this codebase, narrow or disable it in `eslint.config.js` with a one-line comment justifying it — that is a judgment call to surface in the PR description.

- [ ] **Step 6: Prove the linter actually fails on a violation (red)**

Create a scratch file `src/overlay/_lint_probe.ts`:
```ts
export const probe: any = 1;
```
Run: `npm run lint`
Expected: FAIL — `@typescript-eslint/no-explicit-any` reported for `_lint_probe.ts`.
Then delete the probe: `rm src/overlay/_lint_probe.ts` and re-run `npm run lint` → PASS (green).

- [ ] **Step 7: Add the CI step (inside the existing required job)**

In `.github/workflows/ci.yml`, add after the "Format check" step of the `build` job:
```yaml
      - name: Lint
        run: npm run lint
```
Do not rename the job (its name is the registered required-check context). Lint now rides that check.

- [ ] **Step 8: Wire the local hooks**

In `.githooks/pre-push`, add lint to the CI-mirror block (after the format check), following the existing `npm run --silent` pattern:
```sh
  if ! npm run --silent lint; then echo "pre-push: lint failed — run 'npm run lint:fix'." >&2; exit 1; fi
```
In `.githooks/pre-commit`, after the prettier check, add an analogous guarded `npm run --silent lint` that skips when `node_modules/.bin/eslint` is absent (mirror the existing prettier `-x` guard).

- [ ] **Step 9: Full local verification**

Run: `npm run lint && npm run typecheck && npm test && npm run format:check`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add eslint.config.js package.json package-lock.json .github/workflows/ci.yml .githooks/pre-commit .githooks/pre-push
git commit -m "Add ESLint + typescript-eslint as an enforced lint gate"
```
PR title: `Add ESLint + typescript-eslint as an enforced lint gate`. Merge before Task 3 (both touch `ci.yml`).

---

### Task 2: Coverage reporting — advisory (separate workflow)

**Files:**
- Modify: `vitest.config.ts` (coverage block)
- Modify: `package.json` (devDep `@vitest/coverage-v8` + `test:coverage` script)
- Create: `.github/workflows/coverage.yml` (advisory — not a required check)

**Interfaces:**
- Produces: `npm run test:coverage` emitting a text summary + `coverage/coverage-summary.json`. No thresholds in Phase 0 — reporting only.

- [ ] **Step 1: Install the coverage provider**

Run: `npm install -D @vitest/coverage-v8@^4`
Expected: devDep added (version tracks Vitest 4).

- [ ] **Step 2: Configure coverage (report, do not gate)**

Set `vitest.config.ts` to:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    watch: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "json-summary"],
      // No thresholds yet: Phase 0 coverage is advisory (see the design spec).
    },
  },
});
```

- [ ] **Step 3: Add the script**

In `package.json` `scripts`: `"test:coverage": "vitest run --coverage"`.

- [ ] **Step 4: Run it locally and record the baseline**

Run: `npm run test:coverage`
Expected: PASS with a printed coverage table for `src/overlay/**`. Note the overall line/branch % — it becomes the Task 7 baseline. Ensure `coverage/` is git-ignored (it already is via the build-artifacts `.gitignore`; confirm with `git status`).

- [ ] **Step 5: Add the advisory CI workflow**

Create `.github/workflows/coverage.yml`:
```yaml
name: Coverage (advisory)

# Advisory only: reports coverage on PRs. Deliberately NOT in the main
# ruleset's required checks — it never blocks a merge.
on:
  pull_request:
    branches: ["main"]

permissions:
  contents: read

jobs:
  coverage:
    name: coverage (advisory)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: "22"
          cache: "npm"
      - run: npm ci
      - run: npm run test:coverage
```

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json package-lock.json .github/workflows/coverage.yml
git commit -m "Add advisory Vitest coverage reporting"
```
PR title: `Add advisory Vitest coverage reporting`.

---

### Task 3: Dependency audit (enforced)

**Files:**
- Modify: `.github/workflows/ci.yml` (add an `Audit` step to the existing `build` job)
- Create: `.github/workflows/audit-schedule.yml` (weekly drift detection — advisory)

**Interfaces:**
- Produces: an enforced `npm audit --audit-level=high` step riding the existing required CI context, plus a scheduled advisory run that surfaces newly-disclosed advisories without needing a PR.

- [ ] **Step 1: Confirm the tree is currently clean**

Run: `npm audit --audit-level=high`
Expected: exit 0, "found 0 vulnerabilities" (matches the current lockfile).

- [ ] **Step 2: Add the enforced CI step**

In `.github/workflows/ci.yml`, add to the `build` job after `Install dependencies`:
```yaml
      - name: Audit dependencies
        run: npm audit --audit-level=high
```
This fails the required job on any high/critical advisory. No ruleset change needed.

- [ ] **Step 3: Add the scheduled advisory workflow**

Create `.github/workflows/audit-schedule.yml`:
```yaml
name: Dependency audit (scheduled)

# Advisory: catches advisories disclosed after a dependency last changed,
# when no PR is in flight. Not a required check.
on:
  schedule:
    - cron: "0 9 * * 1" # Mondays 09:00 UTC
  workflow_dispatch:

permissions:
  contents: read

jobs:
  audit:
    name: audit (scheduled)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: "22"
          cache: "npm"
      - run: npm ci
      - run: npm audit --audit-level=high
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/audit-schedule.yml
git commit -m "Enforce npm audit on high/critical advisories"
```
PR title: `Enforce npm audit on high/critical advisories`. Rebase on Task 1 if it merged first (both edit `ci.yml`).

---

### Task 4: Markdown link-check — advisory

**Files:**
- Create: `.github/workflows/link-check.yml` (advisory — not required)

**Interfaces:**
- Produces: an advisory job that flags dead links/anchors across `**/*.md`. Runs on PRs touching Markdown and on a schedule.

- [ ] **Step 1: Add the workflow**

Create `.github/workflows/link-check.yml`:
```yaml
name: Link check (advisory)

# Advisory: flags dead links in Markdown. Not a required check.
on:
  pull_request:
    branches: ["main"]
    paths: ["**/*.md"]
  schedule:
    - cron: "0 9 * * 1"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  links:
    name: markdown links (advisory)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - name: Check links
        uses: lycheeverse/lychee-action@v2
        with:
          args: "--no-progress --include-fragments './**/*.md'"
          fail: true # fails THIS advisory job on broken links; does not block merge (not a required check)
```

- [ ] **Step 2: Prove it catches a broken link (red)**

On a scratch branch, add to any `.md`: `[dead](./this-does-not-exist.md)`. Push and open a draft PR.
Expected: the `markdown links (advisory)` job fails and reports the dead link, while the PR remains mergeable (the check is not required). Remove the scratch link.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/link-check.yml
git commit -m "Add advisory Markdown link-check"
```
PR title: `Add advisory Markdown link-check`.

---

### Task 5: Pin GitHub Actions to commit SHAs (hardening)

**Files:**
- Modify: every file under `.github/workflows/` (including the ones added in Tasks 2–4)

**Interfaces:**
- Produces: all `uses:` references pinned to a full 40-char commit SHA with a trailing `# vN` comment. Dependabot continues to bump them (it updates SHA-pinned actions and rewrites the comment).

- [ ] **Step 1: Resolve each tag to its commit SHA**

For every distinct action/tag in the workflows, run (example for `actions/checkout@v7`):
```bash
gh api repos/actions/checkout/git/refs/tags/v7 --jq '.object.sha'
```
Repeat for `actions/setup-node@v7`, `github/codeql-action@v4` (init/analyze share the repo), and `lycheeverse/lychee-action@v2`. If a tag points at a tag object rather than a commit, dereference: `gh api repos/<owner>/<repo>/git/tags/<sha> --jq '.object.sha'`.

- [ ] **Step 2: Rewrite each `uses:` line**

Replace `uses: actions/checkout@v7` with `uses: actions/checkout@<sha> # v7`, and likewise for every action across all workflow files. Keep the `# vN` comment so humans and Dependabot retain the version.

- [ ] **Step 3: Verify workflows still parse and run**

Open a draft PR; confirm every workflow still triggers and the required `typecheck, test, format` job is green (proves the pinned `checkout`/`setup-node` resolve).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows
git commit -m "Pin GitHub Actions to commit SHAs"
```
PR title: `Pin GitHub Actions to commit SHAs`. Do this after Tasks 2–4 so the new workflows are pinned in the same sweep.

---

### Task 6: Enable GitHub secret scanning + push protection (settings — not a PR)

**Files:** none (repository settings via API).

- [ ] **Step 1: Confirm with the owner before flipping**

This is an outward-facing repo-settings change. Get an explicit go-ahead (the design spec already anticipates this gate).

- [ ] **Step 2: Enable both**

Run:
```bash
gh api -X PATCH repos/gatherer1311/coal \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```

- [ ] **Step 3: Verify**

Run:
```bash
gh api repos/gatherer1311/coal --jq '.security_and_analysis'
```
Expected: both `secret_scanning` and `secret_scanning_push_protection` show `"status": "enabled"`. No commit; record completion in the tracking note / PR discussion.

---

### Task 7: Close overlay coverage gaps surfaced by Task 2 — SATISFIED (no gaps)

> Satisfied with no changes: the Task 2 coverage run shows `overlay` already at 100% line, branch,
> and function coverage. The method below stands for future modules that land below 100%.

**Files:**
- Modify/Create: `src/overlay/*.test.ts` as the coverage report dictates

**Interfaces:**
- Consumes: the `npm run test:coverage` report from Task 2.

- [ ] **Step 1: Read the coverage report**

Run: `npm run test:coverage`
Expected: per-file table. List every `src/overlay/*.ts` below 100% line or branch coverage with the specific uncovered lines. If everything is already at 100%, record that in the PR and this task is complete — do not invent tests for their own sake.

- [ ] **Step 2: For each gap, write a failing targeted test (red)**

Prefer a property test when the uncovered logic is algebraic (round-trip, idempotence, ordering-independence); otherwise an example test hitting the uncovered branch. Example property for a normalizer round-trip:
```ts
import { it } from "vitest";
import fc from "fast-check";
import { normalize } from "./normalize";

it("normalize is idempotent", () => {
  fc.assert(
    fc.property(fc.string(), (s) => normalize(normalize(s)) === normalize(s)),
  );
});
```
Run the new test and confirm it exercises the previously-uncovered path (temporarily break the impl to see the test fail, then restore).

- [ ] **Step 3: Re-run coverage and confirm the gap closed (green)**

Run: `npm run test:coverage`
Expected: the targeted lines/branches now covered; overall % up from the Step-1 baseline.

- [ ] **Step 4: Commit**

```bash
git add src/overlay
git commit -m "Cover remaining overlay branches with targeted tests"
```
PR title: `Cover remaining overlay branches with targeted tests`.

---

## PR sequencing

Sequential, one scoped PR at a time (per the locked-`main` workflow). Recommended order: **1 (lint) → 3 (audit) → 2 (coverage) → 7 (coverage gaps) → 4 (link-check) → 5 (pin actions)**. Tasks 1 and 3 both edit `ci.yml`, so land 1 before 3 and rebase. Task 5 comes last so it pins the workflows added by 2–4 in one sweep. Task 6 (settings) can happen any time after the owner confirms.

## Self-review — spec coverage

Phase 0 items in `docs/superpowers/specs/2026-07-22-defense-in-depth-design.md` mapped to tasks:

- ESLint + typescript-eslint (enforced) → Task 1
- coverage (advisory) on `overlay` → Task 2
- `npm audit` enforced → Task 3
- GitHub secret scanning + push protection → Task 6
- Actions pinned by SHA → Task 5
- markdown link-check on docs (advisory) → Task 4
- expand property/conformance tests on `overlay` → Task 7 (coverage-driven, so the expansion targets real gaps rather than guesswork)

No Phase 0 spec item is unaddressed. Enforced-vs-advisory placement matches the spec: lint and audit block (they ride the required job); coverage and link-check report only (separate non-required workflows); CodeQL is untouched.
