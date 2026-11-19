// Tests of the compact families of shapes: C_g (green or red) and C0_g (blue), every genus g from 1 to the largest
// genus the Gallery shows. No region is built here: the constructions are measured separately.

import { test } from "node:test";
import assert from "node:assert/strict";

import { CodedError, gcdBig } from "../../src/core/bigint_utils.mjs";
import { cellKey, compareCells, hexDistance, neighbourhood, boundingWindow } from "../../src/core/geometry.mjs";
import { genusOfCells, holeCount, isConnected } from "../../src/core/regions.mjs";
import { residueTest, isAdmissible } from "../../src/core/admissible.mjs";
import { primesUpTo } from "../../src/core/primes.mjs";
import { hexDisc, shapeS } from "../../src/core/shapes.mjs";
import { shapeC, shapeC0, seedC, seedC0, ringCells, ringsC, ringC0, holesC0 } from "../../src/core/shapes_compact.mjs";

// C_g is built by the green and red construction for every g <= GMAX (above it a row of the window has more than 40
// cells with a prescribed sign), C0_g by the blue construction for every g <= GMAX0.
const GMAX = 115;
const GMAX0 = 150;

// [g, cells, imin, imax, jmin, jmax] of C_g
const PIN_C = [
  [1, 6, -1, 1, -1, 1], [2, 44, -5, 5, -5, 5], [3, 46, -5, 5, -5, 5], [4, 48, -5, 5, -5, 5],
  [5, 50, -5, 5, -5, 5], [6, 52, -5, 5, -5, 5], [7, 54, -5, 5, -5, 5], [8, 82, -7, 7, -7, 7],
  [9, 86, -7, 7, -7, 7], [10, 90, -7, 7, -7, 7], [11, 94, -7, 7, -7, 7], [12, 98, -7, 7, -7, 7],
  [13, 102, -7, 7, -7, 7], [14, 140, -9, 9, -9, 9], [15, 142, -9, 9, -9, 9], [16, 144, -9, 9, -9, 9],
  [17, 146, -9, 9, -9, 9], [18, 148, -9, 9, -9, 9], [19, 150, -9, 9, -9, 9], [20, 188, -11, 11, -11, 11],
  [21, 190, -11, 11, -11, 11], [22, 192, -11, 11, -11, 11], [23, 194, -11, 11, -11, 11], [24, 196, -11, 11, -11, 11],
  [25, 198, -11, 11, -11, 11], [26, 208, -11, 11, -11, 11], [27, 212, -11, 11, -11, 11], [28, 216, -11, 11, -11, 11],
  [29, 220, -11, 11, -11, 11], [30, 224, -11, 11, -11, 11], [31, 228, -11, 11, -11, 11], [32, 236, -11, 11, -11, 11],
  [33, 238, -11, 11, -11, 11], [34, 240, -11, 11, -11, 11], [35, 242, -11, 11, -11, 11], [36, 244, -11, 11, -11, 11],
  [37, 246, -11, 11, -11, 11], [38, 285, -13, 13, -13, 13], [39, 288, -13, 13, -13, 13], [40, 291, -13, 13, -13, 13],
  [41, 294, -13, 13, -13, 13], [42, 297, -13, 13, -13, 13], [43, 300, -13, 13, -13, 13], [44, 307, -13, 13, -13, 13],
  [45, 308, -13, 13, -13, 13], [46, 309, -13, 13, -13, 13], [47, 310, -13, 13, -13, 13], [48, 311, -13, 13, -13, 13],
  [49, 312, -13, 13, -13, 13], [50, 322, -13, 13, -13, 13], [51, 326, -13, 13, -13, 13], [52, 330, -13, 13, -13, 13],
  [53, 334, -13, 13, -13, 13], [54, 338, -13, 13, -13, 13], [55, 342, -13, 13, -13, 13], [56, 428, -17, 17, -17, 17],
  [57, 430, -17, 17, -17, 17], [58, 432, -17, 17, -17, 17], [59, 434, -17, 17, -17, 17], [60, 436, -17, 17, -17, 17],
  [61, 438, -17, 17, -17, 17], [62, 447, -17, 17, -17, 17], [63, 450, -17, 17, -17, 17], [64, 453, -17, 17, -17, 17],
  [65, 456, -17, 17, -17, 17], [66, 459, -17, 17, -17, 17], [67, 462, -17, 17, -17, 17], [68, 475, -17, 17, -17, 17],
  [69, 482, -17, 17, -17, 17], [70, 489, -17, 17, -17, 17], [71, 496, -17, 17, -17, 17], [72, 503, -17, 17, -17, 17],
  [73, 510, -17, 17, -17, 17], [74, 518, -17, 17, -17, 17], [75, 520, -17, 17, -17, 17], [76, 522, -17, 17, -17, 17],
  [77, 524, -17, 17, -17, 17], [78, 526, -17, 17, -17, 17], [79, 528, -17, 17, -17, 17], [80, 536, -17, 17, -17, 17],
  [81, 538, -17, 17, -17, 17], [82, 540, -17, 17, -17, 17], [83, 542, -17, 17, -17, 17], [84, 544, -17, 17, -17, 17],
  [85, 546, -17, 17, -17, 17], [86, 597, -19, 19, -19, 19], [87, 600, -19, 19, -19, 19], [88, 603, -19, 19, -19, 19],
  [89, 606, -19, 19, -19, 19], [90, 609, -19, 19, -19, 19], [91, 612, -19, 19, -19, 19], [92, 619, -19, 19, -19, 19],
  [93, 620, -19, 19, -19, 19], [94, 621, -19, 19, -19, 19], [95, 622, -19, 19, -19, 19], [96, 623, -19, 19, -19, 19],
  [97, 624, -19, 19, -19, 19], [98, 633, -19, 19, -19, 19], [99, 636, -19, 19, -19, 19], [100, 639, -19, 19, -19, 19],
  [101, 642, -19, 19, -19, 19], [102, 645, -19, 19, -19, 19], [103, 648, -19, 19, -19, 19], [104, 655, -19, 19, -19, 19],
  [105, 656, -19, 19, -19, 19], [106, 657, -19, 19, -19, 19], [107, 658, -19, 19, -19, 19], [108, 659, -19, 19, -19, 19],
  [109, 660, -19, 19, -19, 19], [110, 670, -19, 19, -19, 19], [111, 674, -19, 19, -19, 19], [112, 678, -19, 19, -19, 19],
  [113, 682, -19, 19, -19, 19], [114, 686, -19, 19, -19, 19], [115, 690, -19, 19, -19, 19],
];
// [g, n, cells, imin, imax, jmin, jmax] of C0_g
const PIN_C0 = [
  [1, 3, 18, -2, 2, -2, 2], [2, 3, 17, -2, 2, -2, 2], [3, 5, 58, -4, 4, -4, 4], [4, 5, 57, -4, 4, -4, 4],
  [5, 5, 56, -4, 4, -4, 4], [6, 5, 55, -4, 4, -4, 4], [7, 7, 120, -6, 6, -6, 6], [8, 7, 119, -6, 6, -6, 6],
  [9, 7, 118, -6, 6, -6, 6], [10, 7, 117, -6, 6, -6, 6], [11, 7, 116, -6, 6, -6, 6], [12, 7, 115, -6, 6, -6, 6],
  [13, 7, 114, -6, 6, -6, 6], [14, 7, 113, -6, 6, -6, 6], [15, 7, 112, -6, 6, -6, 6], [16, 7, 111, -6, 6, -6, 6],
  [17, 7, 110, -6, 6, -6, 6], [18, 7, 109, -6, 6, -6, 6], [19, 9, 198, -8, 8, -8, 8], [20, 9, 197, -8, 8, -8, 8],
  [21, 9, 196, -8, 8, -8, 8], [22, 9, 195, -8, 8, -8, 8], [23, 9, 194, -8, 8, -8, 8], [24, 9, 193, -8, 8, -8, 8],
  [25, 9, 192, -8, 8, -8, 8], [26, 9, 191, -8, 8, -8, 8], [27, 11, 304, -10, 10, -10, 10], [28, 11, 303, -10, 10, -10, 10],
  [29, 11, 302, -10, 10, -10, 10], [30, 11, 301, -10, 10, -10, 10], [31, 11, 300, -10, 10, -10, 10], [32, 11, 299, -10, 10, -10, 10],
  [33, 11, 298, -10, 10, -10, 10], [34, 11, 297, -10, 10, -10, 10], [35, 11, 296, -10, 10, -10, 10], [36, 11, 295, -10, 10, -10, 10],
  [37, 11, 294, -10, 10, -10, 10], [38, 11, 293, -10, 10, -10, 10], [39, 11, 292, -10, 10, -10, 10], [40, 11, 291, -10, 10, -10, 10],
  [41, 11, 290, -10, 10, -10, 10], [42, 11, 289, -10, 10, -10, 10], [43, 11, 288, -10, 10, -10, 10], [44, 11, 287, -10, 10, -10, 10],
  [45, 11, 286, -10, 10, -10, 10], [46, 11, 285, -10, 10, -10, 10], [47, 11, 284, -10, 10, -10, 10], [48, 11, 283, -10, 10, -10, 10],
  [49, 11, 282, -10, 10, -10, 10], [50, 11, 281, -10, 10, -10, 10], [51, 11, 280, -10, 10, -10, 10], [52, 11, 279, -10, 10, -10, 10],
  [53, 11, 278, -10, 10, -10, 10], [54, 11, 277, -10, 10, -10, 10], [55, 13, 414, -12, 12, -12, 12], [56, 13, 413, -12, 12, -12, 12],
  [57, 13, 412, -12, 12, -12, 12], [58, 13, 411, -12, 12, -12, 12], [59, 13, 410, -12, 12, -12, 12], [60, 13, 409, -12, 12, -12, 12],
  [61, 13, 408, -12, 12, -12, 12], [62, 13, 407, -12, 12, -12, 12], [63, 13, 406, -12, 12, -12, 12], [64, 13, 405, -12, 12, -12, 12],
  [65, 13, 404, -12, 12, -12, 12], [66, 13, 403, -12, 12, -12, 12], [67, 13, 402, -12, 12, -12, 12], [68, 13, 401, -12, 12, -12, 12],
  [69, 13, 400, -12, 12, -12, 12], [70, 13, 399, -12, 12, -12, 12], [71, 13, 398, -12, 12, -12, 12], [72, 13, 397, -12, 12, -12, 12],
  [73, 13, 396, -12, 12, -12, 12], [74, 13, 395, -12, 12, -12, 12], [75, 13, 394, -12, 12, -12, 12], [76, 13, 393, -12, 12, -12, 12],
  [77, 13, 392, -12, 12, -12, 12], [78, 13, 391, -12, 12, -12, 12], [79, 13, 390, -12, 12, -12, 12], [80, 13, 389, -12, 12, -12, 12],
  [81, 13, 388, -12, 12, -12, 12], [82, 13, 387, -12, 12, -12, 12], [83, 17, 734, -16, 16, -16, 16], [84, 17, 733, -16, 16, -16, 16],
  [85, 17, 732, -16, 16, -16, 16], [86, 17, 731, -16, 16, -16, 16], [87, 17, 730, -16, 16, -16, 16], [88, 17, 729, -16, 16, -16, 16],
  [89, 17, 728, -16, 16, -16, 16], [90, 17, 727, -16, 16, -16, 16], [91, 17, 726, -16, 16, -16, 16], [92, 17, 725, -16, 16, -16, 16],
  [93, 17, 724, -16, 16, -16, 16], [94, 17, 723, -16, 16, -16, 16], [95, 17, 722, -16, 16, -16, 16], [96, 17, 721, -16, 16, -16, 16],
  [97, 17, 720, -16, 16, -16, 16], [98, 17, 719, -16, 16, -16, 16], [99, 17, 718, -16, 16, -16, 16], [100, 17, 717, -16, 16, -16, 16],
  [101, 17, 716, -16, 16, -16, 16], [102, 17, 715, -16, 16, -16, 16], [103, 17, 714, -16, 16, -16, 16], [104, 17, 713, -16, 16, -16, 16],
  [105, 17, 712, -16, 16, -16, 16], [106, 17, 711, -16, 16, -16, 16], [107, 17, 710, -16, 16, -16, 16], [108, 17, 709, -16, 16, -16, 16],
  [109, 17, 708, -16, 16, -16, 16], [110, 17, 707, -16, 16, -16, 16], [111, 17, 706, -16, 16, -16, 16], [112, 17, 705, -16, 16, -16, 16],
  [113, 17, 704, -16, 16, -16, 16], [114, 17, 703, -16, 16, -16, 16], [115, 17, 702, -16, 16, -16, 16], [116, 17, 701, -16, 16, -16, 16],
  [117, 17, 700, -16, 16, -16, 16], [118, 17, 699, -16, 16, -16, 16], [119, 17, 698, -16, 16, -16, 16], [120, 17, 697, -16, 16, -16, 16],
  [121, 17, 696, -16, 16, -16, 16], [122, 17, 695, -16, 16, -16, 16], [123, 17, 694, -16, 16, -16, 16], [124, 17, 693, -16, 16, -16, 16],
  [125, 17, 692, -16, 16, -16, 16], [126, 17, 691, -16, 16, -16, 16], [127, 17, 690, -16, 16, -16, 16], [128, 17, 689, -16, 16, -16, 16],
  [129, 17, 688, -16, 16, -16, 16], [130, 17, 687, -16, 16, -16, 16], [131, 17, 686, -16, 16, -16, 16], [132, 17, 685, -16, 16, -16, 16],
  [133, 17, 684, -16, 16, -16, 16], [134, 17, 683, -16, 16, -16, 16], [135, 17, 682, -16, 16, -16, 16], [136, 17, 681, -16, 16, -16, 16],
  [137, 17, 680, -16, 16, -16, 16], [138, 17, 679, -16, 16, -16, 16], [139, 17, 678, -16, 16, -16, 16], [140, 17, 677, -16, 16, -16, 16],
  [141, 17, 676, -16, 16, -16, 16], [142, 17, 675, -16, 16, -16, 16], [143, 19, 884, -18, 18, -18, 18], [144, 19, 883, -18, 18, -18, 18],
  [145, 19, 882, -18, 18, -18, 18], [146, 19, 881, -18, 18, -18, 18], [147, 19, 880, -18, 18, -18, 18], [148, 19, 879, -18, 18, -18, 18],
  [149, 19, 878, -18, 18, -18, 18], [150, 19, 877, -18, 18, -18, 18],
];

