// The Explorer's memory of the last visit (src/ui/pages/explore/cache.mjs) and the transition restore of its record:
// what a return may show for each kind of address (a hit) and what it computes again (a miss: another position,
// another cell, another witness), the part of a region that is not complete following the window, the bound of the
// entry, and the colour source that keeps its cells when its centre does not move.

import { test } from "node:test";
import assert from "node:assert/strict";

import { keepVisit, takeVisit, keptSize, sizeOf, withinLimits, nearOffset, sameBox, regionReusable, restoreOf, KEEP_LIMITS } from "../../src/ui/pages/explore/cache.mjs";
import { createExplorerState, shownOf, chipOf, addressOf } from "../../src/ui/pages/explore/state.mjs";
import { kroneckerSource, FOLD_LIMIT } from "../../src/render/hex_canvas.mjs";
import { FILL_CAP } from "../../src/workers/floodfill.worker.mjs";
import { floodFill } from "../../src/core/regions.mjs";
import { kronecker } from "../../src/core/kronecker.mjs";
import { makeWitness, verifyWitness } from "../../src/formats/witness.mjs";

const PREFS = { cells: "soft", regionOnClick: true };
const R = floodFill(1080n, 517n); // the green region of genus 4 at (1080, 517), 70 cells
const BOX = { cell: 22, halfWidth: 1280, halfHeight: 840 };
const RES = { area: R.area, genus: R.genus, colour: R.colour, complete: true, infinite: null, symbolsEvaluated: 46 };

// a record with the region of (1080, 517) found by a click (complete, or not complete with a window part of box)
function regionRecord({ complete = true, box = BOX } = {}) {
  const m = createExplorerState({ prefs: PREFS });
  m.selectCell(1080n, 517n);
  const id = m.get().job.id;
  const res = complete ? RES : { ...RES, complete: false, area: FILL_CAP };
  const part = complete ? null : { count: R.cells.length, cut: false, limit: 200000, box };
  m.fillDone(id, res, R.cells, part, 12);
  return m.get();
}
function witnessRecord({ token = "TOKEN", name = null } = {}) {
  const m = createExplorerState({ prefs: PREFS });
  const witness = makeWitness({ id: null, colour: R.colour, x0: 1080n, d0: 517n, seed: [0, 0], shape: R.cells });
  const id = m.openWitness({ witness, x0: 1080n, d0: 517n, token, source: token ? "token" : "named", name, t0: 0, shownAt: 0, openMs: 3 });
  m.verifyDone(id, verifyWitness(witness), 40, 45);
  return m.get();
}
const entryOf = (state, source = kroneckerSource(1080n, 517n)) => ({ source, state, place: { at: [0, 0], cell: 22 }, cap: FILL_CAP });

test("a plain address: the same selected cell and cap is a hit, another cell or a running job is a miss", () => {
  const e = entryOf(regionRecord());
  const hit = restoreOf(e, { kind: "plain", sel: { x: 1080n, d: 517n } });
  assert.ok(hit);
  assert.equal(hit.region.state, "done");
  assert.equal(hit.region.cells, R.cells);
  assert.equal(hit.witness, null);
  assert.equal(restoreOf(e, { kind: "plain", sel: { x: 1081n, d: 517n } }), null, "another cell");
  assert.equal(restoreOf(e, { kind: "plain", sel: null }), null, "no selection in the address");
  assert.equal(restoreOf({ ...e, cap: FILL_CAP + 1 }, { kind: "plain", sel: { x: 1080n, d: 517n } }), null, "another cap");
  assert.equal(restoreOf(entryOf(null), { kind: "plain", sel: { x: 1080n, d: 517n } }), null, "a job ran when the page was left: only the source is kept");
});

test("a region that is not complete is reused with its kept part, which the page then computes for its own window", () => {
  const e = entryOf(regionRecord({ complete: false }));
  const want = { kind: "plain", sel: { x: 1080n, d: 517n } };
  const hit = restoreOf(e, want);
  assert.ok(hit);
  assert.equal(hit.region.part.box, BOX, "the kept part with the box it was computed for");
  assert.equal(regionReusable(e, 1080n, 517n), true);
  assert.equal(regionReusable(e, 1081n, 517n), false);
  // the bare address keeps the selection and the region, nothing is computed again
  const bare = restoreOf(e, { kind: "bare" });
  assert.equal(bare.region.state, "capped");
  assert.equal(bare.refill, false);
  assert.deepEqual([bare.selection.x, bare.selection.d], [1080n, 517n]);
  // the restored record asks for the part of the window of the page's view (rewindow), not for its own box
  const m = createExplorerState({ prefs: PREFS });
  m.restore(bare, { shownAt: 0 });
  assert.equal(m.rewindow(BOX), null, "the same box: nothing to do");
  const id = m.rewindow({ ...BOX, cx: 40 });
  assert.ok(Number.isInteger(id));
  assert.equal(m.get().windowJob.id, id);
  // two boxes are equal when every number is, an absent offset counts as 0
  assert.equal(sameBox(BOX, null), false);
  assert.equal(sameBox(BOX, { ...BOX, cx: 0, cy: 0 }), true);
  assert.equal(sameBox(BOX, { ...BOX, cy: 1 }), false);
  assert.equal(sameBox(BOX, { ...BOX, cell: 27.5 }), false);
});

