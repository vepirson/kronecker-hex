// Tests of the arithmetic core: bigint helpers, Kronecker and Jacobi symbols, row evaluator, primes, CRT, SHA-256.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

import { bmod, ctz, absBig, gcdBig, modInv, parseBigIntStrict, digitCount, CodedError } from "../../src/core/bigint_utils.mjs";
import { jacobiNumber, jacobiBinary, jacobiLehmer, jacobiBig, kronecker, rowReducer } from "../../src/core/kronecker.mjs";
import { primesUpTo, isPrimeSmall, nextPrime } from "../../src/core/primes.mjs";
import { crt, smoothSplit } from "../../src/core/crt.mjs";
import { sha256Bytes, sha256Hex, bytesToHex } from "../../src/core/sha256.mjs";

const vectors = JSON.parse(fs.readFileSync(new URL("../fixtures/core_vectors.json", import.meta.url), "ascii"));

// Deterministic generator (xorshift32), the same one that produced the stored vectors.
function makeRng(state) {
  let rs = state >>> 0;
  const rnd = () => {
    rs ^= rs << 13; rs >>>= 0;
    rs ^= rs >>> 17;
    rs ^= rs << 5; rs >>>= 0;
    return rs / 4294967296;
  };
  const rint = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const randBig = (digits) => {
    let s = String(rint(1, 9));
    for (let k = 1; k < digits; k++) s += String(rint(0, 9));
    return BigInt(s);
  };
  const sgn = (b) => (rnd() < 0.5 ? -b : b);
  return { rnd, rint, randBig, sgn };
}

const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof CodedError && e.code === code);

test("bigint helpers", () => {
  assert.equal(bmod(-7n, 5n), 3n);
  assert.equal(bmod(7n, 5n), 2n);
  assert.equal(bmod(0n, 5n), 0n);
  assert.equal(ctz(1n), 0);
  assert.equal(ctz(12n), 2);
  assert.equal(ctz(-12n), 2);
  assert.equal(ctz(1n << 100n), 100);
  assert.equal(ctz(3n << 64n), 64);
  throwsCode(() => ctz(0n), "zero");
  assert.equal(absBig(-5n), 5n);
  assert.equal(absBig(5n), 5n);
  assert.equal(gcdBig(12n, -18n), 6n);
  assert.equal(gcdBig(0n, 0n), 0n);
  assert.equal(gcdBig(0n, -7n), 7n);
  assert.equal(parseBigIntStrict(" -123 "), -123n);
  assert.equal(parseBigIntStrict("12a"), null);
  assert.equal(parseBigIntStrict("+5"), null);
  assert.equal(parseBigIntStrict(""), null);
  assert.equal(parseBigIntStrict(5), null);
  assert.equal(digitCount(0n), 1);
  assert.equal(digitCount(-1000n), 4);
  assert.equal(digitCount(10n ** 500n), 501);
});

test("modInv identities", () => {
  const { randBig, rint } = makeRng(7);
  let n = 0;
  for (let t = 0; t < 300; t++) {
    const m = randBig(rint(1, 120)) + 2n;
    const a = randBig(rint(1, 130));
    if (gcdBig(a, m) !== 1n) {
      throwsCode(() => modInv(a, m), "not_invertible");
      continue;
    }
    const v = modInv(a, m);
    assert.ok(v >= 0n && v < m);
    assert.equal(bmod(a * v, m), 1n);
    n++;
  }
  assert.ok(n > 100);
  assert.equal(modInv(5n, 1n), 0n);
  assert.equal(modInv(-3n, 7n), 2n);
  throwsCode(() => modInv(6n, 9n), "not_invertible");
  throwsCode(() => modInv(1n, 0n), "bad_modulus");
});

test("kronecker against the reference table, and the row evaluator with the stored shifts", () => {
  const { triples } = vectors.kronecker;
  assert.equal(triples.length, 4111);
  let bad = 0, badRow = 0;
  for (const [, as, ns, k, sh] of triples) {
    const a = BigInt(as), n = BigInt(ns);
    if (kronecker(a, n) !== k) bad++;
    if (rowReducer(a - BigInt(sh), n).symbol(sh) !== k) badRow++;
  }
  assert.equal(bad, 0);
  assert.equal(badRow, 0);
});