const mod = (a, p) => ((a % p) + p) % p;
const coprime = (a, b) => gcdBig(BigInt(a), BigInt(b)) === 1n;
const isSorted = (cells) => cells.every((c, k) => k === 0 || compareCells(cells[k - 1], c) < 0);
const keysOf = (cells) => new Set(cells.map(([i, j]) => cellKey(i, j)));
const has = (cells, [i, j]) => cells.some(([a, b]) => a === i && b === j);

const C = [null];
for (let g = 1; g <= GMAX; g++) C.push(shapeC(g));
const Z = [null];
for (let g = 1; g <= GMAX0; g++) Z.push(shapeC0(g));

test("the pinned tables cover every genus of the families", () => {
  assert.deepEqual(PIN_C.map((r) => r[0]), Array.from({ length: GMAX }, (_, k) => k + 1));
  assert.deepEqual(PIN_C0.map((r) => r[0]), Array.from({ length: GMAX0 }, (_, k) => k + 1));
  assert.ok(GMAX >= 25 && GMAX0 >= 25);
});

test("ringCells: ring d has the 6d cells at hex distance d, from (d, 0), each followed by its rotation by 60 degrees", () => {
  assert.deepEqual(ringCells(0), [[0, 0]]);
  for (let d = 1; d <= 12; d++) {
    const r = ringCells(d);
    assert.equal(r.length, 6 * d);
    assert.equal(keysOf(r).size, 6 * d);
    assert.deepEqual(r[0], [d, 0]);
    for (const [i, j] of r) assert.equal(hexDistance(i, j), d);
    // (i, j) -> (i - j, i) is the rotation by 60 degrees counterclockwise
    for (let k = 0; k < r.length; k++) {
      if (k % 6 === 5) continue;
      const [i, j] = r[k];
      assert.deepEqual(r[k + 1], [i - j, i]);
    }
  }
});

