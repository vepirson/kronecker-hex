// The shape editor of the editor page (#/edit): draw a shape on the page's hex view with a static colour source,
// undo and redo, the colour to build, and the live analysis (area, genus by chi and by holes, connectivity, the
// residue test of the shape and of its neighbours). The page bar at the bottom right (widgets/page_bar.mjs, the
// pencil of this page greyed) holds the two page actions: the flask (sendToLab of src/ui/actions.mjs) hands the shape
// to the Algorithm page (the Lab in the code), the eye runs its construction at once (build.mjs) and opens the result
// in the Explorer. In both cases the drawing becomes the Lab's input with the stamp of the selection, so that the
// header's Algorithm keeps it until a new region is selected. A shape comes in from the selection of the site (the
// Explorer, a Gallery card) or from an address.
//
// Floating controls (inside the page's host element): the tools at the top left (draw, move, then undo, redo, then reset
// to the selected region and clear, then the region type to build: right after the canvas in the keyboard order), a chip
// at the bottom right (the verdict icon and its short text, then the page bar, then details and Apply fix last), and
// while a Build runs its progress display above the chip (widgets/run_progress.mjs: the bar, where the run is, the
// times, the one Stop of the run). A control that holds the focus and becomes disabled or hidden
// hands the focus to the canvas. The verdict is a check when the shape can be built as a region of the chosen type, a
// cross when it cannot and the hexagon of the draw tool while the shape is empty, its words in its tooltip and, for a
// shape that cannot be built, beside it (verdict.mjs). For a cross of the residue test or of a row too long the fix
// of src/core/shape_fix.mjs is searched in a worker after the edit (fix.worker.mjs, never while a stroke is drawn, a
// result for a shape that changed meanwhile is dropped), its cells get hollow marks (a mark on a cell of the shape:
// remove it, on an empty cell: add it), and Apply fix makes it one undoable edit.
//
// Input: with the draw tool one pointer draws (the draw rule of editor_state.mjs: a stroke adds cells when its first
// cell is empty, else removes them), two touch pointers pan and zoom the view (the cells the first finger drew are
// taken back). With the move tool the view pans and zooms by itself. Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo.
// Clear empties the drawing as one edit that Undo takes back.
//
// The editor works in offsets around its own origin (0, 0). The shape lives in the store (key editor: cells, seed,
// colour, and the undo and redo lists written when the editor is destroyed), so leaving the page and coming back keeps
// it. The token of the last Build is store.editor.built, the stamp of the selection the drawing came from
// store.editor.stamp. Taking the selection (at the page's start when it is newer, or by the reset button) makes the
// drawing its region and its region type as one edit that Undo takes back.

import { h } from "../dom.mjs";
import { staticSource } from "../../render/hex_canvas.mjs";
import { outline, hollowMarks } from "../../render/overlays.mjs";
import { icon, iconButton, setIconLabel } from "../widgets/icons.mjs";
import { createPageBar } from "../widgets/page_bar.mjs";
import { createPopoverGroup } from "../widgets/popover.mjs";
import { createEditorState, analyseShape, canSendToLab, labInputOf, colourCheckOf, COLOURS } from "./editor_state.mjs";
import { createColourControl } from "./colour_control.mjs";
import { quickFix, searchesFix, verdictWords, verdictMark, chipLine } from "./verdict.mjs";
import { startBuild } from "./build.mjs";
import { sendToLab, inputForLab, selectRegion, sameShape, explorerTokenHref } from "../actions.mjs";
import { createRunProgress } from "../widgets/run_progress.mjs";
import { checkShapeCells } from "../../formats/witness.mjs";

// The name of the button that applies the marked fix.
export const FIX_NAME = "Apply fix";
// The name of the button that puts the drawing back to the selected region, and the reasons it is disabled.
export const RESET_NAME = "Reset to selection";
export const RESET_NONE = "No selection";
export const RESET_SAME = "Already the selection";
// The name of the button that empties the drawing, and its reason when the drawing is empty.
export const CLEAR_NAME = "Clear";
export const CLEAR_EMPTY = "Empty";
// The reason of the page actions and of Apply fix while a Build runs.
export const BUILDING = "Packing";

