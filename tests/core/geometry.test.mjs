// Tests of the grid core: geometry, regions and flood fill, admissibility, shapes.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { CodedError } from "../../src/core/bigint_utils.mjs";
import { kronecker } from "../../src/core/kronecker.mjs";
import {
  NEIGHBOURS, SQ3_2, cellKey, keyToCell, sortCells, compareCells, hexDistance, neighbourhood, boundingWindow, centre,
} from "../../src/core/geometry.mjs";
import { genusOfCells, holeCount, isConnected, perimeter, floodFill, floodFillIter, colourName } from "../../src/core/regions.mjs";
import { residueTest, isAdmissible } from "../../src/core/admissible.mjs";
import { shapeS, shapeZ, seedS, seedZ, hexDisc, normaliseShape } from "../../src/core/shapes.mjs";

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), "ascii"));
const vectors = readJson("../fixtures/core_vectors.json");
const SHAPES = {
  c100: readJson("../../data/shapes/c100.json"),
  genus0_hexagon: readJson("../../data/shapes/genus0_hexagon.json"),
  hexagon_genus117: readJson("../../data/shapes/hexagon_genus117.json"),
};
// Perimeters of the three shipped shapes as published with them.
const PERIMETER = { c100: 1570, genus0_hexagon: 1758, hexagon_genus117: 1840 };

const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof CodedError && e.code === code);
const isSorted = (cells) => cells.every((c, k) => k === 0 || compareCells(cells[k - 1], c) < 0);
const sameSet = (a, b) => {
  if (a.length !== b.length) return false;
  const s = new Set(a.map(([i, j]) => cellKey(i, j)));
  return b.every(([i, j]) => s.has(cellKey(i, j)));
};

test("geometry helpers", () => {
  assert.equal(NEIGHBOURS.length, 6);
  for (const [i, j] of [[0, 0], [5, -7], [-16777215, 16777215], [16777215, -16777215]]) {
    assert.deepEqual(keyToCell(cellKey(i, j)), [i, j]);
  }
  assert.deepEqual(sortCells([[2, 1], [0, 1], [5, 0], [-1, 2]]), [[5, 0], [0, 1], [2, 1], [-1, 2]]);
  assert.equal(hexDistance(3, -2), 5);
  assert.equal(hexDistance(3, 2), 3);
  assert.equal(hexDistance(-1, -4), 4);
  const n1 = neighbourhood([[0, 0]]);
  assert.deepEqual(n1, [[-1, -1], [0, -1], [-1, 0], [1, 0], [0, 1], [1, 1]]);
  assert.deepEqual(boundingWindow([[0, 0], [2, -1]], 1), { imin: -1, imax: 3, jmin: -2, jmax: 1 });
  throwsCode(() => boundingWindow([]), "empty_shape");
  assert.deepEqual(centre(2, 0, 10), [20, -0]);
  const [x, y] = centre(1, 2, 1);
  assert.equal(x, 0);
  assert.ok(Math.abs(y + 2 * SQ3_2) < 1e-12);
  // the six neighbours of a cell are at distance s from its centre
  for (const [di, dj] of NEIGHBOURS) {
    const [cx, cy] = centre(di, dj, 3);
    assert.ok(Math.abs(Math.hypot(cx, cy) - 3) < 1e-12);
  }
});

test("the 7 known regions by flood fill", () => {
  for (const r of vectors.regions) {
    const ff = floodFill(BigInt(r.x), BigInt(r.d), 200000);
    assert.equal(ff.complete, true);
    assert.equal(ff.colour, r.colour);
    assert.equal(ff.colourName, colourName(r.colour));
    assert.equal(ff.area, r.area);
    assert.equal(ff.genus, r.genus);
    assert.ok(isSorted(ff.cells), "cells sorted by (j, i)");
    assert.equal(holeCount(ff.cells), r.genus, "holes = genus");
    assert.ok(isConnected(ff.cells));
    for (const [i, j] of ff.cells) assert.equal(kronecker(BigInt(r.x) + BigInt(i), BigInt(r.d) + BigInt(j)), r.colour);
  }
});

