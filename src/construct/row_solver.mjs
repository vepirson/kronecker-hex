// The row solve of the construction (step 5 of the Construction Lab): residues r1 mod q1 and r2 mod q2 such that
// (r1 + i | q1)(r2 + i | q2) has a prescribed sign on every sign cell i of the row.
//
// Sign table of a prime q: for a residue r, bit t set iff ((r + i_t) | q) = -1. A residue with a zero on some sign
// cell (r = -i_t mod q) is unusable. Wanted: the SMALLEST usable r2 such that bits2(r2) xor want = bits1(r1) for
// some usable r1, and then the SMALLEST such r1.
//
// Method. The table of q1 is built for every residue, the table of q2 only for the residues the scan reaches (it
// usually stops after 10^4 to 10^5 of them). Inside the solver the bit vector of a residue is stored in a second,
// equivalent encoding: bit (i_t - i_min) instead of bit t, which for a row spanning at most 64 columns lets one pass
// slide a window over the Legendre symbols instead of one pass per cell. The map between the two encodings is an
// injective linear map on bit vectors, so it keeps every equality "bits2 xor want = bits1", and the first-hit rule
// above gives the same pair. The keys of q1 are put into buckets by a hash, in ascending r1 inside each bucket, so
// the first equal key of a bucket is the smallest r1. All arithmetic is on Numbers below 2^53.
//
// Memory for q1 (bytes per residue): Legendre marks 1, unusable marks 1, keys 4 + 4, bucket order 4, bucket starts
// at most 4: about 18. At the cap of 40 sign cells q1 is just above 2^23, so about 150 MB while one row is solved.

import { CodedError } from "../core/bigint_utils.mjs";
import { jacobiNumber } from "../core/kronecker.mjs";

const mod = (a, m) => ((a % m) + m) % m;
const now = () => globalThis.performance.now();
const CHUNK = 1 << 18; // residues between two looks at the clock
const PROGRESS_MS = 100; // at most 10 progress records per second

// Marks of the non-residues of the odd prime q: a Uint8Array with 1 at every quadratic non-residue, 0 at 0 and at
// the residues.
export function nonResidueTable(q) {
  const t = new Uint8Array(q).fill(1);
  t[0] = 0;
  const half = (q - 1) / 2;
  let sq = 0;
  for (let a = 1; a <= half; a++) {
    sq += 2 * a - 1; // a^2 = (a - 1)^2 + 2a - 1
    if (sq >= q) sq -= q;
    t[sq] = 0;
  }
  return t;
}

// signBits(q, offs) returns the full sign table of the prime q for the offsets offs (at most 64): { lo, hi, bad }
// with lo[r], hi[r] (Uint32Array) the bits 0-31 and 32-63 of the vector of residue r (bit t set iff
// ((r + offs[t]) | q) = -1) and bad[r] = 1 (Uint8Array) when r + offs[t] = 0 mod q for some t.
export function signBits(q, offs) {
  checkArgs(q, offs);
  const nr = nonResidueTable(q);
  const lo = new Uint32Array(q), hi = new Uint32Array(q), bad = new Uint8Array(q);
  for (let t = 0; t < offs.length; t++) {
    const arr = t < 32 ? lo : hi;
    const bit = (1 << (t & 31)) >>> 0;
    let idx = mod(offs[t], q);
    bad[mod(-offs[t], q)] = 1;
    for (let r = 0; r < q; r++) {
      if (nr[idx]) arr[r] |= bit;
      if (++idx === q) idx = 0;
    }
  }
  return { lo, hi, bad };
}

function checkArgs(q, offs) {
  if (!Number.isSafeInteger(q) || q < 3 || q % 2 === 0) throw new CodedError("bad_modulus", `row prime ${q} is not an odd number >= 3`);
  if (!Array.isArray(offs) || offs.length === 0 || offs.length > 64 || !offs.every(Number.isSafeInteger)) {
    throw new CodedError("bad_format", "the offsets must be 1 to 64 integers");
  }
  if (new Set(offs).size !== offs.length) throw new CodedError("bad_format", "the offsets must be distinct");
}

// The bit positions of the solver's encoding: compressed (bit t) or sliding (bit offs[t] - min).
function layout(offs) {
  const min = Math.min(...offs);
  const span = Math.max(...offs) - min + 1;
  const sliding = span <= 64;
  const pos = offs.map((i, t) => (sliding ? i - min : t));
  let maskLo = 0, maskHi = 0;
  for (const s of pos) {
    if (s < 32) maskLo |= 1 << s;
    else maskHi |= 1 << (s - 32);
  }
  return { min, span, sliding, pos, maskLo: maskLo >>> 0, maskHi: maskHi >>> 0 };
}

