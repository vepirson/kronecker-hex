// Tests of the part of a region inside the box of a click (the outline of a region that is not complete): the
// window part of floodFillCertified against a brute-force computation written here (every cell of the box coloured
// by the Kronecker symbol, then the connected component of the start inside the box), the limit in breadth-first
// order, complete regions and the worker without a box unchanged, the worker's window record, the part again for
// the window where the view rested (an off-centre box), the Explorer's boxes and the count of the outline on the chip.

import { test } from "node:test";
import assert from "node:assert/strict";

import { kronecker } from "../../src/core/kronecker.mjs";
import { floodFillCertified, floodFillCertifiedSync } from "../../src/core/infinite.mjs";
import { boxTest, makeTransform } from "../../src/render/hex_canvas.mjs";
import { handleMessage, cellsOfFlat, WINDOW_PART_LIMIT, FILL_CAP } from "../../src/workers/floodfill.worker.mjs";
import { windowBox, windowBoxOf } from "../../src/ui/pages/explore.mjs";
import { createExplorerState, regionDataOf, detailsOf } from "../../src/ui/pages/explore/state.mjs";

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
const H = Math.sqrt(3) / 2;
const byRow = (a, b) => a[1] - b[1] || a[0] - b[0];

// Every cell (i, j) whose centre ((i - j / 2) cell, -j cell sqrt(3) / 2) lies within halfWidth and halfHeight pixels
// of the point (cx, cy) (default the centre of the cell (0, 0)), as a Map "i,j" -> [i, j].
function boxCells({ cell, halfWidth, halfHeight, cx = 0, cy = 0 }) {
  const out = new Map();
  const J = Math.ceil((halfHeight + Math.abs(cy)) / (H * cell)) + 1;
  for (let j = -J; j <= J; j++) {
    if (Math.abs(-j * H * cell - cy) > halfHeight) continue;
    const I = Math.ceil((halfWidth + Math.abs(cx)) / cell + Math.abs(j) / 2) + 1;
    for (let i = -I; i <= I; i++) {
      if (Math.abs((i - j / 2) * cell - cx) <= halfWidth) out.set(`${i},${j}`, [i, j]);
    }
  }
  return out;
}

// The component of (0, 0) among the cells of the box that have the colour of (x, d), with the breadth-first distance
// of each cell from (0, 0) inside the box: Map "i,j" -> distance.
function bruteComponent(x, d, box) {
  const cells = boxCells(box);
  const c0 = kronecker(x, d);
  const colourOf = new Map();
  for (const [k, [i, j]] of cells) colourOf.set(k, kronecker(x + BigInt(i), d + BigInt(j)));
  const dist = new Map([["0,0", 0]]);
  const queue = [[0, 0]];
  for (let h = 0; h < queue.length; h++) {
    const [i, j] = queue[h];
    for (const [a, b] of STEPS) {
      const k = `${i + a},${j + b}`;
      if (dist.has(k) || colourOf.get(k) !== c0) continue;
      dist.set(k, dist.get(`${i},${j}`) + 1);
      queue.push([i + a, j + b]);
    }
  }
  return dist;
}
const cellsOf = (dist) => [...dist.keys()].map((k) => k.split(",").map(Number)).sort(byRow);

const BOX_A = { cell: 22, halfWidth: 640, halfHeight: 430 };
const BOX_B = { cell: 6, halfWidth: 300, halfHeight: 200 };

// starts: a cell of the row d = 1 (+1), a cell of the half column x = 0 (0), a cell of the half row d = -1 with x < 0
// (-1), a cell certified only by the directed search after a fill cap of 3, and a fill capped at 100 cells without a
// certificate (directed search off)
const STARTS = [
  { x: 40n, d: 1n, colour: 1, opts: {}, state: "infinite" },
  { x: 0n, d: 5n, colour: 0, opts: {}, state: "infinite" },
  { x: -40n, d: -1n, colour: -1, opts: {}, state: "infinite" },
  { x: 1370n, d: -23n, colour: null, opts: { cap: 3, directedCap: 20000 }, state: "infinite" },
  { x: -422n, d: -951n, colour: null, opts: { cap: 100, directedCap: 0 }, state: "capped" },
];

