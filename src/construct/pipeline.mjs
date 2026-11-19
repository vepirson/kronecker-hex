// The construction of a green or red region of a prescribed shape, as a generator of events.
//
// Given a finite admissible shape S (a connected list of offsets), its seed cell and a colour eps = 1 (green) or
// -1 (red), it produces integers x0, d0 such that the region of the Kronecker colouring containing the seed cell
// (x0 + s_i, d0 + s_j) is exactly the translate of S. The steps (numbered as in the Construction Lab):
//   0  the window W = S u N(S) and the bound B = max(h, w, 7)
//   1  small primes p <= B: a congruence on x0 (and on d0, forcing some cells of N(S) blue)
//   2  the sign cells of every row (the cells of W that are not forced blue) and X_s, M_x
//   3  two row primes per row with sign cells, d0 = -j mod q1 q2, (D, M_d) by the CRT
//   4  candidates d0 = D + t M_d, square test and cofactor d0 + j = u q1 q2 c of every row
//   5  the row solve: a residue R mod c, then r1, r2 with the wanted signs
//   6  x0 by the CRT of X_s mod M_x and r1 mod q1, r2 mod q2, R mod c of every row
//   7  the check of the result by Kronecker symbols and a flood fill
// Every choice has a fixed tie-break, so the same input always gives the same x0 and d0.
//
// With input.replay (a PackedData object) the construction does not choose: it reads every choice from the data,
// checks it, and runs steps 6 and 7 as usual.

import { CodedError } from "../core/bigint_utils.mjs";
import { primesUpTo } from "../core/primes.mjs";
import { crt } from "../core/crt.mjs";
import { sha256Hex } from "../core/sha256.mjs";
import { normaliseShape } from "../core/shapes.mjs";
import { makeWitness } from "../formats/witness.mjs";
import { formatPacked } from "../formats/packed.mjs";
import { encodeToken } from "../formats/token.mjs";
import { buildWindow, chooseSmallPrimes, deriveSmallPrimes, forcedUnion, signRows } from "./small_primes.mjs";
import { chooseRowPrimes, rowPrimeBound, checkStoredRowPrimes, dConditions } from "./row_primes.mjs";
import { firstCandidateIndex, failsSquareTest, cofactorOf, smallSigns, isValidR, nextValidR, rowTarget } from "./cofactor.mjs";
import { solveRowIter } from "./row_solver.mjs";
import { jacobiNumber } from "../core/kronecker.mjs";
import { runningCrt, glueX } from "./glue.mjs";
import { verifyConstruction } from "./verify.mjs";
import { collectEvents, postInBatches, withoutFields, eventToJSON } from "./events.mjs";

// The largest number of sign cells allowed in one row.
export const CAP_K = 40;
// The version of the algorithm (any change of a rule or a tie-break gets a new version).
export const VERSION = "construct_v1";
// Number of further integers examined for the next valid R, and number of attempts per row.
export const R_SCAN = 1000;
export const MAX_ATTEMPTS = 20;

const now = () => globalThis.performance.now();

const errorEvent = (step, code, message, extra = {}) => ({ type: "error", step, code, message, ...extra });

// Tag the progress records of a row solver with the row and turn them into rowProgress events.
function* rowProgressOf(j, it) {
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    yield { type: "rowProgress", step: 5, j, phase: r.value.phase, done: r.value.done, total: r.value.total };
  }
}

// Check the input and return the normalised fields, or a message.
function readInput(input) {
  if (input === null || typeof input !== "object") return { message: "the input is not an object" };
  const replay = input.replay;
  let shape, seed, colour, lift, id;
  if (replay !== undefined) {
    if (replay === null || typeof replay !== "object") return { message: "replay is not a PackedData object" };
    ({ shape, seed, colour } = replay);
    id = replay.id === undefined ? null : replay.id;
    const two = Array.isArray(replay.smallPrimes) ? replay.smallPrimes.find((s) => s && s.p === 2) : undefined;
    lift = two && Number.isInteger(two.xRes) ? two.xRes >> 1 : 0;
  } else {
    ({ shape, seed, colour } = input);
    lift = input.lift === undefined ? 1 : input.lift;
    id = input.id === undefined ? null : input.id;
  }
  const maxD0 = input.maxD0 === undefined ? 200 : input.maxD0;
  let norm;
  try {
    norm = normaliseShape({ shape, seed });
  } catch (e) {
    if (e instanceof CodedError) return { message: `shape: ${e.message}` };
    throw e;
  }
  if (colour !== 1 && colour !== -1) return { message: "colour must be 1 (green) or -1 (red)" };
  if (!Number.isInteger(lift) || lift < 0 || lift > 3) return { message: "lift must be an integer 0 .. 3" };
  if (!Number.isSafeInteger(maxD0) || maxD0 < 1) return { message: "maxD0 must be a positive integer" };
  if (id !== null && typeof id !== "string") return { message: "id must be a string or null" };
  return { ok: true, cells: norm.cells, seed: norm.seed, genus: norm.genus, area: norm.area, colour, lift, id, maxD0, replay };
}

