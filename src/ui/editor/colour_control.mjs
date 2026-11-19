// The colour control of the shape editor: one button with the three colour squares (the region type to build marked)
// that opens a small menu of the region types +1, -1 and 0, each with a swatch in the present palette's colour of
// that type and a check or a cross icon (verdictMark: the hexagon of the draw tool while the shape is empty): the
// verdict of that type for the present shape (quickFix and verdictWords of verdict.mjs, the residue test of the shape
// for +1 and -1, of its neighbours for 0), the verdict's words in its tooltip and its description. Every type can be
// chosen: choosing a type with a cross shows its fix on the canvas.

import { h } from "../dom.mjs";
import { icon } from "../widgets/icons.mjs";
import { COLOURS } from "./editor_state.mjs";
import { colourWord } from "../pages/lab/model.mjs";
import { quickFix, typeLabel, verdictWords, verdictMark } from "./verdict.mjs";

// createColourControl({ pops, host, onPick }) builds the control: pops is a popover group (createPopoverGroup), host
// the element the menu is placed in, onPick(colour) is called when a type is chosen. Returns { button,
// update(colour, analysis), destroy() }: update marks the type to build and sets the verdict icon of each type.
export function createColourControl({ pops, host, onPick }) {
  const squares = COLOURS.map((c) => h("span", { class: `c-${colourWord(c)}` }));
  const button = h("button", { type: "button", class: "xp-colour", id: "editor-colour", "aria-haspopup": "menu" }, squares);
  const pop = pops.create({ anchor: button, host, id: "editor-colours", label: "Region type", placement: "below", align: "start" });
  const items = COLOURS.map((c) => {
    const word = colourWord(c);
    const why = h("span", { class: "sr-only", id: `editor-colour-why-${word}` });
    const mark = h("span", { class: "xp-colour-verdict", "aria-hidden": "true" });
    const b = h("button", { type: "button", role: "menuitemradio", id: `editor-colour-${word}`, class: "xp-colour-item", dataset: { colour: String(c) },
      "aria-label": `Region type ${typeLabel(c)}`, "aria-describedby": why.id },
      h("span", { class: `xp-swatch xp-swatch-${word}`, "aria-hidden": "true" }), h("span", { class: "xp-colour-type" }, typeLabel(c)), mark);
    b.addEventListener("click", () => {
      pop.close();
      onPick(c);
    });
    return { c, b, why, mark, ok: null };
  });
  pop.el.append(h("div", { class: "xp-colours", role: "menu", "aria-label": "Region type" }, items.map((x) => x.b), items.map((x) => x.why)));

  return {
    button,
    update(colour, analysis) {
      squares.forEach((s, k) => {
        s.dataset.on = String(COLOURS[k] === colour);
      });
      button.dataset.colour = String(colour);
      const t = `Region type ${typeLabel(colour)}`;
      button.title = t;
      button.setAttribute("aria-label", t);
      for (const x of items) {
        const fix = quickFix(analysis, x.c);
        const mark = verdictMark(fix);
        const text = verdictWords(fix, x.c);
        x.b.setAttribute("aria-checked", String(x.c === colour));
        x.b.dataset.ok = mark.ok;
        x.b.title = text;
        x.why.textContent = text;
        if (x.ok !== mark.ok) {
          x.mark.replaceChildren(icon(mark.icon));
          x.ok = mark.ok;
        }
      }
    },
    destroy() {
      pop.close();
      pop.off();
      pop.el.remove();
    },
  };
}