test("the window part equals the brute-force component inside the box: five starts, two box sizes", () => {
  const sizes = [];
  for (const s of STARTS) {
    const plain = floodFillCertifiedSync(s.x, s.d, s.opts);
    if (s.colour !== null) assert.equal(plain.colour, s.colour);
    assert.equal(plain.complete, false);
    assert.equal(plain.infinite !== null, s.state === "infinite", `(${s.x}, ${s.d}) ${s.state}`);
    for (const box of [BOX_A, BOX_B]) {
      const st = {};
      const rec = floodFillCertifiedSync(s.x, s.d, { ...s.opts, stats: st, windowPart: { inside: boxTest(box), limit: 200000 } });
      const want = cellsOf(bruteComponent(s.x, s.d, box));
      const where = `(${s.x}, ${s.d}) at ${box.cell} px`;
      assert.deepEqual(rec.window.cells, want, where);
      assert.equal(rec.window.count, want.length);
      assert.equal(rec.window.cut, false);
      assert.equal(rec.window.limit, 200000);
      assert.equal(st.window.cells, want.length);
      assert.ok(want.length > 1, `${where}: ${want.length} cells`);
      sizes.push(`${where}: ${want.length}`);
      // the rest of the record is the record without a window part
      const { window: part, ...rest } = rec;
      void part;
      assert.deepEqual(rest, plain, where);
    }
  }
  console.log(`window parts (cells): ${sizes.join(", ")}`);
});

test("the limit keeps the first cells in breadth-first order and says that it cut", () => {
  const box = BOX_B;
  const dist = bruteComponent(40n, 1n, box);
  const n = dist.size;
  assert.ok(n > 300, `${n} cells in the component`);
  for (const limit of [1, 7, 200, n - 1]) {
    const rec = floodFillCertifiedSync(40n, 1n, { windowPart: { inside: boxTest(box), limit } });
    assert.equal(rec.window.count, limit);
    assert.equal(rec.window.cut, true, `limit ${limit}`);
    assert.equal(rec.window.limit, limit);
    const kept = new Set(rec.window.cells.map(([i, j]) => `${i},${j}`));
    assert.equal(kept.size, limit);
    let D = 0;
    for (const k of kept) {
      assert.ok(dist.has(k), `limit ${limit}: kept cell ${k} is in the component`);
      D = Math.max(D, dist.get(k));
    }
    // every cell nearer than the farthest kept one is kept
    for (const [k, v] of dist) if (v < D) assert.ok(kept.has(k), `limit ${limit}: cell ${k} at distance ${v} < ${D} is kept`);
    assert.deepEqual(rec.window.cells, rec.window.cells.slice().sort(byRow), "sorted by (j, i)");
  }
  const whole = floodFillCertifiedSync(40n, 1n, { windowPart: { inside: boxTest(box), limit: n } });
  assert.equal(whole.window.count, n);
  assert.equal(whole.window.cut, false, "a limit equal to the component size does not cut");
});

test("the window pass reports its progress with phase window", () => {
  const it = floodFillCertified(40n, 1n, { yieldEvery: 50, windowPart: { inside: boxTest(BOX_B), limit: 200000 } });
  const ys = [];
  let s = it.next();
  while (!s.done) {
    ys.push(s.value);
    s = it.next();
  }
  const w = ys.filter((y) => y.phase === "window");
  assert.ok(w.length > 10, `${w.length} window progress records`);
  assert.ok(w.every((y, k) => k === 0 || y.cells >= w[k - 1].cells));
  assert.ok(w[w.length - 1].cells <= s.value.window.count);
});

test("a complete region is unaffected by a window part: the same record, cell for cell, no window field", () => {
  for (const [x, d] of [[1080n, 517n], [291n, -1375n], [-34n, -54n], [0n, 0n]]) {
    const plain = floodFillCertifiedSync(x, d, { withPath: true });
    const rec = floodFillCertifiedSync(x, d, { withPath: true, windowPart: { inside: boxTest(BOX_B), limit: 5 } });
    assert.equal(rec.complete, true);
    assert.equal("window" in rec, false);
    assert.deepEqual(rec, plain);
  }
  assert.throws(() => floodFillCertifiedSync(5n, 1n, { windowPart: { inside: boxTest(BOX_A), limit: 0 } }), (e) => e.code === "bad_window");
  assert.throws(() => floodFillCertifiedSync(5n, 1n, { windowPart: { limit: 10 } }), (e) => e.code === "bad_window");
});

