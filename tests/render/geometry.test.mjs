// Pure geometry of the hex canvas: toScreen and cellAt are inverse on a grid of cells and zooms, the hit test near
// cell edges, the fitted window (pad 3.5), and the rows of a window.

import { test } from "node:test";
import assert from "node:assert/strict";
import { centre, SQ3_2 } from "../../src/core/geometry.mjs";
import { makeTransform, nearestCell, planeOf, fittedWindow, visibleRows, centreFirst, DEFAULT_PAD, fillRadius } from "../../src/render/hex_canvas.mjs";

test("planeOf agrees with the core's centre(i, j)", () => {
  for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) assert.deepEqual(planeOf(i, j), centre(i, j, 1));
});

test("cellAt(toScreen(i, j)) = (i, j) on a grid of cells, origins and zooms", () => {
  let n = 0;
  for (const cell of [4, 5.5, 9.25, 12, 22, 37.7, 61.3, 160]) {
    for (const [originX, originY] of [[0, 0], [640.5, 400.25], [-12345.6, 9876.5]]) {
      const t = makeTransform({ originX, originY, cell });
      for (let j = -40; j <= 40; j += 3) {
        for (let i = -60; i <= 60; i += 4) {
          const [X, Y] = t.toScreen(i, j);
          assert.deepEqual(t.cellAt(X, Y), [i, j]);
          n++;
        }
      }
    }
  }
  assert.ok(n > 10000);
});

test("cellAt is the nearest centre: points just inside the hexagon edge", () => {
  const t = makeTransform({ originX: 100, originY: 100, cell: 20 });
  const R = 20 / Math.sqrt(3);
  for (const [i, j] of [[0, 0], [3, -2], [-5, 4]]) {
    const [X, Y] = t.toScreen(i, j);
    for (let k = 0; k < 12; k++) {
      const a = (Math.PI / 6) * k;
      // 0.86 R is inside the inscribed circle (radius R sqrt(3) / 2 = 0.866 R)
      assert.deepEqual(t.cellAt(X + 0.86 * R * Math.cos(a), Y + 0.86 * R * Math.sin(a)), [i, j]);
    }
  }
  assert.deepEqual(nearestCell(0.49, 0), [0, 0]);
  assert.deepEqual(nearestCell(0.51, 0), [1, 0]);
  assert.deepEqual(nearestCell(-0.5, -SQ3_2), [0, 1]);
});

test("fittedWindow of one cell, cell 12, pad 3.5", () => {
  const fw = fittedWindow({ imin: 0, imax: 0, jmin: 0, jmax: 0 }, 12, 3.5);
  // width: 12 (one hexagon) + 2 * 3.5 * 12 = 96. height: 2R + 2 * 3.5 * (sqrt(3) / 2) * 12 = 86.60 -> 87
  assert.equal(fw.width, 96);
  assert.equal(fw.height, 87);
  assert.equal(fw.originX, 48);
  assert.ok(Math.abs(fw.originY - 86.6025 / 2) < 1e-3);
  assert.equal(DEFAULT_PAD, 3.5);
  assert.deepEqual(fittedWindow([[0, 0]]), fittedWindow({ imin: 0, imax: 0, jmin: 0, jmax: 0 }, 12, 3.5), "defaults cell 12, pad 3.5");
});

test("fittedWindow of a cell list and of a box", () => {
  const fw = fittedWindow([[0, 0], [2, 0], [0, 2]], 12, 3.5);
  // x: centres from -1 to 2 (unit), so 3 * 12 + 12 + 84 = 132. y: 2 sqrt(3) / 2 * 12 + 2R + 7 (sqrt(3) / 2) 12
  assert.equal(fw.width, 132);
  const hy = 2 * SQ3_2 * 12 + 2 * 12 / Math.sqrt(3) + 7 * SQ3_2 * 12;
  assert.equal(fw.height, Math.ceil(hy));
  // the box form counts the four corners: box [0, 2] x [0, 2] reaches i - j / 2 = 2 at (2, 0), -1 at (0, 2)
  const box = fittedWindow({ imin: 0, imax: 2, jmin: 0, jmax: 2 }, 12, 3.5);
  assert.equal(box.width, 132);
  assert.equal(box.height, fw.height);
  // pad 0: the rectangle touches the outer edges of the extreme hexagons
  const p0 = fittedWindow([[0, 0], [10, 0]], 10, 0);
  assert.equal(p0.width, 110);
  assert.equal(p0.height, Math.ceil(2 * 10 / Math.sqrt(3)));
  assert.throws(() => fittedWindow([], 12, 3.5), { code: "empty_shape" });
  assert.throws(() => fittedWindow({ imin: 1, imax: 0, jmin: 0, jmax: 0 }), { code: "bad_bounds" });
  assert.throws(() => fittedWindow([[0, 0]], 0), { code: "bad_cell" });
});

