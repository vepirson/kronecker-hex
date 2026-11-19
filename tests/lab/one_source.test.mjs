// One source for what differs between the kinds and for the colour words: the functions of the Lab's model that work
// for both kinds read the fields of the kind (KIND_FIELDS, picked by kindOf) and never test the kind or the colour,
// the shape editor takes its colour test, its reasons and its words from there, one rule (runPlace) says where a run
// goes, the colour words have one table (colourName of the core and its inverse colourOfName), the toolbars of both
// kinds are built by one skeleton, and the actions that send a region to a page (open in the Explorer, edit, open
// in the Lab) have one function each, shared by the Explorer's chip, the shape editor and the Gallery's cards.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import * as model from "../../src/ui/pages/lab/model.mjs";
import { SIGN, BLUE } from "../../src/ui/pages/lab/kinds.mjs";
import { runPlace, MAIN_THREAD_CELLS } from "../../src/construct/index.mjs";
import { colourName, colourOfName } from "../../src/core/regions.mjs";
import { analyseShape, colourCheckOf, labInputOf } from "../../src/ui/editor/editor_state.mjs";
import { quickFix, chipLine } from "../../src/ui/editor/verdict.mjs";
import { regionActions } from "../../src/ui/actions.mjs";
import { shapeS, seedS, shapeZ, seedZ } from "../../src/core/shapes.mjs";

const src = (rel) => fs.readFileSync(new URL(`../../src/${rel}`, import.meta.url), "utf8");
// the code of a module without its comments
const code = (rel) => src(rel).replace(/\/\/[^\n]*/g, "");

// a test of the kind, and a test of the colour 0 (blue)
const KIND_TEST = /kindOf\([^)]*\)\s*[!=]==?|[!=]==?\s*"(blue|sign)"/;
const BLUE_TEST = /colour\s*[!=]==?\s*0\b|\b0\s*[!=]==?\s*colour\b/;

test("the Lab's model, the shape editor and the Build test neither the kind nor the colour", () => {
  // the Lab's model: the functions of both kinds read the fields of the kind (each kind's own input record still
  // checks its colour)
  assert.equal(KIND_TEST.test(code("ui/pages/lab/model.mjs")), false);
  for (const rel of ["ui/editor/editor_state.mjs", "ui/editor/editor.mjs", "ui/editor/colour_control.mjs", "ui/editor/build.mjs"]) {
    assert.equal(KIND_TEST.test(code(rel)) || BLUE_TEST.test(code(rel)), false, rel);
  }
  // the registry entries carry the pure fields of their kind
  for (const [e, f] of [[SIGN, model.KIND_FIELDS.sign], [BLUE, model.KIND_FIELDS.blue]]) {
    for (const k of Object.keys(f)) assert.equal(e[k], f[k], `${e.id}.${k}`);
  }
  assert.equal(model.fieldsOf({ colour: 0 }), model.KIND_FIELDS.blue);
  assert.equal(model.fieldsOf({ colour: -1 }), model.KIND_FIELDS.sign);
  assert.equal(model.fieldsOf({ replay: { colour: 0 } }), model.KIND_FIELDS.blue);
});

test("the editor's colour test and reasons are those of the kind", () => {
  const a = analyseShape(shapeS(2));
  const b = analyseShape(shapeZ(2));
  for (const [an, shape] of [[a, shapeS(2)], [b, shapeZ(2)]]) {
    for (const colour of [1, -1, 0]) {
      const f = model.fieldsOf({ colour });
      assert.equal(colourCheckOf(an, colour), an[f.analysisPart]);
      const chk = model.colourCheck(shape, colour);
      assert.equal(colourCheckOf(an, colour).admissible, chk === null, `${colour}`);
    }
  }
  assert.equal(chipLine(b, quickFix(b, 0), 0), `${b.area} cells | genus 2`);
  assert.equal(chipLine(b, quickFix(b, 1), 1), "Not admissible");
  assert.deepEqual(labInputOf({ cells: shapeZ(1), seed: seedZ(1), colour: 0 }), model.labInputRecord({ shape: shapeZ(1), seed: seedZ(1), colour: 0, id: null }));
  assert.deepEqual(labInputOf({ cells: shapeS(1), seed: seedS(1), colour: -1 }), model.labInputRecord({ shape: shapeS(1), seed: seedS(1), colour: -1, lift: 1, id: null }));
});

