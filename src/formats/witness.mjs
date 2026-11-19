// The witness format kron_hex_witness_v1: a region of the colouring given by a base cell (x0, d0) of any size and
// the offsets of its cells. verifyWitness checks one independently of how it was made, makeWitness writes one.

import { parseBigIntStrict, digitCount, CodedError } from "../core/bigint_utils.mjs";
import { cellKey, compareCells, neighbourhood, boundingWindow } from "../core/geometry.mjs";
import { genusOfCells, floodFill } from "../core/regions.mjs";

export const WITNESS_FORMAT = "kron_hex_witness_v1";

const isInt = (v) => typeof v === "number" && Number.isInteger(v);

function sameOffsetSet(a, b) {
  if (a.length !== b.length) return false;
  const sa = new Set(a.map(([i, j]) => cellKey(i, j)));
  if (sa.size !== a.length) return false;
  for (const [i, j] of b) if (!sa.has(cellKey(i, j))) return false;
  return true;
}

const translate = (cells, di, dj) => cells.map(([i, j]) => [i + di, j + dj]);

// Every coordinate of a shape that enters the site from outside is below this bound in absolute value (the bound of
// normaliseShape in src/core/shapes.mjs).
export const SHAPE_COORD_LIMIT = 1048576; // 2^20

// checkShapeCells(shape) is the one check a shape from outside (witness JSON, packed JSON, token, shipped file,
// editor input) passes before it is shown or drawn: a non-empty list of integer pairs [i, j], |i| and |j| below
// SHAPE_COORD_LIMIT, no cell twice. Returns the shape. Throws "bad_format" (naming the first bad entry),
// "out_of_range" or "duplicate_cell". It is cheap (one pass and a Set) and never touches the colouring.
export function checkShapeCells(shape) {
  if (!Array.isArray(shape) || shape.length === 0) throw new CodedError("bad_format", "the shape is not a non-empty list of cells [i, j]");
  const keys = new Set();
  for (let k = 0; k < shape.length; k++) {
    const c = shape[k];
    if (!Array.isArray(c) || c.length !== 2 || !isInt(c[0]) || !isInt(c[1])) {
      let text;
      try {
        text = JSON.stringify(c);
      } catch {
        text = String(c);
      }
      throw new CodedError("bad_format", `shape entry ${k + 1} (${String(text).slice(0, 40)}) is not an integer pair [i, j]`);
    }
    if (Math.abs(c[0]) >= SHAPE_COORD_LIMIT || Math.abs(c[1]) >= SHAPE_COORD_LIMIT) {
      throw new CodedError("out_of_range", `shape entry ${k + 1} (${c[0]}, ${c[1]}) has a coordinate of size 2^20 or more`);
    }
    const key = cellKey(c[0], c[1]);
    if (keys.has(key)) throw new CodedError("duplicate_cell", `the cell (${c[0]}, ${c[1]}) appears twice in the shape`);
    keys.add(key);
  }
  return shape;
}

