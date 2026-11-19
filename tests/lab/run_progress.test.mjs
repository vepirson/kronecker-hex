// The progress display of a long construction: the estimate of the time left from samples of (time, fraction), the
// elapsed time, the overall fraction of a sign run and of a blue run from their plans, the short line, and the one
// rule that refuses a shape before a run. Nothing here depends on the speed of the machine: the samples are given.

import { test } from "node:test";
import assert from "node:assert/strict";

import { remainingMs, leftText, estimateText, elapsedText, ESTIMATE_MIN_MS, ESTIMATE_MIN_FRACTION, RECENT_MS } from "../../src/ui/run_estimate.mjs";
import { runToEnd } from "../../src/construct/index.mjs";
import { CAP_K } from "../../src/construct/pipeline.mjs";
import { ROW_LIMIT } from "../../src/construct/row_limit.mjs";
import { buildLabView } from "../../src/construct/lab_view.mjs";
import { buildBlueView } from "../../src/construct/blue/lab_view.mjs";
import { signFraction, signRunProgress, signPlanCost, SIGN_COST } from "../../src/ui/pages/lab/model.mjs";
import { blueFraction, blueRunProgress } from "../../src/ui/pages/lab/blue/model.mjs";
import { SIGN, BLUE } from "../../src/ui/pages/lab/kinds.mjs";
import { shapeProblem, longestRow, ROW_TOO_LONG, regionActions } from "../../src/ui/actions.mjs";
import { shapeS, seedS, shapeZ, seedZ } from "../../src/core/shapes.mjs";
import { analyseShape, canSendToLab } from "../../src/ui/editor/editor_state.mjs";
import { quickFix, searchesFix, verdictWords, chipLine, verdictMark } from "../../src/ui/editor/verdict.mjs";

// samples of a run that does a fraction `rate` per second, every `step` ms up to `until` ms
const steady = (rate, until, step = 500) => {
  const out = [];
  for (let t = step; t <= until; t += step) out.push({ t, f: Math.min(1, (rate * t) / 1000) });
  return out;
};

test("the estimate: none while the run is young, then the part left over the measured speed", () => {
  assert.equal(remainingMs([]), null);
  assert.equal(remainingMs(null), null);
  // too young: before ESTIMATE_MIN_MS, or before ESTIMATE_MIN_FRACTION
  assert.equal(ESTIMATE_MIN_MS, 3000);
  assert.equal(ESTIMATE_MIN_FRACTION, 0.02);
  assert.equal(estimateText(steady(0.1, 2500)), null, "2.5 s: too young");
  assert.equal(estimateText(steady(0.001, 10000)), null, "1 % after 10 s: too little done");
  // a steady run of 1 % per second: after 10 s, 90 s are left
  assert.equal(Math.round(remainingMs(steady(0.01, 10000))), 90000);
  assert.equal(estimateText(steady(0.01, 10000)), "about 2 min left");
  // 10 % per second: after 4 s, 6 s left
  assert.equal(estimateText(steady(0.1, 4000)), "about 5 s left");
  // the end: nothing left
  assert.equal(remainingMs([{ t: 5000, f: 1 }]), 0);
});

test("the estimate is smoothed: a slower recent stretch moves it half way between the whole run and the recent speed", () => {
  // 2 % per second for 20 s (40 %), then 1 % per second for 20 s (60 % at 40 s)
  const s = [];
  for (let t = 1000; t <= 40000; t += 1000) s.push({ t, f: t <= 20000 ? 0.02 * (t / 1000) : 0.4 + 0.01 * ((t - 20000) / 1000) });
  const whole = 0.6 / 40000;
  // the recent speed: over the last RECENT_MS (15 s), 1 % per second
  const recent = 0.15 / 15000;
  assert.equal(RECENT_MS, 15000);
  assert.ok(Math.abs(remainingMs(s) - 0.4 / ((whole + recent) / 2)) < 1e-6);
  // a stall (no progress lately) keeps the speed of the whole run
  const stall = [...steady(0.01, 10000), { t: 30000, f: 0.1 }];
  assert.ok(Math.abs(remainingMs(stall) - 0.9 / (0.1 / 30000)) < 1e-6);
});

