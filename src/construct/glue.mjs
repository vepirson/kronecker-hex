// Gluing by the Chinese remainder theorem (the congruences on d0 in step 3, and x0 in step 6 of the Construction Lab).
//
// x0 is the smallest positive solution of x0 = X_s mod M_x and, for every row with sign cells, x0 = r1 mod q1,
// x0 = r2 mod q2, x0 = R mod c (R never reduced beforehand, a modulus 1 adds nothing). A solution 0 becomes the
// modulus.

import { bmod, modInv, digitCount, CodedError } from "../core/bigint_utils.mjs";
import { crt } from "../core/crt.mjs";
import { drain } from "./events.mjs";

// runningCrt(pairs) with pairs [r, m] of bigints (m >= 1, pairwise coprime) adds the congruences one at a time and
// returns { steps: [{ x, M }] (the solution 0 <= x < M after each pair), x, M }. Throws "not_coprime".
export function runningCrt(pairs) {
  return drain(runningCrtIter(pairs));
}

// runningCrtIter(pairs) is runningCrt as a generator: it yields { done, total } (pairs added, all pairs) after every
// pair and returns the value of runningCrt.
export function* runningCrtIter(pairs) {
  let x = 0n;
  let M = 1n;
  const steps = [];
  for (const [r, m] of pairs) {
    if (m < 1n) throw new CodedError("bad_modulus", `modulus ${m} is not positive`);
    if (m !== 1n) {
      let inv;
      try {
        inv = modInv(M % m, m);
      } catch (e) {
        if (e && e.code === "not_invertible") throw new CodedError("not_coprime", "two moduli share a factor");
        throw e;
      }
      const t = bmod((bmod(r, m) - x) * inv, m);
      x += M * t;
      M *= m;
    }
    steps.push({ x, M });
    yield { done: steps.length, total: pairs.length };
  }
  return { steps, x, M };
}

// The congruences on x0 in the order of the Lab: [{ kind: "small" | "q1" | "q2" | "c", j, residue, modulus }]
// (bigints), from X_s, M_x and rows [{ j, q1, q2, r1, r2, rho, c }].
export function xConditions(Xs, Mx, rows) {
  const out = [{ kind: "small", j: null, residue: Xs, modulus: Mx }];
  for (const r of rows) {
    out.push({ kind: "q1", j: r.j, residue: BigInt(r.r1), modulus: BigInt(r.q1) });
    out.push({ kind: "q2", j: r.j, residue: BigInt(r.r2), modulus: BigInt(r.q2) });
    out.push({ kind: "c", j: r.j, residue: r.rho, modulus: r.c });
  }
  return out;
}

// glueX(Xs, Mx, rows) returns { x0, M, steps: [{ index, kind, j, modulus, residue, digitsSoFar }] } where
// digitsSoFar is the number of digits of the running solution after the step. The final x0 is computed twice (by
// the running sum and by the product-tree CRT of the core) and the two must agree.
export function glueX(Xs, Mx, rows) {
  return drain(glueXIter(Xs, Mx, rows));
}

// glueXIter(Xs, Mx, rows) is glueX as a generator: it yields the records { done, total } of the running sum
// (runningCrtIter) and returns the value of glueX.
export function* glueXIter(Xs, Mx, rows) {
  const conds = xConditions(Xs, Mx, rows);
  const run = yield* runningCrtIter(conds.map((c) => [c.residue, c.modulus]));
  const tree = crt(conds.map((c) => [c.residue, c.modulus]));
  if (tree.x !== run.x || tree.M !== run.M) throw new Error("glueX: the two CRT computations differ");
  const steps = conds.map((c, k) => ({
    index: k, kind: c.kind, j: c.j, modulus: c.modulus, residue: c.residue, digitsSoFar: digitCount(run.steps[k].x),
  }));
  return { x0: tree.x === 0n ? tree.M : tree.x, M: tree.M, steps };
}
