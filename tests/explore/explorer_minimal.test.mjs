// The Explorer's helpers that need no browser: the short form of a long number (the one of the whole site, also the
// resting form of the inputs), the region chip text for every state, the state of a finished fill (an infinite region
// when the record carries a reason), the witness name of #/explore?w=<name>, the editor's short text beside its
// verdict (the Explorer's form for a shape that can be built) and the residue table, and the preset C_10 of the Lab's
// table.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { openToken } from "../../src/formats/token.mjs";
import { chipText, failChipText, witnessNameOf, witnessPathOf } from "../../src/ui/pages/explore.mjs";
import { regionChipState } from "../../src/ui/pages/explore/state.mjs";
import { shortNumber, SHORT_FULL_DIGITS, SHORT_END_DIGITS } from "../../src/ui/widgets/bignum.mjs";
import { editorReadoutText } from "../../src/ui/pages/edit.mjs";
import { NOTE_MS } from "../../src/ui/widgets/toast.mjs";
import { residueRows } from "../../src/ui/editor/editor.mjs";
import { chipLine, quickFix } from "../../src/ui/editor/verdict.mjs";
import { analyseShape } from "../../src/ui/editor/editor_state.mjs";
import { LAB_PRESETS } from "../../src/ui/pages/lab/model.mjs";
import { FILL_CAP } from "../../src/workers/floodfill.worker.mjs";

const tokens = JSON.parse(fs.readFileSync(new URL("../../data/tokens.json", import.meta.url), "utf8"));

test("the short form of a long number: up to 24 digits in full, else first and last 4 digits and the digit count", () => {
  assert.equal(SHORT_FULL_DIGITS, 24);
  assert.equal(SHORT_END_DIGITS, 4);
  assert.equal(shortNumber("1080"), "1080");
  assert.equal(shortNumber(1076n), "1076");
  assert.equal(shortNumber(-7), "-7");
  assert.equal(shortNumber("123456789012345678901234"), "123456789012345678901234", "24 digits in full");
  assert.equal(shortNumber("1234567890123456789012345"), "1234...2345 (25 digits)");
  assert.equal(shortNumber(-(10n ** 30n) - 7n), "-1000...0007 (31 digits)");
  assert.equal(shortNumber("-" + "7".repeat(2001)), "-7777...7777 (2001 digits)");
  assert.ok(shortNumber("9".repeat(118700)).length <= 28, "at most 28 characters (fits the 212 px field)");
  assert.equal(shortNumber("1080, 517"), "1080, 517", "a text that is not one integer stays as typed");
  assert.equal(shortNumber(""), "");
  assert.equal(editorReadoutText(3, -2), "i 3  j -2");
});

test("the short form of a 10437-digit coordinate", () => {
  const { x0, d0 } = openToken(tokens.genus100_green);
  const xs = x0.toString();
  const ds = d0.toString();
  assert.equal(xs.length, 10437);
  assert.equal(shortNumber(x0), `${xs.slice(0, 4)}...${xs.slice(-4)} (10437 digits)`);
  assert.equal(shortNumber(xs), shortNumber(x0), "the decimal string gives the same form");
  assert.equal(shortNumber(d0), ds.length <= 24 ? ds : `${ds.slice(0, 4)}...${ds.slice(-4)} (${ds.length} digits)`);
});

test("the chip of a witness that failed its check names the region type, never a colour", () => {
  assert.equal(failChipText({ reasons: ["seed cell has colour -1, expected 1"] }), "wrong region type");
  assert.equal(failChipText({ reasons: ["recomputed region differs"] }), "other region");
});

