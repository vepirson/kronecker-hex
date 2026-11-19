// The run of the Construction Lab as one state (src/ui/pages/lab/run_state.mjs): every transition, and after every
// transition the invariants (a job only while running, the view is buildView of the events, a failure only with the
// status error, the store's status is the state's with "cancelled" stored as "idle", every end of a run sets the
// time), on the events of real constructions of both kinds.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createRunState, storedStatus } from "../../src/ui/pages/lab/run_state.mjs";
import { SIGN, BLUE } from "../../src/ui/pages/lab/kinds.mjs";
import { runToEnd } from "../../src/construct/index.mjs";
import { createStore, defaultState } from "../../src/ui/store.mjs";
import { shapeS, seedS, shapeZ, seedZ } from "../../src/core/shapes.mjs";

const BLUE_IN = { shape: shapeZ(1), seed: seedZ(1), colour: 0, id: null };
const BLUE_BAD = { shape: shapeS(2), seed: [1, 0], colour: 0, id: null };
const SIGN_IN = { shape: shapeS(1), seed: seedS(1), colour: 1, lift: 1, id: null };
const blueRun = runToEnd(BLUE_IN);
const signRun = runToEnd(SIGN_IN);
const badRun = runToEnd(BLUE_BAD);

// a fake clock and a fake job (the handle of a run): cancel() returns the events it still held
function setup() {
  let t = 1000;
  const store = createStore(defaultState());
  const r = createRunState({ store, now: () => t });
  const tick = (ms) => (t += ms);
  return { store, r, tick };
}
const job = (rest = []) => ({ cancelled: 0, cancel() { this.cancelled++; return rest; } });

// check(r, store, what) asserts the invariants of the state
function check({ r, store }, what) {
  const s = r.state;
  if (s.job !== null) assert.equal(s.status, "running", `${what}: a job only while running`);
  assert.deepEqual(s.view, s.entry.buildView(s.events), `${what}: the view is buildView of the events`);
  if (s.failure !== null) assert.equal(s.status, "error", `${what}: a failure implies the status error`);
  const lab = store.get().lab;
  assert.equal(lab.status, storedStatus(s.status), `${what}: the store's status`);
  assert.equal(lab.events, s.events, `${what}: the store's events`);
  assert.equal(lab.result, s.result, `${what}: the store's result`);
  if (["done", "error", "cancelled"].includes(s.status) && s.timing.label !== "failed before") assert.notEqual(s.timing.ms, null, `${what}: the end sets the time`);
}

test("the first state: idle, the sign kind, no events", () => {
  const x = setup();
  const s = x.r.state;
  assert.deepEqual([s.status, s.entry, s.events.length, s.result, s.failure, s.job, s.timing.ms], ["idle", SIGN, 0, null, null, null, null]);
  assert.equal(storedStatus("cancelled"), "idle");
  assert.equal(storedStatus("done"), "done");
});

test("begin, events, finish: a run of each kind to done, the kind change and the position", () => {
  const x = setup();
  x.store.set({ lab: { step: 3, sub: 2 } });
  const j = job();
  const { changed } = x.r.begin(BLUE_IN, "live", "a blue run", { start: () => j });
  check(x, "begin");
  assert.equal(changed, true);
  assert.deepEqual([x.r.state.status, x.r.state.mode, x.r.state.entry, x.r.state.job, x.r.state.timing.label], ["running", "live", BLUE, j, "a blue run"]);
  assert.deepEqual([x.store.get().lab.step, x.store.get().lab.sub, x.store.get().lab.mode], [0, 0, "live"]);
  const half = Math.floor(blueRun.events.length / 2);
  x.r.events(blueRun.events.slice(0, half));
  check(x, "events 1");
  x.r.events(blueRun.events.slice(half));
  check(x, "events 2");
  assert.equal(x.r.state.events.length, blueRun.events.length);
  x.tick(42);
  x.r.finish(blueRun.result);
  check(x, "finish");
  assert.deepEqual([x.r.state.status, x.r.state.job, x.r.state.timing.ms, x.r.state.result.token], ["done", null, 42, blueRun.result.token]);
  assert.equal(j.cancelled, 0, "a run that ended is not cancelled");
  // keepPos keeps the position for the same kind, a change of kind starts at 0
  x.store.set({ lab: { step: 2, sub: 1 } });
  assert.equal(x.r.begin(BLUE_IN, "replay", "again", { keepPos: true }).changed, false);
  assert.deepEqual([x.store.get().lab.step, x.store.get().lab.sub, x.r.state.mode], [2, 1, "replay"]);
  assert.equal(x.r.begin(SIGN_IN, "live", "sign", { keepPos: true }).changed, true);
  assert.deepEqual([x.store.get().lab.step, x.store.get().lab.sub], [0, 0]);
  x.r.events(signRun.events);
  x.r.finish(signRun.result);
  check(x, "sign finish");
  assert.equal(x.r.state.status, "done");
  // a given t0 is the start of the time shown
  x.r.begin(SIGN_IN, "replay", "stored", { t0: 900 });
  x.r.events(signRun.events);
  x.r.finish(signRun.result);
  assert.equal(x.r.state.timing.ms, 1042 - 900);
});

