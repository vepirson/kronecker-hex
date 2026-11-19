// Tests of the region worker's message handler (run in Node with a collecting post function) and of the ways a
// witness reaches the Explorer: tokens through openToken, witness and packed JSON objects.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { handleMessage, cellsOfFlat, FILL_CAP } from "../../src/workers/floodfill.worker.mjs";
import { witnessFromToken, witnessFromObject } from "../../src/ui/pages/explore.mjs";
import { floodFill } from "../../src/core/regions.mjs";
import { compareCells } from "../../src/core/geometry.mjs";
import { BASE64URL_ALPHABET } from "../../src/formats/token.mjs";

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), "ascii"));

function run(msg) {
  const out = [];
  handleMessage(msg, (m) => out.push(m));
  return out;
}

test("fill at (1080, 517): green, area 70, genus 4, cells sorted and equal to floodFill", () => {
  const out = run({ type: "fill", id: 7, x: "1080", d: "517" });
  const done = out[out.length - 1];
  assert.equal(done.type, "filled");
  assert.equal(done.id, 7);
  assert.equal(done.result.colour, 1);
  assert.equal(done.result.area, 70);
  assert.equal(done.result.genus, 4);
  assert.equal(done.result.complete, true);
  const cells = cellsOfFlat(done.flat);
  assert.deepEqual(cells, cells.slice().sort(compareCells));
  assert.deepEqual(cells, floodFill(1080n, 517n).cells);
});

test("fill of the natural genus-100 region at (-2500, 24990001): area 10687, genus 100", () => {
  const t0 = Date.now();
  const out = run({ type: "fill", id: 1, x: "-2500", d: "24990001" });
  const done = out[out.length - 1];
  assert.equal(done.result.area, 10687);
  assert.equal(done.result.genus, 100);
  assert.ok(out.slice(0, -1).every((m) => m.type === "progress" && m.cells <= done.result.area));
  console.log(`natural genus-100 region in Node: ${Date.now() - t0} ms, ${out.length - 1} progress messages, ${done.result.symbolsEvaluated} symbols`);
});

test("fill at a cell of an infinite region: certified at once on its line, or stops at the cap without the certificate search", () => {
  // (0, 3) lies on the half column x = 0, d >= 2 (all blue): the certified fill names that line at once
  const out = run({ type: "fill", id: 2, x: "0", d: "3", cap: 5000 });
  const done = out[out.length - 1];
  assert.equal(done.result.colour, 0);
  assert.equal(done.result.complete, false);
  assert.equal(done.result.genus, null);
  assert.ok(done.result.infinite, "a certificate");
  assert.equal(done.result.infinite.id, "col_x_0_up");
  // the plain fill (certify: false) still stops at the cap, without a genus
  const plain = run({ type: "fill", id: 5, x: "0", d: "3", cap: 5000, certify: false });
  const p = plain[plain.length - 1];
  assert.equal(p.result.complete, false);
  assert.equal(p.result.area, 5000);
  assert.equal(p.result.genus, null);
  assert.equal(FILL_CAP, 200000);
});

test("bad messages become error messages", () => {
  assert.deepEqual(run({ type: "fill", id: 3, x: "1.5", d: "2" })[0].code, "bad_integer");
  assert.deepEqual(run({ type: "fill", id: 3, x: "1", d: "2", cap: 0 })[0].code, "bad_cap");
  assert.deepEqual(run({ type: "nope", id: 4 })[0].type, "error");
});

test("verify message: a shipped blue witness passes, a changed genus fails", () => {
  const w = readJson("../../data/witnesses/blue_g001.json");
  const ok = run({ type: "verify", id: 5, witness: w })[0];
  assert.equal(ok.type, "verified");
  assert.equal(ok.result.pass, true, ok.result.reasons.join("; "));
  const bad = run({ type: "verify", id: 6, witness: { ...w, genus: w.genus + 1 } })[0];
  assert.equal(bad.result.pass, false);
});

const LABEL_TO_FIXTURE = {
  genus100_green: "green_compact_g100_small",
  genus100_red: "red_compact_g100_small",
  genus0_hexagon_green: "green_genus0_hex18_small",
  genus0_hexagon_red: "red_genus0_hex18_small",
  hexagon_genus117_green: "green_maxarea_hex18_small",
  hexagon_genus117_red: "red_maxarea_hex18_small",
};

test("the 6 shipped tokens open to the area, genus and colour of expected.json", () => {
  const tokens = readJson("../../data/tokens.json");
  const expected = readJson("../fixtures/expected.json");
  assert.deepEqual(Object.keys(tokens).sort(), Object.keys(LABEL_TO_FIXTURE).sort());
  for (const [label, fx] of Object.entries(LABEL_TO_FIXTURE)) {
    const r = witnessFromToken(` ${tokens[label]} `);
    const e = expected[fx];
    assert.equal(r.witness.area, e.area, label);
    assert.equal(r.witness.genus, e.genus, label);
    assert.equal(r.witness.colour, e.colour, label);
    assert.equal(r.witness.digits.x0, e.digits.x0, label);
    assert.equal(r.token, tokens[label]);
  }
});

test("a token changed in one character is rejected with a code", () => {
  const t = readJson("../../data/tokens.json").genus100_green;
  for (const k of [0, 5, 100, t.length - 1]) {
    const c = t[k];
    const next = BASE64URL_ALPHABET[(BASE64URL_ALPHABET.indexOf(c) + 1) % 64];
    const bad = t.slice(0, k) + next + t.slice(k + 1);
    assert.throws(() => witnessFromToken(bad), (e) => typeof e.code === "string" && e.code.length > 0, `position ${k}`);
  }
});

test("witness and packed JSON objects both open, the packed one also gives its token", () => {
  const w = readJson("../../data/witnesses/blue_hex18_scan.json");
  const a = witnessFromObject(w);
  assert.equal(a.source, "witness");
  assert.equal(a.token, null);
  assert.equal(a.witness.digits.x0, 1891);
  const packed = readJson("../fixtures/packed/green_compact_g100_small.packed.json");
  const b = witnessFromObject(packed);
  assert.equal(b.source, "packed");
  assert.equal(b.witness.area, 541);
  assert.equal(b.witness.genus, 100);
  assert.equal(b.token, readJson("../fixtures/tokens.json").green_compact_g100_small);
  assert.throws(() => witnessFromObject({ format: "other" }), (e) => e.code === "bad_format");
  assert.throws(() => witnessFromObject([1, 2]), (e) => e.code === "bad_format");
  assert.throws(() => witnessFromObject({ ...packed, d0_index: 1 }), (e) => typeof e.code === "string");
});
