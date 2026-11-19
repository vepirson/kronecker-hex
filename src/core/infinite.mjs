// Certified infinite regions. A region is called infinite only when a search has found an explicit path of cells of
// the region's colour from the start cell to a cell of one of the lines below. Each line is an infinite path of
// adjacent cells, all of one colour for an elementary reason, so a region that meets it contains all of it.
//
// Nothing here says how many infinite regions there are, and no region is called infinite from a distance, a cap or
// a guess. When no path is found the answer is simply "not certified" (infinite: null).
//
// A line is a row (cells (t, at)), a column (cells (at, t)) or a diagonal (cells (t, t - at)), with the parameter t
// in [from, to] (null = unbounded). Consecutive cells of a line are neighbours: the steps are (1, 0), (0, 1) and
// (1, 1).

import { CodedError } from "./bigint_utils.mjs";
import { NEIGHBOURS, cellKey, compareCells } from "./geometry.mjs";
import { kronecker } from "./kronecker.mjs";
import { colourName, genusOfCells, cellColours, breadthFirst } from "./regions.mjs";

const cert = (o) => Object.freeze({ ...o, colourName: colourName(o.colour) });

// The certificate lines, in the order in which certificateAt looks them up.
export const CERTIFICATES = Object.freeze([
  cert({
    id: "row_d_1", colour: 1, kind: "row", at: 1n, from: null, to: null,
    text: "contains the row d = 1",
    reason: "(x | 1) = 1 for every integer x, so the whole row d = 1 is green.",
  }),
  cert({
    id: "col_x_1", colour: 1, kind: "column", at: 1n, from: null, to: null,
    text: "contains the column x = 1",
    reason: "(1 | d) = 1 for every integer d, also for d = 0 and d < 0, so the whole column x = 1 is green.",
  }),
  cert({
    id: "row_d_m1_right", colour: 1, kind: "row", at: -1n, from: 0n, to: null,
    text: "contains the half row d = -1, x >= 0",
    reason: "(x | -1) = 1 for every x >= 0, so this half row is green.",
  }),
  cert({
    id: "row_d_m1_left", colour: -1, kind: "row", at: -1n, from: null, to: -1n,
    text: "contains the half row d = -1, x <= -1",
    reason: "(x | -1) = -1 for every x < 0, so this half row is red.",
  }),
  cert({
    id: "col_x_0_up", colour: 0, kind: "column", at: 0n, from: 2n, to: null,
    text: "contains the half column x = 0, d >= 2",
    reason: "(0 | d) = 0 when d >= 2, since gcd(0, d) = d > 1, so this half column is blue.",
  }),
  cert({
    id: "col_x_0_down", colour: 0, kind: "column", at: 0n, from: null, to: -2n,
    text: "contains the half column x = 0, d <= -2",
    reason: "(0 | d) = 0 when d <= -2, since gcd(0, d) = |d| > 1, so this half column is blue.",
  }),
  cert({
    id: "row_d_0_right", colour: 0, kind: "row", at: 0n, from: 2n, to: null,
    text: "contains the half row d = 0, x >= 2",
    reason: "(x | 0) = 0 unless x = 1 or x = -1, so this half row is blue.",
  }),
  cert({
    id: "row_d_0_left", colour: 0, kind: "row", at: 0n, from: null, to: -2n,
    text: "contains the half row d = 0, x <= -2",
    reason: "(x | 0) = 0 unless x = 1 or x = -1, so this half row is blue.",
  }),
  cert({
    id: "diag_up", colour: 0, kind: "diagonal", at: 0n, from: 2n, to: null,
    text: "contains the half diagonal x = d >= 2",
    reason: "(t | t) = 0 for t >= 2, since gcd(t, t) = t > 1, so the cells (t, t) with t >= 2 are blue.",
  }),
  cert({
    id: "diag_down", colour: 0, kind: "diagonal", at: 0n, from: null, to: -2n,
    text: "contains the half diagonal x = d <= -2",
    reason: "(t | t) = 0 for t <= -2, since gcd(t, t) = |t| > 1, so the cells (t, t) with t <= -2 are blue.",
  }),
]);