test("the time texts: seconds in fives, minutes rounded up, hours to ten minutes, elapsed as m:ss", () => {
  assert.deepEqual([0, 2000, 7400, 33000, 57000].map(leftText), ["about 5 s left", "about 5 s left", "about 5 s left", "about 35 s left", "about 55 s left"]);
  assert.deepEqual([58000, 61000, 125000, 3540000].map(leftText), ["about 1 min left", "about 2 min left", "about 3 min left", "about 59 min left"]);
  assert.deepEqual([3600000, 4700000, 7200000].map(leftText), ["about 1 h left", "about 1 h 20 min left", "about 2 h left"]);
  assert.equal(leftText(null), null);
  assert.deepEqual([0, 7000, 65000, 760000, 3723000].map(elapsedText), ["0:00", "0:07", "1:05", "12:40", "1:02:03"]);
});

// the fraction after every prefix of the events of a run
const fractions = (events, build, fraction) => events.map((_, k) => fraction(build(events.slice(0, k + 1))));

test("the fraction of a sign run: null before the start, from the plan of its rows, never back within one candidate, 1 at the end", () => {
  const input = { shape: shapeS(4), seed: seedS(4), colour: 1, lift: 1, id: null };
  const { events, result } = runToEnd(input);
  assert.ok(result && result.pass);
  assert.equal(signFraction(buildLabView([])), null);
  const fs = fractions(events, buildLabView, signFraction);
  assert.equal(fs.at(-1), 1);
  const candidates = events.filter((e) => e.type === "dCandidate").length;
  assert.equal(candidates, 1, "S_4 in type +1 passes with its first candidate");
  for (let k = 1; k < fs.length; k++) assert.ok(fs[k] >= fs[k - 1] - 1e-12, `event ${k} ${events[k].type}: ${fs[k - 1]} -> ${fs[k]}`);
  for (const f of fs) assert.ok(f >= 0 && f <= 1);
  // the weights come from the plan: every row costs its first row prime and the squared digits of d
  const view = buildLabView(events);
  const cost = signPlanCost(view.rows);
  const D = view.rows.reduce((s, r) => s + Math.log10(r.q1) + Math.log10(r.q2), 0);
  assert.ok(Math.abs(cost.weights[0] - (SIGN_COST.residue * view.rows[0].q1 + SIGN_COST.rowDigits * D * D)) < 1e-9);
  assert.ok(Math.abs(cost.total - (SIGN_COST.prep + cost.rowsTotal + cost.glue + cost.check)) < 1e-9);
  assert.ok(Math.abs(cost.glue - SIGN_COST.glue * view.rows.length ** 2 * D) < 1e-9);
  // the glue and the check report their progress (stepProgress events, left out of the canonical list)
  assert.ok(events.some((e) => e.type === "stepProgress" && e.step === 6 && e.phase === "glue"));
  assert.ok(events.some((e) => e.type === "stepProgress" && e.step === 7 && e.phase === "check"));
  // the sign construction's entry hands it to the pages
  assert.equal(SIGN.runProgress, signRunProgress);
});

test("the fraction of a sign row in progress: its phases share the row's tables, a long row weighs as its prime", () => {
  // a view with two rows, the second of 40 sign cells, its sort half done
  const rows = [
    { j: 0, k: 3, q1: 101, q2: 103, r1: 5 },
    { j: 1, k: 40, q1: 8388617, q2: 8388619, r1: null },
  ];
  const view = { start: {}, done: null, glued: null, available: [true, true, true, true, true, true, false, false], rows, progress: { j: 1, phase: "sort", done: 1, total: 2 } };
  const { weights, total } = signPlanCost(rows);
  const want = (SIGN_COST.prep + weights[0] + SIGN_COST.residue * 8388617 * (0.25 + 0.6 * 0.5)) / total;
  assert.ok(Math.abs(signFraction(view) - want) < 1e-12);
  const p = signRunProgress({ ...view, rows: rows.map((r) => ({ ...r, cells: [], target: r.r1 === null ? [] : null })) });
  assert.equal(p.line, "3. One row: row 2 of 2");
  assert.match(p.full, /row 1 \(40 cells of type \+1 or -1\), 2 of 2: sort of the table 50%/);
  // the glue half done (its running sum, whose step k costs about k times the first), then the check half done
  const { rowsTotal, glue, check } = signPlanCost(rows);
  const solved = rows.map((r) => ({ ...r, r1: 1 }));
  const gl = { ...view, rows: solved, progress: null, stepProgress: { step: 6, phase: "glue", done: 1, total: 2 } };
  assert.ok(Math.abs(signFraction(gl) - (SIGN_COST.prep + rowsTotal + glue * SIGN_COST.runningShare * 0.25) / total) < 1e-12);
  const ck = { ...gl, glued: {}, stepProgress: { step: 7, phase: "check", done: 1, total: 2 } };
  assert.ok(Math.abs(signFraction(ck) - (SIGN_COST.prep + rowsTotal + glue + check * 0.5) / total) < 1e-12);
  assert.equal(signRunProgress({ ...ck, rows: solved.map((r) => ({ ...r, cells: [], target: null })) }).line, "Check: 50%");
});

