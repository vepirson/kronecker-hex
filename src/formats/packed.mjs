// The packed format kron_hex_packed_v1 of a green or red region: only the data that rebuild x0, d0 and the shape.
//
// In memory the content is a PackedData object:
//   { id: string | null, colour: 1 | -1, genus, B, seed: [i, j], shape: cells sorted by (j, i),
//     smallPrimes: [{ p, xRes, dRes }]   every prime p <= B ascending, xRes = x0 mod p (x0 mod 8 for p = 2),
//                                        dRes = d0 mod p, or null when d0 is free mod p,
//     dIndex: bigint,
//     rows: [{ j, q1, q2, r1, r2, rho }] ascending j, all Numbers except rho (bigint, never reduced) }
// Rebuilding: (D, M_d) = CRT of the non-null dRes and of d0 = -j mod q1 q2 for every row, d0 = D + dIndex M_d. For
// every row, d0 + j = u q1 q2 c with u made of the primes <= B. x0 = the smallest positive CRT solution of the xRes,
// x0 = r1 mod q1, x0 = r2 mod q2 and x0 = rho mod c over all rows.

import { CodedError } from "../core/bigint_utils.mjs";
import { primesUpTo } from "../core/primes.mjs";
import { crt, smoothSplit } from "../core/crt.mjs";
import { sha256Hex } from "../core/sha256.mjs";
import { cellKey, compareCells, boundingWindow } from "../core/geometry.mjs";
import { genusOfCells } from "../core/regions.mjs";
import { makeWitness } from "./witness.mjs";

export const PACKED_FORMAT = "kron_hex_packed_v1";

// The format note carried by every packed file (the complete definition of the layout).
export const FORMAT_NOTE = "shape: cell (shape_origin[0] + t, shape_origin[1] + r) is in the shape iff bit t (least significant = 0) of int(shape_rows[r], 16) is set. small_primes[p] = [x0 mod p, d0 mod p or null when d0 is unconstrained mod p], for p = 2 the first entry is x0 mod 8. d0 = D + d0_index * M_d where (D, M_d) = CRT of the non-null d0 residues and of d0 = -j mod q1 q2 for every row, 0 <= D < M_d. rows = [j, q1, q2, r1, r2, rho]: with c_j = (d0 + j) / (u_j q1 q2), u_j the part of d0 + j made of primes <= B, x0 = the smallest positive CRT solution of x0 mod 8, x0 mod odd p <= B, x0 = r1 mod q1, r2 mod q2, rho mod c_j. sha256 of the plain decimal strings of x0 and d0.";

// Sanity limits on the sizes read from a file (a damaged file is rejected before any large allocation).
export const PACKED_LIMITS = Object.freeze({ maxB: 1000000, maxRows: 1000000, maxRowHexDigits: 262144 });

const bad = (msg) => new CodedError("bad_format", msg);
const range = (msg) => new CodedError("out_of_range", msg);

function int(v, name, min = -Infinity) {
  if (typeof v !== "number" || !Number.isInteger(v)) throw bad(`${name} is not an integer`);
  if (!Number.isSafeInteger(v)) throw range(`${name} is not a safe integer`);
  if (v < min) throw range(`${name} = ${v} is below ${min}`);
  return v;
}

function nonNegBig(v, name) {
  if (typeof v === "string") {
    if (!/^[0-9]+$/.test(v)) throw bad(`${name} is not a decimal string`);
    return BigInt(v);
  }
  return BigInt(int(v, name, 0));
}

function pair(v, name) {
  if (!Array.isArray(v) || v.length !== 2) throw bad(`${name} is not a pair`);
  return [int(v[0], `${name}[0]`), int(v[1], `${name}[1]`)];
}

const jsonBig = (b) => (b <= 9007199254740991n ? Number(b) : b.toString());

// Cells of a bitmap: bit t of hex string rows[r] set means cell (i0 + t, j0 + r). Sorted by (j, i).
function cellsFromHexRows(i0, j0, rows) {
  const out = [];
  rows.forEach((h, r) => {
    const n = h.length;
    for (let k = n - 1; k >= 0; k--) {
      const v = parseInt(h[k], 16);
      const base = 4 * (n - 1 - k);
      for (let b = 0; b < 4; b++) if ((v >> b) & 1) out.push([i0 + base + b, j0 + r]);
    }
  });
  return out.sort(compareCells);
}