test("row evaluator against kronecker and the stored symbols (74 rows x 17 x0 x 81 offsets)", () => {
  const { imin, imax, rows, x0, symbols } = vectors.rowReducer;
  const ch = { "-1": "-", "0": "0", "1": "+" };
  let checks = 0, bad = 0;
  rows.forEach((ds, r) => {
    const d = BigInt(ds);
    x0.forEach((xs, k) => {
      const x = BigInt(xs);
      const rr = rowReducer(x, d);
      const want = symbols[r][k];
      for (let i = imin; i <= imax; i++) {
        checks++;
        const a = rr.symbol(i);
        if (ch[String(a)] !== want[i - imin]) bad++;
        if (a !== kronecker(x + BigInt(i), d)) bad++;
      }
    });
  });
  assert.equal(checks, 101898);
  assert.equal(bad, 0);
});

test("kronecker against the row evaluator on random rows", () => {
  const { rint, randBig, sgn } = makeRng(20261117);
  let bad = 0;
  for (let t = 0; t < 60; t++) {
    const d = t % 3 === 0 ? sgn(randBig(rint(1, 15)) << BigInt(rint(0, 9))) : sgn(randBig(rint(1, 60)));
    const x = sgn(randBig(rint(1, 80)));
    const rr = rowReducer(x, d);
    for (let i = -25; i <= 25; i++) if (rr.symbol(i) !== kronecker(x + BigInt(i), d)) bad++;
  }
  assert.equal(bad, 0);
});

test("small cases of the definition", () => {
  assert.equal(kronecker(1n, 0n), 1);
  assert.equal(kronecker(-1n, 0n), 1);
  assert.equal(kronecker(2n, 0n), 0);
  assert.equal(kronecker(-5n, -1n), -1);
  assert.equal(kronecker(5n, -1n), 1);
  assert.equal(kronecker(3n, 2n), -1);
  assert.equal(kronecker(7n, 2n), 1);
  assert.equal(kronecker(4n, 2n), 0);
  assert.equal(kronecker(2, 7), 1);
  assert.equal(kronecker(6n, 9n), 0);
  // a zero symbol is always +0, never -0 (so Object.is and strict comparisons are safe)
  assert.ok(Object.is(kronecker(-6n, -9n), 0));
  assert.ok(Object.is(rowReducer(-6n, -9n).symbol(0), 0));
  assert.ok(Object.is(rowReducer(-6n - (1n << 80n) * 9n, -9n * ((1n << 61n) - 1n)).symbol(0), 0));
  assert.equal(jacobiNumber(2, 7), 1);
  assert.equal(jacobiNumber(3, 7), -1);
});

test("Lehmer and binary Jacobi agree on the regenerated pairs (2278)", () => {
  const L = vectors.lehmer;
  const { rint, randBig } = makeRng(L.state);
  const pairs = [];
  const oddPos = (b) => { b = b < 0n ? -b : b; return b | 1n; };
  for (let t = 0; t < 1500; t++) {
    const n = oddPos(randBig(rint(17, 1200)));
    const a = randBig(rint(1, 1200)) % n;
    pairs.push(["random", a, n]);
  }
  let f0 = 1n, f1 = 1n;
  for (let t = 0; t < 3000; t++) {
    [f0, f1] = [f1, f0 + f1];
    if (t > 80 && t % 7 === 0 && (f1 & 1n) === 1n) pairs.push(["fibonacci", f0, f1]);
  }
  for (let t = 0; t < 300; t++) {
    const n = oddPos(randBig(rint(20, 2000)));
    const s = rint(0, 7);
    const a = s === 0 ? n - 1n : s === 1 ? 2n : s === 2 ? (1n << BigInt(rint(1, 300))) % n : s === 3 ? randBig(rint(1, 15))
      : s === 4 ? (n / 3n) | 1n : s === 5 ? 0n : s === 6 ? (n - randBig(rint(1, 15))) : (n * 3n + 7n) % n;
    pairs.push(["structured", a, n]);
  }
  for (let t = 0; t < 200; t++) {
    const p = oddPos(randBig(rint(10, 300)));
    const n = p * oddPos(randBig(rint(10, 600)));
    pairs.push(["shared factor", (p * randBig(rint(1, 500))) % n, n]);
  }
  assert.equal(pairs.length, L.pairs);
  const h = crypto.createHash("sha256");
  for (const [c, a, n] of pairs) h.update(`${c}|${a}|${n}\n`);
  assert.equal(h.digest("hex"), L.sha256);
  let bad = 0, sum = 0;
  for (const [, a, n] of pairs) {
    const b = jacobiBinary(a, n);
    if (jacobiLehmer(a, n) !== b) bad++;
    if (jacobiBig(a, n) !== b) bad++;
    sum += b + 2;
  }
  assert.equal(bad, 0);
  assert.equal(sum, L.symbolSumPlus2);
});

