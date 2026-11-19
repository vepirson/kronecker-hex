// Small exact helpers on bigint values, and the error class used by every module of the site.
//
// Every function here is exact: no floating point is involved. Functions that cannot return a correct value throw a
// CodedError whose `code` names the reason.

// Error with a machine-readable `code` string (for example "not_invertible"), thrown by every module of the site.
export class CodedError extends Error {
  constructor(code, message) {
    super(message === undefined ? code : `${code}: ${message}`);
    this.name = "CodedError";
    this.code = code;
  }
}

const INT_RE = /^-?[0-9]+$/;

// Nonnegative remainder of the bigint a modulo the bigint m > 0.
export function bmod(a, m) {
  const r = a % m;
  return r < 0n ? r + m : r;
}

// Number of trailing zero bits of a nonzero bigint a (throws "zero" for 0n).
export function ctz(a) {
  if (a === 0n) throw new CodedError("zero", "ctz of 0");
  let z = 0;
  while ((a & 0xFFFFFFFFn) === 0n) {
    a >>= 32n;
    z += 32;
  }
  const low = Number(a & 0xFFFFFFFFn);
  return z + 31 - Math.clz32(low & -low);
}

// Absolute value of a bigint.
export function absBig(a) {
  return a < 0n ? -a : a;
}

// Greatest common divisor of two bigints, always >= 0 (gcdBig(0n, 0n) = 0n).
export function gcdBig(a, b) {
  a = absBig(a);
  b = absBig(b);
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

const SAFE = 9007199254740991n;

// Inverse of the bigint a modulo the bigint m >= 1, in [0, m). Throws "not_invertible" when gcd(a, m) != 1 and
// "bad_modulus" when m < 1.
export function modInv(a, m) {
  if (typeof a !== "bigint" || typeof m !== "bigint") throw new CodedError("bad_format", "modInv needs bigints");
  if (m < 1n) throw new CodedError("bad_modulus", `modulus ${m} is not positive`);
  if (m === 1n) return 0n;
  a = bmod(a, m);
  if (m <= SAFE) {
    // Extended Euclid on Numbers: every intermediate value is bounded by m < 2^53, so every step is exact.
    let r0 = Number(m), r1 = Number(a), s0 = 0, s1 = 1;
    while (r1 !== 0) {
      const q = Math.floor(r0 / r1);
      let t = r0 - q * r1; r0 = r1; r1 = t;
      t = s0 - q * s1; s0 = s1; s1 = t;
    }
    if (r0 !== 1) throw new CodedError("not_invertible", `gcd is ${r0}`);
    return bmod(BigInt(s0), m);
  }
  let r0 = m, r1 = a, s0 = 0n, s1 = 1n;
  while (r1 !== 0n) {
    const q = r0 / r1;
    let t = r0 - q * r1; r0 = r1; r1 = t;
    t = s0 - q * s1; s0 = s1; s1 = t;
  }
  if (r0 !== 1n) throw new CodedError("not_invertible", "the gcd is not 1");
  return bmod(s0, m);
}

// The bigint written by a string of an optional "-" and decimal digits (surrounding white space allowed), else null.
export function parseBigIntStrict(s) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!INT_RE.test(t)) return null;
  return BigInt(t);
}

// Number of decimal digits of |b| for a bigint b (digitCount(0n) = 1).
export function digitCount(b) {
  const s = (b < 0n ? -b : b).toString();
  return s.length;
}
