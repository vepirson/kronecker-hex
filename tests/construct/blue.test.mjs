// The blue construction: the 21 reference constructions in tests/fixtures/blue_ref (made by an independent builder
// in scan mode), live against replay, the replay checks, the error paths, the pass rule of step 1 on a hand-made
// case, the efficient step 1 against a naive one, the final check for colour 0, the view model, the cell facts and
// the dispatching entry point.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { constructBlue, canonicalBlueEvents, VERSION_BLUE } from "../../src/construct/blue/pipeline.mjs";
import { blueSteps, rebuildBlueIter, X_EVENT_LIMIT } from "../../src/construct/blue/steps.mjs";
import { chooseClasses, chooseClassesIter, readStoredClasses } from "../../src/construct/blue/classes.mjs";
import { assignPrivatePrimes } from "../../src/construct/blue/private_primes.mjs";
import { blueConditions, crtBase, scanX0Iter } from "../../src/construct/blue/scan.mjs";
import { buildBlueView, BLUE_STEP_COUNT } from "../../src/construct/blue/lab_view.mjs";
import { blueCellFacts } from "../../src/construct/blue/inspect.mjs";
import { buildWindow } from "../../src/construct/window.mjs";
import { buildWindow as buildSignWindow } from "../../src/construct/small_primes.mjs";
import { firstCandidateIndex } from "../../src/construct/cofactor.mjs";
import { verifyConstruction, NONZERO } from "../../src/construct/verify.mjs";
import { collectEvents, drain } from "../../src/construct/events.mjs";
import { kindOf, constructAny, runToEnd, runBatched, canonicalEvents } from "../../src/construct/index.mjs";
import { runToEnd as runSignToEnd, VERSION } from "../../src/construct/pipeline.mjs";
import { normaliseShape, shapeS, seedS, shapeZ, seedZ } from "../../src/core/shapes.mjs";
import { primesUpTo } from "../../src/core/primes.mjs";
import { cellKey } from "../../src/core/geometry.mjs";
import { gcdBig } from "../../src/core/bigint_utils.mjs";
import { verifyWitness } from "../../src/formats/witness.mjs";
import { parsePacked } from "../../src/formats/packed.mjs";

const dir = new URL("../fixtures/blue_ref/", import.meta.url);
const NAMES = fs.readdirSync(dir).filter((f) => f.endsWith(".ref.json")).sort().map((f) => f.replace(".ref.json", ""));
const REFS = Object.fromEntries(NAMES.map((n) => [n, JSON.parse(fs.readFileSync(new URL(`${n}.ref.json`, dir), "ascii"))]));
const inputOf = (ref) => ({ shape: ref.shape, seed: ref.seed, colour: 0, id: null });
const lastError = (events) => {
  const e = events[events.length - 1];
  assert.equal(e.type, "error");
  return e;
};

const LIVE = {};
const liveOf = (name) => {
  if (!LIVE[name]) LIVE[name] = collectEvents(constructBlue(inputOf(REFS[name])));
  return LIVE[name];
};

test("the 21 reference files are present", () => {
  assert.equal(NAMES.length, 21);
  assert.deepEqual(NAMES.filter((n) => /^z\d\d$/.test(n)), ["z01", "z02", "z03", "z04", "z05", "z06", "z07", "z08", "z09", "z10"]);
});

test("live runs equal the 21 references on B, classes, forced count, private primes, x0 index, x0 and d0", () => {
  for (const name of NAMES) {
    const ref = REFS[name];
    const c = ref.construction;
    const { result: r } = liveOf(name);
    assert.ok(r, name);
    assert.equal(r.pass, true, name);
    assert.equal(r.B, c.B, name);
    assert.deepEqual(Object.fromEntries(r.classes.map((k) => [String(k.p), [k.a, k.b]])), c.small_prime_classes, name);
    assert.equal(r.forced.length, c.forced_blue_cells, name);
    assert.equal(r.privates.length, c.private_primes, name);
    assert.deepEqual(r.privates.length ? [r.privates[0].q, r.privates[r.privates.length - 1].q] : null, c.private_prime_range, name);
    assert.equal(c.d0_index, 0, name);
    assert.equal(r.xIndex, BigInt(c.x0_index), name);
    assert.equal(r.x0.toString(), ref.x0, name);
    assert.equal(r.d0.toString(), ref.d0, name);
    assert.equal(r.colour, 0);
    assert.equal(r.genus, ref.genus, name);
    assert.equal(r.area, ref.area, name);
    const v = verifyWitness(r.witness);
    assert.equal(v.pass, true, `${name}: ${v.reasons.join("; ")}`);
    assert.equal(r.witness.x0, ref.x0);
    assert.equal(r.packed, undefined);
    assert.equal(r.rows, undefined);
    assert.equal(r.tampered, undefined);
  }
});

