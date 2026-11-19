// The Kronecker symbol (a | n) for all integers, and a row evaluator for many cells of one row.
//
// Definition. (a | 0) = 1 when a = +-1, else 0. For n < 0: (a | n) = (a | -1)(a | -n) with (a | -1) = -1 exactly when
// a < 0. For n > 0 write n = 2^e n' with n' odd: (a | n) = (a | 2)^e J(a, n'), where J is the Jacobi symbol and
// (a | 2) = 0, +1, -1 for a even, a = +-1 mod 8, a = +-3 mod 8.
//
// Arithmetic is exact: bigint throughout, or Number where every operand stays below 2^53. A zero symbol is always
// returned as +0 (the "|| 0" after a product with a sign), never as -0.

import { bmod, ctz, CodedError } from "./bigint_utils.mjs";

const MAX_SAFE_BIG = 9007199254740991n; // 2^53 - 1
const MIN_SAFE_BIG = -9007199254740991n;

// Jacobi symbol (a | n) for Numbers with 0 <= a < n, n odd, n < 2^53.
export function jacobiNumber(a, n) {
  let t = 1;
  while (a !== 0) {
    while (a % 2 === 0) {
      a /= 2;
      const r = n % 8;
      if (r === 3 || r === 5) t = -t;
    }
    const tmp = a;
    a = n;
    n = tmp;
    if (a % 4 === 3 && n % 4 === 3) t = -t;
    a = a % n;
  }
  return n === 1 ? t : 0;
}

// Jacobi symbol (a | n) for bigints with 0 <= a < n, n odd positive. Uses the Lehmer form from n >= 2^900 on (about
// 270 digits, where it starts to be faster), the binary form below.
const LEHMER_MIN = 1n << 900n;
export function jacobiBig(a, n) {
  return n >= LEHMER_MIN ? jacobiLehmer(a, n) : jacobiBinary(a, n);
}

// Jacobi symbol (a | n) for bigints with 0 <= a < n, n odd positive, by a Lehmer-accelerated Euclidean sequence.
//
// The remainder sequence (A, B) -> (B, A mod B) is run with batches of quotients taken from the top 50 bits (Knuth,
// TAOCP 4.5.2, Algorithm L). A quotient is used only when both bracketing estimates agree, so every quotient is an
// exact Euclidean quotient. The symbol is kept as S = t (num | den), den being the odd member of the pair (A, B),
// marked by the flag denFirst. One Euclidean step needs only A mod 8, B mod 8 and q mod 8:
//   den = B:          (A | B) = (A - qB | B), nothing changes.
//   den = A, B odd:   reciprocity (B | A) = (A | B), negated when A = B = 3 mod 4, then as above.
//   den = A, B even:  (B | A) = (B | A') r with A' = A - qB odd, r = 1 unless B = 2 mod 4, and then
//                     r = (2 | A)(2 | A') (-1)^{((A-1)/2 + (A'-1)/2)((B/2-1)/2)}.
// After the step the pair is renamed (B, A - qB). The residues mod 8 are carried through each batch and compared
// with the bigints after it. A failed comparison throws "guard_failed", it never continues silently.
const chi2 = (u) => (u === 3 || u === 5 ? -1 : 1);
export function jacobiLehmer(a, n) {
  let A = n;
  let B = a;
  let t = 1;
  let denFirst = true;
  let L = A.toString(16).length * 4; // an upper bound of the bit length, lowered as A shrinks
  for (;;) {
    if (B === 0n) return A === 1n ? t : 0;
    if (A <= MAX_SAFE_BIG) {
      const An = Number(A);
      const Bn = Number(B);
      return (denFirst ? t * jacobiNumber(Bn % An, An) : t * jacobiNumber(An % Bn, Bn)) || 0;
    }
    while ((A >> BigInt(L)) !== 0n) L++;
    while ((A >> BigInt(L - 33)) === 0n) L -= 32;
    while ((A >> BigInt(L - 1)) === 0n) L--;
    const k = BigInt(L - 50);
    let x = Number(A >> k);
    let y = Number(B >> k);
    let a1 = 1, b1 = 0, c1 = 0, d1 = 1;
    let a8 = Number(A & 7n);
    let b8 = Number(B & 7n);
    for (;;) {
      const yc = y + c1;
      const yd = y + d1;
      if (yc <= 0 || yd <= 0) break;
      const q = Math.floor((x + a1) / yc);
      if (q !== Math.floor((x + b1) / yd)) break;
      const q8 = q % 8;
      const r8 = (((a8 - q8 * b8) % 8) + 8) % 8;
      if (!denFirst) {
        denFirst = true;
      } else if (b8 & 1) {
        if ((a8 & 3) === 3 && (b8 & 3) === 3) t = -t;
      } else {
        if ((b8 & 3) === 2) {
          let r = chi2(a8) * chi2(r8);
          if (b8 === 6 && ((((a8 - 1) >> 1) + ((r8 - 1) >> 1)) & 1)) r = -r;
          t *= r;
        }
        denFirst = false;
      }
      a8 = b8;
      b8 = r8;
      let T = a1 - q * c1; a1 = c1; c1 = T;
      T = b1 - q * d1; b1 = d1; d1 = T;
      T = x - q * y; x = y; y = T;
    }
    if (b1 === 0) {
      // No quotient could be certified from the top bits: one exact bigint division step.
      const qB = A / B;
      const R = A - qB * B;
      const q8 = Number(qB & 7n);
      const r8 = Number(R & 7n);
      if (!denFirst) {
        denFirst = true;
      } else if (b8 & 1) {
        if ((a8 & 3) === 3 && (b8 & 3) === 3) t = -t;
      } else {
        if ((b8 & 3) === 2) {
          let r = chi2(a8) * chi2(r8);
          if (b8 === 6 && ((((a8 - 1) >> 1) + ((r8 - 1) >> 1)) & 1)) r = -r;
          t *= r;
        }
        denFirst = false;
      }
      if ((((a8 - q8 * b8) % 8) + 8) % 8 !== r8) throw new CodedError("guard_failed", "jacobiLehmer: mod 8 check after a division step");
      A = B;
      B = R;
    } else {
      const nA = BigInt(a1) * A + BigInt(b1) * B;
      const nB = BigInt(c1) * A + BigInt(d1) * B;
      if (nB < 0n || nA < nB) throw new CodedError("guard_failed", "jacobiLehmer: cofactor check");
      if (Number(nA & 7n) !== a8 || Number(nB & 7n) !== b8) throw new CodedError("guard_failed", "jacobiLehmer: mod 8 check after a batch");
      A = nA;
      B = nB;
    }
  }
}