// Hex bitmap rows of a sorted, non-empty cell list, with the origin [imin, jmin].
function hexRowsOfCells(cells) {
  const w = boundingWindow(cells, 0);
  const rows = [];
  for (let j = w.jmin; j <= w.jmax; j++) rows.push([]);
  for (const [i, j] of cells) {
    const t = i - w.imin;
    const nib = rows[j - w.jmin];
    while (nib.length <= t >> 2) nib.push(0);
    nib[t >> 2] |= 1 << (t & 3);
  }
  const hex = rows.map((nib) => {
    let s = "";
    for (let k = nib.length - 1; k >= 0; k--) s += nib[k].toString(16);
    s = s.replace(/^0+/, "");
    return s === "" ? "0" : s;
  });
  return { origin: [w.imin, w.jmin], rows: hex };
}

const sameWindow = (a, b) => a.imin === b.imin && a.imax === b.imax && a.jmin === b.jmin && a.jmax === b.jmax;

// parsePacked(jsonObject) checks a parsed kron_hex_packed_v1 object and returns { data: PackedData, sha256, digits }
// (sha256 = { x0, d0 } hex strings and digits = { x0, d0 } as stored, or null when absent). Every JSON number must be
// a safe integer ("out_of_range" otherwise, "bad_format" for a non-integer). rho and d0_index may also be decimal
// strings. Stated area, window and genus must agree with the shape, the seed must be a cell of it, small_primes must
// list exactly the primes <= B. Throws "bad_format" or "out_of_range".
export function parsePacked(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) throw bad("not a JSON object");
  if (obj.format !== PACKED_FORMAT) throw bad(`format is ${JSON.stringify(obj.format)}, expected "${PACKED_FORMAT}"`);
  const id = obj.id === undefined || obj.id === null ? null : obj.id;
  if (id !== null && typeof id !== "string") throw bad("id is not a string");
  if (obj.colour !== 1 && obj.colour !== -1) {
    if (typeof obj.colour === "number") int(obj.colour, "colour");
    throw bad("colour is not 1 or -1");
  }
  const genus = int(obj.genus, "genus", 0);
  const B = int(obj.B, "B", 2);
  if (B > PACKED_LIMITS.maxB) throw range(`B = ${B} above ${PACKED_LIMITS.maxB}`);
  const seed = pair(obj.seed, "seed");
  const origin = pair(obj.shape_origin, "shape_origin");
  if (!Array.isArray(obj.shape_rows) || obj.shape_rows.length === 0) throw bad("shape_rows is not a non-empty list");
  if (obj.shape_rows.length > PACKED_LIMITS.maxRows) throw range("too many shape rows");
  for (const h of obj.shape_rows) {
    if (typeof h !== "string" || !/^[0-9a-fA-F]+$/.test(h)) throw bad("a shape row is not a hex string");
    if (h.length > PACKED_LIMITS.maxRowHexDigits) throw range("a shape row is too wide");
  }
  const shape = cellsFromHexRows(origin[0], origin[1], obj.shape_rows.map((h) => h.toLowerCase()));
  if (shape.length === 0) throw bad("the shape is empty");
  for (const [i, j] of shape) if (Math.abs(i) >= 16777216 || Math.abs(j) >= 16777216) throw range("a shape cell has a coordinate of size 2^24 or more");
  const area = int(obj.area, "area", 1);
  if (area !== shape.length) throw bad(`stated area ${area}, the shape has ${shape.length} cells`);
  if (obj.window !== undefined) {
    const w = obj.window;
    if (w === null || typeof w !== "object") throw bad("window is not an object");
    const ww = { imin: int(w.imin, "window.imin"), imax: int(w.imax, "window.imax"), jmin: int(w.jmin, "window.jmin"), jmax: int(w.jmax, "window.jmax") };
    if (!sameWindow(ww, boundingWindow(shape, 1))) throw bad("window is not the box of the shape and its neighbours");
  }
  const keys = new Set(shape.map(([i, j]) => cellKey(i, j)));
  if (!keys.has(cellKey(seed[0], seed[1]))) throw bad("seed is not a cell of the shape");
  if (genusOfCells(shape).genus !== genus) throw bad("stated genus differs from the genus of the shape");

  const sp = obj.small_primes;
  if (sp === null || typeof sp !== "object" || Array.isArray(sp)) throw bad("small_primes is not an object");
  const primes = primesUpTo(B);
  const spKeys = Object.keys(sp);
  if (spKeys.length !== primes.length || !primes.every((p) => Object.prototype.hasOwnProperty.call(sp, String(p)))) {
    throw bad("small_primes does not list exactly the primes <= B");
  }
  const smallPrimes = primes.map((p) => {
    const v = sp[String(p)];
    if (!Array.isArray(v) || v.length !== 2) throw bad(`small_primes[${p}] is not a pair`);
    const xRes = int(v[0], `small_primes[${p}][0]`, 0);
    if (xRes >= (p === 2 ? 8 : p)) throw range(`x0 residue ${xRes} mod ${p === 2 ? 8 : p}`);
    let dRes = null;
    if (v[1] !== null) {
      dRes = int(v[1], `small_primes[${p}][1]`, 0);
      if (dRes >= p) throw range(`d0 residue ${dRes} mod ${p}`);
    }
    return { p, xRes, dRes };
  });
  const dIndex = nonNegBig(obj.d0_index, "d0_index");
  if (!Array.isArray(obj.rows)) throw bad("rows is not a list");
  const rows = obj.rows.map((r, k) => {
    if (!Array.isArray(r) || r.length !== 6) throw bad(`rows[${k}] is not [j, q1, q2, r1, r2, rho]`);
    const j = int(r[0], `rows[${k}].j`);
    const q1 = int(r[1], `rows[${k}].q1`, 2);
    const q2 = int(r[2], `rows[${k}].q2`, 2);
    const r1 = int(r[3], `rows[${k}].r1`, 0);
    const r2 = int(r[4], `rows[${k}].r2`, 0);
    if (r1 >= q1 || r2 >= q2) throw range(`rows[${k}]: residue not below its row prime`);
    if (q1 === q2) throw bad(`rows[${k}]: q1 = q2`);
    return { j, q1, q2, r1, r2, rho: nonNegBig(r[5], `rows[${k}].rho`) };
  });
  for (let k = 1; k < rows.length; k++) if (rows[k].j <= rows[k - 1].j) throw bad("rows are not strictly ascending in j");

  let sha256 = null;
  if (obj.sha256 !== undefined && obj.sha256 !== null) {
    const s = obj.sha256;
    const ok = (h) => typeof h === "string" && /^[0-9a-f]{64}$/.test(h);
    if (typeof s !== "object" || !ok(s.x0) || !ok(s.d0)) throw bad("sha256 is not { x0, d0 } of 64 hex digits");
    sha256 = { x0: s.x0, d0: s.d0 };
  }
  let digits = null;
  if (obj.digits !== undefined && obj.digits !== null) {
    const s = obj.digits;
    if (typeof s !== "object") throw bad("digits is not an object");
    digits = { x0: int(s.x0, "digits.x0", 1), d0: int(s.d0, "digits.d0", 1) };
  }
  const data = { id, colour: obj.colour, genus, B, seed, shape, smallPrimes, dIndex, rows };
  return { data, sha256, digits };
}

