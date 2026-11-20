// Step 7 of the Construction Lab: the verification, independent of how x0 and d0 were found. sub 0 is the overview,
// sub n the n-th row of the window: every cell's wanted colour against the colour computed from x0 and d0 (two
// strips of small squares, a mismatch marked) and the rows passed so far. At the end the region check: the flood
// fill from the seed is complete and equals the shape, the area, the genus by the Euler characteristic and by
// counting holes, the colour. The canvas shows the real window with the verified rows outlined (verifiedOutline). A
// tampered result (the tamper tool of the extras) is shown with its own verification.

import { accentOutline, ACCENT_COLOUR_VAR } from "../../../render/overlays.mjs";
import { useStyles } from "../../dom.mjs";
import { numsBlock, cellFails, typeText } from "./model.mjs";
import { STYLES_URL, prose, signStrip, STRIP_TEXT_MAX } from "./step5.mjs";
import { showReal } from "./step6.mjs";

// The CSS variable of the accent colour (the timeline's progress, the step shown) that the verified rows are
// outlined in.
export const VERIFIED_COLOUR_VAR = ACCENT_COLOUR_VAR;

// verifiedOutline(cells) is the overlay of the rows checked so far: accentOutline of src/render/overlays.mjs (their
// boundary drawn as outline() draws the boundary of a selected region, in the accent colour over a halo in the theme's
// outline colour: line or halo at 3 to 1 on every fill, full and soft, a Node test), id "verified", layer 45.
export function verifiedOutline(cells) {
  return accentOutline(cells, { id: "verified", layer: 45 });
}

// subCount(view): the number of rows of the window (0 before the first verifyRow event).
export function subCount(view) {
  return view && Array.isArray(view.verifyRows) ? view.verifyRows.length : 0;
}

// subOfRow(view, j): the sub of row j of the window.
export function subOfRow(view, j) {
  if (!view || !view.verifyRows) return null;
  const k = view.verifyRows.findIndex((r) => r.j === j);
  return k < 0 ? null : k + 1;
}

// focusRow(view, sub): the row of sub (null at sub 0).
export function focusRow(view, sub) {
  const r = view && view.verifyRows && sub > 0 ? view.verifyRows[sub - 1] : null;
  return r ? r.j : null;
}

// step7Data(view, sub, result) is the data shown at position sub, or null before the first verifyRow event:
// { total (rows of the window), cells, mismatches (over all rows), rowsOk, verified (rows checked up to the
// position: all at sub 0), passedSoFar, focus ({ j, want (null for a wanted "nonzero"), got (colour lists), bad
// (booleans), mismatches, ok } of sub n, null at sub 0), region (the region check, shown at sub 0 and at the last
// row, else null), pass (true, false, or null while unknown), tampered }. With a tampered result its own
// verification is used.
export function step7Data(view, sub, result = null) {
  if (!view || !view.verifyRows || view.verifyRows.length === 0) return null;
  const tampered = !!(result && result.tampered && result.verify);
  const rows = tampered ? result.verify.rows : view.verifyRows;
  const reg = tampered ? result.verify.region : view.verifyRegion;
  const pass = tampered ? result.pass : view.done ? view.done.pass : null;
  const n = Math.max(0, Math.min(rows.length, sub | 0));
  const verified = n === 0 ? rows.length : n;
  const badOf = (r) => r.cells.filter(cellFails).length;
  const r = n > 0 ? rows[n - 1] : null;
  return {
    total: rows.length,
    cells: rows.reduce((a, x) => a + x.cells.length, 0),
    mismatches: rows.reduce((a, x) => a + badOf(x), 0),
    rowsOk: rows.filter((x) => x.ok).length,
    verified,
    passedSoFar: rows.slice(0, verified).filter((x) => x.ok).length,
    focus: r
      ? { j: r.j, offs: r.cells.map((c) => c.i), want: r.cells.map((c) => (c.want === "nonzero" ? null : c.want)), got: r.cells.map((c) => c.got), bad: r.cells.map(cellFails), mismatches: badOf(r), ok: r.ok }
      : null,
    region: (n === 0 || n === rows.length) && reg ? { ...reg } : null,
    pass,
    tampered,
  };
}

const yes = (b) => (b === true ? "yes" : b === false ? "NO" : ".");

// render(panel, view, sub, kit) fills the text panel and sets the canvas (false before the first verifyRow event).
export function render(panel, view, sub, kit) {
  return renderCheck(panel, view, sub, kit, { what: kit.text("step7.what") });
}

// renderCheck(panel, view, sub, kit, { what }) is the verification panel of any kind of construction (its
// verifyRow and verifyRegion events) under the frame's heading: the text (HTML), the counts, the row of sub with
// its wanted and computed colours, the region check, and the real window with the verified rows outlined. Returns
// false when there is nothing to show yet.
export function renderCheck(panel, view, sub, kit, { what }) {
  const { h } = kit;
  useStyles(STYLES_URL);
  const d = step7Data(view, sub, kit.result);
  if (!d) return false;
  panel.append(prose(h, what));
  const counts = numsBlock(h, "lab-step7-counts", [
    ["rows", "rows passed", `${d.passedSoFar} of ${d.verified}${d.verified < d.total ? ` (${d.total} in all)` : ""}`],
    d.focus ? null : ["cells", "cells", d.cells],
    d.focus ? null : ["mismatches", "wrong", d.mismatches],
    d.tampered ? ["tampered", "numbers", "tampered"] : null,
  ]);
  Object.assign(counts.dataset, { passed: d.passedSoFar, verified: d.verified, total: d.total, mismatches: d.mismatches });
  panel.append(counts);
  const f = d.focus;
  if (f) {
    const box = h("div", { class: "lab-focus", id: "lab-step7-focus", dataset: { j: f.j, ok: String(f.ok), mismatches: f.mismatches } });
    box.append(
      h("p", { class: "lab-focus-head" }, `row j = ${f.j}: ${f.offs.length} cells, ${f.ok ? "all right" : `${f.mismatches} wrong`}`),
      signStrip(h, [
        { key: "want", label: "wanted", values: f.want },
        { key: "got", label: "computed", values: f.got, bad: f.bad },
      ], { id: "lab-step7-strips", text: f.offs.length <= STRIP_TEXT_MAX, titles: f.offs.map((i) => `i = ${i}`) }),
    );
    panel.append(box);
  }
  if (d.region) {
    const g = d.region;
    const reg = numsBlock(h, "lab-step7-region", [
      ["complete", "region complete", yes(g.complete)],
      ["equals", "equals $S$", yes(g.equalsShape)],
      ["area", "area", g.area],
      ["genus", "genus (Euler)", g.genus === null ? "." : g.genus],
      ["holes", "holes", g.holes === null ? "." : g.holes],
      ["colour", "region type", typeText(g.colour)],
      ["pass", "result", d.pass === null ? "." : d.pass ? "PASS" : "FAIL"],
    ]);
    Object.assign(reg.dataset, { area: g.area, genus: g.genus ?? "", holes: g.holes ?? "", pass: String(d.pass) });
    panel.append(reg);
  }

  // the real window, the rows verified so far outlined in the accent colour (verifiedOutline)
  const rows = d.tampered ? kit.result.verify.rows : view.verifyRows;
  const band = [];
  for (const r of rows.slice(0, d.verified)) for (const c of r.cells) band.push([c.i, r.j]);
  const extra = band.length ? [verifiedOutline(band)] : [];
  if (!showReal(kit, view, extra)) kit.hex.clear();
  return true;
}
