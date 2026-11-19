// Tests of the checks on data that enters the site from outside: the shape check run before anything is shown
// (checkShapeCells), the genus field of a token, the early end of a witness verification whose stated area is not
// the size of its shape, a packed file with one changed residue, and the chip text of a failed witness.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { CodedError } from "../../src/core/bigint_utils.mjs";
import { normaliseShape, shapeS, seedS } from "../../src/core/shapes.mjs";
import { checkShapeCells, verifyWitness, SHAPE_COORD_LIMIT } from "../../src/formats/witness.mjs";
import { parsePacked } from "../../src/formats/packed.mjs";
import { openToken, encodeToken } from "../../src/formats/token.mjs";
import { runToEnd } from "../../src/construct/pipeline.mjs";
import { witnessFromObject, witnessFromToken, failChipText } from "../../src/ui/pages/explore.mjs";

const url = (rel) => new URL(rel, import.meta.url);
const readJson = (rel) => JSON.parse(fs.readFileSync(url(rel), "utf8"));
const listJson = (rel) => fs.readdirSync(url(rel)).filter((f) => f.endsWith(".json")).sort();
const codeOf = (fn) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CodedError, `not a coded error: ${e}`);
    return e.code;
  }
  return null;
};

const BASE = readJson("../../data/witnesses/blue_g003.json");
const withShape = (shape) => ({ ...BASE, shape });
// malformed shapes (wrong types, out-of-range coordinates, an empty shape, a duplicate cell), with the code each must give
const BAD = [
  ["cell [0.5, 0]", BASE.shape.concat([[0.5, 0]]), "bad_format"],
  ["cell ['a', 0]", BASE.shape.concat([["a", 0]]), "bad_format"],
  ["cell [null, 0]", BASE.shape.concat([[null, 0]]), "bad_format"],
  ["cell [1e300, 0]", BASE.shape.concat([[1e300, 0]]), "out_of_range"],
  ["cell [2^53 + 1, 0]", BASE.shape.concat([[9007199254740993, 0]]), "out_of_range"],
  ["cell [5]", BASE.shape.concat([[5]]), "bad_format"],
  ["cell 7", BASE.shape.concat([7]), "bad_format"],
  ["cell [3000000, 0]", BASE.shape.concat([[3000000, 0]]), "out_of_range"],
  ["cell [2^20, 0]", BASE.shape.concat([[SHAPE_COORD_LIMIT, 0]]), "out_of_range"],
  ["empty shape", [], "bad_format"],
  ["shape not a list", "abc", "bad_format"],
  ["duplicate cell", BASE.shape.concat([BASE.shape[0]]), "duplicate_cell"],
];

test("checkShapeCells rejects every malformed shape of the list with its code, in milliseconds", () => {
  for (const [label, shape, code] of BAD) {
    const t0 = performance.now();
    assert.equal(codeOf(() => checkShapeCells(shape)), code, label);
    assert.ok(performance.now() - t0 < 50, label);
    // the same witness through the Explorer's reader
    assert.equal(codeOf(() => witnessFromObject(withShape(shape))), code, `${label} (witnessFromObject)`);
    // the same rule as normaliseShape (the check of the construction)
    if (Array.isArray(shape) && shape.length > 0) assert.equal(codeOf(() => normaliseShape({ shape, seed: BASE.seed })), code, `${label} (normaliseShape)`);
  }
  // the largest accepted coordinate
  assert.equal(codeOf(() => checkShapeCells([[SHAPE_COORD_LIMIT - 1, -(SHAPE_COORD_LIMIT - 1)]])), null);
});

test("every shipped shape, witness, packed fixture and token passes checkShapeCells", () => {
  let n = 0;
  for (const f of listJson("../../data/shapes/")) {
    checkShapeCells(readJson(`../../data/shapes/${f}`).shape);
    n++;
  }
  for (const f of listJson("../../data/witnesses/")) {
    const w = readJson(`../../data/witnesses/${f}`);
    checkShapeCells(w.shape);
    assert.equal(witnessFromObject(w).source, "witness", f);
    n++;
  }
  for (const f of listJson("../fixtures/witnesses/").filter((x) => !x.startsWith("tampered_"))) {
    checkShapeCells(readJson(`../fixtures/witnesses/${f}`).shape);
    n++;
  }
  for (const dir of ["../fixtures/packed/", "../fixtures/packed_thin/"]) {
    for (const f of listJson(dir)) {
      const obj = readJson(`${dir}${f}`);
      checkShapeCells(parsePacked(obj).data.shape);
      assert.equal(witnessFromObject(obj).source, "packed", f);
      n++;
    }
  }
  for (const rel of ["../../data/tokens.json", "../fixtures/tokens.json"]) {
    for (const [label, t] of Object.entries(readJson(rel))) {
      checkShapeCells(witnessFromToken(t).witness.shape);
      assert.ok(label);
      n++;
    }
  }
  assert.ok(n >= 60, `${n} inputs checked`);
});

