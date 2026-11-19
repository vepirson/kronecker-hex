// The Explorer's state record and its transitions (src/ui/pages/explore/state.mjs): every transition, the invariants
// of each group of the record checked after every step, the address of every mode, the link of the chip, the
// details popover and the actions of a witness that failed its check.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createExplorerState, shownOf, inShown, chipOf, hasSelection, clearRule, subjectOf, downloadOf, blockedOf, detailsOf,
  modeOf, regionDataOf, witnessDataOf, addressOf, witnessViewOf, selectionOffset, FAILED_TEXT, URL_DIGIT_LIMIT,
  SEL_LIMIT, fieldsOf, fitWhy, incompleteWhy, NOTHING_TO_FIT,
} from "../../src/ui/pages/explore/state.mjs";
import { regionActions } from "../../src/ui/actions.mjs";
import { kronecker } from "../../src/core/kronecker.mjs";
import { floodFill } from "../../src/core/regions.mjs";
import { makeWitness, verifyWitness } from "../../src/formats/witness.mjs";
import { parseHash } from "../../src/ui/router.mjs";

const PREFS = { cells: "soft", regionOnClick: true };
const R = floodFill(1080n, 517n); // the green region of genus 4 at (1080, 517), 70 cells
const WIT = makeWitness({ id: null, colour: R.colour, x0: 1080n, d0: 517n, seed: [0, 0], shape: R.cells });
const view = (x = "1080", d = "517", extra = {}) => ({ x, d, cell: 22, key: `${x},${d},22,0,0`, at: [0, 0], ...extra });
const TOKEN = "AAAAAAAAAAAA";
// the box of a click on a 640 x 450 canvas at 22 px per cell (windowBox of the page)
const BOX = { cell: 22, halfWidth: 640, halfHeight: 450 };

// the invariants of every group of the record, checked after every transition of the tests below
function invariants(s) {
  // the region job: the job and the running region are set and cleared together, for the same cell
  assert.equal(s.job !== null, s.region.state === "running", "job iff running");
  if (s.job) assert.deepEqual([s.job.x, s.job.d], [s.region.x, s.region.d], "job and region of one cell");
  // the selection: the symbol is the cell's
  if (s.selection) assert.equal(s.selection.k, kronecker(s.selection.x, s.selection.d), "symbol of the selection");
  // the fields: they show a cell only after a click that selected it
  if (s.fields) assert.deepEqual([s.fields.x, s.fields.d], [String(s.selection.x), String(s.selection.d)], "the fields name the selection");
  // the shown region: a finished fill's region at its start cell, the witness's while no region is computed, nothing
  // while a fill runs, stopped or failed
  const sh = shownOf(s);
  const st = s.region.state;
  if (["done", "capped", "infinite"].includes(st)) assert.ok(sh && sh.kind === "region" && sh.ax === s.region.x && sh.ad === s.region.d, "shown: the region");
  else if (st === "idle") assert.equal(sh, s.witness ? s.witness.shown : null, "shown: the witness or nothing");
  else assert.equal(sh, null, "shown: nothing while running, stopped or failed");
  // the witness and the mode: the mode is derived, an error only without a witness
  if (s.openError) assert.equal(s.witness, null, "an error only without a witness");
  assert.equal(["token", "named", "witness"].includes(modeOf(s)), s.witness !== null, "mode of a witness");
  // the opening: a step from -1 on
  if (s.opening) assert.ok(Number.isInteger(s.opening.step) && s.opening.step >= -1, "opening step");
  // the window job: only for a finished region outlined by its part, at that region's start cell, never with a fill
  if (s.windowJob) assert.ok(s.job === null && !!s.region.part && s.windowJob.x === s.region.x && s.windowJob.d === s.region.d, "window job of the shown part");
  // the address: none exactly while a link that could not be opened stays
  assert.equal(addressOf(s, view()) === null, s.openError !== null, "no address only in the error state");
  // the chip's data attributes: written from the record only, the region part carries numbers only for its state
  const rd = regionDataOf(s, null);
  assert.equal(rd.state, st);
  if (st === "idle" || st === "error") assert.deepEqual(Object.keys(rd), ["state"], "no stale numbers on the chip");
  assert.equal(Object.keys(witnessDataOf(s)).length > 0, s.witness !== null, "witness part");
}

