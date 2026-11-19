// The pure parts of the Construction Lab shell (src/ui/pages/lab/model.mjs): where the input comes from, the
// presets, the session copy, the stepper position rule, the table model per step, the error and progress texts,
// the content files, and the guard of the numbers in the preset titles and the content texts.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import * as model from "../../src/ui/pages/lab/model.mjs";
import { tokenInLink } from "../../src/ui/actions.mjs";
import { nextPos } from "../../src/ui/widgets/stepper.mjs";
import { runToEnd, CAP_K } from "../../src/construct/pipeline.mjs";
import { buildLabView } from "../../src/construct/lab_view.mjs";
import { reglue } from "../../src/construct/inspect.mjs";
import { openToken } from "../../src/formats/token.mjs";
import { genusOfCells } from "../../src/core/regions.mjs";
import { shapeS, seedS } from "../../src/core/shapes.mjs";

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), "utf8"));
const tokens = readJson("../../data/tokens.json");
const replayOf = (label) => runToEnd({ replay: openToken(tokens[label]).data });

test("input precedence: token route, then preset query, then store input, then session copy, then nothing", () => {
  const shape = { shape: [[0, 0], [1, 0]], seed: [0, 0], colour: -1, lift: 1, id: null };
  const sess = JSON.stringify({ shape: [[0, 0]], seed: [0, 0], colour: 1, lift: 1, id: null });
  const all = { params: { token: "ABC" }, query: { preset: "c100" }, storeInput: shape, sessionText: sess };
  assert.deepEqual(model.resolveInput(all), { kind: "token", token: "ABC", mode: "replay", runOn: null });
  const p = model.resolveInput({ ...all, params: {} });
  assert.equal(p.kind, "preset");
  assert.equal(p.name, "c100");
  const s = model.resolveInput({ ...all, params: {}, query: {} });
  assert.deepEqual(s, { kind: "input", input: shape, from: "store", mode: "live", runOn: "worker" });
  const se = model.resolveInput({ params: {}, query: {}, storeInput: null, sessionText: sess });
  assert.equal(se.kind, "input");
  assert.equal(se.from, "session");
  assert.deepEqual(se.input.shape, [[0, 0]]);
  assert.deepEqual(model.resolveInput({}), { kind: "none", problem: null });
  assert.deepEqual(model.resolveInput({ sessionText: "not json" }), { kind: "none", problem: null });
  const bad = model.resolveInput({ query: { preset: "s11" } });
  assert.equal(bad.kind, "none");
  assert.match(bad.problem, /no shape named "s11"/);
  // a preset whose colour check fails shows the reason on the start panel, an unknown colour is named
  const blocked = model.resolveInput({ query: { preset: "s1", colour: "blue" } });
  assert.equal(blocked.kind, "none");
  assert.equal(blocked.problem, "$S_{1}^{\\pm1}$, genus 1 cannot have region type 0: its neighbours meet every class modulo 2.");
  const badColour = model.resolveInput({ query: { preset: "s1", colour: "purple" } });
  assert.equal(badColour.kind, "none");
  assert.match(badColour.problem, /not \+1, -1 or 0/);
});

test("presets: S_g live on the main thread whatever the mode, compact shapes replay or recompute in the worker", () => {
  const s3 = model.resolvePreset("s3", "red", "replay");
  assert.deepEqual(s3, { kind: "preset", name: "s3", colour: -1, lift: 1, g: 3, shapeKind: "computed", mode: "live", runOn: "main" });
  const inp = model.presetInput(s3);
  assert.deepEqual(inp.shape, shapeS(3));
  assert.deepEqual(inp.seed, seedS(3));
  assert.deepEqual(inp.seed, [1, 0]);
  assert.equal(inp.colour, -1);
  const c = model.resolvePreset("c100", undefined, undefined);
  assert.deepEqual(c, { kind: "preset", name: "c100", colour: 1, lift: 1, shapeKind: "file", file: "c100.json", tokenLabel: "genus100_green", mode: "replay", runOn: "main" });
  const live = model.resolvePreset("maxhex", "red", "live");
  assert.equal(live.tokenLabel, "hexagon_genus117_red");
  assert.equal(live.mode, "live");
  assert.equal(live.runOn, "worker");
  assert.equal(model.resolvePreset("g0hex", "green", "x").tokenLabel, "genus0_hexagon_green");
  for (const bad of ["s0", "s11", "s03", "z0", "z11", "c101", ""]) assert.equal(model.resolvePreset(bad, "green"), null, bad);
  for (const p of model.LAB_PRESETS) {
    for (const col of ["green", "red"]) {
      const r = model.resolvePreset(p.name, col);
      assert.ok(r, p.name);
      if (r.tokenLabel) assert.equal(typeof tokens[r.tokenLabel], "string", r.tokenLabel);
    }
  }
  assert.deepEqual(model.LAB_PRESETS.map((p) => p.name), [
    "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8", "z9", "z10", "c10", "c100", "g0hex", "maxhex", "g0star",
  ]);
  // g0star (the filled star of the answer's third example): no stored construction, live, its file named in the plan
  assert.deepEqual(model.resolvePreset("g0star", "red", "replay"), { kind: "preset", name: "g0star", colour: -1, lift: 1, shapeKind: "file", file: "star_genus0.json", tokenLabel: null, mode: "live", runOn: "main" });
  // z1 is a preset: blue on the main thread, refused in green with the prime of its check
  const z1 = model.resolvePreset("z1", "green");
  assert.equal(z1.blocked.p, 2);
  assert.equal(z1.blocked.text, "$S_{1}^{0}$, genus 1 cannot have region type +1: the shape meets every class modulo 2.");
  assert.equal(z1.blocked.plain, "S_1 (type 0), genus 1 cannot have region type +1: the shape meets every class modulo 2.");
  assert.deepEqual(model.resolvePreset("z3", "blue", "replay"), { kind: "preset", name: "z3", colour: 0, family: "z", g: 3, shapeKind: "computed", mode: "live", runOn: "main" });
});