test("one table of colour words: colourName and colourOfName, the Lab's colourWord and readColour read it", () => {
  for (const c of [1, -1, 0]) {
    assert.equal(colourOfName(colourName(c)), c);
    assert.equal(model.colourWord(c), colourName(c));
    assert.equal(model.readColour(colourName(c)), c);
  }
  assert.equal(colourOfName("purple"), null);
  assert.equal(model.readColour("purple"), null);
  assert.equal(model.readColour(undefined), 1);
  // no other module lists the three words
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(new URL(`../../src/${dir}`, import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}${e.name}/`);
      else if (e.name.endsWith(".mjs")) files.push(`${dir}${e.name}`);
    }
  };
  walk("");
  const table = /["'`](green|red|blue)["'`][^\n]*["'`](green|red|blue)["'`]/;
  const hits = files.filter((rel) => rel !== "core/regions.mjs" && table.test(code(rel)));
  assert.deepEqual(hits, []);
});

test("one skeleton for the toolbars of both kinds", () => {
  for (const rel of ["ui/pages/lab/extras.mjs", "ui/pages/lab/blue/extras.mjs"]) {
    const c = code(rel);
    assert.match(c, /mountToolbar\(/, rel);
    assert.equal(/lab-x-hover|createPopovers\(|onCellHover\(|"lab-x-btn"/.test(c), false, rel);
  }
});

test("one function per action that sends a region to a page, the same conditions everywhere", () => {
  // the Explorer's chip and the Gallery's cards decide by regionActions and act by openInEditor and openInLab, the
  // shape editor sends its drawing to the Lab by sendToLab: no page builds these hand-overs itself
  for (const rel of ["ui/pages/explore.mjs", "ui/pages/gallery.mjs"]) {
    const c = code(rel);
    assert.match(c, /regionActions\(/, rel);
    assert.match(c, /openInEditor\(/, rel);
    assert.match(c, /openInLab\(/, rel);
  }
  assert.match(code("ui/editor/editor.mjs"), /sendToLab\(/);
  for (const rel of ["ui/pages/explore.mjs", "ui/pages/gallery.mjs", "ui/editor/editor.mjs"]) {
    const c = code(rel);
    assert.equal(/editorStart\(|store\.set\(\{ lab:|navigate\("#\/lab"\)|#\/lab\/w\/\$\{/.test(c), false, rel);
  }
  // the Explorer's address of a token is written in one place
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(new URL(`../../src/${dir}`, import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}${e.name}/`);
      else if (e.name.endsWith(".mjs")) files.push(`${dir}${e.name}`);
    }
  };
  walk("ui/");
  const hits = files.filter((rel) => rel.startsWith("ui/") && rel !== "ui/actions.mjs" && /#\/w\/\$\{/.test(code(rel)));
  assert.deepEqual(hits, []);
  // the conditions: a complete region of the grid offers both, one that is not complete none, a witness its editor
  // and the Lab (a replay with a token, a live run of its shape without one), whatever its size; a shape of type +1 or
  // -1 with a row longer than the row limit no Lab, with the reason
  const cells = [[0, 0], [1, 0]];
  const r = regionActions({ kind: "region", complete: true, cells, seed: [0, 0], colour: 1 });
  assert.deepEqual([!!r.edit, !!r.lab], [true, true]);
  const n = regionActions({ kind: "region", complete: false, cells, seed: [0, 0], colour: 1 });
  assert.deepEqual([n.edit, n.lab], [null, null]);
  const w = regionActions({ kind: "witness", complete: true, cells, seed: [0, 0], colour: 0, token: null });
  assert.deepEqual([!!w.edit, w.lab, w.labWhy], [true, { cells, seed: [0, 0], colour: 0 }, null]);
  const big = Array.from({ length: 2000 }, (_, i) => [i, 0]);
  for (const kind of ["witness", "region"]) {
    const b = regionActions({ kind, complete: true, cells: big, seed: [0, 0], colour: 0, token: null });
    assert.deepEqual([!!b.edit, !!b.lab, b.labWhy], [true, true, null], `${kind} of type 0: no row solve, any size`);
    const s = regionActions({ kind, complete: true, cells: big, seed: [0, 0], colour: 1, token: null });
    assert.deepEqual([!!s.edit, s.lab, s.labWhy], [true, null, "Row limit 45 cells"], `${kind} of type +1 with a long row`);
  }
  const t = regionActions({ kind: "witness", complete: true, cells, seed: [0, 0], colour: -1, token: "AAAA" });
  assert.deepEqual([t.edit.colour, t.lab], [-1, { token: "AAAA" }]);
});

test("one rule says where a run goes: blue by its size, a green or red replay on the main thread, a live one in the worker", () => {
  const z = (g) => ({ shape: shapeZ(g), seed: seedZ(g), colour: 0 });
  assert.equal(MAIN_THREAD_CELLS, 100);
  for (let g = 1; g <= 20; g++) {
    const want = shapeZ(g).length <= MAIN_THREAD_CELLS ? "main" : "worker";
    assert.equal(runPlace(z(g)), want);
    assert.equal(runPlace({ replay: { ...z(g), classes: [] } }), want);
  }
  assert.equal(runPlace({ shape: shapeS(2), seed: seedS(2), colour: 1 }), "worker");
  assert.equal(runPlace({ replay: { shape: shapeS(2), colour: -1 } }), "main");
  // the Lab, the Explorer and the construction runner ask the rule, nothing else decides it, and the Lab and the
  // Build run their constructions by the runner only
  for (const rel of ["ui/pages/lab/index.mjs", "ui/pages/explore.mjs", "ui/construct_runner.mjs"]) assert.match(code(rel), /runPlace\(/, rel);
  for (const rel of ["ui/pages/lab/index.mjs", "ui/editor/build.mjs"]) {
    assert.match(code(rel), /runConstruction\(/, rel);
    assert.equal(/runToEnd\(|new Worker\(|construct\.worker\.mjs/.test(code(rel)), false, rel);
  }
  for (const rel of ["ui/pages/lab/index.mjs", "ui/pages/lab/model.mjs", "ui/pages/lab/kinds.mjs", "ui/editor/build.mjs", "ui/construct_runner.mjs"]) {
    assert.equal(/inputRunOn|blueRunOn|signRunOn|liveRunOn|BLUE_MAIN_CELLS/.test(code(rel)), false, rel);
  }
});
