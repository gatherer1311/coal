# Overlay identity core

The pure, framework-agnostic primitives that power stand-off identity and the
committed Overlay (`SPEC.md` §13). They depend only on `node:crypto` — no Electron,
no CodeMirror — and are the foundation the Reconciliation Engine (§13.7) will build on.

Import from the barrel: `src/overlay/index.ts`.

## Module map

| File | SPEC | What it provides |
|---|---|---|
| `normalize.ts` | §13.11 | The frozen normalizer: `extractPayload` (Stage A, kind-aware), `canonicalize` (Stage B), `normalize`, `normHash` (128-bit), `NORM_VERSION`, `KindTag`. |
| `id.ts` | §13.13 | Opaque ids: `mintId(kind)`, `encodeCrockford`, `ID_PATTERN`, `NodeKind`. |
| `canonicalJson.ts` | §13.13 | `canonicalJson(value)` — the frozen, byte-identical writer. |
| `simhash.ts` | §13.12 | `simhash64` / `simhashHex`, `hammingDistance`, `wordTokenCount`, `SIMHASH_BITS`, `MIN_SIMHASH_TOKENS`. |
| `neighbors.ts` | §13.12/§13.13 | `neighborFingerprint` (64-bit), `buildNeighbors` (K=4), `Neighbors`. |
| `resolve.ts` | §13.12 | Confidence scoring + band decision: `sContent`/`sNeighbor`/`sPosition`, `composite`, `scoreCandidate`, `resolvePath1`, `resolvePath2`, all constants, `RESOLVER_VERSION`. |
| `sidecar.ts` | §13.13 | Committed-sidecar types (`Sidecar`, `NodeRecord`, …) + `serializeSidecar`, `SCHEMA_VERSION`. |

## Design principles these encode

- **Conservative identity, honest degradation.** The normalizer absorbs only
  rendering-invisible noise; both failure directions degrade to a *confirm*, never a
  silent mis-point (§13.11). The resolver's hard AND-gate makes content a gate that
  position and neighbours can only corroborate — a content-identical candidate can
  never dangle, and content that does not match can never silently resolve (§13.12).
- **Frozen == byte-identical within a version.** The normalizer, the id encoding, and
  the JSON writer are all stamped (`NORM_VERSION`, `resolverVersion`, `schemaVersion`)
  so any change is a deliberate, re-hashing migration, never a silent shift.
- **The committed Overlay carries fingerprints, never verbatim note bytes** (§13.1,
  §10.2). Volatile positions/status are Tier-2 and absent from these types.

## Frozen version stamps

`NORM_VERSION = "1"`, `RESOLVER_VERSION = "1"`, `SCHEMA_VERSION = 1`, `SIMHASH_BITS = 64`.

## Open questions flagged during implementation

These were surfaced, not decided — they need ratification before the affected detail is final:

1. **`kindTag` naming.** Implemented per §13.13's set
   (`paragraph|list-item|blockquote|code-fence|table`, with `table` as-is pending a
   dedicated rule). §13.3 names it `paragraph|list-item|table|code` — the §13.3 wording
   should be aligned to §13.13.
2. **simhash byte order.** "The low 64 bits of SHA-256(feature)" is unpinned; implemented
   as the last 8 digest bytes, big-endian.
3. **`simhashTokens` sentinel.** §13.13 says it "records omitted vs. failed"; the exact
   encoding is unspecified (typed as a plain number for now).
4. **Hashing portability.** `node:crypto` (sync) suits the Node/Electron-main Overlay
   engine; a renderer path (Web Crypto is async) is a later consideration.
5. **Sidecar validation.** `sidecar.ts` provides types + serialization only; a validating
   parser for untrusted sidecars is deferred.

## Testing

Every function is covered test-first (Vitest); run `npm test`, `npm run typecheck`,
`npm run format:check`. CI runs the same three gates on every code PR.