test("guard: the genus printed in every preset title is the genus of its shape", () => {
  for (const p of model.LAB_PRESETS) {
    const m = /genus ([0-9]+)/.exec(p.title);
    assert.ok(m, p.title);
    const computed = model.presetShape(p);
    const cells = computed ? computed.shape : readJson(`../../data/shapes/${p.file}`).shape;
    assert.equal(genusOfCells(cells).genus, Number(m[1]), p.name);
    const mt = /genus ([0-9]+)/.exec(p.titleTex);
    assert.ok(mt, p.titleTex);
    assert.equal(Number(mt[1]), Number(m[1]), `${p.name} titleTex`);
  }
});

test("the session copy holds numbers only and round-trips, bad records are refused", () => {
  const rec = model.labInputRecord({ shape: [[1, 2], [2, 2]], seed: [1, 2], colour: 1 });
  assert.deepEqual(rec, { shape: [[1, 2], [2, 2]], seed: [1, 2], colour: 1, lift: 1, id: null });
  assert.deepEqual(model.parseSessionRecord(JSON.stringify(rec)), rec);
  assert.deepEqual(Object.keys(rec).sort(), ["colour", "id", "lift", "seed", "shape"]);
  assert.ok(rec.shape.flat().concat(rec.seed).every((v) => typeof v === "number"));
  // a blue record has no lift
  assert.deepEqual(model.labInputRecord({ shape: [[0, 0]], seed: [0, 0], colour: 0, lift: 1 }), { shape: [[0, 0]], seed: [0, 0], colour: 0, id: null });
  for (const bad of [null, {}, { shape: [], seed: [0, 0], colour: 1 }, { shape: [[0, 0]], seed: [0, 0], colour: 2 }, { shape: [[0, 0]], seed: [0], colour: 1 },
    { shape: [[0, 0.5]], seed: [0, 0], colour: 1 }, { shape: [[0, 0]], seed: [0, 0], colour: 1, lift: 4 }, { shape: [[0, 0]], seed: [0, 0], colour: 1, id: 3 }]) {
    assert.equal(model.labInputRecord(bad), null, JSON.stringify(bad));
  }
  assert.equal(model.parseSessionRecord(""), null);
  assert.equal(model.parseSessionRecord("{"), null);
});

test("a pasted token or link gives its token (tokenInLink, the one reader of the site)", () => {
  const t = tokens.genus0_hexagon_green;
  assert.equal(tokenInLink(`  ${t}\n`), t);
  assert.equal(tokenInLink(`https://example.org/kronecker-hex/#/algorithm/w/${t}`), t);
  assert.equal(tokenInLink(`https://example.org/kronecker-hex/#/lab/w/${t}`), t, "the old address of the Algorithm page");
  assert.equal(tokenInLink(`http://127.0.0.1:8000/#/w/${t}?x=1`), t);
  assert.equal(tokenInLink("hello world"), null);
  assert.equal(tokenInLink(""), null);
  // a bare token counts from 8 characters on (a short blue token has 15)
  assert.equal(tokenInLink("JPu7vkSX"), "JPu7vkSX");
  assert.equal(tokenInLink("JPu7vkS"), null);
});