// resetProblem(selection, snapshot) is null when the reset button can put the drawing ({ cells, colour }) back to the
// selection, else the reason it is disabled: RESET_NONE without a selection, RESET_SAME when the drawing has its
// cells and its region type.
export function resetProblem(selection, snapshot) {
  if (!selection) return RESET_NONE;
  return selection.colour === snapshot.colour && sameShape(selection.shape, snapshot.cells) ? RESET_SAME : null;
}

const TOOLS = [
  { id: "draw", icon: "draw", title: "Draw" },
  { id: "move", icon: "move", title: "Move" },
];

const EMPTY_BOX = { imin: -8, imax: 8, jmin: -6, jmax: 6 };

// errorLine(sentence, error) is an error of the note line for a visitor: the plain sentence, the error's code and
// message (a CodedError, or { code, message }) only in its tooltip. Returns the nodes for say().
export function errorLine(sentence, error) {
  const code = (error && error.code) || "error";
  let msg = error && error.message ? String(error.message) : "";
  if (msg.startsWith(`${code}: `)) msg = msg.slice(code.length + 2);
  return [h("span", { title: msg ? `${code}: ${msg}` : code }, sentence)];
}

// detailsLines(analysis) is the lines of the editor's details, each "subject: verdict": the lines above the two
// residue tables ("cells: 70", "genus: 4" for a connected shape), the captions of the tables ("shape: admissible",
// "neighbours: not admissible") and the line under them ("connected: yes"; no line of holes: the genus counts them),
// as { head, shape, neighbours, lines }. The empty shape has { shape: "shape: empty" } only.
export function detailsLines(a) {
  if (!a || a.empty) return { head: [], shape: "shape: empty", neighbours: null, lines: [] };
  const word = (t) => (t.admissible ? "admissible" : "not admissible");
  return {
    head: [`cells: ${a.area}`, ...(a.connected ? [`genus: ${a.genus}`] : [])],
    shape: `shape: ${word(a.residue)}`,
    neighbours: `neighbours: ${word(a.ring)}`,
    lines: [`connected: ${a.connected ? "yes" : "no"}`],
  };
}

// residueRows(summary) is the residue test as table rows [p, text]: the missed class "(a, b)" or "all p^2 hit".
export function residueRows(summary) {
  return summary.records.map((r) => [r.p, r.missed ? `(${r.missed[0]}, ${r.missed[1]})` : `all ${r.p * r.p} hit`]);
}

// historyKey(e) is the action of a key press on the editor page: "undo" for Ctrl+Z (Cmd+Z), "redo" for Ctrl+Y and
// Ctrl+Shift+Z, else null. e: { key, ctrlKey, metaKey, shiftKey, altKey }.
export function historyKey(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = String(e.key).toLowerCase();
  if (k === "z") return e.shiftKey ? "redo" : "undo";
  if (k === "y" && !e.shiftKey) return "redo";
  return null;
}


