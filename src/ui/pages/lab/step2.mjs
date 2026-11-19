// Step 2 of the Construction Lab: what is fixed so far. x modulo M_x (X_s, M_x), the number of cells forced blue,
// and the sign cells: per row the cells of the window that are not blue, with their target sign. sub n puts the
// n-th row with sign cells in focus. The rows without sign cells are named.

import { fadeOutside, outline } from "../../../render/overlays.mjs";
import { windowColours, sourceOfColours, forcedUpTo, signCellsOf, signWord, rowSubOf, numsBlock, targetLabels } from "./model.mjs";

// subCount(view): the number of rows with sign cells (0 before the xSmall event).
export function subCount(view) {
  return view && view.xSmall ? view.rows.length : 0;
}

// subOfRow(view, j): the sub that puts row j in focus (a click on the table).
export function subOfRow(view, j) {
  return rowSubOf(view, j);
}

// step2Data(view, sub) is the data shown at position sub, or null before the xSmall event: { Xs, Mx (bigint),
// forcedCount, kMax, rowCount (rows with sign cells), signCells (their total), emptyRows, focus ({ j, k, cells:
// [{ i, tau }] } of sub, or null at sub 0) }.
export function step2Data(view, sub) {
  if (!view || !view.xSmall) return null;
  const xs = view.xSmall;
  const rows = view.rows;
  const n = Math.max(0, Math.min(rows.length, sub | 0));
  const f = n > 0 ? rows[n - 1] : null;
  return {
    Xs: xs.Xs, Mx: xs.Mx, forcedCount: xs.forcedCount, kMax: xs.kMax,
    rowCount: rows.length, signCells: rows.reduce((a, r) => a + r.k, 0), emptyRows: xs.emptyRows.slice(),
    focus: f ? { j: f.j, k: f.k, cells: f.cells.map((c) => ({ i: c.i, tau: c.tau })) } : null,
  };
}

// render(panel, view, sub, kit) fills the text panel and sets the canvas: the sign cells in their target colour at
// full strength, the forced blue cells soft, the row in focus labelled with its target signs (targetLabels).
export function render(panel, view, sub, kit) {
  const { h } = kit;
  const d = step2Data(view, sub);
  if (!d) return false;
  const xsEl = h("div", { class: "lab-big", id: "lab-step2-xs" });
  const mxEl = h("div", { class: "lab-big", id: "lab-step2-mx" });
  kit.bigNumber(xsEl, d.Xs, { label: "$X$" });
  kit.bigNumber(mxEl, d.Mx, { label: "$M_x$" });
  panel.append(
    h("div", { class: "lab-prose", html: kit.text("step2.what") }),
    xsEl,
    mxEl,
    numsBlock(h, "lab-step2-numbers", [
      ["forced", "type 0", d.forcedCount],
      ["signCells", "type +1 or -1", d.signCells],
      ["rows", "rows", d.rowCount],
      ["empty", "rows without", d.emptyRows.length ? d.emptyRows.join(", ") : "none"],
      ["kMax", "largest $s$", d.kMax],
    ]),
  );
  if (d.focus) {
    const f = d.focus;
    panel.append(
      h(
        "div",
        { class: "lab-focus", id: "lab-step2-focus", dataset: { j: f.j, k: f.k } },
        h("p", { class: "lab-focus-head" }, `row j = ${f.j}, s = ${f.k}`),
        h("p", { class: "lab-signs mono", title: "Offset: wanted region type" }, f.cells.map((c) => `${c.i}:${signWord(c.tau)}`).join("  ")),
      ),
    );
  }

  const forced = forcedUpTo(view, view.smallPrimes.length);
  const sign = signCellsOf(view.rows);
  kit.hex.setSource(sourceOfColours(windowColours(view, { withN: true, forced })));
  const overlays = [fadeOutside(sign), outline(view.window.S)];
  if (d.focus) overlays.push(targetLabels(d.focus));
  kit.hex.setOverlays(overlays);
  kit.hex.fit(view.window.bounds);
}
