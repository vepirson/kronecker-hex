// The Explorer's state: one record, written only by the transitions of createExplorerState, and the pure functions
// that read it (what is shown, what the chip offers, the details, the address). No DOM, no worker, no timer: the page
// runs the effects (workers, the canvas view, the address bar) and draws the record after each transition.
//
// The record (get() returns it, nothing else writes it):
//   prefs      { cells: "soft" | "full", regionOnClick }
//   selection  { x, d, k } the selected cell (bigints) and its symbol, or null
//   fields     { x, d, key } the cell a click selected (decimal strings) while the view keeps the key it had at the
//              click: the x and d fields show it, or null (they show the view centre)
//   job        { id, x, d, last } the flood fill that runs now (last: its latest progress message), or null
//   region     { state, x, d, colour, ... } the computed region, state "idle", "running" ({ last }), "done", "capped" or
//              "infinite" ({ cells, res, part, ms, shown }), "stopped" ({ count }) or "error". A region that is not
//              complete is outlined by its part inside a box (part = { count, cut, limit, box }), the box of the click
//              first, then the box of the view where it came to rest (rewindow)
//   windowJob  { id, x, d, box } the computation of that part for a new box that runs now, or null: the old part
//              stays on screen until it ends
//   witness    { id, witness, token, source, name, x0, d0, area, genus, colour, verify, verifyMs, badgeMs, paintMs,
//              openMs, t0, shownAt, fromAddress, fitKey, shown } the opened witness, or null. verify is null while its
//              check runs (id is that check's job), fitKey the view key of the fitted view (null until it is drawn)
//   openError  { key } while a link that could not be opened stays in the address (key: the view at that moment)
//   opening    { id, token, cells, step, fromRoute, entry, what, t0, view } a long link opened in the background
//   custom     { ax, ad, corners, cells, counts, shown } the custom highlight of the address part b, or null: the
//              corners [i, j] of a closed polygon and its cells (polygonCells of src/core/polygon.mjs), both offsets
//              from the centre cell (ax, ad) of its address (bigints), counts the number of cells of each type
//              { "1", "-1", "0" }. Drawn alone (no selection, no witness, a click or Escape drops it). Beside it, the
//              region of its first corner (customAnchor) is computed by the ordinary flood fill (job and region, as
//              after a click on that cell, but not drawn): Edit and Algorithm open that region.
// A shown region ({ ax, ad, cells, fade, kind, part }) is the custom highlight's (kind "custom") while there is one,
// else the region of a finished fill, else (no computed region) the opened witness's.

import { kronecker } from "../../../core/kronecker.mjs";
import { genusOfCells } from "../../../core/regions.mjs";
import { parseBigIntStrict, absBig, gcdBig, CodedError } from "../../../core/bigint_utils.mjs";
import { polygonCells, POLYGON_CORNER_LIMIT } from "../../../core/polygon.mjs";
import { makeWitness } from "../../../formats/witness.mjs";
import { CELL_MIN, CELL_MAX } from "../../../render/hex_canvas.mjs";
import { FILL_CAP } from "../../../workers/floodfill.worker.mjs";
import { explorerHref, explorerTokenHref, NOT_A_REGION } from "../../actions.mjs";
import { cellsText } from "../../editor/editor_state.mjs";
import { typeLabel } from "../../editor/verdict.mjs";
import { sameBox } from "./cache.mjs";

// Coordinates with more digits than this are not written into the address.
export const URL_DIGIT_LIMIT = 2000;
// Largest |i| or |j| of a selection offset kept in the address.
export const SEL_LIMIT = 1048576;
// The reason every action of a witness that failed its check is disabled with.
export const FAILED_TEXT = "Check failed";
// The reason of the disabled fit and download buttons while nothing is shown.
export const NOTHING_TO_FIT = "No selection";
// The reasons of the actions of a region that is not complete, by its state (the fit button, the pencil and the
// flask): incompleteWhy.
const INCOMPLETE = Object.freeze({ running: "Computing", infinite: "Infinite region", capped: "Too large to fill", stopped: "Stopped", error: "Fill failed" });

const IDLE = Object.freeze({ state: "idle" });

// clickAction({ regionOnClick, inShown, runningHere }) is what a click on a cell does after selecting it: "fill"
// (compute its region) when region-on-click is on, the cell is not in the region already shown and no flood fill of
// that cell is running, else "select" (the selection moves, nothing else).
export function clickAction({ regionOnClick, inShown, runningHere }) {
  return regionOnClick && !inShown && !runningHere ? "fill" : "select";
}

