// The URL token kron_hex_bin_v1: the content of a packed region as a bit stream, written in base64url without
// padding, short enough for a link.
//
// token = base64url(body bytes + 4 tag bytes). The body is read most significant bit first and padded with zero bits
// to a whole byte. Codes: u(w) = unsigned integer on w bits, g(n) = Elias gamma code of n >= 1 (L - 1 zero bits,
// then the L bits of n), sg(n) = g(zigzag(n) + 1) with zigzag(n) = 2n for n >= 0 and -2n - 1 for n < 0,
// w(m) = bit length of m - 1 (the width of a residue modulo m). Fields in order:
//    1. u(4) version = 1
//    2. u(1) colour: 1 green (+1), 0 red (-1)
//    3. u(1) has_id, and when 1: g(length), then length times u(7) ASCII
//    4. g(genus + 1)
//    5. g(B)                               the small primes are all primes p <= B
//    6. sg(i0), sg(j0)                     shape origin
//    7. g(R)                               number of shape rows, row r is the row j0 + r, every row non-empty
//       row 0: g(lo + 1), g(hi - lo + 1)   lo / hi = smallest / largest t with cell (i0 + t, j0 + r) in the shape
//       row r >= 1: sg(lo - previous lo), sg(hi - previous hi)
//       every row: its header, then hi - lo - 1 raw bits, the cells t = lo + 1 .. hi - 1 in this order
//    8. g(si - i0 + 1), g(sj - j0 + 1)     seed cell (si, sj), a cell of the shape
//    9. for every prime p <= B ascending: u(3) x0 mod 8 when p = 2, else u(w(p)) x0 mod p. Then u(1) "d0 is
//       constrained mod p", and when 1: u(w(p)) d0 mod p
//   10. g(d0_index + 1)
//   11. R + 2 bits: window row j = j0 - 1 + t has a row entry or not (t = 0 .. R + 1). Then for every row with an
//       entry, ascending j: u(5) e. For e <= 30 the row primes q1 < q2 are the two smallest primes >= max(2^e, B + 1)
//       not used by an earlier row, for e = 31 they follow explicitly as g(q1), g(q2). Then u(w(q1)) r1,
//       u(w(q2)) r2, g(rho + 1).
// Version 2 holds a blue region (colour 0): the shape and one class per small prime. Fields in order:
//    1. u(4) version = 2
//    2. u(1) has_id, and when 1 the id as in version 1
//    3. g(genus + 1), g(B), the shape origin, the shape rows and the seed exactly as fields 4 to 8 of version 1
//    4. for every prime p <= B ascending: u(w(p)) x0 mod p, then u(w(p)) d0 mod p
// The rest of a blue construction (private primes, d0, x0) follows from these fields by rule.
// A shape alone (the shape editor's address) is written as fields 6 and 7 of version 1, base64url, no tag
// (shapeRowsToText, shapeRowsFromText).
// tag = the first 4 bytes of sha256(body bytes + "|" + decimal string of x0). It covers every field and the rebuilt
// number, so a damaged link and a wrong reconstruction are both rejected. Area, window and the hashes of the packed
// file are not stored: they are recomputed. A token is accepted only when it is canonical (re-encoding the fields
// read gives the same body, the padding bits are zero), its shape is connected, its genus field is the genus of its
// shape and the tag matches.

import { CodedError } from "../core/bigint_utils.mjs";
import { primesUpTo, isPrimeSmall } from "../core/primes.mjs";
import { sha256Bytes, bytesToHex } from "../core/sha256.mjs";
import { compareCells, boundingWindow } from "../core/geometry.mjs";
import { genusOfCells, isConnected } from "../core/regions.mjs";
import { kindOf } from "../construct/kind.mjs";
import { drain } from "../construct/events.mjs";
import { rebuildBlueIter } from "../construct/blue/steps.mjs";
import { rebuildPacked } from "./packed.mjs";
import { makeWitness, checkShapeCells } from "./witness.mjs";

