// The Explorer: the colouring around any cell (x, d) on a canvas that fills the page under the header. Controls float
// on the canvas: the coordinates and four buttons at the top left (go, reset, open, download), the zoom column at the
// top right, the colour legend at the bottom left, and a chip for the shown region at the bottom right. Everything
// secondary sits behind one details button of the chip. The page never scrolls and never changes height: everything
// that appears later floats. A long coordinate is shown in the fields, while they have no focus, in the short form of
// the site (shortNumber of widgets/bignum.mjs).
//
// Coordinates are bigint values, never Numbers. Offsets from the view centre are Numbers. The store and the address
// hold decimal strings. The page's state is one record (explore/state.mjs): every change is a named transition of
// that record, after which render() draws the chip, the overlays and the download button from it, and the address
// (addressOf) follows. The page keeps the effects: the workers (each in step with its job of the record), the canvas
// view, the address bar. Go and opening a link, a token or a file add a history entry, every other change replaces
// the current one. #/explore?w=<name> opens the shipped witness data/witnesses/<name>.json, #/w/<token> a token. A
// token whose rebuild is long (runPlace of the construction modules) is opened in the construct worker, with a
// progress line and a cancel button.
//
// Look: every cell is soft (its fill mixed with the theme's soft target) and a shown region is drawn at full strength
// with its outline. A click on a cell computes its region at once. (Two view options, "soft cells" and "region on
// click", have their switches behind SHOW_VIEW_OPTIONS.) A complete region is shown whole, a region that is not
// complete (infinite, or larger than the cap) by its part inside the box of the click: the cells connected to the
// clicked cell inside the rectangle of twice the canvas width and height centred on it (computed by the region
// worker in the same job, at most WINDOW_PART_LIMIT cells). Once the view rests after a pan or a zoom (REST_MS), the
// part is computed again for the new window (windowBoxOf, the transition rewindow), the old outline shown meanwhile.
//
// The chip's page bar (widgets/page_bar.mjs: edit, open in the Lab) runs the shared actions of src/ui/actions.mjs. The
// download button saves the witness of what the chip shows. The address bar holds the link of the view.
//
// A return within one loaded page shows what was there without computing it again (explore/cache.mjs): the page keeps
// its colour source, its record and the place of its view when it is left, and the next mount takes them back. The
// computed cells are used again when the address's cell lies near the kept centre, the record's region, witness and
// check when the address asks for them (#/explore with no query: everything as it was left).

import { h, useStyles, loadJson } from "../dom.mjs";
import { createHexView, kroneckerSource, planeOf } from "../../render/hex_canvas.mjs";
import { region, marker } from "../../render/overlays.mjs";
import { bigNumber, shortNumber } from "../widgets/bignum.mjs";
import { iconButton, setIconLabel } from "../widgets/icons.mjs";
import { createPageBar } from "../widgets/page_bar.mjs";
import { regionActions, selectRegion, openInEditor, openInLab, tokenInLink } from "../actions.mjs";
import { HOME_VIEW, EDIT_PATH } from "../routes.mjs";
import { downloadBlob, witnessFile } from "../../render/export_png.mjs";
import { createPopoverGroup } from "../widgets/popover.mjs";
import { createToast, errorNote } from "../widgets/toast.mjs";
import { badge } from "../widgets/badge.mjs";
import { regionLegend } from "../widgets/legend.mjs";
import { createViewControls } from "../widgets/view_controls.mjs";
import { parseBigIntStrict, absBig, CodedError } from "../../core/bigint_utils.mjs";
import { colourName } from "../../core/regions.mjs";
import { cellsText } from "../editor/editor_state.mjs";
import { areaGenusText } from "../editor/verdict.mjs";
import { openToken, readToken, encodeToken } from "../../formats/token.mjs";
import { runPlace } from "../../construct/index.mjs";
import { makeWitness, checkShapeCells, WITNESS_FORMAT } from "../../formats/witness.mjs";
import { parsePacked, rebuildPacked, checkPackedHashes, PACKED_FORMAT } from "../../formats/packed.mjs";
import { cellsOfFlat, FILL_CAP } from "../../workers/floodfill.worker.mjs";
import {
  createExplorerState, shownOf, chipOf, clearRule, fitWhy, subjectOf, downloadOf, blockedOf, detailsOf, modeOf, regionDataOf,
  witnessDataOf, addressOf, fieldsOf, readViewQuery, witnessViewOf, selectionOffset,
} from "./explore/state.mjs";
import { keepVisit, takeVisit, restoreOf, nearOffset } from "./explore/cache.mjs";

// The two view options (soft cells, region on click) are hidden for now: their defaults hold, a stored choice is ignored.
const SHOW_VIEW_OPTIONS = false;

// ---------- pure parts (also used by the tests) ----------

const OFFSET_SAFE = 4194304; // 2^22: overlays farther than this from the view centre are not drawn

// parseIntegerInput(text) reads a decimal integer typed or pasted by a person: surrounding and inner white space
// and a leading "+" are ignored. Returns a bigint, or null when the text is not an integer.
export function parseIntegerInput(text) {
  if (typeof text !== "string") return null;
  let t = text.replace(/\s+/g, "");
  if (t.startsWith("+")) t = t.slice(1);
  return parseBigIntStrict(t);
}

// parseCoordinates(xText, dText) reads the two inputs of the page. "x,d" in the x field is accepted too (then the d
// field is ignored). Returns { x, d } (bigints) or { error } (a sentence).
export function parseCoordinates(xText, dText) {
  let xs = String(xText || "");
  let ds = String(dText || "");
  const parts = xs.split(",");
  if (parts.length === 2) [xs, ds] = parts;
  const x = parseIntegerInput(xs);
  const d = parseIntegerInput(ds);
  if (x === null || d === null) return { error: "Both x and d must be integers." };
  return { x, d };
}

// classifyPaste(text) tells what a pasted text is: { kind: "json", text } for a JSON object, { kind: "token", text }
// for a token (tokenInLink of src/ui/actions.mjs: a bare token, or taken out of a full link containing "#/w/<token>",
// "#/algorithm/w/<token>" or the old "#/lab/w/<token>"), else { kind: "unknown" }.
export function classifyPaste(text) {
  const t = String(text || "").trim();
  if (t.startsWith("{")) return { kind: "json", text: t };
  const token = tokenInLink(t);
  if (token !== null) return { kind: "token", text: token };
  return { kind: "unknown", text: t };
}

// witnessFromObject(obj) turns a parsed JSON object into { witness, token, source }: a kron_hex_witness_v1 object is
// taken as it is (token null, source "witness"), a kron_hex_packed_v1 object is parsed, rebuilt and checked against
// its stored hashes, then written as a witness and as a token (source "packed"). The shape of both passes
// checkShapeCells first. Throws "bad_format" for another format, the codes of checkShapeCells and the codes of the
// packed reader.
export function witnessFromObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new CodedError("bad_format", "Not a JSON object.");
  if (obj.format === WITNESS_FORMAT) {
    checkShapeCells(obj.shape);
    return { witness: obj, token: null, source: "witness" };
  }
  if (obj.format === PACKED_FORMAT) {
    const parsed = parsePacked(obj);
    checkShapeCells(parsed.data.shape);
    const { x0, d0 } = rebuildPacked(parsed.data);
    checkPackedHashes(parsed, x0, d0);
    const dt = parsed.data;
    const witness = makeWitness({ id: dt.id, colour: dt.colour, x0, d0, seed: dt.seed, shape: dt.shape });
    let token = null;
    try {
      token = encodeToken(dt, x0);
    } catch {
      token = null;
    }
    return { witness, token, source: "packed" };
  }
  throw new CodedError("bad_format", `unknown format ${JSON.stringify(obj.format)}: expected ${WITNESS_FORMAT} or ${PACKED_FORMAT}`);
}

