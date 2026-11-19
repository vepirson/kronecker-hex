// The selection of the site: the region selected last (in the Explorer, or by a Gallery card's pencil or flask) is
// what the Edit page and the Lab open, from the header's entries as from the region buttons, by the same functions.
// A newer selection replaces the editor's drawing (one undo step) and the Lab's input, the same one does not, an
// address wins, the editor's drawing sent to the Lab stays its input until a new region is selected, and the reset
// button of the editor puts the drawing back to the selection.

import { test } from "node:test";
import assert from "node:assert/strict";

import * as actions from "../../src/ui/actions.mjs";
import { selectRegion, openInEditor, openInLab, labParams, sendToLab, isNewer, regionActions, isHomeCell, HOME_CELL_EXAMPLE } from "../../src/ui/actions.mjs";
import { createStore, defaultState } from "../../src/ui/store.mjs";
import { NAV_OPENERS, parseHash } from "../../src/ui/router.mjs";
import { HOME_VIEW } from "../../src/ui/routes.mjs";
import { startOf } from "../../src/ui/pages/edit.mjs";
import { createEditorState, labInputOf } from "../../src/ui/editor/editor_state.mjs";
import { resetProblem, RESET_NAME, RESET_NONE, RESET_SAME } from "../../src/ui/editor/editor.mjs";
import { shapeQuery } from "../../src/ui/editor/shape_address.mjs";
import { createExplorerState, subjectOf } from "../../src/ui/pages/explore/state.mjs";
import { resolveInput, presetInput } from "../../src/ui/pages/lab/model.mjs";
import { familyInput } from "../../src/ui/gallery/model.mjs";
import { genusOfCells } from "../../src/core/regions.mjs";
import { shapeS, shapeZ, seedZ } from "../../src/core/shapes.mjs";

// a page context: the store and a navigate that records where it went
const page = () => {
  const ctx = { store: createStore(defaultState()), went: [] };
  ctx.navigate = (to) => ctx.went.push(to);
  return ctx;
};

// two regions as the Explorer's chip shows them (offsets from the clicked cell, which is the seed) and a witness with
// a token as a Gallery card shows it
const regionA = { kind: "region", complete: true, cells: shapeS(1), seed: [1, 0], colour: 1, token: null };
const regionB = { kind: "region", complete: true, cells: shapeZ(2), seed: seedZ(2), colour: 0, token: null };
const withToken = { kind: "witness", complete: true, cells: shapeS(2), seed: [1, 0], colour: -1, token: "AAAAAAAAAAAA" };

// The three triggers of each page. The Explorer selects a complete region as soon as it shows it (its render calls
// selectRegion), the header's entry then opens the page without a region, the chip's and the card's buttons give
// theirs.
const shownInExplorer = (ctx, subject) => selectRegion(ctx.store, subject);
const EDIT_TRIGGERS = {
  "header entry": (ctx, subject) => (shownInExplorer(ctx, subject), actions[NAV_OPENERS["#/edit"]](ctx)),
  "chip pencil": (ctx, subject) => (shownInExplorer(ctx, subject), openInEditor(ctx, subject)),
  "card pencil": (ctx, subject) => openInEditor(ctx, subject),
};
const LAB_TRIGGERS = {
  "header entry": (ctx, subject) => (shownInExplorer(ctx, subject), actions[NAV_OPENERS["#/algorithm"]](ctx)),
  "chip flask": (ctx, subject) => (shownInExplorer(ctx, subject), openInLab(ctx, subject)),
  "card flask": (ctx, subject) => openInLab(ctx, subject),
};

// arriveEdit(ctx, editor, query) is the Edit page's start, as the page and mountEditor run it on the editor state:
// the address shape, or the kept drawing with its history and then the selection taken as one edit
function arriveEdit(ctx, editor, query = {}) {
  const { start, take } = startOf(query, ctx.store.get().editor, ctx.store.get().selection);
  if (start) editor.load(start);
  if (take) {
    if (resetProblem(take, editor.snapshot()) === null) editor.replace({ cells: take.shape, seed: take.seed, colour: take.colour });
    ctx.store.set({ editor: { stamp: take.stamp } });
  }
  ctx.store.set({ editor: editor.snapshot() });
}

