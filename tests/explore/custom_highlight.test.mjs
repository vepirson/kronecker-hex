// The Explorer's custom highlight: the address part b=i0,j0,i1,j1,... (the corners of a closed polygon as offsets from
// the address's x and d), the cells of a polygon (polygonCells of src/core/polygon.mjs: inside or on an edge, in the
// lattice coordinates), the limits of b, b together with sel (b wins), the round trip of the address, and the record
// of explore/state.mjs while a highlight is shown (the chip, the actions, a click, Escape, a return to the page).

import { test } from "node:test";
import assert from "node:assert/strict";

import { polygonCells, insideOrOn, POLYGON_CORNER_LIMIT, POLYGON_BOX_LIMIT } from "../../src/core/polygon.mjs";
import {
  createExplorerState, readViewQuery, readCorners, viewQuery, addressOf, customOffsets, shownOf, chipOf, hasSelection, clearRule,
  subjectOf, downloadOf, detailsOf, fieldsOf, fitWhy, customText, customDataOf, customAnchor, SEL_LIMIT,
} from "../../src/ui/pages/explore/state.mjs";
import { restoreOf } from "../../src/ui/pages/explore/cache.mjs";
import { regionActions, NOT_A_REGION } from "../../src/ui/actions.mjs";
import { buildHash, parseHash } from "../../src/ui/router.mjs";
import { kronecker } from "../../src/core/kronecker.mjs";
import { floodFill } from "../../src/core/regions.mjs";
import { FILL_CAP } from "../../src/workers/floodfill.worker.mjs";

const PREFS = { cells: "soft", regionOnClick: true };
const view = (x, d, extra = {}) => ({ x: String(x), d: String(d), cell: 22, key: `${x},${d}`, at: null, ...extra });
const keys = (cells) => cells.map(([i, j]) => `${i},${j}`).sort();
// the corners of the n x n square of A052157 from its corner (r, s), as the Gallery writes them
const square = (n) => (n === 1 ? [[0, 0]] : [[0, 0], [-(n - 1), 0], [-(n - 1), -(n - 1)], [0, -(n - 1)]]);

test("polygonCells: the cells inside or on the closed polygon, sorted by (j, i)", () => {
  // the a(4) square: 16 cells, exactly (-i, -j) for 0 <= i, j < 4
  const a4 = polygonCells(square(4));
  assert.equal(a4.length, 16);
  const want = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) want.push(`${-i},${-j}`);
  assert.deepEqual(keys(a4), want.sort());
  assert.deepEqual(a4, [...a4].sort((p, q) => p[1] - q[1] || p[0] - q[0]), "sorted by (j, i)");
  // one corner: one cell
  assert.deepEqual(polygonCells([[0, 0]]), [[0, 0]]);
  assert.deepEqual(polygonCells([[5, -7]]), [[5, -7]]);
  // two corners: the integer points of the segment
  assert.deepEqual(keys(polygonCells([[0, 0], [2, 4]])), ["0,0", "1,2", "2,4"]);
  // a triangle: i, j >= 0 with i + j <= 4 (the boundary included), 15 cells
  assert.equal(polygonCells([[0, 0], [4, 0], [0, 4]]).length, 15);
  // a polygon of no area (two segments back and forth): the points of its edges only
  const lines = polygonCells([[0, 0], [2, 0], [2, 0], [0, 0], [0, 2]]);
  assert.deepEqual(keys(lines), ["0,0", "0,1", "0,2", "1,0", "2,0"]);
  // a non-convex L: rows j = 0, 1 from i = 0 to 3, rows j = 2, 3 from i = 0 to 1, 12 cells, not (2, 2)
  const L = polygonCells([[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]]);
  assert.deepEqual(keys(L), ["0,0", "0,1", "0,2", "0,3", "1,0", "1,1", "1,2", "1,3", "2,0", "2,1", "3,0", "3,1"]);
  assert.equal(insideOrOn([2, 2], [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]]), false);
  // a corner listed twice and the order of the corners (either way round) change nothing
  assert.deepEqual(keys(polygonCells([[0, 0], [0, -3], [-3, -3], [-3, 0]])), keys(a4));
  assert.deepEqual(keys(polygonCells([[0, 0], [0, 0], [-3, 0], [-3, -3], [0, -3]])), keys(a4));
  // inside or on: an edge point, a corner, an inner point, an outer point
  assert.equal(insideOrOn([-1, 0], square(4)), true);
  assert.equal(insideOrOn([-3, -3], square(4)), true);
  assert.equal(insideOrOn([-1, -2], square(4)), true);
  assert.equal(insideOrOn([1, 0], square(4)), false);
  assert.equal(insideOrOn([-4, -1], square(4)), false);
});

