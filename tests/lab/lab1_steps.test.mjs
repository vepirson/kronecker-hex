// The data shown by steps 0 to 4 of the Construction Lab (the DOM-free step0Data .. step4Data and subCount of each
// step module) on the live run of S_3 green and on the replay of the genus-100 green token: the counts equal the
// view model and every number equals the result of the construction. Also: the eight step modules and the extras
// module follow the module contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { runToEnd } from "../../src/construct/pipeline.mjs";
import { buildLabView } from "../../src/construct/lab_view.mjs";
import { openToken } from "../../src/formats/token.mjs";
import { shapeS, seedS } from "../../src/core/shapes.mjs";
import { genusOfCells } from "../../src/core/regions.mjs";
import { cellKey } from "../../src/core/geometry.mjs";
import * as model from "../../src/ui/pages/lab/model.mjs";
import * as step0 from "../../src/ui/pages/lab/step0.mjs";
import * as step1 from "../../src/ui/pages/lab/step1.mjs";
import * as step2 from "../../src/ui/pages/lab/step2.mjs";
import * as step3 from "../../src/ui/pages/lab/step3.mjs";
import * as step4 from "../../src/ui/pages/lab/step4.mjs";
import * as step5 from "../../src/ui/pages/lab/step5.mjs";
import * as step6 from "../../src/ui/pages/lab/step6.mjs";
import * as step7 from "../../src/ui/pages/lab/step7.mjs";
import * as extras from "../../src/ui/pages/lab/extras.mjs";
import { STEP_TABLES } from "../../src/ui/pages/lab/steps.mjs";

const tokens = JSON.parse(fs.readFileSync(new URL("../../data/tokens.json", import.meta.url), "utf8"));
const packed = JSON.parse(fs.readFileSync(new URL("../fixtures/packed/green_compact_g100_small.packed.json", import.meta.url), "utf8"));

const CASES = [
  ["S_3 green, live", () => runToEnd({ shape: shapeS(3), seed: seedS(3), colour: 1, lift: 1 })],
  ["genus-100 green, replay of the token", () => runToEnd({ replay: openToken(tokens.genus100_green).data })],
];