// arriveLab(ctx, route) is the plan of the Lab at an address it was sent to (resolveInput of the Lab's model on the
// parameters of labParams)
function arriveLab(ctx, route) {
  const token = route.startsWith("#/algorithm/w/") ? route.slice("#/algorithm/w/".length) : null;
  const params = labParams(ctx.store, token ? { token } : {}, {});
  return resolveInput({ params, query: {}, storeInput: ctx.store.get().lab.input, sessionText: null });
}

test("the header's entries Edit and Algorithm call the functions of the region buttons", () => {
  assert.deepEqual(NAV_OPENERS, { "#/edit": "openInEditor", "#/algorithm": "openInLab" });
  assert.equal(actions[NAV_OPENERS["#/edit"]], openInEditor);
  assert.equal(actions[NAV_OPENERS["#/algorithm"]], openInLab);
});

test("selectRegion: a new region gets a new stamp, the same region (also in another list) keeps it, nothing else selects", () => {
  const { store } = page();
  assert.equal(store.get().selection, null);
  const a = selectRegion(store, regionA);
  assert.deepEqual(a, { shape: regionA.cells, seed: [1, 0], colour: 1, token: null, home: false, stamp: 1 });
  const copy = { ...regionA, cells: [...regionA.cells].reverse() };
  assert.equal(selectRegion(store, copy).stamp, 1, "the same cells, seed and type: the same selection");
  assert.equal(store.get().selection.shape, copy.cells, "its list is the new one, so the next check is cheap");
  assert.equal(selectRegion(store, { ...regionA, colour: -1 }).stamp, 2, "another type is another selection");
  assert.equal(selectRegion(store, regionB).stamp, 3);
  assert.equal(selectRegion(store, regionA).stamp, 4, "a region selected again after another one is new");
  // a region that is not complete, a region without cells, nothing at all: the selection stays
  for (const s of [{ ...regionB, complete: false }, { ...regionB, cells: [] }, null]) assert.equal(selectRegion(store, s).stamp, 4);
  assert.equal(isNewer(store.get().selection, 3), true);
  assert.equal(isNewer(store.get().selection, 4), false);
  assert.equal(isNewer(null, 0), false);
});

test("clearing the Explorer's selection keeps the stored selection", () => {
  const { store } = page();
  const xp = createExplorerState({ prefs: { cells: "soft", regionOnClick: true } });
  const id = xp.startFill(1n, 2n);
  assert.equal(subjectOf(xp.get()).complete, false, "a running flood fill is not selected");
  selectRegion(store, subjectOf(xp.get()));
  assert.equal(store.get().selection, null);
  xp.fillDone(id, { complete: true, colour: 1, area: 6, genus: 1 }, shapeS(1), null, 5);
  selectRegion(store, subjectOf(xp.get()));
  const sel = store.get().selection;
  assert.deepEqual([sel.stamp, sel.colour, sel.shape], [1, 1, shapeS(1)]);
  for (const clear of ["clearOrClose", "reset", "clearSelection"]) {
    xp[clear]();
    assert.equal(subjectOf(xp.get()), null, clear);
    selectRegion(store, subjectOf(xp.get()));
    assert.equal(store.get().selection, sel, `${clear}: the stored selection stays`);
  }
});

