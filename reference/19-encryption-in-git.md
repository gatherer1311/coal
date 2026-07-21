# Encryption in Git: approaches & tradeoffs (research brief)

> **Status:** research brief, **not a ratified decision.** Coal's encryption *requirement* is
> decided (`SPEC.md` §10.2 — notes encrypted at rest, transparent unlock/re-lock); the encryption
> *mechanism* is **deferred** (`SPEC.md` §10.3, open sub-questions in `TODO.md`). Coal is *also*
> Git-native (§10.1) and drives Git itself; because syncing is the path off the device, **encrypting
> the Git/off-site copy is the near-term problem**, with **local at-rest** encryption a distinct,
> roadmapped layer (the R1-vs-R2 split below). This file grounds the eventual design by pinning,
> from primary sources, how the existing Git-encryption tools actually behave. Nothing here is
> promoted to `SPEC.md`.
>
> **On `reference/`:** per `SPEC.md` §0 this directory is priors/analysis only, and **no decision
> may be justified by "the reference says so."** Each tool below is a prior to be re-derived or
> diverged from on Coal's own merits (§10 is *convergent, not derived*), never a justification. Every
> non-obvious claim carries its primary-source URL; where a fact rests on secondary sources or
> inference rather than an official statement, that is **flagged inline** so it is not smuggled in as
> fact. Primary-source URLs were fetched during the research feeding this brief (2026-07-21); this
> synthesis did not independently re-fetch them.

---

## 0. The one-line answer

**There is no tool that does everything Coal wants; the design space is a small number of
*architectures*, and the choice is a trade between where plaintext is allowed to live, how much
metadata leaks, and whether multi-device Git sync stays cheap and safe.** Nearly every option clears
the hard confidentiality bar (R1: remote copy is ciphertext) — the filesystem-layer family is the lone
exception (deployed normally it commits *plaintext*, §4) — and they diverge sharply on the *other*
three. The dominant, recurring tension is **metadata-privacy vs usability**: the only
approach that hides filenames/structure/history from the host (whole-repo transport, e.g.
git-remote-gcrypt) is exactly the one that force-pushes and re-uploads the entire history on ordinary
hosts, while the approaches that give cheap incremental multi-device sync (file-level filters) leak
every filename, size, and commit message. A second cross-cutting fact: `age`/`typage` gives Coal a
pure-TypeScript, in-process crypto core, but the *Git integration point* — filter, merge driver, or
remote helper — is where the hard problems live, not the cipher.

```
Where does plaintext live?                        What does the remote see?
─────────────────────────────────────────────────────────────────────────────
(1) file-level filter   worktree = plaintext,     ciphertext blobs + ALL metadata
                        .git objects = ciphertext  (filenames, sizes, history)
(2) whole-repo transport worktree + .git = plaintext  fully opaque (best R4)
(3) filesystem layer    mount = plaintext,        n/a to Git — LOCAL at-rest layer
                        disk = ciphertext          (the natural R2 answer)
(4) structured-secrets  file-on-disk = ciphertext  ciphertext blob + metadata
(5) backup tool         worktree = plaintext,      ciphertext + names hidden, sizes leak
                        (not Git at all)           (a backup, not a sync/merge substrate)
```

---

## 0.1 The four criteria this brief weighs against

These are the **working evaluation lens** for the deferred §10.3 decision — derived from the
already-ratified frame (§10.1 Git-native free multi-device sync; §10.2 content encrypted at rest; §2
usability) and the open sub-questions in `TODO.md`. They are **not themselves ratified requirements**;
they are the axes each prior below is graded against (`R1 pass`, `R3 fail`, …):

- **R1 — HARD — confidentiality.** Note *content* must be ciphertext before it ever leaves the
  machine (the off-site/remote copy is encrypted).
- **R2 — HARD — extensibility.** The choice must **not foreclose adding LOCAL at-rest encryption
  later** (a roadmap item); note how each option composes with a future local-disk layer.
