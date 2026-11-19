// The window of a shape and the small primes of the construction (steps 0, 1 and 2 of the Construction Lab).
//
// Step 0. N = N(S), W = S u N. Target colour eps on S, -eps on N. h, w = numbers of rows and columns of W,
// B = max(h, w, 7).
// Step 1. For every prime p <= B ascending: when some residue mod p is no column of W, a = the smallest such residue,
// x0 = -a mod p and d0 is free mod p (kind "column"). Otherwise, among the classes (a, b) of (Z/p)^2 with no cell of
// S, the one with the most cells of W (ties: smallest a, then smallest b), x0 = -a, d0 = -b mod p (kind "class"),
// and the cells of W in that class are forced blue. For p = 2 the condition on x0 is taken modulo 8:
// x0 = ((-a) mod 2) + 2 lift.
// Step 2. Per row of W: the cells that are not forced blue, sorted by i, with their target sign tau. Rows with no
// such cell take no further part in the construction.

import { primesUpTo } from "../core/primes.mjs";
import { cellKey, compareCells } from "../core/geometry.mjs";
import { buildWindow as buildShapeWindow } from "./window.mjs";

const mod = (a, m) => ((a % m) + m) % m;

// buildWindow(cells, colour) for a normalised shape returns the window of window.mjs (S, N, W, sKeys, wKeys,
// bounds, h, w, B, cols, rows) together with the target colour eps of the shape.
export function buildWindow(cells, colour) {
  return { ...buildShapeWindow(cells), eps: colour };
}

// Number of cells of W in the class (a, b) mod p, and those cells (sorted).
function classCellsOf(win, p, a, b) {
  return win.W.filter(([i, j]) => mod(i, p) === a && mod(j, p) === b).map(([i, j]) => [i, j]);
}

// x0 residue and modulus of the condition x0 = -a mod p (lifted to modulus 8 for p = 2).
export function xCondition(p, a, lift) {
  return p === 2 ? { xRes: mod(-a, 2) + 2 * lift, xMod: 8 } : { xRes: mod(-a, p), xMod: p };
}

// chooseSmallPrimes(win, lift) applies step 1 and returns { primes: [{ p, kind, a, b, xRes, xMod, dRes, forced,
// classCells }] } or { inadmissible: p } for the first prime where every class holds a cell of S.
export function chooseSmallPrimes(win, lift) {
  const out = [];
  for (const p of primesUpTo(win.B)) {
    const colRes = new Uint8Array(p);
    for (const i of win.cols) colRes[mod(i, p)] = 1;
    const missing = colRes.indexOf(0);
    if (missing >= 0) {
      out.push({ p, kind: "column", a: missing, b: null, ...xCondition(p, missing, lift), dRes: null, forced: [], classCells: 0 });
      continue;
    }
    const occ = new Uint8Array(p * p);
    for (const [i, j] of win.S) occ[mod(i, p) * p + mod(j, p)] = 1;
    const count = new Uint32Array(p * p);
    for (const [i, j] of win.W) count[mod(i, p) * p + mod(j, p)]++;
    let best = -1;
    for (let k = 0; k < p * p; k++) {
      if (occ[k]) continue;
      if (best < 0 || count[k] > count[best]) best = k; // first in (a, b) order wins a tie
    }
    if (best < 0) return { inadmissible: p };
    const a = Math.floor(best / p), b = best % p;
    const forced = classCellsOf(win, p, a, b);
    out.push({ p, kind: "class", a, b, ...xCondition(p, a, lift), dRes: mod(-b, p), forced, classCells: forced.length });
  }
  return { primes: out };
}

// deriveSmallPrimes(win, data) reads the small primes of a PackedData object for a replay: kind "column" exactly
// when dRes is null, a = -xRes mod p, b = -dRes mod p, the forced cells are the cells of W in the class. Returns
// { primes } in the format of chooseSmallPrimes, or { mismatch: message } when the stored primes are not the primes
// <= B or a stored class contains a cell of S.
export function deriveSmallPrimes(win, data) {
  const want = primesUpTo(win.B);
  const sp = data.smallPrimes;
  if (data.B !== win.B || !Array.isArray(sp) || sp.length !== want.length || !sp.every((s, k) => s && s.p === want[k])) {
    return { mismatch: `the stored small primes are not the primes <= B = ${win.B}` };
  }
  const out = [];
  for (const { p, xRes, dRes } of sp) {
    const xMod = p === 2 ? 8 : p;
    if (!Number.isInteger(xRes) || xRes < 0 || xRes >= xMod) return { mismatch: `x0 residue ${xRes} mod ${xMod}` };
    const a = mod(-xRes, p);
    if (dRes === null) {
      out.push({ p, kind: "column", a, b: null, xRes, xMod, dRes: null, forced: [], classCells: 0 });
      continue;
    }
    if (!Number.isInteger(dRes) || dRes < 0 || dRes >= p) return { mismatch: `d0 residue ${dRes} mod ${p}` };
    const b = mod(-dRes, p);
    if (win.S.some(([i, j]) => mod(i, p) === a && mod(j, p) === b)) return { mismatch: `the class (${a}, ${b}) mod ${p} contains a cell of the shape` };
    const forced = classCellsOf(win, p, a, b);
    out.push({ p, kind: "class", a, b, xRes, xMod, dRes, forced, classCells: forced.length });
  }
  return { primes: out };
}

// The union of the forced cells of the small primes, sorted, and its key set.
export function forcedUnion(primes) {
  const keys = new Set();
  const cells = [];
  for (const sp of primes) {
    for (const [i, j] of sp.forced) {
      const k = cellKey(i, j);
      if (keys.has(k)) continue;
      keys.add(k);
      cells.push([i, j]);
    }
  }
  return { cells: cells.sort(compareCells), keys };
}

// signRows(win, forcedKeys) applies step 2: { rows: [{ j, cells: [{ i, tau }] }] for the rows with k > 0,
// emptyRows: [j], kMax }.
export function signRows(win, forcedKeys) {
  const byRow = new Map(win.rows.map((j) => [j, []]));
  for (const [i, j] of win.W) {
    const k = cellKey(i, j);
    if (forcedKeys.has(k)) continue;
    byRow.get(j).push({ i, tau: win.sKeys.has(k) ? win.eps : -win.eps });
  }
  const rows = [];
  const emptyRows = [];
  let kMax = 0;
  for (const j of win.rows) {
    const cells = byRow.get(j).sort((x, y) => x.i - y.i);
    if (cells.length === 0) {
      emptyRows.push(j);
      continue;
    }
    rows.push({ j, cells });
    if (cells.length > kMax) kMax = cells.length;
  }
  return { rows, emptyRows, kMax };
}