test("the invariant check fires on a record that breaks it", () => {
  const s = createExplorerState({ prefs: PREFS }).get();
  invariants(s);
  assert.throws(() => invariants({ ...s, job: { id: 1, x: 1n, d: 1n, last: null } }), /job iff running/);
  assert.throws(() => invariants({ ...s, selection: { x: 2n, d: 4n, k: 1 } }), /symbol of the selection/);
  assert.throws(() => invariants({ ...s, openError: { key: "k" }, witness: { shown: null, token: "A", name: null } }), /an error only without a witness/);
  assert.throws(() => invariants({ ...s, region: { state: "error", x: 1n, d: 1n, colour: 1, res: { area: 1, colour: 1 }, ms: 1 } }), /no stale numbers/);
});

// a model wrapped so that the invariants are checked after every transition
function model(prefs = PREFS) {
  const m = createExplorerState({ prefs });
  return new Proxy(m, {
    get(target, k) {
      const f = target[k];
      if (k === "get" || typeof f !== "function") return f;
      return (...a) => {
        const out = f(...a);
        invariants(target.get());
        return out;
      };
    },
  });
}

// the results of the worker for the region at (1080, 517)
const RES = { area: R.area, genus: R.genus, colour: R.colour, complete: true, symbolsEvaluated: 43, infinite: null };
function computed(m, x = 1080n, d = 517n) {
  m.selectCell(x, d);
  m.fillDone(m.get().job.id, RES, R.cells, null, 30);
}
function opened(m, extra = {}) {
  return m.openWitness({ witness: WIT, x0: 1080n, d0: 517n, token: TOKEN, source: "token", t0: 0, shownAt: 0, openMs: 1, ...extra });
}

test("selectCell computes the region of a cell outside the shown region, a cell inside it only moves the selection", () => {
  const m = model();
  m.selectCell(1080n, 517n, { key: "k1" });
  const s = m.get();
  assert.deepEqual(s.selection, { x: 1080n, d: 517n, k: 1 });
  assert.deepEqual(s.fields, { x: "1080", d: "517", key: "k1" });
  assert.equal(s.region.state, "running");
  const id = s.job.id;
  m.fillProgress(id, { cells: 12 });
  assert.equal(m.get().region.last.cells, 12);
  m.fillProgress(id + 99, { cells: 99 });
  assert.equal(m.get().region.last.cells, 12, "a message of another job is ignored");
  m.fillDone(id, RES, R.cells, null, 30);
  assert.equal(m.get().region.state, "done");
  assert.equal(shownOf(m.get()).cells.length, 70);
  const [i, j] = R.cells[5];
  assert.equal(inShown(m.get(), 1080n + BigInt(i), 517n + BigInt(j)), true);
  m.selectCell(1080n + BigInt(i), 517n + BigInt(j));
  assert.equal(m.get().job, null, "a cell of the shown region: no new fill");
  assert.equal(m.get().fields, null, "a selection without a click key: the fields follow the view");
  m.selectCell(0n, 1n, { fill: false });
  assert.equal(m.get().region.state, "done", "fill false selects only");
  // a second click on the running cell does not restart its fill
  m.startFill(5n, 7n);
  const job = m.get().job.id;
  m.selectCell(5n, 7n);
  assert.equal(m.get().job.id, job);
});

