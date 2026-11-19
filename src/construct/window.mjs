// The window of a shape, shared by every kind of construction (step 0 of the Construction Lab).
//
// N = N(S) the cells adjacent to S and not in S, W = S u N. h = jmax - jmin + 1 and w = imax - imin + 1 are the
// extents of W, B = max(h, w, 7). Every prime above B exceeds every difference of coordinates inside W.

import { cellKey, compareCells, neighbourhood } from "../core/geometry.mjs";

// buildWindow(cells) for a normalised shape returns { S, N, W (sorted cells), sKeys (Set of cellKey), wKeys,
// bounds { imin, imax, jmin, jmax }, h, w, B, cols (sorted distinct i of W), rows (sorted distinct j of W) }.
export function buildWindow(cells) {
  const S = cells.map(([i, j]) => [i, j]).sort(compareCells);
  const N = neighbourhood(S);
  const W = S.concat(N).sort(compareCells);
  let imin = Infinity, imax = -Infinity, jmin = Infinity, jmax = -Infinity;
  for (const [i, j] of W) {
    if (i < imin) imin = i;
    if (i > imax) imax = i;
    if (j < jmin) jmin = j;
    if (j > jmax) jmax = j;
  }
  const cols = [...new Set(W.map((c) => c[0]))].sort((a, b) => a - b);
  const rows = [...new Set(W.map((c) => c[1]))].sort((a, b) => a - b);
  const h = jmax - jmin + 1;
  const w = imax - imin + 1;
  return {
    S, N, W,
    sKeys: new Set(S.map(([i, j]) => cellKey(i, j))),
    wKeys: new Set(W.map(([i, j]) => cellKey(i, j))),
    bounds: { imin, imax, jmin, jmax },
    h, w, B: Math.max(h, w, 7), cols, rows,
  };
}
