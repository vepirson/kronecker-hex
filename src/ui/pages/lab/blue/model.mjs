// The pure parts of the blue Construction Lab (no DOM access, used by the blue steps, the blue entry of kinds.mjs
// and the Node tests): the progress and error texts, the table of the cells of S with the prime that makes each
// blue, the focus and click rules of that table, and the cell lists the steps show.
//
// Everything here reads the view model buildBlueView(events) of the blue construction, never the raw events.
// Positions are those of the blue steps: 0 the window, 1 the classes (sub n = the n-th prime), 2 the private primes
// (sub n = the n-th remaining cell), 3 d0 (sub n = the n-th condition on d), 4 x0 (sub n = the n-th condition on x,
// then the candidates), 5 the check (sub n = the n-th row of the window).

import { cellKey } from "../../../../core/geometry.mjs";
import { DOT, errorInfo, sourceOfColours } from "../model.mjs";
import { shortNumber } from "../../../widgets/bignum.mjs";
import { stepRef } from "../steps.mjs";

// windowSource(view) is the static colour source of the blue steps without (x0, d0): the cells of S blue, every other
// cell empty (the neighbours must not be blue, their colour is not prescribed).
export function windowSource(view) {
  const m = new Map();
  if (view && view.window) for (const [i, j] of view.window.S) m.set(cellKey(i, j), 0);
  return sourceOfColours(m);
}

// ---------- texts of the status line ----------

const PHASES = { classes: "classes of the small primes", verify: "check of the cells" };
const PHASE_STEP = { classes: 1, verify: 5 };
// the name of step k of the blue kind in a sentence (stepRef)
const blueStep = (k, capital = false) => stepRef("blue", k, capital);

// lastStep(view) is the highest step with an event (0 when none has).
export function lastStep(view) {
  let last = 0;
  if (view && view.available) for (let s = 0; s < view.available.length; s++) if (view.available[s]) last = s;
  return last;
}

// blueProgressText(view) is the progress of a running blue construction for the status chip: { chip ("40% classes",
// "75% check", "step 2": where the run is, never its mode), text (a sentence), percent (or null) }, or null when
// nothing is known yet. The percent comes from the latest blueProgress event (the classes of the small primes or the
// check). Steps are named by stepRef.
export function blueProgressText(view) {
  if (!view || !view.start) return null;
  const p = view.progress;
  if (p) {
    const percent = p.total > 0 ? Math.min(100, Math.floor((100 * p.done) / p.total)) : null;
    const word = p.phase === "classes" ? "classes" : "check";
    return {
      chip: percent === null ? word : `${percent}% ${word}`,
      text: `${blueStep(PHASE_STEP[p.phase] ?? lastStep(view), true)}: ${PHASES[p.phase] || p.phase}, ${p.done} of ${p.total}.`,
      percent,
    };
  }
  const s = lastStep(view);
  return { chip: blueStep(s), text: `${blueStep(s, true)} reached.`, percent: null };
}

// blueStopped(view) is the error object shown when the worker stops without a result: { code: "stopped", j: null,
// step } with the highest step reached.
export function blueStopped(view) {
  return { code: "stopped", j: null, step: lastStep(view) };
}

// ---------- error texts ----------

// blueErrorInfo(error) is errorInfo of the Lab for an error of a blue construction: the codes "inadmissible" (the
// neighbour set meets every class modulo p), "no_x0" and "stopped" have their own texts, every other code (a bad
// input, a damaged link) the texts of errorInfo.
export function blueErrorInfo(error) {
  const e = error || {};
  const code = e.code || "unknown";
  switch (code) {
    case "inadmissible":
      return {
        code, title: "The neighbours are not admissible", editorLink: true,
        sentence: `Every class modulo ${e.p} contains a neighbour of the shape.`,
        detail: `A cell has region type 0 when one prime divides both of its coordinates. Whatever x and d are, some class modulo ${e.p} then has both coordinates divisible by ${e.p}, and it contains a neighbour, which then has region type 0 too. So no region of type 0 has this shape. Change the shape so that one class modulo ${e.p} contains no neighbour.`,
      };
    case "no_x0":
      return {
        code, title: "No value of x passed", editorLink: false,
        sentence: "No candidate for x is coprime to the rows at every neighbour of the shape.",
        detail: "The input was changed or damaged.",
      };
    case "stopped":
      return {
        code, title: "The construction stopped", editorLink: true,
        sentence: Number.isInteger(e.step) ? `The construction stopped during ${blueStep(e.step)}.` : "The construction stopped before it finished.",
        detail: "The browser most likely ran out of memory.",
      };
    default:
      return errorInfo(e);
  }
}

// ---------- which prime makes a cell blue ----------

// blueCellsSoFar(view, nClasses, nPrivates) is the Map cellKey -> { i, j, kind: "class" | "private", prime } of the
// cells of S made blue by the first nClasses classes (each cell by the smallest prime whose class holds it) and the
// first nPrivates private primes.
export function blueCellsSoFar(view, nClasses, nPrivates) {
  const m = new Map();
  const classes = view && view.classes ? view.classes.slice(0, Math.max(0, nClasses)) : [];
  for (const c of classes) {
    for (const [i, j] of c.members) {
      const k = cellKey(i, j);
      if (!m.has(k)) m.set(k, { i, j, kind: "class", prime: c.p });
    }
  }
  const privates = view && view.privates ? view.privates.slice(0, Math.max(0, nPrivates)) : [];
  for (const q of privates) m.set(cellKey(q.i, q.j), { i: q.i, j: q.j, kind: "private", prime: q.q });
  return m;
}

