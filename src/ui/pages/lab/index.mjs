// The Algorithm page (#/algorithm, "the Lab" in the code: the folder, the ids and the store keys): shows, step by step,
// how integers x0, d0 are built so that the region of the Kronecker colouring around (x0, d0) is exactly a prescribed
// shape.
//
// The page owns one control row of 40 px (the stepper at the left, then at the right the status chip, the PASS / FAIL
// badge, the "details" disclosure and the buttons), the centre canvas (the page bar at its bottom right) and the two
// tables of the construction on the right. The $...$ formulas of a step's text panel are typeset with renderMathIn
// after the step has filled it. The page shows the theory stepped through on an example: the panels show the numbers
// of the example, never how the page obtained them (no times, no modes).
//
// Everything that differs between the kinds of construction (green and red, blue) comes from the entry of the kind
// in ./kinds.mjs, chosen when a run begins: the step modules, the view model, the tables, the extras, the error and
// progress texts, the presets and the input records. Each step is a module with { subCount(view), render(panel, view,
// sub, kit) } that fills the text panel on the left and sets the canvas through the kit object, under the heading
// that the frame (renderStep of ./kinds.mjs) writes from the table of ./steps.mjs; render returns false while the
// step has nothing to show, and the frame then clears the canvas. The view a step gets is the kind's view with the
// tries of the result joined to it (withSearch of ./search.mjs: a replay shows the rejected candidates and the
// residues R tried only once they are known for its result).
// The extras module of the kind adds tools to a toolbar through mountExtras(toolbar, kit, { canvasBox }) (canvasBox:
// the box around the canvas, for a line drawn over it). Everything is drawn from the view model of the kind and the
// result of the construction, never from the raw events. A run of another kind than the one shown rebuilds the
// stepper, the table heads and the extras, and starts at step 0.
//
// Inputs, in this order: the route #/algorithm/w/<token> (a replay, on the main thread or in the worker as runPlace of the
// construction modules decides, its tag checked against the replayed x0), the query ?preset=..&colour=..&mode=..
// (computed shapes live on the main thread, the compact shapes replay their stored token or recompute in the worker),
// the selection of the site when it is newer than the Lab's input (labParams of src/ui/actions.mjs), a shape sent by
// the shape editor or taken from the selection (store lab.input, else its copy in sessionStorage), or a start panel
// (which has no canvas: the canvas, the stepper and the table appear with the first run).

import { h, useStyles, loadJson } from "../../dom.mjs";
import { createHexView, staticSource, resolveColours, hexPath } from "../../../render/hex_canvas.mjs";
import { marker } from "../../../render/overlays.mjs";
import { bigNumber } from "../../widgets/bignum.mjs";
import { createStepper } from "../../widgets/stepper.mjs";
import { createTimeline } from "../../widgets/timeline.mjs";
import { passBadge } from "../../widgets/badge.mjs";
import { icon, iconButton } from "../../widgets/icons.mjs";
import { explorerTokenHref, labParams, labHref, openInEditor, liveRunProblem } from "../../actions.mjs";
import { EDIT_PATH } from "../../routes.mjs";
import { renderMathIn } from "../../widgets/math.mjs";
import { createPopoverGroup } from "../../widgets/popover.mjs";
import { createOffsetsReadout } from "../../widgets/offsets_readout.mjs";
import { createViewControls } from "../../widgets/view_controls.mjs";
import { createPageBar } from "../../widgets/page_bar.mjs";
import { runPlace } from "../../../construct/index.mjs";
import { openToken, readToken, tagMatches } from "../../../formats/token.mjs";
import { sha256Hex } from "../../../core/sha256.mjs";
import { runConstruction, runnerStats } from "../../construct_runner.mjs";
import * as model from "./model.mjs";
import { SIGN, kindEntry, allModules, renderStep as renderStepFrame } from "./kinds.mjs";
import { STEP_TABLES, isMainStep, stepNumberText } from "./steps.mjs";
import { createRunState } from "./run_state.mjs";
import { renderStart } from "./start.mjs";
import { withSearch, isReplay, searchKey, searchRecord, LAB_SEARCH_URL, LAB_SEARCH_FORMAT } from "./search.mjs";

// A live run rebuilds its view at most once per this many milliseconds (10 times per second).
export const REBUILD_MS = 100;
// Pixels per cell of a fresh canvas (a fit to the window follows as soon as the window is known).
export const START_CELL = 16;
// Values of R longer than this many digits are shown in the table through the big number widget.
export const TABLE_DIGITS = 12;
// The interval of play at speed 1 in milliseconds, and the speeds of the speed control (kept in the store as
// lab.speed).
export const PLAY_MS = 900;
export const SPEEDS = Object.freeze([0.5, 1, 2, 4]);

// playMsOf(speed) is the interval of play at a speed (a number or its text).
export function playMsOf(speed) {
  return Math.round(PLAY_MS / Number(speed));
}

// readSpeed(store) is the speed kept in the store, 1 when there is none or it is not one of SPEEDS.
export function readSpeed(store) {
  const s = Number((store.get().lab || {}).speed);
  return SPEEDS.includes(s) ? s : 1;
}

// The keys of the page (they act when the focus is on the page body or on a non-interactive element of the Lab):
// Space plays or pauses, the arrows move by one item, with Shift by one step, Home and End go to the first and the
// last position.
const PAGE_KEYS = Object.freeze({ " ": "toggle", ArrowRight: "next", ArrowLeft: "prev", Home: "first", End: "last" });
const SHIFT_KEYS = Object.freeze({ ArrowRight: "nextStep", ArrowLeft: "prevStep" });
// Focus targets where the page keys never act: controls, the canvas, the timeline, an open popover.
const KEY_FREE = 'button, a[href], select, summary, input, textarea, [contenteditable="true"], canvas, [role="slider"], [role="dialog"], .popover, .lab-x-pop';

// pageKeyAction(event, page) is the action of a key event for the Lab's page (an element), or null when the key is
// not one of the page keys or the focus is on a control, outside the page, or inside an open popover.
export function pageKeyAction(e, page) {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  const action = e.shiftKey ? SHIFT_KEYS[e.key] : PAGE_KEYS[e.key];
  if (!action) return null;
  const t = document.activeElement;
  if (t && t !== document.body && t !== document.documentElement && (!page.contains(t) || t.closest(KEY_FREE))) return null;
  return action;
}