- **R3 — HARD — usability.** Effortless multi-device Git sync on ordinary hosts: incremental push, no
  data-loss footguns (force-push-every-push, silent ciphertext-merge clobber), and ideally runnable
  **in-process** from a TS/Electron app without shelling to heavy per-platform binaries. ("Perfect
  remote protection that is impossible to work with is a worthless system.")
- **R4 — NICE, not required — metadata.** Hiding filenames, folder structure, sizes, and history from
  the host is desirable but optional — a privacy-conscious user can also reach for a **private or
  self-hosted (e.g. Gitea) remote**, so metadata exposure is partly a *deployment* choice, not only a
  mechanism one.

---

## 1. The architecture axis — five ways to keep a note from a remote

Encrypting notes "in Git" is not one design; it is a choice of *layer*, and the layer determines
everything downstream (what leaks, whether diffs/merges work, whether push stays incremental,
whether it can run in-process). The five buckets:

1. **File-level filters** (git clean/smudge). Encrypt matched *files* at the Git object boundary.
   Working tree stays plaintext; `.git/objects` (local and remote) hold ciphertext. Cheap
   incremental push, normal Git hosting — but filenames, sizes, and history leak. *git-crypt,
   git-agecrypt, transcrypt, git-secret, blackbox.*
2. **Whole-repo transport** (a Git remote helper). Encrypt the entire pushed representation at the
   transport boundary. Local `.git` + working tree stay plaintext; the remote is fully opaque. Best
   metadata hiding — but force-push semantics and (on hosted Git) full-history re-upload.
   *git-remote-gcrypt; experimental per-object mirrors.*
3. **Filesystem-layer** encryption. Encrypt the on-disk bytes below the working tree. This is the
   natural **future LOCAL at-rest** layer (R2), *not* a remote-encryption mechanism. *gocryptfs,
   Cryptomator, EncFS, Linux fscrypt, LUKS/dm-crypt.*
4. **Structured-secrets.** Values-only encryption of key/value trees. Purpose-built for config
   secrets; degrades to a whole-file blob for prose. *Mozilla SOPS.*
5. **Backup-tool alternatives.** Client-side-encrypted deduplicating *snapshot* stores that replace
   or sit beside Git-as-backup. Great confidentiality, but snapshot/restore, not sync/merge.
   *restic, borg.*

A note on `age`: it is a *format/primitive*, not a bucket. It can be dropped into bucket (1) (a
filter, cf. git-agecrypt), bucket (2) (a hypothetical remote helper), or a Coal-native
decrypt-to-memory scheme. Its cross-cutting properties are in §8; the two Coal-native build paths are
in §9.

---

## 2. File-level filters — worktree plaintext, `.git` objects ciphertext

The shared mechanism: `.gitattributes` marks paths (`filter=…`); on `git add`/commit a **clean**
filter encrypts the file before it enters the object DB; on checkout a **smudge** filter decrypts it
back. Consequence: the **working tree is plaintext on disk**, the committed blob (local `.git` *and*
remote) is ciphertext. Two structural costs are common to the whole bucket: (a) the remote sees
filenames, folder structure, per-file sizes, commit messages, and which files changed per commit
(**R4 essentially absent**); and (b) high-entropy ciphertext defeats Git's delta/zlib packing, so a
long history of edited notes grows faster than plaintext would (git-crypt states its files "are not
compressible… the entire changed file [is stored], instead of just a delta",
https://raw.githubusercontent.com/AGWA/git-crypt/master/README.md).

### 2.1 git-crypt
A GPL-3.0 C++ clean/smudge+diff filter (Andrew Ayer). **Crypto:** AES-256-CTR with a **synthetic IV
derived from HMAC-SHA-1 of the plaintext** — deterministic, "provably semantically secure under
deterministic chosen-plaintext attack," leaking only whether two files are identical
(https://www.agwa.name/projects/git-crypt/). Not a modern AEAD; SHA-1 sits inside the IV derivation
(HMAC-SHA1 is not broken, but SHA-1 is legacy). No passphrase KDF — the data key is a random 256-bit
key file, optionally GPG-wrapped to recipients; **no key rotation and explicitly no revocation**
("does not support revoking access… which was previously granted", README). **Determinism** stabilizes
blobs (churn-free incremental push, no force-push) but leaks file-identity. **Diff:** readable locally
via `diff=git-crypt` textconv. **Merge — the sharp edge:** no built-in merge driver, so 3-way merges
run over ciphertext; open issue #140 reports conflicted files left unchanged with no conflict markers
(https://github.com/AGWA/git-crypt/issues/140), and the stronger "silently clobbers remote changes"
framing comes from secondary write-ups **[inference — see §11]**. **Maintenance:** single-maintainer,
pre-1.0; 0.8.0 (2025-09-23) after a ~3.5-year gap. **Coal fit:** R1 pass; R2 pass-with-caveats (zero
local at-rest itself; key sits unencrypted in `.git/git-crypt/keys/default`); R3 weak (native C++
binary, no JS/WASM port **[inference, absence-based]**; merge data-loss risk); R4 fail.

### 2.2 git-agecrypt
A Rust clean/smudge+textconv filter, "a more portable… alternative to git-crypt", **MPL-2.0** (the
label is GitHub's LICENSE-file detection; `Cargo.toml` carries no `license` field — **flagged**)
(https://github.com/vlaci/git-agecrypt). **Crypto:** delegated to the `age` v1 format —
ChaCha20-Poly1305 STREAM payload, X25519 recipients via HKDF-SHA-256, 16-byte random file key
(primitives come from the age spec, https://raw.githubusercontent.com/C2SP/C2SP/main/age.md, **not**
git-agecrypt's own docs — **flagged**). **The notable trick:** age is non-deterministic, so the clean
filter keeps a **blake3 hash of the plaintext under `.git/git-agecrypt/`** and re-emits the cached
ciphertext when plaintext is unchanged, giving byte-stable blobs and churn-free incremental push
(read from `src/cli/internal.rs`). **Documented limits:** the binary is "started once for each file
for every git operation" (no long-running filter protocol) and "the whole file is loaded into
memory". No merge driver (ciphertext conflicts, **inferred**). **Maintenance:** single maintainer,
**0.2.0, no tagged releases**, last commit 2024-03-11, self-described unaudited ("I am by no mean a
security expert"). **Coal fit:** R1 pass; R2 neutral (plaintext worktree + a plaintext-derived blake3
sidecar a future at-rest layer must also cover); R3 mixed (modern crypto, no force-push, but external
per-file-spawned Rust binary, needs a real Git honoring filters — isomorphic-git does **not** run
clean/smudge **[inference]**); R4 fail.

### 2.3 transcrypt
A single **MIT** Bash script wrapping OpenSSL as a clean/smudge+textconv+**merge** filter
(https://github.com/elasticdog/transcrypt). **Crypto — dated:** default **aes-256-cbc**,
*unauthenticated* (README concedes CBC malleability), key derived via legacy `-md MD5`
EVP_BytesToKey (single-iteration, no PBKDF2 — the `-md MD5 -S <salt>` invocation is quoted from the
script; the "weak KDF" characterization is **inference** from standard OpenSSL behavior). Per-file
salt = HMAC-SHA256(plaintext, key="filename:password"), so ciphertext is **deterministic** (no
force-push, no push/pull loops). Single symmetric passphrase (30-char random default), shared
out-of-band; `--rekey` is disruptive; no revocation. **Notably it ships a real merge driver**
(`merge=crypt` decrypts BASE/LOCAL/REMOTE and runs Git's internal merge), so 3-way merges work *if the
driver is configured on the merging machine*. **Coal fit:** R1 pass (opt-in per-pattern — Coal must
cover all notes *and* the committed Overlay); R2 tension (clean filter needs a plaintext worktree, so
it composes with FDE but collides with app-level per-note at-rest — **inference**); R3 mixed→fail
(external Bash+OpenSSL+coreutils, Windows liability, opposite of in-process TS); R4 fail. Actively
maintained (v2.3.2, 2025-05-18).

### 2.4 git-secret & 2.5 blackbox — the GnuPG-wrapper siblings (weaker fits)
Both are **manual** GnuPG wrappers (not transparent filters) that commit sibling `.secret`/`.gpg`
ciphertext files, keeping gitignored plaintext in the working tree. Both are **MIT**, both shell out
to `gpg`, both are **non-deterministic** (fresh session key per encrypt → churn, undeltifiable binary
blobs, unmergeable conflicts). **git-secret** (Bash-over-GnuPG, multi-recipient via a committed
public keyring that leaks recipient identities; the `-m` churn-mitigation flag commits **plaintext
sha256 fingerprints** — an added leak; docs even recommend re-encrypting *all* files each hide;
no stable release in ~4 years, https://github.com/sobolevn/git-secret). **blackbox** is
**ABANDONED and archived read-only (Nov 5 2025, "DO NOT USE")**, disqualifying it as a live
dependency (https://github.com/StackExchange/blackbox). Both clear R1 only under disciplined manual
workflow (a missed `hide` commits plaintext), fail R3 (external gpg, manual, unmergeable), and fail
R4. Their crypto is delegated to the installed GnuPG (cipher/AEAD-vs-MDC/SHA-1 **not documented** by
either tool — **flagged**).

---

## 3. Whole-repo transport — local plaintext incl. `.git`, remote fully opaque

### 3.1 git-remote-gcrypt
A **GPL-3** POSIX-shell **Git remote helper** (`gcrypt::<url>`): all encryption happens in the helper
at the transport boundary, so **the local `.git` and working tree stay fully plaintext; only the
pushed representation is opaque** (https://github.com/spwhitton/git-remote-gcrypt,
https://raw.githubusercontent.com/spwhitton/git-remote-gcrypt/master/README.rst). Each packfile is
symmetric-encrypted under a fresh random key; a signed+encrypted **manifest** carries the refs and
per-packfile keys, so **filenames, folder structure, branch/ref names, commit messages, and history
topology are all hidden** — **best-in-class R4**. Only packfile sizes/counts, push timing, and an
opaque Remote ID leak (and, if `gcrypt-publish-participants` is set, recipient key IDs). **Crypto is
GnuPG**, cipher not pinned by the project ("AES-256/CFB+MDC" is GnuPG-default knowledge, **not** a
project statement — treat concrete cipher as *not documented*, **flagged**). Public-key (GPG
recipient) model. **The three R3-killers, all documented:** (a) "every git push effectively has a
`--force`" — a real multi-device data-loss footgun with no non-fast-forward protection
(https://manpages.debian.org/testing/git-remote-gcrypt/git-remote-gcrypt.1.en.html); (b) on `giturl`
(GitHub/Gitea/GitLab) and `sftp://` backends **the entire history is re-uploaded on every push** —
only `rsync://` is incremental, and rsync cannot talk to hosted Git services; (c) silent repacks can
make any push suddenly re-upload everything. **Maintenance:** low-activity but alive (last released
tag 1.5, **21 Aug 2022**; a 1.6 line sits UNRELEASED at 29 Dec 2024 — an initial web summary
misdated 1.5 to Dec 2024, corrected against the fetched changelog, **flagged**). **Coal fit:** R1
pass, R4 strong pass, R2 neutral (leaves local plaintext, neither provides nor forecloses at-rest),
**R3 fail on multiple axes** + GPL-3 copyleft clashes with Coal's non-copyleft stack.

### 3.2 The incremental, non-force precedents (per-object mirrors)
To keep incrementality and lose the force-push, the alternative is to encrypt at Git **object**
granularity into a mirror repo, so unchanged objects map to unchanged ciphertext objects a normal
push can skip. **GenerousLabs/git-remote-encrypted** (TypeScript, **AGPL-3.0**, experimental, last
push 2021) does exactly this on **isomorphic-git** — demonstrating this whole path *can* run
**in-process in Electron/TS** without an external Git binary — but relies on **deterministic** object
encryption (reintroducing the equality leak) and is self-described "very early stage… do not use it
for anything which requires high security" (https://github.com/GenerousLabs/git-remote-encrypted).
**huumn/git-remote-gitern** / **pfalcon/git-remote-objcrypt** (JS, AES-256-CBC per-object, incremental)
similarly preserve object-graph topology, count, and sizes. **No mature `age`-based remote helper
exists** — an age transport path would be *new construction*, not adoption.

---

## 4. Filesystem-layer — the natural future LOCAL at-rest layer (R2), not a remote mechanism

gocryptfs, Cryptomator, EncFS, Linux fscrypt, and LUKS/dm-crypt all encrypt at the **storage layer**,
beside/beneath the working tree — none is Git-aware. The decisive fact: in normal deployment the
**plaintext view is the mount and the ciphertext store is separate**, so if Git's working tree lives
in the decrypted mount, **Git commits and pushes PLAINTEXT** (the ciphertext never leaves the
machine) — i.e. as an **R1 mechanism this family is the wrong layer** and **fails**. Inverting the
setup to point Git at the ciphertext store is undocumented and Git-hostile (randomized whole-file
blobs, no diff, no merge, binary-conflict data loss — **inference** from the crypto behavior), and
impossible for block-layer LUKS.

Where they shine is **R2**: LUKS/dm-crypt (whole-disk, `aes-xts-plain64`, LUKS2 argon2id at unlock —
strongest metadata hiding, but Linux-only, root, block-level), fscrypt (in-kernel per-directory, AES-256-XTS
contents / AES-256-CTS-CBC filenames, HKDF-SHA512 v2 keys, Linux-only), and gocryptfs (FUSE overlay,
scrypt → AES-256-GCM or XChaCha20-Poly1305, MIT, audited 2017) all sit transparently *under* Coal's
plaintext working tree and **compose cleanly and orthogonally** with a separate remote-encryption
scheme. All are symmetric/passphrase (no public-key multi-recipient). **Metadata (R4) as a store:**
Cryptomator's own Security Target says timestamps, **file/folder counts, and file sizes are
deliberately not encrypted** "to allow… synchronization"
(https://docs.cryptomator.org/security/security-target/); fscrypt kernel docs state it "does not
encrypt filesystem metadata" (https://www.kernel.org/doc/html/latest/filesystems/fscrypt.html). The exception in this family is
**CryFS**, which packs contents *and* filenames, sizes, and directory structure into uniform
fixed-size encrypted blocks, so it alone hides file sizes and folder structure — the R4-strongest
local-at-rest option here, at a performance/maturity cost (https://www.cryfs.org/comparison). EncFS
is the outlier — the 2014 audit found it "not safe if the adversary has the opportunity to see two or
more snapshots of the ciphertext at different times" (https://defuse.ca/audits/encfs.htm), exactly
Git's model, and the current codebase is an **alpha Rust rewrite** whose own README points users to
gocryptfs/FDE instead. **In-process flag:** none run in-process from Electron — each is a kernel
feature (root, Linux-only) or an external FUSE daemon; **Cryptomator is GPLv3** (copyleft). **Coal
fit:** R1 fail (wrong layer), **R2 strong fit** (this *is* the complementary local-at-rest answer),
R3 fail as an R1 mechanism, R4 mixed (LUKS best at rest, others leak sizes/counts).

---

## 5. Structured-secrets — Mozilla SOPS

SOPS is a **Go CLI/library (MPL-2.0, CNCF Sandbox, actively maintained — v3.13.2, 2026-06-30)** whose
defining mode is **partial, values-only** encryption of YAML/JSON/ENV/INI trees: "only encrypt the
leaf values", keys/structure/comments stay cleartext, each value → `ENC[AES256_GCM,data:…,iv:…,tag:…]`
(https://github.com/getsops/sops, https://getsops.io/docs/). Data key (AES-256-GCM) is
envelope-wrapped to **age (X25519)**, PGP, or KMS/Vault; Shamir key-groups give threshold/AND.
**For Coal's prose the structured mode is inapplicable** — a `.md` is not a key/value tree — so the
only path is **BINARY mode**, which wraps the whole file as one AES256_GCM blob "the same way PGP
would encrypt an entire file", collapsing SOPS into a clumsy whole-file blob encryptor and discarding
everything distinctive. SOPS is **manual/CLI** (the committed file *and* the working-tree copy are
ciphertext; you edit via `sops file`, which decrypts to a temp file) — **no** clean/smudge filter and
**no** remote helper, only an optional `sops -d` diff textconv; no merge driver. SOPS's own docs warn
"Encrypting entire files as blobs makes git conflict resolution almost impossible", and the MAC +
`lastmodified` change every save. **Coal fit:** R1 pass *only in degraded binary mode*; R2
neutral-to-awkward (committed-ciphertext model conflicts with §10.2's transparent plaintext-working-tree
intent); R3 fail (no in-process TS — community JS libs are decrypt-only or non-interop; unmergeable
blobs); R4 fail (filenames/paths/sizes leak). SOPS is the right tool for structured config/secrets in
Git and the wrong shape for prose notes.

---

## 6. Backup-tool alternatives — restic & borg

Both are standalone **client-side-encrypted, content-addressed, deduplicating snapshot stores** — not
Git, no filter/remote-helper. The working tree stays plaintext; encryption happens as data is
chunked into the backup repo. **They encrypt content AND filenames/paths/tree/snapshot-names**
client-side (stronger R4 than any Git-filter option), leaking to the host only **sizes, chunk-size
distribution, object counts, and timing** (borg: "A borg repository does not hide the size of the
chunks it stores", https://borgbackup.readthedocs.io/en/stable/internals/security.html; restic's
SHA-256 pack filenames "may leak information about file sizes",
https://restic.readthedocs.io/en/stable/100_references.html). **Crypto:** restic = AES-256-CTR +
Poly1305-AES (a hand-rolled non-AEAD construction, plaintext-hash dedup = a confirmed-plaintext
fingerprinting channel — **flagged**); borg 1.x = AES-256-CTR + HMAC-SHA-256/BLAKE2b with a
counter-reservation DB, borg 2.0 (beta) moves to **AES-256-OCB / ChaCha20-Poly1305 AEAD + Argon2**
(the 2.0 CLI mode names come partly from search of dev notes — **flagged**; the crypto substance is
confirmed on the fetched 2.0.0b13 security page). Both are **symmetric, single-master-key** (no
public-key multi-recipient); rotation re-wraps but does **not** re-encrypt, so a leaked master key is
permanent (**inference** from the wrapped-master-key architecture — **flagged**).
**Determinism/churn:** ciphertext is randomized but dedup keys on **plaintext** hashes, so unchanged
content still dedups (no churn) and content-defined chunking gives delta-like efficiency — **more
storage-efficient than committing blobs into Git**. **The disqualifier for Coal:** these are
**snapshot/restore, not sync-and-merge** — no live working-tree sync, no 3-way merge, no line-level
diff (restic/borg `diff` report file-level changes only); "syncing" device→device means
restore-and-overwrite, losing concurrent edits. **Concurrency:** restic is multi-writer-safe; **borg
1.x is single-writer with a documented shared-repo AES-counter-reuse confidentiality footgun** (borg
2 fixes the crypto). No in-process TS (restic = one static Go binary to shell out to, **BSD-2**; borg
= a full Python runtime, **BSD-3**). **Coal fit:** R1/R2 pass, much of R4 pass, **R3 fail as a sync
substrate** — best understood as an *optional complementary encrypted backup layer beside* Coal's
Git, not a replacement for it (and beside a plaintext Git remote, R1 is unmet for the Git copy).

---

## 7. Comparison table

Rows are the candidates/buckets; columns are the axes. `✓` = yes/pass, `~` = partial/caveated, `✗` =
no/fail. "Fit" is R1/R2/R3/R4 in order.

| Approach | Working tree | Local `.git` | What leaks to host | Local diff / merge | Push cost | Multi-device concurrency | Crypto | Remote usability | Fit R1/R2/R3/R4 |
|---|---|---|---|---|---|---|---|---|---|
| **git-crypt** (filter) | plaintext | ciphertext | names, sizes, msgs, history, file-identity | diff ✓ (textconv); **merge ✗** (no driver) | incremental, no force-push | footgun: ciphertext merge can silently clobber (#140) | AES-256-CTR + HMAC-SHA1 SIV (deterministic) | any Git host ✓ | ✓ / ~ / ✗ / ✗ |
| **git-agecrypt** (filter) | plaintext | ciphertext | names, sizes, msgs, history | diff ✓ (textconv); merge ✗ (inferred) | incremental (blake3 cache), no force-push | ciphertext conflicts (inferred) | age: ChaCha20-Poly1305 / X25519 | any Git host ✓ | ✓ / ~ / ~ / ✗ |
| **transcrypt** (filter) | plaintext | ciphertext | names, sizes, msgs, history, file-identity | diff ✓; **merge ✓** (driver) | incremental, no force-push | real 3-way merge (if driver configured) | AES-256-**CBC**, MD5 KDF (unauth., dated) | any Git host ✓ | ✓ / ~ / ~ / ✗ |
| **git-secret / blackbox** | plaintext (gitignored) | ciphertext siblings | names, sizes, recipients, msgs, history | diff ~ (one-sided); merge ✗ (binary) | incremental; **churn** (non-det.) | binary conflicts, manual | GnuPG (unspecified) | any Git host ✓ | ~ / ~ / ✗ / ✗ (blackbox **abandoned**) |
| **git-remote-gcrypt** (transport) | plaintext | **plaintext** | only sizes/counts/timing + Remote ID | n/a (local Git normal) | **full re-upload** on hosted Git; **force-push every push** | **footgun: silent clobber, no fast-forward** | GnuPG whole-packfile (unpinned) | rsync ✓, hosted Git ✗-incremental | ✓ / ~ / ✗ / **✓** |
| **filesystem layer** (LUKS/gocryptfs/…) | plaintext (mount) | plaintext (or n/a) | n/a to Git (LOCAL layer) | n/a | n/a | n/a (local) | AES-GCM/XTS/XChaCha, argon2/scrypt | not a Git mechanism | ✗ / **✓** / ✗ / ~ |
| **SOPS** (structured→binary) | ciphertext | ciphertext | names, sizes, structure | diff ~ (`sops -d`); merge ✗ | incremental | ciphertext/MAC conflicts every save | AES-256-GCM + age/PGP/KMS envelope | any Git host ✓ | ~ / ~ / ✗ / ✗ |
| **restic / borg** (backup) | plaintext | n/a (not Git) | sizes, chunk dist., counts, timing (**names hidden**) | file-level only; **no merge** | incremental (dedup) | restic safe; borg1 single-writer footgun | AES-256-CTR+Poly1305 / borg2 AEAD | own backends (S3/SFTP/SSH) | ✓ / ✓ / ✗ / ~ |

---

## 8. Cross-cutting primitives

### 8.1 age / typage — the in-process TypeScript path
`age` is "a simple, modern and secure file encryption tool, format, and Go library"
(https://github.com/FiloSottile/age); its wire format is the C2SP `age-encryption.org/v1` spec
(https://raw.githubusercontent.com/C2SP/C2SP/main/age.md). Each file gets a **random 16-byte file
key**; payload = **ChaCha20-Poly1305 STREAM in 64 KiB chunks**; recipients are **X25519** (via
HKDF-SHA-256) or an **scrypt passphrase** stanza; header MAC = HMAC-SHA-256; native
**multi-recipient** (each recipient gets a small stanza wrapping the same file key). **typage** (`npm:
age-encryption`, **BSD-3**, v0.3.0 2025-12-29) is "a TypeScript implementation… depends only on the
noble cryptography libraries, and uses the Web Crypto API when available" — **pure TS, no native
binary, runs in-process in Node/Electron**, emits standard age files decryptable by the Go/rage CLIs
(https://github.com/FiloSottile/typage). Two frictions, both from the *format* not the library: (a)
age is **non-deterministic** (fresh file key + nonces every encryption), so re-encrypting an unchanged
note yields entirely different bytes → Git sees a full-blob change, delta compression defeated (a
churn/size cost, **not** a data-loss footgun — this git-diff consequence is *derived* from the spec,
**flagged**); (b) whole-file granularity — one opaque blob per note per commit. **age does NOT protect
filenames, sizes, or structure** (ciphertext length ≈ plaintext + fixed overhead; the metadata
non-protection is *derived from the format's structure*, not an explicit spec "non-goals" section —
**flagged**). One official metadata note: **SSH-key** stanzas embed a trackable public-key tag, so
**X25519 recipients are preferable** if age is adopted. typage's built-in recipient types are X25519,
PQ hybrid, scrypt passphrase, WebAuthn/FIDO2, and Web Crypto — **native SSH recipients are not listed**
(**inference, absence-based**). Repo precedent: two Obsidian plugins already run typage in-process
(reference/18 §5).

### 8.2 AEAD choices — nonce-misuse, streaming, in-process availability
All produce whole-file ciphertext; they diverge on nonce-misuse safety and availability:
- **libsodium secretstream (XChaCha20-Poly1305)** — built for exactly this: "encrypts… a single
  message split into an arbitrary number of chunks", auto-manages nonces (24-byte header), detects
  truncation/reorder/duplication, needs no AES-NI. Lowest-footgun symmetric option; non-deterministic
  (https://doc.libsodium.org/secret-key_cryptography/secretstream). In-process via
  libsodium-wrappers (WASM) or sodium-native.
- **libsodium crypto_box / sealed box (X25519+XSalsa20+Poly1305)** — public-key; **sealed boxes give
  the "encrypt-to-a-device-public-key on the write path without the unlock secret loaded" shape**,
  the age-X25519-recipient pattern.
- **Raw AES-256-GCM (WebCrypto / Node)** — in-process everywhere, but the **highest-misuse-risk**
  option: MDC/libsodium are blunt that a 96-bit nonce "must be unique for every encryption… never
  reuse" and reuse is catastrophic (birthday bound ~2³² messages)
  (https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams,
  https://doc.libsodium.org/secret-key_cryptography/aead/aes-256-gcm). Needs AES-NI.
- **ChaCha20-Poly1305** — IETF variant (12-byte nonce, Node-native) has the same birthday concern;
  **XChaCha (24-byte nonce) makes random nonces safe** but is libsodium-only (not in WebCrypto/Node
  cipher lists — **absence-based flag**). "the recommended option if interoperability is not a
  concern" (https://doc.libsodium.org/secret-key_cryptography/aead/chacha20-poly1305).
- **OpenPGP.js** — pure-JS, in-process, **LGPL-3.0**, two Cure53 audits; RFC 9580 AEAD = AES-GCM/OCB/EAX
  (off by default for interop), no ChaCha AEAD; low caller-misuse (library-managed nonces). **GnuPG**
  is the external-binary alternative and pursues LibrePGP (does not implement RFC 9580 — an interop
  split), cutting against R3's "without shelling to heavy external binaries".

### 8.3 KDF choices — stretching a passphrase
Per OWASP's ranked guidance (https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html):
**Argon2id preferred** (memory-hard, hybrid side-channel posture; RFC 9106 makes id the default
variant, high-memory params t=1/m=2GiB/p=4 or constrained t=3/m=64MiB/p=4); **scrypt** the memory-hard
fallback and the **age-interop** choice (age pins scrypt N=2^workFactor, r=8, p=1, **default work
factor 18**, feeding ChaCha20-Poly1305); **PBKDF2** only when FIPS-140 is required (SHA-256 @ 600k);
**bcrypt legacy-only** (not memory-hard, 72-byte input cap). All have WASM/native JS bindings (scrypt
is in Node's built-in `crypto`). **age-specific footgun:** on decryption the scrypt work factor is
read from the attacker-controllable file header — FiloSottile warns passphrase mode "is not
recommended for automated systems"; a consumer auto-decrypting synced files should clamp a minimum
work factor (https://github.com/FiloSottile/age/discussions/413). The KDF choice is largely
**orthogonal to R1/R2** (any KDF feeds the same AEAD) and mostly affects offline brute-force cost.

### 8.4 The determinism ⇄ equality-leak axis (the primitive-level version of the whole tension)
Every default construction above is **non-deterministic** → identical plaintext encrypts differently
each time → **no equality leak, but Git churn** (unchanged note = fresh blob, delta compression
defeated, pushes bloat). To make a note's ciphertext **stable across saves** (cheap incremental
push), you must go **deterministic** — AES-GCM-SIV (RFC 8452) or an SIV-style plaintext-derived nonce
— whose unavoidable price is exactly what git-crypt does: **reveal content-equality / "unchanged"** to
whoever holds the repo (RFC 8452's "minimum amount of information a deterministic algorithm can leak",
https://www.rfc-editor.org/rfc/rfc8452). This determinism-vs-equality-leak trade is the
primitive-level mirror of §0's metadata-vs-usability tension. **AES-GCM-SIV is not in WebCrypto/Node/
libsodium's documented menus** (absence-based — may be reachable via bundled OpenSSL 3.2+, unverified,
**flagged**), so a deterministic in-process path means a dedicated JS lib or a hand-built SIV nonce
layer.

---

## 9. What a Coal-native age integration would require — the two build paths

No mature age-based Git tool exists, so adopting age means *building* one of two shapes. Both reduce
to reconciling age's randomness with Git's content-addressing.

**Path (a) — clean/smudge FILTER + textconv + merge driver** (git-agecrypt-style). Git's filter
contract is per-blob and **stateless** ("smudge and clean commands should not try to access the file
on disk", https://git-scm.com/docs/gitattributes), so stable ciphertext needs cross-invocation state
(git-agecrypt's per-clone blake3 cache). `filter.<driver>.required=true` must be set or a filter
failure is a **silent plaintext passthru** (a data-exposure footgun). `filter.<driver>.process` (the
long-running protocol) is the way to avoid one process spawn per file. **A merge driver is mandatory,
not optional:** Git's 3-way merge runs over the **stored (ciphertext) blobs** — it does not smudge
base/local/remote first — so without a decrypt→`git merge-file`→re-encrypt driver, conflicts silently
overwrite (the "merge sees ciphertext" behavior is a strongly-supported **inference** from filter
semantics + secondary evidence, not a direct Git-doc statement — **flagged**;
https://renerocks.ai/blog/merge-conflicts-encrypted-zettelkasten/). textconv restores readable diffs
for the key-holder but **caches plaintext to local disk** (an R2/at-rest surface). Protects **content
only** (R4 leaks). **Coal-specific:** the filter must **exempt `.coal/overlay/`** so the committed
Overlay stays diffable/mergeable (already an acknowledged §13.15 residual — `simhash`/`neighbors` leak
coarse structure).

**Path (b) — whole-repo encrypted TRANSPORT / remote helper** (gcrypt-style, made age-based). Git's
remote-helper contract *can* express incrementality via `export-marks`/`import-marks`
(https://git-scm.com/docs/gitremote-helpers), but a helper that can't read remote state (because the
remote holds opaque ciphertext) collapses to "re-send everything + force-push" (gcrypt's actual
behavior). The incremental fix is per-object mirroring with **deterministic** object encryption
(equality leak again) — and the only demonstrated **in-process** route is driving Git via
**isomorphic-git** (as GenerousLabs did), pure-JS and Electron-friendly but far less battle-tested
than C Git, with limited native remote-helper support. Hides **everything** (R4 strong) but
**re-invents the incrementality and non-force concurrency Git-over-plaintext gives for free**, and
would encrypt the Overlay too (closing that leak but losing host-side mergeability of both notes and
Overlay).

**A framing note — Coal drives Git.** Because Coal performs commits/pushes for the user, path (a)'s
clean-filter *logic* need not live in `.gitattributes` at all — Coal can encrypt in its **own commit
path**, deciding what/when to encrypt off the Overlay's `baseline.hash` change signal (§13.15). Same
on-disk result (plaintext working tree, ciphertext blobs), but no per-file subprocess spawns and no
`filter.required` plaintext-passthru footgun; the cost is that a raw `git commit` run *outside* Coal
would emit plaintext unless a real filter is *also* installed as a safety net. This is distinct from a
pure **decrypt-to-memory** design (ciphertext working tree, decrypt-on-open), which would trade away
the "clean plaintext files any editor opens" portability (§13.1) — the shape the plaintext-working-tree
intent steers away from.

---

## 10. Relevance to Coal (priors only — decides nothing)

Mapping these priors onto Coal's ranked criteria, **without pre-empting the deferred §10.3 mechanism**
(`SPEC.md` §0 forbids "the reference says so"):

- **R1 (HARD — content ciphertext before it leaves the machine): almost everything clears the bar,
  so R1 does not discriminate.** File-level filters, whole-repo transport, SOPS (binary mode), and
  restic/borg all put ciphertext off-site. The filesystem-layer family is the exception — deployed
  normally it commits **plaintext** (ciphertext never leaves the disk), so it is the *wrong layer* for
  R1. The R1 fine print is footgun-shaped: filters need `filter.required=true` and per-clone cache
  seeding on new devices; manual wrappers (git-secret/blackbox/SOPS) clear R1 only under workflow
  discipline.

- **R2 (HARD — must not foreclose future LOCAL at-rest encryption): the filesystem-layer family *is*
  the R2 answer, and it composes orthogonally with any remote scheme.** LUKS (whole-disk, best
  metadata hiding), fscrypt (per-directory), or gocryptfs (per-folder) sit transparently under Coal's
  plaintext working tree. The tension is that **file-level filters and transport both leave a
  plaintext working tree** and add plaintext-derived local surfaces a future at-rest layer must also
  cover (filter caches under `.git/`, textconv plaintext cache, merge temp files). age composes either
  way — Coal could keep a plaintext worktree and encrypt on the way out, *or* use the same age format
  for local at-rest — potentially sharing one key hierarchy. Caveat: a **deterministic** mode's
  equality/"unchanged" leak would follow the bytes onto local disk too (R2 ⇄ R4 interact).

- **R3 (HARD — genuinely usable: effortless multi-device sync on ordinary hosts, incremental,
  no data-loss footguns, in-process TS without heavy binaries): this is where the field thins.**
  In-process TS without shelling favors **typage/age, libsodium, WebCrypto/Node AEADs, OpenPGP.js** —
  every existing *tool* (git-crypt C++, git-agecrypt Rust, transcrypt/git-secret Bash+OpenSSL/gpg,
  gcrypt shell+GnuPG, SOPS Go, restic Go/borg Python) is an external binary. The **standout R3
  tensions**, stated plainly for the §10.3 record:
    - **git-remote-gcrypt's force-push + full-reupload vs file-level incremental sync.** The only
      approach that hides metadata (transport) force-pushes every push and re-uploads the whole
      history on GitHub/Gitea (only rsync is incremental, and rsync excludes hosted Git) — a direct
      multi-device data-loss footgun. File-level filters keep normal, incremental, force-push-free Git
      on ordinary hosts, but only because they leak metadata.
    - **Merge over ciphertext.** Only transcrypt ships a merge driver; git-crypt and git-agecrypt do
      not, so concurrent multi-device edits risk silent clobber (git-crypt #140) — a real footgun for
      an app that *drives* Git for the user. A Coal-native age filter would have to build the
      decrypt→merge→re-encrypt driver itself.
    - **Determinism vs churn.** Non-deterministic crypto (age, GnuPG tools) re-encrypts unchanged
      notes to fresh blobs (push bloat, defeated delta compression); the fixes are a per-clone cache
      (git-agecrypt) or deterministic encryption (git-crypt/transcrypt), the latter leaking
      file-identity.

- **R4 (NICE — metadata protection): a clean inversion of R3.** Only **whole-repo transport**
  (gcrypt) and, for names, **restic/borg** hide filenames/structure/history from the host; every
  file-level filter and SOPS leaks names, sizes, per-commit change-sets, and messages, and
  deterministic filters additionally leak file-identity. **The metadata-privacy ⇄ usability tension is
  the single most important thing this brief surfaces:** the R4-strong option is the R3-weak one, and
  vice-versa. Coal-specific overlay entanglement sharpens it — a filter path must exempt
  `.coal/overlay/` (leaving `simhash`/`neighbors` coarse structure in the clear, per §13.15), while a
  transport path would encrypt the Overlay but forfeit host-side merge. R4's weight is also partly a
*deployment* variable, not only a mechanism one: a file-level filter's metadata leak shrinks
materially when the remote is a **private or self-hosted (Gitea)** repo rather than a public host — a
prior that lowers R4 against R3 wherever the two conflict.

- **Process/posture prior worth borrowing:** the well-regarded tools publish exact parameters and
  explicit "what does *not* get protected" lists (age's metadata note, gcrypt's leak surface, borg's
  size-not-hidden statement). That honest-boundary discipline (reference/18 §7) is the right model for
  documenting whatever §10.3 ratifies — a process prior, not a design decision.

---

## Sources

- https://github.com/AGWA/git-crypt · https://www.agwa.name/projects/git-crypt/ · https://raw.githubusercontent.com/AGWA/git-crypt/master/README.md · https://github.com/AGWA/git-crypt/issues/140
- https://github.com/vlaci/git-agecrypt · https://raw.githubusercontent.com/vlaci/git-agecrypt/main/src/cli/internal.rs
- https://github.com/elasticdog/transcrypt · https://raw.githubusercontent.com/elasticdog/transcrypt/master/transcrypt
- https://github.com/sobolevn/git-secret · https://github.com/StackExchange/blackbox
- https://github.com/spwhitton/git-remote-gcrypt · https://raw.githubusercontent.com/spwhitton/git-remote-gcrypt/master/README.rst · https://manpages.debian.org/testing/git-remote-gcrypt/git-remote-gcrypt.1.en.html
- https://github.com/GenerousLabs/git-remote-encrypted · https://raw.githubusercontent.com/huumn/git-remote-gitern/master/README.md · https://github.com/isomorphic-git/isomorphic-git
- https://github.com/rfjakob/gocryptfs · https://nuetzlich.net/gocryptfs/ · https://docs.cryptomator.org/security/security-target/ · https://www.kernel.org/doc/html/latest/filesystems/fscrypt.html · https://man7.org/linux/man-pages/man8/cryptsetup.8.html · https://defuse.ca/audits/encfs.htm · https://www.cryfs.org/comparison
- https://github.com/getsops/sops · https://getsops.io/docs/
- https://restic.readthedocs.io/en/stable/100_references.html · https://borgbackup.readthedocs.io/en/stable/internals/security.html · https://borgbackup.readthedocs.io/en/2.0.0b13/internals/security.html · https://github.com/restic/restic · https://github.com/borgbackup/borg
- https://github.com/FiloSottile/age · https://github.com/FiloSottile/typage · https://raw.githubusercontent.com/C2SP/C2SP/main/age.md · https://github.com/FiloSottile/age/discussions/413
- https://doc.libsodium.org/secret-key_cryptography/secretstream · https://doc.libsodium.org/secret-key_cryptography/aead/aes-256-gcm · https://doc.libsodium.org/secret-key_cryptography/aead/chacha20-poly1305 · https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams · https://nodejs.org/api/crypto.html · https://www.rfc-editor.org/rfc/rfc8452
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html · https://www.rfc-editor.org/rfc/rfc9106 · https://www.rfc-editor.org/rfc/rfc7914.html · https://pages.nist.gov/800-63-4/sp800-63b.html
- https://git-scm.com/docs/gitattributes · https://git-scm.com/docs/gitremote-helpers · https://renerocks.ai/blog/merge-conflicts-encrypted-zettelkasten/
- https://raw.githubusercontent.com/openpgpjs/openpgpjs/main/README.md · https://en.wikipedia.org/wiki/GNU_Privacy_Guard · https://www.rfc-editor.org/rfc/rfc9580.html