test("fill end states: capped, infinite (with its window part), stopped by hand, failed", () => {
  const m = model();
  m.startFill(3n, 4n);
  m.fillDone(m.get().job.id, { area: 200000, colour: -1, complete: false, infinite: null, symbolsEvaluated: 9 }, [[0, 0]], { count: 1, cut: false, limit: 200000, box: {} }, 5);
  assert.equal(m.get().region.state, "capped");
  assert.equal(regionDataOf(m.get(), null).outlined, "1");
  m.startFill(3n, 4n);
  m.fillDone(m.get().job.id, { area: 9, colour: -1, complete: false, infinite: { id: "line", text: "t" }, symbolsEvaluated: 9 }, [[0, 0]], { count: 1, cut: false, limit: 200000, box: {} }, 5);
  assert.equal(m.get().region.state, "infinite");
  assert.equal(regionDataOf(m.get(), null).infinite, "line");
  m.startFill(3n, 4n);
  m.fillProgress(m.get().job.id, { cells: 812 });
  m.stopFill();
  assert.deepEqual([m.get().region.state, m.get().region.count, m.get().job], ["stopped", 812, null]);
  assert.deepEqual(regionDataOf(m.get(), null), { state: "stopped", area: "812" });
  m.stopFill();
  m.startFill(3n, 4n);
  const id = m.get().job.id;
  assert.equal(m.fillFailed(id + 1), false);
  assert.equal(m.fillFailed(id), true);
  assert.equal(m.get().region.state, "error");
  assert.equal(m.fillFailed(id), false, "a second report of the same failure is not said twice");
});

test("a witness: opened, checked, its actions, closed; the check of a closed witness is ignored", () => {
  const m = model();
  computed(m);
  const id = opened(m);
  let s = m.get();
  assert.equal(s.selection, null, "opening a witness clears the selection");
  assert.equal(s.region.state, "idle");
  assert.equal(chipOf(s), "witness");
  assert.equal(modeOf(s), "token");
  assert.equal(witnessDataOf(s).pass, undefined, "no verdict yet");
  const r = verifyWitness(WIT);
  m.verifyDone(id, r, 12, 40);
  s = m.get();
  assert.equal(witnessDataOf(s).pass, "true");
  assert.equal(witnessDataOf(s).badgeMs, "40");
  m.verifyFailed(id, "late");
  assert.equal(m.get().witness.verify.pass, true, "a verdict is final");
  m.painted(7);
  m.painted(9);
  assert.equal(m.get().witness.paintMs, 7, "the first complete paint counts");
  m.closeWitness();
  assert.equal(m.get().witness, null);
  m.verifyDone(id, r, 12, 40);
  assert.equal(m.get().witness, null);
});

test("the opening of a long link: steps, end, cancel (an address link then stays as one that could not be opened)", () => {
  const m = model();
  const id = m.startOpening({ token: TOKEN, cells: 541, fromRoute: true, entry: true, what: "w", t0: 0 });
  m.openingStep(id, 2);
  m.openingStep(id + 1, 4);
  assert.equal(m.get().opening.step, 2);
  assert.equal(m.cancelOpening("k0"), true);
  assert.deepEqual([m.get().opening, m.get().openError], [null, { key: "k0" }]);
  assert.equal(modeOf(m.get()), "error");
  assert.equal(m.cancelOpening("k0"), false);
  m.startOpening({ token: TOKEN, cells: 541, fromRoute: false, entry: false, what: "w", t0: 0 });
  m.clearSelection();
  assert.equal(m.get().openError, null, "a visitor action leaves the error state");
  m.cancelOpening("k1");
  assert.equal(m.get().openError, null, "a pasted link that is cancelled is not an error of the address");
  m.startOpening({ token: TOKEN, cells: 541, fromRoute: true, entry: false, what: "w", t0: 0 });
  opened(m);
  assert.equal(m.get().opening, null, "the opened witness ends the opening");
  m.endOpening();
});

