// Tests of the certified infinite regions: the certificate lines against the Kronecker symbol, certificateAt, the
// certified flood fill (finite regions unchanged, infinite ones with a path that is checked here independently),
// and the region worker's "filled" record.

import { test } from "node:test";
import assert from "node:assert/strict";

import { kronecker } from "../../src/core/kronecker.mjs";
import { NEIGHBOURS, cellKey, hexDistance } from "../../src/core/geometry.mjs";
import { floodFill, floodFillIter } from "../../src/core/regions.mjs";
import {
  CERTIFICATES, certificateAt, lineCell, distanceToLine, compileLines, floodFillCertified, floodFillCertifiedSync,
} from "../../src/core/infinite.mjs";
import { handleMessage } from "../../src/workers/floodfill.worker.mjs";

// A small deterministic generator (64-bit LCG) for reproducible random values.
function rng(seed) {
  let s = BigInt(seed);
  const next = () => {
    s = (s * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
    return s >> 11n;
  };
  return {
    int: (n) => Number(next() % BigInt(n)),
    // a random positive bigint with 1 .. maxDigits decimal digits
    bigPos: (maxDigits) => {
      const digits = 1 + Number(next() % BigInt(maxDigits));
      let v = 0n;
      for (let k = 0; k < digits; k++) v = v * 10n + (next() % 10n);
      return v === 0n ? 1n : v;
    },
  };
}

const ADJ = new Set(NEIGHBOURS.map(([a, b]) => `${a},${b}`));
const adjacent = (p, q) => ADJ.has(`${q[0] - p[0]},${q[1] - p[1]}`);

// The membership of a cell in the certificate lines, written out from the table (independent of the module):
// the ids of every line containing (x, d).
function linesAt(x, d) {
  const out = [];
  if (d === 1n) out.push("row_d_1");
  if (x === 1n) out.push("col_x_1");
  if (d === -1n && x >= 0n) out.push("row_d_m1_right");
  if (d === -1n && x <= -1n) out.push("row_d_m1_left");
  if (x === 0n && d >= 2n) out.push("col_x_0_up");
  if (x === 0n && d <= -2n) out.push("col_x_0_down");
  if (d === 0n && x >= 2n) out.push("row_d_0_right");
  if (d === 0n && x <= -2n) out.push("row_d_0_left");
  if (x === d && x >= 2n) out.push("diag_up");
  if (x === d && x <= -2n) out.push("diag_down");
  return out;
}

// The parameter range of a certificate as [lo, hi] for a small window |t| <= T.
const range = (c, T) => [c.from === null ? -T : c.from, c.to === null ? T : c.to];

// Independent check of a reported certificate: path from (0, 0) to infinite.cell, every cell of the region's colour by
// kronecker, consecutive cells neighbours, the last cell on the named line (by the table above).
function checkCertificate(x0, d0, rec) {
  const inf = rec.infinite;
  const p = inf.path;
  assert.ok(Array.isArray(p) && p.length >= 1, "a path is given");
  assert.deepEqual(p[0], [0, 0], "the path starts at the start cell");
  assert.deepEqual(p[p.length - 1], inf.cell, "the path ends at the certificate cell");
  assert.equal(inf.steps, p.length - 1);
  const keys = new Set();
  for (let k = 0; k < p.length; k++) {
    const [i, j] = p[k];
    assert.equal(kronecker(x0 + BigInt(i), d0 + BigInt(j)), rec.colour, `path cell ${k} (${i}, ${j}) has the colour`);
    if (k > 0) assert.ok(adjacent(p[k - 1], p[k]), `path step ${k} is a neighbour step`);
    keys.add(cellKey(i, j));
  }
  assert.equal(keys.size, p.length, "the path visits no cell twice");
  const [ci, cj] = inf.cell;
  assert.ok(linesAt(x0 + BigInt(ci), d0 + BigInt(cj)).includes(inf.id), `the last cell is on ${inf.id}`);
  const c = CERTIFICATES.find((q) => q.id === inf.id);
  assert.equal(c.colour, rec.colour, "the line has the region's colour");
  assert.equal(inf.text, c.text);
  assert.equal(inf.reason, c.reason);
}

test("(a) every certificate line has its colour for |t| <= 3000 and for 200 random values with up to 400 digits", () => {
  assert.equal(CERTIFICATES.length, 10);
  assert.deepEqual(CERTIFICATES.map((c) => c.id), [
    "row_d_1", "col_x_1", "row_d_m1_right", "row_d_m1_left", "col_x_0_up", "col_x_0_down", "row_d_0_right",
    "row_d_0_left", "diag_up", "diag_down",
  ]);
  const r = rng(20261117);
  for (const c of CERTIFICATES) {
    assert.ok(/^[ -~]+$/.test(c.text) && /^[ -~]+$/.test(c.reason), `${c.id}: ASCII text`);
    assert.ok(!c.text.includes(";") && !c.reason.includes(";"), `${c.id}: no semicolon`);
    const [lo, hi] = range(c, 3000n);
    let n = 0;
    for (let t = lo; t <= hi; t++) {
      const cell = lineCell(c, t);
      assert.equal(kronecker(cell[0], cell[1]), c.colour, `${c.id} at t = ${t}`);
      assert.ok(linesAt(cell[0], cell[1]).includes(c.id));
      if (t < hi) assert.ok(adjacent(cell.map(Number), lineCell(c, t + 1n).map(Number)), `${c.id}: t = ${t} and t + 1 adjacent`);
      n++;
    }
    assert.ok(n >= 2999, `${c.id}: ${n} cells checked`);
    for (let k = 0; k < 200; k++) {
      let t = r.bigPos(400);
      if (c.to !== null) t = c.to - t;
      else if (c.from !== null) t = c.from + t;
      else if (k % 2) t = -t;
      const [x, d] = lineCell(c, t);
      assert.equal(kronecker(x, d), c.colour, `${c.id} at a random t of ${t.toString().length} digits`);
      const [x1, d1] = lineCell(c, t + 1n);
      assert.ok(adjacent([0, 0], [Number(x1 - x), Number(d1 - d)]));
      assert.ok(certificateAt(x, d) !== null && certificateAt(x, d).colour === c.colour);
    }
  }
});

test("(b) certificateAt: null next to the lines, the special cells by their colour", () => {
  const r = rng(7);
  const params = [];
  for (let t = -40n; t <= 40n; t++) params.push(t);
  for (let k = 0; k < 20; k++) params.push(r.bigPos(60), -r.bigPos(60));
  let nulls = 0;
  for (const c of CERTIFICATES) {
    for (const t of params) {
      const [x, d] = lineCell(c, t);
      for (const [di, dj] of NEIGHBOURS) {
        for (const s of [1n, 2n]) {
          const nx = x + BigInt(di) * s;
          const nd = d + BigInt(dj) * s;
          const ids = linesAt(nx, nd);
          const got = certificateAt(nx, nd);
          if (ids.length === 0) {
            assert.equal(got, null, `(${nx}, ${nd}) is on no line`);
            nulls++;
          } else {
            assert.equal(got.id, ids[0], `(${nx}, ${nd})`);
            assert.equal(kronecker(nx, nd), got.colour, `(${nx}, ${nd}) has the colour of ${got.id}`);
          }
        }
      }
    }
  }
  assert.ok(nulls > 1000);
  // the special cells around the origin, worked out from kronecker
  const special = [
    [1n, 0n, 1, "col_x_1"],
    [-1n, 0n, 1, null],
    [0n, 1n, 1, "row_d_1"],
    [0n, -1n, 1, "row_d_m1_right"],
    [0n, 0n, 0, null],
    [1n, 1n, 1, "row_d_1"],
    [-1n, -1n, -1, "row_d_m1_left"],
  ];
  for (const [x, d, colour, id] of special) {
    assert.equal(kronecker(x, d), colour, `kronecker(${x}, ${d})`);
    const got = certificateAt(x, d);
    assert.equal(got === null ? null : got.id, id, `certificateAt(${x}, ${d})`);
    if (got) assert.equal(got.colour, colour);
  }
  // the ends of the half lines
  assert.equal(certificateAt(0n, 1n).id, "row_d_1");
  assert.equal(certificateAt(0n, 2n).id, "col_x_0_up");
  assert.equal(certificateAt(0n, -2n).id, "col_x_0_down");
  assert.equal(certificateAt(2n, 0n).id, "row_d_0_right");
  assert.equal(certificateAt(-2n, 0n).id, "row_d_0_left");
  assert.equal(certificateAt(2n, 2n).id, "diag_up");
  assert.equal(certificateAt(-2n, -2n).id, "diag_down");
  assert.equal(certificateAt(-1n, -1n).id, "row_d_m1_left");
});

test("distanceToLine and the compiled Number tests agree with a direct count", () => {
  const r = rng(99);
  for (let k = 0; k < 400; k++) {
    const x0 = BigInt(r.int(161) - 80);
    const d0 = BigInt(r.int(161) - 80);
    for (const colour of [-1, 0, 1]) {
      const lines = compileLines(x0, d0, colour, 1000);
      for (const L of lines) {
        const c = L.cert;
        assert.equal(c.colour, colour);
        assert.equal(BigInt(L.start), distanceToLine(c, x0, d0));
        // direct minimum over the cells of the line with |t| <= 400
        const [lo, hi] = range(c, 400n);
        let best = Infinity;
        for (let t = lo; t <= hi; t++) {
          const [x, d] = lineCell(c, t);
          best = Math.min(best, hexDistance(Number(x - x0), Number(d - d0)));
        }
        assert.equal(L.start, best, `${c.id} from (${x0}, ${d0})`);
        const i = r.int(41) - 20;
        const j = r.int(41) - 20;
        assert.equal(BigInt(L.dist(i, j)), distanceToLine(c, x0 + BigInt(i), d0 + BigInt(j)));
        assert.equal(L.test(i, j), linesAt(x0 + BigInt(i), d0 + BigInt(j)).includes(c.id));
      }
    }
  }
  // a start cell with 400-digit coordinates: no line within reach
  const bx = r.bigPos(400) + 10n ** 399n;
  const bd = r.bigPos(400) + 10n ** 399n;
  for (const colour of [-1, 0, 1]) assert.equal(compileLines(bx, bd, colour, 200000).length, 0);
  // a far cell next to row d = 1: the row is found at distance 1, the bounds of the half lines stay exact
  const lines = compileLines(10n ** 300n, 2n, 1, 200000);
  assert.deepEqual(lines.map((L) => [L.cert.id, L.start]), [["row_d_1", 1], ["row_d_m1_right", 3]]);
});

test("(c) cells near the origin: (0, 3), (5, 1), (-3, -1) are certified infinite", () => {
  const cases = [[0n, 3n, 0, "col_x_0_up"], [5n, 1n, 1, "row_d_1"], [-3n, -1n, -1, "row_d_m1_left"]];
  for (const [x, d, colour, id] of cases) {
    const rec = floodFillCertifiedSync(x, d, { withPath: true });
    assert.equal(rec.colour, colour);
    assert.equal(rec.complete, false);
    assert.equal(rec.genus, null);
    assert.equal(rec.infinite.id, id, `(${x}, ${d})`);
    assert.equal(rec.infinite.search, "fill");
    assert.equal(rec.infinite.steps, 0);
    assert.deepEqual(rec.infinite.cell, [0, 0]);
    assert.equal(rec.area, 1);
    checkCertificate(x, d, rec);
  }
  // (-1, 0) is on no line, its green region reaches a line in one step
  const rec = floodFillCertifiedSync(-1n, 0n, { withPath: true });
  assert.equal(rec.colour, 1);
  assert.ok(rec.infinite !== null && rec.infinite.steps >= 1);
  checkCertificate(-1n, 0n, rec);
  // (0, 0) is a blue region of one cell
  const z = floodFillCertifiedSync(0n, 0n);
  assert.equal(z.complete, true);
  assert.equal(z.area, 1);
  assert.equal(z.infinite, null);
});

// The record of floodFillIter run to the end, and its progress records.
function plainRun(x, d, cap, yieldEvery) {
  const ys = [];
  const it = floodFillIter(x, d, cap, yieldEvery);
  let s = it.next();
  while (!s.done) {
    ys.push(s.value);
    s = it.next();
  }
  return { rec: s.value, ys };
}
function certifiedRun(x, d, opts) {
  const ys = [];
  const it = floodFillCertified(x, d, opts);
  let s = it.next();
  while (!s.done) {
    ys.push(s.value);
    s = it.next();
  }
  return { rec: s.value, ys };
}

test("(d) finite regions unchanged: (1080, 517), (291, -1375), (-34, -54)", () => {
  const cases = [[1080n, 517n, 70, 4], [291n, -1375n, 318, 5], [-34n, -54n, 10, 1]];
  for (const [x, d, area, genus] of cases) {
    const a = plainRun(x, d, 200000, 37);
    const b = certifiedRun(x, d, { cap: 200000, yieldEvery: 37 });
    assert.equal(b.rec.area, area);
    assert.equal(b.rec.genus, genus);
    assert.equal(b.rec.complete, true);
    assert.equal(b.rec.infinite, null);
    const { infinite, ...rest } = b.rec;
    void infinite;
    assert.deepEqual(Object.keys(rest), Object.keys(a.rec), "the same fields in the same order");
    for (const k of Object.keys(a.rec)) assert.deepEqual(rest[k], a.rec[k], `field ${k} at (${x}, ${d})`);
    assert.deepEqual(b.ys, a.ys, "the same progress records");
    assert.deepEqual(rest, floodFill(x, d, 200000));
  }
  // a capped fill without a line in reach keeps the record of the capped plain fill
  const a = plainRun(-422n, -951n, 100, 0);
  const st = {};
  const b = floodFillCertifiedSync(-422n, -951n, { cap: 100, directedCap: 0, stats: st });
  const { infinite, ...rest } = b;
  assert.equal(infinite, null);
  assert.deepEqual(rest, a.rec);
  assert.equal(st.directed, null);
});

// Start cells at hex distance 50 .. 2000 from the origin whose regions are infinite. Each is certified by the plain
// fill under the default cap, and with a fill cap of 3 only the directed search certifies it.
const FAR_INFINITE = [
  [1370n, -23n], [1076n, -13n], [363n, 16n], [1832n, 13n], [13n, -168n],
  [11n, 290n], [1970n, 9n], [289n, -6n], [-881n, -4n], [5n, -311n],
];

test("(e) ten infinite start cells: the path of the certificate checked with kronecker alone", () => {
  const bySearch = { fill: 0, directed: 0 };
  for (const [k, [x, d]] of FAR_INFINITE.entries()) {
    const dist = hexDistance(Number(x), Number(d));
    assert.ok(dist >= 50 && dist <= 2000, `(${x}, ${d}) at distance ${dist}`);
    // the first five with the default cap (certified by the fill), the other five with cap 3 (only the directed search)
    const cap = k < 5 ? 200000 : 3;
    const st = {};
    const rec = floodFillCertifiedSync(x, d, { cap, directedCap: 20000, withPath: true, stats: st });
    assert.ok(rec.infinite !== null, `(${x}, ${d}) certified`);
    assert.equal(rec.infinite.search, k < 5 ? "fill" : "directed");
    if (k >= 5) {
      assert.equal(st.fillCells, 3, "the fill stopped at its cap");
      assert.equal(st.directed.hit, true);
      assert.equal(rec.area, 3, "the record of the capped fill");
    }
    bySearch[rec.infinite.search]++;
    checkCertificate(x, d, rec);
    // the same cell with the other cap also certifies, through the other search
    const other = floodFillCertifiedSync(x, d, { cap: k < 5 ? 3 : 200000, directedCap: 20000, withPath: true });
    assert.equal(other.infinite.search, k < 5 ? "directed" : "fill");
    checkCertificate(x, d, other);
  }
  assert.deepEqual(bySearch, { fill: 5, directed: 5 });
});

test("(f) the directed search reports only cells of the colour along neighbour steps (50 random starts)", () => {
  const r = rng(314159);
  let directed = 0;
  let gaveUp = 0;
  for (let k = 0; k < 50; k++) {
    let x;
    let d;
    if (k % 2 === 0) {
      // a random cell within distance 300 of the origin
      x = BigInt(r.int(601) - 300);
      d = BigInt(r.int(601) - 300);
    } else {
      // the end of a random walk of up to 30 tries in the line's colour and off the lines, from a line cell with
      // |t| <= 280 (a cell of an infinite region, mostly off the lines)
      for (let attempt = 0; attempt < 20; attempt++) {
        const c = CERTIFICATES[r.int(CERTIFICATES.length)];
        const [lo, hi] = range(c, 280n);
        const t = lo + BigInt(r.int(Number(hi - lo) + 1));
        [x, d] = lineCell(c, t);
        for (let s = 0; s < 30; s++) {
          const [di, dj] = NEIGHBOURS[r.int(6)];
          const nx = x + BigInt(di);
          const nd = d + BigInt(dj);
          if (kronecker(nx, nd) === c.colour && linesAt(nx, nd).length === 0) {
            x = nx;
            d = nd;
          }
        }
        if (linesAt(x, d).length === 0) break;
      }
    }
    const st = {};
    const rec = floodFillCertifiedSync(x, d, { cap: 1, directedCap: 5000, withPath: true, stats: st });
    if (rec.infinite) {
      checkCertificate(x, d, rec);
      assert.ok(rec.infinite.visited <= 5000);
      if (rec.infinite.search === "directed") directed++;
    } else {
      // no line found: here every such region is finite (the plain fill completes), and the walk starts never end here
      assert.equal(k % 2, 0, `walk start (${x}, ${d}) not certified`);
      if (st.directed && !st.directed.hit) gaveUp++;
      assert.equal(floodFill(x, d, 5000).complete, true, `(${x}, ${d}) without a certificate is finite`);
    }
  }
  console.log(`(f) 50 starts: ${directed} certified by the directed search, ${gaveUp} directed searches without a line`);
  assert.ok(directed >= 20, `${directed} directed certificates`);
});

test("(g) no false positive: every complete region in three 60 x 60 windows has infinite null", () => {
  const centres = [[0n, 0n], [1080n, 517n], [-34n, -54n]];
  let complete = 0;
  let infinite = 0;
  let capped = 0;
  for (const [cx, cd] of centres) {
    const done = new Set();
    for (let j = -30; j < 30; j++) {
      for (let i = -30; i < 30; i++) {
        const x = cx + BigInt(i);
        const d = cd + BigInt(j);
        if (done.has(`${x},${d}`)) continue;
        const plain = floodFill(x, d, 3000);
        for (const [a, b] of plain.cells) done.add(`${x + BigInt(a)},${d + BigInt(b)}`);
        const rec = floodFillCertifiedSync(x, d, { cap: 3000, directedCap: 3000 });
        if (plain.complete) {
          complete++;
          assert.equal(rec.infinite, null, `complete region at (${x}, ${d})`);
          const { infinite: inf, ...rest } = rec;
          void inf;
          assert.deepEqual(rest, plain);
        } else if (rec.infinite) {
          infinite++;
        } else {
          capped++;
        }
      }
    }
  }
  console.log(`(g) ${complete} complete regions (all infinite null), ${infinite} certified infinite, ${capped} capped without a line`);
  assert.ok(complete > 1000 && infinite > 0);
});

test("the region worker: infinite in the filled record, the plain fill on request, errors", () => {
  const run = (msg) => {
    const out = [];
    handleMessage(msg, (m) => out.push(m));
    return out;
  };
  const a = run({ type: "fill", id: 1, x: "0", d: "3" });
  const fa = a[a.length - 1];
  assert.equal(fa.type, "filled");
  assert.equal(fa.result.infinite.id, "col_x_0_up");
  assert.equal(fa.result.infinite.text, "contains the half column x = 0, d >= 2");
  assert.equal(fa.result.complete, false);
  assert.equal(fa.result.genus, null);
  assert.equal(fa.result.infinite.path, undefined);
  const b = run({ type: "fill", id: 2, x: "1080", d: "517" });
  const fb = b[b.length - 1];
  assert.equal(fb.result.infinite, null);
  assert.equal(fb.result.area, 70);
  assert.equal(fb.result.genus, 4);
  const c = run({ type: "fill", id: 3, x: "0", d: "3", cap: 5000, certify: false });
  const fc = c[c.length - 1];
  assert.equal(fc.result.area, 5000);
  assert.equal(fc.result.complete, false);
  assert.equal(fc.result.infinite, null);
  const e = run({ type: "fill", id: 4, x: "1370", d: "-23", cap: 3, directedCap: 20000, withPath: true });
  const fe = e[e.length - 1];
  assert.equal(fe.result.infinite.search, "directed");
  checkCertificate(1370n, -23n, { colour: fe.result.colour, infinite: fe.result.infinite });
  assert.equal(run({ type: "fill", id: 5, x: "1", d: "2", directedCap: -1 })[0].code, "bad_cap");
});