// revealedAt(view, step, sub) is { classes, privates }: how many classes and private primes the position has shown
// (the first sub at their own step, all of them after it, none before).
export function revealedAt(view, step, sub) {
  const nC = view && view.classes ? view.classes.length : 0;
  const nP = view && view.privates ? view.privates.length : 0;
  const pick = (own, n) => (step < own ? 0 : step > own ? n : Math.max(0, Math.min(n, sub | 0)));
  return { classes: pick(1, nC), privates: pick(2, nP) };
}

// The columns of the blue table in display order.
export const BLUE_COLUMNS = Object.freeze([
  Object.freeze({ key: "i", label: "i" }),
  Object.freeze({ key: "j", label: "j" }),
  Object.freeze({ key: "prime", label: "prime" }),
  Object.freeze({ key: "kind", label: "kind" }),
]);

// blueTableLines(view, { step, sub }) returns the lines of the blue table, one per cell of S in the cell order:
// [{ key (cellKey), data: { i, j }, cells: { i, j, prime, kind } as { text } }]. The prime and its kind ("class" or
// "private") are filled as the classes (step 1) and the private primes (step 2) are revealed, DOT before.
export function blueTableLines(view, { step = 0, sub = 0 } = {}) {
  if (!view || !view.window) return [];
  const r = revealedAt(view, step, sub);
  const blue = blueCellsSoFar(view, r.classes, r.privates);
  return view.window.S.map(([i, j]) => {
    const key = cellKey(i, j);
    const b = blue.get(key);
    return {
      key,
      data: { i, j },
      cells: { i: { text: String(i) }, j: { text: String(j) }, prime: { text: b ? String(b.prime) : DOT }, kind: { text: b ? (b.kind === "private" ? "own" : b.kind) : DOT } },
    };
  });
}

// conditionCells(view, k) is the list of cells of S that the k-th condition on x or on d (0-based: the classes first,
// then the private primes, the order of the CRT steps) makes blue.
export function conditionCells(view, k) {
  if (!view || !Number.isInteger(k) || k < 0) return [];
  const nC = view.classes.length;
  if (k < nC) return view.classes[k].members.map(([i, j]) => [i, j]);
  const q = view.privates[k - nC];
  return q ? [[q.i, q.j]] : [];
}

// xItemOf(view, sub) is the item of step 4 at sub: { kind: "condition", index } for sub 1 .. xSteps.length,
// { kind: "candidate", index } for the candidates after them, null at sub 0.
export function xItemOf(view, sub) {
  if (!view || !(sub > 0)) return null;
  const n = view.xSteps.length;
  if (sub <= n) return { kind: "condition", index: sub - 1 };
  if (sub - n <= view.xCandidates.length) return { kind: "candidate", index: sub - n - 1 };
  return null;
}

// blueFocusOf(view, step, sub) is the key of the table line in focus: the cell of the private prime of sub at step 2,
// the cell of a private condition at steps 3 and 4, else null.
export function blueFocusOf(view, step, sub) {
  if (!view || !(sub > 0)) return null;
  let k = null;
  if (step === 2) k = view.classes.length + sub - 1;
  else if (step === 3) k = sub - 1;
  else if (step === 4) {
    const it = xItemOf(view, sub);
    k = it && it.kind === "condition" ? it.index : null;
  }
  if (k === null || k < view.classes.length) return null;
  const cells = conditionCells(view, k);
  return cells.length === 1 ? cellKey(cells[0][0], cells[0][1]) : null;
}

// blueSubOf(view, step, key) is the sub a click on the line of a cell moves to: at step 1 the smallest prime whose
// class holds the cell, at steps 2, 3 and 4 the private prime of the cell (or, at steps 3 and 4, its first class).
// null when the step has no item for the cell.
export function blueSubOf(view, step, key) {
  if (!view || step < 1 || step > 4) return null;
  const ci = view.classes.findIndex((c) => c.members.some(([i, j]) => cellKey(i, j) === key));
  const pi = view.privates.findIndex((q) => cellKey(q.i, q.j) === key);
  if (step === 1) return ci < 0 ? null : ci + 1;
  if (step === 2) return pi < 0 ? null : pi + 1;
  const k = pi >= 0 ? view.classes.length + pi : ci;
  if (k < 0) return null;
  const n = step === 3 ? view.dSteps.length : view.xSteps.length;
  return k < n ? k + 1 : null;
}

// conditionText(letter, step) is the text "x = r (mod m)" of a CRT step { modulus, residue } of the
// conditions on x (letter "x") or d ("d"), the numbers in the short form of the site (shortNumber).
export function conditionText(letter, step) {
  return `${letter} = ${shortNumber(step.residue)} (mod ${shortNumber(step.modulus)})`;
}
