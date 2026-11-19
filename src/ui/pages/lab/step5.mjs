// Step 5 of the Construction Lab: the row solve. sub 0 is the overview (rows solved, the largest k, the rows that
// needed a second R), sub n puts the n-th row with sign cells in focus: over its sign cells (one column per cell, in
// the order of i) the target region types, the same times the known factors (the wanted strip, its label read after
// the target's), the signs of r1 modulo q1, the signs of r2 modulo q2 and their product, which equals the wanted
// strip. The two sign strips are computed here, one Legendre symbol per cell, never as a whole table. The canvas writes
// the targets on the row's cells, as every step does (targetLabels). The table's r1, r2 columns fill as sub advances.
// The residues R tried are shown only when they are those of the result (searchKnown of ./search.mjs).

import { fadeOutside, outline } from "../../../render/overlays.mjs";
import { jacobiNumber } from "../../../core/kronecker.mjs";
import { useStyles } from "../../dom.mjs";
import { renderMathIn } from "../../widgets/math.mjs";
import { windowColours, sourceOfColours, forcedUpTo, signCellsOf, signWord, rowSubOf, numsBlock, targetLabels } from "./model.mjs";
import { searchKnown } from "./search.mjs";

// The labels of the target strip and of the wanted strip under it (the target times the known factors): what the two
// row-prime strips must multiply to.
export const TARGET_LABEL = "wanted";
export const WANT_LABEL = "x known factors";

// The content file with the texts of steps 5 to 7 and of the extras (loaded by the page because it is named here).
export const contentFiles = ["steps5_7.json"];

// The stylesheet of steps 5 to 7 and of the extras.
export const STYLES_URL = new URL("../../../../styles/lab_steps5_7.css", import.meta.url);

// Above this many sign cells a strip shows colours only (no sign characters), so that it fits its column.
export const STRIP_TEXT_MAX = 20;

const mod = (a, m) => ((a % m) + m) % m;

// subCount(view): the number of rows with sign cells (0 before the xSmall event).
export function subCount(view) {
  return view && view.xSmall ? view.rows.length : 0;
}

// subOfRow(view, j): the sub that puts row j in focus.
export function subOfRow(view, j) {
  return rowSubOf(view, j);
}

// legendreStrip(r, q, offs) is the list of the symbols ((r + i) | q) for the offsets i (q an odd prime, Numbers).
export function legendreStrip(r, q, offs) {
  return offs.map((i) => jacobiNumber(mod(r + i, q), q));
}

// pairsMean(q1, q2, k) = (q1 - k)(q2 - k) / 2^k: the pairs (r1, r2) with r1 + i and r2 + i prime to q1, q2 at the
// k sign cells, averaged over the 2^k sign vectors. pairsText(mean) is its label value, one decimal.
export function pairsMean(q1, q2, k) {
  return ((q1 - k) * (q2 - k)) / 2 ** k;
}
export function pairsText(mean) {
  return mean === null ? "." : mean.toFixed(1);
}

// pairsEntry(focus) is the line [key, label, value] of the numbers block for the row in focus.
export function pairsEntry(focus) {
  return ["pairs", "mean pairs per vector", pairsText(focus.pairsFit)];
}

// step5Data(view, sub, result) is the data shown at position sub, or null before the xSmall event:
// { rowCount, solved, kMax, retriedRows (null while the tries are not known, searchKnown), focus }. focus (null at
// sub 0) is the row of sub: { j, k, q1, q2, r1, r2, R, attempts: [{ R, found }] (null while not known), offs (the i of
// the sign cells), target (the region types tau of its cells), want, s1, s2, product (lists of -1 / 1, null while not
// known), match (product = want on every cell, null while not known), mismatches, pairsFit ((q1 - k)(q2 - k) / 2^k,
// the average over the 2^k sign vectors of the number of pairs (r1, r2) with that vector), tampered (r1 or r2 taken
// from a tampered result) }. With a tampered result (result.tampered) the strips use its r1, r2.
export function step5Data(view, sub, result = null) {
  if (!view || !view.xSmall) return null;
  const rows = view.rows;
  const solvedRows = rows.filter((r) => r.r1 !== null);
  const known = searchKnown(view);
  const n = Math.max(0, Math.min(rows.length, sub | 0));
  const r = n > 0 ? rows[n - 1] : null;
  let focus = null;
  if (r) {
    const offs = r.cells.map((c) => c.i);
    const t = result && result.tampered && Array.isArray(result.rows) ? result.rows.find((x) => x.j === r.j) : null;
    const r1 = t ? t.r1 : r.r1;
    const r2 = t ? t.r2 : r.r2;
    const want = r.target ? r.target.map((c) => c.want) : null;
    const s1 = r1 !== null && r.q1 !== null ? legendreStrip(r1, r.q1, offs) : null;
    const s2 = r2 !== null && r.q2 !== null ? legendreStrip(r2, r.q2, offs) : null;
    const product = s1 && s2 ? s1.map((a, k) => a * s2[k] || 0) : null;
    const mismatches = product && want ? product.reduce((a, p, k) => a + (p !== want[k] ? 1 : 0), 0) : null;
    focus = {
      j: r.j, k: r.k, q1: r.q1, q2: r.q2, r1, r2, R: r.R,
      attempts: known ? r.attempts.map((a) => ({ R: a.R, found: a.found })) : null,
      offs, target: r.cells.map((c) => c.tau), want, s1, s2, product, match: mismatches === null ? null : mismatches === 0, mismatches,
      pairsFit: r.q1 !== null && r.q2 !== null ? pairsMean(r.q1, r.q2, r.k) : null,
      tampered: !!t && (t.r1 !== r.r1 || t.r2 !== r.r2),
    };
  }
  return {
    rowCount: rows.length,
    solved: solvedRows.length,
    kMax: rows.reduce((a, x) => Math.max(a, x.k), 0),
    retriedRows: known ? rows.filter((x) => x.attempts.length > 1).length : null,
    focus,
  };
}

