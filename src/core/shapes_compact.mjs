// The compact shapes of every genus: the families C_g (green or red) and C0_g (blue).
//
// Spiral order: with u_0 .. u_5 = (1, 0), (1, 1), (0, 1), (-1, 0), (-1, -1), (0, -1) (counterclockwise), ring d >= 1 is
// the set of the 6d cells d u_k + t u_(k+2) (k = 0 .. 5, t = 0 .. d - 1, indices mod 6) at hex distance d from (0, 0),
// listed by t and then by k, so that the six rotations of a cell by 60 degrees come one after the other. Ring 0 is
// (0, 0). The spiral order lists ring 0, ring 1, ring 2, ...
//
// C_g (green or red, g >= 1): visit the cells (i, j) with gcd(i, j) = 1 in the spiral order. The first one, (1, 0),
// is added, and a later one is added when it touches a cell added before it and the genus stays at most g. The visit
// stops as soon as the genus is g. Then the cells with exactly one neighbour in the shape are removed until there is
// none (this changes neither the genus nor the connectivity). C_0 = {(1, 0)}.
// Every cell has gcd(i, j) = 1, so C_g misses the class (0, 0) modulo every prime p: it is admissible, and it is a
// subset of the sieved set V(P, (0, 0)) for every P, in particular for P = its number of columns (Lemma 10).
//
// C0_g (blue, g >= 0): a hole candidate for an odd n >= 3 is a cell (i, j) with i and j odd, gcd(i, j) = 1,
// gcd(i + j, n) = 1 and hex distance at most n - 2. n = the smallest odd n >= 3 with at least g hole candidates, and
// C0_g = the hexagonal disc of radius n - 1 without the first g hole candidates in the spiral order (its holes).
// N(C0_g) = the ring of distance n and the g holes. For a prime p not dividing n it misses the class (0, 0): a cell
// of the ring has gcd(i, j) dividing n, and a hole has gcd(i, j) = 1. For a prime p dividing n (so p is odd) it misses
// the class (1, -1): a cell of the ring is t u modulo p for a step u, so it lies on one of the lines i = 0, j = 0,
// i = j modulo p, which do not contain (1, -1), and a hole has i + j not divisible by p. The holes are pairwise not
// adjacent (both coordinates odd) and not adjacent to the ring, so C0_g is connected and has exactly g holes, each a
// single cell.

import { CodedError, gcdBig } from "./bigint_utils.mjs";
import { cellKey, compareCells } from "./geometry.mjs";
import { hexDisc } from "./shapes.mjs";

const checkGenus = (g) => {
  if (!Number.isInteger(g) || g < 0) throw new CodedError("bad_format", `genus ${g} is not a nonnegative integer`);
};

// u_0 .. u_5, counterclockwise from (1, 0). Two consecutive steps are neighbours of each other.
const TURN = [[1, 0], [1, 1], [0, 1], [-1, 0], [-1, -1], [0, -1]];

const coprime = (i, j) => gcdBig(BigInt(i), BigInt(j)) === 1n;

// The cells of ring d >= 0 in the spiral order: d u_k + t u_(k+2) by t = 0 .. d - 1, then k = 0 .. 5.
export function ringCells(d) {
  if (!Number.isInteger(d) || d < 0) throw new CodedError("bad_format", `ring ${d} is not a nonnegative integer`);
  if (d === 0) return [[0, 0]];
  const out = [];
  for (let t = 0; t < d; t++) {
    for (let k = 0; k < 6; k++) {
      const [ci, cj] = TURN[k];
      const [si, sj] = TURN[(k + 2) % 6];
      out.push([d * ci + t * si, d * cj + t * sj]);
    }
  }
  return out;
}

