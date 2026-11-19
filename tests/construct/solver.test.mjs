// The row solver against a plain first-hit search over two full sign tables, on random rows: offsets spanning at
// most 64 columns (sliding encoding) and more (one pass per cell), solvable and unsolvable wants, small and larger
// primes.

import { test } from "node:test";
import assert from "node:assert/strict";

import { solveRowIter, signBits, nonResidueTable } from "../../src/construct/row_solver.mjs";
import { kronecker } from "../../src/core/kronecker.mjs";
import { nextPrime } from "../../src/core/primes.mjs";

// A small deterministic generator (xorshift32).
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function naive(q1, q2, offs, wantLo, wantHi) {
  const a = signBits(q1, offs), b = signBits(q2, offs);
  for (let r2 = 0; r2 < q2; r2++) {
    if (b.bad[r2]) continue;
    const nLo = (b.lo[r2] ^ wantLo) >>> 0, nHi = (b.hi[r2] ^ wantHi) >>> 0;
    for (let r1 = 0; r1 < q1; r1++) if (!a.bad[r1] && a.lo[r1] === nLo && a.hi[r1] === nHi) return { r1, r2 };
  }
  return null;
}

function run(it) {
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

test("signBits agrees with the Kronecker symbol", () => {
  for (const q of [17, 101, 257]) {
    const nr = nonResidueTable(q);
    for (let a = 0; a < q; a++) assert.equal(nr[a], kronecker(a, q) === -1 ? 1 : 0);
    const offs = [-5, 0, 3, 40, 70];
    const t = signBits(q, offs);
    for (let r = 0; r < q; r++) {
      let lo = 0, bad = 0;
      offs.forEach((i, k) => {
        const s = kronecker(r + i, q);
        if (s === 0) bad = 1;
        if (s === -1) lo |= 1 << k;
      });
      assert.equal(t.lo[r], lo >>> 0);
      assert.equal(t.hi[r], 0);
      assert.equal(t.bad[r], bad);
    }
  }
});

test("solveRowIter returns the first hit of the plain search (smallest r2, then smallest r1)", () => {
  const rand = rng(12345);
  let solved = 0, unsolved = 0, wide = 0;
  for (let c = 0; c < 160; c++) {
    const k = 1 + Math.floor(rand() * 40);
    const spanCap = c % 4 === 0 ? 200 : 64;
    const set = new Set();
    const base = Math.floor(rand() * 60) - 30;
    while (set.size < k) set.add(base + Math.floor(rand() * Math.max(spanCap, k)));
    const offs = [...set].sort((x, y) => x - y);
    if (offs[offs.length - 1] - offs[0] + 1 > 64) wide++;
    const q1 = nextPrime(16 + Math.floor(rand() * (c % 3 === 0 ? 4000 : 400)));
    const q2 = nextPrime(q1 + Math.floor(rand() * 50));
    let wantLo, wantHi;
    if (c % 2 === 0) {
      // a want that has a solution: the xor of two usable residues
      const a = signBits(q1, offs), b = signBits(q2, offs);
      let r1 = Math.floor(rand() * q1), r2 = Math.floor(rand() * q2);
      while (a.bad[r1]) r1 = (r1 + 1) % q1;
      while (b.bad[r2]) r2 = (r2 + 1) % q2;
      wantLo = (a.lo[r1] ^ b.lo[r2]) >>> 0;
      wantHi = (a.hi[r1] ^ b.hi[r2]) >>> 0;
    } else {
      wantLo = Math.floor(rand() * 4294967296) >>> 0;
      wantHi = k > 32 ? Math.floor(rand() * 2 ** (k - 32)) >>> 0 : 0;
      if (k < 32) wantLo &= (2 ** k - 1);
      wantLo >>>= 0;
    }
    const want = naive(q1, q2, offs, wantLo, wantHi);
    const got = run(solveRowIter({ q1, q2, offs, wantLo, wantHi }));
    if (want === null) {
      assert.equal(got, null, `case ${c}`);
      unsolved++;
    } else {
      assert.ok(got, `case ${c}`);
      assert.deepEqual([got.r1, got.r2], [want.r1, want.r2], `case ${c}: k ${k}, q ${q1} ${q2}`);
      assert.ok(got.tried2 >= 1);
      assert.ok(got.bytes > 0);
      solved++;
    }
  }
  assert.ok(solved >= 60 && unsolved >= 10 && wide >= 20, `solved ${solved}, unsolved ${unsolved}, wide ${wide}`);
});

test("solveRowIter on a mid-size prime: a pair with the wanted signs, the byte count of its tables", () => {
  // 33 sign cells in one block of columns (as in a wide row of a compact shape), q1 just above 2^18
  const offs = [];
  for (let i = -16; i <= 16; i++) offs.push(i);
  const q1 = nextPrime(2 ** 18), q2 = nextPrime(q1);
  const a = signBits(q1, offs), b = signBits(q2, offs);
  const wantLo = (a.lo[1000] ^ b.lo[500]) >>> 0, wantHi = (a.hi[1000] ^ b.hi[500]) >>> 0;
  const got = run(solveRowIter({ q1, q2, offs, wantLo, wantHi }));
  assert.ok(got);
  assert.ok(got.r2 <= 500);
  assert.equal(a.bad[got.r1] | b.bad[got.r2], 0);
  assert.equal((a.lo[got.r1] ^ b.lo[got.r2]) >>> 0, wantLo);
  assert.equal((a.hi[got.r1] ^ b.hi[got.r2]) >>> 0, wantHi);
  assert.deepEqual({ r1: got.r1, r2: got.r2 }, naive(q1, q2, offs, wantLo, wantHi));
  // Legendre marks 1 + keys 8 + unusable marks 1 byte per residue, bucket order 4 per usable residue, bucket
  // starts 4 (2^b + 1) with 2^b <= usable residues < 2^(b + 1)
  const n1 = q1 - offs.length;
  const nb = 2 ** Math.floor(Math.log2(n1));
  assert.equal(got.bytes, 10 * q1 + 4 * n1 + 4 * (nb + 1));
});
