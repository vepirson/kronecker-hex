// Step 0 of the Construction Lab: the shape and its window. The shape S in its region type with its outline, then
// its neighbours N(S) in the opposite region type (soft), then the numbers area, genus, rows n, columns m (h and w in
// the code) and the bound B = max(n, m, 7). sub 0: S only, sub 1: with N(S), sub 2: with the numbers. The blue kind shows its step 0 by the
// same frame (renderWindow): its neighbours have no prescribed sign, so they are marked instead (the hollow mark of
// the site: these are the cells meant).

import { genusOfCells, colourName } from "../../../core/regions.mjs";
import { fadeOutside, outline, hollowMarks } from "../../../render/overlays.mjs";
import { windowColours, sourceOfColours, numsBlock, typeText } from "./model.mjs";
import { labHref } from "../../actions.mjs";
import { SHAPES_QUERY } from "../../routes.mjs";

// subCount(view): 2 items (the neighbours, the numbers) once the window is known, else 0.
export function subCount(view) {
  return view && view.window ? 2 : 0;
}

// step0Data(view, sub) is the data shown at position sub, or null before the window event: { eps (the region type of
// S, 0 for a window without one), colour (its colour word), type ("+1", "-1", "0"), S, N, area, neighbours,
// windowCells, genus, h, w, B, bounds, showN, showNumbers }.
export function step0Data(view, sub) {
  const w = view && view.window;
  if (!w) return null;
  const eps = w.eps === undefined ? 0 : w.eps;
  return {
    eps, colour: colourName(eps), type: typeText(eps),
    S: w.S, N: w.N, area: w.S.length, neighbours: w.N.length, windowCells: w.S.length + w.N.length,
    genus: genusOfCells(w.S).genus, h: w.h, w: w.w, B: w.B, bounds: w.bounds,
    showN: sub >= 1, showNumbers: sub >= 2,
  };
}

// The link under the text of step 0 to the list of shapes of the page (its start panel, SHAPES_QUERY).
export const OTHER_SHAPES = "Other shapes";
export const OTHER_SHAPES_HREF = labHref({ [SHAPES_QUERY]: "1" });

// renderWindow(panel, view, sub, kit, { what, id, source, markN }) is step 0 of any kind: the text (HTML),
// the numbers (in the list with the id id), the link to the list of shapes (OTHER_SHAPES) and the canvas: source(d) for
// the data d of step0Data, S at full strength with its outline, from sub 1 on N(S) as source draws it and, with markN,
// marked. Returns false before the window event.
export function renderWindow(panel, view, sub, kit, { what, id, source, markN = false }) {
  const { h } = kit;
  const d = step0Data(view, sub);
  if (!d) return false;
  panel.append(
    h("div", { class: "lab-prose", html: what }),
    numsBlock(h, id, [
      ["type", "region type", d.type],
      ["area", "$S$, area", d.area],
      d.showN ? ["neighbours", "neighbours", d.neighbours] : null,
      d.showNumbers ? ["genus", "genus", d.genus] : null,
      d.showNumbers ? ["h", "rows $n$", d.h] : null,
      d.showNumbers ? ["w", "columns $m$", d.w] : null,
      d.showNumbers ? ["B", "$B=\\max\\{n,m,7\\}$", d.B] : null,
    ]),
    h("p", { class: "lab-other-shapes" }, h("a", { href: OTHER_SHAPES_HREF, id: "lab-other-shapes" }, OTHER_SHAPES)),
  );
  kit.hex.setSource(source(d));
  kit.hex.setOverlays([fadeOutside(d.S), outline(d.S), ...(d.showN && markN ? [hollowMarks(d.N)] : [])]);
  kit.hex.fit(d.bounds);
  return true;
}

// render(panel, view, sub, kit) fills the text panel and sets the canvas (static source, S full, the neighbours in the
// opposite region type, soft, from sub 1 on).
export function render(panel, view, sub, kit) {
  return renderWindow(panel, view, sub, kit, {
    what: kit.text("step0.what"), id: "lab-step0-numbers",
    source: (d) => sourceOfColours(windowColours(view, { withN: d.showN })),
  });
}
