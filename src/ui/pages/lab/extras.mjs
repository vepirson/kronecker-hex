// Extras of the Algorithm page (the Lab) for the green and red construction:
//   the hover line  hovering a window cell shows in one fixed line over the canvas the four factors of its region
//                   type, u, q1, q2 and c, and their product, by cellFactors of the construction (nothing for a cell
//                   without factors)
//   Tamper          a button with a popover: pick a row and r1, r2 or R, add 1 (or type a value), the numbers are
//                   glued again by reglue and shown (the badge turns to FAIL, the page moves to the check, which marks
//                   the broken cells), Restore brings the true result back
// The toolbar and the popover (the site's popover helper) are shared with the blue extras (./toolbar.mjs).

import { cellFactors, reglue } from "../../../construct/inspect.mjs";
import { mismatchCells } from "./model.mjs";
import { mountToolbar } from "./toolbar.mjs";

// The content file with the texts of the extras (the same file as steps 5 to 7).
export const contentFiles = ["steps5_7.json"];

const sgn = (v) => (v > 0 ? "+1" : v < 0 ? "-1" : "0");

// The hover line of a cell without factors (outside the window, or in a row without sign cells): nothing.
export const NO_FACTORS = "";

// factorLine(f) is the text of the hover line for cellFactors output f: the region type of the cell as the product
// of its four factors, "+1 = u (+1) x q1 (-1) x q2 (-1) x c (+1)", NO_FACTORS for null.
export function factorLine(f) {
  if (!f) return NO_FACTORS;
  return `${sgn(f.product)} = u (${sgn(f.small)}) x q1 (${sgn(f.q1)}) x q2 (${sgn(f.q2)}) x c (${sgn(f.cof)})`;
}

// failText(n) is the message of a tamper that leaves n cells of the window with another region type.
export function failText(n) {
  return `FAIL: ${n} wrong ${n === 1 ? "cell" : "cells"}`;
}

// The state of the mounted extras, read by the browser checks through testHandles().
let live = null;

// testHandles() returns { open (the open popover: "tamper" or null), hover ({ i, j, text, product, symbol } of the
// last hovered cell or null), hasTrue (a true result is kept for Restore) }, or null when no extras are mounted.
export function testHandles() {
  return live ? live() : null;
}

// The hover line of the green and red toolbar: the factors of a cell's region type.
const FACTORS_HOVER = Object.freeze({
  none: Object.freeze({ product: null, symbol: null }),
  describe(r, [i, j]) {
    const f = cellFactors(r, i, j);
    return {
      text: factorLine(f),
      record: { product: f ? f.product : null, symbol: f ? f.symbol : null },
      data: { product: f ? String(f.product) : "", symbol: f ? String(f.symbol) : "" },
    };
  },
});

// mountExtras(toolbar, kit, { canvasBox }) fills the toolbar with the Tamper button (mountToolbar of ./toolbar.mjs)
// and returns unmount(). canvasBox: the box of the canvas (the hover line is drawn over its top left corner, so that
// it never moves the layout).
export function mountExtras(toolbar, kit, opts = {}) {
  const { h } = kit;
  let trueResult = null; // the true result of the run, kept for Restore
  const result = () => kit.result;

  function tamperContent() {
    const base = trueResult || result();
    const rowSel = h("select", { id: "lab-x-tamper-row", "aria-label": "Row" }, base.rows.map((r) => h("option", { value: String(r.j) }, `row ${r.j}`)));
    const fieldSel = h("select", { id: "lab-x-tamper-field", "aria-label": "Residue" }, ["r1", "r2", "R"].map((f) => h("option", { value: f }, f)));
    const value = h("input", { id: "lab-x-tamper-value", type: "text", inputmode: "numeric", size: "12", "aria-label": "Value" });
    const msg = h("p", { class: "lab-x-msg", id: "lab-x-tamper-msg", role: "status" });
    const curRow = () => (result() || base).rows.find((r) => String(r.j) === rowSel.value);
    const curVal = () => {
      const r = curRow();
      const f = fieldSel.value;
      return f === "R" ? r.rho.toString() : String(r[f]);
    };
    const sync = () => {
      value.value = curVal();
    };
    rowSel.addEventListener("change", sync);
    fieldSel.addEventListener("change", sync);
    const apply = (text) => {
      const r = curRow();
      const f = fieldSel.value;
      const t = String(text).trim();
      if (!/^[0-9]+$/.test(t)) {
        msg.textContent = "A residue is an integer >= 0.";
        return;
      }
      const edit = { j: r.j };
      if (f === "R") edit.rho = BigInt(t);
      else edit[f] = Number(t);
      let out;
      try {
        out = reglue(result() || base, [edit]);
      } catch (e) {
        msg.textContent = e && e.message ? e.message : String(e);
        return;
      }
      kit.setResult(out);
      // the check shows what the change did to the window
      kit.showCheck();
      sync();
      msg.textContent = out.pass ? "Region unchanged" : failText(mismatchCells(out.verify.rows).length);
      msg.dataset.pass = String(out.pass);
    };
    const plus = h("button", { type: "button", id: "lab-x-tamper-plus", title: "Add 1" }, "+1");
    plus.addEventListener("click", () => {
      const r = curRow();
      const f = fieldSel.value;
      if (f === "R") apply((r.rho + 1n).toString());
      else apply(String((r[f] + 1) % (f === "r1" ? r.q1 : r.q2)));
    });
    const set = h("button", { type: "button", id: "lab-x-tamper-set", title: "Use the typed value" }, "Set");
    set.addEventListener("click", () => apply(value.value));
    const restore = h("button", { type: "button", id: "lab-x-tamper-restore", title: "Back to the true numbers" }, "Restore");
    restore.addEventListener("click", () => {
      if (trueResult) kit.setResult(trueResult);
      sync();
      msg.textContent = "Restored";
      delete msg.dataset.pass;
    });
    const box = h(
      "div",
      null,
      h("div", { class: "lab-row" }, rowSel, fieldSel, value),
      h("div", { class: "lab-row" }, plus, set, restore),
      msg,
      h("div", { class: "lab-prose lab-small", html: kit.text("tamper.note") }),
    );
    sync();
    return box;
  }
  const tamper = { tool: "tamper", label: "Tamper", title: "Change a residue", content: tamperContent };

  const tb = mountToolbar(toolbar, kit, {
    canvasBox: opts.canvasBox || null, hover: FACTORS_HOVER, tools: [tamper],
    onResult: (r) => {
      if (!r) trueResult = null;
      else if (!r.tampered) trueResult = r;
    },
  });
  live = () => ({ ...tb.state(), hasTrue: !!trueResult });
  return () => {
    tb.unmount();
    live = null;
  };
}
