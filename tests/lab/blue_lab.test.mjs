// The blue kind of the Construction Lab: the registry of kinds (src/ui/pages/lab/kinds.mjs), the blue view as the
// blue steps show it (src/ui/pages/lab/blue/), the blue table, the blue texts, the colour check of the presets and
// the input records of both kinds (src/ui/pages/lab/model.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { runToEnd, kindOf, MAIN_THREAD_CELLS } from "../../src/construct/index.mjs";
import { buildBlueView, BLUE_STEP_COUNT } from "../../src/construct/blue/lab_view.mjs";
import { blueCellFacts } from "../../src/construct/blue/inspect.mjs";
import { buildLabView } from "../../src/construct/lab_view.mjs";
import { openToken } from "../../src/formats/token.mjs";
import { shapeZ, seedZ, shapeS, seedS } from "../../src/core/shapes.mjs";
import { cellKey } from "../../src/core/geometry.mjs";
import { splitMath, texToHtml } from "../../src/ui/widgets/math.mjs";
import * as model from "../../src/ui/pages/lab/model.mjs";
import * as blueModel from "../../src/ui/pages/lab/blue/model.mjs";
import { KINDS, SIGN, BLUE, kindEntry, allModules } from "../../src/ui/pages/lab/kinds.mjs";
import { step7Data } from "../../src/ui/pages/lab/step7.mjs";
import { blueStep1Data } from "../../src/ui/pages/lab/blue/step1.mjs";
import { blueStep2Data } from "../../src/ui/pages/lab/blue/step2.mjs";
import { blueStep3Data } from "../../src/ui/pages/lab/blue/step3.mjs";
import { blueStep4Data } from "../../src/ui/pages/lab/blue/step4.mjs";
import { blueStep0Data } from "../../src/ui/pages/lab/blue/step0.mjs";
import { factsLine } from "../../src/ui/pages/lab/blue/extras.mjs";
import { fileStem } from "../../src/render/export_png.mjs";

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), "utf8"));
const tokens = readJson("../../data/tokens.json");
const z = (g) => runToEnd({ shape: shapeZ(g), seed: seedZ(g), colour: 0 });
const z3 = z(3);
const v3 = buildBlueView(z3.events);

test("registry: one entry per kind with every field, chosen by kindOf only", () => {
  assert.deepEqual(Object.keys(KINDS), ["sign", "blue"]);
  const fields = ["id", "steps", "stepCount", "buildView", "table", "residues", "hasTries", "extras", "errorInfo", "progressText", "stopped", "presets", "resolvePreset", "presetInput", "inputRecord", "check"];
  for (const e of [SIGN, BLUE]) {
    for (const f of fields) assert.ok(e[f] !== undefined, `${e.id}.${f}`);
    assert.equal(e.steps.length, e.stepCount);
    assert.equal(e.buildView([]).available.length, e.stepCount);
    // the two tables of the right side (no tooltip on a table: the column heads name it)
    for (const t of [e.table, e.residues]) {
      for (const f of ["columns", "label", "lines", "keyOf", "focusOf", "subOf"]) assert.ok(t[f] !== undefined, `${e.id} table ${t.label}: ${f}`);
      assert.equal(t.title, undefined);
    }
    assert.equal(e.residues.step, 1);
    assert.equal(e.extras.mountExtras.length, 2);
    // the titles live in the table of steps (steps.mjs), one row per step module
    e.steps.forEach((m, k) => {
      assert.equal(typeof e.labels[k], "string", `${e.id} step ${k}`);
      assert.ok(e.labels[k].length > 0 && e.labels[k].length < 30);
      assert.equal(m.render.length, 4);
      assert.equal(m.subCount(e.buildView([])), 0);
    });
  }
  assert.equal(SIGN.stepCount, 8);
  assert.equal(BLUE.stepCount, BLUE_STEP_COUNT);
  assert.equal(BLUE.stepCount, 6);
  for (const [input, id] of [[{ colour: 0 }, "blue"], [{ colour: 1 }, "sign"], [{ colour: -1 }, "sign"], [{ replay: { colour: 0 } }, "blue"], [{ replay: openToken(tokens.genus100_green).data }, "sign"]]) {
    assert.equal(kindEntry(input).id, id);
    assert.equal(kindEntry(input).id, kindOf(input));
  }
  // no tamper tool and no table import for blue
  assert.equal(BLUE.extras.startEntry, undefined);
  assert.deepEqual(model.contentFilesToLoad(allModules()), ["steps0_4.json", "steps5_7.json", "blue_steps.json"]);
});