test("shape combinatorics of S_g and Z_g, g = 0 .. 60", () => {
  for (const [g, area, genus] of vectors.shapes.S) {
    const s = shapeS(g);
    assert.equal(s.length, area);
    assert.equal(genusOfCells(s).genus, genus);
    assert.equal(genus, g);
    assert.equal(area, g === 0 ? 1 : 10 * g - 4);
    assert.ok(isSorted(s));
    if (g <= 20) assert.equal(holeCount(s), g);
  }
  for (const [g, area, genus] of vectors.shapes.Z) {
    const z = shapeZ(g);
    assert.equal(z.length, area);
    assert.equal(genusOfCells(z).genus, genus);
    assert.equal(genus, g);
    assert.ok(isSorted(z));
    if (g <= 20) assert.equal(holeCount(z), g);
  }
  assert.deepEqual(seedS(3), [1, 0]);
  assert.deepEqual(seedZ(3), [0, 0]);
});

test("big coordinates", () => {
  const [a, b] = vectors.big.single;
  assert.equal(kronecker(BigInt(a.x), BigInt(a.d)), a.colour);
  const fa = floodFill(BigInt(a.x), BigInt(a.d), a.cap);
  assert.equal(fa.complete, a.complete);
  assert.equal(fa.area, a.area);
  assert.equal(fa.genus, null);
  assert.equal(kronecker(BigInt(b.x), BigInt(b.d)), b.colour);
  const fb = floodFill(BigInt(b.x), BigInt(b.d), b.cap);
  assert.equal(fb.complete, b.complete);
  assert.equal(fb.area, b.area);
  assert.equal(fb.genus, b.genus);
  const base = vectors.regions[0];
  const baseFill = floodFill(BigInt(base.x), BigInt(base.d));
  for (const t of vectors.big.transported) {
    const ff = floodFill(BigInt(t.x), BigInt(t.d), 10000);
    assert.equal(ff.complete, true, t.name);
    assert.equal(ff.colour, t.colour, t.name);
    assert.equal(ff.area, t.area, t.name);
    assert.equal(ff.genus, t.genus, t.name);
    assert.deepEqual(ff.cells, baseFill.cells, t.name);
  }
});

test("cap behaviour and the incremental flood fill", () => {
  const c = vectors.cap;
  const ff = floodFill(BigInt(c.x), BigInt(c.d), c.cap);
  assert.equal(ff.complete, c.complete);
  assert.equal(ff.area, c.area);
  assert.equal(ff.genus, null);
  assert.equal(ff.chi, null);
  let yields = 0;
  for (const r of vectors.regions) {
    const it = floodFillIter(BigInt(r.x), BigInt(r.d), 200000, vectors.incremental.yieldEvery);
    let s = it.next();
    while (!s.done) {
      yields++;
      assert.ok(Number.isInteger(s.value.cells) && Number.isInteger(s.value.symbols) && Number.isInteger(s.value.rows));
      s = it.next();
    }
    assert.deepEqual(s.value, floodFill(BigInt(r.x), BigInt(r.d), 200000));
  }
  assert.equal(yields, vectors.incremental.yields);
});

test("genus by chi = holeCount, perimeter, connectivity on the shipped shapes", () => {
  for (const [name, sh] of Object.entries(SHAPES)) {
    assert.equal(sh.shape.length, sh.area, name);
    assert.ok(isSorted(sh.shape), name);
    const g = genusOfCells(sh.shape);
    assert.equal(g.genus, sh.genus, name);
    assert.equal(holeCount(sh.shape), sh.genus, name);
    assert.equal(perimeter(sh.shape), PERIMETER[name], name);
    assert.ok(isConnected(sh.shape), name);
    const n = normaliseShape({ shape: sh.shape, seed: sh.seed });
    assert.deepEqual(n, { cells: sh.shape, seed: sh.seed, genus: sh.genus, area: sh.area });
  }
  assert.equal(perimeter([[0, 0]]), 6);
  assert.equal(perimeter([[0, 0], [1, 0]]), 10);
  assert.equal(isConnected([]), false);
  assert.equal(isConnected([[0, 0], [2, 0]]), false);
  assert.equal(isConnected([[0, 0], [1, 1]]), true);
  assert.equal(isConnected([[0, 0], [1, -1]]), false);
});

