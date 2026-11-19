// Regions of the Kronecker colouring: flood fill from a cell, and the combinatorics of finite cell sets
// (Euler characteristic, genus, holes, connectivity, perimeter).
//
// A region is reported complete only when the flood fill exhausted it below the cap. Otherwise its area is a lower
// bound and no genus is reported. This module never calls a region infinite: that is decided only in infinite.mjs,
// from an explicit path to a line of cells that is infinite and of one colour.

import { CodedError } from "./bigint_utils.mjs";
import { NEIGHBOURS, cellKey, compareCells, boundingWindow } from "./geometry.mjs";
import { rowReducer } from "./kronecker.mjs";

const COLOUR_NAMES = { "1": "green", "-1": "red", "0": "blue" };

// "green", "red" or "blue" for the colour 1, -1 or 0 (undefined for anything else). The one table of the colour
// words of the site.
export function colourName(c) {
  return COLOUR_NAMES[String(c)];
}

// colourOfName(word) is the colour of a colour word (the inverse of colourName): 1 for "green", -1 for "red", 0 for
// "blue", null for anything else.
export function colourOfName(word) {
  for (const [c, w] of Object.entries(COLOUR_NAMES)) if (w === word) return Number(c);
  return null;
}

// Euler characteristic of a finite cell set (cells - edges + triangles) and genus = 1 - chi. Triangles are the
// triples {(i, j), (i + 1, j), (i + 1, j + 1)} and {(i, j), (i, j + 1), (i + 1, j + 1)}. Returns
// { vertices, edges, triangles, chi, genus }.
export function genusOfCells(cells) {
  const set = new Set();
  for (const [i, j] of cells) set.add(cellKey(i, j));
  let edges = 0;
  let triangles = 0;
  for (const [i, j] of cells) {
    const r = set.has(cellKey(i + 1, j));
    const u = set.has(cellKey(i, j + 1));
    const ru = set.has(cellKey(i + 1, j + 1));
    if (r) edges++;
    if (u) edges++;
    if (ru) edges++;
    if (r && ru) triangles++;
    if (u && ru) triangles++;
  }
  const chi = set.size - edges + triangles;
  return { vertices: set.size, edges, triangles, chi, genus: 1 - chi };
}

const BOX_LIMIT = 50000000;

// Number of bounded connected components of the complement of a non-empty finite cell set (same adjacency). This
// is a second, independent way to the genus of a connected set. Works in the bounding box padded by 1, where a
// component is bounded exactly when it does not touch the border. Throws "too_large" when that box has more than
// 5 10^7 cells.
export function holeCount(cells) {
  const w0 = boundingWindow(cells, 1);
  const W = w0.imax - w0.imin + 1;
  const H = w0.jmax - w0.jmin + 1;
  if (W * H > BOX_LIMIT) throw new CodedError("too_large", `padded bounding box of ${W} x ${H} cells`);
  // state: 0 free, 1 in the set, 2 visited
  const st = new Uint8Array(W * H);
  for (const [i, j] of cells) st[(j - w0.jmin) * W + (i - w0.imin)] = 1;
  const queue = new Int32Array(W * H);
  let holes = 0;
  for (let start = 0; start < W * H; start++) {
    if (st[start] !== 0) continue;
    st[start] = 2;
    let head = 0, tail = 0;
    queue[tail++] = start;
    let touches = false;
    while (head < tail) {
      const v = queue[head++];
      const a = v % W;
      const b = (v - a) / W;
      if (a === 0 || a === W - 1 || b === 0 || b === H - 1) touches = true;
      for (const [di, dj] of NEIGHBOURS) {
        const na = a + di, nb = b + dj;
        if (na < 0 || na >= W || nb < 0 || nb >= H) continue;
        const nv = nb * W + na;
        if (st[nv] !== 0) continue;
        st[nv] = 2;
        queue[tail++] = nv;
      }
    }
    if (!touches) holes++;
  }
  return holes;
}

// True when the cell set is non-empty and connected (hex adjacency).
export function isConnected(cells) {
  if (!cells || cells.length === 0) return false;
  const set = new Set(cells.map(([i, j]) => cellKey(i, j)));
  const start = cells[0];
  const seen = new Set([cellKey(start[0], start[1])]);
  const stack = [start];
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of NEIGHBOURS) {
      const k = cellKey(i + di, j + dj);
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push([i + di, j + dj]);
      }
    }
  }
  return seen.size === set.size;
}

// Perimeter of a cell set: the number of hexagon sides between a cell of the set and a cell outside it.
export function perimeter(cells) {
  const set = new Set();
  let p = 0;
  for (const [i, j] of cells) {
    const k = cellKey(i, j);
    if (set.has(k)) continue;
    set.add(k);
  }
  const done = new Set();
  for (const [i, j] of cells) {
    const k = cellKey(i, j);
    if (done.has(k)) continue;
    done.add(k);
    for (const [di, dj] of NEIGHBOURS) if (!set.has(cellKey(i + di, j + dj))) p++;
  }
  return p;
}