// The certified infinite regions: the lines of CERTIFICATES grouped by the region they lie in. The three lines of
// type +1 meet each other (the row d = 1 and the column x = 1 at (1, 1), the column and the half row d = -1, x >= 0 at
// (1, -1)), so they lie in one region. The half row of type -1 is a region of its own lines. Each half line of type 0
// is a whole region: a neighbour of one of its cells that is not on it lies on a row d = +-1 or a column x = +-1 (for
// the half rows and half columns) or is (t +- 1, t) or (t, t +- 1) (for the half diagonals), or is the cell just past
// the end of the half line ((+-1, 0), (0, +-1), (+-1, +-1)); its two coordinates have gcd 1, so it is not of type 0.
// A region called infinite by a path to one of its lines contains every line of its group.
export const INFINITE_REGIONS = Object.freeze([
  Object.freeze({ id: "plus", lines: Object.freeze(["row_d_1", "col_x_1", "row_d_m1_right"]) }),
  Object.freeze({ id: "minus", lines: Object.freeze(["row_d_m1_left"]) }),
  ...["col_x_0_up", "col_x_0_down", "row_d_0_right", "row_d_0_left", "diag_up", "diag_down"].map((id) => Object.freeze({ id, lines: Object.freeze([id]) })),
]);

// regionLines(id) is the list of certificates (entries of CERTIFICATES) of the region that contains the line of the
// certificate id, [] for an unknown id.
export function regionLines(id) {
  const g = INFINITE_REGIONS.find((r) => r.lines.includes(id));
  return g ? g.lines.map((l) => CERTIFICATES.find((c) => c.id === l)) : [];
}

// lineCellsInRows(certs, x0, d0, rows) is the list of the cells [i, j] (offsets from (x0, d0)) of the lines of the
// certificates certs that lie in the rows [[j, ilo, ihi], ...] (the cells (i, j) with ilo <= i <= ihi of each row j),
// exact: found by the formulas of the lines, wherever (x0, d0) is.
export function lineCellsInRows(certs, x0, d0, rows) {
  x0 = big(x0);
  d0 = big(d0);
  const out = [];
  const inRange = (c, t) => (c.from === null || t >= c.from) && (c.to === null || t <= c.to);
  for (const c of certs) {
    for (const [j, ilo, ihi] of rows) {
      const bj = BigInt(j);
      if (c.kind === "row") {
        if (c.at - d0 !== bj) continue;
        for (let i = ilo; i <= ihi; i++) if (inRange(c, x0 + BigInt(i))) out.push([i, j]);
      } else {
        const bi = c.kind === "column" ? c.at - x0 : bj + c.at - (x0 - d0);
        if (bi < BigInt(ilo) || bi > BigInt(ihi)) continue;
        const t = c.kind === "column" ? d0 + bj : x0 + bi;
        if (inRange(c, t)) out.push([Number(bi), j]);
      }
    }
  }
  return out;
}

const big = (v) => (typeof v === "bigint" ? v : BigInt(v));

// lineCell(c, t) is the cell [x, d] (bigints) with parameter t on the line of the certificate c (t need not be in
// [from, to]).
export function lineCell(c, t) {
  t = big(t);
  if (c.kind === "row") return [t, c.at];
  if (c.kind === "column") return [c.at, t];
  return [t, t - c.at];
}

// The parameter t of the cell (x, d) on the full line of c, or null when the cell is not on that full line.
function paramOnLine(c, x, d) {
  if (c.kind === "row") return d === c.at ? x : null;
  if (c.kind === "column") return x === c.at ? d : null;
  return x - d === c.at ? x : null;
}

// certificateAt(x, d) (bigints or safe Numbers, exact) is the first certificate of CERTIFICATES whose line contains
// the cell (x, d), or null.
export function certificateAt(x, d) {
  x = big(x);
  d = big(d);
  for (const c of CERTIFICATES) {
    const t = paramOnLine(c, x, d);
    if (t === null) continue;
    if (c.from !== null && t < c.from) continue;
    if (c.to !== null && t > c.to) continue;
    return c;
  }
  return null;
}

// The point of [lo, hi] nearest to the interval [a, b] (a <= b), for the bigint or Number type of the arguments.
// lo, hi may be null (unbounded).
function nearestParam(a, b, lo, hi) {
  if (lo !== null && b < lo) return lo;
  if (hi !== null && a > hi) return hi;
  return lo !== null && a < lo ? lo : a;
}

const absB = (v) => (v < 0n ? -v : v);
const maxB = (a, b, c) => {
  let m = a > b ? a : b;
  return m > c ? m : c;
};