function run(msg) {
  const out = [];
  handleMessage(msg, (m, transfer) => out.push({ m, transfer }));
  return out;
}
const strip = ({ m }) => {
  const { ms, ...rest } = m;
  void ms;
  return rest;
};

test("the worker: a box gives the window record for a region that is not complete, nothing else changes", () => {
  assert.equal(WINDOW_PART_LIMIT, 200000);
  assert.equal(FILL_CAP, 200000);
  // without a box: no window field
  for (const [x, d] of [["40", "1"], ["0", "5"], ["1080", "517"]]) {
    const a = run({ type: "fill", id: 1, x, d });
    const fa = a[a.length - 1];
    assert.equal(fa.m.type, "filled");
    assert.equal("window" in fa.m, false);
    assert.equal(fa.transfer.length, 1);
  }
  // a complete region with a box: the same answer as without one
  const plain = run({ type: "fill", id: 2, x: "1080", d: "517" });
  const boxed = run({ type: "fill", id: 2, x: "1080", d: "517", box: BOX_A });
  assert.deepEqual(boxed.map(strip).filter((m) => m.type === "filled"), plain.map(strip).filter((m) => m.type === "filled"));
  // an infinite region with a box
  const out = run({ type: "fill", id: 3, x: "-40", d: "-1", box: BOX_B });
  const f = out[out.length - 1];
  assert.equal(f.m.result.infinite.id, "row_d_m1_left");
  assert.equal("window" in f.m.result, false, "the window part travels beside the record, not in it");
  const want = cellsOf(bruteComponent(-40n, -1n, BOX_B));
  assert.deepEqual(cellsOfFlat(f.m.window.flat), want);
  assert.ok(f.m.window.flat instanceof Int32Array);
  assert.equal(f.m.window.count, want.length);
  assert.equal(f.m.window.cut, false);
  assert.equal(f.m.window.limit, WINDOW_PART_LIMIT);
  assert.equal(f.transfer.length, 2);
  assert.ok(f.transfer.includes(f.m.window.flat.buffer) && f.transfer.includes(f.m.flat.buffer));
  // the record and the flat cells of the search are the ones without a box
  const nobox = run({ type: "fill", id: 3, x: "-40", d: "-1" });
  const g = strip(nobox[nobox.length - 1]);
  const { window: part, ...rest } = strip(f);
  void part;
  assert.deepEqual(rest, g);
  // bad boxes
  assert.equal(run({ type: "fill", id: 4, x: "1", d: "2", box: { cell: 0, halfWidth: 10, halfHeight: 10 } })[0].m.code, "bad_box");
  assert.equal(run({ type: "fill", id: 5, x: "1", d: "2", box: { cell: 5, halfWidth: "10", halfHeight: 10 } })[0].m.code, "bad_box");
  assert.equal(run({ type: "fill", id: 6, x: "1", d: "2", box: BOX_A, certify: false })[0].m.code, "bad_box");
});

test("the Explorer's box: twice the window centred on the clicked cell, so it holds every cell centre of the window", () => {
  assert.deepEqual(windowBox({ width: 1280, height: 860, cell: 22 }), { cell: 22, halfWidth: 1280, halfHeight: 860 });
  assert.deepEqual(windowBox({ width: 0, height: Number.NaN, cell: 4 }), { cell: 4, halfWidth: 1, halfHeight: 1 });
  // a 300 x 200 window at 7.5 px per cell, the view's cell (0, 0) at (150.3, 99.1): for the clicked cells whose
  // centres are the nearest to the corners and to the middle, every cell whose centre is in the window passes the box
  // test relative to the clicked cell
  const W = 300;
  const Hh = 200;
  const cell = 7.5;
  const t = makeTransform({ originX: 150.3, originY: 99.1, cell });
  const visible = [];
  for (let j = -40; j <= 40; j++) {
    for (let i = -60; i <= 60; i++) {
      const [X, Y] = t.toScreen(i, j);
      if (X >= 0 && X <= W && Y >= 0 && Y <= Hh) visible.push([i, j]);
    }
  }
  const inBox = boxTest(windowBox({ width: W, height: Hh, cell }));
  const nearest = (X, Y) => {
    let best = null;
    let bd = Infinity;
    for (const c of visible) {
      const [P, Q] = t.toScreen(c[0], c[1]);
      const dd = (P - X) ** 2 + (Q - Y) ** 2;
      if (dd < bd) {
        bd = dd;
        best = c;
      }
    }
    return best;
  };
  for (const [X, Y] of [[0, 0], [W, 0], [0, Hh], [W, Hh], [W / 2, Hh / 2]]) {
    const [ci, cj] = nearest(X, Y);
    for (const [i, j] of visible) assert.ok(inBox(i - ci, j - cj), `clicked cell (${ci}, ${cj}): cell (${i}, ${j})`);
  }
});