const STYLES_URL = new URL("../../../../styles/lab.css", import.meta.url);

// ---------- test handles ----------

let current = null;
const stats = { mounts: 0, unmounts: 0, rebuilds: 0, renders: 0 };

// testHandles() returns live handles of the mounted Lab for automated browser checks: { kit, hexView, store, view,
// result, status, plan, timing, workerAlive, compare, error, focusRow (the key of the table line in focus), position,
// kind (the id of the kind shown), playing, speed, stepper, startRun (start of the page: a run of any input), overlays
// ([{ id, layer, items }] of the overlays on the canvas, items the list of an overlay that carries one) } (null when no
// Lab is mounted). Read only.
export function testHandles() {
  return current ? current() : null;
}

// labStats() returns a copy of the counters { mounts, unmounts, rebuilds, renders } of the page and { workersStarted,
// workersTerminated } of the construction runner (kept across mounts, for the checks of unmount and cancel).
export function labStats() {
  return { ...stats, ...runnerStats() };
}

// inputOfResult(result) is the live input that recomputes a result: { shape, seed, colour, lift, id } (no lift for a
// result that has none).
export function inputOfResult(result) {
  const input = { shape: result.shape.map(([i, j]) => [i, j]), seed: [result.seed[0], result.seed[1]], colour: result.colour, lift: result.lift, id: result.id };
  if (result.lift === undefined) delete input.lift;
  return input;
}

// The icon a step button shows below 1700 px for a step without a number: the shape for the window, a tick for the
// check.
const UNNUMBERED_ICONS = Object.freeze({ first: "hex", last: "check" });

// compactStepper(el, entry) restyles the stepper in el for the control row: each step button holds its number (an
// icon for the first and the last step, which have none) and its title in two spans (the title is hidden on narrow
// screens and the label is then the button's tooltip), the label of steps.mjs is its tooltip and accessible name, a
// main step (isMainStep) is in bold. The stepper widget never rewrites these contents, only their attributes.
function compactStepper(el, entry) {
  const play = el.querySelector(".stepper-play");
  if (play) play.classList.add("text-btn");
  const rows = STEP_TABLES[entry.id];
  el.querySelectorAll(".stepper-list button[data-step]").forEach((b) => {
    const k = Number(b.dataset.step);
    const row = rows[k];
    const { number, title } = row;
    const mark = number
      ? h("span", { class: "lab-step-num" }, stepNumberText(row))
      : h("span", { class: "lab-step-num lab-step-icon" }, icon(UNNUMBERED_ICONS[k === 0 ? "first" : "last"]));
    b.classList.add("lab-step-btn");
    b.classList.toggle("lab-step-main", isMainStep(row));
    b.title = entry.labels[k];
    b.setAttribute("aria-label", entry.labels[k]);
    b.replaceChildren(mark, h("span", { class: "lab-step-title" }, number ? ` ${title}` : title));
  });
}

// storedTries() is the list of the records of data/lab_search.json (the tries of the presets that replay a stored
// token), loaded once per visit, [] when the file cannot be read.
let storedRecords = null;
function storedTries() {
  if (!storedRecords) {
    storedRecords = loadJson(LAB_SEARCH_URL).then((f) => (f && f.format === LAB_SEARCH_FORMAT && f.records ? Object.values(f.records) : []), () => []);
  }
  return storedRecords;
}

const readSession = () => {
  try {
    return sessionStorage.getItem(model.SESSION_KEY);
  } catch {
    return null;
  }
};
const writeSession = (record) => {
  try {
    sessionStorage.setItem(model.SESSION_KEY, JSON.stringify(record));
  } catch {
    // storage may be unavailable (private mode), a reload then shows the start panel
  }
};