// Re-encode a vector given in bits t (lo, hi) into the positions pos[t].
function encode(lo, hi, pos) {
  let a = 0, b = 0;
  for (let t = 0; t < pos.length; t++) {
    const on = t < 32 ? (lo >>> t) & 1 : (hi >>> (t - 32)) & 1;
    if (!on) continue;
    if (pos[t] < 32) a |= 1 << pos[t];
    else b |= 1 << (pos[t] - 32);
  }
  return [a >>> 0, b >>> 0];
}

// Sliding window state over the Legendre symbols of q: bit s of (wLo, wHi) = non-residue mark of r + min + s.
function windowAt(r, q, L, legendreAt) {
  let wLo = 0, wHi = 0;
  for (let s = 0; s < L.span; s++) {
    if (legendreAt(mod(r + L.min + s, q)) === -1) {
      if (s < 32) wLo |= 1 << s;
      else wHi |= 1 << (s - 32);
    }
  }
  return [wLo, wHi];
}

// Table of q1, residues [r0, r1), sliding encoding. state = { wLo, wHi, idx } with idx = (r + min + span) mod q
// for the current r. Writes lo[r], hi[r].
function slideChunk(r0, r1, q, nr, lo, hi, L, st) {
  let { wLo, wHi, idx } = st;
  const top = L.span - 1;
  const mLo = L.maskLo, mHi = L.maskHi;
  const topLo = top < 32, topBit = top < 32 ? 1 << top : 1 << (top - 32);
  for (let r = r0; r < r1; r++) {
    lo[r] = wLo & mLo;
    hi[r] = wHi & mHi;
    wLo = (wLo >>> 1) | ((wHi & 1) << 31);
    wHi = wHi >>> 1;
    if (nr[idx]) {
      if (topLo) wLo |= topBit;
      else wHi |= topBit;
    }
    if (++idx === q) idx = 0;
  }
  st.wLo = wLo;
  st.wHi = wHi;
  st.idx = idx;
}

// Table of q1, residues [r0, r1), compressed encoding (one pass per cell).
function compressedChunk(r0, r1, q, nr, lo, hi, offs) {
  for (let t = 0; t < offs.length; t++) {
    const arr = t < 32 ? lo : hi;
    const bit = 1 << (t & 31);
    let idx = mod(r0 + offs[t], q);
    for (let r = r0; r < r1; r++) {
      if (nr[idx]) arr[r] |= bit;
      if (++idx === q) idx = 0;
    }
  }
}

const hashOf = (l, h, shift) => Math.imul((l ^ Math.imul(h, 0x85ebca6b)) | 0, 0x9e3779b1) >>> shift;

function countChunk(r0, r1, lo, hi, bad, cnt, shift) {
  for (let r = r0; r < r1; r++) if (!bad[r]) cnt[hashOf(lo[r], hi[r], shift)]++;
}

function placeChunk(r1, r0, lo, hi, bad, cnt, ord, shift) {
  // residues from r1 - 1 down to r0: each lands just before the previous one of its bucket, so every bucket ends up
  // in ascending order of r
  for (let r = r1 - 1; r >= r0; r--) if (!bad[r]) ord[--cnt[hashOf(lo[r], hi[r], shift)]] = r;
}