test("stepper position: clamp to steps with events and to 0 .. subCount, next follows the stepper rule", () => {
  const avail = [true, true, true, false, false, false, false, false];
  const counts = [2, 5, 3, 0, 0, 0, 0, 0];
  const sc = (k) => counts[k];
  assert.deepEqual(model.clampPosition({ step: 1, sub: 9 }, avail, sc), { step: 1, sub: 5 });
  assert.deepEqual(model.clampPosition({ step: 6, sub: 1 }, avail, sc), { step: 2, sub: 1 });
  assert.deepEqual(model.clampPosition({ step: undefined, sub: -1 }, avail, sc), { step: 0, sub: 0 });
  assert.deepEqual(model.clampPosition({ step: 3, sub: 0 }, new Array(8).fill(false), sc), { step: 0, sub: 0 });
  // walking with the stepper's next from the start visits every item of every step once
  const full = new Array(8).fill(true);
  const cnt = [2, 3, 1, 0, 4, 0, 0, 2];
  let pos = { step: 0, sub: 0 };
  const seen = [];
  for (;;) {
    seen.push(`${pos.step}.${pos.sub}`);
    const q = nextPos({ ...pos, subCount: cnt[pos.step] }, 8);
    if (!q) break;
    pos = model.clampPosition(q, full, (k) => cnt[k]);
  }
  assert.equal(seen.length, 8 + cnt.reduce((a, b) => a + b, 0));
  assert.equal(seen[seen.length - 1], "7.2");
});

test("table model of the genus-100 green replay: 39 lines, columns fill by step and by sub", () => {
  const { events, result } = replayOf("genus100_green");
  const view = buildLabView(events);
  const at = (step, sub) => model.tableModel(view, { step, sub, result });
  const t2 = at(2, 3);
  assert.equal(t2.length, 39);
  assert.deepEqual(t2.map((l) => l.j), result.rows.map((r) => r.j));
  for (const l of t2) for (const k of ["r1", "r2", "q1", "q2", "R"]) assert.equal(l.cells[k], model.DOT);
  const t3 = at(3, 2);
  assert.equal(t3.filter((l) => l.cells.q1 !== model.DOT).length, 2);
  assert.equal(t3[0].cells.q1, String(result.rows[0].q1));
  assert.equal(t3[2].cells.q1, model.DOT);
  assert.equal(t3[0].cells.R, model.DOT);
  const t4 = at(4, 0);
  assert.equal(t4.filter((l) => l.cells.q1 !== model.DOT).length, 39);
  assert.equal(t4.filter((l) => l.cells.R !== model.DOT).length, 0);
  const t4b = at(4, 39);
  const row0 = t4b.find((l) => l.j === 0);
  assert.equal(row0.cells.q1, "4194319");
  assert.equal(row0.cells.q2, "4194329");
  assert.equal(row0.cells.R, "19");
  assert.equal(row0.cells.r1, model.DOT);
  const t6 = at(6, 0);
  t6.forEach((l, k) => {
    const r = result.rows[k];
    assert.deepEqual(l.cells, { j: String(r.j), q1: String(r.q1), q2: String(r.q2), R: r.rho.toString(), r1: String(r.r1), r2: String(r.r2) });
  });
  // a step module may say how many rows it reveals
  const t5 = model.tableModel(view, { step: 5, sub: 1, result, revealed: () => 4 });
  assert.equal(t5.filter((l) => l.cells.r1 !== model.DOT).length, 4);
  // default focus: steps 2 to 5 follow sub, others none
  assert.equal(model.defaultFocusRow(view, 3, 1), result.rows[0].j);
  assert.equal(model.defaultFocusRow(view, 3, 0), null);
  assert.equal(model.defaultFocusRow(view, 1, 3), null);
  assert.equal(model.rowSubOf(view, 0), result.rows.findIndex((r) => r.j === 0) + 1);
  assert.equal(model.rowSubOf(view, 999), null);
});

test("table model of a tampered result shows its residues and marks the changed cells", () => {
  const { events, result } = replayOf("genus100_green");
  const view = buildLabView(events);
  const row = result.rows.find((r) => r.j === -19);
  const t = reglue(result, [{ j: -19, r1: (row.r1 + 1) % row.q1 }]);
  assert.equal(t.tampered, true);
  const lines = model.tableModel(view, { step: 7, sub: 0, result: t });
  const l = lines.find((x) => x.j === -19);
  assert.equal(l.cells.r1, String((row.r1 + 1) % row.q1));
  assert.equal(l.tampered.r1, true);
  assert.equal(l.tampered.r2, false);
  assert.equal(lines.filter((x) => x.tampered.r1 || x.tampered.r2 || x.tampered.R).length, 1);
});