// rebuildPacked(data) rebuilds { x0, d0, rows } (bigints) from a PackedData object, with
// rows[k] = { j, q1, q2, r1, r2, rho, u, c } (u, c bigints: d0 + j = u q1 q2 c). x0 is the smallest POSITIVE solution
// (a CRT result 0 is replaced by the modulus). Throws "not_positive" (d0 + j < 1), "row_primes_do_not_divide",
// and "not_coprime" from the CRT.
export function rebuildPacked(data) {
  const primes = primesUpTo(data.B);
  const dPairs = [];
  for (const { p, dRes } of data.smallPrimes) if (dRes !== null) dPairs.push([BigInt(dRes), BigInt(p)]);
  for (const r of data.rows) dPairs.push([BigInt(-r.j), BigInt(r.q1) * BigInt(r.q2)]);
  const { x: D, M: Md } = crt(dPairs);
  const d0 = D + data.dIndex * Md;
  const xPairs = data.smallPrimes.map(({ p, xRes }) => [BigInt(xRes), p === 2 ? 8n : BigInt(p)]);
  const rows = [];
  for (const r of data.rows) {
    const n = d0 + BigInt(r.j);
    if (n < 1n) throw new CodedError("not_positive", `row ${r.j}: d0 + j is not positive`);
    const { u, m } = smoothSplit(n, primes);
    const q = BigInt(r.q1) * BigInt(r.q2);
    if (m % q !== 0n) throw new CodedError("row_primes_do_not_divide", `row ${r.j}: q1 q2 does not divide the part of d0 + j prime to the primes <= B`);
    const c = m / q;
    xPairs.push([BigInt(r.r1), BigInt(r.q1)], [BigInt(r.r2), BigInt(r.q2)], [r.rho, c]);
    rows.push({ j: r.j, q1: r.q1, q2: r.q2, r1: r.r1, r2: r.r2, rho: r.rho, u, c });
  }
  const { x, M } = crt(xPairs);
  return { x0: x === 0n ? M : x, d0, rows };
}