const KEPT_TYPES = ["start", "window", "classPrime", "classesDone", "privatePrime", "dCrtStep", "dChosen", "xCrtStep", "xBase", "xCandidate", "glued", "verifyRow", "verifyRegion", "done"];
const collapse = (types) => types.filter((t, k) => k === 0 || types[k - 1] !== t);

test("live and replay of the live data give equal canonical events, and the kept event types are the full list", () => {
  for (const name of NAMES) {
    const live = liveOf(name);
    const rep = collectEvents(constructBlue({ replay: live.result.data }));
    assert.ok(rep.result, name);
    assert.equal(rep.result.pass, true, name);
    const a = canonicalBlueEvents(live.events);
    const b = canonicalBlueEvents(rep.events);
    assert.deepEqual(a, b, name);
    const want = live.result.privates.length ? KEPT_TYPES : KEPT_TYPES.filter((t) => t !== "privatePrime");
    assert.deepEqual(collapse(a.map((e) => e.type)), want, name);
    assert.equal(rep.result.token, live.result.token, name);
    assert.equal(rep.events[0].mode, "replay");
    assert.ok(rep.events.every((e) => e.type !== "blueProgress"));
    for (const e of rep.events.filter((ev) => ev.type === "classPrime")) {
      assert.equal(e.greedy, null);
      assert.equal(e.byRule, true);
    }
    assert.equal(rep.events.find((e) => e.type === "classesDone").passes, null);
    // the dropped fields are exactly ms, mode, byRule, greedy, passes
    for (const e of a) for (const f of ["ms", "mode", "byRule", "greedy", "passes"]) assert.equal(e[f], undefined);
  }
});

test("the events of a live run carry the numbers of the result", () => {
  const { events, result } = liveOf("z02");
  assert.deepEqual(events[0], { type: "start", step: 0, colour: 0, mode: "live", area: 17, id: null, version: VERSION_BLUE });
  const cls = events.filter((e) => e.type === "classPrime");
  assert.deepEqual(cls.map((e) => e.p), primesUpTo(result.B));
  for (const e of cls) {
    assert.equal(e.byRule, true);
    assert.equal(e.xRes, (e.p - e.a) % e.p);
    assert.equal(e.dRes, (e.p - e.b) % e.p);
    assert.ok(Array.isArray(e.greedy));
  }
  const done1 = events.find((e) => e.type === "classesDone");
  assert.equal(done1.forcedCount, 13);
  assert.equal(done1.remaining.length, 4);
  assert.equal(done1.passes, 1);
  const d = events.filter((e) => e.type === "dCrtStep");
  assert.equal(d.length, cls.length + 4);
  assert.deepEqual(d.map((e) => e.kind), [...cls.map(() => "class"), "private", "private", "private", "private"]);
  assert.equal(d[d.length - 1].D, result.D);
  assert.equal(d[d.length - 1].Md, result.Md);
  assert.deepEqual(events.find((e) => e.type === "dChosen"), { type: "dChosen", step: 3, d0: result.d0, index: 0n, digitsD: 7 });
  assert.deepEqual(events.find((e) => e.type === "xBase"), { type: "xBase", step: 4, X: result.X, Mx: result.Mx, index: 0n });
  const xc = events.filter((e) => e.type === "xCandidate");
  assert.deepEqual(xc.map((e) => [e.index, e.ok]), [[0n, false], [1n, false], [2n, false], [3n, true]]);
  for (const e of xc.slice(0, 3)) {
    const [i, j] = e.bad;
    assert.notEqual(gcdBig(result.X + e.index * result.Mx + BigInt(i), result.d0 + BigInt(j)), 1n);
  }
  const g = events.find((e) => e.type === "glued");
  assert.equal(g.xIndex, 3n);
  assert.equal(g.x0, result.x0);
  assert.equal(events.filter((e) => e.type === "verifyRow").length, result.bounds.jmax - result.bounds.jmin + 1);
  assert.equal(events[events.length - 1].type, "done");
  assert.ok(events.every((e) => Number.isInteger(e.step) && e.step >= 0 && e.step < 6));
});

