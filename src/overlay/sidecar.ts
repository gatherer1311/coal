import { canonicalJson } from "./canonicalJson";
import type { KindTag } from "./normalize";
import type { Neighbors } from "./neighbors";

/**
 * The committed per-note sidecar schema (SPEC 13.13).
 *
 * The committed Overlay carries identity, intent, and content *fingerprints* —
 * never verbatim note bytes. Volatile data (range, structural path, resolved
 * status) is Tier-2 and lives in a separate git-ignored anchors file, so it is
 * absent here. Any field at its documented default is omitted by the *builder*
 * (not by the writer), keeping steady-state sidecars minimal.
 *
 * NOTE — flagged: `simhashTokens` "records omitted vs. failed for short blocks"
 * (13.13) but the sentinel encoding is unspecified; typed as a plain number here.
 * A validating parser is intentionally not implemented yet (runtime validation of
 * an untrusted sidecar is its own task); this module provides the types and the
 * canonical serializer only.
 */

/** The ratified schema version (SPEC 13.13). */
export const SCHEMA_VERSION = 1;

/** The diff-ratchet baseline scalars (SPEC 13.15). */
export interface Baseline {
  hash: string;
  size: number;
  /** Present only once Git has been observed (strictly additive, SPEC 13.15). */
  commit?: string;
}

/** A note node — identity only; title/aliases are Tier-2 (derived from bytes). */
export interface NoteRecord {
  kind: "note";
  parent: null;
}

/** A block node — target-side, lazily persisted when first referenced (SPEC 13.4). */
export interface BlockRecord {
  kind: "block";
  kindTag: KindTag;
  /** 128-bit normHash (32 hex), SPEC 13.11. */
  normHash: string;
  /** 64-bit simhash (16 hex); omitted for blocks with < 12 word tokens (SPEC 13.12). */
  simhash?: string;
  simhashTokens: number;
  neighbors: Neighbors;
}

/** A cross-note reference target — ids only, never paths or offsets (SPEC 13.13). */
export interface LinkTarget {
  note: string;
  block: string | null;
}

/** A link node — source-side, the Option-1 reference (SPEC 13.5). */
export interface LinkRecord {
  kind: "link";
  parent: string;
  /** The exact authored link text incl. delimiters, e.g. `[[Design#Resolution]]`. */
  href: string;
  kindTag: KindTag;
  normHash: string;
  neighbors: Neighbors;
  target: LinkTarget;
}

/** A node record, discriminated by `kind`. */
export type NodeRecord = NoteRecord | BlockRecord | LinkRecord;

/** The committed `.coal/overlay/notes/<note>.json` shape (SPEC 13.13). */
export interface Sidecar {
  schemaVersion: number;
  normVersion: string;
  resolverVersion: string;
  /** This note's `note`-node id — the value cross-note references target. */
  root: string;
  baseline: Baseline;
  nodes: Record<string, NodeRecord>;
  /** `{ oldId: newId }` for deterministic id-coalescing after a merge; omitted when empty. */
  tombstones?: Record<string, string>;
}

/** Serialize a sidecar to the frozen canonical JSON form (SPEC 13.13). */
export function serializeSidecar(sidecar: Sidecar): string {
  return canonicalJson(sidecar);
}
