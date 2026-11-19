// The certified infinite regions as regions: their lines grouped by region, the half lines of type 0 that are whole
// regions, and the part of an infinite region inside a box, joined inside the box to the clicked cell, to the cells its
// fill found or to the lines of its region, so that two lines of one region stay outlined in a box that does not hold
// the place where they meet.

import { test } from "node:test";
import assert from "node:assert/strict";

import { CERTIFICATES, INFINITE_REGIONS, regionLines, lineCellsInRows, certificateAt, lineCell } from "../../src/core/infinite.mjs";
import { kronecker } from "../../src/core/kronecker.mjs";
import { NEIGHBOURS } from "../../src/core/geometry.mjs";
import { floodFill, cellColours, breadthFirst } from "../../src/core/regions.mjs";
import { boxRows, boxTest } from "../../src/render/hex_canvas.mjs";
import { fillRegion, windowRegion } from "../../src/workers/floodfill.worker.mjs";
import { windowBoxOf, seedsInBox } from "../../src/ui/pages/explore.mjs";

const onLine = (c, x, d) => {
  const hit = certificateAt(x, d);
  return hit !== null && regionLines(c.id).includes(hit);
};

test("the lines are grouped into eight regions, each line in one group, the lines of a group of one type and meeting", () => {
  assert.equal(INFINITE_REGIONS.length, 8);
  const all = INFINITE_REGIONS.flatMap((g) => g.lines);
  assert.deepEqual([...all].sort(), CERTIFICATES.map((c) => c.id).sort());
  assert.equal(new Set(all).size, all.length);
  for (const g of INFINITE_REGIONS) {
    const types = new Set(g.lines.map((id) => CERTIFICATES.find((c) => c.id === id).colour));
    assert.equal(types.size, 1, g.id);
    assert.deepEqual(regionLines(g.lines[0]).map((c) => c.id), [...g.lines]);
  }
  assert.deepEqual(regionLines("nothing"), []);
  // the three lines of type +1: the row d = 1 and the column x = 1 share (1, 1), the column and the half row d = -1,
  // x >= 0 share (1, -1), and these cells have type +1
  const plus = regionLines("row_d_1");
  assert.deepEqual(plus.map((c) => c.id), ["row_d_1", "col_x_1", "row_d_m1_right"]);
  for (const [x, d, a, b] of [[1n, 1n, "row_d_1", "col_x_1"], [1n, -1n, "col_x_1", "row_d_m1_right"]]) {
    assert.equal(kronecker(x, d), 1);
    const on = (id) => {
      const c = CERTIFICATES.find((q) => q.id === id);
      const cells = lineCellsInRows([c], 0n, 0n, [[Number(d), Number(x), Number(x)]]);
      return cells.length === 1;
    };
    assert.ok(on(a) && on(b), `${a} and ${b} meet at (${x}, ${d})`);
  }
});

test("each half line of type 0 is a whole region: no neighbour off the line has type 0 (t up to 3000), a fill stays on it", () => {
  for (const id of ["col_x_0_up", "col_x_0_down", "row_d_0_right", "row_d_0_left", "diag_up", "diag_down"]) {
    const c = CERTIFICATES.find((q) => q.id === id);
    assert.equal(c.colour, 0);
    const sign = c.from !== null ? 1n : -1n;
    const first = c.from !== null ? c.from : c.to;
    for (let k = 0n; k < 3000n; k++) {
      const [x, d] = lineCell(c, first + sign * k);
      assert.equal(kronecker(x, d), 0);
      for (const [di, dj] of NEIGHBOURS) {
        const nx = x + BigInt(di), nd = d + BigInt(dj);
        if (onLine(c, nx, nd)) continue;
        assert.notEqual(kronecker(nx, nd), 0, `${id}: neighbour (${nx}, ${nd}) of (${x}, ${d})`);
      }
    }
    const [x0, d0] = lineCell(c, first + sign * 5n);
    const ff = floodFill(x0, d0, 400);
    assert.equal(ff.complete, false);
    for (const [i, j] of ff.cells) assert.ok(onLine(c, x0 + BigInt(i), d0 + BigInt(j)), `${id}: (${i}, ${j}) off the line`);
  }
});

test("lineCellsInRows: the cells of the lines in given rows, exact by the formulas, with the ends of a half line", () => {
  const c = (id) => CERTIFICATES.find((q) => q.id === id);
  assert.deepEqual(lineCellsInRows([c("row_d_1")], 10n, 0n, [[0, -3, 3], [1, -2, 2]]), [[-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1]]);
  assert.deepEqual(lineCellsInRows([c("row_d_m1_right")], 0n, 0n, [[-1, -3, 3]]), [[0, -1], [1, -1], [2, -1], [3, -1]]);
  assert.deepEqual(lineCellsInRows([c("col_x_0_up")], 0n, 0n, [[1, -1, 1], [2, -1, 1], [3, 1, 4]]), [[0, 2]]);
  // the cell (5 + i, 3 + j) is on the diagonal x = d when i = j - 2: (3, 3) and (2, 2), both with t >= 2
  assert.deepEqual(lineCellsInRows([c("diag_up")], 5n, 3n, [[0, -5, 5], [-1, -5, 5], [-2, -5, 5]]), [[-2, 0], [-3, -1]]);
  // far from the origin: the same formulas
  const far = 10n ** 40n;
  assert.deepEqual(lineCellsInRows([c("row_d_1")], far, 1n, [[0, 0, 2]]), [[0, 0], [1, 0], [2, 0]]);
});

