// Step 6 of the Construction Lab: gluing x. The conditions x = r (mod m) join one by one by the Chinese remainder
// theorem: the small-prime part X_s (mod M_x) first, then per row q1, q2 and the cofactor c. sub 0 is the overview,
// sub n the n-th condition: its kind, its row, the modulus (digit count for a cofactor), the residue, and the digits
// of the running solution as a bar chart over all conditions. At the last condition x0 and d0 appear, and from there
// on the canvas shows the real Kronecker window around (x0, d0): every cell soft, the region at full strength with
// its outline.

import { kroneckerSource } from "../../../render/hex_canvas.mjs";
import { fadeOutside, outline, region, highlight } from "../../../render/overlays.mjs";
import { useStyles } from "../../dom.mjs";
import { windowColours, sourceOfColours, forcedUpTo, signCellsOf, digits, numsBlock, mismatchCells } from "./model.mjs";
import { STYLES_URL, prose } from "./step5.mjs";

// Moduli and residues with more digits than this are shown by their digit count.
export const SHOW_DIGITS = 24;

// Words for the kinds of the conditions.
export const KINDS = Object.freeze({ small: "small primes", q1: "q1", q2: "q2", c: "cofactor" });

// subCount(view): the number of conditions on x (0 before the first xCrtStep event).
export function subCount(view) {
  return view && Array.isArray(view.xSteps) ? view.xSteps.length : 0;
}

// subOfRow(view, j): the sub of the first condition of row j (its q1).
export function subOfRow(view, j) {
  if (!view || !view.xSteps) return null;
  const k = view.xSteps.findIndex((s) => s.j === j);
  return k < 0 ? null : k + 1;
}

// focusRow(view, sub): the row of the condition of sub (null at sub 0 and for the small-prime part).
export function focusRow(view, sub) {
  const s = view && view.xSteps && sub > 0 ? view.xSteps[sub - 1] : null;
  return s ? s.j : null;
}

const numText = (v) => {
  const n = digits(v);
  return n <= SHOW_DIGITS ? String(v) : `${n} digits`;
};

// step6Data(view, sub) is the data shown at position sub, or null before the first condition: { total (number of
// conditions), rows (rows with sign cells), steps: [{ index, kind, j, modulusDigits, digitsSoFar }], shown (how many
// bars belong to the position: all at sub 0, n at sub n), finalDigits (digits of the solution after the last known
// condition), focus ({ index, kind, j, modulus, residue (texts: the number, or its digit count above SHOW_DIGITS),
// modulusDigits, residueDigits, digitsSoFar, last } of sub n, null at sub 0), glued ({ x0, d0, digitsX, digitsD,
// sha256x, sha256d } at the last condition once x0 is known, else null), real (the real window is shown) }.
export function step6Data(view, sub) {
  if (!view || !view.xSteps || view.xSteps.length === 0) return null;
  const xs = view.xSteps;
  const n = Math.max(0, Math.min(xs.length, sub | 0));
  const steps = xs.map((s) => ({ index: s.index, kind: s.kind, j: s.j, modulusDigits: digits(s.modulus), digitsSoFar: s.digitsSoFar }));
  const s = n > 0 ? xs[n - 1] : null;
  const last = n === xs.length;
  const glued = last && view.glued
    ? { x0: view.glued.x0, d0: view.glued.d0, digitsX: view.glued.digitsX, digitsD: view.glued.digitsD, sha256x: view.glued.sha256x, sha256d: view.glued.sha256d }
    : null;
  return {
    total: xs.length,
    rows: xs.filter((x) => x.kind === "q1").length,
    steps,
    shown: n === 0 ? xs.length : n,
    finalDigits: xs[xs.length - 1].digitsSoFar,
    focus: s
      ? {
        index: s.index, kind: s.kind, j: s.j, modulus: numText(s.modulus), residue: numText(s.residue),
        modulusDigits: digits(s.modulus), residueDigits: digits(s.residue), digitsSoFar: s.digitsSoFar, last,
      }
      : null,
    glued,
    real: glued !== null,
  };
}

// ---------- the real window (shared with step 7 and the extras) ----------

let cached = null; // { x0, d0, src }

// realSource(x0, d0) is the Kronecker colour source around (x0, d0), the same object for the same numbers (so that
// stepping keeps its cache of computed cells).
export function realSource(x0, d0) {
  if (!cached || cached.x0 !== x0 || cached.d0 !== d0) cached = { x0, d0, src: kroneckerSource(x0, d0) };
  return cached.src;
}

// shownNumbers(view, result) is the (x0, d0) the canvas shows: { x0, d0, tampered } of a tampered result, else of
// the construction (null before x0 is known).
export function shownNumbers(view, result) {
  if (result && result.tampered) return { x0: result.x0, d0: result.d0, tampered: true };
  if (view && view.glued) return { x0: view.glued.x0, d0: view.glued.d0, tampered: false };
  return null;
}