test("a token re-encoded with a wrong genus field is rejected with bad_format, the stored and built tokens open", () => {
  const tokens = readJson("../../data/tokens.json");
  for (const label of ["genus100_green", "hexagon_genus117_red"]) {
    const o = openToken(tokens[label]);
    for (const delta of [1, 7, -1]) {
      if (o.data.genus + delta < 0) continue;
      const t2 = encodeToken({ ...o.data, genus: o.data.genus + delta }, o.x0);
      assert.notEqual(t2, tokens[label]);
      assert.equal(codeOf(() => openToken(t2)), "bad_format", `${label} genus ${o.data.genus + delta}`);
      assert.equal(codeOf(() => witnessFromToken(t2)), "bad_format", label);
    }
  }
  // every stored token
  for (const rel of ["../../data/tokens.json", "../fixtures/tokens.json"]) {
    for (const [label, t] of Object.entries(readJson(rel))) assert.equal(codeOf(() => openToken(t)), null, label);
  }
  // the tokens built for S_1 .. S_10 (green and red) and for C_10
  for (let g = 1; g <= 10; g++) {
    for (const colour of [1, -1]) {
      const { result } = runToEnd({ shape: shapeS(g), seed: seedS(g), colour });
      const o = openToken(result.token);
      assert.equal(o.data.genus, g);
      assert.equal(o.x0, result.x0);
    }
  }
  const c10 = readJson("../../data/shapes/c10.json");
  const { result } = runToEnd({ shape: c10.shape, seed: c10.seed, colour: 1 });
  assert.equal(openToken(result.token).data.genus, 10);
});

test("a witness whose stated area is not the size of its shape fails without a flood fill", () => {
  const huge = { format: "kron_hex_witness_v1", id: "huge", colour: 1, genus: 0, area: 300000, x0: "1", d0: "5", seed: [0, 0], shape: [[0, 0]] };
  const t0 = performance.now();
  const v = verifyWitness(huge);
  const ms = performance.now() - t0;
  assert.equal(v.pass, false);
  assert.ok(v.reasons.some((r) => r.includes("stated area 300000 differs")), v.reasons.join("; "));
  assert.equal(v.info.flood, undefined); // no flood fill ran: no symbol was evaluated
  assert.ok(ms < 100, `${ms} ms`);
  // with a consistent area the one cell of the infinite column x = 1 stops at 10 times the size of the shape
  const one = verifyWitness({ ...huge, area: 1 });
  assert.equal(one.pass, false);
  assert.equal(one.info.flood.cap, 10);
  assert.ok(one.info.flood.symbols <= 200, `${one.info.flood.symbols} symbols`);
  // a genuine witness still passes, its cap is 10 times its size
  const w = readJson("../../data/witnesses/green_g100.json");
  const ok = verifyWitness(w);
  assert.equal(ok.pass, true, ok.reasons.join("; "));
  assert.equal(ok.info.flood.cap, 10 * w.shape.length);
});

test("a packed file with rows[0] rho + 1 (or another changed residue) ends in an error in milliseconds", () => {
  const pk = readJson("../fixtures/packed/green_compact_g100_small.packed.json");
  const bump = (v) => (typeof v === "number" ? v + 1 : String(BigInt(v) + 1n));
  const rho = structuredClone(pk);
  rho.rows[0][5] = bump(rho.rows[0][5]);
  const r1 = structuredClone(pk);
  r1.rows[1][3] = r1.rows[1][3] + 1;
  for (const [label, obj] of [["rows[0] rho + 1", rho], ["rows[1] r1 + 1", r1]]) {
    const t0 = performance.now();
    assert.equal(codeOf(() => witnessFromObject(obj)), "hash_mismatch", label);
    assert.ok(performance.now() - t0 < 1000, label);
  }
  // without the stored hashes the changed file opens and its verification fails, also in well under a second
  const bare = structuredClone(rho);
  delete bare.sha256;
  delete bare.digits;
  const t0 = performance.now();
  const r = witnessFromObject(bare);
  const v = verifyWitness(r.witness);
  assert.equal(v.pass, false);
  assert.ok(performance.now() - t0 < 2000);
});

test("the chip of a failed witness carries a short reason and no number", () => {
  const files = listJson("../fixtures/witnesses/").filter((f) => f.startsWith("tampered_"));
  const seen = new Set();
  for (const f of files) {
    const v = verifyWitness(readJson(`../fixtures/witnesses/${f}`));
    assert.equal(v.pass, false, f);
    const t = failChipText(v);
    assert.match(t, /^[a-z ]+$/, `${f}: ${t}`);
    assert.ok(t.length <= 32, f);
    seen.add(t);
  }
  assert.ok(seen.size >= 4, [...seen].join(", "));
  assert.equal(failChipText({ pass: false, reasons: ["the verification worker could not start"] }), "not verified");
  assert.equal(failChipText(null), "malformed region");
});