test("residueTest: the three shipped shapes are admissible, a 2 x 2 block fails at p = 2", () => {
  for (const [name, sh] of Object.entries(SHAPES)) {
    const recs = residueTest(sh.shape);
    const primes = recs.map((r) => r.p);
    const want = [];
    for (let p = 2; p * p <= sh.shape.length; p++) if (![...Array(p).keys()].slice(2).some((f) => p % f === 0)) want.push(p);
    assert.deepEqual(primes, want, name);
    for (const r of recs) {
      assert.notEqual(r.missed, null, `${name} p = ${r.p}`);
      const [a, b] = r.missed;
      assert.ok(!sh.shape.some(([i, j]) => ((i % r.p) + r.p) % r.p === a && ((j % r.p) + r.p) % r.p === b));
      assert.ok(r.classesHit < r.p * r.p);
    }
    assert.equal(isAdmissible(sh.shape), true, name);
  }
  const block = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const recs = residueTest(block);
  assert.equal(recs.length, 1);
  assert.deepEqual(recs[0], { p: 2, classesHit: 4, missed: null, singletons: [[0, 0], [1, 0], [0, 1], [1, 1]] });
  assert.equal(isAdmissible(block), false);
  // a row of 4 cells misses the classes with b != 0 mod 2
  assert.deepEqual(residueTest([[0, 0], [1, 0], [2, 0], [3, 0]]), [{ p: 2, classesHit: 2, missed: [0, 1] }]);
  assert.deepEqual(residueTest([[0, 0], [1, 0], [2, 0]]), []);
  for (let g = 1; g <= 10; g++) assert.equal(isAdmissible(shapeS(g)), true, `S_${g}`);
});

test("hexDisc and normaliseShape checks", () => {
  for (let R = 0; R <= 6; R++) {
    const d = hexDisc(R);
    assert.equal(d.length, 3 * R * (R + 1) + 1);
    assert.ok(isSorted(d));
    assert.equal(genusOfCells(d).genus, 0);
  }
  const n = normaliseShape({ shape: [[1, 1], [0, 0], [1, 0]], seed: [1, 0] });
  assert.deepEqual(n, { cells: [[0, 0], [1, 0], [1, 1]], seed: [1, 0], genus: 0, area: 3 });
  throwsCode(() => normaliseShape({ shape: [], seed: [0, 0] }), "bad_format");
  throwsCode(() => normaliseShape({ shape: [[0, 0.5]], seed: [0, 0] }), "bad_format");
  throwsCode(() => normaliseShape({ shape: [[0, 0]], seed: [0] }), "bad_format");
  throwsCode(() => normaliseShape({ shape: [[0, 1048576]], seed: [0, 1048576] }), "out_of_range");
  throwsCode(() => normaliseShape({ shape: [[0, 0], [0, 0]], seed: [0, 0] }), "duplicate_cell");
  throwsCode(() => normaliseShape({ shape: [[0, 0], [1, 0]], seed: [2, 0] }), "seed_not_in_shape");
  throwsCode(() => normaliseShape({ shape: [[0, 0], [2, 0]], seed: [0, 0] }), "not_connected");
  const s5 = normaliseShape({ shape: shapeS(5), seed: seedS(5) });
  assert.equal(s5.genus, 5);
  assert.equal(s5.area, 46);
  assert.ok(sameSet(s5.cells, shapeS(5)));
});