test("a token or a named witness is a hit for the same token or name only", () => {
  const t = entryOf(witnessRecord({ token: "TOKEN" }));
  assert.ok(restoreOf(t, { kind: "token", token: "TOKEN" }));
  assert.equal(restoreOf(t, { kind: "token", token: "OTHER" }), null);
  assert.equal(restoreOf(t, { kind: "named", name: "star_genus0" }), null);
  const n = entryOf(witnessRecord({ token: null, name: "star_genus0" }));
  const hit = restoreOf(n, { kind: "named", name: "star_genus0" });
  assert.equal(hit.witness.verify.pass, true);
  assert.equal(hit.selection, null);
  assert.equal(restoreOf(n, { kind: "named", name: "green_g100" }), null);
  assert.equal(restoreOf(n, { kind: "token", token: "TOKEN" }), null);
  assert.equal(restoreOf(n, { kind: "plain", sel: { x: 1080n, d: 517n } }), null, "a plain address never shows a witness");
});

test("restore: the record comes back without a job, a kept check is not run again, the first paint is measured anew", () => {
  const before = witnessRecord({ token: "TOKEN" });
  const part = restoreOf(entryOf(before), { kind: "token", token: "TOKEN" });
  const m = createExplorerState({ prefs: PREFS });
  m.restore(part, { fromAddress: false, shownAt: 500 });
  const s = m.get();
  assert.equal(s.job, null);
  assert.equal(chipOf(s), "witness");
  assert.equal(s.witness.verify, before.witness.verify, "the verdict is the kept one");
  assert.equal(s.witness.shownAt, 500);
  assert.equal(s.witness.paintMs, undefined);
  assert.equal(s.witness.fitKey, null);
  assert.equal(shownOf(s).cells, before.witness.witness.shape, "the kept shape, not a copy");
  // the address of the restored record is the one of a fresh open
  const fresh = createExplorerState({ prefs: PREFS });
  fresh.openWitness({ witness: before.witness.witness, x0: 1080n, d0: 517n, token: "TOKEN", source: "token", t0: 0, shownAt: 0 });
  const v = { x: "1080", d: "517", cell: 22, key: "k", at: [0, 0] };
  assert.equal(addressOf(s, v), addressOf(fresh.get(), v));
  // a region: the chip state and the result come back, a later click works as usual
  const r = regionRecord();
  const m2 = createExplorerState({ prefs: PREFS });
  m2.restore(restoreOf(entryOf(r), { kind: "plain", sel: { x: 1080n, d: 517n } }), { shownAt: 0 });
  assert.equal(m2.get().region.state, "done");
  assert.equal(m2.get().region.res, r.region.res);
  assert.equal(m2.get().selection.k, kronecker(1080n, 517n));
  m2.selectCell(2000n, 517n);
  assert.ok(m2.get().job && m2.get().job.id > 0, "a new click starts a new job");
});

test("the entry is one, taken by the next mount, and dropped above its bound", () => {
  const src = kroneckerSource(1080n, 517n);
  for (let i = 0; i < 50; i++) src.compute(i, 0);
  assert.equal(keepVisit(entryOf(regionRecord(), src)), true);
  assert.deepEqual(keptSize(), { cells: 50, rows: 1, shown: R.cells.length });
  // a second leave replaces the first entry
  const other = kroneckerSource(5n, 7n);
  assert.equal(keepVisit(entryOf(null, other)), true);
  assert.equal(takeVisit().source, other);
  assert.equal(takeVisit(), null, "taken once");
  assert.equal(keptSize(), null);
  // the bound: a source with more cells than KEEP_LIMITS.cells is not kept
  const big = { stats: () => ({ cells: KEEP_LIMITS.cells + 1, rows: 10, computed: 0 }) };
  assert.equal(withinLimits(sizeOf({ source: big, state: null })), false);
  assert.equal(keepVisit({ source: big, state: null, place: null }), false);
  assert.equal(takeVisit(), null);
  const rows = { stats: () => ({ cells: 10, rows: KEEP_LIMITS.rows + 1, computed: 0 }) };
  assert.equal(keepVisit({ source: rows, state: null, place: null }), false);
  const shown = { ...regionRecord(), region: { ...regionRecord().region, cells: new Array(KEEP_LIMITS.shown + 1).fill([0, 0]) } };
  assert.equal(keepVisit(entryOf(shown, src)), false);
  assert.equal(takeVisit(), null);
});

test("nearOffset: a cell within FOLD_LIMIT of the source centre keeps the source", () => {
  const src = kroneckerSource(1080n, 517n);
  assert.deepEqual(nearOffset(src, 1085n, 510n), [5, -7]);
  assert.deepEqual(nearOffset(src, 1080n + BigInt(FOLD_LIMIT), 517n), [FOLD_LIMIT, 0]);
  assert.equal(nearOffset(src, 1081n + BigInt(FOLD_LIMIT), 517n), null);
  assert.equal(nearOffset(src, 1080n, 517n - BigInt(FOLD_LIMIT) - 1n), null);
});

test("the colour source keeps its cells when its centre does not move, and clears them for another centre", () => {
  const src = kroneckerSource(1080n, 517n);
  src.compute(3, 4);
  src.setCentre(1080n, "517");
  assert.equal(src.colour(3, 4), kronecker(1083n, 521n), "same centre: the cell is kept");
  src.setCentre(1081n, 517n);
  assert.equal(src.colour(3, 4), null, "another centre: cleared");
  assert.equal(src.compute(3, 4), kronecker(1084n, 521n));
});
