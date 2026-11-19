// Step 1 of the Construction Lab: the small primes p <= B. sub n puts the n-th prime in focus: its kind, for kind
// "class" the class (a, b) with its cells of the window turning blue and the two conditions x = -a, d = -b (mod p),
// for kind "column" the residue that no column of the window has and the one condition on x. A small table lists
// the primes so far. sub 0 is the overview.

import { fadeOutside, outline, modGrid } from "../../../render/overlays.mjs";
import { windowColours, sourceOfColours, forcedUpTo, numsBlock } from "./model.mjs";

// Largest p for which the columns of a "column" prime are marked on the canvas (one dot pattern per class).
const COLUMN_MARK_LIMIT = 61;

// subCount(view): the number of small primes.
export function subCount(view) {
  return view && view.smallPrimes ? view.smallPrimes.length : 0;
}

const primeRow = (s) => ({
  p: s.p, kind: s.kind, a: s.a, b: s.b, xRes: s.xRes, xMod: s.xMod, dRes: s.dRes, forcedCount: s.forced.length,
  classCells: s.classCells,
});

// step1Data(view, sub) is the data shown at position sub, or null before the window event: { B, primes (all, as
// table rows { p, kind, a, b, xRes, xMod, dRes, forcedCount, classCells }), classCount, columnCount, shown (the
// primes so far: the first sub), focus (the prime of sub, or null at sub 0), focusForced (its forced cells),
// forcedSoFar (distinct cells forced by the primes so far), forcedTotal (by all primes), error (an inadmissible
// error event, or null) }.
export function step1Data(view, sub) {
  if (!view || !view.window) return null;
  const all = view.smallPrimes.map(primeRow);
  const n = Math.max(0, Math.min(all.length, sub | 0));
  const focusEv = n > 0 ? view.smallPrimes[n - 1] : null;
  return {
    B: view.window.B,
    primes: all,
    classCount: all.filter((s) => s.kind === "class").length,
    columnCount: all.filter((s) => s.kind === "column").length,
    shown: all.slice(0, n),
    focus: n > 0 ? all[n - 1] : null,
    focusForced: focusEv ? focusEv.forced : [],
    forcedSoFar: forcedUpTo(view, n).size,
    forcedTotal: forcedUpTo(view, all.length).size,
    error: view.error && view.error.code === "inadmissible" ? view.error : null,
  };
}

// The text of the residue condition on x of a prime (modulo 8 for p = 2) and on d.
export function xText(s) {
  return `x = ${s.xRes} (mod ${s.xMod})`;
}
export function dText(s) {
  return s.dRes === null ? `d free mod ${s.p}` : `d = ${s.dRes} (mod ${s.p})`;
}

// render(panel, view, sub, kit) fills the text panel and sets the canvas.
export function render(panel, view, sub, kit) {
  const { h } = kit;
  const d = step1Data(view, sub);
  if (!d) return false;
  panel.append(
    h("div", { class: "lab-prose", html: kit.text("step1.what") }),
    numsBlock(h, "lab-step1-summary", [
      ["B", "B", d.B],
      ["primes", "primes", d.primes.length],
      ["classes", "with a class", d.classCount],
      ["columns", "with d free", d.columnCount],
      d.error ? ["inadmissible", "no free class at", d.error.p] : null,
    ]),
  );
  const f = d.focus;
  if (f) {
    const isClass = f.kind === "class";
    panel.append(
      h(
        "div",
        { class: "lab-focus", id: "lab-step1-focus", dataset: { p: f.p, kind: f.kind, a: f.a, b: f.b === null ? "" : f.b, xres: f.xRes, xmod: f.xMod, dres: f.dRes === null ? "" : f.dRes, forced: f.forcedCount } },
        h("p", { class: "lab-focus-head" }, `p = ${f.p}, ${f.kind} ${isClass ? `(a, b) = (${f.a}, ${f.b})` : `a = ${f.a}`}`),
        h("p", { class: "lab-cond" }, `$x\\equiv -${f.a} \\pmod{${f.p}}$`, isClass ? `, $d\\equiv -${f.b} \\pmod{${f.p}}$` : null),
        numsBlock(h, "lab-step1-focus-nums", [
          ["x", "x", `${f.xRes} mod ${f.xMod}`],
          ["d", "d", f.dRes === null ? "free" : `${f.dRes} mod ${f.p}`],
          ["forced", "to type 0", f.forcedCount],
        ]),
      ),
    );
  }
  if (d.shown.length) {
    const tr = (s) =>
      h(
        "tr",
        { dataset: { p: s.p }, class: f && s.p === f.p ? "lab-focus-row" : null },
        h("td", null, String(s.p)),
        h("td", null, s.kind === "class" ? `(${s.a}, ${s.b})` : `col ${s.a}`),
        h("td", null, `${s.xRes} mod ${s.xMod}`),
        h("td", null, s.dRes === null ? "free" : `${s.dRes} mod ${s.p}`),
        h("td", null, String(s.forcedCount)),
      );
    panel.append(
      h(
        "table",
        { class: "lab-mini", id: "lab-step1-table", dataset: { forced: d.forcedSoFar } },
        h("thead", null, h("tr", null, ["p", "class", "x", "d", "type 0"].map((t) => h("th", null, t)))),
        h("tbody", null, d.shown.map(tr)),
        h("tfoot", null, h("tr", null, h("td", { colspan: "4" }, "type 0 so far"), h("td", null, String(d.forcedSoFar)))),
      ),
    );
  }

  const forced = forcedUpTo(view, f ? sub : 0);
  kit.hex.setSource(sourceOfColours(windowColours(view, { withN: true, forced })));
  const overlays = [fadeOutside(view.window.S.concat(d.focusForced)), outline(view.window.S)];
  if (f && f.kind === "class") overlays.push(modGrid(f.p, f.a, f.b));
  if (f && f.kind === "column" && f.p <= COLUMN_MARK_LIMIT) {
    for (let b = 0; b < f.p; b++) overlays.push({ ...modGrid(f.p, f.a, b), id: `column-${b}` });
  }
  kit.hex.setOverlays(overlays);
  kit.hex.fit(view.window.bounds);
}