for (const [name, trigger] of Object.entries(EDIT_TRIGGERS)) {
  test(`Edit by the ${name}: a newer selection becomes the drawing as one undo step, the same one keeps the changes, an address wins`, () => {
    const ctx = page();
    const editor = createEditorState();
    editor.draw(5, 5);
    editor.draw(6, 5);
    ctx.store.set({ editor: { ...editor.snapshot(), ...editor.history() } });
    trigger(ctx, regionA);
    assert.deepEqual(ctx.went, ["#/edit"]);
    arriveEdit(ctx, editor);
    assert.deepEqual(editor.snapshot(), { cells: shapeS(1), seed: [1, 0], colour: 1 }, "the selected region with its type");
    assert.equal(ctx.store.get().editor.stamp, 1);
    // a change, then the same trigger with the same region: the change stays
    editor.draw(0, 0);
    trigger(ctx, regionA);
    arriveEdit(ctx, editor);
    assert.equal(editor.has(0, 0), true, "the same selection: the drawing as it was left");
    assert.equal(ctx.store.get().selection.stamp, 1);
    // another region: it replaces the changed drawing, one undo brings the changed drawing back
    const changed = editor.snapshot();
    trigger(ctx, regionB);
    arriveEdit(ctx, editor);
    assert.deepEqual(editor.snapshot(), { cells: [...shapeZ(2)].sort((p, q) => p[1] - q[1] || p[0] - q[0]), seed: seedZ(2), colour: 0 });
    assert.equal(ctx.store.get().editor.stamp, 2);
    editor.undo();
    assert.deepEqual(editor.snapshot(), changed, "one undo: the changed drawing and its type");
    editor.undo();
    editor.undo();
    assert.deepEqual(editor.cells(), [[5, 5], [6, 5]], "the earlier drawing further back in the same history");
    // an address with a shape wins over a newer selection
    trigger(ctx, regionA);
    const q = shapeQuery(shapeS(2), -1);
    assert.deepEqual(startOf(q, ctx.store.get().editor, ctx.store.get().selection).take, undefined);
    arriveEdit(ctx, editor, q);
    assert.deepEqual([editor.size, editor.colour], [shapeS(2).length, -1]);
  });
}

test("Edit: the three triggers end in the same state", () => {
  const ends = Object.values(EDIT_TRIGGERS).map((trigger) => {
    const ctx = page();
    const editor = createEditorState();
    trigger(ctx, regionB);
    arriveEdit(ctx, editor);
    return { went: ctx.went, store: ctx.store.get().editor, selection: ctx.store.get().selection.stamp, history: editor.history() };
  });
  for (const e of ends.slice(1)) assert.deepEqual(e, ends[0]);
});

for (const [name, trigger] of Object.entries(LAB_TRIGGERS)) {
  test(`Lab by the ${name}: a newer selection becomes the input, the editor's drawing stays until a new region is selected`, () => {
    const ctx = page();
    trigger(ctx, regionA);
    assert.deepEqual(ctx.went, ["#/algorithm"]);
    let plan = arriveLab(ctx, "#/algorithm");
    assert.deepEqual([plan.kind, plan.input], ["input", labInputOf({ cells: shapeS(1), seed: [1, 0], colour: 1 })]);
    assert.equal(ctx.store.get().lab.stamp, 1);
    // the editor's flask: the drawing is the input, with the present stamp
    const drawing = { cells: [[0, 0], [1, 0], [2, 0]], seed: [0, 0], colour: -1 };
    sendToLab(ctx, drawing);
    assert.deepEqual(ctx.store.get().lab.stamp, 1);
    trigger(ctx, regionA);
    plan = arriveLab(ctx, ctx.went.at(-1));
    assert.deepEqual(plan.input, labInputOf(drawing), "the same selection: the editor's drawing stays the input");
    // a new selection replaces it
    trigger(ctx, regionB);
    plan = arriveLab(ctx, ctx.went.at(-1));
    assert.deepEqual(plan.input, labInputOf({ cells: shapeZ(2), seed: seedZ(2), colour: 0 }));
    assert.equal(ctx.store.get().lab.stamp, 2);
    // a token: replayed by its address, and again by the bare address while no shape came since
    trigger(ctx, withToken);
    assert.equal(ctx.went.at(-1), `#/algorithm/w/${withToken.token}`);
    assert.deepEqual([arriveLab(ctx, ctx.went.at(-1)).kind, ctx.store.get().lab.input, ctx.store.get().lab.stamp], ["token", null, 3]);
    assert.deepEqual(arriveLab(ctx, "#/algorithm"), { kind: "token", token: withToken.token, mode: "replay", runOn: null });
    trigger(ctx, withToken);
    assert.equal(ctx.went.at(-1), "#/algorithm", "taken already: the bare address, which replays it");
    assert.equal(arriveLab(ctx, "#/algorithm").token, withToken.token);
  });
}

