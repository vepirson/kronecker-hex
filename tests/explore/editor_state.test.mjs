// Tests of the shape editor state: the draw rule (clicks and drags), undo and redo by strokes, the history kept in the
// store, the seed rule, Clear as one stroke, the live analysis on the shipped shapes and on a 2 x 2 block, and the Lab
// input object.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  createEditorState, analyseShape, canSendToLab, labInputOf, cellsText, repairSeed, firstCell,
} from "../../src/ui/editor/editor_state.mjs";
import { LAB_PRESETS, presetShape } from "../../src/ui/pages/lab/model.mjs";
import { residueRows, historyKey } from "../../src/ui/editor/editor.mjs";
import { chipLine, quickFix } from "../../src/ui/editor/verdict.mjs";
import { shapeS } from "../../src/core/shapes.mjs";

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), "ascii"));

// drag(s, cells) is one stroke over the cells in this order, as a pointer drag gives them
const drag = (s, cells) => {
  s.begin();
  for (const [i, j] of cells) s.draw(i, j);
  s.end();
};

test("draw by click: an empty cell is added, a cell of the shape is removed, cells come back sorted by (j, i)", () => {
  const s = createEditorState();
  assert.equal(s.size, 0);
  assert.equal(s.seed, null);
  assert.equal(s.draw(2, 1), true, "a click on an empty cell adds it");
  s.draw(0, 1);
  s.draw(5, -3);
  assert.deepEqual(s.cells(), [[5, -3], [0, 1], [2, 1]]);
  assert.equal(s.draw(0, 1), true, "a click on a cell of the shape removes it");
  assert.deepEqual(s.cells(), [[5, -3], [2, 1]]);
  assert.equal(s.draw(0, 1), true, "a second click adds it again");
  assert.equal(s.has(0, 1), true);
  // every click is its own undo step
  assert.equal(s.history().undo.length, 5);
  assert.throws(() => s.draw(1.5, 0), (e) => e.code === "bad_format");
  assert.throws(() => s.draw(2 ** 21, 0), (e) => e.code === "out_of_range");
});

