// The cells of a closed polygon on the grid's integer offsets (i, j): the custom highlight of the Explorer (the address
// part b) and the squares of the Gallery.
//
// The rule, in the lattice coordinates (x, d) of the cells (the offsets i, j taken as plane coordinates, not the
// hexagons as drawn on screen): the corners c_0, ..., c_{n-1} are integer points, the polygon is closed (the edge
// c_{n-1} to c_0 belongs to it), and the cell (i, j) is highlighted exactly when the point (i, j) lies on one of the
// edges or inside the polygon by the even-odd rule (a ray from the point crosses the edges an odd number of times).
// One corner is one cell, two corners a segment (its integer points). Everything is exact integer arithmetic on
// offsets of small size (the limits below): no rounding, no bigint needed.

// At most this many corners.
export const POLYGON_CORNER_LIMIT = 16;
// The rectangle of the corners (the smallest i to the largest i, the smallest j to the largest j) holds at most this
// many cells: so at most this many cells are highlighted, and the test of every cell of the rectangle is cheap.
export const POLYGON_BOX_LIMIT = 4096;

// onEdge(p, a, b): the integer point p lies on the segment from a to b (a = b: p is that point)
function onEdge(p, a, b) {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  if (cross !== 0) return false;
  return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
}

// insideOrOn(p, corners): the integer point p lies on an edge of the closed polygon or inside it (even-odd rule, the
// ray from p towards growing i)
export function insideOrOn(p, corners) {
  let odd = false;
  const n = corners.length;
  for (let k = 0; k < n; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % n];
    if (onEdge(p, a, b)) return true;
    // the edge meets the row of p (half open in j, so a corner on that row counts once) to the right of p: the sign of
    // the cross product against the direction of the edge in j (never 0 here, p is not on the edge)
    if ((a[1] > p[1]) !== (b[1] > p[1])) {
      const c = (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]);
      if ((c > 0) === (b[1] > a[1])) odd = !odd;
    }
  }
  return odd;
}

// polygonCells(corners) is the list of the highlighted cells [i, j] of a closed polygon (corners: a list of integer
// pairs [i, j]), sorted by (j, i) as every list of cells, or null when the corners are not 1 to POLYGON_CORNER_LIMIT
// pairs of safe integers or their rectangle holds more than POLYGON_BOX_LIMIT cells.
export function polygonCells(corners) {
  if (!Array.isArray(corners) || corners.length < 1 || corners.length > POLYGON_CORNER_LIMIT) return null;
  for (const c of corners) if (!Array.isArray(c) || c.length !== 2 || !Number.isSafeInteger(c[0]) || !Number.isSafeInteger(c[1])) return null;
  const is = corners.map((c) => c[0]);
  const js = corners.map((c) => c[1]);
  const i0 = Math.min(...is);
  const i1 = Math.max(...is);
  const j0 = Math.min(...js);
  const j1 = Math.max(...js);
  const w = i1 - i0 + 1;
  const h = j1 - j0 + 1;
  if (w > POLYGON_BOX_LIMIT || h > POLYGON_BOX_LIMIT || w * h > POLYGON_BOX_LIMIT) return null;
  // (the products of insideOrOn are then at most POLYGON_BOX_LIMIT squared: exact)
  const out = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (insideOrOn([i, j], corners)) out.push([i, j]);
  return out;
}
