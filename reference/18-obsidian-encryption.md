# Obsidian's encryption mechanism — how scrypt fits (research brief)

> **Status:** research brief, **not a ratified decision.** Coal's encryption *requirement* is
> decided (`SPEC.md` §10.2 — notes encrypted at rest, transparent unlock/re-lock); the encryption
> *mechanism* is **deferred** (`SPEC.md` §10.3 / §13.3, open sub-questions in `TODO.md`). This file
> grounds that eventual design by pinning what Obsidian — the closest prior art — actually does,
> from primary sources. Nothing here is promoted to `SPEC.md`.
>
> **On `reference/`:** per `SPEC.md` §0 this directory is priors/analysis only, and **no decision
> may be justified by "the reference says so."** Where Obsidian's scheme is described it is a prior
> to be re-derived or diverged from on Coal's own merits (§10 is *convergent, not derived*), never a
> justification. Every non-obvious claim below carries its primary-source URL; where a fact rests on
> secondary sources or inference rather than an official statement, that is flagged inline so it is
> not smuggled in as fact. All URLs verified 2026-07-21.

---

## 0. The one-line answer

**scrypt is only the key-derivation function (KDF) — it is *not* Obsidian's entire encryption
mechanism, and it is not even a cipher.** Its whole job is to stretch the user's vault password
(plus a per-vault salt) into a 32-byte key. The bytes are actually encrypted by a *separate*
primitive, **AES-256-GCM**. And this pipeline exists in exactly one place: the **paid Obsidian Sync
add-on**, which encrypts the *remote* copy of a vault. The Obsidian **app itself encrypts nothing at
rest** — a local vault is plain-text files on disk.

```
your vault password ──scrypt(KDF)──▶ base key ──HKDF-SHA256──▶ AES key ──AES-256-GCM──▶ ciphertext
                     └─── scrypt's only role ───┘  └ v3 only ┘           └ the actual encryption ┘
```

So "Obsidian's encryption" really means "**Obsidian Sync's E2EE**," and within that, scrypt is a
single step of a multi-stage scheme.

---

## 1. The big picture — three surfaces, three different answers

Obsidian handles user data across three surfaces, and encryption behaves differently on each:

| Surface | First-party encryption? |
|---|---|
| **Core app / local vault (at rest)** | **None.** Notes are plain-text Markdown files in an ordinary folder. |
| **Obsidian Sync** (paid add-on) | Encrypts the *remote/synced* copy. Default **end-to-end** (scrypt + AES-256-GCM), or a server-managed-key "Standard" mode. Does **not** touch the local disk. |
| **Obsidian Publish** (paid add-on) | **None** for content — published sites are public by default; an optional site password is a server-side access gate, not encryption. |

Transport across all services is TLS, layered on top of whatever surface-specific protection applies
(https://obsidian.md/privacy). *(Obsidian's help pages now live under `obsidian.md/help/*`; the older
`help.obsidian.md/*` paths 301-redirect there.)*

---

## 2. Core app — no built-in at-rest encryption (the vault is plain files)

The single most relevant fact for anyone building a notes app with an at-rest requirement:
**Obsidian's core app performs no at-rest encryption whatsoever.**

- "Obsidian stores your notes as Markdown-formatted plain text files in a vault. A vault is a folder
  on your local file system, including any subfolders." Because they are plain text, "you can use
  other text editors and file managers to edit and manage notes" (https://obsidian.md/help/data-storage).