// solveRowIter({ q1, q2, offs, wantLo, wantHi }) is a generator: it yields progress records { phase, done, total }
// (phase "table1", "sort" or "scan", at most 10 per second) and returns { r1, r2, tried2, bytes } (tried2 = usable
// residues of q2 examined, bytes = size of the typed arrays allocated) or null when no pair exists. The want vector
// is given in bits t: wantLo = bits 0-31, wantHi = bits 32-63.
export function* solveRowIter({ q1, q2, offs, wantLo, wantHi }) {
  checkArgs(q1, offs);
  checkArgs(q2, offs);
  const L = layout(offs);
  const [wLo, wHi] = L.sliding ? encode(wantLo >>> 0, wantHi >>> 0, L.pos) : [wantLo >>> 0, wantHi >>> 0];
  let last = now();
  const tick = () => {
    const t = now();
    if (t - last < PROGRESS_MS) return false;
    last = t;
    return true;
  };

  // table of q1
  let nr = nonResidueTable(q1);
  const lo = new Uint32Array(q1), hi = new Uint32Array(q1), bad = new Uint8Array(q1);
  let bytes = nr.byteLength + lo.byteLength + hi.byteLength + bad.byteLength;
  for (const i of offs) bad[mod(-i, q1)] = 1;
  const st = { wLo: 0, wHi: 0, idx: 0 };
  if (L.sliding) {
    const nrRef = nr;
    [st.wLo, st.wHi] = windowAt(0, q1, L, (a) => (nrRef[a] ? -1 : 1));
    st.idx = mod(L.min + L.span, q1);
  }
  for (let r0 = 0; r0 < q1; r0 += CHUNK) {
    const r1 = Math.min(q1, r0 + CHUNK);
    if (L.sliding) slideChunk(r0, r1, q1, nr, lo, hi, L, st);
    else compressedChunk(r0, r1, q1, nr, lo, hi, offs);
    if (r1 < q1 && tick()) yield { phase: "table1", done: r1, total: q1 };
  }
  nr = null;

  // buckets of the usable residues of q1
  let n1 = 0;
  for (let r = 0; r < q1; r++) if (!bad[r]) n1++;
  if (n1 === 0) return null;
  let b = 1;
  while (b < 30 && 2 ** (b + 1) <= n1) b++;
  const nb = 2 ** b;
  const shift = 32 - b;
  const cnt = new Uint32Array(nb + 1);
  const ord = new Uint32Array(n1);
  bytes += cnt.byteLength + ord.byteLength;
  for (let r0 = 0; r0 < q1; r0 += CHUNK) {
    const r1 = Math.min(q1, r0 + CHUNK);
    countChunk(r0, r1, lo, hi, bad, cnt, shift);
    if (tick()) yield { phase: "sort", done: Math.floor(r1 / 2), total: q1 };
  }
  for (let h = 1; h < nb; h++) cnt[h] += cnt[h - 1]; // cnt[h] = end of bucket h
  cnt[nb] = n1;
  for (let r1 = q1; r1 > 0; r1 -= CHUNK) {
    const r0 = Math.max(0, r1 - CHUNK);
    placeChunk(r1, r0, lo, hi, bad, cnt, ord, shift); // afterwards cnt[h] = start of bucket h
    if (r0 > 0 && tick()) yield { phase: "sort", done: Math.floor((2 * q1 - r0) / 2), total: q1 };
  }

  // scan of q2, its sign vectors computed on the way
  const bad2 = new Set(offs.map((i) => mod(-i, q2)));
  let tried2 = 0;
  let sLo = 0, sHi = 0, idx2 = 0;
  const top = L.span - 1;
  if (L.sliding) {
    [sLo, sHi] = windowAt(0, q2, L, (a) => jacobiNumber(a, q2));
    idx2 = mod(L.min + L.span, q2);
  }
  for (let r2 = 0; r2 < q2; r2++) {
    if (!bad2.has(r2)) {
      tried2++;
      let kLo, kHi;
      if (L.sliding) {
        kLo = sLo & L.maskLo;
        kHi = sHi & L.maskHi;
      } else {
        kLo = 0;
        kHi = 0;
        for (let t = 0; t < offs.length; t++) {
          if (jacobiNumber(mod(r2 + offs[t], q2), q2) === -1) {
            if (t < 32) kLo |= 1 << t;
            else kHi |= 1 << (t - 32);
          }
        }
      }
      const needLo = (kLo ^ wLo) >>> 0, needHi = (kHi ^ wHi) >>> 0;
      const h = hashOf(needLo, needHi, shift);
      const end = cnt[h + 1];
      for (let p = cnt[h]; p < end; p++) {
        const r1 = ord[p];
        if (lo[r1] === needLo && hi[r1] === needHi) return { r1, r2, tried2, bytes };
      }
    }
    if (L.sliding) {
      sLo = (sLo >>> 1) | ((sHi & 1) << 31);
      sHi = sHi >>> 1;
      if (jacobiNumber(idx2, q2) === -1) {
        if (top < 32) sLo |= 1 << top;
        else sHi |= 1 << (top - 32);
      }
      if (++idx2 === q2) idx2 = 0;
    }
    if ((r2 & 4095) === 4095 && tick()) yield { phase: "scan", done: r2 + 1, total: q2 };
  }
  return null;
}