// Check the stored residues r1, r2 of a replayed row against the wanted signs: both usable, and
// (r1 + i | q1)(r2 + i | q2) = want on every sign cell.
function storedPairMatches(q1, q2, offs, r1, r2, wantLo, wantHi) {
  const m = (a, q) => ((a % q) + q) % q;
  let lo = 0, hi = 0;
  for (let t = 0; t < offs.length; t++) {
    const s = jacobiNumber(m(r1 + offs[t], q1), q1) * jacobiNumber(m(r2 + offs[t], q2), q2);
    if (s === 0) return false;
    if (s === -1) {
      if (t < 32) lo |= 1 << t;
      else hi |= 1 << (t - 32);
    }
  }
  return (lo >>> 0) === wantLo && (hi >>> 0) === wantHi;
}

// One candidate d0: rows one by one. Returns { rows } when every row is solved, { reject: { reason, j } }, or
// { error: event }.
function* runCandidate(ctx, t, d0) {
  const { primes, Xs, rowPlan, solver, replayRows } = ctx;
  const solved = [];
  for (let k = 0; k < rowPlan.length; k++) {
    const { j, cells, L, q1, q2 } = rowPlan[k];
    const t0 = now();
    const n = d0 + BigInt(j);
    if (failsSquareTest(n, q1, q2)) {
      if (replayRows) return { error: errorEvent(4, "replay_mismatch", `row ${j}: q1^2 or q2^2 divides d0 + j`, { j }) };
      return { reject: { reason: "square", j } };
    }
    const cf = cofactorOf(n, primes, q1, q2);
    if (cf === null) {
      if (replayRows) return { error: errorEvent(4, "replay_mismatch", `row ${j}: q1 q2 does not divide the part of d0 + j free of the primes <= B`, { j }) };
      throw new Error(`row ${j}: the row primes do not divide d0 + j`);
    }
    const { u, c } = cf;
    yield { type: "rowCofactor", step: 4, j, n, u, q1, q2, c };
    const small = smallSigns(Xs, u, cells);
    const zero = small.indexOf(0);
    if (zero >= 0) return { error: errorEvent(5, "sigma_zero", `row ${j}: K(X_s + i, u) = 0 at i = ${cells[zero].i}`, { j }) };
    const offs = cells.map((x) => x.i);
    if (replayRows) {
      const st = replayRows[k];
      if (!isValidR(st.rho, offs, c)) return { error: errorEvent(5, "replay_mismatch", `row ${j}: R = ${st.rho} is not prime to the cofactor on every sign cell`, { j }) };
      const tg = rowTarget(cells, small, st.rho, c);
      yield { type: "rowTarget", step: 5, j, R: st.rho, cells: tg.cells, wantBits: tg.wantBits };
      if (!storedPairMatches(q1, q2, offs, st.r1, st.r2, tg.wantLo, tg.wantHi)) {
        return { error: errorEvent(5, "replay_mismatch", `row ${j}: the stored r1, r2 do not give the wanted signs`, { j }) };
      }
      yield { type: "rowSolved", step: 5, j, q1, q2, r1: st.r1, r2: st.r2, R: st.rho, tried2: 0, ms: now() - t0 };
      solved.push({ j, k: cells.length, cells, L, q1, q2, r1: st.r1, r2: st.r2, rho: st.rho, u, c, attempts: 1 });
      continue;
    }
    let found = null;
    let next = 0n;
    let attempts = 0;
    const maxAttempts = c === 1n ? 1 : MAX_ATTEMPTS;
    while (attempts < maxAttempts) {
      let R;
      if (c === 1n) {
        R = 0n;
      } else {
        R = nextValidR(next, offs, c, R_SCAN);
        if (R === null) break;
        next = R + 1n;
      }
      attempts++;
      const tg = rowTarget(cells, small, R, c);
      yield { type: "rowTarget", step: 5, j, R, cells: tg.cells, wantBits: tg.wantBits };
      const res = yield* rowProgressOf(j, solver({ q1, q2, offs, wantLo: tg.wantLo, wantHi: tg.wantHi }));
      if (res) {
        found = { R, res };
        break;
      }
      yield { type: "rowRetry", step: 5, j, attempt: attempts, R };
    }
    if (!found) return { reject: { reason: "row", j } };
    const { R, res } = found;
    if (res.bytes !== undefined && res.bytes > ctx.peakBytes) ctx.peakBytes = res.bytes;
    yield { type: "rowSolved", step: 5, j, q1, q2, r1: res.r1, r2: res.r2, R, tried2: res.tried2, ms: now() - t0 };
    solved.push({ j, k: cells.length, cells, L, q1, q2, r1: res.r1, r2: res.r2, rho: R, u, c, attempts });
  }
  return { rows: solved };
}

