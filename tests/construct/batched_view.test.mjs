// The message protocol of the construction worker (runBatched), the view model of the Lab (buildLabView) and the
// JSON form of the events.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { runBatched, runToEnd, canonicalEvents, eventToJSON, VERSION } from "../../src/construct/pipeline.mjs";
import { solveRowIter } from "../../src/construct/row_solver.mjs";
import { buildLabView } from "../../src/construct/lab_view.mjs";
import { parsePacked } from "../../src/formats/packed.mjs";
import { shapeS, seedS } from "../../src/core/shapes.mjs";

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), "ascii"));

test("runBatched: batches of at most maxEvents, in order, then one final message with the result", () => {
  const input = { shape: shapeS(5), seed: seedS(5), colour: 1 };
  const msgs = [];
  const res = runBatched(input, (m) => msgs.push(m), { maxEvents: 7, maxMs: 1e9, id: 42 });
  assert.ok(msgs.length >= 3);
  const last = msgs[msgs.length - 1];
  assert.deepEqual(Object.keys(last).sort(), ["finished", "id", "result"]);
  assert.equal(last.id, 42);
  assert.equal(last.finished, true);
  assert.equal(last.result, res);
  const batches = msgs.slice(0, -1);
  for (const [k, b] of batches.entries()) {
    assert.equal(b.id, 42);
    assert.ok(Array.isArray(b.events));
    if (k < batches.length - 1) assert.equal(b.events.length, 7);
    else assert.ok(b.events.length >= 1 && b.events.length <= 7);
  }
  const events = batches.flatMap((b) => b.events);
  assert.equal(events[0].type, "start");
  assert.equal(events[0].version, VERSION);
  assert.equal(events[events.length - 1].type, "done");
  const ref = runToEnd(input);
  assert.deepEqual(canonicalEvents(events), canonicalEvents(ref.events));
  assert.equal(res.x0, ref.result.x0);
  assert.equal(res.pass, true);
});

test("runBatched: a batch is sent right after the target of a row with more than 20 sign cells", () => {
  const strip = [];
  for (let i = 0; i < 19; i++) strip.push([i, 0]);
  const msgs = [];
  const res = runBatched({ shape: strip, seed: [0, 0], colour: 1 }, (m) => msgs.push(m), { maxEvents: 100000, maxMs: 1e9 });
  assert.equal(res.pass, true);
  const big = msgs.filter((m) => m.events && m.events.length && m.events[m.events.length - 1].type === "rowTarget");
  assert.ok(big.length >= 1);
  for (const m of big) assert.ok(m.events[m.events.length - 1].cells.length > 20);
  assert.equal(msgs[msgs.length - 1].finished, true);
});

test("runBatched: after an error event the final message carries result null", () => {
  const msgs = [];
  const res = runBatched({ shape: [[0, 0], [1, 0], [0, 1], [1, 1]], seed: [0, 0], colour: 1 }, (m) => msgs.push(m), { id: "x" });
  assert.equal(res, null);
  const last = msgs[msgs.length - 1];
  assert.equal(last.finished, true);
  assert.equal(last.result, null);
  const events = msgs.slice(0, -1).flatMap((m) => m.events);
  assert.equal(events[events.length - 1].type, "error");
  assert.equal(events[events.length - 1].code, "inadmissible");
});

test("buildLabView: well formed after every prefix of a run with rejected candidates, final view agrees with the result", () => {
  const { data } = parsePacked(readJson("../fixtures/packed_thin/green_s09.packed.json"));
  const { events, result } = runToEnd({ shape: data.shape, seed: data.seed, colour: data.colour });
  for (let n = 0; n <= events.length; n++) {
    const pre = events.slice(0, n);
    const v = buildLabView(pre);
    assert.equal(v.available.length, 8);
    for (let s = 0; s < 8; s++) assert.equal(v.available[s], pre.some((e) => e.step === s));
    assert.equal(v.candidates.length, pre.filter((e) => e.type === "dCandidate").length);
    assert.equal(v.smallPrimes.length, pre.filter((e) => e.type === "smallPrime").length);
    assert.equal(v.xSteps.length, pre.filter((e) => e.type === "xCrtStep").length);
    assert.equal(v.verifyRows.length, pre.filter((e) => e.type === "verifyRow").length);
    for (const r of v.rows) {
      assert.ok(Number.isInteger(r.j));
      assert.equal(r.k, r.cells.length);
      assert.ok(Array.isArray(r.attempts));
    }
  }
  const v = buildLabView(events);
  assert.equal(v.start.mode, "live");
  assert.equal(v.rows.length, result.rows.length);
  v.rows.forEach((r, k) => {
    const w = result.rows[k];
    assert.equal(r.j, w.j);
    assert.equal(r.q1, w.q1);
    assert.equal(r.q2, w.q2);
    assert.equal(r.r1, w.r1);
    assert.equal(r.r2, w.r2);
    assert.equal(r.R, w.rho);
    assert.equal(r.u, w.u);
    assert.equal(r.c, w.c);
    assert.equal(r.n, result.d0 + BigInt(w.j));
    assert.deepEqual(r.attempts, [{ R: w.rho, found: true }]);
    assert.equal(r.target.length, w.k);
  });
  assert.deepEqual(v.candidates.map((c) => c.rejected && c.rejected.reason), ["square", "square", "square", null]);
  assert.equal(v.candidates[3].index, result.dIndex);
  assert.equal(v.glued.x0, result.x0);
  assert.equal(v.glued.d0, result.d0);
  assert.equal(v.verifyRegion.equalsShape, true);
  assert.equal(v.done.pass, true);
  assert.equal(v.progress, null);
  assert.equal(v.error, null);
  assert.equal(v.dSteps.length, result.smallPrimes.filter((s) => s.kind === "class").length + result.rows.length);
  assert.deepEqual(v.available, new Array(8).fill(true));
});

test("buildLabView: the attempts of a retried row, and the error of a failed run", () => {
  const shape = shapeS(2), seed = seedS(2);
  const base = runToEnd({ shape, seed, colour: -1 }).result;
  const target = base.rows.find((r) => r.c > 1n);
  let failed = false;
  const hooks = {
    solveRowIter: (args) => {
      if (args.q1 === target.q1 && !failed) {
        failed = true;
        return (function* () { return null; })();
      }
      return solveRowIter(args);
    },
  };
  const { events } = runToEnd({ shape, seed, colour: -1 }, hooks);
  const row = buildLabView(events).rows.find((r) => r.j === target.j);
  assert.equal(row.attempts.length, 2);
  assert.equal(row.attempts[0].found, false);
  assert.equal(row.attempts[1].found, true);
  assert.equal(row.attempts[0].R, target.rho);
  const bad = runToEnd({ shape: [[0, 0], [1, 0], [0, 1], [1, 1]], seed: [0, 0], colour: 1 });
  const v = buildLabView(bad.events);
  assert.equal(v.error.code, "inadmissible");
  assert.equal(v.done, null);
});

test("eventToJSON writes every bigint as a decimal string", () => {
  const { events } = runToEnd({ shape: shapeS(1), seed: seedS(1), colour: 1 });
  for (const e of events) {
    const j = eventToJSON(e);
    const text = JSON.stringify(j);
    assert.ok(text.length > 0);
    assert.deepEqual(JSON.parse(text), j);
  }
  const g = events.find((e) => e.type === "glued");
  assert.equal(eventToJSON(g).x0, g.x0.toString());
  assert.equal(typeof eventToJSON(g).dIndex, "string");
});