test("polygonCells: the limits (corners, rectangle of the corners, integers)", () => {
  assert.equal(POLYGON_CORNER_LIMIT, 16);
  assert.equal(POLYGON_BOX_LIMIT, 4096);
  assert.equal(polygonCells([]), null);
  assert.equal(polygonCells(null), null);
  assert.equal(polygonCells(Array.from({ length: 16 }, (_, k) => [k % 4, 0])).length, 4);
  assert.equal(polygonCells(Array.from({ length: 17 }, () => [0, 0])), null, "17 corners");
  assert.equal(polygonCells([[0, 0], [63, 63]]).length, 64, "a 64 x 64 rectangle of corners: 4096 cells, allowed");
  assert.equal(polygonCells([[0, 0], [64, 63]]), null, "65 x 64 cells: over the limit");
  assert.equal(polygonCells([[0, 0], [5000, 0]]), null, "a long segment: its rectangle is over the limit");
  assert.equal(polygonCells([[0.5, 0]]), null);
  assert.equal(polygonCells([[0, 0, 0]]), null);
  assert.equal(polygonCells([["1", 0]]), null);
});

test("readViewQuery reads b: valid, malformed, over the limits, and b together with sel", () => {
  const a4 = readViewQuery({ x: "10199373", d: "7247646", z: "40", b: "0,0,-3,0,-3,-3,0,-3" });
  assert.deepEqual(a4.b, square(4));
  assert.deepEqual(a4.problems, []);
  assert.equal(a4.sel, null);
  assert.deepEqual(readViewQuery({ x: "2", d: "0", b: "0,0" }).b, [[0, 0]]);
  assert.deepEqual(readCorners("0,0,-3,0,-3,-3,0,-3"), square(4));
  // malformed: an odd count, letters, other separators, empty, spaces, a trailing comma
  for (const bad of ["1,2,3", "a,b", "1;2", "", "1, 2", "1,2,", ",1,2", "1.5,2", "+1,2"]) {
    const r = readViewQuery({ x: "5", d: "7", b: bad });
    assert.equal(r.b, null, JSON.stringify(bad));
    assert.deepEqual(r.problems, ["The highlighted cells of the address are not valid."], JSON.stringify(bad));
    assert.equal(r.x, 5n, "the rest of the address is kept");
  }
  // over the limits: an offset larger than SEL_LIMIT, 17 corners, a rectangle of more than 4096 cells
  assert.equal(readCorners(`${SEL_LIMIT},0`) !== null, true);
  assert.equal(readCorners(`${SEL_LIMIT + 1},0`), null);
  assert.equal(readCorners("99999999999999999999999,0"), null);
  assert.equal(readCorners(Array.from({ length: 17 }, () => "0,0").join(",")), null);
  assert.equal(readCorners(Array.from({ length: 16 }, () => "0,0").join(",")) !== null, true);
  assert.equal(readCorners("0,0,64,0,64,63"), null);
  // b wins over sel: a valid b drops sel (no sentence about it), a b that is ignored leaves sel as it is
  const both = readViewQuery({ x: "5", d: "7", sel: "1,2", b: "0,0,-1,0" });
  assert.deepEqual([both.sel, both.b, both.problems], [null, [[0, 0], [-1, 0]], []]);
  const badSel = readViewQuery({ x: "5", d: "7", sel: "nonsense", b: "0,0" });
  assert.deepEqual([badSel.sel, badSel.problems], [null, []], "sel is not even read when b is valid");
  const badB = readViewQuery({ x: "5", d: "7", sel: "1,2", b: "1,2,3" });
  assert.deepEqual([badB.sel, badB.b, badB.problems.length], [[1, 2], null, 1]);
});

