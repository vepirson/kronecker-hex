// Construction tests on the 22 thin packed fixtures (the shapes S_1 .. S_10 and a strip of three cells, green and
// red): live results equal to the fixtures, replay equivalence, genus and area of S_g, the factor check, and the
// retry path through a replaced row solver.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { runToEnd, canonicalEvents } from "../../src/construct/pipeline.mjs";
import { solveRowIter } from "../../src/construct/row_solver.mjs";
import { cellFactors } from "../../src/construct/inspect.mjs";
import { parsePacked } from "../../src/formats/packed.mjs";
import { openToken } from "../../src/formats/token.mjs";
import { shapeS, seedS } from "../../src/core/shapes.mjs";
import { neighbourhood } from "../../src/core/geometry.mjs";

const url = (rel) => new URL(rel, import.meta.url);
const readJson = (rel) => JSON.parse(fs.readFileSync(url(rel), "ascii"));
const THIN = fs.readdirSync(url("../fixtures/packed_thin/")).filter((f) => f.endsWith(".packed.json")).sort();
const runs = new Map(); // fixture id -> { events, result }

test("live construction equals each of the 22 thin fixtures (except id and format_note)", (t) => {
  assert.equal(THIN.length, 22);
  const paths = { columnPrimes: 0, emptyRows: 0, rejected: {}, dIndex: {} };
  for (const f of THIN) {
    const obj = readJson(`../fixtures/packed_thin/${f}`);
    const { data } = parsePacked(obj);
    const { events, result } = runToEnd({ shape: data.shape, seed: data.seed, colour: data.colour, lift: 1 });
    assert.ok(result, f);
    assert.equal(result.pass, true, f);
    const { id: i1, format_note: n1, ...got } = result.packed;
    const { id: i2, format_note: n2, ...want } = obj;
    assert.deepEqual(got, want, f);
    assert.equal(n1, n2, f);
    // the token of the result opens to the same numbers
    const o = openToken(result.token);
    assert.equal(o.x0, result.x0, f);
    assert.equal(o.d0, result.d0, f);
    if (result.smallPrimes.some((s) => s.kind === "column")) paths.columnPrimes++;
    if (result.emptyRows.length) paths.emptyRows++;
    const rej = events.filter((e) => e.type === "dRejected");
    if (rej.length) paths.rejected[obj.id] = rej.map((e) => `${e.reason} at row ${e.j}`);
    if (result.dIndex > 0n) paths.dIndex[obj.id] = Number(result.dIndex);
    runs.set(obj.id, { events, result });
  }
  t.diagnostic(`paths: ${JSON.stringify(paths)}`);
  assert.equal(paths.columnPrimes, 22);
  assert.ok(paths.emptyRows >= 1);
  assert.equal(paths.dIndex.green_s09, 3);
  assert.equal(paths.dIndex.green_strip3, 1);
  assert.equal(paths.rejected.green_s09.length, 3);
  // a window row without sign cells produces no row entry and no row event
  const { events, result } = runs.get("green_s03");
  for (const j of result.emptyRows) {
    assert.equal(result.rows.some((r) => r.j === j), false);
    assert.equal(events.some((e) => e.j === j && e.type !== "verifyRow"), false);
    assert.equal(events.filter((e) => e.type === "verifyRow" && e.j === j).length, 1);
  }
});

test("thin shapes: canonical events of each live run equal those of the replay of its data", () => {
  assert.equal(runs.size, 22);
  for (const [id, { events, result }] of runs) {
    const rep = runToEnd({ replay: result.data });
    assert.ok(rep.result, id);
    assert.equal(rep.result.pass, true, id);
    assert.equal(rep.events[0].mode, "replay");
    assert.equal(rep.events.some((e) => e.type === "dRejected"), false, id);
    assert.deepEqual(canonicalEvents(events), canonicalEvents(rep.events), id);
    assert.deepEqual(rep.result.packed, result.packed, id);
  }
  // the replay of the stored file (not of a live result) gives the same canonical events
  const { data } = parsePacked(readJson("../fixtures/packed_thin/green_s09.packed.json"));
  const rep = runToEnd({ replay: { ...data, id: null } });
  assert.deepEqual(canonicalEvents(rep.events), canonicalEvents(runs.get("green_s09").events));
});

