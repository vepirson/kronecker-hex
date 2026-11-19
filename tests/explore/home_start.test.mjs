// Every visit starts with the home cell as the selection of the site, wherever it starts (appState of the router):
// the region the Explorer's default state selects, so that the Explorer later finds it the same. After a reload on any
// page the header's Algorithm opens the example S_1 and the header's Edit takes the home cell, as after a visit of the
// Explorer, and the bare address of the Algorithm page shows that example too. The example never replaces an input the Algorithm page got after the home selection (a drawing sent by
// the editor), the eye of the editor on the unchanged home cell goes back to the home view, and the list of shapes of
// the Algorithm page has an address of its own.

import { test } from "node:test";
import assert from "node:assert/strict";

import { openInEditor, openInLab, labParams, sendToLab, selectRegion, labHref, HOME_CELL_EXAMPLE } from "../../src/ui/actions.mjs";
import { createStore } from "../../src/ui/store.mjs";
import { appState, homeHref, parseHash, NAV_OPENERS } from "../../src/ui/router.mjs";
import { HOME_REGION, HOME_VIEW, SHAPES_QUERY, homeQuery } from "../../src/ui/routes.mjs";
import { floodFill } from "../../src/core/regions.mjs";
import { startOf } from "../../src/ui/pages/edit.mjs";
import { startPlanOf } from "../../src/ui/pages/lab/model.mjs";
import { labInputOf } from "../../src/ui/editor/editor_state.mjs";
import { createExplorerState, subjectOf, readViewQuery } from "../../src/ui/pages/explore/state.mjs";
import { OTHER_SHAPES, OTHER_SHAPES_HREF } from "../../src/ui/pages/lab/step0.mjs";

const EXAMPLE_HREF = "#/algorithm?preset=s1&colour=green";

// a fresh visit: the store of startApp and a navigate that records where it went
const visit = () => {
  const ctx = { store: createStore(appState()), went: [] };
  ctx.navigate = (to) => ctx.went.push(to);
  return ctx;
};
// what the Algorithm page runs at an address (startPlanOf on the parameters of labParams): { plan, replace }
const startLab = (ctx, route, sessionText = null) => {
  const { path, query } = parseHash(route);
  const token = path.startsWith("#/algorithm/w/") ? path.slice("#/algorithm/w/".length) : null;
  return startPlanOf({ params: labParams(ctx.store, token ? { token } : {}, query), query, storeInput: ctx.store.get().lab.input, sessionText });
};
// the plan alone
const arriveLab = (ctx, route) => startLab(ctx, route).plan;

test("the home region is the region of the home cell in the grid: one cell of type 0", () => {
  const ff = floodFill(HOME_VIEW.x, HOME_VIEW.d, 1000);
  assert.equal(ff.complete, true);
  assert.equal(ff.colour, HOME_REGION.colour);
  assert.deepEqual(ff.cells, HOME_REGION.shape.map(([i, j]) => [i, j]));
  assert.deepEqual([...HOME_REGION.seed], [0, 0]);
});

test("the first state selects the home cell as the Explorer's default state does: the Explorer keeps it, no new stamp", () => {
  const st = appState();
  assert.deepEqual(st.selection, { shape: [[0, 0]], seed: [0, 0], colour: 0, token: null, home: true, stamp: 1 });
  assert.equal(st.lab.input, null);
  assert.equal(st.editor.stamp, 0);
  // the Explorer's default state: the home cell clicked, its fill ended with the region
  const xp = createExplorerState({ prefs: { cells: "soft", regionOnClick: true } });
  const id = xp.startFill(HOME_VIEW.x, HOME_VIEW.d);
  const ff = floodFill(HOME_VIEW.x, HOME_VIEW.d, 1000);
  xp.fillDone(id, { complete: true, colour: ff.colour, area: ff.area, genus: ff.genus }, ff.cells, null, 1);
  const ctx = visit();
  const sel = selectRegion(ctx.store, subjectOf(xp.get()));
  assert.equal(sel.stamp, 1, "the same region: the same selection");
  assert.equal(sel.home, true);
});

