# Release automation — RPM build & publish (design)

**Date:** 2026-07-24
**Status:** ratified (design decisions taken interactively 2026-07-24)
**Scope:** GitHub Actions automation that builds and publishes a testable Linux **RPM** of Coal.

## 1. Why

The app is now a runnable walking skeleton, but nothing turns `electron-vite build`'s
compiled output in `out/` into an installable artifact. This wires up the packaging step
that the kernel walking-skeleton design (§4, §9) deliberately deferred to "a later PR" —
so the app can be installed and dogfooded on a real Linux desktop.

The core packaging decisions were **already ratified** in `SPEC.md` and are honoured here,
not re-litigated:

- **electron-builder owns packaging** (SPEC §4; Electron Forge rejected over its ESM-main
  handling). Pinned to `^26` (26.x, per the skeleton design).
- **RPM is the launch target** (SPEC §3, §3.1). DEB, Flatpak, macOS, and Android are
  committed *post-launch* targets and are out of scope here.

## 2. Decisions taken (2026-07-24)

| Decision | Choice | Rationale |
|---|---|---|
| **Artifact format** | **RPM only** | Matches the SPEC launch commitment exactly; installs natively on the primary/reference platform (Fedora/RHEL-family). |
| **Trigger** | **Version tag `v*` + manual dispatch** | A tag cuts a real release (fits the locked, squash-merged `main`); the manual button gives an ad-hoc build without tagging. |
| **Publish mode** | **Auto-publish as prerelease** | Signals "testing build, not stable" while the artifact is immediately grabbable. |

## 3. Architecture

Two moving parts plus one asset:

### 3.1 `electron-builder.yml` (packaging config)

- `appId: io.github.gatherer1311.coal` — interim reverse-DNS id (the formal app-id is still
  deferred per the skeleton design §10; trivial to change before any release ships).
- `productName: Coal`, `executableName: coal` — desktop launcher is `Coal`, CLI binary is `coal`.
- `directories.buildResources: build-resources` — **not** the electron-builder default `build/`,
  because Coal's `.gitignore` treats `build/` as an output dir. `directories.output: dist`
  (already git-ignored).
- `files`: include-by-default minus dev-only files (source, configs, docs, CI). The app runs
  from `out/`; production `node_modules` (`@codemirror/*`, `toml-patch`, `write-file-atomic`)
  are bundled automatically. `electron` moved to **devDependencies** so electron-builder detects
  the runtime version and does not bundle it into the app.
- `linux`: `target: rpm` (x64), `category: Utility`, a `.desktop` entry
  (`Categories=Utility;TextEditor;Development;`), `maintainer`, `synopsis`, `description`, and
  the app icon set.

### 3.2 Icon — `build-resources/sublime/`

The app icon is the **lemon-lime faceted-coal mark**, filed under the default theme name
**`sublime`**, as an electron-builder icon **set** (`16x16.png` … `1024x1024.png`). A sized set
(rather than a single unsized PNG) is used because app-builder-lib 26.x expects icon filenames
to carry their size. Provenance: the artist's `icons.zip` export (`lime/electron/icons/`).

### 3.3 `.github/workflows/release.yml`

- **Triggers:** `push` on tags `v*`, and `workflow_dispatch` (with an optional `version` input).
- **Runner:** `ubuntu-latest`, Node 22. Installs `rpm` (provides `rpmbuild`, which
  electron-builder shells out to and which is absent on the runner image), then `npm ci`.
- **Version resolution (hardened):** the tag name / dispatch input is read via **env vars**,
  allowlist-validated (`[0-9A-Za-z.+-]` only), and only ever used as a quoted shell variable —
  never interpolated into a command with `${{ }}` — so a crafted tag cannot inject a command.
  The resolved version is stamped into `package.json` for the build only (never committed;
  the repo stays `0.0.0`), so the artifact is named with the real version.
- **Build & package:** `npm run build` (electron-vite) → `electron-builder --linux rpm
  --publish never` → upload the `.rpm` as a run artifact.
- **Two jobs, least privilege:**
  - `build` runs with `permissions: contents: read` (read-only). It runs the untrusted work —
    `npm ci`, the electron-vite build, electron-builder — so third-party code never holds a
    write-scoped token. It always uploads the `.rpm` as a run artifact.
  - `publish` (`needs: build`, `if: github.event_name == 'push'`, `permissions: contents: write`)
    downloads the artifact and attaches it to a GitHub **prerelease** for the tag
    (`softprops/action-gh-release`, `prerelease: true`, auto-generated notes). It runs only
    trusted actions — no build steps — so `contents: write` never covers third-party code.
  - **Manual dispatch** stops after `build`: the `.rpm` is only a downloadable run artifact
    (no release, since there is no version tag).
- **Tag-provenance gate (supply chain):** `main` is review-gated, but tags are not (no tag
  ruleset). Before *any* untrusted code runs, the build job rejects any `v*` tag whose commit is
  not reachable from `main` (`git merge-base --is-ancestor "$GITHUB_SHA" origin/main`). This keeps
  the locked-main review gate from being bypassable through the tag path. It is defence-in-depth;
  the primary control is a repo-side **tag ruleset** (see §5).
- **Pinning:** every action is SHA-pinned with a version comment, matching the existing workflows.

## 4. How to test a build

1. **Tagged release:** `git tag v0.1.0 && git push origin v0.1.0` → the workflow builds and
   publishes a prerelease. Download the `.rpm` from the repo's Releases page, then
   `sudo dnf install ./coal-0.1.0-*.x86_64.rpm` and launch **Coal** (or run `coal`).
2. **Ad-hoc build:** Actions → *Release (RPM)* → *Run workflow* → download the `coal-rpm-*`
   artifact from the run.

## 5. Follow-ups

**Recommended repo config (do this before the first real tag):**

- Add a GitHub **tag ruleset** targeting `refs/tags/v*` (`target: tag`) that restricts tag
  creation to admins, mirroring `protect-main`. The in-workflow provenance gate (§3.3) is
  defence-in-depth, not a substitute — a ruleset stops a spoofed tag at push time.

**Explicitly out of scope (later PRs):**

- **DEB, Flatpak, macOS, Android** packaging (SPEC §3.1, post-launch build tasks).
- **RPM GPG signing** and repository metadata.
- **Auto-update** feeds.
- Full desktop integration polish: `.md`/`.org` **MIME association**, `StartupWMClass`
  matching for Wayland window↔icon binding, XDG portals (SPEC §3).
- **aarch64** and other architectures.
- Finalising the formal reverse-DNS **app-id**.

## 6. Load-bearing references

- electron-builder Linux/RPM: <https://www.electron.build/linux.html>
- electron-vite + electron-builder distribution: <https://electron-vite.org/guide/distribution>
- SPEC §3 / §3.1 (platform & packaging), §4 (build tooling); kernel walking-skeleton design §4, §9, §10.