// mount(root, ctx) shows the Lab in root and returns unmount().
export function mount(root, ctx) {
  const { store, navigate } = ctx;
  const params = ctx.params || {};
  const query = ctx.query || {};
  stats.mounts++;
  useStyles(STYLES_URL);

  // ---------- elements ----------
  // the status chip: a word or two (done, row 20 of 39, cancelled, error), the sentence (with the code of an error) is
  // its tooltip
  const statusEl = h("span", { class: "lab-status", id: "lab-status", role: "status", dataset: { status: "idle" } }, "loading");
  const actions = h("div", { class: "lab-actions", id: "lab-actions" });
  const resultEl = h("div", { class: "lab-result", id: "lab-result", hidden: true });
  const errorEl = h("div", { class: "lab-error", id: "lab-error", hidden: true });
  // the toolbar of a run (hidden on the start panel)
  const toolbar = h("div", { class: "lab-toolbar", id: "lab-toolbar", hidden: true });
  // the details of the result: one popover of the site's helper behind the three dots
  const pops = createPopoverGroup();
  const detailsBtn = iconButton("details", "Details", { id: "lab-details", class: "lab-details" });
  // placed under the whole control row (on a phone the row wraps, and the toolbar under the button stays free)
  const detailsPop = pops.create({
    anchor: detailsBtn, id: "lab-details-pop", label: "Details of the result", align: "end", className: "lab-details-body",
    anchorBox: () => {
      const b = detailsBtn.getBoundingClientRect();
      const row = bar.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: Math.max(b.bottom, row.bottom) };
    },
  });
  const stepperEl = h("div", { class: "lab-stepper", id: "lab-stepper" });
  const panel = h("section", { class: "lab-panel", id: "lab-panel", "aria-live": "polite" });
  const canvas = h("canvas", { id: "lab-canvas", "aria-label": "Hexagonal grid of the construction" });
  // the view controls of the site at the top right of the canvas (fit: back to the window of the step shown)
  const viewControls = createViewControls({
    view: () => hexView, fit: () => lastFit && hexView && hexView.fit(lastFit.bounds, lastFit.pad),
    ids: { in: "lab-zoom-in", out: "lab-zoom-out", fit: "lab-fit" },
  });
  // the page bar at the bottom right of the canvas: the result in the Explorer, its shape on the Edit page, the flask
  // of this page disabled
  const pageBar = createPageBar({
    current: "lab", ids: { explore: "lab-to-explore", edit: "lab-to-edit", lab: "lab-this-page" },
    onPress: { explore: () => showInExplorer(), edit: () => editShape() },
  });
  // the marker of the cell under the mouse: drawn on a layer of its own over the canvas, so that a move of the
  // pointer redraws one small hexagon, never the cells
  const hoverLayer = h("canvas", { class: "lab-hover-layer", id: "lab-hover-layer", "aria-hidden": "true" });
  // the timeline under the control row, and the speed of play beside the Play button
  const timelineEl = h("div", { class: "lab-timeline", id: "lab-timeline" });
  const speedSel = h("select", { id: "lab-speed", class: "lab-speed", title: "Speed of play", "aria-label": "Speed of play" },
    SPEEDS.map((s) => h("option", { value: String(s) }, `${s}x`)));
  speedSel.value = String(readSpeed(store));
  // the label of the step shown, beside the position text on phones (where the step buttons show numbers only and
  // their tooltips cannot be read)
  const stepName = h("span", { class: "lab-step-name", id: "lab-step-name", "aria-hidden": "true" });
  // the long progress text of a live run, for screen readers only (the chip shows its numbers)
  const progressEl = h("p", { class: "lab-progress sr-only", id: "lab-progress" });
  // the two tables of the right side, one look: the rows (spec "table" of the kind) and under it the small primes of
  // the first step (spec "residues"), in one scrolling box
  const makeTable = (spec, id) => {
    const thead = h("thead");
    const tbody = h("tbody");
    return { spec, thead, tbody, el: h("table", { class: "lab-table", id }, thead, tbody), focusKey: null, lineKeys: new Map() };
  };
  const tables = [makeTable("table", "lab-table"), makeTable("residues", "lab-table-residues")];
  const [mainTable] = tables;
  const tableBox = h("div", { class: "lab-table-box", id: "lab-table-box" }, tables.map((t) => t.el));
  const tableArea = h("section", { class: "lab-area-table" }, tableBox);
  const startEl = h("section", { class: "lab-start", id: "lab-start", hidden: true });
  // the bottom left of the canvas: the offsets of the cell under the pointer (the shared readout of the shape editor)
  const readout = createOffsetsReadout({ id: "lab-readout", boxClass: "lab-readout float" });
  const grid = h(
    "div",
    { class: "lab-grid", id: "lab-grid" },
    h("div", { class: "lab-area-text" }, errorEl, panel),
    h("div", { class: "lab-area-canvas" }, h("div", { class: "hexview lab-view" }, canvas, hoverLayer, readout.el, viewControls.el, h("div", { class: "lab-pagebar float" }, pageBar.el)), progressEl),
    tableArea,
  );
  const work = h("div", { class: "lab-work", id: "lab-work" }, timelineEl, grid);
  // one row: the stepper (filled with the first run) at the left, the status, the result and the buttons at the right
  const bar = h("div", { class: "lab-ctl", id: "lab-ctl" }, stepperEl, h("div", { class: "lab-ctl-right" }, statusEl, resultEl, actions, toolbar));
  const ctlRight = bar.lastElementChild;
  const page = h("div", { class: "lab-page" }, h("h1", { class: "sr-only" }, "Algorithm"), bar, startEl);
  if (typeof params.token === "string") page.dataset.tokenLength = String(params.token.length);
  root.replaceChildren(page);

  // ---------- state ----------
  // the run (kind shown, status, events, view, result, failure, timing, its job), written by its transitions only
  const run = createRunState({ store, entry: SIGN });
  const rs = run.state;
  let hexView = null; // created with the work area (not on the start panel)
  let destroyed = false;
  let content = {};
  let plan = null;
  let compare = null; // { x0, d0 (sha256 hex), label } of a reference result the run is compared with
  let lastRun = null; // { input, mode, label, opts } of the last run started (Run again after a cancel)
  let shownOverlays = []; // the overlays on the canvas (for the test handles)
  let hovered = null; // the cell [i, j] under the mouse (its marker on the hover layer), null when none
  let triesJob = null; // the live run in the background that finds the tries of a replayed result (search.mjs)
  let lastFit = null; // { key, bounds, pad }
  let lastResultKey = null;
  let applying = 0; // > 0 while the page writes the store itself (its subscriber then does not render)
  let stepper = null;
  let timeline = null;
  let extrasUnmount = null;
  let contentReady = false;
  let inRender = false;
  const stepSubs = [];
  const keepSubs = [];
  const lineClickFns = new Set();
  const hoverFns = new Set();
  const clickFns = new Set();

  // the stepper and the timeline with the steps of the kind shown, the speed control beside Play
  function buildStepper() {
    if (stepper) stepper.destroy();
    if (timeline) timeline.destroy();
    const { entry } = rs;
    const steps = entry.labels.map((title, k) => ({ id: `step${k}`, title }));
    const getPos = () => {
      const p = position();
      return { step: p.step, sub: p.sub, subCount: subCountOf(p.step) };
    };
    const isEnabled = (k) => !!rs.view.available[k];
    stepper = createStepper(stepperEl, {
      steps, getPos, setPos, isEnabled, subCountOf, names: entry.places, playMs: playMsOf(speedSel.value),
      onPlayState: (on, ms) => {
        if (timeline) timeline.setPlaying(on, ms);
      },
    });
    compactStepper(stepperEl, entry);
    stepperEl.querySelector(".stepper-play").after(speedSel);
    stepperEl.querySelector(".stepper-pos").after(stepName);
    timeline = createTimeline(timelineEl, { stepCount: steps.length, subCountOf, getPos, setPos: jumpTo, isEnabled, names: entry.places, label: "Position in the construction", onKey: move });
  }

  // jumpTo(pos) is every jump to a position of the page (the timeline's click and drag, a table row; the step buttons,
  // the arrows and the keys jump through the same jump of the stepper): a running play stops first. pos null only
  // stops the play.
  function jumpTo(pos) {
    if (stepper) stepper.jump(pos);
  }

  // move(action) moves the position as the keys of the page and of the timeline ask, as the stepper's arrows do:
  // "next", "prev" (one item), "nextStep" (the end of this step, from its end the start of the next one), "prevStep"
  // (the start of this step, from its start the end of the previous one), "first", "last", or "toggle" (play or pause). Every move but "toggle" stops a play.
  function move(action) {
    if (!stepper) return;
    if (action !== "toggle") stepper.move(action);
    else if (stepper.isPlaying()) stepper.pause();
    else stepper.play();
  }

  // the heads of the two tables and their labels, of the kind shown
  function buildTableHead() {
    const { id } = rs.entry;
    for (const t of tables) {
      const spec = rs.entry[t.spec];
      t.thead.replaceChildren(h("tr", null, spec.columns.map((c) => h("th", { scope: "col" }, c.label))));
      t.el.setAttribute("aria-label", spec.label);
      t.el.dataset.kind = id;
    }
    tableArea.setAttribute("aria-label", rs.entry.table.label);
  }

  // the extras of the kind shown in the toolbar (after the content files have arrived)
  function mountKindExtras() {
    if (typeof extrasUnmount === "function") {
      try {
        extrasUnmount();
      } catch (e) {
        console.error(e);
      }
    }
    extrasUnmount = null;
    try {
      extrasUnmount = rs.entry.extras.mountExtras(toolbar, kit, { canvasBox: canvas.parentElement });
    } catch (e) {
      console.error(e);
    }
  }

  // showKind() shows the kind of the run after a run of another kind began: the stepper, the table head and the
  // extras of that kind
  function showKind() {
    lastResultKey = null;
    buildTableHead();
    if (stepper) buildStepper();
    if (contentReady) mountKindExtras();
  }

  // the canvas, the stepper and the table enter the page with the first run
  function ensureWork() {
    if (hexView || destroyed) return;
    startEl.hidden = true;
    toolbar.hidden = false;
    page.append(work);
    hexView = createHexView(canvas, { source: staticSource(() => null), cell: START_CELL });
    hexView.onCellHover((c, e) => {
      readout.show(c);
      hovered = c;
      drawHover();
      for (const fn of [...hoverFns]) fn(c, e);
    });
    // after every drawn frame (a pan, a zoom, a new step) the marker follows its cell
    hexView.onFrame(drawHover);
    hexView.onCellClick((c, e) => {
      for (const fn of [...clickFns]) fn(c, e);
    });
    buildStepper();
  }
  buildTableHead();

  // drawHover() draws the site's cell marker (the overlay marker, as the Explorer marks its clicked cell) on the hover
  // layer at the cell under the mouse, nothing when there is none. Only the layer is cleared and drawn: the cells of
  // the canvas stay as they are. The frame given to the overlay is the canvas's (its transform, R = cell / sqrt 3 as
  // in every frame of the hex view, its colours).
  function drawHover() {
    if (!hexView || destroyed) return;
    const dpr = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
    const pw = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const ph = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (hoverLayer.width !== pw) hoverLayer.width = pw;
    if (hoverLayer.height !== ph) hoverLayer.height = ph;
    const ctx = hoverLayer.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    hoverLayer.dataset.cell = hovered ? `${hovered[0]},${hovered[1]}` : "";
    if (!hovered) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = hexView.getView().cell;
    marker(hovered).draw(ctx, { toScreen: hexView.toScreen, cell, R: cell / Math.sqrt(3), hexPath, colours: resolveColours(canvas) });
  }

  // the view the steps show: the kind's view with the tries of the result joined (withSearch)
  const shownView = () => withSearch(rs.view, rs.search);

  // ---------- the kit ----------
  const track = (unsub) => {
    (inRender ? stepSubs : keepSubs).push(unsub);
    return unsub;
  };
  const kit = Object.freeze({
    get view() {
      return shownView();
    },
    get result() {
      return rs.result;
    },
    hex: Object.freeze({
      setSource(s) {
        if (hexView) hexView.setSource(s);
      },
      setOverlays(list) {
        shownOverlays = list;
        if (hexView) hexView.setOverlays(list);
      },
      // an empty canvas (a step with nothing to show)
      clear() {
        if (!hexView) return;
        hexView.setSource(model.sourceOfColours(new Map()));
        shownOverlays = [];
        hexView.setOverlays([]);
      },
      fit(bounds, pad) {
        if (!hexView) return;
        const key = JSON.stringify(bounds) + "|" + String(pad);
        if (lastFit && lastFit.key === key) return;
        lastFit = { key, bounds, pad };
        hexView.fit(bounds, pad);
      },
      onCellHover(fn) {
        hoverFns.add(fn);
        return track(() => hoverFns.delete(fn));
      },
      onCellClick(fn) {
        clickFns.add(fn);
        return track(() => clickFns.delete(fn));
      },
    }),
    table: Object.freeze({
      highlight(key) {
        mainTable.focusKey = key === undefined ? null : key;
        markFocus(mainTable);
      },
      onLineClick(fn) {
        lineClickFns.add(fn);
        return track(() => lineClickFns.delete(fn));
      },
    }),
    text: (id) => (Object.prototype.hasOwnProperty.call(content, id) ? content[id] : ""),
    bigNumber,
    h,
    store,
    navigate,
    setResult(r) {
      act(() => run.setResult(r));
    },
    // showCheck() jumps to the start of the last step, the check of the result (after a tamper)
    showCheck() {
      jumpTo({ step: rs.entry.stepCount - 1, sub: 0 });
    },
  });

  // ---------- position ----------
  const subCountOf = (k) => {
    try {
      return Math.max(0, rs.entry.steps[k].subCount(rs.view) | 0);
    } catch (e) {
      console.error(e);
      return 0;
    }
  };
  const storedPos = () => {
    const lab = store.get().lab || {};
    return { step: lab.step, sub: lab.sub };
  };
  const position = () => model.clampPosition(storedPos(), rs.view.available, subCountOf);
  const setPos = (p) => {
    const q = model.clampPosition(p, rs.view.available, subCountOf);
    store.set({ lab: { step: q.step, sub: q.sub } });
  };
  const unsubStore = store.subscribe((s, patch) => {
    if (applying || destroyed || !patch.lab) return;
    if ("step" in patch.lab || "sub" in patch.lab) renderAll();
  });

  // ---------- rendering ----------
  function renderStatus() {
    const { status, timing, result } = rs;
    const p = status === "running" ? rs.entry.progressText(rs.view) : null;
    let sentence;
    let chip;
    // the chip: a state word (no duration, no mode), the tooltip: a phrase, or the phrase and the progress sentences of
    // a running construction (the time of a run is kept in data-ms only, for the checks)
    if (status === "running") {
      sentence = `Running: ${timing.label}`;
      chip = p ? p.chip : "running";
    } else if (status === "done") {
      sentence = `Done: ${timing.label}`;
      chip = "done";
    } else if (status === "error") {
      const e = rs.failure || rs.view.error;
      sentence = `Stopped: ${timing.label || "the input"} ended with an error${e && e.code ? ` (error code ${e.code})` : ""}`;
      chip = "error";
    } else if (status === "cancelled") {
      sentence = `Cancelled: ${timing.label}`;
      chip = "cancelled";
    } else {
      sentence = plan && plan.kind === "none" ? "Choose a shape" : "Loading";
      chip = plan && plan.kind === "none" ? "" : "loading";
    }
    if (result && result.tampered) statusEl.replaceChildren(h("span", { class: "lab-tampered", id: "lab-tampered" }, "tampered"));
    else statusEl.textContent = chip;
    statusEl.title = p ? `${sentence}. ${p.text}` : sentence;
    statusEl.dataset.status = status;
    const err = status === "error" ? rs.failure || rs.view.error : null;
    if (err && err.code) statusEl.dataset.code = String(err.code);
    else delete statusEl.dataset.code;
    if (timing.ms !== null) statusEl.dataset.ms = String(Math.round(timing.ms));
    else delete statusEl.dataset.ms;
    progressEl.textContent = p ? p.text : "";
    if (p && p.percent !== null) progressEl.dataset.percent = String(p.percent);
    else delete progressEl.dataset.percent;
    progressEl.dataset.running = String(status === "running");
  }

  // the buttons of a run, made once (a live run renders ten times a second, and a button made again at each render
  // could lose a click between its press and its release)
  const cancelBtn = h("button", { type: "button", class: "text-btn", id: "lab-cancel", title: "Stop the run", onclick: cancelRun }, "Cancel");
  const runAgainBtn = h("button", { type: "button", class: "text-btn", id: "lab-run-again", title: "Restart the run", onclick: runAgain }, "Run again");
  const recomputeBtn = h("button", { type: "button", class: "text-btn", id: "lab-recompute", onclick: recomputeLive }, "Recompute");
  const RECOMPUTE_TIP = "Run live and compare";
  // the reference a live run is compared with: the stored construction (its name in the details, its short word in
  // the comparison mark beside the badge)
  const STORED = Object.freeze({ label: "the stored construction", short: "stored" });

  // recomputeWhy() is the reason Recompute cannot be pressed now (null when it can): it recomputes a replayed result
  // live
  function recomputeWhy() {
    if (rs.status === "running") return "Running";
    if (!rs.result) return "No result";
    if (rs.result.tampered) return "Tampered numbers";
    return isReplay(rs.view) ? null : "Already computed live";
  }

  function renderActions() {
    const kids = [];
    if (inWorker()) kids.push(cancelBtn);
    // a cancelled run can start again where Cancel was
    if (rs.status === "cancelled" && lastRun) kids.push(runAgainBtn);
    // Recompute keeps its place from the first run on, disabled with its reason when there is nothing to recompute
    if (hexView) {
      const why = recomputeWhy();
      recomputeBtn.disabled = !!why;
      recomputeBtn.title = why || RECOMPUTE_TIP;
      kids.push(recomputeBtn);
    }
    const shown = [...actions.children];
    if (shown.length !== kids.length || shown.some((b, k) => b !== kids[k])) actions.replaceChildren(...kids);
  }

  // the page bar: the eye shows the result in the Explorer (its token), the pencil puts its shape on the Edit page,
  // each disabled with its reason while there is no result to show
  function pageBarWhy() {
    if (!rs.result) return rs.status === "running" ? "Running" : "No result";
    return rs.result.tampered ? "Tampered numbers" : null;
  }
  function renderPageBar() {
    const why = pageBarWhy();
    pageBar.set("explore", why || (rs.result.token ? null : "No token"));
    pageBar.set("edit", why);
  }
  function showInExplorer() {
    if (!pageBarWhy() && rs.result.token) navigate(explorerTokenHref(rs.result.token));
  }
  function editShape() {
    const r = rs.result;
    if (pageBarWhy()) return;
    openInEditor({ store, navigate }, { kind: "witness", complete: true, cells: r.shape, seed: r.seed, colour: r.colour, token: r.token || null });
  }

  // the details of a result: x0 and d0 in their short form with a copy button each, and the comparison
  function detailsContent(result) {
    const nums = h("div", {
      class: "lab-result-line", id: "lab-result-line",
      dataset: { shaX0: result.sha256.x0.slice(0, 16), shaD0: result.sha256.d0.slice(0, 16), digitsX0: result.digits.x0, digitsD0: result.digits.d0 },
    });
    for (const [label, v] of [["x", result.x0], ["d", result.d0]]) bigNumber(nums.appendChild(h("div")), v, { label });
    const more = [nums];
    if (compare) {
      const same = compare.x0 === result.sha256.x0 && compare.d0 === result.sha256.d0;
      more.push(h("p", { class: same ? "lab-same" : "lab-differs", id: "lab-compare", dataset: { same: String(same), shaX0: compare.x0.slice(0, 16), shaD0: compare.d0.slice(0, 16) } },
        same ? `Equal to ${compare.label}.` : `Differs from ${compare.label}.`));
    }
    return more;
  }

  // the result: a badge and the comparison mark, everything secondary in the details popover. While Recompute can be
  // pressed the mark's place is kept by an invisible mark of the same text, so that the mark appearing after the
  // recompute never widens the row (the status chip keeps its place, see reserveRight)
  function renderResult() {
    const { result } = rs;
    const slot = !compare && recomputeWhy() === null;
    // rebuilt only when the result or the comparison changes, so open details stay open while stepping
    const key = result ? [result.sha256.x0, result.sha256.d0, result.tampered, result.token, compare ? compare.x0 + compare.d0 : "", slot].join("|") : "";
    if (key === lastResultKey) return;
    lastResultKey = key;
    if (!result) {
      pops.closeAll();
      detailsPop.el.replaceChildren();
      resultEl.replaceChildren();
      resultEl.hidden = true;
      return;
    }
    resultEl.hidden = false;
    const badgeEl = h("span", { class: "lab-badge" });
    passBadge(badgeEl, { pass: result.pass, reasons: [], warnings: [] });
    const same = compare ? compare.x0 === result.sha256.x0 && compare.d0 === result.sha256.d0 : null;
    detailsPop.el.replaceChildren(...detailsContent(result));
    if (detailsPop.isOpen()) detailsPop.place();
    const kids = [
      badgeEl,
      compare ? h("span", { class: same ? "lab-same" : "lab-differs", id: "lab-compare-mark" }, same ? `= ${compare.short}` : "differs") : null,
      slot ? h("span", { class: "lab-same lab-mark-slot", "aria-hidden": "true" }, `= ${STORED.short}`) : null,
      detailsBtn,
    ];
    resultEl.replaceChildren(...kids.filter(Boolean));
  }

  function renderError() {
    const e = rs.failure || rs.view.error;
    delete errorEl.dataset.p;
    delete errorEl.dataset.j;
    if (!e) {
      errorEl.hidden = true;
      errorEl.replaceChildren();
      delete errorEl.dataset.code;
      return;
    }
    const info = rs.entry.errorInfo(e);
    errorEl.hidden = false;
    errorEl.dataset.code = info.code;
    if (e.p !== undefined && e.p !== null) errorEl.dataset.p = String(e.p);
    if (e.j !== undefined && e.j !== null) errorEl.dataset.j = String(e.j);
    // the code (and a technical message) only in the tooltip of the title
    const tip = `Error code ${info.code}${info.technical ? `: ${info.technical}` : ""}`;
    const kids = [
      h("p", { class: "lab-error-title", title: tip }, h("strong", null, info.title)),
      h("p", null, info.sentence),
      info.detail ? h("details", { class: "lab-why" }, h("summary", null, "Why"), h("p", { class: "lab-small" }, info.detail)) : null,
      info.editorLink ? h("p", null, h("a", { href: EDIT_PATH, id: "lab-error-editor" }, "Shape editor")) : null,
      info.startLink ? h("p", null, h("a", { href: labHref(), id: "lab-error-start" }, "Choose a shape")) : null,
    ];
    errorEl.replaceChildren(...kids.filter(Boolean));
  }

  // calls fn() and returns its value, or fallback after logging an error of a kind's function
  const guarded = (fn, fallback) => {
    try {
      return fn();
    } catch (e) {
      console.error(e);
      return fallback;
    }
  };

  // renderTable(t, pos) fills one of the two tables (t of tables) from its spec in the kind's entry (the line in focus
  // of the first is set by renderStep, of the second here, both by focusOf of the spec)
  function renderTable(t, pos) {
    const spec = rs.entry[t.spec];
    const view = shownView();
    const lines = guarded(() => spec.lines(view, pos, rs.result), []);
    t.lineKeys = new Map();
    t.tbody.replaceChildren(
      ...lines.map((ln) => {
        const key = spec.keyOf(ln);
        t.lineKeys.set(String(key), key);
        const tr = h("tr", { dataset: { ...ln.data, key: String(key) } });
        for (const c of spec.columns) {
          const v = ln.cells[c.key];
          const td = h("td", { class: [v.text === model.DOT ? "lab-dot" : null, v.changed ? "lab-changed" : null] });
          if (v.big !== undefined && v.text.length > TABLE_DIGITS) bigNumber(td, v.big);
          else td.textContent = v.text;
          tr.append(td);
        }
        return tr;
      }),
    );
    t.el.dataset.lines = String(lines.length);
    if (t !== mainTable) {
      // the second table appears with its first line (the small primes exist from step 1 on)
      t.el.hidden = lines.length === 0;
      const f = guarded(() => spec.focusOf(view, pos.step, pos.sub), null);
      t.focusKey = f === undefined ? null : f;
    }
    markFocus(t);
  }

  function markFocus(t) {
    let hit = null;
    for (const tr of t.tbody.children) {
      const on = t.focusKey !== null && tr.dataset.key === String(t.focusKey);
      tr.classList.toggle("lab-focus-row", on);
      if (on) {
        tr.setAttribute("aria-current", "true");
        hit = tr;
      } else tr.removeAttribute("aria-current");
    }
    t.el.dataset.focus = t.focusKey === null ? "" : String(t.focusKey);
    if (hit && tableBox.clientHeight > 0) {
      const top = hit.offsetTop + t.el.offsetTop;
      const bottom = top + hit.offsetHeight;
      if (top < tableBox.scrollTop + 24 || bottom > tableBox.scrollTop + tableBox.clientHeight) tableBox.scrollTop = Math.max(0, top - tableBox.clientHeight / 2);
    }
  }

  function renderStep(pos) {
    for (const u of stepSubs.splice(0)) u();
    const { entry } = rs;
    const view = shownView();
    const f = guarded(() => entry.table.focusOf(view, pos.step, pos.sub), null);
    mainTable.focusKey = f === undefined ? null : f;
    panel.dataset.step = String(pos.step);
    panel.dataset.sub = String(pos.sub);
    inRender = true;
    try {
      renderStepFrame(entry, pos.step, panel, view, pos.sub, kit);
      renderMathIn(panel);
    } catch (e) {
      console.error(e);
      panel.replaceChildren(h("p", { class: "lab-error-text" }, `The step ${entry.labels[pos.step]} could not be shown.`));
    } finally {
      inRender = false;
    }
    stats.renders++;
  }

  // The right part of the control row keeps the widest width it has had (--lab-right-min, read by lab.css in the
  // one-row layout only), so that its buttons changing (recompute, cancel, the comparison mark) never move the
  // status chip: the stepper keeps the width of its widest state too.
  let rightMax = 0;
  function reserveRight() {
    let w = 0;
    let n = 0;
    for (const el of ctlRight.children) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) {
        w += r.width;
        n++;
      }
    }
    const gap = parseFloat(getComputedStyle(ctlRight).columnGap) || 0;
    w = Math.ceil(w + gap * Math.max(0, n - 1));
    if (w > rightMax) {
      rightMax = w;
      ctlRight.style.setProperty("--lab-right-min", `${rightMax}px`);
    }
  }

  function renderAll() {
    if (destroyed) return;
    const pos = position();
    const st = storedPos();
    if (st.step !== pos.step || st.sub !== pos.sub) {
      applying++;
      try {
        store.set({ lab: { step: pos.step, sub: pos.sub } });
      } finally {
        applying--;
      }
    }
    renderStatus();
    renderActions();
    renderResult();
    renderError();
    reserveRight();
    renderPageBar();
    if (!hexView) return;
    renderStep(pos);
    for (const t of tables) renderTable(t, pos);
    if (stepper) stepper.refresh();
    if (timeline) timeline.refresh();
    stepName.textContent = rs.entry.labels[pos.step];
  }

  // ---------- runs ----------
  // act(fn) applies transitions of the run (fn) and renders once after the outermost one (a run on the main thread
  // ends inside its begin)
  function act(fn) {
    applying++;
    try {
      fn();
    } finally {
      applying--;
    }
    if (!applying) renderAll();
  }

  // inWorker() is true while a run of the construction worker is running (it can be cancelled)
  function inWorker() {
    return !!(rs.job && rs.job.runOn === "worker");
  }

  // startRun(input, mode, label, opts) runs input with the construction runner: opts.runOn ("main" or "worker",
  // default runPlace), opts.progress (a replay in the worker posts its progress), opts.keepPos, opts.t0 and opts.check
  // as for begin and finish of the run state. A run of another kind shows that kind.
  function startRun(input, mode, label, { runOn, progress = false, keepPos = false, t0, check = null } = {}) {
    lastRun = { input, mode, label, opts: { runOn, progress, keepPos, check } };
    stopTries();
    act(() => {
      lastFit = null;
      const { changed } = run.begin(input, mode, label, {
        keepPos,
        t0,
        start: () => runConstruction(input, {
          runOn,
          progress,
          batchMs: REBUILD_MS,
          onEvents: (batch) => act(() => {
            stats.rebuilds++;
            run.events(batch);
          }),
          onDone: (res) => {
            act(() => run.finish(res, check));
            seekTries();
          },
          onError: (failure) => act(() => run.fail(failure)),
        }),
      });
      if (changed) showKind();
      ensureWork();
    });
  }

  // seekTries() finds the tries of a replayed result that the run state does not know yet (search.mjs): first in
  // the stored file of the presets, else by a live run of the same shape in the background when the site would run
  // it live (liveRunProblem), whose tries count only when it gives the same x0 and d0. Until then, and when neither
  // applies, the panels leave those lines out.
  function seekTries() {
    if (destroyed || !rs.entry.hasTries || rs.status !== "done" || !rs.result || rs.result.tampered || rs.search || !isReplay(rs.view)) return;
    const result = rs.result;
    const key = searchKey(result);
    const learn = (record) => {
      if (!destroyed && rs.result === result) act(() => run.learnSearch(key, record));
    };
    storedTries().then((records) => {
      if (destroyed || rs.result !== result) return;
      const hit = records.find((r) => r && r.key === key);
      if (hit) {
        learn({ candidates: hit.candidates, attempts: hit.attempts });
        return;
      }
      const input = inputOfResult(result);
      if (liveRunProblem(input.shape, input.colour)) return;
      const { buildView } = rs.entry;
      const events = [];
      triesJob = runConstruction(input, {
        runOn: "worker",
        onEvents: (batch) => {
          for (const e of batch) events.push(e);
        },
        onDone: (res) => {
          triesJob = null;
          if (res && searchKey(res) === key) learn(searchRecord(buildView(events)));
        },
        onError: () => {
          triesJob = null;
        },
      });
    });
  }

  // stopTries() stops the live run of seekTries (a new run, an unmount)
  function stopTries() {
    if (triesJob) triesJob.cancel();
    triesJob = null;
  }

  // runLive(input, runOn, label, opts) runs a live construction on the main thread ("main") or in the worker
  function runLive(input, runOn, label, opts) {
    startRun(input, "live", label, { ...opts, runOn });
  }

  // runReplay(data, label, opts) replays the data of a construction where runPlace puts it, in the worker with its
  // progress events (opts.check as for finish of the run state)
  function runReplay(data, label, opts) {
    const input = { replay: data };
    const runOn = runPlace(input);
    startRun(input, "replay", runOn === "main" ? label : `${label}, in the background`, { ...opts, runOn, progress: true });
  }

  function cancelRun() {
    act(() => run.cancel());
  }

  // runAgain() starts the last run again (after a cancel), from the position it had
  function runAgain() {
    if (!lastRun) return;
    const { input, mode, label, opts } = lastRun;
    startRun(input, mode, label, { ...opts, keepPos: true });
  }

  function recomputeLive() {
    const { result } = rs;
    if (!result) return;
    compare = { x0: result.sha256.x0, d0: result.sha256.d0, ...STORED };
    const input = inputOfResult(result);
    runLive(input, runPlace(input), "live recomputation", { keepPos: true });
  }

  function showFailure(e, label) {
    act(() => {
      ensureWork();
      run.failBeforeRun(e, label);
    });
  }

  async function startPlan() {
    // an address without a token, genus or preset first takes the selection of the site when it is newer (labParams)
    const from = labParams(store, params, query);
    plan = model.resolveInput({ params: from, query, storeInput: (store.get().lab || {}).input, sessionText: readSession() });
    if (plan.kind === "none") {
      showStart(plan.problem);
      renderAll();
      return;
    }
    if (plan.kind === "token") {
      // the checks that need no number at once, the rebuild by the replay itself, then its x0 against the tag
      let read;
      try {
        read = readToken(plan.token);
      } catch (e) {
        showFailure(e, "the link");
        return;
      }
      const check = (res) => (tagMatches(read, res.x0) ? null : { code: "tag_mismatch", message: "damaged token or wrong reconstruction" });
      runReplay(read.data, "replay of the link", { check });
      return;
    }
    if (plan.kind === "preset") {
      const ent = kindEntry(plan);
      const word = `region type ${model.typeText(plan.colour)}`;
      const title = model.presetTitle(plan.name);
      if (plan.shapeKind === "computed") {
        runLive(ent.presetInput(plan), plan.runOn, `live construction of ${title}, ${word}`);
        return;
      }
      if (!plan.tokenLabel) {
        // a shipped shape without a stored construction: live
        let shp;
        try {
          shp = await loadJson(model.shapeUrl(plan.file));
        } catch (e) {
          if (!destroyed) showFailure(e, "loading the shape");
          return;
        }
        if (destroyed) return;
        const input = ent.inputRecord({ shape: shp.shape, seed: shp.seed, colour: plan.colour, lift: plan.lift, id: null });
        if (!input) {
          showFailure({ code: "bad_input", message: "the shape file is not a list of cells with a seed" }, "loading the shape");
          return;
        }
        const chk = ent.check(input.shape);
        if (chk) {
          plan = { kind: "none", problem: model.blockedText(title, plan.colour, chk) };
          showStart(plan.problem);
          renderAll();
          return;
        }
        runLive(input, plan.runOn || runPlace(input), `live construction of ${title}, ${word}`);
        return;
      }
      const t0 = performance.now();
      let tokens;
      try {
        tokens = await loadJson(model.TOKENS_URL);
      } catch (e) {
        if (!destroyed) showFailure(e, "loading the stored constructions");
        return;
      }
      if (destroyed) return;
      let op;
      try {
        op = openToken(tokens[plan.tokenLabel]);
      } catch (e) {
        showFailure(e, "the stored construction");
        return;
      }
      if (plan.mode === "replay") {
        // the time shown counts from the load of the stored constructions
        startRun({ replay: op.data }, "replay", `replay of the stored ${title}, ${word}`, { runOn: "main", t0 });
        return;
      }
      let sh;
      try {
        sh = await loadJson(model.shapeUrl(plan.file));
      } catch (e) {
        if (!destroyed) showFailure(e, "loading the shape");
        return;
      }
      if (destroyed) return;
      compare = { x0: sha256Hex(op.x0.toString()), d0: sha256Hex(op.d0.toString()), ...STORED };
      runLive({ shape: sh.shape, seed: sh.seed, colour: plan.colour, lift: plan.lift, id: null }, "worker", `live construction of ${title}, ${word}, in the background`);
      return;
    }
    // a shape from the editor (store) or its session copy
    const rec = plan.input;
    if (plan.from === "store") writeSession(rec);
    else store.set({ lab: { input: rec } });
    runLive(rec, plan.runOn, `live construction of the shape from the editor (${rec.shape.length} cells, region type ${model.typeText(rec.colour)})`);
  }

  // ---------- start panel ----------
  function showStart(problem) {
    renderStart(startEl, { problem, navigate, text: kit.text });
    startEl.hidden = false;
  }

  // ---------- playback: speed and keys ----------
  speedSel.addEventListener("change", () => {
    store.set({ lab: { speed: Number(speedSel.value) } });
    if (stepper) stepper.setPlayMs(playMsOf(speedSel.value));
  });
  const onPageKey = (e) => {
    if (!stepper || destroyed) return;
    const action = pageKeyAction(e, page);
    if (!action) return;
    e.preventDefault();
    move(action);
  };
  document.addEventListener("keydown", onPageKey);

  // ---------- canvas and table input ----------
  // a change of the canvas size (layout settling, window resize, phone rotation) fits the window again
  let canvasSize = "";
  const ro = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => {
      const size = `${canvas.clientWidth}x${canvas.clientHeight}`;
      if (size === canvasSize) return;
      canvasSize = size;
      if (lastFit && hexView && canvas.clientWidth > 0 && canvas.clientHeight > 0) hexView.fit(lastFit.bounds, lastFit.pad);
    })
    : null;
  if (ro) ro.observe(canvas);
  // onTableClick(t, e) is the click on a line of either table: a jump (it stops a play) to the line's item, in the
  // step of the table's spec (the second table: step 1) or else the step shown, or the line put in focus where it
  // has none
  const onTableClick = (t, e) => {
    const tr = e.target.closest("tr[data-key]");
    if (!tr || !t.lineKeys.has(tr.dataset.key)) return;
    const spec = rs.entry[t.spec];
    const key = t.lineKeys.get(tr.dataset.key);
    const pos = position();
    const step = Number.isInteger(spec.step) ? spec.step : pos.step;
    const sub = guarded(() => spec.subOf(shownView(), step, key), null);
    jumpTo(Number.isInteger(sub) ? { step, sub } : null);
    if (!Number.isInteger(sub)) {
      t.focusKey = key;
      markFocus(t);
    }
    if (t === mainTable) for (const fn of [...lineClickFns]) fn(key);
  };
  const tableClicks = tables.map((t) => {
    const fn = (e) => onTableClick(t, e);
    t.tbody.addEventListener("click", fn);
    return () => t.tbody.removeEventListener("click", fn);
  });

  // ---------- test handles ----------
  current = () => ({
    kit, hexView, store, view: rs.view, result: rs.result, status: rs.status, plan, timing: { ...rs.timing }, workerAlive: inWorker(), compare,
    error: rs.failure || rs.view.error, focusRow: mainTable.focusKey, focusPrime: tables[1].focusKey, position: position(), kind: rs.entry.id,
    playing: stepper ? stepper.isPlaying() : false, speed: Number(speedSel.value), stepper, startRun,
    overlays: shownOverlays.map((o) => ({ id: o.id, layer: o.layer, items: o.items || null })),
    search: rs.search, triesRunning: !!triesJob, hovered,
  });

  // ---------- start ----------
  (async () => {
    // the content files of every kind, so that a change of kind needs no further load
    const loaded = await Promise.all(
      model.contentFilesToLoad(allModules()).map((f) =>
        loadJson(model.contentUrl(f)).catch((e) => {
          console.warn(e);
          return {};
        }),
      ),
    );
    if (destroyed) return;
    content = Object.assign({}, ...loaded);
    contentReady = true;
    mountKindExtras();
    await startPlan();
  })();

  return () => {
    destroyed = true;
    stats.unmounts++;
    if (ro) ro.disconnect();
    run.cancel();
    stopTries();
    unsubStore();
    for (const off of tableClicks) off();
    for (const u of stepSubs.splice(0)) u();
    for (const u of keepSubs.splice(0)) u();
    lineClickFns.clear();
    hoverFns.clear();
    clickFns.clear();
    if (typeof extrasUnmount === "function") {
      try {
        extrasUnmount();
      } catch (e) {
        console.error(e);
      }
    }
    document.removeEventListener("keydown", onPageKey);
    viewControls.destroy();
    pops.destroy();
    if (stepper) stepper.destroy();
    if (timeline) timeline.destroy();
    if (hexView) hexView.destroy();
    current = null;
    root.replaceChildren();
  };
}
