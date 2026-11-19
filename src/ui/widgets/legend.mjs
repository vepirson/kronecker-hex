// The legend of the region types: three small squares in the fills of the present palette with +1, -1 and 0, the
// one legend of the site (the Explorer's canvas, the Gallery's head). Its name carries no colour word: the squares
// show the colours, and in another palette a colour word would be wrong. The page places it with its own class.

import { h } from "../dom.mjs";
import { colourName } from "../../core/regions.mjs";
import { COLOURS } from "../editor/editor_state.mjs";
import { typeText } from "../pages/lab/model.mjs";

// The name of the legend (its tooltip and accessible name).
export const LEGEND_NAME = "Region types +1, -1, 0";

// regionLegend({ id, className }) is the legend element: a span (role img, named LEGEND_NAME) of one item per region
// type in the order of the site, each a square (class legend-sq legend-sq-<colour word>) and the type in figures.
export function regionLegend({ id = null, className = null } = {}) {
  const item = (k) => h("span", { class: "legend-item" }, h("span", { class: ["legend-sq", `legend-sq-${colourName(k)}`], "aria-hidden": "true" }), h("span", { class: "mono" }, typeText(k)));
  return h("span", { class: ["legend", className], id, role: "img", title: LEGEND_NAME, "aria-label": LEGEND_NAME }, COLOURS.map(item));
}