test("after a reload on any page: the header's Algorithm opens the example, the header's Edit takes the home cell", () => {
  assert.deepEqual(NAV_OPENERS, { "#/edit": "openInEditor", "#/algorithm": "openInLab" });
  const lab = visit();
  openInLab(lab);
  assert.deepEqual(lab.went, [EXAMPLE_HREF]);
  const plan = arriveLab(lab, lab.went[0]);
  assert.deepEqual([plan.kind, plan.name, plan.colour], ["preset", "s1", 1]);
  const edit = visit();
  openInEditor(edit);
  assert.deepEqual(edit.went, ["#/edit"]);
  const start = startOf({}, edit.store.get().editor, edit.store.get().selection);
  assert.deepEqual(start, { start: null, take: edit.store.get().selection }, "the editor takes the home cell");
  // a typed bare address shows what the header's Algorithm shows: the example, its address in place of the bare one
  const bare = startLab(visit(), "#/algorithm");
  assert.deepEqual(bare, { plan: arriveLab(visit(), EXAMPLE_HREF), replace: HOME_CELL_EXAMPLE });
  assert.deepEqual([bare.plan.kind, bare.plan.name, bare.plan.colour], ["preset", "s1", 1]);
  assert.equal(labHref(bare.replace), EXAMPLE_HREF);
  assert.equal(startLab(visit(), EXAMPLE_HREF).replace, null, "the example's own address stays");
  // an address with its own preset, genus or token wins
  assert.equal(arriveLab(visit(), "#/algorithm?preset=s3&colour=red").name, "s3");
  assert.equal(arriveLab(visit(), "#/algorithm?genus=4&colour=green").g, 4);
  assert.equal(arriveLab(visit(), "#/algorithm/w/AAAAAAAA").kind, "token");
});

test("the example never replaces the Algorithm page's own input made after the home selection", () => {
  const ctx = visit();
  // the editor took the home cell, then the visitor drew a shape and sent it with the flask
  ctx.store.set({ editor: { stamp: 1 } });
  const drawing = { cells: [[0, 0], [1, 0], [2, 0]], seed: [0, 0], colour: 1 };
  sendToLab(ctx, drawing);
  assert.equal(ctx.went.at(-1), "#/algorithm");
  assert.deepEqual([ctx.store.get().lab.input, ctx.store.get().lab.stamp], [labInputOf(drawing), 1]);
  // another page, then the header's Algorithm: the drawing, not the example
  openInLab(ctx);
  assert.equal(ctx.went.at(-1), "#/algorithm");
  assert.deepEqual(arriveLab(ctx, "#/algorithm").input, labInputOf(drawing));
  // the home cell is clicked again in the Explorer: the same selection, the drawing stays
  selectRegion(ctx.store, { kind: "region", complete: true, cells: [[0, 0]], seed: [0, 0], colour: 0, token: null, at: [0n, 0n] });
  openInLab(ctx);
  assert.equal(ctx.went.at(-1), "#/algorithm");
  // a new region selected: it is the input
  selectRegion(ctx.store, { kind: "region", complete: true, cells: [[0, 0], [1, 0]], seed: [0, 0], colour: -1, token: null, at: [5n, 7n] });
  openInLab(ctx);
  assert.deepEqual(arriveLab(ctx, ctx.went.at(-1)).input, labInputOf({ cells: [[0, 0], [1, 0]], seed: [0, 0], colour: -1 }));
  // without an own input since the home selection: the example
  const fresh = visit();
  fresh.store.set({ lab: { input: labInputOf(drawing), stamp: 0 } });
  openInLab(fresh);
  assert.equal(fresh.went.at(-1), EXAMPLE_HREF, "an input older than the home selection does not count");
  // the editor's flask on the untouched home cell: the example, as before
  const same = visit();
  same.store.set({ editor: { stamp: 1 } });
  sendToLab(same, { cells: [[0, 0]], seed: [0, 0], colour: 0 });
  assert.equal(same.went.at(-1), EXAMPLE_HREF);
});

