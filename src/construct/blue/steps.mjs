// Steps 0 to 4 of the blue construction as one generator of events, shared by a live run, a replay and the opening
// of a blue link (which needs x0 and d0 but no final check).
//
//   0  the window W = S u N(S) and B = max(h, w, 7)
//   1  one class per prime p <= B (chosen, or read from the stored data in a replay)
//   2  a private prime for every cell of S that no class holds
//   3  d0, the first admissible value of the CRT of the d0 conditions
//   4  x0, the first candidate of the CRT of the x0 conditions with gcd(x0 + i, d0 + j) = 1 on N(S)

import { CodedError, digitCount } from "../../core/bigint_utils.mjs";
import { cellKey } from "../../core/geometry.mjs";
import { buildWindow } from "../window.mjs";
import { forcedUnion } from "../small_primes.mjs";
import { chooseClassesIter, chooseClasses, readStoredClasses } from "./classes.mjs";
import { assignPrivatePrimes } from "./private_primes.mjs";
import { blueConditions, crtBase, scanX0Iter } from "./scan.mjs";

// Default number of candidates for x0 (a guard against a damaged input: an admissible shape never needs it).
export const MAX_X0 = 10000;
// Number of rejected candidates for x0 that are reported as events (the accepted one always is).
export const X_EVENT_LIMIT = 200;
// At most one progress event per this many milliseconds.
const PROGRESS_MS = 100;

const now = () => globalThis.performance.now();

const errorEvent = (step, code, message, extra = {}) => ({ type: "error", step, code, message, ...extra });

// progressEvents(it, step, phase, live) drives the generator `it` (records { done, total }) and returns its return
// value. When live is true its records become blueProgress events, at most 10 per second.
export function* progressEvents(it, step, phase, live) {
  let last = -Infinity;
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    if (!live) continue;
    const t = now();
    if (t - last < PROGRESS_MS) continue;
    last = t;
    yield { type: "blueProgress", step, phase, done: r.value.done, total: r.value.total };
  }
}

// blueSteps({ cells, replay, maxX0 }) yields the events of steps 0 to 4 for a normalised shape (cells sorted by
// (j, i)) and returns { win, classes, forced, privates, passes, D, Md, dIndex, d0, X, Mx, xIndex, x0 }, or null after
// an error event (codes "inadmissible", "replay_mismatch", "no_x0"). With replay (a BlueData object) the classes
// are read from it and checked instead of chosen, and no progress event is emitted.
export function* blueSteps({ cells, replay = null, maxX0 = MAX_X0 }) {
  const live = !replay;
  const win = buildWindow(cells);
  yield { type: "window", step: 0, S: win.S, N: win.N, bounds: win.bounds, h: win.h, w: win.w, B: win.B };

  // step 1
  let classes, passes = null, rule = null;
  if (live) {
    const ch = yield* progressEvents(chooseClassesIter(win), 1, "classes", true);
    if (ch.inadmissible) {
      yield errorEvent(1, "inadmissible", `every class mod ${ch.inadmissible} holds a cell of N(S)`, { p: ch.inadmissible });
      return null;
    }
    ({ classes, passes } = ch);
  } else {
    const st = readStoredClasses(win, replay);
    if (st.mismatch) {
      yield errorEvent(1, "replay_mismatch", st.mismatch);
      return null;
    }
    classes = st.classes;
    rule = chooseClasses(win).classes;
  }
  const seen = new Set();
  for (let k = 0; k < classes.length; k++) {
    const c = classes[k];
    const fresh = c.members.filter(([i, j]) => !seen.has(cellKey(i, j)));
    for (const [i, j] of c.members) seen.add(cellKey(i, j));
    yield {
      type: "classPrime", step: 1, p: c.p, a: c.a, b: c.b, xRes: c.xRes, dRes: c.dRes, members: c.members, fresh,
      greedy: live ? c.greedy : null, byRule: live || (rule[k].a === c.a && rule[k].b === c.b),
    };
  }
  const forced = forcedUnion(classes.map((c) => ({ forced: c.members })));
  const privates = assignPrivatePrimes(win, forced.keys);
  yield {
    type: "classesDone", step: 1, forcedCount: forced.cells.length, remaining: privates.map(({ i, j }) => [i, j]), passes,
  };

  // step 2
  for (const pr of privates) yield { type: "privatePrime", step: 2, ...pr };

  // step 3
  const conds = blueConditions(classes, privates);
  const dB = crtBase(conds.d, win.bounds.jmin);
  for (let k = 0; k < conds.d.length; k++) {
    const c = conds.d[k];
    yield { type: "dCrtStep", step: 3, index: k, kind: c.kind, modulus: c.modulus, residue: c.residue, D: dB.steps[k].x, Md: dB.steps[k].M };
  }
  const d0 = dB.value;
  yield { type: "dChosen", step: 3, d0, index: dB.index, digitsD: digitCount(d0) };

  // step 4
  const xB = crtBase(conds.x, win.bounds.imin);
  for (let k = 0; k < conds.x.length; k++) {
    const c = conds.x[k];
    yield { type: "xCrtStep", step: 4, index: k, kind: c.kind, modulus: c.modulus, residue: c.residue, digitsSoFar: digitCount(xB.steps[k].x) };
  }
  yield { type: "xBase", step: 4, X: xB.base, Mx: xB.M, index: xB.index };
  const scan = scanX0Iter({ X: xB.base, Mx: xB.M, start: xB.index, d0, N: win.N, maxX0 });
  let rejected = 0;
  let found;
  for (;;) {
    const r = scan.next();
    if (r.done) {
      found = r.value;
      break;
    }
    const { index, ok, bad, digits } = r.value;
    if (ok || rejected < X_EVENT_LIMIT) yield { type: "xCandidate", step: 4, index, ok, bad, digits };
    if (!ok) rejected++;
  }
  if (found === null) {
    yield errorEvent(4, "no_x0", `no candidate x0 among ${maxX0} is prime to d0 + j on every neighbour of the shape`);
    return null;
  }
  return {
    win, classes, forced: forced.cells, privates, passes, D: dB.base, Md: dB.M, dIndex: dB.index, d0,
    X: xB.base, Mx: xB.M, xIndex: found.index, x0: found.x0,
  };
}

// rebuildBlueIter(data, maxX0) runs steps 0 to 4 on a BlueData object as a replay (the opening of a blue link): it
// yields the events of blueSteps (for a progress display) and returns the value of blueSteps. Throws a CodedError
// with the code of the error event ("replay_mismatch", "no_x0").
export function* rebuildBlueIter(data, maxX0 = MAX_X0) {
  const gen = blueSteps({ cells: data.shape, replay: data, maxX0 });
  let error = null;
  for (;;) {
    const r = gen.next();
    if (r.done) {
      if (r.value === null) throw new CodedError(error.code, error.message);
      return r.value;
    }
    if (r.value.type === "error") error = r.value;
    else yield r.value;
  }
}