// regionChipState(res) is the chip state of a finished flood fill record: "infinite" when the record carries a
// certified reason ({ infinite: { id, text } }), else "done" for a complete fill and "capped" otherwise.
export function regionChipState(res) {
  if (res && res.infinite && typeof res.infinite === "object") return "infinite";
  return res && res.complete ? "done" : "capped";
}

// createExplorerState({ prefs }) returns { get, ...transitions }. Every transition a visitor causes ends the
// "link could not be opened" state, except cancelOpening, which can start it.
export function createExplorerState({ prefs }) {
  let s = { prefs, selection: null, fields: null, job: null, region: IDLE, windowJob: null, witness: null, openError: null, opening: null, custom: null };
  let lastId = 0;
  const set = (patch) => void (s = { ...s, ...patch });
  const live = (id) => s.job !== null && s.job.id === id;
  const checking = (id) => s.witness !== null && s.witness.id === id && s.witness.verify === null;
  const withWitness = (patch) => set({ witness: { ...s.witness, ...patch } });

  const t = {
    get: () => s,
    setPrefs: (p) => set({ prefs: { ...s.prefs, ...p } }),
    // selectCell(x, d, { fill, key }): the cell is selected (key: the view key of a click, the fields then show the
    // cell) and, when fill (default: region on click), its region is computed unless it lies in the region shown now
    // or its flood fill already runs. A custom highlight goes first (a click is an ordinary selection).
    selectCell(x, d, { fill = s.prefs.regionOnClick, key = null } = {}) {
      set({ selection: { x, d, k: kronecker(x, d) }, fields: key === null ? null : { x: x.toString(), d: d.toString(), key }, openError: null, custom: null });
      const runningHere = s.job !== null && s.job.x === x && s.job.d === d;
      if (clickAction({ regionOnClick: fill, inShown: inShown(s, x, d), runningHere }) === "fill") t.startFill(x, d);
    },
    // no selection, no flood fill, no computed region, no custom highlight (an opened witness shows its region again)
    clearSelection: () => set({ selection: null, fields: null, job: null, region: IDLE, windowJob: null, openError: null, custom: null }),
    // showCustom(ax, ad, corners): the custom highlight of the closed polygon with these corners (offsets [i, j] from the
    // centre cell (ax, ad) of the address, bigints) is drawn alone: the selection, a flood fill, a computed region and
    // an opened witness go. Then the flood fill of its anchor cell (customAnchor: the cell of the first corner) starts,
    // the same job as after a click on that cell (startFill): its region is what Edit and Algorithm open. Returns false
    // (nothing changes) when polygonCells refuses the corners.
    showCustom(ax, ad, corners) {
      const cells = polygonCells(corners);
      if (cells === null) return false;
      const counts = { 1: 0, "-1": 0, 0: 0 };
      for (const [i, j] of cells) counts[kronecker(ax + BigInt(i), ad + BigInt(j))]++;
      const shown = { ax, ad, cells, fade: true, kind: "custom" };
      const custom = { ax, ad, corners: corners.map(([i, j]) => [i, j]), cells, counts, shown };
      set({ selection: null, fields: null, job: null, region: IDLE, windowJob: null, witness: null, openError: null, custom });
      const a = customAnchor(custom);
      t.startFill(a.x, a.d);
      return true;
    },
    closeWitness: () => set({ witness: null, openError: null }),
    // Escape and the chip's X: a selection or a computed region goes when there is one, else an opened witness closes
    clearOrClose: () => (hasSelection(s) ? t.clearSelection() : t.closeWitness()),
    // goTo(x, d) and reset(): the witness closes and the selection goes (the page moves the view), Go then selects
    // (x, d) and computes its region
    reset: () => (t.closeWitness(), t.clearSelection()),
    goTo: (x, d) => (t.reset(), t.selectCell(x, d)),
    startFill(x, d) {
      const id = ++lastId;
      set({ job: { id, x, d, last: null }, region: { state: "running", x, d, colour: kronecker(x, d), last: null }, windowJob: null, openError: null });
      return id;
    },
    // rewindow(box): the view came to rest with this box around the start cell of the shown region (windowBoxOf of
    // the page): when that region is outlined by its part inside another box, the part for this box is computed
    // (windowJob, whose id is returned, null when nothing is to be done). A job for another box is dropped.
    rewindow(box) {
      const r = s.region;
      if (s.job !== null || !r.part || !box || sameBox(r.part.box, box)) {
        if (s.windowJob) set({ windowJob: null });
        return null;
      }
      if (s.windowJob && sameBox(s.windowJob.box, box)) return s.windowJob.id;
      set({ windowJob: { id: ++lastId, x: r.x, d: r.d, box } });
      return s.windowJob.id;
    },
    // windowDone(id, cells, { count, cut, limit }): the part of the job id is the outline now (a stale job is
    // dropped). windowFailed(id): the job ends, the old part stays.
    windowDone(id, cells, { count, cut, limit }) {
      const w = s.windowJob;
      if (!w || w.id !== id) return;
      const part = { count, cut, limit, box: w.box };
      set({ windowJob: null, region: { ...s.region, cells, part, shown: { ...s.region.shown, cells, part } } });
    },
    windowFailed: (id) => s.windowJob && s.windowJob.id === id && set({ windowJob: null }),
    fillProgress: (id, m) => live(id) && set({ job: { ...s.job, last: m }, region: { ...s.region, last: m } }),
    // fillDone(id, res, cells, part, ms): cells is the whole region (complete) or its part inside the box of the click,
    // part = { count, cut, limit, box } (null for a complete region)
    fillDone(id, res, cells, part, ms) {
      if (!live(id)) return;
      const { x, d } = s.job;
      const shown = { ax: x, ad: d, cells, fade: res.complete === true, kind: "region", part };
      set({ job: null, region: { state: regionChipState(res), x, d, colour: res.colour, cells, res, part, ms, shown } });
    },
    // fillFailed(id) is true when the job was the running one (the page then says why)
    fillFailed: (id) => live(id) && (set({ job: null, region: { state: "error", x: s.job.x, d: s.job.d, colour: s.region.colour } }), true),
    stopFill: () => s.job && set({ job: null, region: { ...s.region, state: "stopped", count: s.job.last ? s.job.last.cells : 0 }, openError: null }),
    // openWitness({ witness, x0, d0, token, source, name, t0, shownAt, openMs, fromAddress }): the witness (x0, d0
    // parsed, the shape checked) is opened, the selection goes, its check starts. fromAddress: the view came from the
    // address.
    openWitness({ witness, x0, d0, token = null, source, name = null, t0, shownAt, openMs, fromAddress = false }) {
      t.clearSelection();
      const shown = { ax: x0, ad: d0, cells: witness.shape, fade: true, kind: "witness" };
      const genus = genusOfCells(witness.shape).genus;
      set({ opening: null, witness: { id: ++lastId, witness, token, source, name, x0, d0, area: witness.shape.length, genus, colour: witness.colour, verify: null, t0, shownAt, openMs, fromAddress, fitKey: null, shown } });
      return s.witness.id;
    },
    // restore({ selection, fields, region, witness, custom }, { fromAddress, shownAt }): the parts of a record kept from
    // the last visit of the page (restoreOf of explore/cache.mjs) come back as they were, and no flood fill runs
    // (fields: only when the view is the kept one). A kept witness is opened again with its kept check (a check that
    // had not ended starts again), its first paint is measured anew from shownAt, fromAddress as for openWitness.
    restore({ selection, fields = null, region, witness, custom = null }, { fromAddress = false, shownAt }) {
      const w = witness ? { ...witness, id: ++lastId, fromAddress, fitKey: null, t0: shownAt, shownAt, openMs: 0, paintMs: undefined } : null;
      set({ selection, fields, job: null, region, windowJob: null, witness: w, openError: null, opening: null, custom });
    },
    verifyDone: (id, r, ms, badgeMs) => checking(id) && withWitness({ verify: r, verifyMs: ms, badgeMs }),
    verifyFailed: (id, reason) => checking(id) && withWitness({ verify: { pass: false, reasons: [reason], warnings: [] } }),
    painted: (ms) => s.witness && s.witness.paintMs === undefined && withWitness({ paintMs: ms }),
    // openFailed(key): a link of the address could not be opened, it stays in the address until the view moves away
    // from key or the visitor acts
    openFailed: (key) => set({ opening: null, openError: s.witness ? null : { key } }),
    startOpening({ token, cells, fromRoute, entry, what, t0, view = null }) {
      set({ opening: { id: ++lastId, token, cells, step: -1, fromRoute, entry, what, t0, view } });
      return s.opening.id;
    },
    openingStep: (id, step) => s.opening && s.opening.id === id && set({ opening: { ...s.opening, step } }),
    endOpening: () => s.opening && set({ opening: null }),
    // cancelOpening(key) is true when a link was being opened: a link of the address then stays as one that could
    // not be opened
    cancelOpening: (key) => !!s.opening && ((s.opening.fromRoute ? t.openFailed(key) : t.endOpening()), true),
    // viewChanged(key): the view now has this key. The fields follow the view centre once it moved since the click,
    // a link that could not be opened leaves the address once the view moved since then, and the first view drawn
    // after a witness opened is its fitted view.
    viewChanged(key) {
      if (s.openError && s.openError.key !== key) set({ openError: null });
      if (s.fields && s.fields.key !== key) set({ fields: null });
      if (s.witness && s.witness.fitKey === null && !s.witness.fromAddress) withWitness({ fitKey: key });
    },
  };
  return t;
}

