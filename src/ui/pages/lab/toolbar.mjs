// The parts that the extras of every kind share: the toolbar itself (mountToolbar: the hover line over the canvas and
// the tool buttons) and the popovers of the toolbar (the site's popover helper: one open at a time, closed by Escape
// and by a click outside, kept inside the screen).

import { useStyles } from "../../dom.mjs";
import { createPopoverGroup } from "../../widgets/popover.mjs";
import { STYLES_URL } from "./step5.mjs";

// The widest popover of the toolbar in CSS pixels (the tamper form).
export const TOOL_POPOVER_WIDTH = 420;

// mountToolbar(toolbar, kit, { canvasBox, hover, tools, onResult }) fills the toolbar of a kind and returns { state(),
// unmount() }.
//   hover        the hover line, always on: { none (the fields of the hover record without a cell fact),
//                describe(result, cell) -> { text, record (fields of the hover record), data (attributes of the hover
//                line) } }. Hovering a window cell writes text into one fixed line over the top left corner of
//                canvasBox (so that it never moves the layout), an empty text leaves the line empty.
//   tools        the buttons in order, each { tool, label, title, content() (the content of its popover, built each
//                time it opens) }. The popover of a tool has the id lab-x-pop-<tool>.
//   onResult(r)  called when the result of the page changes (null when there is none), before the buttons follow.
// A button is disabled without a result, the open popover closes when the result goes. state() is { open (the open
// popover's tool or null), hover ({ i, j, text, ...record } of the last hovered cell or null) }. unmount() removes the
// buttons, the popovers, the hover line and every listener.
export function mountToolbar(toolbar, kit, { canvasBox = null, hover, tools, onResult = null }) {
  const { h } = kit;
  useStyles(STYLES_URL);
  let hovered = null;
  let destroyed = false;
  const group = createPopoverGroup();
  const result = () => kit.result;
  const list = tools.map((t) => {
    const b = h("button", { type: "button", class: "lab-x-btn", id: `lab-x-${t.tool}`, dataset: { tool: t.tool }, title: t.title, "aria-haspopup": "dialog" }, t.label);
    const pop = group.create({
      anchor: b, id: `lab-x-pop-${t.tool}`, label: t.title, align: "end", className: "lab-x-pop", maxWidth: TOOL_POPOVER_WIDTH,
      build: (el) => el.replaceChildren(t.content()),
    });
    pop.el.dataset.kind = t.tool;
    return { t, b, pop };
  });
  toolbar.replaceChildren(...list.map((x) => x.b));

  const hoverEl = h("div", { class: "lab-x-hover", id: "lab-hover", "aria-live": "off" });
  if (canvasBox) canvasBox.append(hoverEl);

  const refresh = () => {
    const r = result();
    for (const { b } of list) b.disabled = !r;
    hoverEl.hidden = !r;
  };
  const unsubStore = kit.store.subscribe((s, patch) => {
    if (destroyed || !patch.lab) return;
    if ("result" in patch.lab) {
      const r = s.lab ? s.lab.result : null;
      if (onResult) onResult(r);
      if (!r) group.closeAll();
    }
    refresh();
  });

  const showHover = (cell) => {
    const r = result();
    if (!r || !cell) {
      hovered = cell && r ? { i: cell[0], j: cell[1], text: "", ...hover.none } : null;
      hoverEl.textContent = "";
      return;
    }
    const d = hover.describe(r, cell);
    hovered = { i: cell[0], j: cell[1], text: d.text, ...d.record };
    hoverEl.textContent = d.text;
    Object.assign(hoverEl.dataset, { i: String(cell[0]), j: String(cell[1]), ...d.data });
  };
  const unsubHover = kit.hex.onCellHover((c) => showHover(c));

  const openTool = () => {
    const o = group.openOne();
    return o ? o.el.dataset.kind : null;
  };

  refresh();
  return {
    state: () => ({ open: openTool(), hover: hovered ? { ...hovered } : null }),
    unmount() {
      destroyed = true;
      group.destroy();
      unsubStore();
      if (typeof unsubHover === "function") unsubHover();
      hoverEl.remove();
      toolbar.replaceChildren();
    },
  };
}
