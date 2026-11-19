// The verdict of the shape editor and its fix (src/ui/editor/verdict.mjs on src/core/shape_fix.mjs): the words of every
// kind of result, the short text beside the verdict, the quick verdict against the full search, the editor's bounds,
// and Apply fix as one undo step.

import { test } from "node:test";
import assert from "node:assert/strict";

import { quickFix, searchesFix, verdictWords, chipLine, areaGenusText, typeLabel, verdictMark } from "../../src/ui/editor/verdict.mjs";
import { fixOf, handleMessage, BLUE_MAX_CHOICES } from "../../src/ui/editor/fix.worker.mjs";
import { createEditorState, analyseShape, COLOURS } from "../../src/ui/editor/editor_state.mjs";
import { fixShape } from "../../src/core/shape_fix.mjs";
import { shapeS, seedS, shapeZ } from "../../src/core/shapes.mjs";

const RHOMBUS = [[0, 0], [1, 0], [0, 1], [1, 1]];
// a shape whose cheapest fix in +1 removes one cell of a class and one cell that this cuts off
const CUT = [[0, 0], [1, 0], [2, 1], [3, 1], [2, 2], [4, 2]];
const COLOUR_WORDS = /green|red|blue/i;

test("region type labels", () => {
  assert.deepEqual(COLOURS.map(typeLabel), ["+1", "-1", "0"]);
});

test("the verdict's words of every kind of result: a word or two, the same for every result of one kind", () => {
  const fix = (remove, add, cutOff = 0) => ({ remove, add, cutOff, exact: false, reason: "x", classes: [] });
  const three = [[0, 0], [1, 0], [2, 0]];
  assert.equal(verdictWords(null, 1), "Can be packed");
  assert.equal(verdictWords(null, 0), "Can be packed");
  assert.equal(verdictWords({ none: true, reason: "empty" }, -1), "Empty");
  assert.equal(verdictWords({ none: true, reason: "not_connected" }, 0), "Not connected");
  // the residue test of the type fails: the shape's own for +1 and -1, its neighbours' for 0, while the fix is
  // searched, once it is found and when there is none
  for (const f of [undefined, fix(three, []), { none: true, reason: "no_fix" }]) {
    assert.equal(verdictWords(f, 1), "Not admissible");
    assert.equal(verdictWords(f, -1), "Not admissible");
    assert.equal(verdictWords(f, 0), "Neighbours not admissible");
  }
  assert.deepEqual(verdictMark(null), { icon: "check", ok: "true" });
  assert.deepEqual(verdictMark({ none: true, reason: "empty" }), { icon: "draw", ok: "none" });
  assert.deepEqual(verdictMark({ none: true, reason: "not_connected" }), { icon: "cross", ok: "false" });
  assert.deepEqual(verdictMark(undefined), { icon: "cross", ok: "false" });
  // at most three words, no full stop, never a claim of minimality, never a colour word
  for (const c of COLOURS) {
    for (const f of [null, undefined, { none: true, reason: "empty" }, { none: true, reason: "not_connected" }, { none: true, reason: "no_fix" }, fix(three, [], 1)]) {
      const t = verdictWords(f, c);
      assert.ok(t.split(" ").length <= 3 && !t.endsWith("."), t);
      assert.doesNotMatch(t, /smallest|minimal|minimum/i, t);
      assert.doesNotMatch(t, COLOUR_WORDS, t);
    }
  }
});

test("the short text beside the verdict: the facts in the Explorer's form, else the verdict's words, nothing when empty", () => {
  const line = (cells, colour) => {
    const a = analyseShape(cells);
    return chipLine(a, quickFix(a, colour), colour);
  };
  assert.equal(line([[0, 0], [1, 0]], 1), "2 cells | genus 0");
  assert.equal(line([[0, 0]], 0), "1 cell | genus 0");
  assert.equal(line(RHOMBUS, 1), "Not admissible");
  assert.equal(line(shapeS(1), 0), "Neighbours not admissible");
  assert.equal(line([[0, 0], [5, 5]], -1), "Not connected");
  assert.equal(line([], 1), "");
  assert.equal(areaGenusText(70, 4), "70 cells | genus 4");
});

