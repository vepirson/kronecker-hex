// Tests of the shape fixes: smallest removals for green and red (against a brute force), valid fixes for blue,
// named cases, determinism, shapes that can already be built, and the bounds.

import { test } from "node:test";
import assert from "node:assert/strict";

import { CodedError } from "../../src/core/bigint_utils.mjs";
import { NEIGHBOURS, cellKey, compareCells, neighbourhood } from "../../src/core/geometry.mjs";
import { isAdmissible, residueTest } from "../../src/core/admissible.mjs";
import { isConnected } from "../../src/core/regions.mjs";
import { shapeS, shapeZ, hexDisc } from "../../src/core/shapes.mjs";
import { fixShape, largestPiece } from "../../src/core/shape_fix.mjs";

// A small seeded generator of floats in [0, 1).
const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// A random connected shape of n cells, grown from (0, 0) one random neighbouring cell at a time.
const randomShape = (n, rand) => {
  const set = new Set([cellKey(0, 0)]);
  const cells = [[0, 0]];
  while (cells.length < n) {
    const [i, j] = cells[Math.floor(rand() * cells.length)];
    const [di, dj] = NEIGHBOURS[Math.floor(rand() * 6)];
    const k = cellKey(i + di, j + dj);
    if (set.has(k)) continue;
    set.add(k);
    cells.push([i + di, j + dj]);
  }
  return cells.sort(compareCells);
};

// The cells of S after a fix.
const apply = (cells, fix) => {
  const rm = new Set(fix.remove.map(([i, j]) => cellKey(i, j)));
  const out = cells.filter(([i, j]) => !rm.has(cellKey(i, j)));
  return out.concat(fix.add.map(([i, j]) => [i, j])).sort(compareCells);
};

const isSorted = (cells) => cells.every((c, k) => k === 0 || compareCells(cells[k - 1], c) < 0);

// The real test of a colour on a shape.
const buildable = (cells, colour) => isConnected(cells) && (colour === 0 ? isAdmissible(neighbourhood(cells)) : isAdmissible(cells));

// The checks every fix must pass: sorted lists, removed cells in S, added cells outside S, the result buildable.
const checkFix = (cells, colour, fix) => {
  assert.ok(fix !== null && !fix.none, "a fix is found");
  assert.ok(isSorted(fix.remove) && isSorted(fix.add));
  const s = new Set(cells.map(([i, j]) => cellKey(i, j)));
  assert.ok(fix.remove.every(([i, j]) => s.has(cellKey(i, j))));
  assert.ok(fix.add.every(([i, j]) => !s.has(cellKey(i, j))));
  assert.ok(fix.cutOff >= 0 && fix.cutOff <= fix.remove.length);
  const out = apply(cells, fix);
  assert.ok(out.length > 0 && buildable(out, colour), "the fixed shape passes the real test");
  return out;
};

// Brute force: the fewest cells whose removal leaves a non-empty, connected, admissible shape (subsets by size).
const fewestRemovals = (cells) => {
  const n = cells.length;
  for (let k = 0; k < n; k++) {
    const comb = Array.from({ length: k }, (_, t) => t);
    for (;;) {
      const drop = new Set(comb);
      const rest = cells.filter((_, v) => !drop.has(v));
      if (isConnected(rest) && isAdmissible(rest)) return k;
      let t = k - 1;
      while (t >= 0 && comb[t] === n - k + t) t--;
      if (t < 0) break;
      comb[t]++;
      for (let u = t + 1; u < k; u++) comb[u] = comb[u - 1] + 1;
    }
  }
  return Infinity;
};

const RHOMBUS = [[0, 0], [1, 0], [0, 1], [1, 1]];
const TWO = [[0, 0], [1, 0]];
const HEXAGON = hexDisc(1);
const RHOMBUS3 = [];
for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) RHOMBUS3.push([i, j]);
// Removing its one cell of the class (1, 1) mod 2 would cut it in two.
const CUT = [[1, 0], [2, 0], [0, 1], [1, 1], [0, 2]];
// Its smallest fix removes one cell and cuts a second one off: every way to keep the shape connected removes 3.
const CUT_OFF = [[0, 0], [1, 0], [2, 1], [3, 1], [2, 2], [4, 2]];

test("green and red fixes equal the fewest removals of a brute force", () => {
  const rand = rng(12345);
  let tested = 0;
  for (let t = 0; t < 260; t++) {
    const cells = randomShape(4 + Math.floor(rand() * 11), rand);
    for (const colour of [1, -1]) {
      const fix = fixShape(cells, colour);
      if (fix === null) {
        assert.ok(isAdmissible(cells));
        continue;
      }
      if (colour === 1) tested++;
      checkFix(cells, colour, fix);
      assert.equal(fix.add.length, 0);
      assert.equal(fix.exact, true);
      assert.equal(fix.reason, "remove_classes");
      assert.equal(fix.remove.length, fewestRemovals(cells), JSON.stringify(cells));
    }
  }
  assert.ok(tested >= 200, `${tested} shapes needed a fix`);
});

test("blue fixes pass the real test", () => {
  const rand = rng(31337);
  let tested = 0;
  for (let t = 0; t < 230; t++) {
    const cells = randomShape(1 + Math.floor(rand() * 40), rand);
    const fix = fixShape(cells, 0);
    if (fix === null) {
      assert.ok(isAdmissible(neighbourhood(cells)));
      continue;
    }
    tested++;
    checkFix(cells, 0, fix);
    assert.equal(fix.exact, false);
    assert.ok(["add_neighbours", "remove_next_to_neighbours"].includes(fix.reason));
    if (fix.reason === "add_neighbours") assert.equal(fix.remove.length, 0);
    else assert.equal(fix.add.length, 0);
  }
  assert.ok(tested >= 200, `${tested} shapes needed a fix`);
});

