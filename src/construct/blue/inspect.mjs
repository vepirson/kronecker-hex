// Inspection of a finished blue construction: why a cell of the window has its colour.
//
// A cell of S is blue because some prime divides both of its coordinates: the prime of a class of step 1 that holds
// it (the smallest such prime when several classes hold it), or else its private prime of step 2. A cell of N(S)
// has coprime coordinates.

import { cellKey, neighbourhood } from "../../core/geometry.mjs";

const factsByResult = new WeakMap();

// The map cellKey -> facts of the window of a result, built once per result.
function factsOf(result) {
  let m = factsByResult.get(result);
  if (m) return m;
  m = new Map();
  for (const [i, j] of neighbourhood(result.shape)) m.set(cellKey(i, j), { kind: "coprime", prime: null });
  for (const { i, j, q } of result.privates) m.set(cellKey(i, j), { kind: "private", prime: q });
  for (let k = result.classes.length - 1; k >= 0; k--) {
    const { p, members } = result.classes[k];
    for (const [i, j] of members) m.set(cellKey(i, j), { kind: "class", prime: p });
  }
  factsByResult.set(result, m);
  return m;
}

// blueCellFacts(result, i, j) for the result of a blue construction returns { kind, prime }: kind "class" with the
// smallest prime whose class holds the cell, or kind "private" with the cell's private prime, for a cell of S, kind
// "coprime" with prime null for a cell of N(S), and null for a cell outside the window.
export function blueCellFacts(result, i, j) {
  const f = factsOf(result).get(cellKey(i, j));
  return f ? { kind: f.kind, prime: f.prime } : null;
}