// ---------- what the record shows ----------

// hasSelection(s): a selected cell, a computed region (running, finished, stopped or failed) or a custom highlight is
// on screen
export function hasSelection(s) {
  return s.selection !== null || s.region.state !== "idle" || !!s.custom;
}

// clearRule(s) is what Escape and the chip's X do now: "Clear" (the selection), "Close" (the witness) or null
export function clearRule(s) {
  if (hasSelection(s)) return "Clear";
  return s.witness ? "Close" : null;
}

// incompleteWhy(state) is the short reason of the actions of a computed region in this state that is not complete
// ("Infinite region", "Larger than the cap", ...), null for a complete one ("done") or none ("idle")
export function incompleteWhy(state) {
  return INCOMPLETE[state] || null;
}

// fitWhy(s) is null when the fit button can fit the shown region (a complete one or an opened witness), else its
// reason: NOTHING_TO_FIT when nothing is shown, incompleteWhy for a region that is not complete (its outline is only
// the part around the clicked cell)
export function fitWhy(s) {
  // (a custom highlight is fitted whatever the state of its anchor's region)
  if (s.custom) return null;
  if (s.region.state !== "idle" && s.region.state !== "done") return incompleteWhy(s.region.state);
  return shownOf(s) ? null : NOTHING_TO_FIT;
}

