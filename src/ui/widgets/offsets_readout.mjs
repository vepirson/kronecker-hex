// The offsets readout: one small line at the bottom left of a canvas that names the cell under the pointer by its
// offsets, "i 3  j -2", and is empty (and hidden by the page's stylesheet) while the pointer is not on a cell. The
// shape editor and the Lab show it, the Explorer names its cells by x and d instead.

import { h } from "../dom.mjs";

// offsetsText(i, j) is the text of the readout for the cell (i, j): "i 3  j -2".
export function offsetsText(i, j) {
  return `i ${i}  j ${j}`;
}

// createOffsetsReadout({ id, boxClass }) builds the readout: a box (classes boxClass, which place it over the page's
// canvas) holding the line (class xp-readout, id id). Returns { el (the box), line, show(cell) }: show([i, j]) writes
// the offsets of a cell, show(null) empties the line (the page passes the cells of its view's hover).
export function createOffsetsReadout({ id, boxClass = "" } = {}) {
  const line = h("div", { class: "xp-readout", id });
  const el = h("div", { class: boxClass }, line);
  return {
    el,
    line,
    show(cell) {
      line.textContent = cell ? offsetsText(cell[0], cell[1]) : "";
    },
  };
}
