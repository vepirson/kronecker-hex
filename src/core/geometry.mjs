// Geometry of the hexagonal grid on integer offsets (i, j): neighbours, keys, the cell order, windows, drawing.
//
// The cell with offset (i, j) is (x0 + i, d0 + j). Its six neighbours are (i +- 1, j), (i, j +- 1), (i + 1, j + 1)
// and (i - 1, j - 1). Every list of cells is kept sorted by (j, i) ascending (row first).

import { CodedError } from "./bigint_utils.mjs";

// The six neighbour steps [di, dj].
export const NEIGHBOURS = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].map((v) => Object.freeze(v)));

// sqrt(3) / 2, the vertical distance between neighbouring rows for unit spacing.
export const SQ3_2 = Math.sqrt(3) / 2;

const KEY_OFF = 16777216; // 2^24
const KEY_SPAN = 33554432; // 2^25

// One exact Number key for an offset with |i|, |j| < 2^24.
export function cellKey(i, j) {
  return (i + KEY_OFF) * KEY_SPAN + (j + KEY_OFF);
}

// The offset [i, j] of a key made by cellKey.
export function keyToCell(k) {
  const j = (k % KEY_SPAN) - KEY_OFF;
  const i = Math.floor(k / KEY_SPAN) - KEY_OFF;
  return [i, j];
}

// Comparator of the cell order: by j, then by i.
export function compareCells(a, b) {
  return a[1] - b[1] || a[0] - b[0];
}

// A new array with the cells sorted by (j, i) ascending (the input is not changed).
export function sortCells(cells) {
  return cells.slice().sort(compareCells);
}

// Hex distance of the offset (i, j) from (0, 0): max(|i|, |j|, |i - j|).
export function hexDistance(i, j) {
  return Math.max(Math.abs(i), Math.abs(j), Math.abs(i - j));
}

// N(S): the cells adjacent to a cell of S and not in S, sorted by (j, i).
export function neighbourhood(cells) {
  const set = new Set(cells.map(([i, j]) => cellKey(i, j)));
  const out = [];
  const seen = new Set();
  for (const [i, j] of cells) {
    for (const [di, dj] of NEIGHBOURS) {
      const k = cellKey(i + di, j + dj);
      if (set.has(k) || seen.has(k)) continue;
      seen.add(k);
      out.push([i + di, j + dj]);
    }
  }
  return out.sort(compareCells);
}

// Bounding box { imin, imax, jmin, jmax } of a non-empty cell list, widened by `margin` on every side (default 0).
// With margin 1 it is the box of S together with N(S).
export function boundingWindow(cells, margin = 0) {
  if (!cells || cells.length === 0) throw new CodedError("empty_shape", "boundingWindow of an empty list");
  let imin = Infinity, imax = -Infinity, jmin = Infinity, jmax = -Infinity;
  for (const [i, j] of cells) {
    if (i < imin) imin = i;
    if (i > imax) imax = i;
    if (j < jmin) jmin = j;
    if (j > jmax) jmax = j;
  }
  return { imin: imin - margin, imax: imax + margin, jmin: jmin - margin, jmax: jmax + margin };
}

// Screen position [x, y] (y pointing down) of the centre of cell (i, j) for spacing s between neighbouring centres
// (default 1): ((i - j / 2) s, -j s sqrt(3) / 2). Pointy-top hexagons of circumradius s / sqrt(3) tile around them.
export function centre(i, j, s = 1) {
  return [(i - j / 2) * s, -j * SQ3_2 * s];
}
