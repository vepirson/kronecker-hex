// Step 2 of the blue Construction Lab: the private primes. Every cell of S that no class of step 1 holds gets its own
// prime q > B (the cells in the order (j, i), the consecutive primes above B), with x0 = -i and d0 = -j (mod q): q
// divides both coordinates of its cell and of no other cell of the window. sub n puts the n-th such cell in focus.

import { fadeOutside, outline, labels } from "../../../../render/overlays.mjs";
import { numsBlock } from "../model.mjs";
import { windowSource, blueCellsSoFar } from "./model.mjs";

// subCount(view): the number of cells of S that no class holds (0 before the classes are done).
export function subCount(view) {
  return view && view.classesDone ? view.privates.length : 0;
}

// blueStep2Data(view, sub) is the data shown at position sub, or null before the classes are done: { B, count,
// forcedCount, first, last (the smallest and the largest private prime, null when there is none), focus ({ i, j, q,
// index } of sub, or null at sub 0) }.
export function blueStep2Data(view, sub) {
  if (!view || !view.classesDone) return null;
  const ps = view.privates;
  const n = Math.max(0, Math.min(ps.length, sub | 0));
  const f = n > 0 ? ps[n - 1] : null;
  return {
    B: view.window.B,
    count: ps.length,
    forcedCount: view.classesDone.forcedCount,
    first: ps.length ? ps[0].q : null,
    last: ps.length ? ps[ps.length - 1].q : null,
    focus: f ? { i: f.i, j: f.j, q: f.q, index: f.index } : null,
  };
}

// render(panel, view, sub, kit) fills the text panel and sets the canvas (the cells blue so far at full strength, the
// cell in focus labelled with its prime).
export function render(panel, view, sub, kit) {
  const { h } = kit;
  const d = blueStep2Data(view, sub);
  if (!d) return false;
  panel.append(
    h("div", { class: "lab-prose", html: kit.text("blue.step2.what") }),
    numsBlock(h, "lab-blue2-numbers", [
      ["B", "B", d.B],
      ["forced", "in a class", d.forcedCount],
      ["count", "own primes", d.count],
      d.first === null ? null : ["range", "from, to", `${d.first}, ${d.last}`],
    ]),
  );
  const f = d.focus;
  if (f) {
    panel.append(
      h(
        "div",
        { class: "lab-focus", id: "lab-blue2-focus", dataset: { i: f.i, j: f.j, q: f.q, index: f.index } },
        h("p", { class: "lab-focus-head" }, `cell (${f.i}, ${f.j}), q = ${f.q}`),
        h("p", { class: "lab-cond" }, `$x\\equiv ${-f.i},\\ d\\equiv ${-f.j} \\pmod{${f.q}}$`),
      ),
    );
  }

  const blue = blueCellsSoFar(view, view.classes.length, f ? sub : 0);
  kit.hex.setSource(windowSource(view));
  const overlays = [fadeOutside([...blue.values()].map((c) => [c.i, c.j])), outline(view.window.S)];
  if (f) overlays.push(labels([[f.i, f.j, String(f.q)]]));
  kit.hex.setOverlays(overlays);
  kit.hex.fit(view.window.bounds);
}
