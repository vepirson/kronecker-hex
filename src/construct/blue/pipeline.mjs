// The construction of a blue region of a prescribed shape, as a generator of events.
//
// A cell (x, d) is blue when gcd(x, d) > 1. Given a finite shape S (a connected list of offsets) whose neighbour set
// N(S) is admissible, and a seed cell of S, it produces integers x0, d0 such that the blue region containing the
// seed cell (x0 + s_i, d0 + s_j) is exactly the translate of S: every cell of S gets a prime dividing both of its
// coordinates, every cell of N(S) gets coprime coordinates. The signs of the colouring never matter. The steps
// (numbered as in the blue Construction Lab):
//   0  the window W = S u N(S) and the bound B = max(h, w, 7)
//   1  a class (a, b) per prime p <= B: x0 = -a, d0 = -b mod p, its cells of S become blue
//   2  a private prime q > B for every other cell (i, j) of S: x0 = -i, d0 = -j mod q
//   3  d0 by the CRT, the first value with d0 + j_min >= 1
//   4  x0 by the CRT and a scan for gcd(x0 + i, d0 + j) = 1 on N(S)
//   5  the check of the result by Kronecker symbols and a flood fill
// Every choice has a fixed tie-break, so the same input always gives the same x0 and d0.
//
// With input.replay (a BlueData object) the classes are read from the data and checked instead of chosen, and steps
// 2 to 5 run as in a live run. A live run emits blueProgress events, a replay only with input.progress = true (a
// replay in the worker, whose page shows the progress).

import { CodedError } from "../../core/bigint_utils.mjs";
import { sha256Hex } from "../../core/sha256.mjs";
import { normaliseShape } from "../../core/shapes.mjs";
import { makeWitness } from "../../formats/witness.mjs";
import { encodeToken } from "../../formats/token.mjs";
import { verifyConstructionIter } from "../verify.mjs";
import { withoutFields } from "../events.mjs";
import { blueSteps, progressEvents, MAX_X0 } from "./steps.mjs";

// The version of the blue algorithm (any change of a rule or a tie-break gets a new version).
export const VERSION_BLUE = "construct_blue_v1";

const now = () => globalThis.performance.now();

// Check the input and return the normalised fields, or a message.
function readInput(input) {
  if (input === null || typeof input !== "object") return { message: "the input is not an object" };
  const replay = input.replay;
  let shape, seed, colour, id;
  if (replay !== undefined) {
    if (replay === null || typeof replay !== "object") return { message: "replay is not a BlueData object" };
    ({ shape, seed, colour } = replay);
    id = replay.id === undefined ? null : replay.id;
  } else {
    ({ shape, seed, colour } = input);
    id = input.id === undefined ? null : input.id;
  }
  const maxX0 = input.maxX0 === undefined ? MAX_X0 : input.maxX0;
  let norm;
  try {
    norm = normaliseShape({ shape, seed });
  } catch (e) {
    if (e instanceof CodedError) return { message: `shape: ${e.message}` };
    throw e;
  }
  if (colour !== 0) return { message: "colour must be 0 (blue)" };
  if (!Number.isSafeInteger(maxX0) || maxX0 < 1) return { message: "maxX0 must be a positive integer" };
  if (id !== null && typeof id !== "string") return { message: "id must be a string or null" };
  const progress = replay === undefined || input.progress === true;
  return { ok: true, cells: norm.cells, seed: norm.seed, genus: norm.genus, area: norm.area, id, maxX0, replay: replay || null, progress };
}

// constructBlue(input) is a generator of the events of the blue construction. It returns the result object, or
// null after an error event (codes "bad_input", "inadmissible", "no_x0", "replay_mismatch").
export function* constructBlue(input) {
  const tStart = now();
  const inp = readInput(input);
  if (!inp.ok) {
    yield { type: "error", step: 0, code: "bad_input", message: inp.message };
    return null;
  }
  const { cells, seed, genus, area, id, maxX0, replay, progress } = inp;
  const live = !replay;
  yield { type: "start", step: 0, colour: 0, mode: live ? "live" : "replay", area, id, version: VERSION_BLUE };

  // steps 0 to 4
  const st = yield* blueSteps({ cells, replay, maxX0 });
  if (st === null) return null;
  const { win, x0, d0 } = st;
  const sx = x0.toString(), sd = d0.toString();
  const sha256 = { x0: sha256Hex(sx), d0: sha256Hex(sd) };
  const digits = { x0: sx.length, d0: sd.length };
  yield { type: "glued", step: 4, x0, d0, xIndex: st.xIndex, digitsX: digits.x0, digitsD: digits.d0, sha256x: sha256.x0, sha256d: sha256.d0 };

  // step 5
  const ver = yield* progressEvents(verifyConstructionIter({ x0, d0, shape: win.S, seed, colour: 0, forced: st.forced }), 5, "verify", progress);
  for (const r of ver.rows) yield { type: "verifyRow", step: 5, ...r };
  yield { type: "verifyRegion", step: 5, ...ver.region };

  const data = {
    id, colour: 0, genus, B: win.B, seed: [seed[0], seed[1]], shape: win.S.map(([i, j]) => [i, j]),
    classes: st.classes.map(({ p, xRes, dRes }) => ({ p, xRes, dRes })),
  };
  const result = {
    pass: ver.pass, id, colour: 0, seed: data.seed, shape: data.shape, genus, area, bounds: win.bounds, B: win.B,
    x0, d0, D: st.D, Md: st.Md, X: st.X, Mx: st.Mx, xIndex: st.xIndex,
    classes: st.classes.map(({ p, a, b, xRes, dRes, members }) => ({ p, a, b, xRes, dRes, members })),
    privates: st.privates.map(({ i, j, q }) => ({ i, j, q })),
    forced: st.forced, digits, sha256, data,
    witness: makeWitness({ id, colour: 0, x0, d0, seed: data.seed, shape: data.shape }),
    token: encodeToken(data, x0, { withId: false }),
    verify: { rows: ver.rows, region: ver.region },
  };
  yield { type: "done", step: 5, pass: ver.pass, ms: now() - tStart };
  return result;
}

const DROP_FIELDS = new Set(["ms", "mode", "byRule", "greedy", "passes"]);

// canonicalBlueEvents(events) returns the event list of a blue construction without what depends on timing or on
// the way the classes were found: the blueProgress events and the fields ms, mode, byRule, greedy, passes. Live and
// replay of the same result give equal lists.
export function canonicalBlueEvents(events) {
  return events.filter((ev) => ev.type !== "blueProgress").map((ev) => withoutFields(ev, DROP_FIELDS));
}