// A naive step 1 written from the rule alone: every class of every prime is a candidate.
function naiveClasses(win) {
  const mod = (a, m) => ((a % m) + m) % m;
  const primes = primesUpTo(win.B);
  const allowed = {}, members = {};
  for (const p of primes) {
    const hit = new Set(win.N.map(([i, j]) => `${mod(i, p)},${mod(j, p)}`));
    allowed[p] = [];
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) if (!hit.has(`${a},${b}`)) allowed[p].push([a, b]);
    for (const [a, b] of allowed[p]) members[`${p},${a},${b}`] = win.S.filter(([i, j]) => mod(i, p) === a && mod(j, p) === b).map(([i, j]) => cellKey(i, j));
  }
  const greater = (u, v) => {
    for (let k = 0; k < u.length; k++) if (u[k] !== v[k]) return u[k] > v[k];
    return false;
  };
  const best = (p, others) => {
    let top = null, tk = null;
    for (const [a, b] of allowed[p]) {
      const m = members[`${p},${a},${b}`];
      const key = [m.filter((k) => !others.has(k)).length, m.length, -a, -b];
      if (tk === null || greater(key, tk)) {
        top = [a, b];
        tk = key;
      }
    }
    return top;
  };
  const choice = {};
  const covered = new Set();
  for (const p of primes) {
    choice[p] = best(p, covered);
    for (const k of members[`${p},${choice[p][0]},${choice[p][1]}`]) covered.add(k);
  }
  let passes = 0;
  for (let it = 1; it <= 20; it++) {
    passes = it;
    let changed = 0;
    for (const p of primes) {
      const others = new Set();
      for (const q of primes) if (q !== p) for (const k of members[`${q},${choice[q][0]},${choice[q][1]}`]) others.add(k);
      const nw = best(p, others);
      const fresh = ([a, b]) => members[`${p},${a},${b}`].filter((k) => !others.has(k)).length;
      if (fresh(nw) > fresh(choice[p])) {
        choice[p] = nw;
        changed++;
      }
    }
    if (changed === 0) break;
  }
  return { classes: primes.map((p) => [p, ...choice[p]]), passes };
}

test("the efficient step 1 equals a naive step 1 on the 21 references", () => {
  for (const name of NAMES) {
    const ref = REFS[name];
    const win = buildWindow(normaliseShape({ shape: ref.shape, seed: ref.seed }).cells);
    const fast = chooseClasses(win);
    const slow = naiveClasses(win);
    assert.deepEqual(fast.classes.map((c) => [c.p, c.a, c.b]), slow.classes, name);
    assert.equal(fast.passes, slow.passes, name);
  }
});

test("the pass rule on a hand-made case: a replacement is seen by the later primes of the same pass", () => {
  // Ten cells, no neighbours, primes 2 and 3. Greedy: (0, 0) mod 2 (5 cells), then (0, 0) mod 3. Pass 1: the class
  // of 2 becomes (0, 1), and the prime 3, which sees that change at once, moves to (1, 0). Pass 2 changes nothing.
  // Reading the classes of the start of each pass instead would move the prime 3 only in pass 2 and need 3 passes.
  const S = [[0, 0], [6, 0], [4, 0], [10, 0], [16, 0], [0, 3], [0, 1], [0, 5], [4, 1], [4, 5]];
  const win = { S, N: [], B: 3 };
  const r = chooseClasses(win);
  assert.deepEqual(r.classes.map((c) => [c.p, c.a, c.b]), [[2, 0, 1], [3, 1, 0]]);
  assert.deepEqual(r.classes.map((c) => c.greedy), [[0, 0], [0, 0]]);
  assert.equal(r.passes, 2);
  assert.equal(new Set(r.classes.flatMap((c) => c.members.map(([i, j]) => cellKey(i, j)))).size, 8);
});

