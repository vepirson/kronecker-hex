// Candidates for d0, the cofactor of a row and the target sign vector of a row (steps 4 and 5 of the Lab).
//
// d0 = D + t M_d from the smallest t >= 0 with d0 + j_min >= 1. For one candidate and one row j:
//   square test: the candidate is rejected when q1^2 or q2^2 divides d0 + j,
//   cofactor: d0 + j = u q1 q2 c with u the part made of the primes <= B,
//   signs: sigma_i = tau_i K(X_s + i, u), and for a residue R (a bigint >= 0, never reduced mod c) that is VALID,
//   i.e. gcd(R + i, c) = 1 on every sign cell, the want-bit t is set iff sigma_t J(R + i_t, c) = -1.

import { gcdBig } from "../core/bigint_utils.mjs";
import { kronecker } from "../core/kronecker.mjs";
import { smoothSplit } from "../core/crt.mjs";

// The smallest t >= 0 (bigint) with D + t Md + jmin >= 1.
export function firstCandidateIndex(D, Md, jmin) {
  const need = 1n - BigInt(jmin) - D; // t Md >= need
  if (need <= 0n) return 0n;
  return (need + Md - 1n) / Md;
}

// True when q1^2 or q2^2 divides n (the candidate is then rejected).
export function failsSquareTest(n, q1, q2) {
  const a = BigInt(q1), b = BigInt(q2);
  return n % (a * a) === 0n || n % (b * b) === 0n;
}

// cofactorOf(n, primes, q1, q2) returns { u, c } with n = u q1 q2 c, u made of the given primes, or null when q1 q2
// does not divide the rest of n.
export function cofactorOf(n, primes, q1, q2) {
  const { u, m } = smoothSplit(n, primes);
  const q = BigInt(q1) * BigInt(q2);
  if (m % q !== 0n) return null;
  return { u, c: m / q };
}

// The small-prime signs K(X_s + i, u) of the sign cells (Numbers -1, 0, 1).
export function smallSigns(Xs, u, cells) {
  return cells.map(({ i }) => kronecker(Xs + BigInt(i), u));
}

// True when gcd(R + i, c) = 1 for every offset i.
export function isValidR(R, offs, c) {
  if (c === 1n) return true;
  for (const i of offs) if (gcdBig(R + BigInt(i), c) !== 1n) return false;
  return true;
}

// The first valid R among start, start + 1, ..., start + limit - 1 (bigints), or null.
export function nextValidR(start, offs, c, limit = 1000) {
  for (let k = 0; k < limit; k++) {
    const R = start + BigInt(k);
    if (isValidR(R, offs, c)) return R;
  }
  return null;
}

// rowTarget(cells, small, R, c) returns { cells: [{ i, tau, small, cof, want }], wantLo, wantHi, wantBits } with
// cof = J(R + i, c), want = tau small cof, want-bit t set iff want_t = -1, wantLo / wantHi the bits 0-31 / 32-63
// and wantBits the decimal string of the whole bit vector.
export function rowTarget(cells, small, R, c) {
  let lo = 0, hi = 0;
  let bits = 0n;
  const out = cells.map(({ i, tau }, t) => {
    const cof = kronecker(R + BigInt(i), c);
    const want = tau * small[t] * cof || 0;
    if (want === -1) {
      if (t < 32) lo |= 1 << t;
      else hi |= 1 << (t - 32);
      bits |= 1n << BigInt(t);
    }
    return { i, tau, small: small[t], cof, want };
  });
  return { cells: out, wantLo: lo >>> 0, wantHi: hi >>> 0, wantBits: bits.toString() };
}
