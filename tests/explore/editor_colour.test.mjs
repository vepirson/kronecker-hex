// The editor's three colours (src/ui/editor/editor_state.mjs): green and red need the shape to pass the residue test,
// blue its neighbour ring N(S). The colour menu gives each type its verdict, the Lab takes a blue shape.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createEditorState, analyseShape, canSendToLab, labInputOf, COLOURS } from "../../src/ui/editor/editor_state.mjs";
import { labInputRecord } from "../../src/ui/pages/lab/model.mjs";
import { quickFix, verdictWords, chipLine } from "../../src/ui/editor/verdict.mjs";
import { detailsLines } from "../../src/ui/editor/editor.mjs";
import { shapeS, seedS, shapeZ, seedZ } from "../../src/core/shapes.mjs";

test("the editor state takes the three colours, nothing else", () => {
  assert.deepEqual(COLOURS, [1, -1, 0]);
  const s = createEditorState({ cells: shapeZ(2), seed: seedZ(2), colour: 0 });
  assert.equal(s.colour, 0);
  s.setColour(-1);
  assert.equal(s.colour, -1);
  s.load({ cells: shapeZ(2), seed: seedZ(2), colour: 0 });
  assert.equal(s.snapshot().colour, 0);
  assert.throws(() => s.setColour(2), (e) => e.code === "bad_format");
  assert.throws(() => createEditorState({ colour: "blue" }), (e) => e.code === "bad_format");
});

test("canSendToLab and the colour menu: S_g in green and red, Z_g in blue, each other colour with its reason", () => {
  const a = analyseShape(shapeS(3));
  const b = analyseShape(shapeZ(3));
  assert.deepEqual([canSendToLab(a, 1), canSendToLab(a, -1), canSendToLab(a, 0)], [true, true, false]);
  assert.deepEqual([canSendToLab(b, 1), canSendToLab(b, -1), canSendToLab(b, 0)], [false, false, true]);
  assert.equal(canSendToLab(a), true);
  // the menu's words of each type (its tooltip)
  const words = (an) => COLOURS.map((c) => verdictWords(quickFix(an, c), c));
  assert.deepEqual(words(a), ["Can be packed", "Can be packed", "Neighbours not admissible"]);
  assert.deepEqual(words(b), ["Not admissible", "Not admissible", "Can be packed"]);
  assert.deepEqual(words(analyseShape([])), ["Empty", "Empty", "Empty"]);
  // a disconnected shape is not sent in any colour
  const t = analyseShape([[0, 0], [5, 5]]);
  assert.deepEqual(COLOURS.map((c) => canSendToLab(t, c)), [false, false, false]);
  assert.deepEqual(words(t), ["Not connected", "Not connected", "Not connected"]);
});

test("the editor's short text and details name the residue test of the colour, each detail line 'subject: verdict'", () => {
  const z = analyseShape(shapeZ(2));
  const line = (an, c) => chipLine(an, quickFix(an, c), c);
  assert.equal(line(z, 1), "Not admissible");
  assert.equal(line(z, -1), "Not admissible");
  assert.equal(line(z, 0), "17 cells | genus 2");
  assert.equal(line(analyseShape(shapeS(2)), 0), "Neighbours not admissible");
  const d = detailsLines(z);
  // (no holes line: the genus counts them)
  assert.deepEqual(d, { head: ["cells: 17", "genus: 2"], shape: "shape: not admissible", neighbours: "neighbours: admissible", lines: ["connected: yes"] });
  assert.deepEqual(detailsLines(analyseShape([])), { head: [], shape: "shape: empty", neighbours: null, lines: [] });
  assert.deepEqual(detailsLines(analyseShape([[0, 0], [5, 5]])).lines, ["connected: no"]);
  for (const s of [...d.head, d.shape, d.neighbours, ...d.lines]) assert.match(s, /^[a-z]+: [a-z0-9 ]+$/, s);
});

test("a blue shape from the editor is a blue Lab input record", () => {
  const s = createEditorState({ cells: shapeZ(3), seed: seedZ(3), colour: 0 });
  const input = labInputOf(s.snapshot());
  assert.deepEqual(labInputRecord(input), input);
  assert.equal(input.colour, 0);
  assert.equal("lift" in input, false);
  const g = labInputOf(createEditorState({ cells: shapeS(2), seed: seedS(2), colour: 1 }).snapshot());
  assert.deepEqual(labInputRecord(g), g);
});