// witnessFromToken(text) opens a token with openToken (structure, rebuild, tag, shape and genus checks) and returns
// { witness, token, data, x0, d0 }. Throws the codes of openToken.
export function witnessFromToken(text) {
  const token = String(text).trim();
  const r = openToken(token);
  const witness = makeWitness({ id: r.data.id, colour: r.data.colour, x0: r.x0, d0: r.d0, seed: r.data.seed, shape: r.data.shape });
  return { witness, token, data: r.data, x0: r.x0, d0: r.d0 };
}


// The reason of the disabled fit button while nothing is shown (fitWhy of explore/state.mjs gives the others).
export { NOTHING_TO_FIT } from "./explore/state.mjs";
// The name of the download button (the witness of the shown region as a JSON file the open button reads again).
export const DOWNLOAD_NAME = "Download (JSON)";

// The visitor's sentences of the errors of opening something (the error's code and message only in the tooltip):
// a link of the address, a pasted token, a file or a pasted JSON text (also a shipped file that is broken), a name of
// the address, a file that cannot be read, a pasted text that is none of these.
export const OPEN_ERRORS = Object.freeze({
  link: "This link does not hold a region.",
  token: "This token does not hold a region.",
  file: "This is not a region file of this site.",
  name: "There is no region of that name.",
  unread: "The file could not be read.",
  paste: "Paste a token, a link of this site, or a region file (JSON).",
});

// chipText(s) is the text of the region chip after its colour square, for s.state:
//   "running"  { cells }          "12345 cells ..."
//   "done"     { area, genus }    "70 cells | genus 4"   (also "witness", "1 cell | genus 0")
//   "capped"   { area }           "more than 200000 cells"
//   "stopped"  { cells }          "at least 812 cells"
//   "infinite" {}                 "infinite"
//   "error"    {}                 "fill failed"
export function chipText(s) {
  const st = s && s.state;
  if (st === "running") return `${cellsText(s.cells || 0)} ...`;
  if (st === "done" || st === "witness") return areaGenusText(s.area, s.genus);
  if (st === "capped") return `more than ${s.area} cells`;
  if (st === "stopped") return `at least ${cellsText(s.cells || 0)}`;
  if (st === "infinite") return "infinite";
  if (st === "error") return "fill failed";
  return "";
}

// failChipText(verify) is the chip text of a witness whose verification failed (the badge says FAIL): a short form
// of its first reason, never a number computed from the stated shape. verify: a record of verifyWitness, or
// { reasons } when the verification could not run.
export function failChipText(verify) {
  const r = String((verify && Array.isArray(verify.reasons) && verify.reasons[0]) || "");
  if (r.startsWith("the verification")) return "not verified";
  if (r.includes("duplicate")) return "duplicate cells";
  if (r.startsWith("stated area") || r.startsWith("recomputed area")) return "wrong area";
  if (r.includes("larger than the cap")) return "region larger than stated";
  if (r.startsWith("seed cell has colour")) return "wrong region type";
  if (r.startsWith("seed is not a cell")) return "start cell outside the shape";
  if (r.includes("genus")) return "wrong genus";
  if (r.startsWith("recomputed region differs")) return "other region";
  if (r.startsWith("digits")) return "wrong digit count";
  return "malformed region";
}

// windowBox({ width, height, cell }) is the box of a click for the region worker: the rectangle of twice the width
// and twice the height of the canvas (CSS pixels) centred on the clicked cell, at cell pixels per cell, as
// { cell, halfWidth, halfHeight } (see boxTest of src/render/hex_canvas.mjs). A canvas side of less than one pixel
// counts as one pixel.
export function windowBox({ width, height, cell }) {
  const side = (v) => (Number.isFinite(v) && v >= 1 ? v : 1);
  return { cell, halfWidth: side(width), halfHeight: side(height) };
}

// The view rests this many milliseconds after its last pan or zoom before the outlined part of a region that is not
// complete is computed again for the new window.
export const REST_MS = 200;

// windowBoxOf({ width, height, cell, at }) is the box of the outlined part of a region that is not complete for the
// view now: the rectangle of twice the canvas width and height centred on the canvas middle (the rule of the click,
// windowBox, for the window of now), grown just enough to hold the start cell (the part is the cells connected to it
// inside the box). at: the screen place [X, Y] of the start cell in canvas pixels. Returns { cell, halfWidth,
// halfHeight, cx, cy } relative to the start cell (see boxTest of src/render/hex_canvas.mjs), whole pixels.
export function windowBoxOf({ width, height, cell, at }) {
  const w = windowBox({ width, height, cell });
  const span = (c, half) => {
    const lo = Math.min(c - half, 0);
    const hi = Math.max(c + half, 0);
    return [Math.round((lo + hi) / 2), Math.max(1, Math.ceil((hi - lo) / 2) + 1)];
  };
  const [cx, halfWidth] = span(width / 2 - at[0], w.halfWidth);
  const [cy, halfHeight] = span(height / 2 - at[1], w.halfHeight);
  return { cell, halfWidth, halfHeight, cx, cy };
}

// witnessNameOf(text) is the name of a shipped witness given in the address (#/explore?w=<name>): letters a-z, digits
// and "_" only, at most 64 characters. Returns the name or null.
export function witnessNameOf(text) {
  const s = typeof text === "string" ? text : "";
  return /^[a-z0-9_]{1,64}$/.test(s) ? s : null;
}

// witnessPathOf(name) is the path of a shipped witness file from the site root, or null for a name witnessNameOf
// rejects.
export function witnessPathOf(name) {
  const n = witnessNameOf(name);
  return n ? `data/witnesses/${n}.json` : null;
}

// The page's own preferences: { cells: "soft" | "full", regionOnClick: boolean }, kept under this localStorage key.
export const EXPLORE_PREFS_KEY = "kronecker-hex-explore";

// readExplorePrefs(text) reads the stored preferences (a JSON text, or null): defaults cells "soft" and
// regionOnClick true, anything unreadable gives the defaults.
export function readExplorePrefs(text) {
  let p = {};
  try {
    p = JSON.parse(text || "{}") || {};
  } catch {
    p = {};
  }
  return { cells: p.cells === "full" ? "full" : "soft", regionOnClick: p.regionOnClick !== false };
}

// ---------- test handles ----------

let current = null;

// testHandles() returns live handles of the mounted page for automated browser checks: { view, store, state (the
// record of explore/state.mjs), shown, selection, mode, token, name, soft (the view draws soft cells), cells ("soft" |
// "full"), regionOnClick, regionRunning, chip (the chip state), overlays (ids of the overlays drawn now), opening
// ({ cells, step } of a link being opened in the worker, or null), popover (id of the open popover or null), mountedMs, jobs (workers started by this mount), symbols (symbols computed on the main
// thread since the mount), restored (what the mount showed from the last visit: "all", "witness", "region", "view" or
// null), kept (the mount took a kept visit) } (null when no Explorer is mounted). Read only.
export function testHandles() {
  return current ? current() : null;
}

// ---------- the page ----------

// Pixels per cell of a fresh view (the key 0 returns to it): the zoom of the home view.
export const DEFAULT_CELL = HOME_VIEW.cell;

function swatch(k) {
  const w = colourName(k);
  return h("span", { class: ["xp-swatch", w ? `xp-swatch-${w}` : null], "aria-hidden": "true" });
}
function setSwatch(el, k) {
  const w = colourName(k);
  el.className = `xp-swatch${w ? ` xp-swatch-${w}` : ""}`;
}
// setData(el, data) makes el's data attributes exactly the entries of data
function setData(el, data) {
  for (const k of Object.keys(el.dataset)) if (!(k in data)) delete el.dataset[k];
  for (const [k, v] of Object.entries(data)) if (el.dataset[k] !== v) el.dataset[k] = v;
}
function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

