// Step 0 of the blue Construction Lab: the shape and its window, in the frame of step 0 of every kind (renderWindow of
// ../step0.mjs, the same three items): the shape S of region type 0 with its outline, then its neighbours N(S) marked
// (they must not have region type 0, their sign is free), then the numbers area, genus, rows h, columns w and the
// bound B = max(h, w, 7).

import { renderWindow, step0Data } from "../step0.mjs";
import { windowSource } from "./model.mjs";

// The content file with the texts of the blue steps (loaded by the page because it is named here).
export const contentFiles = ["blue_steps.json"];

// subCount(view): 2 items (the neighbours, the numbers) once the window is known, else 0, as in every kind.
export { subCount } from "../step0.mjs";

// blueStep0Data(view) is the data of the step with everything shown, or null before the window event: { S, N, area,
// neighbours, genus, h, w, B, bounds } (step0Data of the frame at its last item).
export function blueStep0Data(view) {
  const d = step0Data(view, 2);
  if (!d) return null;
  const { S, N, area, neighbours, genus, h, w, B, bounds } = d;
  return { S, N, area, neighbours, genus, h, w, B, bounds };
}

// render(panel, view, sub, kit) fills the text panel and sets the canvas (static source: S of region type 0, the
// neighbours empty and marked from sub 1 on).
export function render(panel, view, sub, kit) {
  return renderWindow(panel, view, sub, kit, {
    what: kit.text("blue.step0.what"), id: "lab-blue0-numbers",
    source: () => windowSource(view), markN: true,
  });
}