// construct(input, hooks) is a generator of the events of the construction. It returns the result object, or null
// after an error event. hooks.solveRowIter replaces the row solver (same contract as solveRowIter, for tests).
export function* construct(input, hooks = {}) {
  const tStart = now();
  const inp = readInput(input);
  if (!inp.ok) {
    yield errorEvent(0, "bad_input", inp.message);
    return null;
  }
  const { cells, seed, genus, area, colour, lift, id, maxD0, replay } = inp;
  const mode = replay ? "replay" : "live";
  const solver = (hooks && hooks.solveRowIter) || solveRowIter;
  yield { type: "start", step: 0, colour, lift, mode, area, id, version: VERSION };

  // step 0
  const win = buildWindow(cells, colour);
  yield { type: "window", step: 0, S: win.S, N: win.N, bounds: win.bounds, h: win.h, w: win.w, B: win.B, eps: colour };

  // step 1
  const sp = replay ? deriveSmallPrimes(win, replay) : chooseSmallPrimes(win, lift);
  if (sp.mismatch) {
    yield errorEvent(1, "replay_mismatch", sp.mismatch);
    return null;
  }
  if (sp.inadmissible) {
    yield errorEvent(1, "inadmissible", `every class mod ${sp.inadmissible} contains a cell of the shape`, { p: sp.inadmissible });
    return null;
  }
  for (const s of sp.primes) yield { type: "smallPrime", step: 1, ...s };
  const forced = forcedUnion(sp.primes);
  const { x: Xs, M: Mx } = crt(sp.primes.map((s) => [BigInt(s.xRes), BigInt(s.xMod)]));

  // step 2
  const sr = signRows(win, forced.keys);
  yield { type: "xSmall", step: 2, Xs, Mx, forcedCount: forced.cells.length, rows: sr.rows, emptyRows: sr.emptyRows, kMax: sr.kMax };
  const over = sr.rows.find((r) => r.cells.length > CAP_K);
  if (over) {
    yield errorEvent(2, "row_cap", `row ${over.j} has ${over.cells.length} sign cells, more than ${CAP_K}`, { j: over.j, k: over.cells.length });
    return null;
  }

  // step 3
  const rule = chooseRowPrimes(sr.rows, win.B);
  let rowPlan;
  let replayRows = null;
  if (replay) {
    const stored = Array.isArray(replay.rows) ? replay.rows : [];
    const want = sr.rows.map((r) => r.j);
    if (stored.length !== want.length || !stored.every((r, k) => r && r.j === want[k])) {
      yield errorEvent(3, "replay_mismatch", "the stored rows are not exactly the rows with sign cells");
      return null;
    }
    const bad = checkStoredRowPrimes(stored, win.B);
    if (bad) {
      yield errorEvent(3, "replay_mismatch", bad);
      return null;
    }
    for (const r of stored) {
      if (!Number.isSafeInteger(r.r1) || r.r1 < 0 || r.r1 >= r.q1 || !Number.isSafeInteger(r.r2) || r.r2 < 0 || r.r2 >= r.q2 || typeof r.rho !== "bigint" || r.rho < 0n) {
        yield errorEvent(3, "replay_mismatch", `row ${r.j}: a stored residue is out of range`, { j: r.j });
        return null;
      }
    }
    replayRows = stored;
    rowPlan = sr.rows.map((r, k) => ({
      j: r.j, k: r.cells.length, cells: r.cells, L: rowPrimeBound(r.cells.length, win.B), q1: stored[k].q1, q2: stored[k].q2,
      byRule: stored[k].q1 === rule[k].q1 && stored[k].q2 === rule[k].q2,
    }));
  } else {
    rowPlan = sr.rows.map((r, k) => ({ j: r.j, k: r.cells.length, cells: r.cells, L: rule[k].L, q1: rule[k].q1, q2: rule[k].q2, byRule: true }));
  }
  for (const r of rowPlan) yield { type: "rowPrimes", step: 3, j: r.j, k: r.k, L: r.L, q1: r.q1, q2: r.q2, byRule: r.byRule };
  const dc = dConditions(sp.primes, rowPlan);
  let dRun;
  try {
    dRun = runningCrt(dc.map((c) => [c.residue, c.modulus]));
  } catch (e) {
    if (replay && e instanceof CodedError) {
      yield errorEvent(3, "replay_mismatch", "the moduli of the d0 congruences are not coprime");
      return null;
    }
    throw e;
  }
  for (let k = 0; k < dc.length; k++) {
    yield { type: "dCrtStep", step: 3, index: k, modulus: dc[k].modulus, residue: dc[k].residue, D: dRun.steps[k].x, Md: dRun.steps[k].M };
  }
  const D = dRun.x, Md = dRun.M;

  // steps 4 and 5
  const ctx = { primes: primesUpTo(win.B), Xs, rowPlan, solver, replayRows, peakBytes: 0 };
  const t0 = firstCandidateIndex(D, Md, win.bounds.jmin);
  let accepted = null;
  if (replay) {
    const t = replay.dIndex;
    if (typeof t !== "bigint" || t < t0) {
      yield errorEvent(4, "replay_mismatch", `d0_index ${t} gives d0 + j_min < 1`);
      return null;
    }
    const d0 = D + t * Md;
    yield { type: "dCandidate", step: 4, index: t, d0 };
    const out = yield* runCandidate(ctx, t, d0);
    if (out.error) {
      yield out.error;
      return null;
    }
    accepted = { t, d0, rows: out.rows };
  } else {
    for (let c = 0; c < maxD0 && !accepted; c++) {
      const t = t0 + BigInt(c);
      const d0 = D + t * Md;
      yield { type: "dCandidate", step: 4, index: t, d0 };
      const out = yield* runCandidate(ctx, t, d0);
      if (out.error) {
        yield out.error;
        return null;
      }
      if (out.reject) {
        yield { type: "dRejected", step: 4, index: t, reason: out.reject.reason, j: out.reject.j };
        continue;
      }
      accepted = { t, d0, rows: out.rows };
    }
    if (!accepted) {
      yield errorEvent(4, "no_d0", `no candidate d0 among ${maxD0} passed every row`);
      return null;
    }
  }
  const { t: dIndex, d0, rows } = accepted;

  // step 6
  let glue;
  try {
    glue = glueX(Xs, Mx, rows);
  } catch (e) {
    if (replay && e instanceof CodedError) {
      yield errorEvent(6, "replay_mismatch", "the moduli of the x0 congruences are not coprime");
      return null;
    }
    throw e;
  }
  for (const s of glue.steps) yield { type: "xCrtStep", step: 6, ...s };
  const x0 = glue.x0;
  const sx = x0.toString(), sd = d0.toString();
  const sha256 = { x0: sha256Hex(sx), d0: sha256Hex(sd) };
  const digits = { x0: sx.length, d0: sd.length };
  yield { type: "glued", step: 6, x0, d0, dIndex, digitsX: digits.x0, digitsD: digits.d0, sha256x: sha256.x0, sha256d: sha256.d0 };

  // step 7
  const ver = verifyConstruction({ x0, d0, shape: win.S, seed, colour, forced: forced.cells });
  for (const r of ver.rows) yield { type: "verifyRow", step: 7, ...r };
  yield { type: "verifyRegion", step: 7, ...ver.region };

  const result = assembleResult({
    pass: ver.pass, tampered: false, id, colour, seed, shape: win.S, genus, area, bounds: win.bounds, B: win.B, lift,
    x0, d0, Xs, Mx, D, Md, dIndex, smallPrimes: sp.primes, rows, emptyRows: sr.emptyRows, forced: forced.cells,
    digits, sha256, verify: { rows: ver.rows, region: ver.region },
  });
  result.peakBytes = ctx.peakBytes;
  yield { type: "done", step: 7, pass: ver.pass, ms: now() - tStart };
  return result;
}