export const TOKEN_VERSION = 1;
// The version of a token that holds a blue region.
export const TOKEN_VERSION_BLUE = 2;
// Sanity cap on B, on the number of rows and on a row width: a damaged token is rejected early.
export const TOKEN_CAP = 1000000;

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64_INDEX = new Map([...B64].map((c, k) => [c, k]));

// The base64url alphabet in its standard order (A-Z, a-z, 0-9, "-", "_").
export const BASE64URL_ALPHABET = B64;

// base64url text without padding of a Uint8Array.
export function base64urlEncode(bytes) {
  let s = "";
  let k = 0;
  for (; k + 2 < bytes.length; k += 3) {
    const v = (bytes[k] << 16) | (bytes[k + 1] << 8) | bytes[k + 2];
    s += B64[v >> 18] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63];
  }
  const rest = bytes.length - k;
  if (rest === 1) {
    const v = bytes[k] << 16;
    s += B64[v >> 18] + B64[(v >> 12) & 63];
  } else if (rest === 2) {
    const v = (bytes[k] << 16) | (bytes[k + 1] << 8);
    s += B64[v >> 18] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63];
  }
  return s;
}

// Bytes of a canonical base64url text without padding. Throws "bad_alphabet" or "not_canonical" (a length of the
// form 4k + 1, or nonzero padding bits).
export function base64urlDecode(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new CodedError("bad_alphabet", "a character outside the base64url alphabet");
  if (text.length % 4 === 1) throw new CodedError("not_canonical", "a base64url text cannot have length 4k + 1");
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let acc = 0, nb = 0, o = 0;
  for (const ch of text) {
    acc = (acc << 6) | B64_INDEX.get(ch);
    nb += 6;
    if (nb >= 8) {
      nb -= 8;
      out[o++] = (acc >> nb) & 255;
      acc &= (1 << nb) - 1;
    }
  }
  if (acc !== 0) throw new CodedError("not_canonical", "nonzero padding bits");
  return out;
}

// ---------- bit streams ----------