// workerSlot(start) keeps one worker in step with one kind of job of the state: sync(job) ends the worker of another
// job and starts start(job) for a new one (job: a record with an id, or null for none). start returns the function
// that stops its worker.
function workerSlot(start) {
  let cur = null;
  return (job) => {
    if ((cur ? cur.id : null) === (job ? job.id : null)) return;
    if (cur && cur.stop) cur.stop();
    cur = job ? { id: job.id, stop: null } : null;
    if (cur) cur.stop = start(job);
  };
}

// mount(root, ctx) shows the Explorer in root and returns unmount().
export function mount(root, ctx) {
  const { store, navigate } = ctx;
  const params = ctx.params || {};
  const query = ctx.query || {};
  const tMount = performance.now();
  const styled = useStyles(new URL("../../../styles/explore.css", import.meta.url));

  // ---------- elements ----------
  const host = h("div", { class: "xp", id: "explore" });
  const canvas = h("canvas", { id: "explore-canvas", "aria-label": "Hexagonal grid of the Kronecker symbol: drag to pan, wheel or + and - to zoom, click a cell for its region, keys 0 (zoom), f (fit), r (region of the selected cell), Escape (clear the selection, then close the region)" });
  const viewBox = h("div", { class: "hexview xp-view" }, canvas);

  // top left: x, d, go, reset | open, download (on a phone: one button "x, d" opens the two inputs). The separator
  // parts going to a place from the files.
  const mkInput = (id, label, tip) =>
    h("input", { type: "text", id, inputmode: "numeric", autocomplete: "off", spellcheck: "false", "aria-label": label, title: tip });
  const inX = mkInput("explore-x", "x", "Any integer, or x,d");
  const inD = mkInput("explore-d", "d", "Any integer");
  const goBtn = iconButton("go", "Go (Enter)", { type: "submit", id: "explore-go" });
  const field = (name, el) => h("label", { class: "xp-field" }, h("span", { class: "xp-field-name", "aria-hidden": "true" }, name), el);
  const form = h("form", { class: "xp-form", id: "explore-form" }, field("x", inX), field("d", inD), goBtn);
  const xdBtn = h("button", { type: "button", class: "text-btn xp-xd", id: "explore-xd", title: "Enter x and d", "aria-label": "Enter x and d" }, "x, d");
  const resetBtn = iconButton("home", `Reset to (${HOME_VIEW.x}, ${HOME_VIEW.d})`, { id: "explore-reset" });
  const openBtn = iconButton("open", "Open link or file", { id: "explore-paste-btn" });
  const downloadBtn = iconButton("download", DOWNLOAD_NAME, { id: "explore-download", disabled: true });
  const topSep = h("span", { class: "xp-edit-sep", "aria-hidden": "true" });
  const topLeft = h("div", { class: "xp-tl float", id: "explore-top" }, form, xdBtn, resetBtn, topSep, openBtn, downloadBtn);

  // top right: the view controls of the site (zoom in, zoom out, fit, and the view options when shown)
  const viewControls = createViewControls({ view: () => view, fit: () => fitShown(), homeCell: DEFAULT_CELL, ids: { in: "explore-zoom-in", out: "explore-zoom-out", fit: "explore-zoom-fit" } });
  const gearBtn = SHOW_VIEW_OPTIONS ? iconButton("gear", "Display settings", { id: "explore-gear" }) : null;
  if (gearBtn) viewControls.el.append(gearBtn);
  const topRight = viewControls.el;

  // bottom left: the legend of the region types (the one legend of the site, widgets/legend.mjs)
  const legend = regionLegend({ id: "explore-legend", className: "xp-legend" });
  const bottomLeft = h("div", { class: "xp-bl float" }, legend);

  // bottom right: the chip of the shown region or witness: its text | the page bar (eye, pencil, flask in the order of
  // the header) | the region's own actions (stop while the flood fill runs, then details and X), each separator shown
  // only between two groups that have a button shown. The badge of a witness shows FAIL only, the state of its check
  // is in the chip's text for a screen reader.
  const regionSw = swatch(null);
  const regionText = h("span", { class: "xp-chip-text", id: "region-result" });
  const regionPart = h("span", { class: "xp-chip-part", id: "explore-region", dataset: { state: "idle" }, hidden: true }, regionSw, regionText);
  const badgeHost = h("span", { id: "explore-badge", class: "xp-badge" });
  const witSw = swatch(null);
  const witText = h("span", { class: "xp-chip-text", id: "explore-witness-summary" });
  const witCheck = h("span", { class: "sr-only", id: "explore-witness-check" });
  const witnessPart = h("span", { class: "xp-chip-part", id: "explore-witness", hidden: true }, badgeHost, witSw, witText, witCheck);
  // the page bar (widgets/page_bar.mjs): the eye of this page greyed, the pencil and the flask act on what the chip shows
  const pageBar = createPageBar({
    current: "explore",
    ids: { explore: "explore-page-eye", edit: "region-edit", lab: "explore-open-lab" },
    onPress: { edit: () => editShown(), lab: () => openInLab({ store, navigate }, subjectOf(model.get())) },
    className: "xp-chip-btns",
  });
  const stopBtn = iconButton("stop", "Stop", { id: "region-stop", hidden: true });
  const detailsBtn = iconButton("details", "Details", { id: "explore-details-btn", hidden: true });
  const closeBtn = iconButton("close", "Clear (Esc)", { id: "region-clear", hidden: true });
  const pageActs = pageBar.el;
  const ownActs = h("span", { class: "xp-chip-btns" }, stopBtn, detailsBtn, closeBtn);
  const sepActs = h("span", { class: "xp-edit-sep xp-chip-sep", "aria-hidden": "true" });
  const sepOwn = h("span", { class: "xp-edit-sep", "aria-hidden": "true" });
  const chip = h("div", { class: "xp-chip float", id: "explore-chip", hidden: true }, witnessPart, regionPart, sepActs, pageActs, sepOwn, ownActs);

  // toast and progress
  const toast = createToast({ id: "explore-note", avoid: () => [topLeft, topRight] });
  // a note said before the page's styles loaded is placed again once the controls have their size
  styled.then(() => toast.place());
  const say = toast.say;
  const progress = h("div", { class: "xp-progress float", id: "explore-progress", "aria-live": "off", hidden: true });
  // the opening of a long link in the background: its progress and a cancel button
  const openingText = h("span", { class: "xp-opening-text", id: "explore-opening-text" });
  const openingCancel = iconButton("stop", "Stop", { id: "explore-opening-cancel" });
  const openingEl = h("div", { class: "xp-opening float", id: "explore-opening", role: "status", hidden: true }, openingText, openingCancel);

  // open popover content: the paste box, its two buttons and, under them, the error of a paste (the popover stays open
  // to let the text be corrected, so its error is written where the visitor looks)
  const pasteArea = h("textarea", { id: "explore-paste", rows: "4", spellcheck: "false", placeholder: "Link, token or JSON", "aria-label": "Link, token or JSON" });
  // (the two text buttons say what they do: no tooltip)
  const pasteOpen = h("button", { type: "button", class: "text-btn", id: "explore-paste-open" }, "Open");
  const fileIn = h("input", { type: "file", id: "explore-file", accept: ".json,application/json", class: "xp-hidden", tabindex: "-1", "aria-hidden": "true" });
  const fileBtn = h("button", { type: "button", class: "text-btn", id: "explore-file-btn" }, "Choose a file");
  const pasteError = h("p", { class: "xp-open-error", id: "explore-paste-error", role: "alert", hidden: true });
  const openBody = h("div", { class: "xp-open" }, pasteArea, h("div", { class: "xp-row" }, pasteOpen, fileBtn), pasteError, fileIn);

  // gear popover content: two switches (only while SHOW_VIEW_OPTIONS)
  const mkSwitch = (id, text) => h("button", { type: "button", role: "switch", class: "xp-switch", id, "aria-label": text }, h("span", { class: "xp-switch-box", "aria-hidden": "true" }), text);
  const cellsBtn = SHOW_VIEW_OPTIONS ? mkSwitch("explore-cells", "Soft cells") : null;
  const clickBtn = SHOW_VIEW_OPTIONS ? mkSwitch("explore-region-click", "Region on click") : null;

  host.append(h("h1", { class: "sr-only" }, "Explorer"), viewBox, topLeft, topRight, bottomLeft, chip, progress, openingEl, toast.el);
  root.replaceChildren(host);

  // ---------- popovers ----------
  const group = createPopoverGroup();
  // (a touch on the open button leaves the phone's keyboard down: most visitors there choose a file)
  const openPop = group.create({ anchor: openBtn, host, id: "explore-open", label: "Open", placement: "below", align: "start", className: "xp-pop-open", textOnTouch: false, onOpen: () => clearPasteError() });
  openPop.el.append(openBody);
  if (SHOW_VIEW_OPTIONS) {
    const gearPop = group.create({ anchor: gearBtn, host, id: "explore-settings", label: "Display settings", placement: "below", align: "end" });
    gearPop.el.append(h("div", { class: "xp-gear" }, cellsBtn, clickBtn));
  }
  // the details: as wide as their longest line, up to the page's width less its margins, only then a line wraps
  const detailsPop = group.create({ anchor: detailsBtn, host, id: "explore-details", label: "Details", placement: "above", align: "end", className: "xp-pop-fit", maxWidth: Infinity, build: (el) => buildDetails(el) });
  const xdPop = group.create({ anchor: xdBtn, host, id: "explore-xd-sheet", label: "x and d", placement: "below", align: "start", className: "xp-sheet",
    build: (el) => el.append(form), onClose: () => topLeft.prepend(form) });

  // ---------- state ----------
  const model = createExplorerState({ prefs: loadPrefs() });
  // what the last visit left (null on a first visit, after a reload, or when it was above its bound)
  const kept = takeVisit();
  const src = kept ? kept.source : kroneckerSource(HOME_VIEW.x, HOME_VIEW.d);
  const symbolsAtMount = src.stats().computed;
  let jobs = 0; // workers started by this mount (flood fills, checks, openings of a long link)
  let restored = null; // what the mount showed from the last visit: "all", "witness", "region" or null
  const view = createHexView(canvas, { source: src, cell: DEFAULT_CELL, soft: model.get().prefs.cells === "soft" });
  let destroyed = false;
  let urlTimer = 0;
  let pushNext = false; // the next address written adds a history entry (beginEntry)
  let drawn = null; // { shown, sel, cx, cd, cells, part, ids }: the overlays drawn last
  const offs = [];

  // act(fn, ...args) runs the transition fn of the model, keeps the workers in step with the record, closes the
  // details of a region or witness that went (and rebuilds them when the witness's check ended), draws, and lets
  // the address follow. Returns what fn returns.
  function act(fn, ...args) {
    if (destroyed) return undefined;
    const before = model.get();
    const out = fn(...args);
    const s = model.get();
    syncWorkers(s);
    const wid = (x) => (x.witness ? x.witness.id : null);
    // (a new part of the same region for a new window keeps them: res is the fill's record)
    if (before.region.state !== s.region.state || before.region.res !== s.region.res || wid(before) !== wid(s)) detailsPop.close();
    else if (detailsPop.isOpen() && before.witness !== s.witness) buildDetails(detailsPop.el);
    render();
    if (before.selection !== s.selection || before.witness !== s.witness || before.openError !== s.openError) scheduleAddress();
    return out;
  }

  const makeWorker = () => {
    jobs++;
    return new Worker(new URL("../../workers/floodfill.worker.mjs", import.meta.url), { type: "module" });
  };

  // ---------- page preferences ----------
  function loadPrefs() {
    if (!SHOW_VIEW_OPTIONS) return readExplorePrefs(null);
    let text = null;
    try {
      text = localStorage.getItem(EXPLORE_PREFS_KEY);
    } catch {
      text = null;
    }
    if (text === null) {
      const p = (store.get() && store.get().prefs) || {};
      return readExplorePrefs(JSON.stringify({ cells: p.cells, regionOnClick: p.regionOnClick }));
    }
    return readExplorePrefs(text);
  }
  function setPrefs(p) {
    act(model.setPrefs, p);
    const prefs = model.get().prefs;
    try {
      localStorage.setItem(EXPLORE_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // storage may be unavailable (private mode), the switches then last for this visit only
    }
    store.set({ prefs: { cells: prefs.cells, regionOnClick: prefs.regionOnClick } });
    renderSwitches();
  }
  function renderSwitches() {
    if (!SHOW_VIEW_OPTIONS) return;
    const prefs = model.get().prefs;
    cellsBtn.setAttribute("aria-checked", String(prefs.cells === "soft"));
    cellsBtn.title = "Fade other cells";
    clickBtn.setAttribute("aria-checked", String(prefs.regionOnClick));
    clickBtn.title = "Region on click (R)";
  }

  // ---------- inputs ----------
  // Each input keeps its full value in dataset.full and shows a short form of a long value while it has no focus.
  // A value typed and not yet submitted (dataset.dirty) is never replaced by the address mirror.
  const setInput = (el, v) => {
    const s = String(v);
    el.dataset.full = s;
    delete el.dataset.dirty;
    el.value = document.activeElement === el ? s : shortNumber(s);
  };
  const inputValue = (el) => (document.activeElement !== el && el.value === shortNumber(el.dataset.full || "") ? el.dataset.full || "" : el.value);
  for (const el of [inX, inD]) {
    // on focus a long value comes back in full and selected (typing then replaces it, as with a short value)
    el.addEventListener("focus", () => {
      if (el.dataset.full !== undefined && el.value !== el.dataset.full && el.value === shortNumber(el.dataset.full)) {
        el.value = el.dataset.full;
        el.select();
      }
    });
    el.addEventListener("input", () => Object.assign(el.dataset, { full: el.value, dirty: "1" }));
    el.addEventListener("blur", () => {
      el.dataset.full = el.value;
      el.value = shortNumber(el.value);
    });
  }

  // ---------- the view, the address and the store mirror ----------
  const offsetOf = (ax, ad) => {
    const di = ax - src.x;
    const dj = ad - src.d;
    if (absBig(di) > BigInt(OFFSET_SAFE) || absBig(dj) > BigInt(OFFSET_SAFE)) return null;
    return [Number(di), Number(dj)];
  };
  // viewKey(v) changes with every pan and zoom: the middle cell, the cell size and the place of the middle cell
  // relative to the canvas middle
  function viewKey(v = view.getView()) {
    const [X, Y] = view.toScreen(v.middle[0], v.middle[1]);
    return `${v.x},${v.d},${v.cell},${Math.round((X - v.width / 2) * 100)},${Math.round((Y - v.height / 2) * 100)}`;
  }
  // viewInfo() is the view for addressOf: { x, d, cell, key, at (the canvas middle minus the screen place
  // of the opened witness's base cell, in pixels, or null) }
  function viewInfo() {
    const v = view.getView();
    const w = model.get().witness;
    const off = w ? offsetOf(w.x0, w.d0) : null;
    const p = off ? view.toScreen(off[0], off[1]) : null;
    return { x: v.x, d: v.d, cell: v.cell, key: viewKey(v), at: p ? [v.width / 2 - p[0], v.height / 2 - p[1]] : null };
  }
  // the x and d fields show what the user pointed at last (fieldsOf of explore/state.mjs): the clicked cell while the
  // view has not moved since the click, the seed cell of a witness the chip shows, else the view centre. A field with
  // the focus or a typed value not yet submitted is never overwritten.
  function mirrorFields(v) {
    if (document.activeElement === inX || document.activeElement === inD || inX.dataset.dirty || inD.dataset.dirty) return;
    const f = fieldsOf(model.get(), v);
    if (inX.dataset.full !== f.x) setInput(inX, f.x);
    if (inD.dataset.full !== f.d) setInput(inD, f.d);
  }
  // setFields(x, d) writes both fields (a value typed and not yet submitted goes)
  const setFields = (x, d) => {
    setInput(inX, String(x));
    setInput(inD, String(d));
  };
  function writeAddress() {
    if (urlTimer) clearTimeout(urlTimer);
    urlTimer = 0;
    if (destroyed) return;
    const v = viewInfo();
    if (v.x === null) return;
    const s = model.get();
    store.set({ view: { x: v.x, d: v.d, cell: v.cell, selection: selectionOffset(s, v) } });
    mirrorFields(v);
    // the 2000-digit rule gives the bare #/explore, a link that could not be opened (null) stays until the view moves
    // or the visitor acts
    const href = addressOf(s, v);
    if (href !== null) mirror(href);
  }
  const scheduleAddress = () => {
    if (urlTimer) clearTimeout(urlTimer);
    urlTimer = setTimeout(writeAddress, 200);
  };
  // History: Go with typed values and opening a link, a token or a file add a history entry (beginEntry before the
  // action, the first address written after it is pushed), every other change of the view replaces the current one.
  // beginEntry first writes a pending address of the view before the action, so Back returns to that view.
  function beginEntry() {
    act(model.endOpening);
    if (urlTimer) writeAddress();
    pushNext = true;
  }
  function mirror(href) {
    const push = pushNext;
    pushNext = false;
    navigate(href, undefined, { replace: !push, silent: true });
  }

  offs.push(
    view.onFrame((f) => {
      if (f.pending > 0) {
        const pct = f.cells ? Math.floor((100 * (f.cells - f.pending)) / f.cells) : 0;
        progress.textContent = `computing colours ${pct}%`;
        progress.dataset.pending = String(f.pending);
        progress.hidden = false;
      } else {
        const w = model.get().witness;
        if (w && w.paintMs === undefined) act(model.painted, performance.now() - w.shownAt);
        progress.dataset.pending = "0";
        progress.hidden = true;
      }
    }),
  );
  offs.push(view.onViewChange(() => (act(model.viewChanged, viewKey()), scheduleAddress(), rewindowAtRest())));

  // ---------- render ----------
  // drawOverlays(s): the selected cell carries the cell marker, the shown region its outline. The view is soft when
  // the switch says so, or around a complete shown region. Redrawn only when one of them or the centre changed.
  function drawOverlays(s) {
    const shown = shownOf(s);
    const noFit = fitWhy(s);
    viewControls.setFit(!noFit, noFit);
    const same = drawn && drawn.shown === shown && drawn.cx === src.x && drawn.cd === src.d;
    if (same && drawn.sel === s.selection && drawn.cells === s.prefs.cells) return;
    let part = same ? drawn.part : [];
    if (!same && shown) {
      const off = offsetOf(shown.ax, shown.ad);
      if (off) part = [region(off[0] === 0 && off[1] === 0 ? shown.cells : shown.cells.map(([i, j]) => [i + off[0], j + off[1]]))];
    }
    const selOff = s.selection ? offsetOf(s.selection.x, s.selection.d) : null;
    const list = [...(selOff ? [marker(selOff)] : []), ...part];
    view.setSoft(s.prefs.cells === "soft" || (part.length > 0 && shown.fade));
    view.setOverlays(list);
    drawn = { shown, sel: s.selection, cx: src.x, cd: src.d, cells: s.prefs.cells, part, ids: list.map((o) => o.id) };
  }

  // offer(page, action, blocked, why): a page action of the page bar, disabled when it is blocked or not offered, its
  // tooltip then the short reason alone (a disabled control keeps its place and says why)
  function offer(page, action, blocked, why) {
    pageBar.set(page, blocked || (action ? null : why || "Not available"));
  }

  // the badge of a witness: FAIL with its details behind the details button, nothing while the check runs or once it
  // passed (the chip's text then says "verifying" or "verified" to a screen reader)
  function setBadge(w) {
    const failed = !!w.verify && w.verify.pass !== true;
    setText(witCheck, failed ? "" : w.verify ? "verified" : "verifying");
    if (failed === (badgeHost.childElementCount > 0)) return;
    badgeHost.replaceChildren(...(failed ? [badge(false)] : []));
  }

  // builtByEditor(s): the chip shows the witness that the shape editor's Build made in this visit (the editor still
  // holds its shape and history)
  const builtByEditor = (s) => chipOf(s) === "witness" && !!s.witness.token && s.witness.token === (store.get().editor || {}).built;

  // keepFocus(el): when el held the focus and is a control of the page's floating rows that is now hidden or
  // disabled, the focus goes to the canvas (never to the page body)
  function keepFocus(el) {
    if (!el || el === canvas || !host.contains(el) || el.closest(".popover")) return;
    if (el.disabled || el.closest("[hidden]") || el.getClientRects().length === 0) canvas.focus({ preventScroll: true });
  }

  // render(): the chip, its data attributes, the overlays, the download button and the opening line, all from the
  // record (and the view for the link)
  function render() {
    const focused = document.activeElement;
    const s = model.get();
    drawOverlays(s);
    const part = chipOf(s);
    const r = s.region;
    const w = s.witness;
    setData(regionPart, regionDataOf(s));
    setData(witnessPart, witnessDataOf(s));
    if (part === "region") {
      setText(regionText, chipText(r.state === "running" ? { state: r.state, cells: r.last ? r.last.cells : 0 } : r.state === "stopped" ? { state: r.state, cells: r.count } : { state: r.state, area: r.res ? r.res.area : 0, genus: r.res ? r.res.genus : null }));
      setSwatch(regionSw, r.colour);
    }
    if (w) {
      setBadge(w);
      setSwatch(witSw, w.colour);
      setText(witText, w.verify && w.verify.pass !== true ? failChipText(w.verify) : chipText({ state: "witness", area: w.area, genus: w.genus }));
    }
    regionPart.hidden = part !== "region";
    witnessPart.hidden = part !== "witness";
    chip.hidden = part === "idle";
    chip.dataset.state = part === "region" ? r.state : part;
    const finished = part === "region" && r.state !== "running";
    const settled = part === "witness" || finished;
    stopBtn.hidden = r.state !== "running";
    // the shared actions of the region or witness shown (the same conditions as the Gallery's cards), disabled with
    // one reason for a witness that failed its check, and with the reason of regionActions when not offered. A region
    // they can edit is the selection of the site (the header's Edit and Algorithm open it), and it stays so when the
    // Explorer's selection is cleared. The witness of the editor's Build is not made the selection: its pencil goes
    // back to the editor's own history.
    const blocked = blockedOf(s);
    const subject = subjectOf(s);
    const acts = regionActions(subject);
    if (acts.edit && !blocked && !builtByEditor(s)) selectRegion(store, subject);
    offer("edit", acts.edit, blocked, acts.editWhy);
    offer("lab", acts.lab, blocked, acts.labWhy);
    detailsBtn.hidden = !settled;
    closeBtn.hidden = !settled;
    setIconLabel(closeBtn, `${clearRule(s) || "Clear"} (Esc)`);
    // the separators stand only between two groups that have a button shown
    const anyShown = (g) => [...g.children].some((b) => !b.hidden);
    sepActs.hidden = !anyShown(pageActs);
    sepOwn.hidden = !anyShown(ownActs) || !anyShown(pageActs);
    const dl = downloadOf(s);
    downloadBtn.disabled = !dl.build;
    // the name of the action stays its accessible name, the tooltip of a disabled button is its reason
    setIconLabel(downloadBtn, DOWNLOAD_NAME);
    if (!dl.build) downloadBtn.title = dl.why;
    openingEl.hidden = !s.opening;
    if (s.opening) {
      setText(openingText, `opening the link of ${s.opening.cells} cells: ${s.opening.step < 0 ? "starting" : `step ${s.opening.step + 1} of 5`}`);
      openingEl.dataset.step = String(s.opening.step);
    }
    keepFocus(focused);
  }

  // ---------- the workers, each in step with its job of the record ----------
  const syncFill = workerSlot((job) => {
    const t0 = performance.now();
    // the window at the moment of the click: a region that is not complete is outlined inside twice this window
    const box = windowBox({ width: canvas.clientWidth, height: canvas.clientHeight, cell: view.getView().cell });
    const failed = (text) => act(model.fillFailed, job.id) && say(text, "error");
    const w = makeWorker();
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") act(model.fillProgress, job.id, m);
      else if (m.type === "filled") {
        // a complete region is outlined whole, any other by its part inside the box of the click
        const part = m.result.complete ? null : { count: m.window.count, cut: m.window.cut, limit: m.window.limit, box };
        act(model.fillDone, job.id, m.result, cellsOfFlat(part ? m.window.flat : m.flat), part, performance.now() - t0);
      } else if (m.type === "error") failed(`flood fill failed: ${m.message}`);
    };
    w.onerror = (e) => (e.preventDefault(), failed("the flood fill could not start"));
    w.postMessage({ type: "fill", id: job.id, x: job.x.toString(), d: job.d.toString(), cap: FILL_CAP, box });
    return () => w.terminate();
  });
  const syncVerify = workerSlot((wit) => {
    const w = makeWorker();
    const failed = (reason) => act(model.verifyFailed, wit.id, reason);
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "verified") act(model.verifyDone, wit.id, m.result, m.ms, performance.now() - wit.t0);
      else failed(`the verification could not run: ${m.message}`);
    };
    w.onerror = (e) => (e.preventDefault(), failed("the verification worker could not start"));
    w.postMessage({ type: "verify", id: wit.id, witness: wit.witness });
    return () => w.terminate();
  });
  // the outlined part of a region that is not complete, again for the window where the view came to rest (the old
  // outline stays until it ends, a job for an older window is stopped with its worker)
  const syncWindow = workerSlot((job) => {
    const w = makeWorker();
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "windowed") act(model.windowDone, job.id, cellsOfFlat(m.window.flat), m.window);
      else act(model.windowFailed, job.id);
    };
    w.onerror = (e) => (e.preventDefault(), act(model.windowFailed, job.id));
    w.postMessage({ type: "window", id: job.id, x: job.x.toString(), d: job.d.toString(), box: job.box });
    return () => w.terminate();
  });
  // rewindowAtRest(): the box of the view now around the start cell of the shown part (windowBoxOf), REST_MS after the
  // last pan or zoom
  let restTimer = 0;
  function rewindowAtRest() {
    if (restTimer) clearTimeout(restTimer);
    restTimer = 0;
    const r = model.get().region;
    if (destroyed || !r.part) return;
    restTimer = setTimeout(() => {
      restTimer = 0;
      const now = model.get().region;
      const off = now.part ? offsetOf(now.x, now.d) : null;
      if (!off) return;
      const at = view.toScreen(off[0], off[1]);
      act(model.rewindow, windowBoxOf({ width: canvas.clientWidth, height: canvas.clientHeight, cell: view.getView().cell, at }));
    }, REST_MS);
  }
  // a long link opens in the construct worker (openTokenInWorker of the one construction runner, loaded only for such
  // a link): the history entry the action asked for (beginEntry) is kept for the region, a pan while the link opens
  // replaces the entry
  const syncOpening = workerSlot((o) => {
    let handle = null;
    let dropped = false;
    const fail = (e) => {
      const now = model.get().opening;
      if (dropped || !now || now.id !== o.id) return;
      showOpenError(e, o.what);
      if (o.fromRoute) goHome();
      act(o.fromRoute ? model.openFailed : model.endOpening, viewKey());
    };
    import("../construct_runner.mjs").then(
      (runner) => {
        if (dropped || destroyed) return;
        jobs++;
        handle = runner.openTokenInWorker(o.token, {
          onStep: (step) => act(model.openingStep, o.id, step),
          onError: fail,
          onDone: (op) => {
            const witness = makeWitness({ id: op.data.id, colour: op.data.colour, x0: op.x0, d0: op.d0, seed: op.data.seed, shape: op.data.shape });
            pushNext = o.entry;
            showWitness({ witness, token: o.token, source: "token", t0: o.t0, openMs: performance.now() - o.t0, wv: o.view });
          },
        });
      },
      (e) => (console.error(e), fail({ code: "stopped", message: "the background computation could not start" })),
    );
    return () => {
      dropped = true;
      if (handle) handle.cancel();
    };
  });
  function syncWorkers(s) {
    syncFill(s.job);
    syncVerify(s.witness && !s.witness.verify ? s.witness : null);
    syncOpening(s.opening);
    syncWindow(s.windowJob);
  }

  // ---------- selection ----------
  offs.push(
    view.onCellClick(([i, j]) => {
      // the fields show the clicked cell (the view does not move) until the next pan or zoom
      act(model.selectCell, src.x + BigInt(i), src.d + BigInt(j), { key: viewKey() });
      mirrorFields(view.getView());
    }),
  );

  // ---------- keys, double click, wheel over the floating controls ----------
  // (the keys +, -, 0 and f belong to the view controls, on the whole page)
  const onCanvasKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const sel = model.get().selection;
    if ((e.key === "r" || e.key === "R") && sel) act(model.startFill, sel.x, sel.d);
    else return;
    e.preventDefault();
  };
  // Escape anywhere on the page does what the chip's X does (an open popover was already closed by the popover
  // group, which stops the key)
  const onDocKey = (e) => {
    if (e.key !== "Escape" || e.defaultPrevented || destroyed) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    act(model.clearOrClose);
    e.preventDefault();
  };
  const onDouble = (e) => {
    const r = canvas.getBoundingClientRect();
    const [i, j] = view.cellAt(e.clientX - r.left, e.clientY - r.top);
    const [X, Y] = view.toScreen(i, j);
    view.panBy(canvas.clientWidth / 2 - X, canvas.clientHeight / 2 - Y);
    view.zoomStep(1);
  };
  // the wheel zooms everywhere outside a popover, also over the floating controls
  const onWheel = (e) => {
    const t = e.target;
    if (t === canvas || (t && t.closest && t.closest(".popover"))) return;
    e.preventDefault();
    canvas.dispatchEvent(new WheelEvent("wheel", { clientX: e.clientX, clientY: e.clientY, deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, bubbles: false, cancelable: true }));
  };
  canvas.addEventListener("keydown", onCanvasKey);
  canvas.addEventListener("dblclick", onDouble);
  document.addEventListener("keydown", onDocKey);
  host.addEventListener("wheel", onWheel, { passive: false });
  offs.push(() => {
    canvas.removeEventListener("keydown", onCanvasKey);
    canvas.removeEventListener("dblclick", onDouble);
    document.removeEventListener("keydown", onDocKey);
    host.removeEventListener("wheel", onWheel);
  });
  offs.push(() => viewControls.destroy());
  if (SHOW_VIEW_OPTIONS) {
    cellsBtn.addEventListener("click", () => setPrefs({ cells: model.get().prefs.cells === "soft" ? "full" : "soft" }));
    clickBtn.addEventListener("click", () => setPrefs({ regionOnClick: !model.get().prefs.regionOnClick }));
  }

  // ---------- the chip's buttons ----------
  downloadBtn.addEventListener("click", () => {
    const dl = downloadOf(model.get());
    if (!dl.build) return;
    const f = witnessFile(dl.build());
    downloadBlob(f.blob, f.name);
  });
  stopBtn.addEventListener("click", () => act(model.stopFill));
  // the pencil of the page bar: the region becomes the selection and the editor opens it, except the witness of the
  // editor's own Build, which goes back to the editor's history (the editor still holds that shape)
  // The editor keeps this page's address with the shape and region type it opens (store.editor.origin, with the stamp
  // of the selection the drawing comes from): its eye comes back here, without a new construction, while the drawing
  // is still that shape in that type.
  function editShown() {
    const s = model.get();
    if (urlTimer) writeAddress();
    const subject = subjectOf(s);
    const built = builtByEditor(s);
    if (!built) selectRegion(store, subject);
    const stamp = built ? (store.get().editor || {}).stamp : store.get().selection.stamp;
    store.set({ editor: { origin: { href: location.hash, cells: subject.cells, colour: subject.colour, stamp } } });
    if (built) navigate(EDIT_PATH);
    else openInEditor({ store, navigate }, subject);
  }
  // the X: the same as Escape (a selection or a computed region goes, else the witness shown alone closes)
  closeBtn.addEventListener("click", () => act(model.clearOrClose));

  // ---------- details popover ----------
  function bigRow(value, label) {
    const el = h("div", { class: "xp-big" });
    bigNumber(el, value, { label });
    return el;
  }
  // buildDetails(el): the lines of detailsOf, the same for a region found by a click and an opened witness
  function buildDetails(el) {
    const t = detailsOf(model.get());
    const kids = [];
    if (t) {
      if (t.fail) kids.push(h("p", { class: "xp-error" }, "FAIL"), h("ul", { class: "xp-reasons" }, t.fail.map((r) => h("li", null, String(r)))));
      kids.push(bigRow(t.x, "x"), bigRow(t.d, "d"));
      if (t.gcd !== null) kids.push(bigRow(t.gcd, "gcd(x, d)"));
      for (const n of t.notes) kids.push(h("p", n.id ? { id: n.id, dataset: { reason: n.reason } } : null, n.text));
    }
    el.replaceChildren(h("div", { class: "xp-details" }, kids));
  }

  function fitShown() {
    const shown = shownOf(model.get());
    if (!shown) return;
    // a region too far from the centre for an offset becomes the centre first
    if (!offsetOf(shown.ax, shown.ad)) {
      view.setCentre(shown.ax, shown.ad);
      drawOverlays(model.get());
    }
    const [di, dj] = offsetOf(shown.ax, shown.ad);
    view.fit(shown.cells.map(([i, j]) => [i + di, j + dj]));
  }

  // ---------- witnesses ----------
  // showWitness({ witness, token, source, name, t0, openMs, wv }): the shape is checked before the view moves or
  // anything is drawn, then the view goes to the witness (fitted, or the view wv = { cell, at } of its address) and
  // the witness is opened (its check starts). It waits for the page's styles, which give the canvas its size: a link
  // opened as the page starts is fitted to the same canvas as one opened later.
  async function showWitness({ witness, token, source, name = null, t0, openMs, wv = null }) {
    await styled;
    if (destroyed) return;
    const x0 = parseBigIntStrict(witness.x0);
    const d0 = parseBigIntStrict(witness.d0);
    if (x0 === null || d0 === null) {
      showOpenError(new CodedError("bad_format", "The region file has no valid x and d."), OPEN_ERRORS.file);
      return;
    }
    try {
      checkShapeCells(witness.shape);
    } catch (e) {
      showOpenError(e, OPEN_ERRORS.file);
      return;
    }
    placeWitness(x0, d0, witness.shape, wv);
    act(model.openWitness, { witness, x0, d0, token, source, name, t0, shownAt: performance.now(), openMs, fromAddress: !!wv });
    say("");
    writeAddress();
  }

  // placeWitness(x0, d0, shape, wv): the view goes to a witness, fitted to its shape or at the view wv = { cell, at }
  // of its address (a typed value not yet submitted is dropped)
  function placeWitness(x0, d0, shape, wv) {
    delete inX.dataset.dirty;
    delete inD.dataset.dirty;
    view.setCentre(x0, d0);
    if (wv) {
      if (wv.cell !== null) view.setCell(wv.cell);
      const z = view.getView().cell;
      view.panBy(-wv.at[0] * z, -wv.at[1] * z);
    } else view.fit(shape);
  }

  // ---------- a return: what the last visit left ----------
  // restoreKept(part, fromAddress) shows the parts of the kept record (restoreOf of explore/cache.mjs) without a new
  // job, then starts the flood fill of a kept selection whose region could not be used again. The x and d fields show
  // the kept clicked cell (the first view change drops it when the view is not the one of the click).
  function restoreKept(part, fromAddress) {
    restored = part.witness ? (part.selection ? "all" : "witness") : part.selection ? "region" : "view";
    act(model.restore, part, { fromAddress, shownAt: performance.now() });
    if (part.refill) act(model.selectCell, part.selection.x, part.selection.d, { fill: true });
    mirrorFields(view.getView());
    // a kept part of a region that is not complete follows the window of this view (the rule after a pan or zoom)
    rewindowAtRest();
  }
  // restoreWitness(part, wv): a kept witness asked for by its token or name, placed as a fresh one
  async function restoreWitness(part, wv) {
    await styled;
    if (destroyed) return;
    const w = part.witness;
    placeWitness(w.x0, w.d0, w.witness.shape, wv);
    restoreKept(part, !!wv);
    writeAddress();
  }

  // showOpenError(e, sentence, inPaste): an error of opening for a visitor (errorNote: the sentence, the code and the
  // message in its tooltip, the code also in data-code), written under the paste box's buttons for a paste (inPaste),
  // else in the note line
  function showOpenError(e, sentence, inPaste = false) {
    const code = (e && e.code) || "error";
    if (!inPaste) {
      say(errorNote(sentence, e), "error", code);
      return;
    }
    pasteError.replaceChildren(...errorNote(sentence, e));
    pasteError.dataset.code = code;
    pasteError.hidden = false;
  }
  function clearPasteError() {
    pasteError.replaceChildren();
    delete pasteError.dataset.code;
    pasteError.hidden = true;
  }

  // openTokenText(text, fromRoute, wv, inPaste) opens a token: the checks that need no number at once, then the
  // rebuild on the main thread or, when runPlace says so, in the construct worker (the region is shown when it ends).
  // Returns false when the token was refused at once (the error then goes where showOpenError puts it).
  function openTokenText(text, fromRoute, wv = null, inPaste = false) {
    const t0 = performance.now();
    const what = fromRoute ? OPEN_ERRORS.link : OPEN_ERRORS.token;
    const token = String(text).trim();
    // a link of the address that cannot be opened lands at the home view (and stays in the address until the view
    // moves or the visitor acts)
    const refuse = (e) => {
      showOpenError(e, what, inPaste);
      if (fromRoute) {
        goHome();
        act(model.openFailed, viewKey());
      }
      return false;
    };
    let read;
    try {
      read = readToken(token);
    } catch (e) {
      return refuse(e);
    }
    if (runPlace({ replay: read.data }) === "worker") {
      act(model.startOpening, { token, cells: read.data.shape.length, fromRoute, entry: pushNext, what, t0, view: wv });
      pushNext = false;
      say("");
      return true;
    }
    let r;
    try {
      r = witnessFromToken(token);
    } catch (e) {
      return refuse(e);
    }
    showWitness({ witness: r.witness, token: r.token, source: "token", t0, openMs: performance.now() - t0, wv });
    return true;
  }
  openingCancel.addEventListener("click", () => {
    if (act(model.cancelOpening, viewKey())) say("Opening the link cancelled");
  });

  // openJsonText(text, sentence, name, wv, inPaste) opens a witness or packed JSON text. Returns false when it was
  // refused (the error with the visitor's sentence goes where showOpenError puts it).
  function openJsonText(text, sentence, name = null, wv = null, inPaste = false) {
    const t0 = performance.now();
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      showOpenError(new CodedError("bad_json", e && e.message), sentence, inPaste);
      return false;
    }
    let r;
    try {
      r = witnessFromObject(obj);
    } catch (e) {
      showOpenError(e, sentence, inPaste);
      return false;
    }
    showWitness({ witness: r.witness, token: r.token, source: name && r.source === "witness" ? "named" : r.source, name: r.token ? null : name, t0, openMs: performance.now() - t0, wv });
    return true;
  }

  async function openNamed(raw, wv) {
    const name = witnessNameOf(raw);
    if (!name) {
      const e = new CodedError("bad_name", `A region name has only a-z, 0-9 and _, got ${JSON.stringify(String(raw).slice(0, 40))}`);
      showOpenError(e, OPEN_ERRORS.name);
      return;
    }
    let text;
    try {
      text = JSON.stringify(await loadJson(new URL(`../../../${witnessPathOf(name)}`, import.meta.url)));
    } catch (e) {
      if (!destroyed) showOpenError(e, OPEN_ERRORS.name);
      return;
    }
    if (!destroyed) openJsonText(text, OPEN_ERRORS.file, name, wv);
  }

  // ---------- controls ----------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const r = parseCoordinates(inputValue(inX), inputValue(inD));
    if (r.error) {
      say(r.error, "error");
      return;
    }
    xdPop.close();
    beginEntry();
    setFields(r.x, r.d);
    view.setCentre(r.x, r.d);
    say("");
    act(model.goTo, r.x, r.d);
  });
  // goHome(): the view goes to the home view of the site (HOME_VIEW, the view "#/" opens), the fields show it
  function goHome() {
    view.setCentre(HOME_VIEW.x, HOME_VIEW.d);
    view.setCell(HOME_VIEW.cell);
    setFields(HOME_VIEW.x, HOME_VIEW.d);
  }
  // selectHome(): the default state of the page: the cell of the home view selected with its region, as a click on it
  const selectHome = () => act(model.selectCell, HOME_VIEW.x, HOME_VIEW.d, { fill: true });
  // reset: the home view in its default state, the home cell selected (one history entry, as Go)
  resetBtn.addEventListener("click", () => {
    xdPop.close();
    beginEntry();
    act(model.reset);
    goHome();
    say("");
    selectHome();
  });
  fileBtn.addEventListener("click", () => fileIn.click());
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    let text;
    try {
      text = await f.text();
    } catch (e) {
      showOpenError(e, OPEN_ERRORS.unread);
      return;
    }
    fileIn.value = "";
    if (destroyed) return;
    openPop.close();
    beginEntry();
    if (!openJsonText(text, OPEN_ERRORS.file)) pushNext = false;
  });
  pasteArea.addEventListener("input", () => clearPasteError());
  pasteOpen.addEventListener("click", () => {
    const c = classifyPaste(pasteArea.value);
    let ok = false;
    clearPasteError();
    beginEntry();
    if (c.kind === "json") ok = openJsonText(c.text, OPEN_ERRORS.file, null, null, true);
    else if (c.kind === "token") ok = openTokenText(c.text, false, null, true);
    else showOpenError(new CodedError("bad_paste", "Not a token, a link of this site, or a JSON object."), OPEN_ERRORS.paste, true);
    if (ok) openPop.close();
    else pushNext = false;
  });

  // ---------- start ----------
  renderSwitches();
  // an opened witness keeps the view its address holds (z and at), else it is fitted
  if (params.token !== undefined) {
    const part = restoreOf(kept, { kind: "token", token: String(params.token).trim() });
    if (part) restoreWitness(part, witnessViewOf(query));
    else openTokenText(params.token, true, witnessViewOf(query));
    const v = view.getView();
    if (!model.get().witness && v.x !== null) setFields(v.x, v.d);
  } else if (Object.keys(query).length === 0 && kept && kept.state) {
    // #/explore with no query (the header's link): everything as it was left, at the kept place of the view
    view.setPlace(kept.place);
    restoreKept(restoreOf(kept, { kind: "bare" }), true);
  } else {
    const q = readViewQuery(query);
    const sv = store.get().view || {};
    let x = q.x;
    let d = q.d;
    if (x === null || d === null) {
      x = parseBigIntStrict(String(sv.x === undefined ? "" : sv.x));
      d = parseBigIntStrict(String(sv.d === undefined ? "" : sv.d));
      if (x === null || d === null) {
        x = HOME_VIEW.x;
        d = HOME_VIEW.d;
      }
    }
    const cell = q.cell !== null ? q.cell : Number.isFinite(sv.cell) ? sv.cell : DEFAULT_CELL;
    // a cell near the kept centre is shown without moving the centre: its computed cells are used again
    const near = kept ? nearOffset(src, x, d) : null;
    if (near) view.setPlace({ at: planeOf(near[0], near[1]), cell });
    else {
      view.setCentre(x, d);
      view.setCell(cell);
    }
    setFields(x, d);
    if (query.w !== undefined) {
      const name = witnessNameOf(query.w);
      const part = name ? restoreOf(kept, { kind: "named", name }) : null;
      if (part) restoreWitness(part, witnessViewOf(query));
      else openNamed(query.w, witnessViewOf(query));
    } else {
      const sel = q.x !== null ? q.sel : Array.isArray(sv.selection) ? sv.selection : null;
      // a selected cell in the address (or kept from the last visit) reopens with its region: the kept one when it is
      // that cell's, else computed
      if (sel) {
        const sx = x + BigInt(sel[0]);
        const sd = d + BigInt(sel[1]);
        const part = restoreOf(kept, { kind: "plain", sel: { x: sx, d: sd } });
        if (part) restoreKept(part, false);
        else act(model.selectCell, sx, sd, { fill: true });
      } else if (x === HOME_VIEW.x && d === HOME_VIEW.d) {
        // the home view without a selection (a first visit, the site name, the reset, a reload of the home address): its
        // default state, the home cell selected
        selectHome();
      }
      if (q.problems.length) say(q.problems.join(" "), "error");
    }
  }
  render();

  current = () => {
    const s = model.get();
    const sh = shownOf(s);
    const w = s.witness || {};
    return {
      view, store, state: s, mode: modeOf(s), token: w.token || null, name: w.name || null, soft: view.isSoft(), cells: s.prefs.cells,
      shown: sh ? { ax: sh.ax.toString(), ad: sh.ad.toString(), cells: sh.cells, fade: sh.fade, kind: sh.kind, part: sh.part || null } : null,
      selection: s.selection ? { x: s.selection.x.toString(), d: s.selection.d.toString() } : null,
      regionOnClick: s.prefs.regionOnClick, regionRunning: s.job !== null, chip: chip.dataset.state, overlays: drawn ? drawn.ids.slice() : [],
      opening: s.opening ? { cells: s.opening.cells, step: s.opening.step } : null, popover: group.openOne() ? group.openOne().el.id : null,
      mountedMs: performance.now() - tMount,
      jobs, symbols: src.stats().computed - symbolsAtMount, restored, kept: !!kept,
    };
  };

  return () => {
    destroyed = true;
    current = null;
    // what a return shows: the colour source always, the record only when no job runs (a running flood fill or
    // opening starts again on return)
    const s = model.get();
    keepVisit({ source: src, state: s.job || s.opening ? null : s, place: view.getPlace() });
    if (urlTimer) clearTimeout(urlTimer);
    urlTimer = 0;
    toast.destroy();
    if (restTimer) clearTimeout(restTimer);
    syncWorkers({ job: null, witness: null, opening: null, windowJob: null });
    for (const off of offs) off();
    group.destroy();
    view.destroy();
    root.replaceChildren();
  };
}