test("C_g: connected, genus g counted two ways, sorted, contains its seed, cells with gcd(i, j) = 1", () => {
  for (let g = 1; g <= GMAX; g++) {
    const s = C[g];
    assert.ok(isConnected(s), `C_${g} connected`);
    assert.equal(genusOfCells(s).genus, g, `C_${g} genus by 1 - chi`);
    assert.equal(holeCount(s), g, `C_${g} bounded components of the complement`);
    assert.ok(isSorted(s), `C_${g} sorted by (j, i)`);
    assert.deepEqual(seedC(g), [1, 0]);
    assert.ok(has(s, seedC(g)), `C_${g} contains its seed`);
    assert.ok(s.every(([i, j]) => coprime(i, j)), `C_${g} cells have gcd 1`);
    let r = 0;
    for (const [i, j] of s) r = Math.max(r, hexDistance(i, j));
    assert.ok(r <= ringsC(g), `C_${g} within the rings visited`);
    // no cell with exactly one neighbour is left
    const k = keysOf(s);
    for (const [i, j] of s) {
      const e = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].filter(([a, b]) => k.has(cellKey(i + a, j + b))).length;
      assert.notEqual(e, 1, `C_${g} has no cell with one neighbour`);
    }
  }
});

test("C_g: admissible by the residue test and by the sieved-set lemma (classes (0, 0), P = number of columns)", () => {
  for (let g = 1; g <= GMAX; g++) {
    const s = C[g];
    assert.ok(isAdmissible(s), `C_${g} residue test`);
    for (const rec of residueTest(s)) assert.deepEqual(rec.missed, [0, 0], `C_${g} misses (0, 0) mod ${rec.p}`);
    const b = boundingWindow(s, 0);
    const P = b.imax - b.imin + 1;
    for (const p of primesUpTo(P)) {
      assert.ok(!s.some(([i, j]) => mod(i, p) === 0 && mod(j, p) === 0), `C_${g} in V(P) at p = ${p}`);
    }
  }
});

