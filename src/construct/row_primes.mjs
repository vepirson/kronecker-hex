// The row primes of the construction (step 3 of the Construction Lab) and the congruences on d0.
//
// Every row j with k > 0 sign cells, in ascending order, gets the two smallest primes q1 < q2 that are >= L and not
// used by an earlier row, with L = max(2^(floor((k + 1) / 2) + 3), B + 1). Then d0 = -j mod q1 q2. Together with
// d0 = -b mod p of the small primes of kind "class" these congruences give (D, M_d) by the CRT.

import { isPrimeSmall, nextPrime } from "../core/primes.mjs";

// The lower bound L of the row primes of a row with k sign cells: max(2^(floor((k + 1) / 2) + 3), B + 1).
export function rowPrimeBound(k, B) {
  return Math.max(2 ** (Math.floor((k + 1) / 2) + 3), B + 1);
}

// chooseRowPrimes(rows, B) for the rows [{ j, cells }] with k > 0 (ascending j) returns [{ j, k, L, q1, q2 }].
export function chooseRowPrimes(rows, B) {
  const used = new Set();
  return rows.map(({ j, cells }) => {
    const k = cells.length;
    const L = rowPrimeBound(k, B);
    const qs = [];
    let q = L - 1;
    while (qs.length < 2) {
      q = nextPrime(q);
      if (!used.has(q)) {
        used.add(q);
        qs.push(q);
      }
    }
    return { j, k, L, q1: qs[0], q2: qs[1] };
  });
}

// checkStoredRowPrimes(stored, B) checks the row primes of a replay: every one a prime above B, all distinct,
// q1 < q2 not required. Returns null when they pass, else a message.
export function checkStoredRowPrimes(stored, B) {
  const seen = new Set();
  for (const { j, q1, q2 } of stored) {
    for (const q of [q1, q2]) {
      if (!Number.isSafeInteger(q) || q <= B || !isPrimeSmall(q)) return `row ${j}: ${q} is not a prime above B = ${B}`;
      if (seen.has(q)) return `row ${j}: the row prime ${q} is used twice`;
      seen.add(q);
    }
  }
  return null;
}

// The congruences on d0 as [residue, modulus] pairs of bigints: the small primes of kind "class" (ascending p),
// then every row (ascending j). Each pair carries its origin { kind: "small" | "row", p or j }.
export function dConditions(smallPrimes, rowPrimes) {
  const out = [];
  for (const sp of smallPrimes) {
    if (sp.dRes === null) continue;
    out.push({ kind: "small", p: sp.p, j: null, residue: BigInt(sp.dRes), modulus: BigInt(sp.p) });
  }
  for (const r of rowPrimes) {
    const m = BigInt(r.q1) * BigInt(r.q2);
    out.push({ kind: "row", p: null, j: r.j, residue: ((BigInt(-r.j) % m) + m) % m, modulus: m });
  }
  return out;
}
