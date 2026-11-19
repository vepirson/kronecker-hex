// Step 3 of the blue Construction Lab: d0. The conditions on d (the classes first, then the private primes) join one
// by one by the Chinese remainder theorem into D modulo M_d, and d0 = D + t0 M_d is the first value with d0 + j >= 1
// on every row of the window. No candidate is tested: every value of the progression would do. sub n puts the n-th
// condition in focus, the bars show the digits of the running modulus.

import { fadeOutside, outline, hollowMarks } from "../../../../render/overlays.mjs";
import { numsBlock, digits } from "../model.mjs";
import { windowSource, conditionCells, conditionText } from "./model.mjs";

// subCount(view): the number of conditions on d (0 before the first dCrtStep event).
export function subCount(view) {
  return view && view.dSteps ? view.dSteps.length : 0;
}

// blueStep3Data(view, sub) is the data shown at position sub, or null before the first condition: { total, classes
// (conditions from classes), steps: [{ index, kind, MdDigits }], shown (bars of the position: all at sub 0, n at
// sub n), focus ({ index, kind, text, modulus, MdDigits, cells } of sub n, null at sub 0), chosen ({ d0, index,
// digits, D, Md } once d0 is known and the position is sub 0 or the last sub, else null) }.
export function blueStep3Data(view, sub) {
  if (!view || !view.dSteps || view.dSteps.length === 0) return null;
  const ds = view.dSteps;
  const n = Math.max(0, Math.min(ds.length, sub | 0));
  const s = n > 0 ? ds[n - 1] : null;
  const last = ds[ds.length - 1];
  const showChosen = view.dChosen && (n === 0 || n === ds.length);
  return {
    total: ds.length,
    classes: ds.filter((x) => x.kind === "class").length,
    steps: ds.map((x) => ({ index: x.index, kind: x.kind, MdDigits: digits(x.Md) })),
    shown: n === 0 ? ds.length : n,
    focus: s ? { index: s.index, kind: s.kind, text: conditionText("d", s), modulus: s.modulus, MdDigits: digits(s.Md), cells: conditionCells(view, s.index) } : null,
    chosen: showChosen ? { d0: view.dChosen.d0, index: view.dChosen.index, digits: view.dChosen.digitsD, D: last.D, Md: last.Md } : null,
  };
}

// bars(h, id, label, list, shown, focus) is the bar chart of digit counts: list [{ kind, value }], the first shown
// bars in full, the bar of focus (an index or -1) marked.
export function bars(h, id, label, list, shown, focus) {
  const box = h("div", { class: "lab-bars", id, role: "img", "aria-label": label, dataset: { shown, total: list.length } });
  const maxD = Math.max(1, ...list.map((s) => s.value));
  list.forEach((s, k) => {
    box.append(
      h("span", {
        class: ["lab-bar", s.kind === "private" ? "lab-bar-row" : "lab-bar-small", k < shown ? null : "lab-bar-later", k === focus ? "lab-bar-now" : null],
        style: { height: `${Math.max(4, Math.round((100 * s.value) / maxD))}%` },
        title: `${s.kind === "private" ? "own prime" : s.kind} ${k + 1}: ${s.value} digits`,
      }),
    );
  });
  return box;
}

// render(panel, view, sub, kit) fills the text panel and sets the canvas (S blue, the cells of the condition in focus
// marked).
export function render(panel, view, sub, kit) {
  const { h } = kit;
  const d = blueStep3Data(view, sub);
  if (!d) return false;
  panel.append(h("div", { class: "lab-prose", html: kit.text("blue.step3.what") }));
  const nums = numsBlock(h, "lab-blue3-numbers", [
    ["conditions", "conditions on d", `${d.shown} of ${d.total}`],
    ["classes", "from classes", d.classes],
    ["private", "from own primes", d.total - d.classes],
  ]);
  Object.assign(nums.dataset, { shown: d.shown, total: d.total });
  panel.append(nums);
  const f = d.focus;
  if (f) {
    panel.append(
      h(
        "div",
        { class: "lab-focus", id: "lab-blue3-focus", dataset: { index: f.index, kind: f.kind, mdigits: f.MdDigits } },
        h("p", { class: "lab-focus-head" }, `${f.index + 1} of ${d.total}: ${f.kind === "class" ? `class of p = ${f.modulus}` : `own prime ${f.modulus}`}`),
        h("p", { class: "lab-cond" }, f.text),
        numsBlock(h, "lab-blue3-focus-nums", [["MdDigits", "$M_d$ so far, digits", f.MdDigits]]),
      ),
    );
  }
  panel.append(bars(h, "lab-blue3-bars", "digits of the modulus of d after each condition", d.steps.map((s) => ({ kind: s.kind, value: s.MdDigits })), d.shown, f ? f.index : -1));
  if (d.chosen) {
    const dEl = h("div", { class: "lab-big", id: "lab-blue3-D" });
    const mEl = h("div", { class: "lab-big", id: "lab-blue3-Md" });
    const d0El = h("div", { class: "lab-big", id: "lab-blue3-d0" });
    kit.bigNumber(dEl, d.chosen.D, { label: "$D$" });
    kit.bigNumber(mEl, d.chosen.Md, { label: "$M_d$" });
    kit.bigNumber(d0El, d.chosen.d0, { label: "$d$" });
    panel.append(dEl, mEl, numsBlock(h, "lab-blue3-chosen", [["t0", "$t$", String(d.chosen.index)]]), d0El);
  }

  kit.hex.setSource(windowSource(view));
  const overlays = [fadeOutside(view.window.S), outline(view.window.S)];
  if (f) overlays.push(hollowMarks(f.cells));
  kit.hex.setOverlays(overlays);
  kit.hex.fit(view.window.bounds);
}
