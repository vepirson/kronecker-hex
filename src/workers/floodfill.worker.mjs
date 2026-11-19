// The region worker of the Explorer: flood fill of the region of a cell (with progress messages), the part of a region
// inside a box, and verification of a witness, all off the main thread. A job is stopped by terminating the worker (the page then makes a new one).
//
// Messages in:
//   { type: "fill", id, x, d, cap, yieldEvery }   x, d decimal strings of the start cell, cap (default 200000)
//       optional: directedCap (default 200000), withPath (default false), certify (default true, false = the plain
//       flood fill with infinite: null), box (default none) = { cell, halfWidth, halfHeight, cx, cy }: a screen
//       rectangle around the start cell (pixels per cell, half width and half height in pixels, the offset of its
//       centre from the start cell, see boxTest of src/render/hex_canvas.mjs), only with certify
//   { type: "window", id, x, d, box }             the part of the region of (x, d) inside a box again (for a region
//       that is not complete, when the view of its outlined part came to rest elsewhere)
//   { type: "verify", id, witness }               a parsed witness object (kron_hex_witness_v1)
// Messages out:
//   { type: "progress", id, cells, symbols, rows, ms, phase }   at most one per PROGRESS_MS during a fill, phase
//                                                               "fill", "directed" (the search towards a line) or
//                                                               "window" (the part inside the box)
//   { type: "filled", id, result, flat, ms }                     result = the record of floodFillCertified without its
//                                                               cells (the record of floodFill plus `infinite`, null or
//                                                               { id, text, reason, cell, steps, search, visited }),
//                                                               flat = Int32Array [i0, j0, i1, j1, ...] (sorted by (j, i))
//       with a box and a region that is not complete, also window = { flat, count, cut, limit }: the cells of the
//       region connected to the start cell inside the box (an Int32Array as flat, sorted by (j, i)), at most
//       WINDOW_PART_LIMIT of them, the first ones in breadth-first order when cut is true
//   { type: "windowed", id, window, ms }                         window = { flat, count, cut, limit } as above, by the
//                                                               same breadth-first loop inside the box
//   { type: "verified", id, result, ms }                         result = the record of verifyWitness
//   { type: "error", id, code, message }
//
// A region is reported infinite only with a path found inside it to a line of one colour (src/core/infinite.mjs).
// In that case `complete` is false and `area` counts the cells seen before the line was reached.
//
// The same functions run in Node (the tests call handleMessage with their own post function).

import { floodFillIter, cellColours, breadthFirst } from "../core/regions.mjs";
import { compareCells } from "../core/geometry.mjs";
import { floodFillCertified } from "../core/infinite.mjs";
import { parseBigIntStrict, CodedError } from "../core/bigint_utils.mjs";
import { verifyWitness } from "../formats/witness.mjs";
import { boxTest } from "../render/hex_canvas.mjs";

// Minimum time between two progress messages of a fill, in milliseconds.
export const PROGRESS_MS = 100;
// Default cap of a fill.
export const FILL_CAP = 200000;
// Largest number of cells of the part of a region inside a box.
export const WINDOW_PART_LIMIT = 200000;
// Symbol evaluations between two looks at the clock.
export const YIELD_EVERY = 2000;
// Default cap of the search towards a line after a capped fill.
export const DIRECTED_CAP = 200000;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// fillRegion({ id, x, d, cap, yieldEvery, directedCap, withPath, certify, box }, post) runs the certified flood fill
// of the cell (x, d) (decimal strings) and posts progress messages and then one "filled" message. Throws CodedError
// "bad_integer", "bad_cap" or "bad_box" on bad input.
export function fillRegion({ id = null, x, d, cap = FILL_CAP, yieldEvery = YIELD_EVERY, directedCap = DIRECTED_CAP, withPath = false, certify = true, box = null } = {}, post) {
  const bx = parseBigIntStrict(typeof x === "string" ? x : "");
  const bd = parseBigIntStrict(typeof d === "string" ? d : "");
  if (bx === null || bd === null) throw new CodedError("bad_integer", "x and d must be decimal integer strings");
  if (!Number.isInteger(cap) || cap < 1) throw new CodedError("bad_cap", "the cap is a positive integer");
  if (box !== null && certify === false) throw new CodedError("bad_box", "a box is taken only by the certified fill");
  const windowPart = box === null ? null : { inside: boxTest(box || {}), limit: WINDOW_PART_LIMIT };
  const t0 = now();
  let last = t0;
  const every = Math.max(1, yieldEvery | 0);
  const it = certify === false
    ? floodFillIter(bx, bd, cap, every)
    : floodFillCertified(bx, bd, { cap, yieldEvery: every, directedCap, withPath: withPath === true, windowPart });
  let r = it.next();
  while (!r.done) {
    const t = now();
    if (t - last >= PROGRESS_MS) {
      last = t;
      post({ type: "progress", id, cells: r.value.cells, symbols: r.value.symbols, rows: r.value.rows, ms: t - t0, phase: r.value.phase || "fill" });
    }
    r = it.next();
  }
  const res = r.value;
  if (!("infinite" in res)) res.infinite = null;
  const flat = flatOfCells(res.cells);
  const { cells, window: part, ...rest } = res;
  void cells;
  const msg = { type: "filled", id, result: rest, flat, ms: 0 };
  const transfer = [flat.buffer];
  if (part) {
    msg.window = { flat: flatOfCells(part.cells), count: part.count, cut: part.cut, limit: part.limit };
    transfer.push(msg.window.flat.buffer);
  }
  msg.ms = now() - t0;
  post(msg, transfer);
  return msg;
}

