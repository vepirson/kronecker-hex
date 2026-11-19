// Inspection of a finished construction: the four factors of the colour of a window cell, and a re-glue of the
// numbers after editing the residues of some rows (the "tamper" experiment of the Construction Lab).
//
// For a cell (i, j) of a row with sign cells, d0 + j = u q1 q2 c and
//   K(x0 + i, d0 + j) = K(X_s + i, u) (r1 + i | q1) (r2 + i | q2) J(R + i, c),
// because the Kronecker symbol is multiplicative in its lower argument and x0 = X_s mod M_x (which fixes the
// symbol modulo u), x0 = r1 mod q1, x0 = r2 mod q2 and x0 = R mod c.

import { CodedError, digitCount } from "../core/bigint_utils.mjs";
import { kronecker } from "../core/kronecker.mjs";
import { sha256Hex } from "../core/sha256.mjs";
import { cellKey, neighbourhood } from "../core/geometry.mjs";
import { glueX } from "./glue.mjs";
import { verifyConstruction } from "./verify.mjs";
import { assembleResult } from "./pipeline.mjs";

const windowKeys = new WeakMap();

function windowOf(result) {
  let w = windowKeys.get(result);
  if (!w) {
    w = new Set(result.shape.concat(neighbourhood(result.shape)).map(([i, j]) => cellKey(i, j)));
    windowKeys.set(result, w);
  }
  return w;
}

// cellFactors(result, i, j) returns { small, q1, q2, cof, product, symbol } (Numbers -1, 0, 1) for a cell of the
// window in a row with sign cells: the four factors above, their product and the true symbol K(x0 + i, d0 + j).
// Returns null for a cell outside the window or in a row without sign cells.
export function cellFactors(result, i, j) {
  if (!windowOf(result).has(cellKey(i, j))) return null;
  const row = result.rows.find((r) => r.j === j);
  if (!row) return null;
  const bi = BigInt(i);
  const small = kronecker(result.Xs + bi, row.u);
  const q1 = kronecker(BigInt(row.r1) + bi, BigInt(row.q1));
  const q2 = kronecker(BigInt(row.r2) + bi, BigInt(row.q2));
  const cof = kronecker(row.rho + bi, row.c);
  const product = small * q1 * q2 * cof || 0;
  const symbol = kronecker(result.x0 + bi, result.d0 + BigInt(j));
  return { small, q1, q2, cof, product, symbol };
}

// reglue(result, editedRows) with editedRows = [{ j, r1?, r2?, rho? }] (r1, r2 Numbers below their row prime, rho a
// bigint >= 0) returns a new result of the same shape with tampered: true: x0 glued again from the edited rows, d0
// unchanged, and its own verification (pass, verify). Throws "bad_input" on an unknown row or a residue out of range.
export function reglue(result, editedRows) {
  const byJ = new Map();
  for (const e of editedRows || []) {
    const row = result.rows.find((r) => r.j === e.j);
    if (!row) throw new CodedError("bad_input", `row ${e.j} has no sign cells`);
    if (e.r1 !== undefined && !(Number.isSafeInteger(e.r1) && e.r1 >= 0 && e.r1 < row.q1)) throw new CodedError("bad_input", `row ${e.j}: r1 must be in 0 .. ${row.q1 - 1}`);
    if (e.r2 !== undefined && !(Number.isSafeInteger(e.r2) && e.r2 >= 0 && e.r2 < row.q2)) throw new CodedError("bad_input", `row ${e.j}: r2 must be in 0 .. ${row.q2 - 1}`);
    if (e.rho !== undefined && !(typeof e.rho === "bigint" && e.rho >= 0n)) throw new CodedError("bad_input", `row ${e.j}: rho must be a bigint >= 0`);
    byJ.set(e.j, e);
  }
  const rows = result.rows.map((r) => {
    const e = byJ.get(r.j);
    if (!e) return { ...r };
    return { ...r, r1: e.r1 === undefined ? r.r1 : e.r1, r2: e.r2 === undefined ? r.r2 : e.r2, rho: e.rho === undefined ? r.rho : e.rho };
  });
  const { x0 } = glueX(result.Xs, result.Mx, rows);
  const d0 = result.d0;
  const sx = x0.toString();
  const ver = verifyConstruction({ x0, d0, shape: result.shape, seed: result.seed, colour: result.colour, forced: result.forced });
  return assembleResult({
    pass: ver.pass, tampered: true, id: result.id, colour: result.colour, seed: result.seed, shape: result.shape,
    genus: result.genus, area: result.area, bounds: result.bounds, B: result.B, lift: result.lift,
    x0, d0, Xs: result.Xs, Mx: result.Mx, D: result.D, Md: result.Md, dIndex: result.dIndex,
    smallPrimes: result.smallPrimes, rows, emptyRows: result.emptyRows, forced: result.forced,
    digits: { x0: digitCount(x0), d0: result.digits.d0 }, sha256: { x0: sha256Hex(sx), d0: result.sha256.d0 },
    verify: { rows: ver.rows, region: ver.region },
  });
}
