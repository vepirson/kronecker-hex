// The shape editor page (#/edit, layout "app"): its own hex view on a static colour source, filling the page under
// the header, with the editor's floating controls (src/ui/editor/editor.mjs), the view controls of the site at the top
// right (widgets/view_controls.mjs: zoom in, zoom out, fit to the shape, the keys + - f on the whole page), the
// readout of the cell under the mouse at the bottom left and the note line at the top centre. The floating controls
// share the classes of styles/explore.css, the editor's own rules are in styles/edit.css.
//
// The shape lives in the store (key editor) with its undo and redo lists: leaving the page and coming back keeps
// them. The address mirrors the shape as #/edit?s=<text>&colour=<word> (shape_address.mjs, written with replace,
// ADDRESS_MS after the last change, the bare #/edit for a shape without a short text). Opening such an address loads
// the shape, or resumes the stored one with its history when it is the same shape. A text that cannot be read gives
// the error line and an empty editor. The address without a shape (the header's entry Edit, the Explorer's chip, a
// Gallery card) resumes the stored shape and takes the selection of the site when it is newer than the drawing.

import { h, useStyles } from "../dom.mjs";
import { createHexView, staticSource } from "../../render/hex_canvas.mjs";
import { createViewControls } from "../widgets/view_controls.mjs";
import { createPopoverGroup } from "../widgets/popover.mjs";
import { createToast } from "../widgets/toast.mjs";
import { createOffsetsReadout } from "../widgets/offsets_readout.mjs";
import { mountEditor, errorLine } from "../editor/editor.mjs";
import { shapeQuery, readShapeQuery } from "../editor/shape_address.mjs";
import { sameShape, isNewer } from "../actions.mjs";

// Pixels per cell of a fresh editor view.
export const EDIT_CELL = 22;
// The address is written this many milliseconds after the last change of the shape or its colour.
export const ADDRESS_MS = 300;

// sameShape(a, b) is true when the two lists of cells hold the same cells (any order).
export { sameShape };

// startOf(query, kept, selection) is the start of the editor for the address query, the store record kept
// (store.editor) and the selection of the site (store.selection): { start: null } to resume the kept shape with its
// history, { start: null, take: selection } to resume it and then take the selection (an address without a shape and
// a selection newer than the kept drawing, isNewer of src/ui/actions.mjs), { start: { cells, seed: null, colour } }
// for the shape of the address (it wins over the selection), or { start: { cells: [] }, error, sentence } for an
// address whose shape cannot be read (the error and the visitor's sentence of readShapeQuery).
export function startOf(query, kept, selection = null) {
  const q = readShapeQuery(query);
  if (q === null) return isNewer(selection, (kept || {}).stamp) ? { start: null, take: selection } : { start: null };
  if (q.error) return { start: { cells: [], seed: null, colour: 1 }, error: q.error, sentence: q.sentence };
  const k = kept || {};
  if (k.colour === q.colour && sameShape(k.cells, q.cells)) return { start: null };
  return { start: { cells: q.cells, seed: null, colour: q.colour } };
}

// editorReadoutText(i, j) is the readout line of a cell of the shape editor: "i 3  j -2" (the shared offsets readout).
export { offsetsText as editorReadoutText } from "../widgets/offsets_readout.mjs";

// ---------- test handles ----------

let current = null;

// testHandles() returns live handles of the mounted page for automated browser checks: { view, editor, store,
// mountedMs } (null when no editor page is mounted). Read only.
export function testHandles() {
  return current ? current() : null;
}

// mount(root, ctx) shows the editor page in root and returns unmount().
export function mount(root, ctx) {
  const { store, navigate } = ctx;
  const tMount = performance.now();
  const styled = Promise.all([useStyles(new URL("../../../styles/explore.css", import.meta.url)), useStyles(new URL("../../../styles/edit.css", import.meta.url))]);

  const host = h("div", { class: "xp ed", id: "edit" });
  const canvas = h("canvas", {
    id: "edit-canvas",
    "aria-label": "Shape editor on the hexagonal grid: draw cells with the pointer, wheel or + and - to zoom",
  });
  const viewBox = h("div", { class: "hexview xp-view" }, canvas);
  let editor = null;
  const viewControls = createViewControls({
    view: () => view,
    fit: () => editor && editor.fit(),
    ids: { in: "edit-zoom-in", out: "edit-zoom-out", fit: "edit-zoom-fit" },
  });
  const topRight = viewControls.el;
  const readout = createOffsetsReadout({ id: "edit-hover", boxClass: "xp-bl float ed-bl" });
  const bottomLeft = readout.el;
  const toast = createToast({ id: "edit-note", avoid: () => [host.querySelector("#editor-tools"), topRight] });
  // a note said before the page's styles loaded is placed again once the controls have their size
  styled.then(() => toast.place());
  const title = h("h1", { class: "sr-only" }, "Shape editor");
  host.append(title, viewBox, topRight, bottomLeft, toast.el);
  root.replaceChildren(host);

  const view = createHexView(canvas, { source: staticSource(() => null), cell: EDIT_CELL });
  const group = createPopoverGroup();
  const offs = [];
  offs.push(
    view.onCellHover((c) => {
      readout.show(c);
    }),
  );

  // the address: the shape as text, written with replace a moment after the last change
  let destroyed = false;
  let urlTimer = 0;
  let last = null;
  const writeAddress = () => {
    urlTimer = 0;
    if (destroyed || !last) return;
    const q = shapeQuery(last.cells, last.colour);
    navigate("#/edit", q || undefined, { replace: true, silent: true });
  };
  const onChange = (snap) => {
    last = snap;
    if (urlTimer) clearTimeout(urlTimer);
    urlTimer = setTimeout(writeAddress, ADDRESS_MS);
  };

  const { start, error, sentence, take } = startOf(ctx.query || {}, store.get().editor, store.get().selection);
  editor = mountEditor(host, { view, canvasBox: viewBox, group, store, navigate, start, take, say: toast.say, onChange });
  if (error) toast.say(errorLine(sentence, error), "error", error.code || "error");

  current = () => ({ view, editor, store, mountedMs: performance.now() - tMount });

  return () => {
    destroyed = true;
    current = null;
    if (urlTimer) clearTimeout(urlTimer);
    urlTimer = 0;
    for (const off of offs) off();
    viewControls.destroy();
    editor.destroy();
    toast.destroy();
    group.destroy();
    view.destroy();
    root.replaceChildren();
  };
}