// every action that leaves the error state of a link that could not be opened (the address is then the view's again)
test("a link that could not be opened: every visitor action and a moved view leave the error state", () => {
  const actions = {
    click: (m) => m.selectCell(1n, 2n, { key: "c" }),
    escape: (m) => m.clearOrClose(),
    x: (m) => m.clearOrClose(),
    "view moved (zoom, drag)": (m) => m.viewChanged("k-other"),
    go: (m) => m.goTo(5n, 6n),
    reset: (m) => m.reset(),
    "key r": (m) => m.startFill(1n, 1n),
  };
  for (const [name, act] of Object.entries(actions)) {
    const m = model();
    m.openFailed("k0");
    m.viewChanged("k0");
    assert.equal(addressOf(m.get(), view()), null, `${name}: the bad link stays while the view has not moved`);
    act(m);
    assert.equal(m.get().openError, null, name);
    assert.ok(addressOf(m.get(), view()).startsWith("#/explore"), name);
  }
});

// one rule for Escape and the X, and the same end state for every trigger of "clear" in every state
test("clear: Escape, the X, reset, Go and opening a token, from every state, end in the same selection group", () => {
  const states = {
    "a computed region": (m) => computed(m),
    "a witness alone": (m) => opened(m),
    "a witness with a computed region": (m) => (opened(m), computed(m, 5n, 3n)),
    "an open error": (m) => m.openFailed("k0"),
  };
  const triggers = {
    escape: (m) => m.clearOrClose(),
    x: (m) => m.clearOrClose(),
    reset: (m) => m.reset(),
    go: (m) => m.goTo(9n, 9n),
    "open a token": (m) => opened(m),
  };
  const group = (s) => ({ selection: s.selection && s.selection.x === 9n ? "go" : s.selection, fields: s.fields, region: s.region.state === "running" ? "go" : s.region.state, openError: s.openError });
  for (const [sn, setup] of Object.entries(states)) {
    const ends = {};
    for (const [tn, trigger] of Object.entries(triggers)) {
      const m = model();
      setup(m);
      const rule = clearRule(m.get());
      trigger(m);
      ends[tn] = group(m.get());
      if (tn === "escape" || tn === "x") {
        // the one rule: a selection or a computed region goes first, a witness shown alone closes
        if (sn === "a witness alone") assert.equal(m.get().witness, null, `${sn} ${tn}`);
        if (sn === "a witness with a computed region") assert.ok(m.get().witness, `${sn} ${tn}: the witness shows again`);
        assert.equal(rule, sn === "a witness alone" ? "Close" : sn === "an open error" ? null : "Clear");
      }
    }
    assert.deepEqual(ends.escape, ends.x, `${sn}: Escape and the X`);
    for (const tn of ["reset", "open a token"]) assert.deepEqual(ends[tn], { selection: null, fields: null, region: "idle", openError: null }, `${sn} ${tn}`);
    assert.deepEqual(ends.go, { selection: "go", fields: null, region: "go", openError: null }, `${sn} go`);
  }
});

test("hasSelection: a marker or any computed region, never the witness alone", () => {
  const m = model();
  assert.equal(hasSelection(m.get()), false);
  opened(m);
  assert.equal(hasSelection(m.get()), false);
  m.selectCell(1080n, 517n);
  assert.equal(hasSelection(m.get()), true, "a cell of the witness selected");
  m.clearOrClose();
  assert.ok(m.get().witness, "the first press clears the marker");
  m.clearOrClose();
  assert.equal(m.get().witness, null, "the second closes the witness");
});

test("a witness that failed its check: no download, no edit, no Lab, no link, all with the same reason", () => {
  const m = model();
  const id = opened(m);
  assert.equal(blockedOf(m.get()), null, "while the check runs the actions are offered");
  assert.ok(downloadOf(m.get()).build);
  m.verifyFailed(id, "stated area 3 differs from the recomputed area 70");
  const s = m.get();
  assert.equal(blockedOf(s), FAILED_TEXT);
  assert.equal(downloadOf(s).why, FAILED_TEXT);
  const acts = regionActions(subjectOf(s));
  assert.ok(acts.edit && acts.lab, "the buttons stay (disabled by the page with blockedOf)");
  assert.deepEqual(detailsOf(s).fail, ["stated area 3 differs from the recomputed area 70"]);
  assert.equal(witnessDataOf(s).pass, "false");
  // a computed region on top: the chip shows it, the witness's verdict does not block it
  computed(m, 5n, 3n);
  assert.equal(blockedOf(m.get()), null);
});