// distanceToLine(c, x, d) (bigints, exact) is the hex distance max(|di|, |dj|, |di - dj|) from the cell (x, d) to the
// nearest cell of the line of the certificate c (a bigint). The distance is convex along the line, so the minimum
// over [from, to] is at the point of [from, to] nearest to the interval where the unbounded minimum is taken.
export function distanceToLine(c, x, d) {
  x = big(x);
  d = big(d);
  let s;
  let di;
  let dj;
  if (c.kind === "row") {
    const v = c.at - d; // dj, fixed
    s = nearestParam(x + (v < 0n ? v : 0n), x + (v > 0n ? v : 0n), c.from, c.to);
    di = s - x;
    dj = v;
  } else if (c.kind === "column") {
    const u = c.at - x; // di, fixed
    s = nearestParam(d + (u < 0n ? u : 0n), d + (u > 0n ? u : 0n), c.from, c.to);
    di = u;
    dj = s - d;
  } else {
    const k = d - x + c.at; // di - dj, fixed: the target is (s, s - at)
    s = nearestParam(x + (k < 0n ? k : 0n), x + (k > 0n ? k : 0n), c.from, c.to);
    di = s - x;
    dj = s - c.at - d;
  }
  return maxB(absB(di), absB(dj), absB(di - dj));
}

// Offsets of a search stay below 2^24 in absolute value. A line bound farther away than FAR from the start can never
// bind, so it is stored as +-FAR, which keeps every comparison with a reachable offset exact.
const FAR = 2 ** 30;
const clampFar = (v) => (v === null ? null : v > BigInt(FAR) ? FAR : v < -BigInt(FAR) ? -FAR : Number(v));

// compileLines(x0, d0, colour, reach) lists the certificates of the given colour whose line is at hex distance at
// most `reach` from (x0, d0), each turned into exact Number tests on offsets (i, j) from (x0, d0):
// { cert, start (distance from the start cell), test(i, j), dist(i, j) }.
export function compileLines(x0, d0, colour, reach) {
  x0 = big(x0);
  d0 = big(d0);
  const out = [];
  for (const c of CERTIFICATES) {
    if (c.colour !== colour) continue;
    const start = distanceToLine(c, x0, d0);
    if (start > BigInt(reach)) continue;
    let test;
    let dist;
    if (c.kind === "row") {
      const jAt = Number(c.at - d0);
      const lo = clampFar(c.from === null ? null : c.from - x0);
      const hi = clampFar(c.to === null ? null : c.to - x0);
      test = (i, j) => j === jAt && (lo === null || i >= lo) && (hi === null || i <= hi);
      dist = (i, j) => {
        const v = jAt - j;
        const s = nearestParam(i + Math.min(v, 0), i + Math.max(v, 0), lo, hi);
        const di = s - i;
        return Math.max(Math.abs(di), Math.abs(v), Math.abs(di - v));
      };
    } else if (c.kind === "column") {
      const iAt = Number(c.at - x0);
      const lo = clampFar(c.from === null ? null : c.from - d0);
      const hi = clampFar(c.to === null ? null : c.to - d0);
      test = (i, j) => i === iAt && (lo === null || j >= lo) && (hi === null || j <= hi);
      dist = (i, j) => {
        const u = iAt - i;
        const s = nearestParam(j + Math.min(u, 0), j + Math.max(u, 0), lo, hi);
        const dj = s - j;
        return Math.max(Math.abs(u), Math.abs(dj), Math.abs(u - dj));
      };
    } else {
      // cell (x0 + i, d0 + j) is on the diagonal x - d = at exactly when i - j = kAt, its parameter is x0 + i
      const kAt = Number(c.at - (x0 - d0));
      const lo = clampFar(c.from === null ? null : c.from - x0);
      const hi = clampFar(c.to === null ? null : c.to - x0);
      test = (i, j) => i - j === kAt && (lo === null || i >= lo) && (hi === null || i <= hi);
      dist = (i, j) => {
        const k = j - i + kAt; // di - dj for the target (s, s - kAt)
        const s = nearestParam(i + Math.min(k, 0), i + Math.max(k, 0), lo, hi);
        const di = s - i;
        return Math.max(Math.abs(di), Math.abs(di - k), Math.abs(k));
      };
    }
    out.push({ cert: c, start: Number(start), test, dist });
  }
  return out;
}

function firstHit(lines, i, j) {
  for (let q = 0; q < lines.length; q++) if (lines[q].test(i, j)) return lines[q];
  return null;
}

// Largest directedCap accepted (the heap packs the node index into the low 22 bits of its key).
export const MAX_DIRECTED_CAP = 4194303;
const IDX = 4194304;