class BitReader {
  constructor(bytes) {
    let s = "";
    for (const b of bytes) s += b.toString(2).padStart(8, "0");
    this.s = s;
    this.pos = 0;
  }
  bits(n) {
    if (n < 0 || this.pos + n > this.s.length) throw new CodedError("truncated", "the bit stream ends inside a field");
    const out = this.s.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  big(w) {
    return w ? BigInt("0b" + this.bits(w)) : 0n;
  }
  u(w) {
    return w ? safe(this.big(w)) : 0;
  }
  gBig() {
    const k = this.s.indexOf("1", this.pos);
    if (k < 0) throw new CodedError("truncated", "a gamma code without end");
    const n = k - this.pos + 1;
    this.pos = k;
    return this.big(n);
  }
  g() {
    return safe(this.gBig());
  }
  sg() {
    const z = this.gBig() - 1n;
    return safe(z % 2n === 0n ? z / 2n : -(z + 1n) / 2n);
  }
  finish() {
    const rest = this.s.slice(this.pos);
    if (rest.length >= 8 || rest.includes("1")) throw new CodedError("not_canonical", "bits left after the last field");
  }
}

function safe(b) {
  if (b > 9007199254740991n || b < -9007199254740991n) throw new CodedError("out_of_range", "a field is not a safe integer");
  return Number(b);
}

class BitWriter {
  constructor() {
    this.parts = [];
    this.n = 0;
  }
  push(s) {
    this.parts.push(s);
    this.n += s.length;
  }
  u(v, w) {
    const b = BigInt(v);
    if (b < 0n || b >= 1n << BigInt(w)) throw new CodedError("out_of_range", `value ${v} does not fit in ${w} bits`);
    if (w) this.push(b.toString(2).padStart(w, "0"));
  }
  g(v) {
    const b = BigInt(v);
    if (b < 1n) throw new CodedError("out_of_range", `a gamma code needs n >= 1, got ${v}`);
    const s = b.toString(2);
    this.push("0".repeat(s.length - 1) + s);
  }
  sg(n) {
    this.g(n >= 0 ? 2 * n + 1 : -2 * n);
  }
  toBytes() {
    let s = this.parts.join("");
    s += "0".repeat((8 - (s.length % 8)) % 8);
    const out = new Uint8Array(s.length / 8);
    for (let k = 0; k < out.length; k++) out[k] = parseInt(s.slice(8 * k, 8 * k + 8), 2);
    return out;
  }
}

const width = (m) => (m <= 1 ? 0 : (m - 1).toString(2).length);

// The two smallest primes >= start that are not in `used`.
function nextTwoPrimes(start, used) {
  const out = [];
  let q = start;
  while (out.length < 2) {
    if (!used.has(q) && isPrimeSmall(q)) out.push(q);
    q += 1;
  }
  return out;
}

let primeCache = [];
let primeCacheMax = 1;
function primesCached(B) {
  if (B > primeCacheMax) {
    primeCache = primesUpTo(B);
    primeCacheMax = B;
  }
  if (B === primeCacheMax) return primeCache;
  return primeCache.filter((p) => p <= B);
}

// ---------- decode ----------

// The field has_id and the id (fields 3 of version 1 and 2 of version 2): the id string or null.
function readId(rd) {
  if (!rd.u(1)) return null;
  const n = rd.g();
  if (n > TOKEN_CAP) throw new CodedError("sanity_cap", "id length above the sanity cap");
  let s = "";
  for (let k = 0; k < n; k++) s += String.fromCharCode(rd.u(7));
  return s;
}

// The fields shape origin and shape rows (6 and 7 of version 1): { i0, j0, R, shape (in row order), rowSets }.
function readShapeRows(rd) {
  const i0 = rd.sg();
  const j0 = rd.sg();
  const R = rd.g();
  if (R > TOKEN_CAP) throw new CodedError("sanity_cap", "row count above the sanity cap");
  const shape = [];
  const rowSets = [];
  let lo = 0, hi = 0;
  for (let r = 0; r < R; r++) {
    if (r === 0) {
      lo = rd.g() - 1;
      hi = lo + rd.g() - 1;
    } else {
      lo += rd.sg();
      hi += rd.sg();
    }
    if (lo < 0 || hi < lo || hi > TOKEN_CAP) throw new CodedError("bad_extent", `shape row ${r}: bad extent`);
    const ts = [lo];
    const raw = rd.bits(Math.max(hi - lo - 1, 0));
    for (let k = 0; k < raw.length; k++) if (raw[k] === "1") ts.push(lo + 1 + k);
    if (hi > lo) ts.push(hi);
    rowSets.push(new Set(ts));
    for (const t of ts) shape.push([i0 + t, j0 + r]);
  }
  return { i0, j0, R, shape, rowSets };
}

// The fields genus, B, shape origin, shape rows and seed (4 to 8 of version 1): { genus, B, j0, R, shape (sorted),
// seed }.
function readShapeFields(rd) {
  const genus = rd.g() - 1;
  const B = rd.g();
  if (B > TOKEN_CAP) throw new CodedError("sanity_cap", "B above the sanity cap");
  const { i0, j0, R, shape, rowSets } = readShapeRows(rd);
  const si = i0 + rd.g() - 1;
  const sj = j0 + rd.g() - 1;
  if (!(sj - j0 >= 0 && sj - j0 < R && rowSets[sj - j0].has(si - i0))) throw new CodedError("seed_not_in_shape", "the seed is not a cell of the shape");
  shape.sort(compareCells);
  return { genus, B, j0, R, shape, seed: [si, sj] };
}

// The fields after the shape of version 1 (9 to 11): { smallPrimes, dIndex, rows }.
function readSignFields(rd, { B, j0, R }) {
  const smallPrimes = [];
  for (const p of primesCached(B)) {
    const xRes = p === 2 ? rd.u(3) : rd.u(width(p));
    const dRes = rd.u(1) ? rd.u(width(p)) : null;
    if ((p > 2 && xRes >= p) || (dRes !== null && dRes >= p)) throw new CodedError("out_of_range", `residue mod ${p} out of range`);
    smallPrimes.push({ p, xRes, dRes });
  }
  const dIndex = rd.gBig() - 1n;
  const present = rd.bits(R + 2);
  const used = new Set();
  const rows = [];
  for (let t = 0; t < present.length; t++) {
    if (present[t] !== "1") continue;
    const e = rd.u(5);
    let q1, q2;
    if (e === 31) {
      q1 = rd.g();
      q2 = rd.g();
      if (q1 < 2 || q2 < 2 || q1 === q2) throw new CodedError("out_of_range", "explicit row primes: bad values");
    } else {
      [q1, q2] = nextTwoPrimes(Math.max(2 ** e, B + 1), used);
    }
    used.add(q1);
    used.add(q2);
    const r1 = rd.u(width(q1));
    const r2 = rd.u(width(q2));
    if (r1 >= q1 || r2 >= q2) throw new CodedError("out_of_range", "row residue out of range");
    const rho = rd.gBig() - 1n;
    rows.push({ j: j0 - 1 + t, q1, q2, r1, r2, rho });
  }
  return { smallPrimes, dIndex, rows };
}

// The fields after the shape of version 2: { classes: [{ p, xRes, dRes }] }.
function readBlueFields(rd, { B }) {
  const classes = [];
  for (const p of primesCached(B)) {
    const xRes = rd.u(width(p));
    const dRes = rd.u(width(p));
    if (xRes >= p || dRes >= p) throw new CodedError("out_of_range", `residue mod ${p} out of range`);
    classes.push({ p, xRes, dRes });
  }
  return { classes };
}

// decodeToken(text) reads the STRUCTURE of a token (surrounding white space ignored) and returns
// { data, tagHex, body (Uint8Array) }, data a PackedData object for version 1 and a BlueData object (colour 0) for
// version 2. The body must be the one the writer gives for data (so the shape origin is the smallest i and j of the
// shape, every row prime follows the rule when it can, nothing is written twice). It cannot check the tag (that
// needs the rebuilt x0), so every token from outside goes through openToken. Throws "bad_alphabet",
// "not_canonical", "truncated", "unknown_version", "out_of_range", "bad_extent", "seed_not_in_shape" or "sanity_cap".
export function decodeToken(text) {
  if (typeof text !== "string") throw new CodedError("bad_alphabet", "a token is a string");
  const token = text.trim();
  const bytes = base64urlDecode(token);
  if (base64urlEncode(bytes) !== token) throw new CodedError("not_canonical", "base64url re-encoding differs");
  if (bytes.length < 6) throw new CodedError("truncated", "token too short");
  const body = bytes.slice(0, bytes.length - 4);
  const tag = bytes.slice(bytes.length - 4);
  const rd = new BitReader(body);
  const version = rd.u(4);
  let data;
  if (version === TOKEN_VERSION) {
    const colour = rd.u(1) ? 1 : -1;
    const id = readId(rd);
    const sf = readShapeFields(rd);
    const { smallPrimes, dIndex, rows } = readSignFields(rd, sf);
    data = { id, colour, genus: sf.genus, B: sf.B, seed: sf.seed, shape: sf.shape, smallPrimes, dIndex, rows };
  } else if (version === TOKEN_VERSION_BLUE) {
    const id = readId(rd);
    const sf = readShapeFields(rd);
    const { classes } = readBlueFields(rd, sf);
    data = { id, colour: 0, genus: sf.genus, B: sf.B, seed: sf.seed, shape: sf.shape, classes };
  } else {
    throw new CodedError("unknown_version", "not a kron_hex_bin_v1 token of version 1 or 2");
  }
  rd.finish();
  let again;
  try {
    again = bodyOf(data, data.id !== null);
  } catch (e) {
    if (!(e instanceof CodedError)) throw e;
    again = null;
  }
  if (!again || again.length !== body.length || again.some((b, k) => b !== body[k])) {
    throw new CodedError("not_canonical", "the token is not written as the writer writes it (for example a shape origin that is not the smallest i of the shape)");
  }
  return { data, tagHex: bytesToHex(tag), body };
}

function tagOf(body, x0) {
  const tail = new TextEncoder().encode("|" + x0.toString());
  const buf = new Uint8Array(body.length + tail.length);
  buf.set(body);
  buf.set(tail, body.length);
  return bytesToHex(sha256Bytes(buf).slice(0, 4));
}

// readToken(text) = decodeToken, then every check that needs no rebuilt number: the shape passes checkShapeCells,
// is connected and has the stated genus. It is cheap (no big integer), so a page can read a token at once and decide
// where its rebuild runs (data.shape.length is its size). Returns the value of decodeToken. Throws the codes of
// decodeToken, the codes of checkShapeCells, "not_connected", and "bad_format" for a stated genus that differs from
// the genus of the shape.
export function readToken(text) {
  const read = decodeToken(text);
  const { shape, genus } = read.data;
  checkShapeCells(shape);
  if (!isConnected(shape)) throw new CodedError("not_connected", "the shape of the token is not connected");
  const g = genusOfCells(shape).genus;
  if (g !== genus) throw new CodedError("bad_format", `stated genus ${genus} differs from the genus ${g} of the shape`);
  return read;
}

// tagMatches(read, x0) is true when the tag of a read token (readToken) is the tag of its body and of x0.
export function tagMatches(read, x0) {
  return tagOf(read.body, x0) === read.tagHex;
}

// openTokenIter(text) is openToken as a generator: it yields the events of the blue replay (version 2, for a
// progress display, see rebuildBlueIter) and returns what openToken returns.
export function* openTokenIter(text) {
  const read = readToken(text);
  const { data, tagHex } = read;
  const blue = kindOf(data) === "blue";
  const rb = blue ? yield* rebuildBlueIter(data) : rebuildPacked(data);
  if (!tagMatches(read, rb.x0)) throw new CodedError("tag_mismatch", "damaged token or wrong reconstruction");
  return blue ? { data, x0: rb.x0, d0: rb.d0, tagHex } : { data, x0: rb.x0, d0: rb.d0, rows: rb.rows, tagHex };
}

// openToken(text) = readToken, the rebuild of x0 and d0 (rebuildPacked for version 1, the replay of steps 0 to 4 of
// the blue construction for version 2, which checks the stored classes), then the tag check. Returns { data, x0, d0,
// rows, tagHex } for version 1 and { data, x0, d0, tagHex } for version 2. Every token from outside goes through
// this function (or through readToken, a rebuild of the same data and tagMatches). Throws the codes of readToken, of
// rebuildPacked or of the blue replay ("replay_mismatch", "no_x0") and "tag_mismatch".
export function openToken(text) {
  return drain(openTokenIter(text));
}

// tokenInText(text) returns the token in a pasted text: the token of a link containing "#/w/<token>" or
// "#/lab/w/<token>", or the text itself (surrounding white space ignored) when it is a bare token, i.e. at least 8
// characters of the base64url alphabet. null when there is none. It does not open the token.
export function tokenInText(text) {
  const t = String(text || "").trim();
  const m = /#\/(?:lab\/)?w\/([A-Za-z0-9_-]+)/.exec(t);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{8,}$/.test(t)) return t;
  return null;
}

// ---------- encode ----------

// The field has_id and the id.
function writeId(wr, data, withId) {
  if (withId) {
    const id = data.id;
    if (typeof id !== "string" || id.length === 0 || /[^\x00-\x7f]/.test(id)) throw new CodedError("bad_format", "id must be non-empty ASCII");
    wr.u(1, 1);
    wr.g(id.length);
    for (const ch of id) wr.u(ch.charCodeAt(0), 7);
  } else {
    wr.u(0, 1);
  }
}

// The fields shape origin and shape rows of a list of cells. Returns { i0, j0, R } (origin and number of rows).
function writeShapeRows(wr, shape) {
  const cells = shape.map(([i, j]) => [i, j]).sort(compareCells);
  if (cells.length === 0) throw new CodedError("bad_format", "empty shape");
  const box = boundingWindow(cells, 0);
  const i0 = box.imin, j0 = box.jmin;
  wr.sg(i0);
  wr.sg(j0);
  const R = box.jmax - box.jmin + 1;
  const byRow = [];
  for (let r = 0; r < R; r++) byRow.push([]);
  for (const [i, j] of cells) byRow[j - j0].push(i - i0);
  wr.g(R);
  let plo = 0, phi = 0;
  byRow.forEach((ts, r) => {
    if (ts.length === 0) throw new CodedError("bad_format", `shape row ${r} is empty (the format needs a cell in every row)`);
    const lo = ts[0], hi = ts[ts.length - 1];
    if (r === 0) {
      wr.g(lo + 1);
      wr.g(hi - lo + 1);
    } else {
      wr.sg(lo - plo);
      wr.sg(hi - phi);
    }
    const inRow = new Set(ts);
    let s = "";
    for (let t = lo + 1; t < hi; t++) s += inRow.has(t) ? "1" : "0";
    wr.push(s);
    plo = lo;
    phi = hi;
  });
  return { i0, j0, R };
}

// The fields genus, B, shape origin, shape rows and seed. Returns { j0, R } (first row and number of rows).
function writeShapeFields(wr, data) {
  wr.g(data.genus + 1);
  wr.g(data.B);
  const { i0, j0, R } = writeShapeRows(wr, data.shape);
  const [si, sj] = data.seed;
  wr.g(si - i0 + 1);
  wr.g(sj - j0 + 1);
  return { j0, R };
}

// The fields after the shape of version 1 (small primes, d0 index, rows).
function writeSignFields(wr, data, { j0, R }) {
  const B = data.B;
  const primes = primesUpTo(B);
  if (data.smallPrimes.length !== primes.length || !data.smallPrimes.every((s, k) => s.p === primes[k])) {
    throw new CodedError("bad_format", "smallPrimes is not exactly the primes <= B, ascending");
  }
  for (const { p, xRes, dRes } of data.smallPrimes) {
    if (p > 2 && xRes >= p) throw new CodedError("out_of_range", `x0 residue mod ${p}`);
    wr.u(xRes, p === 2 ? 3 : width(p));
    if (dRes === null) {
      wr.u(0, 1);
    } else {
      if (dRes >= p) throw new CodedError("out_of_range", `d0 residue mod ${p}`);
      wr.u(1, 1);
      wr.u(dRes, width(p));
    }
  }
  wr.g(data.dIndex + 1n);
  const js = data.rows.map((r) => r.j);
  for (let k = 1; k < js.length; k++) if (js[k] <= js[k - 1]) throw new CodedError("bad_format", "rows must be strictly ascending in j");
  if (js.length && (js[0] < j0 - 1 || js[js.length - 1] > j0 + R)) throw new CodedError("bad_format", "rows must lie in the window rows j0 - 1 .. j0 + R");
  const have = new Set(js);
  let present = "";
  for (let t = 0; t < R + 2; t++) present += have.has(j0 - 1 + t) ? "1" : "0";
  wr.push(present);
  const used = new Set();
  for (const { j, q1, q2, r1, r2, rho } of data.rows) {
    const e = Math.min(30, q1.toString(2).length - 1);
    const rule = nextTwoPrimes(Math.max(2 ** e, B + 1), used);
    if (rule[0] === q1 && rule[1] === q2) {
      wr.u(e, 5);
    } else {
      if (q1 === q2 || q1 < 2 || q2 < 2) throw new CodedError("bad_format", `row ${j}: bad row primes`);
      wr.u(31, 5);
      wr.g(q1);
      wr.g(q2);
    }
    used.add(q1);
    used.add(q2);
    if (r1 >= q1 || r2 >= q2) throw new CodedError("out_of_range", `row ${j}: residue not below its row prime`);
    wr.u(r1, width(q1));
    wr.u(r2, width(q2));
    wr.g(rho + 1n);
  }
}

// The fields after the shape of version 2 (one class per prime p <= B).
function writeBlueFields(wr, data) {
  const primes = primesUpTo(data.B);
  const cl = data.classes;
  if (!Array.isArray(cl) || cl.length !== primes.length || !cl.every((c, k) => c && c.p === primes[k])) {
    throw new CodedError("bad_format", "classes is not exactly the primes <= B, ascending");
  }
  for (const { p, xRes, dRes } of cl) {
    if (xRes >= p || dRes >= p) throw new CodedError("out_of_range", `residue mod ${p}`);
    wr.u(xRes, width(p));
    wr.u(dRes, width(p));
  }
}

// The body bytes of a PackedData object (version 1) or of a BlueData object (version 2), the id stored when withId.
function bodyOf(data, withId) {
  const wr = new BitWriter();
  if (kindOf(data) === "blue") {
    wr.u(TOKEN_VERSION_BLUE, 4);
    writeId(wr, data, withId);
    writeShapeFields(wr, data);
    writeBlueFields(wr, data);
  } else {
    wr.u(TOKEN_VERSION, 4);
    if (data.colour !== 1 && data.colour !== -1) throw new CodedError("bad_format", "colour must be 1 or -1");
    wr.u(data.colour === 1 ? 1 : 0, 1);
    writeId(wr, data, withId);
    writeSignFields(wr, data, writeShapeFields(wr, data));
  }
  return wr.toBytes();
}

// encodeToken(data, x0, { withId }) writes the token of a PackedData object (version 1) or of a BlueData object
// (colour 0, version 2), x0 being its rebuilt x0 (for the tag). The id is stored only with withId = true (it must
// then be non-empty ASCII). Throws "bad_format" on data the format cannot hold and "out_of_range" on a value that
// does not fit its field.
export function encodeToken(data, x0, { withId = false } = {}) {
  const body = bodyOf(data, withId);
  const tag = tagOf(body, x0);
  const all = new Uint8Array(body.length + 4);
  all.set(body);
  for (let k = 0; k < 4; k++) all[body.length + k] = parseInt(tag.slice(2 * k, 2 * k + 2), 16);
  return base64urlEncode(all);
}

// ---------- the shape alone ----------

// shapeRowsToText(cells) writes a shape (a non-empty list of cells [i, j], every row between the lowest and the
// highest one holding a cell) as the fields 6 and 7 of version 1 (origin and rows), padded to whole bytes, in
// base64url without padding and without a tag. Throws "bad_format" for an empty shape or an empty row.
export function shapeRowsToText(cells) {
  const wr = new BitWriter();
  writeShapeRows(wr, cells);
  return base64urlEncode(wr.toBytes());
}

// shapeRowsFromText(text) reads a text of shapeRowsToText back: the cells sorted by (j, i). Only the canonical text
// of a shape is accepted. Throws "bad_alphabet", "not_canonical", "truncated", "out_of_range", "bad_extent" or
// "sanity_cap".
export function shapeRowsFromText(text) {
  if (typeof text !== "string") throw new CodedError("bad_alphabet", "a shape text is a string");
  const bytes = base64urlDecode(text);
  if (base64urlEncode(bytes) !== text) throw new CodedError("not_canonical", "base64url re-encoding differs");
  const rd = new BitReader(bytes);
  const { shape } = readShapeRows(rd);
  rd.finish();
  shape.sort(compareCells);
  if (shapeRowsToText(shape) !== text) throw new CodedError("not_canonical", "the shape is written with another origin");
  return shape;
}

// tokenToWitness(text, id) opens a token through openToken and returns its witness (makeWitness). The witness id is
// `id` when given, else the id stored in the token, else null.
export function tokenToWitness(text, id) {
  const { data, x0, d0 } = openToken(text);
  return makeWitness({ id: id === undefined || id === null ? data.id : id, colour: data.colour, x0, d0, seed: data.seed, shape: data.shape });
}