test("downloads and subjects: running, a complete region, a region that is not complete, nothing", () => {
  const m = model();
  assert.equal(downloadOf(m.get()).why, "No selection");
  assert.equal(subjectOf(m.get()), null);
  m.startFill(1080n, 517n);
  assert.equal(downloadOf(m.get()).why, "Computing");
  m.fillDone(m.get().job.id, RES, R.cells, null, 30);
  const w = downloadOf(m.get()).build();
  assert.deepEqual([w.area, w.genus, w.x0], [70, 4, "1080"]);
  assert.equal(subjectOf(m.get()).complete, true);
  m.startFill(1080n, 517n);
  m.stopFill();
  assert.equal(downloadOf(m.get()).why, "Stopped");
  assert.equal(subjectOf(m.get()).complete, false);
});

test("details: the same lines for a region found by a click and for the same region opened from its token", () => {
  const a = model();
  computed(a);
  const b = model();
  const id = opened(b);
  b.verifyDone(id, verifyWitness(WIT), 30, 31);
  const da = detailsOf(a.get());
  const db = detailsOf(b.get());
  const kinds = (t) => Object.entries(t).filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0)).map(([k]) => k);
  assert.deepEqual(kinds(da), kinds(db));
  assert.deepEqual([da.x, da.d, da.gcd], [db.x, db.d, db.gcd], "the clicked cell and the witness's seed cell");
  // the cost of the flood fill is no line of the details (developer data): it stays in the chip's data attributes
  assert.deepEqual(Object.keys(da).sort(), ["d", "fail", "gcd", "notes", "x"]);
  assert.equal(regionDataOf(a.get(), null).symbols, "43");
  assert.match(witnessDataOf(b.get()).symbols, /^\d+$/);
  // the x and d fields show the seed cell of the witness the chip shows (the cell of its details), the clicked cell
  // while the view keeps the key of the click, else the view middle
  const v = { x: "5", d: "6" };
  assert.deepEqual(fieldsOf(b.get(), v), { x: db.x.toString(), d: db.d.toString() });
  assert.deepEqual(fieldsOf(createExplorerState({ prefs: PREFS }).get(), v), v);
  const c1 = model();
  c1.selectCell(7n, 9n, { key: "k", fill: false });
  assert.deepEqual(fieldsOf(c1.get(), v), { x: "7", d: "9" });
  // a blue cell has its gcd line, a capped region its note
  const c = model();
  c.startFill(6n, 4n);
  c.fillDone(c.get().job.id, { area: 200000, colour: 0, complete: false, infinite: null, symbolsEvaluated: 9 }, [[0, 0]], null, 5);
  assert.equal(detailsOf(c.get()).gcd, 2n);
  assert.equal(detailsOf(c.get()).notes[0].text, "stopped at the cap of 200000 cells");
  assert.equal(detailsOf(model().get()), null);
});

test("viewChanged: the fields follow the view centre once it moved, the first view after a witness opened is its fitted view", () => {
  const m = model();
  m.selectCell(1n, 2n, { key: "k1", fill: false });
  m.viewChanged("k1");
  assert.ok(m.get().fields);
  m.viewChanged("k2");
  assert.equal(m.get().fields, null);
  opened(m);
  assert.equal(m.get().witness.fitKey, null);
  m.viewChanged("fit");
  m.viewChanged("later");
  assert.equal(m.get().witness.fitKey, "fit");
});