test("step 1 reports its progress and the first inadmissible prime", () => {
  const win = buildWindow(normaliseShape({ shape: REFS.z03.shape, seed: REFS.z03.seed }).cells);
  const it = chooseClassesIter(win);
  const records = [];
  let r = it.next();
  while (!r.done) {
    records.push(r.value);
    r = it.next();
  }
  assert.deepEqual(records.map((x) => x.done), primesUpTo(win.B).map((_, k) => k + 1));
  assert.ok(records.every((x) => x.total === primesUpTo(win.B).length));
  // S_1 is a green shape: every class mod 2 holds a neighbour
  const { events, result } = runToEnd({ shape: shapeS(1), seed: seedS(1), colour: 0 });
  assert.equal(result, null);
  const e = lastError(events);
  assert.equal(e.code, "inadmissible");
  assert.equal(e.p, 2);
  assert.equal(e.step, 1);
});

test("private primes, conditions and the start index", () => {
  const win = buildWindow(normaliseShape({ shape: REFS.z02.shape, seed: REFS.z02.seed }).cells);
  const { classes } = chooseClasses(win);
  const keys = new Set(classes.flatMap((c) => c.members.map(([i, j]) => cellKey(i, j))));
  const pr = assignPrivatePrimes(win, keys);
  assert.deepEqual(pr.map((x) => x.q), [11, 13, 17, 19]);
  assert.deepEqual(pr.map((x) => x.index), [0, 1, 2, 3]);
  const conds = blueConditions(classes, pr);
  assert.equal(conds.x.length, classes.length + 4);
  assert.deepEqual(conds.x[conds.x.length - 1], { kind: "private", residue: BigInt((19 - pr[3].i) % 19), modulus: 19n });
  // the start index: the smallest t >= 0 with D + t M + low >= 1
  assert.equal(firstCandidateIndex(0n, 5n, -12), 3n);
  assert.equal(firstCandidateIndex(3n, 5n, -12), 2n);
  assert.equal(firstCandidateIndex(3n, 5n, -2), 0n);
  const cb = crtBase([{ residue: 0n, modulus: 5n }], -12);
  assert.deepEqual([cb.base, cb.M, cb.index, cb.value], [0n, 5n, 3n, 15n]);
  assert.ok(cb.value + -12n >= 1n && cb.value - 5n + -12n < 1n);
});

test("maxX0: 1 gives no_x0 on the references whose x0 index is above 0", () => {
  for (const name of ["z02", "z06", "rnd04", "rnd05"]) {
    assert.ok(REFS[name].construction.x0_index > 0);
    const { events, result } = runToEnd({ ...inputOf(REFS[name]), maxX0: 1 });
    assert.equal(result, null, name);
    const e = lastError(events);
    assert.equal(e.code, "no_x0", name);
    assert.equal(e.step, 4);
    assert.equal(events.filter((ev) => ev.type === "xCandidate").length, 1);
  }
  const ok = runToEnd({ ...inputOf(REFS.z02), maxX0: 4 });
  assert.equal(ok.result.pass, true);
});

test("the scan reports at most the first rejected candidates and the accepted one", () => {
  assert.equal(X_EVENT_LIMIT, 200);
  const win = buildWindow(normaliseShape({ shape: REFS.z02.shape, seed: REFS.z02.seed }).cells);
  const r = drain(blueSteps({ cells: win.S }));
  const recs = [];
  const it = scanX0Iter({ X: r.X, Mx: r.Mx, start: 0n, d0: r.d0, N: win.N, maxX0: 10 });
  let s = it.next();
  while (!s.done) {
    recs.push(s.value);
    s = it.next();
  }
  assert.deepEqual(recs.map((x) => x.ok), [false, false, false, true]);
  assert.equal(s.value.index, 3n);
  assert.equal(s.value.x0, r.x0);
});

