// Step 1 of the blue Construction Lab: the classes of the small primes p <= B. For each prime one class (a, b) of
// (Z/p)^2 that holds no neighbour: with x0 = -a and d0 = -b (mod p) the prime divides both coordinates of exactly the
// cells of that class, so its cells of S get region type 0. sub n puts the n-th prime in focus: its class, the two
// conditions, its cells of S and how many of them are new. A small table lists the primes so far. sub 0 is the
// overview. How the classes were chosen (passes of the rule, a stored class) is not shown: it is not part of the
// example.

import { fadeOutside, outline, modGrid } from "../../../../render/overlays.mjs";
import { numsBlock } from "../model.mjs";
import { windowSource, blueCellsSoFar } from "./model.mjs";
import { stepRef } from "../steps.mjs";

// subCount(view): the number of primes p <= B (one class each).
export function subCount(view) {
  return view && view.classes ? view.classes.length : 0;
}

const classRow = (c) => ({
  p: c.p, a: c.a, b: c.b, xRes: c.xRes, dRes: c.dRes, members: c.members.length, fresh: c.fresh.length,
});

// blueStep1Data(view, sub) is the data shown at position sub, or null before the window event: { B, primes (all, as
// rows { p, a, b, xRes, dRes, members, fresh }), shown (the first sub), focus (the row of sub or null), focusCells
// (its cells of S), blueSoFar (cells of S of region type 0 after the shown primes), forcedCount and remaining (cells
// of S in some class, cells left for step 1.2: null until the classes are done), error (an inadmissible error event,
// or null) }.
export function blueStep1Data(view, sub) {
  if (!view || !view.window) return null;
  const all = view.classes.map(classRow);
  const n = Math.max(0, Math.min(all.length, sub | 0));
  const done = view.classesDone;
  return {
    B: view.window.B,
    primes: all,
    shown: all.slice(0, n),
    focus: n > 0 ? all[n - 1] : null,
    focusCells: n > 0 ? view.classes[n - 1].members : [],
    blueSoFar: blueCellsSoFar(view, n, 0).size,
    forcedCount: done ? done.forcedCount : null,
    remaining: done ? done.remaining.length : null,
    error: view.error && view.error.code === "inadmissible" ? view.error : null,
  };
}

// render(panel, view, sub, kit) fills the text panel and sets the canvas (the cells blue so far at full strength,
// the class of the prime in focus marked).
export function render(panel, view, sub, kit) {
  const { h } = kit;
  const d = blueStep1Data(view, sub);
  if (!d) return false;
  panel.append(
    h("div", { class: "lab-prose", html: kit.text("blue.step1.what") }),
    numsBlock(h, "lab-blue1-summary", [
      ["B", "B", d.B],
      ["primes", "primes", d.primes.length],
      d.forcedCount === null ? null : ["forced", "in a class", d.forcedCount],
      d.remaining === null ? null : ["remaining", `cells left for ${stepRef("blue", 2)}`, d.remaining],
      d.error ? ["inadmissible", "no free class at", d.error.p] : null,
    ]),
  );
  const f = d.focus;
  if (f) {
    panel.append(
      h(
        "div",
        { class: "lab-focus", id: "lab-blue1-focus", dataset: { p: f.p, a: f.a, b: f.b, xres: f.xRes, dres: f.dRes, members: f.members, fresh: f.fresh } },
        h("p", { class: "lab-focus-head" }, `p = ${f.p}, class (a, b) = (${f.a}, ${f.b})`),
        h("p", { class: "lab-cond" }, `$x\\equiv ${f.xRes},\\ d\\equiv ${f.dRes} \\pmod{${f.p}}$`),
        numsBlock(h, "lab-blue1-focus-nums", [
          ["x", "x", `${f.xRes} mod ${f.p}`],
          ["d", "d", `${f.dRes} mod ${f.p}`],
          ["members", "cells of S", f.members],
          ["fresh", "new", f.fresh],
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
        h("td", null, `(${s.a}, ${s.b})`),
        h("td", null, `${s.xRes}, ${s.dRes}`),
        h("td", null, String(s.members)),
        h("td", null, String(s.fresh)),
      );
    panel.append(
      h(
        "table",
        { class: "lab-mini", id: "lab-blue1-table", dataset: { blue: d.blueSoFar } },
        h("thead", null, h("tr", null, ["p", "class", "x, d", "cells", "new"].map((t) => h("th", null, t)))),
        h("tbody", null, d.shown.map(tr)),
        h("tfoot", null, h("tr", null, h("td", { colspan: "4" }, "type 0 so far"), h("td", null, String(d.blueSoFar)))),
      ),
    );
  }

  // the cells blue after the primes so far (the focus prime included) at full strength, the rest of S soft
  const strong = [...blueCellsSoFar(view, f ? sub : 0, 0).values()].map((c) => [c.i, c.j]);
  kit.hex.setSource(windowSource(view));
  const overlays = [fadeOutside(strong), outline(view.window.S)];
  if (f) overlays.push(modGrid(f.p, f.a, f.b));
  kit.hex.setOverlays(overlays);
  kit.hex.fit(view.window.bounds);
}