test("the bare address: the example only for the home cell with nothing else to run", () => {
  const drawing = { cells: [[0, 0], [1, 0], [2, 0]], seed: [0, 0], colour: 1 };
  // a drawing sent by the editor after the home selection: the drawing, the address stays
  const sent = visit();
  sent.store.set({ editor: { stamp: 1 } });
  sendToLab(sent, drawing);
  assert.deepEqual([startLab(sent, "#/algorithm").plan.input, startLab(sent, "#/algorithm").replace], [labInputOf(drawing), null]);
  // an input in the store from before the home selection: that input, as before
  const old = visit();
  old.store.set({ lab: { input: labInputOf(drawing), stamp: 0 } });
  assert.deepEqual([startLab(old, "#/algorithm").plan.kind, startLab(old, "#/algorithm").replace], ["input", null]);
  // after a reload: the copy of the drawing in sessionStorage, the address stays
  const reload = startLab(visit(), "#/algorithm", JSON.stringify(labInputOf(drawing)));
  assert.deepEqual([reload.plan.kind, reload.plan.from, reload.plan.input, reload.replace], ["input", "session", labInputOf(drawing), null]);
  // the list of shapes stays the list
  assert.deepEqual(startLab(visit(), "#/algorithm?shapes=1"), { plan: { kind: "none", problem: null }, replace: null });
  // another selection: its shape is the input, as before
  const other = visit();
  selectRegion(other.store, { kind: "region", complete: true, cells: [[0, 0], [1, 0]], seed: [0, 0], colour: -1, token: null, at: [5n, 7n] });
  const o = startLab(other, "#/algorithm");
  assert.deepEqual([o.plan.kind, o.plan.input, o.replace], ["input", labInputOf({ cells: [[0, 0], [1, 0]], seed: [0, 0], colour: -1 }), null]);
  // the header's entry and the bare address take the example from the same rule
  const lab = visit();
  openInLab(lab);
  assert.equal(lab.went[0], labHref(startLab(visit(), "#/algorithm").replace));
});

test("the eye of the editor on the unchanged home cell goes back to the home view of the Explorer", () => {
  const st = appState();
  const o = st.editor.origin;
  assert.deepEqual([o.cells, o.colour, o.stamp], [[[0, 0]], 0, 1]);
  assert.equal(o.href, homeHref());
  const { path, query } = parseHash(o.href);
  assert.equal(path, "#/explore");
  const q = readViewQuery(query);
  assert.deepEqual([q.x, q.d, q.cell, q.sel], [HOME_VIEW.x, HOME_VIEW.d, HOME_VIEW.cell, [0, 0]]);
  assert.deepEqual(homeQuery(), { x: "0", d: "0", z: "20" });
  // the editor's rule (startBuildNow): the origin applies while the drawing is that region in its type with its stamp
  assert.equal(o.stamp, st.selection.stamp);
});

test("the list of shapes of the Algorithm page: its own address, shown whatever the input and the selection", () => {
  assert.equal(SHAPES_QUERY, "shapes");
  assert.equal(OTHER_SHAPES, "Other shapes");
  assert.equal(OTHER_SHAPES_HREF, labHref({ shapes: "1" }));
  assert.equal(OTHER_SHAPES_HREF, "#/algorithm?shapes=1");
  const ctx = visit();
  ctx.store.set({ editor: { stamp: 1 } });
  sendToLab(ctx, { cells: [[0, 0], [1, 0]], seed: [0, 0], colour: 1 });
  assert.deepEqual(arriveLab(ctx, OTHER_SHAPES_HREF), { kind: "none", problem: null });
  assert.deepEqual(labParams(ctx.store, {}, { shapes: "1" }), {}, "nothing is taken");
  assert.equal(arriveLab(ctx, "#/algorithm").kind, "input", "the header's Algorithm brings the run back");
  assert.deepEqual(arriveLab(visit(), OTHER_SHAPES_HREF), { kind: "none", problem: null });
});
