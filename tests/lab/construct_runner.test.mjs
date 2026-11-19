// The one runner of the constructions (src/ui/construct_runner.mjs), used by the Construction Lab and by the shape
// editor's Build: over the six ways a run goes (main thread ok, main thread throws, worker ok, worker with an error
// event, worker onerror, Worker constructor throws) the runner gives the same callbacks and failure objects to both
// callers, the Lab's run state (src/ui/pages/lab/run_state.mjs) ends in the same status, store copy and time for the
// three failures, and Build reports the Lab's error texts of the same failures. A fake Worker class runs the worker's
// protocol in this process (runBatched, its batches posted one task apart).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { runConstruction, runnerStats, finishedError, thrownFailure, NO_WORKER, CONSTRUCT_WORKER_URL } from "../../src/ui/construct_runner.mjs";
import { createRunState } from "../../src/ui/pages/lab/run_state.mjs";
import { kindEntry } from "../../src/ui/pages/lab/kinds.mjs";
import { startBuild } from "../../src/ui/editor/build.mjs";
import { runBatched, runToEnd } from "../../src/construct/index.mjs";
import { createStore, defaultState } from "../../src/ui/store.mjs";
import { shapeS, seedS, shapeZ, seedZ } from "../../src/core/shapes.mjs";

// the fake Worker: mode "ok" runs the construction, "onerror" posts the first batch and then fails, "throw" cannot
// be created
class FakeWorker {
  static mode = "ok";
  static made = [];
  constructor(url, opts) {
    if (FakeWorker.mode === "throw") throw new Error("workers are not available");
    this.url = String(url);
    this.opts = opts;
    this.terminated = false;
    this.posted = [];
    FakeWorker.made.push(this);
  }
  postMessage(msg) {
    this.posted.push(msg);
    const out = [];
    runBatched(msg.input, (m) => out.push(m), { id: msg.id, maxEvents: 5 });
    const fail = FakeWorker.mode === "onerror";
    const send = (k) => {
      if (this.terminated) return;
      if (fail && k === 1) return void this.onerror({ preventDefault() {} });
      if (k < out.length) {
        this.onmessage({ data: out[k] });
        setTimeout(() => send(k + 1), 0);
      }
    };
    setTimeout(() => send(0), 0);
  }
  terminate() {
    this.terminated = true;
  }
}

const BLUE_OK = { shape: shapeZ(1), seed: seedZ(1), colour: 0, id: null };
const BLUE_BAD = { shape: shapeS(2), seed: [1, 0], colour: 0, id: null };
const SIGN_OK = { shape: shapeS(1), seed: seedS(1), colour: 1, lift: 1, id: null };
// a blue input whose seed cannot be read: the construction throws a coded error on the main thread
const thrower = () => ({
  shape: shapeZ(1),
  colour: 0,
  id: null,
  get seed() {
    throw Object.assign(new Error("the seed cannot be read"), { code: "bad_seed" });
  },
});

// run(input, opts) runs the runner to its end: { calls (the callback names in order), events, result, failure, handle }
const run = (input, opts = {}) =>
  new Promise((resolve) => {
    const calls = [];
    const events = [];
    let handle = null;
    const done = (out) => setTimeout(() => resolve({ calls, events, handle, ...out }), 0);
    handle = runConstruction(input, {
      ...opts,
      onEvents: (b) => {
        calls.push("events");
        events.push(...b);
      },
      onDone: (result) => {
        calls.push("done");
        done({ result });
      },
      onError: (failure) => {
        calls.push("error");
        done({ failure });
      },
    });
  });

// lab(input, opts) runs the Lab's run state on the runner to its end: the state and the store's lab part
const lab = (input, opts = {}) =>
  new Promise((resolve) => {
    const store = createStore(defaultState());
    const r = createRunState({ store });
    const end = () => setTimeout(() => resolve({ s: r.state, stored: store.get().lab }), 0);
    r.begin(input, "live", "a run", {
      start: () =>
        runConstruction(input, {
          ...opts,
          onEvents: (b) => r.events(b),
          onDone: (res) => {
            r.finish(res);
            end();
          },
          onError: (f) => {
            r.fail(f);
            end();
          },
        }),
    });
  });

// build(input) runs the editor's Build to its end: { done: result } or { error: info }
const build = (input) =>
  new Promise((resolve) => {
    startBuild(input, { onDone: (result) => resolve({ done: result }), onError: (info) => resolve({ error: info }) });
  });

const withWorker = async (mode, fn) => {
  const saved = globalThis.Worker;
  globalThis.Worker = FakeWorker;
  FakeWorker.mode = mode;
  FakeWorker.made = [];
  try {
    return await fn();
  } finally {
    globalThis.Worker = saved;
  }
};