test("breadthFirst from several start cells: the cells joined inside the box to any of them", () => {
  // the region of type +1 of (20, 1), in the box of columns 0 .. 60 relative to it and rows -3 .. 3: from the start
  // cell alone the row d = -1 is not reached inside the box (it meets the row d = 1 only at x <= 1), with the cells of
  // the half row d = -1 as start cells it is
  const src = cellColours(20n, 1n);
  const inside = (i, j) => i >= 0 && i <= 60 && j >= -3 && j <= 3;
  const alone = breadthFirst(src, 1, { inside }).next().value;
  const rows = (cells) => new Set(cells.map(([, j]) => j + 1));
  assert.equal(rows(alone.cells).has(-1), false);
  const starts = lineCellsInRows(regionLines("row_d_1"), 20n, 1n, [[-2, 0, 60]]);
  const both = breadthFirst(src, 1, { inside, starts }).next().value;
  assert.equal(rows(both.cells).has(-1), true);
  for (const [i, j] of both.cells) assert.equal(kronecker(20n + BigInt(i), 1n + BigInt(j)), 1, "only cells of the region's type");
});

test("the part of an infinite region after a pan: two lines of one region in a box without their meeting place", () => {
  const width = 1280, height = 800, cell = 20;
  const fill = fillRegion({ id: 1, x: "20", d: "1", box: { cell, halfWidth: width, halfHeight: height } }, () => {});
  assert.equal(fill.result.infinite.id, "row_d_1");
  assert.equal(fill.result.infinite.visited, 1, "a click on a line is certified at once, by its formula");
  // the cells of the part in the row d = dWant inside the box (the start cell is kept also when it lies outside)
  const count = (flat, dWant, inside = () => true) => {
    let n = 0;
    for (let k = 0; k < flat.length; k += 2) if (1 + flat[k + 1] === dWant && inside(flat[k], flat[k + 1])) n++;
    return n;
  };
  for (const windows of [1, 3, 10]) {
    const at = [width / 2 - windows * width, height / 2];
    const before = windowRegion({ x: "20", d: "1", box: windowBoxOf({ width, height, cell, at }) }, () => {});
    assert.equal(count(before.window.flat, -1), 0, `${windows}: from the start cell alone the half row d = -1 is lost`);
    const box = windowBoxOf({ width, height, cell, at, grow: false });
    const after = windowRegion({ x: "20", d: "1", box, line: "row_d_1" }, () => {});
    const span = boxRows(box).find(([j]) => j === 0);
    const inside = boxTest(box);
    let want = 0;
    for (let i = span[1]; i <= span[2]; i++) if (inside(i, 0)) want++;
    assert.equal(count(after.window.flat, 1, inside), want, `${windows}: the whole row d = 1 across the box`);
    assert.ok(count(after.window.flat, -1, inside) >= want - 2, `${windows}: the half row d = -1 across the box too`);
    for (let k = 0; k < after.window.flat.length; k += 2) assert.equal(kronecker(20n + BigInt(after.window.flat[k]), 1n + BigInt(after.window.flat[k + 1])), 1);
  }
});

test("a half line of type 0: the part in any box is its cells in the box, the click on it is certified at once", () => {
  const fill = fillRegion({ id: 1, x: "7", d: "0", box: { cell: 10, halfWidth: 400, halfHeight: 300 } }, () => {});
  assert.equal(fill.result.infinite.id, "row_d_0_right");
  assert.equal(fill.result.infinite.visited, 1);
  const box = windowBoxOf({ width: 400, height: 300, cell: 10, at: [-2000, 150], grow: false });
  const part = windowRegion({ x: "7", d: "0", box, line: "row_d_0_right" }, () => {});
  const want = lineCellsInRows(regionLines("row_d_0_right"), 7n, 0n, boxRows(box)).filter(([i, j]) => boxTest(box)(i, j));
  const got = [];
  for (let k = 0; k < part.window.flat.length; k += 2) got.push([part.window.flat[k], part.window.flat[k + 1]]);
  // the start cell (0, 0) is always kept, the rest is the line in the box
  assert.deepEqual(got.filter(([i, j]) => !(i === 0 && j === 0)), want.filter(([i, j]) => !(i === 0 && j === 0)));
  assert.ok(want.length > 50, `${want.length} cells of the line in the box`);
});

test("the known cells of a fill as start cells: seedsInBox keeps the cells of the box, windowBoxOf without grow is the window", () => {
  const flat = Int32Array.from([0, 0, 5, 0, 500, 0, -3, 2]);
  const box = { cell: 10, halfWidth: 100, halfHeight: 100 };
  assert.deepEqual([...seedsInBox(flat, box)], [0, 0, 5, 0, -3, 2]);
  const g = windowBoxOf({ width: 400, height: 300, cell: 10, at: [-1000, 150] });
  const p = windowBoxOf({ width: 400, height: 300, cell: 10, at: [-1000, 150], grow: false });
  assert.ok(boxTest(g)(0, 0), "grown: holds the start cell");
  assert.equal(boxTest(p)(0, 0), false, "not grown: twice the window only");
  assert.deepEqual([p.cx, p.halfWidth, p.halfHeight], [1200, 401, 301]);
});