test("Lab: the three triggers end in the same state", () => {
  for (const subject of [regionA, withToken]) {
    const ends = Object.values(LAB_TRIGGERS).map((trigger) => {
      const ctx = page();
      trigger(ctx, subject);
      return { went: ctx.went, lab: ctx.store.get().lab, plan: arriveLab(ctx, ctx.went.at(-1)) };
    });
    for (const e of ends.slice(1)) assert.deepEqual(e, ends[0]);
  }
});

test("Lab: an address with a token, a genus or a preset keeps its own input and takes nothing", () => {
  const ctx = page();
  selectRegion(ctx.store, regionA);
  assert.deepEqual(labParams(ctx.store, { token: "BBBBBBBBBBBB" }, {}), { token: "BBBBBBBBBBBB" });
  assert.deepEqual(labParams(ctx.store, {}, { preset: "s1", colour: "green" }), {});
  assert.deepEqual(labParams(ctx.store, {}, { genus: "3" }), {});
  assert.deepEqual([ctx.store.get().lab.stamp, ctx.store.get().lab.input], [0, null]);
  // a shape the one rule refuses before a run (a row longer than the row limit, type +1) is selected but not taken:
  // the Lab keeps what it had
  const big = { kind: "region", complete: true, cells: Array.from({ length: 2000 }, (_, i) => [i, 0]), seed: [0, 0], colour: 1, token: null };
  sendToLab(ctx, { cells: [[0, 0]], seed: [0, 0], colour: 0 });
  openInLab(ctx, big);
  assert.equal(ctx.store.get().selection.stamp, 2);
  assert.deepEqual(arriveLab(ctx, ctx.went.at(-1)).input, labInputOf({ cells: [[0, 0]], seed: [0, 0], colour: 0 }));
});

// the Explorer's region of a clicked cell (x, d) while its fill runs and once it ended with these cells (offsets from
// the cell)
function clicked(x, d, cells, colour) {
  const xp = createExplorerState({ prefs: { cells: "soft", regionOnClick: true } });
  const id = xp.startFill(x, d);
  const running = subjectOf(xp.get());
  xp.fillDone(id, { complete: true, colour, area: cells.length, genus: 0 }, cells, null, 1);
  return { running, done: subjectOf(xp.get()) };
}

// the plan of the Lab at an address with its query (resolveInput on the parameters of labParams)
function arriveLabAt(ctx, route) {
  const { query } = parseHash(route);
  return resolveInput({ params: labParams(ctx.store, {}, query), query, storeInput: ctx.store.get().lab.input, sessionText: null });
}

const EXAMPLE_HREF = "#/algorithm?preset=s1&colour=green";

test("the home cell: every trigger of the Algorithm page opens the example S_1 of region type +1, the Gallery's member of genus 1", () => {
  assert.deepEqual(HOME_CELL_EXAMPLE, { preset: "s1", colour: "green" });
  const home = clicked(HOME_VIEW.x, HOME_VIEW.d, [[0, 0]], 0);
  // the exception comes before every other test: the flask is offered while the region is not complete yet
  const early = regionActions(home.running);
  assert.deepEqual([early.edit, early.lab, early.labWhy], [null, { example: HOME_CELL_EXAMPLE }, null]);
  assert.deepEqual(regionActions(home.done).lab, { example: HOME_CELL_EXAMPLE });
  for (const [name, trigger] of Object.entries(LAB_TRIGGERS)) {
    const ctx = page();
    trigger(ctx, home.done);
    assert.deepEqual(ctx.went, [EXAMPLE_HREF], name);
    assert.equal(ctx.store.get().selection.home, true, name);
    assert.deepEqual([ctx.store.get().lab.input, ctx.store.get().lab.stamp], [null, 0], `${name}: the home cell never becomes the Lab's input`);
    const plan = arriveLabAt(ctx, ctx.went[0]);
    assert.deepEqual([plan.kind, plan.name, plan.colour, plan.g], ["preset", "s1", 1, 1], name);
    const input = presetInput(plan);
    assert.deepEqual(input, familyInput({ section: "s", member: 1, colour: 1 }), "the Gallery's card S_g^{+-1}, genus 1, type +1");
    assert.deepEqual([input.shape.length, genusOfCells(input.shape).genus], [6, 1]);
  }
  // the flask of a running fill of the home cell: the example as well (nothing is selected yet)
  const ctx = page();
  openInLab(ctx, home.running);
  assert.deepEqual([ctx.went, ctx.store.get().selection], [[EXAMPLE_HREF], null]);
});