// mountEditor(host, { view, canvasBox, group, store, navigate, start, take, say, onChange }) shows the editor on the
// hex view `view` (whose canvas sits in canvasBox) with its floating controls in host, and returns { load(start), fit(),
// destroy(), state, view, analysis(), verdict() (the shown verdict { fix, text }), shownFix() (the marked fix or
// null), setTool(id), building() }. start: { cells, seed, colour } (a shape in offsets,
// a new history), or null to resume from store.editor with its history (or an empty canvas). take: the selection
// ({ shape, seed, colour, stamp }) to take after the start, or null. group: the page's popover group (a new one when
// absent). say(text, kind, code): the page's note line. onChange(snapshot) is called after every redraw of the
// controls with state.snapshot().
export function mountEditor(host, { view, canvasBox, group = null, store, navigate, start = null, take = null, say = () => {}, onChange = () => {} } = {}) {
  const state = createEditorState({ colour: 1 });
  let tool = "draw";
  let analysis = analyseShape([]);
  let raf = 0;
  let destroyed = false;
  let verdict = { fix: undefined, text: "" }; // the shown verdict: a result of quickFix or fixOf, and its words
  let fixFor = -1; // the state version that fixResult belongs to
  let fixResult; // the last result of fixOf
  let fixMs = 0; // how long that search took
  let fixWorker = null; // the fix worker (fix.worker.mjs), made at the first search
  let fixAsked = -1; // the state version of the search in the worker, -1 when it is idle
  let build = null; // the running Build: { runOn, cancel() }
  const ownGroup = group ? null : createPopoverGroup();
  const pops = group || ownGroup;

  // ---------- elements ----------
  const toolBtns = TOOLS.map((t) => iconButton(t.icon, t.title, { class: "editor-tool", dataset: { tool: t.id }, "aria-pressed": String(t.id === tool) }));
  const undoBtn = iconButton("undo", "Undo (Ctrl+Z)", { id: "editor-undo", disabled: true });
  const redoBtn = iconButton("redo", "Redo (Ctrl+Y)", { id: "editor-redo", disabled: true });
  const colourCtl = createColourControl({
    pops,
    host,
    onPick: (c) => {
      state.setColour(c);
      schedule();
    },
  });
  const resetBtn = iconButton("reset", RESET_NAME, { id: "editor-reset", disabled: true });
  const clearBtn = iconButton("clear", CLEAR_NAME, { id: "editor-clear", disabled: true });
  const sep = () => h("span", { class: "xp-edit-sep", "aria-hidden": "true" });
  const tools = h("div", { class: "xp-tl float xp-edit-tools", id: "editor-tools" }, toolBtns, sep(), undoBtn, redoBtn, sep(), resetBtn, clearBtn, sep(), colourCtl.button);

  // the verdict: its icon (its words in the tooltip) and one short text beside it (chipLine of verdict.mjs)
  const verdictMarkEl = h("span", { id: "editor-verdict", class: "xp-verdict", role: "img" }, icon("draw"));
  const verdictText = h("span", { class: "xp-chip-text", id: "editor-verdict-line" });
  const fixBtn = iconButton("fix", FIX_NAME, { id: "editor-fix", disabled: true });
  // the page bar: the eye builds the shape and shows it in the Explorer, the flask shows its algorithm
  const pageBar = createPageBar({
    current: "edit",
    ids: { explore: "editor-build", edit: "editor-page-pencil", lab: "editor-send" },
    onPress: { explore: () => startBuildNow(), lab: () => sendNow() },
    className: "xp-chip-btns",
  });
  const detailsBtn = iconButton("details", "Details", { id: "editor-details-btn" });
  // the chip, as the Explorer's: the verdict icon and its text | the page bar | details, then Apply fix at the far
  // right, where the Explorer has its X
  const chip = h(
    "div",
    { class: "xp-chip float", id: "editor-stats" },
    h("span", { class: "xp-chip-btns ed-verdict" }, verdictMarkEl, verdictText),
    sep(),
    pageBar.el,
    sep(),
    h("span", { class: "xp-chip-btns" }, detailsBtn, fixBtn),
  );
  // the progress display of a running Build (with its Stop button), above the chip, in the page only while it runs
  const progress = createRunProgress({ host, id: "editor-progress", stopId: "editor-build-cancel", label: "Packing the shape", onStop: () => cancelBuild() });
  progress.el.classList.add("float", "xp-run");
  // the tools right after the canvas in the keyboard order (before the page's zoom controls), the chip last
  canvasBox.after(tools);
  host.append(chip);
  const canvas = canvasBox.querySelector("canvas");
  const controls = [tools, chip, progress.el];
  // focusLost(el): el held the focus and is a control of the editor that is now disabled or hidden
  const focusLost = (el) => !!el && controls.some((c) => c.contains(el)) && (el.disabled || el.hidden);

  const detailsPop = pops.create({ anchor: detailsBtn, host, id: "editor-details", label: "Details of the shape", placement: "above", align: "end", build: (el) => buildDetails(el) });

  // ---------- the view ----------
  const source = staticSource((i, j) => (state.has(i, j) ? state.colour : null));
  view.setSource(source);
  view.setSoft(false);
  view.setOverlays([]);

  function syncStore() {
    if (!store) return;
    const s = state.snapshot();
    store.set({ editor: { cells: s.cells, seed: s.seed, colour: s.colour } });
  }

  // the selection of the site (null when none)
  const selection = () => (store ? store.get().selection || null : null);

  // takeSelection(sel): the drawing becomes the selected region with its region type as one edit that Undo takes
  // back (nothing changes when the drawing already is that region), and the editor takes the selection's stamp
  function takeSelection(sel) {
    if (resetProblem(sel, { cells: state.cells(), colour: state.colour }) === null) {
      try {
        state.replace({ cells: sel.shape, seed: sel.seed, colour: sel.colour });
      } catch (e) {
        say(errorLine("The selected region could not be loaded.", e), "error", e.code || "error");
        return;
      }
      fit();
    }
    if (store) store.set({ editor: { stamp: sel.stamp } });
    update();
  }

  function update() {
    raf = 0;
    if (destroyed) return;
    const focused = document.activeElement;
    const cells = state.cells();
    analysis = analyseShape(cells);
    const a = analysis;
    // the verdict at once from the analysis, the fix of this very shape and type once its search has run (undefined
    // while it runs)
    const quick = quickFix(a, state.colour);
    let fix = quick;
    if (searchesFix(quick)) {
      fix = fixFor === state.version ? fixResult : undefined;
      if (fix === undefined) scheduleFix();
    }
    const fixCells = fix && !fix.none ? [...fix.remove, ...fix.add] : [];
    verdict = { fix, text: verdictWords(quick, state.colour) };
    const ovs = [];
    // the outline as the Explorer draws it, with the light halo only where the plain line does not show on the empty
    // grid (halo "auto" of the overlay: the dark theme)
    if (cells.length) ovs.push(outline(cells, { halo: "auto" }));
    if (fixCells.length) ovs.push(hollowMarks(fixCells));
    view.setOverlays(ovs);
    view.requestDraw();

    const ds = chip.dataset;
    ds.area = String(a.area);
    ds.genus = a.genus === null ? "" : String(a.genus);
    ds.holes = a.holes === null ? "" : String(a.holes);
    ds.connected = String(a.connected);
    ds.admissible = String(!a.empty && a.residue.admissible);
    ds.ringAdmissible = String(!a.empty && a.ring.admissible);
    // the residue test of the type: the shape for +1 and -1, its neighbour ring for 0
    ds.failP = colourCheckOf(a, state.colour).failures.map((r) => r.p).join(",");
    ds.seed = state.seed ? state.seed.join(",") : "";
    ds.verdict = quick === null ? "ok" : "fail";
    ds.fix = fix === undefined ? "pending" : fixCells.length ? "ready" : "none";
    ds.fixRemove = String(fixCells.length ? fix.remove.length : 0);
    ds.fixAdd = String(fixCells.length ? fix.add.length : 0);
    ds.fixMs = fixCells.length ? fixMs.toFixed(1) : "";
    const ok = quick === null;
    const mark = verdictMark(quick);
    if (verdictMarkEl.dataset.ok !== mark.ok) verdictMarkEl.replaceChildren(icon(mark.icon));
    verdictMarkEl.dataset.ok = mark.ok;
    verdictMarkEl.title = verdict.text;
    verdictMarkEl.setAttribute("aria-label", verdict.text);
    const line = chipLine(a, quick, state.colour);
    if (verdictText.textContent !== line) verdictText.textContent = line;
    verdictText.hidden = !line;
    // a disabled control's tooltip is its short reason, its accessible name stays the action's name
    const label = (btn, name, why) => {
      btn.disabled = !!why;
      setIconLabel(btn, name);
      if (why) btn.title = why;
    };
    label(fixBtn, FIX_NAME, build !== null ? BUILDING : fixCells.length ? null : ok ? "Nothing to fix" : fix === undefined ? "Searching" : "No fix found");
    // the packing actions: the verdict's words for a shape that cannot be built (also a row too long, the one rule of a
    // shape refused before a run), else Packing while a Build runs
    const packWhy = ok ? (build !== null ? BUILDING : null) : verdict.text;
    pageBar.set("explore", packWhy);
    pageBar.set("lab", packWhy);
    label(undoBtn, "Undo (Ctrl+Z)", state.canUndo() ? null : "Nothing to undo");
    label(redoBtn, "Redo (Ctrl+Y)", state.canRedo() ? null : "Nothing to redo");
    label(resetBtn, RESET_NAME, resetProblem(selection(), { cells, colour: state.colour }));
    label(clearBtn, CLEAR_NAME, a.empty ? CLEAR_EMPTY : null);
    renderColour();
    if (detailsPop.isOpen()) buildDetails(detailsPop.el);
    if (focusLost(focused)) canvas.focus({ preventScroll: true });
    syncStore();
    onChange(state.snapshot());
  }

  function schedule() {
    if (!raf && !destroyed) raf = requestAnimationFrame(update);
  }
  // updateNow(): the controls at once (a Build that starts or ends shows its buttons and its progress line in the same
  // task), instead of the next animation frame
  function updateNow() {
    if (raf) cancelAnimationFrame(raf);
    update();
  }

  // scheduleFix(): the fix search of the present shape and type, in the fix worker, never while a stroke is drawn
  // (the end of the stroke redraws). A search still running for an older shape is stopped (its worker terminated), a
  // result that comes back for a shape that has changed meanwhile is dropped (the redraw asks again).
  function scheduleFix() {
    if (stroke || destroyed || fixAsked === state.version) return;
    if (fixAsked !== -1) stopFixWorker();
    if (!fixWorker) {
      fixWorker = new Worker(new URL("./fix.worker.mjs", import.meta.url), { type: "module" });
      fixWorker.onmessage = (e) => onFix(e.data);
      fixWorker.onerror = (e) => {
        onFix({ id: fixAsked, error: { code: "worker_failed", message: e.message || "the fix search stopped" } });
      };
    }
    fixAsked = state.version;
    fixWorker.postMessage({ id: fixAsked, cells: state.cells(), colour: state.colour });
  }
  function onFix(m) {
    if (destroyed || m.id !== fixAsked) return;
    fixAsked = -1;
    if (m.id === state.version) {
      fixFor = m.id;
      fixResult = m.error ? { none: true, reason: "no_fix" } : m.fix;
      fixMs = m.ms || 0;
      if (m.error) say(errorLine("The search for a fix stopped.", m.error), "error", m.error.code);
    }
    schedule();
  }
  function stopFixWorker() {
    if (fixWorker) fixWorker.terminate();
    fixWorker = null;
    fixAsked = -1;
  }

  // the fix shown on the canvas, or null
  const shownFix = () => (verdict.fix && !verdict.fix.none && fixFor === state.version ? verdict.fix : null);

  function renderColour() {
    colourCtl.update(state.colour, analysis);
  }

  function buildDetails(el) {
    const a = analysis;
    const t = detailsLines(a);
    if (a.empty) {
      el.replaceChildren(h("div", { class: "xp-details", id: "editor-details-body" }, h("p", null, t.shape)));
      return;
    }
    const table = (summary, caption) =>
      h(
        "table",
        { class: "xp-res" },
        h("caption", { class: "xp-muted xp-res-caption" }, caption),
        h("thead", null, h("tr", null, h("th", null, "p"), h("th", null, "missed class"))),
        h(
          "tbody",
          null,
          summary.records.length
            ? residueRows(summary).map(([p, t], k) => h("tr", null, h("td", null, String(p)), h("td", { class: summary.records[k].missed ? null : "xp-fail" }, t)))
            : h("tr", null, h("td", { colspan: "2" }, "no prime to test")),
        ),
      );
    el.replaceChildren(
      h(
        "div",
        { class: "xp-details", id: "editor-details-body" },
        t.head.map((s) => h("p", { class: "mono" }, s)),
        table(a.residue, t.shape),
        table(a.ring, t.neighbours),
        t.lines.map((s) => h("p", null, s)),
      ),
    );
  }

  function fit() {
    const cells = state.cells();
    view.fit(cells.length ? cells : EMPTY_BOX);
  }

  // load(st): a shape handed in from outside ({ cells, seed, colour }, optionally undo and redo lists of
  // state.history()) is checked before the editor or the view changes, anything else gives an empty canvas
  function load(st) {
    if (st && Array.isArray(st.cells)) {
      if (st.cells.length > 0) {
        try {
          checkShapeCells(st.cells);
        } catch (e) {
          say(errorLine("The shape could not be loaded.", e), "error", e.code || "error");
          return Promise.resolve();
        }
      }
      state.load({ cells: st.cells, seed: st.seed, colour: COLOURS.includes(st.colour) ? st.colour : 1, undo: st.undo, redo: st.redo });
      fit();
      update();
      return Promise.resolve();
    }
    state.load({ cells: [], seed: null });
    fit();
    update();
    return Promise.resolve();
  }

  // ---------- pointer input of the draw tool ----------
  let stroke = null; // { id, last [X, Y] } the pointer that draws
  let pinch = null; // { dist, plane [px, py] under the middle of the two touches } while two fingers pan and zoom
  const touches = new Map(); // pointerId -> [X, Y] of the touch pointers on the canvas
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const applyCell = (c) => {
    try {
      state.draw(c[0], c[1]);
    } catch (e) {
      say(errorLine("This cell is outside the range of the editor.", e), "error", e.code);
    }
  };
  const applyAt = (X, Y) => {
    const s = view.getView().cell;
    const [lx, ly] = stroke.last || [X, Y];
    const dist = Math.hypot(X - lx, Y - ly);
    const steps = Math.max(1, Math.ceil(dist / (0.3 * s)));
    for (let k = 1; k <= steps; k++) applyCell(view.cellAt(lx + ((X - lx) * k) / steps, ly + ((Y - ly) * k) / steps));
    stroke.last = [X, Y];
    schedule();
  };
  // the two touches: their middle and their distance
  const twoTouches = () => {
    const [a, b] = [...touches.values()];
    return { mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 };
  };
  // the plane point under a screen point (unit spacing, relative to the screen place of the cell (0, 0))
  const planeAt = ([X, Y]) => {
    const [ox, oy] = view.toScreen(0, 0);
    const s = view.getView().cell;
    return [(X - ox) / s, (Y - oy) / s];
  };
  const startPinch = () => {
    if (stroke) {
      state.abort();
      stroke = null;
      schedule();
    }
    const t = twoTouches();
    pinch = { dist: t.dist, cell: view.getView().cell, plane: planeAt(t.mid) };
  };
  const movePinch = () => {
    const t = twoTouches();
    view.setCell((pinch.cell * t.dist) / pinch.dist);
    const s = view.getView().cell;
    const [ox, oy] = view.toScreen(0, 0);
    view.panBy(t.mid[0] - pinch.plane[0] * s - ox, t.mid[1] - pinch.plane[1] * s - oy);
  };
  const onDown = (e) => {
    if (tool !== "draw") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const pos = local(e);
    try {
      canvasBox.setPointerCapture(e.pointerId);
    } catch {
      // capture is optional
    }
    if (e.pointerType === "touch") {
      touches.set(e.pointerId, pos);
      if (touches.size === 2) {
        startPinch();
        return;
      }
      if (touches.size > 2 || pinch) return;
    }
    if (stroke) return;
    stroke = { id: e.pointerId, last: null };
    state.begin();
    applyAt(pos[0], pos[1]);
  };
  const onMove = (e) => {
    if (touches.has(e.pointerId)) {
      e.stopPropagation();
      touches.set(e.pointerId, local(e));
      if (pinch && touches.size >= 2) {
        movePinch();
        return;
      }
    }
    if (!stroke || e.pointerId !== stroke.id) return;
    e.stopPropagation();
    const [X, Y] = local(e);
    applyAt(X, Y);
  };
  const onUp = (e) => {
    const wasTouch = touches.delete(e.pointerId);
    if (wasTouch) e.stopPropagation();
    if (pinch && touches.size < 2) pinch = null;
    if (!stroke || e.pointerId !== stroke.id) return;
    e.stopPropagation();
    stroke = null;
    state.end();
    schedule();
  };
  canvasBox.addEventListener("pointerdown", onDown, true);
  canvasBox.addEventListener("pointermove", onMove, true);
  canvasBox.addEventListener("pointerup", onUp, true);
  canvasBox.addEventListener("pointercancel", onUp, true);

  // ---------- undo and redo, by key and by button ----------
  const doHistory = (act) => {
    if (act === "undo") state.undo();
    else state.redo();
    schedule();
  };
  const onKey = (e) => {
    if (destroyed || e.defaultPrevented) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const act = historyKey(e);
    if (!act) return;
    e.preventDefault();
    doHistory(act);
  };
  document.addEventListener("keydown", onKey);

  const setTool = (id) => {
    tool = id;
    for (const b of toolBtns) b.setAttribute("aria-pressed", String(b.dataset.tool === id));
    host.dataset.tool = id;
    schedule();
  };
  setTool("draw");
  for (const b of toolBtns) b.addEventListener("click", () => setTool(b.dataset.tool));
  undoBtn.addEventListener("click", () => doHistory("undo"));
  redoBtn.addEventListener("click", () => doHistory("redo"));
  // Apply fix: the marked cells removed and added as one stroke, one undo takes it back
  fixBtn.addEventListener("click", () => {
    const f = shownFix();
    if (!f || build) return;
    try {
      state.editCells({ remove: f.remove, add: f.add });
    } catch (e) {
      say(errorLine("The fix could not be applied.", e), "error", e.code || "error");
    }
    schedule();
  });
  resetBtn.addEventListener("click", () => {
    const sel = selection();
    if (sel) takeSelection(sel);
  });
  // Clear: the drawing empties as one stroke, one undo takes it back
  clearBtn.addEventListener("click", () => {
    if (state.clear()) schedule();
  });
  // the flask of the page bar
  // canPack(): the drawing can go to a construction (its verdict, with the one rule of a shape refused before a run)
  const canPack = () => canSendToLab(analysis, state.colour);
  function sendNow() {
    if (!canPack() || !store || !navigate) return;
    sendToLab({ store, navigate }, state.snapshot());
  }

  // ---------- Build (the buttons follow `build` in update, the progress display is in the page while it runs) ----------
  function endBuild() {
    build = null;
    const had = progress.el.contains(document.activeElement);
    progress.end();
    delete progress.el.dataset.runOn;
    updateNow();
    if (had) canvas.focus({ preventScroll: true });
  }
  // cancelBuild(): the Stop of the progress display (its button, or Escape inside it): the run ends at once (its worker
  // is ended), the page is as before the run
  function cancelBuild() {
    if (!build) return;
    build.cancel();
    endBuild();
    say("Cancelled");
  }
  // the eye of the page bar: Build, then the result in the Explorer
  function startBuildNow() {
    if (build || !canPack()) return;
    // the drawing is still the shape the Explorer opened, in its type (also after undo or a change taken back): back to
    // that Explorer view, no new construction
    const ed = store ? store.get().editor || {} : {};
    const o = ed.origin;
    if (o && navigate && o.stamp === ed.stamp && o.colour === state.colour && sameShape(o.cells, state.cells())) {
      navigate(o.href);
      return;
    }
    const input = labInputOf(state.snapshot());
    say("");
    progress.begin();
    progress.set({ fraction: 0, line: "Packing" });
    build = startBuild(input, {
      onProgress(p) {
        if (!destroyed && build) progress.set(p);
      },
      onDone(result) {
        if (destroyed) return;
        endBuild();
        if (!result.token) {
          say(errorLine("The construction ended without a link to open.", { code: "no_token", message: "The result has no token." }), "error", "no_token");
          return;
        }
        if (store) {
          // the built region is the one the Explorer opens: it is the selection already, the drawing carries its
          // stamp and is the Lab's input
          const drawing = { cells: input.shape, seed: input.seed, colour: input.colour };
          const sel = selectRegion(store, { kind: "witness", complete: true, ...drawing, token: result.token });
          store.set({ editor: { built: result.token, stamp: sel.stamp } });
          inputForLab(store, drawing);
        }
        if (navigate) navigate(explorerTokenHref(result.token));
      },
      onError(info) {
        if (destroyed) return;
        endBuild();
        say(errorLine(`${info.title}. ${info.sentence}`, { code: info.code }), "error", info.code);
      },
    });
    progress.el.dataset.runOn = build.runOn;
    updateNow();
  }

  // start: the start shape, or the shape and history kept in the store, then the selection to take
  const kept = store ? store.get().editor || {} : {};
  renderColour();
  if (start) load(start);
  else if (Array.isArray(kept.cells) && kept.cells.length) load(kept);
  else load(null);
  if (take) takeSelection(take);

  return {
    load,
    fit,
    state,
    view,
    analysis: () => analysis,
    verdict: () => verdict,
    shownFix,
    setTool,
    building: () => build !== null,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (build) build.cancel();
      build = null;
      progress.end();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      stopFixWorker();
      if (store) {
        const s = state.snapshot();
        const hist = state.history();
        store.set({ editor: { cells: s.cells, seed: s.seed, colour: s.colour, undo: hist.undo, redo: hist.redo } });
      }
      canvasBox.removeEventListener("pointerdown", onDown, true);
      canvasBox.removeEventListener("pointermove", onMove, true);
      canvasBox.removeEventListener("pointerup", onUp, true);
      canvasBox.removeEventListener("pointercancel", onUp, true);
      document.removeEventListener("keydown", onKey);
      detailsPop.close();
      colourCtl.destroy();
      detailsPop.off();
      detailsPop.el.remove();
      if (ownGroup) ownGroup.destroy();
      tools.remove();
      chip.remove();
      delete host.dataset.tool;
      view.setOverlays([]);
    },
  };
}