// floodFillCertified(x, d, { cap, yieldEvery, directedCap, withPath, stats, windowPart }) is the flood fill of
// floodFillIter (same order, same progress records, same returned record) with one more field `infinite` in the
// record:
//  - the breadth-first fill tests every cell that joins the region against the certificate lines of the region's
//    colour. A hit ends the search: complete false, genus null, area = cells found so far, and
//    infinite = { id, text, reason, cell: [i, j], steps, search: "fill", visited }.
//  - a fill that completes below the cap is a finite region: infinite null, the record of floodFillIter.
//  - a fill that hits the cap is followed by a best-first search from the start (priority: hex distance to the
//    nearest certificate line of the colour) over at most directedCap cells of the colour. A hit gives the same
//    infinite record with search "directed". The search is skipped when no line is within directedCap. Without a
//    hit, infinite is null and the record is the one of the capped fill.
// withPath adds infinite.path, the offsets from [0, 0] to infinite.cell along the search tree. A `stats` object is
// filled with the cells, symbols and rows of both searches. Progress records of the second search carry
// phase: "directed".
// windowPart = { inside, limit, rows } (default null: nothing more) asks, for a region that is not complete, for its
// part in a box: after the searches above, a fresh breadth-first pass over the cells of the colour for which
// inside(i, j) is true, never stepping outside them, of at most `limit` cells, from the start cell, the cells the fill
// found and, for a region certified infinite, the cells of the lines of its region (regionLines) in the rows of the box
// (rows = [[j, ilo, ihi], ...], optional). It adds the field
// window = { cells (sorted by (j, i)), count, cut, limit } to the record, cut true when a further cell was left out
// (the cells kept are then the first `limit` ones in breadth-first order). Every cell of it is joined to a start cell
// by a path inside the box, so it is a cell of the region. Its progress records carry
// phase: "window", its numbers go to stats.window = { cells, symbols, rows, cut }. A complete region gets no such
// field. Throws "bad_cap" on a bad cap or directedCap, "bad_window" on a bad windowPart, "guard_failed" if a hit
// cannot be confirmed.
export function* floodFillCertified(x, d, { cap = 200000, yieldEvery = 0, directedCap = 200000, withPath = false, stats = null, windowPart = null } = {}) {
  if (typeof x !== "bigint") x = BigInt(x);
  if (typeof d !== "bigint") d = BigInt(d);
  if (!Number.isInteger(cap) || cap < 1) throw new CodedError("bad_cap", "the cap is a positive integer");
  if (!Number.isInteger(directedCap) || directedCap < 0 || directedCap > MAX_DIRECTED_CAP) {
    throw new CodedError("bad_cap", `directedCap is an integer from 0 to ${MAX_DIRECTED_CAP}`);
  }
  if (windowPart !== null && (!windowPart || typeof windowPart.inside !== "function" || !Number.isInteger(windowPart.limit) || windowPart.limit < 1)) {
    throw new CodedError("bad_window", "windowPart is { inside: (i, j) => boolean, limit: a positive integer }");
  }
  const src = cellColours(x, d);
  const colourAt = src.at;
  const rows = src.rows;
  const c0 = colourAt(0, 0);
  const lines = compileLines(x, d, c0, Math.max(cap, directedCap));

  // 1. the breadth-first fill of floodFillIter, plus the test of every cell that joins the region
  const parent = [];
  const onJoin = lines.length > 0 ? (i, j) => firstHit(lines, i, j) !== null : null;
  const pass = yield* breadthFirst(src, c0, { cap, onJoin, parent, yieldEvery, yieldAt: yieldEvery });
  const cells = pass.cells;
  const hitIndex = pass.stop;
  const hit = hitIndex >= 0;
  const complete = pass.complete;
  const symbols = src.symbols;

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
    rowsEvaluated: rows.size,
    symbolsEvaluated: symbols,
    infinite: null,
  };
  if (stats) Object.assign(stats, { fillCells: cells.length, fillSymbols: symbols, fillRows: rows.size, directed: null });

  const chainOf = (par, end, cellOf) => {
    const path = [];
    for (let v = end; v !== -1; v = par[v]) path.push(cellOf(v));
    return path.reverse();
  };
  const certify = (cell, pathFn, search, visited) => {
    const [ci, cj] = cell;
    const ax = x + BigInt(ci);
    const ad = d + BigInt(cj);
    const c = certificateAt(ax, ad);
    if (c === null || c.colour !== c0 || kronecker(ax, ad) !== c0) {
      throw new CodedError("guard_failed", `the cell (${ci}, ${cj}) of the search is not on a line of colour ${c0}`);
    }
    const path = pathFn();
    const inf = { id: c.id, text: c.text, reason: c.reason, cell: [ci, cj], steps: path.length - 1, search, visited };
    if (withPath) inf.path = path;
    return inf;
  };

  if (hit) {
    out.infinite = certify(cells[hitIndex], () => chainOf(parent, hitIndex, (v) => [cells[v][0], cells[v][1]]), "fill", cells.length);
  } else if (complete) {
    const g = genusOfCells(cells);
    out.genus = g.genus;
    out.chi = g.chi;
    out.edges = g.edges;
    out.triangles = g.triangles;
  } else if (directedCap > 0 && lines.length > 0) {
    // 3. best-first search towards the nearest line of the colour
    let nearest = Infinity;
    for (const L of lines) nearest = Math.min(nearest, L.start);
    const dstats = { cells: 0, symbols: 0, rows: 0, nearest, skipped: null, hit: false };
    if (stats) stats.directed = dstats;
    if (nearest > directedCap) {
      dstats.skipped = "no line within directedCap";
    } else {
      const symbols0 = symbols;
      const rows0 = rows.size;
      const prio = (i, j) => {
        let m = Infinity;
        for (let q = 0; q < lines.length; q++) {
          const v = lines[q].dist(i, j);
          if (v < m) m = v;
        }
        return m;
      };
      const ni_ = [0];
      const nj_ = [0];
      const par = [-1];
      const dseen = new Set([cellKey(0, 0)]);
      const heap = [prio(0, 0) * IDX];
      const heapPush = (key) => {
        let p = heap.length;
        heap.push(key);
        while (p > 0) {
          const up = (p - 1) >> 1;
          if (heap[up] <= key) break;
          heap[p] = heap[up];
          p = up;
        }
        heap[p] = key;
      };
      const heapPop = () => {
        const top = heap[0];
        const last = heap.pop();
        if (heap.length > 0) {
          let p = 0;
          const n = heap.length;
          for (;;) {
            let c = 2 * p + 1;
            if (c >= n) break;
            if (c + 1 < n && heap[c + 1] < heap[c]) c++;
            if (heap[c] >= last) break;
            heap[p] = heap[c];
            p = c;
          }
          heap[p] = last;
        }
        return top;
      };
      let found = -1;
      let nextY = yieldEvery > 0 ? src.symbols + yieldEvery : Infinity;
      search: while (heap.length > 0) {
        if (src.symbols >= nextY) {
          nextY = src.symbols + yieldEvery;
          yield { cells: ni_.length, symbols: src.symbols, rows: rows.size, phase: "directed" };
        }
        const v = heapPop() % IDX;
        const i = ni_[v];
        const j = nj_[v];
        for (const [di, dj] of NEIGHBOURS) {
          const a = i + di;
          const b = j + dj;
          const k = cellKey(a, b);
          if (dseen.has(k)) continue;
          dseen.add(k);
          if (colourAt(a, b) !== c0) continue;
          if (ni_.length >= directedCap) break search;
          const w = ni_.length;
          ni_.push(a);
          nj_.push(b);
          par.push(v);
          if (firstHit(lines, a, b)) {
            found = w;
            break search;
          }
          heapPush(prio(a, b) * IDX + w);
        }
      }
      dstats.cells = ni_.length;
      dstats.symbols = src.symbols - symbols0;
      dstats.rows = rows.size - rows0;
      if (found >= 0) {
        dstats.hit = true;
        out.infinite = certify([ni_[found], nj_[found]], () => chainOf(par, found, (v) => [ni_[v], nj_[v]]), "directed", ni_.length);
      }
    }
  }
  cells.sort(compareCells);

  // 4. the part of a region that is not complete inside the box (the same loop as the fill, inside the box), from the
  // start cell, the cells the fill found and, for a region certified infinite, every cell of its lines in the box
  if (windowPart !== null && !complete) {
    const symbols0 = src.symbols;
    const rows0 = rows.size;
    const lineStarts = out.infinite && windowPart.rows ? lineCellsInRows(regionLines(out.infinite.id), x, d, windowPart.rows) : [];
    const part = yield* breadthFirst(src, c0, {
      cap: windowPart.limit, inside: windowPart.inside, starts: lineStarts.concat(cells), yieldEvery, yieldAt: yieldEvery > 0 ? src.symbols + yieldEvery : Infinity, phase: "window",
    });
    part.cells.sort(compareCells);
    out.window = { cells: part.cells, count: part.cells.length, cut: !part.complete, limit: windowPart.limit };
    if (stats) stats.window = { cells: part.cells.length, symbols: src.symbols - symbols0, rows: rows.size - rows0, cut: !part.complete };
  }
  return out;
}

// floodFillCertifiedSync(x, d, options) runs floodFillCertified to the end and returns its record.
export function floodFillCertifiedSync(x, d, options = {}) {
  const it = floodFillCertified(x, d, { ...options, yieldEvery: 0 });
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
