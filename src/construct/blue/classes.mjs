// The classes of the small primes of a blue construction (step 1 of the blue Construction Lab).
//
// For a prime p <= B a cell (i, j) lies in the class (a, b) of (Z/p)^2 when i = a and j = b mod p. With the
// conditions x0 = -a, d0 = -b mod p, the prime p divides both coordinates of exactly the cells of that class, which
// are then blue. A class is ALLOWED when it holds no cell of N(S), its MEMBERS are its cells of S.
//
// best(p, others) is the allowed class with the largest key (members not in `others`, members, -a, -b): most new
// cells, then most cells, then the smallest a, then the smallest b. The choice runs in two stages:
//   greedy: p ascending, class = best(p, covered so far), then covered grows by its members,
//   passes (at most 20): p ascending, others = the members of the classes of every OTHER prime as they are at that
//   moment, the class of p is replaced by best(p, others) only when that one has strictly more members outside
//   others. A pass that replaces nothing ends the passes.
// best never looks at all p^2 classes: its candidates are the allowed classes that hold a cell of S, plus the
// smallest class (a, then b) that holds no cell of the window (the best class without a member), so the cost per
// prime is proportional to the size of the window.

import { primesUpTo } from "../../core/primes.mjs";
import { drain } from "../events.mjs";

export const MAX_PASSES = 20;

const mod = (a, m) => ((a % m) + m) % m;

// The candidate classes of one prime: [{ a, b, members (indices into win.S, ascending) }] in (a, b) order, or null
// when every class holds a cell of N.
function candidatesOf(win, p) {
  const pp = p * p;
  const hitN = new Set();
  for (const [i, j] of win.N) hitN.add(mod(i, p) * p + mod(j, p));
  if (hitN.size === pp) return null;
  const byClass = new Map();
  const hitS = new Set();
  win.S.forEach(([i, j], k) => {
    const c = mod(i, p) * p + mod(j, p);
    hitS.add(c);
    if (hitN.has(c)) return;
    let m = byClass.get(c);
    if (!m) byClass.set(c, (m = []));
    m.push(k);
  });
  // at most |W| classes are hit, so this scan stops after at most |W| + 1 classes
  for (let c = 0; c < pp; c++) {
    if (!hitN.has(c) && !hitS.has(c)) {
      byClass.set(c, []);
      break;
    }
  }
  return [...byClass.entries()].sort((x, y) => x[0] - y[0]).map(([c, members]) => ({ a: Math.floor(c / p), b: c % p, members }));
}

// The number of members of a candidate that `isOther` does not mark.
function freshCount(cand, isOther) {
  let f = 0;
  for (const k of cand.members) if (!isOther(k)) f++;
  return f;
}

// best(p, others) over the candidates of p, with others given as a predicate on member indices.
function best(cands, isOther) {
  let top = null, tf = -1;
  for (const c of cands) {
    const f = freshCount(c, isOther);
    if (f > tf || (f === tf && c.members.length > top.members.length)) {
      top = c;
      tf = f;
    }
    // equal keys up to (a, b) keep the earlier candidate, which has the smaller (a, b)
  }
  return top;
}

// chooseClassesIter(win) is a generator: it yields progress records { done, total } (one per prime while the
// candidate classes are collected) and returns { classes: [{ p, a, b, xRes, dRes, members (sorted cells), greedy:
// [a, b] }] (ascending p), passes } with passes the number of passes run (the last one, which replaces nothing,
// included), or { inadmissible: p } for the first prime whose classes all hold a cell of N.
export function* chooseClassesIter(win) {
  const primes = primesUpTo(win.B);
  const tables = [];
  for (let k = 0; k < primes.length; k++) {
    const cands = candidatesOf(win, primes[k]);
    if (cands === null) return { inadmissible: primes[k] };
    tables.push(cands);
    yield { done: k + 1, total: primes.length };
  }
  const cover = new Int32Array(win.S.length);
  const add = (cand, by) => {
    for (const k of cand.members) cover[k] += by;
  };
  const choice = tables.map((cands) => {
    const c = best(cands, (k) => cover[k] > 0);
    add(c, 1);
    return c;
  });
  const greedy = choice.map((c) => [c.a, c.b]);
  const mark = new Uint8Array(win.S.length);
  let passes = 0;
  while (passes < MAX_PASSES) {
    passes++;
    let changed = 0;
    for (let k = 0; k < primes.length; k++) {
      const cur = choice[k];
      for (const m of cur.members) mark[m] = 1;
      const isOther = (m) => cover[m] - mark[m] > 0;
      const cand = best(tables[k], isOther);
      const better = freshCount(cand, isOther) > freshCount(cur, isOther);
      for (const m of cur.members) mark[m] = 0;
      if (better) {
        add(cur, -1);
        add(cand, 1);
        choice[k] = cand;
        changed++;
      }
    }
    if (changed === 0) break;
  }
  const classes = primes.map((p, k) => ({
    p, a: choice[k].a, b: choice[k].b, xRes: mod(-choice[k].a, p), dRes: mod(-choice[k].b, p),
    members: choice[k].members.map((m) => [win.S[m][0], win.S[m][1]]), greedy: greedy[k],
  }));
  return { classes, passes };
}

// chooseClasses(win) runs chooseClassesIter to its end and returns its value.
export function chooseClasses(win) {
  return drain(chooseClassesIter(win));
}

// readStoredClasses(win, data) reads the classes of a BlueData object for a replay: a = -xRes, b = -dRes mod p, the
// members are the cells of S in the class. Returns { classes: [{ p, a, b, xRes, dRes, members }] } or
// { mismatch: message } when data.B is not the B of the window, the stored primes are not exactly the primes <= B,
// a residue is not an integer in 0 .. p - 1, or a stored class holds a cell of N.
export function readStoredClasses(win, data) {
  const want = primesUpTo(win.B);
  const st = data.classes;
  if (data.B !== win.B || !Array.isArray(st) || st.length !== want.length || !st.every((s, k) => s && s.p === want[k])) {
    return { mismatch: `the stored classes are not one per prime <= B = ${win.B}` };
  }
  const classes = [];
  for (const { p, xRes, dRes } of st) {
    for (const v of [xRes, dRes]) {
      if (!Number.isInteger(v) || v < 0 || v >= p) return { mismatch: `residue ${v} mod ${p} is not in 0 .. ${p - 1}` };
    }
    const a = mod(-xRes, p), b = mod(-dRes, p);
    const inClass = ([i, j]) => mod(i, p) === a && mod(j, p) === b;
    if (win.N.some(inClass)) return { mismatch: `the class (${a}, ${b}) mod ${p} holds a cell of N(S)` };
    classes.push({ p, a, b, xRes, dRes, members: win.S.filter(inClass).map(([i, j]) => [i, j]) });
  }
  return { classes };
}
