import type { MatchResult } from "./types";

const SEPARATOR = /[\s\-_/.]/;

/**
 * Case-insensitive subsequence match with scoring (design §6). Returns null when
 * `query` is not a subsequence of `text`. `positions` are the matched indices in
 * `text` (for highlighting). Higher score = better; an empty query matches at 0.
 */
export function fuzzyMatch(query: string, text: string): MatchResult | null {
  if (query.length === 0) return { score: 0, positions: [] };

  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const positions: number[] = [];
  let score = 0;
  let qi = 0;
  let prevMatch = -2; // index in text of the previously matched char

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;

    let charScore = 1;
    if (ti === prevMatch + 1) charScore += 5; // contiguous run
    const prev = ti > 0 ? text[ti - 1] : undefined;
    if (ti === 0 || (prev !== undefined && SEPARATOR.test(prev))) charScore += 3; // word start
    if (prev !== undefined && /[a-z0-9]/.test(prev) && /[A-Z]/.test(text[ti]!)) charScore += 3; // camelCase
    if (text[ti] === query[qi]) charScore += 1; // exact case

    score += charScore;
    positions.push(ti);
    prevMatch = ti;
    qi++;
  }

  if (qi < q.length) return null; // not all query chars consumed

  score -= text.length * 0.01; // tiebreak: prefer shorter text
  score -= positions[0]! * 0.1; // penalize a leading gap (positions is non-empty here)
  return { score, positions };
}