test("the runner on the main thread: events once before onDone, a thrown error as { code, message }", async () => {
  const ok = await run(BLUE_OK);
  assert.equal(ok.handle.runOn, "main");
  assert.deepEqual(ok.calls, ["events", "done"]);
  const ref = runToEnd(BLUE_OK);
  assert.equal(ok.events.length, ref.events.length);
  assert.equal(ok.result.token, ref.result.token);
  const bad = await run(thrower());
  assert.deepEqual(bad.calls, ["error"]);
  assert.deepEqual(bad.failure, { code: "bad_seed", message: "the seed cannot be read" });
  assert.deepEqual(thrownFailure(null), { code: "internal", message: null });
  // an error event is a finished run without a result
  const ev = await run(BLUE_BAD);
  assert.deepEqual(ev.calls, ["events", "done"]);
  assert.equal(ev.result, null);
  assert.equal(finishedError(kindEntry(BLUE_BAD).buildView(ev.events), ev.result).code, "inadmissible");
  assert.deepEqual(finishedError({ error: null }, null).code, "internal");
  assert.equal(finishedError({ error: null }, { pass: true }), null);
});

test("the runner in a worker: one address, the start message, batches, the three ends, terminate and counters", async () => {
  await withWorker("ok", async () => {
    const before = runnerStats();
    const ok = await run(SIGN_OK, { batchMs: 0 });
    assert.equal(ok.handle.runOn, "worker");
    assert.equal(FakeWorker.made.length, 1);
    const w = FakeWorker.made[0];
    assert.equal(w.url, CONSTRUCT_WORKER_URL.href);
    assert.deepEqual(w.opts, { type: "module" });
    assert.equal(w.posted[0].cmd, "start");
    assert.equal(w.posted[0].input, SIGN_OK);
    assert.equal(ok.calls.at(-1), "done");
    assert.ok(ok.calls.filter((c) => c === "events").length >= 2, "several batches");
    assert.equal(ok.result.pass, true);
    assert.equal(w.terminated, true);
    const after = runnerStats();
    assert.equal(after.workersStarted - before.workersStarted, 1);
    assert.equal(after.workersTerminated - before.workersTerminated, 1);
    // a replay asks for its progress events
    await run({ replay: { ...BLUE_OK } }, { runOn: "worker", progress: true }).catch(() => null);
    assert.equal(FakeWorker.made[1].posted[0].input.progress, true);
  });
  await withWorker("onerror", async () => {
    const st = await run(SIGN_OK);
    assert.deepEqual(st.calls, ["events", "error"]);
    const entry = kindEntry(SIGN_OK);
    assert.deepEqual(st.failure, entry.stopped(entry.buildView(st.events)));
    assert.equal(st.failure.code, "stopped");
  });
  await withWorker("throw", async () => {
    const st = await run(SIGN_OK);
    assert.deepEqual(st.calls, ["error"]);
    assert.deepEqual(st.failure, NO_WORKER);
    assert.equal(st.handle.runOn, "worker");
  });
});

test("cancel: no callback follows, the events not yet handed over are returned", async () => {
  await withWorker("ok", async () => {
    const calls = [];
    const h = runConstruction(SIGN_OK, { batchMs: 10000, onEvents: () => calls.push("events"), onDone: () => calls.push("done"), onError: () => calls.push("error") });
    await new Promise((r) => setTimeout(r, 20));
    // the first batch is handed over at once, the next ones wait for the next hand-over
    assert.deepEqual(calls, ["events"]);
    const rest = h.cancel();
    assert.ok(Array.isArray(rest) && rest.length > 0, "the events that wait are returned");
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(calls, ["events"]);
    assert.equal(FakeWorker.made[0].terminated, true);
  });
  // defer: nothing before the call returns, cancel before the timeout ends it silently
  const calls = [];
  const h = runConstruction(BLUE_OK, { defer: true, onDone: () => calls.push("done"), onError: () => calls.push("error") });
  assert.deepEqual(calls, []);
  h.cancel();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(calls, []);
});

test("the Lab and Build give the same outcome for each of the six ways a run goes", async () => {
  const cases = [
    ["main ok", null, BLUE_OK, "done"],
    ["main throws", null, thrower(), "bad_seed"],
    ["worker ok", "ok", SIGN_OK, "done"],
    ["worker error event", "ok", BLUE_BAD, "inadmissible"],
    ["worker onerror", "onerror", SIGN_OK, "stopped"],
    ["Worker constructor throws", "throw", SIGN_OK, "stopped"],
  ];
  for (const [name, mode, input, want] of cases) {
    const go = async () => {
      // the Lab runs the blue shape with the error event in the worker (Build runs it where runPlace says, the main
      // thread): the outcome is the same
      const L = await lab(input, name === "worker error event" ? { runOn: "worker" } : {});
      const B = await build(input);
      return { L, B };
    };
    const { L, B } = mode ? await withWorker(mode, go) : await go();
    const entry = kindEntry(input);
    const { s, stored } = L;
    assert.equal(s.job, null, name);
    assert.equal(stored.status, s.status, name);
    assert.notEqual(s.timing.ms, null, `${name}: the end of the run sets the time`);
    if (want === "done") {
      assert.equal(s.status, "done", name);
      assert.equal(B.done.token, s.result.token, `${name}: the same result token`);
      continue;
    }
    assert.equal(s.status, "error", name);
    const shown = s.failure || s.view.error;
    assert.equal(shown.code, want, name);
    assert.deepEqual(B.error, entry.errorInfo(shown), `${name}: Build shows the Lab's error texts of the same failure`);
  }
});
