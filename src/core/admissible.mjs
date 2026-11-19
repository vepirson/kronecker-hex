// Admissibility of a finite cell set: for every prime p some class of (Z/p)^2 must contain no cell of the set.
// Only primes with p^2 <= |S| can fail, because a smaller p^2 > |S| leaves a class empty.

import { primesUpTo } from "./primes.mjs";
import { compareCells } from "./geometry.mjs";

const mod = (a, p) => ((a % p) + p) % p;

// One record { p, classesHit, missed } per prime p with p^2 <= cells.length. `missed` is the smallest class [a, b]
// (by a, then b) with no cell (i, j), i = a and j = b mod p, or null. When it is null the record also carries
// `singletons`: the cells that are alone in their class, sorted by (j, i).
export function residueTest(cells) {
  const n = cells.length;
  const out = [];
  for (const p of primesUpTo(Math.floor(Math.sqrt(n)) + 1)) {
    if (p * p > n) continue;
    const count = new Uint32Array(p * p);
    for (const [i, j] of cells) count[mod(i, p) * p + mod(j, p)]++;
    let hit = 0;
    let missed = null;
    for (let a = 0; a < p; a++) {
      for (let b = 0; b < p; b++) {
        if (count[a * p + b] > 0) hit++;
        else if (missed === null) missed = [a, b];
      }
    }
    const rec = { p, classesHit: hit, missed };
    if (missed === null) {
      rec.singletons = cells.filter(([i, j]) => count[mod(i, p) * p + mod(j, p)] === 1).map(([i, j]) => [i, j]).sort(compareCells);
    }
    out.push(rec);
  }
  return out;
}

// True when every record of residueTest has a missed class.
export function isAdmissible(cells) {
  return residueTest(cells).every((r) => r.missed !== null);
}