// verifyWitness(obj) checks a parsed witness: it recomputes the region by flood fill from the seed (cap 10 times the
// number of cells of the shape) and compares colour, area, genus and the cell set, and it recomputes the genus of the
// stated shape by the chi formula. A stated area that differs from the number of cells of the shape fails at once,
// without a flood fill. Returns { pass, id, reasons (failures), warnings, info }. It never throws on bad input.
export function verifyWitness(obj) {
  const reasons = [];
  const warnings = [];
  const info = {};
  const res = { pass: false, id: obj && obj.id, reasons, warnings, info };
  if (obj === null || typeof obj !== "object") {
    reasons.push("not a JSON object");
    return res;
  }
  if (obj.format !== WITNESS_FORMAT) reasons.push(`format is ${JSON.stringify(obj.format)}, expected "${WITNESS_FORMAT}"`);
  const x0 = parseBigIntStrict(obj.x0);
  const d0 = parseBigIntStrict(obj.d0);
  if (x0 === null) reasons.push("x0 is not a decimal integer string");
  if (d0 === null) reasons.push("d0 is not a decimal integer string");
  if (!(obj.colour === 1 || obj.colour === -1 || obj.colour === 0)) reasons.push("colour is not one of 1, -1, 0");
  if (!isInt(obj.genus) || obj.genus < 0) reasons.push("genus is not a nonnegative integer");
  if (!isInt(obj.area) || obj.area < 1) reasons.push("area is not a positive integer");
  const shapeOk = Array.isArray(obj.shape) && obj.shape.every((c) => Array.isArray(c) && c.length === 2 && isInt(c[0]) && isInt(c[1]) && Math.abs(c[0]) < 8000000 && Math.abs(c[1]) < 8000000);
  if (!shapeOk) reasons.push("shape is not a list of integer pairs [i, j] (|i|, |j| < 8000000)");
  const seedOk = Array.isArray(obj.seed) && obj.seed.length === 2 && isInt(obj.seed[0]) && isInt(obj.seed[1]);
  if (!seedOk) reasons.push("seed is not an integer pair");
  if (reasons.length > 0) return res;

  const shape = obj.shape;
  const shapeSet = new Set(shape.map(([i, j]) => cellKey(i, j)));
  if (shapeSet.size !== shape.length) reasons.push(`shape has duplicate cells (${shape.length} entries, ${shapeSet.size} distinct)`);
  if (shape.length !== obj.area) reasons.push(`stated area ${obj.area} differs from the shape size ${shape.length}`);
  if (!shapeSet.has(cellKey(obj.seed[0], obj.seed[1]))) reasons.push("seed is not a cell of the shape");
  if (obj.digits && typeof obj.digits === "object") {
    if (obj.digits.x0 !== undefined && obj.digits.x0 !== digitCount(x0)) reasons.push(`digits.x0 = ${obj.digits.x0} but x0 has ${digitCount(x0)} digits`);
    if (obj.digits.d0 !== undefined && obj.digits.d0 !== digitCount(d0)) reasons.push(`digits.d0 = ${obj.digits.d0} but d0 has ${digitCount(d0)} digits`);
  }
  info.digits = { x0: digitCount(x0), d0: digitCount(d0) };
  // the stated area must be the size of the shape: no flood fill is run for a witness that fails this
  if (shape.length !== obj.area) return res;

  const [si, sj] = obj.seed;
  const cap = Math.max(10 * shape.length, 10);
  const t0 = Date.now();
  const ff = floodFill(x0 + BigInt(si), d0 + BigInt(sj), cap);
  info.flood_ms = Date.now() - t0;
  info.flood = { colour: ff.colour, area: ff.area, complete: ff.complete, genus: ff.genus, cap, symbols: ff.symbolsEvaluated };
  if (ff.colour !== obj.colour) reasons.push(`seed cell has colour ${ff.colour} (${ff.colourName}), stated ${obj.colour}`);
  if (!ff.complete) {
    reasons.push(`region is larger than the cap ${cap} (10 times the size of the shape): at least ${ff.area} cells`);
  } else {
    if (ff.area !== obj.area) reasons.push(`recomputed area ${ff.area}, stated ${obj.area}`);
    if (ff.genus !== obj.genus) reasons.push(`recomputed genus ${ff.genus}, stated ${obj.genus}`);
    const region = translate(ff.cells, si, sj);
    if (!sameOffsetSet(region, shape)) {
      const rset = new Set(region.map(([i, j]) => cellKey(i, j)));
      let missing = 0;
      for (const k of shapeSet) if (!rset.has(k)) missing++;
      let extra = 0;
      for (const k of rset) if (!shapeSet.has(k)) extra++;
      reasons.push(`recomputed region differs from the stated shape (${missing} shape cells not in the region, ${extra} region cells not in the shape)`);
    }
  }
  // Genus of the stated shape alone (combinatorics only, no symbol involved).
  const sg = genusOfCells(shape);
  info.shape_genus = sg.genus;
  if (sg.genus !== obj.genus) reasons.push(`the stated shape itself has genus ${sg.genus} by the chi formula, stated ${obj.genus}`);

  if (obj.window && typeof obj.window === "object") {
    const w = obj.window;
    const all = shape.concat(neighbourhood(shape));
    const outside = all.filter(([i, j]) => i < w.imin || i > w.imax || j < w.jmin || j > w.jmax).length;
    if (outside > 0) warnings.push(`${outside} cells of shape + N(shape) lie outside the stated window`);
  }

  res.pass = reasons.length === 0;
  return res;
}

// makeWitness({ id, colour, x0, d0, seed, shape }) returns a witness object: x0, d0 (bigints or decimal strings)
// written as decimal strings, shape sorted by (j, i), genus by the chi formula, area, window (the box of the shape and
// its neighbours) and digit counts filled in. Throws "bad_format" on a malformed input. It does not verify.
export function makeWitness({ id = null, colour, x0, d0, seed, shape } = {}) {
  const bx = typeof x0 === "bigint" ? x0 : parseBigIntStrict(x0);
  const bd = typeof d0 === "bigint" ? d0 : parseBigIntStrict(d0);
  if (bx === null || bd === null) throw new CodedError("bad_format", "x0 and d0 must be bigints or decimal strings");
  if (!(colour === 1 || colour === -1 || colour === 0)) throw new CodedError("bad_format", "colour must be 1, -1 or 0");
  if (!Array.isArray(shape) || shape.length === 0 || !shape.every((c) => Array.isArray(c) && c.length === 2 && isInt(c[0]) && isInt(c[1]))) {
    throw new CodedError("bad_format", "shape must be a non-empty list of integer pairs");
  }
  if (!Array.isArray(seed) || seed.length !== 2 || !isInt(seed[0]) || !isInt(seed[1])) throw new CodedError("bad_format", "seed must be an integer pair");
  const cells = shape.map(([i, j]) => [i, j]).sort(compareCells);
  const sx = bx.toString();
  const sd = bd.toString();
  return {
    format: WITNESS_FORMAT,
    id,
    colour,
    genus: genusOfCells(cells).genus,
    area: cells.length,
    x0: sx,
    d0: sd,
    seed: [seed[0], seed[1]],
    shape: cells,
    window: boundingWindow(cells, 1),
    digits: { x0: digitCount(bx), d0: digitCount(bd) },
  };
}
