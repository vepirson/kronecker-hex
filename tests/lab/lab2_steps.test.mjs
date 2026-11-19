// The data shown by steps 5 to 7 of the Construction Lab (step5Data, step6Data, step7Data) on the live run of S_3
// green and on the replay of the genus-100 green token: the counts equal the view model, the product strip equals
// the wanted strip on every row, the last gluing item is the result's x0, every verify row is right. Also the tamper
// model (r1 + 1 on row -19 of the genus-100 green result fails, restoring passes), the hover line, the c10 preset,
// and the module contract of the new modules.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { runToEnd } from "../../src/construct/pipeline.mjs";
import { buildLabView } from "../../src/construct/lab_view.mjs";
import { cellFactors, reglue } from "../../src/construct/inspect.mjs";
import { openToken } from "../../src/formats/token.mjs";
import { shapeS, seedS } from "../../src/core/shapes.mjs";
import { kronecker } from "../../src/core/kronecker.mjs";
import { sha256Hex } from "../../src/core/sha256.mjs";
import { neighbourhood } from "../../src/core/geometry.mjs";
import * as model from "../../src/ui/pages/lab/model.mjs";
import * as step5 from "../../src/ui/pages/lab/step5.mjs";
import * as step6 from "../../src/ui/pages/lab/step6.mjs";
import * as step7 from "../../src/ui/pages/lab/step7.mjs";
import * as extras from "../../src/ui/pages/lab/extras.mjs";
import { STEP_TABLES } from "../../src/ui/pages/lab/steps.mjs";

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), "utf8"));
const tokens = readJson("../../data/tokens.json");
const c10 = readJson("../../data/shapes/c10.json");

const CASES = [
  ["S_3 green, live", () => runToEnd({ shape: shapeS(3), seed: seedS(3), colour: 1, lift: 1 })],
  ["genus-100 green, replay of the token", () => runToEnd({ replay: openToken(tokens.genus100_green).data })],
];

