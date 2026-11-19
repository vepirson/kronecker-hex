// A construction as two plain tables, and back (no DOM access, used by the Lab page and by the Node tests).
//
// The rows table has one line "j, r1, r2, q1, q2, R" per row with sign cells. The small-prime table has one line
// "p, x mod p, d mod p" per prime p up to B (on the line of p = 2 the second number is x mod 8, and "-" stands for a
// d that is free modulo p). Numbers are separated by commas or white space, a header line (its first word "j" or
// "p") and blank lines are allowed, and a line "d index, t" may give the index t of d (default 0). Both kinds of lines
// may sit in either box, so the text written by formatTables can be pasted whole.
//
// Opening tables (importTables): x0 and d0 are rebuilt from the tables, the region is found as the largest complete
// green or red region met by a flood fill from the cells of the columns -B .. B in the rows of the table (each fill
// capped at 20000 cells), its first cell in (j, i) order is the seed, and the construction is replayed on the
// resulting data with every check of a replay. When that replay fails, the next largest complete region is tried
// (a neighbouring region of the other colour can be larger than the constructed one). x0, d0, the shape and the
// colour therefore come out of the numbers alone.

import { CodedError } from "../../../core/bigint_utils.mjs";
import { primesUpTo, nextPrime } from "../../../core/primes.mjs";
import { cellKey, compareCells, NEIGHBOURS } from "../../../core/geometry.mjs";
import { rowReducer } from "../../../core/kronecker.mjs";
import { genusOfCells } from "../../../core/regions.mjs";
import { rebuildPacked } from "../../../formats/packed.mjs";
import { buildWindow } from "../../../construct/small_primes.mjs";
import { runToEnd } from "../../../construct/pipeline.mjs";

// The header lines written by formatTables.
export const ROWS_HEADER = "j, r1, r2, q1, q2, R";
export const PRIMES_HEADER = "p, x mod p, d mod p";
// Each flood fill of the region search stops at this many cells (the region is then not complete).
export const FILL_CAP = 20000;
// At most this many complete regions (largest first) are replayed before the import gives up.
export const MAX_CANDIDATES = 50;

const bad = (msg) => new CodedError("bad_table", msg);
const DECIMAL = /^-?[0-9]+$/;

function safeInt(text, what, line, min = -Infinity) {
  if (!DECIMAL.test(text)) throw bad(`line ${line}: ${what} ${JSON.stringify(text)} is not an integer`);
  const v = Number(text);
  if (!Number.isSafeInteger(v)) throw new CodedError("out_of_range", `line ${line}: ${what} ${text} is too large`);
  if (v < min) throw new CodedError("out_of_range", `line ${line}: ${what} ${text} is below ${min}`);
  return v;
}

// parseTableText(text, box) reads the lines of one text box (box: a name for the messages) and returns { rows:
// [{ j, r1, r2, q1, q2, rho, line }], primes: [{ p, xRes, dRes, line }], dIndex (decimal string or null) }. Throws
// "bad_table" (a line that is neither a row, a prime, a header nor the index line) and "out_of_range".
export function parseTableText(text, box = "the table") {
  const rows = [];
  const primes = [];
  let dIndex = null;
  const lines = String(text === undefined || text === null ? "" : text).split(/\r?\n/);
  lines.forEach((raw, k) => {
    const line = `${k + 1} of ${box}`;
    const t = raw.trim();
    if (t === "") return;
    const di = /^d\s*index\s*[,:=\s]\s*(\S+)$/i.exec(t);
    if (di) {
      if (!/^[0-9]+$/.test(di[1])) throw bad(`line ${line}: the index of d must be an integer >= 0`);
      dIndex = di[1];
      return;
    }
    const f = t.split(/[\s,;]+/).filter((x) => x !== "");
    if (/^[jp]$/i.test(f[0])) return; // a header line
    if (f.length === 6) {
      const [j, r1, r2, q1, q2] = f.slice(0, 5).map((x, n) => safeInt(x, ["j", "r1", "r2", "q1", "q2"][n], line, n === 0 ? -Infinity : 0));
      if (!/^[0-9]+$/.test(f[5])) throw bad(`line ${line}: R ${JSON.stringify(f[5])} is not an integer >= 0`);
      if (q1 < 3 || q2 < 3) throw new CodedError("out_of_range", `line ${line}: the row primes must be at least 3`);
      if (r1 >= q1 || r2 >= q2) throw new CodedError("out_of_range", `line ${line}: r1 must be below q1 and r2 below q2`);
      rows.push({ j, r1, r2, q1, q2, rho: BigInt(f[5]), line });
      return;
    }
    if (f.length === 3) {
      const p = safeInt(f[0], "p", line, 2);
      const xRes = safeInt(f[1], "x mod p", line, 0);
      const dRes = f[2] === "-" ? null : safeInt(f[2], "d mod p", line, 0);
      if (xRes >= (p === 2 ? 8 : p)) throw new CodedError("out_of_range", `line ${line}: x mod ${p === 2 ? 8 : p} must be below ${p === 2 ? 8 : p}`);
      if (dRes !== null && dRes >= p) throw new CodedError("out_of_range", `line ${line}: d mod ${p} must be below ${p}`);
      primes.push({ p, xRes, dRes, line });
      return;
    }
    throw bad(`line ${line}: expected 6 numbers (j, r1, r2, q1, q2, R) or 3 (p, x mod p, d mod p), found ${f.length}`);
  });
  return { rows, primes, dIndex };
}