test("C_g: deterministic, area and bounding box as pinned, different for different g", () => {
  const seen = new Set();
  for (const [g, area, imin, imax, jmin, jmax] of PIN_C) {
    const s = shapeC(g);
    assert.deepEqual(s, C[g], `C_${g} deterministic`);
    assert.equal(s.length, area, `C_${g} area`);
    assert.deepEqual(boundingWindow(s, 0), { imin, imax, jmin, jmax }, `C_${g} bounding box`);
    const key = JSON.stringify(s);
    assert.ok(!seen.has(key), `C_${g} differs from the shapes of smaller g`);
    seen.add(key);
  }
});

// The hole candidates for an odd n, counted directly over the disc (an independent count of the module's rule).
function candidateCount(n) {
  let c = 0;
  for (const [i, j] of hexDisc(n - 2)) if (mod(i, 2) === 1 && mod(j, 2) === 1 && coprime(i, j) && coprime(i + j, n)) c++;
  return c;
}

test("C0_g: the disc of radius n - 1 without g single-cell holes, n the smallest odd n with room for them", () => {
  for (let g = 1; g <= GMAX0; g++) {
    const n = ringC0(g);
    assert.equal(n % 2, 1);
    assert.ok(candidateCount(n) >= g, `C0_${g} room for g holes`);
    for (let m = 3; m < n; m += 2) assert.ok(candidateCount(m) < g, `C0_${g} no room for n = ${m}`);
    const holes = holesC0(g);
    assert.equal(holes.length, g);
    for (const [i, j] of holes) {
      assert.ok(mod(i, 2) === 1 && mod(j, 2) === 1 && coprime(i, j) && coprime(i + j, n), `C0_${g} hole (${i}, ${j})`);
      assert.ok(hexDistance(i, j) <= n - 2);
    }
    // the holes are the first g candidates in the spiral order
    const order = [];
    for (let d = 1; d <= n - 2 && order.length < g; d++) {
      for (const [i, j] of ringCells(d)) {
        if (order.length < g && mod(i, 2) === 1 && mod(j, 2) === 1 && coprime(i, j) && coprime(i + j, n)) order.push([i, j]);
      }
    }
    assert.deepEqual(holes, order.sort(compareCells), `C0_${g} holes in the spiral order`);
    const hk = keysOf(holes);
    assert.deepEqual(Z[g], hexDisc(n - 1).filter(([i, j]) => !hk.has(cellKey(i, j))), `C0_${g} = disc minus holes`);
  }
});