// checkPackedHashes(parsed, x0, d0) compares the decimal strings of x0 and d0 with the stored sha256 values and digit
// counts of parsePacked's result (a part stored as null is skipped). Throws "hash_mismatch" or "digits_mismatch".
export function checkPackedHashes(parsed, x0, d0) {
  for (const [name, v] of [["x0", x0], ["d0", d0]]) {
    const s = v.toString();
    if (parsed.sha256 && sha256Hex(s) !== parsed.sha256[name]) throw new CodedError("hash_mismatch", `sha256 of ${name} differs from the stored value`);
    if (parsed.digits && s.length !== parsed.digits[name]) throw new CodedError("digits_mismatch", `${name} has ${s.length} digits, stored ${parsed.digits[name]}`);
  }
}

// formatPacked(data, x0, d0) returns the kron_hex_packed_v1 JSON object of a PackedData object and its rebuilt
// numbers: the fields of the data plus area, window, shape_origin, shape_rows, sha256, digits and format_note.
// d0_index and rho are written as JSON numbers when they are safe integers, as decimal strings otherwise.
export function formatPacked(data, x0, d0) {
  const cells = data.shape.map(([i, j]) => [i, j]).sort(compareCells);
  const { origin, rows } = hexRowsOfCells(cells);
  const small = {};
  for (const { p, xRes, dRes } of data.smallPrimes) small[String(p)] = [xRes, dRes];
  const sx = x0.toString();
  const sd = d0.toString();
  return {
    format: PACKED_FORMAT,
    format_note: FORMAT_NOTE,
    id: data.id,
    colour: data.colour,
    genus: data.genus,
    area: cells.length,
    seed: [data.seed[0], data.seed[1]],
    window: boundingWindow(cells, 1),
    shape_origin: origin,
    shape_rows: rows,
    B: data.B,
    small_primes: small,
    d0_index: jsonBig(data.dIndex),
    rows: data.rows.map((r) => [r.j, r.q1, r.q2, r.r1, r.r2, jsonBig(r.rho)]),
    sha256: { x0: sha256Hex(sx), d0: sha256Hex(sd) },
    digits: { x0: sx.length, d0: sd.length },
  };
}

// packedToWitness(jsonObject, id) = parsePacked, rebuildPacked, checkPackedHashes, then makeWitness. The witness id
// is `id` when given, else the id of the file.
export function packedToWitness(obj, id) {
  const parsed = parsePacked(obj);
  const { x0, d0 } = rebuildPacked(parsed.data);
  checkPackedHashes(parsed, x0, d0);
  const d = parsed.data;
  return makeWitness({ id: id === undefined || id === null ? d.id : id, colour: d.colour, x0, d0, seed: d.seed, shape: d.shape });
}
