// The standard shapes and the checks that turn any user shape into a normalised cell list.
//
// S_g (green or red, g >= 1): spine (1, j) for 0 <= j <= 6g - 5, and for k = 0 .. g - 1 the cells (0, 6k + 1),
// (0, 6k - 1), (-1, 6k), (-1, 6k - 1). Area 10g - 4, genus g, hole k = the single cell (0, 6k). S_0 = {(1, 0)}.
// Z_g (blue, g >= 1): with D = 3g for g even and 3g + 1 for g odd, rails (0, j) and (2, j) for 0 <= j <= D and rungs
// (1, 3k) for k = 0 .. g. Genus g, hole k = the pair (1, 3k + 1), (1, 3k + 2). Z_0 = {(0, 0)}.

import { CodedError } from "./bigint_utils.mjs";
import { cellKey, compareCells, hexDistance } from "./geometry.mjs";
import { genusOfCells, isConnected } from "./regions.mjs";

const checkGenus = (g) => {
  if (!Number.isInteger(g) || g < 0) throw new CodedError("bad_format", `genus ${g} is not a nonnegative integer`);
};

// The cells of S_g, sorted by (j, i).
export function shapeS(g) {
  checkGenus(g);
  if (g === 0) return [[1, 0]];
  const out = [];
  for (let j = 0; j <= 6 * g - 5; j++) out.push([1, j]);
  for (let k = 0; k < g; k++) {
    out.push([0, 6 * k + 1], [0, 6 * k - 1], [-1, 6 * k], [-1, 6 * k - 1]);
  }
  return out.sort(compareCells);
}

// The cells of Z_g, sorted by (j, i).
export function shapeZ(g) {
  checkGenus(g);
  if (g === 0) return [[0, 0]];
  const D = g % 2 === 0 ? 3 * g : 3 * g + 1;
  const out = [];
  for (let j = 0; j <= D; j++) out.push([0, j], [2, j]);
  for (let k = 0; k <= g; k++) out.push([1, 3 * k]);
  return out.sort(compareCells);
}

// The seed cell of S_g: [1, 0].
export function seedS(g) {
  void g;
  return [1, 0];
}

// The seed cell of Z_g: [0, 0].
export function seedZ(g) {
  void g;
  return [0, 0];
}

// The hexagonal disc of radius R >= 0 around (0, 0): all (i, j) with max(|i|, |j|, |i - j|) <= R, sorted by (j, i).
// It has 3R(R + 1) + 1 cells.
export function hexDisc(R) {
  if (!Number.isInteger(R) || R < 0) throw new CodedError("bad_format", `radius ${R} is not a nonnegative integer`);
  const out = [];
  for (let j = -R; j <= R; j++) {
    for (let i = -R; i <= R; i++) if (hexDistance(i, j) <= R) out.push([i, j]);
  }
  return out;
}

const LIMIT = 1048576; // 2^20

const isPair = (c) => Array.isArray(c) && c.length === 2 && Number.isInteger(c[0]) && Number.isInteger(c[1]);

// normaliseShape({ shape, seed }) checks a shape (a list of integer pairs) and its seed and returns
// { cells (sorted by (j, i), fresh arrays), seed, genus, area }. Throws "bad_format" (not a list of integer pairs,
// or an empty list), "out_of_range" (|i| or |j| >= 2^20), "duplicate_cell", "seed_not_in_shape", "not_connected".
export function normaliseShape({ shape, seed } = {}) {
  if (!Array.isArray(shape) || shape.length === 0) throw new CodedError("bad_format", "shape is not a non-empty list");
  if (!shape.every(isPair)) throw new CodedError("bad_format", "shape is not a list of integer pairs [i, j]");
  if (!isPair(seed)) throw new CodedError("bad_format", "seed is not an integer pair [i, j]");
  for (const [i, j] of shape.concat([seed])) {
    if (Math.abs(i) >= LIMIT || Math.abs(j) >= LIMIT) throw new CodedError("out_of_range", `cell (${i}, ${j}) has a coordinate of size 2^20 or more`);
  }
  const keys = new Set();
  for (const [i, j] of shape) {
    const k = cellKey(i, j);
    if (keys.has(k)) throw new CodedError("duplicate_cell", `cell (${i}, ${j}) appears twice`);
    keys.add(k);
  }
  if (!keys.has(cellKey(seed[0], seed[1]))) throw new CodedError("seed_not_in_shape", `seed (${seed[0]}, ${seed[1]}) is not a cell of the shape`);
  const cells = shape.map(([i, j]) => [i, j]).sort(compareCells);
  if (!isConnected(cells)) throw new CodedError("not_connected", "the shape is not connected");
  return { cells, seed: [seed[0], seed[1]], genus: genusOfCells(cells).genus, area: cells.length };
}