test("the lab shell tests the colour nowhere: it reads the kind through the registry", () => {
  const src = fs.readFileSync(new URL("../../src/ui/pages/lab/index.mjs", import.meta.url), "utf8");
  assert.equal(/(colour|kind|\.id)\s*[!=]==?\s*("blue"|"sign"|0|1|-1)\b/.test(src), false);
  assert.equal(/kindOf\(/.test(src), false);
  assert.equal(/construct\/(pipeline|lab_view|blue\/)/.test(src), false);
  assert.match(src, /from "..\/..\/..\/construct\/index.mjs"/);
});

test("blue Z_3 live: the view counts what the steps reveal, the table gives every cell its prime", () => {
  const { result } = z3;
  assert.equal(result.pass, true);
  assert.equal(v3.available.every(Boolean), true);
  const counts = BLUE.steps.map((m) => m.subCount(v3));
  assert.deepEqual(counts, [2, v3.classes.length, v3.privates.length, v3.dSteps.length, v3.xSteps.length + v3.xCandidates.length, v3.verifyRows.length]);
  assert.equal(v3.classes.length, result.classes.length);
  assert.equal(v3.privates.length, result.privates.length);
  assert.equal(v3.dSteps.length, result.classes.length + result.privates.length);
  // the data of every position
  for (let s = 0; s < 6; s++) {
    for (let sub = 0; sub <= counts[s]; sub++) {
      const pos = { step: s, sub };
      const lines = BLUE.table.lines(v3, pos, result);
      assert.equal(lines.length, result.area);
      const f = BLUE.table.focusOf(v3, s, sub);
      if (f !== null) assert.ok(lines.some((l) => l.key === f), `focus ${s}.${sub}`);
    }
  }
  const d0 = blueStep0Data(v3);
  assert.deepEqual([d0.area, d0.genus, d0.B], [result.area, 3, result.B]);
  const d1 = blueStep1Data(v3, counts[1]);
  assert.equal(d1.forcedCount, result.forced.length);
  assert.equal(d1.blueSoFar, result.forced.length);
  assert.equal(d1.remaining, result.privates.length);
  const d2 = blueStep2Data(v3, 1);
  assert.deepEqual([d2.focus.i, d2.focus.j, d2.focus.q], [result.privates[0].i, result.privates[0].j, result.privates[0].q]);
  const d3 = blueStep3Data(v3, counts[3]);
  assert.equal(d3.chosen.d0, result.d0);
  assert.equal(d3.chosen.Md, result.Md);
  const d4 = blueStep4Data(v3, counts[4]);
  assert.equal(d4.candidate.ok, true);
  assert.equal(d4.glued.x0, result.x0);
  assert.equal(d4.real, true);
  assert.equal(blueStep4Data(v3, 1).focus.index, 0);
  // after step 2 the table names the prime of blueCellFacts for every cell
  const all = BLUE.table.lines(v3, { step: 3, sub: 0 }, result);
  for (const l of all) {
    const fact = blueCellFacts(result, l.data.i, l.data.j);
    assert.equal(l.cells.prime.text, String(fact.prime));
    assert.equal(l.cells.kind.text, fact.kind === "private" ? "own" : fact.kind);
  }
  // before step 1 nothing is filled, at step 1 sub 1 only the cells of the class of 2
  assert.ok(BLUE.table.lines(v3, { step: 0, sub: 0 }).every((l) => l.cells.prime.text === model.DOT));
  const at11 = BLUE.table.lines(v3, { step: 1, sub: 1 }).filter((l) => l.cells.prime.text !== model.DOT);
  assert.equal(at11.length, v3.classes[0].members.length);
  assert.ok(at11.every((l) => l.cells.prime.text === "2"));
  // a click on the line of a private cell at step 2 moves to its item, and that item puts the line in focus
  const q = result.privates[result.privates.length - 1];
  const sub = BLUE.table.subOf(v3, 2, cellKey(q.i, q.j));
  assert.equal(sub, result.privates.length);
  assert.equal(BLUE.table.focusOf(v3, 2, sub), cellKey(q.i, q.j));
  const c = result.classes[0].members[0];
  assert.equal(BLUE.table.subOf(v3, 1, cellKey(c[0], c[1])), 1);
  assert.equal(BLUE.table.subOf(v3, 5, cellKey(c[0], c[1])), null);
});

test("blue Z_3 replay of its token: the same view counts, the check panel data passes", () => {
  const op = openToken(z3.result.token);
  assert.equal(kindOf({ replay: op.data }), "blue");
  const r = runToEnd({ replay: op.data });
  assert.equal(r.result.x0, z3.result.x0);
  const v = buildBlueView(r.events);
  assert.equal(v.start.mode, "replay");
  assert.deepEqual(BLUE.steps.map((m) => m.subCount(v)), BLUE.steps.map((m) => m.subCount(v3)));
  const d = step7Data(v, 0, r.result);
  assert.equal(d.mismatches, 0);
  assert.equal(d.rowsOk, d.total);
  assert.equal(d.pass, true);
  assert.equal(d.region.area, z3.result.area);
  const f = step7Data(v, 1, r.result).focus;
  assert.ok(f.want.every((w) => w === 0 || w === null));
  assert.ok(f.bad.every((b) => b === false));
  // a neighbour wants "nonzero": a blue symbol there fails, a sign does not
  assert.equal(model.cellFails({ want: "nonzero", got: 0 }), true);
  assert.equal(model.cellFails({ want: "nonzero", got: -1 }), false);
  assert.equal(model.cellFails({ want: 0, got: 0 }), false);
  assert.equal(model.cellFails({ want: 1, got: -1 }), true);
});

test("blue progress, error and stop texts", () => {
  const cut = z3.events.findIndex((e) => e.type === "classPrime");
  const v = buildBlueView(z3.events.slice(0, cut).concat([{ type: "blueProgress", step: 1, phase: "classes", done: 1, total: 4 }]));
  // the steps are named by their numbers of the answer (index 1 is step 1), the chip says where the run is, not its
  // mode
  assert.deepEqual(blueModel.blueProgressText(v), { chip: "25% classes", text: "Step 1: classes of the small primes, 1 of 4.", percent: 25 });
  const v2 = buildBlueView(z3.events.slice(0, cut + 2));
  assert.deepEqual(blueModel.blueProgressText(v2), { chip: "step 1", text: "Step 1 reached.", percent: null });
  assert.equal(blueModel.blueProgressText(buildBlueView([])), null);
  assert.ok(blueModel.blueProgressText(v).chip.length <= 17);
  assert.deepEqual(blueModel.blueStopped(v2), { code: "stopped", j: null, step: 1 });
  // S_1 cannot be blue: its neighbours meet every class modulo 2
  const bad = runToEnd({ shape: shapeS(1), seed: seedS(1), colour: 0 });
  const e = buildBlueView(bad.events).error;
  assert.equal(e.code, "inadmissible");
  assert.equal(e.p, 2);
  const info = BLUE.errorInfo(e);
  assert.equal(info.sentence, "Every class modulo 2 contains a neighbour of the shape.");
  assert.equal(info.editorLink, true);
  assert.equal(BLUE.errorInfo({ code: "no_x0", message: "m" }).code, "no_x0");
  assert.match(BLUE.errorInfo({ code: "stopped", j: null, step: 4 }).sentence, /during step 1\.4\./);
  // the other codes keep the texts of the sign kind
  assert.deepEqual(BLUE.errorInfo({ code: "tag_mismatch", message: "tag_mismatch: damaged token" }), model.errorInfo({ code: "tag_mismatch", message: "tag_mismatch: damaged token" }));
  // the sign kind's progress chip is the old chip
  assert.equal(SIGN.progressText(buildLabView([])), null);
});

test("colour check: every preset allows one kind only, S_g^{+-1} and the shipped shapes sign, S_g^{0} and the star blue", () => {
  const blueOnly = model.LAB_PRESETS.filter((p) => p.family === "z" || p.name === "g0star").map((p) => p.name);
  assert.equal(blueOnly.length, 11);
  for (const p of model.LAB_PRESETS) {
    const cells = p.family ? model.presetShape(p).shape : readJson(`../../data/shapes/${p.file}`).shape;
    const sign = model.signCheck(cells), blue = model.blueCheck(cells);
    if (blueOnly.includes(p.name)) {
      assert.equal(blue, null, p.name);
      assert.deepEqual(sign, { p: 2, reason: "the shape meets every class modulo 2" }, p.name);
    } else {
      assert.equal(sign, null, p.name);
      assert.deepEqual(blue, { p: 2, reason: "its neighbours meet every class modulo 2" }, p.name);
    }
    assert.deepEqual(model.colourCheck(cells, 0), blue);
    assert.deepEqual(model.colourCheck(cells, -1), sign);
  }
});

test("blue presets, input records and where a live run goes", () => {
  assert.equal(model.readColour("blue"), 0);
  assert.equal(model.colourWord(0), "blue");
  assert.equal(MAIN_THREAD_CELLS, 100);
  for (let g = 1; g <= 10; g++) {
    const plan = model.resolvePreset(`z${g}`, "blue", "replay");
    assert.equal(plan.blocked, undefined);
    assert.equal(plan.mode, "live");
    assert.equal(plan.runOn, shapeZ(g).length <= 100 ? "main" : "worker");
    const inp = model.presetInput(plan);
    assert.deepEqual(inp, { shape: shapeZ(g), seed: seedZ(g), colour: 0, id: null });
    assert.deepEqual(BLUE.inputRecord(inp), inp);
  }
  assert.equal(model.resolvePreset("s2", "blue").blocked.p, 2);
  assert.deepEqual(model.resolvePreset("c100", "blue", "replay"), { kind: "preset", name: "c100", colour: 0, shapeKind: "file", file: "c100.json", tokenLabel: null, mode: "live", runOn: null });
  assert.deepEqual(model.resolveInput({ query: { preset: "z3", colour: "blue" } }).runOn, "main");
  assert.equal(model.resolveInput({ query: { preset: "z3", colour: "green" } }).problem, "$S_{3}^{0}$, genus 3 cannot have region type +1: the shape meets every class modulo 2.");
  // a blue shape from the editor: main thread up to 100 cells
  const small = { shape: shapeZ(3), seed: [0, 0], colour: 0, id: null };
  const big = { shape: shapeZ(20), seed: [0, 0], colour: 0, id: null };
  assert.equal(model.resolveInput({ storeInput: small }).runOn, "main");
  assert.equal(model.resolveInput({ storeInput: big }).runOn, "worker");
  assert.equal(model.resolveInput({ sessionText: JSON.stringify(small) }).input.colour, 0);
  assert.equal(model.resolveInput({ storeInput: { ...small, colour: 1 } }).runOn, "worker");
  assert.equal(BLUE.inputRecord({ ...small, colour: 1 }), null);
  assert.equal(SIGN.inputRecord(small), null);
});

test("blue texts: every id the blue steps use exists, ASCII, no semicolon, formulas typeset", () => {
  const text = readJson("../../content/lab/blue_steps.json");
  const used = new Set();
  for (const f of ["step0.mjs", "step1.mjs", "step2.mjs", "step3.mjs", "step4.mjs", "step5.mjs", "extras.mjs"]) {
    const src = fs.readFileSync(new URL(`../../src/ui/pages/lab/blue/${f}`, import.meta.url), "utf8");
    for (const m of src.matchAll(/kit\.text\("([a-z0-9_.]+)"\)/g)) used.add(m[1]);
  }
  // one text per step, what the step does
  assert.equal(used.size, 6);
  for (const id of used) assert.equal(typeof text[id], "string", id);
  for (const [id, html] of Object.entries(text)) {
    assert.ok(used.has(id), `${id} is used`);
    assert.ok(/^[\x20-\x7e]*$/.test(html), `${id} is ASCII`);
    assert.equal(html.includes(";"), false, `${id} has no semicolon`);
    assert.ok(html.startsWith("<p>") && html.endsWith("</p>"), id);
    for (const piece of html.split(/<[^>]*>/)) {
      for (const p of splitMath(piece)) {
        if (p.type === "math") assert.equal(texToHtml(p.tex, p.display).ok, true, `${id}: ${p.tex}`);
        else assert.equal(p.value.includes("$"), false, `${id}: lone dollar`);
      }
    }
  }
});

test("blue extras: the hover line, and the names of the downloaded files of the site", () => {
  const r = z3.result;
  const c = r.classes[0].members[0];
  assert.equal(factsLine(blueCellFacts(r, c[0], c[1])), "region type 0: the class prime 2 divides x and d");
  const q = r.privates[0];
  assert.equal(factsLine(blueCellFacts(r, q.i, q.j)), `region type 0: its own prime ${q.q} divides x and d`);
  assert.equal(factsLine({ kind: "coprime", prime: null }), "neighbour: x and d coprime, region type +1 or -1");
  assert.equal(factsLine(null), "");
  assert.equal(fileStem(r), `kronecker-blue-genus3-area${r.area}`);
  assert.equal(fileStem({ colour: -1, genus: 2, area: 16 }), "kronecker-red-genus2-area16");
});