for (const [label, run] of CASES) {
  test(`steps 5 to 7 on ${label}: counts equal the view model, strips multiply to the wanted strip, x0 and the checks`, () => {
    const { events, result } = run();
    assert.equal(result.pass, true);
    const view = buildLabView(events);
    const R = result.rows;

    // step 5
    assert.equal(step5.subCount(view), R.length);
    const o5 = step5.step5Data(view, 0);
    assert.equal(o5.solved, R.length);
    assert.equal(o5.rowCount, R.length);
    assert.equal(o5.kMax, Math.max(...R.map((r) => r.k)));
    assert.equal(o5.focus, null);
    // no time and no mode in the data of the panel, the tries only where they are those of the result (a replay
    // tries nothing: until its tries are joined they are left out)
    assert.equal("totalMs" in o5, false);
    assert.equal("replay" in o5, false);
    const replay = view.start.mode === "replay";
    assert.equal(o5.retriedRows, replay ? null : view.rows.filter((r) => r.attempts.length > 1).length);
    R.forEach((r, k) => {
      const f = step5.step5Data(view, k + 1).focus;
      assert.equal("ms" in f || "tried2" in f, false);
      assert.deepEqual(f.attempts, replay ? null : view.rows[k].attempts.map((a) => ({ R: a.R, found: a.found })));
      // the target strip is the region types tau of the row's cells, the wanted strip under it is read "x known factors"
      assert.deepEqual(f.target, r.cells.map((c) => c.tau));
      assert.equal(f.j, r.j);
      assert.equal(f.k, r.k);
      assert.equal(f.r1, r.r1);
      assert.equal(f.r2, r.r2);
      assert.equal(f.R, r.rho);
      assert.deepEqual(f.offs, r.cells.map((c) => c.i));
      assert.equal(f.want.length, r.k);
      assert.deepEqual(f.product, f.want, `row ${r.j}`);
      assert.equal(f.match, true);
      assert.equal(f.mismatches, 0);
      // the strips are the Legendre symbols of the core, cell by cell
      f.offs.forEach((i, t) => {
        assert.equal(f.s1[t], kronecker(BigInt(r.r1 + i), BigInt(r.q1)));
        assert.equal(f.s2[t], kronecker(BigInt(r.r2 + i), BigInt(r.q2)));
      });
      // the wanted sign is tau times the small and the cofactor factor
      r.cells.forEach((c, t) => {
        const small = kronecker(result.Xs + BigInt(c.i), r.u);
        const cof = kronecker(r.rho + BigInt(c.i), r.c);
        assert.equal(f.want[t], c.tau * small * cof);
      });
      // the step 5 label: the average (q1 - k)(q2 - k) / 2^k over the sign vectors, and q1 q2 / 2^k >= 64 as the texts say
      const mean = ((r.q1 - r.k) * (r.q2 - r.k)) / 2 ** r.k;
      assert.equal(f.pairsFit, mean);
      const [key, lab, text] = step5.pairsEntry(f);
      assert.equal(key, "pairs");
      assert.equal(lab, "mean pairs per vector");
      assert.equal(text, mean.toFixed(1));
      assert.ok(Math.abs(Number(text) - mean) <= 0.05 + 1e-9);
      assert.ok((r.q1 * r.q2) / 2 ** r.k >= 64, `row ${r.j}: q1 q2 / 2^k >= 64`);
      assert.equal(step5.subOfRow(view, r.j), k + 1);
    });

    // step 6
    assert.equal(step6.subCount(view), 1 + 3 * R.length);
    const o6 = step6.step6Data(view, 0);
    assert.equal(o6.total, 1 + 3 * R.length);
    assert.equal(o6.rows, R.length);
    assert.equal(o6.shown, o6.total);
    assert.equal(o6.glued, null);
    assert.equal(o6.finalDigits, result.digits.x0);
    const kinds = [];
    for (let n = 1; n <= o6.total; n++) {
      const d = step6.step6Data(view, n);
      kinds.push(d.focus.kind);
      assert.equal(d.shown, n);
      assert.equal(d.real, n === o6.total);
    }
    assert.deepEqual(kinds, ["small", ...R.flatMap(() => ["q1", "q2", "c"])]);
    assert.deepEqual(step6.step6Data(view, 1).focus.j, null);
    assert.equal(step6.step6Data(view, 2).focus.j, R[0].j);
    const last = step6.step6Data(view, o6.total);
    assert.equal(last.glued.x0, result.x0);
    assert.equal(last.glued.d0, result.d0);
    assert.equal(last.glued.digitsX, result.digits.x0);
    assert.equal(last.glued.digitsD, result.digits.d0);
    assert.equal(last.glued.sha256x, sha256Hex(result.x0.toString()));
    assert.equal(last.focus.digitsSoFar, result.digits.x0);
    assert.equal(step6.focusRow(view, 3), R[0].j);
    assert.equal(step6.subOfRow(view, R[0].j), 2);
    const cof = step6.step6Data(view, 4).focus;
    assert.equal(cof.kind, "c");
    assert.equal(cof.modulusDigits, R[0].c.toString().length);

    // step 7
    const W = result.shape.concat(neighbourhood(result.shape));
    const rowsOfW = new Set(W.map(([, j]) => j)).size;
    assert.equal(step7.subCount(view), rowsOfW);
    const o7 = step7.step7Data(view, 0);
    assert.equal(o7.total, rowsOfW);
    assert.equal(o7.cells, W.length);
    assert.equal(o7.mismatches, 0);
    assert.equal(o7.rowsOk, rowsOfW);
    assert.equal(o7.pass, true);
    assert.equal(o7.region.area, result.area);
    assert.equal(o7.region.genus, result.genus);
    assert.equal(o7.region.holes, result.genus);
    assert.equal(o7.region.complete, true);
    assert.equal(o7.region.equalsShape, true);
    assert.equal(o7.region.colour, 1);
    for (let n = 1; n <= rowsOfW; n++) {
      const d = step7.step7Data(view, n);
      assert.equal(d.passedSoFar, n);
      assert.equal(d.verified, n);
      assert.equal(d.focus.ok, true);
      assert.deepEqual(d.focus.got, d.focus.want);
      assert.equal(d.region === null, n < rowsOfW);
    }
  });
}

test("genus-100 green: the numbers steps 5 to 7 show for it (row 0 r1, r2, x0 digits and sha256 prefix, area, genus)", () => {
  const { events, result } = runToEnd({ replay: openToken(tokens.genus100_green).data });
  const view = buildLabView(events);
  const f = step5.step5Data(view, model.rowSubOf(view, 0)).focus;
  assert.deepEqual([f.r1, f.r2], [3181080, 95162]);
  const g = step6.step6Data(view, step6.subCount(view)).glued;
  assert.equal(g.digitsX, 10437);
  assert.equal(g.sha256x.slice(0, 16), "82825ecbb037a60c");
  const o7 = step7.step7Data(view, 0);
  assert.equal(o7.region.area, 541);
  assert.equal(o7.region.genus, 100);
  assert.equal(result.pass, true);
});