test("addressOf: plain, by name, by token, error, with and without a selection or a moved view, above the 2000-digit rule", () => {
  const m = model();
  assert.equal(addressOf(m.get(), view()), "#/explore?x=1080&d=517&z=22");
  m.selectCell(1083n, 515n, { fill: false });
  assert.equal(addressOf(m.get(), view()), "#/explore?x=1080&d=517&z=22&sel=3,-2");
  assert.deepEqual(selectionOffset(m.get(), view()), [3, -2]);
  assert.equal(addressOf(m.get(), view(String(1083 + SEL_LIMIT + 1))), `#/explore?x=${1083 + SEL_LIMIT + 1}&d=517&z=22`, "a selection too far is left out");
  const long = "7".repeat(URL_DIGIT_LIMIT + 1);
  assert.equal(addressOf(m.get(), view(long)), "#/explore", "above the 2000-digit rule the address is the bare #/explore");
  assert.equal(addressOf(m.get(), view("7".repeat(URL_DIGIT_LIMIT))).length > URL_DIGIT_LIMIT, true, "2000 digits go into the address");
  // a token: bare while the view is the fitted one, with z and at (cells of the rounded zoom) once it moved
  opened(m);
  m.viewChanged("fit");
  assert.equal(addressOf(m.get(), view("1", "2", { key: "fit" })), `#/w/${TOKEN}`);
  assert.equal(addressOf(m.get(), view("1", "2", { key: "moved", cell: 30.004, at: [45, -15.3] })), `#/w/${TOKEN}?z=30&at=1.5,-0.51`);
  assert.equal(addressOf(m.get(), view("1", "2", { key: "moved", at: null })), `#/w/${TOKEN}`, "a base cell too far: no view in the address");
  // by name, and a view that came from the address is always written
  opened(m, { token: null, name: "star_genus0", source: "named", fromAddress: true });
  assert.equal(addressOf(m.get(), view("1", "2", { key: "any", cell: 9, at: [0, 18] })), "#/explore?w=star_genus0&z=9&at=0,2");
  const { path, query } = parseHash("#/explore?w=star_genus0&z=9&at=0,2");
  assert.equal(path, "#/explore");
  assert.deepEqual(witnessViewOf(query), { cell: 9, at: [0, 2] });
  // a witness from a file has no address of its own: the view's
  opened(m, { token: null, name: null, source: "witness" });
  assert.equal(addressOf(m.get(), view()), "#/explore?x=1080&d=517&z=22");
  // the error state: no address, the bad link stays
  m.closeWitness();
  m.openFailed("k");
  assert.equal(addressOf(m.get(), view()), null);
});

test("witnessViewOf: the view of an opened witness from its address, old addresses without it open fitted", () => {
  assert.equal(witnessViewOf({}), null);
  assert.equal(witnessViewOf({ w: "star_genus0" }), null);
  assert.deepEqual(witnessViewOf({ z: "30" }), { cell: 30, at: [0, 0] });
  assert.deepEqual(witnessViewOf({ at: "-1.25,3" }), { cell: null, at: [-1.25, 3] });
  assert.equal(witnessViewOf({ at: "1;2" }), null);
  assert.equal(witnessViewOf({ at: `${SEL_LIMIT + 1},0` }), null);
});

test("prefs: setPrefs changes the page's view options only", () => {
  const m = model();
  m.setPrefs({ cells: "full" });
  assert.deepEqual(m.get().prefs, { cells: "full", regionOnClick: true });
  m.setPrefs({ regionOnClick: false });
  m.selectCell(1080n, 517n);
  assert.equal(m.get().job, null, "region on click off: a click selects only");
});

