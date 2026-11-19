// Step 5 of the blue Construction Lab: the check, independent of how x0 and d0 were found. sub n is the n-th row of
// the window: every cell's wanted colour (blue on S, any other colour on a neighbour) against the Kronecker symbol
// computed from x0 and d0, then the region check (the flood fill from the seed is complete and equals the shape, the
// area, the genus, the colour). The panel is the verification panel of the green and red construction.

import { renderCheck } from "../step7.mjs";

// subCount(view): the number of rows of the window (0 before the first verifyRow event).
export function subCount(view) {
  return view && Array.isArray(view.verifyRows) ? view.verifyRows.length : 0;
}

// render(panel, view, sub, kit) fills the text panel and sets the canvas (the real window, the rows checked so far
// outlined), false before the first verifyRow event.
export function render(panel, view, sub, kit) {
  return renderCheck(panel, view, sub, kit, { what: kit.text("blue.step5.what") });
}