// shownOf(s) is the region drawn at full strength: the custom highlight's cells (kind "custom") while there is one
// (the region of its anchor, computed beside it, is not drawn), else the computed one once its fill ended, else the
// opened witness's while no region is computed, else null
export function shownOf(s) {
  if (s.custom) return s.custom.shown;
  if (s.region.shown) return s.region.shown;
  return s.region.state === "idle" && s.witness ? s.witness.shown : null;
}

// customAnchor(c) is the anchor cell { x, d } (bigints) of a custom highlight c: the cell of its FIRST corner, the
// offset corners[0] from the centre (ax, ad) of its address. Its region (the ordinary flood fill, as after a click on
// that cell) is what Edit and Algorithm open while the highlight is shown. For the squares of A052157 the first corner
// is (0, 0), the cell (r, s), whose region of type 0 holds the whole square.
export function customAnchor(c) {
  return { x: c.ax + BigInt(c.corners[0][0]), d: c.ad + BigInt(c.corners[0][1]) };
}

const SAFE = 4194304; // 2^22: offsets farther than this from a shown region's anchor are not looked up
const keySets = new WeakMap();

// inShown(s, x, d): the cell (x, d) belongs to the region shown now
export function inShown(s, x, d) {
  const sh = shownOf(s);
  if (!sh) return false;
  const di = x - sh.ax;
  const dj = d - sh.ad;
  if (absBig(di) > BigInt(SAFE) || absBig(dj) > BigInt(SAFE)) return false;
  if (!keySets.has(sh)) keySets.set(sh, new Set(sh.cells.map(([i, j]) => `${i},${j}`)));
  return keySets.get(sh).has(`${di},${dj}`);
}

// chipOf(s) is the part of the chip shown: "region" (a computed region), "custom" (a custom highlight), "witness" or
// "idle" (no chip)
export function chipOf(s) {
  if (s.custom) return "custom";
  if (s.region.state !== "idle") return "region";
  return s.witness ? "witness" : "idle";
}

