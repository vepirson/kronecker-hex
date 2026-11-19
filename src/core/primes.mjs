// Small primes: a sieve, a trial-division test and the next prime. Numbers only (safe integers).

import { CodedError } from "./bigint_utils.mjs";

const checkSafe = (n, name) => {
  if (!Number.isSafeInteger(n)) throw new CodedError("out_of_range", `${name} must be a safe integer, got ${n}`);
};

// Ascending array of all primes p <= n, by the sieve of Eratosthenes (n a safe integer, at most 2^31).
export function primesUpTo(n) {
  checkSafe(n, "n");
  if (n < 2) return [];
  if (n > 2147483648) throw new CodedError("out_of_range", "primesUpTo is limited to n <= 2^31");
  const sieve = new Uint8Array(n + 1);
  const out = [];
  for (let p = 2; p <= n; p++) {
    if (sieve[p]) continue;
    out.push(p);
    for (let m = p * p; m <= n; m += p) sieve[m] = 1;
  }
  return out;
}

// True when the safe integer n is prime, by trial division (exact for every n < 2^53).
export function isPrimeSmall(n) {
  checkSafe(n, "n");
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let f = 3; f * f <= n; f += 2) {
    if (n % f === 0) return false;
  }
  return true;
}

// The smallest prime strictly greater than the safe integer n.
export function nextPrime(n) {
  checkSafe(n, "n");
  let q = n < 1 ? 1 : n;
  for (;;) {
    q += 1;
    checkSafe(q, "the next prime");
    if (isPrimeSmall(q)) return q;
  }
}