for (const [label, run] of CASES) {
  test(`steps 0 to 4 on ${label}: counts equal the view model, numbers equal the result`, () => {
    const { events, result } = run();
    assert.equal(result.pass, true);
    const view = buildLabView(events);
    const R = result.rows;

    // step 0
    assert.equal(step0.subCount(view), 2);
    const d0 = step0.step0Data(view, 2);
    assert.equal(d0.area, result.area);
    assert.equal(d0.genus, result.genus);
    assert.equal(d0.genus, genusOfCells(result.shape).genus);
    assert.equal(d0.B, result.B);
    assert.equal(d0.h, result.bounds.jmax - result.bounds.jmin + 1);
    assert.equal(d0.w, result.bounds.imax - result.bounds.imin + 1);
    assert.equal(d0.B, Math.max(d0.h, d0.w, 7));
    assert.equal(d0.colour, "green");
    assert.equal(d0.windowCells, d0.area + d0.neighbours);
    assert.equal(step0.step0Data(view, 0).showN, false);
    assert.equal(step0.step0Data(view, 1).showN, true);
    assert.equal(step0.step0Data(view, 1).showNumbers, false);

    // step 1
    assert.equal(step1.subCount(view), result.smallPrimes.length);
    const d1 = step1.step1Data(view, step1.subCount(view));
    assert.equal(d1.primes.length, view.smallPrimes.length);
    d1.primes.forEach((s, k) => {
      const r = result.smallPrimes[k];
      for (const f of ["p", "kind", "a", "b", "xRes", "xMod", "dRes"]) assert.equal(s[f], r[f], `${f} of p = ${r.p}`);
      assert.equal(s.forcedCount, r.forced.length);
    });
    assert.equal(d1.forcedTotal, result.forced.length);
    assert.equal(d1.forcedSoFar, result.forced.length);
    assert.equal(d1.classCount + d1.columnCount, d1.primes.length);
    assert.equal(step1.step1Data(view, 0).focus, null);
    assert.equal(step1.step1Data(view, 1).focus.p, 2);
    assert.equal(step1.step1Data(view, 1).shown.length, 1);
    for (let n = 1; n <= d1.primes.length; n++) {
      const fs1 = step1.step1Data(view, n).forcedSoFar;
      const want = new Set(result.smallPrimes.slice(0, n).flatMap((s) => s.forced.map(([i, j]) => cellKey(i, j)))).size;
      assert.equal(fs1, want, `forced so far after ${n} primes`);
    }

    // step 2
    assert.equal(step2.subCount(view), R.length);
    const d2 = step2.step2Data(view, 0);
    assert.equal(d2.Xs, result.Xs);
    assert.equal(d2.Mx, result.Mx);
    assert.equal(d2.forcedCount, result.forced.length);
    assert.equal(d2.rowCount, R.length);
    assert.deepEqual(d2.emptyRows, result.emptyRows);
    assert.equal(d2.signCells, R.reduce((a, r) => a + r.k, 0));
    assert.equal(d2.kMax, Math.max(...R.map((r) => r.k)));
    assert.equal(d2.focus, null);
    R.forEach((r, k) => {
      const f = step2.step2Data(view, k + 1).focus;
      assert.equal(f.j, r.j);
      assert.equal(f.k, r.k);
      assert.deepEqual(f.cells, r.cells);
      assert.equal(step2.subOfRow(view, r.j), k + 1);
    });
    // the sign cells and the forced cells together are the window
    assert.equal(d2.signCells + d2.forcedCount, view.window.S.length + view.window.N.length);

    // step 3
    assert.equal(step3.subCount(view), R.length);
    const classPrimes = result.smallPrimes.filter((s) => s.dRes !== null).length;
    R.forEach((r, k) => {
      const d3 = step3.step3Data(view, k + 1);
      assert.equal(d3.focus.j, r.j);
      assert.equal(d3.focus.q1, r.q1);
      assert.equal(d3.focus.q2, r.q2);
      assert.equal(d3.focus.L, r.L);
      assert.equal(d3.focusModulus, BigInt(r.q1) * BigInt(r.q2));
      assert.equal(d3.shownSteps, classPrimes + k + 1);
      assert.equal(d3.final === null, k + 1 < R.length);
    });
    const d3 = step3.step3Data(view, R.length);
    assert.equal(d3.steps.length, classPrimes + R.length);
    assert.equal(d3.smallConditions, classPrimes);
    assert.equal(d3.final.D, result.D);
    assert.equal(d3.final.Md, result.Md);
    assert.equal(d3.MdDigits, result.Md.toString().length);
    assert.equal(step3.step3Data(view, 0).shownSteps, classPrimes);

    // step 4
    assert.equal(step4.subCount(view), R.length);
    const d4 = step4.step4Data(view, 0);
    assert.equal(d4.accepted.d0, result.d0);
    assert.equal(d4.accepted.index, result.dIndex);
    assert.equal(d4.candidates.filter((c) => c.state === "accepted").length, 1);
    assert.equal(d4.candidates.length, view.candidates.length);
    assert.equal(d4.D, result.D);
    assert.equal(d4.Md, result.Md);
    R.forEach((r, k) => {
      const f = step4.step4Data(view, k + 1).focus;
      assert.equal(f.j, r.j);
      assert.equal(f.n, result.d0 + BigInt(r.j));
      assert.equal(f.u, r.u);
      assert.equal(f.c, r.c);
      assert.equal(f.q1, r.q1);
      assert.equal(f.q2, r.q2);
      assert.equal(f.R, r.rho);
      assert.equal(f.productOk, true);
      assert.equal(f.cDigits, r.c.toString().length);
      assert.equal(f.retried, false);
      assert.equal(f.attempts.length, r.attempts);
    });
  });
}

