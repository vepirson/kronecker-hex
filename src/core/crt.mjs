// Chinese remaindering over pairwise coprime moduli, and the split of an integer into its part over given primes.

import { bmod, modInv, CodedError } from "./bigint_utils.mjs";

// crt(pairs) with pairs [r, m] of bigints (m >= 1, pairwise coprime) returns { x, M }: M = product of the moduli,
// 0 <= x < M, x = r mod m for every pair. Moduli 1 are skipped. Throws "not_coprime" or "bad_modulus".
//
// Method (a product tree): the moduli are the leaves, every inner node holds the product of its two children. Going
// down the tree, each node v receives Q_v = (M / P_v) mod P_v from its parent p and its sibling s as
// Q_v = (Q_p mod P_v)(P_s mod P_v) mod P_v, so every leaf m_i receives (M / m_i) mod m_i. With
// c_i = r_i ((M / m_i) mod m_i)^(-1) mod m_i, going up again gives S = sum c_i M / m_i by S_v = S_l P_r + S_r P_l,
// and x = S mod M. Only leaf moduli are ever inverted.
export function crt(pairs) {
  const rs = [];
  const ms = [];
  for (const pr of pairs) {
    if (!Array.isArray(pr) || pr.length !== 2 || typeof pr[0] !== "bigint" || typeof pr[1] !== "bigint") {
      throw new CodedError("bad_format", "crt needs pairs [r, m] of bigints");
    }
    const [r, m] = pr;
    if (m < 1n) throw new CodedError("bad_modulus", `modulus ${m} is not positive`);
    if (m === 1n) continue;
    rs.push(bmod(r, m));
    ms.push(m);
  }
  const n = ms.length;
  if (n === 0) return { x: 0n, M: 1n };
  if (n === 1) return { x: rs[0], M: ms[0] };
  // Product tree: levels[0] = leaves, levels[top] = [M].
  const levels = [ms];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1];
    const nxt = [];
    for (let k = 0; k + 1 < cur.length; k += 2) nxt.push(cur[k] * cur[k + 1]);
    if (cur.length % 2) nxt.push(cur[cur.length - 1]);
    levels.push(nxt);
  }
  const top = levels.length - 1;
  const M = levels[top][0];
  // Down: Q at each level.
  let Q = [1n % M];
  for (let lv = top - 1; lv >= 0; lv--) {
    const cur = levels[lv];
    const q = new Array(cur.length);
    for (let k = 0; k < cur.length; k++) {
      const parentQ = Q[k >> 1];
      const sib = k ^ 1;
      if (sib >= cur.length) {
        q[k] = parentQ; // carried up unchanged, same product as its parent
      } else {
        const P = cur[k];
        q[k] = ((parentQ % P) * (cur[sib] % P)) % P;
      }
    }
    Q = q;
  }
  // Leaves: c_i.
  let S = new Array(n);
  for (let k = 0; k < n; k++) {
    let inv;
    try {
      inv = modInv(Q[k], ms[k]);
    } catch (e) {
      if (e && e.code === "not_invertible") throw new CodedError("not_coprime", `modulus number ${k} shares a factor with another modulus`);
      throw e;
    }
    S[k] = (rs[k] * inv) % ms[k];
  }
  // Up: S_v = S_l P_r + S_r P_l.
  for (let lv = 0; lv < top; lv++) {
    const cur = levels[lv];
    const nxt = [];
    for (let k = 0; k + 1 < cur.length; k += 2) nxt.push(S[k] * cur[k + 1] + S[k + 1] * cur[k]);
    if (cur.length % 2) nxt.push(S[cur.length - 1]);
    S = nxt;
  }
  return { x: S[0] % M, M };
}

// smoothSplit(n, primes) for a bigint n > 0 and Numbers p returns { u, m } (bigints) with n = u m, u made of the
// given primes only, m divisible by none of them. Throws "not_positive" for n <= 0.
export function smoothSplit(n, primes) {
  if (typeof n !== "bigint") throw new CodedError("bad_format", "smoothSplit needs a bigint");
  if (n <= 0n) throw new CodedError("not_positive", `smoothSplit of ${n}`);
  let u = 1n;
  for (const pn of primes) {
    const p = BigInt(pn);
    if (p < 2n) continue;
    while (n % p === 0n) {
      n /= p;
      u *= p;
    }
  }
  return { u, m: n };
}
