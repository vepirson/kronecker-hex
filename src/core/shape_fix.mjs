// Fixes of a drawn shape that cannot be built in a chosen colour: which cells to remove or add so that it can be.
//
// A connected shape S can be built as a green or a red region exactly when S is admissible, and as a blue region
// exactly when N(S) (the cells outside S next to S) is admissible (see admissible.mjs). A set is
// admissible when for every prime p it misses a class of (Z/p)^2. A FIX here turns S into a non-empty connected shape
// that passes the test of its colour and, for green and red, has no row of more than ROW_LIMIT cells (the one rule
// before a run, src/construct/row_limit.mjs).
//
// fixShape(cells, colour, options) returns
//   null                                    when S is non-empty, connected, already passes the test of its colour and,
//                                           for green and red, has no row of more than ROW_LIMIT cells,
//   { none: true, reason }                  when S is empty (reason "empty"), not connected ("not_connected"), or no
//                                           fix was found within the bounds ("no_fix"),
//   { remove, add, cutOff, exact, reason, classes }   otherwise:
//     remove, add  the cells to remove from S and to add to S, each sorted by (j, i),
//     cutOff       how many of the removed cells are removed only because the other removals cut them off from the
//                  piece that is kept (0 when the fix also cuts rows),
//     exact        true when no set of fewer removed cells is a fix (green and red, see below), never for blue and
//                  never when the fix also cuts rows,
//     reason       "remove_classes" (green, red), "add_neighbours" or "remove_next_to_neighbours" (blue), or, when
//                  rows were cut, "cut_rows", alone or followed by "+remove_classes",
//     classes      the residue classes [p, a, b] (cells with i = a and j = b mod p) the fix of the type empties, by
//                  prime: in S for green and red, in N(S) for blue.
//
// The steps for a connected S, in this order:
//   cut_rows  green and red: every row with more than ROW_LIMIT cells keeps ROW_LIMIT consecutive cells of it (in the
//             order of i) and loses the others, and only the largest piece is kept (cutRows below),
//   the fix of the type (below) when the residue test still fails.
// Cells are only removed for green and red. The result is then checked: non-empty, connected, the residue test of the
// type passed, and for green and red no row of more than ROW_LIMIT cells. A result that fails the check is never
// returned.
//
// Green and red, in which sense the fix is smallest. Let F be the primes at which S hits every class. A set S \ R with
// R inside S is admissible exactly when R contains, for every p in F, all cells of S in one class c_p (a subset of S
// can only lose classes, so no other prime can fail). For a choice c = (c_p) let U(c) be the union of those cells and
// L(c) the size of the largest connected piece of S \ U(c). Then the smallest number of cells whose removal leaves a
// non-empty, connected, admissible shape is the minimum over all choices c of |S| - L(c), and keeping a largest piece
// of S \ U(c) attains it. When all choices are searched (their number, the product of p^2 over F, is at most
// maxChoices) the fix is this minimum and exact is true. Otherwise the primes are handled one at a time (smallest
// first, the class with the fewest removed cells including the cut-off ones) and exact is false. Only removals are
// considered: adding cells can never empty a class, but it can reconnect pieces, so a fix that also adds cells can be
// smaller than this one when the removal cuts the shape.
//
// Blue. Let F be the primes at which N(S) hits every class. For every choice of one class per prime in F there are two
// candidates: ADD every cell of N(S) in a chosen class to S (and repeat with the new neighbours until none lies in a
// chosen class), or REMOVE every cell of S next to a cell of N(S) in a chosen class (repeat likewise) and keep the
// largest connected piece. A prime that starts to fail on the way is added to the choice with the class that needs the
// fewest changes, at most maxExtensions times. A candidate is kept only when N of its result passes the residue test
// (it is connected and non-empty by construction), the one with the fewest changed cells is returned (an ADD before a
// REMOVE on a tie, then the classes in the order of the primes), and that one is checked again with the real test
// (connected, non-empty, N admissible) before it is returned. With more than maxChoices choices the primes are taken one at a time from the
// empty choice. A candidate changing more than maxChange cells is dropped. exact is always false for blue: the
// candidates are a heuristic family, not all edits.
//
// Options: maxChoices (default 20000), maxChange (default max(60, |S|)), maxExtensions (default 3). The function is
// pure and deterministic: the same set of cells in any order (duplicates ignored) gives the same fix.

