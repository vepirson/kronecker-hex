// The heavy construction tests: the three compact shapes (genus 100, the genus 0 hexagon, the genus 117 hexagon),
// green and red, built LIVE one after the other (so that only one large sign table exists at a time), compared bit
// for bit with the packed fixtures, the expected hashes and the stored tokens. The six results are reused for the
// replay equivalence, the factor check of every window cell and the tamper test.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { construct, runToEnd, canonicalEvents } from "../../src/construct/pipeline.mjs";
import { cellFactors, reglue } from "../../src/construct/inspect.mjs";
import { signBits } from "../../src/construct/row_solver.mjs";
import { neighbourhood } from "../../src/core/geometry.mjs";

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), "ascii"));
const expected = readJson("../fixtures/expected.json");
const tokens = readJson("../fixtures/tokens.json");

const SHAPES = [
  ["../../data/shapes/c100.json", "compact_g100_small"],
  ["../../data/shapes/genus0_hexagon.json", "genus0_hex18_small"],
  ["../../data/shapes/hexagon_genus117.json", "maxarea_hex18_small"],
];
const runs = new Map(); // id -> { events, result, ms }

test("live construction of the three compact shapes, green and red, lift 1, equals the fixtures bit for bit", (t) => {
  for (const [file, stem] of SHAPES) {
    const sh = readJson(file);
    for (const [name, colour] of [["green", 1], ["red", -1]]) {
      const id = `${name}_${stem}`;
      const t0 = performance.now();
      const gen = construct({ shape: sh.shape, seed: sh.seed, colour, lift: 1 });
      const events = [];
      let r;
      for (;;) {
        r = gen.next();
        if (r.done) break;
        events.push(r.value);
        const ev = r.value;
        if (ev.type === "rowSolved") t.diagnostic(`${id} row ${ev.j}: q1 ${ev.q1}, r1 ${ev.r1}, r2 ${ev.r2}, R ${ev.R}, ${ev.ms.toFixed(0)} ms`);
      }
      const ms = performance.now() - t0;
      const result = r.value;
      assert.ok(result, `${id}: ${JSON.stringify(events[events.length - 1], (k, v) => (typeof v === "bigint" ? String(v) : v))}`);
      assert.equal(result.pass, true, id);
      assert.equal(result.sha256.x0, expected[id].sha256.x0, id);
      assert.equal(result.sha256.d0, expected[id].sha256.d0, id);
      assert.deepEqual(result.digits, expected[id].digits, id);
      const fixture = readJson(`../fixtures/packed/${id}.packed.json`);
      const { id: i1, format_note: n1, ...got } = result.packed;
      const { id: i2, format_note: n2, ...want } = fixture;
      assert.deepEqual(got, want, id);
      assert.equal(n1, n2, id);
      assert.equal(result.token, tokens[id], `${id}: token`);
      t.diagnostic(`${id}: live ${(ms / 1000).toFixed(2)} s, ${events.length} events, peak sign-table bytes ${result.peakBytes}`);
      runs.set(id, { events, result, ms });
    }
  }
  assert.equal(runs.size, 6);
  // the large rows report their progress (phases of the row solver, positions within their totals)
  const prog = [...runs.values()].flatMap((r) => r.events.filter((e) => e.type === "rowProgress"));
  t.diagnostic(`rowProgress events over the six runs: ${prog.length}`);
  assert.ok(prog.length >= 1);
  for (const p of prog) {
    assert.ok(["table1", "sort", "scan"].includes(p.phase));
    assert.ok(p.done >= 0 && p.done <= p.total);
  }
});

test("compact shapes: canonical events of each live run equal those of the replay of its data", () => {
  assert.equal(runs.size, 6);
  for (const [id, { events, result }] of runs) {
    const rep = runToEnd({ replay: result.data });
    assert.ok(rep.result, id);
    assert.equal(rep.result.pass, true, id);
    assert.equal(rep.result.x0, result.x0, id);
    assert.equal(rep.events.some((e) => e.type === "rowProgress"), false, id);
    assert.deepEqual(canonicalEvents(events), canonicalEvents(rep.events), id);
  }
});

test("the four factors multiply to the symbol on every window cell of the genus 100 shape", () => {
  for (const id of ["green_compact_g100_small", "red_compact_g100_small"]) {
    const { result } = runs.get(id);
    const W = result.shape.concat(neighbourhood(result.shape));
    const withRow = new Set(result.rows.map((r) => r.j));
    let n = 0;
    for (const [i, j] of W) {
      const f = cellFactors(result, i, j);
      if (!withRow.has(j)) {
        assert.equal(f, null);
        continue;
      }
      assert.equal(f.product, f.symbol, `${id} (${i}, ${j})`);
      n++;
    }
    assert.equal(n, W.length);
    assert.equal(cellFactors(result, 1000, 0), null);
  }
});

test("re-gluing the genus 100 green result with r1 + 1 on row -19 fails the verification", () => {
  const { result } = runs.get("green_compact_g100_small");
  const row = result.rows.find((r) => r.j === -19);
  assert.equal(row.q1, 67);
  const bad = reglue(result, [{ j: -19, r1: (row.r1 + 1) % row.q1 }]);
  assert.equal(bad.tampered, true);
  assert.equal(bad.pass, false);
  assert.equal(bad.verify.rows.find((r) => r.j === -19).ok, false);
  assert.notEqual(bad.x0, result.x0);
  assert.equal(bad.d0, result.d0);
  // a change of r1 that keeps the sign vector of the row keeps the region
  const offs = row.cells.map((c) => c.i);
  const tab = signBits(row.q1, offs);
  let same = -1;
  for (let r = 0; r < row.q1; r++) {
    if (r !== row.r1 && !tab.bad[r] && tab.lo[r] === tab.lo[row.r1] && tab.hi[r] === tab.hi[row.r1]) { same = r; break; }
  }
  if (same >= 0) {
    const good = reglue(result, [{ j: -19, r1: same }]);
    assert.equal(good.tampered, true);
    assert.equal(good.pass, true);
  }
  // untouched re-glue gives the same numbers
  const id = reglue(result, []);
  assert.equal(id.x0, result.x0);
  assert.equal(id.pass, true);
});
