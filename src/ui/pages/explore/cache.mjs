// The Explorer's memory of the last visit, within one loaded page: what was on screen when the page was left (its
// colour source with the computed cells, the parts of its record that a return shows, the place of its view), so that
// a return shows it at once instead of computing it again. Memory only (a reload starts empty), one entry, replaced at
// every leave, taken back at the next mount, dropped above KEEP_LIMITS. No DOM, no worker: the page keeps and takes
// the entry, the functions below decide what a return may show.

import { FOLD_LIMIT } from "../../../render/hex_canvas.mjs";
import { absBig } from "../../../core/bigint_utils.mjs";
import { FILL_CAP } from "../../../workers/floodfill.worker.mjs";

// The bound of the entry: cells of the colour source (a Map entry each, some 50 to 80 bytes, so at most about 20 MB),
// row evaluators of the source (each holds a few integers of the size of d), cells of the kept region and witness
// shape (an [i, j] pair each). An entry above any of them is not kept.
export const KEEP_LIMITS = Object.freeze({ cells: 250000, rows: 4000, shown: 400000 });

// The region states whose result a return may show again: a finished flood fill.
const FINISHED = new Set(["done", "capped", "infinite"]);

let kept = null;

// sizeOf({ source, state }) is { cells, rows, shown }: the cells and row evaluators of the source and the cells of the
// kept region and witness (0 for parts that are absent).
export function sizeOf({ source, state }) {
  const st = source ? source.stats() : { cells: 0, rows: 0 };
  const r = state ? state.region : null;
  const w = state ? state.witness : null;
  const shown = (r && Array.isArray(r.cells) ? r.cells.length : 0) + (w ? w.witness.shape.length : 0);
  return { cells: st.cells, rows: st.rows, shown };
}

// withinLimits(size) is true when every count of sizeOf is at most its KEEP_LIMITS bound.
export function withinLimits(size) {
  return size.cells <= KEEP_LIMITS.cells && size.rows <= KEEP_LIMITS.rows && size.shown <= KEEP_LIMITS.shown;
}

// keepVisit({ source, state, place, cap }) keeps what the page shows as it is left: source (the Kronecker colour
// source), state (the record of explore/state.mjs, or null while a job ran: only the source is then kept), place (the
// view's getPlace()) and cap (the flood fill cap of the kept region). An entry above KEEP_LIMITS is dropped. Returns
// true when the entry is kept.
export function keepVisit(entry) {
  kept = entry && entry.source && withinLimits(sizeOf(entry)) ? { cap: FILL_CAP, ...entry } : null;
  return kept !== null;
}

// takeVisit() returns the kept entry and forgets it (null when none): the mounted page owns it from then on.
export function takeVisit() {
  const k = kept;
  kept = null;
  return k;
}

// keptSize() is sizeOf the kept entry, or null when none is kept.
export function keptSize() {
  return kept ? sizeOf(kept) : null;
}

// nearOffset(source, x, d) is the offset [i, j] of the cell (x, d) (bigints) from the centre of source when both
// coordinates differ by at most FOLD_LIMIT (the view can show that cell without moving the centre), else null.
export function nearOffset(source, x, d) {
  const di = x - source.x;
  const dj = d - source.d;
  if (absBig(di) > BigInt(FOLD_LIMIT) || absBig(dj) > BigInt(FOLD_LIMIT)) return null;
  return [Number(di), Number(dj)];
}

// sameBox(a, b): two boxes of the region worker (windowBox and windowBoxOf of explore.mjs) are equal (an absent
// offset cx, cy counts as 0)
export function sameBox(a, b) {
  return !!a && !!b && a.cell === b.cell && a.halfWidth === b.halfWidth && a.halfHeight === b.halfHeight && (a.cx || 0) === (b.cx || 0) && (a.cy || 0) === (b.cy || 0);
}

// regionReusable(entry, x, d) is true when the kept region is the finished flood fill of the cell (x, d) under the
// present cap. A region that is not complete is outlined by its part inside a box: it is shown as it was kept, and
// the page computes the part again for its present view once the view rests (rewindow of explore/state.mjs), the same
// rule as after a pan or a zoom.
export function regionReusable(entry, x, d) {
  const r = entry && entry.state ? entry.state.region : null;
  return !!r && FINISHED.has(r.state) && r.x === x && r.d === d && entry.cap === FILL_CAP;
}

// restoreOf(entry, want) is what a mount may show from the kept entry, as the argument of the transition restore
// of explore/state.mjs ({ selection, fields, region, witness, refill }), or null when the address asks for something
// else (the page then computes as on a first visit). The fields of a click come with the selection (the record drops
// them at the first view that is not the one of the click). want, from the address:
//   { kind: "bare" }                      #/explore with no query: everything kept (the view is the kept place). A
//                                          region that may not be reused is left out (its cell stays selected and
//                                          its flood fill starts again: refill true)
//   { kind: "token", token }               the kept witness when it has this token
//   { kind: "named", name }                the kept witness when it is the shipped witness of this name
//   { kind: "plain", sel: { x, d } }      the kept selection and region when they are those of the address (an
//                                          address without a selection needs no restore: the colour source is kept)
export function restoreOf(entry, want) {
  const s = entry && entry.state;
  if (!s || !want) return null;
  const idle = { state: "idle" };
  if (want.kind === "bare") {
    const sel = s.selection;
    const reuse = s.region.state === "idle" || (!!sel && regionReusable(entry, sel.x, sel.d));
    return { selection: sel, fields: s.fields, region: reuse ? s.region : idle, witness: s.witness, refill: !reuse && !!sel };
  }
  if (want.kind === "token" || want.kind === "named") {
    const w = s.witness;
    const hit = w && (want.kind === "token" ? w.token === want.token : !w.token && w.name === want.name);
    return hit ? { selection: null, region: idle, witness: w, refill: false } : null;
  }
  if (want.kind === "plain") {
    const sel = s.selection;
    if (!want.sel || !sel || sel.x !== want.sel.x || sel.d !== want.sel.d || !regionReusable(entry, sel.x, sel.d)) return null;
    return { selection: sel, fields: s.fields, region: s.region, witness: null, refill: false };
  }
  return null;
}