test("the address of a custom highlight round trips (read, write, read) with 12-digit coordinates", () => {
  const x = 131487690156n;
  const d = 37945747192n;
  const q = viewQuery({ x, d, cell: 33, b: square(5) });
  assert.equal(q.ok, true);
  const hash = buildHash("#/explore", q.query);
  assert.equal(hash, "#/explore?x=131487690156&d=37945747192&z=33&b=0,0,-4,0,-4,-4,0,-4");
  const back = readViewQuery(parseHash(hash).query);
  assert.deepEqual([back.x, back.d, back.cell, back.b, back.problems], [x, d, 33, square(5), []]);
  // the page writes the same address back from its record
  const m = createExplorerState({ prefs: PREFS });
  assert.equal(m.showCustom(back.x, back.d, back.b), true);
  assert.equal(addressOf(m.get(), view(x, d, { cell: 33 })), hash);
  // viewQuery leaves out a b that is not 1 to 16 corners within SEL_LIMIT
  assert.equal(viewQuery({ x, d, cell: 33, b: [] }).query.b, undefined);
  assert.equal(viewQuery({ x, d, cell: 33, b: [[SEL_LIMIT + 1, 0]] }).query.b, undefined);
  assert.equal(viewQuery({ x, d, cell: 33, b: Array.from({ length: 17 }, () => [0, 0]) }).query.b, undefined);
});

test("the record of a custom highlight: drawn alone, the chip, the anchor's region computed beside it, the address", () => {
  const m = createExplorerState({ prefs: PREFS });
  const x = 10199373n;
  const d = 7247646n;
  m.selectCell(1080n, 517n);
  assert.equal(m.get().region.state, "running");
  assert.equal(m.showCustom(x, d, square(4)), true);
  const s = m.get();
  assert.deepEqual([s.selection, s.witness], [null, null], "no selection, no witness");
  // the fill of the click is dropped, the fill of the anchor (the first corner, here (x, d)) runs instead
  assert.deepEqual([s.region.state, s.job.x, s.job.d, s.region.x, s.region.d], ["running", x, d, x, d]);
  assert.equal(chipOf(s), "custom");
  assert.equal(hasSelection(s), true);
  assert.equal(clearRule(s), "Clear");
  assert.equal(fitWhy(s), null, "the fit button fits it");
  const sh = shownOf(s);
  assert.deepEqual([sh.kind, sh.ax, sh.ad, sh.cells.length, sh.fade], ["custom", x, d, 16, true]);
  // every cell of the a(4) square is of type 0
  assert.deepEqual({ ...s.custom.counts }, { 1: 0, "-1": 0, 0: 16 });
  for (const [i, j] of sh.cells) assert.equal(kronecker(x + BigInt(i), d + BigInt(j)), 0);
  assert.equal(customText(s.custom), "16 cells | all type 0");
  assert.deepEqual(customDataOf(s), { state: "custom", area: "16", corners: "4", plus: "0", minus: "0", zero: "16", colour: "0" });
  // while the anchor's region is computed: pencil, flask and download wait with the reason of a click's running fill
  const acts = regionActions(subjectOf(s));
  assert.deepEqual([acts.edit, acts.lab, acts.editWhy, acts.labWhy], [null, null, "Computing", "Computing"]);
  assert.deepEqual(downloadOf(s), { why: "Computing" });
  const det = detailsOf(s);
  assert.deepEqual([det.x, det.d, det.notes.map((n) => n.text)], [x, d, ["16 cells | all type 0"]]);
  assert.deepEqual(fieldsOf(s, view(x + 7n, d)), { x: String(x), d: String(d) }, "the fields show its anchor cell");
  // the address keeps b while the highlight is shown, its corners as offsets from the view middle
  assert.equal(addressOf(s, view(x, d)), `#/explore?x=${x}&d=${d}&z=22&b=0,0,-3,0,-3,-3,0,-3`);
  assert.equal(addressOf(s, view(x + 2n, d - 1n)), `#/explore?x=${x + 2n}&d=${d - 1n}&z=22&b=-2,1,-5,1,-5,-2,-2,-2`);
  assert.equal(customOffsets(s, view(x + BigInt(SEL_LIMIT), d)), null, "a corner farther than SEL_LIMIT: b left out");
  assert.equal(addressOf(s, view(x + BigInt(SEL_LIMIT), d)), `#/explore?x=${x + BigInt(SEL_LIMIT)}&d=${d}&z=22`);
  // refused corners change nothing
  assert.equal(m.showCustom(x, d, []), false);
  assert.equal(m.get(), s);
});