// Jacobi symbol (a | n) for bigints with 0 <= a < n, n odd positive, by binary stripping. Continues on Numbers once
// n < 2^53.
export function jacobiBinary(a, n) {
  let t = 1;
  while (a !== 0n) {
    if (n <= MAX_SAFE_BIG) {
      const j = jacobiNumber(Number(a), Number(n));
      return t * j || 0;
    }
    const z = ctz(a);
    if (z > 0) {
      a >>= BigInt(z);
      if (z & 1) {
        const r = Number(n & 7n);
        if (r === 3 || r === 5) t = -t;
      }
    }
    const tmp = a;
    a = n;
    n = tmp;
    if ((a & 3n) === 3n && (n & 3n) === 3n) t = -t;
    a = a % n;
  }
  return n === 1n ? t : 0;
}

// Kronecker symbol (a | n) for arbitrary integers a, n (bigint, or Number converted exactly). Returns the Number
// -1, 0 or 1.
export function kronecker(a, n) {
  if (typeof a !== "bigint") a = BigInt(a);
  if (typeof n !== "bigint") n = BigInt(n);
  if (n === 0n) return (a === 1n || a === -1n) ? 1 : 0;
  let s = 1;
  if (n < 0n) {
    n = -n;
    if (a < 0n) s = -s;
  }
  const e = ctz(n);
  if (e > 0) {
    if ((a & 1n) === 0n) return 0;
    n >>= BigInt(e);
    if (e & 1) {
      const r = Number(bmod(a, 8n));
      if (r === 3 || r === 5) s = -s;
    }
  }
  if (n === 1n) return s;
  return s * jacobiBig(bmod(a, n), n) || 0;
}

// Row evaluator: rowReducer(x0, d) returns { d, symbol(i) } with symbol(i) = kronecker(x0 + i, d) for a Number offset
// |i| < 2^24. It makes ONE big reduction x0 mod (odd part of |d|), then each symbol(i) is one Jacobi symbol on
// operands below |d| (on Numbers when |d| < 2^50).
export function rowReducer(x0, d) {
  if (typeof x0 !== "bigint") x0 = BigInt(x0);
  if (typeof d !== "bigint") d = BigInt(d);
  if (d === 0n) {
    return {
      d,
      symbol(i) {
        const x = x0 + BigInt(i);
        return (x === 1n || x === -1n) ? 1 : 0;
      },
    };
  }
  const negD = d < 0n;
  let n = negD ? -d : d;
  const e = ctz(n);
  n >>= BigInt(e);
  const x8 = Number(bmod(x0, 8n));
  // Sign of x0 + i: exact on Numbers when x0 is a safe integer, otherwise the sign of x0 (a small i cannot flip it).
  const x0Safe = x0 >= MIN_SAFE_BIG && x0 <= MAX_SAFE_BIG;
  const x0Num = x0Safe ? Number(x0) : 0;
  const x0Neg = x0 < 0n;
  const isNeg = x0Safe ? (i) => x0Num + i < 0 : () => x0Neg;
  const nIsOne = n === 1n;
  // Number path only below 2^50, so that rNum + i stays exact for every offset |i| < 2^24.
  const small = n <= 1125899906842624n;
  const nNum = small ? Number(n) : 0;
  const r = nIsOne ? 0n : bmod(x0, n);
  const rNum = small ? Number(r) : 0;
  return {
    d,
    symbol(i) {
      let s = 1;
      if (negD && isNeg(i)) s = -s;
      if (e > 0) {
        const t = (((x8 + i) % 8) + 8) % 8;
        if ((t & 1) === 0) return 0;
        if ((e & 1) && (t === 3 || t === 5)) s = -s;
      }
      if (nIsOne) return s;
      if (small) {
        const a = (((rNum + i) % nNum) + nNum) % nNum;
        return s * jacobiNumber(a, nNum) || 0;
      }
      return s * jacobiBig(bmod(r + BigInt(i), n), n) || 0;
    },
  };
}
