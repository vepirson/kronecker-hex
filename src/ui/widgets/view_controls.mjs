// The view controls of a canvas page: one column of three icon buttons at the top right of the canvas, zoom in, zoom
// out and fit, with the same icons, order, tooltips and keys on every page that has them (the Explorer, the shape
// editor, the Lab). The keys + and - (also = and _) zoom by one step of the hex view (ZOOM_STEP of
// src/render/hex_canvas.mjs, the same function as the keys of the canvas itself), f fits, and 0 returns to the
// page's start zoom when the page gives one. The keys act on the whole page while the focus is not in a text field,
// so that a tooltip's key works after a click on a button too.
//
// Usage: const vc = createViewControls({ view, fit }); host.append(vc.el); ... vc.destroy() on unmount.
// vc.setFit(enabled, why) disables the fit button with its reason (for example while nothing is shown).

import { h } from "../dom.mjs";
import { iconButton, setIconLabel } from "./icons.mjs";

// The tooltips of the three buttons (each names its key).
export const ZOOM_IN_LABEL = "Zoom in (+)";
export const ZOOM_OUT_LABEL = "Zoom out (-)";
export const FIT_LABEL = "Fit (F)";

// viewKeyAction(event) is the action of a key press for the view controls: "in", "out", "fit", "home" or null (a key
// with Ctrl, Alt or Cmd, a key already used by another handler, or any other key).
export function viewKeyAction(e) {
  if (!e || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return null;
  return { "+": "in", "=": "in", "-": "out", _: "out", f: "fit", F: "fit", 0: "home" }[e.key] || null;
}

// The inputs that take typed text (a key there is text, never a view key).
const TEXT_TYPES = new Set(["text", "search", "url", "tel", "email", "password", "number"]);

// inTextField(el) is true when el takes typed text: a text input, a textarea, a select or an editable element.
export function inTextField(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return TEXT_TYPES.has(String(el.type || "text").toLowerCase());
  return el.isContentEditable === true;
}

// createViewControls({ view, fit, homeCell, ids, className }) builds the column. view: the hex view (with zoomStep
// and setCell), or a function that returns it (null while the page has none). fit(): what the fit button and the key
// f do. homeCell: the pixels per cell the key 0 returns to (no key 0 when absent). ids: { in, out, fit } the ids of
// the three buttons. className: more classes of the column (the page's place for it). Returns { el, buttons: {
// zoomIn, zoomOut, fit }, setFit(enabled, why), destroy() }.
export function createViewControls({ view, fit, homeCell = null, ids = {}, className = null } = {}) {
  const viewNow = () => (typeof view === "function" ? view() : view);
  const fitText = FIT_LABEL;
  const zoomIn = iconButton("plus", ZOOM_IN_LABEL, { id: ids.in });
  const zoomOut = iconButton("minus", ZOOM_OUT_LABEL, { id: ids.out });
  const fitBtn = iconButton("fit", fitText, { id: ids.fit });
  const el = h("div", { class: ["view-controls", "float", className] }, zoomIn, zoomOut, fitBtn);
  let fitOn = true;

  const zoom = (n) => {
    const v = viewNow();
    if (v) v.zoomStep(n);
  };
  const doFit = () => {
    if (fitOn && fit) fit();
  };
  zoomIn.addEventListener("click", () => zoom(1));
  zoomOut.addEventListener("click", () => zoom(-1));
  fitBtn.addEventListener("click", doFit);

  const onKey = (e) => {
    const act = viewKeyAction(e);
    if (!act || !el.isConnected || inTextField(e.target)) return;
    const v = viewNow();
    if (!v) return;
    if (act === "in") zoom(1);
    else if (act === "out") zoom(-1);
    else if (act === "fit") doFit();
    else if (homeCell !== null) v.setCell(homeCell);
    else return;
    e.preventDefault();
  };
  document.addEventListener("keydown", onKey);

  return {
    el,
    buttons: { zoomIn, zoomOut, fit: fitBtn },
    // setFit(enabled, why): the fit button (and the key f) on, or off with why as its tooltip
    setFit(enabled, why = null) {
      fitOn = !!enabled;
      fitBtn.disabled = !fitOn;
      setIconLabel(fitBtn, fitOn || !why ? fitText : why);
    },
    destroy() {
      document.removeEventListener("keydown", onKey);
    },
  };
}
