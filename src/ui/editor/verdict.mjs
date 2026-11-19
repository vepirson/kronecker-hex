// The verdict of the shape editor, without any DOM: can the drawn shape be built as a region of the chosen type
// (+1, -1 or 0), and if not, why not in a word or two. The editor shows the verdict as a check or a cross icon (the
// hexagon of the draw tool while the shape is empty) whose tooltip is verdictWords, beside it one short text
// (chipLine), and draws the cells of the fix of src/core/shape_fix.mjs with hollow marks.
//
// A verdict is decided in two steps. quickFix(analysis, colour) needs only the live analysis of the shape (it is
// cheap and runs on every redraw): null when the shape can be built, { none: true, reason } for an empty or a
// disconnected shape or one with a row too long, undefined when the residue test of the type fails. The fix itself is
// searched for a failed residue test and for a row too long (searchesFix: fixOf of fix.worker.mjs, run by the editor
// in its worker after the edit). Both give results of the form of fixShape.

import { canSendToLab, cellsText, colourCheckOf } from "./editor_state.mjs";
import { rowProblem, ROW_TOO_LONG } from "../../construct/row_limit.mjs";
import { fieldsOf } from "../pages/lab/model.mjs";

// The label of each region type: "+1", "-1" and "0" for the colours 1, -1 and 0.
const TYPE_LABELS = Object.freeze({ 1: "+1", "-1": "-1", 0: "0" });

// typeLabel(colour) is "+1", "-1" or "0".
export function typeLabel(colour) {
  return TYPE_LABELS[colour];
}

// quickFix(analysis, colour) is the verdict that needs no search: null (the shape can be built), { none: true,
// reason: "empty" }, { none: true, reason: "not_connected" } or { none: true, reason: "row_too_long" } (a row longer
// than the row limit, the one rule of src/construct/row_limit.mjs), or undefined (the residue test of the type fails).
export function quickFix(analysis, colour) {
  if (!analysis || analysis.empty) return { none: true, reason: "empty" };
  if (!analysis.connected) return { none: true, reason: "not_connected" };
  if (canSendToLab(analysis, colour)) return null;
  if (colourCheckOf(analysis, colour).admissible && rowProblem(analysis.rowMax, colour)) return { none: true, reason: "row_too_long" };
  return undefined;
}

// searchesFix(verdict) is true when the fix of a shape with this result of quickFix is searched in the fix worker: the
// residue test fails, or a row is too long. An empty or a disconnected shape gets no fix.
export function searchesFix(verdict) {
  return verdict === undefined || (!!verdict && verdict.none === true && verdict.reason === "row_too_long");
}

// The words of a failed residue test, by the part of the analysis that the type tests (analysisPart of the Lab's kind
// fields: the shape itself for +1 and -1, its neighbours for 0).
const FAILED_TEST = Object.freeze({ residue: "Not admissible", ring: "Neighbours not admissible" });

const isEmpty = (fix) => !!fix && fix.none === true && fix.reason === "empty";

// verdictWords(fix, colour) is the verdict in a word or two, for a result of quickFix or fixShape (undefined while the
// fix is not known yet): "Can be packed", "Empty", "Not connected", ROW_TOO_LONG, "Not admissible" (the residue test
// of the shape fails, types +1 and -1) or "Neighbours not admissible" (the residue test of its neighbours fails, type
// 0). It is also the reason of every action that needs a shape that can be built.
export function verdictWords(fix, colour) {
  if (fix === null) return "Can be packed";
  if (isEmpty(fix)) return "Empty";
  if (fix && fix.none && fix.reason === "not_connected") return "Not connected";
  if (fix && fix.none && fix.reason === "row_too_long") return ROW_TOO_LONG;
  return FAILED_TEST[fieldsOf({ colour }).analysisPart];
}

// chipLine(analysis, fix, colour) is the one short text beside the verdict icon: for a shape that can be built its
// facts in the Explorer's form ("2 cells | genus 0"), else verdictWords, for the empty shape "".
export function chipLine(analysis, fix, colour) {
  if (isEmpty(fix)) return "";
  return fix === null ? areaGenusText(analysis.area, analysis.genus) : verdictWords(fix, colour);
}

// areaGenusText(area, genus) is the facts of a region in the form of the Explorer's chip: "70 cells | genus 4".
export function areaGenusText(area, genus) {
  return `${cellsText(area)} | genus ${genus}`;
}

// verdictMark(fix) is the icon of a verdict and its state (data-ok of the icon): { icon: "check", ok: "true" } when
// the shape can be built, { icon: "draw", ok: "none" } for the empty shape, else { icon: "cross", ok: "false" }.
export function verdictMark(fix) {
  if (fix === null) return { icon: "check", ok: "true" };
  return isEmpty(fix) ? { icon: "draw", ok: "none" } : { icon: "cross", ok: "false" };
}