test("Edit, Algorithm and Download act on the ordinary region of the anchor, exactly as after a click on that cell", () => {
  const x = 10199373n;
  const d = 7247646n;
  const R = floodFill(x, d); // the region of type 0 of (x, d): it holds the whole a(4) square and more
  const RES = { area: R.area, genus: R.genus, colour: R.colour, complete: R.complete, symbolsEvaluated: 1, infinite: null };
  const m = createExplorerState({ prefs: PREFS });
  m.showCustom(x, d, square(4));
  m.fillDone(m.get().job.id, RES, R.cells, null, 1);
  // the same fill after an ordinary click on (x, d)
  const click = createExplorerState({ prefs: PREFS });
  click.selectCell(x, d, { key: "k" });
  click.fillDone(click.get().job.id, RES, R.cells, null, 1);
  const s = m.get();
  // the highlight stays on screen and on the chip, the region is what the actions open
  assert.deepEqual([chipOf(s), shownOf(s).kind, shownOf(s).cells.length], ["custom", "custom", 16]);
  assert.equal(customText(s.custom), "16 cells | all type 0");
  assert.deepEqual(subjectOf(s), subjectOf(click.get()));
  assert.deepEqual(regionActions(subjectOf(s)), regionActions(subjectOf(click.get())));
  const acts = regionActions(subjectOf(s));
  assert.ok(acts.edit, "the pencil is offered");
  assert.equal(acts.edit.cells, R.cells, "the region, not the highlighted cells");
  assert.equal(acts.edit.colour, 0);
  assert.notEqual(acts.edit.cells.length, 16);
  assert.ok(acts.lab || acts.labWhy, "the flask is offered, or says why, as for a click");
  assert.deepEqual(downloadOf(s).build(), downloadOf(click.get()).build(), "the download is the region's witness too");
  // a region that is not complete gives the reasons of a click: here stopped by hand
  const stop = createExplorerState({ prefs: PREFS });
  stop.showCustom(x, d, square(4));
  stop.stopFill();
  assert.equal(chipOf(stop.get()), "custom");
  assert.deepEqual([regionActions(subjectOf(stop.get())).editWhy, downloadOf(stop.get()).why], ["Stopped", "Stopped"]);
  // without a region beside it (none computed yet) the highlight itself is no region
  assert.deepEqual(regionActions({ kind: "custom", cells: [[0, 0]] }).editWhy, NOT_A_REGION);
  // a return to the page reuses the finished region of the anchor
  const bare = restoreOf({ source: null, state: s, cap: FILL_CAP }, { kind: "bare" });
  assert.equal(bare.region, s.region);
  assert.equal(bare.custom, s.custom);
});

