# Security Policy

Coal is a keyboard-first notes editor with **built-in, opt-in encryption at rest** (`SPEC.md` §10) and
a capability-gated plugin model (`SPEC.md` §8.2). We take security seriously and appreciate
responsible disclosure.

> **Project status:** Coal is **in active design and pre-build** — there is not yet a released
> application to attack. This policy establishes the reporting channel now, and applies to the design
> and, in time, to the shipping code.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately through GitHub's **[private vulnerability reporting](https://github.com/gatherer1311/coal/security/advisories/new)**
(the repository's *Security → Report a vulnerability*). This opens a confidential advisory visible only
to you and the maintainers.

Please include, as best you can: the affected area, a clear description, reproduction steps or a proof
of concept, and the impact you foresee. We will acknowledge your report, work with you on a fix, and
coordinate disclosure.

## Areas of special interest

Coal's highest-sensitivity surfaces — worth extra scrutiny — are:

- **Encryption at rest (`SPEC.md` §10.3 / §10.4):** the `age`/`typage` scheme, the passphrase-wrapped
  vault key, the recovery-key backstop, key custody and the lock/purge lifecycle, and anything that
  could cause plaintext to reach disk when a vault is encrypted.
- **The plugin capability model (`SPEC.md` §8.2):** the "no ambient authority" boundary, the
  broker-enforced capability manifest, and especially the **first-party-only** privileged
  capabilities — any way a third-party plugin could reach them would be a serious finding.

Coal states its threat model and honest boundaries explicitly in `SPEC.md` §8.2 and §10; reports that
sharpen or contradict those stated boundaries are especially welcome.

## Supported versions

Not applicable pre-release. A supported-versions table will appear here once Coal has releases.