test("chip text of every state of the region chip", () => {
  assert.equal(chipText({ state: "running", cells: 12345 }), "12345 cells ...");
  assert.equal(chipText({ state: "running" }), "0 cells ...");
  assert.equal(chipText({ state: "done", area: 70, genus: 4 }), "70 cells | genus 4");
  assert.equal(chipText({ state: "capped", area: FILL_CAP }), "more than 200000 cells");
  assert.equal(chipText({ state: "stopped", cells: 812 }), "at least 812 cells");
  assert.equal(chipText({ state: "infinite" }), "infinite");
  assert.equal(chipText({ state: "witness", area: 541, genus: 100 }), "541 cells | genus 100");
  assert.equal(chipText({ state: "error" }), "fill failed");
  assert.equal(chipText({ state: "idle" }), "");
  // one cell is "1 cell"
  assert.equal(chipText({ state: "witness", area: 1, genus: 0 }), "1 cell | genus 0");
  assert.equal(chipText({ state: "running", cells: 1 }), "1 cell ...");
  assert.equal(chipText({ state: "stopped", cells: 1 }), "at least 1 cell");
  for (const s of ["running", "done", "capped", "stopped", "infinite", "witness"]) {
    assert.ok(chipText({ state: s, cells: 200000, area: 200000, genus: 100 }).length <= 32, s);
  }
});

test("state of a finished fill: done, capped, or infinite when the record carries a reason", () => {
  assert.equal(regionChipState({ complete: true, area: 70, genus: 4 }), "done");
  assert.equal(regionChipState({ complete: false, area: 200000 }), "capped");
  assert.equal(regionChipState({ complete: false, area: 5000, infinite: { id: "row_d_1", text: "contains the row d = 1" } }), "infinite");
  assert.equal(regionChipState({ complete: true, area: 70, infinite: null }), "done", "a null field changes nothing");
  assert.equal(regionChipState({ complete: false, area: 9, infinite: undefined }), "capped");
});

test("the w parameter: shipped witness names only", () => {
  assert.equal(witnessNameOf("blue_g003"), "blue_g003");
  assert.equal(witnessPathOf("blue_g003"), "data/witnesses/blue_g003.json");
  assert.ok(fs.existsSync(new URL(`../../${witnessPathOf("blue_g003")}`, import.meta.url)));
  for (const bad of ["", "Blue_g003", "../tokens", "blue-g003", "a/b", "x.json", "a b", "%2e%2e", "a".repeat(65), null, undefined, 3]) {
    assert.equal(witnessNameOf(bad), null, String(bad));
    assert.equal(witnessPathOf(bad), null, String(bad));
  }
  assert.equal(NOTE_MS, 6000);
});

test("the editor's short text beside the verdict, in the Explorer's form for a shape that can be built, and the residue table", () => {
  const line = (a, colour = 1) => chipLine(a, quickFix(a, colour), colour);
  assert.equal(line(analyseShape([])), "", "nothing for the empty drawing");
  const block = analyseShape([[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.equal(line(block), "Not admissible");
  assert.deepEqual(residueRows(block.residue), [[2, "all 4 hit"]]);
  const c100 = JSON.parse(fs.readFileSync(new URL("../../data/shapes/c100.json", import.meta.url), "ascii"));
  const a = analyseShape(c100.shape);
  assert.equal(line(a), "541 cells | genus 100");
  assert.equal(line(a), chipText({ state: "witness", area: 541, genus: 100 }), "the Explorer's chip says the same");
  assert.equal(residueRows(a.residue).length, 9);
  assert.ok(residueRows(a.residue).every(([, t]) => /^\(\d+, \d+\)$/.test(t)));
  const apart = analyseShape([[0, 0], [5, 5]]);
  assert.equal(line(apart), "Not connected");
});

test("preset C_10 of the Lab: listed next to C_100, its file has 59 cells of genus 10, admissible", () => {
  const names = LAB_PRESETS.map((p) => p.name);
  assert.equal(names.indexOf("c100"), names.indexOf("c10") + 1);
  const p = LAB_PRESETS.find((q) => q.name === "c10");
  assert.equal(p.short, "compact shape, genus 10");
  assert.equal(p.shortTex, "compact shape, genus 10");
  assert.equal(p.file, "c10.json");
  const file = JSON.parse(fs.readFileSync(new URL("../../data/shapes/c10.json", import.meta.url), "ascii"));
  const a = analyseShape(file.shape);
  assert.equal(a.area, 59);
  assert.equal(a.genus, 10);
  assert.equal(a.holes, 10);
  assert.equal(a.connected, true);
  assert.equal(a.residue.admissible, true);
  assert.ok(file.shape.some(([i, j]) => i === file.seed[0] && j === file.seed[1]), "the seed is a cell of the shape");
  assert.equal(file.area, 59);
  assert.equal(file.genus, 10);
});
