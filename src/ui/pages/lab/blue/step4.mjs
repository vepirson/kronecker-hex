// Step 4 of the blue Construction Lab: x0. The conditions on x join by the Chinese remainder theorem into X modulo
// M_x (the digits of the running solution as bars), then the candidates x0 = X + t M_x are scanned from the first one
// with x0 + i >= 1: a candidate is rejected when a neighbour (i, j) has gcd(x0 + i, d0 + j) > 1, the first one that
// passes every neighbour is x0. The items of the step are the conditions, then the candidates. From the accepted
// candidate on the canvas shows the real window around (x0, d0): every cell soft, the region at full strength.

import { fadeOutside, outline, highlight, hollowMarks } from "../../../../render/overlays.mjs";
import { numsBlock, digits } from "../model.mjs";
import { showReal } from "../step6.mjs";
import { windowSource, conditionCells, conditionText, xItemOf } from "./model.mjs";
import { bars } from "./step3.mjs";

// subCount(view): the conditions on x plus the candidates (0 before the first xCrtStep event).
export function subCount(view) {
  return view && view.xSteps ? view.xSteps.length + view.xCandidates.length : 0;
}

// blueStep4Data(view, sub) is the data shown at position sub, or null before the first condition: { conditions
// (count), candidates: [{ index (t, bigint), ok, bad ([i, j] or null), digits, state: "rejected" | "accepted" }],
// steps: [{ kind, digitsSoFar }], shownBars, base ({ X, Mx, start } once known, else null), item (xItemOf of sub),
// focus (the condition of sub: { index, kind, text, digitsSoFar, cells }, or null), candidate (the candidate of sub,
// or null), glued ({ x0, d0, xIndex, digitsX } once x0 is known and the position is sub 0 or the accepted
// candidate, else null), real (the real window is shown) }.
export function blueStep4Data(view, sub) {
  if (!view || !view.xSteps || view.xSteps.length === 0) return null;
  const xs = view.xSteps;
  const n = Math.max(0, Math.min(subCount(view), sub | 0));
  const item = xItemOf(view, n);
  const cands = view.xCandidates.map((c) => ({ index: c.index, ok: c.ok, bad: c.bad, digits: c.digits, state: c.ok ? "accepted" : "rejected" }));
  const s = item && item.kind === "condition" ? xs[item.index] : null;
  const cand = item && item.kind === "candidate" ? cands[item.index] : null;
  const atAccepted = !!(cand && cand.ok);
  const glued = view.glued && (n === 0 || atAccepted)
    ? { x0: view.glued.x0, d0: view.glued.d0, xIndex: view.glued.xIndex, digitsX: view.glued.digitsX }
    : null;
  return {
    conditions: xs.length,
    candidates: cands,
    steps: xs.map((x) => ({ kind: x.kind, digitsSoFar: x.digitsSoFar })),
    shownBars: s ? item.index + 1 : xs.length,
    base: view.xBase ? { X: view.xBase.X, Mx: view.xBase.Mx, start: view.xBase.index } : null,
    item,
    focus: s ? { index: s.index, kind: s.kind, text: conditionText("x", s), digitsSoFar: s.digitsSoFar, cells: conditionCells(view, s.index) } : null,
    candidate: cand,
    glued,
    real: atAccepted && !!view.glued,
  };
}

// render(panel, view, sub, kit) fills the text panel and sets the canvas.
export function render(panel, view, sub, kit) {
  const { h } = kit;
  const d = blueStep4Data(view, sub);
  if (!d) return false;
  panel.append(h("div", { class: "lab-prose", html: kit.text("blue.step4.what") }));
  const nums = numsBlock(h, "lab-blue4-numbers", [
    ["conditions", "conditions on x", d.conditions],
    d.base ? ["Mx", "$M_x$, digits", digits(d.base.Mx)] : null,
    d.base ? ["start", "first t", String(d.base.start)] : null,
    ["candidates", "candidates shown", d.candidates.length],
  ]);
  Object.assign(nums.dataset, { conditions: d.conditions, candidates: d.candidates.length });
  panel.append(nums);
  const f = d.focus;
  if (f) {
    panel.append(
      h(
        "div",
        { class: "lab-focus", id: "lab-blue4-focus", dataset: { index: f.index, kind: f.kind, sofar: f.digitsSoFar } },
        h("p", { class: "lab-focus-head" }, `${f.index + 1} of ${d.conditions}: ${f.kind === "class" ? "a class" : "its own prime"}`),
        h("p", { class: "lab-cond" }, f.text),
        numsBlock(h, "lab-blue4-focus-nums", [["sofar", "$x$ so far, digits", f.digitsSoFar]]),
      ),
    );
  }
  const c = d.candidate;
  if (c) {
    panel.append(
      h(
        "div",
        { class: "lab-focus", id: "lab-blue4-candidate", dataset: { t: String(c.index), state: c.state, bad: c.bad ? `${c.bad[0]},${c.bad[1]}` : "" } },
        h("p", { class: "lab-focus-head" }, `t = ${c.index}: ${c.ok ? "accepted" : `rejected at the neighbour (${c.bad[0]}, ${c.bad[1]})`}`),
        h("p", { class: "lab-cond" }, c.ok ? "$\\gcd(x+i,\\ d+j)=1$ on every neighbour" : `$\\gcd(x+${c.bad[0]},\\ d+${c.bad[1]})>1$`),
      ),
    );
  }
  panel.append(bars(h, "lab-blue4-bars", "digits of x after each condition", d.steps.map((s) => ({ kind: s.kind, value: s.digitsSoFar })), d.shownBars, f ? f.index : -1));
  if (d.candidates.length && (!f || c)) {
    const tr = (x) => h("tr", { dataset: { t: String(x.index), state: x.state }, class: c && x.index === c.index ? "lab-focus-row" : null },
      h("td", null, String(x.index)),
      h("td", null, String(x.digits)),
      h("td", null, x.ok ? "accepted" : `gcd > 1 at (${x.bad[0]}, ${x.bad[1]})`));
    panel.append(
      h(
        "table",
        { class: "lab-mini", id: "lab-blue4-candidates", dataset: { count: d.candidates.length } },
        h("thead", null, h("tr", null, ["t", "digits", ""].map((t) => h("th", null, t)))),
        h("tbody", null, d.candidates.map(tr)),
      ),
    );
  }
  if (d.glued) {
    const xEl = h("div", { class: "lab-big", id: "lab-blue4-x0" });
    kit.bigNumber(xEl, d.glued.x0, { label: "$x$" });
    panel.append(xEl);
  }

  if (d.real && showReal(kit, view)) return;
  kit.hex.setSource(windowSource(view));
  const overlays = [fadeOutside(view.window.S), outline(view.window.S)];
  if (f) overlays.push(hollowMarks(f.cells));
  // a rejected candidate: its bad neighbour is a wrong cell (the filled mark)
  if (c && c.bad) overlays.push(highlight([c.bad]));
  kit.hex.setOverlays(overlays);
  kit.hex.fit(view.window.bounds);
}
