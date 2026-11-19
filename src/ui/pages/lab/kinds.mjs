// The kinds of construction the Construction Lab plays, one entry each. The page (index.mjs) reads everything that
// differs between the kinds from the entry of the running construction: its step modules, its view model, its table,
// its extras, its error and progress texts, its presets and the plain record of its input. Which entry applies to an
// input is decided by kindOf of the construction modules, nowhere else.
//
// An entry is
//   { id, the pure fields of the kind (KIND_FIELDS of model.mjs: family, testedCells, analysisPart, reason, check,
//     inputRecord, resolvePreset, planFields, computedRunOn, genusLimit), steps (step modules, see index.mjs),
//     stepCount, labels (the label of every step: its heading and the text of its step button, from the table of
//     steps.mjs), names (the name of every step in a sentence, "step 2.1"), places (its name in the position text,
//     "step 2.1" or "Shape"), buildView(events),
//     table: { columns: [{ key, label }], label, lines(view, pos, result), keyOf(line), focusOf(view, step, sub),
//              subOf(view, step, key) },
//     residues (the second table, under the first: the same fields and step, the step its lines belong to),
//     hasTries (the kind tries candidates and residues that a replay does not show, search.mjs),
//     extras (a module with mountExtras(toolbar, kit, opts)), errorInfo(error), progressText(view), stopped(view),
//     presets, presetInput(plan) }
// Where a run goes is not a field: runPlace of the construction modules decides it for every page.
// table.lines returns [{ key, data (attributes of the table line), cells: { [column key]: { text, big, changed } } }]:
// big (a bigint or undefined) is drawn through the big number widget when its text is long, changed marks a value of
// a tampered result. focusOf is the key of the line in focus at a position (or null), subOf the position a click on a
// line moves to within the step (or null). progressText(view) is null or { chip, text, percent } for a running
// construction (a live run, or a replay in the worker), stopped(view) the error object shown when the worker stops
// without a result, check(shape) null when the kind can build the shape, else { p, reason }.

import { kindOf } from "../../../construct/index.mjs";
import { buildLabView } from "../../../construct/lab_view.mjs";
import { buildBlueView, BLUE_STEP_COUNT } from "../../../construct/blue/lab_view.mjs";
import * as model from "./model.mjs";
import * as blueModel from "./blue/model.mjs";
import * as blue0 from "./blue/step0.mjs";
import * as blue1 from "./blue/step1.mjs";
import * as blue2 from "./blue/step2.mjs";
import * as blue3 from "./blue/step3.mjs";
import * as blue4 from "./blue/step4.mjs";
import * as blue5 from "./blue/step5.mjs";
import * as blueExtras from "./blue/extras.mjs";
import * as step0 from "./step0.mjs";
import * as step1 from "./step1.mjs";
import * as step2 from "./step2.mjs";
import * as step3 from "./step3.mjs";
import * as step4 from "./step4.mjs";
import * as step5 from "./step5.mjs";
import * as step6 from "./step6.mjs";
import * as step7 from "./step7.mjs";
import * as signExtras from "./extras.mjs";
import { STEP_TABLES, stepLabels, stepRef, stepPlace, isMainStep } from "./steps.mjs";

// the labels, the sentence names and the names in the position text of the steps of a kind
const stepTexts = (id) => ({
  labels: Object.freeze(stepLabels(id)),
  names: Object.freeze(STEP_TABLES[id].map((_, k) => stepRef(id, k))),
  places: Object.freeze(STEP_TABLES[id].map((_, k) => stepPlace(id, k))),
});
const SIGN_TEXTS = stepTexts("sign");
const BLUE_TEXTS = stepTexts("blue");

const SIGN_STEPS = Object.freeze([step0, step1, step2, step3, step4, step5, step6, step7]);

// The rows a sign step fills in its own column of the table at sub (its revealedRows, default sub).
const signRevealed = (s, view, sub) => {
  const m = SIGN_STEPS[s];
  return typeof m.revealedRows === "function" ? m.revealedRows(view, sub) : sub;
};

// residueTable(listOf) is the second table of a kind (residueLines of model.mjs): one line per small prime of the
// first step, listOf(view) the list of the kind's view; a click on a line moves to its item of step 1.
const residueTable = (listOf) => Object.freeze({
  columns: model.RESIDUE_COLUMNS,
  label: "small primes",
  step: 1,
  lines: (view, pos) => model.residueLines(listOf(view), pos.step, pos.sub),
  keyOf: (line) => line.key,
  focusOf: (view, step, sub) => model.residueFocus(listOf(view), step, sub),
  subOf: (view, step, p) => model.residueSub(listOf(view), p),
});