test("the home cell is a point of the plane: the seed cell placed by at, another cell or no place behaves as before", () => {
  assert.equal(isHomeCell({ at: [0n, 0n], seed: [0, 0] }), true);
  assert.equal(isHomeCell({ at: [-1n, 0n], seed: [1, 0] }), true, "the seed's offset counts");
  assert.equal(isHomeCell({ at: [0n, 0n], seed: [1, 0] }), false);
  assert.equal(isHomeCell({ at: [5n, 7n] }), false);
  assert.equal(isHomeCell({ cells: [[0, 0]], seed: [0, 0] }), false, "no place: a Gallery card, a drawing");
  assert.equal(isHomeCell({ home: true }), true, "a selection keeps the answer");
  // a region of another cell, then the home cell, then the other again: the selection's flag follows, the Lab takes
  // the other region as before
  const other = clicked(1n, 0n, [[0, 0], [1, 0]], 1).done;
  for (const [name, trigger] of Object.entries(LAB_TRIGGERS)) {
    const ctx = page();
    trigger(ctx, other);
    assert.deepEqual(ctx.went, ["#/algorithm"], name);
    assert.equal(ctx.store.get().selection.home, false, name);
    trigger(ctx, clicked(HOME_VIEW.x, HOME_VIEW.d, [[0, 0]], 0).done);
    assert.equal(ctx.went.at(-1), EXAMPLE_HREF, name);
    trigger(ctx, other);
    assert.equal(ctx.went.at(-1), "#/algorithm", name);
    assert.deepEqual(arriveLabAt(ctx, "#/algorithm").input, labInputOf({ cells: [[0, 0], [1, 0]], seed: [0, 0], colour: 1 }), name);
  }
});

test("the home cell on the Edit page: its flask opens the example while the drawing is that selection, else the drawing", () => {
  const ctx = page();
  const editor = createEditorState();
  selectRegion(ctx.store, clicked(HOME_VIEW.x, HOME_VIEW.d, [[0, 0]], 0).done);
  arriveEdit(ctx, editor);
  sendToLab(ctx, editor.snapshot());
  assert.deepEqual([ctx.went.at(-1), ctx.store.get().lab.input], [EXAMPLE_HREF, null]);
  // the editor's own shape: a changed drawing goes to the Lab as before
  editor.draw(1, 0);
  sendToLab(ctx, editor.snapshot());
  assert.equal(ctx.went.at(-1), "#/algorithm");
  assert.deepEqual(ctx.store.get().lab.input, labInputOf(editor.snapshot()));
  // the same cell drawn by hand, not taken from the selection: as before
  const own = page();
  selectRegion(own.store, clicked(HOME_VIEW.x, HOME_VIEW.d, [[0, 0]], 0).done);
  sendToLab(own, { cells: [[0, 0]], seed: [0, 0], colour: 0 });
  assert.equal(own.went.at(-1), "#/algorithm");
});

test("the reset button: disabled without a selection and on the selected region, else one edit that undo takes back", () => {
  assert.deepEqual([RESET_NAME, RESET_NONE, RESET_SAME], ["Reset to selection", "No selection", "Already the selection"]);
  const ctx = page();
  const editor = createEditorState({ cells: [[0, 0]], seed: [0, 0], colour: -1 });
  assert.equal(resetProblem(ctx.store.get().selection, editor.snapshot()), RESET_NONE);
  const sel = selectRegion(ctx.store, regionA);
  assert.equal(resetProblem(sel, editor.snapshot()), null);
  editor.replace({ cells: sel.shape, seed: sel.seed, colour: sel.colour });
  assert.equal(resetProblem(sel, editor.snapshot()), RESET_SAME);
  assert.equal(resetProblem(sel, { cells: editor.cells(), colour: 0 }), null, "the same cells in another type differ");
  editor.undo();
  assert.deepEqual(editor.snapshot(), { cells: [[0, 0]], seed: [0, 0], colour: -1 }, "one undo takes the reset back");
});
