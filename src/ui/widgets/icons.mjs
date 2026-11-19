// Inline SVG icons (16 x 16, drawn in the current text colour) and the icon button of the site: a 28 x 28 px button
// with a title (tooltip) and an aria-label. Built with the svg helper of dom.mjs, so every file stays ASCII.

import { h, svg } from "../dom.mjs";

// Each icon is a list of [tag, attrs] drawn in a 16 x 16 box. Strokes use the current colour, "fill" marks a filled
// shape.
const S = (d) => ["path", { d }];
const F = (d) => ["path", { d, fill: "currentColor", stroke: "none" }];
const DOT = (cx, cy, r = 1.3) => ["circle", { cx, cy, r, fill: "currentColor", stroke: "none" }];
const HEX = "M8 1.8 13.4 4.9V11.1L8 14.2 2.6 11.1V4.9Z";

export const ICONS = Object.freeze({
  palette: [["circle", { cx: 8, cy: 8, r: 6 }], DOT(5.6, 6.2), DOT(9.4, 5.2), DOT(11, 8.6), DOT(6.4, 10.4)],
  theme: [["circle", { cx: 8, cy: 8, r: 6 }], F("M8 2a6 6 0 0 0 0 12Z")],
  go: [S("M2.5 8h10M8.5 4l4 4-4 4")],
  open: [S("M8 10.5V2.5M5 5.5l3-3 3 3M2.5 9.5v4h11v-4")],
  edit: [S("M3 13l.8-3.2 7-7 2.4 2.4-7 7Z"), S("M9.6 4l2.4 2.4")],
  plus: [S("M8 3v10M3 8h10")],
  minus: [S("M3 8h10")],
  fit: [S("M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10")],
  gear: [["circle", { cx: 8, cy: 8, r: 2.2 }], S("M8 1.8v2.2M8 12v2.2M1.8 8H4M12 8h2.2M3.6 3.6l1.6 1.6M10.8 10.8l1.6 1.6M3.6 12.4l1.6-1.6M10.8 5.2l1.6-1.6")],
  stop: [F("M4.5 4.5h7v7h-7Z")],
  details: [DOT(3.5, 8), DOT(8, 8), DOT(12.5, 8)],
  close: [S("M4 4l8 8M12 4l-8 8")],
  copy: [S("M5.5 5.5h7v8h-7Z"), S("M3.5 10.5v-8h7")],
  draw: [S(HEX), F("M8 1.8V14.2L2.6 11.1V4.9Z")],
  move: [S("M8 1.8v12.4M1.8 8h12.4M6 3.8 8 1.8l2 2M6 12.2l2 2 2-2M3.8 6 1.8 8l2 2M12.2 6l2 2-2 2")],
  undo: [S("M5.5 3 2.5 6l3 3"), S("M2.5 6h7a3.5 3.5 0 0 1 0 7H6")],
  redo: [S("M10.5 3l3 3-3 3"), S("M13.5 6h-7a3.5 3.5 0 0 0 0 7H10")],
  gallery: [S("M2.5 2.5h4.5v4.5H2.5ZM9 2.5h4.5v4.5H9ZM2.5 9h4.5v4.5H2.5ZM9 9h4.5v4.5H9Z")],
  // the mirror image of open: the same tray, the arrow going down into it
  download: [S("M8 2.5v8M5 7.5l3 3 3-3M2.5 9.5v4h11v-4")],
  hex: [S(HEX)],
  eye: [S("M1.5 8C3.2 5 5.4 3.5 8 3.5S12.8 5 14.5 8C12.8 11 10.6 12.5 8 12.5S3.2 11 1.5 8Z"), ["circle", { cx: 8, cy: 8, r: 2.1 }]],
  flask: [S("M6 2h4"), S("M7 2.5v3.3A4.2 4.2 0 1 0 9 5.8V2.5"), S("M4.4 10.3h7.2")],
  home: [S("M2 7.6 8 2.4l6 5.2"), S("M3.8 6.4v7.4h8.4V6.4"), S("M6.8 13.8v-3.6h2.4v3.6")],
  // the two verdicts (can be built, cannot be built), each in a circle so that the cross is not the close icon
  check: [["circle", { cx: 8, cy: 8, r: 6.2 }], S("M5.1 8.2 7.2 10.3 11 5.9")],
  cross: [["circle", { cx: 8, cy: 8, r: 6.2 }], S("M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6")],
  // apply a fix: a wand with two sparks
  fix: [S("M2.6 13.4 9.8 6.2"), S("M8.6 5 11 7.4"), S("M12.2 1.8v2.8M10.8 3.2h2.8"), S("M13.4 8.4v1.8M12.5 9.3h1.8")],
  // the arrows of the stepper: one item back and on, one step back and on (each pair mirror images about x = 8)
  prev: [S("M10 3.5 5.5 8 10 12.5")],
  next: [S("M6 3.5 10.5 8 6 12.5")],
  prevStep: [S("M8 3.5 3.5 8 8 12.5"), S("M12.5 3.5 8 8 12.5 12.5")],
  nextStep: [S("M8 3.5 12.5 8 8 12.5"), S("M3.5 3.5 8 8 3.5 12.5")],
  // back to the selected region: an arrow that turns back on itself (a circle with its head at the start)
  reset: [S("M2.5 8a5.5 5.5 0 1 0 1.6-3.9"), S("M3.6 1.8v2.6h2.6")],
  // a link to another website: an arrow leaving a box
  external: [S("M9 2.5h4.5V7M13.5 2.5l-6 6"), S("M11.5 9.5v4h-9v-9h4")],
  // empty the drawing: a bin with its lid (not the close X)
  clear: [S("M2.5 4.5h11"), S("M6.3 4.5V2.8h3.4v1.7"), S("M4 4.5l.8 9h6.4l.8-9"), S("M6.6 7v4.3M9.4 7v4.3")],
});

