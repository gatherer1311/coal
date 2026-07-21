/**
 * Confidence thresholds for the ambiguous band (SPEC 13.12).
 *
 * Pure scoring for the residual re-anchoring cases the diff-ratchet (13.6) leaves:
 * a deleted block, a verbatim duplicate in scope, or one foreign leap large enough
 * that "same block, edited" vs. "replaced block" is a genuine judgment call.
 *
 * Governing asymmetry: diff-certain location (Path 1) buys content tolerance up to
 * the EDITED band; inferred location (Path 2) demands near-exact content and passes
 * a hard AND-gate. Position or neighbours can never buy a silent accept for content
 * that does not match — that would reintroduce the silent mis-point stand-off
 * identity exists to forbid.
 */

// -- Fixed constants, stamped as resolverVersion (SPEC 13.12) --
export const RESOLVER_VERSION = "1";
export const CONTENT_WEIGHT = 0.6;
export const NEIGHBOR_WEIGHT = 0.25;
export const POSITION_WEIGHT = 0.15;
export const K_NEIGH = 4;
export const NEAR_WINDOW = 800;
export const CANDIDATE_CAP = 16;
export const LSH_RADIUS = 20;
export const MARGIN = 0.15;
export const DANGLING_FLOOR = 0.45;
/** Path-1 silent ceiling: a diff-clean block resolves silently up to simhash d <= 12. */
export const PATH1_SILENT_CEILING = 12;

export type PositionTier = "near" | "moderate" | "far";
export type ContentClass = "EXACT" | "NEAR" | "EDITED" | "DRIFTED" | "FOREIGN" | "ABSENT";
export type BandStatus = "resolved" | "ambiguous" | "dangling";

/** A candidate's content evidence: normHash exactness, or a simhash distance (null = absent). */
export interface ContentMatch {
  normHashExact: boolean;
  simhashDistance: number | null;
}

/** A Path-2 candidate: content evidence plus positional and neighbour corroboration. */
export interface Candidate {
  content: ContentMatch;
  position: PositionTier;
  /** Neighbours (of up to K_present) whose fingerprints match in order. */
  nAgree: number;
  /** How many of the up-to-4 neighbour fingerprints are present. */
  kPresent: number;
}

/** S_position in {1.0, 0.5, 0.1}. */
export function sPosition(tier: PositionTier): number {
  switch (tier) {
    case "near":
      return 1.0;
    case "moderate":
      return 0.5;
    case "far":
      return 0.1;
  }
}

/** S_neighbor = nAgree / K_present; K_present === 0 -> 0 (no corroboration, never a fudge). */
export function sNeighbor(nAgree: number, kPresent: number): number {
  return kPresent === 0 ? 0 : nAgree / kPresent;
}

/** Classify content evidence into its band (SPEC 13.12). */
export function contentClass(m: ContentMatch): ContentClass {
  if (m.normHashExact) return "EXACT";
  if (m.simhashDistance === null) return "ABSENT";
  const dist = m.simhashDistance;
  if (dist <= 3) return "NEAR";
  if (dist <= 12) return "EDITED";
  if (dist <= 20) return "DRIFTED";
  return "FOREIGN";
}

/** S_content from the frozen content curve (SPEC 13.12). */
export function sContent(m: ContentMatch): number {
  switch (contentClass(m)) {
    case "EXACT":
      return 1.0;
    case "NEAR":
      return 0.9;
    case "EDITED":
      return 0.85 - (m.simhashDistance! - 4) * 0.05;
    case "DRIFTED":
      return 0.4 - (m.simhashDistance! - 13) * 0.05;
    case "FOREIGN":
      return 0.0;
    case "ABSENT":
      return 0.5;
  }
}

/** Composite score C = 0.60*content + 0.25*neighbor + 0.15*position (ranking only). */
export function composite(
  sContentValue: number,
  sNeighborValue: number,
  sPositionValue: number,
): number {
  return (
    CONTENT_WEIGHT * sContentValue +
    NEIGHBOR_WEIGHT * sNeighborValue +
    POSITION_WEIGHT * sPositionValue
  );
}

export interface ScoredCandidate {
  sContent: number;
  sNeighbor: number;
  sPosition: number;
  positionTier: PositionTier;
  contentClass: ContentClass;
  C: number;
  /** G1 (content gate): normHash-exact or simhash d <= 3 (EXACT or NEAR). */
  passesG1: boolean;
}

/** Score a single candidate. */
export function scoreCandidate(c: Candidate): ScoredCandidate {
  const cls = contentClass(c.content);
  const sc = sContent(c.content);
  const sn = sNeighbor(c.nAgree, c.kPresent);
  const sp = sPosition(c.position);
  return {
    sContent: sc,
    sNeighbor: sn,
    sPosition: sp,
    positionTier: c.position,
    contentClass: cls,
    C: composite(sc, sn, sp),
    passesG1: cls === "EXACT" || cls === "NEAR",
  };
}

/**
 * Path 1 — diff-clean location is certain; only content magnitude matters.
 * normHash-exact or simhash d <= 12 -> resolve silently; else confirm.
 */
export function resolvePath1(content: ContentMatch): "resolved" | "confirm" {
  if (content.normHashExact) return "resolved";
  if (content.simhashDistance !== null && content.simhashDistance <= PATH1_SILENT_CEILING) {
    return "resolved";
  }
  return "confirm";
}

export interface Path2Result {
  status: BandStatus;
  best: ScoredCandidate | null;
  C1: number;
  C2: number;
}

/**
 * Path 2 — inferred location. Rank candidates by C, then apply, in order:
 *   1. empty set -> dangling
 *   2. silent-resolve iff G1 (content) AND G2 (corroboration) AND G3 (margin)
 *   3. else C1 < 0.45 -> dangling
 *   4. else -> surfaced-confirm (ambiguous)
 */
export function resolvePath2(candidates: Candidate[]): Path2Result {
  if (candidates.length === 0) {
    return { status: "dangling", best: null, C1: 0, C2: 0 };
  }
  const scored = candidates.map(scoreCandidate).sort((a, b) => b.C - a.C);
  const best = scored[0]!;
  const C1 = best.C;
  const C2 = scored.length > 1 ? scored[1]!.C : 0;

  const g1 = best.passesG1;
  const g2 = best.positionTier === "near" || best.sNeighbor >= 0.5;
  const g3 = C1 - C2 >= MARGIN;

  let status: BandStatus;
  if (g1 && g2 && g3) {
    status = "resolved";
  } else if (C1 < DANGLING_FLOOR) {
    status = "dangling";
  } else {
    status = "ambiguous";
  }
  return { status, best, C1, C2 };
}