test("primes", () => {
  assert.deepEqual(primesUpTo(30), [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
  assert.deepEqual(primesUpTo(1), []);
  assert.equal(primesUpTo(100000).length, 9592);
  const set = new Set(primesUpTo(20000));
  for (let n = -3; n <= 20000; n++) assert.equal(isPrimeSmall(n), set.has(n), `n = ${n}`);
  assert.equal(isPrimeSmall(2147483647), true);
  assert.equal(isPrimeSmall(4294967297), false);
  assert.equal(nextPrime(1), 2);
  assert.equal(nextPrime(2), 3);
  assert.equal(nextPrime(13), 17);
  assert.equal(nextPrime(-10), 2);
  assert.equal(nextPrime(1 << 30), 1073741827);
  throwsCode(() => isPrimeSmall(2 ** 53), "out_of_range");
});

// Reference CRT for the test: one modulus at a time.
function crtSequential(pairs) {
  let x = 0n, M = 1n;
  for (const [r, m] of pairs) {
    if (m === 1n) continue;
    const t = bmod((bmod(r, m) - x) * modInv(M % m, m), m);
    x += M * t;
    M *= m;
  }
  return { x: bmod(x, M), M };
}

test("crt identities", () => {
  const { rint, randBig, sgn } = makeRng(99);
  for (let t = 0; t < 120; t++) {
    const k = rint(1, 40);
    const pairs = [];
    const ms = [];
    for (let s = 0; s < k; s++) {
      let m = randBig(rint(1, t % 4 === 0 ? 200 : 12)) + 1n;
      while (ms.some((o) => gcdBig(o, m) !== 1n)) m += 1n;
      ms.push(m);
      pairs.push([sgn(randBig(rint(1, 30))), m]);
    }
    const { x, M } = crt(pairs);
    assert.equal(M, ms.reduce((a, b) => a * b, 1n));
    assert.ok(x >= 0n && x < M);
    for (const [r, m] of pairs) assert.equal(bmod(x, m), bmod(r, m));
    assert.deepEqual({ x, M }, crtSequential(pairs));
  }
  assert.deepEqual(crt([]), { x: 0n, M: 1n });
  assert.deepEqual(crt([[5n, 1n]]), { x: 0n, M: 1n });
  assert.deepEqual(crt([[-1n, 7n]]), { x: 6n, M: 7n });
  assert.deepEqual(crt([[2n, 3n], [3n, 5n], [4n, 1n], [2n, 7n]]), { x: 23n, M: 105n });
  throwsCode(() => crt([[1n, 6n], [2n, 9n]]), "not_coprime");
  throwsCode(() => crt([[1n, 5n], [2n, 7n], [3n, 35n]]), "not_coprime");
  throwsCode(() => crt([[1n, 0n]]), "bad_modulus");
});

test("smoothSplit", () => {
  assert.deepEqual(smoothSplit(360n * 77n, [2, 3, 5]), { u: 360n, m: 77n });
  assert.deepEqual(smoothSplit(1n, [2, 3]), { u: 1n, m: 1n });
  assert.deepEqual(smoothSplit(2n ** 70n * 13n, [2, 3]), { u: 2n ** 70n, m: 13n });
  throwsCode(() => smoothSplit(0n, [2]), "not_positive");
  throwsCode(() => smoothSplit(-6n, [2]), "not_positive");
});

test("sha256 against known digests and node:crypto", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  assert.equal(sha256Hex("a".repeat(1000000)), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
  const { rint } = makeRng(5);
  for (let len = 0; len < 300; len++) {
    const b = new Uint8Array(len);
    for (let k = 0; k < len; k++) b[k] = rint(0, 255);
    const d = sha256Bytes(b);
    assert.equal(d.length, 32);
    assert.equal(bytesToHex(d), crypto.createHash("sha256").update(b).digest("hex"));
  }
});