// Build the PackedData, the witness, the packed object and the token of a result (fields of section "Result").
export function assembleResult(r) {
  const smallPrimes = r.smallPrimes.map((s) => ({ p: s.p, kind: s.kind, a: s.a, b: s.b, xRes: s.xRes, xMod: s.xMod, dRes: s.dRes, forced: s.forced }));
  const data = {
    id: r.id, colour: r.colour, genus: r.genus, B: r.B, seed: [r.seed[0], r.seed[1]], shape: r.shape.map(([i, j]) => [i, j]),
    smallPrimes: r.smallPrimes.map((s) => ({ p: s.p, xRes: Number(r.x0 % BigInt(s.xMod)), dRes: s.dRes === null ? null : Number(r.d0 % BigInt(s.p)) })),
    dIndex: r.dIndex,
    rows: r.rows.map((w) => ({ j: w.j, q1: w.q1, q2: w.q2, r1: w.r1, r2: w.r2, rho: w.rho })),
  };
  return {
    pass: r.pass, tampered: r.tampered, id: r.id, colour: r.colour, seed: data.seed, shape: data.shape, genus: r.genus, area: r.area,
    bounds: r.bounds, B: r.B, lift: r.lift, x0: r.x0, d0: r.d0, Xs: r.Xs, Mx: r.Mx, D: r.D, Md: r.Md, dIndex: r.dIndex,
    smallPrimes,
    rows: r.rows.map((w) => ({ j: w.j, k: w.k, cells: w.cells, L: w.L, q1: w.q1, q2: w.q2, r1: w.r1, r2: w.r2, rho: w.rho, u: w.u, c: w.c, attempts: w.attempts })),
    emptyRows: r.emptyRows, forced: r.forced, digits: r.digits, sha256: r.sha256,
    data,
    witness: makeWitness({ id: r.id, colour: r.colour, x0: r.x0, d0: r.d0, seed: data.seed, shape: data.shape }),
    packed: formatPacked(data, r.x0, r.d0),
    token: encodeToken(data, r.x0, { withId: false }),
    verify: r.verify,
  };
}