test("the rows of a window hold every cell whose centre is in it, and only cells that meet it", () => {
  for (const [cell, ox, oy, W, H] of [[12, 48.3, 43.3, 96, 87], [7, -30.2, 410.7, 300, 200], [22, 640, 400, 1280, 800]]) {
    const rows = visibleRows(W, H, ox, oy, cell);
    const inRows = new Set();
    for (const [j, lo, hi] of rows) for (let i = lo; i <= hi; i++) inRows.add(`${i},${j}`);
    const t = makeTransform({ originX: ox, originY: oy, cell });
    const R = cell / Math.sqrt(3);
    const c0 = t.cellAt(W / 2, H / 2);
    for (let j = c0[1] - 80; j <= c0[1] + 80; j++) {
      for (let i = c0[0] - 120; i <= c0[0] + 120; i++) {
        const [X, Y] = t.toScreen(i, j);
        const inside = X >= 0 && X <= W && Y >= 0 && Y <= H;
        const meets = X >= -cell / 2 - 1e-9 && X <= W + cell / 2 + 1e-9 && Y >= -R - 1e-9 && Y <= H + R + 1e-9;
        if (inside) assert.ok(inRows.has(`${i},${j}`), `centre inside but not listed: ${i},${j}`);
        if (inRows.has(`${i},${j}`)) assert.ok(meets, `listed but outside: ${i},${j}`);
      }
    }
  }
});

test("centreFirst covers every visible cell once, the central square first", () => {
  for (const [W, H, s] of [[1280, 420, 10.9], [375, 600, 22], [800, 800, 4]]) {
    const ox = W / 2 - 3.3 * s;
    const oy = H / 2 + 1.7 * s;
    const rows = visibleRows(W, H, ox, oy, s);
    const segs = centreFirst(rows, W, H, ox, oy, s, 0);
    const seen = new Map();
    const order = [];
    for (const [j, lo, hi] of segs) for (let i = lo; i <= hi; i++) {
      const k = `${i},${j}`;
      seen.set(k, (seen.get(k) || 0) + 1);
      order.push([i, j]);
    }
    let total = 0;
    for (const [j, lo, hi] of rows) for (let i = lo; i <= hi; i++) {
      total++;
      assert.equal(seen.get(`${i},${j}`), 1);
    }
    assert.equal(order.length, total);
    // every cell centred in the central square comes before every cell centred outside it
    const t = makeTransform({ originX: ox, originY: oy, cell: s });
    const half = Math.min(W, H) / 2;
    const inSquare = ([i, j]) => {
      const [X, Y] = t.toScreen(i, j);
      return Math.abs(X - W / 2) <= half && Math.abs(Y - H / 2) <= half;
    };
    const lastInner = order.reduce((m, c, k) => (inSquare(c) ? k : m), -1);
    const firstOuterFar = order.findIndex((c) => {
      const [X, Y] = t.toScreen(c[0], c[1]);
      return Math.abs(X - W / 2) > half + s || Math.abs(Y - H / 2) > half + s;
    });
    assert.ok(firstOuterFar === -1 || lastInner < firstOuterFar, `${W} x ${H}`);
  }
});

test("fill radius: a gap from 8 px on, overlap below", () => {
  assert.ok(fillRadius(8) < 8 / Math.sqrt(3));
  assert.ok(fillRadius(7) > 7 / Math.sqrt(3));
});