test("error texts: inadmissible with its prime, row_cap with its row and count against the cap, a stopped worker", () => {
  const bad = runToEnd({ shape: [[0, 0], [1, 0], [0, 1], [1, 1]], seed: [0, 0], colour: 1 });
  const v = buildLabView(bad.events);
  const e = model.errorInfo(v.error);
  assert.equal(e.code, "inadmissible");
  assert.match(e.sentence, /modulo 2 /);
  assert.match(e.detail, /divisible by 2/);
  assert.equal(e.editorLink, true);
  const strip = [];
  for (let i = 0; i < 47; i++) strip.push([i, 0]);
  const cap = runToEnd({ shape: strip, seed: [0, 0], colour: 1 });
  const ce = buildLabView(cap.events).error;
  assert.equal(ce.code, "row_cap");
  const ci = model.errorInfo(ce);
  assert.equal(ci.title, "Row limit 45 cells");
  assert.equal(ci.sentence, `Row ${ce.j} has ${ce.k} cells.`);
  // the editor's note says both: "<title>. <sentence>", one full stop at the end
  assert.equal(`${ci.title}. ${ci.sentence}`, "Row limit 45 cells. Row 0 has 49 cells.");
  assert.equal(ci.detail, null);
  assert.equal(ci.editorLink, true);
  assert.equal(model.ROW_CAP, CAP_K);
  assert.equal(CAP_K, 47);
  assert.ok(ce.k > CAP_K);
  const st = model.errorInfo({ code: "stopped", j: 7 });
  assert.match(st.sentence, /row 7/);
  assert.equal(model.errorInfo({ code: "stopped", j: null }).sentence, "The construction stopped before it finished.");
  const tag = model.errorInfo({ code: "tag_mismatch", message: "tag_mismatch: damaged token" });
  assert.equal(tag.sentence, "This link is damaged or incomplete. Copy it again, or choose a shape.");
  assert.equal(tag.startLink, true);
  assert.equal(tag.technical, "damaged token");
  for (const code of ["bad_input", "no_d0", "sigma_zero", "replay_mismatch"]) assert.equal(model.errorInfo({ code, message: "m" }).code, code);
});

test("progress text of a running construction names the row, its place, the phase and the percent", () => {
  const { events } = runToEnd({ shape: shapeS(3), seed: seedS(3), colour: 1 });
  const cut = events.findIndex((e) => e.type === "rowTarget");
  const view = buildLabView(events.slice(0, cut + 1).concat([{ type: "rowProgress", step: 5, j: events[cut].j, phase: "scan", done: 30, total: 120 }]));
  const p = model.progressInfo(view);
  assert.equal(p.j, events[cut].j);
  assert.equal(p.percent, 25);
  assert.match(p.text, new RegExp(`row ${events[cut].j} \\(\\d+ cells of type \\+1 or -1\\), 1 of 16: scan of q2 25%`));
  const v2 = buildLabView(events.slice(0, cut + 1));
  assert.equal(model.rowInProgress(v2), events[cut].j);
  assert.match(model.progressInfo(v2).text, /solving/);
  assert.equal(model.progressInfo(buildLabView([])), null);
});

test("content files: required ones always, optional ones only when a module declares them", () => {
  assert.deepEqual(model.contentFilesToLoad([]), ["steps0_4.json"]);
  assert.deepEqual(model.contentFilesToLoad([{ contentFiles: ["steps5_7.json"] }]), ["steps0_4.json", "steps5_7.json"]);
  assert.deepEqual(model.contentFilesToLoad([{ contentFiles: ["extra_tools.json"] }, {}]), ["steps0_4.json", "extra_tools.json"]);
  assert.equal(model.contentUrl("steps0_4.json").pathname.endsWith("/content/lab/steps0_4.json"), true);
  for (const f of model.contentFilesToLoad([])) assert.ok(fs.existsSync(new URL(`../../content/lab/${f}`, import.meta.url)), f);
});

test("content texts: every id the steps use exists and every text is used, ASCII only, no semicolon, no em dash", () => {
  const text = readJson("../../content/lab/steps0_4.json");
  const used = new Set();
  for (const f of ["index.mjs", "step0.mjs", "step1.mjs", "step2.mjs", "step3.mjs", "step4.mjs"]) {
    const src = fs.readFileSync(new URL(`../../src/ui/pages/lab/${f}`, import.meta.url), "utf8");
    for (const m of src.matchAll(/kit\.text\("([a-z0-9_.]+)"\)/g)) used.add(m[1]);
  }
  // one text per step, what the step does (no second text behind a disclosure), and the lead of the start panel
  assert.deepEqual([...used].sort(), ["step0.what", "step1.what", "step2.what", "step3.what", "step4.what"]);
  assert.deepEqual(Object.keys(text).sort(), ["start.lead", ...used].sort());
  for (const id of used) assert.equal(typeof text[id], "string", id);
  for (const [id, html] of Object.entries(text)) {
    assert.ok(/^[\x20-\x7e]*$/.test(html), `${id} is ASCII`);
    assert.equal(html.includes(";"), false, `${id} has no semicolon`);
    assert.ok(html.startsWith("<p>") && html.endsWith("</p>"), id);
  }
});