// The table j, r1, r2, q1, q2, R of the sign construction: one line per row with sign cells, keyed by its j.
const SIGN_TABLE = Object.freeze({
  columns: model.TABLE_COLUMNS,
  label: "rows",
  lines(view, pos, result) {
    const lines = model.tableModel(view, { step: pos.step, sub: pos.sub, result, revealed: (s, sub) => signRevealed(s, view, sub) });
    return lines.map((ln) => {
      const cells = {};
      for (const c of model.TABLE_COLUMNS) {
        const text = ln.cells[c.key];
        cells[c.key] = { text, big: c.key === "R" && text !== model.DOT ? ln.raw.R : undefined, changed: !!ln.tampered[c.key] };
      }
      return { key: ln.j, data: { j: ln.j }, cells };
    });
  },
  keyOf: (line) => line.key,
  focusOf(view, step, sub) {
    const m = SIGN_STEPS[step];
    return typeof m.focusRow === "function" ? m.focusRow(view, sub) : model.defaultFocusRow(view, step, sub);
  },
  subOf(view, step, j) {
    const m = SIGN_STEPS[step];
    return typeof m.subOfRow === "function" ? m.subOfRow(view, j) : null;
  },
});

// The green and red construction (eight steps).
export const SIGN = Object.freeze({
  id: "sign",
  ...model.KIND_FIELDS.sign,
  steps: SIGN_STEPS,
  stepCount: SIGN_STEPS.length,
  ...SIGN_TEXTS,
  buildView: buildLabView,
  table: SIGN_TABLE,
  residues: residueTable((view) => view.smallPrimes || []),
  hasTries: true,
  extras: signExtras,
  errorInfo: model.errorInfo,
  progressText: model.signProgressText,
  stopped: (view) => ({ code: "stopped", j: model.rowInProgress(view) }),
  presets: model.LAB_PRESETS,
  presetInput: model.presetInput,
});

const BLUE_STEPS = Object.freeze([blue0, blue1, blue2, blue3, blue4, blue5]);

// The table of the blue construction: one line per cell of S with the prime that makes it blue, keyed by cellKey.
const BLUE_TABLE = Object.freeze({
  columns: blueModel.BLUE_COLUMNS,
  label: "cells of the shape",
  lines: (view, pos) => blueModel.blueTableLines(view, pos),
  keyOf: (line) => line.key,
  focusOf: blueModel.blueFocusOf,
  subOf: blueModel.blueSubOf,
});

// The blue construction (six steps).
export const BLUE = Object.freeze({
  id: "blue",
  ...model.KIND_FIELDS.blue,
  steps: BLUE_STEPS,
  stepCount: BLUE_STEP_COUNT,
  ...BLUE_TEXTS,
  buildView: buildBlueView,
  table: BLUE_TABLE,
  residues: residueTable((view) => view.classes || []),
  hasTries: false,
  extras: blueExtras,
  errorInfo: blueModel.blueErrorInfo,
  progressText: blueModel.blueProgressText,
  stopped: blueModel.blueStopped,
  presets: model.LAB_PRESETS,
  presetInput: model.presetInput,
});

// The entries by id.
export const KINDS = Object.freeze({ sign: SIGN, blue: BLUE });

// kindEntry(input) is the entry of the kind of an input, a replay input, a construction's data or result, or a plan
// with a colour (kindOf of the construction modules).
export function kindEntry(input) {
  return KINDS[kindOf(input)];
}

// allModules() is the list of every step module and extras module of every kind (for the content files to load).
export function allModules() {
  return Object.values(KINDS).flatMap((k) => [...k.steps, k.extras]);
}

// renderStep(entry, k, panel, view, sub, kit) is the frame of every step of every kind: the heading (the step's label,
// the text of its step button, in bold for a main step only, as its button), then render(panel, view, sub, kit) of the
// step module. A step with nothing to show yet returns false from render and leaves the canvas empty.
export function renderStep(entry, k, panel, view, sub, kit) {
  const main = isMainStep(STEP_TABLES[entry.id][k]);
  panel.replaceChildren(kit.h("h2", { class: ["lab-h2", main ? "lab-step-main" : null] }, entry.labels[k]));
  kit.hex.setOverlays([]);
  if (entry.steps[k].render(panel, view, sub, kit) === false) kit.hex.clear();
}
