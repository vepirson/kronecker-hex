// The private primes of a blue construction (step 2 of the blue Construction Lab).
//
// Every cell of S that no class of step 1 holds gets its own prime q > B: the cells in the order (j, i) ascending
// take the consecutive primes above B, the first cell the smallest one. The conditions x0 = -i, d0 = -j mod q make
// q divide both coordinates of its cell. Two cells of the window differ by less than q in each coordinate, so q
// divides both coordinates of no other cell of the window.

import { nextPrime } from "../../core/primes.mjs";
import { cellKey } from "../../core/geometry.mjs";

// assignPrivatePrimes(win, forcedKeys) returns [{ i, j, q, index }] for the cells of win.S whose cellKey is not in
// forcedKeys, in the order (j, i), with q the index-th prime above win.B (index from 0).
export function assignPrivatePrimes(win, forcedKeys) {
  const out = [];
  let q = win.B;
  for (const [i, j] of win.S) {
    if (forcedKeys.has(cellKey(i, j))) continue;
    q = nextPrime(q);
    out.push({ i, j, q, index: out.length });
  }
  return out;
}
