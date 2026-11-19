// Module worker of the constructions (green, red and blue) and of the opening of a long link. Big integers cross as
// bigint. One job per worker at a time: to cancel, the page terminates the worker and starts a new one.
//   { cmd: "start", id, input }: the page receives the events in batches { id, events } and then { id, finished:
//     true, result } (result null after an error event).
//   { cmd: "open", id, token }: openToken in the worker. The page receives { id, progress: { step } } (the step of
//     the rebuild reached, at most OPEN_PROGRESS_MS apart) and then { id, finished: true, opened } (the value of
//     openToken) or { id, finished: true, error: { code, message } }.

import { runBatched } from "../construct/index.mjs";
import { openTokenIter } from "../formats/token.mjs";

// The progress of an opening is posted at most once per this many milliseconds (and at every new step).
export const OPEN_PROGRESS_MS = 100;

// openWithProgress(token, post, id) runs openTokenIter, posts its progress and its end (see above).
export function openWithProgress(token, post, id) {
  const it = openTokenIter(token);
  let step = -1;
  let last = -Infinity;
  try {
    for (;;) {
      const r = it.next();
      if (r.done) {
        post({ id, finished: true, opened: r.value });
        return;
      }
      const t = performance.now();
      if (r.value.step !== step || t - last >= OPEN_PROGRESS_MS) {
        step = r.value.step;
        last = t;
        post({ id, progress: { step } });
      }
    }
  } catch (e) {
    post({ id, finished: true, error: { code: e && e.code ? e.code : "internal", message: e && e.message ? String(e.message) : String(e) } });
  }
}

const inWorker = typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope;
if (inWorker) {
  self.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg) return;
    const id = msg.id === undefined ? null : msg.id;
    const post = (m) => self.postMessage(m);
    if (msg.cmd === "start") runBatched(msg.input, post, { id });
    else if (msg.cmd === "open") openWithProgress(msg.token, post, id);
  };
}