// customColour(counts) is the one type of the cells of a custom highlight (1, -1 or 0), or null when they have several
// (or none yet)
export function customColour(counts) {
  const types = [1, -1, 0].filter((k) => counts[k] > 0);
  return types.length === 1 ? types[0] : null;
}

// customText(c) is the chip text of a custom highlight c ({ cells, counts }), in the words of the region chip:
// "25 cells | all type 0", "1 cell | type +1", "16 cells | 12 type 0, 4 type +1" (the types in the order +1, -1, 0)
export function customText(c) {
  const n = c.cells.length;
  const one = customColour(c.counts);
  if (one !== null) return `${cellsText(n)} | ${n > 1 ? "all " : ""}type ${typeLabel(one)}`;
  const parts = [1, -1, 0].filter((k) => c.counts[k] > 0).map((k) => `${c.counts[k]} type ${typeLabel(k)}`);
  return `${cellsText(n)} | ${parts.join(", ")}`;
}

// customDataOf(s) is the data attributes of the chip's region part while it shows a custom highlight (decimal
// strings): { state: "custom", area, corners, plus, minus, zero (the cells of each type), colour (the one type, absent
// for several) }, {} without one
export function customDataOf(s) {
  const c = s.custom;
  if (!c) return {};
  const o = { state: "custom", area: String(c.cells.length), corners: String(c.corners.length), plus: String(c.counts[1]), minus: String(c.counts[-1]), zero: String(c.counts[0]) };
  const one = customColour(c.counts);
  if (one !== null) o.colour = String(one);
  return o;
}

// witnessUsable(w): an opened witness offers its actions unless its check failed (also while the check runs)
export function witnessUsable(w) {
  return !w.verify || w.verify.pass === true;
}

// blockedOf(s) is FAILED_TEXT when the chip shows a witness that failed its check (every action of the chip and the
// download button are then disabled with it), else null
export function blockedOf(s) {
  return chipOf(s) === "witness" && !witnessUsable(s.witness) ? FAILED_TEXT : null;
}

// subjectOf(s) is what the chip's actions act on, in the terms of regionActions (src/ui/actions.mjs): the computed
// region (complete once its fill ended inside the cap, else with why, the reason of incompleteWhy, placed by at, its
// clicked cell), also while a custom highlight is shown (then the region of its anchor, customAnchor: Edit and
// Algorithm open the ordinary region, exactly as after a click on that cell, never the highlighted cells), else a
// custom highlight without a region (kind "custom": no action, the reason NOT_A_REGION), else the opened witness, else
// null
export function subjectOf(s) {
  const r = s.region;
  if (r.state !== "idle") {
    const complete = r.state === "done" && !!r.res;
    return { kind: "region", complete, why: complete ? null : incompleteWhy(r.state), cells: r.cells, seed: [0, 0], colour: r.res ? r.res.colour : r.colour, token: null, at: [r.x, r.d] };
  }
  if (s.custom) return { kind: "custom", complete: true, cells: s.custom.cells, seed: null, colour: customColour(s.custom.counts), token: null };
  const w = s.witness;
  return w ? { kind: "witness", complete: true, cells: w.witness.shape, seed: w.witness.seed, colour: w.colour, token: w.token } : null;
}

// downloadOf(s) is { build() } (the witness of what the chip's actions act on, subjectOf: a complete region found by a
// click or, while a custom highlight is shown, the region of its anchor, or the opened witness) or { why } (the tooltip
// of the disabled download button: the reason of a region not complete, NOT_A_REGION for a custom highlight without a
// region)
export function downloadOf(s) {
  const r = s.region;
  if (r.state === "done" && r.res) return { build: () => makeWitness({ id: null, colour: r.res.colour, x0: r.x, d0: r.d, seed: [0, 0], shape: r.cells }) };
  if (r.state !== "idle") return { why: incompleteWhy(r.state) };
  if (s.custom) return { why: NOT_A_REGION };
  if (!s.witness) return { why: NOTHING_TO_FIT };
  return witnessUsable(s.witness) ? { build: () => s.witness.witness } : { why: FAILED_TEXT };
}

