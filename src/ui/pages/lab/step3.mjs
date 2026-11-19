// Step 3 of the Construction Lab: the row primes and d. sub n puts the n-th row with sign cells in focus: its k,
// the bound L, the two primes q1 < q2 and the condition d = -j (mod q1 q2). The running CRT of all conditions on d
// (small primes first, then the rows) is shown by the digit counts of its modulus, and at the end D and M_d. The
// table's q1, q2 columns fill as sub advances.

import { fadeOutside, outline } from "../../../render/overlays.mjs";
import { windowColours, sourceOfColours, forcedUpTo, signCellsOf, digits, rowSubOf, numsBlock } from "./model.mjs";

// subCount(view): the number of rows with sign cells (0 before the xSmall event).
export function subCount(view) {
  return view && view.xSmall ? view.rows.length : 0;
}

// subOfRow(view, j): the sub that puts row j in focus.
export function subOfRow(view, j) {
  return rowSubOf(view, j);
}

// The label of the bound L from which the row primes are taken (the formula the construction uses).
export const L_LABEL = "$L=\\max\\{2^{\\lfloor (s+1)/2\\rfloor+3},B+1\\}$";

// step3Data(view, sub) is the data shown at position sub, or null before the xSmall event: { rows: [{ j, k, L, q1,
// q2 }], focus (the row of sub or null), focusModulus (q1 q2 as a bigint, or null), smallConditions (number
// of conditions on d from small primes), steps: [{ index, from: "small" | "row", p | j, modulusDigits, MdDigits }]
// (all CRT steps known so far), shownSteps (how many of them belong to the position: the small ones and one per row
// up to sub), MdDigits (digits of the running modulus after the shown steps, or null), final ({ D, Md } bigints at
// the last sub once every step is known, else null) }.
export function step3Data(view, sub) {
  if (!view || !view.xSmall) return null;
  const rows = view.rows.map((r) => ({ j: r.j, k: r.k, L: r.L, q1: r.q1, q2: r.q2 }));
  const n = Math.max(0, Math.min(rows.length, sub | 0));
  const focus = n > 0 ? rows[n - 1] : null;
  const smallConditions = view.smallPrimes.filter((s) => s.dRes !== null).length;
  const classPrimes = view.smallPrimes.filter((s) => s.dRes !== null);
  const steps = view.dSteps.map((s, k) => ({
    index: s.index,
    from: k < smallConditions ? "small" : "row",
    p: k < smallConditions ? classPrimes[k].p : null,
    j: k < smallConditions ? null : rows[k - smallConditions] ? rows[k - smallConditions].j : null,
    modulusDigits: digits(s.modulus),
    MdDigits: digits(s.Md),
  }));
  const shownSteps = Math.min(steps.length, smallConditions + n);
  const last = shownSteps > 0 ? view.dSteps[shownSteps - 1] : null;
  const complete = steps.length === smallConditions + rows.length && rows.length > 0;
  const fin = complete && n === rows.length ? view.dSteps[steps.length - 1] : null;
  return {
    rows, focus,
    focusModulus: focus && focus.q1 !== null ? BigInt(focus.q1) * BigInt(focus.q2) : null,
    smallConditions, steps, shownSteps,
    MdDigits: last ? digits(last.Md) : null,
    final: fin ? { D: fin.D, Md: fin.Md } : null,
  };
}

// render(panel, view, sub, kit) fills the text panel and sets the canvas (the row in focus at full strength).
export function render(panel, view, sub, kit) {
  const { h } = kit;
  const d = step3Data(view, sub);
  if (!d) return false;
  panel.append(h("div", { class: "lab-prose", html: kit.text("step3.what") }));
  const f = d.focus;
  if (f) {
    const known = f.q1 !== null;
    panel.append(
      h(
        "div",
        { class: "lab-focus", id: "lab-step3-focus", dataset: { j: f.j, k: f.k, l: f.L === null ? "" : f.L, q1: known ? f.q1 : "", q2: known ? f.q2 : "" } },
        h("p", { class: "lab-focus-head" }, `row j = ${f.j}, s = ${f.k} cells of type +1 or -1`),
        numsBlock(h, "lab-step3-focus-nums", [
          ["L", L_LABEL, f.L === null ? "." : f.L],
          ["q1", "q1", known ? f.q1 : "."],
          ["q2", "q2", known ? f.q2 : "."],
          known ? ["q1q2", "q1 q2", d.focusModulus] : null,
        ]),
        known ? h("p", { class: "lab-cond" }, `$d\\equiv ${f.j === 0 ? "0" : String(-f.j)} \\pmod{q_1 q_2}$`) : null,
      ),
    );
  }
  if (d.steps.length) {
    const bars = h("div", { class: "lab-bars", id: "lab-step3-bars", role: "img", "aria-label": "Digits of the modulus of d after each condition" });
    const maxD = Math.max(1, ...d.steps.map((s) => s.MdDigits));
    d.steps.forEach((s, k) => {
      const shown = k < d.shownSteps;
      bars.append(
        h("span", {
          class: ["lab-bar", s.from === "row" ? "lab-bar-row" : "lab-bar-small", shown ? null : "lab-bar-later", k === d.shownSteps - 1 ? "lab-bar-now" : null],
          style: { height: `${Math.max(4, Math.round((100 * s.MdDigits) / maxD))}%` },
          title: s.from === "small" ? `p = ${s.p}: modulus ${s.MdDigits} digits` : `row ${s.j}: modulus ${s.MdDigits} digits`,
        }),
      );
    });
    const crt = numsBlock(h, "lab-step3-crt", [
      ["conditions", "conditions on d", `${d.shownSteps} of ${d.steps.length}`],
      ["small", "from small primes", d.smallConditions],
      ["digits", "M_d, digits", d.MdDigits === null ? 0 : d.MdDigits],
    ]);
    Object.assign(crt.dataset, { shown: d.shownSteps, total: d.steps.length, digits: d.MdDigits === null ? "" : d.MdDigits });
    panel.append(crt, bars);
  }
  if (d.final) {
    const dEl = h("div", { class: "lab-big", id: "lab-step3-D" });
    const mEl = h("div", { class: "lab-big", id: "lab-step3-Md" });
    kit.bigNumber(dEl, d.final.D, { label: "$D$" });
    kit.bigNumber(mEl, d.final.Md, { label: "$M_d$" });
    panel.append(dEl, mEl);
  }

  const forced = forcedUpTo(view, view.smallPrimes.length);
  kit.hex.setSource(sourceOfColours(windowColours(view, { withN: true, forced })));
  const strong = f ? signCellsOf(view.rows.filter((r) => r.j === f.j)) : signCellsOf(view.rows);
  kit.hex.setOverlays([fadeOutside(strong), outline(view.window.S)]);
  kit.hex.fit(view.window.bounds);
}