import { CodedError } from "./bigint_utils.mjs";
import { NEIGHBOURS, cellKey, compareCells, neighbourhood } from "./geometry.mjs";
import { residueTest } from "./admissible.mjs";
import { isConnected } from "./regions.mjs";
import { ROW_LIMIT, longestRow } from "../construct/row_limit.mjs";

const mod = (a, p) => ((a % p) + p) % p;
const classOf = (i, j, p) => mod(i, p) * p + mod(j, p);
const isPair = (c) => Array.isArray(c) && c.length === 2 && Number.isInteger(c[0]) && Number.isInteger(c[1]);

// Primes at which the cell list hits every class, ascending.
const failingPrimes = (cells) => residueTest(cells).filter((r) => r.missed === null).map((r) => r.p);

// The largest connected piece of a cell list sorted by (j, i), itself sorted by (j, i). On a tie the piece holding the
// first cell in that order wins.
export function largestPiece(cells) {
  const index = new Map();
  cells.forEach(([i, j], k) => index.set(cellKey(i, j), k));
  const comp = new Int32Array(cells.length).fill(-1);
  let best = -1, bestSize = 0, nComp = 0;
  const stack = [];
  for (let s = 0; s < cells.length; s++) {
    if (comp[s] >= 0) continue;
    const id = nComp++;
    comp[s] = id;
    stack.push(s);
    let size = 0;
    while (stack.length) {
      const v = stack.pop();
      size++;
      const [i, j] = cells[v];
      for (const [di, dj] of NEIGHBOURS) {
        const w = index.get(cellKey(i + di, j + dj));
        if (w !== undefined && comp[w] < 0) {
          comp[w] = id;
          stack.push(w);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = id;
    }
  }
  return cells.filter((_, k) => comp[k] === best);
}

// Decodes the choice index t (first prime most significant, classes a * p + b ascending) into one class per prime.
const decode = (t, primes) => {
  const out = new Array(primes.length);
  for (let k = primes.length - 1; k >= 0; k--) {
    const q = primes[k] * primes[k];
    out[k] = t % q;
    t = Math.floor(t / q);
  }
  return out;
};

const classTriples = (primes, classes) => primes.map((p, k) => [p, Math.floor(classes[k] / p), classes[k] % p]);

const minus = (cells, keep) => {
  const set = new Set(keep.map(([i, j]) => cellKey(i, j)));
  return cells.filter(([i, j]) => !set.has(cellKey(i, j)));
};

// ---------------------------------------------------------------------------------------------------------------
// Green and red: removals only.

function fixByRemoval(cells, opts) {
  const n = cells.length;
  const primes = failingPrimes(cells);
  let product = 1;
  for (const p of primes) product = Math.min(product * p * p, Number.MAX_SAFE_INTEGER);
  let kept, classes, cutOff, exact;
  if (product <= opts.maxChoices) {
    const cls = primes.map((p) => Int32Array.from(cells, ([i, j]) => classOf(i, j, p)));
    const cand = [];
    for (let t = 0; t < product; t++) {
      const c = decode(t, primes);
      let keep = 0;
      for (let v = 0; v < n; v++) {
        let ok = true;
        for (let k = 0; k < primes.length; k++) if (cls[k][v] === c[k]) { ok = false; break; }
        if (ok) keep++;
      }
      if (keep > 0) cand.push([n - keep, t]);
    }
    cand.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let best = null;
    for (const [removed, t] of cand) {
      if (best !== null && (removed > best.cost || (removed === best.cost && best.cutOff === 0))) break;
      const c = decode(t, primes);
      const rest = cells.filter((_, v) => primes.every((_, k) => cls[k][v] !== c[k]));
      const piece = largestPiece(rest);
      const cost = n - piece.length;
      const cut = rest.length - piece.length;
      if (best === null || cost < best.cost || (cost === best.cost && cut < best.cutOff)) best = { cost, cutOff: cut, t, piece };
    }
    kept = best.piece;
    classes = classTriples(primes, decode(best.t, primes));
    cutOff = best.cutOff;
    exact = true;
  } else {
    // One prime at a time, smallest first. A prime may stop failing after the earlier removals.
    kept = cells;
    classes = [];
    cutOff = 0;
    for (;;) {
      const fail = failingPrimes(kept);
      if (fail.length === 0) break;
      const p = fail[0];
      const count = new Int32Array(p * p);
      const cl = Int32Array.from(kept, ([i, j]) => classOf(i, j, p));
      for (const c of cl) count[c]++;
      const order = Array.from({ length: p * p }, (_, c) => c).sort((a, b) => count[a] - count[b] || a - b);
      let best = null;
      for (const c of order) {
        if (best !== null && (count[c] > best.cost || (count[c] === best.cost && best.cutOff === 0))) break;
        const rest = kept.filter((_, v) => cl[v] !== c);
        if (rest.length === 0) continue;
        const piece = largestPiece(rest);
        const cost = kept.length - piece.length;
        const cut = rest.length - piece.length;
        if (best === null || cost < best.cost || (cost === best.cost && cut < best.cutOff)) best = { cost, cutOff: cut, c, piece };
      }
      classes.push([p, Math.floor(best.c / p), best.c % p]);
      cutOff += best.cutOff;
      kept = best.piece;
    }
    exact = false;
  }
  if (!isConnected(kept) || failingPrimes(kept).length > 0) throw new CodedError("internal", "a removal fix failed its own check");
  return { remove: minus(cells, kept), add: [], cutOff, exact, reason: "remove_classes", classes };
}

// ---------------------------------------------------------------------------------------------------------------
// Blue: candidates that add neighbours or remove the cells next to them.

// The class of prime p (as a * p + b) with the fewest cells to change for a candidate of the given mode on the shape
// `cur` (a Map key -> cell) with neighbourhood `nb`: ADD counts the cells of nb in the class, REMOVE the cells of cur
// next to a cell of nb in the class. Ties: the smallest class.
function cheapestClass(mode, cur, nb, p) {
  const count = new Int32Array(p * p);
  if (mode === 0) {
    for (const [i, j] of nb) count[classOf(i, j, p)]++;
  } else {
    const nbClass = new Map(nb.map(([i, j]) => [cellKey(i, j), classOf(i, j, p)]));
    for (const [i, j] of cur.values()) {
      const seen = [];
      for (const [di, dj] of NEIGHBOURS) {
        const c = nbClass.get(cellKey(i + di, j + dj));
        if (c !== undefined && !seen.includes(c)) seen.push(c);
      }
      for (const c of seen) count[c]++;
    }
  }
  let best = 0;
  for (let c = 1; c < p * p; c++) if (count[c] < count[best]) best = c;
  return best;
}

// One candidate: mode 0 ADD, 1 REMOVE, on S = `cells` with N(S) = `nb0`, starting from the chosen classes
// [[p, c], ...], at most maxExt extensions. The neighbourhood is updated round by round, not recomputed: after an ADD
// round only the neighbours of the added cells can join N, after a REMOVE round only the removed cells can. Returns
// { cur (Map key -> cell of the result), cost, cutOff, chosen } when N of the result passes the residue test, or null.
// The result is checked again with the site's functions by the caller.
function runBlue(cells, nb0, mode, chosen, maxExt, maxChange) {
  const cur = new Map(cells.map(([i, j]) => [cellKey(i, j), [i, j]]));
  let nb = new Map(nb0.map(([i, j]) => [cellKey(i, j), [i, j]]));
  chosen = chosen.slice();
  let cutOff = 0, ext = 0, added = 0;
  const changed = () => (mode === 0 ? added : cells.length - cur.size);
  const inChosen = (i, j) => chosen.some(([p, c]) => classOf(i, j, p) === c);
  for (;;) {
    let hits = Array.from(nb.values()).filter(([i, j]) => inChosen(i, j));
    while (hits.length > 0) {
      const next = [];
      if (mode === 0) {
        for (const [i, j] of hits) {
          const k = cellKey(i, j);
          nb.delete(k);
          cur.set(k, [i, j]);
          added++;
        }
        for (const [i, j] of hits) {
          for (const [di, dj] of NEIGHBOURS) {
            const k = cellKey(i + di, j + dj);
            if (cur.has(k) || nb.has(k)) continue;
            nb.set(k, [i + di, j + dj]);
            if (inChosen(i + di, j + dj)) next.push([i + di, j + dj]);
          }
        }
      } else {
        const removed = [];
        for (const [i, j] of hits) {
          for (const [di, dj] of NEIGHBOURS) {
            const k = cellKey(i + di, j + dj);
            const c = cur.get(k);
            if (c === undefined) continue;
            cur.delete(k);
            removed.push(c);
          }
        }
        if (cur.size === 0) return null;
        // N loses the cells with no neighbour left in the shape and gains the removed cells next to the shape.
        const touches = (i, j) => NEIGHBOURS.some(([di, dj]) => cur.has(cellKey(i + di, j + dj)));
        for (const [i, j] of hits) nb.delete(cellKey(i, j));
        for (const [i, j] of removed) {
          for (const [di, dj] of NEIGHBOURS) {
            const k = cellKey(i + di, j + dj);
            const c = nb.get(k);
            if (c !== undefined && !touches(c[0], c[1])) nb.delete(k);
          }
        }
        for (const [i, j] of removed) {
          if (!touches(i, j)) continue;
          nb.set(cellKey(i, j), [i, j]);
          if (inChosen(i, j)) next.push([i, j]);
        }
      }
      if (changed() > maxChange) return null;
      hits = next;
    }
    if (mode === 1) {
      const list = Array.from(cur.values()).sort(compareCells);
      const piece = largestPiece(list);
      if (piece.length < list.length) {
        cutOff += list.length - piece.length;
        cur.clear();
        for (const [i, j] of piece) cur.set(cellKey(i, j), [i, j]);
        nb = new Map(neighbourhood(piece).map(([i, j]) => [cellKey(i, j), [i, j]]));
      }
    }
    const nbList = Array.from(nb.values());
    const fail = failingPrimes(nbList);
    if (fail.length === 0) break;
    if (ext >= maxExt) return null;
    ext++;
    const q = fail[0];
    chosen.push([q, cheapestClass(mode, cur, nbList, q)]);
  }
  return { cur, cost: changed(), cutOff, chosen };
}

function fixBlue(cells, opts) {
  const nb = neighbourhood(cells);
  const primes = failingPrimes(nb);
  let product = 1;
  for (const p of primes) product = Math.min(product * p * p, Number.MAX_SAFE_INTEGER);
  let best = null;
  const better = (r, mode, t) => best === null || r.cost < best.cost || (r.cost === best.cost && (mode < best.mode || (mode === best.mode && t < best.t)));
  if (product <= opts.maxChoices) {
    // Lower bounds of the cost of every candidate: the changes of its first round.
    const nbCls = primes.map((p) => Int32Array.from(nb, ([i, j]) => classOf(i, j, p)));
    const nbIndex = new Map(nb.map(([i, j], x) => [cellKey(i, j), x]));
    const adj = cells.map(([i, j]) => {
      const xs = [];
      for (const [di, dj] of NEIGHBOURS) {
        const x = nbIndex.get(cellKey(i + di, j + dj));
        if (x !== undefined) xs.push(x);
      }
      return xs;
    });
    const cand = [];
    const hit = new Uint8Array(nb.length);
    for (let t = 0; t < product; t++) {
      const c = decode(t, primes);
      hit.fill(0);
      let lbAdd = 0;
      for (let x = 0; x < nb.length; x++) {
        for (let k = 0; k < primes.length; k++) if (nbCls[k][x] === c[k]) { hit[x] = 1; lbAdd++; break; }
      }
      let lbRem = 0;
      for (const xs of adj) if (xs.some((x) => hit[x] === 1)) lbRem++;
      cand.push([lbAdd, 0, t], [lbRem, 1, t]);
    }
    cand.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    for (const [lb, mode, t] of cand) {
      if (lb > opts.maxChange) break;
      if (best !== null) {
        if (lb > best.cost) break;
        // at best a tie, and a tie goes to the candidate found first in the order (cost, mode, choice)
        if (lb === best.cost && (mode > best.mode || (mode === best.mode && t > best.t))) continue;
      }
      const c = decode(t, primes);
      const r = runBlue(cells, nb, mode, primes.map((p, k) => [p, c[k]]), opts.maxExtensions, opts.maxChange);
      if (r !== null && better(r, mode, t)) best = { ...r, mode, t };
    }
  } else {
    for (const mode of [0, 1]) {
      const r = runBlue(cells, nb, mode, [], Infinity, opts.maxChange);
      if (r !== null && better(r, mode, 0)) best = { ...r, mode, t: 0 };
    }
  }
  if (best === null) return { none: true, reason: "no_fix" };
  const out = Array.from(best.cur.values()).sort(compareCells);
  if (out.length === 0 || !isConnected(out) || failingPrimes(neighbourhood(out)).length > 0) {
    throw new CodedError("internal", "a blue fix failed its own check");
  }
  best.classes = best.chosen.map(([p, c]) => [p, Math.floor(c / p), c % p]);
  return {
    remove: minus(cells, out),
    add: minus(out, cells),
    cutOff: best.cutOff,
    exact: false,
    reason: best.mode === 0 ? "add_neighbours" : "remove_next_to_neighbours",
    classes: best.classes,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The whole fix of a connected shape: cut the long rows, then the fix of the type, checked against the run.

// For each cell of a list the indices of its neighbours in the list.
function adjacency(cells) {
  const index = new Map(cells.map(([i, j], k) => [cellKey(i, j), k]));
  return cells.map(([i, j]) => {
    const out = [];
    for (const [di, dj] of NEIGHBOURS) {
      const w = index.get(cellKey(i + di, j + dj));
      if (w !== undefined) out.push(w);
    }
    return out;
  });
}

// The pieces of a cell list with adjacency adj, the cells with gone[k] = 1 left out: piece[k] the number of the piece
// of cell k (-1 for a cell left out), numbered in the order of their first cell, and the size of each piece.
function pieces(adj, gone) {
  const piece = new Int32Array(adj.length).fill(-1);
  const sizes = [];
  const stack = [];
  for (let s = 0; s < adj.length; s++) {
    if (piece[s] >= 0 || gone[s]) continue;
    const id = sizes.length;
    piece[s] = id;
    stack.push(s);
    let size = 0;
    while (stack.length) {
      const v = stack.pop();
      size++;
      for (const w of adj[v]) {
        if (piece[w] < 0 && !gone[w]) {
          piece[w] = id;
          stack.push(w);
        }
      }
    }
    sizes.push(size);
  }
  return { piece, sizes };
}

// The number of the largest piece (the first one on a tie).
const largestOf = (sizes) => sizes.reduce((best, n, p) => (n > sizes[best] ? p : best), 0);

// cutRows(cells): every row with more than ROW_LIMIT cells keeps ROW_LIMIT consecutive cells of it (in the order of i)
// and loses the others, the kept cells chosen so that the largest piece of what remains is largest (on a tie the
// leftmost), and only that largest piece is kept. Rows are handled from the top (largest j) down. The list is connected
// and sorted, and so is the result.
function cutRows(cells) {
  let cur = cells;
  for (const j of [...new Set(cells.map(([, jj]) => jj))].sort((a, b) => b - a)) {
    const row = [];
    cur.forEach(([, jj], k) => { if (jj === j) row.push(k); });
    if (row.length <= ROW_LIMIT) continue;
    const adj = adjacency(cur);
    const gone = new Uint8Array(cur.length);
    let best = null;
    for (let s = 0; s + ROW_LIMIT <= row.length; s++) {
      gone.fill(0);
      row.forEach((k, t) => { if (t < s || t >= s + ROW_LIMIT) gone[k] = 1; });
      const { piece, sizes } = pieces(adj, gone);
      const p = largestOf(sizes);
      if (best === null || sizes[p] > best.size) best = { size: sizes[p], piece, p };
    }
    cur = cur.filter((_, k) => best.piece[k] === best.p);
  }
  return cur;
}

// passes(cells, colour): the residue test of the type (the shape for +1 and -1, its neighbours for 0).
const passes = (cells, colour) => failingPrimes(colour === 0 ? neighbourhood(cells) : cells).length === 0;

// rowsFit(cells, colour): for +1 and -1 no row of more than ROW_LIMIT cells (the one rule before a run).
const rowsFit = (cells, colour) => colour === 0 || longestRow(cells).n <= ROW_LIMIT;

// The cells after a fix, sorted.
const applied = (cells, fix) => minus(cells, fix.remove).concat(fix.add).sort(compareCells);

const NO_FIX = Object.freeze({ none: true, reason: "no_fix" });

// repair(list, colour, opts) for a sorted, non-empty, connected list that has a row over the limit (types +1 and -1)
// or fails the residue test of its type. See the top of this file.
function repair(list, colour, opts) {
  let cur = list;
  let last = null;
  const steps = [];
  if (!rowsFit(cur, colour)) {
    cur = cutRows(cur);
    steps.push("cut_rows");
  }
  if (!passes(cur, colour)) {
    last = colour === 0 ? fixBlue(cur, opts) : fixByRemoval(cur, opts);
    if (last.none) return last;
    // the fix of the type alone, as it was found
    if (steps.length === 0) return last;
    cur = applied(cur, last);
    steps.push(last.reason);
  }
  // the check of the result: non-empty, connected, the residue test of the type, no row over the limit
  if (cur.length === 0 || !isConnected(cur) || !passes(cur, colour) || !rowsFit(cur, colour)) return NO_FIX;
  return { remove: minus(list, cur), add: minus(cur, list), cutOff: 0, exact: false, reason: steps.join("+"), classes: last ? last.classes : [] };
}

// See the top of this file.
export function fixShape(cells, colour, options = {}) {
  if (!Array.isArray(cells) || !cells.every(isPair)) throw new CodedError("bad_format", "cells is not a list of integer pairs [i, j]");
  if (colour !== 1 && colour !== -1 && colour !== 0) throw new CodedError("bad_format", `colour ${colour} is not 1, -1 or 0`);
  const seen = new Set();
  const list = [];
  for (const [i, j] of cells) {
    const k = cellKey(i, j);
    if (seen.has(k)) continue;
    seen.add(k);
    list.push([i, j]);
  }
  list.sort(compareCells);
  if (list.length === 0) return { none: true, reason: "empty" };
  if (!isConnected(list)) return { none: true, reason: "not_connected" };
  if (passes(list, colour) && rowsFit(list, colour)) return null;
  const opts = {
    maxChoices: options.maxChoices ?? 20000,
    maxChange: options.maxChange ?? Math.max(60, list.length),
    maxExtensions: options.maxExtensions ?? 3,
  };
  return repair(list, colour, opts);
}