// Flood fill of the region of the cell (x, d) (bigints or Numbers), capped at `cap` cells. Offsets are relative to
// (x, d). Returns { colour, colourName, cells (sorted by (j, i)), area, complete, genus, chi, edges, triangles,
// rowsEvaluated, symbolsEvaluated }. When the cap is hit: complete = false, area = cells found (a strict lower bound
// of the true area) and genus, chi, edges, triangles are null.
export function floodFill(x, d, cap = 200000) {
  const it = floodFillIter(x, d, cap, 0);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

// cellColours(x, d) is the colour lookup of the cells around (x, d) (bigints) used by every flood fill: at(i, j) is
// the symbol of the cell (x + i, d + j), computed with one rowReducer per row j (kept in `rows`). `symbols` counts
// the calls of at().
export function cellColours(x, d) {
  const rows = new Map();
  const src = {
    rows,
    symbols: 0,
    at(i, j) {
      let row = rows.get(j);
      if (row === undefined) {
        row = rowReducer(x, d + BigInt(j));
        rows.set(j, row);
      }
      src.symbols++;
      return row.symbol(i);
    },
  };
  return src;
}

// breadthFirst(src, colour, options) is the breadth-first loop of every flood fill: the cells of the given colour
// (src.at, see cellColours) connected to the cell (0, 0) by neighbour steps, in breadth-first order (neighbours in the
// order of NEIGHBOURS). The cell (0, 0) is taken to have that colour. Options:
//   cap       at most this many cells (default unbounded). A further cell of the colour ends the loop with
//             complete = false.
//   inside    null (default) or a test (i, j) => boolean: the loop never steps onto a cell outside it (and never
//             evaluates its symbol).
//   onJoin    null (default) or (i, j, index) => boolean, called for every cell that joins (the cell (0, 0) first,
//             index 0): true ends the loop with complete = false and stop = index.
//   parent    null (default) or an array that receives the index of the parent of each cell (-1 for the cell (0, 0)).
//   starts    null (default) or more start cells [[i, j], ...] after the cell (0, 0), each known to be a cell of the
//             region (the caller's proof: a cell of a line the region contains, a cell found by an earlier fill), not
//             tested again; the loop then is the cells connected to any start cell. Each gets parent -1, the cap counts
//             them, a start cell outside `inside` is left out.
//   yieldEvery, yieldAt, phase: with yieldEvery > 0 the generator yields { cells, symbols, rows } (plus phase when
//             given) at the top of the loop once src.symbols has reached yieldAt, and then about every yieldEvery
//             symbol evaluations.
// Returns { cells (offsets [i, j] in breadth-first order), complete, stop (-1 unless onJoin ended the loop) }.
export function* breadthFirst(src, colour, { cap = Infinity, inside = null, onJoin = null, parent = null, starts = null, yieldEvery = 0, yieldAt = Infinity, phase = null } = {}) {
  let nextYield = yieldEvery > 0 ? yieldAt : Infinity;
  const seen = new Set([cellKey(0, 0)]);
  const cells = [[0, 0]];
  if (parent !== null) parent.push(-1);
  if (onJoin !== null && onJoin(0, 0, 0)) return { cells, complete: false, stop: 0 };
  for (const [i, j] of starts || []) {
    const k = cellKey(i, j);
    if (seen.has(k) || (inside !== null && !inside(i, j))) continue;
    seen.add(k);
    if (cells.length >= cap) return { cells, complete: false, stop: -1 };
    cells.push([i, j]);
    if (parent !== null) parent.push(-1);
  }
  let complete = true;
  let stop = -1;
  let head = 0;
  outer: while (head < cells.length) {
    if (src.symbols >= nextYield) {
      nextYield = src.symbols + yieldEvery;
      const rec = { cells: cells.length, symbols: src.symbols, rows: src.rows.size };
      if (phase !== null) rec.phase = phase;
      yield rec;
    }
    const from = head;
    const [i, j] = cells[head++];
    for (const [di, dj] of NEIGHBOURS) {
      const ni = i + di;
      const nj = j + dj;
      const k = cellKey(ni, nj);
      if (seen.has(k)) continue;
      seen.add(k);
      if (inside !== null && !inside(ni, nj)) continue;
      if (src.at(ni, nj) === colour) {
        if (cells.length >= cap) {
          complete = false;
          break outer;
        }
        cells.push([ni, nj]);
        if (parent !== null) parent.push(from);
        if (onJoin !== null && onJoin(ni, nj, cells.length - 1)) {
          complete = false;
          stop = cells.length - 1;
          break outer;
        }
      }
    }
  }
  return { cells, complete, stop };
}

// The same flood fill as a generator. With yieldEvery = k > 0 it yields { cells, symbols, rows } after about every k
// symbol evaluations (so that a page can run it in time slices, show progress and stop it). Its return value is
// exactly the record of floodFill.
export function* floodFillIter(x, d, cap = 200000, yieldEvery = 0) {
  if (typeof x !== "bigint") x = BigInt(x);
  if (typeof d !== "bigint") d = BigInt(d);
  const src = cellColours(x, d);
  const c0 = src.at(0, 0);
  const { cells, complete } = yield* breadthFirst(src, c0, { cap, yieldEvery, yieldAt: yieldEvery });
  const out = {
    colour: c0,
    colourName: colourName(c0),
    cells,
    area: cells.length,
    complete,
    genus: null,
    chi: null,
    edges: null,
    triangles: null,
    rowsEvaluated: src.rows.size,
    symbolsEvaluated: src.symbols,
  };
  if (complete) {
    const g = genusOfCells(cells);
    out.genus = g.genus;
    out.chi = g.chi;
    out.edges = g.edges;
    out.triangles = g.triangles;
  }
  cells.sort(compareCells);
  return out;
}