// seedCellOf(w) is the seed cell of an opened witness, { x, d } (bigints)
function seedCellOf(w) {
  const [i, j] = Array.isArray(w.witness.seed) ? w.witness.seed : [0, 0];
  return { x: w.x0 + BigInt(i), d: w.d0 + BigInt(j) };
}

// fieldsOf(s, v) is what the x and d fields show (decimal strings): the cell a click selected while the view keeps the
// key of the click, else the anchor cell of a custom highlight or the seed cell of the witness the chip shows (the cell
// of its details), else the view middle v = { x, d }.
export function fieldsOf(s, v) {
  if (s.fields) return { x: s.fields.x, d: s.fields.d };
  if (chipOf(s) === "custom") return { x: s.custom.ax.toString(), d: s.custom.ad.toString() };
  if (chipOf(s) === "witness") {
    const c = seedCellOf(s.witness);
    return { x: c.x.toString(), d: c.d.toString() };
  }
  return { x: v.x, d: v.d };
}

// detailsOf(s) is the content of the details popover, the same lines for a region found by a click and for an
// opened witness: { fail (the reasons of a failed check, or null), x, d (the clicked cell, or the witness's seed
// cell), gcd (when the cell is blue, else null), notes ([{ text, id?, reason? }]) }, or null when the chip shows
// nothing. (The cost of the flood fill is not a visitor's line: regionDataOf and witnessDataOf keep it as data.)
export function detailsOf(s) {
  const r = s.region;
  const regionNotes = () => {
    const notes = [];
    if (r.state === "capped") notes.push({ text: `stopped at the cap of ${FILL_CAP} cells` });
    if (r.state === "stopped") notes.push({ text: "stopped by hand" });
    if (r.state === "infinite" && r.res && r.res.infinite) notes.push({ id: "region-infinite", reason: String(r.res.infinite.id || ""), text: `infinite: ${r.res.infinite.text || r.res.infinite.id}` });
    return notes;
  };
  // a custom highlight: its anchor cell (customAnchor, the cell whose region Edit and Algorithm open), its chip text,
  // then the notes of that region
  const c = s.custom;
  if (c) {
    const { x, d } = customAnchor(c);
    return { fail: null, x, d, gcd: kronecker(x, d) === 0 ? gcdBig(x, d) : null, notes: [{ text: customText(c) }, ...regionNotes()] };
  }
  if (r.state !== "idle") {
    const x = s.selection ? s.selection.x : r.x;
    const d = s.selection ? s.selection.d : r.d;
    const k = s.selection ? s.selection.k : kronecker(x, d);
    return { fail: null, x, d, gcd: k === 0 ? gcdBig(x, d) : null, notes: regionNotes() };
  }
  const w = s.witness;
  if (!w) return null;
  const v = w.verify;
  const { x, d } = seedCellOf(w);
  return { fail: v && v.pass !== true ? v.reasons || [] : null, x, d, gcd: kronecker(x, d) === 0 ? gcdBig(x, d) : null, notes: [] };
}

// modeOf(s) is the mode of the address: "token", "named" (a shipped witness by name), "witness" (a file), "error" (a
// link that could not be opened) or "free"
export function modeOf(s) {
  if (s.witness) return s.witness.token ? "token" : s.witness.name ? "named" : "witness";
  return s.openError ? "error" : "free";
}

