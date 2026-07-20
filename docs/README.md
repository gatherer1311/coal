# Coal documentation

Documentation is **first-class** and written **as-we-go**: a feature is not "done" until its
docs exist. Docs are split by audience so neither reader wades through the other's material.

- **[`user/`](./user/)** — how to *use* Coal to edit your files. Assumes no interest in internals.
- **[`dev/`](./dev/)** — architecture, internals, and how to *extend* Coal (plugins, themes,
  contributing).

## Conventions

- When you add or change a feature, add or update its doc in the same change.
- Put nothing in `user/` that only a plugin author or contributor needs, and nothing in `dev/`
  that a plain end user needs.
- A single feature may warrant a page in both trees (e.g. a user "how to use links" page and a
  dev "how the link API works" page).

The authoritative design source is [`../SPEC.md`](../SPEC.md). Docs describe what exists; the
SPEC describes what is decided and to be built.
