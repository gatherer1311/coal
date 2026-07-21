# Contributing to Coal

Thanks for your interest in Coal. Coal is a **design-first, first-principles** project, and right now
it is **public, in active design, and pre-build** — so the most valuable contributions today are
thoughtful design discussion and spec review, not code (there isn't an app to patch yet).

Please skim this before opening an issue or PR — Coal tracks work a little deliberately, and that's
what keeps the project coherent.

## How Coal is organized

- **[`SPEC.md`](SPEC.md)** — the authoritative design: **ratified decisions only.** If it's in the
  spec, it's decided.
- **[`TODO.md`](TODO.md)** — everything **not yet decided or not yet built.** Design/planning items
  live here and flow into `SPEC.md` once ratified.
- **[`PLUGINS.md`](PLUGINS.md)** — the registry of official (first-party) plugins.
- **[`reference/`](reference/)** — research and prior art only. **No decision is justified by "the
  reference says so"** — Coal is *convergent, not derived* (see `SPEC.md` §0).
- **[`docs/`](docs/)** — user- and developer-facing documentation, written as features land.

## The one rule that keeps this sane: one item, one home

- **Design & feature ideas** are *decisions*, not tickets. They're discussed, reasoned from first
  principles, and — if adopted — **ratified into `SPEC.md`**. Raise them in **GitHub Discussions**
  (or a design issue if Discussions is unavailable), **not** as a large surprise PR. A design change
  that hasn't been ratified into the spec won't be merged as code.
- **Build tasks & bugs** are concrete, have a clear done-state, and live as **GitHub Issues under the
  `v1.0` milestone**, closed by PRs (`closes #N`). These begin once implementation starts.
- The planning backlog in `TODO.md` is **not** mirrored into issues.

## Proposing a design change

1. Open a Discussion describing the problem and your proposed direction; reference the relevant
   `SPEC.md` / `TODO.md` sections.
2. We work it through together — consequential decisions are made deliberately, with trade-offs on
   the table.
3. If adopted, it's ratified into `SPEC.md` (with a decision-log entry), usually via a small, focused
   PR that touches the spec rather than application code.

## Pull requests

- **Branch** off `main`; keep PRs **small and focused** (one decision or one fix).
- Write a clear title and body explaining *what* and *why*. Spec PRs update `SPEC.md` (and its
  decision log) and, where relevant, `TODO.md` / `PLUGINS.md`.
- Reference issues you resolve with `closes #N`.
- PRs are **squash-merged**.
- By contributing, you agree your contributions are licensed under the project's **Apache-2.0**
  license (see [`LICENSE`](LICENSE) / [`NOTICE`](NOTICE)).

## Security

Please **do not** file security vulnerabilities as public issues — see [`SECURITY.md`](SECURITY.md)
for private reporting.

## Conduct

Participation is governed by our [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