test("replay checks: wrong B, missing or extra prime, a class holding a neighbour, a residue out of range", () => {
  const data = liveOf("z03").result.data;
  const code = (replay) => {
    const { events, result } = runToEnd({ replay });
    assert.equal(result, null);
    const e = lastError(events);
    assert.equal(e.step, 1);
    return e.code;
  };
  assert.equal(code({ ...data, B: data.B + 1 }), "replay_mismatch");
  assert.equal(code({ ...data, classes: data.classes.slice(1) }), "replay_mismatch");
  assert.equal(code({ ...data, classes: data.classes.slice(0, -1) }), "replay_mismatch");
  assert.equal(code({ ...data, classes: [...data.classes, { p: 13, xRes: 0, dRes: 0 }] }), "replay_mismatch");
  assert.equal(code({ ...data, classes: data.classes.map((c) => (c.p === 3 ? { ...c, xRes: 3 } : c)) }), "replay_mismatch");
  assert.equal(code({ ...data, classes: data.classes.map((c) => (c.p === 5 ? { ...c, dRes: -1 } : c)) }), "replay_mismatch");
  assert.equal(code({ ...data, classes: data.classes.map((c) => (c.p === 7 ? { ...c, xRes: 0.5 } : c)) }), "replay_mismatch");
  // the class of the neighbour (-1, 0) mod 3: a = 2, b = 0, so xRes = 1, dRes = 0
  const win = buildWindow(data.shape);
  assert.ok(win.N.some(([i, j]) => i === -1 && j === 0));
  assert.equal(code({ ...data, classes: data.classes.map((c) => (c.p === 3 ? { p: 3, xRes: 1, dRes: 0 } : c)) }), "replay_mismatch");
  assert.ok(readStoredClasses(win, data).classes);
});

test("a changed class that is still allowed replays with byRule false and passes the final check", () => {
  let checked = 0;
  for (const name of ["z03", "z05", "rnd01", "h19"]) {
    const data = liveOf(name).result.data;
    const win = buildWindow(data.shape);
    const mod = (a, m) => ((a % m) + m) % m;
    const p = 5;
    const cur = data.classes.find((c) => c.p === p);
    // another allowed class of 5: the first (a, b) that holds no neighbour and is not the stored one
    let alt = null;
    for (let a = 0; a < p && !alt; a++) {
      for (let b = 0; b < p && !alt; b++) {
        const c = { p, xRes: mod(-a, p), dRes: mod(-b, p) };
        if (c.xRes === cur.xRes && c.dRes === cur.dRes) continue;
        if (!win.N.some(([i, j]) => mod(i, p) === a && mod(j, p) === b)) alt = c;
      }
    }
    assert.ok(alt, name);
    const { events, result } = runToEnd({ replay: { ...data, classes: data.classes.map((c) => (c.p === p ? alt : c)) } });
    assert.ok(result, name);
    assert.equal(result.pass, true, name);
    const e5 = events.find((ev) => ev.type === "classPrime" && ev.p === p);
    assert.equal(e5.byRule, false, name);
    assert.ok(events.filter((ev) => ev.type === "classPrime" && ev.p !== p).every((ev) => ev.byRule === true), name);
    assert.notEqual(result.x0, liveOf(name).result.x0, name);
    checked++;
  }
  assert.equal(checked, 4);
});

test("bad input", () => {
  const bad = (input) => {
    const { events, result } = runToEnd(input);
    assert.equal(result, null);
    assert.equal(events.length, 1);
    assert.equal(lastError(events).step, 0);
    return lastError(events).code;
  };
  const z = REFS.z01;
  assert.equal(bad({ shape: z.shape, seed: [50, 50], colour: 0 }), "bad_input");
  assert.equal(bad({ shape: [[0, 0], [5, 5]], seed: [0, 0], colour: 0 }), "bad_input");
  assert.equal(bad({ shape: z.shape, seed: z.seed, colour: 0, maxX0: 0 }), "bad_input");
  assert.equal(bad({ shape: z.shape, seed: z.seed, colour: 0, id: 7 }), "bad_input");
  assert.equal(bad({ replay: { ...liveOf("z01").result.data, colour: 0, shape: null } }), "bad_input");
  // constructBlue itself refuses a sign colour
  const { events } = collectEvents(constructBlue({ shape: z.shape, seed: z.seed, colour: 1 }));
  assert.equal(lastError(events).code, "bad_input");
});