// showReal(kit, view, extra) draws the real window: every cell soft, S at full strength with its outline, the cells
// of a tampered result that lost their colour marked as wrong (the filled mark), then the overlays of extra. Returns
// false when x0 is not known.
export function showReal(kit, view, extra = []) {
  const nums = shownNumbers(view, kit.result);
  if (!nums || !view.window) return false;
  kit.hex.setSource(realSource(nums.x0, nums.d0));
  const list = [fadeOutside([]), region(view.window.S)];
  if (nums.tampered && kit.result.verify) list.push(highlight(mismatchCells(kit.result.verify.rows)));
  kit.hex.setOverlays(list.concat(extra));
  kit.hex.fit(view.window.bounds);
  return true;
}

// render(panel, view, sub, kit) fills the text panel and sets the canvas.
export function render(panel, view, sub, kit) {
  const { h } = kit;
  useStyles(STYLES_URL);
  const d = step6Data(view, sub);
  if (!d) return false;
  panel.append(prose(h, kit.text("step6.what")));
  const f = d.focus;
  if (f) {
    const cond = f.kind === "small" ? "x = X (mod M_x)" : f.kind === "c" ? "x = R (mod c_j)" : `x = r${f.kind === "q1" ? 1 : 2} (mod ${f.kind})`;
    const box = h("div", {
      class: "lab-focus", id: "lab-step6-focus",
      dataset: { index: f.index, kind: f.kind, j: f.j === null ? "" : f.j, mdigits: f.modulusDigits, sofar: f.digitsSoFar },
    });
    box.append(
      h("p", { class: "lab-focus-head" }, `${f.index + 1} of ${d.total}: ${KINDS[f.kind]}${f.j === null ? "" : `, row ${f.j}`}`),
      h("p", { class: "lab-cond" }, cond),
      numsBlock(h, "lab-step6-nums", [
        ["modulus", f.kind === "small" ? "M_x" : f.kind === "c" ? "c_j" : f.kind, f.modulus],
        ["residue", f.kind === "small" ? "X" : f.kind === "c" ? "R" : f.kind === "q1" ? "r1" : "r2", f.residue],
        ["sofar", "$x$ so far, digits", f.digitsSoFar],
      ]),
    );
    panel.append(box);
  } else {
    const nums = numsBlock(h, "lab-step6-overview", [
      ["conditions", "conditions", `1 + 3 x ${d.rows} = ${d.total}`],
      ["digits", "$x$, digits", d.finalDigits],
    ]);
    Object.assign(nums.dataset, { total: d.total, digits: d.finalDigits });
    panel.append(nums);
  }
  const bars = h("div", { class: "lab-bars", id: "lab-step6-bars", role: "img", "aria-label": "Digits of x after each condition", dataset: { shown: d.shown, total: d.total } });
  const maxD = Math.max(1, ...d.steps.map((s) => s.digitsSoFar));
  d.steps.forEach((s, k) => {
    bars.append(
      h("span", {
        class: ["lab-bar", s.kind === "small" ? "lab-bar-small" : "lab-bar-row", k < d.shown ? null : "lab-bar-later", f && k === d.shown - 1 ? "lab-bar-now" : null],
        style: { height: `${Math.max(4, Math.round((100 * s.digitsSoFar) / maxD))}%` },
        title: `${KINDS[s.kind]}${s.j === null ? "" : ` row ${s.j}`}: ${s.digitsSoFar} digits`,
      }),
    );
  });
  panel.append(bars);
  // x0 and d0 at the last condition
  const fin = h("div", { class: "lab6-final", id: "lab-step6-final", dataset: { filled: String(!!d.glued) } });
  if (d.glued) {
    const xEl = h("div", { class: "lab-big", id: "lab-step6-x0" });
    const dEl = h("div", { class: "lab-big", id: "lab-step6-d0" });
    kit.bigNumber(xEl, d.glued.x0, { label: "$x$" });
    kit.bigNumber(dEl, d.glued.d0, { label: "$d$" });
    Object.assign(fin.dataset, { digitsX: d.glued.digitsX, digitsD: d.glued.digitsD, shaX: d.glued.sha256x.slice(0, 16), shaD: d.glued.sha256d.slice(0, 16) });
    fin.append(xEl, dEl); // the widget shows the short form with the digit count, the sha256 prefix in its tooltip
  }
  panel.append(fin);

  if (d.real && showReal(kit, view)) return;
  const forced = forcedUpTo(view, view.smallPrimes.length);
  kit.hex.setSource(sourceOfColours(windowColours(view, { withN: true, forced })));
  const strong = f && f.j !== null ? signCellsOf(view.rows.filter((r) => r.j === f.j)) : signCellsOf(view.rows);
  kit.hex.setOverlays([fadeOutside(strong), outline(view.window.S)]);
  kit.hex.fit(view.window.bounds);
}