// The change of the genus (1 - chi) when the cell (i, j), not in the set, is added to it: e - t - 1 with e the
// neighbours in the set and t the pairs of consecutive neighbours (in the order of TURN) that are both in it.
function genusStep(set, i, j) {
  const occ = TURN.map(([a, b]) => set.has(cellKey(i + a, j + b)));
  let e = 0, t = 0;
  for (let k = 0; k < 6; k++) {
    if (occ[k]) e++;
    if (occ[k] && occ[(k + 1) % 6]) t++;
  }
  return { e, step: e - t - 1 };
}

// The growth of C_g (g >= 1) before the removal of the cells with one neighbour: { rings (the ring of the last added
// cell), cells }. Throws "not_reached" if the genus g is not met by the end of ring 2g + 10 (never seen: a guard).
function growC(g) {
  const set = new Set([cellKey(1, 0)]);
  const cells = [[1, 0]];
  let genus = 0;
  for (let d = 1; d <= 2 * g + 10; d++) {
    for (const [i, j] of ringCells(d)) {
      if (set.has(cellKey(i, j)) || !coprime(i, j)) continue;
      const { e, step } = genusStep(set, i, j);
      if (e === 0 || genus + step > g) continue;
      set.add(cellKey(i, j));
      cells.push([i, j]);
      genus += step;
      if (genus === g) return { rings: d, cells };
    }
  }
  throw new CodedError("not_reached", `the growth of C_${g} did not reach genus ${g}`);
}

// Remove the cells with exactly one neighbour in the set until there is none, all those of a round at once (so the
// result does not depend on an order; for a set with a cycle it is the same as removing them one at a time).
function pruneLeaves(cells) {
  const set = new Set(cells.map(([i, j]) => cellKey(i, j)));
  let live = cells;
  for (;;) {
    const leaves = live.filter(([i, j]) => TURN.filter(([a, b]) => set.has(cellKey(i + a, j + b))).length === 1);
    if (leaves.length === 0) return live;
    for (const [i, j] of leaves) set.delete(cellKey(i, j));
    live = live.filter(([i, j]) => set.has(cellKey(i, j)));
  }
}

// The ring of the last cell added in the growth of C_g (0 for g = 0): every cell of C_g has hex distance at most this.
export function ringsC(g) {
  checkGenus(g);
  return g === 0 ? 0 : growC(g).rings;
}

// The cells of C_g, sorted by (j, i).
export function shapeC(g) {
  checkGenus(g);
  if (g === 0) return [[1, 0]];
  return pruneLeaves(growC(g).cells).sort(compareCells);
}

// The seed cell of C_g: [1, 0].
export function seedC(g) {
  void g;
  return [1, 0];
}

// The hole candidates for the odd n >= 3, in the spiral order: i and j odd, gcd(i, j) = 1, gcd(i + j, n) = 1, hex
// distance at most n - 2.
function holeCandidates(n) {
  const out = [];
  for (let d = 1; d <= n - 2; d++) {
    for (const [i, j] of ringCells(d)) {
      if ((i & 1) && (j & 1) && coprime(i, j) && coprime(i + j, n)) out.push([i, j]);
    }
  }
  return out;
}

// The odd n of C0_g (C0_g is the disc of radius n - 1 with holes, N(C0_g) contains the ring of distance n): the
// smallest odd n >= 3 with at least g hole candidates.
export function ringC0(g) {
  checkGenus(g);
  let n = 3;
  while (holeCandidates(n).length < g) n += 2;
  return n;
}

// The g holes of C0_g, sorted by (j, i).
export function holesC0(g) {
  const n = ringC0(g);
  return holeCandidates(n).slice(0, g).sort(compareCells);
}

// The cells of C0_g, sorted by (j, i).
export function shapeC0(g) {
  const n = ringC0(g);
  const holes = new Set(holeCandidates(n).slice(0, g).map(([i, j]) => cellKey(i, j)));
  return hexDisc(n - 1).filter(([i, j]) => !holes.has(cellKey(i, j)));
}

// The seed cell of C0_g: [0, 0] (never a hole: gcd(0, 0) = 0).
export function seedC0(g) {
  void g;
  return [0, 0];
}