// parseTables({ rows, primes, dIndex }) reads the two text boxes and the optional index of d (text, default 0) and
// returns { rows: [{ j, q1, q2, r1, r2, rho }] ascending j, smallPrimes: [{ p, xRes, dRes }] ascending p, dIndex
// (bigint) }. The small primes must be exactly the primes up to the largest one listed, and at least 2, 3, 5, 7.
// Throws "bad_table", "out_of_range", "no_rows", "duplicate", "missing_prime".
export function parseTables({ rows = "", primes = "", dIndex = "" } = {}) {
  const a = parseTableText(rows, "the rows table");
  const b = parseTableText(primes, "the small-prime table");
  const rowList = a.rows.concat(b.rows);
  const primeList = a.primes.concat(b.primes);
  let t = String(dIndex === undefined || dIndex === null ? "" : dIndex).trim();
  if (t === "") t = a.dIndex !== null ? a.dIndex : b.dIndex !== null ? b.dIndex : "0";
  if (!/^[0-9]+$/.test(t)) throw bad("the index of d must be an integer >= 0");
  if (rowList.length === 0) throw new CodedError("no_rows", "the rows table has no row");
  if (primeList.length === 0) throw new CodedError("missing_prime", "the small-prime table is empty");
  rowList.sort((x, y) => x.j - y.j);
  primeList.sort((x, y) => x.p - y.p);
  for (let k = 1; k < rowList.length; k++) if (rowList[k].j === rowList[k - 1].j) throw new CodedError("duplicate", `row ${rowList[k].j} is given twice`);
  for (let k = 1; k < primeList.length; k++) if (primeList[k].p === primeList[k - 1].p) throw new CodedError("duplicate", `the prime ${primeList[k].p} is given twice`);
  const top = primeList[primeList.length - 1].p;
  const want = primesUpTo(Math.max(7, top));
  const have = new Set(primeList.map((s) => s.p));
  const notPrime = primeList.filter((s) => !want.includes(s.p)).map((s) => s.p);
  if (notPrime.length) throw bad(`${notPrime.join(", ")} ${notPrime.length === 1 ? "is not a prime" : "are not primes"}`);
  const missing = want.filter((p) => !have.has(p));
  if (missing.length) throw new CodedError("missing_prime", `the small-prime table lacks ${missing.join(", ")} (every prime up to ${Math.max(7, top)} is needed)`);
  return {
    rows: rowList.map(({ j, q1, q2, r1, r2, rho }) => ({ j, q1, q2, r1, r2, rho })),
    smallPrimes: primeList.map(({ p, xRes, dRes }) => ({ p, xRes, dRes })),
    dIndex: BigInt(t),
  };
}

// formatTables(data) writes the two tables of a PackedData object: { rows, primes } (texts with their header line)
// and dIndex (decimal string). tablesText(data) is the same as one text (rows, a blank line, small primes, and a line
// "d index, t" when t is not 0), which parseTables reads back from either box.
export function formatTables(data) {
  const rows = [ROWS_HEADER, ...data.rows.map((r) => `${r.j}, ${r.r1}, ${r.r2}, ${r.q1}, ${r.q2}, ${r.rho.toString()}`)].join("\n");
  const primes = [PRIMES_HEADER, ...data.smallPrimes.map((s) => `${s.p}, ${s.xRes}, ${s.dRes === null ? "-" : s.dRes}`)].join("\n");
  return { rows, primes, dIndex: data.dIndex.toString() };
}

export function tablesText(data) {
  const t = formatTables(data);
  return `${t.rows}\n\n${t.primes}${t.dIndex === "0" ? "" : `\n\nd index, ${t.dIndex}`}\n`;
}