test("draw by drag: the first cell decides, every later cell of the stroke gets the same change", () => {
  const s = createEditorState({ cells: [[2, 0], [3, 0]], seed: [2, 0] });
  // from an empty cell the drag adds, also over cells of the shape (they stay)
  drag(s, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
  assert.deepEqual(s.cells(), [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
  // from a cell of the shape the drag removes, also over empty cells (they stay empty)
  drag(s, [[4, 0], [3, 0], [3, 1], [2, 0]]);
  assert.deepEqual(s.cells(), [[0, 0], [1, 0]]);
  assert.equal(s.has(3, 1), false);
  // a drag crossing a cell twice changes it once
  drag(s, [[5, 5], [6, 5], [5, 5]]);
  assert.deepEqual(s.cells(), [[0, 0], [1, 0], [5, 5], [6, 5]]);
  // one undo per stroke, in reverse order
  assert.equal(s.undo(), true);
  assert.deepEqual(s.cells(), [[0, 0], [1, 0]]);
  assert.equal(s.undo(), true);
  assert.deepEqual(s.cells(), [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
  assert.equal(s.undo(), true);
  assert.deepEqual(s.cells(), [[2, 0], [3, 0]]);
  assert.deepEqual(s.seed, [2, 0], "undo to the loaded shape gives its seed back");
  assert.equal(s.undo(), false);
  assert.equal(s.canUndo(), false);
  // an empty stroke is not recorded
  s.begin();
  s.end();
  assert.equal(s.canUndo(), false);
});

test("undo and redo: redo applies undone strokes again, a new edit clears the redo list", () => {
  const s = createEditorState();
  s.draw(0, 0);
  drag(s, [[1, 0], [2, 0]]);
  s.draw(0, 0);
  assert.deepEqual(s.cells(), [[1, 0], [2, 0]]);
  assert.equal(s.canRedo(), false);
  s.undo();
  s.undo();
  assert.deepEqual(s.cells(), [[0, 0]]);
  assert.equal(s.canRedo(), true);
  assert.equal(s.redo(), true);
  assert.deepEqual(s.cells(), [[0, 0], [1, 0], [2, 0]]);
  assert.equal(s.redo(), true);
  assert.deepEqual(s.cells(), [[1, 0], [2, 0]]);
  assert.equal(s.redo(), false, "nothing left to redo");
  s.undo();
  s.undo();
  assert.equal(s.history().redo.length, 2);
  s.draw(7, 7);
  assert.equal(s.canRedo(), false, "a new edit clears the redo list");
  assert.deepEqual(s.cells(), [[0, 0], [7, 7]]);
  // abort takes back an open stroke and records nothing (the first finger of a two-finger pinch)
  const before = s.history().undo.length;
  s.begin();
  s.draw(9, 9);
  s.draw(10, 9);
  s.abort();
  assert.deepEqual(s.cells(), [[0, 0], [7, 7]]);
  assert.equal(s.history().undo.length, before);
});

test("the history survives the store: load with the lists of history() undoes and redoes the same strokes", () => {
  const s = createEditorState({ cells: shapeS(1), seed: [1, 0], colour: -1 });
  drag(s, [[0, 0], [5, 5]]);
  s.draw(1, 0);
  s.undo();
  const kept = { ...s.snapshot(), ...s.history() };
  // the store holds plain data only
  assert.deepEqual(JSON.parse(JSON.stringify(kept)), kept);
  const t = createEditorState();
  t.load(kept);
  assert.deepEqual(t.cells(), s.cells());
  assert.equal(t.colour, -1);
  assert.equal(t.redo(), true);
  assert.equal(t.has(1, 0), false);
  t.undo();
  t.undo();
  assert.deepEqual(t.cells(), shapeS(1));
  assert.deepEqual(t.seed, [1, 0]);
  // malformed lists are dropped, the shape still loads
  t.load({ cells: [[0, 0]], seed: null, undo: [{ added: ["x"], removed: [] }] });
  assert.equal(t.canUndo(), false);
  assert.deepEqual(t.cells(), [[0, 0]]);
});

test("replace: the shape, its seed and its colour as one stroke, one undo takes all three back, redo applies them again", () => {
  const s = createEditorState({ cells: shapeS(1), seed: [1, 0], colour: -1 });
  s.draw(9, 9);
  const drawn = s.snapshot();
  assert.equal(s.replace({ cells: [[3, 3], [2, 3], [4, 3]], seed: [3, 3], colour: 0 }), true);
  assert.deepEqual(s.snapshot(), { cells: [[2, 3], [3, 3], [4, 3]], seed: [3, 3], colour: 0 });
  assert.equal(s.history().undo.length, 2, "one step for the drawn cell, one for the replace");
  assert.equal(s.undo(), true);
  assert.deepEqual(s.snapshot(), drawn, "one undo gives the drawing and its colour back");
  assert.equal(s.redo(), true);
  assert.deepEqual(s.snapshot(), { cells: [[2, 3], [3, 3], [4, 3]], seed: [3, 3], colour: 0 });
  // a seed outside the shape is repaired, the same shape, seed and colour is no step
  assert.equal(s.replace({ cells: [[3, 3], [2, 3], [4, 3]], seed: [3, 3], colour: 0 }), false);
  assert.equal(s.history().undo.length, 2);
  s.replace({ cells: [[3, 3], [2, 3]], seed: [7, 7], colour: 0 });
  assert.deepEqual(s.seed, [2, 3]);
  // a colour change alone is one step, and its stroke survives the store
  assert.equal(s.replace({ cells: [[3, 3], [2, 3]], seed: [2, 3], colour: 1 }), true);
  const t = createEditorState();
  t.load({ ...s.snapshot(), ...JSON.parse(JSON.stringify(s.history())) });
  assert.equal(t.undo(), true);
  assert.equal(t.colour, 0);
  // bad cells change nothing
  assert.throws(() => t.replace({ cells: [[0.5, 0]], colour: 1 }), (e) => e.code === "bad_format");
  assert.throws(() => t.replace({ cells: [[2 ** 21, 0]], colour: 1 }), (e) => e.code === "out_of_range");
  assert.equal(t.colour, 0);
});

test("undo and redo keys: Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z", () => {
  assert.equal(historyKey({ key: "z", ctrlKey: true }), "undo");
  assert.equal(historyKey({ key: "Z", metaKey: true }), "undo");
  assert.equal(historyKey({ key: "y", ctrlKey: true }), "redo");
  assert.equal(historyKey({ key: "Z", ctrlKey: true, shiftKey: true }), "redo");
  assert.equal(historyKey({ key: "z" }), null);
  assert.equal(historyKey({ key: "z", ctrlKey: true, altKey: true }), null);
  assert.equal(historyKey({ key: "x", ctrlKey: true }), null);
});

test("seed rule: a loaded seed stays until the shape is edited, then the first cell in (j, i) order", () => {
  const s = createEditorState({ cells: shapeS(2), seed: [1, 0] });
  assert.deepEqual(s.seed, [1, 0]);
  s.draw(40, 40);
  assert.deepEqual(s.seed, firstCell(s.cells()), "any edit makes the first cell the seed");
  assert.deepEqual(s.seed, s.cells()[0]);
  s.undo();
  assert.deepEqual(s.seed, [1, 0], "undo gives the loaded seed back");
  s.redo();
  assert.deepEqual(s.seed, s.cells()[0]);
  s.undo();
  s.draw(1, 0);
  assert.equal(s.has(1, 0), false);
  assert.deepEqual(s.seed, s.cells()[0]);
  s.undo();
  assert.deepEqual(s.seed, [1, 0]);
  assert.equal(s.has(1, 0), true);
  assert.equal(typeof s.setSeed, "undefined", "no seed tool");
  // a seed given outside the shape is repaired on load
  const t = createEditorState({ cells: [[3, 3], [2, 3], [9, 1]], seed: [0, 0] });
  assert.deepEqual(t.seed, [9, 1]);
  assert.deepEqual(repairSeed([[3, 3], [2, 3]], [3, 3]), [3, 3]);
  assert.deepEqual(repairSeed([[3, 3], [2, 3]], null), [2, 3]);
  assert.equal(repairSeed([], [1, 1]), null);
  // clear is undoable
  t.clear();
  assert.equal(t.size, 0);
  assert.equal(t.seed, null);
  t.undo();
  assert.equal(t.size, 3);
  assert.deepEqual(t.seed, [9, 1]);
});

test("analysis of C_100: area 541, genus 100 by chi and by holes, connected, admissible", () => {
  const c = readJson("../../data/shapes/c100.json");
  const a = analyseShape(c.shape);
  assert.equal(a.area, 541);
  assert.equal(a.genus, 100);
  assert.equal(a.holes, 100);
  assert.equal(a.connected, true);
  assert.equal(a.residue.admissible, true);
  assert.deepEqual(a.residue.records.map((r) => r.p), [2, 3, 5, 7, 11, 13, 17, 19, 23]);
  assert.equal(canSendToLab(a), true);
  for (const f of ["genus0_hexagon.json", "hexagon_genus117.json"]) {
    const s = readJson(`../../data/shapes/${f}`);
    const b = analyseShape(s.shape);
    assert.equal(b.genus, s.genus, f);
    assert.equal(b.holes, s.genus, f);
    assert.equal(b.area, s.area, f);
    assert.equal(canSendToLab(b), true, f);
  }
});

test("a 2 x 2 block fails at p = 2, each of its 4 cells alone in its class, not sendable", () => {
  const a = analyseShape([[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.equal(a.residue.admissible, false);
  assert.deepEqual(a.residue.failures.map((r) => r.p), [2]);
  assert.deepEqual(a.residue.failures[0].singletons, [[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.equal(canSendToLab(a), false);
  assert.deepEqual(residueRows(a.residue), [[2, "all 4 hit"]]);
});

test("drawing into the hole of S_1 changes the genus from 1 to 0, undo gives 1 again", () => {
  const s = createEditorState({ cells: shapeS(1), seed: [1, 0] });
  assert.equal(analyseShape(s.cells()).genus, 1);
  s.draw(0, 0);
  const a = analyseShape(s.cells());
  assert.equal(a.genus, 0);
  assert.equal(a.holes, 0);
  s.undo();
  assert.equal(analyseShape(s.cells()).genus, 1);
  // removing a spine cell disconnects S_2
  const t = createEditorState({ cells: shapeS(2), seed: [1, 0] });
  t.draw(1, 3);
  assert.equal(analyseShape(t.cells()).connected, false);
  assert.equal(canSendToLab(analyseShape(t.cells())), false);
});

test("the Lab input object", () => {
  const s = createEditorState({ cells: shapeS(1), seed: [1, 0], colour: -1 });
  const input = labInputOf(s.snapshot());
  assert.deepEqual(input, { shape: shapeS(1), seed: [1, 0], colour: -1, lift: 1, id: null });
  assert.ok(Object.values(input).every((v) => typeof v !== "bigint"));
  assert.throws(() => labInputOf({ cells: [], seed: null, colour: 1 }), (e) => e.code === "empty_shape");
  assert.throws(() => labInputOf({ cells: [[0, 0]], seed: [1, 1], colour: 1 }), (e) => e.code === "seed_not_in_shape");
  // a blue shape goes to the Lab without a lift, another colour value is refused
  assert.deepEqual(labInputOf({ cells: [[0, 0]], seed: [0, 0], colour: 0 }), { shape: [[0, 0]], seed: [0, 0], colour: 0, id: null });
  assert.throws(() => labInputOf({ cells: [[0, 0]], seed: [0, 0], colour: 2 }), (e) => e.code === "bad_format");
});

test("the editor has no shape file to download", () => {
  const code = fs.readFileSync(new URL("../../src/ui/editor/editor.mjs", import.meta.url), "utf8");
  assert.ok(!/editor-download|downloadBlob|shapeFile/.test(code));
  const state = fs.readFileSync(new URL("../../src/ui/editor/editor_state.mjs", import.meta.url), "utf8");
  assert.ok(!/shapeFile/.test(state));
});

test("Clear: the whole drawing goes as one stroke, one undo brings it back, nothing happens on an empty drawing", () => {
  const s = createEditorState({ cells: shapeS(2), seed: null, colour: 1 });
  const before = s.cells();
  assert.equal(s.clear(), true);
  assert.equal(s.size, 0);
  assert.equal(s.history().undo.length, 1);
  assert.equal(s.clear(), false, "an empty drawing: no stroke");
  assert.equal(s.history().undo.length, 1);
  assert.equal(s.undo(), true);
  assert.deepEqual(s.cells(), before);
  assert.equal(s.redo(), true);
  assert.equal(s.size, 0);
});

test("a number of cells in words: 1 cell, else cells, also in the editor's short text", () => {
  assert.deepEqual([0, 1, 2, 541].map(cellsText), ["0 cells", "1 cell", "2 cells", "541 cells"]);
  const one = analyseShape([[0, 0]]);
  assert.equal(chipLine(one, quickFix(one, 1), 1), "1 cell | genus 0");
});

test("the Lab's presets in the editor's analysis: 25 entries, S_g^{+-1} and S_g^{0} computed with their seeds and genus", () => {
  assert.equal(LAB_PRESETS.length, 25);
  const shapeOf = (name) => presetShape(LAB_PRESETS.find((p) => p.name === name));
  for (let g = 1; g <= 10; g++) {
    const s = shapeOf(`s${g}`);
    const a = analyseShape(s.shape);
    assert.equal(a.genus, g);
    assert.equal(a.area, 10 * g - 4);
    assert.deepEqual(s.seed, [1, 0]);
    const z = shapeOf(`z${g}`);
    assert.equal(analyseShape(z.shape).genus, g);
    assert.deepEqual(z.seed, [0, 0]);
  }
  assert.equal(LAB_PRESETS.find((p) => p.name === "s11"), undefined);
  assert.equal(shapeOf("c100"), null, "a shipped shape is loaded from its file");
});