- Obsidian states plainly: "Obsidian doesn't encrypt your local vault"
  (https://obsidian.md/help/Obsidian+Sync/Security+and+privacy).
- Each vault carries a hidden `.obsidian` configuration folder (hotkeys, themes, community plugins)
  (https://obsidian.md/help/data-storage). Its contents are unencrypted plain-text JSON (e.g.
  `app.json`, `appearance.json`, `hotkeys.json`, `community-plugins.json`, per-plugin `data.json`),
  editable in any text editor. *(The specific filenames and the "plaintext JSON" characterization are
  corroborated by third-party analysis and direct observation rather than an official enumerated
  list, but are uncontested and easily verifiable.)*

Because everything is plaintext on disk, any other app, sync client, or backup service sees the
unencrypted content. Obsidian directs users who need at-rest protection to **external** tooling — OS
full-disk encryption (FileVault / BitLocker / LUKS), encrypted-container tools (VeraCrypt,
Cryptomator), or community plugins (https://forum.obsidian.md/t/can-i-encrypt-a-vault/33645). At-rest
/ password-protection has been an open, unresolved feature request since **13 June 2020** ("Password
protect / lock folder / Encryption at rest"), with no official commitment to build it into the app
(https://forum.obsidian.md/t/password-protect-lock-folder-encryption-at-rest/1754).

> **The load-bearing takeaway for Coal.** Obsidian's *at-rest* story is "we don't — use the OS or a
> plugin." Coal's ratified §10.2 requirement is the opposite (notes encrypted at rest, first-party
> and transparent). So **Obsidian Sync is prior art for the wrong problem** (confidentiality of a
> *remote* copy), and the closest real precedents for Coal's actual requirement are the *community
> at-rest plugins* in §5 — not the Obsidian first-party scheme. See §7.

---

## 3. Obsidian Sync E2EE — the full scheme

Obsidian Sync (paid) is the only first-party feature that encrypts note data. In **end-to-end** mode
(the default), the pipeline is:

```
vault password + per-vault salt
        │  scrypt   (KDF, memory-hard)              N=32768, r=8, p=1 → 32-byte base key
        ▼
   32-byte base key
        │  HKDF-SHA256   (version 3 only; info = "ObsidianAesGcm", empty salt)
        ▼
  32-byte AES-256 key
        │  AES-256-GCM   (authenticated encryption)
        ▼
  12-byte IV ‖ ciphertext ‖ 16-byte GCM auth tag
```

### 3.1 The cipher
The bulk cipher is **AES-256 in Galois/Counter Mode (GCM)** — an authenticated (AEAD) cipher
(https://obsidian.md/help/sync/security). Each blob is a **12-byte IV/nonce**, the AES-256-GCM
ciphertext, then a **16-byte GCM authentication tag** for tamper detection
(https://obsidian.md/blog/verify-obsidian-sync-encryption/). *(The published verification code shows
only the **decryption** path, so "the 12-byte IV is freshly random per message" is a reasonable
inference, not something the source directly evidences. It matters: this is plain AES-256-GCM, not
nonce-misuse-resistant GCM-SIV, so nonce uniqueness is security-critical.)*

### 3.2 The KDF (scrypt) and its exact role
scrypt derives the **base key** from the vault password plus a **per-vault salt**; it is memory-hard,
and it is the KDF only — never the data cipher (https://obsidian.md/help/sync/security). Obsidian's
official verification code publishes exact cost parameters: **N = 32768 (2¹⁵), r = 8, p = 1**, output
length **32 bytes**, with `maxmem = 128 * 32768 * 8 * 2`. Both password and salt are **NFKC-normalized
and UTF-8 encoded** before hashing (https://obsidian.md/blog/verify-obsidian-sync-encryption/).
*(These exact numerics come from the verification blog's example code, not the help-doc prose, which
only says "scrypt with salt.")*

### 3.3 Key hierarchy & versions
Two encryption versions exist:
- **Version 3 (current):** the AES key is derived from the scrypt base key via **HKDF-SHA256** (empty
  salt, info string `"ObsidianAesGcm"`), 32-byte output.
- **Version 0 (older):** the scrypt base key is used **directly** as the AES key, skipping HKDF
  (https://obsidian.md/blog/verify-obsidian-sync-encryption/).

The **encryption password is separate from the account password**; each remote vault can carry its
own distinct password (or a server-generated managed one), giving each vault an independent boundary
(https://obsidian.md/blog/verify-obsidian-sync-encryption/).

### 3.4 What is / isn't encrypted
- **Encrypted:** note content **and file names/paths** (https://obsidian.md/privacy).
- **Deliberately NOT end-to-end encrypted (metadata):** which device uploaded or deleted a file, when
  it was uploaded (timestamps), and the mapping between encrypted file paths and encrypted content
  (https://obsidian.md/help/sync/security). *(Ciphertext/file size is also inherently observable to
  the server, though not itemized in the docs' list.)*
- **Not encrypted at all:** the local on-disk vault
  (https://obsidian.md/help/Obsidian+Sync/Security+and+privacy).

### 3.5 Recovery — and the E2EE-vs-Standard fork
In **E2EE mode**, the password is not saved anywhere: "If you ever lose or forget the encryption
password, you won't be able to connect additional vaults to your remote vault. Since the encryption
password isn't saved anywhere, it's forever lost." Already-connected devices keep working; you just
can't add new ones (https://obsidian.md/help/sync/security). **Scoping caveat:** Obsidian also offers
a **"Standard" encryption** mode where the key *is* stored on company servers and can decrypt your
data — so "never stored / no escrow / unrecoverable" is true **only for the E2EE option**, not
Standard mode (https://obsidian.md/help/sync/security).

### 3.6 Audit
Sync's API/server/cryptography and clients have had independent third-party audits: **Trail of Bits
(Dec 2025)** on Sync API/server/cryptography ("All findings were addressed via remediations and
disclosures validated by the auditors"), **Cure53 (Oct 2024)** same scope, and **Cure53 client audits
(Dec 2023 and Dec 2024)**, all published as PDFs (https://obsidian.md/security). No audit of Publish
or of account-password hashing is listed.

*(Ignore the forum guess that the scheme is AES-GCM-SIV — it is standard AES-256-GCM with a 12-byte
IV; a moderator redirected that thread to the official blog:
https://forum.obsidian.md/t/description-of-end-to-end-encryption-scheme/112836.)*

---

## 4. Where scrypt sits, precisely — and what actually encrypts

For designers evaluating primitives, the separation of roles is the whole point:

- **scrypt = KDF only.** A password-based key-derivation function that "derives one or more secret
  keys from a secret string" — never a bulk/data cipher (RFC 7914,
  https://www.rfc-editor.org/rfc/rfc7914.html). Tunable parameters: **N** (CPU/memory cost, a power
  of 2), **r** (block size), **p** (parallelization). Created by Colin Percival (originally for the
  Tarsnap backup service) and standardized as **RFC 7914** (Aug 2016, authors Percival & Josefsson).
  *(The 2009/Tarsnap origin is documented by the Tarsnap/scrypt project, not by the RFC itself.)*
- **HKDF-SHA256 = intermediate key expansion** (v3), base key → AES key
  (https://obsidian.md/blog/verify-obsidian-sync-encryption/).
- **AES-256-GCM = the actual encryption** of note data
  (https://obsidian.md/help/sync/security).

Obsidian's docs list the two roles side by side — "Key derivation function: scrypt with salt" and
"Encryption algorithm: AES-256 using Galois/Counter Mode (GCM)"
(https://obsidian.md/help/sync/security). scrypt is also credited as a bundled dependency under
**Apache License 2.0** on Obsidian's third-party credits page (https://obsidian.md/help/credits;
mirrored in `reference/16`). The **only publicly documented use of scrypt in Obsidian is Sync's
E2EE**; no primary source documents it elsewhere, though because the credits list attributes the
library without documenting call sites, a non-Sync internal use cannot be positively ruled out.
Consistent with scrypt being a *gating KDF* rather than a stored secret, only the per-vault **salt** is
retained server-side (retrievable via API to re-derive the key on other devices); the password itself
is not stored (https://obsidian.md/help/sync/security). *(Obsidian's pages don't use the exact words
"never transmitted to servers"; non-transmission is inferred from the client-side derivation design
plus the "isn't saved anywhere / unrecoverable" statements.)*

A distinct, **undocumented** concern: how Obsidian hashes **account (login) passwords** server-side is
not publicly disclosed — no algorithm (bcrypt / argon2 / scrypt) is named; the privacy policy cites
only generic "password protection, database encryption" and TLS (https://obsidian.md/privacy). Do not
assume Sync's scrypt is reused for account-password storage; that is a separate, undocumented concern.

---

## 5. Community at-rest plugins — the real precedents for an at-rest requirement

Because the core app has no at-rest encryption, an ecosystem of **unaudited** community plugins fills
the gap. The dominant pattern is browser **WebCrypto AES-256-GCM with PBKDF2** as the KDF; the notable
exception is age-format plugins, which delegate to `typage` (**scrypt + ChaCha20-Poly1305** for
passphrases, or **X25519** recipients). Recurring disclaimers: unaudited, passwords never stored,
forgotten password = unrecoverable.

- **Meld Encrypt** (`meld-cp/obsidian-encrypt`) — Default (v2 / `CryptoHelper2304`): 256-bit AES-GCM
  key via **PBKDF2-HMAC-SHA-512 @ 210,000 iterations**, random 16-byte salt + 16-byte IV
  (https://raw.githubusercontent.com/meld-cp/obsidian-encrypt/main/src/services/CryptoHelper2304.ts).
  Retains a weak **legacy** format (`CryptoHelper`): PBKDF2-**SHA-256 @ 1,000 iterations** with a
  hard-coded constant salt `'XHWnDAT6ehMVY2zD'` — the subject of advisory GHSA-xqjw-wwh3-v87v,
  "Insufficient iteration count and constant salt for PBKDF2"
  (https://raw.githubusercontent.com/meld-cp/obsidian-encrypt/main/src/services/CryptoHelper.ts).
  Whole-note (ciphertext in a separate `.mdenc` JSON file) *or* inline selected-text encryption; never
  writes decrypted content to disk. Its own docs warn the "encryption methods used have not been
  independently audited" (https://github.com/meld-cp/obsidian-encrypt).
- **Age Encrypt** (`Mr-1311/obsidian-age-encrypt`) — Uses npm `age-encryption` (typage, `^0.2.0`) in
  passphrase mode: **scrypt** for passphrase key-wrapping, **ChaCha20-Poly1305** AEAD (dictated by the
  age file-format spec). Stores an ASCII-armored age payload inline in a fenced code block
  (`BEGIN/END AGE ENCRYPTED FILE`), **age-CLI compatible**, decrypted content in memory only
  (https://github.com/Mr-1311/obsidian-age-encrypt).
- **AGE Crypto** (`toru4ka/obsidian-age-crypto`, GPL-3.0) — Second age-format plugin, bundled
  TypeScript age (no external `age`/`age-keygen` binaries), Desktop + Mobile; centers on **asymmetric
  X25519** recipients (`AGE-SECRET-KEY-…` identities, `age1…` public recipients), multi-recipient
  (https://community.obsidian.md/plugins/age-crypto).
- **Lockbox** (Zarware) — Password-based whole-note-body: **PBKDF2-SHA-256 @ 310,000** → AES-GCM-256,
  fresh random salt+IV per note; ciphertext inline in a `locker` JSON block; filename stays visible.
  Note: while unlocked, plaintext is written to disk (https://community.obsidian.md/plugins/lockbox).
  *(Canonical GitHub repo unconfirmed; rely on the community listing.)*
- **Obsidian Text Lock** (`guelfoweb/obsidian-text-lock`) — Inline section encryption via Templater:
  **AES-256-GCM + PBKDF2-SHA-256** through Web Crypto ("No custom crypto is implemented"); each block
  stores random salt/IV/ciphertext as Base64 in a comment `%% obs-aesgcm:v1:<salt>:<iv>:<ciphertext>
  %%`. No whole-file or password management (https://github.com/guelfoweb/obsidian-text-lock).
- **VaultGuard** (`uthvah/vaultguard`, also `…/locksidian`) — Lockscreen plugin with optional
  full-vault at-rest encryption: **PBKDF2 @ 250,000** + secure random salt, AES-GCM per-`.md` file;
  auto-decrypt on unlock; zxcvbn strength meter (https://github.com/uthvah/vaultguard).
- **Other precedents:** Global Markdown Encryption (whole-file AES-256-GCM + PBKDF2, ciphertext in
  separate `.aes256` files); **obsidian-password-plugin** (folder-level AES-256-GCM at rest, header
  bytes passed as AES-GCM **AAD**, default PBKDF2-SHA256 **600,000** iterations, files renamed `.enc`);
  Vault Encrypt (whole-vault AES-256-GCM + PBKDF2 + HKDF, plus filename/structure/size masking);
  Lockblock (encrypts fenced code blocks with a random vault key wrapped in Obsidian `secretStorage`
  rather than a user password) (https://github.com/coglizer/obsidian-password-plugin).

**Cross-cutting patterns.** KDF iteration counts span a legacy 1,000 up to 600,000. Ciphertext
storage splits between **in-band** (inline comment / fenced code block) and **sibling files** with a
custom extension (`.mdenc`, `.aes256`, `.enc`). None are independently audited.

---

## 6. Summary table

| Surface | Encrypted? | Cipher | KDF |
|---|---|---|---|
| Core app / local vault (at rest) | **No** — plain-text Markdown | none | none |
| `.obsidian` config folder | **No** — plain-text JSON | none | none |
| Sync — remote vault (E2EE, default) | Yes (content + file names/paths; some metadata not E2EE) | AES-256-GCM | scrypt (N=32768, r=8, p=1) → HKDF-SHA256 (v3) |
| Sync — remote vault (Standard mode) | Yes, but key held by Obsidian (server can decrypt) | AES-256-GCM | scrypt (key escrowed server-side) |
| Publish — published site | **No** — public by default; site password is a server-side gate | none | none |
| Transport (all services) | Yes, in transit | TLS (version/cipher undisclosed) | n/a |
| Account (login) password storage | Undisclosed | not documented | not documented |
| Community at-rest plugins (Meld, Lockbox, VaultGuard, …) | Yes (unaudited) | AES-256-GCM (WebCrypto) | PBKDF2 (1k legacy → 600k) |
| Community age-format plugins (Age Encrypt, AGE Crypto) | Yes (unaudited) | ChaCha20-Poly1305 (passphrase) / X25519 (recipients) | scrypt (passphrase mode) |

---

## 7. Relevance to Coal (priors only — decides nothing)

Mapping these priors onto Coal's already-ratified frame, **without pre-empting the deferred §10.3
mechanism** (`SPEC.md` §0 forbids "the reference says so"):

- **Obsidian is prior art for a *different* threat model.** Its first-party encryption protects a
  *remote synced copy* (Sync E2EE); the local disk is deliberately plaintext. Coal's §10.2 requires
  the *at-rest* bytes themselves to be ciphertext (device loss must not expose notes). So the Sync
  scheme answers a question Coal has *not* asked, and the community *at-rest* plugins (§5) are the
  nearer precedents for what Coal must actually build.
- **The KDF-vs-cipher separation is the reusable lesson, not the specific choices.** Every serious
  scheme here is *KDF → key → AEAD*: scrypt/PBKDF2/argon2 to stretch a password, then AES-256-GCM or
  ChaCha20-Poly1305 to encrypt. Coal's open "key derivation" sub-question (`TODO.md`) is really "which
  KDF," downstream of a still-open "what does the actual encrypting + framing." scrypt being
  *Obsidian's* KDF is a data point, **not** a reason for Coal to pick it — Coal weighs scrypt vs
  argon2id vs the age format on its own merits.
- **age is the portability-shaped prior.** Two community plugins adopt the **age format** (typage:
  scrypt-wrapped passphrase or X25519 recipients, ChaCha20-Poly1305), which is **CLI-decryptable
  without the app** — directly relevant to Coal's "files are portable" ethos and its open "approach"
  and "multi-device / key management" sub-questions. Recorded as a prior to evaluate, nothing more.
- **What Obsidian does *not* solve for Coal:** encryption interacting with **Git** history/diff/merge
  over ciphertext (Coal §10.1 / §14 — Obsidian Sync is a bespoke server protocol, not Git), and
  encrypting the **committed Overlay/sidecars** (`SPEC.md` §14), whose `normHash` / `lastKnownBlob` /
  fingerprints would leak plaintext if left in the clear. These are Coal-specific and unaddressed by
  any prior here — they are exactly the entanglements `SPEC.md` §10.3 flags.
- **Honest-boundary and audit posture** are worth borrowing in spirit: Obsidian publishes exact
  parameters, a self-verification guide, an explicit "which metadata is *not* protected" list, and
  third-party audits. That transparency discipline aligns with §8.2's "honest boundary" framing and is
  a good model for how Coal should *document* whatever it ratifies — again, a process prior, not a
  design decision.

---

## Sources

- https://obsidian.md/help/data-storage
- https://obsidian.md/help/Obsidian+Sync/Security+and+privacy
- https://obsidian.md/help/sync/security
- https://obsidian.md/blog/verify-obsidian-sync-encryption/
- https://obsidian.md/help/publish/security
- https://obsidian.md/help/credits
- https://obsidian.md/privacy
- https://obsidian.md/security
- https://forum.obsidian.md/t/can-i-encrypt-a-vault/33645
- https://forum.obsidian.md/t/password-protect-lock-folder-encryption-at-rest/1754
- https://forum.obsidian.md/t/description-of-end-to-end-encryption-scheme/112836
- https://www.rfc-editor.org/rfc/rfc7914.html
- https://raw.githubusercontent.com/meld-cp/obsidian-encrypt/main/src/services/CryptoHelper2304.ts
- https://raw.githubusercontent.com/meld-cp/obsidian-encrypt/main/src/services/CryptoHelper.ts
- https://github.com/meld-cp/obsidian-encrypt
- https://github.com/Mr-1311/obsidian-age-encrypt
- https://community.obsidian.md/plugins/age-crypto
- https://community.obsidian.md/plugins/lockbox
- https://github.com/guelfoweb/obsidian-text-lock
- https://github.com/uthvah/vaultguard
- https://github.com/coglizer/obsidian-password-plugin