// findRegions(x0, d0, B, rowsJ, cap) runs the region search around (x0, d0): flood fills from every cell (i, j)
// with -B <= i <= B and j in rowsJ (in that order, j outer), skipping blue cells and cells already reached, each fill
// capped at cap cells (a fill that meets an earlier capped region stops too, it is the same region). Returns
// { regions: [{ colour, cells (sorted by (j, i)), complete }], symbols } (symbols = Kronecker symbols evaluated).
export function findRegions(x0, d0, B, rowsJ, cap = FILL_CAP) {
  const reducers = new Map();
  const colours = new Map();
  let symbols = 0;
  const colourAt = (i, j, k) => {
    let c = colours.get(k);
    if (c === undefined) {
      let r = reducers.get(j);
      if (r === undefined) {
        r = rowReducer(x0, d0 + BigInt(j));
        reducers.set(j, r);
      }
      c = r.symbol(i);
      symbols++;
      colours.set(k, c);
    }
    return c;
  };
  const label = new Map();
  const regions = [];
  for (const j of rowsJ) {
    for (let i = -B; i <= B; i++) {
      const k0 = cellKey(i, j);
      if (label.has(k0)) continue;
      const c = colourAt(i, j, k0);
      if (c === 0) continue;
      const idx = regions.length;
      const cells = [[i, j]];
      label.set(k0, idx);
      let complete = true;
      outer: for (let h = 0; h < cells.length; h++) {
        const [a, b] = cells[h];
        for (const [di, dj] of NEIGHBOURS) {
          const ni = a + di, nj = b + dj;
          const k = cellKey(ni, nj);
          if (colourAt(ni, nj, k) !== c) continue;
          const l = label.get(k);
          if (l === idx) continue;
          if (l !== undefined || cells.length >= cap) {
            complete = false;
            break outer;
          }
          label.set(k, idx);
          cells.push([ni, nj]);
        }
      }
      regions.push({ colour: c, cells: cells.sort(compareCells), complete });
    }
  }
  return { regions, symbols };
}

// importTables({ rows, primes, dIndex }) opens a construction given as two tables (see the header). Returns
// { ok: true, data (PackedData), result, events (of the replay), x0, d0, search: { regions, complete, symbols, ms } }
// or { ok: false, code, message, x0, d0 (bigints, or null when the rebuild failed) }. Never throws.
export function importTables(input) {
  const t0 = globalThis.performance.now();
  let x0 = null, d0 = null;
  const fail = (code, message) => ({ ok: false, code, message, x0, d0 });
  try {
    const tab = parseTables(input);
    const top = tab.smallPrimes[tab.smallPrimes.length - 1].p;
    const B0 = nextPrime(top) - 1; // the largest B whose primes are exactly the listed ones
    const probe = { id: null, colour: 1, genus: 0, B: B0, seed: [0, 0], shape: [[0, 0]], smallPrimes: tab.smallPrimes, dIndex: tab.dIndex, rows: tab.rows };
    ({ x0, d0 } = rebuildPacked(probe));
    const search = findRegions(x0, d0, B0, tab.rows.map((r) => r.j), FILL_CAP);
    // the complete regions, largest first (ties: the one met first). The largest is not always the constructed one
    // (a neighbouring region of the other colour may be larger), so the candidates are replayed in this order and
    // the first that passes every check is taken.
    const cands = search.regions.filter((r) => r.complete).sort((a, b) => b.cells.length - a.cells.length).slice(0, MAX_CANDIDATES);
    if (cands.length === 0) return fail("no_region", "no complete region of type +1 or -1 was found around the rows of the table");
    let first = null;
    for (let n = 0; n < cands.length; n++) {
      const reg = cands[n];
      const shape = reg.cells;
      const win = buildWindow(shape, reg.colour);
      const data = {
        id: null, colour: reg.colour, genus: genusOfCells(shape).genus, B: win.B, seed: [shape[0][0], shape[0][1]], shape,
        smallPrimes: tab.smallPrimes, dIndex: tab.dIndex, rows: tab.rows,
      };
      const { events, result } = runToEnd({ replay: data });
      const err = events.find((e) => e.type === "error");
      let why = null;
      if (err) why = { code: err.code, message: err.message };
      else if (!result) why = { code: "replay_mismatch", message: "the replay ended without a result" };
      else if (result.x0 !== x0 || result.d0 !== d0) why = { code: "replay_mismatch", message: "the replay gives other numbers than the tables" };
      else if (!result.pass) why = { code: "not_verified", message: "the replayed construction does not pass its verification" };
      if (why) {
        if (first === null) first = why;
        continue;
      }
      return {
        ok: true, data, result, events, x0, d0,
        search: { regions: search.regions.length, complete: search.regions.filter((r) => r.complete).length, tried: n + 1, symbols: search.symbols, ms: globalThis.performance.now() - t0 },
      };
    }
    return fail(first.code, `none of the ${cands.length} largest complete regions passes the replay. The largest: ${first.message}`);
  } catch (e) {
    if (e && typeof e.code === "string") return fail(e.code, e.message);
    return fail("internal", (e && e.message) || String(e));
  }
}