test("the final check for colour 0: zero on S, nonzero on N(S)", () => {
  const ref = REFS.h19;
  const x0 = BigInt(ref.x0), d0 = BigInt(ref.d0);
  const ok = verifyConstruction({ x0, d0, shape: ref.shape, seed: ref.seed, colour: 0, forced: [] });
  assert.equal(ok.pass, true);
  const sKeys = new Set(ref.shape.map(([i, j]) => cellKey(i, j)));
  for (const r of ok.rows) {
    for (const c of r.cells) {
      assert.equal(c.want, sKeys.has(cellKey(c.i, r.j)) ? 0 : NONZERO);
      if (c.want === NONZERO) assert.notEqual(c.got, 0);
      else assert.equal(c.got, 0);
    }
  }
  assert.equal(ok.region.colour, 0);
  assert.equal(ok.region.equalsShape, true);
  const bad = verifyConstruction({ x0: x0 + 1n, d0, shape: ref.shape, seed: ref.seed, colour: 0, forced: [] });
  assert.equal(bad.pass, false);
  assert.ok(bad.rows.some((r) => !r.ok));
});

test("the blue view model", () => {
  const { events, result } = liveOf("rnd04");
  const v = buildBlueView(events);
  assert.equal(BLUE_STEP_COUNT, 6);
  assert.deepEqual(v.available, [true, true, true, true, true, true]);
  assert.equal(v.start.version, VERSION_BLUE);
  assert.equal(v.classes.length, primesUpTo(result.B).length);
  assert.equal(v.privates.length, result.privates.length);
  assert.equal(v.dSteps.length, v.classes.length + result.privates.length);
  assert.equal(v.xSteps.length, v.dSteps.length);
  assert.equal(v.dChosen.d0, result.d0);
  assert.equal(v.xBase.X, result.X);
  assert.deepEqual(v.xCandidates.map((c) => c.ok), [false, true]);
  assert.equal(v.glued.x0, result.x0);
  assert.equal(v.verifyRows.length, result.bounds.jmax - result.bounds.jmin + 1);
  assert.equal(v.verifyRegion.equalsShape, true);
  assert.equal(v.done.pass, true);
  assert.equal(v.error, null);
  assert.equal(v.progress, null);
  // a growing list
  const part = buildBlueView(events.slice(0, 3));
  assert.deepEqual(part.available, [true, true, false, false, false, false]);
  assert.equal(part.glued, null);
  const prog = buildBlueView([...events.slice(0, 2), { type: "blueProgress", step: 1, phase: "classes", done: 1, total: 4 }]);
  assert.deepEqual(prog.progress, { phase: "classes", done: 1, total: 4 });
  const err = buildBlueView(runToEnd({ shape: shapeS(1), seed: seedS(1), colour: 0 }).events);
  assert.equal(err.error.code, "inadmissible");
});

test("blueCellFacts: the prime that makes a cell blue, coprime neighbours", () => {
  for (const name of ["z04", "pass01", "t6"]) {
    const { result } = liveOf(name);
    const win = buildWindow(result.shape);
    for (const [i, j] of win.S) {
      const f = blueCellFacts(result, i, j);
      const x = result.x0 + BigInt(i), d = result.d0 + BigInt(j);
      const q = BigInt(f.prime);
      assert.ok(x % q === 0n && d % q === 0n, `${name} (${i}, ${j})`);
      if (f.kind === "class") {
        const holders = result.classes.filter((c) => c.members.some(([a, b]) => a === i && b === j)).map((c) => c.p);
        assert.equal(f.prime, Math.min(...holders));
      } else {
        assert.equal(f.kind, "private");
        assert.ok(result.privates.some((p) => p.i === i && p.j === j && p.q === f.prime));
      }
    }
    for (const [i, j] of win.N) assert.deepEqual(blueCellFacts(result, i, j), { kind: "coprime", prime: null });
    assert.equal(blueCellFacts(result, win.bounds.imax + 5, 0), null);
  }
});