test("a run that ends inside start (the main thread) keeps no job", () => {
  const x = setup();
  const j = job();
  x.r.begin(BLUE_IN, "live", "sync", {
    start: () => {
      x.r.events(blueRun.events);
      x.r.finish(blueRun.result);
      return j;
    },
  });
  check(x, "sync end");
  assert.deepEqual([x.r.state.status, x.r.state.job], ["done", null]);
});

test("finish with an error event or without a result, and a result refused by the check", () => {
  const x = setup();
  x.r.begin(BLUE_BAD, "live", "bad");
  x.r.events(badRun.events);
  x.r.finish(badRun.result);
  check(x, "error event");
  assert.deepEqual([x.r.state.status, x.r.state.failure, x.r.state.view.error.code], ["error", null, "inadmissible"]);
  x.r.begin(BLUE_IN, "live", "no result");
  x.r.events(blueRun.events.slice(0, 3));
  x.r.finish(null);
  check(x, "no result");
  assert.equal(x.r.state.failure.code, "internal");
  x.store.set({ lab: { step: 4, sub: 1 } });
  x.r.begin(BLUE_IN, "replay", "replay of the link", { keepPos: true });
  x.r.events(blueRun.events);
  x.tick(5);
  x.r.finish(blueRun.result, () => ({ code: "tag_mismatch", message: "damaged token" }));
  check(x, "refused");
  const s = x.r.state;
  assert.deepEqual([s.status, s.failure, s.events.length, s.result, s.timing.label, s.timing.ms], ["error", { code: "tag_mismatch", message: "damaged token" }, 0, null, "replay of the link", 5]);
  assert.deepEqual([x.store.get().lab.step, x.store.get().lab.sub], [0, 0]);
});

test("fail: the three failures of a run end in the same status, store copy and time", () => {
  const failures = [
    { code: "bad_seed", message: "thrown" },
    { code: "stopped", j: null },
    SIGN.stopped(SIGN.buildView(signRun.events.slice(0, 10))),
  ];
  const ends = failures.map((f) => {
    const x = setup();
    const j = job();
    x.r.begin(SIGN_IN, "live", "a run", { start: () => j });
    x.r.events(signRun.events.slice(0, 10));
    x.tick(7);
    x.r.fail(f);
    check(x, f.code);
    assert.equal(x.r.state.failure, f);
    assert.equal(j.cancelled, 1, "the job is stopped");
    return [x.r.state.status, x.store.get().lab.status, x.r.state.timing.ms, x.r.state.job];
  });
  for (const e of ends) assert.deepEqual(e, ["error", "error", 7, null]);
  // a transition after the end changes nothing
  const x = setup();
  x.r.begin(SIGN_IN, "live", "a run");
  x.r.fail({ code: "stopped", j: null });
  const before = { ...x.r.state };
  x.r.events(signRun.events);
  x.r.finish(signRun.result);
  x.r.cancel();
  assert.deepEqual({ ...x.r.state }, before);
});

test("cancel keeps the events the job still held, the store says idle", () => {
  const x = setup();
  const j = job(signRun.events.slice(5, 9));
  x.r.begin(SIGN_IN, "live", "a run", { start: () => j });
  x.r.events(signRun.events.slice(0, 5));
  x.tick(3);
  x.r.cancel();
  check(x, "cancel");
  assert.deepEqual([x.r.state.status, x.store.get().lab.status, x.r.state.events.length, x.r.state.timing.ms, j.cancelled], ["cancelled", "idle", 9, 3, 1]);
  // a new run stops a running job first
  const j2 = job();
  x.r.begin(SIGN_IN, "live", "one", { start: () => j2 });
  x.r.begin(BLUE_IN, "live", "two");
  assert.equal(j2.cancelled, 1);
  check(x, "replaced");
});

test("failBeforeRun and setResult", () => {
  const x = setup();
  const j = job();
  x.r.begin(SIGN_IN, "live", "a run", { start: () => j });
  x.r.failBeforeRun({ code: "bad_token", message: "not a token" }, "failed before");
  check(x, "failBeforeRun");
  assert.deepEqual([x.r.state.status, x.r.state.failure, x.r.state.timing.ms, j.cancelled], ["error", { code: "bad_token", message: "not a token" }, null, 1]);
  x.r.failBeforeRun(null, "failed before");
  assert.equal(x.r.state.failure.code, "unknown");
  x.r.begin(BLUE_IN, "live", "run");
  x.r.events(blueRun.events);
  x.r.finish(blueRun.result);
  const tampered = { ...blueRun.result, tampered: true };
  x.r.setResult(tampered);
  check(x, "setResult");
  assert.equal(x.r.state.result, tampered);
  x.r.setResult(null);
  assert.equal(x.store.get().lab.result, null);
});
