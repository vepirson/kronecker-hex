// The view model lists the row-prime events in rowPrimes, one per row with sign cells, in the order of the rows.
import test from "node:test";
import assert from "node:assert/strict";
import { runToEnd } from "../../src/construct/pipeline.mjs";
import { buildLabView } from "../../src/construct/lab_view.mjs";
import { shapeS, seedS } from "../../src/core/shapes.mjs";

test("buildLabView fills rowPrimes with one entry per row that has sign cells", () => {
  const { events, result } = runToEnd({ shape: shapeS(3), seed: seedS(3), colour: 1, lift: 1 });
  assert.ok(result && result.pass);
  const view = buildLabView(events);
  assert.equal(view.rowPrimes.length, view.rows.length);
  assert.ok(view.rowPrimes.length > 0);
  view.rowPrimes.forEach((ev, n) => {
    assert.equal(ev.j, view.rows[n].j);
    assert.equal(ev.q1, view.rows[n].q1);
    assert.equal(ev.q2, view.rows[n].q2);
  });
});