test("named cases", () => {
  // the rhombus hits the four classes mod 2: removing one cell of a class is enough
  const r = fixShape(RHOMBUS, 1);
  assert.deepEqual(r, { remove: [[0, 0]], add: [], cutOff: 0, exact: true, reason: "remove_classes", classes: [[2, 0, 0]] });
  // two cells in blue: their eight neighbours hit the four classes mod 2
  checkFix(TWO, 0, fixShape(TWO, 0));
  // the hexagon with its centre: removing the centre leaves a ring
  for (const colour of [1, -1]) {
    assert.deepEqual(fixShape(HEXAGON, colour), { remove: [[0, 0]], add: [], cutOff: 0, exact: true, reason: "remove_classes", classes: [[2, 0, 0]] });
  }
  // in blue: the two cells of N in the class (0, 1) mod 2 join the shape
  const hb = fixShape(HEXAGON, 0);
  checkFix(HEXAGON, 0, hb);
  assert.deepEqual(hb, { remove: [], add: [[-2, -1], [2, 1]], cutOff: 0, exact: false, reason: "add_neighbours", classes: [[2, 0, 1]] });
  // the 3 x 3 rhombus fails at 2 and at 3, one class of each is emptied
  const failing = residueTest(RHOMBUS3).filter((x) => x.missed === null).map((x) => x.p);
  assert.deepEqual(failing, [2, 3]);
  const f3 = fixShape(RHOMBUS3, 1);
  checkFix(RHOMBUS3, 1, f3);
  assert.deepEqual(f3.classes.map((c) => c[0]), [2, 3]);
  assert.equal(f3.remove.length, fewestRemovals(RHOMBUS3));
  // in blue its fourteen neighbours already miss a class mod 2 and mod 3
  assert.equal(fixShape(RHOMBUS3, 0), null);
  // the class with one cell would cut the shape in two: the fix empties a class of two cells instead
  const fc = fixShape(CUT, 1);
  checkFix(CUT, 1, fc);
  assert.equal(fc.remove.length, 2);
  assert.equal(fc.cutOff, 0);
  // here the smallest fix removes a cell and the one cell it cuts off
  const fo = fixShape(CUT_OFF, 1);
  assert.deepEqual(fo, { remove: [[0, 0], [1, 0]], add: [], cutOff: 1, exact: true, reason: "remove_classes", classes: [[2, 1, 0]] });
  assert.equal(fewestRemovals(CUT_OFF), 2);
});

test("the same shape in another order gives the same fix", () => {
  const rand = rng(7);
  for (let t = 0; t < 40; t++) {
    const cells = randomShape(5 + Math.floor(rand() * 30), rand);
    const shuffled = cells.map((c) => [c[0], c[1]]);
    for (let k = shuffled.length - 1; k > 0; k--) {
      const u = Math.floor(rand() * (k + 1));
      [shuffled[k], shuffled[u]] = [shuffled[u], shuffled[k]];
    }
    shuffled.push([cells[0][0], cells[0][1]]);
    for (const colour of [1, -1, 0]) assert.deepEqual(fixShape(shuffled, colour), fixShape(cells, colour));
  }
});

test("shapes that can be built give null, other inputs", () => {
  for (const colour of [1, -1, 0]) assert.equal(fixShape([[3, -2]], colour), null);
  for (const g of [1, 2, 5]) {
    assert.equal(fixShape(shapeS(g), 1), null);
    assert.equal(fixShape(shapeS(g), -1), null);
    assert.equal(fixShape(shapeZ(g), 0), null);
  }
  assert.deepEqual(fixShape([], 1), { none: true, reason: "empty" });
  assert.deepEqual(fixShape([[0, 0], [5, 5]], 0), { none: true, reason: "not_connected" });
  assert.throws(() => fixShape(RHOMBUS, 2), (e) => e instanceof CodedError && e.code === "bad_format");
  assert.throws(() => fixShape([[0, 0.5]], 1), (e) => e instanceof CodedError && e.code === "bad_format");
  // largestPiece keeps the first of two pieces of equal size
  assert.deepEqual(largestPiece([[0, 0], [5, 0], [0, 1], [5, 1]]), [[0, 0], [0, 1]]);
});

test("lowered bounds: the greedy path and the change limit", () => {
  const rand = rng(99);
  for (let t = 0; t < 30; t++) {
    const cells = randomShape(10 + Math.floor(rand() * 60), rand);
    for (const colour of [1, 0]) {
      const full = fixShape(cells, colour);
      const greedy = fixShape(cells, colour, { maxChoices: 1 });
      if (full === null) {
        assert.equal(greedy, null);
        continue;
      }
      if (greedy.none) {
        assert.equal(greedy.reason, "no_fix");
        continue;
      }
      checkFix(cells, colour, greedy);
      assert.equal(greedy.exact, false);
      if (colour === 1) assert.ok(greedy.remove.length >= full.remove.length);
    }
  }
  // a change limit below every candidate leaves no fix
  assert.deepEqual(fixShape(HEXAGON, 0, { maxChange: 0 }), { none: true, reason: "no_fix" });
  // the greedy path on a large shape still passes the real test
  const big = randomShape(400, rng(4242));
  for (const colour of [1, 0]) {
    const g = fixShape(big, colour, { maxChoices: 1 });
    checkFix(big, colour, g);
    assert.equal(g.exact, false);
  }
});
