// d0 and x0 of a blue construction (steps 3 and 4 of the blue Construction Lab).
//
// Step 3. (D, M_d) = the CRT of every condition on d0 (the classes, then the private primes), 0 <= D < M_d, and
// d0 = D + t0 M_d with t0 the smallest t >= 0 such that d0 + j_min >= 1. No test and no search: every candidate
// would do.
// Step 4. (X, M_x) = the CRT of every condition on x0, x0 = X + t M_x from the smallest t >= 0 with x0 + i_min >= 1,
// and the first candidate with gcd(x0 + i, d0 + j) = 1 on every cell of N(S) is accepted. The small and private
// primes never divide both coordinates of a cell of N(S). A prime r that divides some d0 + j and not M_x is above
// B, so it divides d0 + j for one row only and bars at most w < r residues of t mod r: some t always passes.

import { bmod, gcdBig, digitCount } from "../../core/bigint_utils.mjs";
import { firstCandidateIndex } from "../cofactor.mjs";
import { runningCrt } from "../glue.mjs";

// blueConditions(classes, privates) returns { x, d }: the congruences on x0 and on d0 as lists of
// { kind: "class" | "private", residue, modulus } (bigints), the classes first (ascending p), then the private
// primes in their order.
export function blueConditions(classes, privates) {
  const x = [], d = [];
  for (const c of classes) {
    x.push({ kind: "class", residue: BigInt(c.xRes), modulus: BigInt(c.p) });
    d.push({ kind: "class", residue: BigInt(c.dRes), modulus: BigInt(c.p) });
  }
  for (const { i, j, q } of privates) {
    const m = BigInt(q);
    x.push({ kind: "private", residue: bmod(BigInt(-i), m), modulus: m });
    d.push({ kind: "private", residue: bmod(BigInt(-j), m), modulus: m });
  }
  return { x, d };
}

// crtBase(conds, low) returns { steps: [{ x, M }] (the running solution after each condition), base, M, index,
// value }: (base, M) the CRT of the conditions, index the smallest t >= 0 with base + t M + low >= 1 and value =
// base + index M. Throws the codes of runningCrt.
export function crtBase(conds, low) {
  const run = runningCrt(conds.map((c) => [c.residue, c.modulus]));
  const index = firstCandidateIndex(run.x, run.M, low);
  return { steps: run.steps, base: run.x, M: run.M, index, value: run.x + index * run.M };
}

// The cells of N grouped by row: [{ n: d0 + j (bigint), j, is: [i ascending] }] in ascending j.
function neighbourRows(N, d0) {
  const rows = [];
  for (const [i, j] of N) {
    const last = rows[rows.length - 1];
    if (last && last.j === j) last.is.push(i);
    else rows.push({ j, n: d0 + BigInt(j), is: [i] });
  }
  return rows;
}

// The first cell [i, j] of N (order (j, i)) with gcd(x0 + i, d0 + j) != 1, or null. One gcd per row: the product of
// the x0 + i of a row is prime to d0 + j exactly when each factor is, and only a failing row is looked at cell by
// cell.
function firstSharedFactor(rows, x0) {
  for (const { j, n, is } of rows) {
    const r = bmod(x0, n);
    let prod = 1n;
    for (const i of is) prod = (prod * bmod(r + BigInt(i), n)) % n;
    if (gcdBig(prod, n) === 1n) continue;
    for (const i of is) if (gcdBig(bmod(r + BigInt(i), n), n) !== 1n) return [i, j];
  }
  return null;
}

// scanX0Iter({ X, Mx, start, d0, N, maxX0 }) is a generator over the candidates x0 = X + t Mx, t = start, start + 1,
// ... (bigints): it yields one record { index, ok, bad, x0, digits } per candidate (bad = the first cell [i, j] of N
// with gcd(x0 + i, d0 + j) != 1, or null) and returns { index, x0 } of the first accepted candidate, or null after
// maxX0 rejected candidates.
export function* scanX0Iter({ X, Mx, start, d0, N, maxX0 }) {
  const rows = neighbourRows(N, d0);
  for (let k = 0; k < maxX0; k++) {
    const index = start + BigInt(k);
    const x0 = X + index * Mx;
    const bad = firstSharedFactor(rows, x0);
    yield { index, ok: bad === null, bad, x0, digits: digitCount(x0) };
    if (bad === null) return { index, x0 };
  }
  return null;
}