test("C0_g: connected, genus g counted two ways, sorted, contains its seed", () => {
  for (let g = 1; g <= GMAX0; g++) {
    const s = Z[g];
    assert.ok(isConnected(s), `C0_${g} connected`);
    assert.equal(genusOfCells(s).genus, g, `C0_${g} genus by 1 - chi`);
    assert.equal(holeCount(s), g, `C0_${g} bounded components of the complement`);
    assert.ok(isSorted(s), `C0_${g} sorted by (j, i)`);
    assert.deepEqual(seedC0(g), [0, 0]);
    assert.ok(has(s, seedC0(g)), `C0_${g} contains its seed`);
  }
});

test("C0_g: the neighbour set is the ring of distance n and the holes, and it is admissible", () => {
  for (let g = 1; g <= GMAX0; g++) {
    const n = ringC0(g);
    const N = neighbourhood(Z[g]);
    const want = ringCells(n).concat(holesC0(g)).sort(compareCells);
    assert.deepEqual(N, want, `C0_${g} N = ring of distance n and holes`);
    assert.ok(isAdmissible(N), `C0_${g} residue test on N`);
    // the classes named by the proof: (0, 0) for p not dividing n, (1, -1) for p dividing n
    for (const p of primesUpTo(Math.floor(Math.sqrt(N.length)))) {
      const [a, b] = n % p === 0 ? [1, p - 1] : [0, 0];
      assert.ok(!N.some(([i, j]) => mod(i, p) === a && mod(j, p) === b), `C0_${g} N misses (${a}, ${b}) mod ${p}`);
    }
  }
});