// windowRegion({ id, x, d, box }, post) computes the part of the region of the cell (x, d) (decimal strings) inside
// the box: the cells connected to (x, d) inside it in breadth-first order, at most WINDOW_PART_LIMIT (the rule of the
// part of a fill, step 4 of floodFillCertified), and posts one "windowed" message. Throws CodedError "bad_integer" or
// "bad_box" on bad input.
export function windowRegion({ id = null, x, d, box } = {}, post) {
  const bx = parseBigIntStrict(typeof x === "string" ? x : "");
  const bd = parseBigIntStrict(typeof d === "string" ? d : "");
  if (bx === null || bd === null) throw new CodedError("bad_integer", "x and d must be decimal integer strings");
  const inside = boxTest(box || {});
  const t0 = now();
  const src = cellColours(bx, bd);
  const it = breadthFirst(src, src.at(0, 0), { cap: WINDOW_PART_LIMIT, inside });
  let r = it.next();
  while (!r.done) r = it.next();
  const cells = r.value.cells.sort(compareCells);
  const flat = flatOfCells(cells);
  const msg = { type: "windowed", id, window: { flat, count: cells.length, cut: !r.value.complete, limit: WINDOW_PART_LIMIT }, ms: now() - t0 };
  post(msg, [flat.buffer]);
  return msg;
}

// flatOfCells(cells) is the Int32Array [i0, j0, i1, j1, ...] of a list of cells [i, j].
function flatOfCells(cells) {
  const flat = new Int32Array(2 * cells.length);
  cells.forEach(([i, j], k) => {
    flat[2 * k] = i;
    flat[2 * k + 1] = j;
  });
  return flat;
}

// verifyJob({ id, witness }, post) runs verifyWitness and posts one "verified" message.
export function verifyJob({ id = null, witness } = {}, post) {
  const t0 = now();
  const result = verifyWitness(witness);
  const msg = { type: "verified", id, result, ms: now() - t0 };
  post(msg);
  return msg;
}

// handleMessage(msg, post) dispatches one message ("fill", "window" or "verify") and turns every thrown error into an
// "error" message. post(message, transfer) sends a message back.
export function handleMessage(msg, post) {
  const id = msg && msg.id !== undefined ? msg.id : null;
  try {
    if (msg && msg.type === "fill") return fillRegion(msg, post);
    if (msg && msg.type === "window") return windowRegion(msg, post);
    if (msg && msg.type === "verify") return verifyJob(msg, post);
    throw new CodedError("bad_message", `unknown message type ${JSON.stringify(msg && msg.type)}`);
  } catch (e) {
    const out = { type: "error", id, code: (e && e.code) || "error", message: String((e && e.message) || e) };
    post(out);
    return out;
  }
}

// cellsOfFlat(flat) turns the Int32Array of a "filled" message back into a list of cells [i, j].
export function cellsOfFlat(flat) {
  const out = new Array(flat.length / 2);
  for (let k = 0; k < out.length; k++) out[k] = [flat[2 * k], flat[2 * k + 1]];
  return out;
}

// Inside a dedicated worker: answer the page's messages.
const inWorker = typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope;
if (inWorker) {
  self.onmessage = (e) => handleMessage(e.data, (m, transfer) => self.postMessage(m, transfer || []));
}