// The icon of each page of the header. An icon of this table means its page everywhere on the site: the header entry
// and every button that sends the shown region to that page (open in the Explorer, edit, show the algorithm). The keys
// are the pages of routes.mjs (the Algorithm page is "lab").
export const PAGE_ICONS = Object.freeze({ explore: "eye", edit: "edit", lab: "flask", gallery: "gallery" });

// The names of the three actions that send a region to a page (accessible name and tooltip of their buttons).
export const PAGE_ACTIONS = Object.freeze({ explore: "Show in Explorer", edit: "Edit shape", lab: "Show algorithm" });

// icon(name) returns an <svg> element of the icon (aria-hidden, 16 x 16). Throws for an unknown name.
export function icon(name) {
  const parts = ICONS[name];
  if (!parts) throw new Error(`unknown icon ${JSON.stringify(name)}`);
  return svg(
    "svg",
    {
      class: "icon",
      viewBox: "0 0 16 16",
      width: "16",
      height: "16",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
    },
    parts.map(([tag, attrs]) => svg(tag, attrs)),
  );
}

// iconButton(name, label, attrs) returns a 28 x 28 px <button type="button"> showing the icon, with title and
// aria-label set to label. attrs: any further attributes of h (id, dataset, disabled, onclick, ...); a "title" in
// attrs replaces the tooltip only.
export function iconButton(name, label, attrs = {}) {
  const { class: cls, ...rest } = attrs || {};
  return h("button", { type: "button", title: label, "aria-label": label, ...rest, class: ["icon-btn", cls] }, icon(name));
}

// pageIconButton(page, label, attrs) is the icon button of an action that sends the shown region to a page of
// PAGE_ICONS (its icon). label defaults to the action's name of PAGE_ACTIONS.
export function pageIconButton(page, label = PAGE_ACTIONS[page], attrs = {}) {
  return iconButton(PAGE_ICONS[page], label, attrs);
}

// pageIconLink(page, href, label, attrs) is the same action as a link (an <a> styled as an icon button).
export function pageIconLink(page, href, label = PAGE_ACTIONS[page], attrs = {}) {
  const { class: cls, ...rest } = attrs || {};
  return h("a", { href, title: label, "aria-label": label, ...rest, class: ["icon-btn", cls] }, icon(PAGE_ICONS[page]));
}

// setIconLabel(button, label) changes the title and the aria-label of an icon button together.
export function setIconLabel(button, label) {
  button.title = label;
  button.setAttribute("aria-label", label);
}