test("C0_g: deterministic, area and bounding box as pinned, different for different g", () => {
  const seen = new Set();
  for (const [g, n, area, imin, imax, jmin, jmax] of PIN_C0) {
    const s = shapeC0(g);
    assert.deepEqual(s, Z[g], `C0_${g} deterministic`);
    assert.equal(ringC0(g), n, `C0_${g} n`);
    assert.equal(s.length, area, `C0_${g} area`);
    assert.equal(area, 3 * n * (n - 1) + 1 - g);
    assert.deepEqual(boundingWindow(s, 0), { imin, imax, jmin, jmax }, `C0_${g} bounding box`);
    const key = JSON.stringify(s);
    assert.ok(!seen.has(key), `C0_${g} differs from the shapes of smaller g`);
    seen.add(key);
  }
});

test("genus 0 and a bad genus", () => {
  assert.deepEqual(shapeC(0), [[1, 0]]);
  assert.equal(ringsC(0), 0);
  assert.equal(ringC0(0), 3);
  assert.deepEqual(shapeC0(0), hexDisc(2));
  assert.equal(genusOfCells(shapeC0(0)).genus, 0);
  assert.ok(isAdmissible(neighbourhood(shapeC0(0))));
  for (const bad of [-1, 1.5, "3", null, undefined, NaN]) {
    let want = null;
    try {
      shapeS(bad);
    } catch (e) {
      want = e;
    }
    assert.ok(want instanceof CodedError);
    for (const f of [shapeC, shapeC0, ringsC, ringC0, holesC0]) {
      assert.throws(() => f(bad), (e) => e instanceof CodedError && e.code === want.code && e.message === want.message);
    }
  }
});