test("the anchor of b is the cell of its first corner", () => {
  const q = readViewQuery({ x: "10199373", d: "7247646", z: "40", b: "0,0,-3,0,-3,-3,0,-3" });
  const m = createExplorerState({ prefs: PREFS });
  m.showCustom(q.x, q.d, q.b);
  assert.deepEqual(customAnchor(m.get().custom), { x: 10199373n, d: 7247646n });
  assert.deepEqual([m.get().job.x, m.get().job.d], [10199373n, 7247646n], "its flood fill is the one that runs");
  assert.deepEqual([detailsOf(m.get()).x, detailsOf(m.get()).d], [10199373n, 7247646n]);
  // another first corner: the anchor moves with it, the centre of the address does not
  m.showCustom(100n, 200n, [[2, -1], [0, 0], [2, 0]]);
  assert.deepEqual(customAnchor(m.get().custom), { x: 102n, d: 199n });
  assert.deepEqual([m.get().job.x, m.get().job.d], [102n, 199n]);
});

test("a click on a cell is an ordinary selection and drops the highlight, so do Escape and the X", () => {
  const m = createExplorerState({ prefs: PREFS });
  m.showCustom(131487690156n, 37945747192n, square(5));
  assert.equal(customText(m.get().custom), "25 cells | all type 0");
  // a click inside the square: the highlight goes, the cell is selected and its region computed (as on any click)
  m.selectCell(131487690156n, 37945747192n, { key: "k" });
  let s = m.get();
  assert.equal(s.custom, null);
  assert.equal(s.region.state, "running");
  assert.equal(chipOf(s), "region");
  // Escape
  m.showCustom(2n, 0n, square(1));
  s = m.get();
  assert.deepEqual([s.custom.cells, s.region.state, s.job.x, s.job.d], [[[0, 0]], "running", 2n, 0n], "the fill of its anchor runs");
  assert.equal(customText(s.custom), "1 cell | type 0");
  m.clearOrClose();
  s = m.get();
  assert.deepEqual([s.custom, chipOf(s), shownOf(s)], [null, "idle", null]);
  assert.equal(addressOf(s, view(2n, 0n)), "#/explore?x=2&d=0&z=22");
});

test("a highlight of several types counts each, in the order +1, -1, 0; a return to the page keeps it", () => {
  const m = createExplorerState({ prefs: PREFS });
  const corners = [[0, 0], [5, 0], [5, 3], [0, 3]];
  m.showCustom(1080n, 517n, corners);
  const s = m.get();
  const want = { 1: 0, "-1": 0, 0: 0 };
  for (const [i, j] of polygonCells(corners)) want[kronecker(1080n + BigInt(i), 517n + BigInt(j))]++;
  assert.deepEqual({ ...s.custom.counts }, want);
  assert.equal(s.custom.cells.length, 24);
  const parts = [1, -1, 0].filter((k) => want[k] > 0).map((k) => `${want[k]} type ${k === 1 ? "+1" : String(k)}`);
  assert.equal(customText(s.custom), parts.length === 1 ? `24 cells | all type ${k1(want)}` : `24 cells | ${parts.join(", ")}`);
  // the bare #/explore after leaving the page shows it again
  const bare = restoreOf({ source: null, state: s, cap: 0 }, { kind: "bare" });
  assert.equal(bare.custom, s.custom);
  const m2 = createExplorerState({ prefs: PREFS });
  m2.restore(bare, { shownAt: 0 });
  assert.equal(chipOf(m2.get()), "custom");
  assert.equal(addressOf(m2.get(), view(1080n, 517n)), addressOf(s, view(1080n, 517n)));
  // without one, the bare restore has no custom part
  assert.equal("custom" in restoreOf({ source: null, state: createExplorerState({ prefs: PREFS }).get(), cap: 0 }, { kind: "bare" }), false);
});

// the one type of counts with a single type, as customText writes it
function k1(counts) {
  const k = [1, -1, 0].find((t) => counts[t] > 0);
  return k === 1 ? "+1" : String(k);
}