test("the fraction of a blue run: null before the window, never back, 1 at the end, the line names the step", () => {
  const input = { shape: shapeZ(6), seed: seedZ(6), colour: 0, id: null };
  const { events, result } = runToEnd(input);
  assert.ok(result && result.pass);
  assert.equal(blueFraction(buildBlueView([])), null);
  const fs = fractions(events, buildBlueView, blueFraction).filter((f) => f !== null);
  assert.equal(fs.at(-1), 1);
  for (let k = 1; k < fs.length; k++) assert.ok(fs[k] >= fs[k - 1] - 1e-12, `${k}: ${fs[k - 1]} -> ${fs[k]}`);
  const atClasses = buildBlueView(events.slice(0, events.findIndex((e) => e.type === "classPrime")));
  assert.match(blueRunProgress(atClasses).line, /^1\. Small primes/);
  assert.equal(BLUE.runProgress, blueRunProgress);
});

test("the one rule before a run: a row of the shape longer than the row limit, for region type +1 or -1 only", () => {
  assert.equal(ROW_LIMIT, 45);
  assert.equal(CAP_K, 47, "the run's limit: the drawn limit and the two end neighbours of a plain row");
  assert.deepEqual(longestRow([[0, 0], [1, 0], [5, 2], [6, 2], [7, 2]]), { j: 2, n: 3 });
  assert.deepEqual(longestRow([]), { j: null, n: 0 });
  const row = (n) => Array.from({ length: n }, (_, i) => [i, 0]);
  for (const colour of [1, -1]) {
    assert.equal(shapeProblem(row(ROW_LIMIT), colour), null, "a row of exactly the limit is tried");
    assert.equal(shapeProblem(row(ROW_LIMIT + 1), colour), ROW_TOO_LONG);
  }
  assert.equal(shapeProblem(row(500), 0), null, "type 0 has no row solve");
  assert.equal(ROW_TOO_LONG, "Row limit 45 cells");
  // a large shape with short rows is never refused: S_60 has 596 cells and rows of at most 5
  const big = shapeS(60);
  assert.equal(big.length, 596);
  assert.equal(shapeProblem(big, 1), null);
  for (const kind of ["region", "witness"]) {
    const acts = regionActions({ kind, complete: true, cells: big, seed: seedS(60), colour: 1, token: null });
    assert.deepEqual([!!acts.lab, acts.labWhy], [true, null], kind);
  }
});

test("the editor's verdict follows the same rule: a row too long is a cross with the words of the refusal, its fix is searched", () => {
  const row = (n) => Array.from({ length: n }, (_, i) => [i, 0]);
  for (const colour of [1, -1]) {
    const a = analyseShape(row(ROW_LIMIT + 1));
    const fix = quickFix(a, colour);
    assert.deepEqual(fix, { none: true, reason: "row_too_long" });
    assert.equal(searchesFix(fix), true);
    assert.equal(verdictWords(fix, colour), ROW_TOO_LONG);
    assert.equal(chipLine(a, fix, colour), ROW_TOO_LONG);
    assert.deepEqual(verdictMark(fix), { icon: "cross", ok: "false" });
    assert.equal(canSendToLab(a, colour), false, "the eye and the flask are disabled with the same words");
    assert.equal(quickFix(analyseShape(row(ROW_LIMIT)), colour), null, "a row of exactly the limit can be packed");
  }
  // type 0: no row solve, the residue test of the neighbours decides (a row of an odd number of cells: its two ends
  // lie in one class modulo 2, so the neighbours miss a class)
  assert.equal(quickFix(analyseShape(row(ROW_LIMIT + 2)), 0), null);
  // a shape that fails its residue test keeps that verdict (the fix is searched)
  assert.equal(quickFix(analyseShape([[0, 0], [1, 0], [0, 1], [1, 1]]), 1), undefined);
});