test("quickFix agrees with fixShape wherever no search runs, and the search finds a fix for the rest", () => {
  const strip = Array.from({ length: 60 }, (_, i) => [i, 0]);
  const shapes = [[], [[0, 0]], [[0, 0], [5, 5]], RHOMBUS, CUT, shapeS(1), shapeS(3), shapeZ(2), shapeZ(3), strip];
  let searched = 0;
  for (const cells of shapes) {
    const a = analyseShape(cells);
    for (const c of COLOURS) {
      const q = quickFix(a, c);
      const full = fixShape(cells, c);
      if (searchesFix(q)) {
        searched++;
        assert.ok(full && !full.none, `${JSON.stringify(cells)} in ${c}: the search finds a fix`);
      } else assert.deepEqual(q, full, `${JSON.stringify(cells)} in ${c}`);
    }
  }
  assert.ok(searched >= 8, `${searched} cases left to the search`);
  // the long row is searched with its own words kept; a shape that is not connected gets no fix, as an empty one
  assert.equal(searchesFix({ none: true, reason: "row_too_long" }), true);
  assert.equal(searchesFix({ none: true, reason: "not_connected" }), false);
  assert.equal(searchesFix({ none: true, reason: "empty" }), false);
  assert.equal(searchesFix(null), false);
});

test("the editor's fix: the rhombus in +1 and -1 loses one cell, S_1 in 0 gets cells added, the cut-off shape", () => {
  for (const c of [1, -1]) {
    const f = fixOf(RHOMBUS, c);
    assert.equal(f.remove.length, 1);
    assert.equal(f.add.length, 0);
    assert.equal(f.exact, true);
  }
  const b = fixOf(shapeS(1), 0);
  assert.equal(b.remove.length, 0);
  assert.ok(b.add.length > 0);
  const k = fixOf(CUT, 1);
  assert.deepEqual(k.remove, [[0, 0], [1, 0]]);
  assert.equal(k.cutOff, 1);
  // blue searches fewer class choices than the default of the module
  assert.ok(BLUE_MAX_CHOICES < 20000);
  assert.deepEqual(fixOf(shapeS(3), 0), fixShape(shapeS(3), 0, { maxChoices: BLUE_MAX_CHOICES }));
});

test("the fix worker answers a job with the editor's fix and its time, a bad job with an error code", () => {
  const out = [];
  handleMessage({ id: 7, cells: shapeS(1), colour: 0 }, (m) => out.push(m));
  handleMessage({ id: 8, cells: [[0.5, 0]], colour: 1 }, (m) => out.push(m));
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 7);
  assert.deepEqual(out[0].fix, fixOf(shapeS(1), 0));
  assert.ok(out[0].ms >= 0);
  assert.deepEqual(out[1], { id: 8, error: { code: "bad_format", message: out[1].error.message } });
});

test("Apply fix: editCells is one stroke, one undo brings the shape back, the result can be built", () => {
  const strip = Array.from({ length: 60 }, (_, i) => [i, 0]);
  // a shape that is not connected: no fix, nothing to apply
  for (const [cells, colour] of [[[[0, 0], [2, 0]], 1], [[[0, 0], [3, 0], [0, 4], [1, 4]], -1], [[[0, 0], [5, 5]], 0]]) {
    assert.deepEqual(fixOf(cells, colour), { none: true, reason: "not_connected" });
    assert.deepEqual(quickFix(analyseShape(cells), colour), { none: true, reason: "not_connected" });
  }
  for (const [cells, colour] of [[RHOMBUS, 1], [shapeS(1), 0], [CUT, -1], [strip, -1]]) {
    const s = createEditorState({ cells, colour });
    const before = s.cells();
    const f = fixOf(s.cells(), colour);
    assert.equal(s.editCells({ remove: f.remove, add: f.add }), true);
    assert.equal(quickFix(analyseShape(s.cells()), colour), null, `${JSON.stringify(cells)} in ${colour}`);
    assert.equal(s.history().undo.length, 1);
    assert.equal(s.undo(), true);
    assert.deepEqual(s.cells(), before);
    assert.equal(s.canUndo(), false);
    assert.equal(s.redo(), true);
    assert.equal(quickFix(analyseShape(s.cells()), colour), null);
  }
  // nothing to change: no stroke; a bad cell changes nothing
  const s = createEditorState({ cells: shapeS(1), seed: seedS(1) });
  assert.equal(s.editCells({ remove: [[50, 50]], add: [[1, 0]] }), false);
  assert.equal(s.canUndo(), false);
  const v = s.version;
  assert.throws(() => s.editCells({ remove: [[1, 0]], add: [[0.5, 0]] }), (e) => e.code === "bad_format");
  assert.throws(() => s.editCells({ remove: [[1, 0]], add: [[2 ** 21, 0]] }), (e) => e.code === "out_of_range");
  assert.equal(s.version, v);
  assert.deepEqual(s.cells(), createEditorState({ cells: shapeS(1) }).cells());
});