test("S_1 .. S_10, green and red: pass, genus g, area 10g - 4", () => {
  for (let g = 1; g <= 10; g++) {
    for (const colour of [1, -1]) {
      const { result } = runToEnd({ shape: shapeS(g), seed: seedS(g), colour });
      assert.equal(result.pass, true, `S_${g} ${colour}`);
      assert.equal(result.genus, g);
      assert.equal(result.area, 10 * g - 4);
      assert.equal(result.lift, 1);
      assert.equal(result.verify.region.genus, g);
      assert.equal(result.verify.region.holes, g);
      assert.equal(result.verify.region.area, 10 * g - 4);
      assert.equal(result.verify.region.colour, colour);
    }
  }
});

test("the factors multiply to the symbol on every window cell of S_3, null on the row without sign cells", () => {
  for (const id of ["green_s03", "red_s03"]) {
    const { result } = runs.get(id);
    assert.ok(result.emptyRows.length >= 1);
    const W = result.shape.concat(neighbourhood(result.shape));
    let checked = 0, nulls = 0;
    for (const [i, j] of W) {
      const f = cellFactors(result, i, j);
      if (result.emptyRows.includes(j)) {
        assert.equal(f, null);
        nulls++;
        continue;
      }
      assert.equal(f.product, f.symbol, `${id} (${i}, ${j})`);
      checked++;
    }
    assert.ok(nulls >= 1);
    assert.equal(checked + nulls, W.length);
  }
});

test("a row solver failing the first attempt of one row gives a rowRetry, the next valid R and a passing result", () => {
  const base = runs.get("green_s03").result;
  const target = base.rows.find((r) => r.c > 1n);
  assert.ok(target);
  let failed = 0;
  const hooks = {
    solveRowIter: (args) => {
      if (args.q1 === target.q1 && failed === 0) {
        failed++;
        return (function* () { yield { phase: "scan", done: 0, total: args.q2 }; return null; })();
      }
      return solveRowIter(args);
    },
  };
  const { events, result } = runToEnd({ shape: base.shape, seed: base.seed, colour: base.colour }, hooks);
  assert.equal(failed, 1);
  const rowEv = events.filter((e) => e.j === target.j && e.step >= 4 && e.step <= 5);
  const types = rowEv.map((e) => e.type);
  assert.deepEqual(types, ["rowCofactor", "rowTarget", "rowProgress", "rowRetry", "rowTarget", "rowSolved"]);
  const [, t1, , retry, t2, solved] = rowEv;
  assert.equal(retry.attempt, 1);
  assert.equal(retry.R, t1.R);
  assert.equal(t1.R, target.rho);
  assert.ok(t2.R > t1.R);
  // t2.R is the NEXT valid R: no integer strictly between the two is prime to c on every sign cell
  const offs = target.cells.map((c) => c.i);
  const gcd = (a, b) => { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a; };
  for (let R = t1.R + 1n; R < t2.R; R++) assert.ok(offs.some((i) => gcd(R + BigInt(i), target.c) !== 1n));
  assert.ok(offs.every((i) => gcd(t2.R + BigInt(i), target.c) === 1n));
  assert.equal(solved.R, t2.R);
  assert.equal(result.pass, true);
  assert.equal(result.rows.find((r) => r.j === target.j).attempts, 2);
  assert.equal(result.rows.find((r) => r.j === target.j).rho, t2.R);
  // the replay of the new result is equivalent to its live run
  assert.deepEqual(canonicalEvents(runToEnd({ replay: result.data }).events), canonicalEvents(events));
});