// triedText(attempts) is the value of the line "R tried": the residues R in the order tried, a failed one marked.
export function triedText(attempts) {
  return attempts.map((a) => `${a.R}${a.found === false ? " (no pair)" : ""}`).join(", ");
}

// signStrip(h, lines, opts) is a block of aligned strips of small squares: lines [{ key, label, values (-1, 0, 1 or
// null per column), bad (optional list of booleans: a marked square) }], one column per cell. opts.text: write the
// sign characters in the squares. Each strip carries data-key and data-signs (the signs as "+", "-", "0", ".").
export function signStrip(h, lines, { id, text = true, titles = null } = {}) {
  const cols = lines.reduce((a, l) => Math.max(a, l.values ? l.values.length : 0), 0);
  const box = h("div", { class: ["lab5-strips", text ? null : "lab5-strips-plain"], id, style: { "--cols": String(Math.max(1, cols)) } });
  for (const l of lines) {
    const vals = l.values || new Array(cols).fill(null);
    const word = vals.map((v) => (v === null ? "." : signWord(v))).join("");
    box.append(h("span", { class: "lab5-strip-label" }, l.label));
    const strip = h("span", { class: "lab5-strip", dataset: { key: l.key, signs: word } });
    vals.forEach((v, k) => {
      const cls = ["lab5-sq", v === null ? "lab5-none" : v > 0 ? "lab5-plus" : v < 0 ? "lab5-minus" : "lab5-zero", l.bad && l.bad[k] ? "lab5-bad" : null];
      strip.append(h("span", { class: cls, title: titles ? titles[k] : null }, text && v !== null ? signWord(v) : ""));
    });
    box.append(strip);
  }
  return box;
}

// prose(h, html) is a text block whose $...$ formulas are typeset.
export function prose(h, html) {
  const el = h("div", { class: "lab-prose", html });
  if (html) renderMathIn(el);
  return el;
}

// render(panel, view, sub, kit) fills the text panel and sets the canvas (the row in focus at full strength).
export function render(panel, view, sub, kit) {
  const { h } = kit;
  useStyles(STYLES_URL);
  const d = step5Data(view, sub, kit.result);
  if (!d) return false;
  panel.append(prose(h, kit.text("step5.what")));
  const f = d.focus;
  if (!f) {
    const nums = numsBlock(h, "lab-step5-overview", [
      ["solved", "rows solved", `${d.solved} of ${d.rowCount}`],
      ["kMax", "largest $s$", d.kMax],
      d.retriedRows ? ["retried", "rows with a second R", d.retriedRows] : null,
    ]);
    Object.assign(nums.dataset, { solved: d.solved, rows: d.rowCount, kmax: d.kMax });
    panel.append(nums);
  } else {
    const box = h("div", {
      class: "lab-focus", id: "lab-step5-focus",
      dataset: { j: f.j, k: f.k, r1: f.r1 ?? "", r2: f.r2 ?? "", q1: f.q1 ?? "", q2: f.q2 ?? "", r: f.R === null ? "" : String(f.R), match: f.match === null ? "" : String(f.match) },
    });
    box.append(h("p", { class: "lab-focus-head" }, `row j = ${f.j}, s = ${f.k}`));
    const titles = f.offs.map((i) => `i = ${i}`);
    const bad = f.product && f.want ? f.product.map((p, k) => p !== f.want[k]) : null;
    box.append(
      signStrip(h, [
        { key: "target", label: TARGET_LABEL, values: f.target },
        { key: "want", label: WANT_LABEL, values: f.want },
        { key: "s1", label: "r1 mod q1", values: f.s1 },
        { key: "s2", label: "r2 mod q2", values: f.s2 },
        { key: "product", label: "product", values: f.product, bad },
      ], { id: "lab-step5-strips", text: f.k <= STRIP_TEXT_MAX, titles }),
    );
    box.append(
      numsBlock(h, "lab-step5-nums", [
        ["q1", "q1", f.q1],
        ["q2", "q2", f.q2],
        ["r1", "r1", f.r1 ?? "."],
        ["r2", "r2", f.r2 ?? "."],
        ["R", "R", f.R === null ? "." : String(f.R)],
        pairsEntry(f),
        f.attempts && f.attempts.length > 1 ? ["attempts", "R tried", triedText(f.attempts)] : null,
        f.match === false ? ["mismatch", "differs on", `${f.mismatches} of ${f.k} cells`] : null,
      ]),
    );
    panel.append(box);
  }

  const forced = forcedUpTo(view, view.smallPrimes.length);
  kit.hex.setSource(sourceOfColours(windowColours(view, { withN: true, forced })));
  const focusRow = f ? view.rows.filter((r) => r.j === f.j) : view.rows;
  const overlays = [fadeOutside(signCellsOf(focusRow)), outline(view.window.S)];
  if (f) overlays.push(targetLabels(focusRow[0]));
  kit.hex.setOverlays(overlays);
  kit.hex.fit(view.window.bounds);
}