test("genus-100 green replay: the numbers the Lab shows for it (39 rows, p = 2 class of the packed file, row 0, d0 digits)", () => {
  const { events, result } = runToEnd({ replay: openToken(tokens.genus100_green).data });
  const view = buildLabView(events);
  assert.equal(view.rows.length, 39);
  const p2 = step1.step1Data(view, 1).focus;
  const [x8, d2] = packed.small_primes["2"];
  assert.equal(p2.xRes, x8);
  assert.equal(p2.xMod, 8);
  assert.equal(p2.dRes, d2);
  assert.equal(p2.a, (2 - (x8 % 2)) % 2);
  assert.equal(p2.b, (2 - d2) % 2);
  const k0 = view.rows.findIndex((r) => r.j === 0);
  const f3 = step3.step3Data(view, k0 + 1).focus;
  assert.deepEqual([f3.q1, f3.q2], [4194319, 4194329]);
  assert.equal(step4.step4Data(view, k0 + 1).focus.R, 19n);
  assert.equal(result.d0.toString().length, 269);
  assert.equal(step4.step4Data(view, 0).accepted.d0.toString().length, 269);
});

test("S_3 green: the empty row and the column primes", () => {
  const { events } = runToEnd({ shape: shapeS(3), seed: seedS(3), colour: 1, lift: 1 });
  const view = buildLabView(events);
  assert.deepEqual(step2.step2Data(view, 0).emptyRows, [-2]);
  const d1 = step1.step1Data(view, 4);
  assert.equal(d1.focus.kind, "column");
  assert.equal(d1.focus.dRes, null);
  assert.equal(d1.focus.forcedCount, 0);
  assert.equal(step1.dText(d1.focus), "d free mod 7");
  assert.equal(step1.xText(d1.focus), `x = ${d1.focus.xRes} (mod 7)`);
});

test("the steps before their events, and an error at step 1", () => {
  const empty = buildLabView([]);
  for (const m of [step0, step1, step2, step3, step4]) assert.equal(m.subCount(empty), 0);
  assert.equal(step0.step0Data(empty, 0), null);
  assert.equal(step1.step1Data(empty, 0), null);
  assert.equal(step2.step2Data(empty, 0), null);
  assert.equal(step3.step3Data(empty, 0), null);
  assert.equal(step4.step4Data(empty, 0), null);
  const bad = buildLabView(runToEnd({ shape: [[0, 0], [1, 0], [0, 1], [1, 1]], seed: [0, 0], colour: 1 }).events);
  const d1 = step1.step1Data(bad, 0);
  assert.equal(d1.error.p, 2);
  assert.equal(d1.primes.length, 0);
});

test("module contract: a title in the table of steps, subCount, render in every step, mountExtras in the extras", () => {
  const steps = [step0, step1, step2, step3, step4, step5, step6, step7];
  const view = buildLabView(runToEnd({ shape: shapeS(1), seed: seedS(1), colour: -1 }).events);
  assert.equal(STEP_TABLES.sign.length, steps.length);
  steps.forEach((m, k) => {
    const { title } = STEP_TABLES.sign[k];
    assert.equal(typeof title, "string", `step ${k}`);
    assert.ok(title.length > 0 && title.length < 30);
    assert.equal(typeof m.subCount, "function");
    assert.equal(typeof m.render, "function");
    assert.equal(m.render.length, 4);
    assert.ok(Number.isInteger(m.subCount(view)));
  });
  assert.equal(typeof extras.mountExtras, "function");
  assert.equal(extras.mountExtras.length, 2);
});

test("the page module loads outside a browser and recomputes a result's input", async () => {
  const page = await import("../../src/ui/pages/lab/index.mjs");
  assert.equal(typeof page.mount, "function");
  assert.equal(page.testHandles(), null);
  assert.equal(page.REBUILD_MS, 100);
  const { result } = runToEnd({ shape: shapeS(2), seed: seedS(2), colour: -1, lift: 1 });
  const inp = page.inputOfResult(result);
  assert.deepEqual(model.labInputRecord(inp), inp);
  assert.equal(runToEnd(inp).result.x0, result.x0);
});