test("rewindow: the part of a region that is not complete follows the window where the view rests, a stale job is dropped", () => {
  const m = model();
  assert.equal(m.rewindow(BOX), null, "nothing shown: no job");
  computed(m);
  assert.equal(m.rewindow({ ...BOX, cx: 9 }), null, "a complete region is shown whole: no job");
  const INF = { ...RES, complete: false, area: 50, infinite: { id: "line", text: "t" } };
  m.startFill(3n, 4n);
  assert.equal(m.rewindow(BOX), null, "while the fill runs: no job");
  m.fillDone(m.get().job.id, INF, [[0, 0]], { count: 1, cut: false, limit: 200000, box: BOX }, 5);
  const res = m.get().region.res;
  assert.equal(m.rewindow({ ...BOX }), null, "the same box: no job");
  const a = m.rewindow({ ...BOX, cx: 100 });
  assert.equal(m.rewindow({ ...BOX, cx: 100 }), a, "the same new box: the same job");
  const b = m.rewindow({ ...BOX, cx: 200, cell: 30 });
  assert.notEqual(a, b);
  m.windowDone(a, [[5, 5]], { count: 1, cut: false, limit: 200000 });
  assert.deepEqual(shownOf(m.get()).cells, [[0, 0]], "the old outline stays: the result of a stale job is dropped");
  m.windowDone(b, [[0, 0], [1, 0]], { count: 2, cut: true, limit: 200000 });
  const r = m.get().region;
  assert.deepEqual([r.state, r.res, r.cells, r.part.count, r.part.cut, r.part.box.cx, m.get().windowJob], ["infinite", res, [[0, 0], [1, 0]], 2, true, 200, null]);
  assert.equal(shownOf(m.get()).cells, r.cells);
  assert.equal(regionDataOf(m.get()).outlined, "2");
  // a failed job keeps the outline, a new fill or a clear drops a job
  const c = m.rewindow(BOX);
  m.windowFailed(c);
  assert.deepEqual([m.get().windowJob, m.get().region.cells.length], [null, 2]);
  m.rewindow(BOX);
  m.clearSelection();
  assert.equal(m.get().windowJob, null);
});

test("the short reasons of the disabled actions: edit and Lab of a region that is not complete, the fit button", () => {
  // a region that is not complete keeps its pencil and flask, disabled with the reason of its state (regionActions)
  const s = model();
  assert.equal(fitWhy(s.get()), NOTHING_TO_FIT);
  assert.equal(NOTHING_TO_FIT, "No selection");
  s.startFill(1080n, 517n);
  assert.equal(fitWhy(s.get()), "Computing");
  assert.equal(regionActions(subjectOf(s.get())).editWhy, "Computing");
  s.stopFill();
  const acts = regionActions(subjectOf(s.get()));
  assert.deepEqual([acts.edit, acts.lab, acts.editWhy, acts.labWhy], [null, null, "Stopped", "Stopped"]);
  assert.deepEqual(["running", "infinite", "capped", "stopped", "error", "done", "idle"].map(incompleteWhy),
    ["Computing", "Infinite region", "Too large to fill", "Stopped", "Fill failed", null, null]);
  // an infinite region and one cut at the cap: no fit (the outline is only the part around the clicked cell)
  for (const [res, why] of [[{ ...RES, complete: false, area: 50, infinite: { id: "line", text: "t" } }, "Infinite region"], [{ ...RES, complete: false, area: 200000 }, "Too large to fill"]]) {
    const m = model();
    m.startFill(1080n, 517n);
    m.fillDone(m.get().job.id, res, [[0, 0]], { count: 1, cut: false, limit: 200000, box: BOX }, 30);
    assert.equal(fitWhy(m.get()), why);
    assert.equal(regionActions(subjectOf(m.get())).labWhy, why);
  }
  const done = model();
  computed(done);
  assert.equal(fitWhy(done.get()), null);
  assert.deepEqual([regionActions(subjectOf(done.get())).editWhy, regionActions(subjectOf(done.get())).labWhy], [null, null]);
  const w = model();
  opened(w);
  assert.equal(fitWhy(w.get()), null, "an opened witness can be fitted");
  assert.equal(FAILED_TEXT, "Check failed");
});
