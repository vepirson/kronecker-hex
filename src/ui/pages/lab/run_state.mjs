// The run of the Construction Lab as one state with named transitions. No DOM, no worker, no timer: the page starts
// the runs (construct_runner.mjs), keeps the effects and renders from this state.
//
// The state (read only for the page): { entry (the kind shown, an entry of kinds.mjs), status ("idle", "running",
// "done", "error", "cancelled"), mode ("replay" or "live", the first word of the chip), events, view (entry.buildView
// of the events), result, failure (null, or the failure shown in the error box: a run that could not end, a link that
// could not be opened), timing { t0, ms, label }, job (the runner's handle of the run, only while it runs), search (the
// record of the tries of the result shown, search.mjs: a live run's own, a replay's once it is known, else null) }.
// The transitions are the only writers of the state and of its copy in the store (lab.status, lab.mode, lab.events,
// lab.result, and lab.step, lab.sub when a run starts at the first position):
//   begin(input, mode, label, { keepPos, t0, start })  a new run (the kind of input; a new kind or keepPos false
//       starts at the first position; t0 the start of the time shown, default now; start() starts the run and
//       returns its handle { cancel() }, its callbacks may end the run before it returns). Returns { changed } (true
//       when the kind changed).
//   events(batch)            events of the running construction,
//   finish(result, check)    the construction ended (check(result) may refuse it with a failure, shown as by
//       failBeforeRun),
//   fail(failure)            the run ended with a failure (thrown, no worker, the worker stopped),
//   cancel()                 the visitor stopped the run,
//   failBeforeRun(failure, label)  an input that failed before any run (a token that could not be read),
//   setResult(result)        another result shown for the same events (the tamper tool and its restore),
//   learnSearch(key, record) the tries of the result of searchKey key became known (the stored file, a live run in
//       the background): shown when that is the result of the run. Returns true when it is.
// Invariants: a job exists only while the status is running, the view is entry.buildView(events) after every change
// of the events, a failure implies the status error, the store's status is the state's ("cancelled" is stored as
// "idle"), every end of a run sets timing.ms, search is null for a kind without tries (entry.hasTries false) and
// before the end of a run. A live run that ends with a result keeps its tries for the visit (rememberSearch), and a
// replay of the same result ends with them.

import { SIGN, kindEntry } from "./kinds.mjs";
import { finishedError } from "../../construct_runner.mjs";
import { isReplay, searchKey, searchRecord, rememberSearch, recalledSearch } from "./search.mjs";

// storedStatus(status) is the status kept in the store for a status of the run.
export function storedStatus(status) {
  return status === "cancelled" ? "idle" : status;
}

// createRunState({ store, now, entryOf, entry }) returns { state, begin, events, finish, fail, cancel,
// failBeforeRun, setResult }. now() gives the time in milliseconds (default performance.now), entryOf(input) the
// entry of an input (default kindEntry), entry the kind shown before the first run (default the sign kind).
export function createRunState({ store, now = () => performance.now(), entryOf = kindEntry, entry = SIGN } = {}) {
  const s = { entry, status: "idle", mode: "replay", events: [], view: entry.buildView([]), result: null, failure: null, timing: { t0: now(), ms: null, label: "" }, job: null, search: null };
  let generation = 0;
  const write = (patch) => store.set({ lab: patch });
  const stopJob = () => {
    const job = s.job;
    s.job = null;
    return job ? job.cancel() || [] : [];
  };
  const setEvents = (list) => {
    s.events = list;
    s.view = s.entry.buildView(list);
  };
  const addEvents = (batch) => {
    for (const e of batch) s.events.push(e);
    s.view = s.entry.buildView(s.events);
  };
  const ended = () => {
    s.timing = { ...s.timing, ms: now() - s.timing.t0 };
  };
  // the failure of an input or of a refused result: no events, the first position
  const showFailure = (failure, label, ms) => {
    stopJob();
    generation++;
    s.failure = { code: failure && failure.code ? failure.code : "unknown", message: failure && failure.message };
    setEvents([]);
    s.result = null;
    s.status = "error";
    s.timing = { t0: s.timing.t0, ms, label };
    write({ status: "error", events: s.events, result: null, step: 0, sub: 0 });
  };

  return {
    get state() {
      return s;
    },
    begin(input, mode, label, { keepPos = false, t0, start } = {}) {
      stopJob();
      const next = entryOf(input);
      const changed = next !== s.entry;
      s.entry = next;
      const my = ++generation;
      setEvents([]);
      s.result = null;
      s.search = null;
      s.failure = null;
      s.status = "running";
      s.mode = mode === "replay" ? "replay" : "live";
      s.timing = { t0: t0 === undefined ? now() : t0, ms: null, label };
      const patch = { mode, status: "running", events: s.events, result: null };
      if (!keepPos || changed) Object.assign(patch, { step: 0, sub: 0 });
      write(patch);
      if (start) {
        const job = start();
        if (my === generation && s.status === "running") s.job = job || null;
      }
      return { changed };
    },
    events(batch) {
      if (s.status !== "running" || !batch || !batch.length) return;
      addEvents(batch);
      write({ events: s.events });
    },
    finish(result, check = null) {
      if (s.status !== "running") return;
      s.job = null;
      const refused = result && check ? check(result) : null;
      if (refused) {
        showFailure(refused, s.timing.label, now() - s.timing.t0);
        return;
      }
      const err = finishedError(s.view, result);
      s.result = result || null;
      s.status = err ? "error" : "done";
      s.failure = err && err !== s.view.error ? err : null;
      if (s.result && s.entry.hasTries) {
        const key = searchKey(s.result);
        if (isReplay(s.view)) s.search = recalledSearch(key);
        else if (!err) {
          s.search = searchRecord(s.view);
          rememberSearch(key, s.search);
        }
      }
      ended();
      write({ status: s.status, events: s.events, result: s.result });
    },
    fail(failure) {
      if (s.status !== "running") return;
      stopJob();
      s.failure = failure || { code: "internal" };
      s.status = "error";
      ended();
      write({ status: "error", events: s.events });
    },
    cancel() {
      if (s.status !== "running") return;
      const rest = stopJob();
      if (rest.length) addEvents(rest);
      s.status = "cancelled";
      ended();
      write({ status: storedStatus(s.status), events: s.events });
    },
    failBeforeRun(failure, label) {
      showFailure(failure, label, null);
    },
    setResult(result) {
      s.result = result || null;
      write({ result: s.result });
    },
    learnSearch(key, record) {
      if (!record) return false;
      rememberSearch(key, record);
      if (!s.entry.hasTries || s.status !== "done" || !s.result || s.result.tampered || searchKey(s.result) !== key) return false;
      s.search = record;
      return true;
    },
  };
}
