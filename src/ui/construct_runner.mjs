// The one runner of the construct worker: the constructions of the pages that build (the Algorithm page and the shape
// editor's Build, runConstruction) and the opening of a long link in the Explorer (openTokenInWorker).
// It runs a construction input of either kind where it is told (runPlace of the construction modules by default):
// runToEnd on the main thread, or the construct worker with { cmd: "start", id, input }. It collects the events,
// hands them over in batches, and ends every run that is not cancelled with exactly one callback: onDone(result) when
// the construction finished (result null after an error event, see finishedError), or onError(failure) when it did
// not. The three ways a run can fail give the failure objects of the Lab's kinds:
//   a thrown error on the main thread   { code (the error's code, "internal" without one), message },
//   a worker that cannot start          { code: "stopped", j: null },
//   a worker that stops (error event)   stopped(view) of the kind's entry, from the view of the events received.

import { runToEnd, runPlace } from "../construct/index.mjs";
import { kindEntry } from "./pages/lab/kinds.mjs";

// The address of the construct worker (src/workers/construct.worker.mjs).
export const CONSTRUCT_WORKER_URL = new URL("../workers/construct.worker.mjs", import.meta.url);

// The failure of a worker that cannot be created.
export const NO_WORKER = Object.freeze({ code: "stopped", j: null });

const counts = { workersStarted: 0, workersTerminated: 0 };
let lastId = 0;

// runnerStats() is a copy of the counters { workersStarted, workersTerminated } of every run of this module.
export function runnerStats() {
  return { ...counts };
}

// thrownFailure(e) is the failure object of an error thrown by a construction on the main thread.
export function thrownFailure(e) {
  return { code: e && e.code ? e.code : "internal", message: e && e.message };
}

// finishedError(view, result) is the error of a finished construction for its view (buildView of its events) and
// its result: the error event of the view, { code: "internal", ... } when there is no result, null when it passed.
export function finishedError(view, result) {
  if (view && view.error) return view.error;
  return result ? null : { code: "internal", message: "the construction ended without a result" };
}

// runConstruction(input, opts) starts the construction of input and returns { runOn ("main" or "worker"), cancel() }.
// opts:
//   onEvents(batch)  the events received since the last call (a run on the main thread hands all its events at once,
//                    before onDone), never after the end,
//   onDone(result), onError(failure)  the end of the run (see above),
//   runOn            where the run goes (default runPlace(input)),
//   progress         true: a run in the worker asks for its progress events (a replay, { ...input, progress: true }),
//   batchMs          the events of the worker are handed over at most once per this many milliseconds (0: as soon
//                    as the messages of one task are in), the last batch always before the end,
//   defer            true: a run on the main thread and a worker that cannot start end after a timeout of 0, so that
//                    no callback comes before runConstruction returns (false: they end inside the call).
// cancel() stops the run: no callback follows, and it returns the events received but not yet handed over.
export function runConstruction(input, { onEvents = () => {}, onDone, onError, runOn = runPlace(input), progress = false, batchMs = 0, defer = false } = {}) {
  let over = false;
  let worker = null;
  let timer = 0;
  let flushTimer = 0;
  let lastFlush = -Infinity;
  let pending = [];
  const events = [];

  const later = (fn) => {
    if (!defer) return void fn();
    timer = setTimeout(() => {
      timer = 0;
      if (!over) fn();
    }, 0);
  };
  const stop = () => {
    over = true;
    if (worker) {
      worker.terminate();
      counts.workersTerminated++;
      worker = null;
    }
    if (timer) clearTimeout(timer);
    if (flushTimer) clearTimeout(flushTimer);
    timer = 0;
    flushTimer = 0;
  };
  const flush = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = 0;
    if (!pending.length) return;
    lastFlush = performance.now();
    const batch = pending;
    pending = [];
    onEvents(batch);
  };
  const end = (fn, value) => {
    if (over) return;
    flush();
    stop();
    fn(value);
  };
  const handle = {
    runOn,
    cancel() {
      const rest = pending;
      pending = [];
      stop();
      return rest;
    },
  };

  if (runOn === "main") {
    later(() => {
      let out;
      try {
        out = runToEnd(input);
      } catch (e) {
        if (!(e && e.code)) console.error(e);
        end(onError, thrownFailure(e));
        return;
      }
      pending = out.events;
      end(onDone, out.result);
    });
    return handle;
  }

  try {
    worker = new globalThis.Worker(CONSTRUCT_WORKER_URL, { type: "module" });
  } catch {
    worker = null;
    later(() => end(onError, { ...NO_WORKER }));
    return handle;
  }
  counts.workersStarted++;
  const stopped = (ev) => {
    if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    if (over) return;
    const entry = kindEntry(input);
    end(onError, entry.stopped(entry.buildView(events)));
  };
  worker.onerror = stopped;
  worker.onmessageerror = stopped;
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (over || !m) return;
    if (Array.isArray(m.events)) {
      for (const e of m.events) {
        events.push(e);
        pending.push(e);
      }
      if (!m.finished && !flushTimer) flushTimer = setTimeout(flush, Math.max(0, batchMs - (performance.now() - lastFlush)));
    }
    if (m.finished) end(onDone, m.result);
  };
  worker.postMessage({ cmd: "start", id: ++lastId, input: progress ? { ...input, progress: true } : input });
  return handle;
}

// The failures of an opening whose worker cannot start or stops.
export const OPEN_NO_WORKER = Object.freeze({ code: "stopped", message: "the background computation could not start" });
export const OPEN_STOPPED = Object.freeze({ code: "stopped", message: "the background computation stopped" });

// openTokenInWorker(token, { onStep, onDone, onError }) opens a token in the construct worker ({ cmd: "open" }: openToken
// there, for a long link of the Explorer). onStep(step) for every progress message, then exactly one of onDone(opened)
// (the value of openToken) and onError(failure): the worker's { code, message }, OPEN_NO_WORKER or OPEN_STOPPED. No
// callback comes before the call returns. Returns { cancel() } (no callback after it).
export function openTokenInWorker(token, { onStep = () => {}, onDone, onError }) {
  let over = false;
  let worker = null;
  const stop = () => {
    over = true;
    if (worker) {
      worker.terminate();
      counts.workersTerminated++;
      worker = null;
    }
  };
  const end = (fn, value) => {
    if (over) return;
    stop();
    fn(value);
  };
  try {
    worker = new globalThis.Worker(CONSTRUCT_WORKER_URL, { type: "module" });
  } catch {
    worker = null;
    queueMicrotask(() => end(onError, { ...OPEN_NO_WORKER }));
    return { cancel: stop };
  }
  counts.workersStarted++;
  const id = ++lastId;
  const stopped = (ev) => {
    if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    end(onError, { ...OPEN_STOPPED });
  };
  worker.onerror = stopped;
  worker.onmessageerror = stopped;
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (over || !m || m.id !== id) return;
    if (m.progress) onStep(m.progress.step);
    else if (m.finished && m.error) end(onError, m.error);
    else if (m.finished) end(onDone, m.opened);
  };
  worker.postMessage({ cmd: "open", id, token });
  return { cancel: stop };
}