// regionDataOf(s) and witnessDataOf(s) are the data attributes of the chip's two parts, written from the record only
// (decimal strings, absent keys left out)
export function regionDataOf(s) {
  const r = s.region;
  const o = { state: r.state };
  if (r.state === "running" && r.last) o.cells = String(r.last.cells);
  if (r.state === "stopped") o.area = String(r.count);
  if (r.res) {
    Object.assign(o, { ms: String(Math.round(r.ms)), area: String(r.res.area), colour: String(r.res.colour), symbols: String(r.res.symbolsEvaluated) });
    if (r.state === "done") o.genus = String(r.res.genus);
    if (r.state === "infinite") o.infinite = String(r.res.infinite.id || "");
    if (r.part) o.outlined = String(r.part.count);
  }
  return o;
}
export function witnessDataOf(s) {
  const w = s.witness;
  if (!w) return {};
  const ms = (v) => (v === undefined ? undefined : String(Math.round(v)));
  const flood = w.verify && w.verify.info && w.verify.info.flood;
  const o = { area: String(w.area), genus: String(w.genus), colour: String(w.colour), source: w.source, name: w.name || undefined,
    tokenLength: w.token ? String(w.token.length) : undefined, openMs: ms(w.openMs), pass: w.verify ? String(w.verify.pass === true) : undefined,
    verifyMs: ms(w.verifyMs), badgeMs: ms(w.badgeMs), paintMs: ms(w.paintMs), symbols: flood ? String(flood.symbols) : undefined };
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

// ---------- the address ----------

const toDecimal = (v) => (typeof v === "bigint" ? v.toString() : String(v));
const round2 = (v) => Math.round(Number(v) * 100) / 100;

// an offset kept in the address: an integer of at most SEL_LIMIT in size
const inLimit = (v) => Number.isInteger(v) && Math.abs(v) <= SEL_LIMIT;

// viewQuery({ x, d, cell, sel, b }) is the address query of a view: { ok: true, query: { x, d, z, sel?, b? } } with
// x, d decimal strings, z the cell size rounded to 2 decimals, sel "i,j" (an offset from (x, d), left out when null or
// larger than SEL_LIMIT) and b "i0,j0,i1,j1,..." (the corners of a custom highlight as offsets from (x, d), left out
// when null, when not 1 to POLYGON_CORNER_LIMIT corners or when a corner is farther than SEL_LIMIT). When x or d has
// more than URL_DIGIT_LIMIT digits: { ok: false, reason: "too_long", digits: { x, d } }.
export function viewQuery({ x, d, cell, sel = null, b = null }) {
  const xs = toDecimal(x);
  const ds = toDecimal(d);
  if (parseBigIntStrict(xs) === null || parseBigIntStrict(ds) === null) throw new CodedError("bad_integer", "Both x and d must be integers.");
  const digits = { x: xs.replace(/^-/, "").length, d: ds.replace(/^-/, "").length };
  if (digits.x > URL_DIGIT_LIMIT || digits.d > URL_DIGIT_LIMIT) return { ok: false, reason: "too_long", digits };
  const query = { x: xs, d: ds, z: String(round2(cell)) };
  if (Array.isArray(sel) && inLimit(sel[0]) && inLimit(sel[1])) {
    query.sel = `${sel[0]},${sel[1]}`;
  }
  if (Array.isArray(b) && b.length >= 1 && b.length <= POLYGON_CORNER_LIMIT && b.every((c) => Array.isArray(c) && inLimit(c[0]) && inLimit(c[1]))) {
    query.b = b.map(([i, j]) => `${i},${j}`).join(",");
  }
  return { ok: true, query, digits };
}

// readCorners(text) reads the address part b of a custom highlight: "i0,j0,i1,j1,..." (decimal integers separated by
// commas, an even count) gives the corners [[i0, j0], [i1, j1], ...], offsets from the centre cell (x, d) of the
// address. null when the text is malformed, has not 1 to POLYGON_CORNER_LIMIT corners, has an offset larger than
// SEL_LIMIT, or when polygonCells refuses the polygon (its rectangle holds more than POLYGON_BOX_LIMIT cells).
export function readCorners(text) {
  const t = String(text);
  if (!/^-?[0-9]+(,-?[0-9]+)*$/.test(t)) return null;
  const v = t.split(",").map(Number);
  if (v.length % 2 !== 0 || v.length < 2 || v.length > 2 * POLYGON_CORNER_LIMIT || !v.every(inLimit)) return null;
  const corners = [];
  for (let k = 0; k < v.length; k += 2) corners.push([v[k], v[k + 1]]);
  return polygonCells(corners) === null ? null : corners;
}

// readViewQuery(query) reads an address query. Returns { x, d (bigints or null when absent or invalid), cell (a
// number in [CELL_MIN, CELL_MAX] or null), sel ([i, j] or null), b (the corners of readCorners, or null), problems
// (sentences about ignored parts) }. A valid b wins over sel: sel is then ignored (not read, no sentence about it).
export function readViewQuery(query = {}) {
  const problems = [];
  let x = null;
  let d = null;
  if (query.x !== undefined || query.d !== undefined) {
    x = parseBigIntStrict(String(query.x === undefined ? "" : query.x));
    d = parseBigIntStrict(String(query.d === undefined ? "" : query.d));
    if (x === null || d === null) {
      problems.push("The x or d of the address is not an integer.");
      x = null;
      d = null;
    }
  }
  let cell = null;
  if (query.z !== undefined) {
    const z = Number(query.z);
    if (Number.isFinite(z) && z > 0) cell = Math.max(CELL_MIN, Math.min(CELL_MAX, z));
    else problems.push("The zoom of the address is not a number.");
  }
  let b = null;
  if (query.b !== undefined) {
    b = readCorners(query.b);
    if (b === null) problems.push("The highlighted cells of the address are not valid.");
  }
  let sel = null;
  if (query.sel !== undefined && b === null) {
    const m = /^(-?[0-9]+),(-?[0-9]+)$/.exec(String(query.sel));
    if (m && Math.abs(Number(m[1])) <= SEL_LIMIT && Math.abs(Number(m[2])) <= SEL_LIMIT) sel = [Number(m[1]), Number(m[2])];
    else problems.push("The selected cell of the address is not valid.");
  }
  return { x, d, cell, sel, b, problems };
}

// witnessViewOf(query) reads the view of an opened witness from its address (#/w/<token>?z=..&at=a,b or
// #/explore?w=<name>&z=..&at=a,b): { cell (from z, or null), at ([a, b], the view centre minus the witness's base
// cell in cells along the screen axes, [0, 0] when absent) } when z or a valid at is given, else null (the region
// is fitted, as for an address without them).
export function witnessViewOf(query = {}) {
  const m = /^(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?)$/.exec(String(query.at === undefined ? "" : query.at));
  const at = m && Math.abs(Number(m[1])) <= SEL_LIMIT && Math.abs(Number(m[2])) <= SEL_LIMIT ? [Number(m[1]), Number(m[2])] : null;
  const { cell } = readViewQuery({ z: query.z });
  return cell === null && at === null ? null : { cell, at: at || [0, 0] };
}

// selectionOffset(s, v) is the offset [i, j] of the selected cell from the view middle (v.x, v.d decimal strings), or
// null without a selection or when it is farther than SEL_LIMIT
export function selectionOffset(s, v) {
  if (!s.selection) return null;
  const di = s.selection.x - BigInt(v.x);
  const dj = s.selection.d - BigInt(v.d);
  if (absBig(di) > BigInt(SEL_LIMIT) || absBig(dj) > BigInt(SEL_LIMIT)) return null;
  return [Number(di), Number(dj)];
}

// customOffsets(s, v) is the corners of the custom highlight as offsets [i, j] from the view middle (v.x, v.d decimal
// strings), or null without one or when a corner is farther than SEL_LIMIT (b is then left out of the address)
export function customOffsets(s, v) {
  const c = s.custom;
  if (!c) return null;
  const di = c.ax - BigInt(v.x);
  const dj = c.ad - BigInt(v.d);
  const far = BigInt(2 * SEL_LIMIT);
  if (absBig(di) > far || absBig(dj) > far) return null;
  const out = c.corners.map(([i, j]) => [i + Number(di), j + Number(dj)]);
  return out.every(([i, j]) => inLimit(i) && inLimit(j)) ? out : null;
}

const plainQuery = (s, v) => {
  const q = viewQuery({ x: v.x, d: v.d, cell: v.cell, sel: selectionOffset(s, v), b: customOffsets(s, v) });
  return q.ok ? q.query : null;
};

// addressOf(s, v) is the address of the page in the state s with the view v = { x, d (the middle cell, decimal
// strings), cell, key, at (the view centre minus the screen place of the witness's base cell in pixels, or null when
// that cell is too far) }, or null while a link that could not be opened stays in the address:
//   a token        #/w/<token>, plus z and at (in cells of the rounded z) once the view is not the fitted one
//   a shipped one  #/explore?w=<name>, the same
//   else           #/explore?x=..&d=..&z=..&sel=i,j (or &b=i0,j0,... while a custom highlight is shown, so that a
//                  copied link shows it again), the bare #/explore above the 2000-digit rule
export function addressOf(s, v) {
  const w = s.witness;
  if (w && (w.token || w.name)) {
    const moved = w.fromAddress || (w.fitKey !== null && w.fitKey !== v.key);
    const z = round2(v.cell);
    const q = moved && v.at ? { z: String(z), at: `${round2(v.at[0] / z)},${round2(v.at[1] / z)}` } : null;
    return w.token ? explorerTokenHref(w.token, q) : explorerHref({ w: w.name, ...q });
  }
  if (s.openError) return null;
  return explorerHref(plainQuery(s, v));
}