test("tamper model: r1 + 1 on row -19 of the genus-100 green result fails, the steps show it, restore passes", () => {
  const { events, result } = runToEnd({ replay: openToken(tokens.genus100_green).data });
  const view = buildLabView(events);
  const row = result.rows.find((r) => r.j === -19);
  assert.equal(row.q1, 67);
  const t = reglue(result, [{ j: -19, r1: (row.r1 + 1) % row.q1 }]);
  assert.equal(t.tampered, true);
  assert.equal(t.pass, false);
  const f = step5.step5Data(view, model.rowSubOf(view, -19), t).focus;
  assert.equal(f.tampered, true);
  assert.equal(f.match, false);
  assert.ok(f.mismatches > 0);
  const o7 = step7.step7Data(view, 0, t);
  assert.equal(o7.tampered, true);
  assert.equal(o7.pass, false);
  assert.ok(o7.mismatches > 0);
  assert.deepEqual(model.mismatchCells(t.verify.rows).length, o7.mismatches);
  assert.equal(step6.shownNumbers(view, t).x0, t.x0);
  assert.equal(step6.shownNumbers(view, result).x0, result.x0);
  const back = reglue(t, [{ j: -19, r1: row.r1 }]);
  assert.equal(back.pass, true);
  assert.equal(back.x0, result.x0);
});

test("hover line: the four factors and their product, equal to the symbol on every window cell of S_3", () => {
  const { result } = runToEnd({ shape: shapeS(3), seed: seedS(3), colour: -1, lift: 1 });
  const W = result.shape.concat(neighbourhood(result.shape));
  let lines = 0;
  for (const [i, j] of W) {
    const f = cellFactors(result, i, j);
    const text = extras.factorLine(f);
    if (!f) {
      assert.equal(text, extras.NO_FACTORS);
      continue;
    }
    lines++;
    assert.equal(f.product, f.symbol);
    assert.match(text, /^(\+1|-1|0) = u \((\+1|-1|0)\) x q1 \((\+1|-1|0)\) x q2 \((\+1|-1|0)\) x c \((\+1|-1|0)\)$/);
    assert.ok(text.startsWith(`${f.product > 0 ? "+1" : f.product < 0 ? "-1" : "0"} = `));
  }
  assert.ok(lines > 0);
  assert.equal(extras.factorLine(null), extras.NO_FACTORS);
  assert.equal(extras.factorLine({ small: 1, q1: -1, q2: -1, cof: 1, product: 1 }), "+1 = u (+1) x q1 (-1) x q2 (-1) x c (+1)");
});

test("preset c10: live on the main thread in both colours, genus 10, area 59, its token reopens to the same numbers", () => {
  const p = model.resolvePreset("c10", "red", "replay");
  assert.deepEqual(p, { kind: "preset", name: "c10", colour: -1, lift: 1, shapeKind: "file", file: "c10.json", tokenLabel: null, mode: "live", runOn: "main" });
  assert.ok(model.LAB_PRESETS.some((x) => x.name === "c10" && x.title === "compact shape, genus 10"));
  assert.equal(c10.shape.length, 59);
  for (const colour of [1, -1]) {
    const { result } = runToEnd({ shape: c10.shape, seed: c10.seed, colour, lift: 1, id: null });
    assert.equal(result.pass, true);
    assert.equal(result.genus, 10);
    assert.equal(result.area, 59);
    const op = openToken(result.token);
    assert.equal(op.x0, result.x0);
    assert.equal(op.d0, result.d0);
  }
});

test("module contract of steps 5 to 7 and the extras: before their events they count 0, the texts exist", () => {
  const empty = buildLabView([]);
  for (const [k, m] of [[5, step5], [6, step6], [7, step7]]) {
    assert.equal(m.subCount(empty), 0);
    const { title } = STEP_TABLES.sign[k];
    assert.equal(typeof title, "string");
    assert.ok(title.length > 0 && title.length < 30);
    assert.equal(m.render.length, 4);
  }
  assert.equal(step5.step5Data(empty, 0), null);
  assert.equal(step6.step6Data(empty, 0), null);
  assert.equal(step7.step7Data(empty, 0), null);
  assert.equal(extras.mountExtras.length, 2);
  // the import of two tables left the page with its form on the start panel
  assert.equal(extras.startEntry, undefined);
  assert.deepEqual(model.contentFilesToLoad([step5, extras]), ["steps0_4.json", "steps5_7.json"]);
  const text = readJson("../../content/lab/steps5_7.json");
  const used = new Set();
  for (const f of ["step5.mjs", "step6.mjs", "step7.mjs", "extras.mjs"]) {
    const src = fs.readFileSync(new URL(`../../src/ui/pages/lab/${f}`, import.meta.url), "utf8");
    for (const m of src.matchAll(/kit\.text\("([a-z0-9_.]+)"\)/g)) used.add(m[1]);
  }
  // one text per step and the tamper note, every text of the file used
  assert.deepEqual([...used].sort(), ["step5.what", "step6.what", "step7.what", "tamper.note"]);
  assert.deepEqual(Object.keys(text).sort(), [...used].sort());
  for (const id of used) assert.equal(typeof text[id], "string", id);
  for (const [id, html] of Object.entries(text)) {
    assert.ok(/^[\x20-\x7e]*$/.test(html), `${id} is ASCII`);
    assert.equal(html.includes(";"), false, `${id} has no semicolon`);
    assert.ok(html.startsWith("<p>") && html.endsWith("</p>"), id);
  }
});
