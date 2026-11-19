// Step 4 of the Construction Lab: d and the cofactors. sub 0 lists the candidates d = D + t M_d (each rejected one
// with its reason and row, once the tries of the result are known: searchKnown of ./search.mjs) and the accepted d0.
// sub n puts the n-th row with sign cells in focus: d0 + j = u q1 q2 c with its four factors (digit counts for c) and
// the residue R chosen modulo the cofactor c (the residues R tried are shown by the next step, which tries them). The
// table's R column fills as sub advances.

import { fadeOutside, outline } from "../../../render/overlays.mjs";
import { windowColours, sourceOfColours, forcedUpTo, signCellsOf, digits, rowSubOf, numsBlock } from "./model.mjs";
import { searchKnown } from "./search.mjs";

// subCount(view): the number of rows with sign cells (0 before the xSmall event).
export function subCount(view) {
  return view && view.xSmall ? view.rows.length : 0;
}

// subOfRow(view, j): the sub that puts row j in focus.
export function subOfRow(view, j) {
  return rowSubOf(view, j);
}

// Short words for the reasons of a rejected candidate.
export const REASONS = Object.freeze({ square: "square", row: "no match in step 3" });

// step4Data(view, sub) is the data shown at position sub, or null before the first candidate: { D, Md (bigint, of
// the last CRT step), candidates: [{ index (bigint t), d0Digits, rejected: { reason, j } | null, state: "rejected" |
// "accepted" | "testing" }], accepted ({ index, d0 } of the accepted candidate, or null while none is), focus
// (the row of sub: { j, k, n, u, q1, q2, c, nDigits, uDigits, cDigits, productOk, R, attempts: [{ R, found }],
// retried }, or null at sub 0) }. productOk is u q1 q2 c = n, computed here.
export function step4Data(view, sub) {
  if (!view || !view.xSmall || !view.candidates.length) return null;
  const lastD = view.dSteps.length ? view.dSteps[view.dSteps.length - 1] : null;
  const gluedIndex = view.glued ? view.glued.dIndex : null;
  const cands = view.candidates.map((c, k) => {
    const last = k === view.candidates.length - 1;
    const state = c.rejected ? "rejected" : gluedIndex !== null && c.index === gluedIndex ? "accepted" : last ? "testing" : "rejected";
    return { index: c.index, d0Digits: digits(c.d0), rejected: c.rejected, state };
  });
  const acc = view.candidates.find((c, k) => cands[k].state === "accepted") || null;
  const n = Math.max(0, Math.min(view.rows.length, sub | 0));
  const r = n > 0 ? view.rows[n - 1] : null;
  let focus = null;
  if (r) {
    const known = r.n !== null && r.u !== null && r.c !== null;
    focus = {
      j: r.j, k: r.k, n: r.n, u: r.u, q1: r.q1, q2: r.q2, c: r.c,
      nDigits: digits(r.n), uDigits: digits(r.u), cDigits: digits(r.c),
      productOk: known ? r.u * BigInt(r.q1) * BigInt(r.q2) * r.c === r.n : null,
      R: r.R, attempts: r.attempts.map((a) => ({ R: a.R, found: a.found })), retried: r.attempts.length > 1,
    };
  }
  return {
    D: lastD ? lastD.D : null, Md: lastD ? lastD.Md : null,
    candidates: cands, accepted: acc ? { index: acc.index, d0: acc.d0 } : null, focus,
  };
}

// render(panel, view, sub, kit) fills the text panel and sets the canvas (the row in focus at full strength).
export function render(panel, view, sub, kit) {
  const { h } = kit;
  const d = step4Data(view, sub);
  if (!d) return false;
  panel.append(h("div", { class: "lab-prose", html: kit.text("step4.what") }));
  const tr = (c) =>
    h(
      "tr",
      { dataset: { t: String(c.index), state: c.state } },
      h("td", null, String(c.index)),
      h("td", null, String(c.d0Digits)),
      h("td", null, c.rejected ? `${REASONS[c.rejected.reason] || c.rejected.reason}, row ${c.rejected.j}` : c.state === "accepted" ? "accepted" : "testing"),
    );
  // the candidates tried, once they are those of the result (a replay tries none: searchKnown)
  if (searchKnown(view)) {
    panel.append(
      h(
        "table",
        { class: "lab-mini", id: "lab-step4-candidates", dataset: { count: d.candidates.length } },
        h("thead", null, h("tr", null, ["t", "digits", ""].map((t) => h("th", null, t)))),
        h("tbody", null, d.candidates.map(tr)),
      ),
    );
  }
  if (d.accepted) {
    const el = h("div", { class: "lab-big", id: "lab-step4-d0" });
    kit.bigNumber(el, d.accepted.d0, { label: "$d$" });
    panel.append(el);
  }
  const f = d.focus;
  if (f) {
    const box = h("div", { class: "lab-focus", id: "lab-step4-focus", dataset: { j: f.j, ndigits: f.nDigits ?? "", cdigits: f.cDigits ?? "", r: f.R === null ? "" : String(f.R), attempts: f.attempts.length } });
    const lhs = f.j === 0 ? "d" : f.j < 0 ? `d-${-f.j}` : `d+${f.j}`;
    box.append(h("p", { class: "lab-focus-head" }, `row j = ${f.j}: `, `$${lhs}=u_jq_1q_2c_j$`));
    if (f.n !== null) {
      box.append(
        numsBlock(h, "lab-step4-factors", [
          ["n", "$d+j$, digits", f.nDigits],
          ["u", "$u_j$", f.uDigits <= 24 ? String(f.u) : `${f.uDigits} digits`],
          ["q1", "q1", f.q1],
          ["q2", "q2", f.q2],
          ["c", "$c_j$, digits", f.cDigits],
          ["product", "$u_jq_1q_2c_j=d+j$", f.productOk ? "checked" : "NO"],
          ["R", "R", f.R === null ? "." : String(f.R)],
        ]),
      );
    }
    panel.append(box);
  }

  const forced = forcedUpTo(view, view.smallPrimes.length);
  kit.hex.setSource(sourceOfColours(windowColours(view, { withN: true, forced })));
  const strong = f ? signCellsOf(view.rows.filter((r) => r.j === f.j)) : [];
  kit.hex.setOverlays([fadeOutside(strong), outline(view.window.S)]);
  kit.hex.fit(view.window.bounds);
}