test("kindOf and the dispatching entry point", () => {
  assert.equal(kindOf({ colour: 0 }), "blue");
  assert.equal(kindOf({ colour: 1 }), "sign");
  assert.equal(kindOf({ colour: -1 }), "sign");
  assert.equal(kindOf({ replay: { colour: 0 } }), "blue");
  assert.equal(kindOf({ colour: 0, replay: { colour: 1 } }), "sign");
  assert.equal(kindOf(null), "sign");
  assert.equal(kindOf(undefined), "sign");
  const blue = constructAny(inputOf(REFS.t6)).next().value;
  assert.equal(blue.version, VERSION_BLUE);
  const sign = constructAny({ shape: shapeS(1), seed: seedS(1), colour: 1 }).next().value;
  assert.equal(sign.version, VERSION);
  // runToEnd of the entry point = the kind's own run
  const t6 = runToEnd(inputOf(REFS.t6));
  assert.equal(t6.result.x0.toString(), REFS.t6.x0);
  const s1 = runToEnd({ shape: shapeS(1), seed: seedS(1), colour: -1 });
  const s1own = runSignToEnd({ shape: shapeS(1), seed: seedS(1), colour: -1 });
  assert.equal(s1.result.x0, s1own.result.x0);
  assert.deepEqual(canonicalEvents(s1.events), canonicalEvents(s1own.events));
  // canonicalEvents dispatches on the start event
  assert.deepEqual(canonicalEvents(t6.events), canonicalBlueEvents(t6.events));
  // runBatched posts batches and the result for either kind
  for (const input of [inputOf(REFS.z05), { replay: parsePacked(JSON.parse(fs.readFileSync(new URL("../fixtures/packed_thin/green_s02.packed.json", import.meta.url), "ascii"))).data }]) {
    const msgs = [];
    const res = runBatched(input, (m) => msgs.push(m), { maxEvents: 7, id: "k" });
    const fin = msgs[msgs.length - 1];
    assert.equal(fin.finished, true);
    assert.equal(fin.result, res);
    assert.equal(res.pass, true);
    const all = msgs.slice(0, -1).flatMap((m) => m.events);
    assert.ok(msgs.slice(0, -1).every((m) => m.id === "k" && m.events.length <= 7));
    assert.deepEqual(canonicalEvents(all), canonicalEvents(runToEnd(input).events));
  }
  // the sign window is the shared window plus its colour
  const cells = shapeZ(2);
  assert.deepEqual(buildSignWindow(cells, -1), { ...buildWindow(cells), eps: -1 });
});

test("rebuildBlueIter: the numbers of a replay, the events of steps 0 to 4 only, and its errors as codes", () => {
  for (const name of ["z02", "hex18"]) {
    const { result } = liveOf(name);
    const { events, result: rb } = collectEvents(rebuildBlueIter(result.data));
    assert.equal(rb.x0, result.x0);
    assert.equal(rb.d0, result.d0);
    const steps = new Set(events.map((e) => e.step));
    assert.ok([0, 1, 3, 4].every((s) => steps.has(s)) && [...steps].every((s) => s >= 0 && s <= 4), name);
    assert.ok(events.every((e) => e.type !== "blueProgress" && e.type !== "error"), name);
  }
  const data = liveOf("z02").result.data;
  assert.throws(() => drain(rebuildBlueIter({ ...data, B: 99 })), (e) => e.code === "replay_mismatch");
  assert.throws(() => drain(rebuildBlueIter(data, 1)), (e) => e.code === "no_x0");
});

test("every Z_g with g <= 10 builds and passes", () => {
  for (let g = 1; g <= 10; g++) {
    const { result } = runToEnd({ shape: shapeZ(g), seed: seedZ(g), colour: 0 });
    assert.equal(result.pass, true, `Z_${g}`);
    assert.equal(result.genus, g);
    assert.equal(result.x0.toString(), REFS[`z${String(g).padStart(2, "0")}`].x0, `Z_${g}`);
  }
});