test("the part again for a window where the view rested: the worker's window job equals the brute-force component inside an off-centre box", () => {
  // the box of a view moved 900 px right and 300 px down of the click, 640 x 430 canvas at 22 px per cell
  const box = windowBoxOf({ width: 640, height: 430, cell: 22, at: [-580, -80] });
  assert.ok(box.cx > 0 && box.cy > 0 && box.halfWidth >= 640 && box.halfHeight >= 430);
  for (const s of STARTS.slice(0, 3)) {
    const [{ m, transfer }] = run({ type: "window", id: 3, x: String(s.x), d: String(s.d), box });
    assert.equal(m.type, "windowed");
    assert.deepEqual(transfer, [m.window.flat.buffer]);
    assert.deepEqual(cellsOfFlat(m.window.flat), cellsOf(bruteComponent(s.x, s.d, box)), `${s.x}, ${s.d}`);
    assert.deepEqual([m.window.count, m.window.cut, m.window.limit], [m.window.flat.length / 2, false, WINDOW_PART_LIMIT]);
  }
  assert.equal(run({ type: "window", id: 4, x: "1", d: "2", box: { ...box, cx: Number.NaN } })[0].m.code, "bad_box");
  assert.equal(run({ type: "window", id: 5, x: "1.5", d: "2", box })[0].m.code, "bad_integer");
});

test("the box of the view where it rested: twice the window around the canvas middle, grown to hold the start cell", () => {
  const W = 300;
  const Hh = 200;
  const cell = 7.5;
  for (const at of [[150, 100], [-2000, 40], [310, 900], [0, 0]]) {
    const box = windowBoxOf({ width: W, height: Hh, cell, at });
    const inBox = boxTest(box);
    assert.ok(inBox(0, 0), `${at}: the start cell`);
    // every cell centre of the window passes the box test relative to the start cell, whose centre is at `at`
    const t = makeTransform({ originX: at[0], originY: at[1], cell });
    let seen = 0;
    for (let j = -400; j <= 400; j++) {
      for (let i = -600; i <= 600; i++) {
        const [X, Y] = t.toScreen(i, j);
        if (X >= 0 && X <= W && Y >= 0 && Y <= Hh) {
          seen++;
          assert.ok(inBox(i, j), `${at}: cell (${i}, ${j})`);
        }
      }
    }
    assert.ok(seen > 500, `${at}: ${seen} cells in the window`);
  }
  // the start cell in the middle of the window: twice the window around it
  assert.deepEqual(windowBoxOf({ width: W, height: Hh, cell, at: [150, 100] }), { cell, halfWidth: W + 1, halfHeight: Hh + 1, cx: 0, cy: 0 });
});

test("the count of the outline is the chip's data attribute outlined, the details hold no sentence about it", () => {
  const m = createExplorerState({ prefs: { cells: "soft", regionOnClick: true } });
  m.startFill(40n, 1n);
  const part = { count: 2591, cut: false, limit: 200000, box: windowBox({ width: 1280, height: 860, cell: 22 }) };
  m.fillDone(m.get().job.id, { area: 9, colour: 1, complete: false, infinite: { id: "row_d_1", text: "t" }, symbolsEvaluated: 9 }, [[0, 0]], part, 5);
  assert.equal(regionDataOf(m.get(), null).outlined, "2591");
  assert.deepEqual(detailsOf(m.get()).notes.map((n) => n.id), ["region-infinite"]);
});