// runToEnd(input, hooks) runs the construction to its end and returns { events, result } (result null after an
// error event).
export function runToEnd(input, hooks) {
  return collectEvents(construct(input, hooks));
}

const DROP_FIELDS = new Set(["ms", "tried2", "mode", "byRule"]);

// canonicalEvents(events) returns the event list without what depends on timing or on the way the choices were
// found: rowProgress, rowRetry, every event from a rejected dCandidate up to its dRejected, every rowTarget but the
// last of each row, and the fields ms, tried2, mode, byRule. Live and replay of the same result give equal lists.
export function canonicalEvents(events) {
  const keep = new Array(events.length).fill(true);
  for (let k = 0; k < events.length; k++) {
    if (events[k].type !== "dCandidate") continue;
    let e = k + 1;
    while (e < events.length && events[e].type !== "dRejected" && events[e].type !== "dCandidate" && events[e].step <= 5) e++;
    if (e < events.length && events[e].type === "dRejected") for (let m = k; m <= e; m++) keep[m] = false;
  }
  const lastTarget = new Map();
  events.forEach((ev, k) => {
    if (keep[k] && ev.type === "rowTarget") lastTarget.set(ev.j, k);
  });
  const out = [];
  events.forEach((ev, k) => {
    if (!keep[k] || ev.type === "rowProgress" || ev.type === "rowRetry") return;
    if (ev.type === "rowTarget" && lastTarget.get(ev.j) !== k) return;
    out.push(withoutFields(ev, DROP_FIELDS));
  });
  return out;
}

// eventToJSON(e) returns a copy of an event (or any value) with every bigint written as a decimal string.
export { eventToJSON };

// runBatched(input, post, { maxEvents, maxMs, id, hooks }) runs the construction and hands its events to post in
// batches { id, events } (a batch is sent after maxEvents events, after maxMs milliseconds, and right after the
// rowTarget of a row with more than 20 sign cells, before its long solve starts), then { id, finished: true,
// result } (result null after an error event). Returns the result.
export function runBatched(input, post, { maxEvents = 200, maxMs = 50, id = null, hooks } = {}) {
  return postInBatches(construct(input, hooks), post, { maxEvents, maxMs, id });
}
